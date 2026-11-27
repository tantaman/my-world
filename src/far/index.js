// The far view: the land past where the forest is streamed in, drawn coarsely,
// so that from high ground you can see a long way.
//
// Chunks reach a couple of hundred metres (CONFIG.viewRadius), and the fog
// closes in just inside their edge so that you never see where they stop.
// Among trees that is plenty. On a mountain it is not: the point of standing
// up there is what you can see. So whoever wants to be seen further than that
// asks here for a square of land to be drawn, and the fog opens out as far as
// there is land drawn in every direction.
//
//   view.js    the meshes: one to a square, coloured as the forest looks from afar
//   grid.js    sampling a square of land, coarsely and purely
//   worker.js  doing that off the main thread, in a world of its own
//
// Who asks: the forest, for the land round you where it stands high enough to
// be worth seeing, and hikes, for the real place you are on.
//
// A square is drawn only once the land under it is really there. A real
// place's land is fetched when it is needed (world/landforms.js), so asking
// waits for it rather than drawing the forest where the real land will be.
//
// From the console:
//   world.far.list()    what is drawn, what is being sampled, what is waited for
//   world.far.reach()   how far land is drawn from where you stand

import { FarView, FAR_CLIP } from './view.js';
import { sampleFar } from './grid.js';
import { CONFIG } from '../config.js';
import { isNotYet } from '../core/notYet.ts';

// m: the fog closes in this far short of the far view's edge, and follows at
// this rate (1/s), so it opens out as the land comes rather than jumping.
const FOG_SHORT = 80;
const FOG_EASE = 1.2;
// m of land drawn round you over which the view counts as opening, from
// closed (the forest's haze) to open (the open air's: render/pipeline.js,
// OPEN_AIR)
const OPEN = { from: 600, full: 2500 };
// how much daylight reaches the eye (world/sky.js: open) under which it's
// under the ground, and the far view isn't drawn
const UNDERGROUND = 0.3;

// ── The forest's own far view ───────────────────────────────────────────────
// One square round you, re-made once you have walked far enough off its
// middle. One square and not a grid of them, because what is drawn reaches
// only as far as the edge of the square you are standing in (view.js): a grid
// of small ones would hold the fog in at the first edge it met.
//
// Only where there is something to see: in the high country (worldgen.js),
// where the land stands a kilometre and more over its valleys, or on the real
// Earth (world/earth.js), where it stands 1,500 real metres over the sea (so
// on the Olympics' summits, not down in the Hoh under them). Everywhere
// else the trees close in long before the chunks do, the fog stays where it
// has always been, and nothing here is sampled, meshed or drawn at all. A
// massif anywhere in the square counts, not only under your feet, so walking
// up to one from the valley you see it before you are on it.
const FOREST = {
  id: 'the forest',
  half: 1100, // m: half the square drawn round you
  step: 22, // m between its heights
  move: 300, // m you may walk off its middle before it is re-made
  again: 100, // m you may walk off where it was judged not worth it, before it's judged again
  alpine: 0.15, // how much high country in the square makes it worth drawing
  high: 300, // game m over the sea, on the Earth, that make it worth drawing
  look: 5, // points each way the square is judged over
};

// The features this uses, so it is installed after them (game/features.js).
export const after = ['render', 'world'];
export function installFar(game) {
  const { scene, gen, landforms, camera, pipeline, origin, structures, focus, sky } = game;

  const far = new FarView(scene);
  origin.place(far.mid);
  const waiting = new Map(); // id -> the square wanted, until the land is there
  const sampling = new Set(); // id -> gone to the worker, not back yet
  let worker = null; // null: not started; false: no workers here, do it ourselves

  // A real place's land has arrived: the worker's own world needs it too, or
  // it would go on drawing the forest where the real land now is.
  landforms.on('land', (def) => {
    if (worker) worker.postMessage({ type: 'land', def });
  });
  let lowAt = null; // where the forest's square was last judged not worth it, while that holds
  landforms.on('earth', (tile) => {
    if (worker) worker.postMessage({ type: 'earth', tile });
    lowAt = null; // (there may be more to see now)
  });

  function start() {
    if (worker !== null) return;
    try {
      worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
      worker.onmessage = (e) => {
        const { id, grid } = e.data;
        const box = square.get(id);
        if (!box || box.x0 !== grid.x0 || box.z0 !== grid.z0 || box.step !== grid.step) return;
        sampling.delete(id);
        far.add(id, grid, box.clip);
      };
      worker.onerror = (e) => {
        console.warn('far view worker failed, drawing it on the main thread', e.message);
        worker = false;
      };
      const pads = (structures || []).map((s) => ({ x: s.x, z: s.z, radius: s.radius }));
      worker.postMessage({ type: 'init', seed: gen.seed, land: gen.land, structures: pads, hikes: gen.hikes, earth: gen.earthCopy });
    } catch (err) {
      worker = false;
    }
  }

  // Draw the land over this square, under this id, once it can be sampled.
  // Asking again for the same square, drawn or on its way, does nothing;
  // asking for a different one replaces it, and what is already drawn stays
  // up until the new square arrives, so there is no gap.
  const square = new Map(); // id -> the square drawn, or gone for sampling
  const same = (a, b) => !!a && a.x0 === b.x0 && a.z0 === b.z0 && a.x1 === b.x1 && a.z1 === b.z1 && a.step === b.step && a.clip === b.clip;
  function want(id, x0, z0, x1, z1, step, clip = FAR_CLIP) {
    const box = { x0, z0, x1, z1, step, clip };
    if (same(square.get(id), box) || same(waiting.get(id), box)) return;
    waiting.set(id, box);
  }

  function drop(id) {
    waiting.delete(id);
    square.delete(id);
    sampling.delete(id);
    far.remove(id);
  }

  // Everything whose land has turned up, sent to be sampled.
  function sendReady() {
    if (!waiting.size) return;
    for (const [id, box] of [...waiting]) {
      if (!landforms.ready(box.x0, box.z0, box.x1, box.z1)) continue;
      waiting.delete(id);
      square.set(id, box);
      const n = Math.round((box.x1 - box.x0) / box.step) + 1;
      start();
      if (worker) {
        sampling.add(id);
        worker.postMessage({ type: 'far', id, x0: box.x0, z0: box.z0, n, step: box.step });
      } else {
        far.add(id, sampleFar(gen, box.x0, box.z0, n, box.step), box.clip);
      }
    }
  }

  // Is there high country in the square round (x, z) — something worth
  // drawing a long view of? Read from the country field, or on the Earth the
  // broad height, which are cheap and need no water worked out. (Earth not
  // come yet counts as nothing to see, until it has.)
  function worthIt(x, z) {
    for (let i = 0; i < FOREST.look; i++) {
      for (let j = 0; j < FOREST.look; j++) {
        const f = (k) => ((2 * k) / (FOREST.look - 1) - 1) * FOREST.half;
        if (high(x + f(i), z + f(j))) return true;
      }
    }
    return false;
  }
  function high(x, z) {
    try {
      if (gen.earthAt(x, z)) return gen.broadHeight(x, z, 0) - gen.sea.level >= FOREST.high;
      return gen.country(x, z).alp >= FOREST.alpine;
    } catch (err) {
      if (isNotYet(err)) return false;
      throw err;
    }
  }

  let forestAt = null; // the middle of the square asked for, while it stands
  function forestFar() {
    // A square asked for by something else (a hike's) covers the same land,
    // and the two would draw it twice and fight: the forest's gives way.
    for (const id of far.meshes.keys()) {
      if (id === FOREST.id) continue;
      if (forestAt) {
        drop(FOREST.id);
        forestAt = null;
      }
      return;
    }
    const { x, z } = focus;
    if (forestAt && Math.hypot(x - forestAt[0], z - forestAt[1]) < FOREST.move) return;
    if (lowAt && Math.hypot(x - lowAt[0], z - lowAt[1]) < FOREST.again) return;
    if (!worthIt(x, z)) {
      lowAt = [x, z];
      if (forestAt) {
        drop(FOREST.id);
        forestAt = null;
      }
      return;
    }
    lowAt = null;
    forestAt = [x, z];
    // Snapped to its own step, so that walking about doesn't shift every
    // height in it by a metre or two and shimmer the whole view.
    const n = Math.round((2 * FOREST.half) / FOREST.step) + 1;
    const x0 = Math.round((x - FOREST.half) / FOREST.step) * FOREST.step;
    const z0 = Math.round((z - FOREST.half) / FOREST.step) * FOREST.step;
    want(FOREST.id, x0, z0, x0 + (n - 1) * FOREST.step, z0 + (n - 1) * FOREST.step, FOREST.step);
  }

  let fog = 0;
  let settle = false; // (the fog straight to where it would go: settle())
  game.addSystem({
    name: 'far',
    phase: 'world',
    update({ dt }) {
      forestFar();
      sendReady();
      far.update(focus);
      // Under the ground (in a cave, down in the Metro) the land isn't to be
      // seen, and what's sunk under the chunks would show through the walls.
      far.show(sky.open > UNDERGROUND);
      // As far as there is land drawn in every direction, the air is clear.
      const base = (CONFIG.viewRadius - 0.15) * CONFIG.chunkSize;
      const clear = Math.max(base, far.reach(camera.position.x, camera.position.z, FOG_SHORT));
      fog = fog && !settle ? fog + (clear - fog) * (1 - Math.exp(-dt * FOG_EASE)) : clear;
      settle = false;
      pipeline.fogFar = fog > base + 1 ? fog : 0;
      // and the further the land is drawn, the clearer the air
      const t = Math.min(1, Math.max(0, (fog - OPEN.from) / (OPEN.full - OPEN.from)));
      pipeline.openAir = t * t * (3 - 2 * t);
    },
  });

  game.provide('far', {
    want,
    drop,
    has: (id) => far.has(id),
    reach: (x, z) => far.reach(x, z),
  });

  Object.assign(game.api, {
    far: {
      list: () => ({ drawn: [...far.meshes.keys()], sampling: [...sampling], waiting: [...waiting.keys()] }),
      // whether the land round you has enough shape to be drawn far off
      worthIt: () => worthIt(focus.x, focus.z),
      reach: () => Math.round(far.reach(camera.position.x, camera.position.z)),
      // the fog straight to where it's going, rather than easing out to it
      // (tools/look.mjs, for a still)
      settle: () => (settle = true),
    },
  });
}
