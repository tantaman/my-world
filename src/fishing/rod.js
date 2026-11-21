// The fishing rod on the tool bar: cast a float out over open water, wait for
// a bite, strike, and play the fish in. It works from the bank, from a dock,
// and out in a boat (afloat: see boats/).
//
//   click              cast · strike when the float goes under
//   hold click         reel in a fish (let go while it runs)
//   right-click        reel in, and start again
//
// It is an ordinary tool (the contract is at the top of build/builder.js),
// registered by the fishing feature. The line itself is line.js, and how it
// looks is look.js.

import * as THREE from 'three';
import { definePose } from '../player/character.js';
import { LINE } from './line.js';
import { makeRod } from './models.js';

const AIM_STEP = 0.35; // m along the crosshair between looks for the water
const AIM_FAR = 45; // m along it to look
const SHALLOW = 0.35; // m: water shallower than this holds no fish worth a cast
const REEL_TICK = 0.14; // seconds between the reel's clicks, reeling
const BEND = 0.55; // how far the rod's top bends (radians) under a fish pulling its hardest

// ── How the hiker holds it ──────────────────────────────────────────────────
// Angles as in character.js. `rod` is the rod's own pitch: 0 straight down,
// -π/2 straight out ahead, -π straight up; the wrist (tool) is worked out to
// give it. The left arm follows the right, as it does for every tool.
const hold = ({ sp = 0.05, sh, el, inw = 0.25, tw = 0, rod, drop = 0 }) => ({ sp, sh, el, inw, tw, drop, tool: rod - sp - sh - el });
const OUT = hold({ sh: -0.8, el: -0.95, rod: -2.25 }); // held out, the tip up, waiting
definePose('angle', [
  [0, OUT],
  [0.5, hold({ sh: -0.82, el: -0.95, rod: -2.28 })],
  [1, OUT],
]);
definePose('cast', [
  [0, OUT],
  [0.4, hold({ sp: -0.12, sh: -2.3, el: -1.25, rod: -3.7, tw: 0.25 })], // back over the shoulder
  [0.58, hold({ sp: 0.22, sh: -1.3, el: -0.35, rod: -1.75, tw: -0.1 })], // whipped forward
  [1, OUT],
]);
definePose('strike', [
  [0, OUT],
  [0.3, hold({ sp: -0.1, sh: -1.85, el: -1.15, rod: -2.95 })], // snapped up
  [1, hold({ sp: -0.05, sh: -1.5, el: -1.1, rod: -2.7 })],
]);
const UP = hold({ sp: -0.06, sh: -1.35, el: -1.05, rod: -2.6 }); // held high against a fish
definePose('reel', [
  [0, UP],
  [0.5, hold({ sp: -0.04, sh: -1.3, el: -1.25, rod: -2.55 })],
  [1, UP],
]);
definePose('fight', [
  [0, hold({ sp: 0.12, sh: -1.05, el: -0.9, rod: -2.1 })],
  [0.5, hold({ sp: 0.16, sh: -1.0, el: -0.85, rod: -2.0 })],
  [1, hold({ sp: 0.12, sh: -1.05, el: -0.9, rod: -2.1 })],
]);

const _o = new THREE.Vector3();
const _d = new THREE.Vector3();
const _p = new THREE.Vector3();

// line: the Line (line.js)        look: the LineLook (look.js)
// waterAt(x, z) -> { level, depth } or null
// water(x, z): what bites there, as Line.cast wants it (catch.js)
export function rodTool({ line, look, waterAt, water }) {
  let reeling = false;
  let tick = 0;
  let rod = null; // the rod in the hand: its top, and its tip

  const tool = {
    id: 'rod',
    label: 'fishing rod',
    short: 'rod',
    held: { name: 'rod', make: makeRod, rest: -2.2, elbow: -0.6 },
    afloat: true,

    setup(b) {
      const held = b.player.character.tools.rod;
      rod = { top: held.object.getObjectByName('top'), tip: held.object.getObjectByName('tip') };
    },

    target(b) {
      const s = line.state;
      if (s === 'hooked') {
        const word = line.tension > 0.78 ? 'it’s about to snap!' : line.tension > 0.5 ? 'the line’s straining' : 'the line’s taut';
        const progress = line.landed;
        if (line.run > 0) return { type: 'fish', bad: true, progress, prompt: `it’s running: <b>let go</b> till it stops · ${word}` };
        return { type: 'fish', ok: true, bad: line.tension > 0.78, progress, prompt: `<b>hold click</b> reel in · ${word} · <b>right-click</b> let it go` };
      }
      if (s === 'biting') return { type: 'strike', ok: true, prompt: '<b>click</b> strike!' };
      if (s === 'waiting') {
        const what = line.near ? 'something’s at the bait: wait for it to take it' : 'waiting for a bite…';
        return { type: 'wait', ok: true, prompt: `${what} · <b>right-click</b> reel in` };
      }
      if (s === 'flying') return { type: 'wait', prompt: '' };
      if (s === 'in') return { type: 'wait', prompt: 'reeling in…' };
      return castAt(b);
    },

    work(b, t, io) {
      const s = line.state;
      const ch = b.player.character;
      reeling = false;
      if (s === 'idle') {
        if (io.useTap) {
          if (t && t.ok) cast(b, t);
          else b.deny(t);
        }
        return false;
      }
      if (io.altTap) {
        line.reelIn();
        return true;
      }
      // face the float, or the fish
      b.face(line.float.x, line.float.z);
      if (s === 'hooked') {
        reeling = io.use;
        ch.play(reeling ? 'reel' : 'fight', reeling ? 0.55 : 1.1, true);
        return true;
      }
      if ((s === 'waiting' || s === 'biting') && io.useTap) {
        line.strike();
        b.sound.sfx('hook');
        b.swing('strike', 0.5, 0.3, () => {});
        return true;
      }
      ch.play('angle', 2.4, true);
      return true;
    },

    // Every frame, in hand or not: the line, drawn and played out. Put down,
    // the line comes in with it, and a fish on it goes free.
    update(b, dt) {
      const inHand = b.current === tool && !b.idle;
      if (!inHand && line.out) line.drop();
      const you = b.player.pos;
      line.update(dt, you, inHand && reeling && b.input.holding('use'));
      // the rod bends to a fish
      if (rod) rod.top.rotation.x += ((line.state === 'hooked' ? line.tension * BEND : 0) - rod.top.rotation.x) * Math.min(1, dt * 8);
      if (line.state === 'hooked' && reeling && b.input.holding('use')) {
        tick -= dt;
        if (tick <= 0) {
          tick = REEL_TICK * 3;
          b.sound.sfx('reel', { size: 0.6 });
        }
      }
      if (rod) rod.tip.getWorldPosition(_p);
      else _p.set(you.x, you.y + 1.6, you.z);
      look.update(dt, line, _p, (x, z) => {
        const w = waterAt(x, z);
        return w ? w.level : null;
      });
    },

    put() {
      if (line.out) line.drop();
    },
  };
  return tool;

  // Where a cast along the crosshair would land: the first open water it
  // meets, not too near, nor further than a cast will go.
  function castAt(b) {
    _o.copy(b.aimO);
    _d.copy(b.aimD);
    const you = b.player.pos;
    let hit = null;
    for (let t = 1; t < AIM_FAR; t += AIM_STEP) {
      const x = _o.x + _d.x * t;
      const y = _o.y + _d.y * t;
      const z = _o.z + _d.z * t;
      const w = waterAt(x, z);
      if (w && w.depth > 0 && y <= w.level + 0.02) {
        hit = { x, z, depth: w.depth };
        break;
      }
      if (y < b.chunks.heightAt(x, z)) break;
    }
    if (!hit) return null;
    const d = Math.hypot(hit.x - you.x, hit.z - you.z);
    if (d < LINE.reach[0]) return { type: 'cast', bad: true, prompt: 'too close in: cast further out' };
    if (d > LINE.reach[1]) return { type: 'cast', bad: true, prompt: `too far to cast: ${LINE.reach[1]} m at most` };
    if (hit.depth < SHALLOW) return { type: 'cast', bad: true, prompt: 'too shallow there for fish: cast into deeper water' };
    return { type: 'cast', ok: true, ...hit, d, prompt: `<b>click</b> cast <i>(${Math.round(d)} m out)</i>` };
  }

  function cast(b, t) {
    b.face(t.x, t.z);
    b.swing('cast', 0.8, 0.58, () => {
      const you = b.player.pos;
      line.cast(you.x, you.z, t.x, t.z, water(t.x, t.z));
      b.sound.sfx('cast');
    });
  }
}
