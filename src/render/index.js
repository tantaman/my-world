// The picture: renderer, scene, camera and the pipeline that turns a drawn
// scene into the picture (pipeline.js), and the settings that change how it
// looks.
//
// The scene is in world coordinates, and so is everything the game does with
// it. Only while a frame is being drawn is it slid to sit round an origin
// near the camera, so the graphics card is never handed a big number
// (origin.js, which says what that asks of anything that draws).

import * as THREE from 'three';
import { CONFIG, urlHas } from '../config.js';
import { Pipeline } from './pipeline.js';
import { Origin } from './origin.js';
import { SHARED, DECK } from './uniforms.js';
import { PERIOD } from './glsl.js';

const PIXEL_MAX = 12; // screen pixels per art pixel, at the most

// The features this uses, so it is installed after them (game/features.js).
export const after = ['ui'];
export function installRender(game) {
  const { settings, hud } = game;

  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.info.autoReset = false; // counted per frame, across every pass (see debug)
  document.getElementById('app').appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 1200);
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
    set(on) {
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
    set(v) {
      pipeline.setPixelSize(v);
      settings.set('pixelSize', pipeline.pixelSize);
    },
    show: (v) => (v > 0 ? `${v}` : `fitted (${Math.round(pipeline.currentPixelSize())})`),
  });
  hud.setting({
    id: 'pixel-softness',
    group: 'PICTURE',
    label: 'pixel softness',
    min: 0,
    max: 1,
    step: 0.05,
    get: () => pipeline.softness,
    set(v) {
      pipeline.softness = v;
      settings.set('softness', v);
    },
    show: (v) => v.toFixed(2),
  });
  hud.setting({
    id: 'outlines',
    group: 'PICTURE',
    label: 'outlines',
    get: () => pipeline.outline > 0,
    set(on) {
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
    set(on) {
      if (on) document.documentElement.requestFullscreen?.().catch(() => {});
      else document.exitFullscreen?.();
    },
  });

  game.addSystem({
    name: 'render',
    phase: 'render',
    update({ dt }) {
      renderer.info.reset();
      // Something (the map) may be covering the whole view.
      if (game.covered) return;
      origin.follow(camera.position.x, camera.position.z);
      origin.wrapped(PERIOD, SHARED.uOrigin.value);
      origin.begin(scene, camera);
      try {
        pipeline.render(scene, camera, game.sky ? game.sky.exposure : 1, game.sky ? game.sky.open : 1, dt);
      } finally {
        origin.end(scene, camera);
      }
    },
  });
}
