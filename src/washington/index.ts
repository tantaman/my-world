// Washington, DC, life size, round the zoo: every building in the District
// with the roof the city's lidar survey traced for it, every road, alley,
// car park and sidewalk as the city surveyed it from the air, its bridges
// and its street trees, on its real ground (a real place in world/hikes.js,
// `washington-dc`: life size, placed from the zoo so the two line up, its
// tidal rivers at the sea's level). `npm run dc` (tools/dc.mjs) brings it in.
//
// This plugs it into the game: which tiles of it are stood up round you (a
// tile 500 m square: codec.js), fetched as you come near and taken down as
// you leave, built a few milliseconds at a time out of the frame's allowance
// for work that can wait; the forest kept off what's built and paved; what
// you bump into, and what its streets are made of underfoot; its landmarks
// on the map, to go to; and which of them you've been to. What builds a tile
// is fetched the first time one is wanted (core/lazy.ts):
//
//   city.js      (written by the importer) which tiles there are; the landmarks
//   codec.js     a tile as it's kept, and read back
//   pictures.js  the city in your pack
//   onMap.js     the city on the map, close up: its streets and roofs
//   look.js      (fetched) a CityTile: everything on a tile stood up, and what's where on it
//     buildings.js  the buildings: their surveyed roofs, their walls, their fronts
//     paving.js     the roads, sidewalks and curbs; the bridges
//     trees.js      the street trees
//     batch.js      geometry written straight into arrays
//   tiles/       (written by the importer; each fetched) the tiles
//
// From the console:
//   world.washington.landmarks()     the landmarks, and whether you've been
//   await world.washington.go(id)    to one of them (the Capitol, if none is said)
//   world.washington.tiles()         the tiles stood up, those being built, whether all near you are up
//   world.washington.decks()         the bridges' decks on those: where each runs, how high
//   world.washington.at(x, z)        what's there: 'a building', 'paving' or null
//   await world.washington.standUp(x, z)   the tiles there, stood up now

import type { Game } from '../game/game.ts';
import { lazy } from '../core/lazy.ts';
import { CONFIG } from '../config.js';
import { formatDistance } from '../core/format.js';
import { VEG_STRIDE } from '../world/flora.js';
import { inflate } from '../world/earth.js';
import { CITY } from './city.js';
import * as pictures from './pictures.js';
import { drawCity } from './onMap.js';

type CityTile = import('./look.js').CityTile;

declare module '../game/game.ts' {
  interface Services {
    washington: WashingtonService;
  }
}
interface WashingtonService {
  landmarks(): Array<{ id: string; name: string; been: boolean }>;
  go(id?: string): Promise<boolean>;
  tiles(): { up: string[]; distant: string[]; building: string[]; settled: boolean };
  decks(): Array<{ a: number[]; b: number[]; half: number }>;
  at(x: number, z: number): string | null;
  standUp(x: number, z: number): Promise<void>;
}
interface Landmark {
  id: string;
  name: string;
  words: string;
  x: number;
  z: number;
  at: number[];
  yaw: number;
  open?: boolean;
}

// m to a tile's edge. Keep a band between loading and unloading so the
// meshes aren't rebuilt repeatedly while you move along a tile boundary.
const NEAR = Math.min(700, 500 * CONFIG.viewRadius / 4);
const FAR = CONFIG.cityView;
const BUFFER = 150;
const LOD = [400, 750];
// tiles fetched at once, at most
const FETCHING = 3;
// m round where you're set down (left standing; going to a landmark) that's
// stood up before you're there: what's under you, and what's in view
const UNDER = 60;
const IN_VIEW = 300;
const VIEW_PITCH = -0.035; // landmarks are framed just above eye level
const CAPITOL_PITCH = -0.22;
const CATHEDRAL_VIEW = { x: -4993, z: -4017, yaw: 2.36, pitch: -0.31 };
// m from a landmark's spot that counts as having been there
const BEEN = 40;
const ID = 'washington:';
// On the map's badge: the Capitol's dome.
const GLYPH = ['...#...', '..###..', '.#####.', '.#####.', '#######', '#.#.#.#', '#######'];

export const after = ['render', 'ui', 'world', 'player', 'build', 'map', 'save'];
export function installWashington(game: Game) {
  const { scene, gen, chunks, grass, solids, paved, landforms, player, builder, map, hud, commands, save, materials } = game;
  const card = landforms.cards.find((c: { id: string }) => c.id === CITY.place);
  if (!card) return;
  const zooGround = landforms.cards.find((c: { id: string }) => c.id === 'national-zoo');
  const [cx, cz] = card.at;
  const T = CITY.tile;
  const exists = new Set(CITY.tiles.split(' '));
  const boxes = new Map([...exists].map((name) => {
    const [i, j] = name.split('_').map(Number);
    return [name, [cx + i * T, cz + j * T, cx + (i + 1) * T, cz + (j + 1) * T]];
  }));
  const boxOf = (name: string) => boxes.get(name)!;
  const fromBox = (b: number[], x: number, z: number) => Math.hypot(Math.max(b[0] - x, 0, x - b[2]), Math.max(b[1] - z, 0, z - b[3]));
  const finerGround = (name: string) => !!zooGround && fromBox(boxOf(name), zooGround.at[0], zooGround.at[1]) < zooGround.radius + zooGround.fade;
  const landmarks: Landmark[] = CITY.landmarks;
  const spot = (m: Landmark) => {
    if (m.id === 'national-cathedral') return { ...CATHEDRAL_VIEW, x: cx + CATHEDRAL_VIEW.x, z: cz + CATHEDRAL_VIEW.z };
    return { x: cx + m.at[0], z: cz + m.at[1], yaw: m.yaw, pitch: m.id === 'capitol' ? CAPITOL_PITCH : VIEW_PITCH };
  };

  // ── What's yours: the landmarks you've been to ─────────────────────────────
  const been = new Set<string>();
  save.register({
    id: 'washington',
    scope: 'yours',
    local: 'marks',
    collect: () => ({ been: [...been] }),
    validate: (r: { been?: unknown }) => ({ been: Array.isArray(r?.been) ? r.been.filter((s: unknown) => typeof s === 'string' && s.length < 60) : [] }),
    restore(r: { been: string[] }) {
      been.clear();
      for (const s of r.been) been.add(s);
      // (left standing in the city, on a bridge, say: it has to be there to be stood on)
      const a = player.arrival;
      if (a && Math.hypot(a.x - cx, a.z - cz) < card.radius + card.fade) game.beforeArrival(standUpAt(a.x, a.z));
    },
  });

  // ── Standing it up ─────────────────────────────────────────────────────────
  // A tile is fetched, then built a little at a time out of the frame's
  // allowance for work that can wait (game/budget.ts), and put up when it's
  // all built.
  const look = lazy(() => import('./look.js'));
  let mats: ReturnType<typeof import('./look.js').makeMaterials> | null = null;
  const up = new Map<string, CityTile>(); // detailed, with gameplay data
  const distant = new Map<string, CityTile>(); // simpler city beyond the detailed tiles
  const building = new Map<string, CityTile>(); // being built
  const fetching = new Map<string, Promise<Uint8Array>>(); // on the way
  const fetched = new Map<string, Uint8Array>(); // available for either level of detail
  const failed = new Map<string, number>(); // name -> when it can be asked for again
  const land = () => gen.landforms.find((l: { id: string }) => l.id === CITY.place);

  function fetchTile(name: string) {
    const bytes = fetched.get(name);
    if (bytes) return Promise.resolve(bytes);
    let p = fetching.get(name);
    if (p) return p;
    p = import(`./tiles/${name}.js`)
      .then((m) => inflate(m.default))
      .then(
        (bytes: Uint8Array) => {
          fetching.delete(name);
          fetched.set(name, bytes);
          return bytes;
        },
        (err: unknown) => {
          fetching.delete(name);
          failed.set(name, performance.now() + 15000);
          throw err;
        },
      );
    p.catch(() => {});
    fetching.set(name, p);
    return p;
  }
  function startBuilding(name: string, detail: boolean, bytes = fetched.get(name)) {
    const m = look.want();
    const L = land();
    if (!m || !L || !bytes) return null;
    const finePaving = detail && finerGround(name);
    if (finePaving && zooGround && !landforms.has(zooGround.id)) {
      landforms.ensure(zooGround.id).catch(() => {});
      return null;
    }
    building.get(name)?.dispose();
    fetched.set(name, bytes);
    if (!mats) mats = m.makeMaterials();
    const [x0, z0] = boxOf(name);
    const t = new m.CityTile({
      key: name,
      corner: [x0, z0],
      bytes,
      ground: detail ? (x, z) => gen.height(x, z) : (x, z) => L.ground(x, z) + L.offset,
      offset: L.offset,
      names: (k: number) => CITY.names[k],
      materials: mats,
      trees: { models: chunks.models, material: materials.vegetation, shadow: materials.vegetationShadow },
      seed: x0 * 31 + z0,
      detail,
      finePaving,
      cityCorner: [x0 - cx, z0 - cz],
      // Each copy still positions the local street polygons on the deck.
      // Only the tile containing the midpoint draws it.
      ownsDeck: (x, z) => name === `${Math.floor((x0 - cx + x) / T)}_${Math.floor((z0 - cz + z) / T)}`,
    });
    building.set(name, t);
    return t;
  }
  function putUp(t: CityTile) {
    building.delete(t.key);
    removeTile(distant, t.key);
    if (!t.detail) {
      removeTile(up, t.key);
      distant.set(t.key, t);
      scene.add(t.group);
      return;
    }
    up.set(t.key, t);
    scene.add(t.group);
    solids.set(`${ID}${t.key}`, t.solids);
    // the plants already grown there, and the grass
    for (const ch of chunks.chunks.values()) clearChunk(ch, [t]);
    grass.invalidate(...t.box);
  }
  function removeTile(tiles: Map<string, CityTile>, name: string) {
    const t = tiles.get(name);
    if (!t) return;
    scene.remove(t.group);
    if (tiles === up) solids.clear(`${ID}${name}`);
    t.dispose();
    tiles.delete(name);
  }
  // The tiles under (x, z) and round it (within r m), stood up now, not a
  // little at a time: you're about to be there.
  async function standUpAt(x: number, z: number, r = UNDER) {
    if (!landforms.has(CITY.place)) await landforms.ensure(CITY.place);
    await look.ready();
    const names = [...exists].filter((n) => fromBox(boxOf(n), x, z) < r);
    if (zooGround && names.some(finerGround) && !landforms.has(zooGround.id)) await landforms.ensure(zooGround.id);
    // (each from what came for it here: until you're there, the frame takes
    // down whatever's far from you, what's been fetched for there included)
    const bytes = await Promise.all(names.map(fetchTile));
    for (const [k, n] of names.entries()) {
      if (up.has(n)) continue;
      const queued = building.get(n);
      const t = queued?.detail ? queued : startBuilding(n, true, bytes[k]);
      if (!t) continue;
      t.pump(Infinity);
      putUp(t);
    }
  }
  let buildTurn = 0;
  game.budget.add({
    name: 'washington',
    pressing: () => building.size > 0,
    work(ms: number) {
      // Build the nearest in each tier. Give the skyline a turn while the
      // denser street meshes are being built.
      const preferDetail = buildTurn++ % 3 !== 0;
      const { x, z } = player.pos;
      const fx = -Math.sin(player.camYaw);
      const fz = -Math.cos(player.camYaw);
      let best: CityTile | null = null;
      let bd = Infinity;
      for (const t of building.values()) {
        const distance = fromBox(boxOf(t.key), x, z);
        const dx = t.corner[0] + T / 2 - x;
        const dz = t.corner[1] + T / 2 - z;
        const ahead = (dx * fx + dz * fz) / (Math.hypot(dx, dz) || 1);
        const priority = t.detail ? distance : distance * (1.15 - ahead * 0.55);
        const d = priority + (t.detail === preferDetail || (t.detail && distance < UNDER) ? 0 : FAR * 2);
        if (d < bd) [best, bd] = [t, d];
      }
      if (!best) return false;
      if (best.pump(ms)) return true;
      putUp(best);
      return building.size > 0;
    },
  });

  // ── The forest round it ────────────────────────────────────────────────────
  // No tree in a building or on a street, none hard against a wall, no grass
  // on the paving. (Chunks grown before a tile is stood up are gone over when it is.)
  const SMALL = new Set(['bush', 'fern']);
  function clearChunk(ch: { cx: number; cz: number; vegLists?: Record<string, Float32Array | number[]> }, tiles: Iterable<CityTile> = up.values()) {
    if (!ch.vegLists) return;
    const S = chunks.size;
    const [x0, z0, x1, z1] = [ch.cx * S, ch.cz * S, (ch.cx + 1) * S, (ch.cz + 1) * S];
    const over = [...tiles].filter((t) => t.ready && x0 < t.box[2] && x1 > t.box[0] && z0 < t.box[3] && z1 > t.box[1]);
    if (!over.length) return;
    for (const kind in ch.vegLists) {
      const list = ch.vegLists[kind];
      const small = SMALL.has(kind);
      for (let o = 0, k = 0; o < list.length; o += VEG_STRIDE, k++) {
        if (list[o + 4] <= 0) continue;
        const [x, z] = [list[o], list[o + 2]];
        if (over.some((t) => x >= t.box[0] && x < t.box[2] && z >= t.box[1] && z < t.box[3] && t.clears(x, z, small))) chunks.hideInstance(ch, kind, k);
      }
    }
  }
  chunks.on('vegetation', (ch: Parameters<typeof clearChunk>[0]) => clearChunk(ch));
  grass.addClearing((x0: number, z0: number, x1: number, z1: number) => {
    const over = [...up.values()].filter((t) => x0 < t.box[2] && x1 > t.box[0] && z0 < t.box[3] && z1 > t.box[1]);
    if (!over.length) return null;
    return (x: number, y: number) => over.some((t) => t.bare(x, y));
  });
  // Its streets say what they're paved with (world/paved.ts), for whatever
  // asks what's underfoot: the paving is laid on the graded ground itself,
  // so there's nothing solid there to say it, and without this a street
  // sounds like grass and a skateboard's wheels dig into it.
  paved.addSource((x: number, z: number) => {
    for (const t of up.values()) {
      const made = t.paving(x, z);
      if (made) return made;
    }
    return null;
  });
  // A builder's tools go round its buildings.
  builder.obstacles.addSource((x: number, z: number, R: number, out: unknown[]) => {
    for (const t of up.values()) {
      if (fromBox(t.box, x, z) > R + 60) continue;
      for (const o of t.obstacles) {
        if (Math.hypot(o.x - x, o.z - z) > R + o.r + 1) continue;
        out.push({ x: o.x, z: o.z, what: o.what, dig: o.r + 0.3, wall: o.r + 0.2, footing: o.r + 0.5, roof: o.r, grown: true });
      }
    }
  });

  // The camera doesn't look through a wall from the far side of it: where
  // one is between you and it, it comes in to this side.
  player.cameraBlockers.push((o: { x: number; y: number; z: number }, dir: { x: number; y: number; z: number }, max: number) => {
    if (!up.size) return Infinity;
    let best = Infinity;
    solids.forEachNear(o.x + (dir.x * max) / 2, o.z + (dir.z * max) / 2, max / 2 + 1, (s: { wall?: boolean; ax: number; az: number; bx: number; bz: number; bottom: number; topA: number; topB: number }) => {
      if (!s.wall) return;
      const [sx, sz] = [s.bx - s.ax, s.bz - s.az];
      const den = dir.x * sz - dir.z * sx;
      if (Math.abs(den) < 1e-9) return;
      const [qx, qz] = [s.ax - o.x, s.az - o.z];
      const t = (qx * sz - qz * sx) / den;
      const u = (qx * dir.z - qz * dir.x) / den;
      if (t <= 0 || t >= best || t > max || u < 0 || u > 1) return;
      const y = o.y + dir.y * t;
      if (y >= s.bottom && y <= s.topA + (s.topB - s.topA) * u) best = t;
    });
    return best;
  });

  // ── On the map ─────────────────────────────────────────────────────────────
  // Each landmark, where it's arrived at; and, close up, the streets and the
  // roofs of what's stood up.
  const place = (m: Landmark) => {
    const s = spot(m);
    return {
      id: `${ID}${m.id}`,
      x: s.x,
      z: s.z,
      yaw: s.yaw,
      pitch: s.pitch,
      name: m.name,
      kind: 'Washington',
      note: `in Washington, DC, life size${been.has(m.id) ? ' · been' : ''}`,
      words: `washington dc ${m.words}`,
      glyph: GLYPH,
      visited: been.has(m.id),
    };
  };
  const all = () => landmarks.map(place);
  map.addLayer((pen: Parameters<typeof drawCity>[0]) => drawCity(pen, [...up.values()]));
  map.places.addSource({
    list: 'washington',
    destinations: all,
    within: (x0: number, z0: number, x1: number, z1: number) => all().filter((p) => p.x >= x0 && p.x <= x1 && p.z >= z0 && p.z <= z1),
    get: (id: string) => all().find((p) => p.id === id) || null,
  });

  // ── Getting there ──────────────────────────────────────────────────────────
  const capitol = landmarks.find((m) => m.id === 'capitol') || landmarks[0];
  commands.add({
    id: 'washington',
    group: 'WASHINGTON',
    label: 'Washington, DC: where it is',
    icon: pictures.DOME,
    run() {
      const c = spot(capitol);
      const d = Math.hypot(player.pos.x - c.x, player.pos.z - c.z);
      const inside = Math.hypot(player.pos.x - cx, player.pos.z - cz) < card.radius;
      hud.flash(inside ? `Washington, DC, life size: the Capitol is ${formatDistance(d)} off · its landmarks are on the map, under Washington` : `Washington, DC is ${formatDistance(d)} off, round the National Zoo · it's on the map, under Washington`, 6000);
      return true;
    },
  });
  async function go(id?: string) {
    const m = id ? landmarks.find((q) => q.id === id || `${ID}${q.id}` === id) : capitol;
    if (!m) throw new Error(`no landmark called ${id}: try world.washington.landmarks()`);
    const s = spot(m);
    // (and what you'll see from there: the landmark itself, whatever's round it)
    await standUpAt(s.x, s.z, IN_VIEW);
    player.camPitch = s.pitch;
    player.spawn(s.x, s.z, s.yaw, s.yaw + Math.PI);
    return true;
  }

  // Whether every tile near enough to want is stood up.
  const settled = () => {
    const { x, z } = player.pos;
    for (const name of exists) if (!up.has(name) && fromBox(boxOf(name), x, z) < NEAR) return false;
    return true;
  };

  // ── Each frame ─────────────────────────────────────────────────────────────
  let lastLod = 0;
  game.addSystem({
    name: 'washington',
    phase: 'world',
    update({ now }) {
      const { x, z } = player.pos;
      const inCity = Math.hypot(x - cx, z - cz) < card.radius + card.fade + FAR + BUFFER;
      // the tiles wanted: those near enough, here
      if (inCity && landforms.has(CITY.place)) {
        const want: Array<[string, number]> = [];
        const [i0, j0] = [Math.floor((x - FAR - cx) / T), Math.floor((z - FAR - cz) / T)];
        const [i1, j1] = [Math.floor((x + FAR - cx) / T), Math.floor((z + FAR - cz) / T)];
        for (let i = i0; i <= i1; i++) {
          for (let j = j0; j <= j1; j++) {
            const name = `${i}_${j}`;
            if (!exists.has(name)) continue;
            const d = fromBox(boxOf(name), x, z);
            if (d < FAR) want.push([name, d]);
          }
        }
        want.sort((a, b) => a[1] - b[1]);
        if (want.length) look.want();
        for (const [name, d] of want) {
          const current = up.get(name) || distant.get(name);
          const queued = building.get(name);
          const detail = d < NEAR || (d < NEAR + BUFFER && (up.has(name) || queued?.detail === true));
          if (current?.detail === detail) {
            if (queued && queued.detail !== detail) removeTile(building, name);
            continue;
          }
          if (queued?.detail === detail) continue;
          if (fetched.has(name)) startBuilding(name, detail);
          else if (fetching.size < FETCHING && !fetching.has(name) && !((failed.get(name) || 0) > now)) fetchTile(name);
        }
      }
      // and those gone too far
      for (const name of fetched.keys()) {
        if (inCity && fromBox(boxOf(name), x, z) <= FAR + BUFFER) continue;
        removeTile(building, name);
        removeTile(up, name);
        removeTile(distant, name);
        fetched.delete(name);
      }
      // the trees drawn finer nearer, a few times a second
      if (now - lastLod > 300) {
        lastLod = now;
        for (const t of up.values()) {
          const d = Math.hypot(x - t.corner[0] - T / 2, z - t.corner[1] - T / 2);
          t.lod(d < LOD[0] ? 0 : d < LOD[1] ? 1 : 2);
        }
      }
      // the landmarks you've been to
      for (const m of landmarks) {
        if (been.has(m.id)) continue;
        const s = spot(m);
        if (Math.abs(x - s.x) > BEEN || Math.abs(z - s.z) > BEEN || Math.hypot(x - s.x, z - s.z) > BEEN) continue;
        been.add(m.id);
        hud.flash(`${m.name} · ${been.size} of Washington's ${landmarks.length} landmarks`, 3500);
        save.touch();
      }
    },
  });

  game.provide('washington', {
    landmarks: () => landmarks.map((m) => ({ id: m.id, name: m.name, been: been.has(m.id) })),
    go,
    tiles: () => ({ up: [...up.keys()], distant: [...distant.keys()], building: [...building.keys()], settled: settled() }),
    decks: () => [...up.values()].flatMap((t) => t.decks),
    at(x: number, z: number) {
      for (const t of up.values()) {
        const u = t.use(x, z);
        if (u) return u & 1 ? 'a building' : 'paving';
      }
      return null;
    },
    standUp: standUpAt,
  });
}
