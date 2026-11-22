// Whitewater rafting: an inflatable raft in your pack, for running the
// rapids (world/water.js gathers a steep river's fall into them). Throw it
// in at the river's edge and climb aboard, and you're its guide: sat on the
// back of its right-hand tube with a paddle, driving it along (W, S) and
// turning it (A, D) while the river takes it where it's going. Through a
// rapid's standing waves the bow climbs and plunges; keep it pointed down
// the river and it punches through, but side-on in big water, or into a
// rock side-on, it goes over and you're in the river. Swim to it, haul it
// back over, climb back in.
//
// Each rapid is a place on the map with a name and a class, I to VI;
// running one right way up through to its foot counts.
//
//   raft.js     how it goes: the current at six places round it, paddles,
//               banks, rocks, drops, waves, and going over
//   rapids.js   the rapids as places: found, named, graded; the next one down
//   model.js    the raft, and the paddle
//   sound.js    water drumming on the tubes; in, strokes, rocks, drops,
//               waves, going over, getting out
//   crew.js     everyone else here: their rafts, and climbing into one as crew
//
// It has no key: like everything new it's in the pack (Tab), named for
// what it would do right here, 'raft', 'get in', 'right it', 'get out'.
// While you guide it, it moves you (player.aboard), and the tools are put
// away (builder.idleWhile). Whether it's out and you're in it, and the
// rapids you've run, are yours (the 'rafting' domain).
//
// From the console:
//   world.rafting.in()        throw it in at the river beside you, and climb aboard
//   world.rafting.out()       out onto the bank, the raft rolled up (or, twice, over the side)
//   world.rafting.state()     how it's going: where, how fast, the rapid you're in or the next one
//   world.rafting.rapids(x, z, far)   the rapids round a place
//   world.rafting.nearest()   the nearest rapid to run
//   world.rafting.raft        its workings (raft.js)

import * as THREE from 'three';
import { Raft, RAFT, STILL } from './raft.js';
import { Rapids, ROMAN, AHEAD } from './rapids.js';
import { makeRaft, makeRaftPaddle, COLOURS } from './model.js';
import { raftSounds } from './sound.js';
import { Crews, SEATS, seatOf } from './crew.js';
import './rafting.css';
import { Course } from '../tubing/course.js';
import { STROKE, CATCH, EXIT, passed } from '../boats/paddle.js';
import { SEAT_HIPS } from '../player/character.js';
import { segDist, waterSample } from '../core/geom.js';
import { formatDistance } from '../core/format.js';
import { LANDFORM_DRY } from '../world/water.js';
import { clamp } from '../noise.js';

// Throwing it in: the water can be this far (m) from you, looked for this
// finely (m), deep enough all round its hull to float it with a little to
// spare; it takes this long (s) to climb aboard, rising this high (m).
const REACH = 5;
const LOOK = 0.5;
const SPARE = 0.06;
const HOP = { time: 0.9, up: 0.5 };
// Climbing back in from the water, or righting it: within this far (m) of
// its middle; hauling it back over takes this long (s).
const NEAR = 3.4;
const RIGHTING = 1.3;
// Getting out: onto a bank this far (m) from its middle at most, where the
// water is no deeper than WADE m and the bank no more than CLIFF m over it.
// Asked again within SLIP s with no bank in reach, over the side.
const OUT_REACH = 3.8;
const WADE = 0.45;
const CLIFF = 1.4;
const SLIP = 4;
// Further than this (m) from it, out of it, and it's rolled up and back in
// your pack.
const LOST = 150;
// Put somewhere else by something else (R, a teleport): moved further than
// this (m) in a frame, you're out of it.
const MOVED = 6;
// How you sit on its tube: the hips this far over the tube's middle (m).
const SIT_UP = 0.18;
// Sat on the tube, feet in the raft, leaning in a little (Character.seat).
const SEAT = { spread: 0.18, hang: 0.38, fwd: 0.32, lean: 0.12, reins: 0, rest: 0, stroke: null };
// The raft sits this high (m) over where raft.js puts it (the tube's middle
// over the water).
const FLOAT = RAFT.tube - RAFT.draft;
// The camera: round behind the way it points this fast (1/s), and this much
// further back (m).
const BEHIND = 1.1;
const BACK = 2.2;
// White water thrown up round its tubes: drops a second, per m/s, at full froth.
const SPRAY = 18;
// A wave breaking over the bow is heard no more often than this (s).
const WAVE_EVERY = 0.7;
// Saying a rapid is coming: once, this far (m) above its lip.
const WARN = 140;
// Pointing the way to a rapid to run: until you're this near (m), or for this
// long (s); and putting in this far (m) above its lip.
const GUIDE = { near: 15, long: 900, color: '#f2c230', above: 25 };
// A collider this wide (m) or wider is a rock, not a trunk.
const ROCK = 0.5;
// What the map draws for a rapid (7×7): standing waves.
const GLYPH = ['.......', '#..#..#', '.##.##.', '.......', '#..#..#', '.##.##.', '.......'];
const SAY = 5200; // ms a sentence stays on the screen
const WAYS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

const _w = waterSample();
const _d = waterSample();
const _seg = { d: 0, nx: 0, nz: 0, t: 0 };
const _h = { nx: 0, nz: 0, depth: 0, what: '' };
const _p = { x: 0, z: 0 };
const _v = new THREE.Vector3();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const round = (v, f) => Math.round(v * f) / f;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const way = (dx, dz) => WAYS[Math.round((((Math.atan2(dx, -dz) * 180) / Math.PI + 360) % 360) / 45) % 8];
const named = (r) => `${r.name}, Class ${r.roman}`;

// The features this uses, so it is installed after them (game/features.js).
// And after boats and tubing, whose words on what a key would do are said
// every frame, so that what's said here is said over them.
export const after = ['render', 'ui', 'world', 'player', 'audio', 'build', 'save', 'splashes', 'map', 'pack', 'boats', 'tubing'];
export function installRafting(game) {
  const { scene, chunks, gen, solids, player, input, hud, commands, save, sound, builder, splashes, peers, map, pack } = game;

  // ── The rapids ────────────────────────────────────────────────────────────
  const rapids = new Rapids(gen.water, gen.seed ?? 0, (x, z) => gen.landforms.length > 0 && gen.landformClearance(x, z) < LANDFORM_DRY);
  const place = (r) => ({ id: r.id, x: r.x, z: r.z, name: r.name, kind: 'rapid', note: `Class ${r.roman} rapid · ${formatDistance(r.len)}, falls ${r.drop.toFixed(1)} m`, glyph: GLYPH });
  map.places.addSource({
    within: (x0, z0, x1, z1) => rapids.within(x0, z0, x1, z1).map(place),
    get: (id) => {
      const r = rapids.get(id);
      return r ? place(r) : null;
    },
  });

  // ── The water, and what's in it ───────────────────────────────────────────
  const depthAt = (x, z) => (chunks.waterAt(x, z, _d) ? Math.max(0, _d.depth) : 0);
  function collider(x, z, r, out) {
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
      out.what = cr >= ROCK ? 'a rock' : 'a tree';
    });
    return best;
  }
  const course = {
    water: (x, z, out) => chunks.waterAt(x, z, out),
    drain: (x, z) => lakes.drain(x, z),
    hit(x, z, r, out) {
      let best = collider(x, z, r, out);
      // and anything built standing in the water at its height (a dock)
      if (solids) {
        const y = raft.level;
        solids.forEachNear(x, z, 1.2 + r, (s) => {
          segDist(x, z, s.ax, s.az, s.bx, s.bz, _seg);
          const depth = s.r + r - _seg.d;
          if (depth <= best) return;
          const top = s.topA + (s.topB - s.topA) * _seg.t;
          if (top < y - 0.1 || s.bottom > y + 0.9) return;
          best = depth;
          out.nx = _seg.nx;
          out.nz = _seg.nz;
          out.depth = depth;
          out.what = 'something built';
        });
      }
      return best > 0;
    },
  };
  // where a lake drains, as the tube has it
  const lakes = new Course(gen.water, depthAt);

  // Somewhere to throw it in, at (x, z) or as near it as there is within
  // reach: water deep enough under all of its hull, lying along the current,
  // clear of rocks and trunks. -> { x, z, yaw } or null
  const probe = new Raft(course);
  function fits(x, z, yaw) {
    probe.x = x;
    probe.z = z;
    probe.yaw = yaw;
    for (const [a, f] of SEATS.grip) {
      probe.toWorld(a, f, _p);
      if (depthAt(_p.x, _p.z) < RAFT.draft + SPARE || collider(_p.x, _p.z, 0.4, _h) > 0) return false;
    }
    return true;
  }
  function lieAt(x, z) {
    const flowing = chunks.waterAt(x, z, _w) && Math.hypot(_w.flowX, _w.flowZ) >= STILL;
    return flowing ? Math.atan2(_w.flowX, _w.flowZ) : null;
  }
  function waterBy(x, z, reach = REACH) {
    for (let r = 0; r <= reach + 1e-6; r += LOOK) {
      const n = r ? Math.max(8, Math.round((Math.PI * 2 * r) / LOOK)) : 1;
      let best = null;
      let bd = 0;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const px = x + Math.cos(a) * r;
        const pz = z + Math.sin(a) * r;
        const d = depthAt(px, pz);
        if (d < RAFT.draft + SPARE || d <= bd) continue;
        const along = lieAt(px, pz);
        const yaws = along === null ? [Math.atan2(px - x, pz - z), 0, Math.PI / 2] : [along, along + Math.PI / 6, along - Math.PI / 6];
        const yaw = yaws.find((y) => fits(px, pz, y));
        if (yaw === undefined) continue;
        best = { x: px, z: pz, yaw };
        bd = d;
      }
      if (best) return best;
    }
    return null;
  }

  // Somewhere to step out onto from the raft: the nearest bank, or shallows
  // you can stand in, that isn't a cliff or a tree. -> { x, z } or null
  function bankBy(x, z, level) {
    for (let r = RAFT.beam / 2; r <= OUT_REACH + 1e-6; r += 0.3) {
      let best = null;
      let bd = Infinity;
      for (let i = 0; i < 20; i++) {
        const a = (i / 20) * Math.PI * 2;
        const px = x + Math.cos(a) * r;
        const pz = z + Math.sin(a) * r;
        const d = depthAt(px, pz);
        if (d > WADE || d >= bd) continue;
        if (chunks.heightAt(px, pz) - level > CLIFF || collider(px, pz, 0.35, _h) > 0) continue;
        best = { x: px, z: pz };
        bd = d;
      }
      if (best) return best;
    }
    return null;
  }

  // ── The raft, and you in it ───────────────────────────────────────────────
  const raft = new Raft(course, (Math.random() * 2 ** 31) >>> 0);
  let colour = COLOURS[0];
  let mesh = makeRaft(colour);
  mesh.rotation.order = 'YXZ';
  player.character.addHeld('raftPaddle', makeRaftPaddle(), { rest: 0.2 });
  const heard = { on: false, churn: 0 };
  sound.addLayer(raftSounds(heard));
  let out = false; // on the water
  let aboard = false; // you're in it, guiding
  let hop = null; // { from: { x, y, z }, t } climbing aboard
  let righting = null; // { t, from } hauling it back over
  let moved = false;
  let time = 0;
  let slipAt = -Infinity;
  let heading = 0;
  let stroke = null;
  let owed = 0;
  let target = null; // a rapid to run, pointed to: { x, z, t, id }
  const last = { x: 0, z: 0 };
  const c = { fwd: 0, turn: 0, hard: false };
  let held = null; // the paddles held, from the console: { fwd, turn, hard }
  // this trip: how far, and when it began; the rapid you're in, and whether
  // you've stayed right way up since its lip; the one you were warned of
  let trip = { far: 0, t: 0, ran: 0 };
  let inRapid = null; // { rapid, clean }
  let warned = null;
  let ahead = null; // rapids.on(): the rapid you're in or the next one down
  let lookAt = 0;
  // kept: rapids run right way up, the hardest, and how many times you've swum
  const log = { ran: [], best: 0, swims: 0 };
  builder.idleWhile(() => aboard);

  const seat = SEATS.places[0]; // the guide's: back of the right-hand tube
  const mover = {
    place(o, dt) {
      if (Math.hypot(player.pos.x - last.x, player.pos.z - last.z) > MOVED) {
        o.x = player.pos.x;
        o.y = player.pos.y;
        o.z = player.pos.z;
        o.yaw = player.yaw;
        moved = true;
        return;
      }
      if (!hop) {
        readControls();
        raft.step(dt, c);
        stepped = true;
      }
      seatOf(raft, seat, SIT_UP + FLOAT, _v);
      if (hop) {
        hop.t += dt;
        const k = clamp(hop.t / HOP.time, 0, 1);
        const e = k * k * (3 - 2 * k);
        o.x = hop.from.x + (_v.x - hop.from.x) * e;
        o.z = hop.from.z + (_v.z - hop.from.z) * e;
        o.y = hop.from.y + (_v.y - SEAT_HIPS - hop.from.y) * e + Math.sin(k * Math.PI) * HOP.up;
      } else {
        o.x = _v.x;
        o.z = _v.z;
        o.y = _v.y - SEAT_HIPS;
      }
      last.x = o.x;
      last.z = o.z;
      o.yaw = raft.yaw;
      heading += wrap(raft.yaw - heading) * (1 - Math.exp(-dt * 3));
      o.heading = heading;
      o.behind = BEHIND;
      o.back = BACK;
      o.flowX = raft.flowX;
      o.flowZ = raft.flowZ;
    },
  };
  let stepped = false;

  // W S drive it along, A D turn it, shift hard: the way it points, not the
  // way the camera looks.
  function readControls() {
    if (held) {
      c.fwd = (held.fwd || 0) + crews.paddling();
      c.turn = held.turn || 0;
      c.hard = !!held.hard;
      // (steer: as a guide would, keeping her pointed down the current)
      if (held.steer && Math.hypot(raft.flowX, raft.flowZ) > STILL) c.turn = clamp(wrap(Math.atan2(raft.flowX, raft.flowZ) - raft.yaw) * 2.5 - raft.spin * 0.8, -1, 1);
      return;
    }
    if (input.blocked) {
      c.fwd = c.turn = 0;
      c.hard = false;
      return;
    }
    const ax = input.moveAxes();
    c.fwd = ax.y + crews.paddling();
    c.turn = -ax.x;
    c.hard = input.running();
  }

  // Into the water at `at` ({ x, z, yaw }), and you aboard it, climbing in
  // from where you are, or with hop false, there already.
  function launch(at, { hop: hopping = true } = {}) {
    raft.launch(at.x, at.z, at.yaw);
    out = true;
    scene.add(mesh);
    trip = { far: 0, t: time, ran: 0 };
    inRapid = null;
    warned = null;
    target = null;
    splash(at.x, at.z, 50, 1.4, 1.6);
    board(hopping);
    // (a rapid just below: said now, not again as it comes up)
    ahead = rapids.on(at.x, at.z);
    const r = ahead && ahead.rapid;
    const soon = r && ahead.along < 0 && -ahead.along < WARN ? ` · ${named(r)} ahead, in ${formatDistance(-ahead.along)}` : '';
    if (soon) warned = r.id;
    hud.flash(`your raft is in · ${input.isTouch ? 'the stick paddles and turns it' : 'W S paddle · A D turn · shift hard'} · keep her pointed down the river through the rapids${soon}`, SAY);
  }

  // You aboard it (it's out, and right way up).
  function board(hopping = true) {
    const p = player.pos;
    aboard = true;
    moved = false;
    hop = hopping ? { from: { x: p.x, y: p.y, z: p.z }, t: 0 } : null;
    last.x = p.x;
    last.z = p.z;
    heading = raft.yaw;
    player.aboard = mover;
    player.vel.set(0, 0, 0);
    player.character.seat(SEAT);
    player.character.setTool('raftPaddle');
    if (!hopping) sound.sfx('raft-in');
    tell();
    save.touch();
  }

  // You out of it, wherever you are; it stays on the water.
  function unboard() {
    if (!aboard) return;
    aboard = false;
    hop = null;
    if (player.aboard === mover) player.aboard = null;
    const ch = player.character;
    ch.seat(null);
    if (ch.action && ch.action.kind === 'paddle') ch.stop();
    if (ch.tool === 'raftPaddle') ch.setTool(null);
    ch.root.rotation.x = 0;
    ch.root.rotation.z = 0;
    stroke = null;
    tell();
    save.touch();
  }

  // Rolled up and back in your pack.
  function packAway() {
    unboard();
    if (!out) return;
    out = false;
    righting = null;
    scene.remove(mesh);
    heard.on = false;
    tell();
    save.touch();
  }

  // Out onto the bank, the raft hauled out and rolled up; or with no bank in
  // reach, over the side into the river (asked twice).
  function getOut() {
    if (!aboard || hop) return false;
    const spot = bankBy(raft.x, raft.z, raft.level);
    if (!spot && time - slipAt > SLIP) {
      slipAt = time;
      hud.flash(`no bank within reach to step out onto · paddle to the side, or get out again to go over the side`, SAY);
      return false;
    }
    if (!spot) {
      // over the side: into the water beside it, and it stays out
      unboard();
      seatOf(raft, seat, 0, _v);
      player.pos.set(_v.x, raft.level - 0.6, _v.z);
      player.vel.set(raft.vx, 0, raft.vz);
      hud.flash('over the side into the river · swim back to the raft and get in again', SAY);
      return true;
    }
    packAway();
    player.pos.set(spot.x, player.groundAt(spot.x, spot.z), spot.z);
    player.vel.set(0, 0, 0);
    player.grounded = true;
    sound.sfx('raft-out');
    finish('out onto the bank, your raft rolled up and packed away');
    return true;
  }

  // How the trip went.
  function finish(word) {
    const said = [word];
    if (trip.far >= 30) said.push(`${formatDistance(trip.far)} down the river`);
    if (trip.ran) said.push(`${trip.ran} rapid${trip.ran > 1 ? 's' : ''} run`);
    hud.flash(said.join(' · '), SAY);
  }

  // Back in from the water (or from the bank beside it): righted first if
  // it's upside down.
  function climbIn() {
    if (!out || aboard || righting) return false;
    if (Math.hypot(player.pos.x - raft.x, player.pos.z - raft.z) > NEAR) return false;
    if (raft.flipped) {
      righting = { t: 0, from: raft.roll };
      sound.sfx('raft-right');
      hud.flash('hauling her back over…');
      return true;
    }
    board(true);
    return true;
  }

  // The raft on the water (or rolling back over), and you sat on its tube.
  function pose() {
    mesh.position.set(raft.x, raft.y + FLOAT, raft.z);
    mesh.rotation.set(raft.pitch, raft.yaw, raft.roll, 'YXZ');
    if (!aboard) return;
    const root = player.character.root;
    seatOf(raft, seat, SIT_UP + FLOAT, _v);
    _e.set(raft.pitch, raft.yaw, raft.roll, 'YXZ');
    if (hop) {
      const k = clamp(hop.t / HOP.time, 0, 1);
      const e = k * k * (3 - 2 * k);
      const f = hop.from;
      root.position.set(f.x + (_v.x - f.x) * e, f.y + (_v.y - SEAT_HIPS - f.y) * e + Math.sin(k * Math.PI) * HOP.up, f.z + (_v.z - f.z) * e);
      root.rotation.set(raft.pitch * e, raft.yaw, raft.roll * e);
      return;
    }
    root.position.set(_v.x, _v.y - SEAT_HIPS, _v.z);
    root.rotation.copy(_e);
  }

  // Water thrown up at (x, z), if there's water there.
  function splash(x, z, n, up, spread = 0.9) {
    if (!chunks.waterAt(x, z, _w) || _w.depth <= 0) return false;
    splashes.burst(x, _w.level + 0.04, z, _w.level, n, { up, spread, vx: raft.vx * 0.4, vz: raft.vz * 0.4, from: 0.3 });
    return true;
  }

  // Your paddle: stroke after stroke while you drive it or turn it, the
  // blade going in and coming out.
  function paddle() {
    const ch = player.character;
    const going = Math.abs(c.fwd) > 0.05 || Math.abs(c.turn) > 0.05;
    if (ch.tool !== 'raftPaddle') ch.setTool('raftPaddle');
    if (going && !hop) ch.play('paddle', c.hard ? STROKE.hard : STROKE.easy, true);
    else if (ch.action && ch.action.kind === 'paddle') ch.stop();
    const act = ch.action;
    const p = act && act.kind === 'paddle' ? (act.t / act.dur) % 1 : null;
    if (p !== null && stroke !== null) {
      if (passed(stroke, p, CATCH)) {
        const blade = ch.tools.raftPaddle.object.getObjectByName('blade');
        blade.getWorldPosition(_v);
        if (splash(_v.x, _v.z, c.hard ? 22 : 14, c.hard ? 1.3 : 0.9, 0.45)) sound.sfx('raft-stroke', { size: c.hard ? 1 : 0.5 });
      }
      if (passed(stroke, p, EXIT)) {
        const blade = ch.tools.raftPaddle.object.getObjectByName('blade');
        blade.getWorldPosition(_v);
        splash(_v.x, _v.z, 8, 0.7, 0.4);
      }
    }
    stroke = p;
  }

  // ── What happens on the way ───────────────────────────────────────────────
  raft.on('drop', (h) => {
    if (!out) return;
    raft.toWorld(0, RAFT.len / 2, _p);
    splash(_p.x, _p.z, Math.round(30 + h * 50), 1.6 + h * 2.5, 1.4);
    sound.sfx('raft-drop', { size: clamp(h / 1.2, 0, 1) });
  });
  let waveAt = -Infinity;
  raft.on('wave', (size) => {
    if (!out) return;
    raft.toWorld(0, RAFT.len / 2, _p);
    splash(_p.x, _p.z, Math.round(20 + size * 50), 1.2 + size * 2.2, 1.6);
    if (!aboard || size < 0.5 || time - waveAt < WAVE_EVERY) return;
    waveAt = time;
    sound.sfx('raft-wave', { size });
  });
  raft.on('bump', (speed, what) => {
    if (!out) return;
    sound.sfx('raft-bump', { size: clamp(speed / 2, 0.2, 1) });
    splash(raft.x, raft.z, Math.round(10 + speed * 10), 0.9 + speed * 0.5, 1.2);
    if (aboard && speed > 1.4) hud.flash(`bump: off ${what}`);
  });
  raft.on('flip', () => {
    if (!out) return;
    sound.sfx('raft-flip');
    splash(raft.x, raft.z, 120, 2.6, 2.2);
    if (inRapid) inRapid.clean = false;
    if (!aboard) return;
    // thrown in, beside it
    unboard();
    seatOf(raft, seat, 0, _v);
    player.pos.set(_v.x, raft.level - 0.8, _v.z);
    player.vel.set(raft.vx * 0.8, -1, raft.vz * 0.8);
    log.swims++;
    save.touch();
    hud.flash(`over she goes! you're in the river · get to the raft, then ${input.isTouch ? '“right it”' : 'right it from your pack (Tab)'}`, SAY + 1500);
  });

  // ── The rapids on the way ─────────────────────────────────────────────────
  function watchRapids() {
    if (time < lookAt) return;
    lookAt = time + 0.25;
    ahead = rapids.on(raft.x, raft.z);
    const r = ahead && ahead.rapid;
    // coming up: said once
    if (r && ahead.along < 0 && -ahead.along < WARN && warned !== r.id && aboard) {
      warned = r.id;
      const tip = r.cls >= 5 ? 'scout it from the bank, or get out and carry round' : r.cls >= 3 ? 'keep her straight and paddle hard' : 'read the water and pick your line';
      hud.flash(`${named(r)} ahead, in ${formatDistance(-ahead.along)} · ${formatDistance(r.len)}, falls ${r.drop.toFixed(1)} m · ${tip}`, SAY);
    }
    // into it, and out of the foot of it
    if (r && ahead.along >= 0 && ahead.along <= r.len) {
      if (!inRapid || inRapid.rapid.id !== r.id) inRapid = { rapid: r, clean: aboard && !raft.flipped };
    } else if (inRapid) {
      const done = inRapid;
      inRapid = null;
      const past = ahead && ahead.rapid.id === done.rapid.id ? ahead.along > done.rapid.len : true;
      if (past && done.clean && aboard && !raft.flipped) ran(done.rapid);
    }
  }
  function ran(r) {
    trip.ran++;
    const first = !log.ran.includes(r.id);
    if (first) log.ran.push(r.id);
    const best = r.cls > log.best;
    if (best) log.best = r.cls;
    save.touch();
    hud.flash(`you ran ${named(r)}${first ? '' : ' again'}, right way up${best && log.ran.length > 1 ? ' · your hardest yet' : ''}`, SAY);
  }

  // ── Somewhere to go and run ───────────────────────────────────────────────
  // A spot to put in a little way above the lip of a rapid.
  function putIn(r) {
    const seg = r.seg;
    const s = Math.max(seg.sa + 4, r.s0 - GUIDE.above);
    const S = seg.s;
    let q = 0;
    while (q < seg.count - 1 && S[q + 1] < s) q++;
    const t = (s - S[q]) / Math.max(1e-6, S[q + 1] - S[q]);
    return { x: seg.pts[q * 2] + (seg.pts[q * 2 + 2] - seg.pts[q * 2]) * t, z: seg.pts[q * 2 + 1] + (seg.pts[q * 2 + 3] - seg.pts[q * 2 + 1]) * t };
  }
  function guideTo(r) {
    const p = putIn(r);
    target = { x: p.x, z: p.z, t: time, id: r.id };
  }
  hud.guide(() => {
    if (!target) return null;
    if (time - target.t > GUIDE.long || Math.hypot(player.pos.x - target.x, player.pos.z - target.z) < GUIDE.near) {
      target = null;
      return null;
    }
    return { id: 'rafting', label: 'a rapid to run', color: GUIDE.color, x: target.x, z: target.z };
  });

  // ── The pack: what it would do here ───────────────────────────────────────
  // Someone else's raft beside you, with room in it?
  const crews = new Crews({ scene, peers, save, chunks, player, raft, sound, input, hud, depthAt, splashes });
  function press() {
    if (aboard) return getOut();
    if (righting || hop) return false;
    if (out && Math.hypot(player.pos.x - raft.x, player.pos.z - raft.z) <= NEAR) return climbIn();
    if (crews.aboard) return crews.leave();
    if (crews.joinable()) {
      packAway();
      return crews.join();
    }
    if (player.carrier || player.aboard) {
      hud.flash('get down first: you can’t get into a raft from here');
      return false;
    }
    if (player.space) {
      hud.flash('no river to run in here');
      return false;
    }
    const p = player.pos;
    // out already, but too far off: rolled up and thrown in again here
    const spot = waterBy(p.x, p.z);
    if (spot && (spot.x - p.x) ** 2 + (spot.z - p.z) ** 2 <= REACH * REACH + 1e-6) {
      if (out) packAway();
      launch(spot);
      return true;
    }
    const r = rapids.nearest(p.x, p.z);
    if (!r) {
      hud.flash('no river wide and deep enough for a raft here, and no rapids near enough to run', SAY);
      return false;
    }
    guideTo(r);
    const to = putIn(r);
    hud.flash(`no river here wide and deep enough for a raft · the nearest rapid to run is ${named(r)}, ${formatDistance(Math.hypot(to.x - p.x, to.z - p.z))} ${way(to.x - p.x, to.z - p.z)}: put in above it`, SAY);
    return false;
  }
  // What it would do here, in a word: what the pack lists it by, and a touch
  // screen's button says.
  let doing = '';
  commands.add({ id: 'raft', group: 'WANDER', label: 'whitewater raft: throw it in at a river and run the rapids · get in · get out', run: press, now: () => doing });
  commands.describe({ group: 'WANDER', help: 'in the raft', label: 'W S paddle forward, back · A D turn · shift paddle hard' });

  // Water wide enough for a raft, beside you: looked for now and then.
  let fit = false;
  let noticeAt = 0;
  function notice() {
    if (time < noticeAt) return fit;
    noticeAt = time + 0.5;
    fit = false;
    if (player.carrier || player.aboard || player.space) return false;
    const p = player.pos;
    if (!chunks.waterAt(p.x, p.z, _w) && !chunks.waterAt(p.x + 3, p.z, _w) && !chunks.waterAt(p.x - 3, p.z, _w) && !chunks.waterAt(p.x, p.z + 3, _w) && !chunks.waterAt(p.x, p.z - 3, _w)) return false;
    fit = !!waterBy(p.x, p.z, 3);
    return fit;
  }

  let cued = false;
  function cue() {
    let html = '';
    let word = '';
    const near = out && !aboard && Math.hypot(player.pos.x - raft.x, player.pos.z - raft.z) <= NEAR;
    if (aboard) {
      word = 'get out';
      if (hop) html = 'climbing aboard…';
      else if (raft.aground) html = input.isTouch ? 'aground: paddle off with the stick' : 'aground · <b>W S</b> paddle off · <b>A D</b> turn';
      else if (inRapid) html = input.isTouch ? `${named(inRapid.rapid)} · keep her straight!` : `${named(inRapid.rapid)} · keep her straight · <b>shift</b> paddle hard`;
      else if (!input.isTouch && time - trip.t < 12) html = '<b>W S</b> paddle · <b>A D</b> turn · <b>shift</b> hard · <b>Tab</b> get out';
    } else if (righting) {
      html = 'hauling her back over…';
    } else if (near) {
      word = raft.flipped ? 'right it' : 'get in';
      html = input.isTouch ? '' : `${raft.flipped ? 'your raft is upside down' : 'your raft'} · <b>Tab</b> ${word}`;
    } else if (crews.aboard) {
      word = 'get out';
    } else if (crews.joinable()) {
      word = 'get in';
      html = input.isTouch ? '' : `${crews.joinable().name || 'their'} raft has room · <b>Tab</b> get in`;
    } else if (notice()) {
      word = 'raft';
    }
    if (html) hud.cue({ html });
    else if (cued) hud.cue(null);
    cued = !!html;
    doing = word;
  }

  // ── What's yours, in the pack ─────────────────────────────────────────────
  // (it's always in your pack, as the tube is: only where it is while it's
  // out, and the rapids you've run)
  pack.have(() => {
    const list = [];
    if (out) {
      const d = Math.hypot(raft.x - player.pos.x, raft.z - player.pos.z);
      list.push({ label: 'your raft', note: aboard ? 'on the river, you guiding it' : `${raft.flipped ? 'upside down in the river' : 'on the river'}${d > 4 ? `, ${formatDistance(d)} ${way(raft.x - player.pos.x, raft.z - player.pos.z)}` : ', beside you'}` });
    }
    if (log.ran.length) list.push({ label: 'rapids run', note: `${log.ran.length}, the hardest Class ${ROMAN[log.best]}${log.swims ? ` · swum ${log.swims} time${log.swims > 1 ? 's' : ''}` : ''}` });
    return list.length ? list : null;
  });

  // ── The readout ───────────────────────────────────────────────────────────
  const readout = document.createElement('div');
  readout.id = 'rafting';
  readout.hidden = true;
  document.getElementById('hud')?.appendChild(readout);
  let shown = '';
  function show() {
    let text = '';
    if (aboard && !hop) {
      const parts = [`${(raft.speed * 3.6).toFixed(1)} km/h`];
      const r = ahead && ahead.rapid;
      if (r && ahead.along >= 0 && ahead.along <= r.len) parts.push(`${named(r)} · ${Math.round(ahead.along)} of ${Math.round(r.len)} m`);
      else if (r && ahead.along < 0) parts.push(`${named(r)} in ${formatDistance(-ahead.along)}`);
      else if (trip.far >= 20) parts.push(`${formatDistance(trip.far)}${trip.ran ? ` · ${trip.ran} run` : ''}`);
      text = parts.join(' · ');
    } else if (out && !aboard && raft.flipped) text = 'your raft is upside down: swim to it';
    if (text === shown) return;
    shown = text;
    readout.textContent = text;
    readout.hidden = !text;
  }

  // ── Everyone else here ────────────────────────────────────────────────────
  // They're told whether your raft is out, which way up, and its colour; the
  // rest they see from where you sit in it.
  function tell() {
    save.say('raft', out ? { on: true, aboard, flipped: raft.flipped, colour, x: round(raft.x, 10), z: round(raft.z, 10), yaw: round(raft.yaw, 100) } : null);
  }
  let toldAt = 0;
  if (peers) {
    save.on('message', (msg) => msg.ch === 'raft' && crews.hear(msg.from, msg.body));
    peers.on('change', () => out && tell());
    game.addSystem({ name: 'rafts', phase: 'world', update: ({ dt }) => crews.update(dt) });
  }

  // ── Saving ────────────────────────────────────────────────────────────────
  // Whether it's out and you're in it, so you're back in it where you left
  // off; the rapids you've run right way up, the hardest, how often you've swum.
  let pending = false;
  save.register({
    id: 'rafting',
    scope: 'yours',
    collect: () => (aboard || log.ran.length || log.swims ? { in: aboard, ran: log.ran.slice(), best: log.best, swims: log.swims } : null),
    validate(raw) {
      if (!raw || typeof raw !== 'object') return null;
      const ran = Array.isArray(raw.ran) ? raw.ran.filter((id) => typeof id === 'string' && /^rapid:-?\d+,-?\d+$/.test(id)).slice(0, 500) : [];
      return { in: raw.in === true, ran, best: Number.isInteger(raw.best) ? clamp(raw.best, 0, 6) : 0, swims: Number.isInteger(raw.swims) && raw.swims > 0 ? raw.swims : 0 };
    },
    restore(data) {
      pending = !!(data && data.in);
      log.ran = data ? data.ran.slice() : [];
      log.best = data ? data.best : 0;
      log.swims = data ? data.swims : 0;
    },
  });
  game.on('ready', () => {
    if (!pending) return;
    pending = false;
    const spot = waterBy(player.pos.x, player.pos.z, 2.5);
    if (!spot) return;
    raft.launch(spot.x, spot.z, spot.yaw);
    out = true;
    scene.add(mesh);
    trip = { far: 0, t: time, ran: 0 };
    board(false);
  });

  // ── Every frame ───────────────────────────────────────────────────────────
  // After the player (update) has been moved: the raft, and you in it.
  game.addSystem({
    name: 'rafting',
    phase: 'update',
    update({ dt }) {
      time += dt;
      if (aboard && (player.aboard !== mover || player.carrier || moved)) {
        // something else has you now, or has put you somewhere
        const far = moved;
        unboard();
        if (far) packAway();
      }
      if (out) {
        // not guided: it goes where the river takes it
        if (!stepped && !righting) raft.step(dt, null);
        stepped = false;
        if (righting) {
          righting.t += dt;
          const k = clamp(righting.t / RIGHTING, 0, 1);
          raft.roll = righting.from * (1 - k * k * (3 - 2 * k));
          if (k >= 1) {
            righting = null;
            raft.right();
            splash(raft.x, raft.z, 60, 1.6, 1.8);
            if (Math.hypot(player.pos.x - raft.x, player.pos.z - raft.z) <= NEAR + 2) board(true);
          }
        }
        if (hop && hop.t >= HOP.time) {
          hop = null;
          splash(raft.x, raft.z, 40, 1.4, 1.6);
          sound.sfx('raft-in');
        }
        pose();
        if (aboard && !hop) {
          trip.far += raft.speed * dt;
          paddle();
          // white water thrown up round its tubes
          owed += (raft.foam + raft.waves) * Math.max(0.5, raft.speed) * SPRAY * dt;
          if (owed >= 5) {
            const a = Math.random() * Math.PI * 2;
            raft.toWorld(Math.cos(a) * RAFT.beam * 0.5, Math.sin(a) * RAFT.len * 0.5, _p);
            splash(_p.x, _p.z, Math.floor(owed), 1 + raft.foam + raft.waves, 0.7);
            owed -= Math.floor(owed);
          }
        }
        watchRapids();
        heard.on = aboard && !hop;
        heard.churn = Math.max(raft.foam, raft.waves);
        // the dry stretch it can't float in, or left far behind: packed away
        if (!aboard && !righting && (raft.dry || Math.hypot(player.pos.x - raft.x, player.pos.z - raft.z) > LOST)) {
          packAway();
          hud.flash('your raft is rolled up and back in your pack', SAY);
        } else if (aboard && raft.dry) {
          const at = bankBy(raft.x, raft.z, raft.level) || { x: raft.x, z: raft.z };
          packAway();
          player.pos.set(at.x, player.groundAt(at.x, at.z), at.z);
          player.vel.set(0, 0, 0);
          finish('run out of water: out of your raft');
        }
        // where it is, for everyone else: now and then, and as it rolls
        if (time - toldAt > 1) {
          toldAt = time;
          tell();
        }
      }
      cue();
      show();
    },
  });

  // ── From the console (and the play-through) ───────────────────────────────
  const brief = (r) => (r ? { id: r.id, name: r.name, cls: r.cls, roman: r.roman, len: Math.round(r.len), drop: round(r.drop, 100), grade: round(r.grade, 1000), lip: { x: round(r.lip.x, 10), z: round(r.lip.z, 10) }, foot: { x: round(r.foot.x, 10), z: round(r.foot.z, 10) }, x: round(r.x, 10), z: round(r.z, 10), putIn: (({ x, z }) => ({ x: round(x, 10), z: round(z, 10) }))(putIn(r)) } : null);
  game.provide('rafting', {
    raft,
    rapidsOf: rapids,
    // rafting together: whose raft you're crew in, and whose there are about
    crew: {
      get aboard() {
        return crews.aboard ? { guide: crews.aboard.guide, seat: crews.aboard.seat, paddle: crews.aboard.paddle } : null;
      },
      joinable: () => crews.joinable(),
      rafts: () => [...crews.rafts].map(([id, r]) => ({ id, aboard: !!r.body.aboard, flipped: !!r.body.flipped, x: round(r.pose.x, 10), z: round(r.pose.z, 10) })),
      paddling: () => crews.paddling(),
    },
    // whether it's on the water, and whether you're in it
    get afloat() {
      return out;
    },
    get aboard() {
      return aboard;
    },
    in() {
      if (aboard) return false;
      const spot = waterBy(player.pos.x, player.pos.z);
      if (!spot) return false;
      if (out) packAway();
      launch(spot);
      return true;
    },
    out: getOut,
    climbIn,
    press,
    state: () =>
      out
        ? {
            aboard,
            hopping: !!hop,
            flipped: raft.flipped,
            righting: !!righting,
            x: round(raft.x, 10),
            z: round(raft.z, 10),
            yaw: round(raft.yaw, 100),
            speed: round(raft.speed, 100),
            depth: round(raft.depth, 100),
            foam: round(raft.foam, 100),
            waves: round(raft.waves, 100),
            side: round(raft.side, 100),
            aground: raft.aground,
            far: round(trip.far, 10),
            ran: trip.ran,
            rapid: ahead ? { ...brief(ahead.rapid), along: round(ahead.along, 10) } : null,
            inRapid: inRapid ? inRapid.rapid.id : null,
          }
        : null,
    log: () => ({ ran: log.ran.slice(), best: log.best, swims: log.swims }),
    rapids: (x = player.pos.x, z = player.pos.z, far = 800) => rapids.within(x - far, z - far, x + far, z + far).map(brief),
    nearest: (x = player.pos.x, z = player.pos.z, reach = 1500, least = 2, most = 4) => brief(rapids.nearest(x, z, { reach, least, most })),
    // into the raft at a spot on the water, there already, facing yaw (for
    // the play-through: put in above a rapid)
    putInAt(x, z, yaw) {
      if (out) packAway();
      if (!waterBy(x, z, 3)) return false;
      const spot = waterBy(x, z, 3);
      player.pos.set(spot.x, raft.level, spot.z);
      raft.launch(spot.x, spot.z, yaw ?? spot.yaw);
      out = true;
      scene.add(mesh);
      trip = { far: 0, t: time, ran: 0 };
      last.x = player.pos.x;
      last.z = player.pos.z;
      board(false);
      return true;
    },
    // hold the paddles at { fwd, turn, hard, steer } until told otherwise
    // (null: back to the keys), for the play-through. steer: keep her
    // pointed down the current.
    hold(h) {
      held = h;
    },
    colour(i) {
      colour = COLOURS[((i % COLOURS.length) + COLOURS.length) % COLOURS.length];
      mesh.userData.fabric.color.set(colour);
      tell();
    },
  });
}
