// Boats: build a dugout canoe or a raft at the water's edge, push it off, and
// paddle it about the lakes and rivers and out to sea. Everything about them
// lives in this folder; this plugs them into the game.
//
//   kinds.js    the canoe and the raft: what they cost, how they carry you
//   boats.js    the boats where they were left, and how they're saved
//   shore.js    where one can be built, pushed off, rested, stepped out of
//   tool.js     the boat tool: build one, get in, break one up
//   paddle.js   the stroke, and when the blade goes in
//   models.js   the dugout, the raft, the paddle
//   others.js   other people out in boats
//   onMap.js    boats on the map
//   sound.js    a stroke, pushing off, lashing, climbing in
//
// In a boat it carries you (Player.carrier), with a keel that keeps it off
// the shallows; you sit in it (Character.seat) with the paddle, and the tools
// are put away (builder.idleWhile), all but those that work from a boat: a
// tool that says `afloat: true` (a fishing rod) can be taken up out on the
// water, and then you can only scull along slowly, one-handed.
//
// The boats are part of the world (the 'boats' domain), shared like the
// fires; which one you're in is yours ('aboard'), so you're back in it when
// you come back. Everyone here is told which boat you're in, and sees you in
// it (others.js).
//
// From the console:
//   world.boats.list()        where they are
//   world.boats.build('canoe') one at the nearest water's edge, built for you
//   world.boats.board()       into the nearest · world.boats.getOut()

import * as THREE from 'three';
import { BOATS, KINDS, SCULL } from './kinds.js';
import { Boats, boatsSave, hullOf, hullDistance } from './boats.js';
import { boatTool } from './tool.js';
import { makePaddle } from './models.js';
import { STROKE, CATCH, EXIT, passed } from './paddle.js';
import { floats, launch, rest, restHeight, site, stepOut } from './shore.js';
import { Paddlers } from './others.js';
import { boatLayer } from './onMap.js';
import './sound.js';
import { SEAT_HIPS } from '../player/character.js';
import { waterSample } from '../core/geom.js';
import { clamp } from '../noise.js';

const BOARD_REACH = 2.4; // m from a boat's hull you can climb in from
const LAUNCH_TIME = 1.1; // seconds to push a boat off the bank into the water
const SLIP = 4; // seconds: F again within this long slips you over the side
const SAY = 4600; // ms a sentence stays on the screen
// Taken further than this (m) in one frame (back to the start, say), you're
// out of the boat, and it's left where it was.
const JUMP = 6;
// How the paddle hangs in the hand when it isn't being worked: across the
// body, blade down beside the boat.
const PADDLE_HELD = { rest: -0.35, elbow: -0.9 };

const _w = waterSample();
const _v = new THREE.Vector3();

// The features this uses, so it is installed after them (game/features.js).
// And after hunting for its place on the tool bar (the boat tool comes after
// the rifle), and after mounts, whose word on what Z would do is said every
// frame, so that what F would do is said over it; and after act, whose key
// (F) gets you in and out.
export const after = ['render', 'ui', 'world', 'player', 'audio', 'build', 'map', 'save', 'splashes', 'hunting', 'mounts', 'act'];
export function installBoats(game) {
  const { scene, camera, chunks, solids, player, input, hud, commands, save, sound, builder, map, splashes, peers, act } = game;

  // ── The land and the water, as shore.js asks for them ─────────────────────
  const world = {
    ground: (x, z) => chunks.heightAt(x, z),
    depth: (x, z) => (chunks.waterAt(x, z, _w) ? Math.max(0, _w.depth) : 0),
    surface: (x, z) => (chunks.waterAt(x, z, _w) && _w.depth > 0 ? _w.level : null),
  };
  const trunkNear = (x, z, r) => {
    let hit = false;
    chunks.forEachCollider(x, z, (cx, cz, cr) => {
      if (Math.hypot(cx - x, cz - z) < cr + r) hit = true;
    });
    return hit;
  };

  const boats = new Boats({ scene, solids, world });

  // ── The tool, and what other work goes round ──────────────────────────────
  const tool = builder.register(boatTool({ boats, world, solids, board: (b) => board(b) }));
  builder.obstacles.addSource((x, z, R, out) => {
    for (const b of boats.list.values()) {
      const def = BOATS[b.kind];
      if (b.out || Math.hypot(b.x - x, b.z - z) > R + def.len) continue;
      const h = hullOf(b);
      for (let i = 0; i <= 2; i++) {
        const px = h.ax + ((h.bx - h.ax) * i) / 2;
        const pz = h.az + ((h.bz - h.az) * i) / 2;
        out.push({ x: px, z: pz, what: def.a, dig: h.r + 0.4, wall: h.r, footing: h.r + 0.5, roof: h.r });
      }
    }
  });
  // its key is wherever its slot is on the tool bar
  const toolKey = () => {
    const n = builder.slotOf(tool.id);
    return n <= 10 ? String(n % 10) : 'tool bar';
  };
  commands.describe({ group: 'BOATS', help: toolKey, label: 'the boat tool: at the water’s edge, hold click for a canoe, hold right-click for a raft' });

  // ── In a boat ─────────────────────────────────────────────────────────────
  player.character.addHeld('paddle', makePaddle(), PADDLE_HELD);
  let aboard = null; // { boat, def, launch: { from, to, t } | null }
  let stroke = null; // how far through a stroke the paddle was last frame
  let slipAt = -Infinity; // when you were told F again slips you over the side
  let time = 0;
  builder.idleWhile(() => aboard !== null && !(builder.current && builder.current.afloat));

  function board(b) {
    if (aboard) return false;
    const live = boats.get(b.id);
    if (!live || live.out) return false;
    if (player.carrier || player.aboard) {
      hud.flash('get down first: you can’t climb into a boat from here');
      return false;
    }
    const def = BOATS[live.kind];
    let to = null;
    if (!floats(world, def, live.x, live.z)) {
      to = launch(world, def, live.x, live.z, live.yaw);
      if (!to) {
        hud.flash(`the ${def.name} is too far from water deep enough to float it`, SAY);
        return false;
      }
    }
    boats.setOut(live, 'you');
    aboard = { boat: live, def, launch: null };
    player.carrier = { ...def.carrier };
    player.vel.set(0, 0, 0);
    player.yaw = live.yaw;
    player.grounded = true;
    player.character.seat(def.pose);
    player.pos.set(live.x, restHeight(world, def, live.x, live.z), live.z);
    if (to) {
      // pushed off, down the bank and out until it floats
      const from = { x: live.x, z: live.z, yaw: live.yaw };
      aboard.launch = { from, to, t: 0 };
      player.aboard = {
        place(out) {
          const k = clamp(aboard.launch.t / LAUNCH_TIME, 0, 1);
          const e = k * k * (3 - 2 * k);
          out.x = from.x + (to.x - from.x) * e;
          out.z = from.z + (to.z - from.z) * e;
          out.y = restHeight(world, def, out.x, out.z);
          out.yaw = from.yaw + Math.atan2(Math.sin(to.yaw - from.yaw), Math.cos(to.yaw - from.yaw)) * e;
        },
      };
      sound.sfx('launch');
    } else sound.sfx('board');
    hud.flash(`in the ${def.name} · W A S D to paddle, shift to paddle hard · F to get out`, SAY);
    save.touch();
    tell();
    return true;
  }

  // Out onto the bank, or over the side into the water if there's none in
  // reach (but only when asked twice).
  function getOut() {
    if (!aboard || aboard.launch) return false;
    const { boat, def } = aboard;
    const x = player.pos.x;
    const z = player.pos.z;
    const yaw = player.yaw;
    const spot = stepOut(world, def, x, z, yaw, (px, pz) => trunkNear(px, pz, 0.35));
    if (!spot && time - slipAt > SLIP) {
      slipAt = time;
      hud.flash('no bank within reach to step out onto · F again to slip over the side and swim', SAY);
      return false;
    }
    leave(x, z, yaw);
    const at = spot || { x: x + Math.sin(yaw + Math.PI / 2) * (def.beam / 2 + 0.7), z: z + Math.cos(yaw + Math.PI / 2) * (def.beam / 2 + 0.7) };
    player.pos.set(at.x, player.groundAt(at.x, at.z), at.z);
    player.vel.set(0, 0, 0);
    player.grounded = true;
    sound.sfx('board');
    if (!spot) hud.flash('over the side, into the water');
    return true;
  }

  // Out of it, and it left at (x, z) facing yaw.
  function leave(x, z, yaw) {
    const { boat } = aboard;
    aboard = null;
    stroke = null;
    player.aboard = null;
    player.carrier = null;
    const ch = player.character;
    ch.seat(null);
    if (ch.action && ch.action.kind === 'paddle') ch.stop();
    if (ch.tool === 'paddle') ch.setTool(null);
    boats.leave(boat, x, z, yaw);
    save.touch();
    tell();
  }

  // Each frame you're in it: it goes where you paddle it, and you sit in it.
  function carry(dt) {
    const a = aboard;
    const { boat, def } = a;
    const ch = player.character;
    if (!a.launch && Math.hypot(player.pos.x - boat.x, player.pos.z - boat.z) > JUMP) return leave(boat.x, boat.z, boat.yaw);
    let pitch = 0;
    if (a.launch) {
      a.launch.t += dt;
      pitch = rest(world, def, player.pos.x, player.pos.z, player.yaw).pitch * clamp(1 - a.launch.t / LAUNCH_TIME, 0, 1);
      if (a.launch.t >= LAUNCH_TIME) {
        a.launch = null;
        player.aboard = null;
        player.vel.set(0, 0, 0);
        splash(player.pos.x + Math.sin(player.yaw) * def.len * 0.4, player.pos.z + Math.cos(player.yaw) * def.len * 0.4, 40, 1.6);
      }
    }
    // the paddle in your hands, or something else (the rod): then you can
    // only scull yourself along, slowly
    const paddling = builder.idle;
    const c = player.carrier;
    const k = paddling ? 1 : SCULL;
    c.swim = def.carrier.swim * k;
    c.swimRun = def.carrier.swimRun * k;
    boat.x = player.pos.x;
    boat.z = player.pos.z;
    boat.yaw = player.yaw;
    boats.pose(boat, boat.mesh, player.pos.y, pitch, player.swimming && !a.launch);
    // sit in it
    ch.root.rotation.x = 0;
    _v.set(0, def.seat.y, def.seat.z).applyEuler(boat.mesh.rotation).add(boat.mesh.position);
    ch.root.position.set(_v.x, _v.y - SEAT_HIPS, _v.z);
    if (!paddling) {
      stroke = null;
      return;
    }
    if (ch.tool !== 'paddle') ch.setTool('paddle');
    if (!a.launch && player.manual) ch.play('paddle', input.running() ? STROKE.hard : STROKE.easy, true);
    else if (ch.action && ch.action.kind === 'paddle') ch.stop();
    // the blade going in, and coming out
    const act = ch.action;
    const p = act && act.kind === 'paddle' ? (act.t / act.dur) % 1 : null;
    if (p !== null && stroke !== null) {
      const hard = input.running() ? 1 : 0.5;
      if (passed(stroke, p, CATCH)) dip(14 + hard * 10, 0.9 + hard * 0.5, hard);
      if (passed(stroke, p, EXIT)) dip(8, 0.7, 0);
    }
    stroke = p;
  }

  // Water thrown up where the blade is.
  function dip(n, up, hard) {
    const blade = player.character.tools.paddle.object.getObjectByName('blade');
    blade.getWorldPosition(_v);
    if (!splash(_v.x, _v.z, n, up)) return;
    if (hard !== 0) sound.sfx('paddle', { size: hard });
  }

  function splash(x, z, n, up) {
    if (!chunks.waterAt(x, z, _w) || _w.depth <= 0) return false;
    splashes.burst(x, _w.level + 0.03, z, _w.level, n, { up, spread: 0.45, vx: player.vel.x * 0.3, vz: player.vel.z * 0.3 });
    return true;
  }

  // ── Getting in and out: the act key (F) ───────────────────────────────────
  const nearest = () => boats.near(player.pos.x, player.pos.z, BOARD_REACH);
  act.offer({
    id: 'boat',
    at() {
      if (aboard) return { d: 0, word: 'get out', run: getOut };
      if (player.carrier || player.aboard) return null;
      const b = nearest();
      return b ? { d: hullDistance(b, player.pos.x, player.pos.z), word: 'get in', run: () => board(b) } : null;
    },
  });
  commands.describe({ group: 'BOATS', help: 'F', label: 'get into the boat beside you · get out of it' });
  commands.describe({ group: 'BOATS', help: 'W A S D', label: 'in a boat: paddle (shift: paddle hard)' });

  // What F would do here, said in place of the tool's prompt (unless the tool
  // has something to say, or something under way: the rod, its float out).
  let cued = false;
  function cue() {
    const K = (w) => act.key(w);
    let html = '';
    if (aboard) {
      const out = K('get out');
      if (builder.idle) {
        if (aboard.launch) html = 'pushing off…';
        else if (!player.swimming) html = `aground: paddle out into deeper water · <b>${out}</b> get out`;
        else html = `<b>${out}</b> get out · <b>shift</b> paddle hard`;
      }
    } else if (!player.carrier && !player.aboard) {
      const b = nearest();
      if (b) {
        const go = K('get in');
        const t = builder.tgt;
        if (!t || (!t.prompt && !t.type)) html = `<b>${go}</b> get in the ${BOATS[b.kind].name}`;
      }
    }
    if (html) hud.cue({ html });
    else if (cued) hud.cue(null);
    cued = !!html;
  }

  // ── Everyone else here ────────────────────────────────────────────────────
  function tell() {
    save.say('boat', aboard ? { id: aboard.boat.id, kind: aboard.boat.kind } : { id: null });
  }
  if (peers) {
    const paddlers = new Paddlers({ scene, peers, boats, stand: (x, z, draft) => restHeight(world, { draft }, x, z) });
    save.on('message', (msg) => msg.ch === 'boat' && paddlers.hear(msg.from, msg.body));
    // someone new: tell them which boat you're in
    peers.on('change', () => aboard && tell());
    game.addSystem({ name: 'paddlers', phase: 'world', update: () => paddlers.update() });
  }

  // ── On the map ────────────────────────────────────────────────────────────
  map.addLayer(
    boatLayer(() => {
      const out = [];
      for (const b of boats.list.values()) {
        if (b.out && b.out !== 'you') continue;
        const yours = b.out === 'you';
        out.push({ kind: b.kind, x: yours ? player.pos.x : b.x, z: yours ? player.pos.z : b.z, label: `${yours ? 'your' : 'a'} ${BOATS[b.kind].name}` });
      }
      return out;
    }),
  );

  // ── Saving ────────────────────────────────────────────────────────────────
  // The boats are the world's: shared, and synced live. Which one you're in
  // is yours.
  save.register({ ...boatsSave, collect: () => boats.serialize(), restore: (data) => boats.load(data), adopt: (data) => boats.adopt(data) });
  boats.on('change', () => save.touch());
  let pending = null;
  save.register({
    id: 'aboard',
    scope: 'yours',
    collect: () => (aboard ? aboard.boat.id : null),
    validate: (raw) => (typeof raw === 'string' && raw ? raw : null),
    restore: (id) => (pending = id),
  });
  // Back in it where you left off: it's wherever you are.
  game.on('ready', () => {
    const b = pending && boats.get(pending);
    pending = null;
    if (!b || b.out) return;
    b.x = player.pos.x;
    b.z = player.pos.z;
    b.yaw = player.yaw;
    board(b);
  });

  // ── Every frame ───────────────────────────────────────────────────────────
  // After the player (update) has moved you: the boat comes along.
  game.addSystem({
    name: 'boats',
    phase: 'update',
    update({ dt }) {
      time += dt;
      if (aboard) carry(dt);
      boats.update(dt, camera.position);
      cue();
    },
  });

  // ── From the console (and the play-through) ───────────────────────────────
  game.provide('boats', {
    boats,
    tool,
    get aboard() {
      return aboard ? { id: aboard.boat.id, kind: aboard.boat.kind, launching: !!aboard.launch, afloat: player.swimming } : null;
    },
    list: () => [...boats.list.values()].map((b) => ({ id: b.id, kind: b.kind, x: Math.round(b.x * 10) / 10, z: Math.round(b.z * 10) / 10, out: b.out, afloat: b.afloat, dist: Math.round(hullDistance(b, player.pos.x, player.pos.z) * 10) / 10 })),
    // Somewhere a boat could be built near (x, z): the nearest spot at a
    // water's edge, looking out up to `reach` m. -> { x, z, yaw } or null
    shore(kind = 'canoe', { x = player.pos.x, z = player.pos.z, reach = 400 } = {}) {
      const def = BOATS[kind];
      for (let r = 0; r <= reach; r += 2) {
        const n = Math.max(1, Math.round((Math.PI * 2 * r) / 2));
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2;
          const px = Math.round((x + Math.cos(a) * r) * 2) / 2;
          const pz = Math.round((z + Math.sin(a) * r) * 2) / 2;
          const d = world.depth(px, pz);
          if (d > 0.3 || d === 0) continue;
          const s = site(world, def, px, pz);
          if (s.ok && !trunkNear(px, pz, def.len / 2 + 0.5)) return s;
        }
      }
      return null;
    },
    // one built for you at the nearest water's edge (or at a spot you give)
    build(kind = 'canoe', at = null) {
      if (!BOATS[kind]) return `boats: ${KINDS.join(' ')}`;
      const s = at || this.shore(kind);
      if (!s) return 'no water’s edge near enough';
      const b = boats.add(kind, s.x, s.z, s.yaw);
      return { id: b.id, kind, x: b.x, z: b.z };
    },
    board(id = null) {
      const b = id ? boats.get(id) : nearest();
      return b ? board(b) : false;
    },
    getOut,
  });
}
