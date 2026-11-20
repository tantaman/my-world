// Towns: a western town of false fronts and boardwalks, a village round its
// green, a dark old town in the woods; some lived in and some long abandoned.
// They're rarer than the old places (about one in each square kilometre or
// two), every one is on the map with its name, and you can track one and go.
//
// Where they are and how each is laid out is grown from the seed (towns.js),
// so everyone in a world finds the same towns and nothing about them is saved
// — except, for each of you, which ones you've been to. What the buildings
// look like is in buildings.js, their people in people.js, their sounds in
// sound.js. This file stands a town up as you come near, a building a frame,
// and takes it down as you go, and tells the rest of the game about it:
//
//   - the trees, bushes and stones in its way are hidden as its chunks grow,
//     and the grass kept off its street and floors (the forest itself isn't
//     changed: see towns.js)
//   - its walls, floors and boardwalks are solids, and the camera stays
//     inside a building's walls with you
//   - building goes round it, and a blueprint can't be staked over it
//   - it's a place on the map, with its street and its roofs, to track
//   - its people come and go, and say hello
//
// A building that would stand where someone has built something, laid a
// fire or left a stump is left out (so an old save never wakes up with a
// saloon through its cabin).

import * as THREE from 'three';
import { Towns, OPEN, bodyOf } from './towns.js';
import { KINDS, BUILDINGS } from './kinds.js';
import { buildLot, buildStreet, makeTumbleweed } from './buildings.js';
import { Townsfolk } from './people.js';
import { onPlan, planDiscs, toWorld } from '../landmarks/sites.js';
import { VEG_STRIDE } from '../world/flora.js';
import { SKY, SHARED } from '../render/uniforms.js';
import { rayBox } from '../core/geom.js';
import './sound.js';

const SHOW = 430; // m: towns this close (to their edge) are stood up...
const HIDE = 530; // ...and taken down again past this
const LOOK_EVERY = 0.5; // s between looks round for towns to stand up
const KNOWN = 2600; // m round you whose towns the map can list
const ARRIVE = 4; // m from its street or one of its lots where you've reached a town
const LIVELY = 220; // m: closer than this, its people go about their business
const HEARD = 120; // m: ...and its sounds are made
const GLOW = { day: [0.1, 0.13, 0.17], night: [2.6, 2.3, 2.1] }; // a lit window's brightness, by day and by night
const TUMBLE = 3; // tumbleweeds in an empty western street
// How far (m) plants of each kind are kept back from a building: a trunk well
// clear of the eaves, a fallen log by its length (times its scale, like a
// rock).
const KEEP_BACK = { pine: 1.6, broad: 1.8, birch: 1.3, bush: 0.7, fern: 0.25, rock: 1.1, log: 2.4 };
const SCALED = { rock: true, log: true };

const _sphere = new THREE.Sphere();
const _frustum = new THREE.Frustum();
const _pv = new THREE.Matrix4();

export function installTowns(game) {
  const { scene, camera, gen, chunks, grass, solids, player, builder, map, hud, save, sound, sky } = game;
  const towns = new Towns(gen, { start: player.start, sites: game.landmarks ? game.landmarks.sites : null });
  const materials = {
    body: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, side: THREE.DoubleSide }),
    glow: new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }),
    street: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }),
    weed: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 }),
  };
  const ground = (x, z) => gen.height(x, z) + (chunks.heightOffset ? chunks.heightOffset(x, z) : 0);
  const shown = new Map(); // id -> { town, object, built: Map(lot -> built), queue, people, weeds, sounds }
  const visited = new Set(); // ids of the towns you've been to
  const reached = new Set(); // ...and the ones you've reached since the page opened

  // ── Whether a building stands at all ──────────────────────────────────────
  // Not where something has been built, a fire laid or a stump left: anything
  // that isn't grown from the seed. Asked once per lot, after the save is in.
  const standing = new Map();
  let asking = false; // (the towns' own obstacles keep out of it)
  function stands(town, lot) {
    const key = `${town.id}/${lot.u.toFixed(1)}/${lot.v.toFixed(1)}`;
    let yes = standing.get(key);
    if (yes !== undefined) return yes;
    yes = true;
    const r = Math.hypot(lot.w, lot.d) / 2;
    const s = { x: lot.x, z: lot.z, yaw: lot.yaw, box: [lot.x - r, lot.z - r, lot.x + r, lot.z + r], plan: [[-lot.w / 2, -lot.d / 2, lot.w / 2, lot.d / 2]] };
    asking = true;
    try {
      for (const o of builder.obstacles.near(lot.x, lot.z, r + 1)) {
        if (!o.grown && onPlan(s, o.x, o.z, 0.5)) {
          yes = false;
          break;
        }
      }
    } finally {
      asking = false;
    }
    standing.set(key, yes);
    return yes;
  }

  // ── The forest round it ───────────────────────────────────────────────────
  chunks.on('vegetation', (ch) => {
    const S = chunks.size;
    const x0 = ch.cx * S;
    const z0 = ch.cz * S;
    for (const t of towns.within(x0 - 3, z0 - 3, x0 + S + 3, z0 + S + 3)) {
      for (const kind in ch.vegLists) {
        const list = ch.vegLists[kind];
        for (let o = 0, k = 0; o < list.length; o += VEG_STRIDE, k++) {
          const scale = list[o + 4];
          if (scale <= 0) continue;
          const back = (KEEP_BACK[kind] ?? 0.6) * (SCALED[kind] ? scale : 1);
          if (onPlan(t, list[o], list[o + 2], back, t.clear)) chunks.hideInstance(ch, kind, k);
        }
      }
    }
  });
  grass.addClearing((x0, z0, x1, z1) => {
    const list = towns.within(x0, z0, x1, z1);
    if (!list.length) return null;
    return (x, z) => list.some((t) => onPlan(t, x, z, 0.1, t.bare));
  });

  // ── Building goes round it ────────────────────────────────────────────────
  const discs = new Map();
  function discsOf(t) {
    let list = discs.get(t.id);
    if (list) return list;
    list = [];
    for (const lot of t.lots) {
      for (const d of planDiscs({ ...lot, plan: [[-lot.w / 2, -lot.d / 2, lot.w / 2, lot.d / 2]] })) list.push({ ...d, what: BUILDINGS[lot.type].label, lot });
    }
    for (const d of planDiscs({ ...t, plan: [t.street] }, 3)) list.push({ ...d, what: `the street of ${t.name}` });
    discs.set(t.id, list);
    return list;
  }
  builder.obstacles.addSource((x, z, R, out) => {
    if (asking) return;
    for (const t of towns.near(x, z, R + 1)) {
      for (const d of discsOf(t)) {
        if (Math.hypot(d.x - x, d.z - z) > R + d.r + 1) continue;
        if (d.lot && !stands(t, d.lot)) continue;
        out.push({ x: d.x, z: d.z, what: d.what, dig: d.r + 0.3, wall: d.r + 0.2, footing: d.r + 0.5, roof: d.r, grown: true });
      }
    }
  });

  // ── Standing them up and taking them down ─────────────────────────────────
  function show(t) {
    const object = new THREE.Group();
    object.add(buildStreet(t, ground, materials.street));
    scene.add(object);
    const at = player.pos;
    const queue = t.lots.filter((lot) => stands(t, lot)).sort((a, b) => Math.hypot(a.x - at.x, a.z - at.z) - Math.hypot(b.x - at.x, b.z - at.z));
    const entry = { town: t, object, built: new Map(), queue, people: null, weeds: [], sounds: { piano: null, bell: null, next: {} } };
    if (t.people > 0) {
      entry.people = new Townsfolk(t, { scene, ground });
      entry.people.on('hello', (h) => {
        hud.flash(`“${h.line}”`, 2600);
        sound.call('hello', h.x, h.y, h.z, { pitch: h.voice });
      });
      // where a watcher was standing, the moment it went
      entry.people.on('vanish', (v) => sound.call('whisper', v.x, ground(v.x, v.z) + 1.5, v.z, { gain: 0.6 }));
    }
    if (t.kind === 'ghost') {
      for (let i = 0; i < TUMBLE; i++) {
        const w = makeTumbleweed(t.seed + i, materials.weed);
        object.add(w.mesh);
        entry.weeds.push({ ...w, u: -t.len / 2 + Math.random() * t.len, v: (Math.random() - 0.5) * t.half * 1.6, hop: Math.random() * 6, speed: 0 });
      }
    }
    shown.set(t.id, entry);
  }
  function buildNext(entry) {
    const lot = entry.queue.shift();
    const built = buildLot(entry.town, lot, ground, materials);
    entry.object.add(built.object);
    solids.set(built, built.solids);
    entry.built.set(lot, built);
    if (built.piano) entry.sounds.piano = { x: built.piano.x, z: built.piano.z, y: built.y0 + 1 };
    if (built.bell) entry.sounds.bell = { x: built.bell.x, z: built.bell.z, y: built.y0 + built.bell.y };
  }
  function hide(entry) {
    scene.remove(entry.object);
    entry.object.traverse((o) => o.isMesh && o.geometry.dispose());
    for (const built of entry.built.values()) solids.clear(built);
    if (entry.people) entry.people.dispose();
    shown.delete(entry.town.id);
  }

  // The camera doesn't look through a wall or a roof from inside.
  player.cameraBlockers.push((origin, dir, max) => {
    let best = Infinity;
    for (const e of shown.values()) {
      for (const built of e.built.values()) {
        if (!built.blockers.length) continue;
        if (Math.hypot(origin.x - built.object.position.x, origin.z - built.object.position.z) > max + 14) continue;
        for (const b of built.blockers) {
          const t = rayBox(origin, dir, b);
          if (t < best) best = t;
        }
      }
    }
    return best;
  });

  // ── Being there ───────────────────────────────────────────────────────────
  save.register({
    id: 'towns',
    scope: 'yours',
    local: 'marks',
    collect: () => [...visited],
    validate: (raw) => (Array.isArray(raw) ? raw.filter((id) => typeof id === 'string') : []),
    restore(list) {
      visited.clear();
      for (const id of list) visited.add(id);
    },
  });
  function arrive(t) {
    reached.add(t.id);
    const K = KINDS[t.kind];
    hud.flash(`${t.name} · ${K.label}${t.people ? '' : t.style === 'creepy' || K.abandoned ? '' : ' · nobody about'}`, 3200);
    if (!visited.has(t.id)) {
      visited.add(t.id);
      save.touch();
    }
  }

  // ── On the map ────────────────────────────────────────────────────────────
  // (made once each, and again when you've been there)
  const places = new Map();
  function asPlace(t) {
    let p = places.get(t.id);
    if (p && p.visited === visited.has(t.id)) return p;
    const K = KINDS[t.kind];
    p = {
      id: t.id,
      x: t.x,
      z: t.z,
      name: t.name,
      kind: K.label,
      note: K.notes[t.people ? 0 : 1],
      glyph: K.glyph,
      visited: visited.has(t.id),
      shape: t.lots.filter((lot) => !OPEN[lot.type] && stands(t, lot)).map((lot) => corners(lot, bodyOf(lot))),
      ground: [corners(t, t.street)],
    };
    places.set(t.id, p);
    return p;
  }
  map.places.addSource({
    // the map would rather fill in over a few frames than stall
    within: (x0, z0, x1, z1) => towns.within(x0, z0, x1, z1, false).map(asPlace),
    get(id) {
      const t = towns.byId(id);
      return t ? asPlace(t) : null;
    },
  });

  // ── What you can see ──────────────────────────────────────────────────────
  // (the camera's view is worked out once a frame, in the system below)
  function inView(x, y, z, r) {
    _sphere.center.set(x, y, z);
    _sphere.radius = r;
    return _frustum.intersectsSphere(_sphere);
  }

  // ── What it sounds like ───────────────────────────────────────────────────
  let lastHour = sky.hours;
  function sounds(e, d, now) {
    const t = e.town;
    const s = e.sounds;
    const due = (k, a, b) => {
      if (s.next[k] === undefined) s.next[k] = now + a + Math.random() * (b - a);
      if (now < s.next[k]) return false;
      s.next[k] = now + a + Math.random() * (b - a);
      return true;
    };
    const hours = sky.hours;
    // a piano in the saloon, from late morning until the small hours
    if (s.piano && t.people && (hours > 10 || hours < 2) && now > (s.pianoUntil ?? 0) && d < 90) {
      sound.call('piano', s.piano.x, s.piano.y, s.piano.z);
      s.pianoUntil = now + 4 * 4 * 0.3 + 0.5 + Math.random() * 3;
    }
    // the church: the hours, in a village; now and then a single slow toll in
    // a dark town
    if (s.bell) {
      const struck = Math.floor(lastHour) !== Math.floor(hours) && Math.abs(hours - lastHour) < 0.5;
      if (t.style === 'village' && t.people && struck && hours > 6.9 && hours < 21.5) sound.call('town-bell', s.bell.x, s.bell.y, s.bell.z, { strokes: Math.floor(hours) % 12 || 12, pitch: 330 });
      if (t.style === 'creepy' && due('toll', 40, 110)) sound.call('town-bell', s.bell.x, s.bell.y, s.bell.z, { strokes: 1, pitch: 165 });
    }
    // a hinge, a sign, a loose board, in the wind of an empty street
    if ((KINDS[t.kind].abandoned || t.style === 'creepy') && e.built.size && due('creak', 4, 13)) {
      const list = [...e.built.values()];
      const b = list[Math.floor(Math.random() * list.length)];
      const p = b.object.position;
      if (Math.hypot(p.x - player.pos.x, p.z - player.pos.z) < 60) sound.call('creak', p.x, p.y + 2.5, p.z, { gain: 0.5 + SHARED.uWind.value * 0.4 });
    }
    // somebody's dog
    if (t.people && t.style !== 'creepy' && e.built.size && due('dog', 25, 70)) {
      const list = [...e.built.values()];
      const p = list[Math.floor(Math.random() * list.length)].object.position;
      sound.call('dog', p.x, p.y + 0.5, p.z, { gain: 0.7 });
    }
  }

  // ── Each frame ────────────────────────────────────────────────────────────
  let lookIn = 0;
  let pending = [];
  game.addSystem({
    name: 'towns',
    phase: 'world',
    update({ dt, now }) {
      const at = game.focus;
      lookIn -= dt;
      if (lookIn <= 0) {
        lookIn = LOOK_EVERY;
        pending = towns.near(at.x, at.z, SHOW).filter((t) => !shown.has(t.id));
        for (const e of shown.values()) if (boxDist(e.town.box, at.x, at.z) > HIDE) hide(e);
        towns.prefetch(at.x, at.z, KNOWN);
      }
      if (pending.length) show(pending.shift());
      // one building a frame, the nearest town's first
      let first = null;
      for (const e of shown.values()) if (e.queue.length && (!first || boxDist(e.town.box, at.x, at.z) < boxDist(first.town.box, at.x, at.z))) first = e;
      if (first) buildNext(first);
      // look ahead for the map, more of it while it's open (nothing else is drawn)
      if (towns.queue.size) towns.pump(map.isOpen ? 8 : 1);

      // windows lit after dark
      const night = SKY.uNight.value;
      const k = Math.min(1, night * 1.6);
      materials.glow.color.setRGB(...GLOW.day.map((v, i) => v + (GLOW.night[i] - v) * k));

      const p = player.pos;
      _pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      _frustum.setFromProjectionMatrix(_pv);
      const ctx = { player: p, night, hours: sky.hours, inView };
      const wind = SHARED.uWind.value;
      for (const e of shown.values()) {
        const t = e.town;
        const d = boxDist(t.box, p.x, p.z);
        if (!reached.has(t.id) && d < 0.5 && inTown(t, p.x, p.z)) arrive(t);
        if (d > LIVELY) continue;
        for (const built of e.built.values()) for (const s of built.spinners) s.object.rotation.z += s.speed * wind * dt;
        for (const w of e.weeds) tumble(t, w, dt, wind);
        if (e.people) e.people.update(dt, ctx);
        if (d < HEARD) sounds(e, d, now / 1000);
      }
      lastHour = sky.hours;
    },
  });

  // A tumbleweed bowling down the street with the wind, hopping, and blown
  // back in at the far end.
  function tumble(t, w, dt, wind) {
    w.speed += (wind * 2.6 - w.speed) * Math.min(1, dt);
    w.u += w.speed * dt;
    w.hop += dt * (2 + w.speed);
    if (w.u > t.len / 2 + 14) {
      w.u = -t.len / 2 - 14;
      w.v = (Math.random() - 0.5) * t.half * 1.6;
    }
    const at = toWorld(t, w.u, w.v);
    const y = ground(at.x, at.z) + w.r + Math.abs(Math.sin(w.hop)) * 0.35;
    // the town's group stands at the origin of the world
    w.mesh.position.set(at.x, y, at.z);
    w.mesh.rotation.y = t.yaw;
    w.mesh.rotation.z -= (w.speed * dt) / w.r;
  }

  function inTown(t, x, z) {
    return onPlan(t, x, z, ARRIVE, t.plan);
  }

  // From the console: world.towns.nearest(), world.towns.list()
  game.provide('towns', {
    towns,
    shown,
    visited,
    // what's within r of you, nearest first
    list(r = 3000) {
      const { x, z } = player.pos;
      return towns
        .near(x, z, r)
        .map((t) => ({ id: t.id, kind: t.kind, name: t.name, x: Math.round(t.x), z: Math.round(t.z), dist: Math.round(Math.hypot(t.x - x, t.z - z)), people: t.people, buildings: t.lots.length, visited: visited.has(t.id) }))
        .sort((a, b) => a.dist - b.dist);
    },
    nearest(kind = null, r = 6000) {
      return this.list(r).find((t) => !kind || t.kind === kind) || null;
    },
    // walk into the middle of the street of the nearest of a kind
    async visit(kind = null) {
      const n = this.nearest(kind);
      if (!n) return null;
      const t = towns.byId(n.id);
      const p = toWorld(t, -t.len / 2 + 6, 0);
      await game.api.teleport(p.x, p.z, t.yaw + Math.PI / 2);
      return n;
    },
  });
}

// A rectangle of a town or a lot, as its corners in the world, for the map.
function corners(s, [x0, z0, x1, z1]) {
  return [
    [x0, z0],
    [x1, z0],
    [x1, z1],
    [x0, z1],
  ].map(([lx, lz]) => {
    const p = toWorld(s, lx, lz);
    return [p.x, p.z];
  });
}

function boxDist(b, x, z) {
  return Math.hypot(Math.max(b[0] - x, 0, x - b[2]), Math.max(b[1] - z, 0, z - b[3]));
}
