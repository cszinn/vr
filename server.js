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

// Estado Centralizado da Cena (Sincronizado entre PC e Headset em tempo real)
const sceneState = {
  instances: {}, // instance_id -> { instance_id, asset_id, placement, scale }
  environment: { preset: 'studio' },
  lighting: { color: '#fff4e0', intensity: 2.2 },
};

// Função para transmitir atualizações para todos os clientes conectados (PC e Quest)
function broadcast(data) {
  const payload = JSON.stringify(data);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

// Conexão WebSocket
wss.on('connection', (ws) => {
  console.log('[WebSocket] Novo cliente conectado (PC ou Meta Quest)');
  // Envia o estado atual completo do mundo imediatamente para o novo dispositivo
  ws.send(JSON.stringify({ type: 'sync_world', state: sceneState }));

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      if (data.type === 'get_world') {
        ws.send(JSON.stringify({ type: 'sync_world', state: sceneState }));
      }
    } catch (e) {
      console.warn('Mensagem WS inválida:', e);
    }
  });
});

// Atualiza o estado centralizado com base nos comandos gerados
function applyCommandsToSceneState(commands) {
  if (!Array.isArray(commands)) return;

  for (const cmd of commands) {
    const op = (cmd.op || '').toLowerCase();
    const id = cmd.instance_id;

    if (op === 'spawn' && id) {
      sceneState.instances[id] = {
        instance_id: id,
        asset_id: cmd.asset_id,
        placement: cmd.placement,
        scale: cmd.scale,
      };
    } else if (op === 'modify' && id) {
      if (sceneState.instances[id]) {
        if (cmd.scale) sceneState.instances[id].scale = cmd.scale;
        if (cmd.placement) sceneState.instances[id].placement = cmd.placement;
      }
    } else if (op === 'remove' && id) {
      delete sceneState.instances[id];
    } else if (op === 'clear_scene') {
      sceneState.instances = {};
    } else if (op === 'set_environment') {
      sceneState.environment = { preset: cmd.preset || 'studio' };
    } else if (op === 'set_lighting') {
      sceneState.lighting = {
        color: cmd.color || sceneState.lighting.color,
        intensity: cmd.intensity !== undefined ? cmd.intensity : sceneState.lighting.intensity,
      };
    }
  }
}

const SYSTEM_INSTRUCTION = `Você é o orquestrador espacial de uma Sala de Realidade Virtual no Meta Quest 3.
Converta o pedido de voz do usuário em um array JSON estrito de comandos que manipuladores 3D executarão.

Operações permitidas (op):
1. 'spawn': Cria novo objeto. Campos:
   - instance_id (string única, ex: 'cavalo_1', 'cubo_2', 'fogueira_1')
   - asset_id ('animal_horse', 'env_corral', 'prop_cube', 'prop_sphere', 'prop_campfire', 'prop_tree')
   - placement: { mode: 'relative_to_user' | 'absolute', direction: 'front' | 'back' | 'left' | 'right', distance_m: number, vertical: 'ground' | 'eye_level' }
   - scale (opcional): { mode: 'multiply' | 'set', value: number }
2. 'modify': Altera objeto existente (consulte existing_objects para pegar o instance_id correto). Campos:
   - instance_id (obrigatório, id do objeto a ser alterado)
   - scale (opcional): { mode: 'multiply' | 'set', value: number }
   - placement (opcional): { mode: 'relative_to_user', direction: string, distance_m: number, vertical: string }
3. 'remove': Remove objeto existente da cena. Campos:
   - instance_id (obrigatório)
4. 'set_environment': Altera o ambiente e céu. Campos:
   - preset: 'studio' | 'sunset' | 'night' | 'cyberpunk' | 'desert'
5. 'set_lighting': Altera a iluminação. Campos:
   - color (hex opcional, ex: '#ff007f')
   - intensity (number opcional)
6. 'clear_scene': Remove todos os objetos instanciados. Não requer campos adicionais.

Regras importantes:
- Se o usuário pedir para modificar ou remover algo que já existe na lista 'existing_objects', utilize o 'instance_id' correspondente.
- Retorne APENAS um array JSON válido sem markdown ou explicações.`;

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Rota de Healthcheck
app.get('/api/v1/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'vr-room-bff',
    model: 'gemini-3.5-flash',
    connected_clients: wss.clients.size,
    timestamp: new Date().toISOString(),
  });
});

// Rota para obter o estado atual completo da cena
app.get('/api/v1/scene/state', (req, res) => {
  res.json({ status: 'ok', state: sceneState });
});


// Rota principal de comandos de cena
app.post('/api/v1/scene/command', async (req, res) => {
  try {
    const { transcript, user_position, user_rotation_y, existing_objects } = req.body;

    console.log('--- Novo comando recebido ---');
    console.log('transcript:', transcript);
    console.log('user_position:', user_position);
    console.log('user_rotation_y:', user_rotation_y);
    console.log('existing_objects:', existing_objects);

    const promptContext = {
      transcript,
      user_position: user_position || { x: 0, y: 1.7, z: 0 },
      user_rotation_y: user_rotation_y || 0,
      existing_objects: existing_objects || [],
    };

    const CANDIDATE_MODELS = [
      'gemini-3.5-flash',
      'gemini-3.7-flash',
      'gemini-3.8-flash',
      'gemini-flash-latest',
      'gemini-2.5-flash-lite',
    ];

    let lastError = null;
    let responseText = null;

    for (const modelName of CANDIDATE_MODELS) {
      try {
        console.log(`Tentando gerar comandos com modelo: ${modelName}`);
        const response = await ai.models.generateContent({
          model: modelName,
          contents: JSON.stringify(promptContext),
          config: {
            systemInstruction: SYSTEM_INSTRUCTION,
            responseMimeType: 'application/json',
          },
        });
        responseText = response.text;
        console.log(`Sucesso com modelo: ${modelName}`);
        break;
      } catch (err) {
        console.warn(`Falha no modelo ${modelName}:`, err.message);
        lastError = err;
      }
    }

    if (!responseText) {
      throw lastError || new Error('Nenhum modelo Gemini disponível no momento.');
    }

    const commands = JSON.parse(responseText);
    console.log('commands gerados:', JSON.stringify(commands, null, 2));

    // Atualiza o estado compartilhado do mundo
    applyCommandsToSceneState(commands);

    // Transmite os novos comandos e o estado atual para todos os clientes conectados (PC e Quest)
    broadcast({
      type: 'scene_commands',
      commands,
      state: sceneState,
      transcript,
    });

    res.json({ status: 'ok', commands, state: sceneState });
  } catch (err) {
    console.error('Erro ao gerar comandos:', err);
    res.status(500).json({ status: 'error', message: err.message });
  }
});

server.listen(PORT, () => {
  console.log(`VR Room BFF, WebSocket Sync & 3D WebXR Client rodando em http://localhost:${PORT}`);
});


