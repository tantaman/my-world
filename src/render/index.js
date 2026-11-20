// The picture: renderer, scene, camera and the pixel pipeline, and the keys
// that change how it looks.

import * as THREE from 'three';
import { CONFIG, urlHas } from '../config.js';
import { PixelPipeline } from './pixelPipeline.js';

export function installRender(game) {
  const { settings, commands } = game;

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
  const pipeline = new PixelPipeline(renderer);

  game.provide('renderer', renderer);
  game.provide('scene', scene);
  game.provide('camera', camera);
  game.provide('pipeline', pipeline);

  // What the visitor chose last time, unless the address bar says otherwise.
  const soft = settings.get('softness', 'number');
  const px = settings.get('pixelSize', 'number');
  const outline = settings.get('outline', 'number');
  const pixelArt = settings.get('pixelArt', 'boolean');
  if (soft !== undefined && !urlHas('soft')) pipeline.softness = soft;
  if (px !== undefined && !urlHas('px')) pipeline.pixelSize = px;
  if (outline !== undefined) pipeline.outline = outline;
  if (pixelArt !== undefined && !urlHas('pixels')) pipeline.enabled = pixelArt;

  function resize() {
    const dpr = renderer.getPixelRatio();
    renderer.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    pipeline.setSize(Math.floor(innerWidth * dpr), Math.floor(innerHeight * dpr));
  }
  addEventListener('resize', resize);
  resize();

  const say = (msg) => game.hud && game.hud.flash(msg);
  // for a pair of keys bound to one command: which way did it go?
  const step = (up) => (game.input.wasPressed(up) ? 1 : -1);

  commands.add({
    id: 'pixel-art',
    keys: ['KeyP'],
    group: 'LOOK',
    label: 'pixel art on / off',
    run() {
      pipeline.enabled = !pipeline.enabled;
      pipeline.lowW = 0;
      resize();
      say(pipeline.enabled ? 'pixel art on' : 'pixel art off');
      settings.set('pixelArt', pipeline.enabled);
    },
  });
  commands.add({
    id: 'pixel-size',
    keys: ['BracketLeft', 'BracketRight'],
    group: 'LOOK',
    label: 'pixel size',
    run() {
      const cur = pipeline.pixelSize > 0 ? pipeline.pixelSize : Math.round(pipeline.currentPixelSize());
      const next = THREE.MathUtils.clamp(cur + step('BracketRight'), 1, 12);
      pipeline.setPixelSize(next);
      say(`pixel size ${next}`);
      settings.set('pixelSize', pipeline.pixelSize);
    },
  });
  commands.add({
    id: 'pixel-softness',
    keys: ['Minus', 'Equal'],
    group: 'LOOK',
    label: 'pixel softness',
    run() {
      pipeline.softness = THREE.MathUtils.clamp(pipeline.softness + step('Equal') * 0.1, 0, 1);
      say(`softness ${pipeline.softness.toFixed(1)}`);
      settings.set('softness', pipeline.softness);
    },
  });
  commands.add({
    id: 'outlines',
    keys: ['KeyO'],
    group: 'LOOK',
    label: 'outlines',
    run() {
      pipeline.outline = pipeline.outline > 0 ? 0 : CONFIG.outline;
      say(pipeline.outline > 0 ? 'outlines on' : 'outlines off');
      settings.set('outline', pipeline.outline);
    },
  });
  commands.add({
    id: 'fullscreen',
    keys: ['KeyF'],
    group: 'LOOK',
    label: 'fullscreen',
    run() {
      if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
      else document.exitFullscreen?.();
    },
  });

  game.addSystem({
    name: 'render',
    phase: 'render',
    update() {
      renderer.info.reset();
      // Something (the map) may be covering the whole view.
      if (!game.covered) pipeline.render(scene, camera, game.sky ? game.sky.exposure : 1);
    },
  });
}
