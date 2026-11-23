// Tubing: pull an inner tube out of your pack at the water's edge, drop into
// it, and float down the river for as long as you like. The current carries
// you at its own pace, down riffles and little cascades, round boulders, and
// across the lakes on the way to where the water runs out of them, and on
// down. Paddle with your hands (W A S D) to hurry it along or make for a
// bank, and F (the act key) climbs out wherever you are. Where the river
// ends (a lake that keeps its water, or the sea) you're told so, and where
// the nearest river that runs on somewhere else is. Away from the water, V
// says where the nearest river to float down is.
//
//   tube.js     how it floats: the current, lakes, shallows, boulders, the surface
//   course.js   where the water goes: out of a lake, how far a river runs, the nearest
//   model.js    the tube: black rubber, a valve, a patch
//   sound.js    water slapping the rubber; getting in, strokes, bumps, drops, getting out
//   others.js   other people here in theirs
//
// While you float, the tube moves you (player.aboard) and says you're sat in
// the water (its wade), so the river ripples round you and is heard going
// by; you sit in it with your arms over the sides (Character.seat), and the
// tools are put away (builder.idleWhile), all but one that works afloat:
// take up the fishing rod and you drift and fish, hands off the water.
// Whether you're in it, and your longest float in this world, are yours
// (the 'tubing' domain).
//
// From the console:
//   world.tubing.in()      into it, at the water beside you
//   world.tubing.out()     out onto the bank (or into the water, asked twice)
//   world.tubing.state()   how it's going: how fast, how far, how much river is left
//   world.tubing.river()   the nearest river to float down, and how far it runs

import * as THREE from 'three';
import { Tube, TUBE, STILL } from './tube.js';
import { Course } from './course.js';
import { makeTube } from './model.js';
import { tubeSounds } from './sound.js';
import { Tubers } from './others.js';
import './tubing.css';
import { SEAT_HIPS } from '../player/character.js';
import { segDist, waterSample, wrapAngle as wrap } from '../core/geom.js';
import { formatDistance } from '../core/format.js';
import { clamp } from '../noise.js';

// Getting in: the water can be this far (m) from you, looked for this
// finely (m), and deep enough to float the tube with a little to spare; it
// takes this long (s) to hop in, rising this high (m) on the way.
const REACH = 3.5;
const LOOK = 0.5;
const SPARE = 0.05;
const HOP = { time: 0.75, up: 0.45 };
// Getting out: onto a bank this far (m) from the tube's middle at most,
// where the water is no deeper than WADE m and the bank stands no more than
// CLIFF m over it. F again within SLIP s slips you out into deep water.
const OUT_REACH = 2.6;
const WADE = 0.45;
const CLIFF = 1.2;
const SLIP = 4;
// Put somewhere else by something else (back to the start): moved further
// than this (m) from where the tube had you, you're out of it (the mover's
// slack: player/rides.ts).
const MOVED = 4;
// How you sit in it: your hips this far (m) under the tube's middle and
// back of it, your feet this far under it (where you are, to the rest of
// the game), and this much of you in the water, for its ripples and sound.
const SIT = { sink: 0.14, back: 0.07 };
const FEET = 0.35;
const SAT_IN = 0.25;
// Legs over the front, arms out over the sides on the rim, leaning back
// (Character.seat; its stroke is set while you paddle).
const SEAT = { spread: 0.16, hang: 0.08, fwd: 0.72, lean: -0.42, reins: 0, rest: 1, stroke: null };
// A stroke of your hands takes this long (s), easy and hard; they go into
// the water this far through it.
const STROKE = { easy: 1.15, hard: 0.8 };
const DIP = 0.08;
// The camera: round behind the way you're going this fast (1/s), turning
// with you as you go round the bends (1/s), and this much further back (m).
const BEHIND = 0.8;
const TURNS = 1.5;
const BACK = 0.5;
// ...and quicker for the first few seconds (1/s, s), from wherever it was
// looking when you got in.
const SETTLE = { behind: 2.5, time: 3 };
// White water thrown up round the rim: drops a second, per m/s, at full froth.
const SPRAY = 14;
// How often (s) to work out how much river is left; and how long (s) on
// still water with no way out before the river has ended.
const LOOK_AHEAD = 1;
const ENDED = 2.5;
// Pointing the way to a river to float down: until you're this near it (m)
// or for this long (s).
const GUIDE = { near: 12, long: 900, color: '#8fd0e6' };
// A collider this wide (m) or wider is a boulder, not a trunk.
const BOULDER = 0.5;
// How often (s) to look about for running water you could float down, to
// say so; and how far (m).
const NOTICE = { every: 0.3, far: 2.5 };
// How near (m) running water beside you counts as, for the act key: further
// than a boat or a car you're right beside.
const FLOAT_AT = 2.4;
const SAY = 5200; // ms a sentence stays on the screen
const WAYS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

const _w = waterSample();
const _d = waterSample();
const _seg = { d: 0, nx: 0, nz: 0, t: 0 };
const _h = { nx: 0, nz: 0, depth: 0, what: '' };
const _v = new THREE.Vector3();
const round = (v, f) => Math.round(v * f) / f;
// which way (dx, dz) points, as a compass point (north is -z)
const way = (dx, dz) => WAYS[Math.round((((Math.atan2(dx, -dz) * 180) / Math.PI + 360) % 360) / 45) % 8];
function duration(s) {
  if (s < 90) return `${Math.round(s)} s`;
  if (s < 90 * 60) return `${Math.round(s / 60)} min`;
  return `${(s / 3600).toFixed(1)} h`;
}

// The features this uses, so it is installed after them (game/features.js).
// And after boats, fishing and mounts, whose words on what a key would do
// are said every frame, so that what F would do in the tube is said over
// them; and after act, whose key (F) gets you in and out of the tube.
export const after = ['render', 'ui', 'world', 'player', 'audio', 'build', 'save', 'splashes', 'boats', 'fishing', 'mounts', 'act'];
export function installTubing(game) {
  const { scene, chunks, gen, solids, player, input, hud, commands, save, sound, builder, splashes, peers, act } = game;

  // ── The water, and what's in it ───────────────────────────────────────────
  const depthAt = (x, z) => (chunks.waterAt(x, z, _d) ? Math.max(0, _d.depth) : 0);
  const course = new Course(gen.water, depthAt);
  // trunks and boulders within r of (x, z)
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
      out.what = cr >= BOULDER ? 'a boulder' : 'a tree';
    });
    return best;
  }
  const world = {
    water: (x, z, out) => chunks.waterAt(x, z, out),
    drain: (x, z) => course.drain(x, z),
    hit(x, z, r, out) {
      let best = collider(x, z, r, out);
      // and anything built that stands in the water at the tube's height (a
      // dock), but not what it floats under
      if (solids) {
        const y = tube.level;
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

  // Water deep enough to float in, at (x, z) or as near it as there is
  // within reach, clear of trunks and boulders; the deepest of the nearest. -> { x, z } or null
  function waterBy(x, z, reach = REACH) {
    const deep = TUBE.draft + SPARE;
    const clear = (px, pz) => collider(px, pz, TUBE.r * 0.6, _h) === 0;
    if (depthAt(x, z) >= deep && clear(x, z)) return { x, z };
    for (let r = LOOK; r <= reach + 1e-6; r += LOOK) {
      const n = Math.max(8, Math.round((Math.PI * 2 * r) / LOOK));
      let best = null;
      let bd = 0;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const px = x + Math.cos(a) * r;
        const pz = z + Math.sin(a) * r;
        const d = depthAt(px, pz);
        if (d >= deep && d > bd && clear(px, pz)) {
          best = { x: px, z: pz };
          bd = d;
        }
      }
      if (best) return best;
    }
    return null;
  }

  // Somewhere to climb out onto from the tube at (x, z): the nearest bank,
  // or shallows you can stand in, that isn't a cliff or a tree. -> { x, z } or null
  function bankBy(x, z, level) {
    for (let r = TUBE.r + 0.2; r <= OUT_REACH + 1e-6; r += 0.3) {
      let best = null;
      let bd = Infinity;
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
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

  // ── You, in it ────────────────────────────────────────────────────────────
  const tube = new Tube(world, (Math.random() * 2 ** 31) >>> 0);
  const mesh = makeTube();
  const heard = { on: false, churn: 0 };
  sound.addLayer(tubeSounds(heard));
  let active = false;
  let hop = null; // { from: { x, y, z }, t } hopping in
  let hold = null; // what you're held by while you're in it (player/rides.ts)
  let float = { far: 0, t: 0 }; // this float: how far (m), and when it began
  let best = 0; // your longest float in this world (m)
  let time = 0;
  let slipAt = -Infinity;
  let heading = 0; // the way you're going, smoothed, for the camera
  let here = null; // how much river is left, and where it ends (course.at)
  let lookAt = 0;
  let lastEnd = null; // where the river you've been on ends
  let ended = 0; // s on still water with no way out
  let endSaid = false;
  let ran = false; // whether this float has been on running water
  let owed = 0; // spray owed
  let stroke = 0; // how far through the stroke the hands were last frame
  let target = null; // a river to float down, pointed to: { x, z, t (when) }
  const c = { x: 0, z: 0, hard: false };
  // with the fishing rod in hand you drift and fish, your hands off the water
  const fishing = () => !!(builder.current && builder.current.afloat && !builder.idle);
  builder.idleWhile(() => active && !(builder.current && builder.current.afloat));

  const mover = {
    slack: MOVED,
    place(out, dt) {
      if (hop) {
        hop.t += dt;
        const k = clamp(hop.t / HOP.time, 0, 1);
        const e = k * k * (3 - 2 * k);
        out.x = hop.from.x + (tube.x - hop.from.x) * e;
        out.z = hop.from.z + (tube.z - hop.from.z) * e;
        out.y = hop.from.y + (tube.y - FEET - hop.from.y) * e + Math.sin(k * Math.PI) * HOP.up;
        out.yaw = tube.yaw;
        out.heading = heading;
        return;
      }
      readControls();
      tube.step(dt, c);
      out.x = tube.x;
      out.z = tube.z;
      out.y = tube.y - FEET;
      out.yaw = tube.yaw;
      if (tube.speed > 0.08) heading += wrap(Math.atan2(tube.vx, tube.vz) - heading) * (1 - Math.exp(-dt * TURNS));
      out.heading = heading;
      out.behind = time - float.t < SETTLE.time ? SETTLE.behind : BEHIND;
      out.back = BACK;
      out.wade = tube.dry ? 0 : Math.min(SAT_IN, tube.depth);
      out.flowX = tube.flowX;
      out.flowZ = tube.flowZ;
    },
  };

  // W A S D paddle the way the camera looks, as walking does; shift, hard.
  function readControls() {
    if (input.blocked || fishing()) {
      c.x = c.z = 0;
      c.hard = false;
      return;
    }
    const ax = input.moveAxes();
    const yaw = player.camYaw;
    c.x = -Math.sin(yaw) * ax.y + Math.cos(yaw) * ax.x;
    c.z = -Math.cos(yaw) * ax.y - Math.sin(yaw) * ax.x;
    c.hard = input.running();
  }

  // Into the tube on the water at `at`: hopped into from where you are, or
  // with hop false, there already (back where you left off).
  function getIn(at, { hop: hopping = true } = {}) {
    if (active) return false;
    // (put somewhere else while you're in it, R or a teleport, that's the end of the float)
    hold = player.rides.take({ by: 'tubing', what: 'your tube', aboard: mover, lost: (why) => (stow(), why === 'moved' && finish('out of your tube')) });
    if (!hold) return false;
    const p = player.pos;
    const flowing = chunks.waterAt(at.x, at.z, _w) && Math.hypot(_w.flowX, _w.flowZ) >= STILL;
    const yaw = flowing ? Math.atan2(_w.flowX, _w.flowZ) : Math.hypot(at.x - p.x, at.z - p.z) > 0.3 ? Math.atan2(at.x - p.x, at.z - p.z) : player.yaw;
    tube.launch(at.x, at.z, yaw);
    heading = yaw;
    active = true;
    hop = hopping ? { from: { x: p.x, y: p.y, z: p.z }, t: 0 } : null;
    player.vel.set(0, 0, 0);
    player.character.seat(SEAT);
    SEAT.stroke = null;
    scene.add(mesh);
    pose();
    float = { far: 0, t: time };
    target = null;
    here = course.at(at.x, at.z);
    if (here) lastEnd = here.end;
    lookAt = time + LOOK_AHEAD;
    ended = 0;
    endSaid = false;
    if (hopping) splash(at.x, at.z, 18, 1.2);
    else sound.sfx('tube-in');
    ran = flowing;
    const how = input.isTouch ? 'the stick paddles' : 'W A S D to paddle · F to get out';
    hud.flash(`into your tube · ${flowing ? 'the river carries you along' : 'you drift across the still water'} · ${how}`, SAY);
    tell();
    save.touch();
    return true;
  }

  // Out onto the bank, or into the water if there's none in reach (but only
  // when asked twice).
  function getOut() {
    if (!active || hop) return false;
    const spot = bankBy(tube.x, tube.z, tube.level);
    if (!spot && time - slipAt > SLIP) {
      slipAt = time;
      hud.flash(`no bank within reach to climb out onto · paddle to the side, or ${input.isTouch ? '“get out”' : 'F'} again to slip out into the water`, SAY);
      return false;
    }
    const at = spot || { x: tube.x, z: tube.z };
    stow();
    player.pos.set(at.x, player.groundAt(at.x, at.z), at.z);
    player.vel.set(0, 0, 0);
    player.grounded = true;
    sound.sfx('tube-out');
    finish(spot ? 'out of your tube, onto the bank' : 'out of your tube, into the water');
    return true;
  }

  // Put away at once, wherever you are.
  function stow() {
    if (!active) return;
    active = false;
    hop = null;
    if (hold) hold.release();
    hold = null;
    const ch = player.character;
    ch.seat(null);
    SEAT.stroke = null;
    ch.root.rotation.x = 0;
    ch.root.rotation.z = 0;
    scene.remove(mesh);
    heard.on = false;
    tell();
    save.touch();
  }

  // How far it was, and whether it was your longest.
  function finish(word) {
    const far = Math.round(float.far);
    const said = [word];
    if (far >= 20) said.push(`${formatDistance(far)} in ${duration(time - float.t)}`);
    if (far >= 20 && far > best) {
      if (best) said.push('your longest float yet');
      best = far;
      save.touch();
    }
    hud.flash(said.join(' · '), SAY);
  }

  // The tube on the water, and you sat in it (or hopping in).
  function pose() {
    mesh.position.set(tube.x, tube.y, tube.z);
    mesh.rotation.set(tube.pitch, tube.yaw, tube.roll);
    const root = player.character.root;
    _v.set(0, -SIT.sink - SEAT_HIPS, -SIT.back).applyEuler(mesh.rotation).add(mesh.position);
    if (hop) {
      const k = clamp(hop.t / HOP.time, 0, 1);
      const e = k * k * (3 - 2 * k);
      const f = hop.from;
      root.position.set(f.x + (_v.x - f.x) * e, f.y + (_v.y - f.y) * e + Math.sin(k * Math.PI) * HOP.up, f.z + (_v.z - f.z) * e);
      root.rotation.set(tube.pitch * e, tube.yaw, tube.roll * e);
      return;
    }
    root.position.copy(_v);
    root.rotation.copy(mesh.rotation);
  }

  // Water thrown up at (x, z), if there's water there.
  function splash(x, z, n, up, spread = 0.9) {
    if (!chunks.waterAt(x, z, _w) || _w.depth <= 0) return false;
    splashes.burst(x, _w.level + 0.04, z, _w.level, n, { up, spread, vx: tube.vx * 0.4, vz: tube.vz * 0.4, from: 0.3 });
    return true;
  }

  // Your hands paddling: a stroke after stroke, water thrown up where they
  // go in; at rest on the rim when they aren't.
  function paddle(dt) {
    const going = Math.hypot(c.x, c.z) > 0.05;
    SEAT.rest = fishing() ? 0 : 1;
    if (!going || fishing()) {
      SEAT.stroke = null;
      stroke = 0;
      return;
    }
    const was = stroke;
    stroke += dt / (c.hard ? STROKE.hard : STROKE.easy);
    SEAT.stroke = stroke;
    if (Math.floor(was - DIP) === Math.floor(stroke - DIP)) return;
    const ch = player.character;
    for (const hand of [ch.hand, ch.handL]) {
      hand.getWorldPosition(_v);
      splash(_v.x, _v.z, c.hard ? 9 : 5, c.hard ? 1.1 : 0.8, 0.4);
    }
    sound.sfx('hand-stroke', { size: c.hard ? 0.9 : 0.4 });
  }

  // ── What happens on the way ───────────────────────────────────────────────
  tube.on('drop', (h) => {
    const n = Math.round(24 + h * 50);
    for (let i = 0; i < 3; i++) {
      const a = tube.yaw + (i / 3) * Math.PI * 2;
      splash(tube.x + Math.sin(a) * TUBE.r, tube.z + Math.cos(a) * TUBE.r, Math.round(n / 3), 1.4 + h * 3, 1.2);
    }
    sound.sfx('tube-drop', { size: clamp(h / 0.6, 0, 1) });
  });
  tube.on('bump', (speed, what) => {
    sound.sfx('tube-bump', { size: clamp(speed / 1.5, 0.2, 1) });
    splash(tube.x, tube.z, Math.round(6 + speed * 8), 0.8 + speed * 0.5, 0.8);
    if (speed > 1) hud.flash(`bump: off ${what}`);
  });

  // The river has ended here: said once, with where to go to float on.
  function sayEnd() {
    endSaid = true;
    const sea = gen.sea && Math.abs(tube.level - gen.sea.level) < 0.05;
    let said = sea ? (ran ? 'out on the sea: this is where the river ends' : 'out on the sea, with no river to carry you') : ran ? 'still water with no way out: the river ends here' : 'still water with no way out, and no river to carry you';
    const r = course.nearest(tube.x, tube.z, { not: lastEnd });
    if (r) {
      guideTo(r);
      said += ` · the nearest ${r.river ? 'river' : 'stream'} that runs on somewhere else is ${formatDistance(r.d)} ${way(r.x - tube.x, r.z - tube.z)}, and runs ${formatDistance(r.far)}`;
    }
    hud.flash(input.isTouch ? said : `${said} · F to get out`, SAY + 2400);
  }

  // ── Somewhere to go and float ─────────────────────────────────────────────
  function guideTo(r) {
    target = { x: r.x, z: r.z, t: time };
  }
  hud.guide(() => {
    if (!target) return null;
    if (time - target.t > GUIDE.long || Math.hypot(player.pos.x - target.x, player.pos.z - target.z) < GUIDE.near) {
      target = null;
      return null;
    }
    return { id: 'tubing', label: 'a river to float down', color: GUIDE.color, x: target.x, z: target.z };
  });

  // ── In and out: the act key (F) ───────────────────────────────────────────
  // Beside water deep enough to float in, F pulls out your tube and you drop
  // into it; in it, F climbs out (as with everything else you get into).
  act.offer({
    id: 'tube',
    at() {
      if (active) return { d: 0, word: 'get out', run: getOut };
      if (!player.rides.free || player.space) return null;
      const spot = waterBy(player.pos.x, player.pos.z);
      return spot ? { d: FLOAT_AT, word: 'float', run: () => getIn(spot) } : null;
    },
  });

  // ── V: where to float ─────────────────────────────────────────────────────
  // Away from the water, which way the nearest river or stream to float down
  // is, and the HUD points you there.
  function whereToFloat() {
    const p = player.pos;
    if (active) return hud.flash(input.isTouch ? 'you’re floating · “get out” climbs out' : 'you’re floating · F climbs out');
    if (!player.space && player.rides.free && waterBy(p.x, p.z)) return hud.flash(input.isTouch ? 'water deep enough to float in, here · “float”' : 'water deep enough to float in, here · F to float');
    if (player.space) {
      hud.flash('no river to float down in here');
      return false;
    }
    const r = course.nearest(p.x, p.z);
    if (!r) {
      hud.flash('no water deep enough to float in here, and no river near enough to float down', SAY);
      return false;
    }
    guideTo(r);
    hud.flash(`no water deep enough to float in here · the nearest ${r.river ? 'river' : 'stream'} to float down is ${formatDistance(r.d)} ${way(r.x - p.x, r.z - p.z)}, and runs ${formatDistance(r.far)} from there`, SAY);
    return false;
  }
  commands.add({ id: 'tube', keys: ['KeyV', 'PadR3'], group: 'WANDER', label: 'inner tube: where the nearest river to float down is', run: whereToFloat });
  commands.describe({ group: 'WANDER', help: 'F', pad: ['PadY'], label: 'beside water deep enough: float off in your inner tube · in it: get out' });
  commands.describe({ group: 'WANDER', help: 'in the tube', label: 'W A S D paddle with your hands · shift paddle hard' });

  // ── What the keys do now, and how it's going ──────────────────────────────
  // Running water you could float down, beside you: looked for now and then.
  let floatable = false;
  let noticeAt = 0;
  function notice() {
    if (time < noticeAt) return floatable;
    noticeAt = time + NOTICE.every;
    floatable = false;
    if (!player.rides.free || player.space) return false;
    const p = player.pos;
    for (let i = 0; i <= 8 && !floatable; i++) {
      const a = (i / 8) * Math.PI * 2;
      const r = i ? NOTICE.far : 0;
      const x = p.x + Math.cos(a) * r;
      const z = p.z + Math.sin(a) * r;
      floatable = chunks.waterAt(x, z, _w) && _w.depth >= TUBE.draft + SPARE && Math.hypot(_w.flowX, _w.flowZ) >= STILL;
    }
    return floatable;
  }

  function cue() {
    const touch = input.isTouch;
    let html = '';
    const K = (w) => act.key(w);
    if (active) {
      const out = K('get out');
      if (hop) html = 'into your tube…';
      else if (fishing()) html = '';
      else if (tube.aground) html = touch ? `aground in the shallows: push off with the stick · <b>${out}</b>` : `aground in the shallows · <b>W A S D</b> push off · <b>${out}</b> get out`;
      else if (tube.end && ended > ENDED) {
        const end = ran ? 'the river ends here' : 'still water, with no way on';
        html = touch ? `${end} · <b>${out}</b>` : `${end} · <b>W A S D</b> paddle · <b>${out}</b> get out`;
      }
      else if (tube.still) html = touch ? `drifting across to where the water runs out · <b>${out}</b>` : `drifting across to where the water runs out · <b>W</b> paddle · <b>${out}</b> get out`;
      else html = touch ? `stick: paddle · <b>${out}</b>` : `<b>W A S D</b> paddle · <b>shift</b> hard · <b>${out}</b> get out`;
    } else if (notice()) {
      const t = builder.tgt;
      if (!t || (!t.prompt && !t.type)) html = `<b>${K('float')}</b> float down it in your inner tube`;
    }
    hud.cue(html ? { html } : null, 'tubing');
  }

  const readout = document.createElement('div');
  readout.id = 'tubing';
  readout.hidden = true;
  document.getElementById('hud')?.appendChild(readout);
  let shown = '';
  function show() {
    let text = '';
    if (active && !hop) {
      const parts = [`${(tube.speed * 3.6).toFixed(1)} km/h`];
      if (float.far >= 10) parts.push(`${formatDistance(float.far)} in ${duration(time - float.t)}`);
      if (tube.end && ended > ENDED) parts.push(ran ? 'the end of the river' : 'no way on');
      else if (here && here.far >= 20) parts.push(`${formatDistance(here.far)} of river left`);
      text = parts.join(' · ');
    }
    if (text === shown) return;
    shown = text;
    readout.textContent = text;
    readout.hidden = !text;
  }

  // ── Everyone else here ────────────────────────────────────────────────────
  // They're told whether you're in a tube, and see you sat in it.
  function tell() {
    save.say('tube', active ? { on: true } : null);
  }
  if (peers) {
    const surface = (x, z) => (chunks.waterAt(x, z, _w) && _w.depth > 0 ? _w.level : null);
    const tubers = new Tubers({ scene, peers, surface, seat: { ...SEAT, stroke: null }, sit: SIT });
    save.on('message', (msg) => msg.ch === 'tube' && tubers.hear(msg.from, msg.body));
    // someone new: tell them you're in yours
    peers.on('change', () => active && tell());
    game.addSystem({ name: 'tubers', phase: 'world', update: () => tubers.update() });
  }

  // ── Saving ────────────────────────────────────────────────────────────────
  // Whether you're in it, so you're back in it where you left off, and your
  // longest float in this world.
  let pending = false;
  save.register({
    id: 'tubing',
    scope: 'yours',
    collect: () => (active || best ? { in: active, best } : null),
    validate(raw) {
      if (!raw || typeof raw !== 'object') return null;
      return { in: raw.in === true, best: Number.isFinite(raw.best) && raw.best > 0 ? Math.round(raw.best) : 0 };
    },
    restore(data) {
      pending = !!(data && data.in);
      best = data ? data.best : 0;
    },
  });
  game.on('ready', () => {
    if (!pending) return;
    pending = false;
    const spot = waterBy(player.pos.x, player.pos.z, 1.5);
    if (spot) getIn(spot, { hop: false });
  });

  // ── Every frame ───────────────────────────────────────────────────────────
  // After the player (update) has been moved: the tube and you in it.
  game.addSystem({
    name: 'tubing',
    phase: 'update',
    update({ dt }) {
      time += dt;
      if (active) {
        if (!hop && tube.dry) {
          // run out of water: out onto whatever's there
          const at = bankBy(tube.x, tube.z, tube.level) || { x: tube.x, z: tube.z };
          stow();
          player.pos.set(at.x, player.groundAt(at.x, at.z), at.z);
          player.vel.set(0, 0, 0);
          sound.sfx('tube-out');
          finish('run out of water: out of your tube');
        }
      }
      if (active) {
        if (hop && hop.t >= HOP.time) {
          hop = null;
          splash(tube.x, tube.z, 40, 1.8, 1.4);
          sound.sfx('tube-in');
        }
        pose();
        if (!hop) {
          float.far += tube.speed * dt;
          paddle(dt);
          // white water thrown up round the rim
          owed += tube.foam * Math.max(0.5, tube.speed) * SPRAY * dt;
          if (owed >= 4) {
            const a = Math.random() * Math.PI * 2;
            splash(tube.x + Math.sin(a) * TUBE.r, tube.z + Math.cos(a) * TUBE.r, Math.floor(owed), 1 + tube.foam, 0.6);
            owed -= Math.floor(owed);
          }
          // how much river is left, and the end of it
          if (time >= lookAt) {
            lookAt = time + LOOK_AHEAD;
            here = course.at(tube.x, tube.z);
            if (here) lastEnd = here.end;
          }
          if (!tube.still) ran = true;
          ended = tube.end ? ended + dt : 0;
          if (ended > ENDED && !endSaid) sayEnd();
          if (!tube.still) endSaid = false;
        }
        heard.on = !hop;
        heard.churn = tube.foam;
      }
      cue();
      show();
    },
  });

  // ── From the console (and the play-through) ───────────────────────────────
  game.provide('tubing', {
    tube,
    course,
    get active() {
      return active;
    },
    in() {
      if (active) return false;
      const spot = waterBy(player.pos.x, player.pos.z);
      return spot ? getIn(spot) : false;
    },
    out: getOut,
    state: () =>
      active
        ? {
            hopping: !!hop,
            x: round(tube.x, 10),
            z: round(tube.z, 10),
            speed: round(tube.speed, 100),
            depth: round(tube.depth, 100),
            far: round(float.far, 10),
            secs: round(time - float.t, 10),
            left: here ? Math.round(here.far) : null,
            still: tube.still,
            end: tube.end && ended > ENDED,
            aground: tube.aground,
            foam: round(tube.foam, 100),
          }
        : null,
    get best() {
      return best;
    },
    // the nearest river to float down from (x, z): { x, z, far, river, d }
    river: (x = player.pos.x, z = player.pos.z, reach = 1500) => course.nearest(x, z, { reach }),
  });
}
