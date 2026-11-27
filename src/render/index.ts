// The picture: renderer, scene, camera and the pipeline that turns a drawn
// scene into the picture (pipeline.js), and the settings that change how it
// looks.
//
// The scene is in world coordinates, and so is everything the game does with
// it. Only while a frame is being drawn is it slid to sit round an origin
// near the camera, so the graphics card is never handed a big number
// (origin.js, which says what that asks of anything that draws).

import * as THREE from 'three';
import type { Game } from '../game/game.ts';
import { CONFIG, urlHas } from '../config.js';
import { Pipeline } from './pipeline.js';
import type { Lights } from './lights.js';
import type { Casters } from './casters.ts';
import { Origin } from './origin.js';
import { Views } from './views.ts';
import { SHARED, DECK } from './uniforms.js';
import { PERIOD } from './glsl.js';

// What this provides, for the features that come after it: the renderer, the
// scene and the camera you see it through, the pipeline that makes the
// picture, the lights things give off and what is drawn into their shadows
// (casters.ts), the origin it is drawn from, and the views the screen can be
// split into (views.ts).
declare module '../game/game.ts' {
  interface Services {
    renderer: THREE.WebGLRenderer;
    origin: Origin;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    pipeline: Pipeline;
    lights: Lights;
    casters: Casters;
    views: Views;
  }
}

const PIXEL_MAX = 12; // screen pixels per art pixel, at the most
const CAMERA_FAR = 1200;
// m: the furthest the land is drawn for a view (a hike's far view reaches
// about 4.6 km): the camera sees as far as that. Past it, a fog that far off
// is someone turning the fog off (the Metro, a stage), not a view.
const LONG_VIEW_MOST = 8000;

// The features this uses, so it is installed after them (game/features.js).
export const after = ['ui'];
export function installRender(game: Game) {
  const { settings, hud } = game;

  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.info.autoReset = false; // counted per frame, across every pass (see debug)
  document.getElementById('app')!.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, CAMERA_FAR);
  const pipeline = new Pipeline(renderer);
  const origin = new Origin();
  origin.place(SHARED.uPlayer);
  origin.place(DECK.uDeckMid);

  game.provide('renderer', renderer);
  game.provide('origin', origin);
  game.provide('scene', scene);
  game.provide('camera', camera);
  game.provide('pipeline', pipeline);
  // light given off by things (a fire, lava): lights.js
  game.provide('lights', pipeline.lights);
  // meshes of instances whose shadows are drawn from just what each light reaches: casters.ts
  game.provide('casters', pipeline.casters);
  // the screen split between cameras (views.ts): none until someone splits it
  const views = new Views(renderer, pipeline, camera);
  game.provide('views', views);

  // What the visitor chose last time, unless the address bar says otherwise.
  const soft = settings.get('softness', 'number');
  const px = settings.get('pixelSize', 'number');
  const outline = settings.get('outline', 'number');
  const pixelArt = settings.get('pixelArt', 'boolean');
  if (pixelArt !== undefined && !urlHas('pixel')) pipeline.enabled = pixelArt;
  if (soft !== undefined && !urlHas('soft')) pipeline.softness = soft;
  if (px !== undefined && !urlHas('px')) pipeline.pixelSize = px;
  if (outline !== undefined) pipeline.outline = outline;

  function resize() {
    const dpr = renderer.getPixelRatio();
    renderer.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    pipeline.setSize(Math.floor(innerWidth * dpr), Math.floor(innerHeight * dpr));
  }
  addEventListener('resize', resize);
  resize();

  // ── Settings ──────────────────────────────────────────────────────────────
  hud.setting({
    id: 'pixel-art',
    group: 'PICTURE',
    label: 'pixel art',
    get: () => pipeline.enabled,
    set(on: boolean) {
      pipeline.enabled = on;
      pipeline.lowW = 0;
      settings.set('pixelArt', on);
      resize();
    },
  });
  hud.setting({
    id: 'pixel-size',
    group: 'PICTURE',
    label: 'pixel size',
    min: 0, // fitted to the screen
    max: PIXEL_MAX,
    step: 1,
    get: () => pipeline.pixelSize,
    set(v: number) {
      pipeline.setPixelSize(v);
      settings.set('pixelSize', pipeline.pixelSize);
    },
    show: (v: number) => (v > 0 ? `${v}` : `fitted (${Math.round(pipeline.currentPixelSize())})`),
  });
  hud.setting({
    id: 'pixel-softness',
    group: 'PICTURE',
    label: 'pixel softness',
    min: 0,
    max: 1,
    step: 0.05,
    get: () => pipeline.softness,
    set(v: number) {
      pipeline.softness = v;
      settings.set('softness', v);
    },
    show: (v: number) => v.toFixed(2),
  });
  hud.setting({
    id: 'outlines',
    group: 'PICTURE',
    label: 'outlines',
    get: () => pipeline.outline > 0,
    set(on: boolean) {
      pipeline.outline = on ? CONFIG.outline : 0;
      settings.set('outline', pipeline.outline);
    },
  });
  hud.setting({
    id: 'fullscreen',
    group: 'PICTURE',
    label: 'fullscreen',
    can: () => !!document.fullscreenEnabled,
    get: () => !!document.fullscreenElement,
    set(on: boolean) {
      if (on) document.documentElement.requestFullscreen?.().catch(() => {});
      else document.exitFullscreen?.();
    },
  });

  // The scene from a camera, through a pipeline: drawn from an origin near
  // the camera (origin.js).
  function draw(through: Pipeline, eye: THREE.PerspectiveCamera, dt: number) {
    const longView = eye.far === CAMERA_FAR && through.fogFar > 1000 && through.fogFar <= LONG_VIEW_MOST;
    if (longView) {
      eye.far = Math.max(2400, through.fogFar * 1.5);
      eye.updateProjectionMatrix();
    }
    origin.follow(eye.position.x, eye.position.z);
    origin.wrapped(PERIOD, SHARED.uOrigin.value);
    origin.begin(scene, eye);
    try {
      through.render(scene, eye, game.sky ? game.sky.exposure : 1, game.sky ? game.sky.open : 1, dt);
    } finally {
      origin.end(scene, eye);
      if (longView) {
        eye.far = CAMERA_FAR;
        eye.updateProjectionMatrix();
      }
    }
  }

  game.addSystem({
    name: 'render',
    phase: 'render',
    update({ dt }) {
      renderer.info.reset();
      // Something (the map) may be covering the whole view, and is drawn
      // over all of it; or the screen is split between several cameras.
      if (!game.covered && views.split) return views.draw((through, eye) => draw(through, eye, dt));
      views.whole();
      if (!game.covered) draw(pipeline, camera, dt);
    },
  });
}
