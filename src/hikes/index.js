// Hikes: real walks, set into the forest from photos taken on them.
//
// `npm run hike -- photo.heic` (tools/hike.mjs) imports one: the real land
// round where the photo was taken, its trails and its lakes, at 1:5, placed
// out in the world (world/hikes.js lists them; world/landform.js is how the
// world grows them). This feature is the part you play:
//
//   - The hikes tab beside the map (M) lists them all (hikesPanel.js): go
//     to one's trailhead, or straight to the spot its photo was taken from,
//     facing the way it looked, at the hour it was taken.
//   - On a hike, the HUD points the way to that spot (unless you're
//     following a mark of your own).
//   - A signpost stands at the trailhead and a cairn at the view, and the
//     map names them.
//   - From up there you can see the whole of it (the far view, src/far/).
//
// It works from the hikes' cards (what and where each one is: world/landforms.js),
// which are always here. A hike's land is fetched the first time anything
// near it is grown; going to one waits for it.
//
// From the console: world.hikes.list(), await world.hikes.go('mount-storm-king', 'view')

import { CONFIG } from '../config.js';
import { formatDistance } from '../core/format.js';
import { hash2i } from '../noise.js';
import { makeCairn, makeSignpost, makeChains } from './waymarks.js';
import { HikesPanel } from './hikesPanel.js';

const FAR_MARGIN = 700; // m of the forest round a hike that its far view takes in
const FAR_STEP = 16; // m between the far view's heights
const FAR_MAKE = 1500; // m past a hike's edge: nearer than this its far view is made…
const FAR_DROP = 2500; // …and further than this, let go
const VIEW_PITCH = 0.18; // rad: the camera looks out, a little down, as a photo does
const CAIRN_ASIDE = 1.4; // m to the left of where the photo was taken
const SIGN_ASIDE = 1.6; // m to the side of the trail where it starts
const WAYMARKS_NEAR = 400; // m: waymarks nearer than this are kept on the ground
const GUIDE_COLOR = '#eadfb4';
// What the map draws for where a photo was taken, and for a trailhead (7×7).
const PEAK = ['.......', '...#...', '..###..', '..###..', '.#####.', '.#####.', '#######'];
const SIGN = ['.......', '.####..', '.#####.', '.####..', '...#...', '...#...', '...#...'];

// The features this uses, so it is installed after them (game/features.js).
export const after = ['render', 'ui', 'world', 'player', 'map', 'far'];
export function installHikes(game) {
  const { scene, gen, landforms, chunks, player, hud, camera, sky, map, far } = game;
  const cards = landforms.cards;
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
    destinations: () => spots.filter((p) => p.id.endsWith(':view')),
    within: (x0, z0, x1, z1) => spots.filter((p) => p.x >= x0 && p.x <= x1 && p.z >= z0 && p.z <= z1),
    get: (id) => spots.find((p) => p.id === id) || null,
  });

  // ── What stands there ────────────────────────────────────────────────────
  const waymarks = [];
  const stand = (object, x, z) => {
    object.position.set(x, chunks.heightAt(x, z), z);
    scene.add(object);
    waymarks.push({ object, x, z });
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
    const ski = c.country === 'snowy mountains';
    spots.push({ id: `hike:${c.id}:view`, x: v.x, z: v.z, name: c.name, kind: ski ? 'ski peak' : 'view', note: ski ? 'Follow the snow downhill to start skiing.' : 'where the photo was taken', glyph: PEAK });
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
    if (!landforms.has(c.id)) {
      hud.flash(`${c.name} · on the way…`);
      try {
        await landforms.ensure(c.id);
      } catch {
        hud.flash(`couldn't fetch ${c.name} · try again`);
        return false;
      }
      if (trip !== going) return false;
    }
    const s = spot(c, at);
    player.spawn(s.x, s.z, s.yaw, s.camYaw);
    arrivedOn = c;
    far.want(c.id, ...farBox(c));
    if (at === 'view') {
      player.camPitch = VIEW_PITCH;
      if (Number.isFinite(c.view.hour)) sky.hours = c.view.hour;
      hud.flash(`${c.name} · where the photo was taken`);
    } else {
      const t = c.trail;
      hud.flash(t ? `${c.name} · ${t.name || 'the trail'}: ${real(c, t.length)}, ${real(c, Math.abs(t.climb))} ${t.climb < 0 ? 'down' : 'up'}` : c.name);
    }
    return true;
  }

  // ── The list ─────────────────────────────────────────────────────────────
  // The water on a hike, by name: its lakes, the sea, its streams.
  const waterOn = (c) => [...new Set([...(c.lakes || []), ...(c.streams || [])].map((w) => w.name))].filter(Boolean);
  // In the real world's metres, the way you'd describe the hike.
  const panel = new HikesPanel({
    hikes: cards.map((c) => ({
      id: c.id,
      name: c.name,
      trail: c.trail ? c.trail.name : '',
      length: c.trail ? c.trail.length / c.scale : 0,
      climb: c.trail ? c.trail.climb / c.scale : 0,
      lakes: waterOn(c),
    })),
    onGo(id, at) {
      map.close();
      go(cards.find((c) => c.id === id), at);
    },
    here: () => {
      const c = onHike(player.pos.x, player.pos.z);
      return c ? c.id : null;
    },
  });
  game.provide('hikes', panel);
  if (cards.length) map.addTab({ id: 'hikes', label: 'hikes', el: panel.el, shown: () => panel.shown() });

  // On a hike, the HUD points to where the photo was taken.
  hud.guide(() => {
    const c = onHike(player.pos.x, player.pos.z);
    if (!c) return null;
    const v = spot(c, 'view');
    return { id: `hike:${c.id}`, label: c.name, color: GUIDE_COLOR, x: v.x, z: v.z };
  });

  // ── The far view ─────────────────────────────────────────────────────────
  // From up here you can see the whole of it, which the streamed-in forest
  // does not reach: so the land round the hike is drawn once more, coarsely
  // (src/far/). Asking for a square whose land has not been fetched waits for
  // it rather than drawing the forest in its place.
  const farBox = (c) => {
    const half = outer(c) + FAR_MARGIN;
    return [c.at[0] - half, c.at[1] - half, c.at[0] + half, c.at[1] + half, FAR_STEP];
  };

  // Chains along the stretches of trail that have them, put up once the land
  // they stand on is here. (They stand where the ground was when they went
  // up: dig under one and it's left hanging.)
  landforms.on('land', (def) => {
    if (!def.ropes) return;
    const lines = def.ropes.map((r) => r.map((v, k) => v + def.at[k % 2]));
    const chains = makeChains(lines, (x, z) => gen.height(x, z));
    if (chains) scene.add(chains);
  });
  // The ground near it waits for its land: say why, rather than leave a gap.
  landforms.on('failed', (c) => hud.flash(`can't fetch ${c ? c.name : 'a hike'} yet · trying again (or reload the page)`));
  game.addSystem({
    name: 'hikes',
    phase: 'world',
    update({ dt }) {
      const at = game.focus;
      // One hike's far view at a time, the nearest: hikes near each other
      // would draw the same far land twice, and the two would fight. It
      // changes over once the new one is drawn.
      let nearest = null;
      let nd = Infinity;
      for (const c of cards) {
        const d = Math.hypot(at.x - c.at[0], at.z - c.at[1]) - outer(c);
        if (d < nd) [nearest, nd] = [c, d];
      }
      if (nearest && nd < FAR_MAKE) far.want(nearest.id, ...farBox(nearest));
      for (const c of cards) {
        const stale = c !== nearest && (!nearest || far.has(nearest.id) || nd >= FAR_MAKE);
        if (stale || nd > FAR_DROP) far.drop(c.id);
      }

      // Walking onto a hike, you're told which.
      const c = onHike(at.x, at.z);
      if (c && c !== arrivedOn) hud.flash(c.name);
      arrivedOn = c;

      // Waymarks stand on the ground, wherever it has been dug.
      for (const m of waymarks) {
        if (Math.abs(m.x - at.x) < WAYMARKS_NEAR && Math.abs(m.z - at.z) < WAYMARKS_NEAR) m.object.position.y = chunks.heightAt(m.x, m.z);
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
          water: waterOn(c),
          land: landforms.has(c.id),
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
