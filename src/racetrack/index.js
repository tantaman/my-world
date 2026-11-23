// Race tracks: some of the towns people live in have one out past their
// last houses, a dirt oval by a western town and a road circuit by a
// village (tracks.js, site.js). Your car waits on the pit apron. Get in, and
// you're on the back of the grid with five others; when the lights go out,
// it's three laps, and whoever's first over the line wins.
//
//   layouts.js   the circuits, and where along the lap a point is
//   site.js      where the tracks are, grown from the seed and the land, and
//                how the racing surface lies on it
//   tracks.js    which towns have one, and finding where, a little at a time
//   car.js       how the car goes, stops, turns and slides
//   race.js      the lights, the laps, and the others driving themselves
//   look.js      the track: its surface, kerbs, barrier, gantry, grandstand, pits
//   model.js     the cars
//   board.js     the race on the screen: the card, the speed, a little map
//   sound.js     engines, tyres, the crowd, the lights
//
// While you drive, the car moves you (player.aboard), you sit in it
// (Character.seat), and the tools are put away (builder.idleWhile). The
// nearest track is the one that's stood up, as with the video store. Which
// tracks you've been to, your best lap at each, and how many races you've
// run and won are yours, saved; where the others are isn't saved or shared.
//
// From the console:
//   world.racetrack.tracks        the tracks: forTown(town), byId(id), within(box)
//   world.racetrack.site          the one stood up, or last near
//   await world.racetrack.go(id?) stand at its paddock gate (that one's, or the nearest's)
//   world.racetrack.toCar()       stand by your car
//   world.racetrack.drive()       into it, and the race begins
//   world.racetrack.out()         out of it
//   world.racetrack.state()       how the race is going

import * as THREE from 'three';
import { Tracks, layoutFor } from './tracks.js';
import { clearOf, surfaceAt, surfaceOf, onGrounds, paddockOf, PADDOCK, BANK } from './site.js';
import { circuitOf, LAYOUTS, KERB } from './layouts.js';
import { Car, CAR } from './car.js';
import { Race, RACE, bump } from './race.js';
import { buildTrack, mapShapes } from './look.js';
import { makeCar } from './model.js';
import { Board, clock, ordinal } from './board.js';
import { raceSounds } from './sound.js';
import { Drivers } from './others.js';
import { RING as CLUB_RING, PLAN as CLUB_PLAN } from '../huntclub/site.js';
import { toWorld, toLocal, planDiscs } from '../world/frame.js';
import { VEG_STRIDE } from '../world/flora.js';
import { SEAT_HIPS } from '../player/character.js';
import { GridNearest } from '../core/nearest.js';
import { formatDistance } from '../core/format.js';
import { rayBox } from '../core/geom.js';
import { airfieldsOver } from '../airports/airports.js';

const SHOW = 650; // m: the nearest track is stood up this close...
const HIDE = 800; // ...and taken down past this
const NEAREST_AFTER = 0.5; // s between looks for the nearest track
const SWAP_NEARER = 150; // m nearer another track must be to take the place of one that's stood up
const PREFETCH = 2500; // m round you within which tracks are looked for ahead of time
// The hunt club is somewhere in a ring round the start: a track keeps out of
// all of it, wherever the club turned out to be.
const CLUB_CLEAR = CLUB_RING[1] + Math.hypot(...CLUB_PLAN.slice(2)) + 20;
const BEEN_KEPT = 300; // tracks you've been to, the most remembered
const REACH = 3.2; // m from your car you can get in
const ARRIVE = 40; // m from the gate that counts as there
const MOVED = 6; // m: put somewhere else further than this in a frame, you're out of the car
const STOPPED = 1.5; // m/s: slower than this counts as stopped
const SAY = 4200; // ms a sentence stays on the screen
// The camera while you drive: round behind the way you're going this fast
// (1/s), this much further back (m), this close (m) and looking down this much.
const CAM = { behind: 3.2, back: 1.2, dist: 5.2, pitch: 0.2 };
// How you sit in it: legs out in front, low, leaning back, hands on the wheel.
const SEAT = { spread: 0.12, hang: 0.08, fwd: 0.8, lean: -0.38, reins: 0.85, rest: 0, stroke: null };
// How far (m) plants of each kind are kept back from the track's grounds.
const KEEP_BACK = { pine: 2.5, broad: 3, birch: 2, bush: 1, fern: 0.3, rock: 1.4, log: 2.6 };
const SCALED = { rock: true, log: true };
const LAMP = { on: 0xff2a1a, off: 0x2a0c0a };
// a chequered flag, on the map's badge
const GLYPH = ['#.#.#..', '.#.#.#.', '#.#.#..', '.#.#.#.', '#......', '#......', '#......'];
const YOUR_COLOUR = 0xd8302a;
const WHEEL_R = 0.33; // m, how far round the others' wheels are, to spin them

const _l = { x: 0, z: 0 };
const _w = { x: 0, z: 0 };
const _a = { x: 0, z: 0 };
const _p = {};
const _near = {};
const _wall = { nx: 0, nz: 0, depth: 0 };
const _them = { x: 0, z: 0, yaw: 0, vx: 0, vz: 0, push: 0 };
const _v = new THREE.Vector3();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const WAYS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
const way = (dx, dz) => WAYS[Math.round((((Math.atan2(dx, -dz) * 180) / Math.PI + 360) % 360) / 45) % 8];

// The features this uses, so it is installed after them (game/features.js):
// landmarks, towns, caves, railway, spaceport, airports, videostore and
// abandoned for what the tracks keep clear of (and towns for where they
// are), pack to say what's yours, act for the key (F) that gets you into
// your car and out again.
export const after = ['render', 'ui', 'world', 'player', 'audio', 'build', 'map', 'save', 'landmarks', 'towns', 'caves', 'railway', 'spaceport', 'airports', 'videostore', 'abandoned', 'pack', 'act'];
export function installRacetrack(game) {
  const { scene, gen, chunks, grass, solids, landforms, player, input, builder, map, hud, commands, save, sound, landmarks, towns, caves, railway, spaceport, airports, videostore, abandoned, pack, act, peers } = game;

  // ── Where they are ────────────────────────────────────────────────────────
  const fields = airports.airports;
  // (asked about by the middle of the box, as it always has been: airports.js)
  const airfieldIn = airfieldsOver(fields, { wide: false });
  const onAirfield = (box) => airfieldIn.holds(...box);
  const keepOff = clearOf({
    landforms,
    sites: landmarks.sites,
    towns: towns.towns,
    caves,
    lines: railway.lines,
    spaceport: spaceport.sites,
    stores: (...box) => videostore.stores(...box),
    airfield: onAirfield,
    buildings: (...box) => abandoned.within(...box),
    start: player.start,
    startClear: CLUB_CLEAR,
  });
  const tracks = new Tracks(gen, { towns: towns.towns, keepOff });
  const ground = (x, z) => gen.height(x, z) + (chunks.heightOffset ? chunks.heightOffset(x, z) : 0);
  // a track's frame, worked out once: its circuit and its paddock
  const frameOf = (t) => ({ c: circuitOf(t.layout), pad: paddockOf(circuitOf(t.layout)) });

  // ── What's yours ──────────────────────────────────────────────────────────
  // been: the tracks you've been to; best: your best lap at each (s);
  // races, wins: how many you've run to the end, and won
  let been = [];
  let best = {};
  const places = new Map(); // track id -> it on the map, made again when you've been or done better
  let races = 0;
  let wins = 0;
  save.register({
    id: 'racetrack',
    scope: 'yours',
    local: 'marks',
    collect: () => (been.length || races ? { been: [...been], best: { ...best }, races, wins } : null),
    validate(raw) {
      const ok = (id) => typeof id === 'string' && /^racetrack:town:-?\d+:-?\d+$/.test(id);
      const out = { been: [], best: {}, races: 0, wins: 0 };
      if (!raw || typeof raw !== 'object') return out;
      if (Array.isArray(raw.been)) out.been = raw.been.filter(ok).slice(0, BEEN_KEPT);
      if (raw.best && typeof raw.best === 'object') for (const [id, t] of Object.entries(raw.best)) if (ok(id) && Number.isFinite(t) && t > 0) out.best[id] = t;
      out.races = Number.isInteger(raw.races) && raw.races > 0 ? raw.races : 0;
      out.wins = Number.isInteger(raw.wins) && raw.wins > 0 ? Math.min(raw.wins, out.races) : 0;
      return out;
    },
    restore(r) {
      been = [...(r?.been || [])];
      best = { ...(r?.best || {}) };
      races = r?.races || 0;
      wins = r?.wins || 0;
      places.clear();
    },
  });
  pack.have(() => {
    if (!races) return null;
    return [{ label: 'races won', note: `${wins} of ${races}` }];
  });

  // ── The forest round them ─────────────────────────────────────────────────
  // Trees, bushes and stones kept off the grounds (the infield too); grass
  // kept off the racing surface and the paddock.
  chunks.on('vegetation', (ch) => {
    const S = chunks.size;
    const x0 = ch.cx * S;
    const z0 = ch.cz * S;
    for (const t of tracks.within(x0 - 4, z0 - 4, x0 + S + 4, z0 + S + 4)) {
      const { c, pad } = frameOf(t);
      for (const kind in ch.vegLists) {
        const list = ch.vegLists[kind];
        for (let o = 0, k = 0; o < list.length; o += VEG_STRIDE, k++) {
          const scale = list[o + 4];
          if (scale <= 0) continue;
          const back = (KEEP_BACK[kind] ?? 0.8) * (SCALED[kind] ? scale : 1);
          toLocal(t, list[o], list[o + 2], _l);
          if (onGrounds(c, pad.rect, _l.x, _l.z, back, true)) chunks.hideInstance(ch, kind, k);
        }
      }
    }
  });
  grass.addClearing((x0, z0, x1, z1) => {
    const here = tracks.within(x0, z0, x1, z1);
    if (!here.length) return null;
    return (x, z) =>
      here.some((t) => {
        const { c } = frameOf(t);
        toLocal(t, x, z, _l);
        const b = c.box;
        if (_l.x < b[0] || _l.x > b[2] || _l.z < b[1] - 2 || _l.z > b[3] + 40) return false;
        if (paddockBare(t, _l.x, _l.z)) return true;
        return c.locate(_l.x, _l.z, _near).d <= c.half + KERB + 0.8;
      });
  });
  // the apron, the pits and the grandstand: bare ground
  function paddockBare(t, u, v) {
    const { c, pad } = frameOf(t);
    const sx = c.layout.start;
    for (const r of [PADDOCK.apron, PADDOCK.pits, PADDOCK.stand]) {
      if (u >= sx + r[0] - 0.5 && u <= sx + r[2] + 0.5 && v >= pad.zb + r[1] - 0.5 && v <= pad.zb + r[3] + 0.5) return true;
    }
    return false;
  }
  // ── Building goes round them ──────────────────────────────────────────────
  const discs = new Map(); // track id -> discs over its circuit and paddock
  function discsOf(t) {
    let list = discs.get(t.id);
    if (list) return list;
    const { c, pad } = frameOf(t);
    list = planDiscs({ ...t, plan: [pad.rect] }, 4);
    const p = {};
    for (let s = 0; s < c.length; s += 8) {
      c.at(s, p);
      const w = toWorld(t, p.x, p.z);
      list.push({ x: w.x, z: w.z, r: c.barrier + 1 });
    }
    discs.set(t.id, list);
    return list;
  }
  builder.obstacles.addSource((x, z, R, out) => {
    for (const t of tracks.within(x - R - 20, z - R - 20, x + R + 20, z + R + 20)) {
      for (const d of discsOf(t)) {
        if (Math.hypot(d.x - x, d.z - z) > R + d.r + 1) continue;
        out.push({ x: d.x, z: d.z, what: 'the race track', dig: d.r + 0.3, wall: d.r + 0.2, footing: d.r + 0.5, roof: d.r, grown: true });
      }
    }
  });

  // ── On the map ────────────────────────────────────────────────────────────
  // where one is is its paddock gate: that's where `go here` and tracking it lead
  const beenTo = (t) => been.includes(t.id);
  function asPlace(t) {
    let p = places.get(t.id);
    if (p && p.visited === beenTo(t) && p.best === best[t.id]) return p;
    const L = LAYOUTS[t.layout];
    const shapes = mapShapes(t);
    const mine = best[t.id] ? ` · your best lap ${clock(best[t.id])}` : '';
    p = { id: t.id, x: t.door.x, z: t.door.z, yaw: t.door.yaw, name: t.name, kind: 'race track', note: `a ${L.label}, ${formatDistance(circuitOf(t.layout).length)} a lap: race five others over ${RACE.laps} laps${mine}`, glyph: GLYPH, visited: beenTo(t), best: best[t.id], shape: shapes.shape, ground: shapes.ground };
    places.set(t.id, p);
    return p;
  }
  map.places.addSource({
    within: (x0, z0, x1, z1) => tracks.within(x0, z0, x1, z1, false).filter((t) => t.door.x >= x0 && t.door.x <= x1 && t.door.z >= z0 && t.door.z <= z1).map(asPlace),
    get(id) {
      if (!String(id).startsWith('racetrack:')) return null;
      const t = tracks.byId(id);
      return t ? asPlace(t) : null;
    },
    // a town at a time outward (a track is in its town's square)
    list: 'race tracks',
    nearest: (x, z) =>
      new GridNearest(x, z, {
        size: towns.towns.size,
        // (a town known not to have one has nothing)
        box(i, j) {
          const t = towns.towns.peek(i, j);
          return t === null || (t && !layoutFor(t, gen.seed)) ? null : undefined;
        },
        at(i, j) {
          const t = towns.towns.peek(i, j);
          const b = t && tracks.peek(t);
          return t === undefined || b === undefined ? undefined : b ? [asPlace(b)] : [];
        },
      }),
  });

  // ── Materials ─────────────────────────────────────────────────────────────
  const materials = {
    outside: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86, metalness: 0.02, side: THREE.DoubleSide }),
    glow: new THREE.MeshBasicMaterial({ vertexColors: true }),
    lamp: Array.from({ length: RACE.lights }, () => new THREE.MeshBasicMaterial({ color: LAMP.off })),
    car: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.25 }),
  };

  // ── Standing one up ───────────────────────────────────────────────────────
  // The one you're at, or were last near; another takes its place when you
  // come nearer that one, out of the car.
  let site = null;
  let built = null; // buildTrack's, with the surface, your car and the others'
  let shown = false;
  function build() {
    const surface = surfaceOf(site, ground);
    built = buildTrack(site, surface, ground, materials);
    built.surface = surface;
    built.frame = frameOf(site);
    built.mine = makeCar({ colour: YOUR_COLOUR, number: 1, sprint: LAYOUTS[site.layout].surface === 'dirt', material: materials.car });
    built.object.add(built.mine.object);
    built.others = [];
    // the line round it, for the little map
    const c = built.frame.c;
    built.outline = [];
    for (let i = 0; i < c.n; i += 3) built.outline.push([c.x[i], c.z[i]]);
    park();
  }
  function dispose() {
    if (!built) return;
    built.object.traverse((o) => o.isMesh && o.geometry.dispose());
    built = null;
  }
  function show(on) {
    if (on === shown) return;
    shown = on;
    if (on) {
      if (!built) build();
      scene.add(built.object);
      solids.set(built, built.solids);
    } else {
      scene.remove(built.object);
      solids.clear(built);
    }
  }
  function moveTo(t) {
    if (driving) stow();
    show(false);
    dispose();
    site = t;
    arrived = false;
  }
  // The camera doesn't look through the pits or the grandstand.
  player.cameraBlockers.push((origin, dir, max) => {
    if (!shown) return Infinity;
    if (Math.hypot(origin.x - site.x, origin.z - site.z) > max + 260) return Infinity;
    let near = Infinity;
    for (const b of built.blockers) near = Math.min(near, rayBox(origin, dir, b));
    return near;
  });

  // the others on the grid and your car on the apron, waiting
  function park() {
    if (!built) return;
    field(new Race(built.frame.c, { surface: LAYOUTS[site.layout].surface, seed: hashOf(site.id) }));
    const a = apronSpot();
    built.mine.object.position.set(a.x, built.apron - built.base, a.z);
    built.mine.object.rotation.set(0, Math.PI / 2, 0);
  }
  // the others' cars, as race r has them, on the grid
  function field(r) {
    const sprint = LAYOUTS[site.layout].surface === 'dirt';
    for (const o of built.others) {
      built.object.remove(o.model.object);
      o.model.dispose();
    }
    built.others = r.cars
      .filter((car) => !car.you)
      .map((car) => {
        const model = makeCar({ colour: car.colour, number: car.number, sprint, driver: true, material: materials.car });
        built.object.add(model.object);
        return { car, model };
      });
    for (const o of built.others) placeOther(o.model.object, o.car.run, o.car.lat, 0);
  }
  // where your car waits on the apron, in the track's frame
  function apronSpot() {
    const { c, pad } = built.frame;
    return { x: c.layout.start + PADDOCK.car.x, z: pad.zb + PADDOCK.car.z };
  }
  // one of the others' cars at `run` round the lap, lat to the left, going at v
  function placeOther(object, run, lat, steer) {
    const { c } = built.frame;
    const s = c.wrap(run);
    c.at(s, _p, lat);
    const y = surfaceAt(c, built.surface, s, lat);
    const ahead = surfaceAt(c, built.surface, s + 1, lat);
    const behind = surfaceAt(c, built.surface, s - 1, lat);
    const lean = surfaceAt(c, built.surface, s, lat + 1) - surfaceAt(c, built.surface, s, lat - 1);
    object.position.set(_p.x, y - built.base, _p.z);
    object.rotation.set(Math.atan2(behind - ahead, 2), Math.atan2(_p.tx, _p.tz) + steer, Math.atan2(lean, 2), 'YXZ');
  }

  // ── Driving ───────────────────────────────────────────────────────────────
  const car = new Car();
  let driving = false;
  let race = null;
  let hint = null; // where round the lap the car was last frame
  let hold = null; // what you're held by while you drive (player/rides.ts)
  // What's under the car, in the track's frame: the racing surface, its
  // kerbs, or the run-off (the bank, or the ground); and the barrier.
  const world = {
    under(x, z, out) {
      const { c } = built.frame;
      c.locate(x, z, _near, hint, 30);
      const d = _near.d;
      const w = c.half + KERB;
      if (d <= w) {
        out.y = surfaceAt(c, built.surface, _near.s, _near.lat);
        out.kind = d <= c.half ? LAYOUTS[site.layout].surface : 'kerb';
      } else {
        toWorld(site, x, z, _w);
        const edge = surfaceAt(c, built.surface, _near.s, Math.sign(_near.lat) * w);
        out.y = Math.max(chunks.heightAt(_w.x, _w.z), edge - (d - w) * BANK);
        out.kind = 'grass';
      }
      const most = c.barrier - CAR.half - 0.2;
      if (d > most) {
        c.at(_near.s, _p);
        const side = Math.sign(_near.lat);
        _wall.nx = -side * _p.tz;
        _wall.nz = side * _p.tx;
        _wall.depth = d - most;
        out.wall = _wall;
      } else out.wall = null;
    },
  };
  car.on('bump', (v) => {
    sound.sfx('race-bump', { size: Math.min(1, v / 15) });
    if (v > 8) hud.flash('into the barrier', 1400);
  });
  car.on('land', (v) => sound.sfx('race-bump', { size: Math.min(0.5, v / 12) }));

  const controls = { throttle: 0, brake: 0, steer: 0, handbrake: false };
  function readControls() {
    if (input.blocked) {
      controls.throttle = controls.brake = controls.steer = 0;
      controls.handbrake = false;
      return;
    }
    const ax = input.moveAxes();
    controls.throttle = Math.max(Math.max(0, ax.y), input.down('PadRT') ? 1 : 0);
    controls.brake = Math.max(Math.max(0, -ax.y), input.down('PadLT') ? 1 : 0);
    controls.steer = -ax.x;
    controls.handbrake = input.isDown('jump');
  }
  // You, in it: the car moves you, wherever it goes.
  const mover = {
    slack: MOVED,
    place(out, dt) {
      readControls();
      car.held = !race || race.state === 'lights';
      car.step(Math.min(dt, 1 / 30), controls, world);
      if (dt > 1 / 30) car.step(dt - 1 / 30, controls, world);
      toWorld(site, car.x, car.z, _w);
      out.x = _w.x;
      out.z = _w.z;
      out.y = car.y;
      out.yaw = car.yaw + site.yaw;
      out.heading = Math.hypot(car.vx, car.vz) > 2 ? Math.atan2(car.vx, car.vz) + site.yaw : out.yaw;
      out.behind = CAM.behind;
      out.back = CAM.back;
      out.grounded = !car.airborne;
    },
  };
  let camWas = null;
  builder.idleWhile(() => driving);

  function getIn() {
    if (driving || !built) return false;
    if (!player.rides.free) {
      hud.flash(`${player.rides.why()}: you can’t get into the car from here`);
      return false;
    }
    // (something else has you, or has put you somewhere, R, a teleport, the map: that's the end of it)
    hold = player.rides.take({ by: 'racetrack', what: 'your car', aboard: mover, lost: () => stow() });
    if (!hold) return false;
    const { c } = built.frame;
    race = new Race(c, { surface: LAYOUTS[site.layout].surface, seed: (Math.random() * 2 ** 31) >>> 0 });
    hookRace(race);
    // the others on the grid, as this race has them
    field(race);
    const g = race.grid(RACE.rivals);
    c.at(g.run, _p, g.lat);
    hint = c.wrap(g.run);
    car.place(_p.x, _p.z, Math.atan2(_p.tx, _p.tz), world);
    driving = true;
    toWorld(site, car.x, car.z, _w);
    player.pos.set(_w.x, car.y, _w.z);
    player.vel.set(0, 0, 0);
    player.character.seat(SEAT);
    camWas = { dist: player.camDist, pitch: player.camPitch };
    player.camDist = CAM.dist;
    player.camPitch = CAM.pitch;
    player.camYaw = car.yaw + site.yaw + Math.PI;
    sound.sfx('race-start');
    tell();
    hud.flash('on the grid, at the back · go when the lights go out', SAY);
    pose();
    return true;
  }

  // Out of the car, onto the apron beside where it waits.
  function getOut() {
    if (!driving) return false;
    stow();
    const a = apronSpot();
    const p = toWorld(site, a.x + 3.2, a.z);
    player.spawn(p.x, p.z, site.yaw + Math.PI, site.yaw, built ? built.apron + 0.2 : Infinity);
    return true;
  }
  // The race over, back on the grid for another.
  const over = () => !!race && race.you.finished !== null;
  function again() {
    stow();
    return getIn();
  }

  // Out of it at once, wherever you are; the car back on the apron, the
  // others back on the grid.
  function stow() {
    if (!driving) return;
    driving = false;
    if (hold) hold.release();
    hold = null;
    const ch = player.character;
    ch.seat(null);
    ch.root.rotation.x = 0;
    ch.root.rotation.z = 0;
    if (camWas) {
      player.camDist = camWas.dist;
      player.camPitch = camWas.pitch;
      camWas = null;
    }
    if (race && race.state !== 'lights' && race.you.finished === null) hud.flash('out of the race', 2400);
    race = null;
    heard.you = null;
    heard.others = [];
    board.hide();
    cue(null);
    setLamps(0);
    park();
    tell();
  }

  // What the race says, as it goes.
  function hookRace(r) {
    r.on('light', (n) => {
      setLamps(n);
      if (n > 0) sound.sfx('race-light');
    });
    r.on('go', () => {
      setLamps(0);
      sound.sfx('race-go');
      cheer = 1;
      hud.flash('go!', 1200);
    });
    r.on('lap', (who, n, time) => {
      if (!who.you || who.finished !== null || n >= r.laps) return;
      sound.sfx('race-lap');
      const left = r.laps - n;
      hud.flash(`lap ${n}: ${clock(time)} · ${left === 1 ? 'last lap' : `${left} to go`} · ${ordinal(r.position)}`, 2600);
    });
    r.on('finish', (who, place) => {
      if (!who.you) return;
      sound.sfx('race-flag');
      cheer = 1;
      races++;
      if (place === 1) wins++;
      const had = best[site.id];
      if (who.best !== null && (had === undefined || who.best < had)) best[site.id] = who.best;
      places.delete(site.id);
      save.touch();
      hud.flash(place === 1 ? 'you won!' : `you came ${ordinal(place)}`, SAY);
    });
  }
  function setLamps(n) {
    materials.lamp.forEach((m, i) => m.color.setHex(i < n ? LAMP.on : LAMP.off));
  }

  // The car and you in it, and the others, where they are.
  function pose(dt = 0) {
    if (!built) return;
    const m = built.mine.object;
    if (driving) {
      m.position.set(car.x, car.y - built.base, car.z);
      m.rotation.set(car.pitch, car.yaw, car.roll, 'YXZ');
      built.mine.pose(car);
      // you, sat in it (worked out in the track's frame, not from the
      // car's matrix: that's the last frame's, drawn from somewhere else)
      const seat = built.mine.seat;
      _v.set(seat.x, seat.y - SEAT_HIPS, seat.z).applyEuler(_e.set(car.pitch, car.yaw, car.roll, 'YXZ'));
      toWorld(site, car.x + _v.x, car.z + _v.z, _w);
      const root = player.character.root;
      root.position.set(_w.x, car.y + _v.y, _w.z);
      root.rotation.copy(_e.set(car.pitch, car.yaw + site.yaw, car.roll, 'YXZ'));
    }
    if (race) {
      for (const o of built.others) {
        const steer = Math.max(-0.3, Math.min(0.3, (o.car.lat - (o.lastLat ?? o.car.lat)) * 2));
        o.lastLat = o.car.lat;
        placeOther(o.model.object, o.car.run, o.car.lat, steer);
        const wheels = o.wheels || (o.wheels = { spin: 0, wheel: 0 });
        wheels.spin += (o.car.v / WHEEL_R) * dt;
        wheels.wheel = steer;
        o.model.pose(wheels);
      }
    }
  }

  // ── Getting in and out: the act key (F) ──────────────────────────────────
  // By your car, F gets you in; stopped in it, out. A key-less command in
  // the pack says where your car is, and races again after a race.
  const nearCar = () => {
    if (!shown || driving || !player.rides.free) return false;
    const a = apronSpot();
    const p = toWorld(site, a.x, a.z);
    return Math.hypot(player.pos.x - p.x, player.pos.z - p.z) < REACH && Math.abs(player.pos.y - built.apron) < 2;
  };
  function press() {
    if (driving) return over() && Math.abs(car.speed) < STOPPED ? again() : getOut();
    if (nearCar()) return getIn();
    // not by your car: where it is
    const p = player.pos;
    const t = site || nearestKnown(p);
    if (t) {
      const d = Math.hypot(t.door.x - p.x, t.door.z - p.z);
      if (d < HIDE) hud.flash(`your car waits on the pit apron at ${t.name}, by the pits`, SAY);
      else hud.flash(`the nearest race track is ${t.name}, ${formatDistance(d)} ${way(t.door.x - p.x, t.door.z - p.z)} · it’s on the map, under race tracks`, SAY);
    } else hud.flash('no race track near here · the map lists them, under race tracks', SAY);
    return false;
  }
  const stopped = () => driving && Math.abs(car.speed) < STOPPED;
  act.offer({
    id: 'racetrack',
    at() {
      if (driving) return stopped() ? { d: 0, word: 'get out', run: getOut } : { d: 0, word: '', run: () => hud.flash('stop first, to get out', 1600) };
      if (!nearCar()) return null;
      const a = apronSpot();
      toWorld(site, a.x, a.z, _a);
      return { d: Math.hypot(player.pos.x - _a.x, player.pos.z - _a.z), word: 'get in', run: getIn };
    },
  });
  // (after a race, stopped, racing again is at hand: in the pack, and a button on a touch screen)
  commands.add({ id: 'racetrack', group: 'RACE TRACK', label: 'race track: where your car is · after a race: race again', run: press, now: () => (stopped() && over() ? 'race again' : '') });
  commands.describe({ group: 'RACE TRACK', help: 'F', pad: ['PadY'], label: 'by your car on the pit apron: get in and race · in it, stopped: get out' });
  commands.describe({ group: 'RACE TRACK', help: 'click', pad: ['PadRT'], label: 'after a race, stopped: race again' });
  commands.describe({ group: 'RACE TRACK', help: 'W S', pad: ['PadRT', 'PadLT'], label: 'in the car: throttle · brake, and back up' });
  commands.describe({ group: 'RACE TRACK', help: 'A D', pad: ['PadLS'], label: 'steer · space: the handbrake, to slide it round' });

  // The nearest track found so far.
  function nearestKnown(p) {
    let best_ = null;
    let bd = Infinity;
    for (const t of tracks.sites.values()) {
      const d = t ? Math.hypot(t.x - p.x, t.z - p.z) : Infinity;
      if (d < bd) [best_, bd] = [t, d];
    }
    return best_ && { ...best_, d: bd };
  }

  // ── On the screen, and heard ──────────────────────────────────────────────
  const board = new Board(document.getElementById('hud') || document.body);
  const heard = { you: null, others: [], crowd: null };
  // (kept from frame to frame, not made anew in each)
  const ears = { you: {}, others: [], near: [{}, {}] };
  const dots = [];
  const dotYou = { you: true };
  const dotsOf = [];
  // one of the others, heard from where it is (e: kept for it)
  function hear(o, e) {
    if (!o) return;
    toWorld(site, o.x, o.z, _w);
    e.x = _w.x;
    e.y = car.y;
    e.z = _w.z;
    e.v = o.car.v;
    ears.others.push(e);
  }
  sound.addLayer(raceSounds(heard));
  let cheer = 0;
  function cue(html) {
    hud.cue(html ? { html } : null, 'racetrack');
  }

  // ── Each frame ────────────────────────────────────────────────────────────
  let arrived = false;
  let lookIn = 0;
  // Where the tracks are further off is looked for a little at a time, out of
  // what the frame can spare (game/budget.ts).
  game.budget.add({ name: 'racetrack', work: (ms) => tracks.pump(ms) });
  game.addSystem({
    name: 'racetrack',
    phase: 'world',
    update({ dt }) {
      const f = game.focus;
      // the tracks round about looked for ahead of time, and, out of the
      // car, the nearest stood up in place of the last
      lookIn -= dt;
      if (lookIn <= 0) {
        lookIn = NEAREST_AFTER;
        tracks.prefetch(f.x, f.z, PREFETCH);
        const n = !driving && nearestKnown(f);
        const at = site ? Math.hypot(site.x - f.x, site.z - f.z) : Infinity;
        if (n && n.id !== site?.id && (shown ? n.d < at - SWAP_NEARER : n.d < at)) moveTo(tracks.byId(n.id));
      }
      if (!site) return;
      const d = Math.hypot(site.x - f.x, site.z - f.z);
      if (d < SHOW) show(true);
      else if (d > HIDE && !driving) show(false);
      if (!shown) {
        heard.crowd = null;
        return;
      }
      // there: the gate, or anywhere on its grounds
      const toGate = Math.hypot(player.pos.x - site.door.x, player.pos.z - site.door.z);
      if (!arrived && (toGate < ARRIVE || driving)) {
        arrived = true;
        if (!driving) hud.flash(`${site.name} · your car waits on the pit apron, by the pits`, SAY);
        if (!beenTo(site)) {
          been = [site.id, ...been].slice(0, BEEN_KEPT);
          places.delete(site.id);
          save.touch();
        }
      }
      if (toGate > ARRIVE * 4) arrived = false;
      // the crowd, from the grandstand
      cheer = Math.max(0, cheer - dt * 0.25);
      const { c, pad } = built.frame;
      const stand = toWorld(site, c.layout.start + (PADDOCK.stand[0] + PADDOCK.stand[2]) / 2, pad.zb + PADDOCK.stand[1] + 4);
      heard.crowd = { x: stand.x, y: built.apron, z: stand.z, cheer: driving ? cheer : 0 };
    },
  });
  game.addSystem({
    name: 'racing',
    phase: 'update',
    update({ dt }) {
      if (!driving) {
        if (nearCar()) {
          const L = LAYOUTS[site.layout];
          cue(`<b>${act.key('get in')}</b> get in your car and race: ${RACE.laps} laps of the ${L.label}`);
        } else cue(null);
        return;
      }
      if (!built) {
        stow();
        return;
      }
      const { c } = built.frame;
      c.locate(car.x, car.z, _near, hint, 40);
      hint = _near.s;
      race.follow(_near.s, _near.lat, car.speed);
      race.update(dt);
      // the others: where they are, and coming together with you
      for (const o of built.others) {
        c.at(o.car.run, _p, o.car.lat);
        _them.x = _p.x;
        _them.z = _p.z;
        _them.yaw = Math.atan2(_p.tx, _p.tz);
        _them.vx = _p.tx * o.car.v;
        _them.vz = _p.tz * o.car.v;
        _them.push = 0;
        if (bump(car, _them) > 0) {
          o.car.push += _them.push;
          const v = Math.abs(_them.push);
          if (v > 2) sound.sfx('race-bump', { size: Math.min(1, v / 10) });
        }
        // where it is, for the little map and the sound
        o.x = _p.x;
        o.z = _p.z;
        o.d = Math.hypot(_p.x - car.x, _p.z - car.z);
      }
      pose(dt);
      // heard: your engine, and the two nearest of the others
      toWorld(site, car.x, car.z, _w);
      const y = ears.you;
      y.x = _w.x;
      y.y = car.y;
      y.z = _w.z;
      y.rpm = car.rpm;
      y.gear = car.gear;
      y.throttle = controls.throttle;
      y.skid = car.skid;
      y.kerb = car.kind === 'kerb';
      y.speed = car.speed;
      heard.you = y;
      let a = null;
      let b = null;
      for (const o of built.others) {
        if (!a || o.d < a.d) {
          b = a;
          a = o;
        } else if (!b || o.d < b.d) b = o;
      }
      heard.others = ears.others;
      ears.others.length = 0;
      hear(a, ears.near[0]);
      hear(b, ears.near[1]);
      // on the screen
      board.show(race, site.name, best[site.id] ?? null);
      board.speed(car.kmh, car.speed < -0.5 ? 'R' : String(car.gear));
      dots.length = 0;
      dotYou.x = car.x;
      dotYou.z = car.z;
      dots.push(dotYou);
      for (let i = 0; i < built.others.length; i++) {
        const o = built.others[i];
        const dot = dotsOf[i] || (dotsOf[i] = { you: false });
        dot.x = o.x;
        dot.z = o.z;
        dot.colour = o.car.colour;
        dots.push(dot);
      }
      board.drawMap(built.outline, dots, car.yaw);
      // stopped: F gets out (act, above); after a race, click races again
      const still = stopped();
      const done = over();
      if (done && still && input.tapped('use')) {
        again();
        return;
      }
      if (input.isTouch) cue(null);
      else if (done) cue(still ? `<b>click</b> race again · <b>${act.key('get out')}</b> get out` : 'the race is over · stop to race again, or get out');
      else if (race.state === 'lights') cue('<b>W</b> throttle · <b>S</b> brake · <b>A D</b> steer · <b>space</b> handbrake');
      else if (still && race.time > 3) cue(`<b>${act.key('get out')}</b> get out`);
      else cue(null);
    },
  });

  // ── Everyone else here ────────────────────────────────────────────────────
  // They're told whether you're in a car, and see you sat in it.
  function tell() {
    save.say('racecar', driving && site ? { on: true, colour: YOUR_COLOUR, number: 1, sprint: LAYOUTS[site.layout].surface === 'dirt' } : null);
  }
  if (peers) {
    const drivers = new Drivers({ scene, peers, seat: { ...SEAT }, material: materials.car });
    save.on('message', (msg) => msg.ch === 'racecar' && drivers.hear(msg.from, msg.body));
    // someone new: tell them you're in yours
    peers.on('change', () => driving && tell());
    game.addSystem({ name: 'racecars', phase: 'world', update: () => drivers.update() });
  }

  // ── From the console (and the play-through) ───────────────────────────────
  game.provide('racetrack', {
    tracks,
    car,
    get site() {
      return site;
    },
    get built() {
      return built;
    },
    get ready() {
      return shown;
    },
    get driving() {
      return driving;
    },
    get race() {
      return race;
    },
    get best() {
      return { ...best };
    },
    get record() {
      return { races, wins, been: [...been] };
    },
    // stand at the paddock gate, facing the track: this track's, or the one with that id
    async go(id) {
      const to = id ? tracks.byId(id) : site || nearestKnown(game.focus);
      if (!to) return null;
      if (to.id !== site?.id) moveTo(tracks.byId(to.id));
      await game.api.teleport(site.door.x, site.door.z, site.door.yaw);
      return { x: site.door.x, z: site.door.z };
    },
    // stand by your car on the apron, facing it
    toCar() {
      if (!site || !shown) return null;
      const a = apronSpot();
      const p = toWorld(site, a.x + 3, a.z + 0.5);
      const to = toWorld(site, a.x, a.z);
      const yaw = Math.atan2(to.x - p.x, to.z - p.z);
      player.spawn(p.x, p.z, yaw, yaw + Math.PI, built.apron + 0.2);
      return { x: p.x, z: p.z };
    },
    drive: () => getIn(),
    out: () => getOut(),
    state: () =>
      race && {
        state: race.state,
        lit: race.lit,
        lap: race.you.laps,
        position: race.position,
        time: Math.round(race.time * 10) / 10,
        speed: Math.round(car.speed * 10) / 10,
        kind: car.kind,
        s: hint === null ? null : Math.round(hint),
        place: race.you.place,
        best: race.you.best,
      },
  });
}

// A track's id as a number, for the grid it waits with.
function hashOf(id) {
  let h = 2166136261;
  for (const ch of id) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}
