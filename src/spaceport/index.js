// The launch site and its two flights. The Orrery hosts a railgun match,
// and Deep Space 9 has an exterior flyby and a walkable Promenade.
// Both flights share the launch and the capsule ride home.
//
//   flightPanel.js  the launch manifest
//   station.js      the approach, docking and walking on the station
//   stationHull.js  the rings, core and pylons
//   promenade.js    the shops, balcony and observation windows
//   site.js        where the launch site is, grown from the seed and the land
//   launchSite.js  the pad, the tower, the rocket, the capsule, the exhaust
//   flight.js      the trip: boarding, countdown, the climb, the way home
//   orrery.js      the arena's layout: platforms, jump pads, ways in, the bots' paths
//   mover.js       moving in the arena: running, strafe-jumping, jump pads
//   arena.js       a match: fighters, railguns, frags, coming back in
//   match.js       the score, the frag limit and the clock
//   bots.js        the bots: finding their way, seeing, aiming, dodging
//   arenaLook.js   what the arena looks like
//   arenaHud.js    the arena's HUD, and the big words of the trip
//   sound.js       the rocket, the railgun, the pads
//
// Up there the forest isn't drawn (game.coverWhen) and the arena is drawn
// through the same pixel pipeline in its place. The hiker waits in the
// rocket's place on the pad (player.aboard), out of sight; the tools are put
// away (builder.idleWhile); and the arena reads the controls itself, first
// thing each frame, so the forest never sees the mouse move.
//
// Nothing about the forest changes for the launch site: see site.js. Your
// record there (matches, wins, your best) is yours, saved.
//
// From the console:
//   world.spaceport.site          where it is
//   await world.spaceport.go()    stand beside the rocket
//   world.spaceport.board('ds9')  board a flight (default: The Orrery)
//   world.spaceport.hurry()       skip on to the end of this part of the trip
//   world.spaceport.arena         the match, while you're up there

import * as THREE from 'three';
import { findSite, clearOf, PAD, ROCKET_AT, LANDING_AT } from './site.js';
import { buildLaunchSite, makeCapsule, makeExhaust, ROCKET, SMOKE } from './launchSite.js';
import { Flight, DESTINATIONS } from './flight.js';
import { FlightPanel } from './flightPanel.js';
import { StationVisit } from './station.js';
import { Arena } from './arena.js';
import { ArenaLook } from './arenaLook.js';
import { ArenaHud, named } from './arenaHud.js';
import { tripSounds } from './sound.js';
import { NAME } from './orrery.js';
import { RULES } from './match.js';
import { onPlan, planDiscs, toWorld } from '../landmarks/sites.js';
import { VEG_STRIDE } from '../world/flora.js';
import { DECK, UNDER, SKY } from '../render/uniforms.js';

const SITE_NAME = 'Skyhook launch site';
const SHOW = 520; // m: the site is stood up this close...
const HIDE = 680; // ...and taken down past this
const ARRIVE = 16; // m from the middle of the pad that counts as there
const BOARD = 6.5; // m from the rocket, on the pad, that T climbs you aboard
const CAPSULE_KEPT = 160; // m you go from a landed capsule before it's taken away
const BOTS = 4;
const SENS = 0.0022; // rad of turn per pixel the mouse moves, in the arena
const STICK_TURN = { yaw: 3.2, pitch: 2 }; // rad/s with a pad's right stick pushed all the way
const AGAIN = 2.5; // s to press T a second time to leave a match before it's over
const EXPOSURE = 1.05;
// How far (m) plants of each kind are kept back from the pad.
const KEEP_BACK = { pine: 1.8, broad: 2, birch: 1.4, bush: 0.7, fern: 0.25, rock: 1.1, log: 2.4 };
const SCALED = { rock: true, log: true };
const GLYPH = ['...#...', '..###..', '..#.#..', '..###..', '..###..', '.#####.', '.#.#.#.'];
const WAYS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

const ARENA_TITLE = 2; // s the arena's name is up before its countdown
const _v = new THREE.Vector3();
const _w = { x: 0, z: 0 };
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();

// The features this uses, so it is installed after them (game/features.js);
// landmarks, towns, caves and railway for what the site keeps clear of.
export const after = ['render', 'ui', 'world', 'player', 'audio', 'build', 'map', 'landmarks', 'towns', 'caves', 'railway'];
export function installSpaceport(game) {
  const { scene, camera, pipeline, gen, chunks, grass, solids, landforms, player, input, builder, map, hud, commands, save, sound, landmarks, towns, caves, railway } = game;

  // ── Where it is ───────────────────────────────────────────────────────────
  // Clear of real places, the old places, towns, the mouths of caves and the
  // railway, all of which were there first.
  const keepOff = clearOf({ landforms, sites: landmarks.sites, towns: towns.towns, caves, lines: railway.lines });
  const site = findSite(gen, player.start, keepOff);
  const ground = (x, z) => gen.height(x, z) + (chunks.heightOffset ? chunks.heightOffset(x, z) : 0);
  const atSite = (lx, lz, out = {}) => toWorld(site, lx, lz, out);
  const materials = { body: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.05, side: THREE.DoubleSide }) };

  // ── Your record ───────────────────────────────────────────────────────────
  const record = { visited: false, matches: 0, wins: 0, best: 0 };
  const count = (v) => (Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
  save.register({
    id: 'spaceport',
    scope: 'yours',
    local: 'marks',
    collect: () => ({ ...record }),
    validate: (raw) => {
      const r = raw && typeof raw === 'object' ? raw : {};
      return { visited: r.visited === true, matches: count(r.matches), wins: count(r.wins), best: count(r.best) };
    },
    restore: (r) => Object.assign(record, r),
  });

  const flight = new Flight();
  const ui = new ArenaHud();
  const heard = { thrust: 0, near: 0, orbit: false };
  sound.addLayer(tripSounds(heard));

  if (site) {
    // ── The forest round it ─────────────────────────────────────────────────
    chunks.on('vegetation', (ch) => {
      const S = chunks.size;
      const x0 = ch.cx * S;
      const z0 = ch.cz * S;
      const b = site.box;
      if (b[0] > x0 + S + 3 || b[2] < x0 - 3 || b[1] > z0 + S + 3 || b[3] < z0 - 3) return;
      for (const kind in ch.vegLists) {
        const list = ch.vegLists[kind];
        for (let o = 0, k = 0; o < list.length; o += VEG_STRIDE, k++) {
          const scale = list[o + 4];
          if (scale <= 0) continue;
          const back = (KEEP_BACK[kind] ?? 0.6) * (SCALED[kind] ? scale : 1);
          if (onPlan(site, list[o], list[o + 2], back, site.cleared)) chunks.hideInstance(ch, kind, k);
        }
      }
    });
    grass.addClearing((x0, z0, x1, z1) => {
      const b = site.box;
      if (b[0] > x1 || b[2] < x0 || b[1] > z1 || b[3] < z0) return null;
      return (x, z) => onPlan(site, x, z, 0.1, site.cleared);
    });
    // ── Building goes round it ──────────────────────────────────────────────
    const discs = planDiscs({ ...site, plan: site.cleared }, 2);
    builder.obstacles.addSource((x, z, R, out) => {
      for (const d of discs) {
        if (Math.hypot(d.x - x, d.z - z) > R + d.r + 1) continue;
        out.push({ x: d.x, z: d.z, what: 'the launch pad', dig: d.r + 0.3, wall: d.r + 0.2, footing: d.r + 0.5, roof: d.r, grown: true });
      }
    });
    // ── On the map ──────────────────────────────────────────────────────────
    const corners = (rect) =>
      [
        [rect[0], rect[1]],
        [rect[2], rect[1]],
        [rect[2], rect[3]],
        [rect[0], rect[3]],
      ].map(([u, v]) => {
        const p = atSite(u, v);
        return [p.x, p.z];
      });
    let place = null;
    const asPlace = () => {
      if (place && place.visited === record.visited) return place;
      place = { id: site.id, x: site.x, z: site.z, name: SITE_NAME, kind: 'launch site', note: 'rocket flights to Deep Space 9 and The Orrery', glyph: GLYPH, visited: record.visited, shape: [corners(site.plan[0])], ground: [corners(site.cleared[0])] };
      return place;
    };
    map.places.addSource({
      destinations: () => [asPlace()],
      within: (x0, z0, x1, z1) => (site.x >= x0 && site.x <= x1 && site.z >= z0 && site.z <= z1 ? [asPlace()] : []),
      get: (id) => (id === site.id ? asPlace() : null),
    });
  }

  // ── Standing it up ────────────────────────────────────────────────────────
  let built = null; // { object, rocket, beacons, lampMat, solids, exhaust, puffs }
  let shown = false;
  function build() {
    built = buildLaunchSite(site, ground, materials);
    const exhaust = makeExhaust();
    built.rocket.add(exhaust.flame);
    built.object.add(exhaust.smoke);
    built.exhaust = exhaust;
    built.puffs = [];
    built.owed = 0;
  }
  function show(on) {
    if (on === shown) return;
    shown = on;
    if (on) {
      if (!built) build();
      scene.add(built.object);
      solids.set(built, built.solids);
    } else {
      scene.remove(built.object);
      solids.clear(built);
    }
  }
  // the capsule that came home, left on the pad until you're well away
  let capsule = null; // { object, chute, solid }
  function dropCapsule() {
    if (!capsule) return;
    scene.remove(capsule.object);
    solids.clear(capsule);
    capsule = null;
  }

  // ── The trip ──────────────────────────────────────────────────────────────
  let station = null; // built on the first visit, reused on later flights
  let arena = null;
  let look = null;
  const arenaCam = new THREE.PerspectiveCamera(74, camera.aspect, 0.05, 12000);
  const ambience = { ambience: 1, wildlife: 1 }; // the levels to put back
  const seat = { x: 0, y: 0, z: 0 };
  let wasVisible = true;
  // Where the hiker is while the trip carries them: in the capsule.
  const aboard = {
    place(out) {
      out.x = seat.x;
      out.y = seat.y;
      out.z = seat.z;
      out.yaw = site.yaw;
      out.back = 8;
    },
  };
  function seatIn(lx, lz, up) {
    atSite(lx, lz, _w);
    seat.x = _w.x;
    seat.z = _w.z;
    seat.y = site.top + up;
  }

  const manifest = new FlightPanel(input, (id) => {
    if (nearRocket()) board(id);
  });
  game.on('panel', (which) => { if (which !== 'rocket') manifest.close(); });
  function chooseFlight() {
    if (flight.phase !== 'ground' || !nearRocket()) return;
    if (player.aboard || player.carrier) return hud.flash('get off first');
    game.emit('panel', 'rocket');
    manifest.open();
  }

  function board(destination = 'orrery') {
    if (!site || flight.phase !== 'ground' || !Object.hasOwn(DESTINATIONS, destination)) return false;
    if (player.aboard || player.carrier) {
      hud.flash('not while you’re riding something');
      return false;
    }
    manifest.close();
    if (!shown) show(true);
    dropCapsule();
    built.rocket.visible = true;
    built.rocket.position.y = 0;
    wasVisible = player.character.root.visible;
    seatIn(ROCKET_AT.x, ROCKET_AT.z, ROCKET.seat);
    player.aboard = aboard;
    flight.board(destination);
    ui.say(`all aboard<small>${DESTINATIONS[destination].name}</small>`, 1600);
    return true;
  }

  flight.on('tick', (n) => {
    ui.say(String(n), 900, 'count');
    sound.sfx('countdown');
  });
  flight.on('ignite', () => sound.sfx('ignite'));
  flight.on('liftoff', () => {
    ui.say('lift-off', 1400, 'fight');
    sound.sfx('countdown', { go: true });
  });
  flight.on('phase', (phase, was) => {
    document.body.classList.toggle('in-flight', phase !== 'ground');
    document.body.classList.toggle('in-orbit', phase === 'orbit');
    document.body.classList.toggle('at-ds9', phase === 'orbit' && flight.destination === 'ds9');
    if (phase === 'boarding') player.character.root.visible = false;
    if (phase === 'orbit') toOrbit();
    if (was === 'orbit') fromOrbit();
    if (phase === 'home') {
      // the capsule, high over the pad under its chute; the next rocket below
      built.rocket.visible = true;
      built.rocket.position.y = 0;
      const c = makeCapsule(materials);
      capsule = { object: c.object, chute: c.chute, solid: null };
      scene.add(c.object);
      placeCapsule(0);
    }
    if (phase === 'ground' && was === 'home') landed();
  });

  function toOrbit() {
    built.rocket.visible = false;
    seatIn(ROCKET_AT.x, ROCKET_AT.z, 0.2);
    if (flight.destination === 'ds9') {
      if (station) station.reset();
      else station = new StationVisit(camera.aspect);
      ui.quiet();
      ui.stationDeck(false);
      ui.station.hidden = false;
    } else {
      arena = new Arena({ bots: BOTS, seed: (Math.random() * 2 ** 31) | 0 });
      arena.countdown += ARENA_TITLE;
      if (!look) look = new ArenaLook(arenaCam);
      hookArena(arena);
      leaveAsked = -Infinity;
      ui.show(true);
      ui.say(`${NAME.toLowerCase()}<small>railguns only · one shot each · first to ${RULES.frags}</small>`, 2000);
    }
    for (const bus of Object.keys(ambience)) {
      ambience[bus] = sound.levels[bus] ?? 1;
      sound.volume(bus, 0);
    }
    hud.cue(null);
    heard.orbit = true;
  }

  function fromOrbit() {
    arena = null;
    ui.station.hidden = true;
    ui.show(false);
    ui.quiet();
    for (const [bus, level] of Object.entries(ambience)) sound.volume(bus, level);
    heard.orbit = false;
  }

  function landed() {
    player.aboard = null;
    player.character.root.visible = wasVisible;
    // step out beside the capsule, which stays where it came down
    const c = capsule;
    if (c) {
      c.chute.visible = false;
      c.solid = capsuleSolid();
      solids.set(c, [c.solid]);
    }
    const out = atSite(LANDING_AT.x - 2.2, LANDING_AT.z + 1.2);
    player.spawn(out.x, out.z, site.yaw + Math.PI, site.yaw);
    hud.flash(`back down at the ${SITE_NAME.toLowerCase()}`, 2600);
  }

  function capsuleSolid() {
    const p = atSite(LANDING_AT.x, LANDING_AT.z);
    return { ax: p.x, az: p.z, bx: p.x, bz: p.z, r: 1.1, bottom: site.top, topA: site.top + 2, topB: site.top + 2 };
  }

  function placeCapsule(dt) {
    const c = capsule;
    const up = flight.capsuleUp;
    atSite(LANDING_AT.x, LANDING_AT.z, _w);
    c.object.position.set(_w.x, site.top + up, _w.z);
    c.object.rotation.y = site.yaw;
    const t = flight.t;
    c.chute.rotation.z = Math.sin(t * 1.3) * 0.06 * Math.min(1, up / 20);
    c.chute.rotation.x = Math.cos(t * 0.9) * 0.05 * Math.min(1, up / 20);
    seat.x = _w.x;
    seat.z = _w.z;
    seat.y = site.top + up + 0.3;
  }

  // ── The match ─────────────────────────────────────────────────────────────
  let shownCount = 0;
  let leaveAsked = -Infinity;
  function hookArena(a) {
    shownCount = 0;
    a.on('rail', (shot) => {
      const from = shot.shooter.me ? look.muzzleAt(_v) : look.muzzleOf(shot.shooter, {});
      look.rail(shot, from);
      if (shot.shooter.me) {
        look.fired();
        sound.sfx('rail');
      } else {
        const me = a.me.body.pos;
        const d = Math.hypot(shot.from.x - me.x, shot.from.z - me.z);
        sound.sfx('rail-far', { size: Math.max(0, 1 - d / 120) });
      }
    });
    a.on('frag', ({ killer, victim, how }) => {
      const v = a.fighters.find((f) => f.id === victim.id);
      const k = killer && a.fighters.find((f) => f.id === killer.id);
      look.frag(v);
      if (how === 'void') ui.feed(`${named(v)} fell into the void`);
      else ui.feed(`${named(k)} railed ${named(v)}`);
      if (k && k.me) {
        ui.say(`you fragged ${named(v)}`, 1500);
        sound.sfx('frag');
      } else if (v.me) {
        ui.say(how === 'void' ? 'you fell into the void<small>click to come back in</small>' : `fragged by ${named(k)}<small>click to come back in</small>`, 1800);
        ui.ouch();
        sound.sfx('fragged');
      }
    });
    a.on('lead', (how) => {
      const words = { taken: 'you’ve taken the lead', tied: 'tied for the lead', lost: 'you’ve lost the lead' }[how];
      ui.feed(`<i>${words}</i>`);
      sound.sfx('lead', { how });
    });
    a.on('moved', (f, e) => {
      if (f.me) {
        if (e.what === 'jump') sound.sfx('arena-jump');
        if (e.what === 'land' && e.speed > 3) {
          sound.sfx('arena-land', { size: Math.min(1, e.speed / 20) });
          look.landed(e.speed);
        }
        if (e.what === 'pad') sound.sfx('pad', { size: 1 });
      } else if (e.what === 'pad') {
        const me = a.me.body.pos;
        const d = Math.hypot(f.body.pos.x - me.x, f.body.pos.z - me.z);
        if (d < 40) sound.sfx('pad', { size: 1 - d / 40 });
      }
    });
    a.on('end', ({ winner }) => {
      const mine = a.match.byId.get(a.me.id);
      record.matches++;
      if (winner.me) record.wins++;
      record.best = Math.max(record.best, mine.frags);
      save.touch();
      ui.say(winner.me ? 'you win!' : `${named(a.fighters.find((f) => f.id === winner.id))} wins`, 3000, 'fight');
    });
  }

  function onStation() {
    return flight.phase === 'orbit' && flight.destination === 'ds9';
  }

  function changeDeck() {
    if (!onStation() || input.blocked) return;
    station.setDeck(!station.inside);
    ui.stationDeck(station.inside);
  }
  ui.station.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') e.stopPropagation(); // activate the focused button once
  });
  ui.deckButton.addEventListener('click', () => { ui.deckButton.blur(); changeDeck(); });
  ui.homeButton.addEventListener('click', () => { if (onStation()) leave(); });
  ui.launchTouch.addEventListener('click', () => flight.phase === 'ground' ? chooseFlight() : leave());

  function leave() {
    if (onStation()) return flight.comeHome();
    if (!arena) return;
    const now = performance.now() / 1000;
    if (arena.over || now - leaveAsked < AGAIN) {
      flight.comeHome();
      return;
    }
    leaveAsked = now;
    ui.say('T again to fly home<small>and leave the match</small>', AGAIN * 1000);
  }

  // ── T ─────────────────────────────────────────────────────────────────────
  function nearRocket() {
    if (!site || !shown) return false;
    const r = atSite(ROCKET_AT.x, ROCKET_AT.z);
    const p = player.pos;
    return Math.hypot(p.x - r.x, p.z - r.z) < BOARD && Math.abs(p.y - site.top) < 2.5;
  }
  commands.add({
    id: 'rocket',
    keys: ['KeyT'],
    group: 'WANDER',
    label: 'by the rocket: choose a destination · in orbit: fly home',
    run() {
      if (flight.phase === 'orbit') return leave();
      if (flight.phase !== 'ground') return;
      if (!site) return hud.flash('there’s no launch site in this world', 2400);
      if (nearRocket()) return chooseFlight();
      const p = player.pos;
      const d = Math.hypot(site.x - p.x, site.z - p.z);
      if (d < ARRIVE + 6) return hud.flash('walk up to the rocket, then T', 2200);
      const a = Math.atan2(site.x - p.x, -(site.z - p.z));
      hud.flash(`the launch site is ${Math.round(d)} m ${WAYS[((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8]} · it’s on the map`, 3200);
    },
  });
  commands.add({
    id: 'station-deck', keys: ['Enter'], group: 'ORBIT', label: 'Deep Space 9: dock or view the exterior',
    run: changeDeck,
  });
  commands.describe({ group: 'ORBIT', help: 'W A S D · mouse', pad: ['PadLS', 'PadRS'], label: 'Deep Space 9: circle the station or walk the Promenade' });
  commands.describe({ group: 'ORBIT', help: 'W A S D · mouse', pad: ['PadLS', 'PadRS'], label: 'in the arena: run, strafe, look' });
  commands.describe({ group: 'ORBIT', help: 'click', pad: ['PadRT'], label: 'fire the railgun (one hit frags)' });
  commands.describe({ group: 'ORBIT', help: 'space', pad: ['PadA'], label: 'jump · hold to keep hopping' });
  commands.describe({ group: 'ORBIT', help: 'A / D + mouse', label: 'in the air: strafe and turn to go faster' });

  builder.idleWhile(() => flight.phase !== 'ground');
  game.coverWhen(() => flight.phase === 'orbit');

  // ── Each frame ────────────────────────────────────────────────────────────
  // First, the orbital destination reads the controls: you're up
  // there, not walking about down here.
  const yours = { move: { x: 0, y: 0 }, jump: false, fire: false, turn: { yaw: 0, pitch: 0 } };
  game.addSystem({
    name: 'spaceport-arena',
    phase: 'input',
    update({ dt }) {
      if (flight.phase !== 'orbit') return;
      const looked = input.consumeLook();
      const stick = input.lookRate();
      const zoom = input.consumeZoom();
      if (onStation()) ui.station.hidden = input.blocked || map.isOpen;
      if (map.isOpen || (onStation() && input.blocked)) return;
      yours.turn.yaw = -looked.x * SENS - stick.x * STICK_TURN.yaw * dt;
      yours.turn.pitch = -looked.y * SENS - stick.y * STICK_TURN.pitch * dt;
      const m = input.moveAxes();
      yours.move.x = m.x;
      yours.move.y = m.y;
      if (onStation()) {
        station.update(dt, yours, zoom, input.isDown('run'));
        return;
      }
      yours.jump = input.isDown('jump') || input.jumped();
      yours.fire = input.holding('use');
      const before = arena.me.reload;
      arena.update(dt, yours);
      if (before > 0 && arena.me.reload <= 0 && arena.me.alive) sound.sfx('charged');
      // the countdown before the fight
      const n = Math.ceil(arena.countdown);
      if (arena.countdown > 0 && n !== shownCount && n <= 3) {
        shownCount = n;
        ui.say(String(n), 800, 'count');
        sound.sfx('countdown');
      } else if (arena.countdown <= 0 && shownCount > 0) {
        shownCount = 0;
        ui.say('fight!', 1000, 'fight');
        sound.sfx('countdown', { go: true });
      }
      ui.update(arena);
      if (arena.over) ui.scores(arena, `T to fly home · your record here: ${record.wins} ${record.wins === 1 ? 'win' : 'wins'} in ${record.matches} · best ${record.best} frags`);
    },
  });

  let arrived = false;
  let cued = false;
  game.addSystem({
    name: 'spaceport',
    phase: 'world',
    update({ dt, time }) {
      if (!site) return;
      const p = game.focus;
      const d = Math.hypot(site.x - p.x, site.z - p.z);
      if (flight.phase === 'ground') {
        if (d < SHOW) show(true);
        else if (d > HIDE) show(false);
      }
      if (capsule && flight.phase === 'ground' && d > CAPSULE_KEPT) dropCapsule();
      if (!arrived && d < ARRIVE && flight.phase === 'ground') {
        arrived = true;
        hud.flash(`${SITE_NAME} · walk up to the rocket and press T to choose a destination`, 3600);
        if (!record.visited) {
          record.visited = true;
          save.touch();
        }
      }
      if (d > ARRIVE * 4) arrived = false;
      // T, by the rocket
      const can = flight.phase === 'ground' && nearRocket() && !player.aboard && !player.carrier;
      ui.launchTouch.hidden = !input.isTouch || input.blocked || !(can || arena);
      if (!ui.launchTouch.hidden) ui.launchTouch.textContent = can ? 'Choose destination' : 'Fly home';
      if (can) {
        hud.cue({ html: '<b>T</b> climb aboard the rocket · choose destination' });
        cued = true;
      } else if (cued) {
        hud.cue(null);
        cued = false;
      }
      if (!shown) return;
      flight.update(dt);
      const phase = flight.phase;
      // the rocket climbing, and you in it
      if (phase === 'climb') {
        built.rocket.position.y = flight.rocketUp;
        seatIn(ROCKET_AT.x, ROCKET_AT.z, flight.rocketUp + ROCKET.seat);
      }
      if (phase === 'home' && capsule) placeCapsule(dt);
      if (capsule && phase === 'ground' && capsule.chute.visible) capsule.chute.visible = false;
      exhaust(dt, flight.thrust);
      // the beacon blinks, and the lamps come on after dark
      built.beacons[0].visible = time % 1.6 < 0.25;
      const night = SKY.uNight.value;
      built.lampMat.color.setRGB(0.3 + 3.2 * night, 0.26 + 2.8 * night, 0.2 + 2 * night);
      if (phase === 'countdown' || phase === 'climb') film(dt);
      ui.glare(flight.glare);
      const r = atSite(ROCKET_AT.x, ROCKET_AT.z);
      heard.thrust = flight.thrust;
      heard.near = phase === 'climb' || phase === 'countdown' ? 1 : Math.max(0, 1 - Math.hypot(r.x - camera.position.x, r.z - camera.position.z) / 300);
    },
  });

  // The flame under the rocket, and the smoke it raises off the pad.
  function exhaust(dt, thrust) {
    const { flame, smoke } = built.exhaust;
    flame.visible = thrust > 0.01;
    if (flame.visible) {
      const flicker = 0.85 + Math.random() * 0.3;
      flame.scale.set(0.9 + thrust * 0.3, (3 + thrust * 9) * flicker, 0.9 + thrust * 0.3);
    }
    const puffs = built.puffs;
    built.owed += thrust * 70 * dt;
    const y = built.rocket.position.y;
    while (built.owed >= 1 && puffs.length < SMOKE) {
      built.owed -= 1;
      const a = Math.random() * Math.PI * 2;
      const low = y < 8;
      const s = low ? 7 + Math.random() * 9 : 1 + Math.random() * 2;
      puffs.push({ x: ROCKET_AT.x + Math.cos(a) * 0.5, y: Math.max(0.6, y - (low ? 0 : 3)), z: ROCKET_AT.z + Math.sin(a) * 0.5, vx: Math.cos(a) * s, vy: low ? 0.6 + Math.random() : -8 - Math.random() * 6, vz: Math.sin(a) * s, age: 0, life: 4 + Math.random() * 4 });
    }
    built.owed = Math.min(built.owed, 5);
    let n = 0;
    for (let i = puffs.length - 1; i >= 0; i--) {
      const f = puffs[i];
      f.age += dt;
      if (f.age > f.life) {
        puffs.splice(i, 1);
        continue;
      }
      const drag = Math.exp(-dt * 1.3);
      f.vx *= drag;
      f.vz *= drag;
      f.vy = f.vy * drag + 0.5 * dt;
      f.x += f.vx * dt;
      f.y = Math.max(0.5, f.y + f.vy * dt);
      f.z += f.vz * dt;
    }
    for (const f of puffs) {
      const k = f.age / f.life;
      const size = (0.8 + f.age * 1.6) * (1 - k * k * k);
      _m.compose(_p.set(f.x, f.y, f.z), _q, _s.setScalar(size));
      smoke.setMatrixAt(n++, _m);
    }
    smoke.count = n;
    smoke.instanceMatrix.needsUpdate = true;
  }

  // The view during the countdown and the climb: from the corner of the pad,
  // looking up at the rocket; then from below it as it climbs away.
  const _eye = new THREE.Vector3();
  const _at = new THREE.Vector3();
  function film() {
    const r = atSite(ROCKET_AT.x, ROCKET_AT.z);
    const y = site.top + built.rocket.position.y;
    const from = atSite(3, PAD + 1.6);
    _eye.set(from.x, site.top + 2.4, from.z);
    _at.set(r.x, y + ROCKET.height * 0.55, r.z);
    if (flight.phase === 'climb') {
      // from under it and to the side, falling behind as it goes
      const k = Math.min(1, Math.max(0, (flight.t - 2) / 2));
      const chase = atSite(ROCKET_AT.x + 9, ROCKET_AT.z + 26);
      _eye.lerp(_v.set(chase.x, y - 14, chase.z), k);
      // shaking as it goes
      const shake = 0.12 * (1 - k * 0.6);
      _eye.x += (Math.random() - 0.5) * shake;
      _eye.y += (Math.random() - 0.5) * shake;
    }
    camera.position.copy(_eye);
    camera.lookAt(_at);
  }

  // Drawing the selected destination in place of the forest,
  // with the forest's air (its haze, its cloud, its water) taken out.
  game.addSystem({
    name: 'spaceport-view',
    phase: 'render',
    update({ dt }) {
      if (flight.phase !== 'orbit') return;
      const view = onStation() ? station : look;
      const cam = view.camera;
      if (cam.aspect !== camera.aspect) {
        cam.aspect = camera.aspect;
        cam.updateProjectionMatrix();
        if (onStation()) station.placeCamera();
      }
      if (arena) look.update(dt, arena);
      if (map.isOpen) return;
      const kept = { haze: pipeline.haze, far: pipeline.fogFar, deck: DECK.uDeckCover.value, under: UNDER.uUnder.value };
      pipeline.haze = 0;
      pipeline.fogFar = 1e7;
      DECK.uDeckCover.value = 0;
      UNDER.uUnder.value = 0;
      try {
        pipeline.render(view.scene, cam, EXPOSURE, 1);
      } finally {
        pipeline.haze = kept.haze;
        pipeline.fogFar = kept.far;
        DECK.uDeckCover.value = kept.deck;
        UNDER.uUnder.value = kept.under;
      }
    },
  });

  // ── From the console ──────────────────────────────────────────────────────
  game.provide('spaceport', {
    site,
    flight,
    record,
    get phase() {
      return flight.phase;
    },
    get arena() {
      return arena;
    },
    get station() {
      return onStation() ? station : null;
    },
    get look() {
      return look;
    },
    // stand on the pad beside the rocket, facing it
    async go() {
      if (!site) return null;
      const p = atSite(ROCKET_AT.x, ROCKET_AT.z + 3.5);
      await game.api.teleport(p.x, p.z, site.yaw + Math.PI);
      return { x: p.x, z: p.z };
    },
    board,
    hurry() {
      if (arena && arena.countdown > 0) arena.countdown = 0;
      else flight.hurry();
      return flight.phase;
    },
    leave: () => flight.comeHome(),
  });
}
