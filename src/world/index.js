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
import { Basins } from './basins.js';
import { CUTS } from './cuts.js';
import { createParticles } from './particles.js';
import { createTerrainMaterial, createTerrainDepthMaterial, createVegetationMaterial, createVegetationDepthMaterial, createGrassMaterial } from './materials.js';
import { SHARED, UNDER, BREAKERS } from '../render/uniforms.js';
import { Breakers } from './breakers.js';
import { createWaterMaterial } from './waterSurface.js';
import { makePine, makeBroadleaf, makeBirch, makeBush, makeFern, makeRock, makeLog } from './models.js';
import { makePalm, makeIronwood, makeTreeFern, makeSilversword, makeCypress } from './modelsIsland.js';
import { STRUCTURES } from '../structures/index.js';
import { placeStructures } from '../structures/loader.js';
import { HIKES } from './hikes.js';
import { Landforms } from './landforms.js';

const DAY_MINUTES = 24; // how long a full day takes when time flows
const wrapHours = (h) => ((h % 24) + 24) % 24;

// The features this uses, so it is installed after them (game/features.js).
export const after = ['render', 'ui'];
export function installWorld(game) {
  const { scene, camera, hud, save } = game;

  // The forest a seed grows on its land. The real hikes are set into it as
  // their land arrives, which it does the first time something near one is
  // grown.
  const landforms = new Landforms(HIKES);
  const gen = growWorld(CONFIG.seed, STRUCTURES, CONFIG.land);
  const materials = {
    terrain: createTerrainMaterial(),
    terrainShadow: createTerrainDepthMaterial(),
    vegetation: createVegetationMaterial(),
    vegetationShadow: createVegetationDepthMaterial(),
    grass: createGrassMaterial(),
    water: createWaterMaterial(),
  };
  // where the holes in the ground start (cuts.js) is a place: slid with the scene to be drawn
  game.origin.place(CUTS.uCutAt);
  const models = {
    pine: makePine(11),
    broad: makeBroadleaf(23),
    birch: makeBirch(37),
    bush: makeBush(41),
    fern: makeFern(53),
    rock: makeRock(67),
    log: makeLog(71),
    palm: makePalm(81),
    ironwood: makeIronwood(83),
    treefern: makeTreeFern(85),
    silversword: makeSilversword(87),
    // what other countries draw a kind of tree as (country.js, forms)
    cypress: makeCypress(89),
  };
  const chunks = new ChunkManager(scene, gen, materials, models, STRUCTURES, { ready: (x0, z0, x1, z1) => landforms.ready(x0, z0, x1, z1), casters: game.casters });
  landforms.on('land', (def) => {
    gen.addHike(def);
    chunks.addHike(def);
  });
  const grass = new Grass(scene, chunks, materials.grass, CONFIG.seed);
  const sky = new Sky(scene);
  // the plants cast into its shadow only what is in its reach (render/casters.ts)
  game.casters.light(sky.sun);
  // its position is the way up, not a place: it stays put when the scene is slid to be drawn
  game.origin.keep(sky.hemi);
  const particles = createParticles();
  scene.add(particles.object);
  placeStructures(scene, STRUCTURES, gen, materials);
  SHARED.uGrassRadius.value = CONFIG.grassRadius;
  if (gen.sea) UNDER.uSea.value = gen.sea.level;

  game.provide('gen', gen);
  game.provide('chunks', chunks);
  game.provide('grass', grass);
  game.provide('sky', sky);
  game.provide('materials', materials);
  game.provide('structures', STRUCTURES);
  game.provide('landforms', landforms);
  // Built things you bump into and stand on. Whoever builds, writes to it.
  game.provide('solids', new Solids());
  // Waves breaking somewhere on the sea (breakers.js): none until whoever
  // finds a break hands it one (breakers.set). Its point on the shore is a
  // place, slid with the scene to be drawn; and the water rises with it for
  // whoever asks the chunks (waterAt's rise).
  const breakers = new Breakers(BREAKERS);
  game.origin.place(BREAKERS.uBreakAt);
  chunks.breakers = breakers;
  game.provide('breakers', breakers);
  // Places under the ground you can be in (caves). Whoever makes one, adds it.
  game.provide('spaces', new Spaces());
  // Water held up in something built (a pool, a tub). Whoever builds one, adds it.
  game.provide('basins', new Basins());
  // What the world streams in around: a point that whoever is being followed
  // keeps up to date (the player feature copies the hiker's position into it).
  game.provide('focus', new THREE.Vector3());
  // ...and anyone else followed at the same time (the others on a split
  // screen): a point each ({ x, z }, kept up to date), which whoever follows
  // them adds here and takes out again. The ground and the grass are grown
  // round each of them as well as round the focus; everything else that
  // goes by where you are goes by the focus alone.
  const followed = new Set();
  game.provide('followed', followed);
  const others = []; // (the same, as a list, each frame)

  // ── The hour ──────────────────────────────────────────────────────────────
  let flows = false;
  const clock = (h) => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`;
  hud.setting({
    id: 'time-of-day',
    group: 'TIME',
    label: 'time of day',
    min: 0,
    max: 24,
    step: 1 / 12, // five minutes
    get: () => sky.hours,
    set: (h) => (sky.hours = wrapHours(h)),
    show: clock,
  });
  hud.setting({ id: 'time-flow', group: 'TIME', label: 'let time flow', get: () => flows, set: (on) => (flows = on) });

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
      // the waves come in on their own clock, before anyone rides them
      breakers.update(dt);
    },
  });

  // How fast the focus is moving (m/s), smoothed, and so how far ahead of it
  // the chunks should reach: at a walk a few metres, which changes nothing;
  // tucked on skis at 26 m/s the whole of the view radius again, so the ground
  // is grown before it is skied onto rather than a ring of it behind. Smoothed
  // because a lead that jumped about would throw away what was being grown.
  const LEAD_TIME = 10; // s of travel to reach ahead by
  const LEAD_EASE = 1; // 1/s: how quickly the lead follows your speed
  const LEAD_MOST = 200; // m/s: faster than anything travels, so it was put there
  const was = { x: 0, z: 0, had: false };
  const vel = { x: 0, z: 0 };

  game.addSystem({
    name: 'world',
    phase: 'world',
    update({ dt }) {
      const at = game.focus;
      if (was.had && dt > 0) {
        const vx = (at.x - was.x) / dt;
        const vz = (at.z - was.z) / dt;
        if (Math.hypot(vx, vz) > LEAD_MOST) {
          // set down somewhere rather than travelling there: no lead, or it
          // would reach off along the jump and grow a strip of nowhere
          vel.x = 0;
          vel.z = 0;
        } else {
          const k = 1 - Math.exp(-dt * LEAD_EASE);
          vel.x += (vx - vel.x) * k;
          vel.z += (vz - vel.z) * k;
        }
      }
      was.x = at.x;
      was.z = at.z;
      was.had = true;
      const speed = Math.hypot(vel.x, vel.z);
      // (a teleport is not a speed: it would reach off to nowhere)
      const reach = speed > 1e-3 ? Math.min(CONFIG.viewRadius * CONFIG.chunkSize, speed * LEAD_TIME) / speed : 0;
      others.length = 0;
      for (const p of followed) others.push(p);
      chunks.update(at.x, at.z, 5, at.x + vel.x * reach, at.z + vel.z * reach, others);
      grass.update(at.x, at.z, 3, dt, others);
      sky.update(at, camera.position);
      particles.update(at, at.y, sky.open);
    },
  });
}
