// Hikes: real walks, set into the forest from photos taken on them.
//
// `npm run hike -- photo.heic` (tools/hike.mjs) imports one: the real land
// round where the photo was taken, its trails and its lakes, at 1:5, placed
// out in the world (world/hikes.js lists them; world/landform.js is how the
// world grows them). This feature is the part you play:
//
//   - K (or the hikes button) lists them all (hikesPanel.js): go to one's
//     trailhead, or straight to the spot its photo was taken from, facing
//     the way it looked, at the hour it was taken.
//   - On a hike, the HUD points the way to that spot (unless you're
//     following a mark of your own).
//   - A signpost stands at the trailhead and a cairn at the view, and the
//     map names them.
//   - From up there you can see the whole of it (farView.js).
//
// It works from the hikes' cards (what and where each one is: world/landforms.js),
// which are always here. A hike's land is fetched the first time anything
// near it is grown; going to one waits for it.
//
// From the console: world.hikes.list(), await world.hikes.go('mount-storm-king', 'view')

import { CONFIG } from '../config.js';
import { formatDistance } from '../core/format.js';
import { hash2i } from '../noise.js';
import { FarView, FAR_CLIP } from './farView.js';
import { sampleFar } from './farGrid.js';
import { makeCairn, makeSignpost } from './landmarks.js';
import { HikesPanel } from './hikesPanel.js';

const FAR_MARGIN = 700; // m of the forest round a hike that its far view takes in
const FAR_STEP = 16; // m between the far view's heights
const FAR_MAKE = 1500; // m past a hike's edge: nearer than this its far view is made…
const FAR_DROP = 2500; // …and further than this, let go
const FOG_SHORT = 80; // m: the fog closes in this far short of the far view's edge
const FOG_EASE = 1.2; // 1/s: how quickly the fog follows
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
  const { scene, gen, lands, chunks, player, hud, commands, pipeline, camera, sky, map, input } = game;
  const cards = lands.cards;
  const deg = (b) => (b * Math.PI) / 180;
  const real = (c, m) => formatDistance(m / c.scale);
  const outer = (c) => c.radius + c.fade;

  // ── Where things are ─────────────────────────────────────────────────────
  // { x, z, yaw, camYaw } for 'trailhead' or 'view'
  function spot(c, at) {
    if (at === 'view') {
      const v = c.view;
      const b = v.bearing === null || v.bearing === undefined ? null : deg(v.bearing);
      const [x, z] = [c.at[0] + v.x, c.at[1] + v.z];
      // facing along the bearing, with the camera behind looking the same way
      return b === null ? { x, z, yaw: 0 } : { x, z, yaw: Math.PI - b, camYaw: -b };
    }
    const t = c.trailhead;
    return { x: c.at[0] + t.x, z: c.at[1] + t.z, yaw: t.yaw };
  }

  // the hike whose land you're on
  const onHike = (x, z) => cards.find((c) => Math.hypot(x - c.at[0], z - c.at[1]) < outer(c)) || null;

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
  for (const c of cards) {
    const v = spot(c, 'view');
    const b = deg(c.view.bearing ?? 0);
    stand(makeCairn(hash2i(Math.round(c.at[0]), Math.round(c.at[1]), CONFIG.seed)), v.x - Math.cos(b) * CAIRN_ASIDE, v.z - Math.sin(b) * CAIRN_ASIDE);
    // beside the start of the trail, its arrow pointing at it, so you see it
    // face on as you arrive
    const t = spot(c, 'trailhead');
    const sign = makeSignpost();
    sign.rotation.y = t.yaw - Math.PI / 2;
    stand(sign, t.x + Math.cos(t.yaw) * SIGN_ASIDE, t.z - Math.sin(t.yaw) * SIGN_ASIDE);
    const trail = c.trail && c.trail.name;
    spots.push({ id: `hike:${c.id}:view`, x: v.x, z: v.z, name: c.name, kind: 'view', note: 'where the photo was taken', glyph: PEAK });
    spots.push({ id: `hike:${c.id}:trailhead`, x: t.x, z: t.z, name: trail || `${c.name} trailhead`, kind: 'trailhead', note: `where the walk up ${c.name} begins`, glyph: SIGN });
  }

  // ── Going there ──────────────────────────────────────────────────────────
  // Once its land is here, so you land on the real ground and not the
  // forest's guess at it.
  const frame = () => new Promise((r) => requestAnimationFrame(r));
  let arrivedOn = null; // the hike you were last told you were on
  let going = 0; // the latest trip asked for: an earlier one still waiting gives way
  async function go(c, at) {
    const trip = ++going;
    if (!lands.has(c.id)) {
      hud.flash(`${c.name} · on the way…`);
      try {
        await lands.ensure(c.id);
      } catch {
        hud.flash(`couldn't fetch ${c.name} · try again`);
        return false;
      }
      if (trip !== going) return false;
    }
    const s = spot(c, at);
    player.spawn(s.x, s.z, s.yaw, s.camYaw);
    arrivedOn = c;
    makeFar(c);
    if (at === 'view') {
      player.camPitch = VIEW_PITCH;
      if (Number.isFinite(c.view.hour)) sky.hours = c.view.hour;
      hud.flash(`${c.name} · where the photo was taken`);
    } else {
      const t = c.trail;
      hud.flash(t ? `${c.name} · ${t.name || 'the trail'}: ${real(c, t.length)}, ${real(c, t.climb)} up` : c.name);
    }
    return true;
  }

  // ── The list ─────────────────────────────────────────────────────────────
  // In the real world's metres, the way you'd describe the hike.
  const panel = new HikesPanel({
    hikes: cards.map((c) => ({
      id: c.id,
      name: c.name,
      trail: c.trail ? c.trail.name : '',
      length: c.trail ? c.trail.length / c.scale : 0,
      climb: c.trail ? c.trail.climb / c.scale : 0,
      lakes: (c.lakes || []).map((l) => l.name).filter(Boolean),
    })),
    input,
    onGo: (id, at) => go(cards.find((c) => c.id === id), at),
    here: () => {
      const c = onHike(player.pos.x, player.pos.z);
      return c ? c.id : null;
    },
  });
  game.provide('hikes', panel);
  // One panel at a time: opening this one closes whatever else is up.
  const toggle = () => {
    if (!panel.isOpen) game.emit('panel', 'hikes');
    panel.toggle();
  };
  game.on('panel', (which) => which !== 'hikes' && panel.close());
  if (cards.length) {
    commands.add({ id: 'hikes', keys: ['KeyK'], group: 'WANDER', label: 'hikes · go to one', run: toggle });
    hud.button('hikes-btn', toggle);
    const btn = document.getElementById('hikes-btn');
    if (btn) btn.hidden = false;
  }

  // On a hike, the HUD points to where the photo was taken.
  hud.guide(() => {
    const c = onHike(player.pos.x, player.pos.z);
    if (!c) return null;
    const v = spot(c, 'view');
    return { id: `hike:${c.id}`, label: c.name, color: GUIDE_COLOR, x: v.x, z: v.z };
  });

  // ── The far view ─────────────────────────────────────────────────────────
  // Made once the land it takes in is here: the hike's own, and any other
  // hike's within reach of it. Until then, asking for it sends for that land.
  const far = new FarView(scene);
  const asked = new Set();
  let worker = null;
  lands.on('land', (def) => {
    if (worker) worker.postMessage({ type: 'hike', def });
  });
  // The ground near it waits for its land: say why, rather than leave a gap.
  lands.on('failed', (c) => hud.flash(`can't fetch ${c ? c.name : 'a hike'} yet · trying again (or reload the page)`));
  function makeFar(c) {
    if (far.has(c.id) || asked.has(c.id)) return;
    const half = outer(c) + FAR_MARGIN;
    const [x0, z0] = [c.at[0] - half, c.at[1] - half];
    if (!lands.ready(x0, z0, x0 + 2 * half, z0 + 2 * half)) return;
    asked.add(c.id);
    const n = Math.round((2 * half) / FAR_STEP) + 1;
    const job = { type: 'far', id: c.id, x0, z0, n, step: FAR_STEP };
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
      far.add(c.id, sampleFar(gen, job.x0, job.z0, job.n, job.step));
      asked.delete(c.id);
    }
  }

  let fog = 0;
  game.addSystem({
    name: 'hikes',
    phase: 'world',
    update({ dt }) {
      const at = game.focus;
      far.update(at);
      for (const c of cards) {
        const d = Math.hypot(at.x - c.at[0], at.z - c.at[1]) - outer(c);
        if (d < FAR_MAKE) makeFar(c);
        else if (d > FAR_DROP) far.remove(c.id);
      }

      // As far as there's land drawn in every direction, the air is clear.
      const base = (CONFIG.viewRadius - 0.15) * CONFIG.chunkSize;
      const want = Math.min(FAR_CLIP - 30, Math.max(base, far.reach(camera.position.x, camera.position.z) - FOG_SHORT));
      fog = fog ? fog + (want - fog) * (1 - Math.exp(-dt * FOG_EASE)) : want;
      pipeline.fogFar = fog > base + 1 ? fog : 0;

      // Walking onto a hike, you're told which.
      const c = onHike(at.x, at.z);
      if (c && c !== arrivedOn) hud.flash(c.name);
      arrivedOn = c;

      // Landmarks stand on the ground, wherever it has been dug.
      for (const m of landmarks) {
        if (Math.abs(m.x - at.x) < LANDMARKS_NEAR && Math.abs(m.z - at.z) < LANDMARKS_NEAR) m.object.position.y = chunks.heightAt(m.x, m.z);
      }
    },
  });

  Object.assign(game.api, {
    hikes: {
      list: () =>
        cards.map((c) => ({
          id: c.id,
          name: c.name,
          trailhead: spot(c, 'trailhead'),
          view: spot(c, 'view'),
          trail: c.trail,
          land: lands.has(c.id),
          farView: far.has(c.id),
        })),
      // Resolves once you're there, the forest has streamed in and the far
      // view is drawn.
      async go(id, at = 'trailhead') {
        const c = cards.find((h) => h.id === id);
        if (!c) throw new Error(`no hike called ${id}: try world.hikes.list()`);
        if (!(await go(c, at))) throw new Error(`couldn't get to ${c.name}`);
        do await frame();
        while (!chunks.isFullyLoaded() || !far.has(c.id));
        const s = spot(c, at);
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
