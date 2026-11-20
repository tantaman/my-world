// The railway: a few narrow-gauge loop lines out in the forest, a line every
// few kilometres where the land allows one, each with three to five
// stations and two or three little trains going round and round it.
//
//   lines.js      where the lines run, grown from the seed; their stations
//   timetable.js  where every train is, by the clock on the wall
//   track.js      what the track and the stations look like
//   trains.js     the engines and their cars, wheels and rods; the smoke
//   sound.js      chuff, clatter, hiss, brakes, the whistle; ballast underfoot
//   onMap.js      the lines and the trains on the map
//   panel.js      the stations to go to (a tab beside the map, or Y)
//
// Like the old places and the caves, nothing about a line is saved and
// nothing about the land changes for it: everyone in a world finds the same line, the trains
// run by the clock so everyone sees the same train in the same place, and
// the plants in the way are hidden as their chunk grows. A line that would
// run where someone had already built something isn't there, so an old save
// never wakes up with a railway through its cabin. Which train you're on is
// yours, and is passed on so the others see you riding it.
//
// This file tells the rest of the game about it:
//   - plants are kept off the track, grass off its bank, and building away
//   - the bank, the trestles and the platforms are solids, to walk on
//   - the stations are places on the map, and the lines and trains drawn on it
//   - the stations tab beside the map, which Y opens: the stations to go to;
//     beside a standing train, Y gets on, and at a station, Y gets off
//     (player.aboard)
//   - a layer of sound for the trains near you
//
// From the console:
//   world.railway.list()        the stations within reach, and when trains are due
//   world.railway.go(id)        to a station's platform
//   world.railway.soon(id, 5)   (for trying it out) the next train there in 5 s

import * as THREE from 'three';
import { Lines, clearOfPlaces, clearOfCaves, pointAt, nearest, samplesNear, ahead, PLATFORM, PLATFORM_EDGE, PLATFORM_W } from './lines.js';
import { Timetable, TRAIN_LEN } from './timetable.js';
import { buildPiece, buildStation, pieceCount, pieceRange, footprint, PIECE } from './track.js';
import { Train, Smoke, COACHES, SEATS, CAR_BOX } from './trains.js';
import { trainSounds } from './sound.js';
import { railLayer, STATION_GLYPH } from './onMap.js';
import { StationPanel } from './panel.js';
import { onPlan, planDiscs, toWorld } from '../landmarks/sites.js';
import { VEG_STRIDE } from '../world/flora.js';
import { SEAT_HIPS } from '../player/character.js';
import { SHARED } from '../render/uniforms.js';
import { formatDistance } from '../core/format.js';

const SHOW = 300; // m: track and stations this close are stood up...
const HIDE = 370; // ...and taken down again past this
const TRAINS_SHOW = 480; // m: trains this close are drawn
const LOOK_EVERY = 0.5; // s between looks round for track to stand up
const BUILD_MS = 4; // ms a frame spent standing track up, when there's some to do
const REACH = 7000; // m round you whose stations the panel lists
const PUMP_MS = [0.8, 6]; // ms a frame surveying lines further off: usually, and with the map open
const PREFETCH_EVERY = 2; // s between asking for the lines round you
const BOARD = 3.5; // m from the side of a car you can climb into it
const STOOD = 0.25; // m/s: slower than this, a train is standing
const LISTED = 12; // stations listed in the panel at most
const ARRIVE = 14; // m from a platform's middle where you've come to its station
const HEARD = 3; // trains given a voice at once
// Sitting on a bench: knees together, feet on the floor in front.
const BENCH = { spread: 0.14, hang: 0.5, fwd: 0.4, lean: -0.04, reins: 0 };
const NEAR_WHISTLE = 16; // s before it stands at a station, a train whistles
const CROSSING = [50, 80]; // m short of a footpath crossing it whistles, going fast enough
// How far (m) plants of each kind are kept back from what the track stands
// on (a rock and a fallen log by their size).
const KEEP = { pine: 3.4, broad: 3.8, birch: 3.0, bush: 2.2, fern: 1.3, rock: 1.6, log: 2.4 };
const SCALED = { rock: true, log: true };
const PUFFS_MOST = 7; // puffs a second from a stack, at most
const DRIVER_TURN = 2 * Math.PI * 0.52; // m to a turn of the driving wheels
const SAY = 4200; // ms a sentence stays on the screen

const _n = { d: 0, s: 0, i: 0, side: 0 };
const _g = { d: 0, s: 0, i: 0, side: 0 };
const _p = { x: 0, y: 0, z: 0, dx: 0, dz: 0, grade: 0 };
const _seat = { x: 0, y: 0, z: 0, yaw: 0 };
const _v = new THREE.Vector3();

// The features this uses, so it is installed after them (game/features.js).
// The lines keep clear of the old places and the caves' mouths, which were
// there first, and off the real land the hikes bring in (world/landforms.js).
export const after = ['render', 'ui', 'world', 'player', 'audio', 'build', 'map', 'landmarks', 'caves', 'save'];
export function installRailway(game) {
  const { scene, camera, gen, landforms, chunks, grass, solids, player, input, builder, map, hud, commands, save, sound, landmarks, caves, peers } = game;
  const keepClear = [];
  if (landmarks) keepClear.push(clearOfPlaces(landmarks.sites));
  if (caves) keepClear.push(clearOfCaves((x0, z0, x1, z1) => caves.inBox(x0, z0, x1, z1)));
  // and none on real land, or near enough it that the land isn't the forest's alone
  const keepOff = (x0, z0, x1, z1) => !!(landforms && landforms.reaches(x0, z0, x1, z1));
  const lines = new Lines(gen, { start: player.start, keepClear, keepOff });
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, side: THREE.DoubleSide });
  const glow = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  const ground = (x, z) => gen.height(x, z) + (chunks.heightOffset ? chunks.heightOffset(x, z) : 0);
  const tables = new Map();
  const table = (line) => {
    let t = tables.get(line.id);
    if (!t) tables.set(line.id, (t = new Timetable(line)));
    return t;
  };
  let shift = 0; // s added to the clock: only ever from the console, to try things out
  const clock = () => Date.now() / 1000 + shift;
  const lineOf = (st) => lines.byId(st.line);

  // ── Whether a line is there at all ────────────────────────────────────────
  // Not where something has been built, or a fire laid, on its track or a
  // station: anything not grown from the seed. Asked once per line, after
  // the save is in.
  const standing = new Map();
  let asking = false; // (its own obstacles keep out of it)
  function stands(line) {
    let yes = standing.get(line.id);
    if (yes !== undefined) return yes;
    yes = true;
    asking = true;
    try {
      for (let i = 0; i < line.n && yes; i += 2) {
        for (const o of builder.obstacles.near(line.x[i], line.z[i], footprint(line, i) + 1)) {
          if (!o.grown && !o.clear) {
            yes = false;
            break;
          }
        }
      }
      for (const st of line.stations) {
        const r = Math.hypot(st.box[2] - st.box[0], st.box[3] - st.box[1]) / 2;
        for (const o of builder.obstacles.near(st.x, st.z, r + 1)) if (!o.grown && !o.clear && onPlan(st, o.x, o.z, 0.5)) yes = false;
      }
    } finally {
      asking = false;
    }
    standing.set(line.id, yes);
    return yes;
  }
  const near = (x, z, r, wait = true) => lines.within(x - r, z - r, x + r, z + r, wait).filter(stands);

  // ── Keeping the forest off it ─────────────────────────────────────────────
  chunks.on('vegetation', (ch) => {
    const S = chunks.size;
    const x0 = ch.cx * S;
    const z0 = ch.cz * S;
    const here = lines.within(x0 - 16, z0 - 16, x0 + S + 16, z0 + S + 16).filter(stands);
    if (!here.length) return;
    for (const kind in ch.vegLists) {
      const list = ch.vegLists[kind];
      const keep0 = KEEP[kind] ?? 1.5;
      for (let o = 0, k = 0; o < list.length; o += VEG_STRIDE, k++) {
        const scale = list[o + 4];
        if (scale <= 0) continue;
        const px = list[o];
        const pz = list[o + 2];
        const keep = keep0 * (SCALED[kind] ? scale : 1);
        for (const line of here) {
          if ((nearest(line, px, pz, _n) && _n.d < keep + footprint(line, _n.i, false, _n.side)) || line.stations.some((st) => onPlan(st, px, pz, keep * 0.6))) {
            chunks.hideInstance(ch, kind, k);
            break;
          }
        }
      }
    }
  });
  // no grass on the bank or the platforms (it grows on under a trestle)
  grass.addClearing((x0, z0, x1, z1) => {
    const list = lines.within(x0 - 12, z0 - 12, x1 + 12, z1 + 12, false).filter(stands);
    if (!list.length) return null;
    return (x, z) => list.some((line) => (nearest(line, x, z, _g) && _g.d < footprint(line, _g.i, true, _g.side)) || line.stations.some((st) => onPlan(st, x, z, 0.1, st.bare)));
  });
  // building goes round it
  const discs = new Map();
  builder.obstacles.addSource((x, z, R, out) => {
    if (asking) return;
    for (const line of lines.within(x - R - 12, z - R - 12, x + R + 12, z + R + 12, false)) {
      if (!stands(line)) continue;
      samplesNear(line, x, z, R + 9, (i) => {
        const r = footprint(line, i);
        out.push({ x: line.x[i], z: line.z[i], what: 'the railway', dig: r + 0.7, wall: r + 0.5, footing: r + 0.9, roof: r + 0.3, grown: true });
      });
      for (const st of line.stations) {
        if (Math.hypot(st.x - x, st.z - z) > R + 30) continue;
        let list = discs.get(st.id);
        if (!list) discs.set(st.id, (list = planDiscs(st)));
        for (const d of list) {
          if (Math.hypot(d.x - x, d.z - z) > R + d.r + 1) continue;
          out.push({ x: d.x, z: d.z, what: 'the station', dig: d.r + 0.3, wall: d.r + 0.2, footing: d.r + 0.5, roof: d.r, grown: true });
        }
      }
    }
  });

  // ── Standing the track up and taking it down ──────────────────────────────
  const shown = new Map(); // key -> { key, x, z, r, object }
  let queue = [];
  function wanted(at) {
    const out = [];
    for (const line of near(at.x, at.z, SHOW)) {
      const count = pieceCount(line);
      for (let p = 0; p < count; p++) {
        const [i0, i1] = pieceRange(line, p);
        const mid = Math.floor((i0 + i1) / 2) % line.n;
        const x = line.x[mid];
        const z = line.z[mid];
        const d = Math.hypot(x - at.x, z - at.z) - PIECE / 2;
        if (d < SHOW) out.push({ key: `${line.id}#${p}`, x, z, r: PIECE / 2, d, build: () => buildPiece(line, p, ground, material) });
      }
      for (const st of line.stations) {
        const d = Math.hypot(st.x - at.x, st.z - at.z) - PLATFORM;
        if (d < SHOW) out.push(stationEntry(line, st, d));
      }
    }
    return out;
  }
  const stationEntry = (line, st, d = 0) => ({ key: st.id, x: st.x, z: st.z, r: PLATFORM + 6, d, build: () => buildStation(line, st, ground, material, glow) });
  function show(entry) {
    if (shown.has(entry.key)) return;
    const built = entry.build();
    const e = { key: entry.key, x: entry.x, z: entry.z, r: entry.r, object: built.object, blockers: built.blockers || [] };
    scene.add(e.object);
    solids.set(e, built.solids);
    shown.set(e.key, e);
  }
  function hide(e) {
    scene.remove(e.object);
    e.object.traverse((o) => o.isMesh && o.geometry.dispose());
    solids.clear(e);
    shown.delete(e.key);
  }

  // The camera doesn't look through a station house's walls.
  player.cameraBlockers.push((origin, dir, max) => {
    let best = Infinity;
    for (const e of shown.values()) {
      if (!e.blockers.length || Math.hypot(origin.x - e.x, origin.z - e.z) > max + e.r + 10) continue;
      for (const b of e.blockers) best = Math.min(best, rayBox(origin, dir, b));
    }
    return best;
  });

  // ── The trains ────────────────────────────────────────────────────────────
  const smoke = new Smoke(scene);
  const trains = new Map(); // `${line.id}#${j}` -> { key, line, j, train, w, was, ... }
  const spare = [];
  function placeTrains(t) {
    const at = game.focus;
    const want = new Set();
    for (const line of near(at.x, at.z, TRAINS_SHOW, false)) {
      const tt = table(line);
      for (let j = 0; j < tt.trains; j++) {
        const key = `${line.id}#${j}`;
        const w = tt.where(j, t);
        pointAt(line, w.s - TRAIN_LEN / 2, _p);
        const mine = aboard && aboard.key === key;
        if (!mine && Math.hypot(_p.x - at.x, _p.z - at.z) > TRAINS_SHOW) continue;
        want.add(key);
        let e = trains.get(key);
        if (!e) {
          const train = spare.pop() || new Train({ material, glow });
          train.s = null;
          scene.add(train.object);
          e = { key, line, j, train, w: {}, was: null, puff: Math.random(), blew: {} };
          trains.set(key, e);
        }
        e.was = { ...e.w };
        Object.assign(e.w, w);
        e.train.place(line, w.s);
      }
    }
    for (const [key, e] of trains) {
      if (want.has(key)) continue;
      scene.remove(e.train.object);
      spare.push(e.train);
      trains.delete(key);
    }
  }
  game.addSystem({ name: 'trains', phase: 'input', update: () => placeTrains(clock()) });

  // Keep out of the cars: anyone standing where one comes is shouldered aside.
  function shoulder() {
    if (aboard) return;
    const p = player.pos;
    for (const e of trains.values()) {
      const head = e.train.cars[0].group.position;
      if (Math.hypot(head.x - p.x, head.z - p.z) > TRAIN_LEN + 10) continue;
      for (const car of e.train.cars) {
        const g = car.group;
        const yaw = g.rotation.y;
        const fx = Math.sin(yaw);
        const fz = Math.cos(yaw);
        const dx = p.x - g.position.x;
        const dz = p.z - g.position.z;
        const along = dx * fx + dz * fz;
        const across = dx * fz - dz * fx;
        const room = CAR_BOX.half + 0.32;
        if (Math.abs(along) > car.len / 2 || Math.abs(across) > room) continue;
        if (p.y > g.position.y + CAR_BOX.top || p.y < g.position.y - 2) continue;
        const push = Math.sign(across || 1) * room - across;
        p.x += fz * push;
        p.z -= fx * push;
        const vn = player.vel.x * fz - player.vel.z * fx;
        if (vn * Math.sign(across || 1) < 0) {
          player.vel.x -= fz * vn;
          player.vel.z += fx * vn;
        }
      }
    }
  }
  game.addSystem({ name: 'trains-in-the-way', phase: 'update', update: shoulder });

  // ── Riding ────────────────────────────────────────────────────────────────
  let aboard = null; // { key, line, j, car, seat }
  builder.idleWhile(() => aboard !== null);
  const seatPlace = {
    place(out) {
      const e = aboard && trains.get(aboard.key);
      if (!e) {
        out.x = player.pos.x;
        out.y = player.pos.y;
        out.z = player.pos.z;
        out.yaw = player.yaw;
        return;
      }
      e.train.seat(aboard.car, aboard.seat, _seat);
      out.x = _seat.x;
      out.y = _seat.y - SEAT_HIPS;
      out.z = _seat.z;
      out.yaw = _seat.yaw;
    },
  };
  const stationAt = (e) => (e.w.at >= 0 ? e.line.stations[e.w.at] : null);
  const nextStop = (e) => e.line.stations[e.w.at >= 0 ? (e.w.at + 1) % e.line.stations.length : e.w.next];

  function board(e, car, seat) {
    aboard = { key: e.key, line: e.line, j: e.j, car, seat };
    player.aboard = seatPlace;
    player.vel.set(0, 0, 0);
    player.character.seat(BENCH);
    hud.flash(`aboard, on ${e.line.name} · next stop ${nextStop(e).name}`, SAY);
    save.touch();
    tell();
  }

  // Off the train: onto the platform beside your car, if it's standing at
  // a station (or `anywhere`, when you're going somewhere else).
  function leave(anywhere = false) {
    if (!aboard) return false;
    const e = trains.get(aboard.key);
    const st = e && stationAt(e);
    if (!anywhere) {
      if (!e) return false;
      if (!st) {
        hud.flash(`next stop ${nextStop(e).name}, in ${when(e.w.due)} · get off there`, SAY);
        return false;
      }
    }
    const was = aboard;
    aboard = null;
    player.aboard = null;
    player.character.seat(null);
    player.vel.set(0, 0, 0);
    if (st) {
      const car = e.train.cars[was.car].group.position;
      nearest(e.line, car.x, car.z, _n);
      const spot = platformSpot(e.line, st, _n.s - st.s);
      player.pos.set(spot.x, player.groundAt(spot.x, spot.z), spot.z);
      player.yaw = spot.yaw + Math.PI;
      player.grounded = true;
    }
    save.touch();
    tell();
    return true;
  }

  // A spot on a station's platform, `along` m from its middle: where you
  // stand, and the way that faces the track.
  function platformSpot(line, st, along = 0) {
    const a = Math.max(-PLATFORM + 2, Math.min(PLATFORM - 2, along));
    pointAt(line, st.s + a, _p);
    const off = (PLATFORM_EDGE + PLATFORM_W / 2) * st.side;
    return { x: _p.x + _p.dz * off, z: _p.z - _p.dx * off, yaw: Math.atan2(-_p.dz * st.side, _p.dx * st.side) };
  }

  // The car you could climb into from where you are: the nearest coach of
  // a train that's here, and the seat nearest you in it.
  function coachNear() {
    let best = null;
    const p = player.pos;
    for (const e of trains.values()) {
      for (const c of COACHES) {
        const g = e.train.cars[c].group;
        if (Math.abs(g.position.y - p.y) > 3) continue;
        const yaw = g.rotation.y;
        const fx = Math.sin(yaw);
        const fz = Math.cos(yaw);
        const dx = p.x - g.position.x;
        const dz = p.z - g.position.z;
        const along = Math.max(0, Math.abs(dx * fx + dz * fz) - e.train.cars[c].len / 2);
        const across = Math.max(0, Math.abs(dx * fz - dz * fx) - CAR_BOX.half);
        const d = Math.hypot(along, across);
        if (d < BOARD && (!best || d < best.d)) best = { e, car: c, d };
      }
    }
    if (!best) return null;
    let seat = 0;
    let sd = Infinity;
    for (let k = 0; k < SEATS; k++) {
      best.e.train.seat(best.car, k, _seat);
      const d = Math.hypot(_seat.x - p.x, _seat.z - p.z) + (taken(best.e.key, best.car, k) ? 50 : 0);
      if (d < sd) {
        sd = d;
        seat = k;
      }
    }
    best.seat = seat;
    return best;
  }

  // ── Y: the stations, getting on and getting off ───────────────────────────
  // The stations are a tab beside the map.
  const showing = () => map.isOpen && map.tab === 'rail';
  const panel = new StationPanel({ onPick: (id) => go(id), showing, onClose: () => map.close() });
  map.addTab({
    id: 'rail',
    label: 'stations',
    el: panel.el,
    shown() {
      lines.prefetch(player.pos.x, player.pos.z, REACH);
      refreshPanel();
    },
  });
  function press() {
    if (aboard) return void leave();
    const c = coachNear();
    if (c) {
      if (c.e.w.v < STOOD) return board(c.e, c.car, c.seat);
      return hud.flash('wait for it to stop at a station');
    }
    map.open('rail');
  }
  commands.add({ id: 'railway', keys: ['KeyY', 'PadY'], group: 'WANDER', label: 'railway: stations to go to · get on a train · get off', run: press });

  // on a touch screen, a button to get on and off, when there's a train
  const act = document.createElement('button');
  act.type = 'button';
  act.id = 'act-train';
  act.hidden = true;
  act.textContent = 'board';
  act.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    press();
  });
  document.getElementById('touch-act')?.prepend(act);

  // Off to a station: onto its platform, facing the track.
  let arriving = null;
  function go(id) {
    const st = lines.byId(id);
    const line = st && lineOf(st);
    if (!st || !line || !stands(line)) return false;
    if (player.carrier) {
      hud.flash('get down first (Z)');
      return false;
    }
    if (aboard) leave(true);
    map.close();
    show(stationEntry(line, st));
    const spot = platformSpot(line, st);
    // looking along the platform, the track to one side: whichever way a
    // train comes, it comes into view
    spot.cam = spot.yaw + Math.PI + 1.15 * st.side;
    player.spawn(spot.x, spot.z, spot.yaw, spot.cam);
    player.camPitch = 0.22;
    arriving = { st, spot, frames: 0 };
    reached.add(st.id);
    const due = table(line).due(st.k, clock());
    hud.flash(`${st.name}, on ${line.name} · ${due.wait < 1 ? `a train is in, leaving in ${when(due.leaves)}` : `the next train is in ${when(due.wait)}`}`, SAY);
    return true;
  }

  // ── Everyone else here ────────────────────────────────────────────────────
  // They're told which train you're on, and you see them on theirs.
  const riders = new Map(); // peer id -> { key, car, seat }
  function tell() {
    save.say('train', aboard ? { line: aboard.line.id, train: aboard.j, car: aboard.car, seat: aboard.seat } : { line: null });
  }
  const taken = (key, car, seat) => {
    for (const r of riders.values()) if (r.key === key && r.car === car && r.seat === seat) return true;
    return false;
  };
  save.on('message', (msg) => {
    if (msg.ch !== 'train') return;
    const b = msg.body || {};
    const ok = typeof b.line === 'string' && Number.isInteger(b.train) && COACHES.includes(b.car) && Number.isInteger(b.seat) && b.seat >= 0 && b.seat < SEATS;
    if (ok) riders.set(msg.from, { key: `${b.line}#${b.train}`, car: b.car, seat: b.seat });
    else unseat(msg.from);
  });
  function unseat(id) {
    riders.delete(id);
    const p = peers && peers.get(id);
    if (p) p.character.seat(null);
  }
  if (peers) peers.on('change', () => aboard && tell());
  function seatRiders() {
    if (!peers) return;
    for (const [id, r] of riders) {
      const p = peers.get(id);
      if (!p) {
        riders.delete(id);
        continue;
      }
      const e = trains.get(r.key);
      if (!e) {
        if (p.character.seated) p.character.seat(null);
        continue;
      }
      e.train.seat(r.car, r.seat, _seat);
      const ch = p.character;
      if (ch.seated !== BENCH) ch.seat(BENCH);
      ch.root.position.set(_seat.x, _seat.y - SEAT_HIPS, _seat.z);
      ch.root.rotation.y = _seat.yaw;
      p.flag.position.set(_seat.x, _seat.y + 1.35, _seat.z);
    }
  }

  // ── Saving: which train you're on, so you're still on it next time ────────
  let pending = null;
  save.register({
    id: 'train',
    scope: 'yours',
    collect: () => (aboard ? { line: aboard.line.id, train: aboard.j, car: aboard.car, seat: aboard.seat } : null),
    validate: (r) => (r && typeof r.line === 'string' && Number.isInteger(r.train) && COACHES.includes(r.car) && Number.isInteger(r.seat) && r.seat >= 0 && r.seat < SEATS ? r : null),
    restore(r) {
      pending = null;
      const line = r && lines.byId(r.line);
      if (!line || !stands(line) || r.train >= table(line).trains) return;
      // the train has gone on without you: you open where it is now
      const w = table(line).where(r.train, clock());
      pointAt(line, w.s - TRAIN_LEN / 2, _p);
      player.arrival = { x: _p.x, z: _p.z, yaw: Math.atan2(_p.dx, _p.dz) };
      pending = r;
    },
  });
  game.on('ready', () => {
    if (!pending) return;
    const r = pending;
    pending = null;
    placeTrains(clock());
    const e = trains.get(`${r.line}#${r.train}`);
    if (e) board(e, r.car, r.seat);
  });

  // ── On the map ────────────────────────────────────────────────────────────
  const places = new Map();
  function asPlace(line, st) {
    let p = places.get(st.id);
    if (p) return p;
    const tt = table(line);
    const every = Math.round(tt.period / tt.trains / 60);
    p = { id: st.id, x: st.x, z: st.z, name: st.name, kind: 'station', note: `on ${line.name} · a train about every ${every} minutes`, glyph: STATION_GLYPH, visited: false, shape: st.shape.map((r) => corners(st, r)) };
    places.set(st.id, p);
    return p;
  }
  map.places.addSource({
    within(x0, z0, x1, z1) {
      const out = [];
      for (const line of lines.within(x0, z0, x1, z1, false)) {
        if (!stands(line)) continue;
        for (const st of line.stations) if (st.x >= x0 && st.x <= x1 && st.z >= z0 && st.z <= z1) out.push(asPlace(line, st));
      }
      return out;
    },
    get(id) {
      if (!String(id).startsWith('station:')) return null;
      const st = lines.byId(id);
      const line = st && lineOf(st);
      return line && stands(line) ? asPlace(line, st) : null;
    },
  });
  map.addLayer(
    railLayer(() => {
      const at = player.pos;
      const t = clock();
      const known = lines.known(at.x, at.z, REACH).filter(stands);
      const marks = [];
      for (const line of known) {
        const tt = table(line);
        for (let j = 0; j < tt.trains; j++) {
          pointAt(line, tt.where(j, t).s - TRAIN_LEN / 2, _p);
          marks.push({ x: _p.x, z: _p.z, dx: _p.dx, dz: _p.dz, len: TRAIN_LEN });
        }
      }
      return { lines: known, trains: marks };
    }),
  );

  // ── Sound ─────────────────────────────────────────────────────────────────
  const heard = { heard: [], whistles: [] };
  sound.addLayer(trainSounds(heard));
  const blow = (e, pattern) => heard.whistles.push({ id: e.key, pattern });
  // where each line crosses a footpath, for the whistle
  const crossings = new Map();
  function crossingsOf(line) {
    let list = crossings.get(line.id);
    if (list) return list;
    list = [];
    let run = -1;
    for (let i = 0; i <= line.n; i++) {
      const k = i % line.n;
      gen.pathMask(line.x[k], line.z[k]);
      const on = i < line.n && gen.pathEdgeMain < 0;
      if (on && run < 0) run = i;
      if (!on && run >= 0) {
        const s = ((run + i - 1) / 2) * line.ds;
        if (line.stations.every((st) => Math.abs(ahead(st.s, s, line.length) - line.length / 2) < line.length / 2 - 80)) list.push(s);
        run = -1;
      }
    }
    crossings.set(line.id, list);
    return list;
  }

  // ── Every frame ───────────────────────────────────────────────────────────
  let lookIn = 0;
  let prefetchIn = 0;
  let panelIn = 0;
  let cued = false;
  const reached = new Set();
  game.addSystem({
    name: 'railway',
    phase: 'world',
    update({ dt }) {
      const at = game.focus;
      // whistles not heard last frame (the sound off) are let go
      heard.whistles.length = 0;
      // what's stood up round you
      lookIn -= dt;
      if (lookIn <= 0) {
        lookIn = LOOK_EVERY;
        const want = wanted(at);
        const keys = new Set(want.map((w) => w.key));
        queue = want.filter((w) => !shown.has(w.key)).sort((a, b) => a.d - b.d);
        for (const e of shown.values()) if (!keys.has(e.key) && Math.hypot(e.x - at.x, e.z - at.z) - e.r > HIDE) hide(e);
      }
      const t0 = performance.now();
      while (queue.length && (performance.now() - t0 < BUILD_MS || arriving)) {
        show(queue.shift());
        if (arriving) break;
      }
      // the lines further off, a little at a time
      prefetchIn -= dt;
      if (prefetchIn <= 0) {
        prefetchIn = PREFETCH_EVERY;
        lines.prefetch(at.x, at.z, REACH);
      }
      if (lines.queue.size) lines.pump(map.isOpen ? PUMP_MS[1] : PUMP_MS[0]);
      if (showing()) {
        panelIn -= dt;
        if (panelIn <= 0) refreshPanel();
      }

      // just arrived somewhere: stand on the platform once it's there
      if (arriving) {
        arriving.frames++;
        const { spot } = arriving;
        player.pos.x = spot.x;
        player.pos.z = spot.z;
        if (chunks.isFullyLoaded() || arriving.frames > 240) {
          player.spawn(spot.x, spot.z, spot.yaw, spot.cam);
          arriving = null;
        }
      }

      // the trains: smoke, whistles, and how they sound
      const list = [];
      for (const e of trains.values()) {
        const w = e.w;
        const was = e.was || w;
        steam(e, dt);
        if (w.at >= 0 && w.leaves < 1.4 && !e.blew.leave) {
          e.blew.leave = true;
          blow(e, 'leave');
        }
        if (w.at < 0) e.blew.leave = false;
        if (w.at < 0 && w.due < NEAR_WHISTLE && e.blew.near !== w.next) {
          e.blew.near = w.next;
          blow(e, 'near');
        }
        if (w.at < 0 && w.v > 5) {
          for (const c of crossingsOf(e.line)) {
            const d = ahead(w.s, c, e.line.length);
            if (d > CROSSING[0] && d < CROSSING[1] && e.blew.crossing !== c) {
              e.blew.crossing = c;
              blow(e, 'crossing');
            }
          }
        }
        // arriving, with you aboard
        if (aboard && aboard.key === e.key && w.at >= 0 && was.at < 0) hud.flash(`${e.line.stations[w.at].name} · Y to get off`, SAY);
        const h = e.heard || (e.heard = { id: e.key, d: 0, stack: new THREE.Vector3(), mid: new THREE.Vector3(), v: 0, odo: 0, braking: false });
        e.train.stack(h.stack);
        e.train.middle(h.mid);
        h.d = h.mid.distanceTo(camera.position);
        h.v = w.v;
        h.odo = e.train.turned;
        h.braking = w.at < 0 && w.v < (was.v ?? w.v) - 1e-4;
        list.push(h);
      }
      list.sort((a, b) => a.d - b.d);
      heard.heard = list.slice(0, HEARD);
      smoke.update(dt, SHARED.uWind.value);
      seatRiders();

      // coming to a station on foot
      if (!aboard) {
        for (const line of near(at.x, at.z, 40, false)) {
          for (const st of line.stations) {
            if (reached.has(st.id) || Math.hypot(st.x - at.x, st.z - at.z) > ARRIVE) continue;
            reached.add(st.id);
            if (!game.marks || game.marks.tracked !== st.id) hud.flash(`${st.name} · ${line.name}`);
          }
        }
      }
      cue();
    },
  });

  // Smoke from the stack: thick and grey working hard, a thin white wisp
  // standing.
  function steam(e, dt) {
    const w = e.w;
    const working = w.v > STOOD;
    const rate = working ? Math.min(PUFFS_MOST, (4 * w.v) / DRIVER_TURN) : 2.2;
    e.puff += dt * rate;
    if (e.puff < 1) return;
    e.puff -= Math.floor(e.puff);
    pointAt(e.line, w.s, _p);
    const stack = e.train.stack(_v);
    const pulling = working && w.v < 9;
    const up = working ? 2.2 + Math.random() * 0.8 : 0.9 + Math.random() * 0.4;
    smoke.puff(stack, _p.dx * w.v * 0.55, up, _p.dz * w.v * 0.55, working ? (pulling ? 1.5 : 1.1) : 0.55, working ? 0.6 : 0.1);
  }

  // What Y would do here, said in place of the tool's prompt.
  function cue() {
    const K = (word) => (input.isTouch ? word : 'Y');
    let html = '';
    let word = '';
    if (aboard) {
      const e = trains.get(aboard.key);
      if (e) {
        const st = stationAt(e);
        if (st) {
          word = 'get off';
          html = `<b>${K(word)}</b> get off at ${st.name} · it leaves in ${when(e.w.leaves)}`;
        } else html = `next stop ${nextStop(e).name} · ${when(e.w.due)}`;
      }
    } else {
      const c = coachNear();
      if (c && c.e.w.v < STOOD) {
        word = 'board';
        html = `<b>${K(word)}</b> get on · ${c.e.line.name} · next stop ${nextStop(c.e).name}`;
      } else if (c) html = 'the train is moving';
    }
    if (html) hud.cue({ html });
    else if (cued) hud.cue(null);
    cued = !!html;
    act.hidden = !input.isTouch || !word;
    if (word && act.textContent !== word) act.textContent = word;
  }

  // The panel's list: the stations within reach, nearest first, and when
  // the next train is due at each.
  function refreshPanel() {
    panelIn = 0.5;
    const p = player.pos;
    const t = clock();
    const rows = [];
    for (const line of lines.known(p.x, p.z, REACH)) {
      if (!stands(line)) continue;
      const tt = table(line);
      line.stations.forEach((st, k) => {
        const d = Math.hypot(st.x - p.x, st.z - p.z);
        if (d > REACH) return;
        const due = tt.due(k, t);
        rows.push({
          id: st.id,
          name: st.name,
          line: line.name.replace(/^the /, ''),
          d,
          far: d < 30 ? '' : formatDistance(d),
          way: compass(p.x, p.z, st.x, st.z),
          due: due.wait < 1 ? `a train is in · leaves ${when(due.leaves)}` : `next train ${when(due.wait)}`,
          here: d < 30,
        });
      });
    }
    rows.sort((a, b) => a.d - b.d);
    panel.show(
      rows.slice(0, LISTED).map(({ d, ...r }) => r),
      lines.queue.size > 0,
    );
  }

  // ── From the console ──────────────────────────────────────────────────────
  game.provide('railway', {
    lines,
    trains,
    shown,
    get aboard() {
      return aboard ? { line: aboard.line.id, train: aboard.j, car: aboard.car, seat: aboard.seat } : null;
    },
    // the stations within r of you, nearest first, and when trains are due
    list(r = REACH) {
      const p = player.pos;
      const t = clock();
      const out = [];
      for (const line of near(p.x, p.z, r)) {
        const tt = table(line);
        line.stations.forEach((st, k) => {
          const due = tt.due(k, t);
          out.push({ id: st.id, name: st.name, line: line.name, x: Math.round(st.x), z: Math.round(st.z), dist: Math.round(Math.hypot(st.x - p.x, st.z - p.z)), due: Math.round(due.wait), leaves: Math.round(due.leaves) });
        });
      }
      return out.sort((a, b) => a.dist - b.dist);
    },
    go,
    board: () => press(),
    getOff: () => leave(),
    // (for trying things out) the next train to stand at a station in `in` s
    soon(id, inSeconds = 5) {
      const st = lines.byId(id);
      if (!st) return null;
      const due = table(lineOf(st)).due(st.k, clock());
      if (due.wait > inSeconds) shift += due.wait - inSeconds;
      return Math.round(table(lineOf(st)).due(st.k, clock()).wait * 10) / 10;
    },
    wait(seconds) {
      shift += seconds;
    },
    panel,
  });
}

// m:ss, for a wait
function when(s) {
  const t = Math.max(0, Math.round(s));
  if (t >= 600) return `${Math.round(t / 60)} min`;
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

const WAYS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
function compass(x, z, tx, tz) {
  const a = Math.atan2(tx - x, -(tz - z));
  return WAYS[((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8];
}

// A plan rectangle's corners in the world, for the map to draw.
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

// How far along a ray (origin, dir: THREE.Vector3s) it meets an upright box
// turned to a yaw ({ x, y, z, half, yaw }), or Infinity. A ray that starts
// inside one isn't stopped by it.
function rayBox(origin, dir, b) {
  const c = Math.cos(b.yaw);
  const s = Math.sin(b.yaw);
  const ox = origin.x - b.x;
  const oz = origin.z - b.z;
  const o = [ox * c - oz * s, origin.y - b.y, ox * s + oz * c];
  const d = [dir.x * c - dir.z * s, dir.y, dir.x * s + dir.z * c];
  let t0 = 0;
  let t1 = Infinity;
  for (let a = 0; a < 3; a++) {
    const h = b.half[a];
    if (Math.abs(d[a]) < 1e-9) {
      if (o[a] < -h || o[a] > h) return Infinity;
      continue;
    }
    let u = (-h - o[a]) / d[a];
    let v = (h - o[a]) / d[a];
    if (u > v) [u, v] = [v, u];
    t0 = Math.max(t0, u);
    t1 = Math.min(t1, v);
    if (t0 > t1) return Infinity;
  }
  const inside = Math.abs(o[0]) < b.half[0] && Math.abs(o[1]) < b.half[1] && Math.abs(o[2]) < b.half[2];
  return inside ? Infinity : t0;
}
