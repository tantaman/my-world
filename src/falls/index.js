// Waterfalls: on a hike whose map marks falls on its streams (Havasu Falls,
// Mooney Falls), the white water falling off the lip, mist rising off the
// pool below, and the roar of it. Each is a place on the map, by name, to
// look up and track.
//
// A fall is where the land drops: the real ground is the cliff, and the
// stream's water comes down it (world/landform.js). This finds the drop near
// where the map puts each fall once the hike's land is here (falls.js), and
// draws the falling water on it (look.js), and the sound (sound.js).
//
// From the console: world.falls.list()

import { findFall } from './falls.js';
import { makeFall } from './look.js';
import { roar } from './sound.js';

const HEAR = 260; // m: falls nearer than this are heard…
const VOICES = 2; // …the nearest this many of them
const SEEN = 2500; // m: further than this, a fall isn't drawn
// What the map draws for a waterfall (7×7): a ledge, and water off it.
const GLYPH = ['#######', '.#.#.#.', '.#.#.#.', '.#.#.#.', '.#.#.#.', '#.#.#.#', '.#####.'];

// The features this uses, so it is installed after them (game/features.js).
export const after = ['render', 'world', 'audio', 'map'];
export function installFalls(game) {
  const { scene, gen, landforms, sound, map, camera } = game;

  // Every fall the hikes' cards name, where each is. Its shape (findFall)
  // once its hike's land is here, and what's drawn of it.
  const falls = [];
  for (const c of landforms.cards) {
    (c.falls || []).forEach((f, k) => {
      falls.push({ id: `fall:${c.id}:${k}`, hike: c.id, scale: c.scale, name: f.name || 'a waterfall', x: c.at[0] + f.x, z: c.at[1] + f.z, height: f.height || null, shape: null, look: null });
    });
  }
  const state = { heard: [] };

  // ── On the map ───────────────────────────────────────────────────────────
  const metres = (f) => Math.round(f.height || (f.shape ? f.shape.height / f.scale : 0));
  const place = (f) => ({ id: f.id, x: f.x, z: f.z, name: f.name, kind: 'waterfall', note: metres(f) ? `a fall of ${metres(f)} m` : 'a waterfall', glyph: GLYPH });
  map.places.addSource({
    within: (x0, z0, x1, z1) => falls.filter((f) => f.x >= x0 && f.x <= x1 && f.z >= z0 && f.z <= z1).map(place),
    get: (id) => {
      const f = falls.find((f) => f.id === id);
      return f ? place(f) : null;
    },
  });

  // ── In the world ─────────────────────────────────────────────────────────
  // Once a hike's land is set in (the world feature sets it in first), each
  // of its falls is found on it and drawn.
  const ground = (x, z) => gen.height(x, z);
  function setIn(def) {
    const land = gen.landforms.find((L) => L.id === def.id);
    if (!land) return;
    const water = land.country.water;
    for (const f of falls) {
      if (f.hike !== def.id || f.shape) continue;
      f.shape = findFall(land, f.x, f.z);
      if (!f.shape) continue;
      f.look = makeFall(f.shape, ground, water ? water.shallow : undefined);
      scene.add(f.look);
    }
  }
  landforms.on('land', setIn);
  for (const def of gen.hikes) setIn(def);

  sound.addLayer(roar(state));

  game.addSystem({
    name: 'falls',
    phase: 'world',
    update() {
      const { x, z } = camera.position;
      const near = [];
      for (const f of falls) {
        if (!f.look) continue;
        const d = Math.hypot(f.shape.foot[0] - x, f.shape.foot[2] - z);
        f.look.visible = d < SEEN;
        if (d < HEAR) near.push([d, f]);
      }
      near.sort((a, b) => a[0] - b[0]);
      state.heard = near.slice(0, VOICES).map(([, f]) => f);
    },
  });

  game.api.falls = {
    list: () => falls.map((f) => ({ id: f.id, hike: f.hike, name: f.name, x: f.x, z: f.z, height: f.shape ? Math.round(f.shape.height * 10) / 10 : null, cascade: f.shape ? f.shape.cascade : null, drawn: !!f.look })),
  };
}
