import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { VRButton } from 'three/addons/webxr/VRButton.js';

// --- State Management ---
const state = {
  activeInstances: new Map(), // instance_id -> { mesh, meta }
  currentPreset: 'studio',
  isListening: false,
  isProcessing: false,
};

// --- DOM Elements ---
const canvasContainer = document.getElementById('canvas-container');
const btnMic = document.getElementById('btn-mic');
const commandForm = document.getElementById('command-form');
const commandInput = document.getElementById('command-input');
const transcriptBalloon = document.getElementById('transcript-balloon');
const transcriptText = document.getElementById('transcript-text');
const transcriptState = document.getElementById('transcript-state');
const pulseIndicator = document.getElementById('pulse-indicator');
const statusServer = document.getElementById('status-server');
const objectsCountEl = document.getElementById('objects-count');
const hudCamPos = document.getElementById('hud-cam-pos');
const hudCamYaw = document.getElementById('hud-cam-yaw');
const btnToggleInspector = document.getElementById('btn-toggle-inspector');
const btnCloseInspector = document.getElementById('btn-close-inspector');
const inspectorDrawer = document.getElementById('inspector-drawer');
const jsonViewer = document.getElementById('json-viewer');
const activeObjectsList = document.getElementById('active-objects-list');
const selectPreset = document.getElementById('select-preset');
const toastEl = document.getElementById('toast');

// --- Three.js Setup ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0e17);
scene.fog = new THREE.FogExp2(0x0a0e17, 0.035);

const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 1.7, 4);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.xr.enabled = true;
canvasContainer.appendChild(renderer.domElement);

// Injetar botão WebXR para Meta Quest
const vrButtonSlot = document.getElementById('vr-button-slot');
if (vrButtonSlot) {
  vrButtonSlot.appendChild(VRButton.createButton(renderer));
}

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.target.set(0, 1.2, 0);
controls.maxPolarAngle = Math.PI / 2 + 0.05; // Evita atravessar o chão

// --- Iluminação ---
const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xfff4e0, 2.2);
dirLight.position.set(5, 12, 7);
dirLight.castShadow = true;
dirLight.shadow.mapSize.width = 2048;
dirLight.shadow.mapSize.height = 2048;
dirLight.shadow.camera.near = 0.5;
dirLight.shadow.camera.far = 30;
dirLight.shadow.camera.left = -10;
dirLight.shadow.camera.right = 10;
dirLight.shadow.camera.top = 10;
dirLight.shadow.camera.bottom = -10;
dirLight.shadow.bias = -0.0005;
scene.add(dirLight);

// Luz pontual de acento
const accentLight = new THREE.PointLight(0x00f0ff, 1.5, 15);
accentLight.position.set(0, 3, 0);
scene.add(accentLight);

// --- Chão e Grade Espacial ---
const floorGroup = new THREE.Group();
scene.add(floorGroup);

const floorGeo = new THREE.PlaneGeometry(60, 60);
const floorMat = new THREE.MeshStandardMaterial({
  color: 0x0f1522,
  roughness: 0.85,
  metalness: 0.2,
});
const floorMesh = new THREE.Mesh(floorGeo, floorMat);
floorMesh.rotation.x = -Math.PI / 2;
floorMesh.receiveShadow = true;
floorGroup.add(floorMesh);

// Grid reflexivo
const gridHelper = new THREE.GridHelper(40, 40, 0x00f0ff, 0x1f2b42);
gridHelper.position.y = 0.01;
floorGroup.add(gridHelper);

// Círculo indicador central do usuário
const userCircleGeo = new THREE.RingGeometry(0.5, 0.55, 32);
const userCircleMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff, side: THREE.DoubleSide });
const userCircle = new THREE.Mesh(userCircleGeo, userCircleMat);
userCircle.rotation.x = -Math.PI / 2;
userCircle.position.y = 0.02;
floorGroup.add(userCircle);

// --- Fábrica Procedural de Assets 3D ---
function createAsset(assetId, color = null) {
  const group = new THREE.Group();
  const normalizedId = (assetId || '').toLowerCase();

  if (normalizedId.includes('horse') || normalizedId.includes('cavalo')) {
    // 🐎 Cavalo Estilizado Low-Poly Elegante
    const bodyMat = new THREE.MeshStandardMaterial({
      color: color || 0x8b4513,
      roughness: 0.7,
      metalness: 0.1,
    });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x221105, roughness: 0.8 });

    // Tronco
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.7, 1.6), bodyMat);
    body.position.y = 1.2;
    body.castShadow = true;
    group.add(body);

    // Pescoço
    const neck = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.9, 0.5), bodyMat);
    neck.position.set(0, 1.7, 0.75);
    neck.rotation.x = -Math.PI / 6;
    neck.castShadow = true;
    group.add(neck);

    // Cabeça
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.4, 0.7), bodyMat);
    head.position.set(0, 2.05, 1.05);
    head.castShadow = true;
    group.add(head);

    // Focinho
    const muzzle = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.32, 0.35), darkMat);
    muzzle.position.set(0, 1.95, 1.45);
    group.add(muzzle);

    // Orelhas
    const earL = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.22, 4), bodyMat);
    earL.position.set(0.12, 2.35, 0.85);
    const earR = earL.clone();
    earR.position.x = -0.12;
    group.add(earL, earR);

    // Crina
    const mane = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.8, 0.2), darkMat);
    mane.position.set(0, 1.85, 0.55);
    mane.rotation.x = -Math.PI / 6;
    group.add(mane);

    // Pernas (4)
    const legGeo = new THREE.BoxGeometry(0.18, 1.0, 0.18);
    const legPositions = [
      [0.28, 0.5, 0.6],
      [-0.28, 0.5, 0.6],
      [0.28, 0.5, -0.6],
      [-0.28, 0.5, -0.6],
    ];
    legPositions.forEach(([x, y, z]) => {
      const leg = new THREE.Mesh(legGeo, bodyMat);
      leg.position.set(x, y, z);
      leg.castShadow = true;
      group.add(leg);

      const hoof = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.15, 0.22), darkMat);
      hoof.position.set(x, 0.08, z);
      group.add(hoof);
    });

    // Rabo
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.7, 0.14), darkMat);
    tail.position.set(0, 1.0, -0.9);
    tail.rotation.x = Math.PI / 12;
    group.add(tail);

  } else if (normalizedId.includes('cube') || normalizedId.includes('cubo')) {
    // 📦 Cubo High-Tech com Acento Emissivo
    const cubeMat = new THREE.MeshStandardMaterial({
      color: color || 0xd97706,
      roughness: 0.2,
      metalness: 0.8,
    });
    const cube = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), cubeMat);
    cube.position.y = 0.5;
    cube.castShadow = true;
    group.add(cube);

    const wireMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff, wireframe: true });
    const wire = new THREE.Mesh(new THREE.BoxGeometry(1.02, 1.02, 1.02), wireMat);
    wire.position.y = 0.5;
    group.add(wire);

  } else if (normalizedId.includes('sphere') || normalizedId.includes('esfera')) {
    // 🔮 Esfera de Energia
    const sphereMat = new THREE.MeshPhysicalMaterial({
      color: color || 0x00f0ff,
      roughness: 0.1,
      metalness: 0.1,
      transmission: 0.6,
      ior: 1.5,
    });
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.6, 32, 32), sphereMat);
    sphere.position.y = 0.6;
    sphere.castShadow = true;
    group.add(sphere);

  } else if (normalizedId.includes('campfire') || normalizedId.includes('fogueira') || normalizedId.includes('fire')) {
    // 🔥 Fogueira
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x4a2e18, roughness: 0.9 });
    for (let i = 0; i < 5; i++) {
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.8, 6), woodMat);
      log.rotation.z = Math.PI / 3;
      log.rotation.y = (i * Math.PI * 2) / 5;
      log.position.y = 0.15;
      log.castShadow = true;
      group.add(log);
    }

    const fireMat = new THREE.MeshStandardMaterial({
      color: 0xff4500,
      emissive: 0xff6600,
      emissiveIntensity: 1.8,
    });
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.7, 8), fireMat);
    flame.position.y = 0.45;
    group.add(flame);

    const fireLight = new THREE.PointLight(0xff7700, 2.5, 6);
    fireLight.position.set(0, 0.6, 0);
    group.add(fireLight);

  } else if (normalizedId.includes('corral') || normalizedId.includes('cercado') || normalizedId.includes('fence')) {
    // 🪵 Cercado de Madeira em formato quadrado
    const fenceMat = new THREE.MeshStandardMaterial({ color: 0x7c5332, roughness: 0.9 });
    const size = 3.5;
    const half = size / 2;
    const posts = [
      [-half, -half], [half, -half], [half, half], [-half, half],
      [0, -half], [half, 0], [0, half], [-half, 0]
    ];
    posts.forEach(([px, pz]) => {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.2, 6), fenceMat);
      post.position.set(px, 0.6, pz);
      post.castShadow = true;
      group.add(post);
    });

    const railGeo = new THREE.BoxGeometry(size, 0.1, 0.08);
    const rail1 = new THREE.Mesh(railGeo, fenceMat);
    rail1.position.set(0, 0.8, -half);
    const rail2 = rail1.clone();
    rail2.position.set(0, 0.8, half);
    const rail3 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, size), fenceMat);
    rail3.position.set(-half, 0.8, 0);
    const rail4 = rail3.clone();
    rail4.position.set(half, 0.8, 0);
    group.add(rail1, rail2, rail3, rail4);

  } else if (normalizedId.includes('tree') || normalizedId.includes('arvore')) {
    // 🌲 Árvore Low-Poly
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5a3d28, roughness: 0.9 });
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.35, 1.8, 6), trunkMat);
    trunk.position.y = 0.9;
    trunk.castShadow = true;
    group.add(trunk);

    const leavesMat = new THREE.MeshStandardMaterial({ color: 0x2e7d32, roughness: 0.7 });
    const c1 = new THREE.Mesh(new THREE.ConeGeometry(1.2, 1.4, 7), leavesMat);
    c1.position.y = 2.1;
    c1.castShadow = true;
    const c2 = new THREE.Mesh(new THREE.ConeGeometry(0.9, 1.2, 7), leavesMat);
    c2.position.y = 2.9;
    c2.castShadow = true;
    group.add(c1, c2);

  } else {
    // Fallback: Objeto Genérico Estilizado
    const defaultMat = new THREE.MeshStandardMaterial({
      color: color || 0x8b5cf6,
      roughness: 0.3,
      metalness: 0.5,
    });
    const shape = new THREE.Mesh(new THREE.DodecahedronGeometry(0.6), defaultMat);
    shape.position.y = 0.7;
    shape.castShadow = true;
    group.add(shape);
  }

  return group;
}

// --- Cálculo Espacial de Posição ---
function calculatePlacement(placement, userPos, userYawRad) {
  const distance = (placement && placement.distance_m) ? Number(placement.distance_m) : 2.5;
  const direction = (placement && placement.direction) ? placement.direction.toLowerCase() : 'front';
  const vertical = (placement && placement.vertical) ? placement.vertical.toLowerCase() : 'ground';

  // Vetores de direção horizontal baseados na rotação do usuário (Yaw)
  const forwardX = -Math.sin(userYawRad);
  const forwardZ = -Math.cos(userYawRad);
  const rightX = Math.cos(userYawRad);
  const rightZ = -Math.sin(userYawRad);

  let offsetX = 0;
  let offsetZ = 0;

  switch (direction) {
    case 'front':
    case 'frente':
      offsetX = forwardX * distance;
      offsetZ = forwardZ * distance;
      break;
    case 'back':
    case 'tras':
    case 'atras':
      offsetX = -forwardX * distance;
      offsetZ = -forwardZ * distance;
      break;
    case 'left':
    case 'esquerda':
      offsetX = -rightX * distance;
      offsetZ = -rightZ * distance;
      break;
    case 'right':
    case 'direita':
      offsetX = rightX * distance;
      offsetZ = rightZ * distance;
      break;
    default:
      offsetX = forwardX * distance;
      offsetZ = forwardZ * distance;
  }

  const finalX = userPos.x + offsetX;
  const finalZ = userPos.z + offsetZ;
  let finalY = 0;

  if (vertical === 'eye_level' || vertical === 'olhos') {
    finalY = userPos.y || 1.7;
  } else {
    finalY = 0; // 'ground'
  }

  return { x: finalX, y: finalY, z: finalZ };
}

// --- Animações Suaves ---
function animateSpawn(group) {
  group.scale.set(0.001, 0.001, 0.001);
  const targetScale = group.userData.baseScale || 1;
  let progress = 0;

  function pop() {
    progress += 0.06;
    // Curva overshoot suave
    const s = targetScale * (Math.sin(progress * Math.PI * 0.5) + Math.sin(progress * Math.PI) * 0.2);
    if (progress >= 1) {
      group.scale.set(targetScale, targetScale, targetScale);
    } else {
      group.scale.set(s, s, s);
      requestAnimationFrame(pop);
    }
  }
  pop();
}

function animateRemove(group, onComplete) {
  let progress = 1;
  function shrink() {
    progress -= 0.08;
    if (progress <= 0) {
      if (onComplete) onComplete();
    } else {
      group.scale.set(progress, progress, progress);
      requestAnimationFrame(shrink);
    }
  }
  shrink();
}

// --- Execução dos Comandos Espaciais ---
function executeCommands(commands) {
  if (!Array.isArray(commands)) return;

  const userPos = { x: camera.position.x, y: camera.position.y, z: camera.position.z };
  const userYaw = camera.rotation.y;

  commands.forEach((cmd) => {
    const op = (cmd.op || '').toLowerCase();
    const instanceId = cmd.instance_id || `item_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    switch (op) {
      case 'spawn': {
        // Remover instância existente com mesmo ID se houver
        if (state.activeInstances.has(instanceId)) {
          const old = state.activeInstances.get(instanceId);
          scene.remove(old.mesh);
        }

        const mesh = createAsset(cmd.asset_id);
        const pos = calculatePlacement(cmd.placement, userPos, userYaw);
        mesh.position.set(pos.x, pos.y, pos.z);

        // Fazer o objeto olhar suavemente para o usuário
        mesh.lookAt(userPos.x, pos.y, userPos.z);

        // Escala
        let baseScale = 1;
        if (cmd.scale && cmd.scale.value) {
          baseScale = Number(cmd.scale.value);
        }
        mesh.userData.baseScale = baseScale;

        scene.add(mesh);
        animateSpawn(mesh);

        state.activeInstances.set(instanceId, {
          mesh,
          data: {
            instance_id: instanceId,
            asset_id: cmd.asset_id,
            placement: cmd.placement,
            position: pos,
          },
        });
        showToast(`✨ Instanciado: ${cmd.asset_id || instanceId}`);
        break;
      }

      case 'modify': {
        if (state.activeInstances.has(instanceId)) {
          const item = state.activeInstances.get(instanceId);
          if (cmd.scale && cmd.scale.value) {
            const factor = Number(cmd.scale.value);
            if (cmd.scale.mode === 'multiply') {
              item.mesh.scale.multiplyScalar(factor);
            } else {
              item.mesh.scale.set(factor, factor, factor);
            }
          }
          if (cmd.placement) {
            const newPos = calculatePlacement(cmd.placement, userPos, userYaw);
            item.mesh.position.set(newPos.x, newPos.y, newPos.z);
          }
          showToast(`✏️ Modificado: ${instanceId}`);
        } else {
          showToast(`⚠️ Objeto ${instanceId} não encontrado.`);
        }
        break;
      }

      case 'remove': {
        if (state.activeInstances.has(instanceId)) {
          const item = state.activeInstances.get(instanceId);
          animateRemove(item.mesh, () => {
            scene.remove(item.mesh);
            state.activeInstances.delete(instanceId);
            updateUI();
          });
          showToast(`🗑️ Removido: ${instanceId}`);
        }
        break;
      }

      case 'clear_scene': {
        state.activeInstances.forEach((item) => {
          animateRemove(item.mesh, () => {
            scene.remove(item.mesh);
          });
        });
        state.activeInstances.clear();
        showToast(`🧹 Cena limpa`);
        break;
      }

      case 'set_environment': {
        if (cmd.preset) {
          applyPreset(cmd.preset);
          showToast(`🌄 Ambiente: ${cmd.preset}`);
        }
        break;
      }

      case 'set_lighting': {
        if (cmd.color) {
          dirLight.color.set(cmd.color);
        }
        if (cmd.intensity) {
          dirLight.intensity = Number(cmd.intensity);
        }
        showToast(`💡 Iluminação ajustada`);
        break;
      }
    }
  });

  updateUI();
}

// --- Presets de Ambiente ---
function applyPreset(presetName) {
  const p = (presetName || '').toLowerCase();
  state.currentPreset = p;
  if (selectPreset) selectPreset.value = p;

  switch (p) {
    case 'sunset':
      scene.background.set(0x2a101b);
      scene.fog.color.set(0x2a101b);
      dirLight.color.set(0xff7744);
      dirLight.intensity = 2.4;
      ambientLight.color.set(0x884433);
      floorMat.color.set(0x24141d);
      gridHelper.material.color.set(0xff7744);
      break;
    case 'night':
      scene.background.set(0x030712);
      scene.fog.color.set(0x030712);
      dirLight.color.set(0x4466aa);
      dirLight.intensity = 0.8;
      ambientLight.color.set(0x112233);
      floorMat.color.set(0x080f1e);
      gridHelper.material.color.set(0x38bdf8);
      break;
    case 'cyberpunk':
      scene.background.set(0x12072b);
      scene.fog.color.set(0x12072b);
      dirLight.color.set(0xff007f);
      dirLight.intensity = 2.0;
      ambientLight.color.set(0x38006b);
      floorMat.color.set(0x1a0933);
      gridHelper.material.color.set(0x00f0ff);
      break;
    case 'desert':
      scene.background.set(0xd4a373);
      scene.fog.color.set(0xd4a373);
      dirLight.color.set(0xfff1cf);
      dirLight.intensity = 2.8;
      ambientLight.color.set(0xfaedcd);
      floorMat.color.set(0xc68b59);
      gridHelper.material.color.set(0x8f5934);
      break;
    case 'studio':
    default:
      scene.background.set(0x0a0e17);
      scene.fog.color.set(0x0a0e17);
      dirLight.color.set(0xfff4e0);
      dirLight.intensity = 2.2;
      ambientLight.color.set(0xffffff);
      floorMat.color.set(0x0f1522);
      gridHelper.material.color.set(0x00f0ff);
      break;
  }
}

// --- Chamada à API BFF ---
async function sendCommand(transcript) {
  if (!transcript || !transcript.trim()) return;

  setProcessing(true);
  transcriptText.textContent = `"${transcript}"`;
  transcriptState.textContent = 'Enviando ao Gemini 3.5 Flash...';

  // Coletar objetos existentes para dar memória contextual ao Gemini
  const existingObjects = [];
  state.activeInstances.forEach((item) => {
    existingObjects.push({
      instance_id: item.data.instance_id,
      asset_id: item.data.asset_id,
    });
  });

  const payload = {
    transcript: transcript.trim(),
    user_position: {
      x: Number(camera.position.x.toFixed(2)),
      y: Number(camera.position.y.toFixed(2)),
      z: Number(camera.position.z.toFixed(2)),
    },
    user_rotation_y: Number(((camera.rotation.y * 180) / Math.PI).toFixed(1)),
    existing_objects: existingObjects,
  };

  try {
    const res = await fetch('/api/v1/scene/command', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.message || `Erro HTTP ${res.status}`);
    }

    const data = await res.json();
    jsonViewer.textContent = JSON.stringify(data.commands, null, 2);
    transcriptState.textContent = 'Comandos executados com sucesso!';

    if (data.commands && data.commands.length > 0) {
      executeCommands(data.commands);
    } else {
      showToast('Nenhum comando gerado para esta frase.');
    }
  } catch (err) {
    console.error('Falha ao enviar comando:', err);
    transcriptState.textContent = 'Erro ao processar comando';
    showToast(`Erro: ${err.message}`);
  } finally {
    setProcessing(false);
  }
}

function setProcessing(isBusy) {
  state.isProcessing = isBusy;
  const statusDot = statusServer.querySelector('.status-dot');
  if (isBusy) {
    statusDot.className = 'status-dot busy';
    pulseIndicator.classList.add('active');
  } else {
    statusDot.className = 'status-dot online';
    if (!state.isListening) {
      pulseIndicator.classList.remove('active');
    }
  }
}

// --- Reconhecimento de Voz (Web Speech API) ---
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;

if (SpeechRecognition) {
  recognition = new SpeechRecognition();
  recognition.lang = 'pt-BR';
  recognition.continuous = false;
  recognition.interimResults = true;

  recognition.onstart = () => {
    state.isListening = true;
    btnMic.classList.add('listening');
    pulseIndicator.classList.add('active');
    transcriptState.textContent = 'Ouvindo... Fale seu comando';
  };

  recognition.onresult = (event) => {
    const current = event.resultIndex;
    const transcript = event.results[current][0].transcript;
    transcriptText.textContent = `"${transcript}"`;

    if (event.results[current].isFinal) {
      sendCommand(transcript);
    }
  };

  recognition.onerror = (event) => {
    console.warn('Speech recognition error:', event.error);
    state.isListening = false;
    btnMic.classList.remove('listening');
    pulseIndicator.classList.remove('active');
    transcriptState.textContent = `Erro no microfone (${event.error}). Tente digitar.`;
  };

  recognition.onend = () => {
    state.isListening = false;
    btnMic.classList.remove('listening');
    if (!state.isProcessing) {
      pulseIndicator.classList.remove('active');
      transcriptState.textContent = 'Aguardando próximo comando...';
    }
  };
} else {
  console.info('Web Speech API não disponível neste navegador. Digite os comandos no campo.');
}

function toggleListening() {
  if (!recognition) {
    showToast('Reconhecimento de voz não suportado neste navegador. Use o campo de texto.');
    commandInput.focus();
    return;
  }

  if (state.isListening) {
    recognition.stop();
  } else {
    try {
      recognition.start();
    } catch (e) {
      console.warn('Erro ao iniciar reconhecimento:', e);
    }
  }
}

// --- Atualização de UI ---
function updateUI() {
  // Contador de objetos
  const count = state.activeInstances.size;
  objectsCountEl.textContent = `${count} objeto${count === 1 ? '' : 's'}`;

  // Lista no Drawer
  activeObjectsList.innerHTML = '';
  if (count === 0) {
    activeObjectsList.innerHTML = '<p class="empty-hint">Nenhum objeto instanciado ainda.</p>';
  } else {
    state.activeInstances.forEach((val, id) => {
      const item = document.createElement('div');
      item.className = 'object-item';
      item.innerHTML = `
        <span><strong>${id}</strong> (${val.data.asset_id})</span>
        <button class="btn-remove-item" style="background:transparent;border:none;color:#ff4466;cursor:pointer;">&times;</button>
      `;
      item.querySelector('.btn-remove-item').onclick = () => {
        executeCommands([{ op: 'remove', instance_id: id }]);
      };
      activeObjectsList.appendChild(item);
    });
  }
}

function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastEl._timer);
  toastEl._timer = setTimeout(() => {
    toastEl.classList.remove('show');
  }, 3200);
}

// --- Event Listeners ---
btnMic.addEventListener('click', toggleListening);

commandForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = commandInput.value;
  if (text && text.trim()) {
    sendCommand(text);
    commandInput.value = '';
  }
});

// Chips de sugestão rápida
document.querySelectorAll('.chip').forEach((chip) => {
  chip.addEventListener('click', () => {
    const prompt = chip.getAttribute('data-prompt');
    if (prompt) {
      sendCommand(prompt);
    }
  });
});

// Drawer do Inspetor
btnToggleInspector.addEventListener('click', () => {
  inspectorDrawer.classList.toggle('open');
});

btnCloseInspector.addEventListener('click', () => {
  inspectorDrawer.classList.remove('open');
});

if (selectPreset) {
  selectPreset.addEventListener('change', (e) => {
    applyPreset(e.target.value);
  });
}

// Window resize
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- Render Loop ---
function animate() {
  renderer.setAnimationLoop(() => {
    controls.update();

    // Atualizar HUD com posição e yaw da câmera em tempo real
    const px = camera.position.x.toFixed(1);
    const py = camera.position.y.toFixed(1);
    const pz = camera.position.z.toFixed(1);
    const yawDeg = Math.round((camera.rotation.y * 180) / Math.PI);

    hudCamPos.textContent = `${px}, ${py}, ${pz}`;
    hudCamYaw.textContent = `${yawDeg}°`;

    renderer.render(scene, camera);
  });
}

// Inicializar
animate();
updateUI();
console.log('VR Room 3D Client inicializado com sucesso.');
