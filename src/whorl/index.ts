// The Whorl: the stainless-steel slide down the middle of the Nautilus
// Lookout Tower at Owl Creek Landing, in the woods behind the Virginia
// Aquarium's South Building in Virginia Beach. Life size, where it really
// is, on its real ground (a real place brought in at 1 : 1: world/hikes.js,
// owl-creek-landing), with Owls Creek running past below it and the
// footbridge over the creek from the South Building's car park.
//
// Walk up the ramp, six times round the tower to the top deck, 19 m over
// the woods; the slide's mouth is on the west side. F there (the act key)
// sits you on a mat and pushes you off: a turn and a half down the middle
// in a stainless tube, riding up its wall in the turns, out under the foot
// of the ramp, and along the run-out to a stop. How many times you've been
// down it, and your quickest and fastest, are yours.
//
// This plugs it into the game: where it is, standing it up as you come near
// and taking it down as you leave, the forest kept off it, the ride, its
// place on the map, and what you've done on it. What it's built from is
// fetched when you first come near (core/lazy.ts), not at the start:
//
//   tower.js     the tower and the slide in numbers: decks, rails, columns, the slide's path
//   ride.js      a ride down it: how you go, and where you are in the tube
//   sound.js     the grating underfoot, the slide hissing and booming, the joints knocking
//   pictures.js  the Whorl in your pack
//   onMap.js     the tower on the map, close up
//   look.js      (fetched) everything stood up: the steel, the tube, the footbridge, the signs
//
// From the console:
//   await world.whorl.go('top')   on the top deck by the slide's mouth ('foot': at the foot of the ramp)
//   world.whorl.ramp(u)           where the middle of the ramp is, u laps up it (0..6), while it's stood up
//   world.whorl.slide()           down it, from by the mouth
//   world.whorl.riding            how it's going: { s, v, t }, or null
//   world.whorl.hurry()           skip to the last of a ride
//   world.whorl.rides, .quickest, .fastest

import * as THREE from 'three';
import type { Game } from '../game/game.ts';
import type { Hold } from '../player/rides.ts';
import { lazy } from '../core/lazy.ts';
import { formatDistance } from '../core/format.js';
import { VEG_STRIDE } from '../world/flora.js';
import { SEAT_HIPS } from '../player/character.js';
import { TOWER, SLIDE, MOUTH, FOOT, WHERE, slidePath, tubeFrame, decksOver, apothemOf, rampAt, rampY } from './tower.js';
import { Ride, RIDE } from './ride.js';
import { slideSounds } from './sound.js';
import { drawWhorl } from './onMap.js';
import * as pictures from './pictures.js';

type Tower = import('./look.js').Tower;

declare module '../game/game.ts' {
  interface Services {
    whorl: WhorlService;
  }
}
interface WhorlService {
  go(where?: 'top' | 'foot'): Promise<boolean>;
  ramp(u: number): { x: number; y: number; z: number } | null;
  slide(): boolean;
  hurry(): void;
  readonly riding: { s: number; v: number; t: number; inside: boolean } | null;
  readonly built: Tower | null;
  readonly rides: number;
  readonly quickest: number | null;
  readonly fastest: number;
}

// The real place it stands on (world/hikes.js)
const HIKE = 'owl-creek-landing';
// m from the tower: nearer than WANT, what builds it is sent for; nearer
// than SHOW it's stood up, and past HIDE taken down.
const WANT = 2500;
const SHOW = 1500;
const HIDE = 1900;
// m from where you stand at the mouth that you can get on from, and how far
// over or under the top deck
const REACH = 1.8;
const LEVEL = 1;
// On the mat in the slide: lying well back, legs out straight in front,
// hands out on its sides (Character.seat), as you're told to ride it.
const SEAT = { spread: 0.14, hang: 0.03, fwd: 0.85, lean: -1.05, reins: 0, rest: 0.7, stroke: null };
// The camera on the way down: round behind you this quickly (1/s), from
// just over the middle of the tube (m), looking down it along the way it
// came this many of its points back (the chord of a turn stays in the tube
// longer than a straight look back), and a little over the slope (radians)
// as it comes round to that (1/s); kept this far inside its wall (m), and
// looked for along its way this finely (m).
const BEHIND = 4;
const CAM = { over: 0.2, back: 9, pitch: 0.05, tilt: 3, clear: 0.12, step: 0.08, look: 40 };
// Over the decks: the camera stays this far (m) off a deck's top and underside
const DECK_CLEAR = 0.2;
// m off the side of the run-out you step down onto the ground, and how fast
// you're still going (m/s)
const STEP_OFF = 0.5;
const STEP_SPEED = 1.2;
// How shut in the tube is, to the sound of the forest (0..1, as caves are)
const SHUT = 0.75;
// Saying you're at the top: no more than once in this long (s)
const TOP_SAID = 120;
const ID = 'whorl:';
// On the map's badge: a spiral.
const GLYPH = ['.......', '.#####.', '.#...#.', '.#.#.#.', '.#.###.', '.#.....', '.######'];

const _v = new THREE.Vector3();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _f = { t: [0, 0, 0], r: [0, 0, 0], u: [0, 0, 0], c: [0, 0, 0] };

// The features this uses, so it is installed after them (game/features.js):
// act, whose key gets you on.
export const after = ['render', 'ui', 'world', 'player', 'audio', 'build', 'map', 'save', 'act'];
export function installWhorl(game: Game) {
  const { scene, gen, chunks, grass, solids, landforms, player, builder, map, hud, commands, save, sound, act } = game;
  const card = landforms.cards.find((c: { id: string }) => c.id === HIKE);
  if (!card) return;
  // the tower's middle: the middle of the real place round it
  const [X, Z] = card.at;
  if (!card.middle || Math.abs(card.middle.lat - WHERE.lat) > 1e-5 || Math.abs(card.middle.lon - WHERE.lon) > 1e-5) console.warn(`the Whorl: ${HIKE} isn't centred on the tower`);
  const world = (p: { x: number; z: number }) => ({ x: X + p.x, z: Z + p.z });
  const foot = world(FOOT);
  const mouth = world(MOUTH);

  // ── What's yours: how many times down, the quickest and the fastest ────────
  let rides = 0;
  let quickest: number | null = null; // s
  let fastest = 0; // m/s
  save.register({
    id: 'whorl',
    scope: 'yours',
    local: 'marks',
    collect: () => ({ rides, quickest, fastest }),
    validate: (r: { rides?: unknown; quickest?: unknown; fastest?: unknown }) => ({
      rides: Number.isInteger(r?.rides) && (r.rides as number) >= 0 ? (r.rides as number) : 0,
      quickest: typeof r?.quickest === 'number' && r.quickest > 0 ? r.quickest : null,
      fastest: typeof r?.fastest === 'number' && r.fastest > 0 ? r.fastest : 0,
    }),
    restore(r: { rides: number; quickest: number | null; fastest: number }) {
      ({ rides, quickest, fastest } = r);
      // (set down up on the tower, it has to be there to be set down on)
      const a = player.arrival;
      if (a && Math.hypot(a.x - X, a.z - Z) < SHOW) game.beforeArrival(standUpNow());
    },
  });

  // ── Standing it up ─────────────────────────────────────────────────────────
  // Built a little at a time, out of the frame's allowance for work that can
  // wait (game/budget.ts), and put up when it's all built.
  const look = lazy(() => import('./look.js'));
  let built: Tower | null = null; // up
  let building: Tower | null = null; // being built
  function standUp() {
    const L = gen.landforms.find((l: { id: string }) => l.id === HIKE);
    const m = look.want();
    if (!L || !m) return;
    const ground = (x: number, z: number) => gen.height(x, z);
    // the land's own water: Owls Creek
    const water = (x: number, z: number) => {
      const [level, sea] = [L.level, L.sea]; // (shore() sets these: put back)
      const d = L.shore(x, z);
      const at = L.level + L.offset;
      [L.level, L.sea] = [level, sea];
      return d < 0 ? at : NaN;
    };
    // its foot level with the ground where the ramp starts
    const base = ground(X + FOOT.x, Z + TOWER.rampOut);
    building = new m.Tower({ at: [X, Z], base, ground, water });
  }
  function putUp(t: Tower) {
    built = t;
    building = null;
    scene.add(t.group);
    for (const [k, list] of Object.entries(t.solids)) solids.set(`whorl:${k}`, list);
    // the plants already grown there, and the grass
    for (const ch of chunks.chunks.values()) clearChunk(ch);
    grass.invalidate(X - 160, Z - 160, X + 160, Z + 160);
  }
  function takeDown() {
    if (ride) getOff(false);
    if (building) building.dispose();
    building = null;
    if (!built) return;
    scene.remove(built.group);
    for (const k of Object.keys(built.solids)) solids.clear(`whorl:${k}`);
    built.dispose();
    built = null;
  }
  // Stood up outright, not a little at a time: you're about to be on it.
  async function standUpNow() {
    if (!landforms.has(HIKE)) await landforms.ensure(HIKE);
    await look.ready();
    if (!built && !building) standUp();
    if (building) {
      building.pump(Infinity);
      putUp(building);
    }
  }
  game.budget.add({
    name: 'whorl',
    work(ms: number) {
      if (!building) return false;
      if (building.pump(ms)) return true;
      putUp(building);
      return false;
    },
  });

  // ── The forest round it ────────────────────────────────────────────────────
  // No tree in the tower, on the path or under the run-out; no grass under the
  // tower or on the gravel. (Chunks grown before it's stood up are gone over
  // when it is.)
  const SMALL = new Set(['bush', 'fern']);
  function clearChunk(ch: { cx: number; cz: number; vegLists?: Record<string, Float32Array | number[]> }) {
    if (!built || !ch.vegLists) return;
    const S = chunks.size;
    if ((ch.cx + 1) * S < X - 160 || ch.cx * S > X + 160 || (ch.cz + 1) * S < Z - 160 || ch.cz * S > Z + 160) return;
    for (const kind in ch.vegLists) {
      const list = ch.vegLists[kind];
      const small = SMALL.has(kind);
      for (let o = 0, k = 0; o < list.length; o += VEG_STRIDE, k++) {
        if (list[o + 4] <= 0) continue;
        if (built.clears(list[o], list[o + 2], small)) chunks.hideInstance(ch, kind, k);
      }
    }
  }
  chunks.on('vegetation', clearChunk);
  grass.addClearing((x0: number, z0: number, x1: number, z1: number) => {
    if (!built || x0 > X + 160 || x1 < X - 160 || z0 > Z + 160 || z1 < Z - 160) return null;
    const t = built;
    return (x: number, z: number) => t.bare(x, z);
  });
  // A builder's tools go round it.
  builder.obstacles.addSource((x: number, z: number, R: number, out: unknown[]) => {
    if (!built || Math.hypot(x - X, z - Z) > HIDE) return;
    for (const o of built.obstacles) {
      if (Math.hypot(o.x - x, o.z - z) > R + o.r + 1) continue;
      out.push({ x: o.x, z: o.z, what: o.what, dig: o.r + 0.3, wall: o.r + 0.2, footing: o.r + 0.5, roof: o.r, grown: true });
    }
  });

  // ── The camera ─────────────────────────────────────────────────────────────
  // It doesn't look through a deck from over or under it, and on the way
  // down it stays in the tube with you, behind you.
  const P = slidePath();
  const axis: number[][] = P.pts.map((_: unknown, i: number) => tubeFrame(P, i, _f).c.slice());
  player.cameraBlockers.push((origin: THREE.Vector3, dir: THREE.Vector3, max: number) => {
    if (!built) return Infinity;
    const lx = origin.x - X;
    const lz = origin.z - Z;
    if (Math.abs(lx) > 40 || Math.abs(lz) > 40) return Infinity;
    const ly = origin.y - built.base;
    if (ride && ride.at.inside) return inTube(lx, ly, lz, dir, max);
    // the decks: where the look first comes within reach of one
    for (let t = 0.3; t <= max; t += 0.2) {
      const [x, y, z] = [lx + dir.x * t, ly + dir.y * t, lz + dir.z * t];
      for (const d of decksOver(x, z)) if (y < d + DECK_CLEAR && y > d - TOWER.deck - DECK_CLEAR) return Math.max(0.3, t - 0.2);
    }
    return Infinity;
  });
  // How far the look goes from inside the tube before it's at its wall.
  function inTube(x: number, y: number, z: number, dir: THREE.Vector3, max: number) {
    const i0 = Math.max(0, Math.round((ride ? ride.s : 0) / SLIDE.step) - CAM.look);
    const i1 = Math.min(axis.length - 1, i0 + CAM.look * 2);
    const R = SLIDE.tube - CAM.clear;
    for (let t = CAM.step; t <= max; t += CAM.step) {
      const [px, py, pz] = [x + dir.x * t, y + dir.y * t, z + dir.z * t];
      let best = Infinity;
      for (let i = i0; i <= i1; i++) {
        const c = axis[i];
        const d = (c[0] - px) ** 2 + (c[1] - py) ** 2 + (c[2] - pz) ** 2;
        if (d < best) best = d;
      }
      if (Math.sqrt(best) > R) return Math.max(0.05, t - CAM.step);
    }
    return Infinity;
  }

  // ── Getting on, and going down ─────────────────────────────────────────────
  // At the mouth, on the top deck, F sits you on a mat and pushes you off.
  const onDeck = () => built && Math.abs(player.pos.y - (built.base + TOWER.top)) < LEVEL && Math.hypot(player.pos.x - mouth.x, player.pos.z - mouth.z) < REACH;
  act.offer({
    id: 'whorl',
    at() {
      if (ride || !onDeck()) return null;
      return { d: Math.hypot(player.pos.x - mouth.x, player.pos.z - mouth.z), word: 'slide', run: slide, icon: pictures.WHORL };
    },
  });
  let ride: Ride | null = null;
  let hold: Hold | null = null;
  let joints = 0;
  let pitchWas: number | null = null; // the camera's, to put back at the bottom
  let slope = 0; // how steeply the tube behind you climbs (radians)
  const heard = { on: false, v: 0, inside: 0, joints: 0 };
  sound.addLayer(slideSounds(heard));
  builder.idleWhile(() => ride !== null);
  // where your hips are, in the world, and the way your body is turned
  const hips = new THREE.Vector3();
  const mover = {
    // moved further than this by something else (R, the map), you're off it
    slack: 3,
    place(out: { x: number; y: number; z: number; yaw: number; heading?: number; behind: number; back: number; grounded: boolean }, dt: number) {
      if (!ride || !built) return;
      ride.update(dt);
      const a = ride.at;
      hips.set(X + a.x, built.base + a.y, Z + a.z);
      // where you are, to the camera and the rest of the game: in the middle
      // of the tube, the camera looking from just over it (the hiker is put
      // where the hips are, and turned, after: see the system below)
      const i = Math.min(axis.length - 1, Math.round(ride.s / SLIDE.step));
      const [c, b] = [axis[i], axis[Math.max(0, i - CAM.back)]];
      out.x = X + c[0];
      out.y = built.base + c[1] + CAM.over - player.eye;
      out.z = Z + c[2];
      out.yaw = a.yaw;
      // looked at along the way you came: the chord of the turn behind you
      const run = Math.hypot(c[0] - b[0], c[2] - b[2]);
      out.heading = run > 0.3 ? Math.atan2(c[0] - b[0], c[2] - b[2]) : a.yaw;
      slope = Math.atan2(b[1] - c[1], Math.max(run, 0.3));
      out.behind = BEHIND;
      out.back = 0;
      out.grounded = true;
    },
  };
  function slide() {
    if (ride || !built) return false;
    if (!player.rides.free) {
      hud.flash(player.rides.why());
      return false;
    }
    const r = new Ride(P);
    const h = player.rides.take({ by: 'whorl', what: 'the Whorl', aboard: mover, lost: () => getOff(false) });
    if (!h) return false;
    ride = r;
    hold = h;
    joints = 0;
    pitchWas = player.camPitch;
    player.character.seat(SEAT);
    scene.add(built.mat);
    sound.sfx('whorl-sit');
    return true;
  }
  // Off it: at the end of the run-out, onto your feet on the ground (or, if
  // something else took you off it, just off it).
  function getOff(ended: boolean) {
    const r = ride;
    if (!r) return;
    ride = null;
    if (hold && hold.held) hold.release();
    hold = null;
    player.character.seat(null);
    const root = player.character.root;
    root.rotation.order = 'YXZ';
    root.rotation.x = 0;
    root.rotation.z = 0;
    if (pitchWas !== null) player.camPitch = pitchWas;
    pitchWas = null;
    if (built) scene.remove(built.mat);
    heard.on = false;
    if (!ended || !built) return;
    // up off the mat, and down off the side of the run-out onto the ground
    const yaw = r.at.yaw;
    const [dx, dz] = [Math.sin(yaw), Math.cos(yaw)];
    tubeFrame(P, Math.min(axis.length - 1, Math.round(r.s / SLIDE.step)), _f);
    const side = SLIDE.tube + SLIDE.wall + STEP_OFF;
    const x = X + r.at.x + _f.r[0] * side;
    const z = Z + r.at.z + _f.r[2] * side;
    player.pos.set(x, player.groundAt(x, z, built.base + r.at.y) + 0.02, z);
    player.vel.set(dx * STEP_SPEED, 0, dz * STEP_SPEED);
    player.yaw = yaw;
    sound.sfx('whorl-out');
    rides++;
    const first = quickest === null;
    const best = !first && r.t < (quickest as number);
    quickest = first ? r.t : Math.min(quickest as number, r.t);
    fastest = Math.max(fastest, r.top);
    save.touch();
    hud.flash(`down the Whorl in ${r.t.toFixed(1)} s, ${Math.round(r.top * 3.6)} km/h at the fastest${best ? ' · your quickest yet' : ''}${rides > 1 ? ` · ${rides} times down` : ''}`, 5000);
  }

  // Each frame, after you've been moved: you, leaning into the turns on the
  // mat; and off at the bottom.
  game.addSystem({
    name: 'whorl',
    phase: 'update',
    update({ dt }) {
      if (!ride || !built) return;
      if (ride.done) return getOff(true);
      const a = ride.at;
      // in the tube, the camera looks down it
      if (a.inside) player.camPitch += (slope + CAM.pitch - player.camPitch) * (1 - Math.exp(-dt * CAM.tilt));
      const root = player.character.root;
      root.rotation.order = 'YXZ';
      root.rotation.set(a.pitch, a.yaw, a.roll);
      _v.set(0, SEAT_HIPS, 0).applyEuler(root.rotation);
      root.position.set(hips.x - _v.x, hips.y - _v.y, hips.z - _v.z);
      // the mat under you, turned as you are
      _e.set(a.pitch, a.yaw, a.roll, 'YXZ');
      _v.set(0, RIDE.hips, 0).applyEuler(_e);
      built.mat.position.set(hips.x - _v.x, hips.y - _v.y, hips.z - _v.z);
      built.mat.rotation.copy(_e);
      // a knock at each joint
      joints = Math.floor(ride.s / 1.5);
    },
  });

  // ── Being there ────────────────────────────────────────────────────────────
  let topSaid = -Infinity;
  let cue = '';
  game.addSystem({
    name: 'whorl-there',
    phase: 'world',
    update({ time }) {
      const d = Math.hypot(player.pos.x - X, player.pos.z - Z);
      if (d < WANT) look.want();
      if (!built && !building && d < SHOW) standUp();
      else if ((built || building) && d > HIDE) takeDown();
      let now = '';
      if (built && ride) now = `the Whorl · ${Math.round(ride.v * 3.6)} km/h`;
      else if (built && onDeck()) now = `<b>${act.key('slide')}</b> down the Whorl`;
      // up on the top deck: say so, now and then
      if (built && !ride && player.grounded) {
        const [lx, lz] = [player.pos.x - X, player.pos.z - Z];
        const a = apothemOf(lx, lz);
        if (a > TOWER.core && a < TOWER.rampIn && Math.abs(player.pos.y - built.base - TOWER.top) < 0.3 && time - topSaid > TOP_SAID) {
          topSaid = time;
          hud.flash('the top of the Nautilus Lookout Tower, 19 m up · the Whorl starts on the west side', 5000);
        }
      }
      if (now !== cue) {
        cue = now;
        hud.cue(now ? { html: now } : null, 'whorl');
      }
    },
  });
  // what it sounds like, and being shut in the tube
  game.addSystem({
    name: 'whorl-heard',
    phase: 'audio',
    update() {
      heard.on = !!ride;
      heard.v = ride ? ride.v : 0;
      heard.inside = ride && ride.at.inside ? 1 : 0;
      heard.joints = joints;
      if (ride && ride.at.inside) sound.setEnclosed(Math.max(sound.enclosed || 0, SHUT));
    },
  });

  // ── On the map ─────────────────────────────────────────────────────────────
  map.addLayer((pen: Parameters<typeof drawWhorl>[0]) => drawWhorl(pen, [X, Z]));
  const place = () => ({
    id: `${ID}the-whorl`,
    x: foot.x,
    z: foot.z,
    yaw: FOOT.yaw,
    name: 'the Whorl',
    kind: 'slide',
    note: `the longest stainless-steel slide in the US, down the middle of the Nautilus Lookout Tower at Owl Creek Landing, Virginia Beach: up the ramp and down it${rides ? ` · ${rides} time${rides > 1 ? 's' : ''} down, quickest ${(quickest as number).toFixed(1)} s` : ''}`,
    words: 'nautilus lookout tower owl creek landing virginia beach aquarium slide',
    glyph: GLYPH,
    visited: rides > 0,
  });
  map.places.addSource({
    list: 'slides',
    destinations: () => [place()],
    within: (x0: number, z0: number, x1: number, z1: number) => (foot.x >= x0 && foot.x <= x1 && foot.z >= z0 && foot.z <= z1 ? [place()] : []),
    get: (id: string) => (id === place().id ? place() : null),
  });

  // ── Getting there ──────────────────────────────────────────────────────────
  // In your pack: where it is, and how far.
  commands.add({
    id: 'whorl',
    group: 'WANDER',
    label: 'the Whorl: where it is',
    icon: pictures.WHORL,
    run() {
      const d = Math.hypot(player.pos.x - foot.x, player.pos.z - foot.z);
      hud.flash(d < SHOW ? `the Whorl: the foot of the tower's ramp is ${formatDistance(d)} off · up the ramp to the top, and F at the slide's mouth` : `the Whorl is at Owl Creek Landing in Virginia Beach, ${formatDistance(d)} off · it's on the map, under slides`, 6000);
      return true;
    },
  });
  async function go(where: 'top' | 'foot' = 'top') {
    await standUpNow();
    const at = where === 'top' ? { ...mouth, yaw: MOUTH.yaw, y: (built as Tower).base + TOWER.top } : { ...foot, yaw: FOOT.yaw, y: Infinity };
    player.spawn(at.x, at.z, at.yaw, at.yaw + Math.PI, at.y);
    return true;
  }

  game.provide('whorl', {
    go,
    ramp(u: number) {
      if (!built) return null;
      const [x, z] = rampAt(u, (TOWER.rampIn + TOWER.rampOut) / 2);
      return { x: X + x, y: built.base + rampY(u), z: Z + z };
    },
    slide,
    hurry() {
      if (ride) ride.s = Math.max(ride.s, P.open[1] - 6);
    },
    get riding() {
      return ride && { s: ride.s, v: ride.v, t: ride.t, inside: ride.at.inside };
    },
    get built() {
      return built;
    },
    get rides() {
      return rides;
    },
    get quickest() {
      return quickest;
    },
    get fastest() {
      return fastest;
    },
  });
}
