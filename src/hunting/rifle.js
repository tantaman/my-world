// The rifle: a tool like the others (the contract is at the top of
// build/builder.js), registered by the hunting feature.
//
//   click              shoot at what the crosshair is on
//   hold right-click   look through the scope
//   hold click         beside a kill: dress it for its meat
//   click              beside a campfire: put a cut of meat on a spit over it
//   right-click        ...and take the meat off again
//
// A shot is heard a long way off: every animal near enough runs from it. It
// holds five rounds, and pushes five more in when they're gone.

import { definePose } from '../player/character.js';
import { FIRE } from '../fires/fires.js';
import { formatDistance } from '../core/format.js';
import { makeRifle } from './models.js';
import { traceShot, RANGE } from './shot.js';
import { ROAST, doneness } from './roasting.js';

export const MAG = 5; // rounds the magazine holds
const CYCLE = 0.95; // seconds: the shot, and the bolt worked after it
const BOLT_AT = 0.42; // ...this far through it
const RELOAD = 2.4; // seconds to push five rounds in
export const ZOOM = 4; // how much closer the scope brings things
const HEARD = 320; // metres: animals this near run from a shot
const LOOK_EVERY = 0.12; // seconds between looks along the crosshair for what's on it
const TEND = 2.8; // metres from a fire ring you can reach its spit from
const DRESS_REACH = 1.6; // metres from a kill you can dress it from
const FLASH = 0.06; // seconds the muzzle flash shows
const DUST = { ground: 0x5a4a36, tree: 0x6b5a40, rock: 0x8a8a84, building: 0xb08a5a, wall: 0x8a6a48, target: 0x6a5a4a };
const BLOOD = 0x5e2018;

// ── How the hiker holds it ──────────────────────────────────────────────────
// Shouldered: the upper arm forward and out, the forearm up to the grip, and
// the wrist bent so the rifle lies level, ahead (see character.js for what
// each angle is). The left arm follows the right, as it does for every tool.
const SP = 0.08; // a little lean into it
const AIM = { sh: -0.98, el: -1.65, sp: SP, inw: 0.32, tw: -0.2, drop: 0.02 };
AIM.tool = -Math.PI / 2 - AIM.sp - AIM.sh - AIM.el; // level
const pose = (over) => ({ ...AIM, ...over });
// brought down in front, muzzle low, to load it
const LOW = { sh: -0.55, el: -1.25, sp: 0.18, inw: 0.38, tw: 0, drop: 0.03 };
LOW.tool = -1.1 - LOW.sp - LOW.sh - LOW.el;
definePose('aim', [
  [0, AIM],
  [0.5, pose({ sh: AIM.sh - 0.012 })],
  [1, AIM],
]);
definePose('shot', [
  [0, AIM],
  [0.07, pose({ sh: AIM.sh + 0.12, tool: AIM.tool - 0.22, sp: SP - 0.05 })], // the kick
  [0.28, AIM],
  [0.42, pose({ sh: AIM.sh + 0.08, el: AIM.el - 0.2, tool: AIM.tool + 0.15 })], // working the bolt
  [0.62, AIM],
  [1, AIM],
]);
definePose('reload', [
  [0, LOW],
  [0.5, { ...LOW, sp: LOW.sp + 0.06, el: LOW.el - 0.1 }],
  [1, LOW],
]);

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// wildlife: the animals (aimed, kill, startle)   fires: the campfires
// carcasses, spits: what you've shot, and what's roasting (carcasses.js, roasting.js)
// scope: the view through the scope (scope.js)
// which: (animal) -> whether it's game
// eatHint: () -> how to eat, in a few words ('U to eat')
// targets: anything else a shot can hit (shot.js Targets), or null
export function rifleTool({ wildlife, fires, carcasses, spits, scope, which, eatHint, targets = null }) {
  let rounds = MAG;
  let sighted = false;
  let clock = 0;
  let flash = null;
  let flashT = 0;
  // what was last seen on the crosshair, for the prompt: { at, label, t }
  const look = { at: -1, label: null, t: 0 };

  const tool = {
    id: 'rifle',
    label: 'rifle',
    short: 'rifle',
    kit: 'guns', // alone until another gun joins it (the hunt club's shotgun)
    held: { name: 'rifle', make: makeRifle, rest: 2.6, elbow: -0.45 },

    get rounds() {
      return rounds;
    },
    get sighted() {
      return sighted;
    },

    setup(b) {
      const held = b.player.character.tools.rifle;
      flash = held ? held.object.getObjectByName('flash') : null;
    },

    target(b) {
      const p = b.aimPoint || (b.ground && b.ground.p);
      if (p && !sighted) {
        const f = fires.near(p.x, p.z, FIRE.ring + 0.5);
        if (f && b.dist(f.x, f.z) < TEND + FIRE.ring) return roastAt(b, f);
        const c = carcasses.near(p.x, p.z, 0.6);
        if (c && b.dist(c.x, c.z) < c.half + DRESS_REACH) {
          return { type: 'dress', ok: true, here: true, carcass: c, prompt: `<b>hold click</b> dress ${c.name} <i>(${plural(c.cuts, 'cut')} of meat)</i>` };
        }
      }
      return aimAt(b);
    },

    work(b, t, io) {
      if (rounds <= 0) {
        reload(b);
        return true;
      }
      if (t && t.type === 'dress') {
        if (!io.use) {
          b.dropHold();
          return false;
        }
        const c = t.carcass;
        b.face(c.x, c.z);
        b.player.character.play('bend', 0.9, true);
        b.digNoise(io.dt, 'dress', c, BLOOD);
        if (b.holding(`dress:${c.id}`, c.dress, io.dt)) dress(b, c);
        return true;
      }
      b.dropHold();
      if (t && t.type === 'roast') {
        if (io.altTap && t.spit) takeOff(b, t.spit);
        else if (io.useTap && t.ok) putOn(b, t.fire);
        else if (io.useTap) b.deny(t);
        return false;
      }
      if (sighted) {
        faceAlong(b);
        b.player.character.play('aim', 1.2, true);
      }
      if (io.useTap) {
        if (t && t.ok) shoot(b);
        else b.deny(t);
        return true;
      }
      return sighted;
    },

    // Every frame, in hand or not: the scope up while right-click is held
    // (not beside a fire or a kill, where right-click has work to do), and the
    // flash out again.
    update(b, dt) {
      clock += dt;
      if (flashT > 0) {
        flashT -= dt;
        if (flashT <= 0 && flash) flash.visible = false;
      }
      const inHand = b.current === tool && !b.idle;
      const want = inHand && rounds > 0 && b.input.holding('alt') && (sighted || !(b.tgt && b.tgt.here));
      if (want !== sighted) sight(b, want);
    },

    put(b) {
      if (sighted) sight(b, false);
      b.dropHold();
    },
  };
  return tool;

  function sight(b, on) {
    sighted = on;
    b.player.sight = on ? { zoom: ZOOM } : null;
    scope.show(on);
    look.at = -1;
  }

  // How far along the crosshair's ray you are: nothing nearer counts (from
  // behind you, the ray passes everything between the camera and you).
  function nearOf(b) {
    const P = b.player.pos;
    const o = b.aimO;
    const d = b.aimD;
    return Math.max(0, (P.x - o.x) * d.x + (P.y + b.player.eye - o.y) * d.y + (P.z - o.z) * d.z) + 0.4;
  }

  function faceAlong(b) {
    const P = b.player.pos;
    b.face(P.x + b.aimD.x * 10, P.z + b.aimD.z * 10);
  }

  // ── Shooting ──────────────────────────────────────────────────────────────
  function aimAt(b) {
    if (rounds <= 0) return { type: 'shoot', prompt: 'loading…' };
    // what's on the crosshair, if it's game and nothing is in the way
    if (clock - look.at > LOOK_EVERY) {
      look.at = clock;
      look.label = null;
      const o = b.aimO;
      const d = b.aimD;
      const near = nearOf(b);
      const a = wildlife.aimed(o, d, RANGE, near, which);
      const other = targets && targets.aimed(o, d, a ? a.t : RANGE, near);
      const on = other ? (other.label && !other.solid ? other : null) : a;
      if (on && !traceShot({ chunks: b.chunks, buildings: b.buildings }, o, d, near, on.t).what) {
        look.label = on.label;
        look.t = on.t;
      }
    }
    const on = look.label ? `${look.label} · ${formatDistance(look.t)} · ` : '';
    const scoped = sighted ? '' : ' · <b>hold right-click</b> scope';
    return { type: 'shoot', ok: true, prompt: `${on}<b>click</b> shoot <i>(${plural(rounds, 'round')})</i>${scoped}` };
  }

  function shoot(b) {
    const o = b.aimO;
    const d = b.aimD;
    const shot = traceShot({ chunks: b.chunks, buildings: b.buildings, wildlife, which, targets }, o, d, nearOf(b));
    rounds--;
    look.at = -1;
    b.sound.sfx('rifle');
    if (flash) flash.visible = true;
    flashT = FLASH;
    faceAlong(b);
    b.swing('shot', CYCLE, BOLT_AT, () => rounds > 0 && b.sound.sfx('bolt'));
    if (shot.what === 'animal') {
      const body = wildlife.kill(shot.hit);
      if (body) b.flash(`a clean shot · ${carcasses.add(body).label} is down`, 2600);
    } else if (shot.what === 'target') {
      const said = shot.source.struck ? shot.source.struck(shot.hit, o.clone().addScaledVector(d, shot.t)) : null;
      if (said) b.flash(said, 2600);
    } else if (shot.what) {
      b.chips.burst(o.clone().addScaledVector(d, shot.t), 8, DUST[shot.what], 1.4, 0.25);
    }
    const P = b.player.pos;
    wildlife.startle(P.x, P.z, HEARD);
    if (targets) targets.heard(P.x, P.z);
  }

  function reload(b) {
    if (sighted) sight(b, false);
    b.sound.sfx('load');
    b.swing('reload', RELOAD, 0.95, () => {
      rounds = MAG;
      b.sound.sfx('bolt');
    });
  }

  // ── A kill ────────────────────────────────────────────────────────────────
  function dress(b, c) {
    carcasses.remove(c);
    b.gain('meat', c.cuts);
    b.sound.sfx('thud', { size: 0.15 });
    b.flash(`+${plural(c.cuts, 'cut')} of raw meat · roast it over a campfire`, 2600);
  }

  // ── Roasting ──────────────────────────────────────────────────────────────
  // What a click would do at fire f, which you're beside.
  function roastAt(b, f) {
    const st = fires.state(f).state;
    const hot = st === 'burning' || st === 'embers';
    const spit = spits.at(f.x, f.z);
    const meat = b.have('meat', 1);
    const have = b.creative ? '' : ` <i>(${b.inv.meat} raw)</i>`;
    const t = { type: 'roast', here: true, fire: f, spit };
    if (spit) {
      const on = `on the spit: ${spit.cuts.map(doneness).join(', ')}`;
      const off = '<b>right-click</b> take the meat off';
      if (spit.cuts.length >= ROAST.cuts || !meat) return { ...t, prompt: `${on} · ${off}` };
      if (!hot) return { ...t, prompt: `${on} · the fire is out · ${off}` };
      return { ...t, ok: true, prompt: `${on} · <b>click</b> put on another cut${have} · ${off}` };
    }
    if (!hot) return { ...t, bad: true, prompt: 'roasting wants a fire burning, or hot embers · <i>campfire: lay one and light it</i>' };
    if (!meat) return { ...t, bad: true, prompt: 'no raw meat to roast · <i>shoot something and dress it</i>' };
    return { ...t, ok: true, prompt: `<b>click</b> put a cut of meat on a spit over the fire${have}` };
  }

  function putOn(b, f) {
    b.face(f.x, f.z);
    b.swing('bend', 0.8, 0.6, () => {
      const live = fires.at(f.x, f.z);
      if (!live || !b.have('meat', 1) || !spits.put(f.x, f.z, live.y)) return;
      b.spend('meat', 1);
      b.sound.sfx('spit');
    });
  }

  function takeOff(b, spit) {
    b.face(spit.x, spit.z);
    b.swing('bend', 0.8, 0.55, () => {
      const s = spits.at(spit.x, spit.z);
      if (!s) return;
      const got = spits.takeOff(s);
      if (got.done) b.gain('roast', got.done);
      if (got.raw) b.gain('meat', got.raw);
      const said = [];
      if (got.done) said.push(`+${got.done} roast meat · ${eatHint()}`);
      if (got.raw) said.push(`${plural(got.raw, 'cut')} not done: back in your pack`);
      if (got.burnt) said.push(`${plural(got.burnt, 'cut')} burnt black: thrown away`);
      b.flash(said.join(' · '), 2800);
    });
  }
}
