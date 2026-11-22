// The shotgun: a tool like the others (the contract is at the top of
// build/builder.js), given to you at the hunt club and yours from then on.
// It goes on the tool bar beside the rifle, in the same slot.
//
//   click              shoot · on a skeet station: call "pull!" for the targets
//   hold right-click   mount it: look along the rib, a little closer
//   hold click         beside a kill: dress it for its meat
//
// It's an over-and-under: two shells, one in each barrel, and broken open to
// load. Away from the skeet field it loads two whenever it's empty. On a
// station it's loaded for each throw as skeet is shot: one shell for a single
// target, two for a double, so a target missed with the shell meant for it
// is lost.
//
// A shot is heard a long way off, and the animals near enough run from it.
// It takes game too, closer in than the rifle does.

import { definePose } from '../player/character.js';
import { formatDistance } from '../core/format.js';
import { traceShot } from '../hunting/shot.js';
import { makeShotgun, OPEN } from './models.js';

export const SHELLS = 2; // it holds
const CYCLE = 0.42; // s: the shot, and the gun coming back down out of the kick
const LOAD = { open: 0.3, shell: 0.28, shut: 0.3 }; // s: breaking it open, each shell, and shutting it
export const MOUNT_ZOOM = 1.25; // how much closer things look along the rib
const HEARD = 260; // m: animals this near run from a shot
export const RANGE = 45; // m: game this far off and nearer can be taken; past it, a shot does nothing
const LOOK_EVERY = 0.12; // s between looks along the crosshair for what's on it
const DRESS_REACH = 1.6; // m from a kill you can dress it from
const FLASH = 0.06; // s the muzzle flash shows
const DUST = { ground: 0x5a4a36, tree: 0x6b5a40, rock: 0x8a8a84, building: 0xb08a5a, wall: 0x8a6a48, target: 0x6a5a4a };
const BLOOD = 0x5e2018;

// ── How the hiker holds it ──────────────────────────────────────────────────
// Mounted: the stock in the shoulder and the barrels level ahead (as the
// rifle is held: see hunting/rifle.js and character.js for the angles).
const SP = 0.08;
const AIM = { sh: -0.98, el: -1.65, sp: SP, inw: 0.32, tw: -0.2, drop: 0.02 };
AIM.tool = -Math.PI / 2 - AIM.sp - AIM.sh - AIM.el;
const pose = (over) => ({ ...AIM, ...over });
// brought down in front, the barrels dropped, to load it
const LOW = { sh: -0.6, el: -1.3, sp: 0.16, inw: 0.38, tw: 0, drop: 0.03 };
LOW.tool = -1.0 - LOW.sp - LOW.sh - LOW.el;
definePose('shotgun-aim', [
  [0, AIM],
  [0.5, pose({ sh: AIM.sh - 0.01 })],
  [1, AIM],
]);
definePose('shotgun-shot', [
  [0, AIM],
  [0.08, pose({ sh: AIM.sh + 0.16, tool: AIM.tool - 0.3, sp: SP - 0.07 })], // the kick
  [0.45, AIM],
  [1, AIM],
]);
definePose('shotgun-load', [
  [0, LOW],
  [0.5, { ...LOW, sp: LOW.sp + 0.05, el: LOW.el - 0.08 }],
  [1, LOW],
]);

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// wildlife: the animals (aimed, kill, startle)   which: (animal) -> whether it's game
// carcasses: kills lying where they fell (hunting/carcasses.js)
// targets: anything else a shot can hit (hunting/shot.js Targets), or null
// skeet: the field, as the tool needs it (index.js):
//   status() -> null away from it, or { state, prompt, need }: state 'pull'
//     (a click calls for the next throw, which needs `need` shells), 'wait'
//     (nothing to do but wait), 'flying' (targets in the air), 'field'
//     (somewhere on the field, shoot as anywhere)
//   pull()                the throw called for
//   fired(o, d, from)     a shot fired: -> what it did to the targets, or null
// owned: () -> whether it's yours (a tool can't come off the tool bar, so one
//   that's there is put away by whoever signs in without one); notYours: the
//   prompt then, saying where to get one
export function shotgunTool({ wildlife, which, carcasses, targets = null, skeet, owned = () => true, notYours = 'not yours' }) {
  let shells = SHELLS;
  let mounted = false;
  let clock = 0;
  let flash = null;
  let flashT = 0;
  let barrels = null;
  let loading = null; // { t, dur, n, then, heard }
  const look = { at: -1, label: null, t: 0 };

  const tool = {
    id: 'shotgun',
    label: 'shotgun',
    short: 'shotgun',
    kit: 'guns',
    held: { name: 'shotgun', make: makeShotgun, rest: 2.6, elbow: -0.45 },

    get shells() {
      return shells;
    },
    get mounted() {
      return mounted;
    },
    get loading() {
      return !!loading;
    },

    setup(b) {
      const held = b.player.character.tools.shotgun;
      flash = held ? held.object.getObjectByName('flash') : null;
      barrels = held ? held.object.getObjectByName('barrels') : null;
    },

    target(b) {
      if (!owned()) return { type: 'none', bad: true, prompt: notYours };
      if (loading) return { type: 'load', prompt: 'loading…' };
      const st = skeet.status();
      if (st && st.state === 'pull') return { type: 'pull', ok: true, need: st.need, prompt: `${st.prompt}${mountHint()}` };
      if (st && st.state === 'wait') return { type: 'wait', prompt: st.prompt };
      const p = b.aimPoint || (b.ground && b.ground.p);
      if (p && !mounted && !st) {
        const c = carcasses.near(p.x, p.z, 0.6);
        if (c && b.dist(c.x, c.z) < c.half + DRESS_REACH) {
          return { type: 'dress', ok: true, here: true, carcass: c, prompt: `<b>hold click</b> dress ${c.name} <i>(${plural(c.cuts, 'cut')} of meat)</i>` };
        }
      }
      return aimAt(b, st);
    },

    work(b, t, io) {
      if (loading) return true;
      if (t && t.type === 'none') {
        if (io.useTap) b.deny(t);
        return false;
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
      if (mounted) {
        faceAlong(b);
        b.player.character.play('shotgun-aim', 1.2, true);
      }
      if (t && t.type === 'pull') {
        if (io.useTap) pull(b, t.need);
        return mounted;
      }
      if (t && t.type === 'wait') {
        if (io.useTap) b.deny(t);
        return mounted;
      }
      if (shells <= 0 && !(t && t.flying)) {
        load(b, SHELLS);
        return true;
      }
      if (io.useTap) {
        if (t && t.ok) shoot(b);
        else b.deny(t);
        return true;
      }
      return mounted;
    },

    // Every frame, in hand or not: mounted while right-click is held, the
    // flash out again, and the barrels down and up again while it's loaded.
    update(b, dt) {
      clock += dt;
      if (flashT > 0) {
        flashT -= dt;
        if (flashT <= 0 && flash) flash.visible = false;
      }
      const inHand = b.current === tool && !b.idle;
      const want = inHand && !loading && owned() && b.input.holding('alt') && (mounted || !(b.tgt && b.tgt.here));
      if (want !== mounted) mount(b, want);
      let open = 0;
      if (loading) {
        const L = loading;
        L.t += dt;
        if (!L.heard && L.t > LOAD.open * 0.8) {
          L.heard = true;
          b.sound.sfx('gun-load', { shells: L.n });
        }
        open = Math.min(1, L.t / (LOAD.open * 0.7), (L.dur - L.t) / (LOAD.shut * 0.8));
      }
      if (barrels) barrels.rotation.x = OPEN * Math.max(0, open);
    },

    put(b) {
      if (mounted) mount(b, false);
      loading = null;
      if (barrels) barrels.rotation.x = 0;
      b.dropHold();
    },

    // From the console: as if loaded (n shells), at once.
    fill(n = SHELLS) {
      shells = Math.max(0, Math.min(SHELLS, n));
    },
  };
  return tool;

  function mountHint() {
    return mounted ? '' : ' · <b>hold right-click</b> mount';
  }

  function mount(b, on) {
    mounted = on;
    b.player.sight = on ? { zoom: MOUNT_ZOOM } : null;
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

  // ── Loading ───────────────────────────────────────────────────────────────
  // Broken open, n shells slid in, shut again; then `then`, if anything.
  function load(b, n, then = null) {
    if (mounted) mount(b, false);
    const dur = LOAD.open + LOAD.shell * n + LOAD.shut;
    loading = { t: 0, dur, n, then, heard: false };
    b.sound.sfx('gun-open');
    b.swing('shotgun-load', dur, 0.98, () => {
      const L = loading;
      loading = null;
      if (barrels) barrels.rotation.x = 0;
      if (!L) return;
      shells = n;
      if (L.then) L.then();
    });
  }

  // ── Calling for the targets ───────────────────────────────────────────────
  // Loaded for the throw first (one shell for a single, two for a double), as
  // skeet is shot, then the call.
  function pull(b, need) {
    if (shells === need) skeet.pull();
    else load(b, need, () => skeet.status()?.state === 'pull' && skeet.pull());
  }

  // ── Shooting ──────────────────────────────────────────────────────────────
  function aimAt(b, st) {
    const flying = !!(st && st.state === 'flying');
    const before = st && st.prompt ? `${st.prompt} · ` : '';
    if (shells <= 0) return { type: 'shoot', flying, prompt: flying ? `${before}empty` : 'loading…' };
    if (!flying && clock - look.at > LOOK_EVERY) {
      // what's on the crosshair, if it's game in range and nothing is in the way
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
    const on = !flying && look.label ? `${look.label} · ${formatDistance(look.t)} · ` : '';
    return { type: 'shoot', ok: true, flying, prompt: `${before}${on}<b>click</b> shoot <i>(${plural(shells, 'shell')})</i>${mountHint()}` };
  }

  function shoot(b) {
    const o = b.aimO;
    const d = b.aimD;
    const P = b.player.pos;
    shells--;
    look.at = -1;
    b.sound.sfx('shotgun');
    if (flash) flash.visible = true;
    flashT = FLASH;
    faceAlong(b);
    b.swing('shotgun-shot', CYCLE, 0.5, () => {});
    const hit = skeet.fired(o, d, { x: P.x, y: P.y + b.player.eye, z: P.z });
    if (!hit || !hit.broke) {
      const shot = traceShot({ chunks: b.chunks, buildings: b.buildings, wildlife, which, targets }, o, d, nearOf(b), RANGE);
      if (shot.what === 'animal') {
        const body = wildlife.kill(shot.hit);
        if (body) b.flash(`a clean shot · ${carcasses.add(body).label} is down`, 2600);
      } else if (shot.what === 'target') {
        const said = shot.source.struck ? shot.source.struck(shot.hit, o.clone().addScaledVector(d, shot.t)) : null;
        if (said) b.flash(said, 2600);
      } else if (shot.what) {
        b.chips.burst(o.clone().addScaledVector(d, shot.t), 12, DUST[shot.what], 1.2, 0.6);
      }
    }
    wildlife.startle(P.x, P.z, HEARD);
    if (targets) targets.heard(P.x, P.z);
  }

  // ── A kill ────────────────────────────────────────────────────────────────
  function dress(b, c) {
    carcasses.remove(c);
    b.gain('meat', c.cuts);
    b.sound.sfx('thud', { size: 0.15 });
    b.flash(`+${plural(c.cuts, 'cut')} of raw meat · roast it over a campfire`, 2600);
  }
}
