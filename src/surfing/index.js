// Surfing: the breaks along the coast, found from the seed and on the map,
// with sets of waves rolling in over them; and a board to ride them on.
// Out in the sea at a break, lie on the board (surf, at hand) and paddle out
// past where they break. Turn for the beach as a wave comes, paddle, and as
// it takes you, stand up. Then run along its face ahead of where it's
// breaking, carve, get barrelled, fly off the lip — or go over with it.
//
//   spots.js   where the breaks are, and what their waves are like
//   surfer.js  the physics: paddling, catching, riding, falling
//   ride.js    a wave's tally: how long, how far, what you did, the points
//   pose.js    how you lie and stand on the board, and how it sits on the water
//   board.js   the board
//   lip.js     the curl of a breaking wave, and its spray
//   sound.js   the break, the white water, the board; popping up, wiping out
//
// The waves themselves are the world's (world/breakers.js): this hands it
// the break nearest you, and the water rises with them. While you surf, the
// board moves you (player.aboard), you lie or stand on it (Character.hang,
// Character.stance), and the tools are put away (builder.idleWhile). Your
// best wave in this world is yours, saved (the 'surfing' domain).
//
// From the console:
//   world.surfing.go()        to the nearest break, out past where it breaks, on a board
//   world.surfing.off()
//   world.surfing.state()     how you're going, and this wave's tally

import { SurfSpots, SURF } from './spots.js';
import { Surfer } from './surfer.js';
import { Ride } from './ride.js';
import { SurfPose } from './pose.js';
import { makeBoard, makeRack, BOARD } from './board.js';
import { Lip } from './lip.js';
import { surfSounds } from './sound.js';
import { GridNearest } from '../core/nearest.js';
import { waterSample } from '../core/geom.js';
import { clamp } from '../noise.js';
import { BREAKER } from '../world/breakers.js';
import './surfing.css';

// A break is set rolling (breakers.set) for whoever is within this far (m) of
// it, the nearest; and another nearer only takes over once it's this much
// nearer (m), so standing between two doesn't flip from one to the other.
const NEAR = 1100;
const SWAP = 150;
// Where to wait for a wave: just out past where the set waves break (m out
// from the break's point), for a wave this high (m) breaking in water this
// many times as deep as it is high, over a bar this steep.
const lineup = (s) => Math.max(30, (s.size / BREAKER.gamma / SURF.bar) * 1.2);
// How far (m) from a break's point you can be to take a board out there.
const OUT_THERE = SURF.span + 120;
// In the sea at least this deep (m) to lie on a board.
const DEEP_ENOUGH = 0.55;
// How the camera follows: round behind the way you're going this fast (1/s),
// lying down and standing; and back this much further (m) per m/s, up to BACK_MOST.
const BEHIND = [0.7, 1.8];
const BACK = 0.12;
const BACK_MOST = 2.5;
// Spray off the rail: puffs a second, per m/s, carving (per m/s² round).
const SPRAY = { speed: 0.5, carve: 0.5 };
// A wave coming: looked for this far (m) out to sea of you, this high (m).
const COMING = { far: 14, high: 0.5 };
// How long (ms) a word stays on the screen.
const SAY = 2600;
const QUIPS = ['wipeout!', 'over the falls!', 'rag-dolled!', 'eaten!', 'pounded!', 'held under!'];
const GLYPH = ['.......', '...###.', '..#...#', '.#..#..', '#..##..', '#######', '.......'];
const fmt = (n) => Math.round(n).toLocaleString('en');
const frame = () => new Promise((r) => requestAnimationFrame(r));
const _w = waterSample();
const _s = { rise: 0, gx: 0, gz: 0, fx: 0, fz: 0, wave: null };

// The features this uses, so it is installed after them (game/features.js).
export const after = ['render', 'ui', 'world', 'player', 'audio', 'build', 'save', 'map', 'splashes'];
export function installSurfing(game) {
  const { scene, camera, chunks, gen, breakers, landforms, player, input, hud, commands, save, sound, builder, map, splashes } = game;
  const level = gen.sea ? gen.sea.level : null;

  // ── The breaks ────────────────────────────────────────────────────────────
  // Squares are looked over as they're wanted, one a frame at most (a few
  // milliseconds each), so walking about never stutters.
  const spots = new SurfSpots(gen, { keepOff: (x0, z0, x1, z1) => landforms.reaches(x0, z0, x1, z1) });
  const wanted = new Set(); // "i:j" asked for and not yet looked over
  const known = (i, j) => {
    const s = spots.known(i, j);
    if (s === undefined) wanted.add(`${i}:${j}`);
    return s;
  };
  function lookOne() {
    const first = wanted.values().next();
    if (first.done) return;
    wanted.delete(first.value);
    const [i, j] = first.value.split(':').map(Number);
    spots.cell(i, j);
  }
  const asPlace = (s) => ({
    id: s.id,
    x: s.beach.x,
    z: s.beach.z,
    yaw: Math.atan2(s.nx, s.nz),
    kind: 'surf spot',
    name: s.name,
    note: `${s.kind === 'peak' ? 'A peak, peeling both ways' : `A ${s.kind}-hander`}: ${s.size.toFixed(1)} m sets every ${Math.round(s.period)} s. Wade out and take a board.`,
    glyph: GLYPH,
  });
  map.places.addSource({
    // only what has been looked over already: the map fills in as more is
    within: (x0, z0, x1, z1) => spots.within(x0, z0, x1, z1).map(asPlace),
    get(id) {
      const s = spots.byId(id);
      return s ? asPlace(s) : null;
    },
    list: 'surf',
    nearest: (x, z) =>
      new GridNearest(x, z, {
        size: SURF.cell,
        spill: 60,
        at(i, j) {
          const s = known(i, j);
          return s === undefined ? undefined : s ? [asPlace(s)] : [];
        },
      }),
  });

  // The break nearest the camera, rolling.
  let near = null;
  function choose(x, z) {
    const [ci, cj] = SurfSpots.square(x, z);
    let best = null;
    let bd = Infinity;
    for (let j = cj - 1; j <= cj + 1; j++) {
      for (let i = ci - 1; i <= ci + 1; i++) {
        const s = known(i, j);
        if (!s) continue;
        const d = Math.hypot(s.x - x, s.z - z);
        if (d < bd) {
          bd = d;
          best = s;
        }
      }
    }
    if (bd > NEAR) best = null;
    if (near && best && best !== near && Math.hypot(near.x - x, near.z - z) - bd < SWAP && Math.hypot(near.x - x, near.z - z) < NEAR) best = near;
    if (best !== near && !active) {
      near = best;
      breakers.set(near);
    }
  }

  // ── The board, and you on it ──────────────────────────────────────────────
  const sea = {
    level: level ?? 0,
    at(x, z, out) {
      if (!breakers.sample(x, z, out)) {
        out.rise = out.gx = out.gz = out.fx = out.fz = 0;
        out.wave = null;
      }
      return out;
    },
    depth(x, z) {
      return chunks.waterAt(x, z, _w) ? _w.depth : -1;
    },
  };
  const surfer = new Surfer(sea);
  const ride = new Ride();
  const board = makeBoard();
  board.visible = false;
  scene.add(board);
  const pose = new SurfPose(board);
  // boards stood in the sand behind the beach of the break you're near
  const rack = makeRack();
  rack.visible = false;
  scene.add(rack);
  const lip = new Lip(scene);
  const heard = { breaking: 0, bx: 0, by: 0, bz: 0, foam: 0, on: false, riding: false, speed: 0, carve: 0, paddle: 0 };
  sound.addLayer(surfSounds(heard));
  let active = false;
  let best = null; // { points, time (s, the longest ride), tube (s, the longest barrel) }
  let last = { x: 0, z: 0 };
  let cued = false;
  let sprayed = 0;
  let stroke = 0;
  let ducked = false;
  const c = { steer: 0, push: 0, sprint: false, pop: false, crouch: false, duck: false };
  builder.idleWhile(() => active);

  const mover = {
    place(out, dt) {
      // moved by something else (R, a teleport): that's the end of it
      if (Math.hypot(player.pos.x - last.x, player.pos.z - last.z) > 3) {
        out.x = player.pos.x;
        out.y = player.pos.y;
        out.z = player.pos.z;
        out.yaw = player.yaw;
        off(true);
        return;
      }
      readControls();
      surfer.step(dt, c);
      const standing = surfer.mode === 'riding';
      out.x = last.x = surfer.x;
      out.y = standing ? surfer.y : surfer.y - 0.65;
      out.z = last.z = surfer.z;
      out.yaw = pose.yaw;
      out.heading = surfer.mode === 'down' ? surfer.yaw : surfer.heading;
      out.grounded = !surfer.flying;
      out.behind = BEHIND[standing ? 1 : 0];
      out.back = standing ? Math.min(BACK_MOST, surfer.speed * BACK) : 0;
      out.wade = standing ? 0.04 : 0.3;
      out.flowX = surfer.fx;
      out.flowZ = surfer.fz;
    },
  };

  // The keys: W paddles (pumps, standing), S back (stalls), A D turn (spin in
  // the air), space stands you up on a wave (and off the lip into the air),
  // shift ducks the nose under a wave (crouches, standing).
  function readControls() {
    if (input.blocked) {
      Object.assign(c, { steer: 0, push: 0, sprint: false, pop: false, crouch: false, duck: false });
      return;
    }
    // (as a square, not a circle: W and A together are each all the way)
    const ax = input.moveAxes();
    const m = Math.max(Math.abs(ax.x), Math.abs(ax.y));
    const k = m > 1e-3 ? Math.hypot(ax.x, ax.y) / m : 1;
    const shift = input.running() || input.holding('use');
    c.steer = ax.x * k;
    c.push = ax.y * k;
    c.sprint = ax.y > 0.5;
    c.pop = input.jumped();
    c.crouch = shift;
    c.duck = shift && surfer.mode === 'prone';
  }

  // In the sea at a break, deep enough to lie on a board.
  function canSurf() {
    if (active || level === null || !near) return false;
    if (player.carrier || player.aboard || player.space) return false;
    const { x, z } = player.pos;
    if (Math.hypot(x - near.x, z - near.z) > OUT_THERE) return false;
    if (!chunks.waterAt(x, z, _w) || Math.abs(_w.level - level) > 0.05) return false;
    return _w.depth > DEEP_ENOUGH || player.swimming;
  }

  function on(at = null) {
    if (active) return;
    const p = at || player.pos;
    // lying down, pointing out to sea (or the way you were going)
    const yaw = at ? at.yaw : near ? Math.atan2(near.nx, near.nz) : player.yaw;
    surfer.reset(p.x, p.z, yaw);
    if (at) player.pos.set(p.x, level, p.z);
    last = { x: p.x, z: p.z };
    player.aboard = mover;
    board.visible = true;
    active = true;
    ride.reset();
    sound.sfx('surf-duck');
    hud.flash(near ? `on your board at ${near.name} · paddle out past where it breaks` : 'on your board', SAY);
  }

  // Off the board. moved: something else has put you somewhere.
  function off(moved = false, word = null) {
    if (!active) return;
    active = false;
    if (player.aboard === mover) player.aboard = null;
    SurfPose.clear(player.character);
    board.visible = false;
    if (!moved) {
      player.pos.set(surfer.x, Math.max(chunks.heightAt(surfer.x, surfer.z), level - 0.6), surfer.z);
      player.yaw = surfer.yaw;
    }
    player.vel.set(0, 0, 0);
    heard.on = heard.riding = false;
    endRide();
    if (word) hud.flash(word, SAY);
  }

  // A wave is over, on your feet: what it came to, and whether it was your
  // best. -> whether there was a wave to tell of.
  function endRide(word = null) {
    if (!ride.up) return false;
    const time = ride.time;
    const points = ride.bank();
    if (!points) {
      if (word) hud.flash(word, SAY);
      return !!word;
    }
    const said = [word || 'wave over', `${time.toFixed(1)} s`, `${fmt(ride.distance)} m`, `top ${Math.round(ride.top * 3.6)} km/h`, `${fmt(points)} points`];
    const was = best || { points: 0, time: 0, tube: 0 };
    if (points > was.points || time > was.time || ride.tube > was.tube) {
      if (points > was.points && was.points) said.push('your best wave yet');
      best = { points: Math.max(was.points, points), time: Math.round(Math.max(was.time, time) * 10) / 10, tube: Math.round(Math.max(was.tube, ride.tube) * 10) / 10 };
      save.touch();
    }
    hud.flash(said.join(' · '), SAY + 1600);
    return true;
  }

  // ── On the wave ───────────────────────────────────────────────────────────
  surfer.on('caught', () => hud.flash(input.isTouch ? 'it has you! tap to stand up' : 'it has you! space to stand up', 1600));
  surfer.on('pop', () => {
    ride.start();
    sound.sfx('surf-pop');
    splashes.burst(surfer.x, surfer.y + 0.05, surfer.z, surfer.y, 14, { up: 1.6, spread: 0.8, vx: surfer.vx * 0.3, vz: surfer.vz * 0.3 });
  });
  surfer.on('turn', (t) => {
    const p = ride.add(t.name, t.points);
    hud.flash(`${t.name} +${fmt(p)}`, SAY);
    // a fan of spray off the rail
    const side = surfer.yawRate > 0 ? -1 : 1;
    const ox = Math.cos(surfer.yaw) * side;
    const oz = -Math.sin(surfer.yaw) * side;
    lip.spume.burst(surfer.x + ox * 0.4, surfer.y + 0.1, surfer.z + oz * 0.4, surfer.y, 10 + Math.round(t.points / 30), { up: 2.4, spread: 1, vx: ox * 3 + surfer.vx * 0.3, vz: oz * 3 + surfer.vz * 0.3 });
  });
  surfer.on('tubed', (t) => {
    ride.tube += t.time;
    const p = ride.add(`barrel · ${t.time.toFixed(1)} s`, t.points);
    hud.flash(`out of the barrel! +${fmt(p)}`, SAY);
  });
  surfer.on('takeoff', () => {
    sound.sfx('pop');
    lip.spume.burst(surfer.x, surfer.y, surfer.z, surfer.y, 14, { up: 2.6, spread: 1, vx: surfer.vx * 0.4, vz: surfer.vz * 0.4 });
  });
  surfer.on('land', (l) => {
    ride.airs++;
    const p = ride.add(l.name, l.points);
    sound.sfx('surf-land', { size: clamp(l.impact / 8, 0.2, 1) });
    splashes.burst(surfer.x, surfer.y + 0.05, surfer.z, surfer.y, 20, { up: 2, spread: 1.4, vx: surfer.vx * 0.4, vz: surfer.vz * 0.4 });
    hud.flash(`${l.name} +${fmt(p)}`, SAY);
  });
  surfer.on('crash', (why) => {
    sound.sfx('surf-wipeout');
    lip.spume.burst(surfer.x, surfer.y + 0.3, surfer.z, surfer.y, 30, { up: 3, spread: 2, vx: surfer.vx * 0.4, vz: surfer.vz * 0.4 });
    splashes.burst(surfer.x, surfer.y + 0.1, surfer.z, surfer.y, 30, { up: 3, spread: 2 });
    const lost = ride.lose();
    const quip = QUIPS[Math.floor(Math.random() * QUIPS.length)];
    hud.flash(`${quip} ${why}${lost ? ` · lost ${fmt(lost)}` : ''}`, SAY);
  });
  surfer.on('up', () => splashes.burst(surfer.x, surfer.y + 0.05, surfer.z, surfer.y, 10, { up: 1, spread: 0.6 }));
  surfer.on('off', (why) => endRide(why));
  surfer.on('beach', () => {
    const told = endRide('ridden in');
    off(false, told ? null : 'off the board, in the shallows');
  });

  // ── Keys ──────────────────────────────────────────────────────────────────
  function toggle() {
    if (active) return off(false, 'off the board');
    if (level === null) return hud.flash('no sea in this world');
    if (!near) return hud.flash('no surf near here: find a surf spot on the map (M, routes)');
    if (!canSurf()) return hud.flash(`wade out into the sea at ${near.name} to take a board out`);
    on();
  }
  // (at hand in the sea at a break, and while you surf: in the pack, and a button on a touch screen)
  commands.add({ id: 'surf', group: 'WANDER', label: 'surf: take a board out, in the sea at a surf spot (or get off it)', run: toggle, now: () => (active ? 'swim' : canSurf() ? 'surf' : '') });
  commands.describe({ group: 'WANDER', help: 'on a board', label: 'W paddle · A D turn · shift duck a wave · space stand up as one takes you' });
  commands.describe({ group: 'WANDER', help: 'surfing', label: 'A D carve · W pump · S stall · shift crouch, to be barrelled · space off the lip' });

  // ── The readout: how fast, and the points ─────────────────────────────────
  const readout = document.createElement('div');
  readout.id = 'surf';
  readout.hidden = true;
  document.getElementById('hud')?.appendChild(readout);
  let shown = '';
  function show() {
    let text = '';
    if (active) {
      const parts = [];
      if (surfer.mode === 'riding') parts.push(`${Math.round(surfer.speed * 3.6)} km/h`);
      if (ride.up && ride.points) parts.push(`${fmt(ride.points)} pts`);
      if (surfer.tube > 0) parts.push(`barrel ${surfer.tube.toFixed(1)} s`);
      if (best && best.points) parts.push(`best ${fmt(best.points)}`);
      text = parts.join(' · ');
    }
    if (text === shown) return;
    shown = text;
    readout.textContent = text;
    readout.hidden = !text;
  }

  // What the keys do now, in place of the tool's prompt.
  function cue() {
    const touch = input.isTouch;
    if (!active) {
      if (cued) hud.cue(null);
      cued = false;
      return;
    }
    cued = true;
    let html;
    if (surfer.mode === 'down') html = 'under…';
    else if (surfer.mode === 'riding') {
      if (surfer.flying) html = touch ? 'stick: spin' : '<b>A D</b> spin';
      else if (surfer.tube > 0) html = 'in the barrel! stay low: <b>shift</b>';
      else html = touch ? 'stick: carve, pump, stall · hold <b>use</b>: crouch · tap: off the lip' : '<b>A D</b> carve · <b>W</b> pump · <b>S</b> stall · <b>shift</b> crouch · <b>space</b> off the lip';
    } else if (surfer.caught) html = touch ? 'it has you: <b>tap</b> to stand up!' : 'it has you: <b>space</b> to stand up!';
    else if (coming()) html = touch ? 'a wave! point at the beach and paddle' : 'a wave! point at the beach and paddle: <b>W</b>';
    else html = touch ? 'stick: paddle, turn · hold <b>use</b>: duck under' : '<b>W</b> paddle · <b>A D</b> turn · <b>shift</b> duck under';
    hud.cue({ html });
  }
  // a wave standing up out to sea of you, to be caught
  function coming() {
    const n = near;
    if (!n) return false;
    const s = breakers.sample(surfer.x + n.nx * COMING.far, surfer.z + n.nz * COMING.far, _s);
    return !!(s && s.wave && s.wave.H > COMING.high && s.wave.lip < 0);
  }

  // ── Every frame ───────────────────────────────────────────────────────────
  game.addSystem({
    name: 'surfing',
    phase: 'update',
    update({ dt }) {
      // something else has you now (a horse, a train)
      if (active && (player.aboard !== mover || player.carrier)) {
        active = false;
        if (player.aboard === mover) player.aboard = null;
        SurfPose.clear(player.character);
        board.visible = false;
        heard.on = heard.riding = false;
        endRide();
      }
      if (!active) {
        cue();
        show();
        return;
      }
      pose.update(dt, surfer, c, player.character);
      const standing = surfer.mode === 'riding' && !surfer.flying;
      const w = surfer.wave;
      ride.update(dt, standing ? surfer.speed : 0, standing && !!w && w.H > 0.3);
      // spray off the rail, carving at speed
      const carve = clamp(Math.abs(surfer.lateral) / 10, 0, 1);
      if (standing && surfer.speed > 3) {
        sprayed += dt * (surfer.speed * SPRAY.speed + carve * surfer.speed * SPRAY.carve);
        const n = Math.floor(sprayed);
        if (n > 0) {
          sprayed -= n;
          const side = surfer.yawRate > 0 ? -1 : 1;
          const ox = Math.cos(surfer.yaw) * side;
          const oz = -Math.sin(surfer.yaw) * side;
          const tail = -BOARD.length * 0.35;
          const bx = surfer.x + Math.sin(surfer.yaw) * tail + ox * 0.25;
          const bz = surfer.z + Math.cos(surfer.yaw) * tail + oz * 0.25;
          lip.spume.burst(bx, surfer.y + 0.05, bz, surfer.y, Math.min(n, 6), { up: 0.8 + carve * 2, spread: 0.4, vx: surfer.vx * 0.2 + ox * (0.5 + carve * 2.5), vz: surfer.vz * 0.2 + oz * (0.5 + carve * 2.5), from: 0.1 });
        }
      }
      // paddling: a splash at each stroke
      const paddling = surfer.mode === 'prone' && c.push > 0.1 && !surfer.ducking;
      if (paddling) {
        stroke += dt * 0.95 * (c.sprint ? 1.35 : 1);
        if (stroke >= 1) {
          stroke -= 1;
          for (const sd of [-1, 1]) {
            const hx = surfer.x + Math.sin(surfer.yaw) * 0.3 + Math.cos(surfer.yaw) * 0.45 * sd;
            const hz = surfer.z + Math.cos(surfer.yaw) * 0.3 - Math.sin(surfer.yaw) * 0.45 * sd;
            splashes.burst(hx, surfer.y + 0.02, hz, surfer.y, 6, { up: 1.1, spread: 0.5 });
          }
          sound.sfx('paddle', { size: c.sprint ? 0.7 : 0.4 });
        }
      }
      if (surfer.ducking > 0 && !ducked) sound.sfx('surf-duck');
      ducked = surfer.ducking > 0;

      heard.on = true;
      heard.riding = standing;
      heard.speed = surfer.speed;
      heard.carve = carve;
      heard.paddle = paddling ? 1 : 0;
      cue();
      show();
    },
  });

  // The break: which one, its waves' curl and spray, and how it sounds.
  game.addSystem({
    name: 'surf',
    phase: 'world',
    update({ dt }) {
      if (level === null) return;
      lookOne();
      const cam = camera.position;
      choose(cam.x, cam.z);
      lip.update(dt, breakers, level);
      rack.visible = !!near;
      if (near) {
        const bx = near.beach.x - near.nx * 3;
        const bz = near.beach.z - near.nz * 3;
        rack.position.set(bx, chunks.heightAt(bx, bz), bz);
        rack.rotation.y = Math.atan2(near.nx, near.nz);
      }
      // where it's breaking hardest, to be heard from there; and white water near you
      heard.breaking = 0;
      heard.foam = 0;
      const S = breakers.spot;
      if (!S) return;
      let most = 0;
      for (let i = 0; i < breakers.waves.length; i++) {
        // the peak, and as far along as it has peeled toward where you are
        const v = clamp((cam.x - S.x) * breakers.tx + (cam.z - S.z) * breakers.tz, -S.reach[0], S.reach[1]);
        const a = breakers.waveAt(i, v);
        if (!a || a.lip < 0 || a.lip > 2) continue;
        const k = a.H * (a.lip < 1 ? 1 : 2 - a.lip);
        if (k > most) {
          most = k;
          heard.bx = S.x + S.nx * a.u + breakers.tx * v;
          heard.bz = S.z + S.nz * a.u + breakers.tz * v;
          heard.by = level + a.H;
        }
      }
      heard.breaking = clamp(most / 1.6, 0, 1) * breakers.on;
      const d = Math.hypot(heard.bx - cam.x, heard.bz - cam.z);
      heard.foam = heard.breaking * clamp(1 - d / 40, 0, 1);
    },
  });

  // ── Saved: your best wave in this world ───────────────────────────────────
  save.register({
    id: 'surfing',
    scope: 'yours',
    collect: () => best,
    validate(raw) {
      if (!raw || typeof raw !== 'object') return null;
      const n = (v) => (Number.isFinite(v) && v >= 0 ? v : 0);
      return { points: Math.round(n(raw.points)), time: Math.round(n(raw.time) * 10) / 10, tube: Math.round(n(raw.tube) * 10) / 10 };
    },
    restore(data) {
      best = data && (data.points || data.time) ? { ...data } : null;
    },
  });

  // ── From the console ──────────────────────────────────────────────────────
  game.provide('surfing', {
    get active() {
      return active;
    },
    get best() {
      return best ? { ...best } : null;
    },
    get near() {
      return near;
    },
    spots,
    surfer,
    ride,
    canSurf,
    // To a break (by id, or the nearest), out past where it breaks, on a board.
    async go(id = null) {
      let s = id ? spots.byId(id) : null;
      if (!s) {
        const [ci, cj] = SurfSpots.square(player.pos.x, player.pos.z);
        let bd = Infinity;
        for (let r = 0; r <= 3 && !s; r++) {
          for (let j = cj - r; j <= cj + r; j++) {
            for (let i = ci - r; i <= ci + r; i++) {
              if (Math.max(Math.abs(i - ci), Math.abs(j - cj)) !== r) continue;
              const t = spots.cell(i, j);
              const d = t ? Math.hypot(t.x - player.pos.x, t.z - player.pos.z) : Infinity;
              if (d < bd) {
                bd = d;
                s = t;
              }
            }
          }
        }
      }
      if (!s) return 'no surf within reach';
      off(true);
      // out past where the set waves break, a little along toward where they peel
      const out = lineup(s);
      const along = s.kind === 'right' ? -22 : 22;
      const x = s.x + s.nx * out - s.nz * along;
      const z = s.z + s.nz * out + s.nx * along;
      const yaw = Math.atan2(-s.nx, -s.nz);
      player.spawn(x, z, yaw, yaw + Math.PI);
      do await frame();
      while (!chunks.isFullyLoaded());
      near = s;
      breakers.set(s);
      on({ x, z, yaw });
      return `${s.name}: ${s.kind}, ${s.size.toFixed(1)} m`;
    },
    off() {
      off(false, 'off the board');
      return 'off';
    },
    // up on your feet now, whatever the wave
    stand() {
      if (!active) return 'not on a board';
      surfer.stand();
      return 'standing';
    },
    state: () => ({
      active,
      near: near ? near.id : null,
      mode: surfer.mode,
      caught: surfer.caught,
      flying: surfer.flying,
      speed: Math.round(surfer.speed * 10) / 10,
      kmh: Math.round(surfer.speed * 3.6),
      x: Math.round(surfer.x * 10) / 10,
      z: Math.round(surfer.z * 10) / 10,
      tube: Math.round(surfer.tube * 10) / 10,
      wave: surfer.wave ? { x: Math.round(surfer.wave.x * 10) / 10, H: Math.round(surfer.wave.H * 100) / 100, lip: Math.round(surfer.wave.lip * 100) / 100 } : null,
      ride: { up: ride.up, time: Math.round(ride.time * 10) / 10, distance: Math.round(ride.distance), top: Math.round(ride.top * 3.6), points: Math.round(ride.points), moves: ride.moves.map((m) => m.name) },
    }),
  });
}
