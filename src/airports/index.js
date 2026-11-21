// The airports: an airfield a walk from where you start, and one a few
// kilometres from each part of the world where there are hikes, and a little
// plane that flies from any of them to any other.
//
//   airports.js  which parts of the world have one, and where each is,
//                grown from the seed and the land
//   airfield.js  what one looks like: the strip on its bank, the apron, the
//                terminal, the tower, the hangar, the windsock, the lights
//   plane.js     the plane
//   flight.js    a flight, over time: taxi, take off, up through the cloud,
//                over it, carried across, down, land, taxi in
//   sound.js     the engines, the air, the chime, the tyres; tarmac underfoot
//   panel.js     where you can fly (a tab beside the map, or P)
//   onMap.js     the routes, and your plane on yours
//
// Like the railway and the launch site, nothing about an airfield is saved
// and nothing about the land changes for it: everyone in a world finds the
// same one, and the plants in its way are hidden as their chunk grows. One
// that would lie where someone had already built something isn't there.
// Which flight you're on is yours, saved, and passed on so the others know
// not to see you standing about in the sky.
//
// This file tells the rest of the game about it:
//   - plants are kept off the strip, the apron and the banks, grass off them,
//     and building away from them
//   - the strip, the apron and the banks are solids, to walk on; the
//     buildings and a parked plane, to walk into
//   - the airfields are places on the map, with the routes between them
//   - the flights tab beside the map, which P opens; at an airfield, pick
//     where to go and you're aboard (player.aboard), the tools put away
//   - the layer of cloud over you while you fly (country.cloud)
//   - a layer of sound for the plane
//
// From the console:
//   world.airports.list()           the airfields found so far, nearest first
//   await world.airports.go()       to the airfield for where you are
//   world.airports.fly(id)          fly from the one you're at to another
//   world.airports.hurry()          skip on to the end of this part of the flight

import * as THREE from 'three';
import { Airports, APRON, HALF, PLAN, topAt, earthAt, outside } from './airports.js';
import { buildAirfield, PARK } from './airfield.js';
import { Plane, doorFoot, PLANE } from './plane.js';
import { Flight, FLY, cruiseFor, intoWind } from './flight.js';
import { planeSounds } from './sound.js';
import { FlightsPanel } from './panel.js';
import { routeLayer, FIELD_GLYPH } from './onMap.js';
import { clearOf } from '../spaceport/site.js';
import { toWorld, toLocal } from '../landmarks/sites.js';
import { VEG_STRIDE, VEG_KINDS } from '../world/flora.js';
import { SEAT_HIPS } from '../player/character.js';
import { SHARED, SKY } from '../render/uniforms.js';
import { rayBox } from '../core/geom.js';
import { formatDistance } from '../core/format.js';

const SHOW = 750; // m: an airfield this close is stood up...
const HIDE = 950; // ...and taken down again past this
const AT = 320; // m from the middle of its strip that counts as being at an airfield
const ARRIVE = 140; // m: coming this near one on foot, you're told its name
const PUMP_MS = [1.5, 8]; // ms a frame looking for airfields: usually, and with the map open
const BOARD_NEAR = 5; // m from the foot of the parked plane's steps, the HUD says P would fly
const GO_TO = { x: 27, z: -13 }; // where you're put, going to an airfield: on its apron, in the field's frame
const BACK = 16; // m further back the camera sits, to take the plane in
const BEHIND = 0.8; // 1/s: how quickly the camera swings round behind it, left alone
const SAY = 4200; // ms a sentence stays on the screen
// Which way the wind blows, as the grass leans (world/materials.js): planes
// take off and land into it where they can.
const WIND = { x: 1 / Math.hypot(1, 0.45), z: 0.45 / Math.hypot(1, 0.45) };
// How far (m) plants of each kind are kept back from the plan (a rock and a
// fallen log by their size); on the banks, anything the bank covers goes.
const KEEP = { pine: 3, broad: 3.4, birch: 2.6, bush: 1.4, fern: 0.6, rock: 1.2, log: 2.4 };
const SCALED = { rock: true, log: true };
const VEIL = 0.9; // how white the view goes in the cloud, while you're carried across
const WAYS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

const _w = { x: 0, z: 0 };
const _l = { x: 0, z: 0 };
const _o = { x: 0, z: 0 };
const _s = { x: 0, y: 0, z: 0 };

// The features this uses, so it is installed after them (game/features.js);
// landmarks, towns, caves, the railway and the launch site for what the
// airfields keep clear of, and the country for the cloud.
export const after = ['render', 'ui', 'world', 'player', 'audio', 'build', 'map', 'save', 'landmarks', 'towns', 'caves', 'railway', 'spaceport', 'country'];
export function installAirports(game) {
  const { scene, gen, chunks, grass, solids, landforms, player, input, builder, map, hud, commands, save, sound, landmarks, towns, caves, railway, spaceport, country, peers } = game;

  // ── Where they are ────────────────────────────────────────────────────────
  // Clear of real places, the old places, towns, the mouths of caves, the
  // railway and the launch site, all of which were there first.
  const clear = clearOf({ landforms, sites: landmarks.sites, towns: towns.towns, caves, lines: railway.lines });
  const pad = spaceport.site;
  const keepOff = (x0, z0, x1, z1) => clear(x0, z0, x1, z1) || !!(pad && pad.box[0] <= x1 && pad.box[2] >= x0 && pad.box[1] <= z1 && pad.box[3] >= z0);
  const airports = new Airports(gen, { cards: landforms.cards, start: player.start, keepOff });
  const ground = (x, z) => gen.height(x, z) + (chunks.heightOffset ? chunks.heightOffset(x, z) : 0);
  const cards = new Map(landforms.cards.map((c) => [c.id, c]));
  const regionOf = (site) => airports.region(site.region);
  // what an airfield is for: where you started, and the hikes it serves
  const forWhat = (site) => {
    const g = regionOf(site);
    const names = g.hikes.map((id) => cards.get(id)?.name).filter(Boolean);
    return [g.id === 'home' ? 'where you started' : '', names.join(', ')].filter(Boolean).join(' · ');
  };
  // how far apart two places are in the real world (m): the hikes' scale
  const really = (a, b) => Math.hypot(b.x - a.x, b.z - a.z) / (regionOf(b).scale || 0.2);

  // ── Whether one is there at all ───────────────────────────────────────────
  // Not where something has been built, or a fire laid, on its strip, its
  // apron or its banks: anything not grown from the seed. Asked once each.
  const standing = new Map();
  let asking = false; // (its own obstacles keep out of it)
  function stands(site) {
    let yes = standing.get(site.id);
    if (yes !== undefined) return yes;
    yes = true;
    asking = true;
    try {
      for (let lz = -HALF; lz <= HALF && yes; lz += 12) {
        for (let lx = -8; lx <= APRON[2]; lx += 12) {
          if (lx > 8 && (lz < APRON[1] || lz > APRON[3])) continue;
          toWorld(site, lx, lz, _w);
          for (const o of builder.obstacles.near(_w.x, _w.z, 9 + site.toe)) {
            if (o.grown || o.clear) continue;
            toLocal(site, o.x, o.z, _l);
            if (outside(_l.x, _l.z, _o) < site.toe + 1) {
              yes = false;
              break;
            }
          }
          if (!yes) break;
        }
      }
    } finally {
      asking = false;
    }
    standing.set(site.id, yes);
    return yes;
  }
  const known = () => airports.known().filter(stands);
  const within = (x0, z0, x1, z1) => airports.within(x0, z0, x1, z1).filter(stands);

  // ── Keeping the forest off it ─────────────────────────────────────────────
  // A plant goes if it's on the plan or near it, or where the bank covers its
  // foot. As each chunk grows, and in the chunks already grown when an
  // airfield is found.
  const inTheWay = (site, kind, x, y, z, scale) => {
    toLocal(site, x, z, _l);
    const d = outside(_l.x, _l.z, _o);
    if (d > site.toe + 3) return false;
    const keep = (KEEP[kind] ?? 1.2) * (SCALED[kind] ? scale : 1);
    return d < keep || earthAt(site, _l.x, _l.z) > y - 0.25;
  };
  chunks.on('vegetation', (ch) => {
    const S = chunks.size;
    const x0 = ch.cx * S;
    const z0 = ch.cz * S;
    const here = within(x0 - 4, z0 - 4, x0 + S + 4, z0 + S + 4);
    if (!here.length) return;
    for (const kind in ch.vegLists) {
      const list = ch.vegLists[kind];
      for (let o = 0, k = 0; o < list.length; o += VEG_STRIDE, k++) {
        const scale = list[o + 4];
        if (scale <= 0) continue;
        if (here.some((s) => inTheWay(s, kind, list[o], list[o + 1], list[o + 2], scale))) chunks.hideInstance(ch, kind, k);
      }
    }
  });
  airports.on('site', (site) => {
    if (!stands(site)) return;
    const r = Math.hypot(site.box[2] - site.box[0], site.box[3] - site.box[1]) / 2;
    chunks.forEachPlant((site.box[0] + site.box[2]) / 2, (site.box[1] + site.box[3]) / 2, r, VEG_KINDS, (ch, kind, k, x, y, z, scale) => {
      if (inTheWay(site, kind, x, y, z, scale)) chunks.hideInstance(ch, kind, k);
    });
  });
  // no grass on the strip, the apron or the banks
  grass.addClearing((x0, z0, x1, z1) => {
    const list = within(x0 - 2, z0 - 2, x1 + 2, z1 + 2);
    if (!list.length) return null;
    return (x, z) =>
      list.some((s) => {
        toLocal(s, x, z, _l);
        const d = outside(_l.x, _l.z, _o);
        if (d > s.toe + 1) return false;
        return d < 0.3 || earthAt(s, _l.x, _l.z) > chunks.heightAt(x, z) - 0.05;
      });
  });
  // building goes round it
  builder.obstacles.addSource((x, z, R, out) => {
    if (asking) return;
    for (const s of within(x - R - 60, z - R - 60, x + R + 60, z + R + 60)) {
      toLocal(s, x, z, _l);
      const d = outside(_l.x, _l.z, _o);
      if (d > R + s.toe + 2) continue;
      // the nearest bit of it, as a disc
      toWorld(s, _o.x, _o.z, _w);
      const r = 2 + Math.max(0, Math.min(s.toe, d - 0.5));
      out.push({ x: _w.x, z: _w.z, what: 'the airfield', dig: r + 0.5, wall: r + 0.3, footing: r + 0.7, roof: r, grown: true });
    }
  });

  // ── Standing them up and taking them down ─────────────────────────────────
  const body = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, side: THREE.DoubleSide });
  const paint = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 });
  const lamps = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  const planeBody = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.05, side: THREE.DoubleSide });
  const planeGlow = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  const shared = new Set([body, paint, lamps, planeBody, planeGlow]);
  const mats = { body, paint, lamps };
  const planeMats = { material: planeBody, glow: planeGlow };
  const shown = new Map(); // site id -> { site, object, solids, blockers, windows, beacon, sock, parked, solid }
  const facing = new Map(); // site id -> which way the plane on its apron stands (+1, -1)
  const parkedPose = (site) => {
    const f = facing.get(site.id) ?? 1;
    toWorld(site, PARK.x, PARK.z, _w);
    return { x: _w.x, y: topAt(site, PARK.z), z: _w.z, yaw: site.yaw + (f > 0 ? 0 : Math.PI), pitch: 0, roll: 0, power: 0, door: 1, lit: false, aloft: false, v: 0 };
  };
  // the parked plane's hull, to walk into (its wings are over your head)
  const hullSolid = (p) => {
    const fx = Math.sin(p.yaw);
    const fz = Math.cos(p.yaw);
    return { ax: p.x + fx * (PLANE.nose - 1.2), az: p.z + fz * (PLANE.nose - 1.2), bx: p.x - fx * (PLANE.tail - 1.5), bz: p.z - fz * (PLANE.tail - 1.5), r: 1.0, bottom: p.y, topA: p.y + 3, topB: p.y + 3 };
  };
  function show(site) {
    let e = shown.get(site.id);
    if (e) return e;
    const built = buildAirfield(site, ground, mats);
    e = { site, ...built, parked: new Plane(planeMats), here: true };
    scene.add(built.object);
    scene.add(e.parked.object);
    shown.set(site.id, e);
    park(e);
    return e;
  }
  // The plane on the apron: there, unless it's the one you're flying in.
  function park(e) {
    const away = !!trip && ((trip.from === e.site && !trip.flight.jumped) || (trip.to === e.site && trip.flight.jumped));
    e.parked.object.visible = !away;
    const p = parkedPose(e.site);
    e.parked.place(p);
    e.parked.run(0, p, 0);
    solids.set(e, away ? e.solids : [...e.solids, hullSolid(p)]);
  }
  function hide(e) {
    scene.remove(e.object);
    scene.remove(e.parked.object);
    for (const o of [e.object, e.parked.object]) {
      o.traverse((m) => {
        if (!m.isMesh) return;
        m.geometry.dispose();
        if (!shared.has(m.material)) m.material.dispose();
      });
    }
    solids.clear(e);
    shown.delete(e.site.id);
  }
  // The camera doesn't look through the buildings.
  player.cameraBlockers.push((origin, dir, max) => {
    let best = Infinity;
    for (const e of shown.values()) {
      if (Math.hypot(origin.x - e.site.x, origin.z - e.site.z) > max + HALF + 40) continue;
      for (const b of e.blockers) best = Math.min(best, rayBox(origin, dir, b));
    }
    return best;
  });

  // ── Flying ────────────────────────────────────────────────────────────────
  let trip = null; // { flight, from, to, plane, km }
  let wasVisible = true;
  const deckMid = { x: 0, z: 0 }; // where the cloud's billows are measured from
  builder.idleWhile(() => trip !== null);
  const seatPlace = {
    place(out) {
      const p = trip.flight.pose;
      trip.plane.seat(_s);
      out.x = _s.x;
      out.y = _s.y - SEAT_HIPS;
      out.z = _s.z;
      out.yaw = p.yaw;
      out.back = BACK;
      out.behind = BEHIND;
      out.grounded = !p.aloft;
    },
  };
  // The airfield you're at, if you're at one.
  function fieldHere() {
    const p = player.pos;
    let best = null;
    let bd = AT;
    for (const s of within(p.x - AT, p.z - AT, p.x + AT, p.z + AT)) {
      const d = Math.hypot(s.x - p.x, s.z - p.z);
      if (d < bd) {
        best = s;
        bd = d;
      }
    }
    return best;
  }

  function fly(toId) {
    const from = fieldHere();
    const to = airports.byId(toId);
    if (trip) return false;
    if (!from) {
      hud.flash('get to an airfield first');
      return false;
    }
    if (!to || to === from || !stands(to)) return false;
    if (player.carrier || player.aboard) {
      hud.flash('get down first (Z)');
      return false;
    }
    map.close();
    const km = really(from, to) / 1000;
    const flight = new Flight({ from, to, ground: (x, z) => gen.height(x, z), way: intoWind(from, WIND), land: intoWind(to, WIND, true), facing: facing.get(from.id) ?? 1, cruise: cruiseFor(km) });
    const plane = new Plane(planeMats);
    scene.add(plane.object);
    trip = { flight, from, to, plane, km };
    deckMid.x = from.x;
    deckMid.z = from.z;
    plane.place(flight.pose);
    plane.run(0, flight.pose, 0);
    park(show(from));
    wasVisible = player.character.root.visible;
    player.character.root.visible = false;
    player.aboard = seatPlace;
    player.vel.set(0, 0, 0);
    flight.on('phase', (phase) => said(phase));
    flight.on('liftoff', () => hud.flash(`off the ground · ${to.name} next`, SAY));
    flight.on('jump', () => {
      // carried across: the cloud's pattern goes on round the plane as it was
      deckMid.x += flight.first.x - flight.over.x;
      deckMid.z += flight.first.z - flight.over.z;
      park(show(to));
      park(show(from));
    });
    flight.on('touchdown', () => sound.sfx('touchdown'));
    flight.on('done', () => land());
    sound.sfx('chime');
    hud.flash(`boarding for ${to.name} · ${miles(km)} · ${forWhat(to)}`, SAY);
    save.touch();
    tell();
    return true;
  }

  // A word as the flight goes on.
  function said(phase) {
    if (!trip) return;
    const { to } = trip;
    if (phase === 'start') sound.sfx('door');
    else if (phase === 'roll') hud.flash('taking off', 1800);
    else if (phase === 'cruise') hud.flash(input.isTouch ? 'over the clouds' : 'over the clouds · P to sleep through it', SAY);
    else if (phase === 'approach') hud.flash(`coming in to ${to.name}`, SAY);
    else if (phase === 'shutdown') sound.sfx('chime');
  }

  // At the end of it: down the steps onto the apron.
  function land() {
    const { flight, to, plane } = trip;
    const pose = { ...flight.pose };
    facing.set(to.id, Math.cos(pose.yaw - to.yaw) > 0 ? 1 : -1);
    scene.remove(plane.object);
    plane.object.traverse((m) => m.isMesh && m.geometry.dispose());
    trip = null;
    park(show(to));
    player.aboard = null;
    player.character.root.visible = wasVisible;
    const foot = doorFoot(pose);
    // (the camera out in front, looking back at you and the plane behind)
    player.spawn(foot.x, foot.z, foot.yaw, foot.yaw);
    sound.sfx('door');
    hud.flash(`${to.name} · ${forWhat(to)}`, SAY);
    reached.add(to.id);
    save.touch();
    tell();
  }

  // Off to the airfield for here: onto its apron, by the terminal, looking
  // out at the plane.
  async function goTo(site) {
    if (!site || !stands(site)) return false;
    if (player.carrier || player.aboard) {
      hud.flash('get down first (Z)');
      return false;
    }
    map.close();
    show(site);
    // (off to the side of the plane's tail, clear of its wing, looking at it)
    toWorld(site, GO_TO.x, GO_TO.z, _w);
    const spot = { x: _w.x, z: _w.z };
    const foot = doorFoot(parkedPose(site));
    _o.x = foot.x;
    _o.z = foot.z;
    reached.add(site.id);
    await game.api.teleport(spot.x, spot.z, Math.atan2(_o.x - spot.x, _o.z - spot.z));
    hud.flash(`${site.name} · ${input.isTouch ? 'the flights tab' : 'P'} for where to fly`, SAY);
    return true;
  }

  // ── P: where to fly ───────────────────────────────────────────────────────
  const showing = () => map.isOpen && map.tab === 'flights';
  const panel = new FlightsPanel({
    onPick: (id, action) => {
      if (action === 'fly') fly(id);
      else if (action === 'go') goTo(airports.byId(id));
    },
    showing,
    onClose: () => map.close(),
  });
  map.addTab({
    id: 'flights',
    label: 'flights',
    el: panel.el,
    shown() {
      wantRegions();
      refreshPanel();
    },
  });
  function press() {
    if (trip) {
      if (trip.flight.part === 'cruise') {
        trip.flight.hurry();
        hud.flash('you nod off…', 1800);
      } else hud.flash(`to ${trip.to.name} · ${when(trip.flight.left)} to go`);
      return;
    }
    map.open('flights');
  }
  commands.add({ id: 'flights', keys: ['KeyP'], group: 'WANDER', label: 'flights: where to fly from here · sleep through a flight', run: press });

  // Ask for the airfields to be found: the one for where you are first.
  function wantRegions() {
    const g = airports.regionAt(player.pos.x, player.pos.z);
    if (g) airports.site(g.id, false);
    for (const r of airports.regions) airports.site(r.id, false);
  }
  wantRegions();

  // The panel's list: at an airfield, where to fly; elsewhere, the airfield
  // for here, and where you could fly from it.
  let panelIn = 0;
  function refreshPanel() {
    panelIn = 0.5;
    const p = player.pos;
    const all = known();
    const here = fieldHere();
    const rows = [];
    let note = '';
    const row = (s, from, action) => {
      const km = really(from, s) / 1000;
      return { id: s.id, name: s.name, sub: forWhat(s), far: `${miles(km)} ${compass(from.x, from.z, s.x, s.z)}`, when: action === 'fly' ? `about ${Math.round((trip ? 0 : tripTime(km)) / 60)} min` : '', action };
    };
    if (trip) {
      note = `On the way to <b>${trip.to.name}</b>, ${when(trip.flight.left)} to go.`;
    } else if (here) {
      note = `At <b>${here.name}</b>. Pick where to fly: the plane on the apron will take you.`;
      for (const s of all.filter((s) => s !== here).sort((a, b) => really(here, a) - really(here, b))) rows.push(row(s, here, 'fly'));
    } else {
      const g = airports.regionAt(p.x, p.z);
      const home = g && airports.site(g.id, false);
      if (home && stands(home)) {
        const d = Math.hypot(home.x - p.x, home.z - p.z);
        note = `The airfield for here is <b>${home.name}</b>, ${formatDistance(d)} ${compass(p.x, p.z, home.x, home.z)}. Go there, then <b>P</b> for where to fly.`;
        rows.push({ id: home.id, name: `go to ${home.name}`, sub: forWhat(home), far: `${formatDistance(d)} ${compass(p.x, p.z, home.x, home.z)}`, when: '', action: 'go' });
        for (const s of all.filter((s) => s !== home).sort((a, b) => really(home, a) - really(home, b))) rows.push(row(s, home, null));
      } else note = g ? 'Looking for the airfield for here…' : 'There’s no airfield within reach of here.';
    }
    panel.show({ note, rows, looking: airports.queue.size > 0 });
  }

  // ── Saving: which flight you're on ────────────────────────────────────────
  // Close the game on a flight and you open at the other end, on its apron,
  // beside the plane.
  save.register({
    id: 'flight',
    scope: 'yours',
    collect: () => (trip ? { to: trip.to.region } : null),
    validate: (r) => (r && typeof r.to === 'string' && airports.region(r.to) ? { to: r.to } : null),
    restore(r) {
      if (!r) return;
      const site = airports.site(r.to);
      if (!site || !stands(site)) return;
      const e = show(site);
      const foot = doorFoot(parkedPose(e.site));
      player.arrival = { x: foot.x, z: foot.z, yaw: foot.yaw, camYaw: foot.yaw };
      reached.add(site.id);
    },
  });

  // Only offer flights between fields that actually stand in this world.
  map.routes.flights = () => ({ fields: known(), here: fieldHere(), landing: trip?.to, surveying: airports.queue.size > 0 });

  // ── Everyone else here ────────────────────────────────────────────────────
  // They're told when you're flying, and don't see you while you are.
  const flying = new Map(); // peer id -> region id they're flying to
  function tell() {
    save.say('flight', trip ? { to: trip.to.region } : { to: null });
  }
  save.on('message', (msg) => {
    if (msg.ch !== 'flight') return;
    const b = msg.body || {};
    if (typeof b.to === 'string') flying.set(msg.from, b.to);
    else {
      flying.delete(msg.from);
      const p = peers && peers.get(msg.from);
      if (p) p.character.root.visible = p.flag.visible = true;
    }
  });
  if (peers) peers.on('change', () => trip && tell());

  // ── On the map ────────────────────────────────────────────────────────────
  const places = new Map();
  const corners = (site, [x0, z0, x1, z1]) =>
    [
      [x0, z0],
      [x1, z0],
      [x1, z1],
      [x0, z1],
    ].map(([lx, lz]) => {
      toWorld(site, lx, lz, _w);
      return [_w.x, _w.z];
    });
  function asPlace(site) {
    let p = places.get(site.id);
    if (p) return p;
    const t = site.toe;
    p = { id: site.id, x: site.x, z: site.z, name: site.name, kind: 'airfield', note: `${forWhat(site) || 'an airstrip'} · flights to the other airfields`, glyph: FIELD_GLYPH, visited: false, shape: PLAN.map((r) => corners(site, r)), ground: PLAN.map(([x0, z0, x1, z1]) => corners(site, [x0 - t, z0 - t, x1 + t, z1 + t])) };
    places.set(site.id, p);
    return p;
  }
  map.places.addSource({
    within: (x0, z0, x1, z1) => known().filter((s) => s.x >= x0 && s.x <= x1 && s.z >= z0 && s.z <= z1).map(asPlace),
    get: (id) => {
      if (!String(id).startsWith('airfield:')) return null;
      const s = airports.byId(id);
      return s && stands(s) ? asPlace(s) : null;
    },
  });
  map.addLayer(
    routeLayer(() => {
      const all = known();
      if (trip) {
        const f = trip.flight;
        return { from: null, to: [], flying: { ax: trip.from.x, az: trip.from.z, bx: trip.to.x, bz: trip.to.z, f: f.progress } };
      }
      const p = player.pos;
      const g = airports.regionAt(p.x, p.z);
      const from = fieldHere() || (g && airports.site(g.id, false)) || null;
      return { from: from && stands(from) ? from : null, to: all.filter((s) => s !== from), flying: null };
    }),
  );

  // ── The cloud, while you fly ──────────────────────────────────────────────
  // Coming in over you as you climb out; over everything while you're over
  // it, carried across, and waiting in it; and thinning away as you come
  // down out of it to land.
  const smooth = (a, b, v) => {
    const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  country.cloud(cloud);
  function cloud() {
    if (!trip) return null;
    const f = trip.flight;
    const y = f.pose.y;
    let cover;
    if (!f.jumped) {
      const field = topAt(trip.from, 0);
      cover = smooth(field + 25, field + 110, y);
    } else cover = f.part === 'hold' ? 1 : smooth(topAt(trip.to, 0) + 15, f.deckTo - 25, y);
    return { at: f.deck, cover, x: deckMid.x, z: deckMid.z };
  }
  // and, carried across, nothing at all to see but white
  const veil = document.createElement('div');
  veil.id = 'fly-veil';
  document.body.appendChild(veil);
  function whiteness() {
    if (!trip) return 0;
    const f = trip.flight;
    if (f.part === 'down') return VEIL * smooth(0.55, 1, f.t / FLY.down);
    if (f.part === 'hold') return VEIL;
    if (f.part === 'in') return VEIL * (1 - smooth(0.5, 3.5, f.t));
    return 0;
  }

  // ── Sound ─────────────────────────────────────────────────────────────────
  const heard = { plane: null };
  sound.addLayer(planeSounds(heard));

  // ── Every frame ───────────────────────────────────────────────────────────
  // The flight first, so you're where the plane is when you're moved.
  game.addSystem({
    name: 'flight',
    phase: 'input',
    update({ dt, time }) {
      if (!trip) return;
      const f = trip.flight;
      const p = f.update(dt);
      if (!trip) return; // (landed this frame)
      trip.plane.place(p);
      trip.plane.run(dt, p, time);
      if (f.part === 'cruise' || f.part === 'down' || f.part === 'hold') {
        deckMid.x -= Math.sin(p.yaw) * FLY.drift * dt;
        deckMid.z -= Math.cos(p.yaw) * FLY.drift * dt;
      }
      if (f.part === 'hold' && !f.ready) f.ready = chunks.isFullyLoaded() && shown.has(trip.to.id);
    },
  });

  let lookIn = 0;
  let cued = false;
  const reached = new Set();
  game.addSystem({
    name: 'airports',
    phase: 'world',
    update({ dt, time }) {
      const at = game.focus;
      // looking for the airfields, a little at a time
      if (airports.queue.size) airports.pump(map.isOpen ? PUMP_MS[1] : PUMP_MS[0]);
      // what's stood up round you
      lookIn -= dt;
      if (lookIn <= 0) {
        lookIn = 0.5;
        for (const s of within(at.x - SHOW, at.z - SHOW, at.x + SHOW, at.z + SHOW)) if (Math.hypot(s.x - at.x, s.z - at.z) < SHOW) show(s);
        for (const e of shown.values()) {
          const mine = trip && (e.site === trip.from || e.site === trip.to);
          if (!mine && Math.hypot(e.site.x - at.x, e.site.z - at.z) > HIDE) hide(e);
        }
        wantRegions();
      }
      // night and day: the lights, the beacon, the windsock
      const night = SKY.uNight.value;
      lamps.color.setScalar(0.3 + 3 * night);
      planeGlow.color.setScalar(0.8 + 2.4 * night);
      const wind = SHARED.uWind.value;
      for (const e of shown.values()) {
        e.windows.visible = night > 0.3;
        const flash = night > 0.15 ? Math.floor(time / 1.6) % 2 : -1;
        e.beacon[0].visible = flash === 0;
        e.beacon[1].visible = flash === 1;
        e.sock.rotation.y = Math.atan2(WIND.x, WIND.z) - e.site.yaw + Math.sin(time * 1.3 + e.site.x) * 0.12 * wind;
        e.sock.rotation.x = Math.max(0, 1.25 - wind * 1.2) + Math.sin(time * 2.1) * 0.05;
        e.parked.run(dt, parkedPose(e.site), time);
      }
      if (showing()) {
        panelIn -= dt;
        if (panelIn <= 0) refreshPanel();
      }
      // the others, flying, aren't seen standing in the sky
      for (const [id] of flying) {
        const p = peers && peers.get(id);
        if (!p) flying.delete(id);
        else p.character.root.visible = p.flag.visible = false;
      }
      veil.style.opacity = whiteness().toFixed(3);
      heard.plane = trip ? trip.flight.pose : null;
      // coming to an airfield on foot
      if (!trip) {
        for (const s of within(at.x - ARRIVE, at.z - ARRIVE, at.x + ARRIVE, at.z + ARRIVE)) {
          if (reached.has(s.id) || Math.hypot(s.x - at.x, s.z - at.z) > ARRIVE) continue;
          reached.add(s.id);
          if (!game.marks || game.marks.tracked !== s.id) hud.flash(`${s.name} · ${input.isTouch ? 'the flights tab' : 'P'} for where to fly`, SAY);
        }
      }
      cue();
    },
  });

  // What P would do here, said in place of the tool's prompt.
  function cue() {
    let html = '';
    const K = input.isTouch ? '' : '<b>P</b> ';
    if (trip) {
      const f = trip.flight;
      const to = trip.to.name;
      const left = when(f.left);
      switch (f.part) {
        case 'out':
          html = f.phase === 'climb' ? `climbing out · to ${to}` : f.phase === 'roll' ? `taking off for ${to}` : `to ${to} · ${miles(trip.km)} · ${f.phase === 'taxi' || f.phase === 'lineup' ? 'taxiing out' : 'boarding'}`;
          break;
        case 'cruise':
          html = `over the clouds · ${to} in about ${left} · ${K}sleep through it`;
          break;
        case 'down':
        case 'hold':
          html = `down into the cloud · ${to}`;
          break;
        case 'in':
          html = f.phase === 'approach' ? `coming in to ${to}` : `${to} · ${f.phase === 'shutdown' ? 'the engines stop' : 'taxiing in'}`;
          break;
      }
    } else {
      const s = fieldHere();
      if (s && shown.has(s.id)) {
        const foot = doorFoot(parkedPose(s));
        if (Math.hypot(foot.x - player.pos.x, foot.z - player.pos.z) < BOARD_NEAR) html = `${K}fly from ${s.name}`;
      }
    }
    if (html) hud.cue({ html });
    else if (cued) hud.cue(null);
    cued = !!html;
  }

  // ── From the console ──────────────────────────────────────────────────────
  game.provide('airports', {
    airports,
    shown,
    get trip() {
      return trip ? { from: trip.from.id, to: trip.to.id, part: trip.flight.part, phase: trip.flight.phase, left: Math.round(trip.flight.left) } : null;
    },
    get flight() {
      return trip ? trip.flight : null;
    },
    // the cloud you're flying in or over: { at, cover, x, z }, or null
    get cloud() {
      return cloud();
    },
    // the airfields found so far, nearest first (`all`: find them all now)
    list(all = false) {
      if (all) for (const g of airports.regions) airports.site(g.id);
      const p = player.pos;
      return known()
        .map((s) => ({ id: s.id, name: s.name, region: s.region, for: forWhat(s), x: Math.round(s.x), z: Math.round(s.z), dist: Math.round(Math.hypot(s.x - p.x, s.z - p.z)) }))
        .sort((a, b) => a.dist - b.dist);
    },
    // to the airfield for where you are (or a region's, or one by id)
    go(which) {
      const g = which ? airports.region(which) : airports.regionAt(player.pos.x, player.pos.z);
      const site = g ? airports.site(g.id) : airports.byId(which);
      return goTo(site);
    },
    fly(id) {
      const site = airports.byId(id) || (airports.region(id) && airports.site(id));
      return site ? fly(site.id) : false;
    },
    hurry() {
      if (trip) trip.flight.hurry();
      return trip ? trip.flight.part : null;
    },
    // the foot of the steps up into the plane at the airfield you're at
    steps() {
      const s = fieldHere();
      if (!s) return null;
      const foot = doorFoot(parkedPose(s));
      return { x: foot.x, z: foot.z };
    },
    panel,
  });
}

// m:ss, or minutes, for a wait
function when(s) {
  const t = Math.max(0, Math.round(s));
  if (t >= 600) return `${Math.round(t / 60)} min`;
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

// How long a flight of so many real km takes, door to door (s), roughly.
const tripTime = (km) => 118 + cruiseFor(km);

// Real kilometres, the way you'd say them.
function miles(km) {
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${String(Math.round(km)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')} km`;
}

function compass(x, z, tx, tz) {
  const a = Math.atan2(tx - x, -(tz - z));
  return WAYS[((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8];
}

