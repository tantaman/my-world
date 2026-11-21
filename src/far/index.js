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

// m: the fog closes in this far short of the far view's edge, and follows at
// this rate (1/s), so it opens out as the land comes rather than jumping.
const FOG_SHORT = 80;
const FOG_EASE = 1.2;

// The features this uses, so it is installed after them (game/features.js).
export const after = ['render', 'world'];
export function installFar(game) {
  const { scene, gen, landforms, camera, pipeline, origin, structures, focus } = game;

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

  function start() {
    if (worker !== null) return;
    try {
      worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
      worker.onmessage = (e) => {
        sampling.delete(e.data.id);
        far.add(e.data.id, e.data.grid);
      };
      worker.onerror = (e) => {
        console.warn('far view worker failed, drawing it on the main thread', e.message);
        worker = false;
      };
      const pads = (structures || []).map((s) => ({ x: s.x, z: s.z, radius: s.radius }));
      worker.postMessage({ type: 'init', seed: gen.seed, land: gen.land, structures: pads, hikes: gen.hikes });
    } catch (err) {
      worker = false;
    }
  }

  // Draw the land over this square, under this id, once it can be sampled.
  // Asking again for one already drawn or on its way does nothing.
  function want(id, x0, z0, x1, z1, step) {
    if (far.has(id) || sampling.has(id)) return;
    waiting.set(id, { x0, z0, x1, z1, step });
  }

  function drop(id) {
    waiting.delete(id);
    far.remove(id);
  }

  // Everything whose land has turned up, sent to be sampled.
  function sendReady() {
    if (!waiting.size) return;
    for (const [id, box] of [...waiting]) {
      if (!landforms.ready(box.x0, box.z0, box.x1, box.z1)) continue;
      waiting.delete(id);
      const n = Math.round((box.x1 - box.x0) / box.step) + 1;
      start();
      if (worker) {
        sampling.add(id);
        worker.postMessage({ type: 'far', id, x0: box.x0, z0: box.z0, n, step: box.step });
      } else {
        far.add(id, sampleFar(gen, box.x0, box.z0, n, box.step));
      }
    }
  }

  let fog = 0;
  game.addSystem({
    name: 'far',
    phase: 'world',
    update({ dt }) {
      sendReady();
      far.update(focus);
      // As far as there is land drawn in every direction, the air is clear.
      const base = (CONFIG.viewRadius - 0.15) * CONFIG.chunkSize;
      const clear = Math.min(FAR_CLIP - 30, Math.max(base, far.reach(camera.position.x, camera.position.z) - FOG_SHORT));
      fog = fog ? fog + (clear - fog) * (1 - Math.exp(-dt * FOG_EASE)) : clear;
      pipeline.fogFar = fog > base + 1 ? fog : 0;
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
      reach: () => Math.round(far.reach(camera.position.x, camera.position.z)),
    },
  });
}
