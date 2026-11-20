// Under the water: what it looks and sounds like down there, and what lives
// there. Diving itself is the player's (src/player/player.js); this follows
// the camera, and when it goes under (see README.md):
//
//   - tells the shaders (UNDER in render/uniforms.js): the water's fog and
//     light take over from the air's (render/pixelPipeline.js), and the
//     surface is seen from below (world/waterSurface.js)
//   - dulls everything heard from above and plays the water's own hush
//   - lets drifting specks show, and your breath go up in bubbles
//
// And it keeps what lives down there: fish (fish.js) and weed, kelp and
// seagrass (weed.js).
//
// From the console:
//   world.underwater.find('sea')       the nearest sea deep enough to dive in
//                                      (or 'lake'), to teleport to
//   world.underwater.spawn('perch')    a school turns up near you
//   world.underwater.fish()            what's swimming about

import * as THREE from 'three';
import { UNDER } from '../render/uniforms.js';
import { waterSample, rand } from '../core/geom.js';
import { createSpecks, createBubbles } from './specks.js';
import { deepWater } from './sound.js';
import { Fishes, FISH } from './fish.js';
import { Weed } from './weed.js';

// Still water churned at least this much (foam, 0..1) is a sea's chop: a
// real place's sea carries it all over (world/landform.js), as the forest's
// own does near its shore.
const SEA_CHOP = 0.2;
// Seconds between breaths let go under water.
const BREATH = [2.4, 4.6];
const _w = waterSample();
const _v = new THREE.Vector3();

// The features this uses, so it is installed after them (game/features.js).
export const after = ['render', 'ui', 'world', 'player', 'audio'];
export function installUnderwater(game) {
  const { scene, camera, chunks, gen, player, sound, hud } = game;
  // Is the water in the sample w the sea: the forest's own (by its level), or
  // a real place's (by its chop)?
  const seaLevel = gen.sea ? gen.sea.level : null;
  const salt = (w) => (seaLevel !== null && Math.abs(w.level - seaLevel) < 0.02) || (w.foam > SEA_CHOP && Math.hypot(w.flowX, w.flowZ) < 0.1);

  // the water over the camera, shared with the sound
  const state = { under: 0, level: 0, sea: 0 };
  const specks = createSpecks();
  const bubbles = createBubbles();
  scene.add(specks.object, bubbles.object);
  sound.addLayer(deepWater(state));
  const fishes = new Fishes({ scene, chunks, salt });
  const weed = new Weed({ scene, chunks, seed: gen.seed, salt });

  const surfaceAt = (x, z) => (chunks.waterAt(x, z, _w) && _w.depth > 0 ? _w.level : null);
  const head = () => player.character.head.getWorldPosition(_v);

  let breath = rand(...BREATH);
  let wasSubmerged = false;

  game.addSystem({
    name: 'underwater',
    phase: 'world',
    update({ dt }) {
      // Is the camera under water?
      const c = camera.position;
      const level = surfaceAt(c.x, c.z);
      // (not in a cave that runs under a lake: what's overhead is rock)
      const under = level !== null && c.y < level - 0.02 && !player.space ? 1 : 0;
      if (under) {
        state.level = level;
        state.sea = salt(_w) ? 1 : 0; // (surfaceAt left the water there in _w)
      }
      if (under !== state.under) {
        state.under = under;
        sound.muffle(under);
      }
      UNDER.uUnder.value = under;
      UNDER.uUnderLevel.value = state.level;
      UNDER.uUnderSea.value = state.sea;
      specks.update(c);

      // Breath, now and then, and a gush as you go under.
      if (player.submerged) {
        if (!wasSubmerged) {
          const h = head();
          bubbles.let(h.x, h.y - 0.5, h.z, 26, 0.35);
          sound.sfx('bubbles', { size: 1 });
        }
        breath -= dt;
        if (breath <= 0) {
          breath = rand(...BREATH);
          const h = head();
          bubbles.let(h.x, h.y + 0.05, h.z, 3 + Math.floor(rand(0, 5)), 0.05);
          sound.sfx('bubbles', { size: 0.15 });
        }
      }
      wasSubmerged = player.submerged;
      bubbles.update(dt, surfaceAt);

      // what lives down there: fish keep away from your head, and the weed
      // grows while you're in the water to see it
      fishes.update(dt, head(), camera, state.under ? hud : null);
      weed.update(c.x, c.z, under || player.wade > 0.3);
    },
  });

  // ── For the console (and the smoke test) ──────────────────────────────────
  // The nearest water of `kind` ('sea', 'lake', 'pond', 'river') at least
  // `depth` m deep, looking out from (x, z) up to `reach` m: { x, z, depth },
  // or null.
  function find(kind = 'sea', { x = player.pos.x, z = player.pos.z, depth = 6, reach = 3000 } = {}) {
    for (let r = 0; r <= reach; r += 12) {
      const steps = Math.max(1, Math.floor((Math.PI * 2 * r) / 12));
      for (let s = 0; s < steps; s++) {
        const a = (s / steps) * Math.PI * 2;
        const px = x + Math.cos(a) * r;
        const pz = z + Math.sin(a) * r;
        const h = gen.height(px, pz);
        const w = gen.water;
        if (w.region && w.kind === kind && w.level - h >= depth) return { x: px, z: pz, depth: w.level - h };
      }
    }
    return null;
  }

  // A school of `kind` turns up near you.
  function spawn(kind) {
    if (!FISH[kind]) return `fish: ${Object.keys(FISH).join(' ')}`;
    const p = player.pos;
    for (let tries = 0; tries < 40; tries++) {
      const a = rand(0, Math.PI * 2);
      const x = p.x + Math.cos(a) * rand(3, 10);
      const z = p.z + Math.sin(a) * rand(3, 10);
      const col = fishes.column(x, z);
      if (col && col.level - col.bed > 0.8) return fishes.spawn(kind, x, (col.level + col.bed) / 2, z).label;
    }
    return 'there is no water near enough';
  }

  game.provide('underwater', {
    find,
    spawn,
    fish: () => fishes.list(),
    get under() {
      return state.under === 1;
    },
    get bubbles() {
      return bubbles.count;
    },
  });
}
