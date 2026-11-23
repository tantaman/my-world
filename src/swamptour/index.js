// The swamp tour: an airboat ride through a real bayou, looking for
// alligators. At the landing on Bayou Barataria, outside Jean Lafitte in
// Louisiana (a real place brought in from a photo: world/hikes.js), the
// guide sits up in the high seat of a blue airboat tied to the dock. Walk up
// and click, and you're in the front row with a pair of ear defenders on,
// and off you go: down the bayou, through the old canals in the cypress, and
// back by the Waterway, stopping wherever there's a gator to point out.
//
//   tours.js      which tours there are, where each really goes, its guide
//   route.js      the way on the water, and how fast the boat may go on it
//   airboat.js    what the boat looks like: the hull, the seats, the cage, the propeller
//   landing.js    the dock, the ticket shack, the pen with a young gator in it
//   guide.js      the guide: how they look and sit, and what they say
//   sound.js      the engine and the propeller, the starter, the ear defenders
//   others.js     other people here out on it, in theirs
//   wake.js       the white water it leaves behind it
//
// Nothing about the land changes for it: the landing stands on the bank as
// it is, the plants in the way are hidden as their chunk grows, and the way
// round is found on the water the real place already has, once its land has
// come. The gators on the way are ordinary alligators (wildlife/gators.js),
// put where the guide is going to point them out, and used to the boats.
// Your tour is yours alone, though anyone in the world with you sees you go by
// in your airboat (others.js); how many you've been on, how many gators
// you've seen and the biggest are kept.
//
// From the console:
//   world.swamptour.list()            the tours, and whether each is ready
//   await world.swamptour.go()        to the foot of the dock
//   world.swamptour.board()           into the boat, and off
//   world.swamptour.ride              how it's going: where, how fast, which gator next
//   world.swamptour.skip(m)           (for trying it out) on along the way, m metres
//   world.swamptour.said              what the guide said last
//   world.swamptour.leave()           back to the landing, now

import * as THREE from 'three';
import { TOURS, onCard } from './tours.js';
import { findRoute, Course, CLEAR, PACE } from './route.js';
import { buildAirboat, HULL, PROP } from './airboat.js';
import { buildLanding } from './landing.js';
import { airboatSound } from './sound.js';
import { makeGuide, sitDriving, SAYS, gatorLine } from './guide.js';
import { Riders } from './others.js';
import { Wake } from './wake.js';
import { SPECIES } from '../wildlife/species.js';
import { SEAT_HIPS } from '../player/character.js';
import { VEG_STRIDE } from '../world/flora.js';
import { hash2i, mulberry32, clamp, lerp } from '../noise.js';
import { wrapAngle } from '../core/geom.js';
import { formatDistance } from '../core/format.js';

const PREPARE = 2500; // m from the landing: nearer than this, its land is asked for and the way round found
const SHOW = 900; // m: the landing and the boat are stood up this close...
const HIDE = 1050; // ...and taken down past this
const ROUTE_CELL = 1; // m: the grid the way round is found on (route.js)
const BOARD = 4; // m from the boat's side that you can climb in from
const GREET = 14; // m from the boat the guide says hello from
const GREET_AGAIN = 120; // s before they say it again
const START = 3.5; // s from climbing in to pulling away: the starter, the engine catching
const DWELL = 12; // s stopped at each gator
const SPAWN_AHEAD = 110; // m short of a gator's stop that it's put there
const CREEP = 0.5; // m/s the boat noses up to a stop at, at the least
const EASE = { up: 1.4, down: 2.2 }; // m/s² it gathers and sheds speed at, driving
const EARMUFFS = 0.42; // how much everything is muffled with the ear defenders on (sound.muffle)
const LINE_MS = 6500; // how long a line of the guide's stays up
const MOVED = 20; // m: moved further than this in a frame, by something else, and you're off the boat
const LOOK_ROUND = 1.2; // 1/s: how quickly the camera comes round to a gator being pointed out, and back
const LEAN = { most: 0.06, per: 0.08, ease: 4 }; // the boat leans into a turn: at most (rad), by how fast it turns (rad per rad/s at full pace), and comes over this quickly (1/s)
// 1/s: how firmly the camera swings round behind you to look the way the
// boat goes, and the way the guide points (player.js: aboard.behind)
const SWING = { going: 0.35, gator: 1.4 };
// sitting in the front row: knees together, feet on the deck, hands in the lap
const PASSENGER = { spread: 0.15, hang: 0.42, fwd: 0.36, lean: 0.04, reins: 0.15, rest: 0 };
const FRONT = 1; // which seat is yours: the middle of the front row (airboat.js)
// how big the gators on the way are (m), in turn
const SIZES = [3.3, 1.5, 2.6, 3.7, 2.2];
// a gator on the map's badge
const GLYPH = ['.......', '.......', '..#.#..', '#######', '.#####.', '#.#.#.#', '.......'];

const _v = new THREE.Vector3();
const _at = {};
const _wet = { level: 0, depth: 0, flowX: 0, flowZ: 0, foam: 0 };
const pick = (list) => list[Math.floor(Math.random() * list.length)];

// The features this uses, so it is installed after them (game/features.js):
// hikes for the real place it's on, towns for the guide's body and voice,
// wildlife for the gators.
export const after = ['render', 'ui', 'world', 'player', 'audio', 'build', 'map', 'save', 'towns', 'wildlife', 'hikes', 'act'];
export function installSwamptour(game) {
  const { scene, gen, chunks, grass, solids, landforms, player, input, builder, map, hud, commands, save, sound, wildlife, peers, act } = game;

  // ── The tours, on their real places ───────────────────────────────────────
  const tours = [];
  for (const def of TOURS) {
    const card = landforms.cards.find((c) => c.id === def.hike);
    if (!card) continue;
    const [x, z] = onCard(card, def.landing.lat, def.landing.lon);
    const by = def.by.map((b) => onCard(card, b.lat, b.lon));
    tours.push({ def, card, x, z, by, land: null, course: null, halts: [], lay: null, built: null, failed: false, asked: false });
  }
  const byId = (id) => tours.find((t) => t.def.id === id) || null;

  // ── What's yours ──────────────────────────────────────────────────────────
  let taken = 0; // tours ridden to the end
  let seen = 0; // gators pointed out, all told
  let biggest = 0; // m, the longest
  save.register({
    id: 'swamptour',
    scope: 'yours',
    local: 'marks',
    collect: () => ({ taken, seen, biggest }),
    validate: (r) => ({ taken: Math.max(0, Number(r?.taken) || 0), seen: Math.max(0, Number(r?.seen) || 0), biggest: Math.max(0, Number(r?.biggest) || 0) }),
    restore(r) {
      ({ taken, seen, biggest } = r);
    },
  });

  // ── Materials ─────────────────────────────────────────────────────────────
  const materials = {
    paint: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.15, side: THREE.DoubleSide }),
    dark: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.05, side: THREE.DoubleSide }),
    metal: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.7, side: THREE.DoubleSide }),
    wood: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0.02, side: THREE.DoubleSide }),
  };

  // ── Laying one out ────────────────────────────────────────────────────────
  // Once its land is here: the way round on the water, where the gators will
  // be, where the boat ties up and the dock out to it.
  function layOut(t) {
    if (t.course || t.failed) return;
    const land = gen.landforms.find((L) => L.id === t.card.id);
    if (!land) return;
    t.land = land;
    const shore = (x, z) => land.shore(x, z);
    const route = findRoute(shore, [[t.x, t.z], ...t.by, [t.x, t.z]], { cell: ROUTE_CELL, clear: CLEAR });
    if (!route) {
      t.failed = true;
      console.warn(`${t.def.name}: no way round by water`);
      return;
    }
    const plain = new Course(route);
    t.halts = haltsOn(plain, shore, t.def.gators, hash2i(7, 31, gen.seed));
    t.course = new Course(route, t.halts.map((h) => h.s));
    // the boat ties up where the way starts, its side to the dock; the dock
    // runs from the bank out to it, towards the shack
    const b0 = t.course.at(0, {});
    const level = waterLevel(b0.x, b0.z, land);
    let ux = t.x - b0.x;
    let uz = t.z - b0.z;
    const ul = Math.hypot(ux, uz) || 1;
    ux /= ul;
    uz /= ul;
    const end = { x: b0.x + ux * (HULL.beam / 2 + 0.25), z: b0.z + uz * (HULL.beam / 2 + 0.25) };
    let bank = { x: end.x, z: end.z };
    for (let d = 0; d < 40; d += 0.25) {
      bank = { x: end.x + ux * d, z: end.z + uz * d };
      if (shore(bank.x, bank.z) > 1.2) break;
    }
    const yaw = Math.atan2(-ux, -uz); // the frame looks out to the water
    const at = { x: bank.x + ux * 5.5, z: bank.z + uz * 5.5, yaw };
    at.y = gen.height(at.x, at.z);
    // tied up side on to the dock, whichever way round is nearer the way out
    const side = Math.atan2(ux, uz) + Math.PI / 2;
    const moorYaw = Math.abs(wrapAngle(side - b0.yaw)) < Math.PI / 2 ? side : side + Math.PI;
    t.lay = { at, dock: { a: bank, b: end, top: level + 0.55 }, level, moor: b0, moorYaw };
    hideIn(t);
  }

  // Where the gators will be: spread along the way, after the first stretch
  // and before the last, each where there's a bank by the water to bask on
  // or, failing that, out in the water beside the way.
  function haltsOn(course, shore, n, seed) {
    const rnd = mulberry32(seed);
    const out = [];
    const L = course.length;
    for (let i = 0; i < n; i++) {
      const s0 = L * (0.12 + (0.76 * (i + 0.5)) / n);
      let best = null;
      for (let ds = 0; ds <= 70 && !best; ds += 5) {
        for (const s of [s0 + ds, s0 - ds]) {
          const p = course.at(s, {});
          for (const side of rnd() < 0.5 ? [1, -1] : [-1, 1]) {
            // left of the way is (cos yaw, -sin yaw)
            const nx = Math.cos(p.yaw) * side;
            const nz = -Math.sin(p.yaw) * side;
            for (let d = 1.5; d <= 9; d += 0.5) {
              if (shore(p.x + nx * d, p.z + nz * d) < 0.5) continue;
              const length = SIZES[i % SIZES.length] * (0.92 + rnd() * 0.16);
              const gx = p.x + nx * (d + 0.4);
              const gz = p.z + nz * (d + 0.4);
              const yaw = Math.atan2(-nx, -nz) + (rnd() - 0.5) * 1.2;
              best = { s, side: side > 0 ? 'left' : 'right', spot: { x: gx, z: gz, yaw, pose: 'bask', length, calm: true, life: 400 } };
              break;
            }
            if (best) break;
          }
          if (best) break;
        }
      }
      if (!best) {
        // out in the water beside the way
        const p = course.at(s0, {});
        const side = rnd() < 0.5 ? 1 : -1;
        const off = clamp(p.clear * 0.6, 1.5, 4);
        const nx = Math.cos(p.yaw) * side;
        const nz = -Math.sin(p.yaw) * side;
        best = { s: s0, side: side > 0 ? 'left' : 'right', spot: { x: p.x + nx * off, z: p.z + nz * off, yaw: rnd() * Math.PI * 2, pose: 'float', length: SIZES[i % SIZES.length], calm: true, life: 400 } };
      }
      // (never two at once, nor out of order)
      if (out.length && best.s < out[out.length - 1].s + 40) continue;
      out.push(best);
    }
    return out;
  }

  // the level of the water at (x, z): the chunks', where they're grown, or
  // the real place's own lake
  function waterLevel(x, z, land) {
    if (chunks.waterAt(x, z, _wet)) return _wet.level;
    land.shore(x, z);
    return land.level + land.offset;
  }

  // ── The forest round the landing ──────────────────────────────────────────
  // The trees, bushes and stones on the landing hidden, as each chunk's
  // plants come and those already there when it's laid out; no grass under
  // the shack, the pen or the dock.
  const clears = []; // { x, z, r }
  function clearChunk(ch) {
    if (!clears.length || !ch.vegLists) return;
    const S = chunks.size;
    const x0 = ch.cx * S;
    const z0 = ch.cz * S;
    const near = clears.filter((c) => c.x + c.r > x0 && c.x - c.r < x0 + S && c.z + c.r > z0 && c.z - c.r < z0 + S);
    if (!near.length) return;
    for (const kind in ch.vegLists) {
      const list = ch.vegLists[kind];
      for (let o = 0, k = 0; o < list.length; o += VEG_STRIDE, k++) {
        if (list[o + 4] <= 0) continue;
        if (near.some((c) => Math.hypot(list[o] - c.x, list[o + 2] - c.z) < c.r)) chunks.hideInstance(ch, kind, k);
      }
    }
  }
  chunks.on('vegetation', clearChunk);
  grass.addClearing((x0, z0, x1, z1) => {
    const near = clears.filter((c) => c.x + c.r > x0 && c.x - c.r < x1 && c.z + c.r > z0 && c.z - c.r < z1);
    if (!near.length) return null;
    return (x, z) => near.some((c) => Math.hypot(x - c.x, z - c.z) < c.r);
  });
  function hideIn(t) {
    const L = t.lay;
    // the landing (shack, pen, dock), and the water the boat lies in
    const plan = buildLanding({ at: L.at, dock: L.dock, ground: (x, z) => gen.height(x, z), name: t.def.name, materials });
    t.plan = plan;
    clears.push(...plan.clear, { x: L.moor.x, z: L.moor.z, r: HULL.len / 2 + 1 });
    for (const ch of chunks.chunks.values()) clearChunk(ch);
    for (const c of plan.clear) grass.invalidate(c.x - c.r, c.z - c.r, c.x + c.r, c.z + c.r);
  }

  // ── Standing it up ────────────────────────────────────────────────────────
  function show(t, on) {
    if (!!t.built === on) return;
    if (on) {
      const boat = buildAirboat(materials);
      const guide = makeGuide(t.def.guide, gen.seed + 5101);
      const g = boat.seats[boat.seats.length - 1];
      guide.mesh.position.set(g.x, g.y - guide.hips.userData.rest.y, g.z - 0.02);
      boat.object.add(guide.mesh);
      const wake = new Wake();
      scene.add(t.plan.object);
      scene.add(boat.object);
      scene.add(wake.object);
      solids.set(t.plan, t.plan.solids);
      t.built = { boat, guide, wake, spin: 0, bob: Math.random() * 6, lean: 0 };
    } else {
      scene.remove(t.plan.object);
      scene.remove(t.built.boat.object);
      scene.remove(t.built.wake.object);
      solids.clear(t.plan);
      t.built.guide.dispose();
      t.built.wake.dispose();
      t.built = null;
    }
  }

  // ── The ear defenders ─────────────────────────────────────────────────────
  // Yellow cups over the ears and a black band over the cap, handed to you
  // as you climb in, and taken back at the end.
  const muffs = earDefenders(player.character.cap.crown);
  player.character.addWorn(new THREE.Group(), { band: muffs });
  muffs.visible = false;

  // ── On the map ────────────────────────────────────────────────────────────
  // where it is is the foot of the dock (or, until it's laid out, the landing)
  const placeOf = (t) => {
    const foot = t.lay ? { x: t.lay.dock.a.x - Math.sin(t.lay.at.yaw) * 2.5, z: t.lay.dock.a.z - Math.cos(t.lay.at.yaw) * 2.5 } : { x: t.x, z: t.z };
    return {
      id: `swamptour:${t.def.id}`,
      x: foot.x,
      z: foot.z,
      yaw: t.lay ? t.lay.at.yaw : 0,
      name: t.def.name,
      kind: 'swamp tour',
      note: 'an airboat ride through the swamp, looking for alligators',
      glyph: GLYPH,
      visited: taken > 0,
    };
  };
  map.places.addSource({
    list: 'swamp tours',
    destinations: () => tours.map(placeOf),
    within: (x0, z0, x1, z1) => tours.filter((t) => t.x >= x0 && t.x <= x1 && t.z >= z0 && t.z <= z1).map(placeOf),
    get: (id) => {
      const t = typeof id === 'string' && id.startsWith('swamptour:') ? byId(id.slice(10)) : null;
      return t ? placeOf(t) : null;
    },
  });

  // ── The sound of it ───────────────────────────────────────────────────────
  const heard = { boat: null };
  sound.addLayer(airboatSound(heard));

  // ── The ride ──────────────────────────────────────────────────────────────
  // The act key (F) gets you in by the boat, and on the tour takes you back
  // to the landing. In your pack too, with no key of its own: anywhere else,
  // it says where the tour is.
  function press() {
    if (ride) {
      if (ride.phase === 'done') return false;
      say(ride.t, SAYS.early);
      getOff(false);
      return true;
    }
    const t = nearBoat();
    if (t) return board(t);
    const near = tours.map((q) => ({ q, d: Math.hypot(q.x - player.pos.x, q.z - player.pos.z) })).sort((a, b) => a.d - b.d)[0];
    if (near) hud.flash(near.d < HIDE ? `the airboat waits at the end of the dock, at ${near.q.def.name}` : `the airboat tour leaves from ${near.q.def.name}, at ${near.q.card.name} in Louisiana, ${formatDistance(near.d)} off · it’s on the map, under swamp tours`, LINE_MS);
    return false;
  }
  commands.add({ id: 'swamptour', group: 'SWAMP TOUR', label: 'airboat tour: where it leaves from, at the landing in Jean Lafitte', run: press });
  commands.describe({ group: 'SWAMP TOUR', help: 'F', pad: ['PadY'], label: 'by the airboat at the landing in Jean Lafitte: take the tour · on it: back to the landing' });
  act.offer({
    id: 'swamptour',
    at() {
      if (ride) return ride.phase === 'done' ? null : { d: 0, word: 'back to the landing', run: press };
      const t = nearBoat();
      if (!t) return null;
      const o = t.built.boat.object.position;
      return { d: Math.hypot(player.pos.x - o.x, player.pos.z - o.z), word: 'get in', run: () => board(t) };
    },
  });
  let ride = null; // { t, s, v, phase, timer, halt, said, gators: [], pointed, seen, biggest }
  builder.idleWhile(() => ride !== null);
  const mover = {
    place(out, dt) {
      const t = ride && ride.t;
      // moved by something else (R, the map): that's the end of it
      const was = ride && ride.last;
      if (!t || !t.built || (was && Math.hypot(player.pos.x - was.x, player.pos.z - was.z) > MOVED)) {
        if (ride) ride.moved = true;
        out.x = player.pos.x;
        out.y = player.pos.y;
        out.z = player.pos.z;
        out.yaw = player.yaw;
        return;
      }
      const b = t.built.boat;
      const seat = b.seats[FRONT];
      b.object.updateMatrixWorld();
      _v.set(seat.x, seat.y, seat.z).applyMatrix4(b.object.matrixWorld);
      out.x = _v.x;
      out.y = _v.y - SEAT_HIPS;
      out.z = _v.z;
      out.yaw = b.object.rotation.y;
      // the camera turns with the boat; and at a stop, round to the gator
      // being pointed out (unless you're looking about for yourself)
      const g = ride.pointed >= 0 ? ride.gators[ride.pointed] : null;
      const want = g ? Math.atan2(g.x - out.x, g.z - out.z) : out.yaw;
      ride.look = ride.look === undefined ? out.yaw : ride.look + wrapAngle(want - ride.look) * (1 - Math.exp(-dt * LOOK_ROUND));
      out.heading = ride.look;
      ride.last = { x: out.x, z: out.z };
      // and swings round to look that way, when you aren't looking about:
      // gently while it's going, more firmly when there's a gator to see
      out.behind = g ? SWING.gator : ride.v > 1 ? SWING.going : 0;
      out.back = 1.5;
    },
  };

  let said = null; // what the guide said last, for the console
  function say(t, line) {
    said = `${t.def.guide.name}: “${line}”`;
    hud.flash(said, LINE_MS);
    const b = t.built && t.built.boat.object;
    if (b) sound.call('hello', b.position.x, b.position.y + 2.6, b.position.z, { pitch: t.def.guide.her ? 1.2 : 0.82 });
  }

  // the tour whose boat you're beside, ready to go
  function nearBoat() {
    if (ride || player.aboard || player.carrier) return null;
    for (const t of tours) {
      if (!t.built || !t.course) continue;
      const o = t.built.boat.object.position;
      if (Math.hypot(player.pos.x - o.x, player.pos.z - o.z) < HULL.beam / 2 + BOARD && player.pos.y > o.y - 0.5) return t;
    }
    return null;
  }

  function board(t) {
    if (!t || !t.course || !t.built || ride) return false;
    ride = { t, s: 0, v: 0, phase: 'start', timer: START, halt: 0, said: new Set(), gators: [], pointed: -1, seen: 0, biggest: 0 };
    player.aboard = mover;
    player.vel.set(0, 0, 0);
    player.character.seat(PASSENGER);
    muffs.visible = true;
    sound.sfx('earmuffs');
    sound.muffle(EARMUFFS, 0.4);
    say(t, SAYS.board);
    sound.sfx('airboat-start');
    tell();
    return true;
  }

  // Off at the landing: onto the dock beside the boat (unless you've been
  // taken somewhere else, `moved`). Counted if you went the whole way round.
  function getOff(whole, moved = false) {
    const r = ride;
    if (!r) return;
    ride = null;
    const t = r.t;
    if (player.aboard === mover) player.aboard = null;
    if (!moved) {
      const d = t.lay.dock;
      const yaw = t.lay.at.yaw + Math.PI;
      const x = lerp(d.a.x, d.b.x, 0.7);
      const z = lerp(d.a.z, d.b.z, 0.7);
      player.spawn(x, z, yaw, yaw + Math.PI, d.top + 0.05);
    }
    player.character.seat(null);
    muffs.visible = false;
    sound.muffle(0, 0.4);
    if (whole) taken++;
    seen += r.seen;
    biggest = Math.max(biggest, r.biggest);
    if (whole || r.seen) save.touch();
    // the gators stay where they are, and go about their business
    for (const g of r.gators) if (g) g.calm = false;
    tell();
    if (whole) setTimeout(() => hud.flash(`${t.def.name} · ${r.seen ? `${r.seen} gator${r.seen > 1 ? 's' : ''}, the biggest about ${Math.round(r.biggest / 0.3048)} ft` : 'no gators this time'}${taken > 1 ? ` · ${taken} tours` : ''}`, 5000), LINE_MS + 200);
  }

  // Driving: along the way at the pace it allows, stopping at each gator
  // while it's pointed out, and back to the dock.
  function drive(dt) {
    const r = ride;
    const t = r.t;
    const C = t.course;
    // taken somewhere else all at once (back to the start, say): out of the
    // boat where you are, and it goes back to its mooring
    if (player.aboard !== mover || r.moved) return void getOff(false, true);
    // a gator put where it'll be pointed out, well before you get there
    for (let i = r.halt; i < t.halts.length; i++) {
      const h = t.halts[i];
      if (r.gators[i] !== undefined || r.s < h.s - SPAWN_AHEAD) continue;
      r.gators[i] = wildlife.spawnAt(SPECIES.alligator, { ...h.spot }) || null;
    }
    switch (r.phase) {
      case 'start':
        r.timer -= dt;
        if (r.timer <= 0) r.phase = 'go';
        break;
      case 'go': {
        const plan = C.at(r.s, _at).v;
        const h = t.halts[r.halt];
        const toHalt = h ? h.s - r.s : Infinity;
        const want = toHalt < 3 ? Math.max(CREEP, plan) : plan;
        r.v += clamp(want - r.v, -EASE.down * dt, EASE.up * dt);
        r.s += Math.max(r.v, toHalt < 3 || C.length - r.s < 3 ? CREEP : 0.2) * dt;
        if (h && r.s >= h.s - 0.1) {
          r.phase = 'halt';
          r.timer = DWELL;
          r.v = 0;
          const g = r.gators[r.halt];
          if (g && !g.done) {
            say(t, gatorLine({ L: g.L, pose: g.state === 'float' ? 'float' : 'bask' }, h.side, r.seen));
            r.seen++;
            r.biggest = Math.max(r.biggest, g.L);
            r.pointed = r.halt;
          } else r.timer = 2;
        }
        if (r.s >= C.length - 0.1) {
          r.phase = 'done';
          r.timer = 3;
          say(t, r.seen ? SAYS.done : `${SAYS.none} ${SAYS.done}`);
        }
        // the guide's words along the way, when not pointing out a gator
        // nor saying goodbye
        if (r.phase === 'go') for (const a of SAYS.along) {
          if (r.said.has(a) || r.s < a.at * C.length) continue;
          r.said.add(a);
          say(t, a.line);
          break;
        }
        break;
      }
      case 'halt':
        r.timer -= dt;
        r.v = 0;
        if (r.timer <= 0) {
          r.phase = 'go';
          r.halt++;
          r.pointed = -1;
        }
        break;
      case 'done':
        r.timer -= dt;
        r.v = 0;
        if (r.timer <= 0) getOff(true);
        break;
    }
  }

  // ── Each frame ────────────────────────────────────────────────────────────
  // The boat you're on goes first, before you're sat in it (player.aboard
  // is asked where you are in the 'update' phase), as a train or a plane
  // does: otherwise you'd be put where it was the frame before, a little
  // behind your seat, by however far it went in that frame, and it would
  // jerk back and forth under you as the frames came quicker and slower.
  let ridden = null; // the tour whose boat has gone this frame
  game.addSystem({
    name: 'airboat ride',
    phase: 'input',
    update({ dt }) {
      heard.boat = null;
      ridden = ride && ride.t.built ? ride.t : null;
      if (!ridden) return;
      drive(dt);
      steer(ridden, dt);
    },
  });

  let clock = 0;
  let lastHello = -Infinity;
  let greeted = false;
  let cued = false;
  game.addSystem({
    name: 'swamptour',
    phase: 'world',
    update({ dt }) {
      clock += dt;
      const f = game.focus;
      for (const t of tours) {
        const d = Math.hypot(f.x - t.x, f.z - t.z);
        if (!t.course && !t.failed && d < PREPARE) {
          if (!t.asked) {
            t.asked = true;
            landforms.ensure(t.card.id).then(
              () => layOut(t),
              () => (t.asked = false),
            );
          }
          if (landforms.has(t.card.id)) layOut(t);
        }
        if (!t.course) continue;
        const riding = ride && ride.t === t;
        if (d < SHOW || riding) show(t, true);
        else if (d > HIDE) show(t, false);
        if (!t.built || t === ridden) continue;
        steer(t, dt);
      }

      // at the dock beside a boat: the guide says hello, and F gets you in
      const t = nearBoat();
      let cue = null;
      if (t) {
        cue = `<b>${act.key('get in')}</b> take the airboat tour with ${t.def.guide.name}`;
        if (!greeted && clock - lastHello > GREET_AGAIN) {
          greeted = true;
          lastHello = clock;
          say(t, pick(taken ? SAYS.back : SAYS.hello));
          t.built.guide.waving = 1.8;
        }
      } else if (!ride) {
        const near = tours.find((q) => q.built && Math.hypot(player.pos.x - q.built.boat.object.position.x, player.pos.z - q.built.boat.object.position.z) < GREET);
        if (!near) greeted = false;
      }
      if (ride) {
        cue = `on the airboat · ${ride.seen} gator${ride.seen === 1 ? '' : 's'}${ride.phase === 'done' ? '' : ` · <b>${act.key('back to the landing')}</b>${input.isTouch ? '' : ' back to the landing'}`}`;
      }
      if (cue) {
        hud.cue({ html: cue });
        cued = true;
      } else if (cued) {
        hud.cue(null);
        cued = false;
      }
    },
  });

  // The boat where it is: tied up at the dock, or out on the way round; on
  // the water, bobbing, its bow up when it's going, leaning into the turns;
  // its wake behind it; the propeller turning, the rudders over, the guide at
  // the stick looking where they're pointing.
  function steer(t, dt) {
    const B = t.built;
    const o = B.boat.object;
    const r = ride && ride.t === t ? ride : null;
    const C = t.course;
    const p = C.at(r ? r.s : 0, _at);
    const was = o.rotation.y;
    // tied up side on to the dock; spun round to set off, and back again
    // when it comes in
    const moor = t.lay.moorYaw;
    let yaw = moor;
    if (r) {
      const out = r.phase === 'start' ? clamp((START - r.timer - 1.2) / 2, 0, 1) : r.phase === 'done' ? clamp(r.timer / 2.5, 0, 1) : 1;
      const k = out * out * (3 - 2 * out);
      yaw = moor + wrapAngle(p.yaw - moor) * k;
    }
    const level = waterLevel(p.x, p.z, t.land);
    B.bob += dt;
    const v = r ? r.v : 0;
    const k = v / PACE.open;
    o.position.set(p.x, level + Math.sin(B.bob * 1.3) * 0.015 * (1 - k), p.z);
    const turn = r ? wrapAngle(yaw - was) / Math.max(dt, 1e-3) : 0;
    B.lean += (clamp(-turn * k * LEAN.per, -LEAN.most, LEAN.most) - B.lean) * (1 - Math.exp(-dt * LEAN.ease));
    o.rotation.set(-0.05 * k + Math.sin(B.bob * 0.9) * 0.006, yaw, B.lean, 'YXZ');
    B.wake.update({ x: p.x, z: p.z, yaw, level, v, room: p.clear }, dt);
    // the engine: idling, or pulling, by how hard it's going
    const running = !!r && r.phase !== 'done';
    const throttle = !running ? 0 : r.phase === 'start' ? 0.05 : r.phase === 'halt' ? 0.05 : clamp(0.18 + 0.75 * k + Math.max(0, (_at.v - v) * 0.1), 0.08, 1);
    if (running) B.spin += dt * (6 + 30 * throttle);
    B.boat.prop.rotation.z = B.spin * 2.4;
    B.boat.blur.opacity = running ? 0.12 + 0.28 * throttle : 0;
    for (const rd of B.boat.rudders) rd.rotation.y = lerp(rd.rotation.y, clamp(turn * 0.6, -0.5, 0.5), clamp(dt * 5, 0, 1));
    if (running) {
      _v.set(0, PROP.y, PROP.z).applyMatrix4(o.matrixWorld);
      heard.boat = { x: _v.x, y: _v.y, z: _v.z, throttle, running };
    }
    // the guide: looking where the way goes, or at the gator being pointed out
    let lookAt = null;
    let point = null;
    const g = r && r.pointed >= 0 ? r.gators[r.pointed] : null;
    if (g) {
      lookAt = wrapAngle(Math.atan2(g.x - o.position.x, g.z - o.position.z) - yaw);
      point = lookAt;
    } else if (!r) {
      const P = player.pos;
      if (Math.hypot(P.x - o.position.x, P.z - o.position.z) < GREET) lookAt = wrapAngle(Math.atan2(P.x - o.position.x, P.z - o.position.z) - yaw);
    }
    sitDriving(B.guide, dt, { lookAt, point });
  }

  // ── Everyone else here ────────────────────────────────────────────────────
  // They're told whether you're on the tour, and see you in your airboat.
  function tell() {
    save.say('airboat', ride ? { tour: ride.t.def.id } : null);
  }
  if (peers) {
    const guides = (id) => (byId(id) || tours[0]).def.guide;
    const riders = new Riders({ scene, peers, materials, seat: PASSENGER, front: FRONT, guides });
    save.on('message', (msg) => msg.ch === 'airboat' && riders.hear(msg.from, msg.body));
    // someone new: tell them you're out on it
    peers.on('change', () => ride && tell());
    game.addSystem({ name: 'airboat riders', phase: 'world', update: ({ dt }) => riders.update(dt) });
  }

  // ── From the console ──────────────────────────────────────────────────────
  game.provide('swamptour', {
    list: () => tours.map((t) => ({ id: t.def.id, name: t.def.name, hike: t.card.id, x: Math.round(t.x), z: Math.round(t.z), ready: !!t.course, length: t.course ? Math.round(t.course.length) : null, gators: t.halts.length })),
    get tours() {
      return tours;
    },
    get ride() {
      if (!ride) return null;
      const C = ride.t.course;
      const h = ride.t.halts[ride.halt];
      return { tour: ride.t.def.id, phase: ride.phase, s: Math.round(ride.s * 10) / 10, of: Math.round(C.length), v: Math.round(ride.v * 10) / 10, next: h ? Math.round(h.s) : null, seen: ride.seen, gators: ride.gators.filter(Boolean).map((g) => ({ label: g.label, x: Math.round(g.x), z: Math.round(g.z), state: g.state })) };
    },
    get record() {
      return { taken, seen, biggest };
    },
    // what the guide said last
    get said() {
      return said;
    },
    // to the foot of the dock, facing the boat, once the way round is known
    async go(id = tours[0] && tours[0].def.id) {
      const t = byId(id);
      if (!t) return null;
      const p = placeOf(t);
      await game.api.teleport(p.x, p.z, p.yaw);
      for (let i = 0; i < 600 && !t.course && !t.failed; i++) await new Promise((r) => requestAnimationFrame(r));
      if (!t.course) return null;
      const q = placeOf(t);
      await game.api.teleport(q.x, q.z, q.yaw);
      return { x: q.x, z: q.z };
    },
    board: (id = tours[0] && tours[0].def.id) => board(byId(id)),
    skip(m) {
      if (!ride) return null;
      ride.s = Math.min(ride.t.course.length, ride.s + m);
      if (ride.phase === 'start') ride.phase = 'go';
      // (the stops skipped past are left out, and what the guide would have said)
      const H = ride.t.halts;
      while (H[ride.halt] && H[ride.halt].s < ride.s - 0.5) ride.halt++;
      for (const a of SAYS.along) if (a.at * ride.t.course.length < ride.s - 1) ride.said.add(a);
      return ride.s;
    },
    leave: () => (ride ? (getOff(false), true) : false),
  });
}

// Ear defenders: two yellow cups and the black band over the top, in the
// cap's frame (player/head.js: crown says how big the cap is there).
function earDefenders(crown) {
  const group = new THREE.Group();
  const yellow = new THREE.MeshStandardMaterial({ color: 0xe8c21a, roughness: 0.5 });
  const black = new THREE.MeshStandardMaterial({ color: 0x18181a, roughness: 0.6 });
  const W = crown.rx + 0.035;
  for (const side of [1, -1]) {
    const cup = new THREE.Mesh(new THREE.SphereGeometry(0.052, 12, 8), yellow);
    cup.scale.set(0.55, 1, 0.85);
    cup.position.set(side * W, crown.y - 0.085, crown.z - 0.01);
    cup.castShadow = true;
    group.add(cup);
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.02, 12), black);
    pad.rotation.z = Math.PI / 2;
    pad.position.set(side * (W - 0.03), crown.y - 0.085, crown.z - 0.01);
    group.add(pad);
  }
  const band = new THREE.Mesh(new THREE.TorusGeometry(W, 0.011, 6, 24, Math.PI), black);
  band.scale.set(1, 1.25, 1);
  band.position.set(0, crown.y - 0.085, crown.z - 0.01);
  band.castShadow = true;
  group.add(band);
  return group;
}
