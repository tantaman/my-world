// Hikes: real walks, set into the forest from photos taken on them.
//
// `npm run hike -- photo.heic` (tools/hike.mjs) imports one: the real land
// round where the photo was taken, its trails and its lakes, at 1:5, placed
// out in the world (world/hikes.js lists them; world/landform.js is how the
// world grows them). This feature is the part you play:
//
//   - K takes you to a hike's trailhead; K again, to the spot the photo was
//     taken from, facing the way it looked, at the hour it was taken; again,
//     on to the next hike.
//   - On a hike, the HUD points the way to that spot (unless you're
//     following a mark of your own).
//   - A signpost stands at the trailhead and a cairn at the view, and the
//     map names them.
//   - From up there you can see the whole of it (farView.js).
//
// From the console: world.hikes.list(), await world.hikes.go('mount-storm-king', 'view')

import { CONFIG } from '../config.js';
import { formatDistance } from '../core/format.js';
import { hash2i } from '../noise.js';
import { FarView, FAR_CLIP } from './farView.js';
import { sampleFar } from './farGrid.js';
import { makeCairn, makeSignpost } from './landmarks.js';

const FAR_MARGIN = 700; // m of the forest round a hike that its far view takes in
const FAR_STEP = 16; // m between the far view's heights
const FAR_MAKE = 1500; // m past a hike's edge: nearer than this its far view is made…
const FAR_DROP = 2500; // …and further than this, let go
const FOG_SHORT = 80; // m: the fog closes in this far short of the far view's edge
const FOG_EASE = 1.2; // 1/s: how quickly the fog follows
const AT_STOP = 25; // m: standing this near a trailhead or a view, K goes on to the next
const VIEW_PITCH = 0.18; // rad: the camera looks out, a little down, as a photo does
const CAIRN_ASIDE = 1.4; // m to the left of where the photo was taken
const SIGN_ASIDE = 1.6; // m to the side of the trail where it starts
const LANDMARKS_NEAR = 400; // m: landmarks nearer than this are kept on the ground
const GUIDE_COLOR = '#eadfb4';
// What the map draws for where a photo was taken, and for a trailhead (7×7).
const PEAK = ['.......', '...#...', '..###..', '..###..', '.#####.', '.#####.', '#######'];
const SIGN = ['.......', '.####..', '.#####.', '.####..', '...#...', '...#...', '...#...'];

// The features this uses, so it is installed after them (game/features.js).
export const after = ['render', 'ui', 'world', 'player', 'map'];
export function installHikes(game) {
  const { scene, gen, chunks, player, hud, commands, pipeline, camera, sky, map } = game;
  const lands = gen.lands;
  const deg = (b) => (b * Math.PI) / 180;
  const real = (L, m) => formatDistance(m / L.def.scale);

  // ── Where things are ─────────────────────────────────────────────────────
  // { x, z, yaw, camYaw } for 'trailhead' or 'view'
  function spot(L, at) {
    if (at === 'view') {
      const v = L.world(L.view);
      const b = v.bearing === null || v.bearing === undefined ? null : deg(v.bearing);
      // facing along the bearing, with the camera behind looking the same way
      return b === null ? { x: v.x, z: v.z, yaw: 0 } : { x: v.x, z: v.z, yaw: Math.PI - b, camYaw: -b };
    }
    const t = L.world(L.trailhead);
    return { x: t.x, z: t.z, yaw: t.yaw };
  }

  // the hike whose land you're on
  const onHike = (x, z) => lands.find((L) => L.weight(x, z) > 0) || null;

  // ── On the map ───────────────────────────────────────────────────────────
  // Where each hike starts and where its photo was taken are places on the
  // map (map/places.js): named, and there to be tracked like a mark.
  const spots = [];
  map.places.addSource({
    within: (x0, z0, x1, z1) => spots.filter((p) => p.x >= x0 && p.x <= x1 && p.z >= z0 && p.z <= z1),
    get: (id) => spots.find((p) => p.id === id) || null,
  });

  // ── What stands there ────────────────────────────────────────────────────
  const landmarks = [];
  const stand = (object, x, z) => {
    object.position.set(x, chunks.heightAt(x, z), z);
    scene.add(object);
    landmarks.push({ object, x, z });
  };
  for (const L of lands) {
    const v = spot(L, 'view');
    const b = deg(L.view.bearing ?? 0);
    stand(makeCairn(hash2i(Math.round(L.cx), Math.round(L.cz), CONFIG.seed)), v.x - Math.cos(b) * CAIRN_ASIDE, v.z - Math.sin(b) * CAIRN_ASIDE);
    // beside the start of the trail, its arrow pointing at it, so you see it
    // face on as you arrive
    const t = spot(L, 'trailhead');
    const sign = makeSignpost();
    sign.rotation.y = t.yaw - Math.PI / 2;
    stand(sign, t.x + Math.cos(t.yaw) * SIGN_ASIDE, t.z - Math.sin(t.yaw) * SIGN_ASIDE);
    const trail = L.def.trail && L.def.trail.name;
    spots.push({ id: `hike:${L.id}:view`, x: v.x, z: v.z, name: L.name, kind: 'view', note: 'where the photo was taken', glyph: PEAK });
    spots.push({ id: `hike:${L.id}:trailhead`, x: t.x, z: t.z, name: trail || `${L.name} trailhead`, kind: 'trailhead', note: `where the walk up ${L.name} begins`, glyph: SIGN });
  }

  // ── Going there ──────────────────────────────────────────────────────────
  const frame = () => new Promise((r) => requestAnimationFrame(r));
  let arrivedOn = null; // the hike you were last told you were on
  function go(L, at) {
    const s = spot(L, at);
    player.spawn(s.x, s.z, s.yaw, s.camYaw);
    arrivedOn = L;
    makeFar(L);
    if (at === 'view') {
      player.camPitch = VIEW_PITCH;
      if (Number.isFinite(L.view.hour)) sky.hours = L.view.hour;
      hud.flash(`${L.name} · where the photo was taken`);
    } else {
      const t = L.def.trail;
      hud.flash(t ? `${L.name} · ${t.name || 'the trail'}: ${real(L, t.length)}, ${real(L, t.climb)} up` : L.name);
    }
  }

  if (lands.length) {
    const stops = lands.flatMap((L) => [
      { L, at: 'trailhead' },
      { L, at: 'view' },
    ]);
    commands.add({
      id: 'hike',
      keys: ['KeyK'],
      group: 'WANDER',
      label: 'go on a hike',
      run() {
        const here = stops.findIndex((s) => {
          const p = spot(s.L, s.at);
          return Math.hypot(p.x - player.pos.x, p.z - player.pos.z) < AT_STOP;
        });
        const next = stops[(here + 1) % stops.length];
        go(next.L, next.at);
      },
    });
  }

  // On a hike, the HUD points to where the photo was taken.
  hud.guide(() => {
    const L = onHike(player.pos.x, player.pos.z);
    if (!L) return null;
    const v = spot(L, 'view');
    return { id: `hike:${L.id}`, label: L.name, color: GUIDE_COLOR, x: v.x, z: v.z };
  });

  // ── The far view ─────────────────────────────────────────────────────────
  const far = new FarView(scene);
  const asked = new Set();
  let worker = null;
  function makeFar(L) {
    if (far.has(L.id) || asked.has(L.id)) return;
    asked.add(L.id);
    const half = L.outer + FAR_MARGIN;
    const n = Math.round((2 * half) / FAR_STEP) + 1;
    const job = { type: 'far', id: L.id, x0: L.cx - half, z0: L.cz - half, n, step: FAR_STEP };
    if (!worker && worker !== false) {
      try {
        worker = new Worker(new URL('./farWorker.js', import.meta.url), { type: 'module' });
        worker.onmessage = (e) => {
          asked.delete(e.data.id);
          far.add(e.data.id, e.data.grid);
        };
        worker.onerror = (e) => {
          console.warn('far view worker failed, drawing it on the main thread', e.message);
          worker = false;
        };
        const structures = (game.structures || []).map((s) => ({ x: s.x, z: s.z, radius: s.radius }));
        worker.postMessage({ type: 'init', seed: gen.seed, land: gen.land, structures, hikes: gen.hikes });
      } catch (err) {
        worker = false;
      }
    }
    if (worker) worker.postMessage(job);
    else {
      far.add(L.id, sampleFar(gen, job.x0, job.z0, job.n, job.step));
      asked.delete(L.id);
    }
  }

  let fog = 0;
  game.addSystem({
    name: 'hikes',
    phase: 'world',
    update({ dt }) {
      const at = game.focus;
      far.update(at);
      for (const L of lands) {
        const d = L.clearance(at.x, at.z);
        if (d < FAR_MAKE) makeFar(L);
        else if (d > FAR_DROP) far.remove(L.id);
      }

      // As far as there's land drawn in every direction, the air is clear.
      const base = (CONFIG.viewRadius - 0.15) * CONFIG.chunkSize;
      const want = Math.min(FAR_CLIP - 30, Math.max(base, far.reach(camera.position.x, camera.position.z) - FOG_SHORT));
      fog = fog ? fog + (want - fog) * (1 - Math.exp(-dt * FOG_EASE)) : want;
      pipeline.fogFar = fog > base + 1 ? fog : 0;

      // Walking onto a hike, you're told which.
      const L = onHike(at.x, at.z);
      if (L && L !== arrivedOn) hud.flash(L.name);
      arrivedOn = L;

      // Landmarks stand on the ground, wherever it has been dug.
      for (const m of landmarks) {
        if (Math.abs(m.x - at.x) < LANDMARKS_NEAR && Math.abs(m.z - at.z) < LANDMARKS_NEAR) m.object.position.y = chunks.heightAt(m.x, m.z);
      }
    },
  });

  Object.assign(game.api, {
    hikes: {
      list: () =>
        lands.map((L) => ({
          id: L.id,
          name: L.name,
          trailhead: spot(L, 'trailhead'),
          view: spot(L, 'view'),
          trail: L.def.trail,
          farView: far.has(L.id),
        })),
      // Resolves once you're there, the forest has streamed in and the far
      // view is drawn.
      async go(id, at = 'trailhead') {
        const L = lands.find((h) => h.id === id);
        if (!L) throw new Error(`no hike called ${id}: try world.hikes.list()`);
        go(L, at);
        do await frame();
        while (!chunks.isFullyLoaded() || !far.has(L.id));
        const s = spot(L, at);
        player.spawn(s.x, s.z, s.yaw, s.camYaw);
        if (at === 'view') player.camPitch = VIEW_PITCH;
        for (let i = 0; i < 4; i++) {
          game.grass.update(s.x, s.z, Infinity);
          await frame();
        }
      },
    },
  });
}
