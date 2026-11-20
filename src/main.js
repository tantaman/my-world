import * as THREE from 'three';
import { CONFIG } from './config.js';
import { WorldGen } from './world/worldgen.js';
import { ChunkManager } from './world/chunks.js';
import { Grass } from './world/grass.js';
import { Sky, SKY } from './world/sky.js';
import { createParticles } from './world/particles.js';
import { SHARED, createTerrainMaterial, createVegetationMaterial, createGrassMaterial } from './world/materials.js';
import { createWaterMaterial, WADE } from './world/waterSurface.js';
import { makePine, makeBroadleaf, makeBirch, makeBush, makeFern, makeRock, makeLog } from './world/models.js';
import { PixelPipeline } from './render/pixelPipeline.js';
import { Input } from './player/input.js';
import { Player, standHeight } from './player/player.js';
import { Hud } from './ui/hud.js';
import { Soundscape } from './audio/soundscape.js';
import { STRUCTURES } from './structures/index.js';
import { placeStructures } from './structures/loader.js';
import { MarkStore } from './map/marks.js';
import { MapView } from './map/mapView.js';
import { Markers } from './world/markers.js';
import { Peers } from './world/peers.js';
import { Builder } from './build/builder.js';
import { WorldSave } from './save/worldSave.js';
import { SharePanel } from './save/sharePanel.js';
import { spawnFrom } from './save/snapshot.js';
import { Wildlife } from './wildlife/wildlife.js';

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

// ── A world off the server ─────────────────────────────────────────────────
// ?w=<id> opens a saved world. Its seed lives inside the save, so this has to
// resolve before the forest is grown from it. If it can't be opened we fall
// through to an ordinary local world, and worldSave says why.
const params = new URLSearchParams(location.search);
const worldSave = new WorldSave();
if (params.has('w')) document.getElementById('load-label').textContent = 'opening your world…';
const opened = await worldSave.open();
if (opened) CONFIG.seed = opened.snapshot.seed;

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
  water: createWaterMaterial(),
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
// Felling, digging and building. Created before the first chunk streams in so
// your changes to the world are applied as it loads.
// A world with an address of its own is kept by the save server, so the
// builder's per-seed local copy stands down in favour of worldSave's cache.
const builder = new Builder({
  scene, camera, gen, chunks, grass, player, input, hud, sound,
  ...(opened ? { storeKey: null, snapshot: opened.snapshot.world } : {}),
});
input.bindButton(document.getElementById('act-use'), 'use');
input.bindButton(document.getElementById('act-alt'), 'alt');

// ── Map + marks ────────────────────────────────────────────────────────────
// Marks are kept per seed and survive ?reset: they're things you made.
const marks = opened ? new MarkStore(CONFIG.seed, { key: null, data: opened.snapshot.marks }) : new MarkStore(CONFIG.seed);
const markers = new Markers(scene, (x, z) => chunks.heightAt(x, z));
markers.sync(marks.list());
marks.subscribe(() => markers.sync(marks.list()));
const map = new MapView({ seed: CONFIG.seed, structures: STRUCTURES, marks, player, input });

// ── Saving, and everyone else in this world ────────────────────────────────
// (someone swimming floats, just as you do)
const peers = new Peers(scene, (x, z) => standHeight(chunks, x, z));

// ── Animals ────────────────────────────────────────────────────────────────
// Never saved or shared: each visitor meets their own.
const wildlife = new Wildlife({ scene, gen, chunks, player, peers, sound, camera, hud });
worldSave.attach({ gen, builder, marks, player, sky, peers, me: '' });
const share = new SharePanel({ save: worldSave, input, hud });
hud.onSaveToggle = () => share.toggle();
const openMap = () => {
  share.close();
  map.toggle();
};
hud.onMapToggle = openMap;

const settings = store.get(SETTINGS_KEY);
if (settings && !CONFIG.reset) {
  if (typeof settings.softness === 'number' && !params.has('soft')) pipeline.softness = settings.softness;
  if (typeof settings.pixelSize === 'number' && !params.has('px')) pipeline.pixelSize = settings.pixelSize;
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
  if (player.wade > 0.04) return 'water';
  const g = groundHere();
  if (g.path > 0.45) return 'dirt';
  return g.forest > 0.62 ? 'litter' : 'grass';
}
player.character.onFootstep = (run) => sound.footstep(surfaceHere(), run, player.swimming ? 'swim' : 'step', player.wade);
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
const start = gen.findSpawn(0, 0);
let spawn = start;
if (opened) {
  spawn = spawnFrom(opened.snapshot, start);
  if (opened.snapshot.hours !== null && !params.has('time')) sky.hours = opened.snapshot.hours;
} else {
  const saved = store.get(SAVE_KEY);
  if (saved && saved.seed === CONFIG.seed && !CONFIG.reset) {
    spawn = saved;
    if (typeof saved.hours === 'number' && !params.has('time')) sky.hours = saved.hours;
  }
}

let timeFlows = false;
let last = performance.now();
let saveTimer = 0;
let fpsAcc = 0;
let fpsFrames = 0;
let fps = 0;
let showDebug = CONFIG.debug;
let prefetchAt = null; // where the map last pre-rendered around
let prefetchCheck = 0; // wall-clock ms of the next check
const waterNear = { run: 0, foam: 0, rx: 0, ry: 0, rz: 0, still: 0, sx: 0, sy: 0, sz: 0 }; // for the soundscape
let waterCheck = 0; // wall-clock ms of the next look round for water

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
  // Anything worth knowing about how this world opened.
  if (opened && opened.recovered) hud.flash('picked up where you left off');
  else if (opened && opened.offline) hud.flash("opened this browser's copy · the save server is out of reach");
  else if (worldSave.detail) hud.flash(worldSave.detail);
  last = performance.now();
  prefetchCheck = last + 3000; // let the forest settle first
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
  if (input.wasPressed('KeyN')) toggleSound();
  if (input.wasPressed('KeyM')) {
    share.close();
    map.open();
  }
  if (input.wasPressed('KeyL')) share.toggle();
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
  builder.update(dt);
  if (player.hasMoved) hud.hideHint();
  SHARED.uPlayer.value.copy(player.pos);
  // ripples and froth around your legs, more when you're moving
  const wadeTo = player.wade > 0.02 ? Math.min(1, player.wade * 3) * (0.35 + 0.65 * Math.min(1, Math.hypot(player.vel.x, player.vel.z) / 2)) : 0;
  WADE.uWade.value += (wadeTo - WADE.uWade.value) * (1 - Math.exp(-dt * 4));

  chunks.update(player.pos.x, player.pos.z, 5);
  grass.update(player.pos.x, player.pos.z, 3);
  sky.update(player.pos, camera.position);
  particles.update(player.pos, player.pos.y);
  markers.update(now / 1000, SHARED.uWind.value, player.pos);
  peers.update(dt);
  wildlife.update(dt, { hours: sky.hours, night: SKY.uNight.value });
  if (now > waterCheck) {
    waterCheck = now + 250;
    chunks.waterAround(player.pos.x, player.pos.z, 45, waterNear);
  }
  sound.update(dt, {
    hours: sky.hours,
    night: SKY.uNight.value,
    forest: groundHere().forest,
    height: player.pos.y,
    wind: SHARED.uWind.value,
    camera,
    water: waterNear,
  });

  // The map covers the view, so skip drawing the world under it.
  if (map.isOpen) map.update(dt);
  else pipeline.render(scene, camera, sky.exposure);
  if (now > prefetchCheck && !map.isOpen) {
    prefetchCheck = now + 2000;
    if (!prefetchAt || Math.hypot(player.pos.x - prefetchAt.x, player.pos.z - prefetchAt.z) > 120) {
      prefetchAt = { x: player.pos.x, z: player.pos.z };
      map.prefetch(prefetchAt.x, prefetchAt.z);
    }
  }
  input.endFrame();

  hud.update(player.pos, player.camYaw, sky.hours);
  hud.updateTrack(marks.trackedMark(), player.pos, player.camYaw);
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

  // A world on the server sends what you change within a moment, and tells
  // everyone else in it where you are standing.
  worldSave.tick();
  saveTimer += dt;
  if (saveTimer > 2) {
    saveTimer = 0;
    if (!worldSave.online) {
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
  }
  requestAnimationFrame(loop);
}

// Handy from the dev console: world.teleport(120, -40)
window.world = {
  gen,
  builder,
  save: worldSave,
  peers,
  sound,
  wildlife,
  marks,
  map,
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
