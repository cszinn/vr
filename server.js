require('dotenv').config();

const path = require('path');
const http = require('http');
const express = require('express');
const cors = require('cors');
const { WebSocketServer, WebSocket } = require('ws');
const { GoogleGenAI } = require('@google/genai');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const PORT = process.env.PORT || 3000;

// O SDK lê automaticamente a variável GEMINI_API_KEY do ambiente
const ai = new GoogleGenAI({});

// ---------------------------------------------------------------------------
// Modelos: ordem por latência medida (lite + thinking MINIMAL ≈ 0.8s texto / 1.6s áudio).
// Modelos que retornam 429/404/503 entram em "cooldown" para não desperdiçar tempo
// tentando-os de novo a cada comando.
// ---------------------------------------------------------------------------
const CANDIDATE_MODELS = ['gemini-3.5-flash-lite', 'gemini-flash-lite-latest', 'gemini-3.1-flash-lite'];
const modelCooldownUntil = new Map(); // model -> timestamp

function cooldownFor(status) {
  if (status === 404) return 24 * 60 * 60 * 1000; // modelo indisponível para esta chave
  if (status === 429) return 60 * 1000; // quota
  if (status === 503) return 15 * 1000; // sobrecarga temporária
  return 0;
}

// ---------------------------------------------------------------------------
// Estado centralizado do mundo (fonte da verdade compartilhada entre PC e Quest).
// Posições são ABSOLUTAS no mundo, calculadas aqui no servidor, para que todos os
// dispositivos vejam cada objeto exatamente no mesmo lugar.
// ---------------------------------------------------------------------------
const sceneState = {
  seq: 0,
  instances: {}, // instance_id -> { instance_id, asset_id, position, rotation_y, scale }
  environment: { preset: 'studio' },
  lighting: null, // null = usa a luz padrão do preset
};

const ASSET_LABELS = {
  animal_horse: 'cavalo',
  prop_campfire: 'fogueira',
  prop_tree: 'arvore',
  prop_cube: 'cubo',
  prop_sphere: 'esfera',
  env_corral: 'cercado',
};

const OP_ALIASES = { add: 'spawn', create: 'spawn', delete: 'remove', clear: 'clear_scene', update: 'modify' };
const DIR_ALIASES = {
  forward: 'front', frente: 'front', ahead: 'front',
  behind: 'back', tras: 'back', atras: 'back',
  esquerda: 'left', direita: 'right',
};

function broadcast(data) {
  const payload = JSON.stringify(data);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) client.send(payload);
  });
}

wss.on('connection', (ws) => {
  console.log(`[WS] Cliente conectado (total: ${wss.clients.size})`);
  ws.send(JSON.stringify({ type: 'sync_world', state: sceneState }));
  ws.on('close', () => console.log(`[WS] Cliente saiu (total: ${wss.clients.size})`));
});

function round2(n) {
  return Math.round(n * 100) / 100;
}

function uniqueId(base) {
  if (!sceneState.instances[base]) return base;
  const prefix = base.replace(/_\d+$/, '');
  let i = 1;
  while (sceneState.instances[`${prefix}_${i}`]) i++;
  return `${prefix}_${i}`;
}

// Converte um placement relativo ao usuário em posição absoluta no mundo
function resolvePosition(placement, user) {
  const p = placement || {};
  const rawDist = Number(p.distance_m);
  const distance = Number.isFinite(rawDist) && rawDist >= 0 ? rawDist : 2.5;
  const dirKey = String(p.direction || 'front').toLowerCase();
  const direction = DIR_ALIASES[dirKey] || dirKey;
  const vertical = String(p.vertical || 'ground').toLowerCase();

  const yaw = (Number(user.yaw_deg) || 0) * (Math.PI / 180);
  const fwd = { x: -Math.sin(yaw), z: -Math.cos(yaw) };
  const right = { x: Math.cos(yaw), z: -Math.sin(yaw) };

  let dx = fwd.x, dz = fwd.z;
  if (direction === 'back') { dx = -fwd.x; dz = -fwd.z; }
  else if (direction === 'left') { dx = -right.x; dz = -right.z; }
  else if (direction === 'right') { dx = right.x; dz = right.z; }

  const pos = {
    x: round2(user.position.x + dx * distance),
    y: vertical === 'eye_level' ? round2(user.position.y) : 0,
    z: round2(user.position.z + dz * distance),
  };
  // Rotação para o objeto "olhar" para o usuário (eixo +Z do objeto aponta para ele)
  const rotation_y = distance > 0.01 ? round2(Math.atan2(user.position.x - pos.x, user.position.z - pos.z)) : round2(yaw + Math.PI);
  return { position: pos, rotation_y };
}

// Normaliza comandos (do Gemini ou do menu), aplica no estado e devolve a versão resolvida
function applyCommands(rawCommands, user) {
  const resolved = [];
  for (const raw of Array.isArray(rawCommands) ? rawCommands : []) {
    if (!raw || typeof raw !== 'object') continue;
    const cmd = { ...raw };
    const opKey = String(cmd.op || '').toLowerCase();
    cmd.op = OP_ALIASES[opKey] || opKey;

    if (cmd.op === 'spawn') {
      const label = ASSET_LABELS[cmd.asset_id] || (cmd.asset_id || 'objeto').replace(/^(prop|animal|env)_/, '');
      cmd.instance_id = uniqueId(cmd.instance_id || `${label}_1`);
      const { position, rotation_y } = resolvePosition(cmd.placement, user);
      let scale = 1;
      if (cmd.scale && Number(cmd.scale.value) > 0) scale = Number(cmd.scale.value);
      sceneState.instances[cmd.instance_id] = {
        instance_id: cmd.instance_id,
        asset_id: cmd.asset_id,
        position,
        rotation_y,
        scale,
      };
      Object.assign(cmd, { position, rotation_y, scale_value: scale });
    } else if (cmd.op === 'modify') {
      const inst = sceneState.instances[cmd.instance_id];
      if (!inst) continue;
      if (cmd.scale && Number(cmd.scale.value) > 0) {
        const v = Number(cmd.scale.value);
        inst.scale = round2(cmd.scale.mode === 'set' ? v : inst.scale * v);
      }
      if (cmd.placement) {
        const { position, rotation_y } = resolvePosition(cmd.placement, user);
        inst.position = position;
        inst.rotation_y = rotation_y;
      }
      Object.assign(cmd, { position: inst.position, rotation_y: inst.rotation_y, scale_value: inst.scale });
    } else if (cmd.op === 'remove') {
      if (!sceneState.instances[cmd.instance_id]) continue;
      delete sceneState.instances[cmd.instance_id];
    } else if (cmd.op === 'clear_scene') {
      sceneState.instances = {};
    } else if (cmd.op === 'set_environment') {
      const presets = ['studio', 'sunset', 'night', 'cyberpunk', 'desert'];
      let preset = String(cmd.preset || 'studio').toLowerCase();
      if (preset === 'next') {
        preset = presets[(presets.indexOf(sceneState.environment.preset) + 1) % presets.length];
      }
      if (!presets.includes(preset)) preset = 'studio';
      cmd.preset = preset;
      sceneState.environment = { preset };
      sceneState.lighting = null;
    } else if (cmd.op === 'set_lighting') {
      sceneState.lighting = {
        color: cmd.color || (sceneState.lighting && sceneState.lighting.color) || null,
        intensity: cmd.intensity !== undefined ? Number(cmd.intensity) : (sceneState.lighting && sceneState.lighting.intensity) || null,
      };
    } else {
      continue; // operação desconhecida: ignora
    }
    resolved.push(cmd);
  }
  return resolved;
}

function commitAndBroadcast(commands, extra = {}) {
  sceneState.seq += 1;
  const update = { type: 'scene_update', seq: sceneState.seq, commands, state: sceneState, ...extra };
  broadcast(update);
  return update;
}

function normalizeUser(body) {
  const p = body.user_position || {};
  return {
    position: { x: Number(p.x) || 0, y: Number(p.y) || 1.6, z: Number(p.z) || 0 },
    yaw_deg: Number(body.user_yaw_deg ?? body.user_rotation_y) || 0,
  };
}

const SYSTEM_INSTRUCTION = `Você é o orquestrador espacial de uma Sala de Realidade Virtual no Meta Quest 3.
Entrada: o pedido do usuário (texto em "transcript" ou um áudio em português) + a lista "existing_objects" com os objetos que já estão na cena.
Saída: APENAS um objeto JSON no formato {"transcript": string, "commands": [ ... ]}.
- "transcript": o que o usuário disse (se veio áudio, transcreva fielmente; se veio texto, repita o texto).
- "commands": lista de operações. Use EXATAMENTE estes nomes:

1. {"op":"spawn","instance_id":"cavalo_1","asset_id":<asset>,"placement":{"direction":"front"|"back"|"left"|"right","distance_m":number,"vertical":"ground"|"eye_level"},"scale":{"mode":"set","value":number}?}
   assets disponíveis: animal_horse, prop_campfire, prop_tree, prop_cube, prop_sphere, env_corral.
   Se o usuário pedir algo "ao meu redor"/"em volta de mim", use distance_m 0.
2. {"op":"modify","instance_id":<id existente>,"scale":{"mode":"multiply"|"set","value":number}?,"placement":{...}?}
3. {"op":"remove","instance_id":<id existente>}
4. {"op":"set_environment","preset":"studio"|"sunset"|"night"|"cyberpunk"|"desert"}
5. {"op":"set_lighting","color":"#rrggbb"?,"intensity":number?}
6. {"op":"clear_scene"}

Regras:
- Para modificar/remover, use o instance_id exato de existing_objects (ex: "o cavalo" -> o id do cavalo existente).
- Se não entender o pedido ou o áudio estiver vazio, retorne "commands": [].`;

async function interpret({ transcript, audio, user }) {
  const context = {
    user_position: user.position,
    existing_objects: Object.values(sceneState.instances).map((i) => ({ instance_id: i.instance_id, asset_id: i.asset_id })),
  };

  const contents = audio
    ? [{ role: 'user', parts: [{ inlineData: { mimeType: audio.mimeType, data: audio.data } }, { text: JSON.stringify(context) }] }]
    : JSON.stringify({ transcript, ...context });

  let lastError = null;
  const now = Date.now();
  const available = CANDIDATE_MODELS.filter((m) => (modelCooldownUntil.get(m) || 0) <= now);
  const order = available.length ? available : CANDIDATE_MODELS;

  for (const model of order) {
    const t0 = Date.now();
    try {
      const response = await ai.models.generateContent({
        model,
        contents,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          responseMimeType: 'application/json',
          thinkingConfig: { thinkingLevel: 'MINIMAL' },
          abortSignal: AbortSignal.timeout(audio ? 10000 : 6000),
        },
      });
      const parsed = JSON.parse(response.text);
      const result = Array.isArray(parsed) ? { transcript: transcript || '', commands: parsed } : parsed;
      console.log(`[Gemini] ${model} respondeu em ${Date.now() - t0} ms`);
      return {
        transcript: result.transcript || transcript || '',
        commands: Array.isArray(result.commands) ? result.commands : [],
        model,
        ms: Date.now() - t0,
      };
    } catch (err) {
      const status = err.status || (String(err.message).match(/"code":(\d+)/) || [])[1] * 1;
      const cd = cooldownFor(status);
      if (cd) modelCooldownUntil.set(model, Date.now() + cd);
      console.warn(`[Gemini] ${model} falhou em ${Date.now() - t0} ms (status ${status || err.name})`);
      lastError = err;
    }
  }
  throw lastError || new Error('Nenhum modelo Gemini disponível no momento.');
}

// Middlewares
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/v1/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'vr-room-bff',
    models: CANDIDATE_MODELS,
    connected_clients: wss.clients.size,
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/v1/scene/state', (req, res) => {
  res.json({ status: 'ok', state: sceneState });
});

// Comando em texto -> Gemini -> comandos
app.post('/api/v1/scene/command', async (req, res) => {
  const t0 = Date.now();
  try {
    const { transcript } = req.body;
    if (!transcript || !String(transcript).trim()) {
      return res.status(400).json({ status: 'error', message: 'transcript vazio' });
    }
    const user = normalizeUser(req.body);
    console.log(`--- Texto: "${transcript}"`);
    const result = await interpret({ transcript: String(transcript), user });
    const commands = applyCommands(result.commands, user);
    const update = commitAndBroadcast(commands, { transcript: result.transcript });
    console.log(`    ${commands.length} comando(s) em ${Date.now() - t0} ms`);
    res.json({ status: 'ok', ...update, ms: Date.now() - t0 });
  } catch (err) {
    console.error('Erro ao gerar comandos:', err.message);
    res.status(502).json({ status: 'error', message: err.message });
  }
});

// Comando de voz: áudio WAV -> Gemini (transcreve + interpreta em uma única chamada)
app.post('/api/v1/scene/voice', async (req, res) => {
  const t0 = Date.now();
  try {
    const { audio_base64, mime_type } = req.body;
    if (!audio_base64) return res.status(400).json({ status: 'error', message: 'áudio ausente' });
    const user = normalizeUser(req.body);
    const result = await interpret({ audio: { data: audio_base64, mimeType: mime_type || 'audio/wav' }, user });
    console.log(`--- Voz: "${result.transcript}"`);
    const commands = applyCommands(result.commands, user);
    const update = commitAndBroadcast(commands, { transcript: result.transcript });
    console.log(`    ${commands.length} comando(s) em ${Date.now() - t0} ms`);
    res.json({ status: 'ok', ...update, ms: Date.now() - t0 });
  } catch (err) {
    console.error('Erro no comando de voz:', err.message);
    res.status(502).json({ status: 'error', message: err.message });
  }
});

// Comandos diretos (menu do controle): sem IA, resposta instantânea
app.post('/api/v1/scene/apply', (req, res) => {
  const user = normalizeUser(req.body);
  const commands = applyCommands(req.body.commands, user);
  const update = commitAndBroadcast(commands, { transcript: req.body.label || '' });
  res.json({ status: 'ok', ...update });
});

server.listen(PORT, () => {
  console.log(`VR Room BFF rodando em http://localhost:${PORT}`);
});
