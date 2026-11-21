// Skiing: head down a steep, snowy slope and your skis go on by themselves
// (or your snowboard: ` swaps them), and down you go. Carve, tuck, brake,
// jump off the bumps and the crests, spin and flip and grab in the air, and
// come down on your skis — or don't, and go tumbling. Hit a boulder or a tree
// at speed and you go tumbling too. Stop on gentler ground and they come off
// again.
//
//   skier.js   the physics: sliding, carving, flying, falling
//   tricks.js  what you did in the air: whether you landed it, its name, its points
//   run.js     a run's tally: how far, how fast, points, combos
//   pose.js    how you stand on them, and tip over the snow
//   gear.js    skis, poles, a snowboard
//   spray.js   snow thrown up
//   sound.js   the snow, the edges, the wind; bindings, landings, falls
//   others.js  what other people here are skiing on
//
// While you ski, the skis move you (player.aboard), you stand on them
// (Character.stance), and the tools are put away (builder.idleWhile). Skis
// or a board is a preference (game.settings); your best run in this world is
// yours, saved (the 'skiing' domain).
//
// From the console:
//   world.skiing.on('board')   on a board (or 'skis'), here, whatever the snow
//   world.skiing.off()
//   world.skiing.state()       how you're going, and this run's tally

import { Skier, normalAt } from './skier.js';
import { Run } from './run.js';
import { Pose } from './pose.js';
import { makeGear } from './gear.js';
import { Spray } from './spray.js';
import { skiSounds } from './sound.js';
import { Skiers } from './others.js';
import { descent, findRunTop } from './descent.js';
import './skiing.css';
import { segDist, waterSample } from '../core/geom.js';
import { clamp, smoothstep } from '../noise.js';

const SURVEY = { reach: 30000, step: 750 }; // metres, for the ski run on the map

// The skis go on by themselves on snow this deep (0..1), this steep (rise
// over run, about 18°), heading down it at this many m/s.
const CLIP_IN = { snow: 0.6, steep: 0.32, down: 0.8 };
// ...and come off again stopped (under STILL m/s) for this long (s) on ground
// gentler than this, or on bare ground slower than BARE m/s, or in water this
// deep (m).
const CLIP_OUT = { still: 0.6, time: 1.2, steep: 0.2, bare: 2, water: 0.3 };
// After you take them off yourself, they stay off this long (s).
const LEFT_OFF = 4;
// Where a key does nothing, how much snow there must be to put them on (0..1).
const ANY_SNOW = 0.45;
// Snow lies on slopes gentler than this (1 - up: from about 42° it thins
// out, and by 53° it's rock), as the ground's shader paints it (materials.js).
const SNOW_SLOPE = [0.26, 0.4];
// How the camera follows: round behind you this fast (1/s), and back this
// much further (m) per m/s, up to BACK_MOST.
const BEHIND = 2.2;
const BACK = 0.07;
const BACK_MOST = 2.5;
// Snow thrown up: grains a second, per m/s, carving (per m/s² round) and skidding.
const SPRAY = { speed: 1.2, carve: 0.6, skid: 6 };
// How long (ms) a word stays on the screen.
const SAY = 2600;
const QUIPS = ['wipeout!', 'yard sale!', 'face plant!', 'ouch!', 'down you go!', 'that’s gonna leave a mark'];
const NAMES = { skis: 'skis', board: 'snowboard' };

const _n = { x: 0, y: 1, z: 0 };
const _up = { x: 0, y: 1, z: 0 };
const _g = { h: 0, path: 0, forest: 0, above: 0, snow: 0, wRegion: 0, wLevel: 0, wSpeed: 0, wFoam: 0, bare: 0, sand: 0, land: 0, country: 0 };
const _w = waterSample();
const _seg = { d: 0, nx: 0, nz: 0, t: 0 };
const fmt = (n) => Math.round(n).toLocaleString('en');

// The features this uses, so it is installed after them (game/features.js).
export const after = ['render', 'ui', 'world', 'player', 'audio', 'build', 'save', 'adventures', 'map'];
export function installSkiing(game) {
  const { scene, chunks, gen, solids, player, input, hud, commands, settings, save, sound, builder, peers, adventures, map, landforms } = game;
  const height = (x, z) => chunks.heightAt(x, z);

  // ── The snow, and what stands on it ───────────────────────────────────────
  // How much snow lies at (x, z), 0..1: none on rock too steep to hold it.
  function snowAt(x, z) {
    const s = chunks.groundAt(x, z, _g) ? _g.snow : gen.snow(x, z, height(x, z));
    if (s <= 0) return 0;
    normalAt(height, x, z, _n);
    return s * (1 - smoothstep(SNOW_SLOPE[0], SNOW_SLOPE[1], 1 - _n.y));
  }
  const ground = {
    height,
    snow: snowAt,
    // trunks, boulders (cleared in the air, if you're high enough over one), and walls
    hit(x, y, z, r, out) {
      let best = 0;
      chunks.forEachCollider(x, z, (cx, cz, cr) => {
        const dx = x - cx;
        const dz = z - cz;
        const d = Math.hypot(dx, dz);
        const depth = cr + r - d;
        if (depth <= best || d < 1e-5) return;
        const boulder = cr >= 0.5;
        if (y - height(cx, cz) > (boulder ? cr * 0.9 : 10)) return;
        best = depth;
        out.nx = dx / d;
        out.nz = dz / d;
        out.depth = depth;
        out.what = boulder ? 'a boulder' : 'a tree';
      });
      if (solids) {
        solids.forEachNear(x, z, 1.2 + r, (s) => {
          segDist(x, z, s.ax, s.az, s.bx, s.bz, _seg);
          const depth = s.r + r - _seg.d;
          if (depth <= best) return;
          const top = s.topA + (s.topB - s.topA) * _seg.t;
          if (y >= top - 0.3 || y + 1.5 < s.bottom) return;
          best = depth;
          out.nx = _seg.nx;
          out.nz = _seg.nz;
          out.depth = depth;
          out.what = 'something built';
        });
      }
      return best > 0;
    },
  };

  // ── You, on them ──────────────────────────────────────────────────────────
  let kind = settings.get('skiing', 'string') === 'board' ? 'board' : 'skis';
  const skier = new Skier(ground, kind);
  const pose = new Pose(makeGear());
  const run = new Run();
  const spray = new Spray(scene);
  const heard = { on: false, speed: 0, grounded: true, carve: 0, skid: 0, bare: 0 };
  sound.addLayer(skiSounds(heard));
  let active = false;
  let manual = false; // put on with a key: they stay on until taken off, or the snow runs out
  let leftOff = 0; // s they stay off after you took them off
  let still = 0; // s stopped
  let sprayed = 0; // grains owed
  let best = null; // { points, top (km/h), trick } your best in this world
  let last = { x: 0, z: 0 }; // where the skis last put you
  let heading = 0; // which way you were going, for the camera to keep to while you're down
  let cued = false; // whether the prompt is ours
  const c = { steer: 0, tuck: 0, brake: 0, pop: false, grab: false, flip: 0 };
  builder.idleWhile(() => active);

  const mover = {
    place(out, dt) {
      // moved by something else (R, a teleport): that's the end of the run
      if (Math.hypot(player.pos.x - last.x, player.pos.z - last.z) > 2) {
        out.x = player.pos.x;
        out.y = player.pos.y;
        out.z = player.pos.z;
        out.yaw = player.yaw;
        stepOut(true);
        return;
      }
      readControls();
      skier.step(dt, c);
      normalAt(height, skier.x, skier.z, _up);
      pose.update(dt, skier, c, _up);
      out.x = last.x = skier.x;
      out.y = skier.y;
      out.z = last.z = skier.z;
      out.yaw = pose.yaw;
      if (skier.down < 0) heading = skier.heading;
      out.heading = heading;
      out.grounded = !skier.flying;
      out.behind = skier.down < 0 ? BEHIND : 0;
      out.back = Math.min(BACK_MOST, skier.speed * BACK);
    },
  };

  // The keys: A D turn (spin, in the air), W tucks (flips forward), S brakes
  // (flips back), shift tucks too (grabs), space jumps.
  function readControls() {
    // with the map open (or anything else that has the keys), you snowplough to a stop
    if (input.blocked) {
      Object.assign(c, { steer: 0, tuck: 0, brake: 1, flip: 0, grab: false, pop: false });
      return;
    }
    const ax = input.moveAxes();
    const run = input.running();
    c.steer = ax.x;
    c.tuck = Math.max(0, ax.y, run ? 1 : 0);
    c.brake = Math.max(0, -ax.y);
    c.flip = ax.y;
    c.grab = run || input.holding('use');
    c.pop = input.jumped();
  }

  function clipIn(k = kind, byHand = false) {
    if (active) return;
    const v = player.vel;
    const s = Math.hypot(v.x, v.z);
    kind = k;
    skier.use(kind);
    skier.start(player.pos.x, player.pos.z, v.x, v.z, s > 0.3 ? Math.atan2(v.x, v.z) : player.yaw);
    player.character.stance(pose.use(kind));
    pose.up.x = pose.up.z = 0;
    pose.up.y = 1;
    last = { x: player.pos.x, z: player.pos.z };
    player.aboard = mover;
    active = true;
    manual = byHand;
    still = 0;
    run.reset(skier.x, skier.y, skier.z);
    tell();
    sound.sfx('binding');
    spray.burst(skier.x, skier.y + 0.05, skier.z, skier.y, 14, { up: 1, spread: 0.8 });
    hud.flash(`${kind === 'board' ? 'onto your snowboard' : 'skis on'} · down you go`, SAY);
  }

  // Off them again. moved: something else has put you somewhere (a teleport)
  function stepOut(moved = false, word = null) {
    if (!active) return;
    active = false;
    if (player.aboard === mover) player.aboard = null;
    const root = player.character.root;
    player.character.stance(null);
    root.rotation.x = 0;
    if (!moved) {
      player.pos.set(skier.x, height(skier.x, skier.z), skier.z);
      player.yaw = pose.yaw;
    }
    player.vel.set(0, 0, 0);
    player.grounded = true;
    heard.on = false;
    tell();
    sound.sfx('binding');
    finish(word);
  }

  // The run is over: what it came to, and whether it was your best.
  function finish(word) {
    run.bank();
    const top = Math.round(run.top * 3.6);
    const said = [word || `${NAMES[kind]} off`];
    if (run.distance > 30) said.push(`${fmt(run.distance)} m`, `top ${top} km/h`);
    if (run.points) said.push(`${fmt(run.points)} points`);
    const was = best || { points: 0, top: 0 };
    if (run.distance > 30 && (run.points > was.points || top > was.top)) {
      best = { points: Math.max(was.points, run.points), top: Math.max(was.top, top), trick: run.points > was.points && run.best ? run.best.name : was.trick || null };
      if (run.points > was.points && was.points) said.push('your best yet');
      save.touch();
    }
    hud.flash(said.join(' · '), SAY + 1400);
  }

  // ── What happens on the way down ──────────────────────────────────────────
  skier.on('takeoff', (popped) => {
    if (popped) sound.sfx('pop');
    spray.burst(skier.x, skier.y + 0.05, skier.z, skier.y, popped ? 16 : 6, { up: 1.2, spread: 0.9, vx: skier.vx * 0.3, vz: skier.vz * 0.3 });
  });
  skier.on('land', (l) => {
    sound.sfx('powder', { size: clamp(l.impact / 10, 0.15, 1) });
    spray.burst(skier.x, skier.y + 0.05, skier.z, skier.y, Math.round(18 + l.impact * 5), { up: 1.4 + l.impact * 0.15, spread: 1.6, vx: skier.vx * 0.4, vz: skier.vz * 0.4, from: 0.4 });
    if (!l.points) return;
    run.landed(l.name, l.points);
    const n = run.combo.length;
    const extra = [l.switched && 'switch', l.sketchy && 'sketchy: let go of the grab before you land'].filter(Boolean);
    hud.flash(`${l.name || 'air'} +${fmt(l.points)}${n > 1 ? ` · combo ×${n}` : ''}${extra.length ? ` · ${extra.join(' · ')}` : ''}`, SAY);
  });
  skier.on('touch', (s) => sound.sfx('powder', { size: 0.1 + s * 0.4 }));
  skier.on('bump', (s) => {
    if (s > 0.4) sound.sfx('powder', { size: s * 0.5 });
  });
  skier.on('brush', (what, speed) => sound.sfx('knock', { size: clamp(speed / 5, 0.2, 1) }));
  skier.on('crash', (why, speed) => {
    sound.sfx('wipeout');
    if (/tree|boulder|built/.test(why)) sound.sfx('knock', { size: 1 });
    spray.burst(skier.x, skier.y + 0.2, skier.z, skier.y, Math.round(40 + speed * 4), { up: 2.2, spread: 2.2, vx: skier.vx * 0.5, vz: skier.vz * 0.5, from: 0.5 });
    const lost = run.fall();
    const quip = QUIPS[Math.floor(Math.random() * QUIPS.length)];
    hud.flash(`${quip} ${why}${lost ? ` · lost ${fmt(lost)}` : ''}`, SAY);
  });
  skier.on('up', () => {
    spray.burst(skier.x, skier.y + 0.1, skier.z, skier.y, 10, { up: 0.8, spread: 0.6 });
  });

  // ── Everyone else here ────────────────────────────────────────────────────
  // They're told what you're on, and you see what they're on.
  function tell() {
    save.say('ski', { kind: active ? kind : null });
  }
  if (peers) {
    const skiers = new Skiers(peers);
    save.on('message', (msg) => msg.ch === 'ski' && skiers.hear(msg.from, msg.body));
    // someone new: tell them what you're on
    peers.on('change', () => {
      skiers.update();
      if (active) tell();
    });
  }

  // ── Keys ──────────────────────────────────────────────────────────────────
  function toggle() {
    if (active) {
      stepOut();
      leftOff = LEFT_OFF;
      return;
    }
    if (!onFoot()) return;
    if (snowAt(player.pos.x, player.pos.z) < ANY_SNOW) return hud.flash(`no snow here: your ${NAMES[kind]} are for snow`);
    clipIn(kind, true);
  }
  function swap() {
    kind = kind === 'skis' ? 'board' : 'skis';
    settings.set('skiing', kind);
    if (!active) return hud.flash(`${NAMES[kind]} next time, on the snow`);
    skier.use(kind);
    player.character.stance(pose.use(kind));
    tell();
    sound.sfx('binding');
    hud.flash(`on your ${NAMES[kind]} now`);
  }
  // Survey once from the world's starting point so the forest run has the
  // same pin when someone reloads or looks for it from overseas.
  const top = findRunTop(gen, landforms, player.start, SURVEY.reach, SURVEY.step);
  if (top && snowAt(top.x, top.z) >= CLIP_IN.snow) {
    const peak = {
      id: `ski:${Math.round(top.x)}:${Math.round(top.z)}`,
      x: top.x, z: top.z, kind: 'ski peak', name: 'High Country ski run',
      note: 'A snowy run in the forest. Head downhill to clip in.',
      glyph: ['.......', '...#...', '..#.#..', '..###..', '.#####.', '.#####.', '#######'],
    };
    map.places.addSource({
      destinations: () => [peak],
      get: (id) => id === peak.id ? peak : null,
      within: (x0, z0, x1, z1) => peak.x >= x0 && peak.x <= x1 && peak.z >= z0 && peak.z <= z1 ? [peak] : [],
    });
  }

  // On the adventures board: sent to the top of a run, and timed down it.
  adventures.define(descent(() => active));

  commands.add({ id: 'skis', keys: ['KeyI'], group: 'WANDER', label: 'skis on · off (they go on by themselves heading down steep snow)', run: toggle });
  commands.add({ id: 'snowboard', keys: ['Backquote'], help: '`', group: 'WANDER', label: 'skis or a snowboard', run: swap });
  commands.describe({ group: 'WANDER', help: 'on skis', label: 'A D turn · W tuck · S brake · space jump' });
  commands.describe({ group: 'WANDER', help: 'in the air', label: 'A D spin · W S flip · shift grab' });

  // On a touch screen, a button to swap skis for a board, while you ski.
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.id = 'act-ski';
  btn.hidden = true;
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    swap();
  });
  document.getElementById('touch-act')?.prepend(btn);

  // ── The readout: how fast, and the points ─────────────────────────────────
  const readout = document.createElement('div');
  readout.id = 'ski';
  readout.hidden = true;
  document.getElementById('hud')?.appendChild(readout);
  let shown = '';
  function show() {
    let text = '';
    if (active) {
      const parts = [`${Math.round(skier.speed * 3.6)} km/h`];
      if (run.points) parts.push(`${fmt(run.points)} pts`);
      if (run.combo.length) parts.push(`+${fmt(run.pending)}${run.combo.length > 1 ? ` (×${run.combo.length})` : ''}`);
      if (best && best.points) parts.push(`best ${fmt(best.points)}`);
      text = parts.join(' · ');
    }
    if (text === shown) return;
    shown = text;
    readout.textContent = text;
    readout.hidden = !text;
  }

  // What the keys do now, in place of the tool's prompt.
  function cue() {
    const touch = input.isTouch;
    btn.hidden = !touch || !active;
    if (active) btn.textContent = kind === 'skis' ? 'board' : 'skis';
    if (!active) {
      if (cued) hud.cue(null);
      cued = false;
      return;
    }
    cued = true;
    let html;
    if (skier.down >= 0) html = 'down in the snow…';
    else if (skier.flying) html = touch ? 'stick: spin, flip · hold <b>use</b>: grab' : '<b>A D</b> spin · <b>W S</b> flip · <b>shift</b> grab';
    else html = touch ? 'stick: turn, tuck, brake · tap: jump' : '<b>A D</b> turn · <b>W</b> tuck · <b>S</b> brake · <b>space</b> jump · <b>I</b> off';
    hud.cue({ html });
  }

  // ── Every frame ───────────────────────────────────────────────────────────
  // On foot, out under the sky, and nothing else moving you.
  const onFoot = () => !player.carrier && !player.aboard && !player.space && !player.swimming && player.wade < 0.05;

  game.addSystem({
    name: 'skiing',
    phase: 'update',
    update({ dt }) {
      leftOff = Math.max(0, leftOff - dt);
      // something else has you now (a horse, a train)
      if (active && (player.aboard !== mover || player.carrier)) {
        active = false;
        if (player.aboard === mover) player.aboard = null;
        player.character.stance(null);
        player.character.root.rotation.x = 0;
        heard.on = false;
        tell();
        finish();
      }
      if (!active) {
        // heading down steep snow: on they go
        if (leftOff <= 0 && onFoot() && player.grounded) {
          const { x, z } = player.pos;
          normalAt(height, x, z, _n);
          const steep = Math.hypot(_n.x, _n.z) / _n.y;
          const fall = Math.hypot(_n.x, _n.z);
          const down = fall > 1e-4 ? (player.vel.x * _n.x + player.vel.z * _n.z) / fall : 0;
          if (steep > CLIP_IN.steep && down > CLIP_IN.down && snowAt(x, z) > CLIP_IN.snow) clipIn(kind);
        }
        cue();
        show();
        return;
      }

      const root = player.character.root;
      root.rotation.x = pose.rx;
      root.rotation.z = pose.rz;

      // off them again: stopped on gentle ground, off the snow, or in the water
      const speed = skier.speed;
      const up = skier.down < 0;
      normalAt(height, skier.x, skier.z, _n);
      const steep = Math.hypot(_n.x, _n.z) / _n.y;
      still = up && skier.grounded && speed < CLIP_OUT.still ? still + dt : 0;
      if (!manual && still > CLIP_OUT.time && steep < CLIP_OUT.steep) stepOut();
      else if (up && skier.grounded && skier.bare > 0.8 && speed < CLIP_OUT.bare) stepOut(false, `off the snow: ${NAMES[kind]} off`);
      else if (chunks.waterAt(skier.x, skier.z, _w) && _w.depth > CLIP_OUT.water) stepOut(false, `into the water: ${NAMES[kind]} off`);
      if (!active) {
        cue();
        show();
        return;
      }

      const banked = run.update(dt, skier.x, skier.y, skier.z, speed, skier.grounded && up);
      if (banked) hud.flash(`combo banked +${fmt(banked)}`, SAY);

      // snow off the edges
      const carve = clamp(Math.abs(skier.lateral) / 12, 0, 1);
      const skid = clamp(c.brake + Math.abs(skier.yawRate) * 0.1 * (c.brake > 0 ? 1 : 0), 0, 1);
      const onSnow = up && skier.grounded ? 1 - skier.bare : 0;
      if (onSnow > 0 && speed > 2.5) {
        sprayed += dt * onSnow * (speed * SPRAY.speed + Math.abs(skier.lateral) * SPRAY.carve * speed * 0.2 + skid * speed * SPRAY.skid);
        const n = Math.floor(sprayed);
        if (n > 0) {
          sprayed -= n;
          // thrown out to the outside of the turn
          const h = skier.heading;
          const side = skier.lateral > 0 ? -1 : 1;
          const ox = Math.cos(h) * side;
          const oz = -Math.sin(h) * side;
          spray.burst(skier.x + ox * 0.25, skier.y + 0.05, skier.z + oz * 0.25, skier.y, Math.min(n, 12), {
            up: 0.8 + carve * 1.6 + skid,
            spread: 0.5 + carve,
            vx: skier.vx * 0.35 + ox * (1 + carve * 3 + skid * 2),
            vz: skier.vz * 0.35 + oz * (1 + carve * 3 + skid * 2),
            from: 0.2,
          });
        }
      }

      heard.on = true;
      heard.speed = speed;
      heard.grounded = skier.grounded && up;
      heard.carve = carve;
      heard.skid = clamp(skid + (up ? 0 : 1), 0, 1);
      heard.bare = skier.bare;
      cue();
      show();
    },
  });
  game.addSystem({ name: 'snow-spray', phase: 'world', update: ({ dt }) => spray.update(dt) });

  // ── Saved: your best in this world ────────────────────────────────────────
  save.register({
    id: 'skiing',
    scope: 'yours',
    collect: () => best,
    validate(raw) {
      if (!raw || typeof raw !== 'object') return null;
      const n = (v) => (Number.isFinite(v) && v >= 0 ? Math.round(v) : 0);
      return { points: n(raw.points), top: n(raw.top), trick: typeof raw.trick === 'string' ? raw.trick.slice(0, 80) : null };
    },
    restore(data) {
      best = data && (data.points || data.top) ? { ...data } : null;
    },
  });

  // ── From the console ──────────────────────────────────────────────────────
  game.provide('skiing', {
    get active() {
      return active;
    },
    get kind() {
      return kind;
    },
    get best() {
      return best ? { ...best } : null;
    },
    skier,
    run,
    snowAt,
    on(k = kind) {
      if (active) stepOut();
      clipIn(k === 'board' ? 'board' : 'skis', true);
      return `on your ${NAMES[kind]}`;
    },
    off() {
      stepOut();
      return 'off';
    },
    state: () => ({
      active,
      kind,
      speed: Math.round(skier.speed * 10) / 10,
      kmh: Math.round(skier.speed * 3.6),
      grounded: skier.grounded,
      flying: skier.flying,
      down: skier.down >= 0,
      x: Math.round(skier.x * 10) / 10,
      z: Math.round(skier.z * 10) / 10,
      run: { time: Math.round(run.time * 10) / 10, distance: Math.round(run.distance), drop: Math.round(run.drop), top: Math.round(run.top * 3.6), points: run.points, pending: run.pending, falls: run.falls },
    }),
  });
}
