// The National Zoo: the Smithsonian's National Zoological Park, in Rock Creek
// Park in Washington, DC, life size, where it really is. Its ground is a real
// place brought in at 1 : 1 (world/hikes.js: the USGS's lidar, Rock Creek,
// the pools and the moat round Lion/Tiger Hill); its buildings stand as the
// city surveyed them, roofs and all; its exhibits, paths, walls and fences
// are OpenStreetMap's; and in the exhibits are the animals (`npm run zoo`,
// tools/zoo.mjs, brings it in).
//
// This plugs it into the game: where it is, standing it up as you come near
// and taking it down as you leave, the forest kept off it, its place on the
// map with each exhibit, and which animals you've seen there. What it's
// built from, and everything that builds it, is fetched when you first come
// near (core/lazy.ts), not at the start:
//
//   exhibits.js  (written by the importer) each exhibit, and where it's seen from
//   pictures.js  the zoo in your pack
//   sound.js     its animals' voices: a lion's roar, an elephant's trumpet, a sea lion's honk
//   onMap.js     the zoo on the map, close up: its pens, paths and buildings and on the map
//   look.js      (fetched) a Zoo: everything stood up, and what the forest keeps off
//     plan.js      (written by the importer) what it's built from
//     site.js      the plan laid out in the world: what's on each square metre, the pens
//     buildings.js the buildings: their surveyed roofs, walls and windows
//     grounds.js   the paths, plazas and footbridges; benches, kiosks, statues
//     fences.js    walls and fences, round the pens and as the map draws them; the signs
//     species.js   who lives there: what each looks like, how many, what fence
//     bodies.js    their bodies
//     residents.js the animals in their pens: where they go, what they do
//
// From the console:
//   world.zoo.exhibits()          the exhibits, and whether each has animals out
//   await world.zoo.go(id?)       to the entrance on Connecticut Avenue, or an exhibit
//   world.zoo.built               the zoo, while it's stood up (null when it isn't)
//   world.zoo.seen                the kinds of animal you've seen there

import type { Game } from '../game/game.ts';
import { lazy } from '../core/lazy.ts';
import { formatDistance } from '../core/format.js';
import { VEG_STRIDE } from '../world/flora.js';
import { ZOO } from './exhibits.js';
import * as pictures from './pictures.js';
import { drawZoo } from './onMap.js';
import './sound.js';

type Zoo = import('./look.js').Zoo;

declare module '../game/game.ts' {
  interface Services {
    zoo: ZooService;
  }
}
interface ZooService {
  exhibits(): Array<{ id: string; name: string; animals: number }>;
  go(id?: string): Promise<boolean>;
  readonly built: Zoo | null;
  readonly seen: string[];
}

// m from the zoo's middle: nearer than WANT, what builds it is sent for;
// nearer than SHOW it's stood up, and past HIDE taken down.
const WANT = 3000;
const SHOW = 1700;
const HIDE = 2100;
// m from an animal that counts as having seen it
const SEE = 22;
const ID = 'zoo:';
// On the map's badge: an elephant, trunk down.
const GLYPH = ['.......', '.####..', '######.', '######.', '##.##.#', '##.##..', '.......'];

export const after = ['render', 'ui', 'world', 'player', 'audio', 'build', 'map', 'save'];
export function installZoo(game: Game) {
  const { scene, camera, gen, chunks, grass, solids, paved, landforms, player, builder, map, hud, commands, save, sound } = game;
  const card = landforms.cards.find((c: { id: string }) => c.id === ZOO.hike);
  if (!card) return;
  const [cx, cz] = card.at;
  // the way in: the top of Olmsted Walk, at the Connecticut Avenue entrance
  const gate = { x: cx + card.trailhead.x, z: cz + card.trailhead.z, yaw: card.trailhead.yaw };

  // ── What's yours: the animals you've seen there ───────────────────────────
  const seen = new Set<string>();
  save.register({
    id: 'zoo',
    scope: 'yours',
    local: 'marks',
    collect: () => ({ seen: [...seen] }),
    validate: (r: { seen?: unknown }) => ({ seen: Array.isArray(r?.seen) ? r.seen.filter((s: unknown) => typeof s === 'string' && s.length < 60) : [] }),
    restore(r: { seen: string[] }) {
      seen.clear();
      for (const s of r.seen) seen.add(s);
      // (set down on a footbridge there, it has to be there to be set down on)
      const a = player.arrival;
      if (a && Math.hypot(a.x - cx, a.z - cz) < SHOW) game.beforeArrival(look.ready());
    },
  });

  // ── Standing it up ─────────────────────────────────────────────────────────
  // Built a little at a time, out of the frame's allowance for work that can
  // wait (game/budget.ts), and put up when it's all built.
  const look = lazy(() => import('./look.js'));
  let built: Zoo | null = null; // up
  let building: Zoo | null = null; // being built
  function standUp() {
    const L = gen.landforms.find((l: { id: string }) => l.id === ZOO.hike);
    const m = look.want();
    if (!L || !m) return;
    const ground = (x: number, z: number) => gen.height(x, z);
    // the land's own water: its pools and moats, and its streams
    const wet = (x: number, z: number) => L.waterNear(x, z) < 0;
    const water = (x: number, z: number) => {
      const [level, sea] = [L.level, L.sea]; // (shore() sets these: put back)
      const d = L.shore(x, z);
      const at = L.level + L.offset;
      [L.level, L.sea] = [level, sea];
      return d < 0 ? at : NaN;
    };
    building = new m.Zoo({ card, offset: L.offset, ground, wet, water });
    // its animals' voices, heard from where they are
    building.on('call', (c: { kind: string; x: number; y: number; z: number }) => sound.call(c.kind, c.x, c.y, c.z));
  }
  function putUp(z: Zoo) {
    built = z;
    building = null;
    scene.add(z.group);
    for (const [k, list] of Object.entries(z.solids)) solids.set(`zoo:${k}`, list);
    // the plants already grown there, and the grass
    for (const ch of chunks.chunks.values()) clearChunk(ch);
    const [x0, z0, x1, z1] = z.site.box;
    grass.invalidate(x0, z0, x1, z1);
  }
  function takeDown() {
    if (building) building.dispose();
    building = null;
    if (!built) return;
    scene.remove(built.group);
    for (const k of Object.keys(built.solids)) solids.clear(`zoo:${k}`);
    built.dispose();
    built = null;
  }
  game.budget.add({
    name: 'zoo',
    work(ms: number) {
      if (!building) return false;
      if (building.pump(ms)) return true;
      putUp(building);
      return false;
    },
  });

  // ── The forest round it ────────────────────────────────────────────────────
  // No tree in a building, no bush on a path, no grass on the paving.
  // (Chunks grown before it's stood up are gone over when it is.)
  const SMALL = new Set(['bush', 'fern']);
  function clearChunk(ch: { cx: number; cz: number; vegLists?: Record<string, Float32Array | number[]> }) {
    if (!built || !ch.vegLists) return;
    const S = chunks.size;
    const [x0, z0, x1, z1] = built.site.box;
    if (ch.cx * S > x1 || (ch.cx + 1) * S < x0 || ch.cz * S > z1 || (ch.cz + 1) * S < z0) return;
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
    if (!built) return null;
    const b = built.site.box;
    if (x0 > b[2] || x1 < b[0] || z0 > b[3] || z1 < b[1]) return null;
    const z = built;
    return (x: number, y: number) => z.bare(x, y);
  });
  // Its paths and plazas say what they're paved with (world/paved.ts), as
  // the city's streets do: they're laid on the ground you walk on, with
  // nothing solid standing there to say it.
  paved.addSource((x: number, z: number) => (built ? built.paving(x, z) : null));
  // A builder's tools go round its buildings.
  builder.obstacles.addSource((x: number, z: number, R: number, out: unknown[]) => {
    if (!built || Math.hypot(x - cx, z - cz) > HIDE) return;
    for (const o of built.obstacles) {
      if (Math.hypot(o.x - x, o.z - z) > R + o.r + 1) continue;
      out.push({ x: o.x, z: o.z, what: o.what, dig: o.r + 0.3, wall: o.r + 0.2, footing: o.r + 0.5, roof: o.r, grown: true });
    }
  });

  // ── On the map ─────────────────────────────────────────────────────────────
  // The zoo, by its gate, and each exhibit, where it's seen from.
  const exhibits = ZOO.exhibits.map((e) => ({ ...e, x: cx + e.x, z: cz + e.z }));
  const zooPlace = () => ({
    id: `${ID}${ZOO.hike}`,
    x: gate.x,
    z: gate.z,
    yaw: gate.yaw,
    name: ZOO.name,
    kind: 'zoo',
    note: `the Smithsonian's National Zoological Park, in Washington, DC, life size: ${exhibits.length} exhibits${seen.size ? ` · ${seen.size} kinds of animal seen` : ''}`,
    words: 'smithsonian national zoological park washington dc animals',
    glyph: GLYPH,
    visited: seen.size > 0,
  });
  const exhibitPlace = (e: (typeof exhibits)[number]) => ({
    id: `${ID}${e.id}`,
    x: e.x,
    z: e.z,
    yaw: e.yaw,
    name: e.name,
    kind: 'zoo exhibit',
    note: `at the ${ZOO.name}`,
    words: 'zoo animals',
    glyph: GLYPH,
    visited: false,
  });
  const all = () => [zooPlace(), ...exhibits.map(exhibitPlace)];
  // and, close up, its pens, paths and buildings, once it's stood up
  map.addLayer((pen: Parameters<typeof drawZoo>[0]) => drawZoo(pen, built ? built.site : null));
  map.places.addSource({
    list: 'zoo',
    destinations: all,
    within: (x0: number, z0: number, x1: number, z1: number) => all().filter((p) => p.x >= x0 && p.x <= x1 && p.z >= z0 && p.z <= z1),
    get: (id: string) => all().find((p) => p.id === id) || null,
  });

  // ── Getting there ──────────────────────────────────────────────────────────
  // In your pack: where it is, and how far.
  commands.add({
    id: 'zoo',
    group: 'ZOO',
    label: `${ZOO.name}: where it is`,
    icon: pictures.PANDA,
    run() {
      const d = Math.hypot(player.pos.x - gate.x, player.pos.z - gate.z);
      hud.flash(d < SHOW ? `the ${ZOO.name}: its gate on Connecticut Avenue is ${formatDistance(d)} off · its exhibits are on the map, under zoo` : `the ${ZOO.name} is in Washington, DC, ${formatDistance(d)} off · it's on the map, under zoo`, 6000);
      return true;
    },
  });
  async function go(id?: string) {
    const p = id ? all().find((q) => q.id === `${ID}${id}` || q.id === id) : zooPlace();
    if (!p) throw new Error(`no exhibit called ${id}: try world.zoo.exhibits()`);
    // (its land, and what builds the zoo on it, first)
    if (!landforms.has(ZOO.hike)) await landforms.ensure(ZOO.hike);
    await look.ready();
    player.spawn(p.x, p.z, p.yaw, p.yaw + Math.PI);
    // (the zoo stood up now, not a little at a time: you're in it)
    if (!built) {
      if (!building) standUp();
      if (building) {
        building.pump(Infinity);
        putUp(building);
      }
    }
    return true;
  }

  // ── Each frame ─────────────────────────────────────────────────────────────
  game.addSystem({
    name: 'zoo',
    phase: 'world',
    update({ dt }) {
      const d = Math.hypot(player.pos.x - cx, player.pos.z - cz);
      if (d < WANT) look.want();
      if (!built && !building && d < SHOW) standUp();
      else if ((built || building) && d > HIDE) takeDown();
      if (!built) return;
      built.update(dt, camera.position);
      // the animals you've seen: near enough, and in front of you
      for (const r of built.residents.near(player.pos.x, player.pos.z, SEE)) {
        if (seen.has(r.kind.name)) continue;
        seen.add(r.kind.name);
        hud.flash(`${article(r.kind.name)} · ${seen.size} kind${seen.size > 1 ? 's' : ''} of animal seen at the zoo`, 3500);
        save.touch();
      }
    },
  });

  game.provide('zoo', {
    exhibits: () => (built ? built.site.exhibits.map((e) => ({ id: e.id, name: e.name, animals: built ? built.residents.list.filter((r) => r.exhibit === e).length : 0 })) : exhibits.map((e) => ({ id: e.id, name: e.name, animals: 0 }))),
    go,
    get built() {
      return built;
    },
    get seen() {
      return [...seen];
    },
  });
}

const article = (s: string) => (/^[aeiou]/i.test(s) ? `an ${s}` : `a ${s}`);
