// Skateboarding: a board in your pack, and anywhere there's tarmac or boards
// underfoot (a paved road, a town's gate, a car lot, an airstrip, a pier, a
// boardwalk) you can step onto it and go. Push along, carve, bomb the hills
// crouched down, slide it out to stop; ollie, and in the air kickflip,
// heelflip, shove-it and spin, and come down on it — or don't, and bail.
// Roll off onto the grass and you step off, or are thrown.
//
//   skater.js    the physics: rolling, pushing, carving, the air, bailing
//   tricks.js    what you did in the air: whether you landed it, its name, its points
//   session.js   a session's tally: how far, how fast, points, lines
//   controls.js  the keys, read into what the skater is told; what to say they do
//   pose.js      how you stand on it, push it, and the board under your feet
//   board.js     the skateboard
//   sound.js     the wheels on the tarmac, the slide, the wind; push, pop, land, bail
//   others.js    other people here on theirs
//
// While you skate the board moves you (player.aboard), you stand on it
// (Character.stance), and the tools are put away (builder.idleWhile). Your
// best in this world is yours, saved (the 'skateboarding' domain).
//
// From the console:
//   world.skateboarding.on()      onto your board, here, wherever you are
//   world.skateboarding.off()
//   world.skateboarding.state()   how you're going, and this session's tally

import type { Game } from '../game/game.ts';
import type { Placed } from '../player/rides.ts';
import { Skater, rolls, setsOff, DECK, REACH } from './skater.js';
import { Session } from './session.js';
import { Pose } from './pose.js';
import { makeBoard } from './board.js';
import { readControls, cueFor } from './controls.js';
import { skateSounds } from './sound.js';
import { Skaters } from './others.js';
import * as pictures from './pictures.js';
import './skateboarding.css';
import { segDist, waterSample } from '../core/geom.js';
import { clamp } from '../noise.js';

// What this provides: game.skateboarding, for the console.
declare module '../game/game.ts' {
  interface Services {
    skateboarding: SkateboardingService;
  }
}
interface Best {
  points: number;
  top: number; // km/h
  trick: string | null;
}
interface SkateboardingService {
  readonly active: boolean;
  readonly best: Best | null;
  skater: Skater;
  session: Session;
  on(): string;
  off(): string;
  state(): Record<string, unknown>;
}

// Put somewhere else by something else (a teleport), further than this (m)
// from where the board had you: that's the end of the session (the mover's
// slack: player/rides.ts).
const MOVED = 2;
// How far (m) the act key ranks stepping onto the board: anything else at
// hand nearer than this (a car's door, your horse) is done first.
const SKATE_D = 6;
// How the camera follows: round behind you this fast (1/s), and back this
// much further (m) per m/s, up to BACK_MOST.
const BEHIND = 2;
const BACK = 0.06;
const BACK_MOST = 1.8;
// A built thing that doesn't say what it's made of is underfoot as this
// (skater.js SURFACES): rolled onto, not set off on.
const BUILT = 'built';
// Land poking up through something laid on it by less than this (m) is
// ridden over: the tarmac is what's underfoot.
const BURIED = 0.25;
// How long (ms) a word stays on the screen.
const SAY = 2600;
const QUIPS = ['slam!', 'bail!', 'eat it!', 'ouch!', 'gnarly!', 'that’ll leave a mark'];
// What the land is, to say so, by the sort of ground it is.
const _land = { h: 0, path: 0, forest: 0, above: 0, snow: 0, bare: 0, sand: 0, land: 0, country: 0 };
const _seg = { d: 0, t: 0, nx: 0, nz: 0 };
const _w = waterSample();
const fmt = (n: number) => Math.round(n).toLocaleString('en');

// The features this uses, so it is installed after them (game/features.js).
export const after = ['render', 'ui', 'world', 'player', 'audio', 'build', 'save', 'act'];
export function installSkateboarding(game: Game) {
  const { scene, chunks, solids, player, input, hud, commands, save, sound, builder, peers, act } = game;

  // ── What's under the wheels, and what's in the way ────────────────────────
  // The land, called what it looks like: what you're thrown onto.
  function landWhat(x: number, z: number) {
    if (!chunks.groundAt(x, z, _land)) return 'the ground';
    if (_land.snow > 0.5) return 'the snow';
    if (_land.sand > 0.5) return 'the sand';
    if (_land.path > 0.45 || _land.above > 0.6 || _land.bare > 0.5) return 'the dirt';
    return _land.forest > 0.62 ? 'the leaves' : 'the grass';
  }
  const ground = {
    // the top of the highest thing laid there no higher than `reach`, or the land
    at(x: number, z: number, reach: number, out: { y: number; surface: string; what: string; water: number }) {
      let top = -Infinity;
      let surface = '';
      solids.forEachNear(x, z, 1, (s: Solid) => {
        segDist(x, z, s.ax, s.az, s.bx, s.bz, _seg);
        if (_seg.d > s.r) return;
        const t = s.topA + (s.topB - s.topA) * _seg.t;
        if (t > top && t <= reach) {
          top = t;
          surface = s.surface || BUILT;
        }
      });
      const land = chunks.heightAt(x, z);
      if (top > land - BURIED) {
        out.y = top;
        out.surface = surface;
        out.what = surface === BUILT ? 'something built' : `the ${surface}`;
        out.water = 0;
        return out;
      }
      out.y = land;
      out.surface = 'ground';
      out.what = landWhat(x, z);
      out.water = chunks.waterAt(x, z, _w) && _w.depth > 0 ? _w.depth : 0;
      return out;
    },
    // trunks, boulders, and anything built standing higher than the wheels roll up onto
    hit(x: number, y: number, z: number, r: number, out: { nx: number; nz: number; depth: number; what: string }) {
      let best = 0;
      chunks.forEachCollider(x, z, (cx: number, cz: number, cr: number) => {
        const dx = x - cx;
        const dz = z - cz;
        const d = Math.hypot(dx, dz);
        const depth = cr + r - d;
        if (depth <= best || d < 1e-5) return;
        const boulder = cr >= 0.5;
        if (y - chunks.heightAt(cx, cz) > (boulder ? cr * 0.9 : 10)) return;
        best = depth;
        out.nx = dx / d;
        out.nz = dz / d;
        out.depth = depth;
        out.what = boulder ? 'a boulder' : 'a tree';
      });
      solids.forEachNear(x, z, 1.2 + r, (s: Solid) => {
        segDist(x, z, s.ax, s.az, s.bx, s.bz, _seg);
        const depth = s.r + r - _seg.d;
        if (depth <= best) return;
        const top = s.topA + (s.topB - s.topA) * _seg.t;
        if (top <= y + REACH || y + 1.6 < s.bottom) return;
        best = depth;
        out.nx = _seg.nx;
        out.nz = _seg.nz;
        out.depth = depth;
        out.what = 'something built';
      });
      return best > 0;
    },
  };

  // ── You, on it ────────────────────────────────────────────────────────────
  const skater = new Skater(ground);
  const board = makeBoard();
  const pose = new Pose(board);
  const session = new Session();
  // the board on its own while you're down
  const loose = makeBoard();
  const heard = { on: false, speed: 0, rolling: false, surface: 'tarmac', slide: 0, drag: 0 };
  sound.addLayer(skateSounds(heard));
  let active = false;
  let best: Best | null = null;
  let hold: ReturnType<typeof player.rides.take> = null;
  let heading = 0; // which way you were going, for the camera to keep to while you're down
  const c = { push: false, brake: 0, steer: 0, crouch: false, pop: false, flip: 0, shove: false };
  builder.idleWhile(() => active);

  const mover = {
    slack: MOVED,
    place(out: Placed, dt: number) {
      readControls(input, c);
      skater.step(dt, c);
      // stepped off as it went (rolled onto the grass): on your feet, where off() put you
      if (!active) {
        out.x = player.pos.x;
        out.y = player.pos.y;
        out.z = player.pos.z;
        out.yaw = player.yaw;
        return;
      }
      pose.update(dt, skater);
      player.character.stance(pose.current(skater));
      const down = skater.down >= 0;
      out.x = skater.x;
      out.y = skater.y + (down ? 0 : DECK);
      out.z = skater.z;
      out.yaw = pose.yaw;
      if (!down) heading = skater.heading;
      out.heading = heading;
      out.grounded = skater.grounded;
      out.behind = down ? 0 : BEHIND;
      out.back = Math.min(BACK_MOST, skater.speed * BACK);
    },
  };

  // On foot, out under the sky, on nothing that moves, and nothing else has you.
  const onFoot = () => player.rides.free && !player.space && !player.swimming && !player.deck && player.wade < 0.05;
  const underfoot = () => (player.underfoot && player.underfoot.surface) || '';
  const canSkate = () => onFoot() && player.grounded && setsOff(underfoot());

  function on() {
    if (active) return;
    // (taken off it by something else, or put somewhere else, a teleport: that's the end of it)
    hold = player.rides.take({ by: 'skateboarding', what: 'your skateboard', aboard: mover, lost: () => off(true) });
    if (!hold) return hud.flash(player.rides.why());
    const v = player.vel;
    const s = Math.hypot(v.x, v.z);
    // stepping on at a run carries some of it
    skater.start(player.pos.x, player.pos.z, s > 0.5 ? Math.atan2(v.x, v.z) : player.yaw, Math.min(s, 3), player.pos.y);
    heading = skater.heading;
    player.character.stance(pose.current(skater));
    active = true;
    session.reset(skater.x, skater.z);
    tell();
    sound.sfx('skate-board');
    hud.flash(`onto your skateboard · ${cueWords()}`, SAY);
  }

  // Off it again. moved: something else has put you somewhere (a teleport)
  function off(moved = false, word: string | null = null) {
    if (!active) return;
    active = false;
    if (hold) hold.release();
    hold = null;
    const root = player.character.root;
    player.character.stance(null);
    root.rotation.x = 0;
    root.rotation.z = 0;
    scene.remove(loose.object);
    if (!moved) {
      player.pos.set(skater.x, skater.y, skater.z);
      player.yaw = pose.yaw;
    }
    player.vel.set(0, 0, 0);
    player.grounded = true;
    heard.on = false;
    tell();
    sound.sfx('skate-board');
    finish(word);
  }

  // The session is over: what it came to, and whether it was your best.
  function finish(word: string | null) {
    session.bank();
    const top = Math.round(session.top * 3.6);
    const said = [word || 'board under your arm'];
    if (session.distance > 20) said.push(`${fmt(session.distance)} m`, `top ${top} km/h`);
    if (session.points) said.push(`${fmt(session.points)} points`);
    const was = best || { points: 0, top: 0, trick: null };
    if (session.distance > 20 && (session.points > was.points || top > was.top)) {
      const better = session.points > was.points;
      best = { points: Math.max(was.points, session.points), top: Math.max(was.top, top), trick: better && session.best ? session.best.name : was.trick };
      if (better && was.points) said.push('your best yet');
      save.touch();
    }
    hud.flash(said.join(' · '), SAY + 1400);
  }

  // ── What happens as you go ────────────────────────────────────────────────
  skater.on('push', () => sound.sfx('skate-push'));
  skater.on('takeoff', (popped: boolean) => {
    if (!popped) return;
    sound.sfx('skate-pop');
    pose.popped();
  });
  skater.on('land', (l: { impact: number; name: string; points: number; fakie: boolean }) => {
    sound.sfx('skate-land', { size: clamp(l.impact / 6, 0.2, 1) });
    if (!l.points) return;
    session.landed(l.name, l.points);
    const n = session.line.length;
    hud.flash(`${l.name || 'air'} +${fmt(l.points)}${n > 1 ? ` · line ×${n}` : ''}${l.fakie ? ' · rolling away fakie' : ''}`, SAY);
  });
  skater.on('touch', (s: number) => s > 0.05 && sound.sfx('skate-land', { size: s * 0.5 }));
  skater.on('bump', (s: number) => sound.sfx('skate-land', { size: s * 0.4 }));
  skater.on('brush', (_what: string, speed: number) => sound.sfx('skate-clatter', { size: clamp(speed / 4, 0.2, 1) }));
  skater.on('crash', (why: string) => {
    sound.sfx('skate-bail');
    scene.add(loose.object);
    const lost = session.bail();
    const quip = QUIPS[Math.floor(Math.random() * QUIPS.length)];
    hud.flash(`${quip} ${why}${lost ? ` · lost ${fmt(lost)}` : ''}`, SAY);
  });
  skater.on('clatter', (s: number) => sound.sfx('skate-clatter', { size: s }));
  skater.on('up', () => {
    scene.remove(loose.object);
    // up on the grass, say: the board goes under your arm
    if (!rolls(skater.surface)) return off(false, `on ${skater.what || 'the ground'} · board under your arm`);
    sound.sfx('skate-board');
  });
  skater.on('off', (where: string) => off(false, `${where === 'the water' ? 'into' : 'onto'} ${where} · board under your arm`));

  // ── Everyone else here ────────────────────────────────────────────────────
  // They're told whether you're on a board, and you see whether they are.
  function tell() {
    save.say('skate', { on: active });
  }
  if (peers) {
    const skaters = new Skaters(peers);
    save.on('message', (msg: { ch: string; from: string; body: unknown }) => msg.ch === 'skate' && skaters.hear(msg.from, msg.body));
    // someone new: tell them you're on one
    peers.on('change', () => {
      skaters.update();
      if (active) tell();
    });
  }

  // ── Keys ──────────────────────────────────────────────────────────────────
  // Onto it and off it with the act key (F), as onto and off anything: on
  // tarmac or boards, 'skate'; on it, 'step off'. In the pack too, where
  // anywhere else it says where it can be ridden.
  function toggle() {
    if (active) return off();
    if (!onFoot()) return hud.flash(player.rides.free ? 'stand on your own two feet to skate' : player.rides.why());
    if (!canSkate()) return hud.flash('skate on tarmac or boards: a paved road, a car lot, an airstrip, a pier, a boardwalk');
    on();
  }
  act.offer({
    id: 'skateboard',
    at() {
      if (active) return { d: 0, word: 'step off', run: () => off(), icon: pictures.SKATEBOARD };
      return canSkate() ? { d: SKATE_D, word: 'skate', run: () => on(), icon: pictures.SKATEBOARD } : null;
    },
  });
  commands.add({ id: 'skateboard', group: 'WANDER', label: 'skateboard: onto it, on tarmac or boards · off it', icon: pictures.SKATEBOARD, run: toggle });
  commands.describe({ group: 'WANDER', help: 'F', pad: ['PadY'], label: 'on tarmac or boards: onto your skateboard · on it: step off' });
  commands.describe({ group: 'WANDER', help: 'skating', label: 'W push · A D carve · S brake, slide · shift crouch · space ollie' });
  commands.describe({ group: 'WANDER', help: 'skating, in the air', label: 'W kickflip · S heelflip · shift shove-it · A D spin' });
  const cueWords = () => cueFor(input, skater, act.key('step off')).replace(/<\/?b>/g, '');

  // ── The readout: how fast, and the points ─────────────────────────────────
  const readout = document.createElement('div');
  readout.id = 'skate';
  readout.hidden = true;
  document.getElementById('hud')?.appendChild(readout);
  let shown = '';
  function show() {
    let text = '';
    if (active) {
      const parts = [`${Math.round(skater.speed * 3.6)} km/h`];
      if (session.points) parts.push(`${fmt(session.points)} pts`);
      if (session.line.length) parts.push(`+${fmt(session.pending)}${session.line.length > 1 ? ` (×${session.line.length})` : ''}`);
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
    if (!active) return hud.cue(null, 'skateboarding');
    hud.cue({ html: cueFor(input, skater, act.key('step off')) }, 'skateboarding');
  }

  // ── Every frame ───────────────────────────────────────────────────────────
  game.addSystem({
    name: 'skateboarding',
    phase: 'update',
    update({ dt }) {
      if (!active) {
        cue();
        show();
        return;
      }
      const root = player.character.root;
      root.rotation.x = pose.rx;
      root.rotation.z = pose.rz;
      const down = skater.down >= 0;
      const rolling = skater.grounded && !down;
      if (rolling) board.roll(skater.v * dt);
      // the board on its own, while you're down
      const b = skater.loose;
      if (b) {
        loose.object.position.set(b.x, b.y + DECK, b.z);
        loose.object.rotation.y = b.yaw - Math.PI / 2;
        loose.turn.rotation.set(b.flip, 0, 0, 'YXZ');
        loose.roll(b.v * dt);
      }
      const banked = session.update(dt, skater.x, skater.z, skater.speed, rolling);
      if (banked) hud.flash(`line banked +${fmt(banked)}`, SAY);
      heard.on = true;
      heard.speed = skater.speed;
      heard.rolling = rolling;
      heard.surface = skater.surface;
      heard.slide = skater.slide;
      heard.drag = skater.dragging ? 1 : 0;
      cue();
      show();
    },
  });

  // ── Saved: your best in this world ────────────────────────────────────────
  save.register({
    id: 'skateboarding',
    scope: 'yours',
    collect: () => best,
    validate(raw: unknown) {
      if (!raw || typeof raw !== 'object') return null;
      const r = raw as Record<string, unknown>;
      const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v) : 0);
      return { points: n(r.points), top: n(r.top), trick: typeof r.trick === 'string' ? r.trick.slice(0, 80) : null };
    },
    restore(data: Best | null) {
      best = data && (data.points || data.top) ? { ...data } : null;
    },
  });

  // ── From the console ──────────────────────────────────────────────────────
  game.provide('skateboarding', {
    get active() {
      return active;
    },
    get best() {
      return best ? { ...best } : null;
    },
    skater,
    session,
    on() {
      if (active) off();
      on();
      return active ? 'on your skateboard' : player.rides.why();
    },
    off() {
      off();
      return 'off';
    },
    state: () => ({
      active,
      speed: Math.round(skater.speed * 10) / 10,
      kmh: Math.round(skater.speed * 3.6),
      grounded: skater.grounded,
      flying: skater.flying,
      down: skater.down >= 0,
      fakie: skater.fakie,
      pushing: skater.pushing,
      surface: skater.surface,
      x: Math.round(skater.x * 10) / 10,
      z: Math.round(skater.z * 10) / 10,
      session: { time: Math.round(session.time * 10) / 10, distance: Math.round(session.distance), top: Math.round(session.top * 3.6), points: session.points, pending: session.pending, bails: session.bails },
    }),
  });
}

// A solid, as world/solids.js keeps it.
interface Solid {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  r: number;
  topA: number;
  topB: number;
  bottom: number;
  surface?: string;
}
