// Washington's Metro, life size, under and over the city where it really
// runs: all six lines, each track of each, every station on them in
// life-size Washington, and its trains, on the clock, to ride.
//
// Its stations' entrances are on the street, each with its brown pylon. Walk
// down the escalators of one and you're on its platform, under the vault;
// at one above the street, the act key (F) takes you up to the platform.
// A train comes in, its doors open: F gets you on, and at the next station,
// off. Up the escalator at the end of the platform (F) is the street again.
//
//   metro.js     (written by the importer) the lines, and the stations with their entrances
//   system.js    (written by the importer; fetched) the tracks, their heights, levels, services
//   network.js   that, read into the world: where along a track, what's there
//   timetable.js where every train is, by the clock on the wall
//   space.js     the platforms, the tunnels and the entrances' wells, as a place to be in
//   look.js      (fetched) the materials, and what builds it all:
//     track.js     tunnels, viaducts, ballast, rails
//     stations.js  vaults, platforms, canopies, escalators; the entrances
//     trains.js    the cars
//     signs.js     the pylons', the platforms' and the trains' signs, the arrival boards
//   sound.js     the trains, their brakes, the door chime, the fans' hum; a platform underfoot
//   onMap.js     the lines and the trains on the map
//   pictures.js  the Metro in your pack
//
// Nothing about it is saved but which train you're on. Nothing about the land
// changes for it: the tunnels go under it, the track stands on it, and the
// forest's plants in the way are hidden as their chunk grows.
//
// From the console:
//   world.metro.stations()          the stations, and their lines
//   await world.metro.go(id)        to a station's entrance, on the street
//   await world.metro.down(id)      onto its platform
//   world.metro.soon()              (to try it out) the next train at the platform you're on, in 5 s
//   world.metro.trains()            the trains drawn now: where, which way, and whether they're standing
//   world.metro.aboard()            the train you're on: its line, where it's going, where it stands, its next stop
//   world.metro.toTrain()           (to try it out) to the nearest open door of a train standing at your platform
//   world.metro.exits()             the feet of the escalators up, on the platforms stood up
//   world.metro.board()             what the boards say on the platform you're on
//   world.metro.stats()             what's stood up, and what's waiting to be

import type { Game } from '../game/game.ts';
import type { Object3D, Material, Color } from 'three';
import { lazy } from '../core/lazy.ts';
import { isNotYet } from '../core/notYet.ts';
import { formatDistance } from '../core/format.js';
import { VEG_STRIDE } from '../world/flora.js';
import { inflate } from '../world/earth.js';
import { setCuts } from '../world/cuts.js';
import { SEAT_HIPS } from '../player/character.js';
import { METRO } from './metro.js';
import { Network, readSystem, pointAt, onLevel, TUNNEL } from './network.js';
import { Timetable, arrivals, TRAIN_LEN, CAR_LEN, CARS } from './timetable.js';
import { MetroSpace } from './space.js';
import { metroSounds } from './sound.js';
import { metroLayer, METRO_GLYPH } from './onMap.js';
import * as pictures from './pictures.js';

type Look = typeof import('./look.js');
type Route = Network['routes'][number];
type Level = Network['levels'][number];
type Station = Network['stations'][number];
type Entrance = Station['entrances'][number];
type Train = InstanceType<Look['MetroTrain']>;
type Mats = ReturnType<Look['makeMaterials']>;

declare module '../game/game.ts' {
  interface Services {
    metro: MetroService;
  }
}
interface MetroService {
  stations(): Array<{ id: string; name: string; lines: string[]; kind: string }>;
  go(id?: string): Promise<boolean>;
  down(id?: string): Promise<boolean>;
  soon(): boolean;
  trains(): Array<{ key: string; line: string; to: string; x: number; y: number; z: number; standing: boolean; at: string | null }>;
  ready(): Promise<unknown>;
  exits(): Array<{ x: number; y: number; z: number; yaw: number; station: string }>;
  board(): Array<{ line: string; cars: number; to: string; min: string | number }> | null;
  toTrain(): boolean;
  stats(): { under: number; over: number; queued: number; waiting: string[]; below: boolean; loaded: boolean };
  aboard(): { line: string; to: string; at: string | null; next: string | null } | null;
}

const NEAR = 1600; // m past the life-size land's edge that the Metro is sent for
const OVER_VIEW = 950; // m: track and stations over the street this near are stood up...
const UNDER_VIEW = 420; // ...and under it, while you're under it
const ENTRANCE_VIEW = 420;
const KEEP = 120; // m further before what's stood up is taken down
const LOOK_EVERY = 0.4; // s between looks round for what to stand up
const TRAIN_VIEW = 800; // m: trains this near are drawn
const TRAINS_MOST = 10;
const HEARD = 4; // trains given a voice at once
const BOARD = 2.6; // m from a car's side that you can get on it
const AT_HAND = 3.2; // m from an entrance's pylon, or the foot of an escalator, that F takes you
const CHANGE = 9; // m from a level's middle that F takes you to another level
const ARRIVE = 7; // m along the platform from the foot of its escalators that you arrive
const ASIDE = 1.1; // ...and across from its middle
const DOWN_AT = 0.62; // how far down an entrance's escalators you're taken down to the platform
const VAULT_PARTS = 4; // a station's vault is built in this many steps
const STATIONS_FIRST = 250; // m nearer than they are that stations are taken to be, to build, under the street
const PIECE = 120; // m of track built and shown together
const CUTS = 4; // entrances whose wells are cut into the ground at once (world/cuts.js)
const CUT_NEAR = 140; // m
const STOOD = 0.05; // m/s: a train slower than this is standing
const SAY = 5200; // ms a sentence stays on the screen
const ENCLOSED = 0.8; // how shut in the station sounds (audio/soundscape.js)
// The lamps the pool of real lights is given (render/lights.js), for what
// moves under the street: along a platform, every `every` m, `up` m over
// it, those within `near` m of the eye; and in each car of a train.
const LAMP = { every: 22, up: 4.2, power: 3.5, range: 22, near: 45, color: [1.0, 0.8, 0.56] };
const CAR_LAMP = { up: 2.2, power: 5, range: 8, decay: 1.4, near: 70, color: [0.86, 0.93, 1.0] };
const BOARDS_EVERY = 1; // s between paintings of the boards near you
const BOARDS_NEAR = 220; // m: the boards this near are kept up to date
// Sitting in a seat: knees together, feet on the floor in front.
const SITTING = { spread: 0.12, hang: 0.48, fwd: 0.38, lean: -0.05, reins: 0 };
// How far (m) the forest's plants are kept back from track over the street.
const PLANTS_OFF: Record<string, number> = { pine: 4.5, broad: 5, birch: 4, bush: 3, fern: 2, rock: 2.5, log: 3 };
const ID = 'metro:';

// (after the caves, the far view and the country, whose say each frame about
// how shut in you sound, how far you see and how hazy the air is the
// Metro's has to come after, underground)
export const after = ['render', 'ui', 'world', 'player', 'audio', 'build', 'map', 'save', 'act', 'caves', 'far', 'country', 'washington'];
export function installMetro(game: Game) {
  const { scene, pipeline, gen, chunks, grass, spaces, solids, landforms, player, builder, map, hud, commands, save, sound, act } = game;
  const card = landforms.cards.find((c: { id: string }) => c.id === METRO.place);
  if (!card) return;
  const [cx, cz] = card.at;
  const look = lazy(() => import('./look.js'));
  const data = lazy(() => import('./system.js'));
  const ground = (x: number, z: number) => gen.height(x, z);
  const lineName = new Map(METRO.lines.map((l: { id: string; name: string }) => [l.id, l.name]));
  let shift = 0; // s added to the clock: only from the console, to try things out
  const clock = () => Date.now() / 1000 + shift;

  // ── Sending for it ─────────────────────────────────────────────────────────
  let net: Network | null = null;
  let space: MetroSpace | null = null;
  let tables: Timetable[] = [];
  let loading: Promise<Network> | null = null;
  // what's over the street of each piece of track, and what's under it
  type Piece = { key: string; t: Network['tracks'][number]; s0: number; s1: number; x: number; z: number; r: number; over: boolean; under: boolean };
  let pieces: Piece[] = [];
  // the stretches of track over the street, by the square they're in, to keep the forest off
  const overGrid = new Map<string, Array<[number, number, number, number]>>();
  const GRID = 64;
  function load(): Promise<Network> {
    if (loading) return loading;
    loading = (async () => {
      if (!landforms.has(METRO.place)) await landforms.ensure(METRO.place);
      const m = await data.ready();
      const sys = await readSystem(m.default, inflate);
      const L = gen.landforms.find((l: { id: string }) => l.id === METRO.place);
      const n = new Network(sys, { at: card.at, offset: L ? L.offset : 0, metro: METRO });
      space = new MetroSpace(n);
      spaces.add(space);
      // each service a fraction of its timetable on from the others
      tables = n.patterns.map((p: Network['patterns'][number], k: number) => new Timetable(p, (k * 0.618034) % 1));
      for (const t of n.tracks) {
        const count = Math.max(1, Math.round(t.length / PIECE));
        for (let p = 0; p < count; p++) {
          const s0 = (t.length * p) / count;
          const s1 = (t.length * (p + 1)) / count;
          let [over, under] = [false, false];
          for (let i = 0; i + 1 < t.n; i++) {
            if (t.s[i + 1] < s0 || t.s[i] > s1) continue;
            if (t.kind[i] === TUNNEL) under = true;
            else over = true;
          }
          const mid = pointAt(t, (s0 + s1) / 2, {});
          pieces.push({ key: `${t.k}#${p}`, t, s0, s1, x: mid.x, z: mid.z, r: (s1 - s0) / 2, over, under });
        }
        for (let i = 0; i + 1 < t.n; i++) {
          if (t.kind[i] === TUNNEL) continue;
          const seg: [number, number, number, number] = [t.x[i], t.z[i], t.x[i + 1], t.z[i + 1]];
          for (let gi = Math.floor((Math.min(seg[0], seg[2]) - 8) / GRID); gi <= Math.floor((Math.max(seg[0], seg[2]) + 8) / GRID); gi++) {
            for (let gj = Math.floor((Math.min(seg[1], seg[3]) - 8) / GRID); gj <= Math.floor((Math.max(seg[1], seg[3]) + 8) / GRID); gj++) {
              const key = `${gi},${gj}`;
              if (!overGrid.has(key)) overGrid.set(key, []);
              overGrid.get(key)!.push(seg);
            }
          }
        }
      }
      net = n;
      // the plants already grown there, and the grass
      for (const ch of chunks.chunks.values()) clearChunk(ch);
      return n;
    })();
    loading.catch(() => {
      loading = null;
    });
    return loading;
  }
  const inReach = (x: number, z: number, more = 0) => Math.hypot(x - cx, z - cz) < card.radius + more;
  // the Metro here, and what builds it
  const ready = async () => {
    await load();
    await look.ready();
  };

  // ── The forest round it ────────────────────────────────────────────────────
  // No tree or bush on the track over the street, and no grass on its ballast.
  function offTrack(x: number, z: number, r: number) {
    const list = overGrid.get(`${Math.floor(x / GRID)},${Math.floor(z / GRID)}`);
    if (!list) return false;
    for (const [ax, az, bx, bz] of list) {
      const ex = bx - ax;
      const ez = bz - az;
      const l2 = ex * ex + ez * ez || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / l2));
      if (Math.hypot(ax + ex * t - x, az + ez * t - z) < r) return true;
    }
    return false;
  }
  function clearChunk(ch: { cx: number; cz: number; vegLists?: Record<string, Float32Array | number[]> }) {
    if (!net || !ch.vegLists) return;
    const S = chunks.size;
    if (!inReach(ch.cx * S + S / 2, ch.cz * S + S / 2, 200)) return;
    for (const kind in ch.vegLists) {
      const list = ch.vegLists[kind];
      const keep = PLANTS_OFF[kind] ?? 3;
      for (let o = 0, k = 0; o < list.length; o += VEG_STRIDE, k++) {
        if (list[o + 4] <= 0) continue;
        if (offTrack(list[o], list[o + 2], keep)) chunks.hideInstance(ch, kind, k);
      }
    }
  }
  chunks.on('vegetation', (ch: Parameters<typeof clearChunk>[0]) => clearChunk(ch));
  grass.addClearing((x0: number, z0: number, x1: number, z1: number) => {
    if (!net || !inReach((x0 + x1) / 2, (z0 + z1) / 2, 100)) return null;
    return (x: number, z: number) => offTrack(x, z, 2.6);
  });
  // a builder's tools go round the track over the street, and the entrances
  builder.obstacles.addSource(
    (x: number, z: number, R: number, out: unknown[]) => {
      if (!net || !inReach(x, z, 100)) return;
      for (const p of pieces) {
        if (!p.over || Math.hypot(p.x - x, p.z - z) > R + p.r + 10) continue;
        const t = p.t;
        for (let i = 0; i < t.n; i++) {
          if (t.s[i] < p.s0 || t.s[i] > p.s1 || (t.kind[Math.min(i, t.n - 2)] === TUNNEL && t.kind[Math.max(0, i - 1)] === TUNNEL)) continue;
          if (Math.hypot(t.x[i] - x, t.z[i] - z) > R + 4) continue;
          out.push({ x: t.x[i], z: t.z[i], what: 'the Metro', dig: 3, wall: 2.8, footing: 3.2, roof: 2.6, grown: true });
        }
      }
      for (const st of net.stations) {
        for (const e of st.entrances) {
          if (Math.hypot(e.x - x, e.z - z) > R + 15) continue;
          out.push({ x: e.x + Math.sin(e.yaw) * 6, z: e.z + Math.cos(e.yaw) * 6, what: 'the Metro entrance', dig: 7, wall: 6.5, footing: 7, roof: 6, grown: true });
        }
      }
    },
    { grown: true },
  );

  // ── Standing it up ─────────────────────────────────────────────────────────
  // Each piece of track, each station's level and each entrance is built
  // a little at a time out of the frame's allowance for work that can wait
  // (game/budget.ts), nearest first, and taken down once you've gone.
  type Board = { show(rows: Array<{ line: string; colour: string; cars: number; to: string; min: string | number }>): void; dispose(): void };
  type Built = { key: string; x: number; z: number; r: number; over: Object3D | null; under: Object3D | null; dispose?: () => void; level?: Level; edges?: Material & { color: Color }; board?: Board | null; spots?: Spot[] };
  type Spot = { x: number; y: number; z: number; yaw: number; level: Level };
  type Want = { key: string; x: number; z: number; r: number; d: number; build: (m: Look) => Built };
  let mats: Mats | null = null;
  let kit: InstanceType<Look['TrainKit']> | null = null;
  const built = new Map<string, Built>();
  let queue: Want[] = [];
  const spots: Spot[] = [];
  const wells = new Map<string, { e: Entrance; station: Station; well: Record<string, number>; cut: Record<string, number> }>();
  let below = false; // under the street, in a station or a tunnel

  const outsideOf = (t: Network['tracks'][number]) => (x: number, z: number, dx: number, dz: number) => {
    // which side of this track has no other track beside it
    const [rx, rz] = [-dz, dx];
    let left = false;
    let right = false;
    for (const o of net!.tracksNear(x, z, 12)) {
      if (o === t) continue;
      for (let i = 0; i < o.n; i += 1) {
        const ox = o.x[i] - x;
        const oz = o.z[i] - z;
        if (Math.abs(ox) > 9 || Math.abs(oz) > 9) continue;
        const c = ox * rx + oz * rz;
        if (Math.abs(ox * dx + oz * dz) > 8) continue;
        if (c > 1.5 && c < 8) right = true;
        if (c < -1.5 && c > -8) left = true;
      }
    }
    return right && !left ? -1 : left && !right ? 1 : left && right ? 0 : 1;
  };
  function wanted(x: number, z: number): Want[] {
    const out: Want[] = [];
    if (!net) return out;
    for (const p of pieces) {
      const d = Math.hypot(p.x - x, p.z - z) - p.r;
      if (!((p.over && d < OVER_VIEW) || (p.under && below && d < UNDER_VIEW))) continue;
      out.push({
        key: p.key,
        x: p.x,
        z: p.z,
        r: p.r,
        d,
        build: (m) => {
          const b = m.buildPiece(p.t, p.s0, p.s1, { ground, outside: outsideOf(p.t), station: (x: number, z: number, y: number) => !!space!.stationAt(x, z, y), mats: mats! });
          return { key: p.key, x: p.x, z: p.z, r: p.r, over: b.over, under: b.under };
        },
      });
    }
    for (const L of net.levels) {
      const under = L.what === 'tunnel';
      const d = Math.hypot(L.x - x, L.z - z) - 100;
      if (!(under ? below && d < UNDER_VIEW : d < OVER_VIEW)) continue;
      out.push({ key: `level:${L.k}`, x: L.x, z: L.z, r: 110, d, build: (m) => buildLevel(m, L) });
      // (its vault a part at a time: a vault is thousands of coffers)
      for (let k = 0; under && k < VAULT_PARTS; k++) {
        const key = `vault:${L.k}:${k}`;
        out.push({ key, x: L.x, z: L.z, r: 110, d: d + 0.01 * (k + 1), build: (m) => ({ key, x: L.x, z: L.z, r: 110, over: null, under: m.buildVault(L, space!.roomOf(L), mats!, k, VAULT_PARTS) }) });
      }
    }
    for (const st of net.stations) {
      for (const e of st.entrances) {
        const d = Math.hypot(e.x - x, e.z - z);
        if (d > ENTRANCE_VIEW) continue;
        out.push({ key: `entrance:${st.k}:${e.i}`, x: e.x, z: e.z, r: 15, d, build: (m) => buildEntrance(m, st, e) });
      }
    }
    return out;
  }
  function buildLevel(m: Look, L: Level): Built {
    const b = m.buildLevel(L, space!.roomOf(L), { ground, mats: mats!, vault: false });
    const under = b.under;
    const key = `level:${L.k}`;
    solids.set(`${ID}${key}`, b.posts);
    const dispose = () => {
      solids.clear(`${ID}${key}`);
      b.edges.dispose();
      b.board?.dispose();
      b.boardMat?.dispose();
    };
    return { key, x: L.x, z: L.z, r: 110, over: under ? null : b.group, under: under ? b.group : null, level: L, edges: b.edges, board: b.board, spots: b.spots, dispose };
  }
  function buildEntrance(m: Look, st: Station, e: Entrance): Built {
    const under = st.kind === 'underground';
    const group = m.buildEntrance(e, st, { ground, mats: mats!, under });
    const key = `entrance:${st.k}:${e.i}`;
    const W = m.ENTRANCE.well;
    let dispose: (() => void) | undefined;
    if (under) {
      const [dx, dz] = [Math.sin(e.yaw), Math.cos(e.yaw)];
      const g0 = ground(e.x, e.z);
      const depth = W.run * W.slope;
      const well = { x: e.x, z: e.z, dx, dz, half: W.half - 0.35, run: W.run, g0, depth, open: 0.45 };
      space!.addWell(well);
      const cut = { ax: e.x - dx * 0.4, az: e.z - dz * 0.4, bx: e.x + dx * W.run, bz: e.z + dz * W.run, fa: g0 - 0.25, fb: g0 - depth - 0.25, w: W.half + 0.05, h: 3.3 };
      wells.set(key, { e, station: st, well, cut });
      // its parapets, to walk round (the top's open: that's the way in)
      const [rx, rz] = [-dz, dx];
      const list = [-1, 1].map((s) => ({ ax: e.x + rx * s * (W.half + 0.15), az: e.z + rz * s * (W.half + 0.15), bx: e.x + dx * W.run + rx * s * (W.half + 0.15), bz: e.z + dz * W.run + rz * s * (W.half + 0.15), r: 0.18, bottom: g0 - 12, topA: g0 + W.wall, topB: g0 + W.wall }));
      list.push({ ax: e.x + dx * (W.run + 0.15) - rx * (W.half + 0.15), az: e.z + dz * (W.run + 0.15) - rz * (W.half + 0.15), bx: e.x + dx * (W.run + 0.15) + rx * (W.half + 0.15), bz: e.z + dz * (W.run + 0.15) + rz * (W.half + 0.15), r: 0.18, bottom: g0 - 12, topA: g0 + W.wall, topB: g0 + W.wall });
      solids.set(`${ID}${key}`, list);
      dispose = () => {
        space!.removeWell(well);
        wells.delete(key);
        solids.clear(`${ID}${key}`);
      };
    }
    return { key, x: e.x, z: e.z, r: 15, over: group, under: null, dispose };
  }
  function show(b: Built) {
    if (b.over) scene.add(b.over);
    if (b.under) {
      b.under.visible = below;
      scene.add(b.under);
    }
    if (b.spots) spots.push(...b.spots);
    built.set(b.key, b);
  }
  function hide(b: Built) {
    for (const o of [b.over, b.under]) {
      if (!o) continue;
      scene.remove(o);
      o.traverse((c: Object3D & { geometry?: { dispose(): void }; isMesh?: boolean }) => {
        if (c.isMesh && c.geometry && !shared.has(c.geometry)) c.geometry.dispose();
      });
    }
    if (b.spots) for (const s of b.spots) spots.splice(spots.indexOf(s), 1);
    b.dispose?.();
    built.delete(b.key);
  }
  const shared = new Set<unknown>();
  // Stood up now, not a little at a time: you're about to be there. (What's
  // wanted round (x, z) that `keep` says.)
  async function standUp(x: number, z: number, keep: (w: Want) => boolean) {
    await ready();
    const m = look.loaded!;
    if (!mats) mats = m.makeMaterials(net!.lines);
    for (const w of wanted(x, z)) {
      if (built.has(w.key) || !keep(w)) continue;
      try {
        show(w.build(m));
      } catch (err) {
        if (!isNotYet(err)) throw err;
      }
    }
  }
  game.budget.add({
    name: 'metro',
    pressing: () => queue.length > 0,
    work(ms: number) {
      const m = look.want();
      if (!m || !net) return false;
      if (!mats) mats = m.makeMaterials(net.lines);
      const t0 = performance.now();
      while (queue.length && performance.now() - t0 < ms) {
        const w = queue.shift()!;
        if (built.has(w.key)) continue;
        try {
          show(w.build(m));
        } catch (err) {
          // (the ground there not in yet: asked again on the next look round)
          if (!isNotYet(err)) throw err;
        }
      }
      return queue.length > 0;
    },
  });

  // ── Where you are in it ───────────────────────────────────────────────────
  const _in = { floor: 0, roof: 0 };
  // The level whose platform (x, z) is on, at feet height y.
  function levelAt(x: number, z: number, y: number): Level | null {
    if (!net || !space || !space.inside(x, z, y, _in)) return null;
    for (const L of net.levels) {
      if (Math.abs(_in.floor - L.floor) > 0.05) continue;
      const o = onLevel(L, x, z, {});
      if (L.platforms.some((p: { c0: number; c1: number; a0: number; a1: number }) => o.c >= p.c0 - 0.2 && o.c <= p.c1 + 0.2 && o.a >= p.a0 - 0.2 && o.a <= p.a1 + 0.2)) return L;
    }
    return null;
  }

  // ── The trains ─────────────────────────────────────────────────────────────
  type Run = { key: string; k: number; j: number; train: Train; w: Record<string, number>; way: number; route: Route | null; chimed: number; v: number; a: number };
  const trains = new Map<string, Run>();
  const spare: Train[] = [];
  const _p: Record<string, number> = {};
  const _q: Record<string, number> = {};
  const where: Record<string, number> = {};
  function placeTrains(t: number) {
    if (!net || !look.loaded) return;
    const m = look.loaded;
    if (!mats) mats = m.makeMaterials(net.lines);
    if (!kit) {
      kit = new m.TrainKit(mats);
      for (const g of [kit.cab, kit.mid]) for (const geo of Object.values(g)) shared.add(geo);
      shared.add(kit.head);
      shared.add(kit.tail);
      shared.add(kit.signPlane);
    }
    const f = game.focus;
    // (nowhere near: none)
    if (!aboard && !inReach(f.x, f.z, TRAIN_VIEW)) {
      for (const [key, r] of trains) {
        scene.remove(r.train.object);
        spare.push(r.train);
        trains.delete(key);
      }
      return;
    }
    const near: Array<{ key: string; k: number; j: number; d: number }> = [];
    for (let k = 0; k < tables.length; k++) {
      const tt = tables[k];
      for (let j = 0; j < tt.trains; j++) {
        const key = `${k}#${j}`;
        const w = tt.where(j, t, where);
        const mine = aboard && aboard.k === k && aboard.j === j;
        if (w.way < 0 && !mine) continue;
        if (w.way < 0) continue;
        const route = tt.pattern.ways[w.way];
        pointAt(route, w.s - TRAIN_LEN / 2, _p);
        const d = Math.hypot(_p.x - f.x, _p.z - f.z);
        if (!mine && d > TRAIN_VIEW) continue;
        // in a tunnel, from end to end, it's only seen from under the street
        if (!mine && !below) {
          const front = pointAt(route, Math.min(route.length, w.s), _q).kind;
          const back = pointAt(route, Math.max(0, w.s - TRAIN_LEN), _q).kind;
          if (front === TUNNEL && back === TUNNEL && _p.kind === TUNNEL) continue;
        }
        near.push({ key, k, j, d: mine ? -1 : d });
      }
    }
    near.sort((a, b) => a.d - b.d);
    const want = new Set(near.slice(0, TRAINS_MOST).map((n) => n.key));
    for (const [key, r] of trains) {
      if (want.has(key)) continue;
      scene.remove(r.train.object);
      spare.push(r.train);
      trains.delete(key);
    }
    for (const n of near.slice(0, TRAINS_MOST)) {
      let r = trains.get(n.key);
      if (!r) {
        const train = spare.pop() || new m.MetroTrain(kit!);
        scene.add(train.object);
        r = { key: n.key, k: n.k, j: n.j, train, w: {}, way: -1, route: null, chimed: -1, v: 0, a: 0 };
        trains.set(n.key, r);
      }
      const tt = tables[n.k];
      const was = r.w.v ?? 0;
      tt.where(n.j, t, r.w);
      r.a = (r.w.v - was) / Math.max(1e-3, game.frame.dt || 0.016);
      r.way = r.w.way;
      r.route = tt.pattern.ways[r.way];
      const line = tt.pattern.line;
      r.train.show(line.colour, line.name.replace(/ Line$/, ''), r.route!.to);
      r.train.place(r.route, r.w.s);
    }
  }
  game.addSystem({ name: 'metro-trains', phase: 'input', update: () => placeTrains(clock()) });

  // ── Light ──────────────────────────────────────────────────────────────────
  // Under the street no daylight gets in (space.js), and the station's vault
  // and platforms carry the light their lamps put on them (look.js). What
  // moves through it is lit by lamps the pool of real lights gives to the
  // nearest (render/lights.js): along each platform, the warm light come
  // down off the vault; and in each car of a train, its own, which spills
  // out of its windows onto the walls of the tunnel it's going through and
  // the edge of a platform as it comes in.
  type Lamp = { x: number; y: number; z: number; color: number[]; power: number; range: number; decay: number; shadow: boolean };
  const lampsAt = new Map<Level, Lamp[]>();
  function lampsOf(L: Level): Lamp[] {
    let list = lampsAt.get(L);
    if (list) return list;
    list = [];
    for (const p of L.platforms) {
      const c = (p.c0 + p.c1) / 2;
      for (let a = p.a0 + LAMP.every / 2; a < p.a1; a += LAMP.every) {
        const x = L.x + L.dx * a - L.dz * c;
        const z = L.z + L.dz * a + L.dx * c;
        list.push({ x, y: L.floor + LAMP.up, z, color: LAMP.color, power: LAMP.power, range: LAMP.range, decay: 1, shadow: false });
      }
    }
    lampsAt.set(L, list);
    return list;
  }
  const carLamps: Lamp[] = [];
  game.lights.addSource(scene, (eye: { x: number; y: number; z: number }, out: object[]) => {
    if (!net || !below) return;
    for (const b of built.values()) {
      const L = b.level;
      if (!L || L.what !== 'tunnel' || Math.abs(L.x - eye.x) > LAMP.near + 100 || Math.abs(L.z - eye.z) > LAMP.near + 100) continue;
      for (const l of lampsOf(L)) if (Math.abs(l.x - eye.x) < LAMP.near && Math.abs(l.z - eye.z) < LAMP.near && Math.abs(l.y - eye.y) < 12) out.push(l);
    }
    let k = 0;
    for (const r of trains.values()) {
      for (const car of r.train.cars) {
        const p = car.group.position;
        if (!car.group.visible || Math.abs(p.x - eye.x) > CAR_LAMP.near || Math.abs(p.z - eye.z) > CAR_LAMP.near) continue;
        const l = carLamps[k] || (carLamps[k] = { x: 0, y: 0, z: 0, color: CAR_LAMP.color, power: CAR_LAMP.power, range: CAR_LAMP.range, decay: CAR_LAMP.decay, shadow: false });
        l.x = p.x;
        l.y = p.y + CAR_LAMP.up;
        l.z = p.z;
        out.push(l);
        k++;
      }
    }
  });

  // ── The boards over the platforms ──────────────────────────────────────────
  // (repainted every so often, at the levels near you, with timetable.js's arrivals)
  let boardsIn = 0;

  // ── Riding ─────────────────────────────────────────────────────────────────
  let aboard: { k: number; j: number; car: number; seat: number } | null = null;
  let hold: { release(): void } | null = null;
  builder.idleWhile(() => aboard !== null);
  const _seat = { x: 0, y: 0, z: 0, yaw: 0 };
  const seatPlace = {
    place(out: { x: number; y: number; z: number; yaw: number; behind?: number; back?: number }) {
      const r = aboard && trains.get(`${aboard.k}#${aboard.j}`);
      if (!r) {
        out.x = player.pos.x;
        out.y = player.pos.y;
        out.z = player.pos.z;
        out.yaw = player.yaw;
        return;
      }
      r.train.seat(aboard!.car, aboard!.seat, _seat);
      out.x = _seat.x;
      out.y = _seat.y - SEAT_HIPS;
      out.z = _seat.z;
      out.yaw = _seat.yaw;
    },
  };
  const runOf = () => (aboard ? trains.get(`${aboard.k}#${aboard.j}`) || null : null);
  const stopOf = (r: Run, k: number) => (r.route && k >= 0 ? r.route.stops[k] : null);
  function board(r: Run, car: number, seat: number) {
    const taken = player.rides.take({
      by: 'metro',
      what: 'the train',
      aboard: seatPlace,
      lost() {
        aboard = hold = null;
        player.character.seat(null);
        hud.cue(null, 'metro');
        save.touch();
      },
    });
    if (!taken) return void hud.flash(player.rides.why());
    hold = taken;
    aboard = { k: r.k, j: r.j, car, seat };
    player.vel.set(0, 0, 0);
    player.character.seat(SITTING);
    const next = stopOf(r, r.w.at >= 0 ? r.w.at + 1 : r.w.next);
    hud.flash(`aboard, the ${r.route!.line.name} to ${r.route!.to}${next ? ` · next: ${next.level.station.name}` : ''}`, SAY);
    save.touch();
  }
  // Off the train: onto the platform beside its doors.
  function leave(r: Run | null = runOf()): boolean {
    if (!aboard) return false;
    const at = r && r.w.at >= 0 && r.w.v < STOOD ? stopOf(r, r.w.at) : null;
    if (r && !at) {
      const next = stopOf(r, r.w.next);
      hud.flash(next ? `next: ${next.level.station.name}, in ${when(r.w.due)} · get off there` : 'wait for the next station', SAY);
      return false;
    }
    const was = aboard;
    aboard = null;
    hold?.release();
    hold = null;
    player.character.seat(null);
    player.vel.set(0, 0, 0);
    hud.cue(null, 'metro');
    if (r && at) {
      // the door of the car you were in that opens onto a platform
      const L = at.level;
      for (const d of r.train.doors(was.car)) {
        if (!space!.inside(d.x, d.z, L.floor + 0.2, _in) || Math.abs(_in.floor - L.floor) > 0.05) continue;
        const yaw = Math.atan2(d.x - (r.train.cars[was.car].group.position.x as number), d.z - (r.train.cars[was.car].group.position.z as number));
        player.spawn(d.x, d.z, yaw, yaw + Math.PI, L.floor);
        break;
      }
      hud.flash(`${L.station.name}`, 2500);
    }
    save.touch();
    return true;
  }
  // The car you could get into from where you are, and the seat nearest you in it.
  function carNear(): { r: Run; car: number; seat: number; d: number } | null {
    const p = player.pos;
    let best: { r: Run; car: number; seat: number; d: number } | null = null;
    for (const r of trains.values()) {
      if (r.w.at < 0) continue;
      for (let c = 0; c < CARS; c++) {
        const g = r.train.cars[c].group;
        if (!g.visible || Math.abs(g.position.y - p.y) > 3) continue;
        const yaw = g.rotation.y;
        const [fx, fz] = [Math.sin(yaw), Math.cos(yaw)];
        const dx = p.x - g.position.x;
        const dz = p.z - g.position.z;
        const along = Math.max(0, Math.abs(dx * fx + dz * fz) - CAR_LEN / 2);
        const across = Math.max(0, Math.abs(dx * fz - dz * fx) - 1.6);
        const d = Math.hypot(along, across);
        if (d < BOARD && (!best || d < best.d)) best = { r, car: c, seat: 0, d };
      }
    }
    if (!best) return null;
    let sd = Infinity;
    const m = look.loaded!;
    for (let k = 0; k < m.SEATS.length; k++) {
      best.r.train.seat(best.car, k, _seat);
      const d = Math.hypot(_seat.x - p.x, _seat.z - p.z);
      if (d < sd) [sd, best.seat] = [d, k];
    }
    return best;
  }
  const when = (s: number) => (s < 60 ? `${Math.max(1, Math.round(s))} s` : `${Math.round(s / 60)} min`);

  // ── Down and up: the entrances and the escalators ──────────────────────────
  // Onto a station's platform: the level nearest the entrance (or `to`), at
  // the foot of its escalator, looking along it.
  async function descend(st: Station, from: { x: number; z: number } | null, to: Level | null = null) {
    if (!player.rides.free) return void hud.flash(player.rides.why());
    await ready();
    let L = to;
    if (!L) {
      L = st.levels[0];
      if (from) for (const l of st.levels) if (Math.hypot(l.x - from.x, l.z - from.z) < Math.hypot(L!.x - from.x, L!.z - from.z)) L = l;
    }
    const lvl = L!;
    if (lvl.what === 'tunnel') below = true;
    await standUp(lvl.x, lvl.z, (w) => w.key === `level:${lvl.k}` || w.d < 160);
    const b = built.get(`level:${lvl.k}`);
    const spot = b?.spots?.[0];
    const plat = lvl.platforms[0];
    const at = spot || { x: lvl.x + lvl.dx * (plat.a0 + plat.a1) / 2, z: lvl.z + lvl.dz * (plat.a0 + plat.a1) / 2, y: lvl.floor, yaw: Math.atan2(lvl.dx, lvl.dz) };
    // (a few steps on from the foot of the escalators, facing along the
    // platform, the camera behind you)
    const yaw = at.yaw + Math.PI;
    // (and a step to the side of the platform's middle, where its pylons stand)
    const x = at.x - Math.sin(at.yaw) * ARRIVE + Math.cos(at.yaw) * ASIDE;
    const z = at.z - Math.cos(at.yaw) * ARRIVE - Math.sin(at.yaw) * ASIDE;
    player.camPitch = 0.08;
    player.spawn(x, z, yaw, yaw + Math.PI, lvl.floor);
    reached.add(st.id);
    hud.flash(`${st.name} · ${dueText(lvl)}`, SAY);
    save.touch();
  }
  // Up to the street, at the entrance nearest where you are.
  function ascend(st: Station) {
    const p = player.pos;
    let e = st.entrances[0];
    for (const o of st.entrances) if (Math.hypot(o.x - p.x, o.z - p.z) < Math.hypot(e.x - p.x, e.z - p.z)) e = o;
    const [dx, dz] = [Math.sin(e.yaw), Math.cos(e.yaw)];
    const x = e.x - dx * 1.6;
    const z = e.z - dz * 1.6;
    below = false;
    player.camPitch = 0.1;
    player.spawn(x, z, e.yaw + Math.PI, e.yaw, Infinity);
    hud.flash(`${st.name}${e.street ? ` · ${e.street}` : ''}`, 3500);
  }
  // when the next trains are due at a level, each way
  function dueText(L: Level) {
    const t = clock();
    const out: string[] = [];
    for (let k = 0; k < tables.length; k++) {
      const due = tables[k].due(L, t);
      due.forEach((d: { wait: number } | null, w: number) => {
        if (!d) return;
        const route = tables[k].pattern.ways[w];
        out.push(`${route.line.name.replace(/ Line$/, '')} to ${route.to}: ${d.wait < 1 ? 'in now' : when(d.wait)}`);
      });
    }
    // the soonest few, once each
    return [...new Set(out)].slice(0, 4).join(' · ');
  }
  const reached = new Set<string>();

  act.offer({
    id: 'metro-train',
    at() {
      if (aboard) return { d: 0, word: 'get off', run: () => leave(), icon: pictures.PYLON };
      if (!net || !below || !player.rides.free || !look.loaded) return null;
      const c = carNear();
      if (!c) return null;
      return { d: c.d, word: 'get on', run: () => (c.r.w.v < STOOD && c.r.w.leaves > 1 ? board(c.r, c.car, c.seat) : hud.flash('wait for it to stop at the platform')), icon: pictures.PYLON };
    },
  });
  act.offer({
    id: 'metro-entrance',
    at() {
      if (!net || aboard || below) return null;
      const p = player.pos;
      let best: { d: number; st: Station; e: Entrance } | null = null;
      for (const st of net.stations) {
        for (const e of st.entrances) {
          if (Math.abs(e.x - p.x) > 8 || Math.abs(e.z - p.z) > 8) continue;
          const d = Math.hypot(e.x - p.x, e.z - p.z);
          if (d < AT_HAND + 1.5 && (!best || d < best.d)) best = { d, st, e };
        }
      }
      if (!best) return null;
      const { st, e } = best;
      const word = st.kind === 'underground' ? 'down to the trains' : st.kind === 'elevated' ? 'up to the trains' : 'onto the platform';
      return { d: Math.max(0, best.d - 1.5), word, run: () => descend(st, e), icon: pictures.PYLON };
    },
  });
  act.offer({
    id: 'metro-exit',
    at() {
      if (!net || aboard) return null;
      const p = player.pos;
      let best: { d: number; s: Spot } | null = null;
      for (const s of spots) {
        if (Math.abs(s.y - p.y) > 1.5) continue;
        const d = Math.hypot(s.x - p.x, s.z - p.z);
        if (d < AT_HAND && (!best || d < best.d)) best = { d, s };
      }
      if (!best) return null;
      const L = best.s.level;
      const word = L.what === 'tunnel' ? 'up to the street' : L.what === 'bridge' ? 'down to the street' : 'out to the street';
      return { d: best.d, word, run: () => ascend(L.station), icon: pictures.PYLON };
    },
  });
  act.offer({
    id: 'metro-change',
    at() {
      if (!net || aboard) return null;
      const p = player.pos;
      const L = levelAt(p.x, p.z, p.y + 0.05);
      if (!L || L.station.levels.length < 2) return null;
      const o = onLevel(L, p.x, p.z, {});
      if (Math.abs(o.a) > CHANGE) return null;
      const other = L.station.levels.find((l: Level) => l !== L)!;
      const lines = other.lines.map((id: string) => (lineName.get(id) || id).replace(/ Line$/, '')).join(', ');
      return { d: Math.abs(o.a) * 0.3, word: `change to the ${lines}`, run: () => descend(L.station, null, other), icon: pictures.PYLON };
    },
  });

  // ── On the map ─────────────────────────────────────────────────────────────
  const placeOf = (st: (typeof METRO.stations)[number]) => {
    const [ex, ez, yaw] = st.entrances[0] as number[];
    // (back from its pylon, facing it)
    const x = cx + ex - Math.sin(yaw) * 3.5;
    const z = cz + ez - Math.cos(yaw) * 3.5;
    return {
      id: `${ID}${st.id}`,
      x,
      z,
      yaw,
      name: st.name,
      kind: 'Metro station',
      note: `${st.lines.map((id) => (lineName.get(id) || id).replace(/ Line$/, '')).join(', ')} · ${st.kind}${reached.has(st.id) ? ' · been' : ''}`,
      words: `metro subway station washington dc ${st.lines.join(' ')}`,
      glyph: METRO_GLYPH,
      visited: reached.has(st.id),
    };
  };
  const allPlaces = () => METRO.stations.map(placeOf);
  map.places.addSource({
    list: 'metro',
    destinations: allPlaces,
    within: (x0: number, z0: number, x1: number, z1: number) => allPlaces().filter((p: { x: number; z: number }) => p.x >= x0 && p.x <= x1 && p.z >= z0 && p.z <= z1),
    get: (id: string) => allPlaces().find((p: { id: string }) => p.id === id) || null,
  });
  // the lines, each along the longest of its services' ways; and the trains
  let mapLines: Array<{ colour: string; k: number; pts: number[] }> | null = null;
  map.addLayer(
    metroLayer(() => {
      if (!net) return null;
      if (!mapLines) {
        mapLines = [];
        for (const line of net.lines) {
          const routes = net.routes.filter((r: Route) => r.line === line);
          if (!routes.length) continue;
          const r = routes.reduce((a: Route, b: Route) => (b.length > a.length ? b : a));
          const pts: number[] = [];
          for (let i = 0; i < r.n; i++) pts.push(r.x[i], r.z[i]);
          mapLines.push({ colour: line.colour, k: line.index, pts });
        }
      }
      const t = clock();
      const marks: Array<{ x: number; z: number; dx: number; dz: number; len: number; colour: string }> = [];
      for (const tt of tables) {
        for (let j = 0; j < tt.trains; j++) {
          const w = tt.where(j, t, where);
          if (w.way < 0) continue;
          const p = pointAt(tt.pattern.ways[w.way], w.s - TRAIN_LEN / 2, {});
          marks.push({ x: p.x, z: p.z, dx: p.dx, dz: p.dz, len: TRAIN_LEN, colour: tt.pattern.line.colour });
        }
      }
      return { lines: mapLines, trains: marks };
    }),
  );

  // ── In your pack ───────────────────────────────────────────────────────────
  commands.add({
    id: 'metro',
    group: 'WASHINGTON',
    label: 'Metro: the nearest station',
    icon: pictures.PYLON,
    run() {
      const p = player.pos;
      let best = METRO.stations[0];
      let bd = Infinity;
      for (const st of METRO.stations) {
        for (const [ex, ez] of st.entrances as number[][]) {
          const d = Math.hypot(cx + ex - p.x, cz + ez - p.z);
          if (d < bd) [best, bd] = [st, d];
        }
      }
      const lines = best.lines.map((id: string) => (lineName.get(id) || id).replace(/ Line$/, '')).join(', ');
      hud.flash(inReach(p.x, p.z) ? `the nearest Metro station is ${best.name} (${lines}), ${formatDistance(bd)} off · the stations are on the map, under metro` : `the Metro runs under Washington, DC, ${formatDistance(bd)} off · its stations are on the map, under metro`, 6000);
      return true;
    },
  });

  // ── Sound ──────────────────────────────────────────────────────────────────
  const heard = { heard: [] as Array<{ id: string; x: number; y: number; z: number; v: number; a: number }>, chimes: [] as Array<{ id: string }>, below: false };
  sound.addLayer(metroSounds(heard));

  // ── Saving: which train you're on ─────────────────────────────────────────
  let pending: { k: number; j: number; car: number; seat: number } | null = null;
  save.register({
    id: 'metro',
    scope: 'yours',
    collect: () => (aboard ? { ...aboard } : null),
    validate: (r: Record<string, unknown> | null) => (r && [r.k, r.j, r.car, r.seat].every((v) => Number.isInteger(v) && (v as number) >= 0) && (r.car as number) < CARS ? r : null),
    restore(r: { k: number; j: number; car: number; seat: number } | null) {
      pending = r;
      // left in the Metro (or on a train in it): it has to be here to be stood in
      const a = player.arrival;
      if (a && inReach(a.x, a.z, 200) && (r || Number.isFinite(a.y))) {
        game.beforeArrival(
          (async () => {
            await ready();
            if (r && r.k < tables.length && r.j < tables[r.k].trains) {
              // the train has gone on without you: you open where it is now
              const w = tables[r.k].where(r.j, clock(), {});
              if (w.way >= 0) {
                const p = pointAt(tables[r.k].pattern.ways[w.way], w.s - TRAIN_LEN / 2, {});
                player.arrival = { x: p.x, z: p.z, y: p.y + 1.2, yaw: Math.atan2(p.dx, p.dz) };
                below = p.kind === TUNNEL;
              } else pending = null;
            } else if (Number.isFinite(a.y) && a.y! < ground(a.x, a.z) - 3) below = true;
            const at = player.arrival!;
            if (below) await standUp(at.x, at.z, (w) => w.d < 160);
          })(),
        );
      }
    },
  });
  game.on('ready', () => {
    const r = pending;
    pending = null;
    if (!r || !net) return;
    placeTrains(clock());
    const run = trains.get(`${r.k}#${r.j}`);
    if (run) board(run, r.car, r.seat);
  });

  // ── Each frame ─────────────────────────────────────────────────────────────
  let lookIn = 0;
  let cutsShown = false;
  let lastBelow = false;
  game.addSystem({
    name: 'metro',
    phase: 'world',
    update({ dt, now }) {
      const p = player.pos;
      const f = game.focus;
      if (!net) {
        if (inReach(f.x, f.z, NEAR) && !loading) load().catch(() => {});
        return;
      }
      // under the street: in a station or a tunnel, or on a train in one
      const r = runOf();
      const was = below;
      if (r && r.route) below = pointAt(r.route, r.w.s - TRAIN_LEN / 2, _q).kind === TUNNEL || (levelAt(p.x, p.z, p.y + 0.05)?.what === 'tunnel');
      else if (player.space === space) {
        const L = levelAt(p.x, p.z, p.y + 0.05);
        below = L ? L.what === 'tunnel' : p.y < ground(p.x, p.z) - 3;
      } else below = false;
      if (below !== was || below !== lastBelow) {
        lastBelow = below;
        for (const b of built.values()) if (b.under) b.under.visible = below;
        lookIn = 0;
      }
      // (how shut in it sounds is the station's to say, not the dark's)
      if (below) sound.setEnclosed(ENCLOSED);
      // underground, no daylight haze in the air, and nothing lost in the
      // distance (back up, the country eases its own haze back in)
      if (below) {
        pipeline.haze = 0;
        pipeline.fogFar = 1e5;
      }

      // what's stood up round you
      lookIn -= dt;
      if (lookIn <= 0 && inReach(f.x, f.z, OVER_VIEW + KEEP)) {
        lookIn = LOOK_EVERY;
        if (!look.want()) return;
        const want = wanted(f.x, f.z);
        // nearest first; and on a train, what's ahead of it before what's behind
        const run = runOf();
        if (run) {
          const g = run.train.cars[0].group;
          const [fx, fz] = [Math.sin(g.rotation.y), Math.cos(g.rotation.y)];
          for (const w of want) {
            const l = Math.hypot(w.x - f.x, w.z - f.z) || 1;
            w.d *= 1.2 - 0.6 * (((w.x - f.x) * fx + (w.z - f.z) * fz) / l);
          }
        }
        // (and under the street, the stations before the tunnels between them:
        // a train gets to the next one sooner than you'd see down a tunnel)
        if (below) for (const w of want) if (w.key.startsWith('level:') || w.key.startsWith('vault:')) w.d -= STATIONS_FIRST;
        queue = want.filter((w) => !built.has(w.key)).sort((a, b) => a.d - b.d);
        const keys = new Set(want.map((w) => w.key));
        for (const b of [...built.values()]) {
          if (keys.has(b.key)) continue;
          if (Math.hypot(b.x - f.x, b.z - f.z) - b.r > (b.under && !b.over ? UNDER_VIEW : OVER_VIEW) + KEEP || (b.under && !b.over && !below)) hide(b);
        }
      } else if (lookIn <= 0 && built.size) {
        for (const b of [...built.values()]) hide(b);
        queue = [];
      }

      // walked down an entrance's escalators far enough: onto the platform
      if (!aboard && player.space === space) {
        for (const w of wells.values()) {
          const ox = p.x - w.well.x;
          const oz = p.z - w.well.z;
          const along = ox * w.well.dx + oz * w.well.dz;
          if (along > w.well.run * DOWN_AT && along < w.well.run && Math.abs(-ox * w.well.dz + oz * w.well.dx) < w.well.half + 0.2) {
            descend(w.station, w.e).catch(() => {});
            break;
          }
        }
      }
      // the nearest wells, cut into the ground (and the street's paving)
      const near = [...wells.values()].map((w) => ({ w, d: Math.hypot(w.e.x - p.x, w.e.z - p.z) })).filter((o) => o.d < CUT_NEAR).sort((a, b) => a.d - b.d).slice(0, CUTS);
      if (near.length) {
        setCuts(near.map((o) => o.w.cut), 'metro');
        cutsShown = true;
      } else if (cutsShown) {
        setCuts([], 'metro');
        cutsShown = false;
      }

      // the boards: when the next trains come, at the levels near you
      boardsIn -= dt;
      if (boardsIn <= 0) {
        boardsIn = BOARDS_EVERY;
        const t = clock();
        for (const b of built.values()) {
          if (!b.board || !b.level || Math.hypot(b.level.x - f.x, b.level.z - f.z) > BOARDS_NEAR) continue;
          b.board.show(arrivals(tables, b.level, t));
        }
      }

      // the trains: their sounds, the chime as their doors close, the lights along the platform's edge flashing as one comes in
      heard.heard.length = 0;
      heard.below = below;
      const list = [...trains.values()].map((r) => ({ r, d: Math.hypot(r.train.cars[2].group.position.x - p.x, r.train.cars[2].group.position.z - p.z) })).sort((a, b) => a.d - b.d);
      for (const { r } of list.slice(0, HEARD)) {
        const g = r.train.cars[2].group.position;
        heard.heard.push({ id: r.key, x: g.x, y: g.y, z: g.z, v: r.w.v, a: r.a });
        if (r.w.at >= 0 && r.w.leaves < 3 && r.chimed !== r.w.at) {
          r.chimed = r.w.at;
          heard.chimes.push({ id: r.key });
        }
        if (r.w.at < 0) r.chimed = -1;
      }
      const flash = Math.sin(now * 0.008) > 0;
      for (const b of built.values()) {
        if (!b.edges || !b.level) continue;
        let coming = false;
        for (const r of trains.values()) {
          if (r.w.at >= 0 || !r.route) continue;
          const stop = r.route.stops[r.w.next];
          if (stop && stop.level === b.level && r.w.due < 18) coming = true;
        }
        b.edges.color.setScalar(coming ? (flash ? 1.2 : 0.12) : 0.3);
      }

      // aboard: where it goes next, and off at the end of the line here
      if (aboard) {
        const run = runOf();
        // (it ran on out past life-size Washington before you got off, the
        // frame that it pulled out of its last station here being a slow one:
        // you got off there after all)
        if (!run || !run.route || (run.w.at < 0 && run.w.next < 0)) {
          const way = run?.route || tables[aboard.k].pattern.ways[0];
          const last = way.stops[way.stops.length - 1];
          aboard = null;
          hold?.release();
          hold = null;
          player.character.seat(null);
          hud.cue(null, 'metro');
          descend(last.level.station, null, last.level).catch(() => {});
          return;
        }
        const w = run.w;
        const stop = stopOf(run, w.at >= 0 ? w.at : w.next);
        const line = run.route.line.name;
        if (w.at >= 0 && stop) {
          const last = w.at === run.route.stops.length - 1;
          if (last && w.leaves < 1.5) {
            // its last stop here: it goes on past life-size Washington, or turns back
            const goes = run.route.after > 60;
            leave(run);
            hud.flash(goes ? `the ${line} goes on to ${run.route.to} from here, past life-size Washington: everyone off` : `${run.route.to}: the end of the line · everyone off`, SAY);
            return;
          }
          hud.cue({ html: `${stop.level.station.name} · the ${line} to ${run.route.to} · ${act.key('get off')} to get off · leaving in ${when(w.leaves)}` }, 'metro');
        } else if (stop) hud.cue({ html: `the ${line} to ${run.route.to} · next: ${stop.level.station.name}, in ${when(w.due)}` }, 'metro');
      }
    },
  });

  game.provide('metro', {
    stations: () => METRO.stations.map((st: { id: string; name: string; lines: string[]; kind: string }) => ({ id: st.id, name: st.name, lines: st.lines, kind: st.kind })),
    async go(id = 'metro-center') {
      const st = METRO.stations.find((s: { id: string }) => s.id === id || `${ID}${s.id}` === id);
      if (!st) throw new Error(`no station called ${id}: try world.metro.stations()`);
      const p = placeOf(st);
      await (game.api.teleport as (x: number, z: number, yaw?: number) => Promise<void>)(p.x, p.z, p.yaw);
      await ready();
      return true;
    },
    async down(id?: string) {
      await ready();
      const p = player.pos;
      let st: Station | null = id ? net!.station(id.replace(ID, '')) : null;
      if (!st) {
        let bd = Infinity;
        for (const s of net!.stations) {
          const d = Math.hypot(s.levels[0].x - p.x, s.levels[0].z - p.z);
          if (d < bd) [bd, st] = [d, s];
        }
      }
      if (!st) return false;
      await descend(st, st.entrances[0]);
      return true;
    },
    soon() {
      const p = player.pos;
      const L = levelAt(p.x, p.z, p.y + 0.05);
      if (!L) return false;
      const t = clock();
      let best = Infinity;
      for (const tt of tables) for (const d of tt.due(L, t)) if (d && d.wait > 0) best = Math.min(best, d.wait);
      if (!Number.isFinite(best)) return false;
      shift += best - 5;
      return true;
    },
    trains: () =>
      [...trains.values()].map((r) => {
        const g = r.train.cars[0].group.position;
        const stop = stopOf(r, r.w.at);
        return { key: r.key, line: r.route ? r.route.line.id : '', to: r.route ? r.route.to : '', x: g.x, y: g.y, z: g.z, standing: r.w.at >= 0 && r.w.v < STOOD, at: stop ? stop.level.station.id : null };
      }),
    ready,
    exits: () => spots.map((s) => ({ x: s.x, y: s.y, z: s.z, yaw: s.yaw, station: s.level.station.id })),
    board() {
      const p = player.pos;
      const L = levelAt(p.x, p.z, p.y + 0.05);
      return L ? arrivals(tables, L, clock()).map(({ line, cars, to, min }) => ({ line, cars, to, min })) : null;
    },
    stats() {
      let under = 0;
      let over = 0;
      for (const b of built.values()) {
        if (b.under) under++;
        if (b.over) over++;
      }
      return { under, over, queued: queue.length, waiting: queue.slice(0, 6).map((w) => w.key), below, loaded: !!net };
    },
    toTrain() {
      // the nearest door of a train standing at your platform, and stand by it
      const p = player.pos;
      let best: { x: number; z: number; yaw: number; d: number } | null = null;
      for (const r of trains.values()) {
        if (r.w.at < 0 || r.w.v >= STOOD) continue;
        for (let c = 0; c < CARS; c++) {
          const g = r.train.cars[c].group.position;
          for (const d of r.train.doors(c)) {
            if (!space!.inside(d.x, d.z, p.y + 0.2, _in) || Math.abs(_in.floor - p.y) > 0.3) continue;
            const dist = Math.hypot(d.x - p.x, d.z - p.z);
            if (!best || dist < best.d) best = { x: d.x, z: d.z, yaw: Math.atan2(g.x - d.x, g.z - d.z), d: dist };
          }
        }
      }
      if (!best) return false;
      player.spawn(best.x, best.z, best.yaw, best.yaw + Math.PI, p.y);
      return true;
    },
    aboard() {
      const r = runOf();
      if (!r || !r.route) return null;
      const at = stopOf(r, r.w.at);
      const next = stopOf(r, r.w.at >= 0 ? r.w.at + 1 : r.w.next);
      return { line: r.route.line.id, to: r.route.to, at: at ? at.level.station.id : null, next: next ? next.level.station.id : null };
    },
  });
}
