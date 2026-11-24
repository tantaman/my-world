// The video store: Rewind Video, a big box of a shop with a car park out
// front, a walk out from where you first arrive, and its branches, one
// beside most of the villages people live in (branches.js). They're on the
// map, so `go here` sets you down on the pavement outside the doors; the
// nearest is the one that stands, and they're all the same shop. Inside
// are aisles and aisles of tapes, every one a film that never was
// (catalog.js), face out on the shelves in alphabetical order: new releases
// all along the back wall, a genre to each side of each aisle, staff picks
// on the ends.
//
// Look at a box and click, and it comes off the shelf: you hold it up and
// read the back. Take up to three; right-click puts the one in your hand
// back. Take them to the counter and click, and the clerk rings them up,
// with a receipt saying when they're due back. Walk out with them unrented
// and the security gate goes off. Bring them back to the slot in the
// counter, or the drop box outside, and if you're late, there are late fees
// (the clerk lets them slide).
//
//   site.js       where the stores are, grown from the seed and the land
//   branches.js   which villages have a branch, and finding where
//   floorplan.js  what's where inside: the shelving, its slots, the counter
//   catalog.js    the films, grown from the seed, and which slot each is in
//   covers.js     what a cover looks like, small for the shelves, big in hand
//   font.js       letters made of little squares, for the signs
//   store.js      what it all looks like, and what's solid
//   browse.js     what's in your hands, renting, returning, late fees
//   card.js       the box in your hands on the screen, and the receipt
//   sound.js      the music and the hum, the chime, the till, the gate
//
// Nothing about the forest changes for a store: see site.js. What you have
// out, what you've bought, your membership card and which branches you've
// been to are yours, saved; tapes from one branch go back at any.
//
// From the console:
//   world.videostore.site          the store you're at, or were last near
//   world.videostore.branches      the branches (forTown(town), byId(id))
//   await world.videostore.go(id?) stand outside the doors (there, or at the store with that id)
//   await world.videostore.enter() ...or just inside them
//   world.videostore.catalog       every film, and where it is
//   world.videostore.counter       what's in your hands, what you have out

import * as THREE from 'three';
import { findSite, clearOf, HALF_W, BACK, FRONT } from './site.js';
import { FACES, FACE_BY_ID, DOOR, CLERK, QUEUE, RETURN_SLOT, BOX, ROW, aim, slotAt } from './floorplan.js';
import { Catalog, STORE, STAFF } from './catalog.js';
import { Atlas } from './covers.js';
import { buildStore, makeHeldBox, DROP_BOX } from './store.js';
import { Counter, HANDS, termsOf, money, sameCopy, daysLate } from './browse.js';
import { Card, receiptHtml } from './card.js';
import { shopSounds } from './sound.js';
import { Body } from '../people/body.js';
import { onPlan, planDiscs, toWorld, toLocal } from '../world/frame.js';
import { VEG_STRIDE } from '../world/flora.js';
import { SKY } from '../render/uniforms.js';
import { rayBox, wrapAngle } from '../core/geom.js';
import { mulberry32 } from '../noise.js';
import { Branches, hasBranch } from './branches.js';
import * as pictures from './pictures.js';
import { GridNearest, ListNearest, MergeNearest } from '../core/nearest.js';
import { airfieldsOver } from '../airports/airports.js';

const BEEN_KEPT = 500; // branches you've been to, the most remembered
const NEAREST_AFTER = 0.5; // s between looks for the nearest store
const SWAP_NEARER = 120; // m nearer another store must be to take the place of one that's stood up
const PREFETCH = 2500; // m round you within which branches are looked for ahead of time
const SHOW = 430; // m: the store is stood up this close...
const HIDE = 560; // ...and taken down past this
const PREPARE = 700; // m: its covers start being painted this close, a slice a frame
const SLICE = 300; // covers painted a frame
const ARRIVE = 30; // m from the doors that counts as there
const REACH = 2.3; // m from you to a box you can take down
const AIM_FAR = 14; // m the crosshair looks along for a box
const DOORS = { near: 3.4, speed: 2.6, slide: 0.95 }; // m from them that they open; how fast; how far each slides (share of its width)
const CAM_IN = 3.4; // m: the camera comes in this close as you go in, to browse
const LIT = 0.62; // how much of its own colour the inside gives off, lit by its strip lights
const GREET_AGAIN = 90; // s before the clerk says hello again
const QUIET = 0.4; // how shut in you are, inside: the forest's sounds muffled
const TAPES_LISTED = 5; // rented tapes named one by one in your pack, before "and more"
const HUSH = 0.7; // ...and how much quieter the birds and the wind are in there
const NEON = { day: 1.0, night: 2.3 }; // the sign's brightness
const OVERHEAD = { day: 1.5, night: 5, range: 9, decay: 1.2, up: 2.4 }; // the light over you inside: how bright by day and by night, how far it reaches, how high (m)
// How far (m) plants of each kind are kept back from the slab.
const KEEP_BACK = { pine: 1.8, broad: 2, birch: 1.4, bush: 0.7, fern: 0.25, rock: 1.1, log: 2.4 };
const SCALED = { rock: true, log: true };
// a cassette, on the map's badge
const GLYPH = ['#######', '#.....#', '#.#.#.#', '#.....#', '#.###.#', '#######', '.......'];
const SAYS = {
  hello: ['Hi! Welcome to Rewind.', 'Hey, welcome in!', 'Welcome to Rewind Video!', 'Hi there! New releases are on the back wall.', 'Welcome in! Holler if you can’t find something.'],
  late: ['Evening! We close at midnight.', 'Hey, welcome in! Still plenty to choose from.'],
  back: ['Welcome back!', 'Oh hey, welcome back!'],
  thanks: ['Thanks! All checked in.', 'Got ’em. Thanks for bringing them back!', 'Thanks! Hope you liked them.'],
  alarm: ['Hey! You’ve gotta rent those first!', 'Whoa, those aren’t rented yet!'],
};

const _o = new THREE.Vector3();
const _d = new THREE.Vector3();
const _l = { x: 0, z: 0 };
const _r = { x: 0, z: 0 };
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const overlaps = (a, b) => a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];

// The features this uses, so it is installed after them (game/features.js):
// landmarks, towns, caves, railway, spaceport and airports for what the
// stores keep clear of (and towns for where the branches are and its clerk's
// body and voice; caves so the shop's quiet goes on after a cave's); pack to
// say what's yours; act, whose key (F) rents and returns at the counter.
export const after = ['render', 'ui', 'world', 'player', 'audio', 'build', 'map', 'landmarks', 'towns', 'caves', 'railway', 'spaceport', 'airports', 'pack', 'act'];
export function installVideostore(game) {
  const { scene, camera, gen, chunks, grass, solids, landforms, player, input, builder, map, hud, commands, save, sound, sky, landmarks, towns, caves, railway, spaceport, airports, pack, act } = game;

  // ── Where they are ────────────────────────────────────────────────────────
  // Rewind Video by the start, and its branches beside the villages
  // (branches.js), clear of everything there first, the airfields among it.
  const keepOff = clearOf({ landforms, sites: landmarks.sites, towns: towns.towns, caves, lines: railway.lines, spaceport: spaceport.sites });
  const home = findSite(gen, player.start, keepOff);
  const fields = airports.airports;
  // (asked about by the middle of the box, as it always has been: airports.js)
  const airfieldIn = airfieldsOver(fields, { wide: false });
  const onAirfield = (box) => airfieldIn.holds(...box);
  const branches = new Branches(gen, { towns: towns.towns, keepOff, also: (...box) => (home && overlaps(box, home.box)) || onAirfield(box) });
  // every store whose box overlaps a rectangle (wait = false: only those found already)
  const stores = (x0, z0, x1, z1, wait = true) => {
    const out = home && overlaps(home.box, [x0, z0, x1, z1]) ? [home] : [];
    return out.concat(branches.within(x0, z0, x1, z1, wait));
  };
  // The one you're at, or were last near: what's stood up and browsed.
  // Another takes its place when you come nearer that one, outside.
  let site = home;
  const ground = (x, z) => gen.height(x, z) + (chunks.heightOffset ? chunks.heightOffset(x, z) : 0);
  const local = (x, z, out = _l) => toLocal(site, x, z, out);

  // ── What's yours ──────────────────────────────────────────────────────────
  // visited: Rewind Video by the start; been: the branches you've been to
  const counter = new Counter();
  let visited = false;
  let been = [];
  let built = null; // buildStore's, and { clerk }, while it's stood up or ready to be
  let shown = false;
  save.register({
    id: 'videostore',
    scope: 'yours',
    local: 'marks',
    collect: () => ({ visited, been: [...been], ...counter.serialize() }),
    validate: (raw) => ({
      visited: !!(raw && raw.visited === true),
      been: raw && Array.isArray(raw.been) ? raw.been.filter((id) => typeof id === 'string').slice(0, BEEN_KEPT) : [],
      ...Counter.validate(raw),
    }),
    restore(r) {
      visited = r.visited;
      been = [...r.been];
      putBackAll();
      counter.load(r);
      if (built) rebuild();
    },
  });
  const beenTo = (s) => (s === home ? visited : been.includes(s.id));
  counter.on('change', () => save.touch());
  // In your pack, with what else is yours: your card, each tape you have out
  // and when it's due, and how many you've bought.
  pack.have(() => {
    const mine = [];
    const now = Date.now();
    if (counter.card) mine.push({ label: `a ${STORE.name} card`, note: `no. ${counter.card.number}`, icon: pictures.CARD });
    for (const o of counter.out.slice(0, TAPES_LISTED)) {
      const due = daysLate(o.due, now) ? 'overdue' : `due back ${new Date(o.due).toLocaleDateString(undefined, { weekday: 'long' })}`;
      mine.push({ label: o.title, note: `rented · ${due}`, icon: pictures.TAPE });
    }
    if (counter.out.length > TAPES_LISTED) mine.push({ label: 'more rented tapes', note: `${counter.out.length - TAPES_LISTED}`, icon: pictures.TAPE });
    if (counter.owned.length) mine.push({ label: 'tapes of your own', note: `${counter.owned.length}`, icon: pictures.TAPE });
    return mine;
  });

  // ── Materials ─────────────────────────────────────────────────────────────
  // The inside is lit by its strip lights: its surfaces give off a share of
  // their own colour, whatever the sun is doing.
  const lit = { value: LIT };
  const litFromWithin = (mat) => {
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uLit = lit;
      shader.fragmentShader = `uniform float uLit;\n${shader.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance += vColor.rgb * uLit;')}`;
    };
    mat.customProgramCacheKey = () => 'videostore-lit';
    return mat;
  };
  const materials = {
    outside: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0.02, side: THREE.DoubleSide }),
    inside: litFromWithin(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0, side: THREE.DoubleSide })),
    glow: new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }),
    neon: new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }),
    screen: new THREE.MeshBasicMaterial({ color: 0x406080, side: THREE.DoubleSide }),
    glass: new THREE.MeshStandardMaterial({ color: 0xa8d0e0, roughness: 0.08, metalness: 0.3, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide }),
    covers: null, // once the covers are painted
    carpet: textured(carpetTexture(), true),
  };
  function textured(tex, repeat = false) {
    if (repeat) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: new THREE.Color(1, 1, 1), emissiveIntensity: LIT, roughness: 0.6, metalness: 0, side: THREE.DoubleSide });
  }

  // ── The films ─────────────────────────────────────────────────────────────
  // Grown when first wanted, and their covers painted a slice a frame as you
  // come near.
  let catalog = null;
  const films = () => catalog || (catalog = new Catalog(gen.seed));
  const filmInSlot = (key) => films().slots.get(key);
  let atlas = null;
  let painted = 0;
  function paint() {
    const list = films().films;
    if (!atlas) atlas = new Atlas(list.length);
    atlas.paint(list, painted, painted + SLICE);
    painted = Math.min(list.length, painted + SLICE);
    if (painted >= list.length && !materials.covers) {
      const tex = new THREE.DataTexture(atlas.data, atlas.width, atlas.height, THREE.RGBAFormat);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.generateMipmaps = true;
      tex.needsUpdate = true;
      materials.covers = textured(tex);
    }
    return !!materials.covers;
  }
  const today = () => Math.floor((Date.now() - new Date().getTimezoneOffset() * 60000) / 86400000);
  let outDay = -1;
  let allOut = new Set();
  function soldOut() {
    const day = today();
    if (day !== outDay) {
      outDay = day;
      allOut = films().allOut(day);
    }
    return allOut;
  }

  const heard = { inside: 0, near: 0 };
  sound.addLayer(shopSounds(heard));
  const card = new Card();

  // The strip lights over you: the shop's surfaces light themselves, but
  // people in it (you, the clerk) need lighting too, or after dark they're
  // shadows. One light, over your head, in the scene from the start and only
  // turned up while you're inside, so going in never makes every material
  // recompile (as the headlamp does: caves/lamp.js).
  const overhead = new THREE.PointLight(0xfff4e0, 0, OVERHEAD.range, OVERHEAD.decay);
  overhead.castShadow = false;
  scene.add(overhead);

  // ── The forest round them ─────────────────────────────────────────────────
  chunks.on('vegetation', (ch) => {
    const S = chunks.size;
    const x0 = ch.cx * S;
    const z0 = ch.cz * S;
    for (const st of stores(x0 - 3, z0 - 3, x0 + S + 3, z0 + S + 3)) {
      for (const kind in ch.vegLists) {
        const list = ch.vegLists[kind];
        for (let o = 0, k = 0; o < list.length; o += VEG_STRIDE, k++) {
          const scale = list[o + 4];
          if (scale <= 0) continue;
          const back = (KEEP_BACK[kind] ?? 0.6) * (SCALED[kind] ? scale : 1);
          if (onPlan(st, list[o], list[o + 2], back, st.cleared)) chunks.hideInstance(ch, kind, k);
        }
      }
    }
  });
  grass.addClearing((x0, z0, x1, z1) => {
    const here = stores(x0, z0, x1, z1);
    return here.length ? (x, z) => here.some((st) => onPlan(st, x, z, 0.1, st.cleared)) : null;
  });
  // ── Building goes round them ──────────────────────────────────────────────
  const discs = new Map(); // store id -> discs over its slab and sides
  builder.obstacles.addSource((x, z, R, out) => {
    for (const st of stores(x - R - 1, z - R - 1, x + R + 1, z + R + 1)) {
      if (!discs.has(st.id)) discs.set(st.id, planDiscs({ ...st, plan: st.cleared }, 2));
      for (const d of discs.get(st.id)) {
        if (Math.hypot(d.x - x, d.z - z) > R + d.r + 1) continue;
        out.push({ x: d.x, z: d.z, what: 'the video store', dig: d.r + 0.3, wall: d.r + 0.2, footing: d.r + 0.5, roof: d.r, grown: true });
      }
    }
  }, { grown: true });
  // ── On the map ────────────────────────────────────────────────────────────
  // where one is is its doors: that's where `go here` and tracking it lead
  // (made once each, and again when you've been there)
  const places = new Map();
  function asPlace(st) {
    let p = places.get(st.id);
    if (p && p.visited === beenTo(st)) return p;
    const corners = ([x0, z0, x1, z1]) =>
      [
        [x0, z0],
        [x1, z0],
        [x1, z1],
        [x0, z1],
      ].map(([u, v]) => {
        const w = toWorld(st, u, v);
        return [w.x, w.z];
      });
    p = { id: st.id, x: st.door.x, z: st.door.z, yaw: st.door.yaw, name: st.name, kind: 'video store', note: 'browse the VHS and DVD shelves and rent a movie for the night', glyph: GLYPH, visited: beenTo(st), shape: [corners([-HALF_W - 0.25, BACK - 0.25, HALF_W + 0.25, FRONT])], ground: [corners(st.plan[0])] };
    places.set(st.id, p);
    return p;
  }
  map.places.addSource({
    within: (x0, z0, x1, z1) => stores(x0, z0, x1, z1, false).filter((st) => st.door.x >= x0 && st.door.x <= x1 && st.door.z >= z0 && st.door.z <= z1).map(asPlace),
    get(id) {
      if (!String(id).startsWith('videostore:')) return null;
      const st = home && id === home.id ? home : branches.byId(id);
      return st ? asPlace(st) : null;
    },
    // the one by the start, then a town at a time outward (a branch is in its town's square)
    list: 'video stores',
    nearest: (x, z) =>
      new MergeNearest([
        new ListNearest(x, z, home ? [asPlace(home)] : []),
        new GridNearest(x, z, {
          size: towns.towns.size,
          // (a town known not to have one has nothing)
          box(i, j) {
            const t = towns.towns.peek(i, j);
            return t === null || (t && !hasBranch(t, gen.seed)) ? null : undefined;
          },
          at(i, j) {
            const t = towns.towns.peek(i, j);
            const b = t && branches.peek(t);
            return t === undefined || b === undefined ? undefined : b ? [asPlace(b)] : [];
          },
        }),
      ]),
  });

  // ── Standing it up ────────────────────────────────────────────────────────
  function build() {
    built = buildStore(site, ground, { catalog: films(), atlas, hidden: counter.taken(filmInSlot), out: soldOut(), materials });
    built.clerk = makeClerk();
    built.object.add(built.clerk.body.mesh);
    built.object.add(marker);
  }
  function rebuild() {
    const was = shown;
    show(false);
    dispose();
    if (was) show(true);
  }
  function dispose() {
    if (!built) return;
    built.object.traverse((o) => o.isMesh && o.geometry.dispose());
    built.clerk.body.dispose();
    built = null;
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

  // The camera doesn't look through a wall or the ceiling.
  player.cameraBlockers.push((origin, dir, max) => {
    if (!shown) return Infinity;
    if (Math.hypot(origin.x - site.x, origin.z - site.z) > max + 30) return Infinity;
    let best = Infinity;
    for (const b of built.blockers) {
      const t = rayBox(origin, dir, b);
      if (t < best) best = t;
    }
    return best;
  });

  // ── The clerk ─────────────────────────────────────────────────────────────
  // Whoever's on shift: one of the staff, by the hour. They stand behind the
  // till in the shop's teal shirt, look up when you come near, wave when you
  // come in.
  function makeClerk() {
    const who = STAFF[Math.floor(((sky.hours + 2) % 24) / 6) % STAFF.length];
    const rnd = mulberry32(gen.seed + who.name.length * 7919);
    const c = (hex) => new THREE.Color(hex);
    const look = {
      her: rnd() < 0.5,
      child: false,
      dark: false,
      height: 0.95 + rnd() * 0.08,
      build: 0.95 + rnd() * 0.12,
      skin: c([0xe8c4a8, 0xc68c6c, 0x8a5a3c, 0xdcae90, 0x6a4430][Math.floor(rnd() * 5)]),
      hair: c([0x2a1c14, 0x6a4a2a, 0xb89a6a, 0x1a1a1a, 0x8a3a1a][Math.floor(rnd() * 5)]),
      shirt: c(0x19a89e),
      vest: null,
      legs: c(0xb8a478),
      dress: null,
      apron: false,
      coat: false,
      hat: 'none',
      hatColor: c(0x000000),
      beard: false,
    };
    const body = new Body(look, gen.seed);
    body.mesh.position.set(CLERK.x, 0, CLERK.z);
    body.mesh.rotation.y = -Math.PI / 2; // facing the shop (-x)
    return { who, body };
  }
  let lastHello = -Infinity;
  function say(line, wave = false) {
    const c = built && built.clerk;
    if (!c) return;
    hud.flash(`${c.who.name}: “${line}”`, 3400);
    const p = toWorld(site, CLERK.x, CLERK.z);
    sound.call('hello', p.x, site.top + 1.6, p.z, { pitch: c.body.look.her ? 1.25 : 0.9 });
    if (wave) c.body.waving = 1.8;
  }

  // ── In your hands ─────────────────────────────────────────────────────────
  const held = makeHeldBox(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 }));
  player.character.addRaised('vhs', held.object);
  let heldShown = -1;
  function handsChanged() {
    const list = counter.hands;
    const top = list.length ? films().byId(list[list.length - 1].id) : null;
    if (top && materials.covers && heldShown !== top.id) {
      held.mesh.material = materials.covers;
      held.show(top, atlas);
      heldShown = top.id;
    }
  }
  function putBackAll() {
    for (const h of counter.dropAll()) if (built) built.boxes.show(h.key, true);
  }
  counter.on('change', handsChanged);

  // ── What you're looking at ────────────────────────────────────────────────
  // A thin glowing frame round the box the crosshair is on: the hiker's head
  // is usually in front of it.
  const marker = new THREE.Group();
  {
    const mat = new THREE.MeshBasicMaterial({ color: 0xffe14a });
    const w = BOX.w + 0.035;
    const h = BOX.h + 0.035;
    const t = 0.014;
    for (const [x, y, sx, sy] of [
      [0, h / 2, w + t, t],
      [0, -h / 2, w + t, t],
      [w / 2, 0, t, h],
      [-w / 2, 0, t, h],
    ]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, t), mat);
      bar.position.set(x, y, 0.01);
      marker.add(bar);
    }
    marker.visible = false;
  }
  const _slot = {};
  function mark(a) {
    marker.visible = !!a;
    if (!a) return;
    slotAt(a.face, a.col, a.row, _slot);
    marker.position.set(_slot.x, _slot.y, _slot.z);
    marker.rotation.set(0, Math.atan2(a.face.nx, a.face.nz), 0);
    marker.rotateX(-0.12); // as the box leans back
  }

  // The crosshair's ray, into the store's frame, against the front of every
  // run of shelving: the nearest box it meets within your reach.
  function aimed() {
    camera.getWorldPosition(_o);
    camera.getWorldDirection(_d);
    const c = Math.cos(site.yaw);
    const n = Math.sin(site.yaw);
    const dx = _o.x - site.x;
    const dz = _o.z - site.z;
    const ox = dx * c - dz * n;
    const oz = dx * n + dz * c;
    const oy = _o.y - site.top;
    const vx = _d.x * c - _d.z * n;
    const vz = _d.x * n + _d.z * c;
    const vy = _d.y;
    const me = local(player.pos.x, player.pos.z, _r);
    let best = null;
    let far = AIM_FAR;
    for (const f of FACES) {
      const dn = vx * f.nx + vz * f.nz;
      if (dn > -1e-4) continue;
      const t = (0.02 - ((ox - f.x0) * f.nx + (oz - f.z0) * f.nz)) / dn;
      if (t <= 0 || t >= far) continue;
      const hx = ox + vx * t;
      const hy = oy + vy * t;
      const hz = oz + vz * t;
      const s = aim(f, hx, hy, hz);
      if (!s) continue;
      far = t;
      best = { face: f, col: s.col, row: s.row, x: hx, z: hz, y: hy };
    }
    if (!best || Math.hypot(best.x - me.x, best.z - me.z) > REACH) return null;
    const film = films().at(best.face.id, best.col, best.row);
    if (!film) return null;
    best.key = `${best.face.id}:${best.col}:${best.row}`;
    best.film = film;
    best.gone = soldOut().has(film.id);
    best.taken = counter.taken(filmInSlot).has(best.key);
    return best;
  }

  // ── Doing things ──────────────────────────────────────────────────────────
  const later = []; // [{ at, fn }]: things a moment from now, in game time
  let clock = 0;
  const soon = (s, fn) => later.push({ at: clock + s, fn });

  function take(a) {
    const r = counter.take(a.film, a.key);
    if (r === 'full') {
      hud.flash(`your hands are full: ${HANDS} at a time · right-click puts one back`, 2400);
      return false;
    }
    if (r !== 'ok') return false;
    built.boxes.show(a.key, false);
    sound.sfx('tape-take');
    return true;
  }
  function putBack() {
    const h = counter.putBack();
    if (!h) return false;
    if (built) built.boxes.show(h.key, true);
    sound.sfx('tape-back');
    heldShown = -1;
    handsChanged();
    return true;
  }
  function memberNumber() {
    const d = () => String(Math.floor(Math.random() * 10000)).padStart(4, '0');
    return `${d()} ${d()} ${d()}`;
  }
  function rent() {
    const n = counter.hands.length;
    const r = counter.checkout(Date.now(), (id) => films().byId(id), memberNumber());
    if (!r) return false;
    for (let i = 0; i < n; i++) soon(0.25 + i * 0.4, () => sound.sfx('scan'));
    soon(0.35 + n * 0.4, () => sound.sfx('till'));
    soon(0.5 + n * 0.4, () => card.receipt(receiptHtml(r, counter.card.number), 8000));
    const day = r.due && new Date(r.due).toLocaleDateString(undefined, { weekday: 'long' });
    const farewell = r.items.some((item) => item.format === 'VHS') ? 'Be kind, rewind!' : 'Enjoy the movie!';
    say(r.buy ? `That’s ${money(r.total)}. ${n === 1 ? 'It’s' : 'They’re'} yours to keep!` : `That’s ${money(r.total)}. Due back ${day} by midnight. ${farewell}`);
    return true;
  }
  function giveBack(atCounter) {
    const r = counter.returnAll(Date.now());
    if (!r) return false;
    r.items.forEach((item, i) => {
      soon(i * 0.35, () => sound.sfx('tape-drop'));
      if (built && sameCopy(filmInSlot(item.key), item)) built.boxes.show(item.key, true);
    });
    const late = r.items.filter((i) => i.late > 0);
    if (late.length) {
      const one = late[0];
      const line = `Ooh, “${one.title}” is ${one.late} ${one.late === 1 ? 'day' : 'days'} late${late.length > 1 ? `, and ${late.length - 1} more` : ''}. That’s ${money(r.fees)} in late fees… I’ll let it slide this once.`;
      if (atCounter) say(line);
      else hud.flash(`dropped ${r.items.length} in the returns · ${money(r.fees)} in late fees waiting for you inside`, 3600);
    } else if (atCounter) say(pick(SAYS.thanks));
    else hud.flash(`dropped ${r.items.length === 1 ? '1 movie' : `${r.items.length} movies`} in the returns · thanks!`, 2600);
    return true;
  }

  // ── Where you are ─────────────────────────────────────────────────────────
  const where = { inside: false, x: 0, z: 0 };
  function placeOf() {
    const p = player.pos;
    const l = local(p.x, p.z);
    where.x = l.x;
    where.z = l.z;
    where.inside = Math.abs(l.x) < HALF_W && l.z > BACK && l.z < FRONT && Math.abs(p.y - site.top) < 2.5;
    return where;
  }
  const atCounter = () => where.inside && where.x > QUEUE.x0 - 0.4 && where.x < QUEUE.x1 + 0.2 && where.z > QUEUE.z0 - 0.3 && where.z < QUEUE.z1 + 0.3;
  const atReturns = () => {
    if (where.inside) return Math.hypot(where.x - RETURN_SLOT.x, where.z - RETURN_SLOT.z - 0.6) < 1.6 || atCounter();
    return Math.hypot(where.x - DROP_BOX.x, where.z - DROP_BOX.z) < 1.7;
  };

  builder.idleWhile(() => where.inside && shown);
  commands.describe({ group: 'VIDEO STORE', help: 'click', pad: ['PadRT'], label: 'take a case off the shelf (three at a time) · rent at the counter' });
  commands.describe({ group: 'VIDEO STORE', help: 'right-click', pad: ['PadLT'], label: 'put the case in your hand back' });

  // Out of the shop, toDoor metres from its doors: the camera and the
  // forest's sounds as they were, and any tapes you haven't rented back on
  // the shelf: through the gate, with it going off; whisked off somewhere
  // else, quietly.
  function cameOut(toDoor) {
    if (camBefore !== null && Math.abs(player.camDist - CAM_IN) < 0.01) player.camDist = camBefore;
    camBefore = null;
    for (const [bus, level] of Object.entries(kept)) sound.volume(bus, level);
    hushed = 1;
    if (player.character.raised === 'vhs') player.character.raise(null);
    card.hide();
    if (!counter.hands.length) return;
    if (toDoor < 5) {
      sound.sfx('gate-alarm');
      soon(0.5, () => say(pick(SAYS.alarm)));
      soon(0.9, () => hud.flash('the movies go back on the shelf: rent them at the counter first', 3000));
    }
    putBackAll();
  }

  // ── Each frame ────────────────────────────────────────────────────────────
  let arrived = false;
  let wasInside = false;
  let doorsOpen = 0;
  let camBefore = null;
  let screenCut = 0;
  const kept = { ambience: 1, wildlife: 1 }; // their levels as you came in, to put back
  let hushed = 1;
  let lookIn = 0;
  // The nearest store found so far, and how far: the one by the start, or a
  // branch looked for round about.
  function nearest(p) {
    let best = home;
    let bd = home ? Math.hypot(home.x - p.x, home.z - p.z) : Infinity;
    for (const b of branches.sites.values()) {
      const d = b ? Math.hypot(b.x - p.x, b.z - p.z) : Infinity;
      if (d < bd) [best, bd] = [b, d];
    }
    return best && { site: best, d: bd };
  }
  // Another store takes this one's place: this one is taken down (and built
  // again if you come back).
  function moveTo(st) {
    show(false);
    dispose();
    site = st;
    arrived = false;
    doorsOpen = 0;
  }
  // Where the branches are further off is looked for a little at a time, out of
  // what the frame can spare (game/budget.ts).
  game.budget.add({ name: 'videostore', work: (ms) => branches.pump(ms) });
  game.addSystem({
    name: 'videostore',
    phase: 'world',
    update({ dt }) {
      const f = game.focus;
      // the branches round about looked for ahead of time, and, outside, the
      // nearest stood up in place of the last
      lookIn -= dt;
      if (lookIn <= 0) {
        lookIn = NEAREST_AFTER;
        branches.prefetch(f.x, f.z, PREFETCH);
        const n = !where.inside && nearest(f);
        const at = site ? Math.hypot(site.x - f.x, site.z - f.z) : Infinity;
        if (n && n.site !== site && (shown ? n.d < at - SWAP_NEARER : n.d < at)) moveTo(n.site);
      }
      if (!site) return;
      clock += dt;
      for (let i = later.length - 1; i >= 0; i--) {
        if (later[i].at <= clock) {
          const { fn } = later[i];
          later.splice(i, 1);
          fn();
        }
      }
      const d = Math.hypot(site.x - f.x, site.z - f.z);
      if (d < PREPARE && !materials.covers) paint();
      if (d < SHOW && materials.covers) show(true);
      else if (d > HIDE) show(false);
      if (!shown) {
        // (whisked away from inside, by the map, say)
        if (wasInside) cameOut(Infinity);
        where.inside = wasInside = false;
        heard.inside = heard.near = 0;
        overhead.intensity = 0;
        hud.cue(null, 'videostore');
        card.hide();
        return;
      }

      placeOf();
      const toDoor = Math.hypot(where.x, where.z - FRONT);
      if (!arrived && toDoor < ARRIVE && !where.inside) {
        arrived = true;
        hud.flash(`${site.name} · pick a VHS or DVD and rent it at the counter`, 4200);
        if (!beenTo(site)) {
          if (site === home) visited = true;
          else been = [site.id, ...been].slice(0, BEEN_KEPT);
          save.touch();
        }
      }
      if (toDoor > ARRIVE * 3) arrived = false;

      // the doors slide open as you come up to them
      const want = toDoor < DOORS.near && Math.abs(where.x) < DOOR.x1 + 1.5 ? 1 : 0;
      doorsOpen += Math.sign(want - doorsOpen) * Math.min(Math.abs(want - doorsOpen), DOORS.speed * dt);
      for (const door of built.doors) door.position.x = door.userData.shut + door.userData.side * doorsOpen * DOORS.slide * ((DOOR.x1 - DOOR.x0) / 2);

      // coming in, and going out
      if (where.inside && !wasInside) {
        sound.sfx('shop-chime');
        camBefore = player.camDist;
        player.camDist = Math.min(player.camDist, CAM_IN);
        if (clock - lastHello > GREET_AGAIN) {
          lastHello = clock;
          const night = sky.hours > 21 || sky.hours < 4;
          soon(0.7, () => say(counter.out.length ? pick(SAYS.back) : pick(night ? SAYS.late : SAYS.hello), true));
        }
        for (const bus of Object.keys(kept)) kept[bus] = sound.levels[bus] ?? 1;
      }
      if (!where.inside && wasInside) cameOut(toDoor);
      wasInside = where.inside;

      // what it sounds like: the music inside, and a little at the doors;
      // the forest's sounds hushed while you're in (after the caves' say,
      // this frame, how shut in you are)
      const inAmt = where.inside ? Math.min(1, (FRONT - where.z) / 2 + 0.4) : 0;
      heard.inside += (inAmt - heard.inside) * Math.min(1, dt * 3);
      heard.near = where.inside ? 0 : Math.max(0, 1 - toDoor / 20) * doorsOpen;
      if (heard.inside > 0.01) {
        sound.setEnclosed(Math.max(sound.enclosed || 0, QUIET * heard.inside));
        const hush = Math.round((1 - HUSH * heard.inside) * 50) / 50;
        if (where.inside && hush !== hushed) {
          hushed = hush;
          for (const [bus, level] of Object.entries(kept)) sound.volume(bus, level * hush);
        }
      }

      // the sign brighter after dark; the televisions playing; the light over you
      const night = SKY.uNight.value;
      overhead.intensity = heard.inside * (OVERHEAD.day + (OVERHEAD.night - OVERHEAD.day) * night);
      overhead.position.set(player.pos.x, site.top + OVERHEAD.up, player.pos.z);
      materials.neon.color.setScalar(NEON.day + (NEON.night - NEON.day) * Math.min(1, night * 1.6));
      screenCut -= dt;
      if (screenCut <= 0) {
        screenCut = 0.8 + Math.random() * 3;
        materials.screen.color.setHSL(Math.random(), 0.5 + Math.random() * 0.4, 0.35 + Math.random() * 0.35);
      }

      // the clerk looks up at you
      const c = built.clerk;
      const near = Math.hypot(where.x - CLERK.x, where.z - CLERK.z);
      const lookAt = near < 9 ? wrapAngle(Math.atan2(where.x - CLERK.x, where.z - CLERK.z) + Math.PI / 2) : null;
      c.body.pose(dt, 0, lookAt);

      // the box in your hands, held up to read
      const ch = player.character;
      const holding = counter.hands.length > 0 && where.inside;
      if (holding && ch.raised !== 'vhs' && !ch.raised) ch.raise('vhs');
      else if (!holding && ch.raised === 'vhs') ch.raise(null);

      browse();
    },
  });

  // What the crosshair is on, what a click would do, and doing it. Renting
  // at the counter and returning at the counter or the drop box are the act
  // key's (F): what's at hand, as everywhere.
  let deedHere = null; // { word, run }: what the act key would do here now
  act.offer({ id: 'videostore', at: () => (deedHere ? { d: 0.5, word: deedHere.word, run: deedHere.run, icon: pictures.TAPE } : null) });
  function browse() {
    if (!where.inside) mark(null);
    const n = counter.hands.length;
    let cue = null;
    let deed = null;
    let a = null;
    deedHere = null;
    const returning = counter.out.length > 0 && atReturns();
    if (where.inside) {
      a = aimed();
      mark(a && !a.taken ? a : null);
      if (a && !a.taken && !a.gone) {
        cue = `<b>click</b> take down <i>${esc(a.film.title)}</i> (${a.film.year}) · ${a.film.format}${n ? ` · ${n + 1} of ${HANDS}` : ''}`;
        deed = () => take(a);
      } else if (a && a.gone) {
        cue = `every ${a.film.format} copy of <i>${esc(a.film.title)}</i> is out · try again tomorrow`;
      } else if (n && atCounter()) {
        const total = counter.hands.reduce((s, h) => s + termsOf(films().byId(h.id) || { section: h.section }).price, 0);
        deedHere = { word: 'rent', run: rent };
        cue = `<b>${act.key('rent')}</b> ${n === 1 ? 'rent it' : `rent all ${n}`} · ${money(total)}`;
      } else if (returning) {
        deedHere = { word: 'return', run: () => giveBack(true) };
        cue = `<b>${act.key('return')}</b> return ${counter.out.length === 1 ? 'your movie' : `your ${counter.out.length} movies`}`;
      } else if (n) cue = `<b>right-click</b> put <i>${esc(films().byId(counter.hands[n - 1].id).title)}</i> back · rent at the counter`;
    } else if (returning) {
      mark(null);
      deedHere = { word: 'return', run: () => giveBack(false) };
      cue = `<b>${act.key('return')}</b> drop ${counter.out.length === 1 ? 'your movie' : `your ${counter.out.length} movies`} in the returns`;
    }
    hud.cue(cue ? { html: cue } : null, 'videostore');
    if (deed && input.tapped('use')) deed();
    else if (where.inside && n && input.tapped('alt')) putBack();

    // the card: the box on top of what you're holding
    if (where.inside && counter.hands.length) {
      const list = counter.hands.map((h) => films().byId(h.id)).filter(Boolean);
      const top = list[list.length - 1];
      const others = list.slice(0, -1).reverse();
      const hint = atCounter() ? 'the clerk will ring you up' : counter.hands.length >= HANDS ? 'your hands are full · put one back to take another' : 'take it to the counter to rent it';
      card.show(top, others, hint);
    } else card.hide();
  }

  // ── From the console ──────────────────────────────────────────────────────
  game.provide('videostore', {
    // the store you're at, or were last near; the one by the start; the
    // branches; and every store whose box overlaps a rectangle
    get site() {
      return site;
    },
    home,
    branches,
    stores,
    counter,
    card,
    get catalog() {
      return films();
    },
    get built() {
      return built;
    },
    get inside() {
      return where.inside;
    },
    get ready() {
      return shown;
    },
    // stand on the pavement outside the doors, facing them: this store's,
    // or the store's with that id
    async go(id) {
      const to = !id ? site : home && id === home.id ? home : branches.byId(id);
      if (!to) return null;
      if (to !== site) moveTo(to);
      await game.api.teleport(site.door.x, site.door.z, site.door.yaw);
      return { x: site.door.x, z: site.door.z };
    },
    // stand at the counter, facing the clerk
    toCounter() {
      if (!site || !shown) return null;
      const p = toWorld(site, QUEUE.x0 + 0.9, CLERK.z);
      const yaw = site.yaw + Math.PI / 2;
      player.spawn(p.x, p.z, yaw, yaw + Math.PI, site.top);
      return { x: p.x, z: p.z };
    },
    // ...or just inside them, facing the shop
    async enter() {
      if (!site) return null;
      const p = toWorld(site, 0, FRONT - 2.2);
      await game.api.teleport(p.x, p.z, site.yaw + Math.PI);
      return { x: p.x, z: p.z };
    },
    // stand in front of a slot and look at its box (face id, column, row)
    look(faceId, col, row) {
      const f = FACE_BY_ID.get(faceId);
      if (!f) return null;
      const along = (col + 0.5) * (f.len / f.cols);
      const sx = f.x0 + f.ux * along;
      const sz = f.z0 + f.uz * along;
      const at = toWorld(site, sx + f.nx * 1.1, sz + f.nz * 1.1);
      const yaw = site.yaw + Math.atan2(-f.nx, -f.nz);
      player.spawn(at.x, at.z, yaw, yaw + Math.PI);
      // the crosshair is on the hiker's head, and the ray from the camera
      // through it goes on 1.1 m to the shelf: tip it down (or up) to the box
      const y = f.y0 + (f.rows - 1 - row) * ROW + BOX.h / 2;
      player.camYaw = yaw + Math.PI;
      player.camDist = player.camDistSmooth = 1.6;
      player.camPitch = Math.atan2(player.eye - y, 1.1);
      return films().at(faceId, col, row);
    },
    aimed: () => (shown && where.inside ? aimed() : null),
    putBack,
    rent,
    giveBack: () => giveBack(true),
    allOut: () => [...soldOut()].map((id) => films().byId(id).title),
  });
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// The carpet: dark blue, with confetti on it in the shop's colours: a 1.2 m
// tile of it, drawn once.
function carpetTexture() {
  const N = 32;
  const data = new Uint8Array(N * N * 4);
  const rnd = mulberry32(0xca4e7);
  const base = [34, 38, 70];
  for (let i = 0; i < N * N; i++) {
    const k = 0.9 + rnd() * 0.2;
    data.set([base[0] * k, base[1] * k, base[2] * k, 255], i * 4);
  }
  const flecks = [
    [25, 170, 160],
    [214, 42, 122],
    [242, 194, 48],
    [140, 90, 210],
  ];
  for (let s = 0; s < 34; s++) {
    const c = flecks[s % flecks.length];
    let x = Math.floor(rnd() * N);
    let y = Math.floor(rnd() * N);
    const len = 2 + Math.floor(rnd() * 3);
    const dx = rnd() < 0.5 ? 1 : 0;
    for (let j = 0; j < len; j++) {
      data.set([...c, 255], (((y + N) % N) * N + ((x + N) % N)) * 4);
      x += dx;
      y += 1 - dx;
      if (rnd() < 0.4) x += rnd() < 0.5 ? 1 : -1;
    }
  }
  const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}
