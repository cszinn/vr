import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';

// =============================================================================
// DOM
// =============================================================================
const $ = (id) => document.getElementById(id);
const dom = {
  canvasContainer: $('canvas-container'),
  btnMic: $('btn-mic'),
  commandForm: $('command-form'),
  commandInput: $('command-input'),
  transcriptText: $('transcript-text'),
  transcriptState: $('transcript-state'),
  pulseIndicator: $('pulse-indicator'),
  statusServer: $('status-server'),
  objectsCount: $('objects-count'),
  hudCamPos: $('hud-cam-pos'),
  hudCamYaw: $('hud-cam-yaw'),
  btnToggleInspector: $('btn-toggle-inspector'),
  btnCloseInspector: $('btn-close-inspector'),
  inspectorDrawer: $('inspector-drawer'),
  jsonViewer: $('json-viewer'),
  activeObjectsList: $('active-objects-list'),
  selectPreset: $('select-preset'),
  toast: $('toast'),
};

// =============================================================================
// Cena Three.js
// =============================================================================
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0e17);
scene.fog = new THREE.FogExp2(0x0a0e17, 0.035);

const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.05, 100);
camera.position.set(0, 1.7, 4);

// "Dolly": grupo que carrega câmera + controles. Mover/girar o dolly = locomoção em VR.
const dolly = new THREE.Group();
scene.add(dolly);
dolly.add(camera);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.xr.enabled = true;
dom.canvasContainer.appendChild(renderer.domElement);

const vrButtonSlot = $('vr-button-slot');
if (vrButtonSlot) vrButtonSlot.appendChild(VRButton.createButton(renderer));

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.target.set(0, 1.2, 0);
controls.maxPolarAngle = Math.PI / 2 + 0.05;

// Iluminação
const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xfff4e0, 2.2);
dirLight.position.set(5, 12, 7);
dirLight.castShadow = true;
dirLight.shadow.mapSize.set(2048, 2048);
dirLight.shadow.camera.near = 0.5;
dirLight.shadow.camera.far = 30;
dirLight.shadow.camera.left = -10;
dirLight.shadow.camera.right = 10;
dirLight.shadow.camera.top = 10;
dirLight.shadow.camera.bottom = -10;
dirLight.shadow.bias = -0.0005;
scene.add(dirLight);

const accentLight = new THREE.PointLight(0x00f0ff, 1.5, 15);
accentLight.position.set(0, 3, 0);
scene.add(accentLight);

// Chão
const floorMat = new THREE.MeshStandardMaterial({ color: 0x0f1522, roughness: 0.85, metalness: 0.2 });
const floorMesh = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), floorMat);
floorMesh.rotation.x = -Math.PI / 2;
floorMesh.receiveShadow = true;
scene.add(floorMesh);

const gridHelper = new THREE.GridHelper(40, 40, 0x00f0ff, 0x1f2b42);
gridHelper.position.y = 0.01;
scene.add(gridHelper);

const userCircle = new THREE.Mesh(
  new THREE.RingGeometry(0.5, 0.55, 32),
  new THREE.MeshBasicMaterial({ color: 0x00f0ff, side: THREE.DoubleSide })
);
userCircle.rotation.x = -Math.PI / 2;
userCircle.position.y = 0.02;
scene.add(userCircle);

// =============================================================================
// Animações (rodam dentro do render loop: window.requestAnimationFrame NÃO roda
// enquanto o Quest está em modo imersivo)
// =============================================================================
const tweens = new Set();
function tween(duration, onUpdate, onDone) {
  tweens.add({ t: 0, duration, onUpdate, onDone });
}
function updateTweens(dt) {
  for (const tw of tweens) {
    tw.t += dt;
    const k = Math.min(1, tw.t / tw.duration);
    tw.onUpdate(k);
    if (k >= 1) {
      tweens.delete(tw);
      if (tw.onDone) tw.onDone();
    }
  }
}
const easeOutBack = (k) => 1 + 2.2 * Math.pow(k - 1, 3) + 1.2 * Math.pow(k - 1, 2);
const easeInOut = (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);

// =============================================================================
// Fábrica procedural de assets 3D
// =============================================================================
function createAsset(assetId) {
  const group = new THREE.Group();
  const id = (assetId || '').toLowerCase();

  if (id.includes('horse') || id.includes('cavalo')) {
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x8b4513, roughness: 0.7, metalness: 0.1 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x221105, roughness: 0.8 });
    const add = (geo, mat, x, y, z, rx = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.rotation.x = rx;
      m.castShadow = true;
      group.add(m);
      return m;
    };
    add(new THREE.BoxGeometry(0.8, 0.7, 1.6), bodyMat, 0, 1.2, 0);
    add(new THREE.BoxGeometry(0.35, 0.9, 0.5), bodyMat, 0, 1.7, 0.75, -Math.PI / 6);
    add(new THREE.BoxGeometry(0.36, 0.4, 0.7), bodyMat, 0, 2.05, 1.05);
    add(new THREE.BoxGeometry(0.32, 0.32, 0.35), darkMat, 0, 1.95, 1.45);
    add(new THREE.ConeGeometry(0.08, 0.22, 4), bodyMat, 0.12, 2.35, 0.85);
    add(new THREE.ConeGeometry(0.08, 0.22, 4), bodyMat, -0.12, 2.35, 0.85);
    add(new THREE.BoxGeometry(0.1, 0.8, 0.2), darkMat, 0, 1.85, 0.55, -Math.PI / 6);
    for (const [x, z] of [[0.28, 0.6], [-0.28, 0.6], [0.28, -0.6], [-0.28, -0.6]]) {
      add(new THREE.BoxGeometry(0.18, 1.0, 0.18), bodyMat, x, 0.5, z);
      add(new THREE.BoxGeometry(0.2, 0.15, 0.22), darkMat, x, 0.08, z);
    }
    add(new THREE.BoxGeometry(0.12, 0.7, 0.14), darkMat, 0, 1.0, -0.9, Math.PI / 12);
  } else if (id.includes('cube') || id.includes('cubo')) {
    const cube = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.2, metalness: 0.8 })
    );
    cube.position.y = 0.5;
    cube.castShadow = true;
    const wire = new THREE.Mesh(
      new THREE.BoxGeometry(1.02, 1.02, 1.02),
      new THREE.MeshBasicMaterial({ color: 0x00f0ff, wireframe: true })
    );
    wire.position.y = 0.5;
    group.add(cube, wire);
  } else if (id.includes('sphere') || id.includes('esfera')) {
    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(0.6, 32, 32),
      new THREE.MeshPhysicalMaterial({ color: 0x00f0ff, roughness: 0.1, metalness: 0.1, transmission: 0.6, ior: 1.5 })
    );
    sphere.position.y = 0.6;
    sphere.castShadow = true;
    group.add(sphere);
  } else if (id.includes('campfire') || id.includes('fogueira') || id.includes('fire')) {
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x4a2e18, roughness: 0.9 });
    for (let i = 0; i < 6; i++) {
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.9, 6), woodMat);
      log.rotation.z = Math.PI / 3;
      log.rotation.y = (i * Math.PI * 2) / 6;
      log.position.y = 0.15;
      log.castShadow = true;
      group.add(log);
    }
    const flame = new THREE.Mesh(
      new THREE.ConeGeometry(0.35, 0.85, 8),
      new THREE.MeshStandardMaterial({ color: 0xff4500, emissive: 0xff6600, emissiveIntensity: 2.2 })
    );
    flame.position.y = 0.5;
    const inner = new THREE.Mesh(
      new THREE.ConeGeometry(0.18, 0.5, 8),
      new THREE.MeshStandardMaterial({ color: 0xffea00, emissive: 0xffff44, emissiveIntensity: 3.0 })
    );
    inner.position.y = 0.4;
    const light = new THREE.PointLight(0xff7700, 3.5, 8);
    light.position.y = 0.7;
    group.add(flame, inner, light);
    group.userData.flames = [flame, inner];
    group.userData.fireLight = light;
    group.userData.phase = Math.random() * 10;
  } else if (id.includes('corral') || id.includes('cercado') || id.includes('fence')) {
    const fenceMat = new THREE.MeshStandardMaterial({ color: 0x7c5332, roughness: 0.9 });
    const half = 1.75;
    for (const [px, pz] of [[-half, -half], [half, -half], [half, half], [-half, half], [0, -half], [half, 0], [0, half], [-half, 0]]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.2, 6), fenceMat);
      post.position.set(px, 0.6, pz);
      post.castShadow = true;
      group.add(post);
    }
    for (const [w, d, x, z] of [[3.5, 0.08, 0, -half], [3.5, 0.08, 0, half], [0.08, 3.5, -half, 0], [0.08, 3.5, half, 0]]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(w, 0.1, d), fenceMat);
      rail.position.set(x, 0.8, z);
      group.add(rail);
    }
  } else if (id.includes('tree') || id.includes('arvore')) {
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2, 0.35, 1.8, 6),
      new THREE.MeshStandardMaterial({ color: 0x5a3d28, roughness: 0.9 })
    );
    trunk.position.y = 0.9;
    trunk.castShadow = true;
    const leavesMat = new THREE.MeshStandardMaterial({ color: 0x2e7d32, roughness: 0.7 });
    const c1 = new THREE.Mesh(new THREE.ConeGeometry(1.2, 1.4, 7), leavesMat);
    c1.position.y = 2.1;
    c1.castShadow = true;
    const c2 = new THREE.Mesh(new THREE.ConeGeometry(0.9, 1.2, 7), leavesMat);
    c2.position.y = 2.9;
    c2.castShadow = true;
    group.add(trunk, c1, c2);
  } else {
    const shape = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.6),
      new THREE.MeshStandardMaterial({ color: 0x8b5cf6, roughness: 0.3, metalness: 0.5 })
    );
    shape.position.y = 0.7;
    shape.castShadow = true;
    group.add(shape);
  }
  return group;
}

// =============================================================================
// Presets de ambiente
// =============================================================================
const PRESETS = {
  studio: { bg: 0x0a0e17, light: 0xfff4e0, intensity: 2.2, ambient: 0xffffff, floor: 0x0f1522, grid: 0x00f0ff },
  sunset: { bg: 0x2a101b, light: 0xff7744, intensity: 2.4, ambient: 0x884433, floor: 0x24141d, grid: 0xff7744 },
  night: { bg: 0x030712, light: 0x4466aa, intensity: 0.8, ambient: 0x112233, floor: 0x080f1e, grid: 0x38bdf8 },
  cyberpunk: { bg: 0x12072b, light: 0xff007f, intensity: 2.0, ambient: 0x38006b, floor: 0x1a0933, grid: 0x00f0ff },
  desert: { bg: 0xd4a373, light: 0xfff1cf, intensity: 2.8, ambient: 0xfaedcd, floor: 0xc68b59, grid: 0x8f5934 },
};

function applyPreset(name) {
  const key = PRESETS[name] ? name : 'studio';
  const p = PRESETS[key];
  scene.background.set(p.bg);
  scene.fog.color.set(p.bg);
  dirLight.color.set(p.light);
  dirLight.intensity = p.intensity;
  ambientLight.color.set(p.ambient);
  floorMat.color.set(p.floor);
  gridHelper.material.color.set(p.grid);
  if (dom.selectPreset) dom.selectPreset.value = key;
}

function applyLighting(l) {
  if (!l) return;
  if (l.color) dirLight.color.set(l.color);
  if (l.intensity != null) dirLight.intensity = Number(l.intensity);
}

// =============================================================================
// Mundo compartilhado: o servidor é a fonte da verdade. Cada atualização tem um
// número de sequência (seq) para nunca aplicar o mesmo comando duas vezes.
// =============================================================================
const instances = new Map(); // instance_id -> { mesh, data }
let lastSeq = 0;
let inflight = 0;

function spawnInstance(data, animate) {
  const old = instances.get(data.instance_id);
  if (old) scene.remove(old.mesh);

  const mesh = createAsset(data.asset_id);
  const p = data.position || { x: 0, y: 0, z: -2 };
  mesh.position.set(p.x, p.y, p.z);
  mesh.rotation.y = data.rotation_y || 0;
  const target = Number(data.scale) || 1;
  scene.add(mesh);
  instances.set(data.instance_id, { mesh, data: { ...data, scale: target } });

  if (animate) {
    mesh.scale.setScalar(0.001);
    tween(0.45, (k) => mesh.scale.setScalar(Math.max(0.001, target * easeOutBack(k))));
  } else {
    mesh.scale.setScalar(target);
  }
}

function removeInstance(id) {
  const inst = instances.get(id);
  if (!inst) return;
  instances.delete(id);
  const s0 = inst.mesh.scale.x;
  tween(0.25, (k) => inst.mesh.scale.setScalar(Math.max(0.001, s0 * (1 - k))), () => scene.remove(inst.mesh));
}

function applyCommand(cmd) {
  switch (cmd.op) {
    case 'spawn':
      spawnInstance(
        { instance_id: cmd.instance_id, asset_id: cmd.asset_id, position: cmd.position, rotation_y: cmd.rotation_y, scale: cmd.scale_value },
        true
      );
      break;
    case 'modify': {
      const inst = instances.get(cmd.instance_id);
      if (!inst) break;
      const m = inst.mesh;
      const fromPos = m.position.clone();
      const toPos = cmd.position ? new THREE.Vector3(cmd.position.x, cmd.position.y, cmd.position.z) : fromPos.clone();
      const fromS = m.scale.x;
      const toS = Number(cmd.scale_value) || fromS;
      const fromRot = m.rotation.y;
      const toRot = cmd.rotation_y != null ? cmd.rotation_y : fromRot;
      tween(0.4, (k) => {
        const e = easeInOut(k);
        m.position.lerpVectors(fromPos, toPos, e);
        m.scale.setScalar(fromS + (toS - fromS) * e);
        m.rotation.y = fromRot + (toRot - fromRot) * e;
      });
      inst.data = { ...inst.data, position: cmd.position || inst.data.position, scale: toS };
      break;
    }
    case 'remove':
      removeInstance(cmd.instance_id);
      break;
    case 'clear_scene':
      for (const id of [...instances.keys()]) removeInstance(id);
      break;
    case 'set_environment':
      applyPreset(cmd.preset);
      break;
    case 'set_lighting':
      applyLighting(cmd);
      break;
  }
}

function syncWorld(state) {
  if (!state) return;
  lastSeq = state.seq || 0;
  const serverInstances = state.instances || {};
  for (const id of [...instances.keys()]) {
    if (!serverInstances[id]) {
      scene.remove(instances.get(id).mesh);
      instances.delete(id);
    }
  }
  for (const data of Object.values(serverInstances)) {
    const inst = instances.get(data.instance_id);
    if (!inst) {
      spawnInstance(data, true);
    } else {
      inst.mesh.position.set(data.position.x, data.position.y, data.position.z);
      inst.mesh.rotation.y = data.rotation_y || 0;
      inst.mesh.scale.setScalar(data.scale || 1);
      inst.data = data;
    }
  }
  applyPreset(state.environment && state.environment.preset);
  applyLighting(state.lighting);
  refreshObjectList();
}

// Retorna true se a atualização era nova (ainda não aplicada)
function applyUpdate(update) {
  if (!update || typeof update.seq !== 'number' || update.seq <= lastSeq) return false;
  if (update.seq !== lastSeq + 1 && update.state) {
    syncWorld(update.state); // perdemos alguma atualização: ressincroniza tudo
  } else {
    for (const cmd of update.commands || []) applyCommand(cmd);
    lastSeq = update.seq;
  }
  dom.jsonViewer.textContent = JSON.stringify(update.commands || [], null, 2);
  refreshObjectList();
  return true;
}

// =============================================================================
// Pose do usuário (posição/direção REAIS no mundo, inclusive dentro do VR)
// =============================================================================
const _pos = new THREE.Vector3();
const _dir = new THREE.Vector3();
function getUserPose() {
  camera.getWorldPosition(_pos);
  camera.getWorldDirection(_dir);
  return {
    user_position: { x: +_pos.x.toFixed(2), y: +_pos.y.toFixed(2), z: +_pos.z.toFixed(2) },
    user_yaw_deg: +((Math.atan2(-_dir.x, -_dir.z) * 180) / Math.PI).toFixed(1),
  };
}

// =============================================================================
// Rede
// =============================================================================
async function postJSON(url, body) {
  inflight++;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.status === 'error') throw new Error(data.message || `HTTP ${res.status}`);
    return data;
  } finally {
    inflight--;
  }
}

function friendlyError(err) {
  const msg = String((err && err.message) || err);
  if (msg.includes('429')) return 'Limite da API Gemini atingido, tente em instantes';
  if (msg.includes('503')) return 'IA sobrecarregada, tente de novo';
  if (msg.includes('Failed to fetch')) return 'Sem conexão com o servidor';
  return msg.slice(0, 80);
}

function reportResult(data) {
  const n = (data.commands || []).length;
  const said = data.transcript ? `“${data.transcript}”` : '';
  if (n === 0) {
    setStatus(`🤷 Não entendi ${said}`.trim(), 'error');
  } else {
    const secs = data.ms ? ` · ${(data.ms / 1000).toFixed(1)}s` : '';
    setStatus(`✅ ${said || 'Feito'}${secs}`, 'ok');
  }
}

async function sendText(text) {
  text = (text || '').trim();
  if (!text) return;
  dom.transcriptText.textContent = `“${text}”`;
  setStatus('⏳ Interpretando…', 'busy', { sticky: true });
  try {
    const data = await postJSON('/api/v1/scene/command', { transcript: text, ...getUserPose() });
    applyUpdate(data);
    reportResult(data);
  } catch (err) {
    setStatus(`⚠️ ${friendlyError(err)}`, 'error');
  }
}

// Comandos diretos (menu): não passam pela IA, então são instantâneos
async function applyDirect(commands, label) {
  try {
    const data = await postJSON('/api/v1/scene/apply', { commands, label, ...getUserPose() });
    applyUpdate(data);
  } catch (err) {
    setStatus(`⚠️ ${friendlyError(err)}`, 'error');
  }
}

// WebSocket: recebe o que qualquer dispositivo (PC ou Quest) fizer
let ws = null;
function connectWebSocket() {
  ws = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}`);
  ws.onopen = () => setServerOnline(true);
  ws.onmessage = (event) => {
    let msg;
    try {
      msg = JSON.parse(event.data);
    } catch {
      return;
    }
    if (msg.type === 'sync_world') {
      syncWorld(msg.state);
    } else if (msg.type === 'scene_update') {
      const isNew = applyUpdate(msg);
      // Comando vindo de outro dispositivo: mostra o que aconteceu
      if (isNew && inflight === 0 && msg.transcript) {
        dom.transcriptText.textContent = `“${msg.transcript}”`;
        setStatus(`🔄 ${msg.transcript}`, 'info');
      }
    }
  };
  ws.onclose = () => {
    setServerOnline(false);
    setTimeout(connectWebSocket, 2000);
  };
}

// =============================================================================
// Voz: grava o microfone em WAV e envia ao servidor (Gemini transcreve e
// interpreta em uma única chamada). A Web Speech API não existe no Quest Browser.
// =============================================================================
const AudioCtx = window.AudioContext || window.webkitAudioContext;
const voice = {
  ctx: AudioCtx ? new AudioCtx() : null, // nasce "suspenso"; é liberado no primeiro clique/gatilho
  stream: null,
  ready: false,
  chunks: [],
  recording: false,
  starting: false,
  wanted: false,
  busy: false,
  owner: null,
  startedAt: 0,
  timer: null,
};

function primeAudio() {
  if (voice.ctx && voice.ctx.state === 'suspended') voice.ctx.resume().catch(() => {});
}
window.addEventListener('pointerdown', primeAudio, true);
window.addEventListener('keydown', primeAudio, true);

async function ensureMic() {
  if (!window.isSecureContext || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw Object.assign(new Error('INSECURE'), { name: 'Insecure' });
  }
  if (!voice.ctx) throw new Error('Web Audio indisponível');
  if (!voice.stream) {
    voice.stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
  }
  if (!voice.ready) {
    const source = voice.ctx.createMediaStreamSource(voice.stream);
    const proc = voice.ctx.createScriptProcessor(4096, 1, 1);
    proc.onaudioprocess = (e) => {
      if (voice.recording) voice.chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
    };
    const mute = voice.ctx.createGain();
    mute.gain.value = 0; // o processador precisa estar ligado ao destino, mas sem ecoar
    source.connect(proc);
    proc.connect(mute);
    mute.connect(voice.ctx.destination);
    voice.ready = true;
  }
  if (voice.ctx.state === 'suspended') await voice.ctx.resume().catch(() => {});
}

function micErrorText(err) {
  if (err.name === 'Insecure') return '🔒 Microfone só funciona via localhost (cabo) ou HTTPS';
  if (err.name === 'NotAllowedError') return '🔒 Microfone bloqueado: libere nas permissões do navegador';
  if (err.name === 'NotFoundError') return '🎙️ Nenhum microfone encontrado';
  return `🎙️ ${err.message}`;
}

function encodeWav(chunks, inRate, outRate = 16000) {
  if (inRate < outRate) outRate = inRate;
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const data = new Float32Array(total);
  let off = 0;
  for (const c of chunks) {
    data.set(c, off);
    off += c.length;
  }
  const ratio = inRate / outRate;
  const outLen = Math.floor(total / ratio);
  const pcm = new Int16Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const a = Math.floor(i * ratio);
    const b = Math.min(total, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = a; j < b; j++) sum += data[j];
    const v = Math.max(-1, Math.min(1, sum / Math.max(1, b - a)));
    pcm[i] = v < 0 ? v * 0x8000 : v * 0x7fff;
  }
  const buf = new ArrayBuffer(44 + pcm.length * 2);
  const dv = new DataView(buf);
  const str = (o, s) => [...s].forEach((ch, i) => dv.setUint8(o + i, ch.charCodeAt(0)));
  str(0, 'RIFF');
  dv.setUint32(4, 36 + pcm.length * 2, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true);
  dv.setUint16(22, 1, true);
  dv.setUint32(24, outRate, true);
  dv.setUint32(28, outRate * 2, true);
  dv.setUint16(32, 2, true);
  dv.setUint16(34, 16, true);
  str(36, 'data');
  dv.setUint32(40, pcm.length * 2, true);
  new Int16Array(buf, 44).set(pcm);
  return new Uint8Array(buf);
}

function toBase64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

async function startVoice(owner, source) {
  if (voice.recording || voice.starting || voice.busy) return;
  voice.owner = owner;
  voice.wanted = true;
  voice.starting = true;
  try {
    await ensureMic();
  } catch (err) {
    voice.starting = false;
    setStatus(micErrorText(err), 'error');
    return;
  }
  voice.starting = false;
  if (!voice.wanted) {
    setStatus('Segure o botão enquanto fala', 'info');
    return;
  }
  if (voice.ctx.state !== 'running') {
    setStatus('🔇 Áudio bloqueado: aperte o gatilho uma vez e tente de novo', 'error');
    return;
  }
  voice.chunks = [];
  voice.recording = true;
  voice.startedAt = performance.now();
  pulse(source, 0.35, 40);
  dom.btnMic.classList.add('listening');
  setStatus(
    owner === 'desktop' ? '🎙️ Ouvindo… clique de novo para enviar' : '🎙️ Ouvindo… solte o botão para enviar',
    'rec',
    { sticky: true }
  );
  voice.timer = setTimeout(() => stopVoice(owner), 12000);
}

async function stopVoice(owner, source) {
  voice.wanted = false;
  if (!voice.recording || voice.owner !== owner) return;
  voice.recording = false;
  clearTimeout(voice.timer);
  dom.btnMic.classList.remove('listening');
  pulse(source, 0.2, 30);

  const seconds = (performance.now() - voice.startedAt) / 1000;
  const chunks = voice.chunks;
  voice.chunks = [];
  if (seconds < 0.4) {
    setStatus('Segure o botão enquanto fala', 'info');
    return;
  }
  let peak = 0;
  for (const c of chunks) for (let i = 0; i < c.length; i += 8) peak = Math.max(peak, Math.abs(c[i]));
  if (peak < 0.01) {
    setStatus('🔇 Não ouvi nada — o microfone está liberado?', 'error');
    return;
  }

  voice.busy = true;
  setStatus('⏳ Entendendo…', 'busy', { sticky: true });
  try {
    const wav = encodeWav(chunks, voice.ctx.sampleRate);
    const data = await postJSON('/api/v1/scene/voice', {
      audio_base64: toBase64(wav),
      mime_type: 'audio/wav',
      ...getUserPose(),
    });
    if (data.transcript) dom.transcriptText.textContent = `“${data.transcript}”`;
    applyUpdate(data);
    reportResult(data);
  } catch (err) {
    setStatus(`⚠️ ${friendlyError(err)}`, 'error');
  } finally {
    voice.busy = false;
  }
}

// Já pede a permissão do microfone ao abrir a página (fora do VR, onde o
// pop-up de permissão aparece normalmente)
if (window.isSecureContext && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
  ensureMic().catch((err) => console.warn('[Voz] microfone ainda não liberado:', err.name));
}

// =============================================================================
// UI 3D: utilitários de textura
// =============================================================================
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function canvasTexture(w, h, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  draw(canvas.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function uiMaterial(map) {
  return new THREE.MeshBasicMaterial({ map, transparent: true, toneMapped: false, fog: false, depthWrite: false });
}

const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

// =============================================================================
// HUD de status no VR (pílula discreta que segue o olhar, só aparece quando há algo
// a dizer: gravando, processando, resultado ou erro)
// =============================================================================
const TONES = { info: '#00f0ff', rec: '#ff3366', busy: '#f59e0b', ok: '#10b981', error: '#f43f5e' };

const hud = (() => {
  const canvas = document.createElement('canvas');
  canvas.width = 1120;
  canvas.height = 140;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 0.07), uiMaterial(tex));
  mesh.renderOrder = 20;
  mesh.visible = false;
  scene.add(mesh);
  return { canvas, tex, mesh, active: false, hideAt: 0 };
})();

function drawHud(text, tone) {
  const ctx = hud.canvas.getContext('2d');
  const { width: w, height: h } = hud.canvas;
  const color = TONES[tone] || TONES.info;
  ctx.clearRect(0, 0, w, h);
  roundRect(ctx, 4, 4, w - 8, h - 8, (h - 8) / 2);
  ctx.fillStyle = 'rgba(8, 12, 22, 0.9)';
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = color;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(70, h / 2, 14, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.font = `600 48px ${FONT}`;
  ctx.fillStyle = '#f0f4fc';
  ctx.textBaseline = 'middle';
  let t = text;
  while (ctx.measureText(t).width > w - 160 && t.length > 4) t = t.slice(0, -2);
  if (t !== text) t = t.slice(0, -1) + '…';
  ctx.fillText(t, 110, h / 2 + 2);
  hud.tex.needsUpdate = true;
}

function showHud(text, tone, sticky) {
  drawHud(text, tone);
  hud.active = true;
  hud.hideAt = sticky ? Infinity : performance.now() + 3500;
}

const _head = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _target = new THREE.Vector3();
function updateHud(dt) {
  if (!renderer.xr.isPresenting || !hud.active || performance.now() > hud.hideAt) {
    hud.active = hud.active && performance.now() <= hud.hideAt;
    hud.mesh.visible = false;
    return;
  }
  camera.getWorldPosition(_head);
  camera.getWorldDirection(_fwd);
  _fwd.y = 0;
  if (_fwd.lengthSq() < 1e-4) _fwd.set(0, 0, -1);
  _fwd.normalize();
  _target.copy(_head).addScaledVector(_fwd, 1.0);
  _target.y = _head.y + (menu.group.visible ? 0.16 : -0.28); // acima do menu quando ele está aberto
  if (!hud.mesh.visible) hud.mesh.position.copy(_target);
  else hud.mesh.position.lerp(_target, 1 - Math.exp(-dt * 5));
  hud.mesh.visible = true;
  hud.mesh.lookAt(_head);
}

// Status unificado: tela do PC + HUD do VR
function setStatus(text, tone = 'info', { sticky = false } = {}) {
  dom.transcriptState.textContent = text;
  dom.pulseIndicator.classList.toggle('active', tone === 'rec' || tone === 'busy');
  showHud(text, tone, sticky);
  if (tone === 'error' && !renderer.xr.isPresenting) showToast(text);
}

// =============================================================================
// Menu do controle (abre/fecha com B ou Y, aparece onde você está olhando)
// =============================================================================
const MENU_ITEMS = [
  { icon: '🔥', label: 'Fogueira', commands: [{ op: 'spawn', asset_id: 'prop_campfire', placement: { direction: 'front', distance_m: 2 } }] },
  { icon: '🐎', label: 'Cavalo', commands: [{ op: 'spawn', asset_id: 'animal_horse', placement: { direction: 'front', distance_m: 3 } }] },
  { icon: '🌲', label: 'Árvore', commands: [{ op: 'spawn', asset_id: 'prop_tree', placement: { direction: 'front', distance_m: 4 } }] },
  { icon: '📦', label: 'Cubo', commands: [{ op: 'spawn', asset_id: 'prop_cube', placement: { direction: 'front', distance_m: 2 } }] },
  { icon: '🔮', label: 'Esfera', commands: [{ op: 'spawn', asset_id: 'prop_sphere', placement: { direction: 'front', distance_m: 2 } }] },
  { icon: '🪵', label: 'Cercado', commands: [{ op: 'spawn', asset_id: 'env_corral', placement: { distance_m: 0 } }] },
  { icon: '🌅', label: 'Ambiente', keepOpen: true, commands: [{ op: 'set_environment', preset: 'next' }] },
  { icon: '↩️', label: 'Desfazer', keepOpen: true, undo: true },
  { icon: '🧹', label: 'Limpar', commands: [{ op: 'clear_scene' }] },
];

const menu = (() => {
  const group = new THREE.Group();
  group.visible = false;
  scene.add(group);

  // Painel: 0.60 x 0.44 m (1600 px/m)
  const panelTex = canvasTexture(960, 704, (ctx, w, h) => {
    roundRect(ctx, 4, 4, w - 8, h - 8, 48);
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(20, 27, 45, 0.94)');
    g.addColorStop(1, 'rgba(8, 11, 20, 0.94)');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.5)';
    ctx.stroke();
    ctx.fillStyle = '#e8f6ff';
    ctx.font = `800 50px ${FONT}`;
    ctx.fillText('VR ROOM', 48, 86);
    ctx.fillStyle = '#8ea3c0';
    ctx.font = `500 27px ${FONT}`;
    ctx.fillText('Gatilho seleciona  ·  B/Y fecha  ·  Segure A/X para falar', 48, 128);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(48, 152, w - 96, 2);
  });
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.44), uiMaterial(panelTex));
  panel.renderOrder = 10;
  group.add(panel);

  // Botões: 0.176 x 0.084 m (2000 px/m)
  const drawButton = (item, hover) =>
    canvasTexture(352, 168, (ctx, w, h) => {
      roundRect(ctx, 4, 4, w - 8, h - 8, 30);
      if (hover) {
        const g = ctx.createLinearGradient(0, 0, w, h);
        g.addColorStop(0, 'rgba(0, 240, 255, 0.32)');
        g.addColorStop(1, 'rgba(139, 92, 246, 0.32)');
        ctx.fillStyle = g;
      } else {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
      }
      ctx.fill();
      ctx.lineWidth = hover ? 5 : 3;
      ctx.strokeStyle = hover ? '#00f0ff' : 'rgba(255, 255, 255, 0.14)';
      ctx.stroke();
      ctx.textBaseline = 'middle';
      ctx.font = `60px ${FONT}`;
      ctx.fillText(item.icon, 34, h / 2 + 4);
      ctx.font = `600 38px ${FONT}`;
      ctx.fillStyle = hover ? '#ffffff' : '#dbe4f0';
      ctx.fillText(item.label, 120, h / 2 + 2);
    });

  const buttons = MENU_ITEMS.map((item, i) => {
    const texNormal = drawButton(item, false);
    const texHover = drawButton(item, true);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.176, 0.084), uiMaterial(texNormal));
    const col = i % 3;
    const row = Math.floor(i / 3);
    mesh.position.set((col - 1) * 0.19, 0.068 - row * 0.098, 0.004);
    mesh.renderOrder = 11;
    mesh.userData = { item, texNormal, texHover, hover: false };
    group.add(mesh);
    return mesh;
  });

  return { group, buttons };
})();

function openMenu() {
  camera.getWorldPosition(_head);
  camera.getWorldDirection(_fwd);
  _fwd.y = 0;
  if (_fwd.lengthSq() < 1e-4) _fwd.set(0, 0, -1);
  _fwd.normalize();
  menu.group.position.copy(_head).addScaledVector(_fwd, 0.75);
  menu.group.position.y = _head.y - 0.15;
  menu.group.lookAt(_head.x, menu.group.position.y, _head.z);
  menu.group.scale.setScalar(0.85);
  menu.group.visible = true;
  menu.group.updateMatrixWorld(true);
  tween(0.15, (k) => menu.group.scale.setScalar(0.85 + 0.15 * easeInOut(k)));
}

function closeMenu() {
  menu.group.visible = false;
}

function toggleMenu(source) {
  pulse(source, 0.25, 25);
  if (menu.group.visible) closeMenu();
  else openMenu();
}

function activateMenuItem(item, source) {
  pulse(source, 0.6, 45);
  if (item.undo) {
    const lastId = [...instances.keys()].pop();
    if (!lastId) {
      setStatus('Nada para desfazer', 'info');
      return;
    }
    applyDirect([{ op: 'remove', instance_id: lastId }], `Desfazer ${lastId}`);
    setStatus(`↩️ Removido: ${lastId}`, 'ok');
  } else {
    applyDirect(item.commands, `${item.icon} ${item.label}`);
    setStatus(`${item.icon} ${item.label}`, 'ok');
  }
  if (!item.keepOpen) closeMenu();
}

// =============================================================================
// Controles do Quest: modelos 3D, laser (só com o menu aberto), botões e locomoção
// =============================================================================
function pulse(source, intensity, ms) {
  const gp = source && source.gamepad;
  if (!gp) return;
  const act = gp.hapticActuators && gp.hapticActuators[0];
  if (act && act.pulse) act.pulse(intensity, ms);
  else if (gp.vibrationActuator && gp.vibrationActuator.playEffect) {
    gp.vibrationActuator.playEffect('dual-rumble', { duration: ms, strongMagnitude: intensity, weakMagnitude: intensity });
  }
}

const controllers = [];
const modelFactory = new XRControllerModelFactory();
const laserGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]);
const laserMat = new THREE.LineBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.85, toneMapped: false });

for (let i = 0; i < 2; i++) {
  const ctrl = renderer.xr.getController(i);
  ctrl.addEventListener('connected', (e) => (ctrl.userData.source = e.data));
  ctrl.addEventListener('disconnected', () => (ctrl.userData.source = null));
  ctrl.addEventListener('selectstart', () => {
    primeAudio(); // o gatilho conta como interação do usuário: libera o áudio
    const btn = ctrl.userData.hover;
    if (menu.group.visible && btn) activateMenuItem(btn.userData.item, ctrl.userData.source);
  });

  const laser = new THREE.Line(laserGeo, laserMat);
  laser.visible = false;
  ctrl.add(laser);
  ctrl.userData.laser = laser;

  const dot = new THREE.Mesh(
    new THREE.SphereGeometry(0.006, 12, 12),
    new THREE.MeshBasicMaterial({ color: 0x00f0ff, toneMapped: false })
  );
  dot.visible = false;
  scene.add(dot);
  ctrl.userData.dot = dot;
  dolly.add(ctrl);

  const grip = renderer.xr.getControllerGrip(i);
  grip.add(modelFactory.createControllerModel(grip));
  dolly.add(grip);

  controllers.push(ctrl);
}

const raycaster = new THREE.Raycaster();
const _rot = new THREE.Matrix4();
function updatePointers() {
  const hovered = new Set();
  for (const ctrl of controllers) {
    const { laser, dot, source } = ctrl.userData;
    if (!menu.group.visible || !source || source.targetRayMode !== 'tracked-pointer') {
      laser.visible = false;
      dot.visible = false;
      ctrl.userData.hover = null;
      continue;
    }
    _rot.identity().extractRotation(ctrl.matrixWorld);
    raycaster.ray.origin.setFromMatrixPosition(ctrl.matrixWorld);
    raycaster.ray.direction.set(0, 0, -1).applyMatrix4(_rot);
    const hit = raycaster.intersectObjects(menu.buttons, false)[0];
    laser.visible = true;
    laser.scale.z = hit ? hit.distance : 1.0;
    dot.visible = !!hit;
    if (hit) dot.position.copy(hit.point);
    const btn = hit ? hit.object : null;
    if (btn && btn !== ctrl.userData.hover) pulse(source, 0.1, 12);
    ctrl.userData.hover = btn;
    if (btn) hovered.add(btn);
  }
  for (const b of menu.buttons) {
    const h = hovered.has(b);
    if (b.userData.hover !== h) {
      b.userData.hover = h;
      b.material.map = h ? b.userData.texHover : b.userData.texNormal;
      b.scale.setScalar(h ? 1.05 : 1);
    }
  }
}

// Locomoção: analógico esquerdo anda, analógico direito gira 45° (em volta da cabeça)
const _headBefore = new THREE.Vector3();
const _headAfter = new THREE.Vector3();
function snapTurn(angle) {
  camera.getWorldPosition(_headBefore);
  dolly.rotation.y += angle;
  dolly.updateMatrixWorld(true);
  camera.getWorldPosition(_headAfter);
  dolly.position.x += _headBefore.x - _headAfter.x;
  dolly.position.z += _headBefore.z - _headAfter.z;
}

const padPrev = { left: {}, right: {} };
const WALK_SPEED = 2.0;
function pollGamepads(dt) {
  const session = renderer.xr.getSession();
  if (!session) return;
  for (const src of session.inputSources) {
    const gp = src.gamepad;
    if (!gp || !padPrev[src.handedness]) continue;
    const prev = padPrev[src.handedness];
    const ax = gp.axes.length >= 4 ? gp.axes[2] : gp.axes[0] || 0;
    const ay = gp.axes.length >= 4 ? gp.axes[3] : gp.axes[1] || 0;

    if (src.handedness === 'left' && (Math.abs(ax) > 0.15 || Math.abs(ay) > 0.15)) {
      camera.getWorldDirection(_fwd);
      _fwd.y = 0;
      _fwd.normalize();
      const right = new THREE.Vector3(-_fwd.z, 0, _fwd.x);
      dolly.position.addScaledVector(_fwd, -ay * WALK_SPEED * dt);
      dolly.position.addScaledVector(right, ax * WALK_SPEED * dt);
    }
    if (src.handedness === 'right') {
      if (Math.abs(ax) > 0.7 && !prev.turned) {
        snapTurn(ax > 0 ? -Math.PI / 4 : Math.PI / 4);
        prev.turned = true;
      } else if (Math.abs(ax) < 0.3) {
        prev.turned = false;
      }
    }

    // Botões xr-standard do Touch: [4] = A / X, [5] = B / Y
    const talk = !!(gp.buttons[4] && gp.buttons[4].pressed);
    const menuBtn = !!(gp.buttons[5] && gp.buttons[5].pressed);
    if (talk && !prev.talk) startVoice(src.handedness, src); // segurar = gravar
    if (!talk && prev.talk) stopVoice(src.handedness, src); // soltar = enviar
    if (menuBtn && !prev.menu) toggleMenu(src);
    prev.talk = talk;
    prev.menu = menuBtn;
  }
}

renderer.xr.addEventListener('sessionstart', () => {
  primeAudio();
  closeMenu();
  setTimeout(() => showHud('Segure A/X para falar  ·  B/Y abre o menu', 'info', false), 600);
});
renderer.xr.addEventListener('sessionend', () => {
  closeMenu();
  hud.active = false;
  dolly.position.set(0, 0, 0);
  dolly.rotation.set(0, 0, 0);
  if (voice.recording) stopVoice(voice.owner);
});

// Chama/fogo tremulando
function updateFlames(t) {
  for (const { mesh } of instances.values()) {
    const flames = mesh.userData.flames;
    if (!flames) continue;
    const ph = mesh.userData.phase;
    flames[0].scale.set(1 + Math.sin(t * 0.011 + ph) * 0.06, 1 + Math.sin(t * 0.017 + ph) * 0.14, 1);
    flames[1].scale.set(1, 1 + Math.sin(t * 0.023 + ph) * 0.18, 1);
    mesh.userData.fireLight.intensity = 3.2 + Math.sin(t * 0.03 + ph) * 0.5 + Math.sin(t * 0.071) * 0.3;
  }
}

// =============================================================================
// UI 2D (PC)
// =============================================================================
function setServerOnline(online) {
  dom.statusServer.querySelector('.status-dot').className = `status-dot ${online ? 'online' : 'busy'}`;
  dom.statusServer.querySelector('.status-label').textContent = online ? 'Sincronizado' : 'Reconectando…';
}

function refreshObjectList() {
  const count = instances.size;
  dom.objectsCount.textContent = `${count} objeto${count === 1 ? '' : 's'}`;
  dom.activeObjectsList.innerHTML = '';
  if (count === 0) {
    dom.activeObjectsList.innerHTML = '<p class="empty-hint">Nenhum objeto instanciado ainda.</p>';
    return;
  }
  for (const [id, { data }] of instances) {
    const row = document.createElement('div');
    row.className = 'object-item';
    const label = document.createElement('span');
    label.innerHTML = `<strong></strong> ()`;
    label.querySelector('strong').textContent = id;
    label.lastChild.textContent = ` (${data.asset_id})`;
    const btn = document.createElement('button');
    btn.textContent = '×';
    btn.style.cssText = 'background:transparent;border:none;color:#ff4466;cursor:pointer;font-size:1rem;';
    btn.onclick = () => applyDirect([{ op: 'remove', instance_id: id }], `Remover ${id}`);
    row.append(label, btn);
    dom.activeObjectsList.appendChild(row);
  }
}

function showToast(msg) {
  dom.toast.textContent = msg;
  dom.toast.classList.add('show');
  clearTimeout(dom.toast._timer);
  dom.toast._timer = setTimeout(() => dom.toast.classList.remove('show'), 3200);
}

dom.btnMic.addEventListener('click', () => {
  if (voice.recording) stopVoice('desktop');
  else startVoice('desktop');
});

dom.commandForm.addEventListener('submit', (e) => {
  e.preventDefault();
  sendText(dom.commandInput.value);
  dom.commandInput.value = '';
});

document.querySelectorAll('.chip').forEach((chip) => {
  chip.addEventListener('click', () => sendText(chip.getAttribute('data-prompt')));
});

dom.btnToggleInspector.addEventListener('click', () => dom.inspectorDrawer.classList.toggle('open'));
dom.btnCloseInspector.addEventListener('click', () => dom.inspectorDrawer.classList.remove('open'));

if (dom.selectPreset) {
  dom.selectPreset.addEventListener('change', (e) =>
    applyDirect([{ op: 'set_environment', preset: e.target.value }], `Ambiente: ${e.target.value}`)
  );
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// =============================================================================
// Loop principal
// =============================================================================
const clock = new THREE.Clock();
let frame = 0;
renderer.setAnimationLoop((t) => {
  const dt = Math.min(clock.getDelta(), 0.1);

  if (renderer.xr.isPresenting) {
    pollGamepads(dt);
    updatePointers();
  } else {
    controls.update();
  }
  updateTweens(dt);
  updateFlames(t);
  updateHud(dt);

  if (++frame % 10 === 0) {
    const pose = getUserPose();
    dom.hudCamPos.textContent = `${pose.user_position.x}, ${pose.user_position.y}, ${pose.user_position.z}`;
    dom.hudCamYaw.textContent = `${Math.round(pose.user_yaw_deg)}°`;
  }

  renderer.render(scene, camera);
});

connectWebSocket();
refreshObjectList();
