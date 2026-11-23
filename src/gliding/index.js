// Gliding: a hang glider, for coming down from a long way up. Let go of your
// eagle high in the air (F, see mounts) and it opens over you: you drop while
// the sail fills, then it takes your weight and you fly, lying flat under it
// with your hands on the bar. A D shift your weight to bank it round, W
// pulls the bar in (faster, and steeper), S pushes it out (slower, and
// flatter), and shift pulls it right in to dive. It only ever goes down.
// Coming in to land you swing upright and push out, and run it out on your
// feet; come in flat out and you go sprawling, and low into the trees or a
// wall, that's where you come down.
//
//   glider.js   how it flies: banking, the bar, the sink, coming down
//   pilot.js    how you hang under it
//   wing.js     what it looks like: the sail, the frame, the bar
//   sound.js    the air going past, the wires, the sail; opening, landing
//   others.js   other people here on theirs
//
// While you glide, the glider moves you (player.aboard), you hang from it
// (Character.hang), and the tools are put away (builder.idleWhile). Another
// feature opens it, from somewhere up in the air (game.gliding.open), puts it
// away if it takes you itself (stow), and can say in the prompt what one of
// its own keys does while you fly (cueAlso).
//
// From the console:
//   world.gliding.open()    open it where you are (from high up, or it's a short flight)
//   world.gliding.state()   how it's flying

import { Glider, SPEED } from './glider.js';
import { Wing } from './wing.js';
import { HANG, harness, pose, unhang } from './pilot.js';
import { glideSounds } from './sound.js';
import { Gliders } from './others.js';
import './gliding.css';
import { segDist, waterSample } from '../core/geom.js';
import { clamp, smoothstep } from '../noise.js';

// Trees stand this high (m) over the ground: fly lower among them and you're
// in them. (Boulders as high as they are wide.) As tall as the player's own
// flying clears them.
const TREE_TOP = 10;
const BOULDER = 0.5; // a collider this wide (m) or wider is a boulder, not a trunk
// How the camera follows: round behind the way you're going this fast (1/s),
// and this much further back (m), to take in the wing.
const BEHIND = 1.6;
const BACK = 3.5;
// Put somewhere else by something else (back to the start, a teleport):
// moved further than this (m) in a frame, the flight is over.
const MOVED = 4;
// Running it out after you land: this far (m) ahead, for no longer than this (s).
const RUN_OUT = { far: 5, time: 1.6 };
// While you fly, how often (s) everyone here is told where you are.
const TELL_EVERY = 0.25;
// How long (ms) a sentence stays on the screen.
const SAY = 5200;

const _w = waterSample();
const _seg = { d: 0, nx: 0, nz: 0, t: 0 };
const round = (v, f) => Math.round(v * f) / f;
const kmh = (v) => Math.round(v * 3.6);

// The features this uses, so it is installed after them (game/features.js).
export const after = ['render', 'ui', 'world', 'player', 'audio', 'build', 'save', 'splashes'];
export function installGliding(game) {
  const { scene, chunks, solids, player, input, hud, commands, save, sound, builder, splashes, peers } = game;

  // ── What it flies over and into ───────────────────────────────────────────
  const world = {
    ground: (x, z, y) => player.groundAt(x, z, y, false),
    surface: (x, z) => (chunks.waterAt(x, z, _w) && _w.depth > 0 ? _w.level : -Infinity),
    hit(x, y, z, r) {
      let best = null;
      chunks.forEachCollider(x, z, (cx, cz, cr) => {
        const dx = x - cx;
        const dz = z - cz;
        const d = Math.hypot(dx, dz);
        const depth = cr + r - d;
        if (depth <= 0 || d < 1e-5 || (best && depth <= best.depth)) return;
        const boulder = cr >= BOULDER;
        if (y - chunks.heightAt(cx, cz) > (boulder ? cr * 0.9 : TREE_TOP)) return;
        best = { nx: dx / d, nz: dz / d, depth, what: boulder ? 'a boulder' : 'a tree' };
      });
      if (solids) {
        solids.forEachNear(x, z, 1.2 + r, (s) => {
          segDist(x, z, s.ax, s.az, s.bx, s.bz, _seg);
          const depth = s.r + r - _seg.d;
          if (depth <= 0 || (best && depth <= best.depth)) return;
          const top = s.topA + (s.topB - s.topA) * _seg.t;
          if (y >= top - 0.3 || y + 1.5 < s.bottom) return;
          best = { nx: _seg.nx, nz: _seg.nz, depth, what: 'a wall' };
        });
      }
      return best;
    },
  };

  // ── You, on it ────────────────────────────────────────────────────────────
  const glider = new Glider(world);
  const wing = new Wing();
  const spec = harness();
  const heard = { on: false, speed: 0, luff: 0 };
  sound.addLayer(glideSounds(heard));
  let active = false;
  let hold = null; // what you're held by while you fly (player/rides.ts)
  let flight = null; // { far (m flown), t (when you let go) }
  let time = 0;
  let runOut = null; // { steer, t } running it out after landing
  const c = { steer: 0, bar: 0, full: false };
  builder.idleWhile(() => active);

  const mover = {
    slack: MOVED,
    place(out, dt) {
      readControls();
      glider.step(dt, c);
      out.x = glider.x;
      out.y = glider.y;
      out.z = glider.z;
      out.yaw = glider.heading;
      out.grounded = !!glider.down;
      out.behind = BEHIND;
      out.back = BACK;
    },
  };

  // The keys: A D shift your weight (bank and turn), W pulls the bar in, S
  // pushes it out, shift pulls it right in.
  function readControls() {
    // with the map open (or anything else that has the keys), hands off
    if (input.blocked) {
      c.steer = 0;
      c.bar = 0;
      c.full = false;
      return;
    }
    const ax = input.moveAxes();
    c.steer = ax.x;
    c.bar = ax.y;
    c.full = input.running();
  }

  // Open it over you, falling from (x, y, z) at (vx, vy, vz), facing yaw:
  // by default wherever you are, going the way you're going.
  function open(at = null) {
    if (active) return false;
    // (something else has you, or has put you somewhere: it's put away at once)
    hold = player.rides.take({ by: 'gliding', what: 'your hang glider', aboard: mover, lost: () => stow() });
    if (!hold) return false;
    const p = player.pos;
    const v = player.vel;
    const a = at || { x: p.x, y: p.y, z: p.z, vx: v.x, vy: v.y, vz: v.z, yaw: player.yaw };
    glider.launch(a.x, a.y, a.z, a.vx, a.vy, a.vz, a.yaw);
    player.pos.set(a.x, a.y, a.z);
    player.character.hang(spec);
    wing.pose(a.x, a.y + HANG, a.z, glider.heading, 0, 0, 0);
    scene.add(wing.mesh);
    active = true;
    flight = { far: 0, t: time };
    sound.sfx('sail-open');
    tell();
    return true;
  }

  // Put away at once, wherever you are: something else has you now.
  function stow() {
    if (!active) return;
    active = false;
    if (hold) hold.release();
    hold = null;
    player.character.hang(null);
    unhang(player.character.root);
    scene.remove(wing.mesh);
    heard.on = false;
    tell();
  }

  // Down, one way or another: on your feet where it came down (out from
  // whatever you flew into), and the glider folded away.
  function land(d) {
    const heading = glider.heading;
    const x = glider.x + d.nx * (d.depth + 0.15);
    const z = glider.z + d.nz * (d.depth + 0.15);
    const far = Math.round(flight.far);
    const secs = Math.round(time - flight.t);
    stow();
    player.pos.set(x, player.groundAt(x, z, glider.y + 0.3), z);
    player.vel.set(0, 0, 0);
    player.yaw = heading;
    player.grounded = true;
    const flown = far > 20 ? ` · ${far.toLocaleString('en')} m in ${secs} s` : '';
    if (d.how === 'feet') {
      // run it out a few steps
      const steer = { x: x + Math.sin(heading) * RUN_OUT.far, z: z + Math.cos(heading) * RUN_OUT.far, run: d.speed > SPEED.slow * 0.9 };
      player.steer = steer;
      runOut = { steer, t: RUN_OUT.time };
      sound.sfx('run-out');
      hud.flash(`down on your feet: you run it out and fold up the glider${flown}`, SAY);
    } else if (d.how === 'hard') {
      sound.sfx('crash-down');
      hud.flash(`too fast: you come down in a heap · let go of W and shift to come in slowly${flown}`, SAY);
    } else if (d.how === 'water') {
      if (chunks.waterAt(x, z, _w)) splashes.burst(x, _w.level + 0.05, z, _w.level, 50, { up: 3, spread: 2, from: 0.4 });
      sound.sfx('crash-down', { size: 0.3 });
      hud.flash(`splash: down in the water, and the glider folds up${flown}`, SAY);
    } else {
      sound.sfx(d.how === 'a tree' ? 'branches' : 'crash-down');
      hud.flash(`into ${d.how}: you come down beside it and fold up the glider${flown}`, SAY);
    }
  }

  // ── Everyone else here ────────────────────────────────────────────────────
  // They're told where you are, how high, a few times a second while you fly.
  let toldAt = 0;
  function tell() {
    toldAt = time;
    save.say('glide', active ? { y: round(glider.y, 10), bank: round(glider.bank, 100), open: round(glider.open, 100), upright: round(glider.upright, 100) } : null);
  }
  if (peers) {
    const gliders = new Gliders({ scene, peers });
    save.on('message', (msg) => msg.ch === 'glide' && gliders.hear(msg.from, msg.body));
    // someone new: tell them you're up here
    peers.on('change', () => active && tell());
    game.addSystem({ name: 'gliders', phase: 'world', update: ({ dt }) => gliders.update(dt) });
  }

  // ── What the keys do, and how it's flying ─────────────────────────────────
  commands.describe({ group: 'WANDER', help: 'hang gliding', label: 'A D turn · W faster · S slower · shift dive' });

  const readout = document.createElement('div');
  readout.id = 'glide';
  readout.hidden = true;
  document.getElementById('hud')?.appendChild(readout);
  let shown = '';
  function show() {
    let text = '';
    if (active && glider.open >= 1) {
      const sink = -glider.vy;
      const up = Number.isFinite(glider.height) ? Math.max(0, Math.round(glider.height)) : 0;
      text = `${up} m up · ${kmh(glider.speed)} km/h · ${sink >= 0 ? 'sinking' : 'climbing'} ${Math.abs(sink).toFixed(1)} m/s`;
    }
    if (text === shown) return;
    shown = text;
    readout.textContent = text;
    readout.hidden = !text;
  }

  const extras = [];
  function cue() {
    if (!active) return hud.cue(null, 'gliding');
    const touch = input.isTouch;
    let html;
    if (glider.open < 1) html = 'the sail fills…';
    else if (glider.upright > 0.5) html = touch ? 'coming in to land: ease off the stick to come in slowly' : 'coming in to land · let go of <b>W</b> to come in slowly';
    else html = touch ? 'stick: bank and turn · forward faster · back slower' : '<b>A D</b> turn · <b>W</b> faster · <b>S</b> slower · <b>shift</b> dive';
    for (const f of extras) {
      const more = f();
      if (more) html += ` · ${more}`;
    }
    hud.cue({ html }, 'gliding');
  }

  // ── Every frame ───────────────────────────────────────────────────────────
  game.addSystem({
    name: 'gliding',
    phase: 'update',
    update({ dt }) {
      time += dt;
      // running it out: until you're there, or have taken over yourself, or
      // something else has put you somewhere (further off than it began)
      if (runOut) {
        runOut.t -= dt;
        const left = Math.hypot(player.pos.x - runOut.steer.x, player.pos.z - runOut.steer.z);
        if (player.steer !== runOut.steer || runOut.t <= 0 || left < 0.3 || left > RUN_OUT.far + 1) {
          if (player.steer === runOut.steer) player.steer = null;
          runOut = null;
        }
      }
      if (active) {
        if (glider.down) land(glider.down);
      }
      if (active) {
        const hy = glider.y + HANG;
        pose(player.character.root, spec, glider.x, hy, glider.z, glider.heading, glider.bank, glider.upright);
        wing.pose(glider.x, hy, glider.z, glider.heading, glider.bank, glider.pitch, glider.open);
        flight.far += glider.speed * dt;
        heard.on = true;
        heard.speed = glider.speed;
        heard.luff = Math.max(1 - glider.open, 1 - smoothstep(SPEED.slow - 1, SPEED.trim, glider.speed));
        if (time - toldAt > TELL_EVERY) tell();
      }
      cue();
      show();
    },
  });

  // ── For other features, and the console ───────────────────────────────────
  game.provide('gliding', {
    open,
    stow,
    get active() {
      return active;
    },
    // what a key of yours does while someone glides: fn() -> html, or ''
    cueAlso(fn) {
      extras.push(fn);
    },
    state: () =>
      active
        ? {
            open: round(glider.open, 100),
            height: round(clamp(glider.height, -1e4, 1e4), 10),
            speed: round(glider.speed, 10),
            sink: round(-glider.vy, 100),
            bank: round(glider.bank, 100),
            heading: round(glider.heading, 1000),
            upright: round(glider.upright, 100),
            x: round(glider.x, 10),
            y: round(glider.y, 10),
            z: round(glider.z, 10),
          }
        : null,
  });
}
