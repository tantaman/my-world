// Buried treasure: a quest on the adventures board (N). An old map has come
// into your hands, drawn by someone who buried something out here and never
// came back for it. It starts at an old place you can find on your own map,
// and goes from there in paces on the points of the compass: to a mark left
// on the way, then to the spot. Pace it out, and dig (hold F). What's in the
// chest is yours to keep.
//
//   hunt.js      where it's buried and the way there; counting paces; what a hole turns up
//   run.js       the hunt under way: its stages, digging, the chest
//   chart.js     the treasure map, drawn on old paper; its panel
//   look.js      (fetched) the mark on the way, the turned earth, holes, the chest
//   sound.js     the spade striking wood, the lid and the coins
//   pictures.js  the map, the spade, the chest and the coins in your pack
//
// Like every adventure, nothing of it stays in the world: the holes are
// filled and the chest is gone when it's over, and it's yours alone (someone
// you share a world with doesn't see your holes). What you dug up is kept,
// with your map marks, and listed in your pack.
//
// From the console:
//   world.adventures.begin('treasure')   set off (you're sent to where the map starts)
//   world.treasure.hunt                  the one under way: its plan, stage, paces
//   world.treasure.map()                 read the map
//   world.treasure.finds                 what you've dug up

import './treasure.css';
import type { Game } from '../game/game.ts';
import { lazy } from '../core/lazy.ts';
import { planHunt, doorOf, validateFinds, listFinds, KEPT } from './hunt.js';
import { Hunt, OPEN_REACH } from './run.js';
import { Chart, survey } from './chart.js';
import './sound.js';
import * as pictures from './pictures.js';

type Plan = NonNullable<ReturnType<typeof planHunt>>;
type Finds = ReturnType<typeof validateFinds>;
type Survey = ReturnType<typeof survey>;

declare module '../game/game.ts' {
  interface Services {
    treasure: TreasureService;
  }
}
interface TreasureService {
  readonly hunt: Hunt | null; // the one under way
  readonly plan: Plan | null; // the map you have, from when you set off
  readonly finds: Finds; // what you've dug up
  map(): boolean; // read it
}

const ID = 'treasure'; // on the board, for good: it's how your record is kept
const FIND = 650; // m: the old places this near can start a map
const TRY = 8; // ...the nearest so many of them, in no order
const STARTS = new Set(['cabin', 'ruin', 'hunting', 'camp', 'well']); // (not out on the water)
const ARRIVE = 12; // m from there that the hunt begins
const DIG_D = 3; // m: what's nearer than this to act on comes before the spade
const STEEP = 0.45; // the most the ground may rise over run where something's buried
const DRY = 0.4; // m of bank above the water, at least, where something's buried
const WADE = 0.5; // m: water deeper than this is in the way of a leg
const ROOM = 1.0; // m kept from what work must go round (a trunk, a wall)
const PLANTS = ['pine', 'broad', 'birch'];
const _w = { level: 0, depth: 0, flowX: 0, flowZ: 0, foam: 0, rise: 0 };

// The features this uses, so it is installed after them (game/features.js):
// adventures for the board it's on, landmarks for the old places it starts
// from, act for the spade (F), pack for what you've found, map for how the
// old places are drawn.
export const after = ['render', 'ui', 'world', 'player', 'audio', 'build', 'save', 'map', 'landmarks', 'adventures', 'act', 'pack'];
export function installTreasure(game: Game) {
  const { scene, chunks, solids, landforms, paved, player, input, hud, commands, save, sound, builder, map, act, pack, adventures, landmarks } = game;
  const look = lazy(() => import('./look.js'));
  const ground = (x: number, z: number) => chunks.heightAt(x, z);
  const depth = (x: number, z: number) => (chunks.waterAt(x, z, _w) ? _w.depth : -Infinity);

  // ── Where a map can start, and where it's buried ──────────────────────────
  // Before the door of an old place, out from its front.
  function startOf(o: { id: string; name: string }) {
    const s = landmarks.sites.byId(o.id);
    const at = s ? doorOf(s) : null;
    return at ? { id: o.id, name: o.name, x: at.x, z: at.z } : null;
  }
  // Somewhere a mark can stand or a chest be buried: dry, not too steep,
  // not on a real place or a street, clear of trunks and of what's built.
  function ok(x: number, z: number) {
    if (landforms.reaches(x - 3, z - 3, x + 3, z + 3)) return false;
    if (depth(x, z) > -DRY) return false;
    if (paved.at(x, z)) return false;
    const gx = (ground(x + 2, z) - ground(x - 2, z)) / 4;
    const gz = (ground(x, z + 2) - ground(x, z - 2)) / 4;
    if (Math.hypot(gx, gz) > STEEP) return false;
    for (const o of builder.obstacles.near(x, z, 4)) if (o.dig && Math.hypot(o.x - x, o.z - z) < o.dig + ROOM) return false;
    return true;
  }
  // Planned from the old places near you, the nearest few of them in no order.
  function plan(): Plan | null {
    const near = landmarks
      .list(FIND)
      .filter((o) => STARTS.has(o.kind))
      .slice(0, TRY)
      .sort(() => Math.random() - 0.5);
    const starts = near.map(startOf).filter((s): s is NonNullable<ReturnType<typeof startOf>> => !!s && depth(s.x, s.z) < 0);
    return planHunt({ starts, ok, walkable: (x: number, z: number) => depth(x, z) < WADE });
  }

  // ── What you've dug up ────────────────────────────────────────────────────
  let finds: Finds = validateFinds(null);
  save.register({
    id: 'treasure',
    scope: 'yours',
    local: 'marks',
    collect: () => ({ coins: finds.coins, hoards: finds.hoards.map((h) => [...h]) }),
    validate: validateFinds,
    restore(data: Finds) {
      finds = data;
    },
  });
  function found(h: { name: string; coins: number; trinket: string }) {
    finds.coins += h.coins;
    finds.hoards.push([h.name, h.coins, h.trinket]);
    finds.hoards = finds.hoards.slice(-KEPT);
    save.touch();
  }
  pack.have(() => listFinds(finds).map((t, i) => ({ ...t, icon: i === 0 ? pictures.COINS : pictures.CHEST })));

  // ── On the board ──────────────────────────────────────────────────────────
  // What a hunt is handed of the world (run.js).
  const world = {
    scene,
    solids,
    player,
    ground,
    say: (msg: string, ms?: number) => hud.flash(msg, ms),
    sfx: (kind: string, opts?: object) => sound.sfx(kind, opts),
    key: (word: string) => act.key(word),
    look: () => look.want(),
    found,
  };
  adventures.define({
    id: ID,
    title: 'Buried treasure',
    blurb: 'An old map has come into your hands: an old place you can find on your own map, a few lines of directions in paces, and a cross. Pace it out from where it says, find the mark on the way, and dig.',
    where() {
      const p = plan();
      if (!p) return { none: 'no old place near enough for a map to start from · they’re on your map (M): try nearer one' };
      look.want(); // (what it puts in the world, sent for now: it's wanted when you get there)
      return { x: p.start.x, z: p.start.z, label: p.start.name, near: ARRIVE, objective: `get to ${p.start.name} · the map starts there`, plan: p };
    },
    start: (_kit: unknown, { at }: { at: { plan: Plan } | null }) => {
      const p = at?.plan ?? plan();
      // (where() always sends you somewhere, so there is always a plan; but
      // should there not be, it is over as soon as it has begun)
      if (!p) return { objective: '', update: () => ({ lost: 'the map is no good here' }), dispose() {} };
      hud.flash(`${p.start.name} · the map starts here`, 3600);
      return new Hunt(p, world);
    },
  });
  // The hunt under way, and the plan you have (from when you set off).
  const hunt = (): Hunt | null => (adventures.kind?.id === ID && adventures.run instanceof Hunt ? adventures.run : null);
  const current = (): Plan | null => (adventures.kind?.id === ID ? (hunt()?.plan ?? adventures.dest?.plan ?? null) : null);
  const on = () => adventures.state === 'on' && hunt();

  // ── The spade, and the lid (F) ────────────────────────────────────────────
  builder.idleWhile(() => !!hunt()?.digging);
  act.offer({
    id: 'treasure',
    at() {
      const h = on();
      if (!h) return null;
      if (h.stage === 'found') {
        const d = h.reach();
        return d < OPEN_REACH ? { d, word: 'open', run: () => h.open(), icon: pictures.CHEST } : null;
      }
      if (!h.canDig()) return null;
      return { d: DIG_D, word: 'dig', run() {}, hold: (dt: number) => h.dig(dt), icon: pictures.SPADE };
    },
  });

  // ── The map ───────────────────────────────────────────────────────────────
  const chart = new Chart({ input });
  const surveyed = new WeakMap<Plan, Survey>();
  function read() {
    const p = current();
    if (!p) return false;
    // (looked at once you're there, with the woods round you; before, as
    // it is from afar)
    let s = surveyed.get(p);
    if (!s) {
      s = survey(p, { ground, depth, trees });
      if (hunt()) surveyed.set(p, s);
    }
    const glyph = map.places.get(p.start.id)?.glyph ?? null;
    game.emit('panel', 'treasure');
    chart.show(s, glyph);
    return true;
  }
  function trees(x0: number, z0: number, x1: number, z1: number) {
    const out: Array<[number, number, string]> = [];
    const r = Math.hypot(x1 - x0, z1 - z0) / 2;
    chunks.forEachPlant((x0 + x1) / 2, (z0 + z1) / 2, r, PLANTS, (_c: unknown, kind: string, _k: number, x: number, _y: number, z: number) => {
      if (x >= x0 && x <= x1 && z >= z0 && z <= z1) out.push([x, z, kind]);
    });
    return out;
  }
  game.on('panel', (which: string) => which !== 'treasure' && chart.close());
  commands.add({
    id: 'treasure-map',
    group: 'ADVENTURE',
    label: 'the treasure map · read it, while you’re after it',
    icon: pictures.MAP,
    run: () => (chart.isOpen ? (chart.close(), true) : read()),
    now: () => (current() ? 'map' : ''),
  });
  // Unfolded as you set off.
  adventures.on('state', (state: string) => {
    if (state === 'travel' && adventures.kind?.id === ID) read();
    if (state !== 'travel' && state !== 'on') chart.close();
  });

  // ── Every frame ───────────────────────────────────────────────────────────
  // (after adventures, which runs the hunt: what the act key would do, said)
  game.addSystem({
    name: 'treasure',
    phase: 'world',
    update() {
      const h = on();
      hud.cue(h ? h.cue() : null, 'treasure');
    },
  });

  game.provide('treasure', {
    get hunt() {
      return hunt();
    },
    get plan() {
      return current();
    },
    get finds() {
      return finds;
    },
    map: read,
  });
}
