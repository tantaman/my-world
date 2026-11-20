// Mounts: a horse, a turtle and an eagle, living wild somewhere in every
// world. You don't start with one. Word comes of where to look (a circle on
// the map, a call from far off, signs once you're close); walk up to one
// quietly and hold Z beside it until it trusts you; then it's yours to ride,
// and to whistle for wherever you are.
//
//   haunts.js   where each lives, grown from the seed; the circles on the map
//   hints.js    what you know of where they are, and when you hear more
//   taming.js   winning a wild one over
//   kinds.js    the three of them: temperaments, how they carry you, words
//   mount.js    one mount: wild, tame or ridden
//   bodies.js   what they look like and how they move
//   onMap.js    how they show on the map
//   sound.js    whinny, splash, scream, wingbeat; your whistle
//   others.js   what other people here are riding
//
// Riding, the mount carries you (Player.carrier), you sit astride it
// (Character.seat), and the tools are put away (builder.idleWhile).
//
// Which ones are yours, where you left them and what you've heard is yours,
// not the world's (the 'mounts' domain): in a shared world each person finds
// and tames their own, as they meet their own wildlife. What you're riding
// is passed on as you ride, so they see you on it.
//
// From the console:
//   world.mounts.list()          where they are and how they're doing
//   world.mounts.tame('horse')   skip the finding and the taming

import * as THREE from 'three';
import { MOUNTS, REACH, NEAR, COME } from './kinds.js';
import { KINDS, STAGE, findHaunts, bearing } from './haunts.js';
import { Hints } from './hints.js';
import { Mount } from './mount.js';
import { BODIES } from './bodies.js';
import { mountLayer } from './onMap.js';
import { Riders } from './others.js';
import './sound.js';
import { standHeight } from '../player/player.js';
import { SEAT_HIPS } from '../player/character.js';
import { segDist, waterSample, rand } from '../core/geom.js';
import { clamp } from '../noise.js';

// A wild one is about (and drawn) while you're within this many metres of it.
const PRESENT = 260;
// You've seen it if it's in view this close (m), or this close whatever (m).
const SIGHT = 70;
const FELT = 30;
// A wild one's call carries word of it while you're within this (m) of it,
// every so often (s).
const HEARD_FROM = 450;
const HEARD_EVERY = [45, 90];
// How long (ms) a sentence stays on the screen.
const SAY = 5200;
// A second press of Z within this long (s) of a whistle calls the next one instead.
const NEXT_CALL = 4;
// While you fly, how often (s) everyone here is told how high you are.
const TELL_EVERY = 0.25;

const _v = new THREE.Vector3();
const _o = new THREE.Vector3();
const _w = waterSample();
const _seg = { d: 0, nx: 0, nz: 0, t: 0 };
const _sphere = new THREE.Sphere();
const _pm = new THREE.Matrix4();

// The features this uses, so it is installed after them (game/features.js).
export const after = ['render', 'ui', 'world', 'player', 'audio', 'build', 'map', 'save', 'splashes'];
export function installMounts(game) {
  const { scene, camera, gen, chunks, solids, player, input, hud, commands, save, sound, builder, map, splashes, peers } = game;

  // ── Where they live, and what you know of it ──────────────────────────────
  const start = player.start;
  const haunts = findHaunts(gen, start);
  const mounts = {};
  for (const kind of KINDS) if (haunts[kind]) mounts[kind] = new Mount({ kind, def: MOUNTS[kind], haunt: haunts[kind], Body: BODIES[kind] });
  const all = Object.values(mounts);
  const hints = new Hints({ haunts, seed: gen.seed, start });

  // ── What a mount may ask of the world (see mount.js) ──────────────────────
  const frustum = new THREE.Frustum();
  const water = (x, z) => (chunks.waterAt(x, z, _w) ? Math.max(0, _w.depth) : 0);
  const trunkNear = (x, z, r) => {
    let hit = false;
    chunks.forEachCollider(x, z, (cx, cz, cr) => {
      if (Math.hypot(cx - x, cz - z) < cr + r) hit = true;
    });
    return hit;
  };
  const ctx = {
    ground: (x, z) => chunks.heightAt(x, z),
    stand: (x, z, depth) => standHeight(chunks, x, z, depth),
    water,
    pushOut(m, r) {
      chunks.forEachCollider(m.x, m.z, (cx, cz, cr) => {
        const dx = m.x - cx;
        const dz = m.z - cz;
        const d = Math.hypot(dx, dz);
        const min = cr + r;
        if (d < min && d > 1e-5) {
          m.x += (dx / d) * (min - d);
          m.z += (dz / d) * (min - d);
        }
      });
      if (!solids) return;
      solids.forEachNear(m.x, m.z, r + 1, (s) => {
        segDist(m.x, m.z, s.ax, s.az, s.bx, s.bz, _seg);
        const min = s.r + r;
        if (_seg.d >= min) return;
        const top = s.topA + (s.topB - s.topA) * _seg.t;
        if (top - chunks.heightAt(m.x, m.z) < 0.3) return; // low enough to step over
        m.x += _seg.nx * (min - _seg.d);
        m.z += _seg.nz * (min - _seg.d);
      });
    },
    inView(x, y, z, r = 1) {
      _sphere.center.set(x, y + r * 0.5, z);
      _sphere.radius = r;
      return frustum.intersectsSphere(_sphere);
    },
    // Somewhere out of sight round (x, z) that suits it. -> { x, z } or null
    place(kind, x, z, minD, maxD) {
      let fallback = null;
      for (let i = 0; i < 24; i++) {
        const a = Math.random() * Math.PI * 2;
        const d = rand(minD, maxD);
        const px = x + Math.sin(a) * d;
        const pz = z + Math.cos(a) * d;
        const w = water(px, pz);
        if (kind === 'turtle' ? w < 0.9 : w > 0.3) continue;
        if (kind !== 'eagle' && trunkNear(px, pz, 1.2)) continue;
        if (gen.padClearance(px, pz) < 2) continue;
        fallback = fallback || { x: px, z: pz };
        if (!ctx.inView(px, chunks.heightAt(px, pz), pz, 2.5)) return { x: px, z: pz };
      }
      return fallback;
    },
    // Water deep enough to swim in, near (x, z): the nearest. -> { x, z } or null
    waterNear(x, z, reach = 30) {
      for (let r = 0; r <= reach; r += 2) {
        const n = Math.max(1, Math.round((r * Math.PI * 2) / 3));
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2;
          const px = x + Math.cos(a) * r;
          const pz = z + Math.sin(a) * r;
          if (water(px, pz) > 0.9) return { x: px, z: pz };
        }
      }
      return null;
    },
  };

  // What you sound like to a mount: where you are, how fast you're going,
  // and whether your hand is out to it.
  const youFor = (m, holding) => {
    const p = player.pos;
    return { x: p.x, z: p.z, d: Math.hypot(m.x - p.x, m.z - p.z), speed: Math.hypot(player.vel.x, player.vel.z), holding };
  };

  // Hooves, feet, strokes and wingbeats.
  const stepSound = (m) => (x, y, z, what) => {
    if (what === 'wing') return sound.call('wingbeat', x, y, z);
    if (chunks.waterAt(x, z, _w) && _w.depth > 0.05) {
      const n = Math.round(clamp(m.speed * 3, 4, 26));
      splashes.burst(x, _w.level + 0.03, z, _w.level, n, { up: 1.2 + m.speed * 0.25, spread: 0.7 + m.speed * 0.08, vx: Math.sin(m.yaw) * m.speed * 0.4, vz: Math.cos(m.yaw) * m.speed * 0.4 });
      if (m.riding) sound.footstep('water', clamp(m.speed / 8, 0.2, 1), m.swimming ? 'swim' : 'step', _w.depth);
      return;
    }
    if (m.kind === 'horse') sound.call('hoof', x, y, z, { size: clamp(m.speed / 7, 0.4, 1) });
    else sound.call('thump', x, y, z, { size: 0.35 });
  };

  // ── Riding ────────────────────────────────────────────────────────────────
  let riding = null; // the mount carrying you
  let last = null; // the kind you rode last
  builder.idleWhile(() => riding !== null);

  function ride(m) {
    if (!m.body) m.show(scene, ctx).onStep = stepSound(m);
    riding = m;
    m.riding = true;
    const c = m.def.carrier;
    player.carrier = { ...c, fly: c.fly ? { ...c.fly } : null, landing: false };
    player.pos.set(m.x, m.y, m.z);
    player.vel.set(0, 0, 0);
    player.yaw = m.yaw;
    player.grounded = !m.flying;
    player.character.seat(m.body.seat);
    last = m.kind;
    if (m.kind === 'horse') sound.call('nicker', m.x, m.y + 1.5, m.z);
    hud.flash(`on your ${m.def.name} · ${m.def.keys.replace(/<\/?b>/g, '')}`, SAY);
    save.touch();
    tell();
  }

  function getOff() {
    const m = riding;
    if (!m) return;
    // step down on its left, or wherever there's room
    const yaw = m.yaw;
    let spot = null;
    for (const a of [Math.PI / 2, -Math.PI / 2, Math.PI, 0]) {
      const r = m.body ? m.body.radius + 0.2 : 1.2;
      const x = m.x + Math.sin(yaw + a) * r;
      const z = m.z + Math.cos(yaw + a) * r;
      if (!trunkNear(x, z, 0.35)) {
        spot = { x, z };
        break;
      }
    }
    spot = spot || { x: m.x, z: m.z };
    riding = null;
    m.riding = false;
    player.carrier = null;
    player.flying = false;
    player.character.seat(null);
    player.pos.set(spot.x, player.groundAt(spot.x, spot.z), spot.z);
    player.vel.set(0, 0, 0);
    player.grounded = true;
    m.flying = false;
    m.speed = 0;
    m.settle(ctx);
    m.rest();
    save.touch();
    tell();
  }

  // Each frame you ride: it goes where you go, and you sit on its back.
  function carry(dt) {
    const m = riding;
    const c = player.carrier;
    if (c.landing && player.grounded) {
      getOff();
      return;
    }
    m.x = player.pos.x;
    m.y = player.pos.y;
    m.z = player.pos.z;
    m.yaw = player.yaw;
    m.speed = Math.hypot(player.vel.x, player.vel.z);
    m.turn = player.turnRate;
    m.vy = player.vel.y;
    m.grounded = player.grounded;
    m.flying = player.flying;
    m.climbing = player.climbing;
    m.swimming = player.swimming;
    m.graze = 0;
    m.alert = 0;
    m.look = 0;
    m.shy = false;
    m.pose(dt, ctx);
    const root = player.character.root;
    root.rotation.x = m.body.tilt * 0.8;
    m.body.saddle(_v);
    _o.set(0, SEAT_HIPS, 0).applyEuler(root.rotation);
    root.position.copy(_v).sub(_o);
  }

  // ── Z: calm, ride, get off, whistle ───────────────────────────────────────
  let held = false; // Z is down this frame (the touch button: touchHeld)
  let calling = null; // { kind, t } the one you last whistled for
  let time = 0;

  // ── Everyone else here ────────────────────────────────────────────────────
  // They're told what you're riding (and how high you are, flying), and you
  // see what they're riding.
  let toldAt = 0;
  let toldFlying = false;
  function tell() {
    const kind = riding ? riding.kind : null;
    toldAt = time;
    toldFlying = !!kind && player.flying;
    save.say('mount', toldFlying ? { kind, y: Math.round(player.pos.y * 10) / 10 } : { kind });
  }
  if (peers) {
    const riders = new Riders({ scene, peers, stand: ctx.stand, water });
    save.on('message', (msg) => msg.ch === 'mount' && riders.hear(msg.from, msg.body));
    // someone new: tell them what you're on
    peers.on('change', () => riding && tell());
    game.addSystem({ name: 'riders', phase: 'world', update: ({ dt }) => riders.update(dt) });
  }

  const tameOnes = () => all.filter((m) => m.tame);
  const nearest = (list, within) => {
    let best = null;
    let bd = within;
    for (const m of list) {
      const d = Math.hypot(m.x - player.pos.x, m.z - player.pos.z);
      if (d < bd) {
        bd = d;
        best = m;
      }
    }
    return best;
  };
  // the wild one your hand would be out to, if any
  const wildInReach = () => {
    let best = null;
    for (const m of all) {
      if (m.tame || !m.body) continue;
      const d = Math.hypot(m.x - player.pos.x, m.z - player.pos.z);
      if (d < m.def.taming.reach + 1.5 && (!best || d < best.d)) best = { m, d };
    }
    return best ? best.m : null;
  };

  function press() {
    if (riding) {
      if (player.flying) {
        player.carrier.landing = true;
        hud.flash('coming in to land');
      } else getOff();
      return;
    }
    const mine = nearest(tameOnes(), REACH + 0.6);
    if (mine) return ride(mine);
    if (wildInReach()) return; // hold to calm it
    if (tameOnes().length) return whistle();
    tellWhereToLook();
  }

  // Which of yours to call: the next one if you've just called, else the
  // turtle if you're by water, else the one you rode last.
  function choose() {
    const mine = tameOnes();
    if (calling && time - calling.t < NEXT_CALL) {
      const i = mine.findIndex((m) => m.kind === calling.kind);
      return mine[(i + 1) % mine.length];
    }
    const wet = ctx.waterNear(player.pos.x, player.pos.z, 10);
    const turtle = mine.find((m) => m.kind === 'turtle');
    if (wet && turtle) return turtle;
    const dry = mine.filter((m) => m.kind !== 'turtle');
    return dry.find((m) => m.kind === last) || dry[0] || mine[0];
  }

  function whistle() {
    const m = choose();
    sound.sfx('whistle');
    const you = youFor(m, false);
    const others = tameOnes().length > 1;
    const next = others ? ` · Z again for another` : '';
    calling = { kind: m.kind, t: time };
    if (!m.call(you, ctx)) {
      hud.flash(`you whistle, but your turtle can't reach you here: it needs water to swim to you${next}`, SAY);
      return;
    }
    // from far off, it turns up out of sight and comes the rest of the way
    if (you.d > COME || !m.body) {
      const goal = m.goal || you;
      const p = m.kind === 'turtle' ? ctx.place('turtle', goal.x, goal.z, 8, 25) || goal : ctx.place(m.kind, you.x, you.z, m.kind === 'eagle' ? 50 : 30, m.kind === 'eagle' ? 70 : 45);
      if (p) {
        m.moveTo(p.x, p.z, ctx, Math.atan2(you.x - p.x, you.z - p.z));
        if (m.kind === 'eagle') {
          m.y += 25;
          m.flying = true;
          m.grounded = false;
        }
        if (!m.body) m.show(scene, ctx).onStep = stepSound(m);
      }
    }
    m.arrived = false;
    hud.flash(`you whistle for your ${m.def.name}${next}`, 2400);
  }

  function tellWhereToLook() {
    let kind = hints.order.find((k) => hints.stage[k] > STAGE.NONE && hints.stage[k] < STAGE.SEEN && !mounts[k].tame);
    if (!kind) kind = hints.rumour();
    if (!kind) kind = hints.order.find((k) => !mounts[k].tame);
    if (!kind) return;
    say(kind, hints.stage[kind], true);
  }

  // The news about one, on the screen: now if you asked, or else as soon as
  // the screen isn't saying something else.
  const news = [];
  function say(kind, stage, now = false) {
    const d = MOUNTS[kind];
    const m = mounts[kind];
    let text;
    const far = Math.hypot(m.x - player.pos.x, m.z - player.pos.z) > 40;
    if (stage === STAGE.SEEN && now && far) text = `you saw ${d.wild} ${bearing(player.pos.x, player.pos.z, m.x, m.z).words} · it's on your map (M)`;
    else if (stage === STAGE.SEEN) text = `${d.seen} · ${d.howTo} Z beside it`;
    else if (stage === STAGE.SIGNS) text = `${d.signs} · the map (M) narrows it down`;
    else {
      const a = hints.area(kind) || m.haunt;
      text = `word is ${d.rumour}, ${bearing(player.pos.x, player.pos.z, a.x, a.z).words} · it's on your map (M)`;
    }
    if (now) hud.flash(text, SAY);
    else news.push(text);
    save.touch();
  }

  commands.add({
    id: 'mount',
    keys: ['KeyZ'],
    group: 'WANDER',
    help: 'Z',
    label: 'ride · get off · whistle for yours · hold to calm a wild one',
    run: press,
    hold: () => (held = true),
  });

  // On a touch screen, a button for it, named for what it would do.
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.id = 'act-mount';
  btn.hidden = true;
  btn.textContent = 'ride';
  let touchHeld = false;
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    touchHeld = true;
    press();
  });
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) btn.addEventListener(ev, () => (touchHeld = false));
  document.getElementById('touch-act')?.prepend(btn);

  // ── On the map ────────────────────────────────────────────────────────────
  map.addLayer(
    mountLayer(() => {
      const out = [];
      for (const kind of hints.order) {
        const m = mounts[kind];
        const d = MOUNTS[kind];
        if (m.tame) {
          if (!m.riding) out.push({ kind, colour: d.colour, at: { x: m.x, z: m.z }, label: `your ${d.name}` });
        } else if (hints.stage[kind] === STAGE.SEEN) out.push({ kind, colour: d.colour, at: { x: m.x, z: m.z }, label: d.wild });
        else {
          const area = hints.area(kind);
          if (area) out.push({ kind, colour: d.colour, area, label: `${d.wild}, somewhere here` });
        }
      }
      return out;
    }),
  );

  // ── Saving ────────────────────────────────────────────────────────────────
  // { known: { horse: 0..3, … }, tame: { horse: { x, z, yaw }, … }, riding, last }
  let ridePending = null;
  const where = (m) => ({ x: Math.round(m.x * 100) / 100, z: Math.round(m.z * 100) / 100, yaw: Math.round(m.yaw * 1000) / 1000 });
  save.register({
    id: 'mounts',
    scope: 'yours',
    collect: () => ({
      known: hints.save(),
      tame: Object.fromEntries(tameOnes().map((m) => [m.kind, where(m)])),
      riding: riding ? riding.kind : null,
      last,
    }),
    validate(raw) {
      const r = raw && typeof raw === 'object' ? raw : {};
      const tame = {};
      for (const k of KINDS) {
        const t = r.tame && r.tame[k];
        if (t && Number.isFinite(t.x) && Number.isFinite(t.z)) tame[k] = { x: t.x, z: t.z, yaw: Number.isFinite(t.yaw) ? t.yaw : 0 };
      }
      const kind = (v) => (KINDS.includes(v) ? v : null);
      return { known: r.known && typeof r.known === 'object' ? r.known : {}, tame, riding: kind(r.riding), last: kind(r.last) };
    },
    restore(data) {
      hints.load(data.known);
      for (const m of all) {
        const t = data.tame[m.kind];
        if (!t) continue;
        m.tame = true;
        m.taming.trust = 1;
        hints.won(m.kind);
        m.x = t.x;
        m.z = t.z;
        m.yaw = t.yaw;
        m.placed = false;
        m.home = { x: t.x, z: t.z, r: 4 };
        m.set(m.kind === 'horse' ? 'graze' : m.kind === 'turtle' ? 'bask' : 'perch', 10);
      }
      last = data.last;
      ridePending = data.riding && mounts[data.riding] && mounts[data.riding].tame ? data.riding : null;
    },
  });
  // Back on it where you left off: it's wherever you are.
  game.on('ready', () => {
    if (!ridePending) return;
    const m = mounts[ridePending];
    ridePending = null;
    m.moveTo(player.pos.x, player.pos.z, ctx, player.yaw);
    ride(m);
  });

  // ── Every frame ───────────────────────────────────────────────────────────
  const heardAt = Object.fromEntries(KINDS.map((k) => [k, rand(...HEARD_EVERY) * 0.5]));
  const seen = (kind) => {
    const m = mounts[kind];
    if (!m.body) return false;
    const d = Math.hypot(m.x - player.pos.x, m.z - player.pos.z);
    return d < FELT || (d < SIGHT && ctx.inView(m.x, m.y, m.z, 1.5));
  };
  game.addSystem({
    name: 'mounts',
    phase: 'update',
    update({ dt }) {
      time += dt;
      const hand = held || touchHeld;
      held = false;
      camera.updateMatrixWorld();
      _pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      frustum.setFromProjectionMatrix(_pm);

      // what you've found out
      for (const n of hints.update(dt, player.pos, seen)) say(n.kind, n.stage);

      const target = riding ? null : wildInReach();
      for (const m of all) {
        const d = Math.hypot(m.x - player.pos.x, m.z - player.pos.z);
        const want = m.riding || (m.tame ? d < NEAR : d < PRESENT) || m.mode === 'come';
        if (want && !m.body) m.show(scene, ctx).onStep = stepSound(m);
        else if (!want && m.body) m.hide(scene);
        if (m.riding || !m.body) continue;
        const was = m.taming.mood;
        m.update(dt, ctx, youFor(m, hand && m === target));
        if (!m.tame && m.taming.mood === 'bolt' && was !== 'bolt') {
          if (m.kind === 'horse') sound.call('snort', m.x, m.y + 1.5, m.z);
          if (m.kind === 'turtle') sound.call('plunge', m.x, m.y, m.z);
          if (m.kind === 'eagle') sound.call('eagle', m.x, m.y + 1, m.z);
        }
        if (!m.tame && m.taming.trust >= 1) won(m);
        if (m.tame && m.arrived) {
          m.arrived = false;
          if (calling && calling.kind === m.kind) {
            hud.flash(`your ${m.def.name} is here · Z to get on`, 2400);
            if (m.kind === 'horse') sound.call('nicker', m.x, m.y + 1.5, m.z);
            calling = null;
          }
          save.touch();
        }
      }
      // reaching out to it
      if (target && hand) player.character.play('reach', 1, true);
      if (riding) carry(dt);
      if (riding && (player.flying ? time - toldAt > TELL_EVERY : toldFlying)) tell();

      // calls from far off, while you're still looking
      for (const m of all) {
        const st = hints.stage[m.kind];
        if (m.tame || st === STAGE.NONE || st === STAGE.SEEN) continue;
        heardAt[m.kind] -= dt;
        if (heardAt[m.kind] > 0) continue;
        heardAt[m.kind] = rand(...HEARD_EVERY);
        const d = Math.hypot(m.x - player.pos.x, m.z - player.pos.z);
        if (d > HEARD_FROM) continue;
        sound.call(m.def.call, m.x, m.y + (m.kind === 'eagle' ? 20 : 1), m.z);
        news.push(`${m.def.heard}, off to the ${bearing(player.pos.x, player.pos.z, m.x, m.z).way}`);
      }
      if (news.length && !hud.showing) hud.flash(news.shift(), SAY);

      cue(target);
    },
  });

  function won(m) {
    m.tame = true;
    m.taming.trust = 1;
    m.rest();
    hints.won(m.kind);
    last = last || m.kind;
    if (m.kind === 'horse') sound.call('nicker', m.x, m.y + 1.5, m.z);
    if (m.kind === 'eagle') sound.call('eagle', m.x, m.y + 1, m.z, { gain: 0.5 });
    hud.flash(`the ${m.def.name} trusts you: it's yours · Z to get on, and Z to whistle for it from anywhere`, SAY);
    save.touch();
  }

  // What Z would do here, said in place of the tool's prompt.
  let cued = false;
  function cue(wild) {
    const touch = input.isTouch;
    let html = '';
    let progress = null;
    let bad = false;
    let word = '';
    const K = (w) => {
      word = w;
      return touch ? w : 'Z';
    };
    if (riding) {
      const d = riding.def;
      if (player.carrier.landing) html = 'coming in to land…';
      else if (player.flying) html = `<b>space</b> climb · <b>shift</b> stoop · <b>${K('land')}</b> land`;
      else if (riding.kind === 'turtle' && !player.swimming) html = `<b>${K('get off')}</b> get off · slow on land: find water`;
      else html = `<b>${K('get off')}</b> get off · ${d.keys}`;
    } else if (wild) {
      const d = wild.def;
      if (wild.taming.mood === 'bolt' || wild.shy) {
        html = `the ${d.name} is wary: walk up slowly`;
        bad = true;
      } else {
        html = `<b>hold ${K('calm')}</b> calm the ${d.wild.replace(/^an? /, '')}`;
        progress = wild.taming.trust > 0 ? wild.taming.trust : null;
      }
    } else {
      const mine = nearest(tameOnes(), REACH + 0.6);
      if (mine) html = `<b>${K('ride')}</b> ride your ${mine.def.name}`;
      else if (tameOnes().length) K('call');
    }
    // (and leave the prompt alone when there's nothing to say, for whoever else has)
    if (html) hud.cue({ html, bad, progress });
    else if (cued) hud.cue(null);
    cued = !!html;
    btn.hidden = !touch || !word;
    if (word && btn.textContent !== word) btn.textContent = word;
  }

  // ── From the console ──────────────────────────────────────────────────────
  game.provide('mounts', {
    haunts,
    hints,
    get riding() {
      return riding ? riding.kind : null;
    },
    list: () =>
      all.map((m) => ({
        kind: m.kind,
        tame: m.tame,
        riding: m.riding,
        mode: m.mode,
        trust: Math.round(m.taming.trust * 100) / 100,
        known: hints.stage[m.kind],
        x: Math.round(m.x),
        z: Math.round(m.z),
        dist: Math.round(Math.hypot(m.x - player.pos.x, m.z - player.pos.z)),
      })),
    // skip finding and taming it: it's yours, beside you
    tame(kind) {
      const m = mounts[kind];
      if (!m) return `no ${kind} here: try ${Object.keys(mounts).join(', ')}`;
      if (!m.tame) won(m);
      const p = kind === 'turtle' ? ctx.waterNear(player.pos.x, player.pos.z) : { x: player.pos.x + Math.sin(player.yaw) * 3, z: player.pos.z + Math.cos(player.yaw) * 3 };
      if (!p) return `your ${kind} is back at its lake: it needs water to come to you`;
      m.moveTo(p.x, p.z, ctx, Math.atan2(player.pos.x - p.x, player.pos.z - p.z));
      m.rest();
      return `your ${kind} at ${Math.round(p.x)}, ${Math.round(p.z)}`;
    },
    ride(kind) {
      const m = mounts[kind];
      if (!m || !m.tame) return `no ${kind} of yours`;
      if (riding) getOff();
      m.moveTo(player.pos.x, player.pos.z, ctx, player.yaw);
      ride(m);
      return `on your ${kind}`;
    },
    getOff,
  });
}
