// Cars: a dealership beside most of the towns people live in that a road
// comes to (roads/), with one of each car it sells out on its lot. Walk up to
// one and press F (the act key), and it's yours, on a handshake; you're in
// the driving seat.
// Drive it down the road to the next town, or off the road as far as it will
// take the rough; leave it anywhere, and it waits there. It's on the map, and
// `go here` on it puts you beside its door.
//
//   kinds.js      the cars: what each is called, its size, how it drives
//   drive.js      the physics of driving one over the land
//   models.js     what a car looks like
//   dealers.js    where the dealerships are, grown from the seed beside a town's road
//   lot.js        what a dealership looks like: the lot, the showroom, the sign
//   sound.js      the engine, the tyres, the door, the horn
//
// Nothing about the land changes for a dealership (see dealers.js), and
// nothing about it is saved but which you've been to. Your car is yours: what
// it is, where you left it and whether you're in it are saved, and in a
// shared world the others see you drive by in it.
//
// From the console:
//   world.cars.list()           the dealerships found within reach, nearest first
//   await world.cars.go()       onto the lot of the nearest dealership (or the one with an id)
//   world.cars.buy('bramble')   the car of that kind on the lot you're at: yours, and you're in it
//   world.cars.mine             your car: what it is and where
//   world.cars.getIn() · getOut()

import * as THREE from 'three';
import { Dealers, hasDealer, lotTop, clearOf, LOT, SKIRT, OUT_OF_TOWN } from './dealers.js';
import { buildLot, SHOWROOM } from './lot.js';
import { CarModel } from './models.js';
import { Car } from './drive.js';
import { KINDS, priceOf } from './kinds.js';
import { carSounds } from './sound.js';
import { Body } from '../people/body.js';
import { onPlan, planDiscs, toWorld } from '../world/frame.js';
import { VEG_STRIDE } from '../world/flora.js';
import { GridNearest, ListNearest, MergeNearest } from '../core/nearest.js';
import { segDist, wrapAngle, waterSample } from '../core/geom.js';
import { formatDistance } from '../core/format.js';
import { SEAT_HIPS } from '../player/character.js';
import { SKY } from '../render/uniforms.js';
import { mulberry32 } from '../noise.js';

const SHOW = 260; // m: a dealership this close is stood up...
const HIDE = 330; // ...and taken down past this
const REACH = 3000; // m round you whose dealerships are looked for, in the background
// Put somewhere else by something else (R, the map's `go here`), further than
// this (m) from where the car had you: out you get, and it stays (the mover's
// slack: player/rides.ts).
const MOVED = 3;
const PREFETCH_EVERY = 2; // s between asking for the ones round you
const BUY_REACH = 1.6; // m from the side of a car on a lot that you can buy it from
const DOOR_REACH = 1.8; // m from the side of your car that you can get in from
const GET_OUT = 2; // m/s: slower than this, you can get out
const AROUND = 40; // m round the car within which the roads are looked at, each frame
const BEHIND = 1.8; // 1/s: how quickly the camera swings round behind the car
const BACK = [2.6, 0.1, 5]; // m further back the camera sits: standing, for each m/s, and at most
const KEEP_SAVED = 5; // s between saving where the car is, while you drive
const GREET = 11; // m from the salesperson they say hello from
const GREET_AGAIN = 120; // s before they say it again
const SAY = 4200; // ms a sentence stays up
const BEAM = 40; // the headlights' brightness, after dark (candela)
const DRIVE_UP = 0.6; // m: built things no higher than this over its wheels, a car drives up onto
const BAY_CLEAR = 3.5; // m: your car this close to a bay, its car on display isn't there
// Sitting at the wheel: knees up, feet forward to the pedals, hands on the wheel.
const DRIVE = { spread: 0.18, hang: 0.38, fwd: 0.55, lean: -0.12, reins: 0.85 };
// How far (m) plants of each kind are kept back from a lot.
const KEEP_BACK = { pine: 2, broad: 2.4, birch: 1.6, bush: 0.8, fern: 0.3, rock: 1.2, log: 2.2 };
const SCALED = { rock: true, log: true };
// a little car, side on, for the map's badges
export const CAR_GLYPH = ['.......', '..###..', '.#.#.#.', '#######', '#######', '.#...#.', '.......'];
const SAYS = {
  hello: ['Welcome! Have a look round — any of these can be yours.', 'Afternoon! Take your time, they’re all good runners.', 'Howdy! Looking for something to get about in?'],
  back: ['Back again? How’s she running?', 'Good to see you. Fancy a change?'],
  sold: ['She’s yours — keys are in it. Mind how you go!', 'Done! Shake on it. Drive her gently for the first hundred miles.', 'A fine choice. Enjoy the open road!'],
  trade: 'I’ll take your old one off your hands, no charge.',
};
const SALESFOLK = [
  { name: 'Ray', her: false },
  { name: 'Lorraine', her: true },
  { name: 'Duke', her: false },
  { name: 'Peggy', her: true },
  { name: 'Clint', her: false },
  { name: 'Babs', her: true },
];

const _w = waterSample();
const _seg = { d: 0, t: 0, nx: 0, nz: 0 };
const _s = { x: 0, y: 0, z: 0, yaw: 0 };
const _d = { x: 0, y: 0, z: 0, yaw: 0 };
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const nameOf = (kind) => KINDS[kind].name;

// The features this uses, so it is installed after them (game/features.js):
// the roads it sells cars for and drives on, and the towns beside which the
// dealerships stand; everything the roads keep clear of, the lots do too;
// and act, whose key (F) buys a car, gets you in and gets you out.
export const after = ['render', 'ui', 'world', 'player', 'audio', 'build', 'map', 'save', 'towns', 'railway', 'roads', 'act'];
export function installCars(game) {
  const { scene, gen, chunks, grass, solids, landforms, player, input, builder, map, hud, commands, save, sound, towns, railway, roads, peers, act } = game;
  const T = towns.towns;

  // ── Where the dealerships are ─────────────────────────────────────────────
  // Beside a town's road, clear of everything the roads keep clear of, the
  // roads themselves, and the towns and the rounds where their roads meet.
  const there = roads.there;
  const keepOff = clearOf({ gen, reaches: (x0, z0, x1, z1) => !!landforms.reaches(x0, z0, x1, z1), clear: there.clear, lines: railway.lines, towns: T });
  const dealers = new Dealers(gen, { towns: T, roads: roads.roads, stands: roads.stands, keepOff, ready: there.ready });

  // Not where something has been built, a fire laid or a stump left (anything
  // not grown from the seed). Asked once each, after the save is in.
  const standing = new Map();
  let asking = false;
  function stands(d) {
    let yes = standing.get(d.id);
    if (yes !== undefined) return yes;
    yes = true;
    asking = true;
    try {
      const r = Math.hypot(LOT[2] - LOT[0], LOT[3] - LOT[1]) / 2 + SKIRT;
      for (const o of builder.obstacles.near(d.x, d.z, r)) if (!o.grown && onPlan(d, o.x, o.z, SKIRT)) yes = false;
    } finally {
      asking = false;
    }
    standing.set(d.id, yes);
    return yes;
  }
  const found = (x0, z0, x1, z1, wait = false) => dealers.within(x0, z0, x1, z1, wait).filter(stands);

  // ── The forest round them ─────────────────────────────────────────────────
  const cleared = [[LOT[0] - SKIRT, LOT[1] - SKIRT, LOT[2] + SKIRT, LOT[3] + SKIRT]];
  function clearChunk(ch, list) {
    if (!ch.vegLists || !list.length) return;
    for (const kind in ch.vegLists) {
      const veg = ch.vegLists[kind];
      for (let o = 0, k = 0; o < veg.length; o += VEG_STRIDE, k++) {
        const scale = veg[o + 4];
        if (scale <= 0) continue;
        const back = (KEEP_BACK[kind] ?? 0.6) * (SCALED[kind] ? scale : 1);
        if (list.some((d) => onPlan(d, veg[o], veg[o + 2], back, cleared))) chunks.hideInstance(ch, kind, k);
      }
    }
  }
  const chunkBox = (ch) => [ch.cx * chunks.size - 4, ch.cz * chunks.size - 4, ch.cx * chunks.size + chunks.size + 4, ch.cz * chunks.size + chunks.size + 4];
  chunks.on('vegetation', (ch) => clearChunk(ch, found(...chunkBox(ch))));
  dealers.onSite((d) => {
    if (!stands(d)) return;
    for (const ch of chunks.chunks.values()) {
      const b = chunkBox(ch);
      if (b[0] <= d.box[2] && b[2] >= d.box[0] && b[1] <= d.box[3] && b[3] >= d.box[1]) clearChunk(ch, [d]);
    }
    grass.invalidate(...d.box);
  });
  grass.addClearing((x0, z0, x1, z1) => {
    const list = found(x0, z0, x1, z1);
    if (!list.length) return null;
    return (x, z) => list.some((d) => onPlan(d, x, z, 0.1, cleared));
  });
  const discs = new Map();
  builder.obstacles.addSource((x, z, R, out) => {
    if (asking) return;
    for (const d of found(x - R - 30, z - R - 30, x + R + 30, z + R + 30)) {
      if (!discs.has(d.id)) discs.set(d.id, planDiscs({ ...d, plan: cleared }, 2.5));
      for (const c of discs.get(d.id)) {
        if (Math.hypot(c.x - x, c.z - z) > R + c.r + 1) continue;
        out.push({ x: c.x, z: c.z, what: d.name, dig: c.r + 0.3, wall: c.r + 0.2, footing: c.r + 0.5, roof: c.r, grown: true });
      }
    }
  });

  // ── Materials ─────────────────────────────────────────────────────────────
  const materials = {
    lot: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.02, side: THREE.DoubleSide }),
    glow: new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }),
    body: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.38, metalness: 0.25, side: THREE.DoubleSide }),
  };
  materials.lot.polygonOffset = true;
  materials.lot.polygonOffsetFactor = -1;
  const carMats = { body: materials.body, glow: materials.glow };
  const ground = (x, z) => gen.height(x, z) + (chunks.heightOffset ? chunks.heightOffset(x, z) : 0);

  // ── What's yours ──────────────────────────────────────────────────────────
  // mine: { kind, paint, x, z, yaw, from (the dealership's id) }, or null
  let mine = null;
  let driving = false;
  let model = null; // your car's model, in the scene while you have one
  const been = new Set(); // the dealerships you've been to
  const parked = {}; // (the solids of your car standing still)
  // Have this car (or none), where it says, standing there.
  function own(c) {
    if (model) {
      scene.remove(model.object);
      solids.clear(parked);
      model = null;
    }
    mine = c;
    if (!mine) return;
    model = new CarModel(mine.kind, mine.paint, carMats);
    scene.add(model.object);
    settle();
  }

  // Your car, standing where you left it, on whatever is under it now (a
  // road surveyed since it was put there, say).
  function settle() {
    if (!mine || driving) return;
    lookRound(mine.x, mine.z);
    car.use(mine.kind);
    car.place(mine.x, mine.z, mine.yaw);
    park();
  }

  // ── Driving ───────────────────────────────────────────────────────────────
  // What's under the car, and what it runs into (drive.js's ground).
  let here = { roads: [], gates: [] };
  let lots = [];
  let streets = [];
  const _g = { y: 0, kind: 'ground', water: 0 };
  const carGround = {
    at(x, z, out) {
      out.water = 0;
      const r = roads.under(x, z, here);
      if (r) {
        out.y = r.top;
        out.kind = r.surface;
        return out;
      }
      for (const d of lots) {
        const top = lotTop(d, x, z, ground);
        if (top !== null) {
          out.y = top;
          out.kind = 'paved';
          return out;
        }
      }
      out.y = chunks.heightAt(x, z);
      out.kind = streets.some((t) => onPlan(t, x, z, 0, [t.street])) ? 'gravel' : 'ground';
      if (chunks.waterAt(x, z, _w) && _w.depth > 0) out.water = _w.depth;
      // anything built low enough to drive up onto (a boardwalk, a deck)
      solids.forEachNear(x, z, 0.5, (s) => {
        if (s === parkedSolid) return;
        segDist(x, z, s.ax, s.az, s.bx, s.bz, _seg);
        if (_seg.d > s.r) return;
        const top = s.topA + (s.topB - s.topA) * _seg.t;
        if (top > out.y && top <= car.y + DRIVE_UP) {
          out.y = top;
          out.kind = 'paved';
          out.water = 0;
        }
      });
      return out;
    },
    // trunks and boulders, and anything built that stands higher than it can drive over
    hit(x, y, z, r, out) {
      let best = 0;
      chunks.forEachCollider(x, z, (cx, cz, cr) => {
        const dx = x - cx;
        const dz = z - cz;
        const d = Math.hypot(dx, dz);
        const depth = cr + r - d;
        if (depth <= best || d < 1e-5) return;
        best = depth;
        out.nx = dx / d;
        out.nz = dz / d;
        out.depth = depth;
        out.what = cr >= 0.5 ? 'a boulder' : 'a tree';
      });
      solids.forEachNear(x, z, 1.5 + r, (s) => {
        if (s === parkedSolid) return;
        segDist(x, z, s.ax, s.az, s.bx, s.bz, _seg);
        const depth = s.r + r - _seg.d;
        if (depth <= best) return;
        const top = s.topA + (s.topB - s.topA) * _seg.t;
        // (low enough, it's driven up onto: see at())
        if (top <= y + DRIVE_UP || y + 1.4 < s.bottom) return;
        best = depth;
        out.nx = _seg.nx;
        out.nz = _seg.nz;
        out.depth = depth;
        out.what = 'something built';
      });
      return best > 0;
    },
  };
  const car = new Car('wren', carGround);
  let parkedSolid = null;
  let bumped = 0;
  car.on('bump', (v) => {
    if (performance.now() - bumped < 400) return;
    bumped = performance.now();
    sound.sfx('car-bump', { gain: Math.min(1, v / 12) });
    if (v > 6) hud.flash('crunch', 900);
  });
  car.on('deep', () => hud.flash('too deep to drive through', 1600));
  let steep = 0;
  car.on('steep', () => {
    if (performance.now() - steep > 3000) hud.flash(`too steep for the ${nameOf(car.kind)}`, 1600);
    steep = performance.now();
  });
  car.on('land', (hard) => hard > 0.3 && sound.sfx('car-bump', { gain: hard * 0.6 }));

  // What's round the car: the roads, the lots and the towns' streets, once a frame.
  function lookRound(x, z) {
    here = roads.around(x, z, AROUND);
    lots = found(x - 60, z - 60, x + 60, z + 60);
    streets = T.within(x - 60, z - 60, x + 60, z + 60, false);
  }

  // The car while it stands: something you bump into, not walk through.
  function park() {
    solids.clear(parked);
    if (!mine) return;
    const k = KINDS[mine.kind];
    const fx = Math.sin(car.yaw);
    const fz = Math.cos(car.yaw);
    const half = Math.max(0, k.len / 2 - k.wide / 2);
    parkedSolid = { ax: car.x - fx * half, az: car.z - fz * half, bx: car.x + fx * half, bz: car.z + fz * half, r: k.wide / 2, topA: car.y + k.tall, topB: car.y + k.tall, bottom: car.y - 0.3 };
    solids.set(parked, [parkedSolid]);
    model.place(car);
  }

  // ── Saved: your car, where it is, whether you're in it; where you've been ──
  // (registered once the car is there to put it in)
  let pending = false; // in it when the save came in: back in it once the world is open
  save.register({
    id: 'car',
    scope: 'yours',
    local: 'marks',
    collect: () => ({ car: mine ? { ...mine, ...(driving ? { x: car.x, z: car.z, yaw: car.yaw } : {}), driving } : null, been: [...been].slice(-200) }),
    validate(raw) {
      const c = raw && raw.car;
      const num = (v) => typeof v === 'number' && Number.isFinite(v);
      const ok = c && typeof c === 'object' && KINDS[c.kind] && num(c.paint) && num(c.x) && num(c.z) && num(c.yaw);
      return {
        car: ok ? { kind: c.kind, paint: c.paint, x: c.x, z: c.z, yaw: c.yaw, from: typeof c.from === 'string' ? c.from : '', driving: c.driving === true } : null,
        been: raw && Array.isArray(raw.been) ? raw.been.filter((id) => typeof id === 'string').slice(-200) : [],
      };
    },
    restore(r) {
      if (driving) getOut(true);
      pending = false;
      been.clear();
      for (const id of r.been) been.add(id);
      if (!r.car) return own(null);
      const { driving: was, ...c } = r.car;
      own(c);
      if (was) {
        pending = true;
        player.arrival = { x: c.x, z: c.z, yaw: c.yaw };
      }
    },
  });
  game.on('ready', () => {
    if (!pending || !mine) return;
    pending = false;
    getIn();
  });

  const c = { throttle: 0, brake: 0, steer: 0 };
  let hold = null; // what you're held by while you drive (player/rides.ts)
  let savedIn = 0;
  const mover = {
    slack: MOVED,
    place(out, dt) {
      lookRound(car.x, car.z);
      if (input.blocked) Object.assign(c, { throttle: 0, brake: car.speed > 0.5 ? 1 : 0, steer: 0 });
      else {
        const ax = input.moveAxes();
        c.throttle = Math.max(0, ax.y);
        c.brake = Math.max(0, -ax.y);
        c.steer = ax.x;
        if (input.jumped()) sound.sfx('horn');
      }
      const wasWet = car.wet;
      car.step(dt, c);
      if (car.wet > 0.15 && wasWet <= 0.15 && car.speed > 2) sound.sfx('car-splash');
      model.place(car);
      model.seat(_s);
      out.x = _s.x;
      out.y = _s.y - SEAT_HIPS;
      out.z = _s.z;
      out.yaw = car.yaw;
      out.heading = car.yaw;
      out.grounded = !car.flying;
      out.behind = BEHIND;
      out.back = Math.min(BACK[2], BACK[0] + car.speed * BACK[1]);
      savedIn -= dt;
      if (savedIn <= 0) {
        savedIn = KEEP_SAVED;
        save.touch();
      }
    },
  };
  builder.idleWhile(() => driving);

  function getIn() {
    if (!mine || driving) return false;
    if (!player.rides.free) {
      hud.flash(player.rides.why());
      return false;
    }
    // (taken over by something else, or put somewhere else: out of the car, which stays where it is)
    hold = player.rides.take({ by: 'cars', what: () => `your ${nameOf(mine.kind)}`, aboard: mover, lost: () => getOut(true, false) });
    if (!hold) return false;
    settle();
    solids.clear(parked);
    parkedSolid = null;
    driving = true;
    model.seat(_s);
    player.pos.set(_s.x, _s.y - SEAT_HIPS, _s.z);
    player.vel.set(0, 0, 0);
    player.character.seat(DRIVE);
    sound.sfx('car-door');
    setTimeout(() => driving && sound.sfx('car-start'), 450);
    hud.flash(`in your ${nameOf(mine.kind)} · W drive · S brake, back up · A D steer · space the horn · ${act.key('get out')}, stopped, to get out`, SAY + 1500);
    save.touch();
    tell();
    return true;
  }

  // Out, beside the driver's door (stopped, unless `force`: you were taken
  // somewhere else, and `place` false: you're left where that put you).
  function getOut(force = false, place = true) {
    if (!driving) return false;
    if (!force && car.speed > GET_OUT) {
      hud.flash('stop first (S)');
      return false;
    }
    driving = false;
    car.v = 0;
    mine.x = car.x;
    mine.z = car.z;
    mine.yaw = car.yaw;
    // (unless something else has you now)
    if (hold && hold.held) player.vel.set(0, 0, 0);
    if (hold) hold.release();
    hold = null;
    if (player.character.seated === DRIVE) player.character.seat(null);
    park();
    if (place) {
      way();
      player.pos.set(_d.x, player.groundAt(_d.x, _d.z), _d.z);
      player.yaw = _d.yaw;
      player.grounded = true;
    }
    sound.sfx('car-door');
    save.touch();
    tell();
    return true;
  }

  // The way out of your car (into _d): by the driver's door, or if a trunk,
  // a wall or a drop is there, the other door, or behind it, or in front.
  function way() {
    for (const side of [1, -1, 0, 2]) {
      model.door(_d, side);
      let clear = Math.abs(chunks.heightAt(_d.x, _d.z) - car.y) < 1.2 && !(chunks.waterAt(_d.x, _d.z, _w) && _w.depth > 0.6);
      if (clear) chunks.forEachCollider(_d.x, _d.z, (cx, cz, r) => Math.hypot(cx - _d.x, cz - _d.z) < r + 0.45 && (clear = false));
      if (clear) solids.forEachNear(_d.x, _d.z, 1, (sd) => {
        if (sd === parkedSolid) return;
        segDist(_d.x, _d.z, sd.ax, sd.az, sd.bx, sd.bz, _seg);
        const top = sd.topA + (sd.topB - sd.topA) * _seg.t;
        if (_seg.d < sd.r + 0.35 && top > car.y + 0.4 && sd.bottom < car.y + 1.5) clear = false;
      });
      if (clear) return _d;
    }
    return model.door(_d, 1);
  }

  // How far you are from the side of a car standing at (x, z, yaw) of a kind.
  function fromSide(kind, x, z, yaw) {
    const k = KINDS[kind];
    const p = player.pos;
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    const dx = p.x - x;
    const dz = p.z - z;
    const along = Math.max(0, Math.abs(dx * fx + dz * fz) - k.len / 2);
    const across = Math.max(0, Math.abs(dx * fz - dz * fx) - k.wide / 2);
    return Math.hypot(along, across);
  }
  // how far you are from your car's side, if you're beside it and could get in
  const besideMine = () => {
    if (driving || !mine || !player.rides.free || Math.abs(player.pos.y - car.y) >= 2) return null;
    const d = fromSide(mine.kind, car.x, car.z, car.yaw);
    return d < DOOR_REACH ? d : null;
  };

  // ── The dealership you're at ──────────────────────────────────────────────
  // Stood up as you come near: the lot, the showroom, a car of each kind on
  // the lot and one in the showroom, and the salesperson.
  let at = null; // { site, built, cars: [{ kind, model, x, z, yaw, bay }], person, greeted }
  function standUp(d) {
    if (at && at.site === d) return;
    takeDown();
    const built = buildLot(d, ground, materials);
    scene.add(built.object);
    solids.set(built, built.solids);
    const cars = built.bays.map((bay) => {
      const w = toWorld(d, bay.x, bay.z);
      const m = new CarModel(bay.kind, d.paints[bay.kind], carMats);
      const yaw = d.yaw + bay.yaw;
      m.place({ x: w.x, y: d.top, z: w.z, yaw, pitch: 0, roll: 0, steer: 0, spin: 0 });
      scene.add(m.object);
      const k = KINDS[bay.kind];
      const fx = Math.sin(yaw);
      const fz = Math.cos(yaw);
      const half = k.len / 2 - k.wide / 2;
      return { kind: bay.kind, model: m, x: w.x, z: w.z, yaw, bay, solid: { ax: w.x - fx * half, az: w.z - fz * half, bx: w.x + fx * half, bz: w.z + fz * half, r: k.wide / 2, topA: d.top + k.tall, topB: d.top + k.tall, bottom: d.top - 0.3 } };
    });
    // one in the showroom, turned to show it off
    const rng = mulberry32(Math.floor(d.x * 13 + d.z * 7) >>> 0);
    const kinds = Object.keys(KINDS);
    const showKind = kinds[Math.floor(rng() * kinds.length)];
    const inside = new CarModel(showKind, KINDS[showKind].paints[Math.floor(rng() * KINDS[showKind].paints.length)], carMats);
    const iw = toWorld(d, built.inside.x, built.inside.z);
    inside.place({ x: iw.x, y: d.top + built.inside.y, z: iw.z, yaw: d.yaw + built.inside.yaw, pitch: 0, roll: 0, steer: 0, spin: 0 });
    scene.add(inside.object);
    const person = salesperson(d);
    scene.add(person.body.mesh);
    at = { site: d, built, cars, inside, person, greeted: false, solidsOwner: {} };
    shownCars();
  }
  function takeDown() {
    if (!at) return;
    scene.remove(at.built.object);
    solids.clear(at.built);
    solids.clear(at.solidsOwner);
    for (const c2 of at.cars) scene.remove(c2.model.object);
    scene.remove(at.inside.object);
    scene.remove(at.person.body.mesh);
    at = null;
  }
  // which of the cars on the lot are there (not the one you've just driven off in)
  function shownCars() {
    if (!at) return;
    let changed = at.cars.some((c2) => c2.gone === undefined);
    for (const c2 of at.cars) {
      const gone = !!mine && Math.hypot(car.x - c2.x, car.z - c2.z) < BAY_CLEAR;
      if (gone !== c2.gone) changed = true;
      c2.model.object.visible = !gone;
      c2.gone = gone;
    }
    if (changed) solids.set(at.solidsOwner, at.cars.filter((c2) => !c2.gone).map((c2) => c2.solid));
  }
  // A salesperson on the lot, in shirt sleeves and a tie.
  function salesperson(d) {
    const rnd = mulberry32(Math.floor(Math.abs(d.x * 31 + d.z * 17)) >>> 0);
    const who = SALESFOLK[Math.floor(rnd() * SALESFOLK.length)];
    const col = (hex) => new THREE.Color(hex);
    const look = {
      her: who.her,
      child: false,
      dark: false,
      height: 0.96 + rnd() * 0.08,
      build: 1.0 + rnd() * 0.15,
      skin: col([0xe8c4a8, 0xc68c6c, 0x8a5a3c, 0xdcae90, 0x6a4430][Math.floor(rnd() * 5)]),
      hair: col([0x2a2018, 0x6a4a2a, 0xb08a52, 0x8a8a84][Math.floor(rnd() * 4)]),
      shirt: col([0xeae6dc, 0xb8cce0, 0xf0e2c2][Math.floor(rnd() * 3)]),
      vest: null,
      legs: col([0x2c3440, 0x4a4038, 0x3a3a3c][Math.floor(rnd() * 3)]),
      dress: null,
      apron: false,
      coat: false,
      hat: null,
      hatColor: null,
      beard: false,
    };
    const body = new Body(look, Math.floor(rnd() * 1e9));
    const spot = { x: 5.2, z: 8.5 };
    const w = toWorld(d, spot.x, spot.z);
    body.mesh.position.set(w.x, d.top, w.z);
    body.mesh.rotation.y = d.yaw + Math.PI;
    return { who, body, spot, yaw: d.yaw + Math.PI };
  }
  let lastHello = -Infinity;
  let clock = 0;
  function say(line, wave = false) {
    if (!at) return;
    const p = at.person;
    hud.flash(`${p.who.name}: “${line}”`, SAY);
    const w = toWorld(at.site, p.spot.x, p.spot.z);
    sound.call('hello', w.x, at.site.top + 1.6, w.z, { pitch: p.who.her ? 1.25 : 0.85 });
    if (wave) p.body.waving = 1.8;
  }
  // the car on the lot you're beside, if any: { car, d }
  function onLot() {
    if (!at || driving || !player.rides.free) return null;
    let best = null;
    for (const c2 of at.cars) {
      if (c2.gone) continue;
      const d = fromSide(c2.kind, c2.x, c2.z, c2.yaw);
      if (d < BUY_REACH && Math.abs(player.pos.y - at.site.top) < 1.5 && (!best || d < best.d)) best = { car: c2, d };
    }
    return best;
  }

  function buy(c2) {
    if (!at || !c2) return false;
    const traded = mine ? nameOf(mine.kind) : null;
    own({ kind: c2.kind, paint: at.site.paints[c2.kind], x: c2.x, z: c2.z, yaw: c2.yaw, from: at.site.id });
    getIn();
    shownCars();
    say(`${pick(SAYS.sold)}${traded ? ` ${SAYS.trade}` : ''}`, true);
    return true;
  }

  // ── Buying, getting in, getting out: the act key (F) ──────────────────────
  act.offer({
    id: 'car',
    at() {
      if (driving) return { d: 0, word: 'get out', run: () => getOut() };
      const lot = onLot();
      const door = besideMine();
      if (lot && (door === null || lot.d < door)) return { d: lot.d, word: mine ? 'trade' : 'buy', run: () => buy(lot.car) };
      return door === null ? null : { d: door, word: 'get in', run: getIn };
    },
  });
  function cue() {
    let html = '';
    if (driving) {
      const k = `${Math.round(car.speed * 3.6)} km/h`;
      html = car.stopped ? `<b>${act.key('get out')}</b> get out · ${k}` : `${nameOf(car.kind)} · ${k}`;
    } else {
      const lot = onLot();
      if (lot) html = `<b>${act.key(mine ? 'trade' : 'buy')}</b> ${mine ? `trade in your ${nameOf(mine.kind)} for` : 'buy'} the ${nameOf(lot.car.kind)} · ${priceOf(lot.car.kind)} · ${KINDS[lot.car.kind].blurb}`;
      else if (besideMine() !== null) html = `<b>${act.key('get in')}</b> get into your ${nameOf(mine.kind)}`;
    }
    hud.cue(html ? { html } : null, 'cars');
  }
  commands.describe({ group: 'CARS', help: 'F', pad: ['PadY'], label: 'at a dealership: buy the car beside you · beside your car: get in · stopped: get out' });
  commands.describe({ group: 'CARS', help: 'W S · A D', pad: ['PadLS'], label: 'driving: go, brake and back up · steer' });
  commands.describe({ group: 'CARS', help: 'space', pad: ['PadA'], label: 'driving: the horn' });

  // ── Everyone else here ────────────────────────────────────────────────────
  // They're told what you're driving, and you see them in theirs.
  const others = new Map(); // peer id -> { kind, paint, model }
  function tell() {
    save.say('car', driving && mine ? { kind: mine.kind, paint: mine.paint } : { kind: null });
  }
  if (peers) peers.on('change', () => driving && tell());
  save.on('message', (msg) => {
    if (msg.ch !== 'car') return;
    const b = msg.body || {};
    const was = others.get(msg.from);
    if (was) scene.remove(was.model.object);
    others.delete(msg.from);
    const p = peers && peers.get(msg.from);
    if (!(KINDS[b.kind] && typeof b.paint === 'number')) {
      if (p) p.character.seat(null);
      return;
    }
    const m = new CarModel(b.kind, b.paint, carMats);
    scene.add(m.object);
    others.set(msg.from, { kind: b.kind, model: m });
  });
  function seatOthers() {
    for (const [id, o] of others) {
      const p = peers && peers.get(id);
      if (!p) {
        scene.remove(o.model.object);
        others.delete(id);
        continue;
      }
      const ch = p.character;
      if (ch.seated !== DRIVE) ch.seat(DRIVE);
      // the car round them: from where they sit back to its middle
      const s = KINDS[o.kind].seat;
      const yaw = ch.root.rotation.y;
      const cx = Math.cos(yaw);
      const sx = Math.sin(yaw);
      const r = ch.root.position;
      const x = r.x - (s.across * cx + s.along * sx);
      const z = r.z - (-s.across * sx + s.along * cx);
      o.model.place({ x, y: r.y + SEAT_HIPS - s.up, z, yaw, pitch: 0, roll: 0, steer: 0, spin: 0 });
    }
  }

  // ── On the map ────────────────────────────────────────────────────────────
  const places = new Map();
  function asPlace(d) {
    const visited = been.has(d.id);
    let p = places.get(d.id);
    if (p && p.visited === visited) return p;
    const corners = ([x0, z0, x1, z1]) =>
      [
        [x0, z0],
        [x1, z0],
        [x1, z1],
        [x0, z1],
      ].map(([u, v]) => {
        const w = toWorld(d, u, v);
        return [w.x, w.z];
      });
    p = {
      id: d.id,
      x: d.door.x,
      z: d.door.z,
      yaw: d.door.yaw,
      name: d.name,
      kind: 'car dealership',
      note: `cars for sale, on the road out of ${d.townName}`,
      glyph: CAR_GLYPH,
      visited,
      shape: [corners([SHOWROOM.x0, SHOWROOM.z0, SHOWROOM.x1, SHOWROOM.z1])],
      ground: [corners(LOT)],
    };
    places.set(d.id, p);
    return p;
  }
  // your car, where you left it: `go here` puts you beside its door
  let yours = null;
  function yourPlace() {
    if (!mine) return null;
    const x = driving ? car.x : mine.x;
    const z = driving ? car.z : mine.z;
    if (!yours || yours.kindOf !== mine.kind || yours.at !== `${x}:${z}`) {
      way();
      yours = { id: 'car:yours', kindOf: mine.kind, at: `${x}:${z}`, x: driving ? x : _d.x, z: driving ? z : _d.z, yaw: _d.yaw, name: `your ${nameOf(mine.kind)}`, kind: 'car', note: driving ? 'you’re in it' : 'where you left it', glyph: CAR_GLYPH, visited: false };
    }
    return yours;
  }
  map.places.addSource({
    within(x0, z0, x1, z1) {
      const out = found(x0 - 30, z0 - 30, x1 + 30, z1 + 30)
        .filter((d) => d.door.x >= x0 && d.door.x <= x1 && d.door.z >= z0 && d.door.z <= z1)
        .map(asPlace);
      const y = yourPlace();
      if (y && y.x >= x0 && y.x <= x1 && y.z >= z0 && y.z <= z1) out.push(y);
      return out;
    },
    get(id) {
      if (id === 'car:yours') return yourPlace();
      if (!String(id).startsWith('dealer:')) return null;
      const d = dealers.byId(id);
      return d && stands(d) ? asPlace(d) : null;
    },
    // a town at a time outward (a dealership is near its town)
    list: 'car dealerships',
    nearest: (x, z) =>
      new MergeNearest([
        new ListNearest(x, z, mine ? [yourPlace()] : []),
        new GridNearest(x, z, {
          size: T.size,
          spill: OUT_OF_TOWN,
          box(i, j) {
            const t = T.peek(i, j);
            return t === null || (t && !hasDealer(t, gen.seed)) ? null : undefined;
          },
          at(i, j) {
            const t = T.peek(i, j);
            if (t === undefined) return undefined;
            if (!t) return [];
            const d = dealers.peek(t);
            if (d === undefined) return undefined;
            return d && stands(d) ? [asPlace(d)] : [];
          },
        }),
      ]),
  });

  // ── Sound ─────────────────────────────────────────────────────────────────
  const heard = { car: null };
  sound.addLayer(carSounds(heard));

  // ── Every frame ───────────────────────────────────────────────────────────
  let prefetchIn = 0;
  let settleIn = 0;
  // (always in the scene, dark when it isn't wanted: a light coming and going
  // would have every material made again)
  const beam = new THREE.SpotLight(0xfff2d8, 0, 60, 0.5, 0.6, 1.5);
  beam.layers.enableAll();
  scene.add(beam, beam.target);
  // Where the dealerships are further off is looked for a little at a time, out
  // of what the frame can spare (game/budget.ts).
  game.budget.add({ name: 'cars', work: (ms) => dealers.pump(ms) });
  game.addSystem({
    name: 'cars',
    phase: 'world',
    update({ dt }) {
      clock += dt;
      const f = game.focus;
      // the dealerships further off, a little at a time
      prefetchIn -= dt;
      if (prefetchIn <= 0) {
        prefetchIn = PREFETCH_EVERY;
        dealers.prefetch(f.x, f.z, REACH);
      }
      // the one you're at
      let nearest = null;
      let nd = SHOW;
      for (const d of found(f.x - HIDE, f.z - HIDE, f.x + HIDE, f.z + HIDE)) {
        const dist = Math.hypot(d.x - f.x, d.z - f.z);
        if (dist < nd) {
          nd = dist;
          nearest = d;
        }
      }
      if (nearest) standUp(nearest);
      else if (at && Math.hypot(at.site.x - f.x, at.site.z - f.z) > HIDE) takeDown();
      if (at) {
        shownCars();
        // the salesperson looks round at you, and says hello as you come up
        const P = player.pos;
        const p = at.person;
        const w = toWorld(at.site, p.spot.x, p.spot.z);
        const near = Math.hypot(P.x - w.x, P.z - w.z);
        p.body.pose(dt, 0, near < 14 ? wrapAngle(Math.atan2(P.x - w.x, P.z - w.z) - p.yaw) : null);
        if (near < GREET && !driving) {
          if (!at.greeted && clock - lastHello > GREET_AGAIN) {
            at.greeted = true;
            lastHello = clock;
            say(been.has(at.site.id) && mine ? pick(SAYS.back) : pick(SAYS.hello), true);
          }
          if (!been.has(at.site.id)) {
            been.add(at.site.id);
            hud.flash(`${at.site.name} · ${at.site.townName}`);
            save.touch();
          }
        } else if (near > GREET * 2) at.greeted = false;
      }
      // your car's lamps after dark, and its headlights' beam while you drive
      const on = !!(model && driving && SKY.uNight.value > 0.35);
      if (model && model.on !== on) model.lit(on);
      beam.intensity = on ? BEAM : 0;
      if (on) {
        model.object.localToWorld(beam.position.set(0, 0.9, KINDS[mine.kind].len / 2));
        model.object.localToWorld(beam.target.position.set(0, -1.2, KINDS[mine.kind].len / 2 + 14));
        beam.target.updateMatrixWorld();
      }
      heard.car = driving
        ? { x: car.x, y: car.y, z: car.z, revs: car.revs, load: car.load, v: car.speed, under: car.kindUnder, ...KINDS[car.kind].sound }
        : null;
      seatOthers();
      cue();
      // a parked car settles onto what's under it, now and then
      settleIn -= dt;
      if (settleIn <= 0) {
        settleIn = 1;
        settle();
      }
    },
  });

  // ── From the console ──────────────────────────────────────────────────────
  // The dealership nearest (x, z) within r: the towns round there, nearest
  // first, that the seed gives one, each looked at outright (a frame apart)
  // until one turns up.
  async function nearby(x = player.pos.x, z = player.pos.z, r = REACH) {
    const list = T.within(x - r, z - r, x + r, z + r)
      .filter((t) => hasDealer(t, gen.seed))
      .sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z));
    for (const t of list) {
      const d = dealers.forTown(t);
      if (d && stands(d)) return d;
      await new Promise((ok) => setTimeout(ok, 0));
    }
    return null;
  }
  game.provide('cars', {
    dealers,
    car,
    get model() {
      return model;
    },
    get mine() {
      return mine ? { ...mine, ...(driving ? { x: car.x, z: car.z, yaw: car.yaw } : {}), driving } : null;
    },
    get driving() {
      return driving;
    },
    get at() {
      return at ? at.site : null;
    },
    // the dealerships found within r of you, nearest first
    list(r = REACH) {
      const p = player.pos;
      return found(p.x - r, p.z - r, p.x + r, p.z + r)
        .map((d) => ({ id: d.id, name: d.name, town: d.townName, x: Math.round(d.x), z: Math.round(d.z), dist: Math.round(Math.hypot(d.x - p.x, d.z - p.z)), far: formatDistance(Math.hypot(d.x - p.x, d.z - p.z)), been: been.has(d.id) }))
        .sort((a, b) => a.dist - b.dist);
    },
    nearby,
    // onto a dealership's lot (the nearest, or the one with that id), in front of its cars
    async go(id) {
      const d = id ? dealers.byId(id) : await nearby();
      if (!d || !stands(d)) return null;
      if (driving) getOut(true, false);
      await game.api.teleport(d.door.x, d.door.z, d.door.yaw);
      standUp(d);
      return { id: d.id, name: d.name, x: d.door.x, z: d.door.z };
    },
    // the car of a kind on the lot you're at: yours, and you're in it
    buy(kind) {
      if (!at) return false;
      return buy(at.cars.find((c2) => c2.kind === kind) || at.cars[0]);
    },
    // stand beside the driver's door of the car of a kind on the lot you're at
    toLot(kind) {
      const c2 = at && at.cars.find((c3) => c3.kind === kind && !c3.gone);
      if (!c2) return null;
      c2.model.door(_d);
      player.spawn(_d.x, _d.z, _d.yaw);
      return { x: _d.x, z: _d.z };
    },
    getIn,
    getOut: () => getOut(),
    // stand beside your car's door
    toDoor() {
      if (!mine || driving) return null;
      way();
      player.spawn(_d.x, _d.z, _d.yaw);
      return { x: _d.x, z: _d.z };
    },
  });
}
