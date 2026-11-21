// Fishing: a rod to cast a float out over a lake, a river or the sea, from
// the bank or out in a boat; a fish to strike at when the float goes under,
// and to play in on the line without snapping it. Everything about it lives
// in this folder; this plugs it into the game.
//
//   rod.js      the rod on the tool bar: cast, strike, reel in
//   line.js     the line: the float, the bite, a fish on it
//   catch.js    what bites where, and when; how big it is
//   look.js     the float, and the line from the rod's tip
//   models.js   the rod, and a fish held up once it's caught
//   sound.js    the cast, the plop, the bite, the reel, the drag, a snap
//
// The fish are the ones that swim in the water (underwater/): it's a school
// of them round the float that makes a bite come soon, and what's caught is
// most likely one of them. What you catch goes in your pack, counted with the
// rest of what you carry; the biggest of each kind you've caught is yours to
// keep ('catches').
//
// From the console:
//   world.fishing.catches()   the biggest of each kind you've caught
//   world.fishing.line        the line: its state, the fish on it
//   world.fishing.hurry()     a fish at the bait now, if the float is out

import { Line } from './line.js';
import { LineLook } from './look.js';
import { rodTool } from './rod.js';
import { Caught } from './models.js';
import { BITE, CATCHABLE, biteRate, whatBites, describe, nameOf } from './catch.js';
import './sound.js';
import { waterSample } from '../core/geom.js';
import { FISH } from '../underwater/fish.js';

const SHOW = 2.6; // seconds a fish is held up to look at once it's caught
const SAY = 4200; // ms a sentence stays on the screen

const _w = waterSample();

// The features this uses, so it is installed after them (game/features.js).
// And after boats for its place on the tool bar: the rod comes after the
// boat tool.
export const after = ['render', 'ui', 'world', 'player', 'audio', 'build', 'save', 'splashes', 'underwater', 'boats'];
export function installFishing(game) {
  const { scene, chunks, player, hud, commands, save, sound, builder, sky, splashes, underwater } = game;

  // ── What you carry ────────────────────────────────────────────────────────
  builder.stock.define({ id: 'fish', label: 'fish', optional: true });

  // ── The water, and what bites in it ───────────────────────────────────────
  const here = { level: 0, depth: 0 };
  const waterAt = (x, z) => {
    if (!chunks.waterAt(x, z, _w) || _w.depth <= 0) return null;
    here.level = _w.level;
    here.depth = _w.depth;
    return here;
  };
  // What bites where the float lands (as Line.cast wants it).
  const water = (x, z) => {
    const w = waterAt(x, z);
    const depth = w ? w.depth : 0;
    const sea = underwater.sea(x, z);
    let school = null;
    let near = BITE.school;
    for (const f of underwater.fish()) {
      const d = Math.hypot(f.x - x, f.z - z);
      if (d < near) {
        near = d;
        school = f.kind;
      }
    }
    return {
      depth,
      sea,
      school,
      rate: biteRate({ depth, hour: sky.hours, school: !!school && CATCHABLE.includes(school) }),
      bite: () => whatBites({ sea, depth, school }),
    };
  };

  // ── The rod, and its line ─────────────────────────────────────────────────
  const line = new Line();
  const look = new LineLook(scene);
  const tool = builder.register(rodTool({ line, look, waterAt, water }));
  // its key is wherever its slot is on the tool bar
  const rodKey = () => {
    const n = builder.slotOf(tool.id);
    return n <= 10 ? String(n % 10) : 'tool bar';
  };
  commands.describe({ group: 'FISH', help: rodKey, label: 'the fishing rod: from the bank, or out in a boat' });
  commands.describe({ group: 'FISH', help: 'click', label: 'cast out over open water · strike when the float goes under' });
  commands.describe({ group: 'FISH', help: 'hold click', label: 'reel in a fish (let go while it runs, or the line snaps)' });
  commands.describe({ group: 'FISH', help: 'right-click', label: 'reel in, and cast again' });

  // ── What happens on the line ──────────────────────────────────────────────
  const splash = (x, z, n, up = 1) => {
    const w = waterAt(x, z);
    if (w) splashes.burst(x, w.level + 0.02, z, w.level, n, { up, spread: 0.35 });
  };
  line.on('splash', (x, z) => {
    sound.sfx('plop');
    splash(x, z, 10, 0.8);
  });
  line.on('nibble', () => sound.sfx('nibble'));
  line.on('bite', () => {
    sound.sfx('bite');
    splash(line.float.x, line.float.z, 8, 0.7);
  });
  line.on('early', () => hud.flash('too soon: you frightened it off · wait for the float to go under', SAY));
  line.on('missed', () => hud.flash('too slow: it let go of the bait', SAY));
  line.on('hooked', (f) => hud.flash(f.strength > 1.3 ? 'fish on, and a heavy one! hold click to reel, let go when it runs' : 'fish on! hold click to reel it in, let go when it runs', SAY));
  line.on('run', () => {
    sound.sfx('drag');
    splash(line.float.x, line.float.z, 16, 1.3);
  });
  line.on('snapped', (f) => {
    sound.sfx('snap');
    hud.flash(`the line snapped: ${f.name} got away${f.strength > 1.3 ? ', and a big one' : ''}`, SAY);
  });
  line.on('freed', (f) => hud.flash(`you let ${f.name} go`));

  // A fish landed: in your pack, held up to look at, and kept count of.
  const caught = new Caught();
  player.character.addRaised('fish', caught.object);
  let showing = 0;
  const best = {}; // kind -> { len, kg, n }: the biggest you've caught, and how many
  line.on('caught', (f) => {
    builder.gain('fish', 1);
    const was = best[f.kind];
    const record = !was || f.len > was.len;
    best[f.kind] = { len: record ? f.len : was.len, kg: record ? f.kg : was.kg, n: (was ? was.n : 0) + 1 };
    caught.show(f);
    player.character.raise('fish');
    showing = SHOW;
    sound.sfx('landed');
    splash(player.pos.x + Math.sin(player.yaw) * 0.8, player.pos.z + Math.cos(player.yaw) * 0.8, 12, 1);
    hud.flash(`+1 fish · ${describe(f)}${was && record ? ' · your biggest yet' : ''}`, SAY);
    save.touch();
  });
  game.addSystem({
    name: 'fishing',
    phase: 'update',
    update({ dt }) {
      if (showing <= 0) return;
      showing -= dt;
      if (showing <= 0 && player.character.raised === 'fish') player.character.raise(null);
    },
  });

  // ── Saving ────────────────────────────────────────────────────────────────
  // What you've caught is yours; the fish themselves are in what you carry.
  save.register({
    id: 'catches',
    scope: 'yours',
    collect: () => best,
    validate(raw) {
      const out = {};
      if (!raw || typeof raw !== 'object') return out;
      for (const kind of CATCHABLE) {
        const c = raw[kind];
        if (c && [c.len, c.kg, c.n].every(Number.isFinite)) out[kind] = { len: c.len, kg: c.kg, n: Math.max(1, Math.round(c.n)) };
      }
      return out;
    },
    restore(data) {
      for (const k of Object.keys(best)) delete best[k];
      Object.assign(best, data);
    },
  });

  // ── From the console (and the play-through) ───────────────────────────────
  game.provide('fishing', {
    line,
    tool,
    catches: () => Object.entries(best).map(([kind, c]) => ({ kind, name: nameOf(kind), biggest: describe({ ...c, name: nameOf(kind) }), caught: c.n })),
    // a fish at the bait now, if the float is out and waiting
    hurry() {
      if (line.state !== 'waiting') return false;
      line.next = 0;
      line.nibbles = 0;
      return true;
    },
    kinds: () => CATCHABLE.map((k) => ({ kind: k, name: nameOf(k), sea: FISH[k].sea })),
  });
}
