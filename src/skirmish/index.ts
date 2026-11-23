// Dry Wells: a gate in the forest, and through it a five-a-side match in a
// desert town. Raiders try to set a charge at one of two sites; Wardens try
// to stop them. Every fighter is a bot until somebody walks in and takes one
// over, and everyone in a shared world who walks in is in the same match.
//
// This plugs it into the game: where the gate is, standing it up as you come
// near, walking in, the town's keys, what's yours. What the gate looks like
// and everything in the town are fetched when you first come near the gate
// (core/lazy.ts), not at the start:
//
//   site.js      where the gate is, grown from the seed and the land
//   grounds.js   what the forest does for it: plants hidden, building kept round, its place on the map
//   pictures.js  what the things at hand in the town look like, on their buttons
//   gate.js      (fetched) the gate: towers, an archway full of light
//   visit.js     (fetched) being in the town: who's in, the controls, what you see and hear
//     town.js      the town's layout: boxes, sites, ways in, the bots' paths
//     mover.js     moving in the town: running, walking, crouching, a jump
//     arms.js      the guns, the grenades, the gear; what each costs and does
//     rounds.js    the rules: rounds, the clock, the score, the money
//     match.js     a match: ten fighters, shots, the charge, host and guests
//     bots.js      the bots: finding their way, seeing, aiming, playing a side
//     net.js       who's in the town, and whose browser runs the match
//     townLook.js  what the town looks like
//     guns.js      what they carry, as models
//     outfits.js   who the fighters are: the hikers' body, in a Raider's clothes or a Warden's
//     heads.js     their heads: scarves, hoods, glasses, goggles, helmets
//     figures.js   a fighter as you see them: walking, aiming, crouched, down
//     hands.js     what's in your own hands, and your arms on it
//     look.js      the scene: the town, the fighters, shots, smoke, the view
//     hud.js       the match's HUD, the shop, the scores
//     sound.js     the guns, the charge, the round
//
// Nothing about the forest changes for the gate: see site.js. Where it
// stands waits for what might be in its way to be found, a moment after the
// world opens. In the town the keys are its own (`mode`, game/commands.js),
// and what's at hand there (buy, reload, set the charge) says so, which on a
// touch screen is its button (src/pack/). Your record there (matches, wins,
// kills) is yours, saved.
//
// From the console:
//   world.skirmish.site          where the gate is (null until it's been found)
//   await world.skirmish.go()    stand in front of it (finding it now, if it hasn't been)
//   await world.skirmish.enter() walk in
//   world.skirmish.match         the match, while you're in there
//   world.skirmish.hurry()       skip the rest of the freeze
//   world.skirmish.leave()       walk out

import type { Game } from '../game/game.ts';
import { lazy } from '../core/lazy.ts';
import { toWorld, toLocal, onPlan } from '../world/frame.js';
import { candidates, pickSite, clearOf, HALF, DOOR, REACH, FRONT, NAME } from './site.js';
import { Grounds, SITE_NAME } from './grounds.js';
import * as pictures from './pictures.js';

type Site = NonNullable<ReturnType<typeof pickSite>>;
type Town = ReturnType<typeof import('./visit.js').openTown>;
type Built = ReturnType<typeof import('./gate.js').buildGate>;

// What's yours there.
interface Tally {
  visited: boolean;
  matches: number;
  wins: number;
  rounds: number;
  kills: number;
}
// ...as it's saved: and whether you were left standing on the gate's paving
// (in the town, that's where the hiker waits).
type Saved = Tally & { there?: boolean };

// What this provides: game.skirmish (world.skirmish in the console).
interface Skirmish {
  // where the gate is: null until it's been found, or if there's nowhere for it
  readonly site: Site | null;
  record: Tally;
  // the town, once it's been fetched: who's in, the match, how it's drawn
  readonly session: Town['session'] | null;
  readonly inside: boolean;
  readonly match: Town['match'];
  readonly look: Town['look'];
  readonly watching: Town['watching'];
  go(): Promise<{ x: number; z: number } | null>;
  enter(): Promise<boolean>;
  leave(): void;
  hurry(): string | null;
}
declare module '../game/game.ts' {
  interface Services {
    skirmish: Skirmish;
  }
}

const SHOW = 420; // m: the gate is stood up this close...
const HIDE = 560; // ...and taken down past this
const ARRIVE = 14; // m from the gate that counts as there
const DECIDE_EVERY = 0.5; // s between asking whether everything that might be in the gate's way has been found
// The number row, in the town: what to bring up, or with the shop open, what to buy.
const ROW = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0', 'Minus'];

const _l = { x: 0, z: 0 };
const _w = { x: 0, z: 0 };

// The features this uses, so it is installed after them (game/features.js):
// towns, railway, roads, cars and hell for what the gate keeps clear of (the
// roads know everything that was there before them).
export const after = ['render', 'ui', 'world', 'player', 'audio', 'build', 'map', 'save', 'towns', 'railway', 'roads', 'cars', 'hell'];
export function installSkirmish(game: Game) {
  const { scene, camera, pipeline, gen, chunks, grass, solids, landforms, player, input, builder, map, hud, commands, save, settings, sound, peers, towns, railway, roads, cars, hell } = game;

  // ── Where the gate is ─────────────────────────────────────────────────────
  // Clear of everything that was there first: a real place's land, what the
  // roads keep clear of (the old places, caves, launch sites, stores,
  // airfields, abandoned buildings, hunt clubs, race tracks, the pier), the
  // towns, the railway, the roads themselves, the dealerships, and the gate
  // under the hill.
  const start = player.start;
  const keepOff = clearOf({ landforms, there: roads.there, towns: towns.towns, lines: railway.lines, roads: roads.roads, dealers: cars.dealers, hell: hell ? hell.gate : null });
  // The spots it could be are looked for now. Which of them it is waits for
  // what might be in the way to be found: the airfields, the hunt club, the
  // roads and the rest are looked for a little at a time once the world is
  // open, so as not to hold up the start, and this doesn't hurry them. Until
  // then the gate isn't anywhere, and fills in on the map when it is. Asked
  // for outright (by its id, or to go there), it's found there and then.
  const spots = candidates(gen, start);
  const ring: [number, number, number, number] = [start.x - REACH, start.z - REACH, start.x + REACH, start.z + REACH];
  let site: Site | null = null;
  let decided = false;
  function decide(): Site | null {
    if (decided) return site;
    decided = true;
    site = pickSite(start, spots, keepOff);
    grounds.settle(site);
    return site;
  }
  const ground = (x: number, z: number) => gen.height(x, z) + (chunks.heightOffset ? chunks.heightOffset(x, z) : 0);
  // where the hiker stands in front of the archway, facing out
  const front = () => {
    const s = site!;
    toWorld(s, 0, FRONT, _w);
    return { x: _w.x, y: s.top, z: _w.z, yaw: s.yaw };
  };

  // ── Your record ───────────────────────────────────────────────────────────
  const record: Tally = { visited: false, matches: 0, wins: 0, rounds: 0, kills: 0 };
  const count = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
  // on the gate's paving or its sloping sides
  const onPaving = (x: number, z: number) => !!site && onPlan(site, x, z, 0, site.cleared);
  save.register({
    id: 'skirmish',
    scope: 'yours',
    local: 'marks',
    collect: (): Saved => ({ ...record, ...(onPaving(player.pos.x, player.pos.z) ? { there: true } : {}) }),
    validate: (raw: unknown): Saved => {
      const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof Saved, unknown>>;
      return { visited: r.visited === true, matches: count(r.matches), wins: count(r.wins), rounds: count(r.rounds), kills: count(r.kills), ...(r.there === true ? { there: true } : {}) };
    },
    restore({ there, ...tally }: Saved) {
      Object.assign(record, tally);
      // Left standing on the paving: it has to be there to be set down on, so
      // the gate is found now, and what builds it fetched, before you arrive.
      if (!there || !decide() || !onPaving(player.arrival.x, player.arrival.z)) return;
      player.arrival.y = site!.top;
      game.beforeArrival(gate.ready().then(() => show(true)));
    },
  });

  // ── The forest round it, building round it, its place on the map ──────────
  const grounds = new Grounds({ chunks, grass, builder, map, start, reach: REACH, visited: () => record.visited, decide });

  // ── Standing the gate up ──────────────────────────────────────────────────
  // What it looks like, and the town past it, are fetched as you first come
  // near: asked for each frame until they're here.
  const gate = lazy(() => import('./gate.js'));
  const town = lazy(() => import('./visit.js'));
  let built: Built | null = null;
  let shown = false;
  function show(on: boolean) {
    if (on === shown) return;
    if (on) {
      const m = gate.want();
      if (!m || !site) return;
      if (!built) built = m.buildGate(site, ground);
      scene.add(built.object);
      solids.set(built, built.solids);
    } else if (built) {
      scene.remove(built.object);
      solids.clear(built);
    }
    shown = on;
  }
  // How fast the mouse turns you in there: yours to set, and remembered.
  let quick = settings.get('skirmish-aim', 'number') ?? 1;
  hud.setting({
    id: 'skirmish-aim',
    group: 'DRY WELLS',
    label: 'how fast the mouse turns you',
    min: 0.2,
    max: 3,
    step: 0.05,
    get: () => quick,
    set(v: number) {
      quick = v;
      settings.set('skirmish-aim', v);
    },
    show: (v: number) => `${v.toFixed(2)}×`,
  });
  // The town: who's in it, and you once you walk in. (From then on it hears
  // what's said on the match's channel, and keeps count of who's in there.)
  let visit: Town | null = null;
  function theTown(): Town | null {
    if (visit) return visit;
    const m = town.want();
    if (m) visit = m.openTown({ camera, pipeline, player, input, hud, commands, save, sound, peers, record, quick: () => quick, front });
    return visit;
  }
  const inside = () => !!visit && visit.inside;

  // ── The keys, in the town ─────────────────────────────────────────────────
  // Its own: `mode` (game/commands.js). Each says what it would do now, where
  // it would do something, which on a touch screen is its button, under its
  // picture (src/pack/).
  const key = (what: string) => () => void visit?.key(what);
  const word = (what: string) => () => (visit ? visit.word(what) : '');
  commands.add({ id: 'skirmish-reload', keys: ['KeyR', 'PadX'], mode: 'skirmish', group: 'DRY WELLS', label: 'reload', icon: pictures.MAGAZINE, run: key('reload'), now: word('reload') });
  commands.add({ id: 'skirmish-use', keys: ['KeyE', 'PadY'], mode: 'skirmish', group: 'DRY WELLS', help: 'hold E', label: 'set the charge, at a site · pull its fuse', icon: () => (visit && visit.word('use') === 'pull the fuse' ? pictures.CUTTERS : pictures.CHARGE), run: key('use'), hold: key('use'), now: word('use') });
  commands.add({ id: 'skirmish-buy', keys: ['KeyB', 'PadLeft'], mode: 'skirmish', group: 'DRY WELLS', label: 'buy, at home, while the round is young (its number, or a click)', icon: pictures.COIN, run: key('buy'), now: word('buy') });
  commands.add({ id: 'skirmish-drop', keys: ['KeyG', 'PadDown'], mode: 'skirmish', group: 'DRY WELLS', label: 'put the charge down, for someone else to carry', icon: pictures.CHARGE, run: key('drop'), now: word('drop') });
  commands.add({ id: 'skirmish-last', keys: ['KeyQ', 'PadLB'], mode: 'skirmish', group: 'DRY WELLS', label: 'what you had in your hands before', icon: pictures.RIFLE, run: key('last') });
  commands.add({ id: 'skirmish-next', keys: ['PadRB'], mode: 'skirmish', group: 'DRY WELLS', label: 'the next thing you carry', icon: pictures.RIFLE, run: key('next'), now: word('next') });
  // (not ctrl: with W, that closes the tab)
  commands.add({ id: 'skirmish-crouch', keys: ['KeyC', 'PadR3'], mode: 'skirmish', group: 'DRY WELLS', help: 'hold C', label: 'crouch', icon: pictures.CROUCH, run: key('crouch'), hold: key('crouch'), now: word('crouch') });
  commands.add({ id: 'skirmish-scores', keys: ['Tab', 'PadSelect'], mode: 'skirmish', group: 'DRY WELLS', help: 'hold tab', label: 'the scores', hold: key('scores') });
  commands.add({ id: 'skirmish-leave', keys: ['KeyL', 'PadRight'], mode: 'skirmish', group: 'DRY WELLS', label: 'walk out (twice, while a match is on)', icon: pictures.GATE, run: key('leave'), now: word('leave') });
  ROW.forEach((code, i) => commands.add({ id: `skirmish-row-${i}`, keys: [code], mode: 'skirmish', run: key(`row-${i}`) }));
  commands.describe({ group: 'DRY WELLS', help: 'W A S D · mouse', pad: ['PadLS', 'PadRS'], label: 'run, strafe, look' });
  commands.describe({ group: 'DRY WELLS', help: 'shift', pad: ['PadB'], label: 'walk: slower, and unheard' });
  commands.describe({ group: 'DRY WELLS', help: 'space', pad: ['PadA'], label: 'jump' });
  commands.describe({ group: 'DRY WELLS', help: 'click', pad: ['PadRT'], label: 'fire · throw · set the charge (hold, at a site)' });
  commands.describe({ group: 'DRY WELLS', help: 'right click', pad: ['PadLT'], label: 'the long rifle’s sight' });
  commands.describe({ group: 'DRY WELLS', help: '1 2 3 4 5 · scroll', label: 'main gun · sidearm · knife · grenades · the charge' });

  builder.idleWhile(inside);
  game.coverWhen(inside);

  // ── Each frame ────────────────────────────────────────────────────────────
  // First, the match reads the controls: you're in the town, not walking
  // about out here.
  game.addSystem({ name: 'skirmish-match', phase: 'input', update: ({ dt }) => void visit?.update(dt) });

  // The gate itself: found, then stood up as you come near, its archway
  // wavering; and walking into the light takes you in.
  let arrived = false;
  let paved = false; // whether you were on the paving, the last it was looked at (it's saved: see the record)
  let rearm = true; // you have to step back out of the archway before it takes you again
  let decideIn = 0; // s until it's next asked whether the gate's place can be decided
  game.addSystem({
    name: 'skirmish',
    phase: 'world',
    update({ dt, time }) {
      // where it is, once everything that might be in its way has been found
      if (!decided && (decideIn -= dt) <= 0) {
        decideIn = DECIDE_EVERY;
        if (keepOff.ready!(...ring)) decide();
      }
      if (!site) return;
      const p = game.focus;
      const d = Math.hypot(site.x - p.x, site.z - p.z);
      if (d < SHOW) {
        show(true);
        theTown();
      } else if (d > HIDE && !inside()) show(false);
      if (!shown || !built || inside()) return void hud.cue(null, 'skirmish');
      built.glare.uTime.value = time % 1000;
      if (!arrived && d < ARRIVE) {
        arrived = true;
        hud.flash(`${SITE_NAME} · walk into the light to join the match`, 3600);
      }
      if (d > ARRIVE * 4) arrived = false;
      if (paved !== onPaving(player.pos.x, player.pos.z)) {
        paved = !paved;
        save.touch();
      }
      toLocal(site, player.pos.x, player.pos.z, _l);
      const level = Math.abs(player.pos.y - site.top) < 1.5;
      const before = level && Math.abs(_l.x) < HALF.x && _l.z > 0 && _l.z < HALF.z + 1;
      const inArch = level && Math.abs(_l.x) < DOOR.half - 0.2 && Math.abs(_l.z) < 0.55;
      const n = visit ? visit.session.inside.size : 0;
      hud.cue(before && player.rides.free ? { html: `${NAME}: five a side · walk into the light${n ? ` · ${n} in there now` : ''}` } : null, 'skirmish');
      if (!inArch) rearm = true;
      // (on your own feet, and of your own accord: not walked through it on the way somewhere)
      else if (rearm && player.rides.free && !player.steer) {
        const v = theTown();
        if (v && v.enter()) rearm = false;
      }
    },
  });

  game.addSystem({ name: 'skirmish-view', phase: 'render', update: ({ dt }) => void visit?.draw(dt) });

  // ── From the console ──────────────────────────────────────────────────────
  game.provide('skirmish', {
    // where the gate is: null until it's been found (a moment after the world
    // opens), or if there's nowhere for it
    get site() {
      return site;
    },
    record,
    get session() {
      return visit ? visit.session : null;
    },
    get inside() {
      return inside();
    },
    get match() {
      return visit ? visit.match : null;
    },
    get look() {
      return visit ? visit.look : null;
    },
    get watching() {
      return visit ? visit.watching : null;
    },
    // stand on the paving in front of the gate, facing it (it, and the town
    // past it, fetched first if they haven't been)
    async go() {
      if (!decide()) return null;
      await Promise.all([gate.ready(), town.ready()]);
      show(true);
      const at = front();
      player.spawn(at.x, at.z, at.yaw + Math.PI);
      return { x: at.x, z: at.z };
    },
    // walk in, from wherever you are
    async enter() {
      if (!decide()) return false;
      await town.ready();
      const v = theTown();
      if (!v || !v.enter()) return false;
      rearm = false;
      return true;
    },
    leave: () => void visit?.leave(),
    hurry: () => (visit ? visit.hurry() : null),
  });
}
