// The cruise ship: the Halcyon, a big modern cruise ship that sails between
// a pier on the coast a walk from where you first arrive and another at
// Maui. When she's alongside, walk out along the pier, up the gangway and in
// through the door in her side, and she's yours to wander: fifteen decks,
// three staircases and twelve lifts, nearly seventeen hundred staterooms
// (one of them yours), a dining room, a theatre, a nightclub, a casino,
// shops, pools and hot tubs you can swim in, and two waterslides off a tower
// on her top deck. She keeps her timetable whether you're aboard or not.
//
//   plan.js     her decks on paper: the hull's shape, the rooms, the cabins,
//               the stairs and lifts (no three.js)
//   site.js     where her piers are, and their lanes out to sea, grown from
//               the seed and the land
//   voyage.js   where she is, by the clock on the wall
//   cabins.js   what's in each stateroom, grown from the seed
//   lifts.js    a ride in a lift
//   slides.js   the waterslides, and a ride down one
//   kit.js      building blocks: boxes, cylinders, tubes, lofts
//   textures.js her carpets, marble, panelling, wallpaper, ceilings (painted
//               a little a frame once she's in sight)
//   hull.js     what she looks like from outside
//   decks.js    a deck: its floors, walls, stairs, doors; and what's solid
//   rooms.js    what's in the rooms, and in a stateroom
//   lido.js     the pools, the slide tower and the slides
//   pier.js     the pier, the trestle out to it, the terminal, the gangway
//   wake.js     the white water she leaves under way
//   sound.js    her hum, the club's beat, the steel drums, her horn
//
// Two places matter at once while she's under way. What's solid of her (her
// floors and walls, her pools) stays at `ref`, the berth she's alongside or
// last left; she's drawn at `now`, where the clock has her. Aboard her,
// you're carried (player.deck): you go about where she's solid and are put
// where that is on her now. So what's worked out inside the player's own
// step (the camera's walls, standing in a lift, going down a slide) is
// worked out from `ref`, and what's worked out from where you are in the
// world (which deck, which door, where the HUD points) from `now`. What's
// solid of her is there only while she's alongside, or for you while you're
// aboard: a ship that has sailed leaves nothing behind at the pier.
//
// Nothing about the land changes for her: see site.js. Which stateroom is
// yours, and where you were aboard her when you left, are yours, saved.
//
// From the console:
//   world.cruise.site            her home berth
//   world.cruise.voyage          where she is in her round: phase, port, bound for, how long left
//   world.cruise.soon(what, s)   move the clock so her next 'sails', 'arrives', 'home' (arrival)
//                                or 'fog' (the thick of it, where she's carried across) is s seconds off
//   await world.cruise.go(port)  stand at the foot of a pier's gangway (0 home, 1 Maui)
//   await world.cruise.board()   ...or just inside the door in her side
//   world.cruise.where           which deck you're on, and in what
//   world.cruise.yours           your stateroom
//   world.cruise.toDeck(n)       stand in a lobby on deck n
//   world.cruise.toCabin(no)     stand outside a stateroom's door
//   world.cruise.toSlide(id)     at the top of a slide ('corkscrew', 'plunge')
//   world.cruise.hurry()         skip to the end of a lift ride or a slide

import * as THREE from 'three';
import { berthSearch, clearOf, regionsInTheWay } from './site.js';
import { layout, cabinsOn, cabinByNo, roomAt, roomName, deckAt, deckY, halfBeam, inner, whereAlong, DECK_BY_N, CORES, CORE, FIRST, LAST, STERN, BOW, DECK_H, SLAB, SHIP, isCabinDeck } from './plan.js';
import { Voyage, PORTS, CALL, SEA as SEA_LEG } from './voyage.js';
import { stateroom, describe, pickYours } from './cabins.js';
import { LiftRide, LIFT } from './lifts.js';
import { Ride, path as slidePath } from './slides.js';
import { ShipKit } from './kit.js';
import { Painter, surfaceTexture, laySurfaces, SURFACES } from './textures.js';
import { buildHull } from './hull.js';
import { buildDeck } from './decks.js';
import { furnishCabin } from './rooms.js';
import { buildLido } from './lido.js';
import { buildPier, gangwayChain } from './pier.js';
import { buildWake } from './wake.js';
import { shipSounds } from './sound.js';
import { onPlan, planDiscs, toWorld, toLocal } from '../world/frame.js';
import { regionsInTheWay as clubWays } from '../huntclub/site.js';
import { VEG_STRIDE } from '../world/flora.js';
import { SEA } from '../world/sea.js';
import { SKY } from '../render/uniforms.js';
import { mulberry32 } from '../noise.js';
import { isNotYet } from '../core/notYet.ts';

const SHOW = 3200; // m: she's stood up this close (her outside, her open decks), and a pier...
const HIDE = 3600; // ...and taken down past this
const NEAR = 260; // m: within this, what's solid on all her decks is there
const PIER_SOLID = 900; // m: within this of a pier, what's solid of it is there
const ARRIVE = 40; // m from the gangway's foot that counts as there
const SEA_FOG = SEA_LEG.fog; // s in the thick of the fog
const MAUI_AFTER = 20; // s after the world opens that Maui's berth is looked for (or as soon as she's bound there)
const FOG_HAZE = 24; // how thick the air is in the thick of the fog at sea (1: the forest's)
const FOG_HORN = 30; // s between blasts of her horn in fog
const FULL_SPEED = 6; // m/s: under way, as fast as she goes in and out
const LIT = 0.6; // how much of its own colour her inside gives off, lit by its lamps
const PAINT_MS = 4; // ms a frame given to painting her carpets, marble and panelling, once she's in sight
const CAM_IN = 2.6; // m: the camera comes in this close indoors
const QUIET = 0.5; // how shut in you are, indoors aboard
const OVERHEAD = { day: 1.2, night: 3.5, range: 8, decay: 1.2, up: 2.2 };
const DOOR_REACH = 1.6; // m from a door that a click opens it
const DOOR_SHUT = 5; // m away, a cabin door swings shut behind you
const DOOR_SPEED = { cabin: 1.6, lift: 1 / LIFT.doors, glass: 2.2 }; // of the way a second
const GLASS_NEAR = 2.6; // m from a glass door that it slides open
const CABIN_NEAR = 8; // m from a stateroom's door that its things are put in it
const CABINS_KEPT = 10; // the most staterooms furnished at once
const SLIDE_REACH = 1.4; // m from the top of a slide
const HORN_HOURS = [12, 17]; // she sounds her horn at these hours, alongside
const PICK_REPEAT = 0.28; // s between decks while W or S is held, in a lift
const KEEP_BACK = { pine: 2, broad: 2.2, birch: 1.6, bush: 0.8, fern: 0.3, rock: 1.2, log: 2.6 };
const SCALED = { rock: true, log: true };
// a ship, on the map's badge
const GLYPH = ['.......', '...#...', '..###..', '.#####.', '#######', '.#####.', '.......'];
// sitting in a slide: legs out in front, leaning back, hands on its sides
const SLIDE_SEAT = { spread: 0.18, hang: 0.05, fwd: 0.8, lean: -0.55, reins: 0, rest: 1, stroke: null };

const _l = { x: 0, z: 0 };

// The features this uses, so it is installed after them (game/features.js):
// landmarks, towns, caves, the railway, the launch sites, the video stores,
// the airports, the abandoned buildings and the hunt clubs for what the
// berths keep clear of; country for the haze the fog at sea thickens.
export const after = ['render', 'ui', 'world', 'player', 'audio', 'build', 'map', 'landmarks', 'towns', 'caves', 'railway', 'spaceport', 'videostore', 'airports', 'abandoned', 'huntclub', 'country'];
export function installCruise(game) {
  const { scene, gen, chunks, grass, solids, basins, landforms, player, input, builder, map, hud, commands, save, sound, pipeline, landmarks, towns, caves, railway, spaceport, videostore, airports, abandoned, huntclub } = game;

  // ── Where she lies ────────────────────────────────────────────────────────
  // Her berths are looked for once what they keep clear of is known: the
  // airfields in the way (the airports feature finds those a little at a
  // time once the world is open, and this doesn't hurry it) and the hunt
  // club (which waits for them too). Until then she isn't anywhere. Maui's
  // is looked for a little later, a few milliseconds a frame.
  const fields = airports.airports;
  const mauiRegion = fields.regions.find((g) => g.hikes.includes(PORTS[1].hike)) || null;
  const homeWays = [...regionsInTheWay(fields.regions, player.start), ...clubWays(fields.regions, player.start)];
  const mauiWays = mauiRegion ? regionsInTheWay(fields.regions, mauiRegion) : [];
  const known = (list) => list.every((g) => fields.site(g.id, false) !== undefined);
  const common = { landforms, sites: landmarks.sites, towns: towns.towns, caves, lines: railway.lines, airfields: fields };
  // Every launch site, video store, hunt club and abandoned building, the far
  // ones too, at home and at Maui: not the ones nearest you, so where a
  // berth is can't depend on where you were when it was looked for.
  const plain = clearOf(common);
  const placed = (...box) => spaceport.sites.within(...box).length > 0 || videostore.stores(...box).length > 0 || huntclub.within(...box).length > 0 || abandoned.within(...box).length > 0;
  const keepOff = (...box) => plain(...box) || placed(...box);
  const from = [player.start, mauiRegion];
  const berths = [null, null]; // each port's, once found (null if there's none)
  const searches = [null, null]; // { steps } while one's being looked for; 'done' after
  let site = null; // home's berth
  let voyage = null;
  function search(i) {
    if (searches[i] || !from[i]) return;
    searches[i] = { steps: berthSearch(gen, from[i], keepOff) };
  }
  // Port i's berth, found now if it hasn't been (the airfields in its way
  // asked about then and there): for when she's about to be there.
  function ensure(i) {
    if (searches[i] === 'done' || !from[i]) return berths[i];
    if (!searches[i]) {
      for (const g of i === 0 ? homeWays : mauiWays) fields.site(g.id);
      search(i);
    }
    let r = searches[i].steps.next();
    while (!r.done) r = searches[i].steps.next();
    searches[i] = 'done';
    found(i, r.value);
    return berths[i];
  }
  // A berth being looked for is looked for a little at a time, out of what
  // the frame can spare (game/budget.ts). -> whether there's more to do
  function stepSearches(ms) {
    const until = performance.now() + ms;
    for (let i = 0; i < 2; i++) {
      const sr = searches[i];
      if (!sr || sr === 'done') continue;
      while (performance.now() < until) {
        let r;
        try {
          r = sr.steps.next();
        } catch (err) {
          // (the real Earth there hasn't come yet: looked for again from the
          // start, once it has: core/notYet.ts)
          if (!isNotYet(err)) throw err;
          searches[i] = null;
          search(i);
          break;
        }
        if (!r.done) continue;
        searches[i] = 'done';
        found(i, r.value);
        break;
      }
    }
    return searches.some((sr) => sr && sr !== 'done');
  }
  game.budget.add({ name: 'cruise', work: stepSearches });
  function found(i, b) {
    berths[i] = b;
    if (!b) return;
    if (i === 0) {
      site = b;
      // (with no berth to be found at Maui, she goes out and comes back)
      voyage = new Voyage([() => berths[0], () => berths[1] || (searches[1] === 'done' || !from[1] ? berths[0] : null)], gen.seed);
    }
    // the trees and the grass where the pier is, gone now it's there
    for (const ch of chunks.chunks.values()) clearChunk(ch, b);
    grass.invalidate(...b.box);
    discs[i] = planDiscs(b, 3);
  }

  // Her two places: where her solids are (the berth she's at, or left), and
  // where she's drawn (where she is now). y is her waterline, the sea's.
  const ref = { x: 0, z: 0, yaw: 0, y: SEA.level };
  const now = { x: 0, z: 0, yaw: 0, y: SEA.level, known: false };
  let refPort = -1;
  const voy = {};
  const deckFrame = { still: ref, at: now };
  const worldSolid = (s) => {
    const a = toWorld(ref, s.ax, s.az, {});
    const b = toWorld(ref, s.bx, s.bz, {});
    return { ...s, ax: a.x, az: a.z, bx: b.x, bz: b.z, bottom: s.bottom + ref.y, topA: s.topA + ref.y, topB: s.topB + ref.y };
  };
  let shift = 0; // s added to the clock: only ever from the console, to try things out
  const clock = () => Date.now() / 1000 + shift;

  // ── What's yours ──────────────────────────────────────────────────────────
  let yours = null; // your stateroom's number, once you've come aboard
  let visited = false;
  let backAboard = null; // where you were aboard her when you left, in her frame: { x, y, z, yaw }
  const where = { onShip: false, deck: FIRST, x: 0, z: 0, y: 0, room: null, inside: false, near: Infinity, pier: 0 };
  save.register({
    id: 'cruise',
    scope: 'yours',
    local: 'marks',
    collect: () => ({
      visited,
      cabin: yours,
      // the deck you're on, and how far over its floor, so it's the same deck whatever her decks' height
      ...(where.onShip ? { aboard: { x: round(where.x), deck: where.deck, up: round(where.y - deckY(where.deck)), z: round(where.z), yaw: round(player.yaw - now.yaw, 1000) } } : {}),
    }),
    validate: (raw) => {
      const r = raw && typeof raw === 'object' ? raw : {};
      const a = r.aboard && typeof r.aboard === 'object' ? r.aboard : null;
      const y = a && aboardHeight(a);
      const ok = a && [a.x, y, a.z].every(Number.isFinite);
      return { visited: r.visited === true, cabin: Number.isInteger(r.cabin) && cabinByNo(r.cabin) ? r.cabin : null, aboard: ok ? { x: a.x, y, z: a.z, yaw: Number.isFinite(a.yaw) ? a.yaw : 0 } : null };
    },
    restore(r) {
      visited = r.visited;
      yours = r.cabin;
      backAboard = r.aboard;
      if (yours) stateCache.delete(yours);
    },
  });

  // ── Materials ─────────────────────────────────────────────────────────────
  // Her inside is laid with her surfaces (textures.js): plain white until
  // they've been painted, a little a frame from when she comes in sight.
  const lit = { value: LIT };
  const surfaces = { value: surfaceTexture() };
  let painter = null;
  const litFromWithin = (mat, key, laid = false) => {
    mat.onBeforeCompile = (shader) => {
      if (laid) laySurfaces(shader, surfaces);
      shader.uniforms.uLit = lit;
      // (its colour as drawn: the vertex's, and the surface it's laid with)
      shader.fragmentShader = `uniform float uLit;\n${shader.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance += diffuseColor.rgb * uLit;')}`;
    };
    mat.customProgramCacheKey = () => `cruise-${key}`;
    return mat;
  };
  const materials = {
    outside: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.04 }),
    inside: litFromWithin(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0 }), 'inside', true),
    glow: new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }),
    glass: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.08, metalness: 0.3, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide }),
    lit: new THREE.MeshBasicMaterial({ vertexColors: true }),
    backing: new THREE.MeshBasicMaterial({ vertexColors: true }),
    teak: new THREE.MeshStandardMaterial({ map: teakTexture(), vertexColors: true, roughness: 0.85, metalness: 0 }),
    water: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.05, metalness: 0.15, transparent: true, opacity: 0.72, depthWrite: false }),
    tube: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.25, metalness: 0.05, transparent: true, opacity: 0.72 }),
    door: litFromWithin(new THREE.MeshStandardMaterial({ color: 0x7a5232, roughness: 0.6 }), 'door'),
    steel: litFromWithin(new THREE.MeshStandardMaterial({ color: 0xa8acb4, roughness: 0.35, metalness: 0.5 }), 'steel'),
  };

  // ── The staterooms ────────────────────────────────────────────────────────
  const stateCache = new Map();
  const stateOf = (no) => {
    if (stateCache.has(no)) return stateCache.get(no);
    const c = cabinByNo(no);
    if (!c) return null;
    let st = stateroom(gen.seed, c);
    // yours is made up for you, and has nothing of anyone else's in it
    if (no === yours) st = { ...st, taken: false, dnd: false, made: true, towel: 'swan', cases: 0, robe: false };
    stateCache.set(no, st);
    return st;
  };

  // ── The ship ──────────────────────────────────────────────────────────────
  const ship = new THREE.Group();
  ship.name = 'cruise-ship';
  const heard = { inside: 0, club: 0, inClub: false, lido: 0, atrium: 0, lap: 0, beat: 0, underway: 0, deck: 0 };
  sound.addLayer(shipSounds(heard));
  const overhead = new THREE.PointLight(0xfff4e0, 0, OVERHEAD.range, OVERHEAD.decay);
  overhead.castShadow = false;
  scene.add(overhead);

  // her outside, open decks and pool deck: built once she's in sight
  let outside = null; // { hull, lido, tops: Map n -> deck, wake }
  let shown = false;
  // what's solid of her is in the world (at ref)
  let solid = false;
  // every deck's solids and blockers, built (without drawing anything) once you're near
  const decks = new Map(); // n -> { solids, blockers, doors (plan doors), owner, doorOwner, grid }
  // the decks drawn round you, inside her
  const drawn = new Map(); // n -> buildDeck's (with geometry)
  const doorState = new Map(); // `${n}:${i}` -> { open, want }
  const extras = new Map(); // n -> [{ kind, spec, obj }]: the dance floor, the mirror ball, the slot machines
  const furnished = new Map(); // cabin no -> { group, owner }

  function buildOutside() {
    painter = new Painter();
    const states = (c) => stateOf(c.no);
    const hull = buildHull({ materials, states });
    const lido = buildLido({ materials });
    const wake = buildWake();
    const tops = new Map();
    for (const n of [14, 15, 16]) tops.set(n, buildDeck(n, { materials, seed: gen.seed, look: lookFor(n) }));
    ship.add(hull.object, lido.object, wake.object);
    for (const d of tops.values()) ship.add(d.object);
    outside = { hull, lido, tops, wake };
  }

  function asBasin(pl) {
    const p = pl.p;
    let x0 = Infinity;
    let z0 = Infinity;
    let x1 = -Infinity;
    let z1 = -Infinity;
    for (const [u, v] of [
      [p.x0, p.z0],
      [p.x1, p.z0],
      [p.x1, p.z1],
      [p.x0, p.z1],
    ]) {
      const w = toWorld(ref, u, v, {});
      x0 = Math.min(x0, w.x);
      z0 = Math.min(z0, w.z);
      x1 = Math.max(x1, w.x);
      z1 = Math.max(z1, w.z);
    }
    const loc = {};
    return {
      x0,
      z0,
      x1,
      z1,
      level: ref.y + pl.level,
      id: p.id,
      name: p.name,
      contains: (x, z) => {
        toLocal(ref, x, z, loc);
        return pl.contains(loc.x, loc.z);
      },
      bedAt: (x, z) => {
        toLocal(ref, x, z, loc);
        return ref.y + pl.bedAt(loc.x, loc.z);
      },
    };
  }

  function lookFor(n) {
    return {
      cabins: (no) => stateOf(no),
      extra: (kind, spec) => {
        if (!extras.has(n)) extras.set(n, []);
        extras.get(n).push({ kind, spec, obj: null });
      },
    };
  }

  function showOutside(on) {
    if (on === shown) return;
    shown = on;
    if (on) {
      if (!outside) buildOutside();
      scene.add(ship);
    } else {
      scene.remove(ship);
      setSolid(false);
      dropDecks();
    }
  }

  // Every deck's solids and blockers, built one a frame once you're near (in
  // her frame: they're put in the world at ref while she's solid).
  function prepareDeck(n) {
    if (decks.has(n)) return decks.get(n);
    let d;
    if (n >= 14) {
      const top = outside.tops.get(n);
      d = { solids: top.solids, blockers: top.blockers, doors: top.doors };
    } else {
      const b = buildDeck(n, { materials, seed: gen.seed, visual: false });
      d = { solids: b.solids, blockers: b.blockers, doors: b.doors };
    }
    d.owner = { deck: n };
    d.doorOwner = { doors: n };
    d.grid = gridOf(d.blockers);
    decks.set(n, d);
    if (solid) {
      solids.set(d.owner, d.solids.map(worldSolid));
      refreshDoorSolids(n);
    }
    return d;
  }
  const allPrepared = () => decks.size >= LAST - FIRST + 1;

  // What's solid of her, in the world at ref, or not: her decks, her pools,
  // her sides at the waterline, the staterooms furnished.
  const hullOwner = { hull: true };
  const lidoOwner = { lido: true };
  function setSolid(on) {
    if (on === solid) return;
    solid = on;
    putSolids();
  }
  function putSolids() {
    if (!solid || !outside) {
      for (const d of decks.values()) {
        solids.clear(d.owner);
        solids.clear(d.doorOwner);
      }
      solids.clear(hullOwner);
      solids.clear(lidoOwner);
      basins.clear(ship);
      for (const f of furnished.values()) solids.clear(f.owner);
      return;
    }
    for (const [n, d] of decks) {
      solids.set(d.owner, d.solids.map(worldSolid));
      refreshDoorSolids(n);
    }
    solids.set(hullOwner, outside.hull.solids.map(worldSolid));
    solids.set(lidoOwner, outside.lido.solids.map(worldSolid));
    basins.set(ship, outside.lido.pools.map(asBasin));
    for (const f of furnished.values()) solids.set(f.owner, f.solids.map(worldSolid));
  }

  // Her solids go to another berth: the one she's come alongside.
  function setRef(i) {
    const b = berths[i];
    if (!b) return;
    refPort = i;
    ref.x = b.x;
    ref.z = b.z;
    ref.yaw = b.yaw;
    putSolids();
  }

  function dropDecks() {
    for (const d of decks.values()) {
      solids.clear(d.owner);
      solids.clear(d.doorOwner);
    }
    decks.clear();
    for (const n of [...drawn.keys()]) undraw(n);
    for (const no of [...furnished.keys()]) unfurnish(no);
  }

  // The blockers of a deck, in a list for each 4 m along her, so the camera
  // only looks at the ones near it.
  const CELL = 4;
  function gridOf(list) {
    const g = new Map();
    list.forEach((b, i) => {
      for (let c = Math.floor(b[2] / CELL); c <= Math.floor(b[5] / CELL); c++) {
        if (!g.has(c)) g.set(c, []);
        g.get(c).push(i);
      }
    });
    return g;
  }

  // ── Doors ─────────────────────────────────────────────────────────────────
  const doorKey = (n, i) => `${n}:${i}`;
  function doorOf(n, i) {
    const k = doorKey(n, i);
    let s = doorState.get(k);
    if (!s) doorState.set(k, (s = { open: 0, want: 0 }));
    return s;
  }
  function refreshDoorSolids(n) {
    const d = decks.get(n);
    if (!d || !solid) return;
    const L = layout(n);
    const y = deckY(n);
    const list = [];
    L.doors.forEach((door, i) => {
      if (doorOf(n, i).open > 0.6) return;
      const ux = -door.nz;
      const uz = door.nx;
      const h = door.w / 2;
      list.push(worldSolid({ ax: door.x - ux * h, az: door.z - uz * h, bx: door.x + ux * h, bz: door.z + uz * h, r: 0.12, bottom: y, topA: y + 2.1, topB: y + 2.1 }));
    });
    solids.set(d.doorOwner, list);
  }

  // ── Drawing the decks round you ───────────────────────────────────────────
  function draw(n) {
    if (drawn.has(n) || n >= 14) return;
    extras.delete(n);
    const b = buildDeck(n, { materials, seed: gen.seed, look: lookFor(n) });
    drawn.set(n, b);
    ship.add(b.object);
    for (const e of extras.get(n) || []) makeExtra(n, e, b.object);
    // doors as they are
    for (const door of b.doors) {
      const s = doorOf(n, door.key);
      if (s.open > 0) b.set(door, s.open);
    }
  }
  function undraw(n) {
    const b = drawn.get(n);
    if (!b) return;
    ship.remove(b.object);
    b.dispose();
    drawn.delete(n);
    extras.delete(n);
  }

  // ── What moves: the dance floor, the mirror ball, the slot machines ───────
  function makeExtra(n, e, parent) {
    const { kind, spec } = e;
    if (kind === 'dancefloor') {
      const T = 1;
      const nx = Math.round((spec.x1 - spec.x0) / T);
      const nz = Math.round((spec.z1 - spec.z0) / T);
      const geo = new THREE.BoxGeometry(T * 0.96, 0.04, T * 0.96);
      const mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff }), nx * nz);
      const m = new THREE.Matrix4();
      let i = 0;
      for (let a = 0; a < nx; a++) {
        for (let b = 0; b < nz; b++) {
          m.makeTranslation(spec.x0 + (a + 0.5) * T, spec.y + 0.02, spec.z0 + (b + 0.5) * T);
          mesh.setMatrixAt(i, m);
          mesh.setColorAt(i, new THREE.Color(0x222222));
          i++;
        }
      }
      mesh.userData = { nx, nz };
      parent.add(mesh);
      e.obj = mesh;
    } else if (kind === 'mirrorball') {
      const k = new ShipKit();
      for (let i = 0; i < 10; i++) {
        const a0 = (i / 10) * Math.PI;
        const a1 = ((i + 1) / 10) * Math.PI;
        for (let j = 0; j < 16; j++) {
          const b0 = (j / 16) * Math.PI * 2;
          const b1 = ((j + 1) / 16) * Math.PI * 2;
          const p = (a, b) => [Math.sin(a) * Math.cos(b) * 0.45, Math.cos(a) * 0.45, Math.sin(a) * Math.sin(b) * 0.45];
          const c = new THREE.Color().setHSL(0, 0, 0.6 + ((i + j) % 3) * 0.15);
          k.face(p(a0, b0), p(a1, b0), p(a1, b1), p(a0, b1), c);
        }
      }
      const mesh = new THREE.Mesh(k.build(), new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 1, roughness: 0.15 }));
      mesh.position.set(spec.x, spec.y, spec.z);
      parent.add(mesh);
      e.obj = mesh;
    } else if (kind === 'slots') {
      const geo = new THREE.SphereGeometry(0.06, 6, 4);
      const mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff }), spec.lights.length);
      const m = new THREE.Matrix4();
      spec.lights.forEach((l, i) => {
        m.makeTranslation(l.x, l.y, l.z);
        mesh.setMatrixAt(i, m);
        mesh.setColorAt(i, new THREE.Color(0xffd040));
      });
      parent.add(mesh);
      e.obj = mesh;
    }
  }
  const _c = new THREE.Color();
  let lastBeat = -1;
  function animateExtras(dt) {
    const beat = Math.floor(heard.beat);
    const newBeat = beat !== lastBeat;
    lastBeat = beat;
    for (const [n, list] of extras) {
      if (!drawn.has(n)) continue;
      for (const e of list) {
        if (!e.obj) continue;
        if (e.kind === 'dancefloor' && newBeat) {
          const { nx, nz } = e.obj.userData;
          const rnd = mulberry32(beat * 7919);
          const hue = (beat % 16) / 16;
          for (let i = 0; i < nx * nz; i++) {
            const a = Math.floor(i / nz) - nx / 2;
            const b = (i % nz) - nz / 2;
            const ring = Math.floor(Math.hypot(a, b));
            const on = (ring + beat) % 3 === 0 || rnd() < 0.15;
            _c.setHSL((hue + ring * 0.08) % 1, 0.9, on ? 0.55 : 0.08);
            e.obj.setColorAt(i, _c);
          }
          e.obj.instanceColor.needsUpdate = true;
        } else if (e.kind === 'mirrorball') {
          e.obj.rotation.y += dt * 0.6;
        } else if (e.kind === 'slots') {
          for (let i = 0; i < e.spec.lights.length; i++) {
            if (Math.random() < dt * 2) {
              _c.setHSL(Math.random(), 0.9, Math.random() < 0.5 ? 0.6 : 0.2);
              e.obj.setColorAt(i, _c);
            }
          }
          e.obj.instanceColor.needsUpdate = true;
        }
      }
    }
  }

  // ── Staterooms furnished as you come to them ──────────────────────────────
  function furnish(no) {
    if (furnished.has(no)) return;
    const c = cabinByNo(no);
    if (!c) return;
    const kits = { inside: new ShipKit(), glow: new ShipKit(), outside: new ShipKit() };
    const list = furnishCabin(kits, c, stateOf(no), { yours: no === yours, y: deckY(c.deck) });
    const group = new THREE.Group();
    group.name = `cabin-${no}`;
    for (const [k, mat] of [
      ['inside', materials.inside],
      ['glow', materials.glow],
      ['outside', materials.outside],
    ]) {
      if (kits[k].empty) continue;
      const mesh = new THREE.Mesh(kits[k].build(), mat);
      mesh.receiveShadow = true;
      group.add(mesh);
    }
    ship.add(group);
    const owner = { cabin: no };
    if (solid) solids.set(owner, list.map(worldSolid));
    furnished.set(no, { group, owner, deck: c.deck, solids: list });
  }
  function unfurnish(no) {
    const f = furnished.get(no);
    if (!f) return;
    ship.remove(f.group);
    f.group.traverse((o) => o.isMesh && o.geometry.dispose());
    solids.clear(f.owner);
    furnished.delete(no);
  }

  // ── The piers ─────────────────────────────────────────────────────────────
  // One at each port, stood up as you come near it, and what's round it.
  const piers = [null, null]; // { built, shown, solid, chain }
  const discs = [[], []];
  function clearChunk(ch, b) {
    const S = chunks.size;
    const x0 = ch.cx * S;
    const z0 = ch.cz * S;
    const bx = b.box;
    if (bx[0] > x0 + S + 3 || bx[2] < x0 - 3 || bx[1] > z0 + S + 3 || bx[3] < z0 - 3) return;
    for (const kind in ch.vegLists) {
      const list = ch.vegLists[kind];
      for (let o = 0, k = 0; o < list.length; o += VEG_STRIDE, k++) {
        const scale = list[o + 4];
        if (scale <= 0) continue;
        const back = (KEEP_BACK[kind] ?? 0.6) * (SCALED[kind] ? scale : 1);
        if (onPlan(b, list[o], list[o + 2], back)) chunks.hideInstance(ch, kind, k);
      }
    }
  }
  chunks.on('vegetation', (ch) => {
    for (const b of berths) if (b) clearChunk(ch, b);
  });
  grass.addClearing((x0, z0, x1, z1) => {
    const near = berths.filter((b) => b && !(b.box[0] > x1 || b.box[2] < x0 || b.box[1] > z1 || b.box[3] < z0));
    if (!near.length) return null;
    return (x, z) => near.some((b) => onPlan(b, x, z, 0.3));
  });
  builder.obstacles.addSource((x, z, R, out) => {
    for (const list of discs) {
      for (const d of list) {
        if (Math.hypot(d.x - x, d.z - z) > R + d.r + 1) continue;
        out.push({ x: d.x, z: d.z, what: 'the pier', dig: d.r + 0.3, wall: d.r + 0.2, footing: d.r + 0.5, roof: d.r, grown: true });
      }
    }
  }, { grown: true });
  function pierAt(i) {
    const b = berths[i];
    if (piers[i]) return piers[i];
    const ground = (lx, lz) => {
      const w = toWorld(b, lx, lz, {});
      return gen.height(w.x, w.z) + (chunks.heightOffset ? chunks.heightOffset(w.x, w.z) : 0) - SEA.level;
    };
    const built = buildPier(b, ground, { materials });
    const chain = gangwayChain(materials);
    const group = new THREE.Group();
    group.name = `pier-${PORTS[i].id}`;
    group.position.set(b.x, SEA.level, b.z);
    group.rotation.y = b.yaw;
    group.add(built.object, chain.object);
    const inWorld = (sd) => {
      const a = toWorld(b, sd.ax, sd.az, {});
      const c = toWorld(b, sd.bx, sd.bz, {});
      return { ...sd, ax: a.x, az: a.z, bx: c.x, bz: c.z, bottom: sd.bottom + SEA.level, topA: sd.topA + SEA.level, topB: sd.topB + SEA.level };
    };
    piers[i] = { built, group, shown: false, solid: false, chained: null, solids: built.solids.map(inWorld), chainSolid: inWorld(chain.solid), chain, owner: { pier: i }, chainOwner: { chain: i } };
    return piers[i];
  }
  function piersUpdate(f, docked) {
    for (let i = 0; i < 2; i++) {
      const b = berths[i];
      if (!b) continue;
      const d = Math.hypot(b.x - f.x, b.z - f.z);
      if (d < SHOW && !piers[i]) pierAt(i);
      const p = piers[i];
      if (!p) continue;
      const show = d < SHOW || (p.shown && d < HIDE);
      if (show !== p.shown) {
        p.shown = show;
        if (show) scene.add(p.group);
        else scene.remove(p.group);
      }
      const sol = d < PIER_SOLID;
      if (sol !== p.solid) {
        p.solid = sol;
        if (sol) solids.set(p.owner, p.solids);
        else solids.clear(p.owner);
        p.chained = null;
      }
      // the chain across the gangway, while she isn't alongside here
      const chained = !(docked && voy.port === i);
      if (chained !== p.chained && p.solid) {
        p.chained = chained;
        p.chain.object.visible = chained;
        if (chained) solids.set(p.chainOwner, [p.chainSolid]);
        else solids.clear(p.chainOwner);
      }
    }
  }

  // ── On the map ────────────────────────────────────────────────────────────
  // Each pier is a place, and says when she's in and when she sails.
  const corners = (b, [x0, z0, x1, z1]) =>
    [
      [x0, z0],
      [x1, z0],
      [x1, z1],
      [x0, z1],
    ].map(([u, v]) => {
      const p = toWorld(b, u, v, {});
      return [p.x, p.z];
    });
  const outline = (b) => {
    const o = [];
    for (let z = STERN; z <= BOW; z += 10) {
      const p = toWorld(b, halfBeam(z), z, {});
      o.push([p.x, p.z]);
    }
    for (let z = BOW; z >= STERN; z -= 10) {
      const p = toWorld(b, -halfBeam(z), z, {});
      o.push([p.x, p.z]);
    }
    return o;
  };
  const places = [null, null];
  function asPlace(i) {
    const b = berths[i];
    const note = schedule(i);
    const p = places[i];
    if (p && p.visited === visited && p.note === note) return p;
    places[i] = {
      id: b.id,
      x: b.door.x,
      z: b.door.z,
      yaw: b.door.yaw,
      name: `MS ${titleCase(SHIP.name)} · ${PORTS[i].short}`,
      kind: 'cruise ship',
      note,
      glyph: GLYPH,
      visited,
      shape: [outline(b)],
      ground: b.plan.map((r) => corners(b, r)),
    };
    return places[i];
  }
  map.places.addSource({
    list: 'cruise piers',
    destinations: () => [0, 1].filter((i) => berths[i]).map(asPlace),
    within: (x0, z0, x1, z1) => [0, 1].filter((i) => berths[i] && berths[i].door.x >= x0 && berths[i].door.x <= x1 && berths[i].door.z >= z0 && berths[i].door.z <= z1).map(asPlace),
    get: (id) => {
      const i = berths.findIndex((b) => b && b.id === id);
      return i >= 0 ? asPlace(i) : null;
    },
  });

  // When she's in at port i, and when she sails; or when she'll be back.
  const hhmm = (t) => new Date((t - shift) * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const inMinutes = (s) => (s < 90 ? `${Math.max(1, Math.round(s))} s` : `${Math.round(s / 60)} min`);
  function schedule(i) {
    if (!voyage) return 'a cruise pier';
    const t = clock();
    const v = voyage.at(t, {}, () => false);
    const nx = voyage.next(t, i);
    const other = PORTS[1 - i].short;
    if (v.phase === 'docked' && v.port === i) return `the ${titleCase(SHIP.name)} is alongside · sails for ${other} at ${hhmm(nx.sails)} (in ${inMinutes(nx.sails - t)})`;
    return `the ${titleCase(SHIP.name)} is ${v.phase === 'docked' ? `alongside at ${PORTS[v.port].short}` : v.to === i ? `on her way here from ${other}` : `on her way to ${other}`} · in here at ${hhmm(nx.arrives)} (in ${inMinutes(nx.arrives - t)})`;
  }

  // ── The camera indoors ────────────────────────────────────────────────────
  // It doesn't look through her walls, floors or ceilings: the blockers of
  // the decks round you, in her frame, near the camera.
  const _bo = [0, 0, 0];
  const _bd = [0, 0, 0];
  player.cameraBlockers.push((origin, dir, max) => {
    // (worked out inside the player's step: from where she's solid)
    if (!where.onShip || !solid) return Infinity;
    const c = Math.cos(ref.yaw);
    const s = Math.sin(ref.yaw);
    const dx = origin.x - ref.x;
    const dz = origin.z - ref.z;
    _bo[0] = dx * c - dz * s;
    _bo[2] = dx * s + dz * c;
    _bo[1] = origin.y - ref.y;
    _bd[0] = dir.x * c - dir.z * s;
    _bd[2] = dir.x * s + dir.z * c;
    _bd[1] = dir.y;
    let best = Infinity;
    const z0 = Math.floor(Math.min(_bo[2], _bo[2] + _bd[2] * max) / CELL);
    const z1 = Math.floor(Math.max(_bo[2], _bo[2] + _bd[2] * max) / CELL);
    for (let n = where.deck - 1; n <= where.deck + 1; n++) {
      const d = decks.get(n);
      if (!d) continue;
      for (let cz = z0; cz <= z1; cz++) {
        const list = d.grid.get(cz);
        if (!list) continue;
        for (const i of list) {
          const t = rayAabb(_bo, _bd, d.blockers[i], best);
          if (t < best) best = t;
        }
      }
    }
    return best;
  });

  // ── Where you are ─────────────────────────────────────────────────────────
  function locate() {
    const p = player.pos;
    // where you are on her: where she is, if she's carrying you; if she
    // isn't, you're where she's solid (alongside, the same place)
    toLocal(player.deck === deckFrame || !solid ? now : ref, p.x, p.z, _l);
    where.x = _l.x;
    where.z = _l.z;
    where.y = p.y - now.y;
    const hb = Math.max(halfBeam(_l.z), 0);
    // aboard her: over her, and up on her decks (where she's solid, if
    // she's under way; alongside, the gangway's landing counts too)
    const reach = voy.phase === 'docked' ? 4 : 0;
    where.onShip = now.known && shown && _l.z > STERN - 1 && _l.z < BOW + 1 && Math.abs(_l.x) < hb + reach && where.y > deckY(FIRST) - 1.4;
    where.deck = deckAt(where.y);
    where.room = where.onShip ? roomAt(where.deck, _l.x, _l.z) : null;
    where.inside = !!where.room && !where.room.out;
    // the nearest pier's gangway
    where.near = Infinity;
    for (let i = 0; i < 2; i++) {
      const b = berths[i];
      if (!b) continue;
      const d = Math.hypot(p.x - b.door.x, p.z - b.door.z);
      if (d < where.near) {
        where.near = d;
        where.pier = i;
      }
    }
  }

  // ── Coming aboard ─────────────────────────────────────────────────────────
  function welcome() {
    if (!yours) {
      yours = pickYours(mulberry32((Date.now() ^ 0x5a1e) >>> 0));
      stateCache.delete(yours);
      save.touch();
    }
    const c = cabinByNo(yours);
    hud.flash(`Welcome aboard the ${titleCase(SHIP.name)}! Your key card: stateroom ${yours} · deck ${c.deck}, ${c.side > 0 ? 'port' : 'starboard'} side, ${whereAlong((c.z0 + c.z1) / 2)}`, 6500);
    sound.sfx('lift-ding', {});
  }

  // Where the HUD leads you once you have a stateroom and are aboard: to its
  // door, on its deck; otherwise to the stairs and lifts.
  hud.guide(() => {
    if (!where.onShip || !yours) return null;
    const c = cabinByNo(yours);
    if (!c) return null;
    if (where.room && where.room.cabin === yours) return null;
    if (where.deck === c.deck) {
      const p = toWorld(now, c.door.x - c.door.nx * 0.8, c.door.z, {});
      return { id: `cruise-cabin-${yours}`, label: `stateroom ${yours}`, color: '#7fd0ff', x: p.x, z: p.z };
    }
    // the nearest lobby on this deck
    let best = null;
    for (const core of CORES) {
      if (where.deck > core.top || c.deck > core.top) continue;
      const d = Math.abs(core.z - where.z);
      if (!best || d < best.d) best = { core, d };
    }
    if (!best) return null;
    const p = toWorld(now, 0, best.core.z, {});
    return { id: `cruise-lobby-${best.core.id}-${where.deck}`, label: `lifts to deck ${c.deck}`, color: '#7fd0ff', x: p.x, z: p.z };
  });

  // ── Lifts ─────────────────────────────────────────────────────────────────
  // in a car: { core, x (across her), z (along, its middle), state: 'here' |
  // 'choose' | 'ride', pick (the deck chosen), ride, from, held (where you stand) }
  let car = null;
  let liftHeld = null; // what you're held by in it, while you choose and while it goes
  let carGroup = null;
  let pickWait = 0;
  let camBefore = null;
  const carModels = new Map();
  function carModel(glass) {
    if (carModels.has(glass)) return carModels.get(glass);
    const k = new ShipKit();
    const g = new ShipKit();
    const gl = new ShipKit();
    const L = CORE.lifts;
    const hw = L.half - 0.06;
    const d0 = 0.26;
    const d1 = L.z1 - L.z0 - 0.26;
    const h = DECK_H - SLAB - 0.05;
    const steel = new THREE.Color(0xb8bcc4);
    const wood = new THREE.Color(0x6a4a30);
    // the floor and ceiling, the side walls, the back (glass in the midships cars)
    k.on(SURFACES.tile);
    k.flat(-hw, d0, hw, d1, 0.004, new THREE.Color(0x3a3a3e));
    k.on(SURFACES.tiles);
    k.flat(-hw, d0, hw, d1, h, new THREE.Color(0xe8e8e4), true);
    k.on(SURFACES.panel);
    g.flat(-0.6, (d0 + d1) / 2 - 0.3, 0.6, (d0 + d1) / 2 + 0.3, h - 0.01, new THREE.Color(0xfff4d8), true);
    k.panel(-hw, h / 2, (d0 + d1) / 2, 1, 0, d1 - d0, h, wood);
    k.panel(hw, h / 2, (d0 + d1) / 2, -1, 0, d1 - d0, h, wood);
    k.on(SURFACES.steel);
    if (glass) {
      gl.panel(0, h / 2, d1, 0, -1, hw * 2, h, new THREE.Color(0x9cc4d4));
      gl.panel(0, h / 2, d1, 0, 1, hw * 2, h, new THREE.Color(0x9cc4d4));
      k.box(-hw, 0, d1 - 0.05, hw, 0.12, d1, steel);
    } else k.panel(0, h / 2, d1, 0, -1, hw * 2, h, new THREE.Color(0xc8c4bc));
    // the front either side of the doors, and over them
    for (const s of [1, -1]) k.panel(s * (L.door + (hw - L.door) / 2), h / 2, d0, 0, 1, hw - L.door, h, steel);
    k.panel(0, (2.1 + h) / 2, d0, 0, 1, L.door * 2, h - 2.1, steel);
    k.on(null);
    // a handrail round it, and the panel of buttons by the doors
    k.box(-hw + 0.04, 0.9, d0 + 0.2, -hw + 0.08, 0.95, d1 - 0.1, steel);
    k.box(hw - 0.08, 0.9, d0 + 0.2, hw - 0.04, 0.95, d1 - 0.1, steel);
    k.box(L.door + 0.08, 0.9, d0 + 0.01, L.door + 0.38, 1.6, d0 + 0.04, new THREE.Color(0x2a2a30));
    for (let i = 0; i < 13; i++) g.box(L.door + 0.14 + (i % 2) * 0.14, 0.98 + Math.floor(i / 2) * 0.09, d0 + 0.045, L.door + 0.2 + (i % 2) * 0.14, 1.04 + Math.floor(i / 2) * 0.09, d0 + 0.05, new THREE.Color(0xfff0c8));
    const group = new THREE.Group();
    const add = (kit, mat) => {
      if (!kit.empty) group.add(new THREE.Mesh(kit.build(), mat));
    };
    add(k, materials.inside);
    add(g, materials.glow);
    add(gl, materials.glass);
    carModels.set(glass, group);
    return group;
  }
  // (worked out inside the player's step: from where she's solid)
  const liftHold = {
    place(at) {
      toWorld(ref, car.held.x, car.held.z, at);
      at.y = ref.y + (car.ride ? car.ride.y : deckY(car.deck));
      at.yaw = ref.yaw + Math.PI;
      at.back = -1.4;
    },
  };
  function enterCar(room) {
    const core = CORES.find((c) => c.id === room.core);
    // somewhere well inside it
    const lx = Math.max(room.liftX - 0.6, Math.min(room.liftX + 0.6, where.x));
    const lz = Math.max(room.z0 + 0.6, Math.min(room.z1 - 0.5, where.z));
    const held = { x: lx, z: lz };
    car = { core, x: room.liftX, z: core.z + (CORE.lifts.z0 + CORE.lifts.z1) / 2, deck: where.deck, state: 'here', pick: where.deck, ride: null, held };
  }
  function choose() {
    // (held in the car while you choose and while it goes: player/rides.ts)
    liftHeld = player.rides.take({ by: 'cruise', what: 'the lift', aboard: liftHold, lost: () => leaveCar() });
    if (!liftHeld) return;
    car.state = 'choose';
    car.pick = car.deck;
    car.held = { x: where.x, z: where.z };
    camBefore = camBefore ?? player.camDist;
    player.camDist = Math.min(player.camDist, 2);
    showCar();
  }
  function showCar() {
    if (carGroup) ship.remove(carGroup);
    carGroup = carModel(!!car.core.glass);
    carGroup.position.set(car.x, deckY(car.deck), car.core.z + CORE.lifts.z0);
    ship.add(carGroup);
  }
  function leaveCar() {
    if (liftHeld) liftHeld.release();
    liftHeld = null;
    if (carGroup) ship.remove(carGroup);
    carGroup = null;
    if (camBefore !== null) player.camDist = camBefore;
    camBefore = null;
    car = null;
  }
  function go(n) {
    if (!car) return;
    const from = car.deck;
    car.state = 'ride';
    car.from = from;
    car.to = n;
    car.ride = new LiftRide(deckY(from), deckY(n));
    sound.sfx('lift-doors');
  }
  function liftDoorIndex(n, coreId, x) {
    return layout(n).doors.findIndex((d) => d.kind === 'lift' && d.core === coreId && Math.abs(d.liftX - x) < 0.01);
  }
  function setLiftDoor(n, coreId, x, open) {
    const i = liftDoorIndex(n, coreId, x);
    if (i < 0) return;
    const s = doorOf(n, i);
    s.want = open;
    s.open = open;
    s.held = true;
    syncDoor(n, i);
  }
  function syncDoor(n, i) {
    const b = drawn.get(n) || (n >= 14 && outside && outside.tops.get(n));
    if (!b) return;
    const door = b.doors.find((d) => d.key === i);
    if (door) b.set(door, doorOf(n, i).open);
  }

  function lifts(dt) {
    const room = where.room;
    if (!car && room && room.kind === 'lift' && player.rides.free) enterCar(room);
    if (!car) return;
    if (car.state === 'here') {
      if (!room || room.kind !== 'lift') {
        car = null;
        return;
      }
      cue(`<b>click</b> the buttons: choose a deck · you're on ${deckLine(where.deck)}`);
      if (input.tapped('use')) choose();
      return;
    }
    if (car.state === 'choose') {
      const y = input.moveAxes().y;
      pickWait -= dt;
      if (Math.abs(y) > 0.5 && pickWait <= 0) {
        car.pick = Math.max(FIRST, Math.min(car.core.top, car.pick + Math.sign(y)));
        pickWait = PICK_REPEAT;
        sound.sfx('keycard');
      }
      if (Math.abs(y) < 0.5) pickWait = 0;
      const same = car.pick === car.deck;
      cue(`<b>W</b> <b>S</b> ${deckLine(car.pick)} · <b>click</b> ${same ? 'stay on this deck' : 'go'} · <b>right-click</b> step out`);
      if (input.tapped('use')) {
        if (same) {
          leaveCar();
          return;
        }
        go(car.pick);
      } else if (input.tapped('alt')) leaveCar();
      return;
    }
    // riding
    const r = car.ride;
    const going = r.update(dt);
    carGroup.position.y = r.y;
    setLiftDoor(car.from, car.core.id, car.x, r.phase === 'closing' ? r.doors : 0);
    if (r.phase === 'opening' || r.phase === 'open') setLiftDoor(car.to, car.core.id, car.x, r.doors);
    if (r.phase === 'opening' && !car.dinged) {
      car.dinged = true;
      sound.sfx('lift-ding', { down: car.to < car.from });
    }
    cue(`on its way to ${deckLine(car.to)} · passing deck ${deckAt(r.y)}`);
    if (!going) {
      // there: the doors open, and you can walk out
      const n = car.to;
      car.deck = n;
      car.state = 'here';
      car.ride = null;
      car.dinged = false;
      if (liftHeld) liftHeld.release();
      liftHeld = null;
      if (carGroup) ship.remove(carGroup);
      carGroup = null;
      if (camBefore !== null) player.camDist = camBefore;
      camBefore = null;
      hud.flash(deckLine(n), 3000);
      for (const k of [car.from, n]) {
        const i = liftDoorIndex(k, car.core.id, car.x);
        if (i >= 0) doorOf(k, i).held = false;
      }
    }
  }
  const deckLine = (n) => {
    const d = DECK_BY_N.get(n);
    return `deck ${n}${d.name.startsWith('Deck') ? '' : ` · ${d.name}`}: ${d.says}`;
  };

  // ── Slides ────────────────────────────────────────────────────────────────
  let slide = null; // { ride, rider, held }
  function slides() {
    if (slide) return;
    if (!outside || where.y < deckY(16)) return;
    for (const s of outside.lido.starts) {
      if (Math.hypot(s.x - where.x, s.z - where.z) < SLIDE_REACH && Math.abs(where.y - s.y) < 1.2) {
        cue(`<b>click</b> down ${s.slide.name}`);
        if (input.tapped('use')) startSlide(s);
        return;
      }
    }
  }
  function startSlide(s) {
    const ride = new Ride(pathOf(s.slide));
    const rider = {
      // (worked out inside the player's step: from where she's solid)
      place(at, dt) {
        ride.update(dt);
        const a = ride.at;
        toWorld(ref, a.x, a.z, at);
        at.y = ref.y + a.y;
        at.yaw = ref.yaw + a.yaw;
        at.behind = 3;
        at.back = 1;
      },
    };
    // (taken off it some other way than by coming out at the bottom: you're just off it)
    const held = player.rides.take({ by: 'cruise', what: 'the water slide', aboard: rider, lost: () => (player.character.seat(null), (slide = null)) });
    if (!held) return;
    slide = { ride, rider, held };
    player.character.seat(SLIDE_SEAT);
    sound.sfx('slide-rush', { length: s.slide.tube ? 18 : 8 });
  }
  function slideOn() {
    if (!slide) return;
    if (!slide.ride.done) return;
    // into the pool at the bottom
    const a = slide.ride.at;
    slide.held.release();
    player.character.seat(null);
    const w = toWorld(now, a.x, a.z, {});
    player.pos.set(w.x, now.y + a.y - 0.6, w.z);
    const sp = Math.min(4, a.v * 0.4);
    player.vel.set(Math.sin(now.yaw + a.yaw) * sp, -2, Math.cos(now.yaw + a.yaw) * sp);
    sound.sfx('slide-splash');
    slide = null;
  }
  const pathOf = (sl) => slidePath(sl);

  // ── What a click does, here ───────────────────────────────────────────────
  let cueText = null;
  const cue = (html) => {
    cueText = html;
  };
  function doors(dt) {
    const n = where.deck;
    const L = layout(n);
    const y = deckY(n);
    let near = null;
    let nearD = Infinity;
    let changed = false;
    L.doors.forEach((door, i) => {
      const dx = where.x - door.x;
      const dz = where.z - door.z;
      const d = Math.hypot(dx, dz);
      const s = doorOf(n, i);
      if (Math.abs(where.y - y) > 1.5) return;
      if (door.kind === 'glass') s.want = d < GLASS_NEAR ? 1 : 0;
      else if (door.kind === 'lift') {
        if (!s.held) {
          // it opens for you as you come up to it from the lobby, as if it had come
          const inCar = car && car.x === door.liftX && car.core.id === door.core && car.deck === n;
          const want = d < LIFT.approach || inCar ? 1 : 0;
          if (want && !s.want) sound.sfx('lift-ding', {});
          s.want = want;
        }
      } else if (door.kind === 'cabin') {
        // which side you're on: the corridor's, or the cabin's
        const inCabin = where.room && where.room.cabin === door.cabin;
        if (d > DOOR_SHUT && !inCabin) s.want = 0;
        // the one you're facing, of those in reach
        const fx = Math.sin(player.yaw - now.yaw);
        const fz = Math.cos(player.yaw - now.yaw);
        const score = d - 0.8 * ((-dx * fx - dz * fz) / Math.max(d, 1e-3));
        if (d < DOOR_REACH && score < nearD && s.want === 0) {
          near = { door, i, s };
          nearD = score;
        }
      }
      if (s.held) return;
      const sp = DOOR_SPEED[door.kind] || 1;
      const before = s.open;
      s.open += Math.sign(s.want - s.open) * Math.min(Math.abs(s.want - s.open), sp * dt);
      if (s.open !== before) {
        syncDoor(n, i);
        if ((before > 0.6) !== (s.open > 0.6)) changed = true;
      }
    });
    if (changed) refreshDoorSolids(n);
    if (near && !car && !slide) {
      const { door, s } = near;
      const st = stateOf(door.cabin);
      if (door.cabin === yours) {
        cue(`<b>click</b> open stateroom ${door.cabin} · yours`);
        if (input.tapped('use')) {
          s.want = 1;
          sound.sfx('keycard');
        }
      } else if (st && st.dnd) {
        cue(`${door.cabin} · a card on the handle: <i>do not disturb</i>`);
      } else {
        cue(`<b>click</b> open stateroom ${door.cabin}${st && st.taken ? '' : ' · empty this sailing'}`);
        if (input.tapped('use')) {
          s.want = 1;
          sound.sfx('cabin-door');
        }
      }
    }
  }

  // ── What's said, and heard, as she goes ──────────────────────────────────
  // The calls aboard, and on the pier she's at or coming to; her horn.
  let said = null; // the last thing said about her round: `${phase}:${port}`
  let called = -1; // the port the call for all aboard went out at, this time
  let fogHorn = 0;
  let lastSailed = -1;
  const name = titleCase(SHIP.name);
  const horn = () => {
    if (!now.known) return;
    const fp = toWorld(now, 0, -62, {});
    sound.call('ship-horn', fp.x, now.y + 58, fp.z);
  };
  function announce(dt) {
    const key = `${voy.phase}:${voy.port}`;
    const onPier = !where.onShip && where.near < ARRIVE * 3;
    const here = where.onShip || (onPier && where.pier === (voy.phase === 'arriving' ? voy.to : voy.port));
    const other = voy.to !== null ? PORTS[voy.to].short : PORTS[1 - voy.port].short;
    if (voy.phase === 'docked' && voy.left <= CALL && called !== voy.port && here) {
      called = voy.port;
      hud.flash(`All aboard! The ${name} sails for ${PORTS[1 - voy.port].short} in ${inMinutes(voy.left)}.`, 5000);
      sound.sfx('lift-ding', { down: true });
    }
    if (voy.phase !== 'docked') called = -1;
    if (key === said) return;
    const was = said;
    said = key;
    if (was === null) return; // (not on opening the world)
    if (voy.phase === 'leaving') {
      horn();
      lastSailed = voy.port;
      if (where.onShip) hud.flash(`We're under way, bound for ${other}. We'll be alongside there in about 17 minutes.`, 5000);
      else if (onPier && where.pier === voy.port) {
        const back = voyage.next(clock(), voy.port).arrives;
        hud.flash(`There she goes: the ${name} has sailed for ${other}. She's back here at ${hhmm(back)}.`, 5000);
      }
    } else if (voy.phase === 'sea' && where.onShip) {
      hud.flash(`Out of sight of land, at sea, bound for ${other}.`, 4000);
    } else if (voy.phase === 'arriving') {
      horn();
      if (where.onShip) hud.flash(`Land ahead: we're coming in to ${PORTS[voy.to].name}.`, 4000);
      else if (onPier && where.pier === voy.to) hud.flash(`Here she comes: the ${name}, in from ${PORTS[voy.port].short}.`, 4000);
    } else if (voy.phase === 'docked' && where.onShip && lastSailed >= 0) {
      const nx = voyage.next(clock(), voy.port);
      hud.flash(`Welcome to ${PORTS[voy.port].name}! We're alongside until ${hhmm(nx.sails)}; all aboard by then. Down the gangway to go ashore.`, 6500);
    }
    void dt;
  }

  // Aboard her, or standing on her: at (lx, lz) of her frame, ly over her
  // waterline, facing lyaw from her bow. Under way, onto where she's solid.
  function standOn(lx, ly, lz, lyaw) {
    if (!solid) setSolid(true);
    const p = toWorld(ref, lx, lz, {});
    const yaw = ref.yaw + lyaw;
    if (voy.phase === 'docked') {
      player.deck = null;
      player.spawn(p.x, p.z, yaw, yaw + Math.PI, ref.y + ly);
    } else {
      player.deck = deckFrame;
      player.spawnOnDeck(p.x, p.z, yaw, yaw + Math.PI, ref.y + ly);
    }
    return toWorld(now, lx, lz, {});
  }

  // ── Each frame ────────────────────────────────────────────────────────────
  // Where she is now, and where she's solid: at the start of the frame,
  // before you move, so that you're carried by where she is this frame (and
  // everything after, that asks where you are on her, asks of the same).
  function place() {
    if (!voyage) return;
    voyage.at(clock(), voy, (i) => !!berths[i]);
    now.known = voy.x !== undefined;
    if (now.known) {
      now.x = voy.x;
      now.z = voy.z;
      now.yaw = voy.yaw;
    }
    if (voy.port !== refPort && berths[voy.port]) setRef(voy.port);
    putShip();
  }
  function putShip() {
    if (!shown) return;
    ship.position.set(now.x, now.y, now.z);
    ship.rotation.y = now.yaw;
  }
  game.addSystem({ name: 'cruise-voyage', phase: 'input', update: place });

  let lastDeck = null;
  let lastRoom = null;
  let wasInside = false;
  let arrived = false;
  let hornHour = -1;
  let elapsed = 0;
  let pierSaid = -1;
  game.addSystem({
    name: 'cruise',
    phase: 'world',
    update({ dt }) {
      elapsed += dt;
      cueText = null;
      // her berths, once what they keep clear of is known
      if (!searches[0] && known(homeWays)) search(0);
      if (site && !searches[1] && mauiRegion) {
        const t = voyage.at(clock(), {}, () => false);
        const bound = (t.to === 1 && t.phase !== 'leaving') || (t.phase === 'docked' && t.port === 1) || t.port === 1;
        if ((elapsed > MAUI_AFTER || bound || Math.hypot(game.focus.x - mauiRegion.x, game.focus.z - mauiRegion.z) < 20000) && known(mauiWays)) search(1);
      }
      if (!voyage) return;
      if (!voy.phase) place();
      // aboard, bound somewhere, the berth there is wanted before she's carried across
      if (voy.to !== null && voy.phase !== 'docked' && searches[voy.to] !== 'done' && (where.onShip || player.deck === deckFrame)) {
        ensure(voy.to);
        place();
      }

      // (where she is now was worked out at the start of the frame: place())
      const docked = voy.phase === 'docked';
      const f = game.focus;
      piersUpdate(f, docked);
      const d = now.known ? Math.hypot(now.x - f.x, now.z - f.z) : Infinity;
      if (d < SHOW) showOutside(true);
      else if (d > HIDE) showOutside(false);
      if (painter && !painter.done && painter.step(PAINT_MS)) surfaces.value = surfaceTexture(painter);
      putShip();
      locate();
      if (!shown) {
        hud.cue(null, 'cruise');
        overhead.intensity = 0;
        heard.inside = heard.club = heard.lido = heard.atrium = heard.lap = heard.underway = 0;
        if (player.deck === deckFrame) player.deck = null;
        return;
      }
      // her decks' solids, one a frame once you're near; in the world while
      // she's alongside, or you're aboard her (or coming back aboard)
      if (d < NEAR + 200 || where.onShip || backAboard) {
        for (let n = FIRST; n <= LAST; n++) {
          if (!decks.has(n)) {
            prepareDeck(n);
            break;
          }
        }
      } else if (d > NEAR + 400 && decks.size && !where.onShip) {
        setSolid(false);
        dropDecks();
      }
      setSolid(allPrepared() && (docked || where.onShip || !!backAboard) && d < NEAR + 400);
      // carried, while she's under way and you're aboard
      if (where.onShip && !docked) player.deck = deckFrame;
      else if (player.deck === deckFrame) player.deck = null;

      // back aboard where you were when you left, once she's solid
      if (backAboard && solid) {
        const a = backAboard;
        backAboard = null;
        standOn(a.x, a.y, a.z, a.yaw);
        locate();
      }

      const night = SKY.uNight.value;
      materials.lit.color.setScalar(0.18 + 0.82 * Math.min(1, night * 1.5));
      materials.backing.color.setScalar(0.35 + 0.2 * (1 - night));
      if (outside.hull.lit) outside.hull.lit.visible = !where.onShip;
      if (outside.hull.backing) outside.hull.backing.visible = !where.onShip;
      outside.wake.update(voy.v || 0, dt);

      // which decks are drawn: yours and those either side of it, inside her
      const want = new Set();
      if (where.onShip) {
        const n = car && car.ride ? deckAt(car.ride.y) : where.deck;
        for (let k = n - 1; k <= n + 1; k++) if (k >= FIRST && k <= 13) want.add(k);
        if (where.room && (where.room.kind === 'atrium' || where.room.kind === 'theatre' || where.room.kind === 'dining')) for (let k = 4; k <= 6; k++) want.add(k);
      } else if (docked && where.pier === voy.port && where.near < ARRIVE * 2) want.add(4);
      for (const n of [...drawn.keys()]) if (!want.has(n)) undraw(n);
      for (const n of want) {
        if (!drawn.has(n) && decks.has(n)) {
          draw(n);
          break; // one a frame
        }
      }
      animateExtras(dt);

      // the welcome, the first time you step aboard; the place on the map
      if (where.onShip && where.room && where.room.id === 'gangway' && where.deck === 4 && !arrived) {
        arrived = true;
        if (!visited) {
          visited = true;
          save.touch();
        }
        if (!yours) welcome();
        else hud.flash(`Welcome back aboard · stateroom ${yours}`, 3500);
        // (and that's what's said: not the room's name over it)
        lastRoom = where.room.id;
        lastDeck = where.deck;
      }
      if (!where.onShip && where.near > ARRIVE * 4) arrived = false;
      if (!where.onShip && where.near < ARRIVE) {
        if (!visited) {
          visited = true;
          save.touch();
        }
        // on a pier: when she's in, or when she sails
        if (pierSaid !== where.pier) {
          pierSaid = where.pier;
          hud.flash(`${PORTS[where.pier].name} · ${schedule(where.pier)}`, 4500);
        }
      } else if (where.near > ARRIVE * 4) pierSaid = -1;

      // saying where you are, as it changes
      if (where.onShip) {
        if (lastDeck !== where.deck) {
          if (lastDeck !== null && !car) hud.flash(deckLine(where.deck), 2600);
          lastDeck = where.deck;
        }
        const rk = where.room ? where.room.id : null;
        if (rk !== lastRoom) {
          const r = where.room;
          if (r && !['corridor', 'lobby', 'stair', 'lift', 'sill', 'passage', 'cabin', 'balcony', 'vestibule'].includes(r.kind) && (!lastRoom || !lastRoom.startsWith(r.kind))) hud.flash(`${r.name || roomName(r.kind)} · deck ${where.deck}`, 2600);
          if (r && r.kind === 'cabin' && r.cabin === yours) hud.flash(`your stateroom · ${describe(cabinByNo(yours))}`, 3600);
          lastRoom = rk;
        }
      } else {
        lastDeck = null;
        lastRoom = null;
      }
      announce(dt);

      // the fog at sea: thick round her, while she's carried across in it
      if (where.onShip && voy.fog > 0) {
        pipeline.haze = Math.max(pipeline.haze, 1 + FOG_HAZE * voy.fog);
        fogHorn -= dt;
        if (voy.fog > 0.5 && fogHorn <= 0) {
          fogHorn = FOG_HORN;
          horn();
        }
      } else fogHorn = 4;

      // the camera, the light and the sound indoors
      if (where.inside && !wasInside) {
        camBefore = camBefore ?? player.camDist;
        player.camDist = Math.min(player.camDist, CAM_IN);
      }
      if (!where.inside && wasInside && camBefore !== null && !car) {
        player.camDist = camBefore;
        camBefore = null;
      }
      wasInside = where.inside;
      overhead.intensity = where.inside ? OVERHEAD.day + (OVERHEAD.night - OVERHEAD.day) * night : 0;
      overhead.position.set(player.pos.x, player.pos.y + OVERHEAD.up, player.pos.z);
      const k = Math.min(1, dt * 3);
      heard.inside += ((where.inside ? 1 : 0) - heard.inside) * k;
      const clubAt = toWorld(now, 0, -112, {});
      const toClub = Math.hypot(player.pos.x - clubAt.x, player.pos.z - clubAt.z);
      const clubDeck = where.onShip ? Math.abs(where.deck - 6) : 9;
      heard.inClub = !!(where.room && where.room.kind === 'club');
      heard.club += ((heard.inClub ? 1 : clubDeck <= 1 && toClub < 40 ? 0.35 * (1 - toClub / 40) : 0) - heard.club) * k;
      heard.lido += ((where.onShip && where.deck >= 14 && !where.inside ? 1 : where.onShip && where.deck >= 13 ? 0.15 : 0) - heard.lido) * k;
      heard.atrium += ((where.room && where.room.kind === 'atrium' ? 1 : 0) - heard.atrium) * k;
      heard.lap += ((!where.onShip && where.near < 120 ? 1 - where.near / 120 : where.onShip && where.deck <= 6 && !where.inside ? 0.4 : 0) - heard.lap) * k;
      // under way: her engines working, the wind over her open decks, the water going by
      heard.underway += ((where.onShip || d < 300 ? Math.min(1, (voy.v || 0) / FULL_SPEED) : 0) - heard.underway) * k;
      heard.deck = where.onShip && !where.inside ? 1 : 0;
      if (heard.inside > 0.01) sound.setEnclosed(Math.max(sound.enclosed || 0, QUIET * heard.inside));

      // her horn, on the hour, alongside
      const hour = Math.floor(game.sky ? game.sky.hours : 0);
      if (docked && HORN_HOURS.includes(hour) && hour !== hornHour && d < 2000) {
        hornHour = hour;
        horn();
      }
      if (!HORN_HOURS.includes(hour)) hornHour = -1;

      // what you can do here
      if (where.onShip) {
        doors(dt);
        lifts(dt);
        slides();
        cabinsNear();
      } else if (car) leaveCar();
      slideOn();
      hud.cue(cueText ? { html: cueText } : null, 'cruise');
    },
  });

  function cabinsNear() {
    const n = where.deck;
    if (!isCabinDeck(n)) {
      for (const [no, f] of furnished) if (f.deck !== n) unfurnish(no);
      return;
    }
    const near = [];
    for (const c of cabinsOn(n)) {
      const dd = Math.hypot(where.x - c.door.x, where.z - c.door.z);
      const inIt = where.room && where.room.cabin === c.no;
      if (dd < CABIN_NEAR || inIt) near.push([inIt ? -1 : dd, c.no]);
    }
    near.sort((a, b) => a[0] - b[0]);
    const keep = new Set(near.slice(0, CABINS_KEPT).map(([, no]) => no));
    for (const no of [...furnished.keys()]) if (!keep.has(no)) unfurnish(no);
    // one a frame
    for (const no of keep) {
      if (!furnished.has(no)) {
        furnish(no);
        break;
      }
    }
  }

  builder.idleWhile(() => where.onShip);
  commands.describe({ group: 'CRUISE SHIP', help: 'click', pad: ['PadRT'], label: 'aboard: open a stateroom door · the buttons in a lift · down a slide' });
  commands.describe({ group: 'CRUISE SHIP', help: 'W S', pad: ['PadLS'], label: 'in a lift: choose a deck' });

  // ── From the console ──────────────────────────────────────────────────────
  game.provide('cruise', {
    get site() {
      return site;
    },
    get berths() {
      return berths.slice();
    },
    // port i's berth (0 home, 1 Maui), or null if there's none: found now if
    // it hasn't been, or with wait = false, undefined until it has (for
    // what's grown after her to keep clear of)
    berth: (i, wait = true) => (!from[i] ? null : wait ? ensure(i) : searches[i] === 'done' ? berths[i] : undefined),
    // how the looking for each berth is going: 'waiting' (for the airfields
    // in its way), 'looking', 'done'
    get searches() {
      return searches.map((sr) => (sr === 'done' ? 'done' : sr ? 'looking' : 'waiting'));
    },
    get where() {
      return { onShip: where.onShip, deck: where.deck, room: where.room && (where.room.name || roomName(where.room.kind)), roomId: where.room && where.room.id, x: where.x, z: where.z, y: where.y, inside: where.inside, pier: where.pier, near: where.near };
    },
    get voyage() {
      if (!voyage) return null;
      const v = voyage.at(clock(), {}, () => false);
      return { phase: v.phase, port: PORTS[v.port].id, to: v.to === null ? null : PORTS[v.to].id, left: Math.round(v.left), fog: v.fog, carried: player.deck === deckFrame, solid };
    },
    // move the clock on (or back) so that her next sailing from the port
    // she's at ('sails'), or her next arrival anywhere ('arrives'), is s off
    soon(what = 'sails', s = 5) {
      if (!voyage) return null;
      const t = clock();
      const v = voyage.at(t, {}, () => false);
      let at;
      if (what === 'sails') at = voyage.next(t, v.port).sails;
      else if (what === 'arrives') at = voyage.next(t, v.phase === 'docked' ? 1 - v.port : v.to).arrives;
      else if (what === 'home') at = voyage.next(t, 0).arrives;
      else if (what === 'fog') {
        // the thick of her next fog: when she's carried across
        for (let u = t; u < t + 2 * 3600; u += 2) {
          if (voyage.at(u, {}, () => false).fog > 0.99) {
            at = u + SEA_FOG / 2;
            break;
          }
        }
      } else return null;
      if (at === undefined) return null;
      shift += at - s - t;
      return Math.round(shift);
    },
    get yours() {
      return yours;
    },
    get ready() {
      return shown && allPrepared() && solid;
    },
    get drawn() {
      return [...drawn.keys()].sort((a, b) => a - b);
    },
    get car() {
      return car && { core: car.core.id, deck: car.deck, state: car.state, pick: car.pick, to: car.to };
    },
    get slide() {
      return slide && { t: slide.ride.t, d: slide.ride.d, v: slide.ride.v };
    },
    // stand at the foot of a pier's gangway, facing it (0: home, 1: Maui)
    async go(port = 0) {
      const b = berths[port];
      if (!b) return null;
      await game.api.teleport(b.door.x, b.door.z, b.door.yaw);
      return { x: b.door.x, z: b.door.z };
    },
    // stand just inside the door in her side, facing in
    async board() {
      if (!voyage) return null;
      const v = voyage.at(clock(), {}, () => false);
      await this.go(v.port);
      await until(() => allPrepared());
      return standOn(inner(-24, -20) - 1.5, deckY(4), -22, -Math.PI / 2);
    },
    // stand in the lobby of a core on deck n, facing its lifts
    toDeck(n, core = 'mid') {
      const c = CORES.find((k) => k.id === core) || CORES[1];
      return standOn(0, deckY(n), c.z, 0);
    },
    // in the corridor outside a stateroom's door, facing it
    toCabin(no) {
      const c = cabinByNo(no);
      if (!c) return null;
      // facing her +x is a quarter turn from her bow; −x, the other way
      return standOn(c.door.x - c.door.nx * 0.9, deckY(c.deck), c.door.z, c.door.nx > 0 ? Math.PI / 2 : -Math.PI / 2);
    },
    // stand on the tower's platform by a slide
    toSlide(id = 'corkscrew') {
      const s = outside && outside.lido.starts.find((k) => k.slide.id === id);
      if (!s) return null;
      const back = 0.6;
      return standOn(s.x - Math.sin(s.yaw) * back, s.y, s.z - Math.cos(s.yaw) * back, s.yaw);
    },
    // skip to the last moments of a lift ride, or a slide (so a play-through needn't wait)
    hurry() {
      if (car && car.ride) {
        const r = car.ride;
        const end = 2 * LIFT.doors + 2 * LIFT.settle + r.moving;
        while (r.t < end - LIFT.doors - 0.2) r.update(0.05);
        return 'lift';
      }
      if (slide) {
        slide.ride.d = Math.max(slide.ride.d, slide.ride.p.len - 3);
        return 'slide';
      }
      return null;
    },
    doorOpen: (n, i) => doorOf(n, i).open,
    basins: () => (outside ? outside.lido.pools.map((p) => p.p.id) : []),
  });
}

// ── Helpers ──────────────────────────────────────────────────────────────────

// How high over her waterline a saved place aboard is (m): its deck and how
// far over that deck's floor; or, saved before it said its deck, its height
// over the waterline when her decks were OLD_DECK_H apart, put on the same
// deck now.
const OLD_DECK_H = 3; // m
function aboardHeight(a) {
  if (Number.isInteger(a.deck) && a.deck >= FIRST && a.deck <= LAST) return deckY(a.deck) + (Number.isFinite(a.up) ? a.up : 0);
  if (!Number.isFinite(a.y)) return NaN;
  const n = Math.max(FIRST, Math.min(LAST, Math.floor((a.y - deckY(FIRST) + 0.6) / OLD_DECK_H) + FIRST));
  return deckY(n) + (a.y - deckY(FIRST) - (n - FIRST) * OLD_DECK_H);
}

const round = (v, k = 100) => Math.round(v * k) / k;
const titleCase = (s) => s.charAt(0) + s.slice(1).toLowerCase();
const until = (fn) =>
  new Promise((resolve) => {
    const tick = () => (fn() ? resolve() : requestAnimationFrame(tick));
    tick();
  });

// A ray from o along d (unit) against a box [x0, y0, z0, x1, y1, z1]: how far
// along it first goes in (0 if it starts inside), or Infinity.
function rayAabb(o, d, b, far) {
  let t0 = 0;
  let t1 = far;
  for (let a = 0; a < 3; a++) {
    const lo = b[a];
    const hi = b[a + 3];
    if (Math.abs(d[a]) < 1e-9) {
      if (o[a] < lo || o[a] > hi) return Infinity;
      continue;
    }
    let u = (lo - o[a]) / d[a];
    let v = (hi - o[a]) / d[a];
    if (u > v) [u, v] = [v, u];
    if (u > t0) t0 = u;
    if (v < t1) t1 = v;
    if (t0 > t1) return Infinity;
  }
  return t0;
}

// The teak of her decks: planks along her, a 4 m tile of them, drawn once.
function teakTexture() {
  const W = 32;
  const H = 128;
  const data = new Uint8Array(W * H * 4);
  const rnd = mulberry32(0x7eac);
  const planks = 8;
  for (let p = 0; p < planks; p++) {
    const shade = 0.85 + rnd() * 0.25;
    const joint = Math.floor(rnd() * H);
    for (let y = 0; y < H; y++) {
      for (let x = (p * W) / planks; x < ((p + 1) * W) / planks; x++) {
        const seam = x === (p * W) / planks || y === joint;
        const grain = 0.94 + 0.06 * Math.sin(y * 0.7 + p * 3 + Math.sin(x * 1.3) * 2);
        const k = seam ? 0.35 : shade * grain;
        const i = (y * W + x) * 4;
        data[i] = Math.min(255, 255 * k);
        data[i + 1] = Math.min(255, 238 * k);
        data[i + 2] = Math.min(255, 220 * k);
        data[i + 3] = 255;
      }
    }
  }
  const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}
