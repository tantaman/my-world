// The remake's page: renderer, scene, the loop.
//
// Everything in the scene is made by a create(ctx) that returns
// { object, update(t) }; update reads t and nothing else it did not make
// itself. See PLAN.md section 6.
import { WebGPURenderer, Scene, PerspectiveCamera, NoToneMapping, PCFShadowMap, MathUtils, Vector3 } from 'three/webgpu';
import { params, has } from './params.js';
import { createClock, LENGTH, T, emi, ramp, clamp } from './timeline.js';
import { cameraAt } from './camera/path.js';
import { handheldAt } from './camera/handheld.js';
import { createPipeline } from './post/pipeline.js';
import { createHud } from './hud/hud.js';
import { createScatterLights, fogUniforms } from './weather/fog.js';
import { buildWorld } from './world.js';

const started = performance.now();
const stage = document.getElementById('stage');
const title = document.getElementById('title');
const statsEl = document.getElementById('stats');

const renderer = new WebGPURenderer({ antialias: false, trackTimestamp: params.stats, forceWebGL: params.webgl });
await renderer.init();
renderer.toneMapping = NoToneMapping;
renderer.shadowMap.enabled = has('shadows');
renderer.shadowMap.type = PCFShadowMap;
stage.prepend(renderer.domElement);

const scene = new Scene();
const camera = new PerspectiveCamera(95, 4 / 3, 0.1, 3000);
camera.layers.enable(1);   // layer 1: things the mirror in the ground leaves out (rain)
scene.add(camera);

const scatterLights = createScatterLights();
const world = await buildWorld({ scene, camera, renderer, scatterLights, params, has });

const post = createPipeline(renderer, scene, camera, {
  raw: params.raw, scatterLights, fogDensity: fogUniforms.density, has,
});

const hud = params.raw ? null : createHud(document.getElementById('hud'), stage);
if (params.raw) document.getElementById('hud').remove();

if (params.ref) {
  const img = document.getElementById('ref');
  img.src = `./reference/stills/${params.ref}.jpg`;
  img.style.display = 'block';
}

// Size: the stage's pixels, times ?scale.
let lastW = 0;
let lastH = 0;
function resize() {
  const w = Math.max(64, Math.round(stage.clientWidth * devicePixelRatio * params.scale));
  const h = Math.round((w * 3) / 4);
  if (w === lastW && h === lastH) return;
  renderer.setPixelRatio(1);
  renderer.setSize(w, h, false);
  lastW = w;
  lastH = h;
}

const clock = createClock(params.t);
let audio = null;
if (params.t != null || params.mute) {
  title.remove();
  if (params.t == null) clock.start(null);
} else {
  title.addEventListener('click', async () => {
    title.remove();
    if (!params.mute) {
      const { createMix } = await import('./audio/mix.js');
      audio = await createMix();
      clock.start(audio.ctx);
    } else clock.start(null);
  }, { once: true });
}

// The camera: path, then the hand holding it, or flown by hand with ?free.
const view = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, fov: 95 };
const hand = { up: 0, side: 0, yaw: 0, pitch: 0, roll: 0 };
const _dir = new Vector3();
const _right = new Vector3();
let freeSeeded = false;
const free = params.free ? (await import('./camera/free.js')).createFree(renderer.domElement, view) : null;

function placeCamera(t) {
  if (!free || !freeSeeded) { cameraAt(t, view); freeSeeded = true; }
  if (free) free.update(view);
  handheldAt(t, hand);
  const yaw = MathUtils.degToRad(view.yaw + hand.yaw);
  const pitch = MathUtils.degToRad(view.pitch + hand.pitch);
  _dir.set(Math.cos(pitch) * Math.cos(yaw), Math.sin(pitch), Math.cos(pitch) * Math.sin(yaw));
  _right.set(-Math.sin(yaw), 0, Math.cos(yaw));
  camera.position.set(view.x, view.y + hand.up, view.z).addScaledVector(_right, hand.side);
  camera.up.set(0, 1, 0);
  camera.lookAt(camera.position.x + _dir.x, camera.position.y + _dir.y, camera.position.z + _dir.z);
  camera.rotateZ(MathUtils.degToRad(hand.roll));
  camera.fov = view.fov * FOV_SCALE;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
}
// The overlay's FOV against what three.js is told: fitted with the lens warp.
const FOV_SCALE = 1.0;

// Frames drawn at a fixed time before a still is taken: pipelines compile
// in the background in the first few.
const STILL_FRAMES = 3;
let frames = 0;
let lastFrameMs = performance.now();
let frameMs = 16;

renderer.setAnimationLoop(() => {
  resize();
  const t = clock.now();
  placeCamera(t);
  world.update(t);
  const g = params.raw ? 0 : clamp((t - T.glitch[0]) / (T.glitch[1] - T.glitch[0]));
  const black = params.raw ? 0 : ramp(t, T.glitch[0] + 0.25, T.black);
  post.update(t, { emi: params.raw ? 0 : emi(t), glitch: t >= T.glitch[0] && t < LENGTH ? Math.max(g, 0.001) : 0, black });
  post.render();
  if (hud) {
    const levels = audio ? audio.levels() : [0.25 + 0.05 * Math.sin(t * 7), 0.22 + 0.05 * Math.sin(t * 5.3)];
    const hudFade = t > T.black ? 1 - ramp(t, LENGTH - 0.2, LENGTH) : 1;
    hud.update(t, renderer.domElement.height, view.fov, levels[0], levels[1], hudFade);
  }
  const now = performance.now();
  frameMs = frameMs * 0.9 + (now - lastFrameMs) * 0.1;
  lastFrameMs = now;
  frames++;
  if (frames === 1) console.info(`first frame drawn ${(performance.now() - started).toFixed(0)} ms after start`);
  if (params.stats && frames % 15 === 0) {
    const info = renderer.info;
    statsEl.style.display = 'block';
    statsEl.textContent = `t ${t.toFixed(2)}  ${frameMs.toFixed(1)} ms  ${(1000 / frameMs).toFixed(0)} fps\n` +
      `draws ${info.render.drawCalls}  tris ${(info.render.triangles / 1e6).toFixed(2)}M\n` +
      `${renderer.domElement.width}x${renderer.domElement.height}`;
  }
  if (params.still && frames === STILL_FRAMES) {
    window.__ready = true;
    renderer.setAnimationLoop(null);
  }
});
window.__frames = () => frames;
// For poking at from the console.
window.__abduction = { scene, camera, renderer, world, post };
