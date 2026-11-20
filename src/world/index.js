// The world itself: the land a seed grows, what grows on it, the sky over it
// and the hour of the day. Everything here is the same for anyone with the
// same seed; what people *change* is layered on by other features.

import * as THREE from 'three';
import { CONFIG, urlHas } from '../config.js';
import { growWorld } from './lands.js';
import { ChunkManager } from './chunks.js';
import { Grass } from './grass.js';
import { Sky } from './sky.js';
import { Solids } from './solids.js';
import { Spaces } from './spaces.js';
import { createParticles } from './particles.js';
import { createTerrainMaterial, createTerrainDepthMaterial, createVegetationMaterial, createGrassMaterial } from './materials.js';
import { SHARED } from '../render/uniforms.js';
import { createWaterMaterial } from './waterSurface.js';
import { makePine, makeBroadleaf, makeBirch, makeBush, makeFern, makeRock, makeLog } from './models.js';
import { STRUCTURES } from '../structures/index.js';
import { placeStructures } from '../structures/loader.js';
import { HIKES } from './hikes.js';
import { Lands } from './landforms.js';

const DAY_MINUTES = 24; // how long a full day takes when time flows
const wrapHours = (h) => ((h % 24) + 24) % 24;

// The features this uses, so it is installed after them (game/features.js).
export const after = ['render'];
export function installWorld(game) {
  const { scene, camera, commands, save } = game;

  // The forest a seed grows on its land. The real hikes are set into it as
  // their land arrives, which it does the first time something near one is
  // grown.
  const lands = new Lands(HIKES);
  const gen = growWorld(CONFIG.seed, STRUCTURES, CONFIG.land);
  const materials = {
    terrain: createTerrainMaterial(),
    terrainShadow: createTerrainDepthMaterial(),
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
  const chunks = new ChunkManager(scene, gen, materials, models, STRUCTURES, { ready: (x0, z0, x1, z1) => lands.ready(x0, z0, x1, z1) });
  lands.on('land', (def) => {
    gen.addHike(def);
    chunks.addHike(def);
  });
  const grass = new Grass(scene, chunks, materials.grass, CONFIG.seed);
  const sky = new Sky(scene);
  const particles = createParticles();
  scene.add(particles.object);
  placeStructures(scene, STRUCTURES, gen, materials);
  SHARED.uGrassRadius.value = CONFIG.grassRadius;

  game.provide('gen', gen);
  game.provide('chunks', chunks);
  game.provide('grass', grass);
  game.provide('sky', sky);
  game.provide('materials', materials);
  game.provide('structures', STRUCTURES);
  game.provide('lands', lands);
  // Built things you bump into and stand on. Whoever builds, writes to it.
  game.provide('solids', new Solids());
  // Places under the ground you can be in (caves). Whoever makes one, adds it.
  game.provide('spaces', new Spaces());
  // What the world streams in around: a point that whoever is being followed
  // keeps up to date (the player feature copies the hiker's position into it).
  game.provide('focus', new THREE.Vector3());

  // ── The hour ──────────────────────────────────────────────────────────────
  let flows = false;
  const say = (msg) => game.hud && game.hud.flash(msg);
  commands.add({
    id: 'time-scrub',
    keys: ['Comma', 'Period'],
    group: 'LOOK',
    label: 'time of day',
    hold: (dt, key) => {
      sky.hours = wrapHours(sky.hours + (key === 'Period' ? 1 : -1) * dt * 2);
    },
  });
  commands.add({
    id: 'time-flow',
    keys: ['KeyT'],
    group: 'LOOK',
    label: 'let time flow',
    run() {
      flows = !flows;
      say(flows ? 'time flows' : 'time paused');
    },
  });
  // The hour you left it at is yours, not the world's: two people in one
  // world can each have their own afternoon.
  save.register({
    id: 'hours',
    scope: 'yours',
    local: 'state',
    collect: () => Math.round(sky.hours * 1000) / 1000,
    restore: (h) => {
      if (Number.isFinite(h) && !urlHas('time')) sky.hours = h;
    },
  });

  game.addSystem({
    name: 'clock',
    phase: 'input',
    update({ dt, now }) {
      if (flows) sky.hours = wrapHours(sky.hours + dt * (24 / (DAY_MINUTES * 60)));
      SHARED.uTime.value = now / 1000;
      SHARED.uWind.value = 0.85 + Math.sin(now / 9000) * 0.25;
    },
  });

  game.addSystem({
    name: 'world',
    phase: 'world',
    update({ dt }) {
      const at = game.focus;
      chunks.update(at.x, at.z, 5);
      grass.update(at.x, at.z, 3, dt);
      sky.update(at, camera.position);
      particles.update(at, at.y, sky.open);
    },
  });
}
