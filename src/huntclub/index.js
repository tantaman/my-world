// The hunt clubs: a timber clubhouse with a skeet field in front of it, the
// first a longer walk out from where you first arrive than the video store,
// and the rest out in the forest, a little under one to every two squares
// of FAR.cell (site.js). They're on the map, so `go here` sets you down at the foot of a
// club's porch steps; the nearest is the one that stands, and the shotgun,
// the round and your best are the same at any of them.
//
// Up on the porch, the steward serves from a hatch in the wall. Ask, and
// you're given a shotgun, yours from then on: it goes in the rifle's slot on
// the tool bar. Then walk out to station 1, by the high house, and call
// "pull!": a round of skeet, 25 targets thrown from the two houses, singles
// and doubles from eight stations round the field, scored on a card at the
// top of the screen. Your best round is kept.
//
//   site.js       where the clubs are, grown from the seed and the land, and
//                 how high everything in one stands
//   skeet.js      the field, a target's flight, the shot's pattern, the rules of a round
//   range.js      the field at work: the throws, the targets flying and breaking, the score
//   club.js       what it looks like: the clubhouse, the houses, the pads, the walks
//   shotgun.js    the shotgun on the tool bar
//   models.js     the shotgun, a clay target
//   scorecard.js  the card at the top of the screen while you shoot a round
//   sound.js      the shot, loading, "pull!", the trap, a target breaking
//
// Nothing about the forest changes for a club: see site.js. Whether you
// have a shotgun, your best round and which clubs you've been to are yours,
// saved.
//
// From the console:
//   world.huntclub.site               the club you're at, or were last near
//   world.huntclub.home               the first club; .clubs, the rest (cell(i, j), byId(id))
//   await world.huntclub.go(id?)      stand at the foot of the porch steps (there, or at the club with that id)
//   world.huntclub.toCounter()        stand at the hatch
//   world.huntclub.toStation(n)       stand on station n, facing the crossing point
//   world.huntclub.range              the round, the throw, the targets in the air
//   world.huntclub.give()             be given the shotgun, wherever you are
//   world.huntclub.lead(target)       where to aim to break a target in the air

import * as THREE from 'three';
import { candidates, pickSite, clearOf, regionsInTheWay, layout, HuntClubs, FAR, FAR_REACH, RING, PLAN, CLUB, EDGE, TREAD } from './site.js';
import { STATIONS, HOUSES, FIELD, meeting, validateRecord } from './skeet.js';
import { Range } from './range.js';
import { buildClub, COUNTER } from './club.js';
import { shotgunTool } from './shotgun.js';
import { Scorecard } from './scorecard.js';
import './sound.js';
import { clearOf as storeClearOf } from '../videostore/site.js';
import { isGame } from '../hunting/quarry.js';
import { Body } from '../towns/people.js';
import { onPlan, planDiscs, toWorld, toLocal } from '../landmarks/sites.js';
import { VEG_STRIDE } from '../world/flora.js';
import { rayBox, wrapAngle } from '../core/geom.js';
import { hash2i, mulberry32 } from '../noise.js';
import { GridNearest, PendingNearest, MergeNearest } from '../core/nearest.js';

const BEEN_KEPT = 500; // far clubs you've been to, the most remembered
const NEAREST_AFTER = 0.5; // s between looks for the nearest club
const SWAP_NEARER = 120; // m nearer another club must be to take the place of one that's stood up
const PREFETCH = 2500; // m round you within which clubs are looked for ahead of time
const PUMP_MS = [1.5, 6]; // ms a frame spent looking for them: about, and while the map is open
const SHOW = 450; // m: the club is stood up this close...
const HIDE = 560; // ...and taken down past this
const ARRIVE = 40; // m from the foot of the steps that counts as there
const AT_COUNTER = 1.5; // m from the spot in front of the hatch that counts as at it
const GREET = 7; // m from the hatch the steward says hello from
const GREET_AGAIN = 90; // s before the steward says hello again
const CARD_KEEP = 30; // s the card stays up after a round is over
const MARK = { up: 2.3, bob: 0.12, rate: 2.2 }; // the arrow over the next station: how high over its pad (m), how far it bobs, how fast
const LIT = 0.6; // how much of its own colour the gun room gives off, lit from within
// How far (m) plants of each kind are kept back from the field.
const KEEP_BACK = { pine: 1.8, broad: 2, birch: 1.4, bush: 0.7, fern: 0.25, rock: 1.1, log: 2.4 };
const SCALED = { rock: true, log: true };
// a clay target flying, on the map's badge
const GLYPH = ['.......', '...###.', '..#####', '#.#####', '.#.###.', '#......', '.......'];
const STEWARDS = [
  { name: 'Walt', her: false },
  { name: 'Dottie', her: true },
  { name: 'Earl', her: false },
  { name: 'Marge', her: true },
  { name: 'Hank', her: false },
  { name: 'June', her: true },
];
const SAYS = {
  hello: ['Afternoon! Come to shoot some skeet?', 'Welcome to the club! Field’s open.', 'Howdy! Here for a round?'],
  ask: 'You’ll want a gun. Step up to the hatch and I’ll fix you up.',
  give: 'Here you go: a twelve-gauge over-and-under, and it’s yours. Station 1’s by the high house, on your left. Lead your targets!',
  back: ['Good to see you again.', 'Back for another round?', 'Field’s all yours.'],
};
const CHEER = (score) => (score === 25 ? 'A straight! Twenty-five straight!' : score >= 22 ? `${score}! Fine shooting.` : score >= 16 ? `${score}. Not bad at all.` : `${score}. Keep your gun moving, and lead ’em more.`);

const _l = { x: 0, z: 0 };
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const overlaps = (b, x0, z0, x1, z1) => b[0] <= x1 && b[2] >= x0 && b[1] <= z1 && b[3] >= z0;

// The features this uses, so it is installed after them (game/features.js):
// the video store, the abandoned buildings, the airfields and the race
// tracks for what the clubs keep clear of, along with everything they keep
// clear of; towns for
// the steward's body and voice; hunting for game and kills, and to put the
// shotgun in the rifle's slot.
export const after = ['render', 'ui', 'world', 'player', 'audio', 'build', 'map', 'save', 'towns', 'wildlife', 'hunting', 'videostore', 'abandoned', 'airports', 'racetrack', 'act'];
export function installHuntclub(game) {
  const { scene, gen, chunks, grass, solids, landforms, player, builder, map, hud, commands, save, sound, landmarks, towns, caves, railway, spaceport, videostore, abandoned, airports, racetrack, wildlife, hunting, act } = game;

  // ── Where they are ────────────────────────────────────────────────────────
  // Clear of everything there first: what the video store keeps clear of,
  // every store and abandoned building, and the airfields. (Every launch
  // site, store and building, not the ones nearest you: where a club is
  // mustn't depend on where you were when it was decided.)
  const fields = airports.airports;
  const reserved = storeClearOf({ landforms, sites: landmarks.sites, towns: towns.towns, caves, lines: railway.lines, spaceport: spaceport.sites });
  const others = (...box) => reserved(...box) || videostore.stores(...box).length > 0 || abandoned.within(...box).length > 0;
  others.ready = reserved.ready;
  const keepOff = clearOf({ reserved: others, airfields: fields });

  // The first club. The flat dry spots it could be are looked for now. Which
  // of them it is waits for the airfields that might be in the way to be
  // found: the airports feature looks for those a little at a time once the
  // world is open, so as not to hold up the start, and this doesn't hurry
  // it. Until then it isn't anywhere, and fills in on the map when it is.
  // Asked for by its id (it's being tracked, say), it's found there and then.
  const inTheWay = regionsInTheWay(fields.regions, player.start);
  const spots = candidates(gen, player.start);
  let home = null;
  let decided = false;
  // whether the airfields in its way have all been found (asking for any that haven't)
  const fieldsKnown = () => inTheWay.every((g) => fields.site(g.id, false) !== undefined);
  function decide() {
    if (decided) return home;
    decided = true;
    home = pickSite(gen, spots, keepOff);
    if (home) {
      for (const ch of chunks.chunks.values()) clearChunk(ch, home);
      grass.invalidate(...home.box);
    }
    return home;
  }
  // The rest, out in the forest, looked for round about you as you go. They
  // keep clear of the race tracks too. (The tracks keep out of the ring round
  // the start that the first club may be anywhere in, so it needn't ask, and
  // asking would find the tracks of the towns round the start as the world
  // opens.)
  const farKeepOff = (...box) => keepOff(...box) || racetrack.tracks.within(...box).length > 0;
  farKeepOff.ready = keepOff.ready;
  const clubs = new HuntClubs(gen, { start: player.start, keepOff: farKeepOff, away: (...box) => !!landforms.reaches(...box) });
  // every club whose box overlaps a rectangle (wait = false: only those found already)
  const all = (x0, z0, x1, z1, wait = true) => {
    const out = home && overlaps(home.box, x0, z0, x1, z1) ? [home] : [];
    return out.concat(clubs.within(x0, z0, x1, z1, wait));
  };

  // The one you're at, or were last near: what's stood up and shot at.
  // Another takes its place when you come nearer that one.
  let site = null;
  let lay = null; // how high everything in it stands, on the land as it was grown
  let range = null;
  const ground = (x, z) => gen.height(x, z) + (chunks.heightOffset ? chunks.heightOffset(x, z) : 0);
  const local = (x, z, out = _l) => toLocal(site, x, z, out);

  // ── What's yours ──────────────────────────────────────────────────────────
  let owned = false; // you've been given a shotgun
  let best = null; // your best round
  let rounds = 0; // rounds shot to the end
  let visited = false; // the first club
  let been = []; // the rest you've been to, by id, latest first
  save.register({
    id: 'huntclub',
    scope: 'yours',
    local: 'marks',
    collect: () => ({ gun: owned, best, rounds, visited, been: [...been] }),
    validate: (raw) => validateRecord(raw, BEEN_KEPT),
    restore(r) {
      owned = r.gun;
      best = r.best;
      rounds = r.rounds;
      visited = r.visited;
      been = [...r.been];
      if (owned) arm();
    },
  });
  const beenTo = (s) => (s === home ? visited : been.includes(s.id));

  // ── The shotgun ───────────────────────────────────────────────────────────
  // On the tool bar once you've been given it, in the rifle's slot.
  let shown = false;
  const skeet = {
    status: () => (shown && range ? range.status(player.pos.x, player.pos.y, player.pos.z) : null),
    pull: () => !!(shown && range && range.pull()),
    fired: (o, d, from) => (shown && range ? range.fired(o, d, from) : null),
  };
  let shotgun = null;
  function arm() {
    if (shotgun) return shotgun;
    shotgun = builder.register(
      shotgunTool({
        wildlife,
        which: (a) => isGame(a.kind),
        carcasses: hunting.carcasses,
        targets: hunting.targets,
        skeet,
        owned: () => owned,
        notYours: 'not yours · the steward at any hunt club will give you one',
      }),
    );
    return shotgun;
  }
  // its key is wherever its slot is on the tool bar (0 for the tenth)
  const gunKey = () => {
    const n = builder.slotOf(shotgun ? shotgun.id : 'rifle');
    return n && n <= 10 ? String(n % 10) : 'tool bar';
  };
  commands.describe({ group: 'HUNT CLUB', help: gunKey, label: 'the shotgun, once the club gives you one: click to shoot, hold right-click to mount it' });
  commands.describe({ group: 'HUNT CLUB', help: 'click', label: 'on a skeet station: call pull for the targets, then shoot ahead of them' });

  // ── Materials ─────────────────────────────────────────────────────────────
  // The gun room is lit from within: its surfaces give off a share of their
  // own colour, whatever the sun is doing (as the video store's inside).
  const lit = { value: LIT };
  const inside = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0, side: THREE.DoubleSide });
  inside.onBeforeCompile = (shader) => {
    shader.uniforms.uLit = lit;
    shader.fragmentShader = `uniform float uLit;\n${shader.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance += vColor.rgb * uLit;')}`;
  };
  inside.customProgramCacheKey = () => 'huntclub-lit';
  const materials = {
    outside: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.02, side: THREE.DoubleSide }),
    inside,
    glow: new THREE.MeshBasicMaterial({ vertexColors: true }),
    marker: new THREE.MeshBasicMaterial({ color: 0xff7a2a }),
  };

  const card = new Scorecard(document.getElementById('hud') || document.body);

  // ── The forest round them ─────────────────────────────────────────────────
  // The trees, bushes and stones on a field hidden: as each chunk's plants
  // come, and those already there when the first club is found.
  function clearChunk(ch, s) {
    const S = chunks.size;
    const x0 = ch.cx * S;
    const z0 = ch.cz * S;
    const b = s.box;
    if (!ch.vegLists || b[0] > x0 + S + 3 || b[2] < x0 - 3 || b[1] > z0 + S + 3 || b[3] < z0 - 3) return;
    for (const kind in ch.vegLists) {
      const list = ch.vegLists[kind];
      for (let o = 0, k = 0; o < list.length; o += VEG_STRIDE, k++) {
        const scale = list[o + 4];
        if (scale <= 0) continue;
        const back = (KEEP_BACK[kind] ?? 0.6) * (SCALED[kind] ? scale : 1);
        if (onPlan(s, list[o], list[o + 2], back)) chunks.hideInstance(ch, kind, k);
      }
    }
  }
  chunks.on('vegetation', (ch) => {
    const S = chunks.size;
    const x0 = ch.cx * S;
    const z0 = ch.cz * S;
    for (const s of all(x0 - 3, z0 - 3, x0 + S + 3, z0 + S + 3)) clearChunk(ch, s);
  });
  // How high a club's things stand, worked out once each, on the land as it
  // was grown.
  const lays = new Map(); // club id -> layout
  const layOf = (s) => lays.get(s.id) || lays.set(s.id, layout(s, (x, z) => gen.height(x, z))).get(s.id);
  // no grass under a clubhouse, its houses, its pads or its walks
  const bares = new Map(); // club id -> (x, z) -> whether it's bare there
  function bareOf(s) {
    let bare = bares.get(s.id);
    if (bare) return bare;
    const foot = EDGE - layOf(s).steps.length * TREAD;
    const R = FIELD.radius;
    const arcZ = -Math.sqrt(R * R - (FIELD.chord / 2) ** 2);
    const _g = { x: 0, z: 0 };
    bare = (x, z) => {
      toLocal(s, x, z, _g);
      const u = _g.x;
      const v = _g.z;
      if (u > CLUB.x0 - 0.8 && u < CLUB.x1 + 0.8 && v > foot - 0.3 && v < CLUB.z1 + 0.4) return true;
      for (const h of Object.values(HOUSES)) if (u > h.box[0] - 0.3 && u < h.box[2] + 0.3 && v > h.box[1] - 0.3 && v < h.box[3] + 0.3) return true;
      for (const st of STATIONS) if (Math.abs(u - st.x) < FIELD.pad + 0.15 && Math.abs(v - st.z) < FIELD.pad + 0.15) return true;
      if (v > -0.5 && Math.abs(Math.hypot(u, v - arcZ) - R) < 0.6) return true;
      return Math.abs(u) < 0.65 && v > 0 && v < foot;
    };
    bares.set(s.id, bare);
    return bare;
  }
  grass.addClearing((x0, z0, x1, z1) => {
    const here = all(x0, z0, x1, z1);
    if (!here.length) return null;
    const bare = here.map(bareOf);
    return bare.length === 1 ? bare[0] : (x, z) => bare.some((b) => b(x, z));
  });
  // ── Building goes round them ──────────────────────────────────────────────
  const discs = new Map(); // club id -> discs over its plan
  builder.obstacles.addSource((x, z, R2, out) => {
    for (const s of all(x - R2 - 3, z - R2 - 3, x + R2 + 3, z + R2 + 3)) {
      if (!discs.has(s.id)) discs.set(s.id, planDiscs(s, 3));
      for (const d of discs.get(s.id)) {
        if (Math.hypot(d.x - x, d.z - z) > R2 + d.r + 1) continue;
        out.push({ x: d.x, z: d.z, what: 'the skeet field', dig: d.r + 0.3, wall: d.r + 0.2, footing: d.r + 0.5, roof: d.r, grown: true });
      }
    }
  });
  // ── On the map ────────────────────────────────────────────────────────────
  // where one is is the foot of its steps: that's where `go here` and
  // tracking it lead (made once each, and again when you've been there)
  const places = new Map();
  function asPlace(s) {
    let p = places.get(s.id);
    if (p && p.visited === beenTo(s)) return p;
    const corners = ([x0, z0, x1, z1]) =>
      [
        [x0, z0],
        [x1, z0],
        [x1, z1],
        [x0, z1],
      ].map(([u, v]) => {
        const w = toWorld(s, u, v);
        return [w.x, w.z];
      });
    p = {
      id: s.id,
      x: s.door.x,
      z: s.door.z,
      yaw: s.door.yaw,
      name: s.name,
      kind: 'hunt club',
      note: 'get a shotgun from the steward and shoot a round of skeet',
      glyph: GLYPH,
      visited: beenTo(s),
      shape: [corners([CLUB.x0, EDGE, CLUB.x1, CLUB.z1]), ...Object.values(HOUSES).map((h) => corners(h.box))],
      ground: [corners(PLAN)],
    };
    places.set(s.id, p);
    return p;
  }
  const doorIn = (s, x0, z0, x1, z1) => s.door.x >= x0 && s.door.x <= x1 && s.door.z >= z0 && s.door.z <= z1;
  // how far from the start the first club's door (or any of it) can be, at the most
  const HOME_REACH = RING[1] + Math.hypot(PLAN[2] - PLAN[0], PLAN[3] - PLAN[1]);
  map.places.addSource({
    within: (x0, z0, x1, z1) => all(x0, z0, x1, z1, false).filter((s) => doorIn(s, x0, z0, x1, z1)).map(asPlace),
    get(id) {
      if (!String(id).startsWith('huntclub:')) return null;
      const s = clubs.byId(id) || (decide() && id === home.id ? home : null);
      return s ? asPlace(s) : null;
    },
    // the first club (once it's found), then a square at a time outward (a
    // club keeps inside its own)
    list: 'hunt clubs',
    nearest: (x, z) =>
      new MergeNearest([
        new PendingNearest(x, z, () => (decided ? home && asPlace(home) : undefined), Math.max(0, Math.hypot(x - player.start.x, z - player.start.z) - HOME_REACH)),
        new GridNearest(x, z, {
          size: FAR.cell,
          // (where a square's can be is known from the seed alone, cheaply)
          box(i, j) {
            const s = clubs.spot(i, j);
            return s ? [s.x - FAR_REACH, s.z - FAR_REACH, s.x + FAR_REACH, s.z + FAR_REACH] : null;
          },
          at(i, j) {
            const s = clubs.peek(i, j);
            return s === undefined ? undefined : s ? [asPlace(s)] : [];
          },
        }),
      ]),
  });

  // ── Standing it up ────────────────────────────────────────────────────────
  let built = null;
  function show(on) {
    if (on === shown) return;
    shown = on;
    if (on) {
      if (!built) {
        built = buildClub(site, lay, ground, materials);
        built.steward = makeSteward(built.steward);
        built.object.add(built.steward.body.mesh);
      }
      scene.add(built.object);
      solids.set(built, built.solids);
    } else {
      scene.remove(built.object);
      solids.clear(built);
      range.clear();
    }
  }
  // Another club takes this one's place: this one is taken down (and built
  // again if you come back), and its field is this one's.
  function moveTo(s) {
    if (built) {
      show(false);
      built.object.traverse((o) => o.isMesh && o.geometry.dispose());
      built.steward.body.dispose();
      built = null;
    }
    if (range) range.clear();
    site = s;
    lay = layOf(s);
    range = new Range({ scene, site, lay, ground, chips: builder.chips, sound });
    listen(range);
    arrived = false;
    greeted = false;
  }

  // The camera doesn't look through a wall or a roof.
  player.cameraBlockers.push((origin, dir, max) => {
    if (!shown) return Infinity;
    if (Math.hypot(origin.x - site.x, origin.z - site.z) > max + 70) return Infinity;
    let near = Infinity;
    for (const b of built.blockers) {
      const t = rayBox(origin, dir, b);
      if (t < near) near = t;
    }
    return near;
  });

  // ── The steward ───────────────────────────────────────────────────────────
  // Behind the hatch in a blaze-orange vest and cap, looking up when you come
  // near, waving when you come up to the porch. Each club has its own, from
  // its seed.
  const stewardOf = (s) => STEWARDS[hash2i(5, 9, s.seed) % STEWARDS.length];
  function makeSteward(at) {
    const who = stewardOf(site);
    const rnd = mulberry32(site.seed + 4421);
    const c = (hex) => new THREE.Color(hex);
    const look = {
      her: who.her,
      child: false,
      dark: false,
      height: 0.97 + rnd() * 0.06,
      build: 1.0 + rnd() * 0.12,
      skin: c([0xe8c4a8, 0xc68c6c, 0x8a5a3c, 0xdcae90, 0x6a4430][Math.floor(rnd() * 5)]),
      hair: c([0x6a6a66, 0x8a8a84, 0x4a3a2a, 0xb8b0a4][Math.floor(rnd() * 4)]),
      shirt: c(0x4a5a3a),
      vest: c(0xf26a1a),
      legs: c(0x5a4a3a),
      dress: null,
      apron: false,
      coat: false,
      hat: 'cap',
      hatColor: c(0xf26a1a),
      beard: !who.her && rnd() < 0.6,
    };
    const body = new Body(look, site.seed);
    body.mesh.position.set(at.x, at.y, at.z);
    body.mesh.rotation.y = at.yaw;
    return { body, at, who };
  }
  let lastHello = -Infinity;
  function say(line, wave = false) {
    const s = built && built.steward;
    if (!s) return;
    hud.flash(`${s.who.name}: “${line}”`, 4200);
    const p = toWorld(site, s.at.x, s.at.z);
    sound.call('hello', p.x, lay.deck + 1.6, p.z, { pitch: s.who.her ? 1.25 : 0.85 });
    if (wave) s.body.waving = 1.8;
  }

  function give() {
    const first = !owned;
    owned = true;
    const tool = arm();
    builder.select(tool.id);
    if (first) save.touch();
    sound.sfx('gun-open');
    return tool;
  }

  // At the hatch, the act key (F) asks for a shotgun: what's at hand, as everywhere.
  function ask() {
    give();
    say(SAYS.give);
  }
  act.offer({ id: 'huntclub', at: () => (!owned && atCounter() ? { d: 0.5, word: 'ask', run: ask } : null) });

  // ── What the field says ───────────────────────────────────────────────────
  let cardUntil = 0;
  let clock = 0;
  function listen(range) {
    range.on('call', ({ x, y, z }) => {
      sound.call('pull', x, y, z, { pitch: 0.95 + Math.random() * 0.1 });
      hud.flash('“pull!”', 900);
    });
    range.on('scored', ({ dead, station, option, next, score, shot, said }) => {
      const words = Object.values(dead).map((d) => (d ? 'dead' : 'lost'));
      const miss = said && Object.values(dead).some((d) => !d) ? ` · ${said}` : '';
      const pair = words.length === 2 && dead.H && dead.L ? 'a pair! ' : '';
      const onTo = next && next.station !== station ? ` · on to station ${next.station}` : '';
      hud.flash(`${option ? 'option: ' : ''}${pair}${words.join(', ')}${miss} · ${score} of ${shot}${onTo}`, 2800);
    });
    range.on('round', ({ score, of }) => {
      rounds++;
      const record = best === null || score > best;
      if (record) best = score;
      save.touch();
      cardUntil = clock + CARD_KEEP;
      setTimeout(() => {
        hud.flash(`round over · ${score} of ${of}${record && rounds > 1 ? ' · your best yet' : ''}`, 4200);
        const s = built && built.steward;
        if (s && shown && Math.hypot(player.pos.x - site.door.x, player.pos.z - site.door.z) < 70) setTimeout(() => say(CHEER(score)), 3000);
      }, 1500);
    });
    range.on('abandon', () => hud.flash('you left the field: the round is given up', 3000));
  }

  // ── Where you are ─────────────────────────────────────────────────────────
  const atCounter = () => {
    if (!shown) return false;
    const l = local(player.pos.x, player.pos.z);
    return Math.hypot(l.x - COUNTER.x, l.z - COUNTER.z) < AT_COUNTER && Math.abs(player.pos.y - lay.deck) < 0.6;
  };
  builder.idleWhile(() => !owned && atCounter());

  // ── Each frame ────────────────────────────────────────────────────────────
  let arrived = false;
  let cued = false;
  let greeted = false;
  let lookIn = 0;
  // The nearest club found so far, and how far: the first, or one of the
  // rest looked for round about.
  function nearest(p) {
    let best = home;
    let bd = home ? Math.hypot(home.x - p.x, home.z - p.z) : Infinity;
    for (const s of clubs.cells.values()) {
      const d = s ? Math.hypot(s.x - p.x, s.z - p.z) : Infinity;
      if (d < bd) [best, bd] = [s, d];
    }
    return best && { site: best, d: bd };
  }
  game.addSystem({
    name: 'huntclub',
    phase: 'world',
    update({ dt }) {
      if (!decided && fieldsKnown()) decide();
      const f = game.focus;
      // the clubs round about looked for ahead of time, and the nearest
      // stood up in place of the last (not while a round's under way there)
      if (clubs.queue.size) clubs.pump(map.isOpen ? PUMP_MS[1] : PUMP_MS[0]);
      lookIn -= dt;
      if (lookIn <= 0) {
        lookIn = NEAREST_AFTER;
        clubs.prefetch(f.x, f.z, PREFETCH);
        const n = !(shown && range.round) && nearest(f);
        const at = site ? Math.hypot(site.x - f.x, site.z - f.z) : Infinity;
        if (n && n.site !== site && (shown ? n.d < at - SWAP_NEARER : n.d < at)) moveTo(n.site);
      }
      if (!site) return;
      clock += dt;
      const d = Math.hypot(site.x - f.x, site.z - f.z);
      if (d < SHOW) show(true);
      else if (d > HIDE) show(false);
      const P = player.pos;
      range.update(dt, P.x, P.z);
      if (!shown) {
        if (cued) {
          hud.cue(null);
          cued = false;
        }
        if (built) built.marker.visible = false;
        card.hide();
        return;
      }

      // there
      const toDoor = Math.hypot(P.x - site.door.x, P.z - site.door.z);
      if (!arrived && toDoor < ARRIVE) {
        arrived = true;
        hud.flash(owned ? `${site.name} · out to station 1 for a round of skeet` : `${site.name} · up on the porch, the steward has a shotgun for you`, 4200);
        if (!beenTo(site)) {
          if (site === home) visited = true;
          else been = [site.id, ...been].slice(0, BEEN_KEPT);
          save.touch();
        }
      }
      if (toDoor > ARRIVE * 3) arrived = false;

      // the steward looks up at you, and says hello as you come up
      const s = built.steward;
      const l = local(P.x, P.z);
      const near = Math.hypot(l.x - s.at.x, l.z - s.at.z);
      const lookAt = near < 12 ? wrapAngle(Math.atan2(l.x - s.at.x, l.z - s.at.z) - s.at.yaw) : null;
      s.body.pose(dt, 0, lookAt);
      if (near < GREET && Math.abs(P.y - lay.deck) < 1) {
        if (!greeted && clock - lastHello > GREET_AGAIN) {
          greeted = true;
          lastHello = clock;
          say(owned ? pick(SAYS.back) : `${pick(SAYS.hello)} ${SAYS.ask}`, true);
        }
      } else if (near > GREET * 2) greeted = false;

      // at the hatch, without a gun: ask for one (the act key: see ask)
      let cue = null;
      if (!owned && atCounter()) cue = `<b>${act.key('ask')}</b> ask the steward for a shotgun`;
      if (cue) {
        hud.cue({ html: cue });
        cued = true;
      } else if (cued) {
        hud.cue(null);
        cued = false;
      }

      // the arrow over the station the next targets are shot from, while
      // you've a shotgun in hand and are out on the field
      const next = range.nextPad;
      const st = range.stationAt(P.x, P.y, P.z);
      const inHand = shotgun && builder.current === shotgun && !builder.idle;
      const m = built.marker;
      m.visible = !!(inHand && range.onField(P.x, P.z) && st !== next.n && !range.throwing);
      if (m.visible) {
        const sx = STATIONS[next.n - 1];
        m.position.set(sx.x, next.top - site.base + MARK.up + Math.sin(clock * MARK.rate) * MARK.bob, sx.z);
        m.rotation.y += dt * 1.5;
      }

      // the card, while a round is under way and for a while after
      const shooting = !!range.round || clock < cardUntil;
      if (shooting && range.onField(P.x, P.z)) card.show(range.card(), site.name, best);
      else card.hide();
    },
  });

  // where the next targets are shot from, for the HUD to lead you there
  hud.guide(() => {
    if (!shown || !range.round || range.throwing) return null;
    const P = player.pos;
    const pad = range.nextPad;
    if (!range.onField(P.x, P.z) || range.stationAt(P.x, P.y, P.z) === pad.n) return null;
    return { id: `${site.id}:station`, label: `station ${pad.n}`, color: '#ff7a2a', x: pad.x, z: pad.z };
  });

  // ── From the console ──────────────────────────────────────────────────────
  game.provide('huntclub', {
    // the club you're at, or were last near: null until one's been found (a
    // moment after the world opens)
    get site() {
      return site;
    },
    // the first club (null until it's been found), and the rest
    get home() {
      return home;
    },
    clubs,
    // every club whose box overlaps a rectangle of the world, for what's
    // grown after them to keep clear of: the first is found there and then
    // if it might be there and hasn't been yet
    within(x0, z0, x1, z1) {
      const { x, z } = player.start;
      if (!decided && x0 <= x + HOME_REACH && x1 >= x - HOME_REACH && z0 <= z + HOME_REACH && z1 >= z - HOME_REACH) decide();
      return all(x0, z0, x1, z1);
    },
    // whether every club that could overlap a rectangle has been found,
    // asking for those there that haven't been: what's grown after them in
    // the background waits for them rather than find them there and then
    known(x0, z0, x1, z1) {
      const { x, z } = player.start;
      const first = decided || x0 > x + HOME_REACH || x1 < x - HOME_REACH || z0 > z + HOME_REACH || z1 < z - HOME_REACH;
      return clubs.known(x0, z0, x1, z1) && first;
    },
    get lay() {
      return lay;
    },
    get range() {
      return range;
    },
    get shotgun() {
      return shotgun;
    },
    get owned() {
      return owned;
    },
    get best() {
      return best;
    },
    get rounds() {
      return rounds;
    },
    get been() {
      return [...been];
    },
    get ready() {
      return shown;
    },
    get steward() {
      return built ? built.steward.who.name : site ? stewardOf(site).name : null;
    },
    // stand at the foot of the porch steps, facing the clubhouse: of the
    // club you're at, or of the one with this id
    async go(id) {
      const to = id ? (id === (home && home.id) ? home : clubs.byId(id)) : site;
      if (!to) return null;
      if (to !== site) moveTo(to);
      await game.api.teleport(to.door.x, to.door.z, to.door.yaw);
      return { x: to.door.x, z: to.door.z };
    },
    // stand at the hatch, facing the steward
    toCounter() {
      if (!site || !shown) return null;
      const p = toWorld(site, COUNTER.x, COUNTER.z);
      player.spawn(p.x, p.z, site.yaw, site.yaw + Math.PI, lay.deck);
      return { x: p.x, z: p.z };
    },
    // stand on station n, facing the crossing point
    toStation(n) {
      if (!site || !shown) return null;
      const s = STATIONS[n - 1];
      const pad = lay.pads[n - 1];
      if (!s) return null;
      const yaw = site.yaw + s.face;
      player.spawn(pad.x, pad.z, yaw, yaw + Math.PI, pad.top);
      return { x: pad.x, z: pad.z, yaw };
    },
    give,
    // where a shot from your eye, now, would meet target c (one of range.air):
    // aim there, and it breaks
    lead(c) {
      const P = player.pos;
      const m = meeting(c, { x: P.x, y: P.y + player.eye, z: P.z });
      return { x: m.p.x, y: m.p.y, z: m.p.z };
    },
  });
}
