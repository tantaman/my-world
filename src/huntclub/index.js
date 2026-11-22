// The hunt club: a timber clubhouse with a skeet field in front of it, a
// longer walk out from where you first arrive than the video store. It's on
// the map, so `go here` sets you down at the foot of its porch steps.
//
// Up on the porch, the steward serves from a hatch in the wall. Ask, and
// you're given a shotgun, yours from then on: it goes in the rifle's slot on
// the tool bar. Then walk out to station 1, by the high house, and call
// "pull!": a round of skeet, 25 targets thrown from the two houses, singles
// and doubles from eight stations round the field, scored on a card at the
// top of the screen. Your best round is kept.
//
//   site.js       where the club is, grown from the seed and the land, and
//                 how high everything in it stands
//   skeet.js      the field, a target's flight, the shot's pattern, the rules of a round
//   range.js      the field at work: the throws, the targets flying and breaking, the score
//   club.js       what it looks like: the clubhouse, the houses, the pads, the walks
//   shotgun.js    the shotgun on the tool bar
//   models.js     the shotgun, a clay target
//   scorecard.js  the card at the top of the screen while you shoot a round
//   sound.js      the shot, loading, "pull!", the trap, a target breaking
//
// Nothing about the forest changes for the club: see site.js. Whether you
// have a shotgun, and your best round, are yours, saved.
//
// From the console:
//   world.huntclub.site               where it is
//   await world.huntclub.go()         stand at the foot of the porch steps
//   world.huntclub.toCounter()        stand at the hatch
//   world.huntclub.toStation(n)       stand on station n, facing the crossing point
//   world.huntclub.range              the round, the throw, the targets in the air
//   world.huntclub.give()             be given the shotgun, wherever you are
//   world.huntclub.lead(target)       where to aim to break a target in the air

import * as THREE from 'three';
import { candidates, pickSite, clearOf, regionsInTheWay, clubName, layout, PLAN, CLUB, EDGE, TREAD } from './site.js';
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

// The features this uses, so it is installed after them (game/features.js):
// the video store, the abandoned buildings and the airfields for what the
// club keeps clear of, along with everything they keep clear of; towns for
// the steward's body and voice; hunting for game and kills, and to put the
// shotgun in the rifle's slot.
export const after = ['render', 'ui', 'world', 'player', 'audio', 'build', 'map', 'save', 'towns', 'wildlife', 'hunting', 'videostore', 'abandoned', 'airports'];
export function installHuntclub(game) {
  const { scene, gen, chunks, grass, solids, landforms, player, input, builder, map, hud, commands, save, sound, landmarks, towns, caves, railway, spaceport, videostore, abandoned, airports, wildlife, hunting } = game;

  // ── Where it is ───────────────────────────────────────────────────────────
  // The flat dry spots it could be are looked for now. Which of them it is
  // waits for the airfields that might be in the way to be found: the
  // airports feature looks for those a little at a time once the world is
  // open, so as not to hold up the start, and this doesn't hurry it. Until
  // then the club isn't anywhere, and fills in on the map when it is. Asked
  // for by its id (it's being tracked, say), it's found there and then.
  const fields = airports.airports;
  const inTheWay = regionsInTheWay(fields.regions, player.start);
  const keepOff = clearOf({
    reserved: storeClearOf({ landforms, sites: landmarks.sites, towns: towns.towns, caves, lines: railway.lines, spaceport: spaceport.site }),
    boxes: () => [videostore.site && videostore.site.box, ...abandoned.sites.map((s) => s.box)].filter(Boolean),
    airfields: fields,
  });
  const spots = candidates(gen, player.start);
  const ground = (x, z) => gen.height(x, z) + (chunks.heightOffset ? chunks.heightOffset(x, z) : 0);
  const name = clubName(gen.seed);
  let site = null;
  let lay = null; // how high everything stands, on the land as it was grown
  let range = null;
  let decided = false;
  // whether the airfields in its way have all been found (asking for any that haven't)
  const fieldsKnown = () => inTheWay.every((g) => fields.site(g.id, false) !== undefined);
  function decide() {
    if (decided) return site;
    decided = true;
    site = pickSite(gen, spots, keepOff);
    if (site) settle();
    return site;
  }
  const local = (x, z, out = _l) => toLocal(site, x, z, out);

  // ── What's yours ──────────────────────────────────────────────────────────
  let owned = false; // you've been given a shotgun
  let best = null; // your best round
  let rounds = 0; // rounds shot to the end
  let visited = false;
  save.register({
    id: 'huntclub',
    scope: 'yours',
    local: 'marks',
    collect: () => ({ gun: owned, best, rounds, visited }),
    validate: validateRecord,
    restore(r) {
      owned = r.gun;
      best = r.best;
      rounds = r.rounds;
      visited = r.visited;
      if (owned) arm();
    },
  });

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
        notYours: `not yours · the steward at ${name} will give you one`,
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

  // ── The forest round it ───────────────────────────────────────────────────
  // The trees, bushes and stones on the field hidden: as each chunk's plants
  // come, and those already there when the club is found.
  function clearChunk(ch) {
    const S = chunks.size;
    const x0 = ch.cx * S;
    const z0 = ch.cz * S;
    const b = site.box;
    if (!ch.vegLists || b[0] > x0 + S + 3 || b[2] < x0 - 3 || b[1] > z0 + S + 3 || b[3] < z0 - 3) return;
    for (const kind in ch.vegLists) {
      const list = ch.vegLists[kind];
      for (let o = 0, k = 0; o < list.length; o += VEG_STRIDE, k++) {
        const scale = list[o + 4];
        if (scale <= 0) continue;
        const back = (KEEP_BACK[kind] ?? 0.6) * (SCALED[kind] ? scale : 1);
        if (onPlan(site, list[o], list[o + 2], back)) chunks.hideInstance(ch, kind, k);
      }
    }
  }
  chunks.on('vegetation', (ch) => site && clearChunk(ch));
  // no grass under the clubhouse, the houses, the pads or the walks
  let bare = null;
  grass.addClearing((x0, z0, x1, z1) => {
    const b = site && site.box;
    if (!b || b[0] > x1 || b[2] < x0 || b[1] > z1 || b[3] < z0) return null;
    return bare;
  });
  // ── Building goes round it ────────────────────────────────────────────────
  let discs = [];
  builder.obstacles.addSource((x, z, R2, out) => {
    const b = site && site.box;
    if (!b || x + R2 + 3 < b[0] || x - R2 - 3 > b[2] || z + R2 + 3 < b[1] || z - R2 - 3 > b[3]) return;
    for (const d of discs) {
      if (Math.hypot(d.x - x, d.z - z) > R2 + d.r + 1) continue;
      out.push({ x: d.x, z: d.z, what: 'the skeet field', dig: d.r + 0.3, wall: d.r + 0.2, footing: d.r + 0.5, roof: d.r, grown: true });
    }
  });
  // ── On the map ────────────────────────────────────────────────────────────
  // where it is is the foot of its steps: that's where `go here` and tracking
  // it lead
  let place = null;
  map.places.addSource({
    destinations: () => (site ? [asPlace()] : []),
    within: (x0, z0, x1, z1) => (site && site.door.x >= x0 && site.door.x <= x1 && site.door.z >= z0 && site.door.z <= z1 ? [asPlace()] : []),
    get: (id) => (typeof id === 'string' && id.startsWith('huntclub:') && decide() && id === site.id ? asPlace() : null),
  });
  function asPlace() {
    if (place && place.visited === visited) return place;
    const corners = ([x0, z0, x1, z1]) =>
      [
        [x0, z0],
        [x1, z0],
        [x1, z1],
        [x0, z1],
      ].map(([u, v]) => {
        const p = toWorld(site, u, v);
        return [p.x, p.z];
      });
    place = {
      id: site.id,
      x: site.door.x,
      z: site.door.z,
      yaw: site.door.yaw,
      name: site.name,
      kind: 'hunt club',
      note: 'get a shotgun from the steward and shoot a round of skeet',
      glyph: GLYPH,
      visited,
      shape: [corners([CLUB.x0, EDGE, CLUB.x1, CLUB.z1]), ...Object.values(HOUSES).map((h) => corners(h.box))],
      ground: [corners(PLAN)],
    };
    return place;
  }

  // Found: how high everything stands, the field at work, and the forest,
  // the grass and building told.
  function settle() {
    lay = layout(site, (x, z) => gen.height(x, z));
    range = new Range({ scene, site, lay, ground, chips: builder.chips, sound });
    listen(range);
    for (const ch of chunks.chunks.values()) clearChunk(ch);
    const foot = EDGE - lay.steps.length * TREAD;
    const R = FIELD.radius;
    const arcZ = -Math.sqrt(R * R - (FIELD.chord / 2) ** 2);
    const _g = { x: 0, z: 0 };
    bare = (x, z) => {
      toLocal(site, x, z, _g);
      const u = _g.x;
      const v = _g.z;
      if (u > CLUB.x0 - 0.8 && u < CLUB.x1 + 0.8 && v > foot - 0.3 && v < CLUB.z1 + 0.4) return true;
      for (const h of Object.values(HOUSES)) if (u > h.box[0] - 0.3 && u < h.box[2] + 0.3 && v > h.box[1] - 0.3 && v < h.box[3] + 0.3) return true;
      for (const s of STATIONS) if (Math.abs(u - s.x) < FIELD.pad + 0.15 && Math.abs(v - s.z) < FIELD.pad + 0.15) return true;
      if (v > -0.5 && Math.abs(Math.hypot(u, v - arcZ) - R) < 0.6) return true;
      return Math.abs(u) < 0.65 && v > 0 && v < foot;
    };
    grass.invalidate(...site.box);
    discs = planDiscs(site, 3);
  }

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
  // near, waving when you come up to the porch.
  const who = STEWARDS[hash2i(5, 9, gen.seed) % STEWARDS.length];
  function makeSteward(at) {
    const rnd = mulberry32(gen.seed + 4421);
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
    const body = new Body(look, gen.seed);
    body.mesh.position.set(at.x, at.y, at.z);
    body.mesh.rotation.y = at.yaw;
    return { body, at };
  }
  let lastHello = -Infinity;
  function say(line, wave = false) {
    const s = built && built.steward;
    if (!s) return;
    hud.flash(`${who.name}: “${line}”`, 4200);
    const p = toWorld(site, s.at.x, s.at.z);
    sound.call('hello', p.x, lay.deck + 1.6, p.z, { pitch: who.her ? 1.25 : 0.85 });
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
  game.addSystem({
    name: 'huntclub',
    phase: 'world',
    update({ dt }) {
      if (!decided && fieldsKnown()) decide();
      if (!site) return;
      clock += dt;
      const f = game.focus;
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
        if (!visited) {
          visited = true;
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

      // at the hatch, without a gun: ask for one
      let cue = null;
      if (!owned && atCounter()) {
        cue = '<b>click</b> ask the steward for a shotgun';
        if (input.tapped('use')) {
          give();
          say(SAYS.give);
        }
      }
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
    // null until it's been found (a moment after the world opens)
    get site() {
      return site;
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
    get ready() {
      return shown;
    },
    get steward() {
      return who.name;
    },
    // stand at the foot of the porch steps, facing the clubhouse
    async go() {
      if (!site) return null;
      await game.api.teleport(site.door.x, site.door.z, site.door.yaw);
      return { x: site.door.x, z: site.door.z };
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
