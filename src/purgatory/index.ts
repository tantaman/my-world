// Purgatory: an island alone in the southern ocean, and on it the mountain
// of the Purgatorio, climbed terrace by terrace to the forest at the top.
// It is where the road out of Hell comes up: go on past Lucifer, and you
// "come forth to rebehold the stars" on its shore, before dawn. Everything
// about it lives in this folder; this plugs it into the game.
//
//   plan.js        the plan of it, as the poem gives it: radii, heights, the ways up
//   site.js        where it is: off to one side of Hell, and lower
//   words.js       the poem's own lines for each place and moment (Longfellow's)
//   land.js        its ground, from the seed: the beach, the slopes, the terraces, the top
//   space.js       the floor and walls you walk by, and the law of the mountain
//   air.js         the sky (the forest's, keeping the mountain's hours), the haze, the smoke
//   brow.js        the seven P's on your brow
//   sound.js       what it sounds like: the sea, the wind, the singing
//   pictures.js    what drinking from the stream looks like, on its button
//   view.js        what it looks like: fetched the first time you come up the road
//                  (and what it builds: look.js, models.js, furnish.js, built.js, people.js)
//
// Purgatory changes nothing the seed grows. It lies under the forest, off
// to one side of Hell and lower still, and is drawn as a scene of its own:
// while you are there the forest isn't drawn (game.coverWhen), and the
// hiker, their lamp and the sky are moved into Purgatory's scene to be drawn
// in it. Its day is its own, whatever the hour in the forest.

import * as THREE from 'three';
import type { Game } from '../game/game.ts';
import { lazy } from '../core/lazy.ts';
import { Card } from '../core/card.js';
import { SHARED } from '../render/uniforms.js';
import { PERIOD } from '../render/glsl.js';
import { MountLand, wrap } from './land.js';
import { MountSpace } from './space.js';
import { MountAir } from './air.js';
import { placeOf } from './site.js';
import { Brow } from './brow.js';
import { mountSounds } from './sound.js';
import { R, H, AT, BURROW, CLEFT, VALLEY, GATE, WAYS, TERRACES, DAY, LIQUID, STREAM, regionAt, terraceAt } from './plan.js';
import { WORDS, ARRIVAL, ANGELS, DREAMS, SLEEP, SAID, VOICES } from './words.js';
import * as pictures from './pictures.js';

// What this provides: game.purgatory, for the features that come after it.
declare module '../game/game.ts' {
  interface Services {
    purgatory: Purgatory;
  }
}

// What Purgatory is to whoever comes after it (and world.purgatory in the
// console: see the end of the file).
export interface Purgatory {
  land: MountLand;
  space: MountSpace;
  card: Card;
  scene: THREE.Scene;
  readonly inside: boolean;
  readonly region: string | null;
  hours: number;
  [more: string]: unknown;
}

// A place's words, as the card takes them (core/card.js).
interface Words {
  title?: string;
  who?: string;
  canto?: string;
  book?: string;
  lines?: string[];
}

const CARD_MS = 9000; // ms a place's words are shown
const NEAR = { cato: 14, rock: 12, angel: 7, tree: 22, stream: 12, burrow: 1.6 };
const OUT_OF = 5; // m out of the burrow's dark that you come up
const BOAT_SINGS = [5.4, 6.3]; // the hours the angel's boat is heard coming in (people.js brings it)
const STARS_READ = 7.5; // s Hell's last line is read for, coming up, before anything is said here // m: how near something you are for it to be said
const VOICE_EVERY = [22, 38]; // s between the voices over the second terrace
const QUAKE_EVERY = [240, 520]; // s between the mountain's trembling
const QUAKE_LONG = 6; // s it goes on
const QUAKE_SHAKE = 0.07; // m the eye is shaken, at worst
const FIRE = { into: 0.05, glow: 'rgba(255, 120, 40, 0.55)' }; // how far up the last stair the fire reaches (u), and what you see in it
// What the ground of each region sounds like underfoot (audio/footsteps.js;
// 'stone' is sound.js's).
const UNDERFOOT: Record<string, string> = { shore: 'dirt', plain: 'grass', foot: 'grass', terrace: 'grass', slope: 'grass', valley: 'grass', ledge: 'grass', eden: 'grass' };

const _p = { r: 0, th: 0 };
const _at = { x: 0, z: 0 };
const _s = { along: 0, across: 0, level: 0, kind: 0, spring: false, sink: false };
const _shake = new THREE.Vector3();
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const wait = (ms: number) => new Promise((done) => setTimeout(done, ms));

// The features this uses, so it is installed after them (game/features.js).
// (hell: the road here is the one out of the bottom of Hell.)
export const after = ['render', 'ui', 'world', 'player', 'audio', 'caves', 'map', 'hell'];
export function installPurgatory(game: Game) {
  const { scene, camera, spaces, player, pipeline, origin, sound, save, map, hud, sky } = game;
  // (a world with no gate has no Hell, and no road up out of it)
  const hell = game.hell;
  if (!hell) return;

  // Where it is (site.js): off to one side of Hell, and lower.
  const land = new MountLand({ seed: game.gen.seed, ...placeOf(hell.land) });
  const space = new MountSpace(land);
  spaces.add(space);

  // Purgatory's own scene: what is drawn while you're there.
  const under = new THREE.Scene();
  under.userData.heat = true; // (the air shimmers over the fire of the seventh terrace)
  const air = new MountAir(sky, land);
  // The poem read aloud, in the same voice that reads the Inferno below
  // (hell.reader, core/reader.ts): what the card shows is said as you come
  // to it, and Hell's own frame work turns the rest of the sound down while
  // it speaks.
  const card = new Card({ id: 'purgatory', book: 'Purgatorio', reader: hell.reader });
  const brow = new Brow();
  const heard = { inside: 0, region: '', sea: 0, high: 0, fire: 0, quake: 0, birds: 0, chant: '', chantFor: 0, moments: [] as string[] };
  sound.addLayer(mountSounds(heard));
  // something sung wherever you are, for a while (sound.js: CHANTS)
  const chant = (name: string, s: number) => {
    heard.chant = name;
    heard.chantFor = s;
  };
  // What it looks like: fetched the first time it's wanted (the road up out
  // of Hell, or a save that left you there).
  const view = lazy(() => import('./view.js'));
  let shown: ReturnType<typeof import('./view.js').buildView> | null = null;
  function look() {
    if (!shown) {
      const m = view.want();
      if (m) shown = m.buildView({ land, space, group: under, models: game.chunks.models, materials: game.materials });
    }
    return shown;
  }
  async function looked() {
    await view.ready();
    return look();
  }
  game.lights.addSource(under, (eye: THREE.Vector3, out: object[]) => {
    if (shown) shown.lightsNear(eye, out);
  });

  // ── Yours, kept with your marks ───────────────────────────────────────────
  // the mountain's hour; whether you've been, been marked at the gate, how
  // many P's have been wiped from your brow, tasted Lethe, drunk of Eunoë;
  // how many nights you've slept here; and whether you were here when last
  // seen (so what it looks like is fetched before you're set down in it)
  let hours = DAY.arrive;
  let been = false;
  let marked = false;
  let wiped = 0;
  let lethe = false;
  let done = false;
  let dreams = 0;
  let inside = false;
  save.register({
    id: 'purgatory',
    scope: 'yours',
    local: 'marks',
    collect: () => ({ hours: Math.round(hours * 1000) / 1000, been, marked, wiped, lethe, done, dreams, on: inside }),
    validate: (raw: Record<string, unknown> | null) => {
      const n = (v: unknown, lo: number, hi: number, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
      return {
        hours: n(raw && raw.hours, 0, 24, DAY.arrive),
        been: !!(raw && raw.been),
        marked: !!(raw && raw.marked),
        wiped: Math.round(n(raw && raw.wiped, 0, 7, 0)),
        lethe: !!(raw && raw.lethe),
        done: !!(raw && raw.done),
        dreams: Math.round(n(raw && raw.dreams, 0, 99, 0)),
        on: !!(raw && raw.on),
      };
    },
    restore: (kept: { hours: number; been: boolean; marked: boolean; wiped: number; lethe: boolean; done: boolean; dreams: number; on: boolean }) => {
      hours = kept.hours;
      been = kept.been;
      marked = kept.marked;
      wiped = kept.wiped;
      lethe = kept.lethe;
      done = kept.done;
      dreams = kept.dreams;
      land.shut = !marked;
      // left standing on the mountain: what it looks like must be here
      // first, and the forest overhead needn't be
      if (kept.on) {
        game.beforeArrival(looked());
        game.arrivesCovered();
      }
    },
  });

  // ── What is said ──────────────────────────────────────────────────────────
  // A place's words, one after another: what comes up while something is
  // being read waits its turn (and only the last few wait).
  const queue: Array<{ words: Words; ms: number }> = [];
  let reading = 0; // s until what's shown has been read
  function tell(words: Words, ms = CARD_MS) {
    if (queue.length > 2) queue.shift();
    queue.push({ words, ms });
  }
  function tellNow(words: Words, ms = CARD_MS) {
    queue.length = 0;
    // (how long they are up for: longer than ms where reading them aloud
    // takes longer, so the next moment waits for the voice)
    reading = card.show(words, ms) / 1000;
  }
  // What has been said this time on the mountain, that isn't said twice.
  const said = new Set<string>();
  const once = (key: string, words: Words, ms = CARD_MS) => {
    if (said.has(key)) return;
    said.add(key);
    tell(words, ms);
  };

  // ── Being there ───────────────────────────────────────────────────────────
  let region: string | null = null;
  const brought = () => [player.character.root, ...(game.headlamp ? [game.headlamp.beam, game.headlamp.beam.target, game.headlamp.glow] : []), sky.dome, sky.sun, sky.sun.target, sky.hemi];
  const isIn = (p: THREE.Vector3) => p.y < space.lid && p.y > land.top - 200 && Math.hypot(p.x - land.cx, p.z - land.cz) < R.reach + 30;
  function cross(now: boolean) {
    inside = now;
    // (whatever is in Purgatory's scene goes back to the forest's; what
    // another place has taken into its own, it keeps)
    for (const o of brought()) {
      if (now) under.add(o);
      else if (o.parent === under) scene.add(o);
    }
    air.fresh = true;
    if (now) {
      look();
      said.clear();
    } else {
      region = null;
      night = false;
      space.ceiling = Infinity;
      heard.inside = 0;
      hud.cue(null, 'purgatory');
      brow.show(0, false);
      brow.burn(0, FIRE.glow);
      queue.length = 0;
    }
    save.touch();
  }
  game.coverWhen(() => inside);

  // Stand somewhere on the island: at radius r, angle th (land.js), facing
  // the mountain unless told otherwise.
  function standAt(r: number, th: number, yaw?: number) {
    land.place(r, th, _at);
    const face = yaw ?? Math.atan2(land.cx - _at.x, land.cz - _at.z);
    const y = land.height(_at.x, _at.z) + 0.4;
    player.spawn(_at.x, _at.z, face, face + Math.PI, y);
    // (set down at night, it is where you are now that you can go no higher than)
    if (night) space.ceiling = y + DAY.slack;
    air.fresh = true;
    const v = look();
    if (v) v.settle(camera.position, _at.x, _at.z);
  }

  // The road up out of Hell comes up here, in the knoll on the plain.
  hell.leadOut({
    async arrive() {
      await looked();
      const first = !been;
      if (first) {
        been = true;
        hours = DAY.arrive;
      }
      // (out of the dark, facing the sea and the east: Venus over it)
      land.place(BURROW.r + OUT_OF, AT.burrow, _at);
      standAt(BURROW.r + OUT_OF, AT.burrow, Math.atan2(_at.x - land.cx, _at.z - land.cz));
      // (Hell says the Inferno's last line, coming out: what is said here waits for it)
      queue.length = 0;
      reading = STARS_READ;
      if (first) tell(ARRIVAL, 11000);
      save.touch();
    },
  });

  // Back down the road, into the dark: to the ice at the bottom of Hell,
  // near the middle ("Thereafter be not this way your return").
  let passing = false;
  async function down() {
    if (passing) return;
    passing = true;
    await card.darken(true);
    hell.go(BACK_DOWN.r, BACK_DOWN.th);
    await card.darken(false);
    hell.card.show(SAID.return, CARD_MS);
    passing = false;
  }
  const BACK_DOWN = { r: 70, th: Math.PI }; // where on the ice of Cocytus the road down comes out: the far side of Lucifer from the way up

  // ── Night, and sleep ──────────────────────────────────────────────────────
  // "Thou couldst not pass after the sun is gone": from sunset, you can't go
  // higher than you were (space.js), only down and round. Stand still in
  // the deep of the night and sleep comes; and a dream with it, the poem's,
  // in its order. Asleep in the valley before you've been to the gate,
  // Lucia carries you up to it.
  let night = false;
  let still = 0; // s you've stood still at night
  let sleeping = false;
  const isNight = (h: number) => h >= DAY.set || h < DAY.rise;
  const deepNight = (h: number) => h >= DAY.set || h < DAY.rise - 1.2;
  async function sleep() {
    if (sleeping || passing) return;
    sleeping = true;
    await card.darken(true);
    const dream = dreams < DREAMS.length ? DREAMS[dreams] : SLEEP;
    dreams++;
    reading = card.show(dream, 9000) / 1000;
    await wait(7000);
    if (region === 'valley' && !marked) {
      hours = DAY.lucia;
      standAt(R.cliff + GATE.steps * GATE.tread + 5, AT.gate);
      tell(SAID.lucia);
    } else hours = DAY.wake;
    night = false;
    space.ceiling = Infinity;
    still = 0;
    await card.darken(false);
    sleeping = false;
    save.touch();
  }

  // ── The P's ───────────────────────────────────────────────────────────────
  // Cut by the angel at the gate, all seven; wiped, one at each stair's foot,
  // by the angel there; and the climb lighter for each.
  function mark() {
    marked = true;
    land.shut = false;
    tell({ ...SAID.cut }, 8000);
    tell({ ...SAID.enter }, 7000);
    tell({ ...SAID.deum }, 6000);
    heard.moments.push('door');
    chant('deum', 50);
    brow.show(7, true);
    save.touch();
  }
  function wipe(k: number) {
    wiped = k + 1;
    tellNow(ANGELS[k], 8000);
    if (k === 0) tell(SAID.lighter, 7000);
    brow.show(7 - wiped, true);
    if (shown) shown.angelAt(k);
    heard.moments.push('wing');
    save.touch();
  }

  // ── Lethe and Eunoë ───────────────────────────────────────────────────────
  // What water is at your feet: its kind, if you're standing in it.
  function waterHere() {
    if (!inside) return LIQUID.none;
    const o = { kind: 0 };
    return space.depth(player.pos.x, player.pos.z, o) > 0.05 ? o.kind : LIQUID.none;
  }
  async function drink() {
    const w = waterHere();
    if (w === LIQUID.lethe) {
      lethe = true;
      tellNow(SAID.forget, 8000);
      save.touch();
    } else if (w === LIQUID.eunoe || w === LIQUID.spring) {
      if (!lethe) tellNow(SAID.first, 8000);
      else await finish();
    }
  }
  // Drunk of Eunoë: "pure and disposed to mount unto the stars". Up into the
  // light, and down onto the hillside before the gate, where it all began.
  async function finish() {
    if (passing) return;
    passing = true;
    done = true;
    save.touch();
    await card.darken(true, '#fff6e2');
    card.show(SAID.end, 14000);
    await wait(5000);
    const g = hell.gate;
    const yaw = Math.atan2(-g.ux, -g.uz);
    player.spawn(g.x - g.ux * 9, g.z - g.uz * 9, yaw, yaw + Math.PI);
    await card.darken(false);
    passing = false;
  }
  game.commands.add({
    id: 'drink',
    group: 'ACT',
    label: 'drink from the stream',
    icon: pictures.DRINK,
    run: () => {
      drink();
    },
    now: () => (waterHere() >= LIQUID.lethe ? 'drink' : ''),
  });

  // ── Every frame ───────────────────────────────────────────────────────────
  let voiceAt = rand(...(VOICE_EVERY as [number, number]));
  let voice = 0;
  let quakeAt = rand(...(QUAKE_EVERY as [number, number]));
  let quaking = 0; // s of trembling left
  let burning = 0; // how far into the wall of fire you are (0..1)
  game.addSystem({
    name: 'purgatory',
    phase: 'world',
    update({ dt }: { dt: number }) {
      const p = player.pos;
      const now = isIn(p);
      if (now !== inside) cross(now);
      if (!inside) return;
      const v = look();

      // the mountain's own day
      hours = (hours + (dt * 24) / (DAY.minutes * 60)) % 24;
      land.polar(p.x, p.z, 0, _p);
      const r = _p.r;
      const th = _p.th;
      const h = p.y - land.top;

      // night falls, and nobody climbs
      const dark = isNight(hours);
      if (dark !== night) {
        night = dark;
        space.ceiling = night ? p.y + DAY.slack : Infinity;
        if (night) {
          once('night', SAID.night, 8000);
          once('down', SAID.down, 7000);
        } else {
          said.delete('night');
          said.delete('down');
        }
      }
      const resting = player.grounded && player.rides.free && Math.hypot(player.vel.x, player.vel.z) < 0.15;
      still = night && deepNight(hours) && resting && !passing ? still + dt : 0;
      if (still > DAY.sleep) sleep();
      hud.cue(
        night && !sleeping
          ? { html: deepNight(hours) ? 'night · you can go down and round, but not up · <b>stand still</b> to sleep' : 'night · you can go down and round, but not up', progress: still / DAY.sleep }
          : null,
        'purgatory',
      );

      // where you are, and what is said of it
      const here = regionAt(r, th, h);
      if (here !== region) {
        region = here;
        tell(WORDS[here as keyof typeof WORDS]);
        space.surface = UNDERFOOT[here] || 'stone';
      }
      moments(dt, r, th, h);

      // what is shown and heard. The next moment waits out the one before it:
      // for as long as its words are up, and for as long as the voice is
      // still reading them, which is the longer of the two where the
      // browser's voice is slower than the reckoning of it (core/reader.ts).
      if (reading > 0) reading -= dt;
      else if (hell.reader.saying) {
        /* still being read: it waits */
      } else if (queue.length) {
        const next = queue.shift()!;
        reading = card.show(next.words, next.ms) / 1000;
      }
      brow.show(marked && !done ? 7 - wiped : 0, false);
      const eye = camera.position;
      air.update(dt, here === 'wrath', r, th);
      air.lendHour(hours, game.focus, eye);
      if (v) v.update(dt, eye, { r, th, h, hours, region: here, wiped });
      heard.inside = 1;
      heard.region = here;
      heard.sea = Math.max(0, 1 - Math.abs(r - R.shore) / 180) * (h < 30 ? 1 : 0.4);
      heard.high = Math.min(1, Math.max(0, (h - 60) / 500));
      heard.birds = here === 'eden' ? 1 : here === 'valley' || here === 'plain' ? 0.3 : 0;
      heard.fire = here === 'lust' ? 0.7 + 0.3 * burning : burning;
      heard.quake = quaking > 0 ? Math.min(1, quaking / 2) : 0;
      // the souls in the angel's boat, singing as it comes in at dawn
      if ((here === 'shore' || here === 'plain') && hours > BOAT_SINGS[0] && hours < BOAT_SINGS[1]) chant('exitu', 2);
      sound.setEnclosed(0);
    },
  });

  // What happens where: the poem's moments, each where it has them.
  function moments(dt: number, r: number, th: number, h: number) {
    const near = (rr: number, a: number) => Math.hypot(r - rr, wrap(th - a) * r);
    // on the plain: Cato, by the burrow; and the burrow back down
    if (region === 'plain' || region === 'shore') {
      // the angel's boat, come in at dawn with its souls
      if (hours > BOAT_SINGS[0] + 0.45 && hours < BOAT_SINGS[1]) {
        once('pilot', SAID.pilot);
        once('exitu', SAID.exitu, 7000);
      }
      if (near(BURROW.r + 6, AT.cato) < NEAR.cato) {
        once('cato', SAID.cato);
        once('rush', SAID.rush);
      }
      const along = r - BURROW.r;
      const across = wrap(th - AT.burrow) * r;
      if (Math.abs(across) < BURROW.half && along < BURROW.back + NEAR.burrow && along > BURROW.back - 3 && !passing) down();
    }
    // up the cleft at the foot
    if (r < 2000 && r > CLEFT.r1 && Math.abs(wrap(th - AT.cleft)) * r < CLEFT.half + 1) once('cleft', SAID.cleft);
    if (region === 'terrace' && near(1930, AT.rock) < NEAR.rock) once('belacqua', SAID.belacqua);
    if (region === 'slope') once('shadow', SAID.shadow);
    // the valley: the princes singing, and at evening the serpent
    if (region === 'valley') {
      once('salve', SAID.salve);
      if (hours > DAY.set - 1.4 && hours < DAY.set) {
        once('serpent', SAID.serpent);
        once('angels', SAID.angels);
      }
    }
    // the gate: on its third step, the angel marks you
    if (!marked && region === 'ledge') {
      const across = Math.abs(wrap(th - AT.gate)) * r;
      if (across < GATE.half && r > R.cliff && r < R.cliff + GATE.tread * GATE.steps) once('steps', SAID.steps, 9000);
      if (across < GATE.half && r > R.cliff - 0.5 && r < R.cliff + GATE.tread * 1.1 && h - H.ledge > GATE.rise * 2.5) mark();
    }
    const way = land.wayAt(r, th);
    if (way && way.k === 0) once('needle', SAID.needle);
    // the angel at the foot of each stair, and the P it wipes
    const t = terraceAt(h);
    if (marked && t >= 0 && t < 7 && wiped === t) {
      const w = WAYS[t + 1];
      if (near(w.ra + 1.5, w.a0) < NEAR.angel || (way && way.k === t + 1)) wipe(t);
    }
    switch (region) {
      case 'pride':
        once('weather', SAID.weather, 8000);
        if (r < TERRACES[0].r - 3.5) once('carved', SAID.carved);
        once('bent', SAID.bent);
        break;
      case 'envy':
        once('wired', SAID.wired);
        voiceAt -= dt;
        if (voiceAt < 0) {
          voiceAt = rand(...(VOICE_EVERY as [number, number]));
          tell({ title: 'A voice, flying', lines: VOICES[voice % VOICES.length] }, 5000);
          voice++;
          heard.moments.push('voice');
        }
        break;
      case 'wrath':
        if (air.smoke > 0.6) once('agnus', SAID.agnus);
        break;
      case 'gluttony':
        if (shown && shown.nearTree(player.pos.x, player.pos.z) < NEAR.tree) {
          once('tree', SAID.tree);
          once('scarcity', SAID.scarcity);
        }
        break;
      case 'lust': {
        once('edge', SAID.edge, 7000);
        once('summae', SAID.summae);
        const w = WAYS[7];
        if (near(w.ra + 1.5, w.a0) < 14) once('fire', SAID.fire);
        break;
      }
      case 'eden':
        once('crown', SAID.crown, 9000);
        streamNear(r, th);
        break;
    }
    // in the wall of fire at the foot of the last stair
    const inFire = !!way && way.k === 7 && way.up < FIRE.into;
    burning += ((inFire ? 1 : 0) - burning) * Math.min(1, dt * 3);
    if (inFire) once('glass', SAID.glass, 7000);
    if (way && way.k === 7 && way.up > 0.4 && hours > DAY.set - 2.5) once('departs', SAID.departs);
    // the mountain trembles, now and then: somebody is freed
    quakeAt -= dt;
    if (quakeAt < 0) quake();
    if (quaking > 0) quaking -= dt;
  }

  // Near the stream on the top: Lethe, the lady over it, Eunoë.
  function streamNear(r: number, th: number) {
    const s = land.stream(r, th, _s);
    if (!s.kind || Math.abs(s.across) > NEAR.stream + STREAM.half) return;
    if (s.kind === LIQUID.lethe) {
      once('lethe', SAID.lethe, 11000);
      once('matilda', SAID.matilda);
    } else once('eunoe', SAID.eunoe);
  }

  function quake() {
    quakeAt = rand(...(QUAKE_EVERY as [number, number]));
    quaking = QUAKE_LONG;
    tellNow(SAID.quake, 7000);
    tell(SAID.gloria, 6000);
    chant('gloria', 14);
  }

  // ── The way on ────────────────────────────────────────────────────────────
  // Where the next way up is from where you are, for the HUD to point at
  // (after anything you're tracking on the map): the cleft, the gate, the
  // stair, the stream.
  const onward = { id: 'purgatory:way', label: '', color: '#e8c36a', x: 0, z: 0 };
  function wayOn() {
    if (!inside || !region || !player.rides.free || done) return null;
    const to = (label: string, rr: number, a: number) => {
      land.place(rr, a, _at);
      onward.label = label;
      onward.x = _at.x;
      onward.z = _at.z;
      return onward;
    };
    land.polar(player.pos.x, player.pos.z, 0, _p);
    const h = player.pos.y - land.top;
    switch (region) {
      case 'shore':
      case 'plain':
      case 'foot':
        return to('the cleft', R.foot + 2, AT.cleft);
      case 'terrace':
      case 'slope':
      case 'valley':
      case 'ledge':
        return marked ? to("the needle's eye", R.cliff + 1, AT.gate) : to('the gate', R.cliff + GATE.tread * GATE.steps + 1, AT.gate);
      case 'eden': {
        const along = lethe ? STREAM.spring + STREAM.pool + 12 : -40;
        const pt = land.streamPoint(along, _at);
        onward.label = lethe ? 'Eunoë' : 'Lethe';
        onward.x = pt.x;
        onward.z = pt.z;
        return onward;
      }
      default: {
        const t = terraceAt(h);
        if (t < 0 || t > 6) return null;
        const w = WAYS[t + 1];
        return to(t === 6 ? 'the wall of fire' : 'the stair', w.ra + 1, w.a0);
      }
    }
  }
  hud.guide(wayOn);

  // Purgatory, drawn in place of the forest.
  game.addSystem({
    name: 'purgatory-view',
    phase: 'render',
    update({ dt }: { dt: number }) {
      if (!inside || map.isOpen) return;
      const exposure = air.lend(pipeline, camera, land.top);
      // (the mountain trembling: the eye shaken a little, for this frame)
      const shake = quaking > 0 ? QUAKE_SHAKE * Math.min(1, quaking / 2) : 0;
      _shake.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(shake);
      camera.position.add(_shake);
      camera.updateMatrixWorld();
      origin.follow(camera.position.x, camera.position.z);
      origin.wrapped(PERIOD, SHARED.uOrigin.value);
      origin.begin(under, camera);
      try {
        pipeline.render(under, camera, exposure, 1, dt);
      } finally {
        origin.end(under, camera);
        camera.position.sub(_shake);
        camera.updateMatrixWorld();
        air.giveBack(pipeline, camera);
      }
      brow.burn(burning, FIRE.glow);
    },
  });

  // ── From the console ──────────────────────────────────────────────────────
  const api: Purgatory = {
    land,
    space,
    card,
    air,
    brow,
    scene: under,
    get view() {
      return shown;
    },
    get inside() {
      return inside;
    },
    get region() {
      return region;
    },
    // where you are on the island: { r, th, h } (h: m over the sea)
    get here() {
      land.polar(player.pos.x, player.pos.z, 0, _p);
      return { r: _p.r, th: _p.th, h: player.pos.y - land.top };
    },
    // the mountain's hour; set it to see it at another
    get hours() {
      return hours;
    },
    set hours(h: number) {
      hours = ((h % 24) + 24) % 24;
    },
    get night() {
      return night;
    },
    get marked() {
      return marked;
    },
    get wiped() {
      return wiped;
    },
    get lethe() {
      return lethe;
    },
    get done() {
      return done;
    },
    get passing() {
      return passing || sleeping;
    },
    get dreams() {
      return dreams;
    },
    // the ways up (plan.WAYS): 0 the needle's eye, k from terrace k to k + 1
    ways: WAYS,
    // world.purgatory.go(r, th) sets you down anywhere; arrive() as if up the
    // road from Hell; stair(k) at the foot of a way up (0: the needle's eye)
    go: standAt,
    // world.purgatory.stand(x, z) at a world position on the island
    stand(x: number, z: number) {
      land.polar(x, z, 0, _p);
      standAt(_p.r, _p.th);
    },
    arrive: () => hell.pass('stars'),
    stair(k: number) {
      const w = WAYS[k];
      standAt(w.ra + 2.5, w.a0 + 2 / w.ra);
    },
    // world.purgatory.at('lethe') where something is: { x, z }
    at(what: string) {
      if (what === 'lethe' || what === 'eunoe' || what === 'spring') return land.streamPoint(what === 'lethe' ? -40 : what === 'spring' ? STREAM.spring : STREAM.spring + 40, {});
      if (what === 'valley') return land.place(VALLEY.r, AT.valley, {});
      if (what === 'gate') return land.place(R.cliff + 2, AT.gate, {});
      if (what === 'burrow') return land.place(BURROW.r, AT.burrow, {});
      return null;
    },
    mark,
    wipe,
    sleep,
    quake,
    drink,
    down,
  };
  game.provide('purgatory', api);
}
