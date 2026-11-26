// Hell: a gate in a hillside in the dark of the woods, and under it the pit
// of the Inferno, circle below circle, to the ice at the bottom and the way
// back out to the stars. Everything about it lives in this folder; this
// plugs it into the game.
//
//   plan.js        the plan of it, as the poem gives it: radii, depths, names
//   words.js       the poem's own lines for each place (Longfellow's)
//   site.js        where the gate is, in the forest
//   gate.js        the gate: its stone, its passage into the hill, its door
//   land.js        Hell's ground, from the seed: floor, liquids, the ways down
//   space.js       the floor, walls and roof you walk by
//   terrain.js     the ground, drawn: tiles round you, fine near and coarse far
//   look.js        what the ground and the stone are drawn with
//   air.js         the dark overhead, the light from the pit, how far you see
//   weather.js     what falls and blows: rain, flakes of fire, the wind
//   furnish.js     what the ground is strewn with, and who is on it
//   models.js      their shapes: rocks, the trees of the wood, tombs, the shades
//   shades.js      what shades and fires are drawn with, and how they go
//   structures.js  what was built: bridges, the wall of Dis, a castle, a tower
//   creatures.js   the keepers and monsters, as shapes
//   denizens.js    where they stand, and what little they do
//   rides.js       what carries you: Charon's boat, Phlegyas's, Geryon, Antaeus
//   sculpt.js      shapes made of simple ones, for whatever is built or alive
//   sound.js       what it sounds like
//   card.js        the dark at the door, and the name of each place
//
// Hell changes nothing the seed grows. It lies three kilometres under the
// forest and is drawn as a scene of its own: while you are down there the
// forest isn't drawn at all (game.coverWhen), and the hiker, and the lamp on
// their cap, are moved into Hell's scene to be drawn in it. Where the two
// meet is the gate: a passage cut into a hillside (world/cuts.js), with a
// door at the end of it.

import * as THREE from 'three';
import type { Game } from '../game/game.ts';
import { SHARED } from '../render/uniforms.js';
import { PERIOD } from '../render/glsl.js';
import { HellLand, DOOR } from './land.js';
import { HellSpace } from './space.js';
import { HellTerrain } from './terrain.js';
import { HellAir } from './air.js';
import { Furniture } from './furnish.js';
import { Structures } from './structures.js';
import { HellWeather } from './weather.js';
import { Rides } from './rides.js';
import { Denizens } from './denizens.js';
import { hellSounds } from './sound.js';
import { createHellGround, createHellStone, createHellLiquid, createHellLiquidHaze } from './look.js';
import { createSkinMaterial } from '../render/skin.js';
import { makeCreature, meltSome, CREATURE_NAMES } from './creatures.js';
import { findGate } from './site.js';
import { Gate, doorFrame, DOORWAY } from './gate.js';
import { Card } from '../core/card.js';
import { Reader } from '../core/reader.ts';
import { R, TAU, STEPS, regionAt, bolgiaAt, zoneAt } from './plan.js';
import { WORDS, INSCRIPTION, SAID, DITCHES, ZONE_WORDS } from './words.js';
import { VEG_KINDS } from '../world/chunkGen.js';
import { segDist } from '../core/geom.js';

// What this provides: game.hell, for the features that come after it (and
// world.hell in the console: see the end of the file).
declare module '../game/game.ts' {
  interface Services {
    hell: Hell;
  }
}

// Where the road out by the bottom of Hell comes up, if not on the hillside
// by the gate: another place, which sets the hiker down at its end of the
// road (arrive(), while the screen is dark; the dark lifts when it returns).
export interface Onward {
  arrive(): void | Promise<void>;
}

// What Hell is to whoever comes after it.
export interface Hell {
  gate: NonNullable<ReturnType<typeof findGate>>;
  land: HellLand;
  space: HellSpace;
  card: Card;
  // the voice the poem is read aloud in, which Purgatory above it shares
  reader: Reader;
  scene: THREE.Scene;
  readonly inside: boolean;
  readonly region: string | null;
  readonly here: { r: number; th: number; turn: number };
  readonly passing: boolean;
  readonly been: boolean;
  readonly out: boolean;
  // Go through the door: down (true), back up (false), or out by the bottom
  // ('stars').
  pass(down: boolean | 'stars'): Promise<void>;
  // Stand inside the door; or at radius r, angle th (land.js).
  enter(): void;
  go(r: number, th: number, yaw?: number): void;
  // Say where the road out by the bottom comes up instead of the hillside;
  // and whether another place has.
  leadOut(onward: Onward): void;
  readonly leads: boolean;
  [more: string]: unknown;
}

// The gate's badge on the map: a doorway, and the dark in it.
const GLYPH = ['#######', '#.....#', '#.###.#', '#.###.#', '#.###.#', '#.###.#', '#.###.#'];
const SEARCH_WORDS = 'hell inferno dante underworld'; // what the gate is found by in Routes, its name not saying
const CLEAR = 5; // m round the way in kept clear of trees and undergrowth
const WOOD = 70; // m from the gate: the dark wood, where the poem begins
const REARM = 3.5; // m you must be from a door you came out of before it takes you again
const FALL = 14; // m/s: land harder than this and the poem has a word for it
const READS = 9; // m from the gateway: near enough for the lines over it to be read to you
const CENTRE = 30; // m from the axis: Lucifer's flank, where the way out begins
const FALLS_HEARD = 260; // m: how far off the brook's fall is heard
const MELT_MS = 4; // ms a frame spent melting the creatures' flesh (creatures.js), while you're down there
// What the ground of each region sounds like underfoot (audio/footsteps.js).
const UNDERFOOT = { limbo: 'grass', gluttons: 'dirt', styx: 'dirt', wood: 'litter', sand: 'dirt', blood: 'dirt', cocytus: 'snow' };

const ORDINAL = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth'];
const _p = { r: 0, th: 0 };
const _at = { x: 0, z: 0 };
const _seg = { d: 0, t: 0, nx: 0, nz: 0 };

// The features this uses, so it is installed after them (game/features.js).
// (caves: for the lamp, and because its frame's work sets how shut in you
// are, which down here is this feature's to say.)
export const after = ['render', 'ui', 'world', 'player', 'audio', 'build', 'caves', 'map'];
export function installHell(game: Game) {
  const { scene, camera, gen, landforms, chunks, spaces, player, pipeline, origin, sound, save, settings, map, builder, hud } = game;

  const site = findGate(gen, (x0, z0, x1, z1) => !!landforms.reaches(x0, z0, x1, z1));
  // (a world with no hillside that will take the gate has no way down)
  if (!site) return;
  const gate = site;
  const land = new HellLand({ seed: gen.seed, ...gate.hell });
  const space = new HellSpace(land);
  spaces.add(space);

  // Hell's own scene: what is drawn while you're down there.
  const under = new THREE.Scene();
  // (the air shimmers over its fires: render/pipeline.js, HEAT)
  under.userData.heat = true;
  const terrain = new HellTerrain({ land, material: createHellGround(), liquid: createHellLiquid(), haze: createHellLiquidHaze(), group: under });
  const furniture = new Furniture({ land, space, group: under });
  const built = new Structures({ land, group: under, stone: createHellStone({ hot: true, masonry: true }), fire: furniture.kit.flame.mat });
  // the light the fires give, from those near where you look from
  // (render/lights.js picks the few that matter most)
  game.lights.addSource(under, (eye: THREE.Vector3, out: object[]) => {
    furniture.lightsNear(eye, out);
    built.lightsNear(eye, out);
  });
  const air = new HellAir(under, land.top);
  origin.keep(air.hemi);
  const weather = new HellWeather(under);
  // The poem read aloud: the voice that says what the card shows, as you
  // come to each place (core/reader.ts). It is the browser's own speech, so
  // it waits on the sound being on and running, as everything heard does.
  const reader = new Reader({ can: () => sound.enabled && sound.running });
  reader.on = settings.get('poem-aloud', 'boolean') ?? true;
  const card = new Card({ id: 'hell', book: 'Inferno', reader });
  // (off the panel where the browser has no voice to read in)
  hud.setting({
    id: 'poem-aloud',
    group: 'SOUND',
    label: 'the poem read aloud',
    can: () => reader.available,
    get: () => reader.on,
    set(on: boolean) {
      reader.on = on;
      if (!on) reader.stop();
      settings.set('poem-aloud', on);
    },
  });
  // the keepers and monsters, and whatever carries you
  const flesh = createSkinMaterial({ hot: true, baked: true });
  const make = (name: string) => makeCreature(CREATURE_NAMES.includes(name) ? name : 'figure', flesh);
  const rides = new Rides({ land, group: under, make });
  const denizens = new Denizens({ land, group: under, make });
  const heard = { inside: 0, region: '', falls: 0 };
  sound.addLayer(hellSounds(heard));

  // ── The gate, in the forest ───────────────────────────────────────────────
  const way = new Gate({ scene, gen, spaces, kit: game.caves.kit, site: gate, terrain: (x: number, z: number) => chunks.heightAt(x, z) });
  spaces.onDemand((x: number, z: number) => way.ensure(x, z));
  // the cutting at its mouth, and a little in front: a segment and how far either side
  const mouth = { ax: gate.x - gate.ux * 4, az: gate.z - gate.uz * 4, bx: gate.x + gate.ux * (gate.portal + 3), bz: gate.z + gate.uz * (gate.portal + 3), r: gate.w + CLEAR };
  // No trees or undergrowth in it or round the gateway.
  chunks.on('vegetation', (ch: { x0: number; z0: number }) => {
    const s = chunks.size;
    const cx = (mouth.ax + mouth.bx) / 2;
    const cz = (mouth.az + mouth.bz) / 2;
    const reach = Math.hypot(mouth.bx - mouth.ax, mouth.bz - mouth.az) / 2 + mouth.r + 1;
    if (cx < ch.x0 - reach || cz < ch.z0 - reach || cx > ch.x0 + s + reach || cz > ch.z0 + s + reach) return;
    chunks.forEachPlant(cx, cz, reach, VEG_KINDS, (pc: unknown, kind: string, k: number, px: number, py: number, pz: number, sc: number) => {
      if (pc !== ch) return;
      segDist(px, pz, mouth.ax, mouth.az, mouth.bx, mouth.bz, _seg);
      if (_seg.d < mouth.r + (kind === 'rock' ? sc : 0)) chunks.hideInstance(ch, kind, k);
    });
  });
  // No digging into it, nor building over it.
  builder.obstacles.addSource((x: number, z: number, reach: number, out: object[]) => {
    if (Math.hypot(x - gate.x, z - gate.z) > reach + 40) return;
    for (let t = -2; t <= 22; t += 1.5) {
      const px = gate.x + gate.ux * t;
      const pz = gate.z + gate.uz * t;
      if (Math.hypot(px - x, pz - z) < reach + gate.w + 3) out.push({ x: px, z: pz, what: 'the gate', dig: gate.w + 2, wall: gate.w + 1.5, footing: gate.w + 2, roof: gate.w + 1.5, grown: true });
    }
  }, { grown: true });
  // Hell's side of the door: at the back of the cleft in the rock, facing out.
  {
    const frame = doorFrame(way.stone);
    land.place(R.wall + DOOR.depth - 1.6, 0, _at);
    frame.position.set(_at.x, land.top, _at.z);
    frame.rotation.y = Math.atan2(_at.x - land.cx, _at.z - land.cz);
    under.add(frame);
  }
  // On the map: somewhere to look up and head for, and to find by what it
  // leads to in a search in Routes (it's in no list there: it's to be come upon).
  let been = false; // through the door, ever
  let found = false; // to the gate
  const asPlace = () => ({ id: gate.id, x: gate.x - gate.ux * 5, z: gate.z - gate.uz * 5, name: gate.name, kind: 'gate', note: INSCRIPTION[0], words: SEARCH_WORDS, glyph: GLYPH, visited: been, yaw: Math.atan2(gate.ux, gate.uz) });
  map.places.addSource({
    within: (x0: number, z0: number, x1: number, z1: number) => (gate.x >= x0 && gate.x <= x1 && gate.z >= z0 && gate.z <= z1 ? [asPlace()] : []),
    get: (id: string) => (id === gate.id ? asPlace() : null),
    destinations: () => [asPlace()],
  });

  // ── Through the door ──────────────────────────────────────────────────────
  // Down from the chamber in the hill to the foot of Hell's stair, and back
  // up: through the dark either way.
  let passing = false;
  let armed = true;
  let out = false; // climbed out past Lucifer, ever
  // down: true through the door into Hell, false back up through it;
  // 'stars': out by the hidden road from the bottom, to the hillside before
  // the gate, or wherever another place says it comes up (leadOut)
  let onward: Onward | null = null;
  async function pass(down: boolean | 'stars') {
    if (passing) return;
    passing = true;
    armed = false;
    await card.darken(true);
    if (down === true) {
      been = true;
      save.touch();
      standAt(R.wall + DOOR.depth - 5.5, 0);
    } else if (down === 'stars') {
      out = true;
      save.touch();
      if (onward) await onward.arrive();
      else {
        const yaw = Math.atan2(-gate.ux, -gate.uz);
        player.spawn(gate.x - gate.ux * 9, gate.z - gate.uz * 9, yaw, yaw + Math.PI);
      }
      card.show({ lines: [SAID.stars], canto: 'XXXIV' }, onward ? 7000 : 12000);
    } else {
      const d = way.doorAt;
      const back = d.yaw + Math.PI;
      player.spawn(d.x - gate.ux * 2.6, d.z - gate.uz * 2.6, back, back + Math.PI, d.y);
    }
    await card.darken(false);
    passing = false;
  }

  // ── Being there ───────────────────────────────────────────────────────────
  // Whether the hiker is in Hell; and with them, what they bring.
  let inside = false;
  let region: ReturnType<typeof regionAt> | null = null;
  let ditch = -1; // which ditch of Malebolge you're over, and which zone of the ice
  let zone = -1;
  let fell = 0; // how fast you were falling, last frame
  let dipped = false; // the rest of the sound turned down for the voice
  let inscribed = false; // the lines over the gateway being read to you, on this walk up to it
  const brought = () => [player.character.root, ...(game.headlamp ? [game.headlamp.beam, game.headlamp.beam.target, game.headlamp.glow] : [])];
  const isIn = (p: THREE.Vector3) => p.y < space.lid && Math.hypot(p.x - land.cx, p.z - land.cz) < land.reach;
  let ready = false; // every creature's shape asked for, to be melted in the background
  function cross(now: boolean) {
    inside = now;
    if (now && !ready) {
      ready = true;
      for (const name of CREATURE_NAMES) makeCreature(name, flesh, { later: true });
    }
    for (const o of brought()) (now ? under : scene).add(o);
    air.fresh = true;
    weather.fresh = true;
    if (!now) {
      region = null;
      heard.inside = 0;
      hud.cue(null, 'hell');
      reader.stop();
    }
  }
  game.coverWhen(() => inside);

  // Stand somewhere in Hell: at radius r, angle th (land.js), facing the
  // middle unless told otherwise.
  function standAt(r: number, th: number, yaw?: number) {
    space.ref = th;
    air.fresh = true;
    weather.fresh = true;
    land.place(r, th, _at);
    const face = yaw ?? Math.atan2(land.cx - _at.x, land.cz - _at.z);
    player.spawn(_at.x, _at.z, face, face + Math.PI, land.height(_at.x, _at.z, th) + 0.5);
    terrain.settle(camera.position.x, camera.position.y, camera.position.z, th);
    furniture.settle(_at.x, _at.z, th);
    built.update(r, th);
  }

  // Yours, kept with your marks: whether you've found the gate, been through
  // it, and come out by the bottom; and which turn of the circles you're on
  // (where you stand is the player's to keep, but that only says where over
  // the land, not which time round: land.js).
  let turn = 0;
  save.register({
    id: 'hell',
    scope: 'yours',
    local: 'marks',
    collect: () => ({ turn, found, been, out }),
    validate: (raw: { turn?: unknown; found?: unknown; been?: unknown; out?: unknown } | null) => ({ turn: raw && Number.isInteger(raw.turn) ? raw.turn : 0, found: !!(raw && raw.found), been: !!(raw && raw.been), out: !!(raw && raw.out) }),
    restore: (kept: { turn: number; found: boolean; been: boolean; out: boolean }) => {
      turn = kept.turn;
      // (the angle nearest this is the one you were at)
      space.ref = turn * TAU;
      found = kept.found;
      been = kept.been;
      out = kept.out;
    },
  });

  // ── Every frame ───────────────────────────────────────────────────────────
  game.addSystem({
    name: 'hell',
    phase: 'world',
    update({ dt }: { dt: number }) {
      const p = player.pos;
      const now = isIn(p);
      if (now !== inside) cross(now);
      // Everything else turned down while the poem is read, wherever it is
      // being read: the voice is the browser's and doesn't come through the
      // game's sound, so nothing else can make room for it. (Purgatory above
      // shares this reader, so this says it for the mountain too.)
      if (reader.saying !== dipped) sound.under((dipped = reader.saying) ? 1 : 0);
      if (!inside) {
        way.update(p);
        const far = Math.hypot(p.x - gate.x, p.z - gate.z);
        // the dark wood, the first time you come on the gate
        if (!found && far < WOOD) {
          found = true;
          card.show(WORDS.darkwood);
          save.touch();
        }
        // The nine lines over the gateway, read to you as you come up to it
        // (they are cut in the stone to be read: gate.js). Walk in and they
        // go on being read down the passage, until the door; turn away from
        // the tablet and they stop there, to begin again next time.
        if (far < READS) {
          if (!inscribed) {
            inscribed = true;
            reader.read({ lines: INSCRIPTION });
          }
        } else if (inscribed && far > READS + 5 && player.space !== way.space) {
          inscribed = false;
          reader.stop();
        }
        // the door at the end of the passage
        const d = way.doorAt;
        const at = Math.hypot(p.x - d.x, p.z - d.z);
        if (at > REARM) armed = true;
        else if (armed && at < DOORWAY.reach && Math.abs(p.y - d.y) < 2 && way.space === player.space) {
          // (on your own feet: nothing that carries you goes through that door)
          if (player.carrier) {
            armed = false;
            hud.flash('whatever carries you will not go through that door', 3500);
          } else pass(true);
        }
        return;
      }
      meltSome(MELT_MS);
      const ref = space.follow(p.x, p.z);
      if (Math.round(ref / TAU) !== turn) {
        turn = Math.round(ref / TAU);
        save.touch();
      }
      land.polar(p.x, p.z, ref, _p);
      // ...and Hell's side of it: the back of the cleft you came in by
      if (Math.abs(_p.th) * _p.r < DOOR.half + 1) {
        const back = R.wall + DOOR.depth - 1.6 - _p.r;
        if (back > REARM) armed = true;
        else if (armed && back < DOORWAY.reach) pass(false);
      }
      const here = regionAt(_p.r);
      if (here !== region) {
        region = here;
        card.show(WORDS[here.id as keyof typeof WORDS]);
        space.surface = UNDERFOOT[here.id as keyof typeof UNDERFOOT] || 'rock';
        save.touch();
      }
      // each ditch of Malebolge as you come over it, and each zone of the ice
      const d = bolgiaAt(_p.r);
      if (d !== ditch) {
        ditch = d;
        if (d >= 0) card.show({ title: `Malebolge · the ${ORDINAL[d]} ditch`, who: DITCHES[d].who, canto: DITCHES[d].canto }, 6000);
      }
      const z = zoneAt(_p.r);
      if (z !== zone) {
        zone = z;
        if (z > 0) card.show({ title: `Cocytus · ${ZONE_WORDS[z].title}`, who: ZONE_WORDS[z].who }, 6000);
      }
      // a long fall, and you are still here (the line for it is an aside: it
      // waits rather than cut off the words of wherever you have landed)
      if (player.grounded && fell > FALL && player.rides.free) {
        hud.flash(SAID.fall, 4500);
        if (!reader.saying) reader.say(SAID.fall);
      }
      fell = player.grounded ? 0 : -player.vel.y;
      // at the bottom of everything, the way out
      if (_p.r < CENTRE && !passing) pass('stars');

      const eye = camera.position;
      const ax = land.cx - eye.x;
      const az = land.cz - eye.z;
      air.thick = weather.update(dt, here.id, eye, ax, az);
      air.update(dt, here.air, eye, ax, az);
      terrain.update(eye.x, eye.y, eye.z, ref, 5);
      furniture.update(p.x, p.z, ref, 3);
      built.update(_p.r, _p.th);
      denizens.update(dt, _p.r, _p.th);
      const cue = rides.update(dt, player, _p.r, _p.th);
      hud.cue(cue ? { html: `stand still · <b>${cue.text}</b>`, progress: cue.progress } : null, 'hell');
      // shut in, as under any rock: the forest overhead is not heard
      sound.setEnclosed(1);
      heard.inside = 1;
      heard.region = here.id;
      // the brook's fall, heard from the sand above it and the field below
      const lip = R.brink + STEPS[5].w / 2;
      const brook = land.sector(land.sectorOf(_p.th)).brook;
      heard.falls = Math.max(0, 1 - Math.hypot(_p.r - lip + 20, (_p.th - brook) * _p.r) / FALLS_HEARD);
    },
  });

  // ── The way on ────────────────────────────────────────────────────────────
  // Where the next way down is from where you are, for the HUD to point at
  // (after anything you're tracking on the map, which comes first): the
  // boat's landing, the ramp, the ford, Geryon, a bridge, the giant's hand.
  const way_ = { id: 'hell:way', label: '', color: '#c96a4a', x: 0, z: 0 };
  function wayOn() {
    if (!inside || !region || !player.rides.free) return null;
    const r = _p.r;
    const th = _p.th;
    const sec = land.sector(land.sectorOf(th));
    const to = (label: string, rr: number, a: number) => {
      land.place(rr, a, _at);
      way_.label = label;
      way_.x = _at.x;
      way_.z = _at.z;
      return way_;
    };
    const top = (i: number) => STEPS[i].at + (STEPS[i].pass?.back ?? 0) + 2;
    switch (region.id) {
      case 'vestibule':
      case 'acheron':
        return to("Charon's boat", R.acheronOut - 8, sec.ferry);
      case 'limbo':
        return to('the way down', top(0), sec.pass[0]);
      case 'lustful':
        return to('the way down', top(1), sec.pass[1]);
      case 'gluttons':
        return to('the way down', top(2), sec.pass[2]);
      case 'avaricious':
        return to('the way down to Styx', top(3), sec.pass[3]);
      case 'styx':
        return to("Phlegyas's boat", R.c4 - 62, sec.quay);
      case 'heretics':
        return to('the ruin', top(4), sec.pass[4]);
      case 'blood':
        return r > R.bloodOut ? to('the ford', R.bloodOut + 2, sec.ford) : to('the brook', R.bloodIn - 6, sec.brook + 6.7 / R.bloodIn);
      case 'wood':
      case 'sand':
      case 'brink':
        return to('Geryon', R.brink + STEPS[5].w / 2 + 2, sec.brook + 15 / R.brink);
      case 'malebolge': {
        // the nearest bridge's line, at the next bank in
        const sp = land.spokeAt(r, th, {});
        const i = bolgiaAt(r);
        const next = Math.max(R.well + 3, R.bolge - (Math.floor((R.bolge - r) / 80) + 1) * 80 - 4);
        return r < R.well + 30 ? to("Antaeus's hand", R.well + 2.2, land.spokes[0] + 14 / R.well) : to(i === 5 ? 'over the fallen bridge' : 'the bridge', next, land.spokes[sp.spoke]);
      }
      case 'well':
      case 'cocytus':
        return to('the way out', 0, 0);
      default:
        return null;
    }
  }
  hud.guide(wayOn);

  // Hell, drawn in place of the forest.
  game.addSystem({
    name: 'hell-view',
    phase: 'render',
    update({ dt }: { dt: number }) {
      if (!inside || map.isOpen) return;
      const exposure = air.lend(pipeline, camera);
      origin.follow(camera.position.x, camera.position.z);
      origin.wrapped(PERIOD, SHARED.uOrigin.value);
      origin.begin(under, camera);
      try {
        pipeline.render(under, camera, exposure, 1, dt);
      } finally {
        origin.end(under, camera);
        air.giveBack(pipeline, camera);
      }
    },
  });

  // ── From the console ──────────────────────────────────────────────────────
  let staged: THREE.Object3D | null = null;
  const api: Hell = {
    gate,
    way,
    land,
    space,
    terrain,
    furniture,
    built,
    rides,
    denizens,
    weather,
    air,
    card,
    reader,
    scene: under,
    get inside() {
      return inside;
    },
    get region() {
      return region ? region.id : null;
    },
    // where you are in it: { r, th, turn }
    get here() {
      land.polar(player.pos.x, player.pos.z, space.ref, _p);
      return { r: _p.r, th: _p.th, turn: Math.round(_p.th / TAU) };
    },
    // world.hell.enter() sets you down inside the door; go(r, th) anywhere
    enter: () => standAt(R.wall + DOOR.depth - 6, 0),
    go: standAt,
    // world.hell.stage('minos', 12) stands one of its creatures in front of
    // you, 12 m off, to be looked at; stage() takes it away again
    creatures: CREATURE_NAMES,
    stage(name: string | null, off = 8, turn = 0) {
      if (staged) under.remove(staged);
      staged = null;
      if (!name) return null;
      const one = makeCreature(name, flesh);
      const yaw = player.yaw;
      const x = player.pos.x + Math.sin(yaw) * off;
      const z = player.pos.z + Math.cos(yaw) * off;
      one.position.set(x, land.height(x, z, space.ref), z);
      one.rotation.y = yaw + Math.PI + turn;
      under.add(one);
      staged = one;
      return one.userData;
    },
    // through the door, as walking into it does: pass(true) down, pass(false) up
    pass,
    // melt every creature's flesh now, rather than a little each frame
    melt: () => meltSome(Infinity),
    get passing() {
      return passing;
    },
    get been() {
      return been;
    },
    get out() {
      return out;
    },
    leadOut(to: Onward) {
      onward = to;
    },
    get leads() {
      return !!onward;
    },
  };
  game.provide('hell', api);
}
