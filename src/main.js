import * as THREE from 'three';
import { CONFIG } from './config.js';
import { WorldGen } from './world/worldgen.js';
import { ChunkManager } from './world/chunks.js';
import { Grass } from './world/grass.js';
import { Sky, SKY } from './world/sky.js';
import { createParticles } from './world/particles.js';
import { SHARED, createTerrainMaterial, createVegetationMaterial, createGrassMaterial } from './world/materials.js';
import { makePine, makeBroadleaf, makeBirch, makeBush, makeFern, makeRock, makeLog } from './world/models.js';
import { PixelPipeline } from './render/pixelPipeline.js';
import { Input } from './player/input.js';
import { Player } from './player/player.js';
import { Hud } from './ui/hud.js';
import { Soundscape } from './audio/soundscape.js';
import { STRUCTURES } from './structures/index.js';
import { placeStructures } from './structures/loader.js';

const SAVE_KEY = 'my-world:state';
const SETTINGS_KEY = 'my-world:settings';
const store = {
  get(k) {
    try {
      return JSON.parse(localStorage.getItem(k) || 'null');
    } catch {
      return null;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {
      /* private mode etc. */
    }
  },
};

// ── Renderer ───────────────────────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.NoToneMapping;
renderer.info.autoReset = false;
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 1200);

// ── World ──────────────────────────────────────────────────────────────────
const gen = new WorldGen(CONFIG.seed, STRUCTURES);
const materials = {
  terrain: createTerrainMaterial(),
  vegetation: createVegetationMaterial(),
  grass: createGrassMaterial(),
};
const models = {
  pine: makePine(11),
  broad: makeBroadleaf(23),
  birch: makeBirch(37),
  bush: makeBush(41),
  fern: makeFern(53),
  rock: makeRock(67),
  log: makeLog(71),
};
const chunks = new ChunkManager(scene, gen, materials, models, STRUCTURES);
const grass = new Grass(scene, chunks, materials.grass, CONFIG.seed);
const sky = new Sky(scene);
const particles = createParticles();
scene.add(particles.object);
placeStructures(scene, STRUCTURES, gen, materials);
SHARED.uGrassRadius.value = CONFIG.grassRadius;

const input = new Input(renderer.domElement);
const player = new Player(scene, camera, chunks, input);
const pipeline = new PixelPipeline(renderer);
const hud = new Hud();
const sound = new Soundscape();

const settings = store.get(SETTINGS_KEY);
if (settings && !CONFIG.reset) {
  if (typeof settings.softness === 'number' && !new URLSearchParams(location.search).has('soft')) pipeline.softness = settings.softness;
  if (typeof settings.pixelSize === 'number' && !new URLSearchParams(location.search).has('px')) pipeline.pixelSize = settings.pixelSize;
  if (typeof settings.outline === 'number') pipeline.outline = settings.outline;
  if (typeof settings.sound === 'boolean') sound.enabled = settings.sound;
}
if (CONFIG.mute) sound.enabled = false;
const saveSettings = () =>
  store.set(SETTINGS_KEY, { softness: pipeline.softness, pixelSize: pipeline.pixelSize, outline: pipeline.outline, sound: sound.enabled });

// ── Sound hooks ────────────────────────────────────────────────────────────
const _ground = { h: 0, path: 0, forest: 0 };
function groundHere() {
  const { x, z } = player.pos;
  if (!chunks.groundAt(x, z, _ground)) {
    _ground.path = gen.pathMask(x, z);
    _ground.forest = gen.forest(x, z);
  }
  return _ground;
}
function surfaceHere() {
  const g = groundHere();
  if (g.path > 0.45) return 'dirt';
  return g.forest > 0.62 ? 'litter' : 'grass';
}
player.character.onFootstep = (run) => sound.footstep(surfaceHere(), run);
player.onJump = () => sound.footstep(surfaceHere(), 0.5, 'jump');
player.onLand = (s) => sound.footstep(surfaceHere(), 1, 'land', s);
function toggleSound() {
  sound.setEnabled(!sound.enabled);
  hud.setSound(sound.enabled);
  hud.flash(sound.enabled ? 'sound on' : 'sound off');
  saveSettings();
}
hud.setSound(sound.enabled);
hud.onSoundToggle = toggleSound;

function resize() {
  const dpr = renderer.getPixelRatio();
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  pipeline.setSize(Math.floor(innerWidth * dpr), Math.floor(innerHeight * dpr));
}
addEventListener('resize', resize);
resize();

// ── Spawn ──────────────────────────────────────────────────────────────────
const saved = store.get(SAVE_KEY);
const start = gen.findSpawn(0, 0);
let spawn = start;
if (saved && saved.seed === CONFIG.seed && !CONFIG.reset) {
  spawn = saved;
  if (typeof saved.hours === 'number' && !new URLSearchParams(location.search).has('time')) sky.hours = saved.hours;
}

let timeFlows = false;
let last = performance.now();
let saveTimer = 0;
let fpsAcc = 0;
let fpsFrames = 0;
let fps = 0;
let showDebug = CONFIG.debug;

async function boot() {
  const bar = document.getElementById('load-bar');
  const label = document.getElementById('load-label');
  const frame = () => new Promise((r) => requestAnimationFrame(r));
  await frame();
  // Stream the forest in with a progress bar so the page never freezes.
  do {
    chunks.update(spawn.x, spawn.z, 45);
    const p = chunks.progress();
    bar.style.width = `${Math.round(p * 90)}%`;
    label.textContent = p < 1 ? 'growing the forest…' : 'laying down the grass…';
    await frame();
  } while (!chunks.isFullyLoaded());
  for (let i = 0; i < 6; i++) {
    grass.update(spawn.x, spawn.z, 40);
    await frame();
  }
  bar.style.width = '100%';
  player.spawn(spawn.x, spawn.z, spawn.yaw ?? 0, spawn.camYaw);
  if (typeof spawn.camPitch === 'number') player.camPitch = spawn.camPitch;
  document.getElementById('loader').classList.add('gone');
  last = performance.now();
  requestAnimationFrame(loop);
}

function handleKeys() {
  if (input.wasPressed('KeyH') || input.wasPressed('Slash')) hud.toggleHelp();
  if (input.wasPressed('KeyP')) {
    pipeline.enabled = !pipeline.enabled;
    pipeline.lowW = 0;
    resize();
    hud.flash(pipeline.enabled ? 'pixel art on' : 'pixel art off');
  }
  if (input.wasPressed('BracketLeft') || input.wasPressed('BracketRight')) {
    const cur = pipeline.pixelSize > 0 ? pipeline.pixelSize : Math.round(pipeline.currentPixelSize());
    const next = THREE.MathUtils.clamp(cur + (input.wasPressed('BracketRight') ? 1 : -1), 1, 12);
    pipeline.setPixelSize(next);
    hud.flash(`pixel size ${next}`);
    saveSettings();
  }
  if (input.wasPressed('Minus') || input.wasPressed('Equal')) {
    pipeline.softness = THREE.MathUtils.clamp(pipeline.softness + (input.wasPressed('Equal') ? 0.1 : -0.1), 0, 1);
    hud.flash(`softness ${pipeline.softness.toFixed(1)}`);
    saveSettings();
  }
  if (input.wasPressed('KeyO')) {
    pipeline.outline = pipeline.outline > 0 ? 0 : CONFIG.outline;
    hud.flash(pipeline.outline > 0 ? 'outlines on' : 'outlines off');
    saveSettings();
  }
  if (input.wasPressed('KeyT')) {
    timeFlows = !timeFlows;
    hud.flash(timeFlows ? 'time flows' : 'time paused');
  }
  if (input.wasPressed('KeyR')) {
    player.spawn(start.x, start.z, start.yaw);
    hud.flash('back to the start');
  }
  if (input.wasPressed('KeyF')) {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
    else document.exitFullscreen?.();
  }
  if (input.wasPressed('KeyV')) showDebug = !showDebug;
  if (input.wasPressed('KeyM')) toggleSound();
}

function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  renderer.info.reset();
  handleKeys();
  if (input.down('Comma')) sky.hours -= dt * 2;
  if (input.down('Period')) sky.hours += dt * 2;
  if (timeFlows) sky.hours += dt * (24 / 1440); // a full day in 24 minutes
  sky.hours = ((sky.hours % 24) + 24) % 24;

  SHARED.uTime.value = now / 1000;
  SHARED.uWind.value = 0.85 + Math.sin(now / 9000) * 0.25;

  player.update(dt);
  if (player.hasMoved) hud.hideHint();
  SHARED.uPlayer.value.copy(player.pos);

  chunks.update(player.pos.x, player.pos.z, 5);
  grass.update(player.pos.x, player.pos.z, 3);
  sky.update(player.pos, camera.position);
  particles.update(player.pos, player.pos.y);
  sound.update(dt, {
    hours: sky.hours,
    night: SKY.uNight.value,
    forest: groundHere().forest,
    height: player.pos.y,
    wind: SHARED.uWind.value,
    camera,
  });

  pipeline.render(scene, camera, sky.exposure);
  input.endFrame();

  hud.update(player.pos, player.camYaw, sky.hours);
  fpsAcc += dt;
  fpsFrames++;
  if (fpsAcc > 0.5) {
    fps = Math.round(fpsFrames / fpsAcc);
    fpsAcc = 0;
    fpsFrames = 0;
    if (showDebug) {
      const s = chunks.stats();
      const info = renderer.info.render;
      hud.setDebug(
        `${fps} fps · ${pipeline.lowW}×${pipeline.lowH} · ${s.chunks} chunks · ${s.instances} plants · ${grass.tiles.size} grass tiles · ${info.calls} calls · ${(info.triangles / 1000).toFixed(0)}k tris`,
      );
    } else hud.setDebug('');
  }

  saveTimer += dt;
  if (saveTimer > 2) {
    saveTimer = 0;
    store.set(SAVE_KEY, {
      seed: CONFIG.seed,
      x: player.pos.x,
      z: player.pos.z,
      yaw: player.yaw,
      camYaw: player.camYaw,
      camPitch: player.camPitch,
      hours: sky.hours,
    });
  }
  requestAnimationFrame(loop);
}

// Handy from the dev console: world.teleport(120, -40)
window.world = {
  gen,
  sound,
  chunks,
  player,
  sky,
  pipeline,
  renderer,
  // Resolves once the destination has streamed in.
  async teleport(x, z, yaw = player.yaw) {
    player.spawn(x, z, yaw, yaw + Math.PI);
    const frame = () => new Promise((r) => requestAnimationFrame(r));
    do await frame();
    while (!chunks.isFullyLoaded());
    for (let i = 0; i < 4; i++) {
      grass.update(x, z, Infinity);
      await frame();
    }
    player.spawn(x, z, yaw, yaw + Math.PI);
  },
  look(yaw, pitch, dist) {
    player.camYaw = yaw;
    if (pitch !== undefined) player.camPitch = pitch;
    if (dist !== undefined) player.camDist = player.camDistSmooth = dist;
  },
  stats() {
    const i = renderer.info.render;
    return { calls: i.calls, tris: i.triangles, ...chunks.stats(), grassTiles: grass.tiles.size, low: [pipeline.lowW, pipeline.lowH] };
  },
};

boot();
