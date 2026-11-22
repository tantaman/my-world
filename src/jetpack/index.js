// A jetpack, hanging on a rack at the front of the launch pad. Walk up to it
// and press J, and it's strapped to your back, yours until you hang it back
// up. Jump and keep holding space, and the jets fire: you fly. Space climbs,
// shift dives and goes faster, W A S D steer, and with neither space nor
// shift the jets throttle back and let you down slowly. Touch down and they
// cut out, and you walk on as before.
//
//   jets.js     when the jets fire and cut out, how they carry you, how you hang
//   rack.js     where the rack stands at the launch site
//   model.js    the jetpack, its flames, its vapour, and the rack
//   others.js   other people's jetpacks
//   sound.js    the jets' roar; the buckles, lighting up, cutting out
//
// While the jets burn the jetpack carries you (player.carrier, flying the
// way the eagle flies), you hang under it (Character.stance), tipped the way
// you're going, and the tools are put away (builder.idleWhile). The jetpack
// rides on your back the rest of the time (Character.addOnBack). Whether you
// have it is yours, saved (the 'jetpack' domain); the rack is the launch
// site's, placed with it (spaceport/site.js), and stands empty while the
// jetpack is on your back.
//
// From the console:
//   world.jetpack.rack          where the rack is
//   await world.jetpack.go()    stand in front of it
//   world.jetpack.give()        strapped on, wherever you are
//   world.jetpack.state()       whether you have it, whether the jets burn, how high

import * as THREE from 'three';
import { Jets, FLYING } from './jets.js';
import { rackAt } from './rack.js';
import { makeJetpack, makeRack, makePuffs, PUFFS } from './model.js';
import { Jetpackers } from './others.js';
import { jetSounds } from './sound.js';

const SHOW = 300; // m from the rack that it's stood up...
const HIDE = 380; // ...and taken down past this
const REACH = 2.5; // m from the rack that J takes the jetpack, or hangs it back
const PIVOT = 1.05; // m above the feet the body tips about, flying (about the hips)
const TELL = 0.3; // s between telling the others how high you are, flying
const SAY = 3400; // ms a word stays up
// Vapour: puffs a second at full thrust, how fast (m/s) out of the nozzle at
// the least and most thrust, how fast they scatter sideways (m/s), how much
// of your own speed they carry off, how long (s) one lasts, the drag on them
// (1/s), and how big one is (m across, at first and growing each second).
const VAPOUR = { rate: 28, out: [3, 7], scatter: 1.6, carry: 0.3, life: [0.4, 0.9], drag: 2.6, size: [0.06, 0.6] };
const WAYS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

const _o = new THREE.Vector3();
const _v = new THREE.Vector3();
const _d = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const round = (v, f = 10) => Math.round(v * f) / f;

// The features this uses, so it is installed after them (game/features.js);
// spaceport for where the launch site is.
export const after = ['render', 'ui', 'world', 'player', 'audio', 'build', 'save', 'spaceport'];
export function installJetpack(game) {
  const { scene, solids, player, input, builder, hud, commands, save, sound, peers, spaceport } = game;
  const rack = rackAt(spaceport.sites.home);
  const jets = new Jets();
  let time = 0; // s since the game began, by this feature's frames
  let toldAt = -Infinity; // when the others were last told how you are (tell())

  // ── On your back ──────────────────────────────────────────────────────────
  const pack = makeJetpack();
  pack.object.visible = false;
  player.character.addOnBack(pack.object);

  // ── The rack ──────────────────────────────────────────────────────────────
  let stand = null; // { object, hook, hung }
  let shown = false;
  function show(on) {
    if (on === shown || !rack) return;
    shown = on;
    if (on) {
      if (!stand) {
        stand = makeRack();
        stand.hung = makeJetpack();
        stand.hook.add(stand.hung.object);
        stand.object.position.set(rack.x, rack.y, rack.z);
        stand.object.rotation.y = rack.yaw;
      }
      stand.hung.object.visible = !jets.worn;
      scene.add(stand.object);
      solids.set(stand, [rack.solid]);
    } else {
      scene.remove(stand.object);
      solids.clear(stand);
    }
  }
  const nearRack = () => shown && Math.hypot(player.pos.x - rack.x, player.pos.z - rack.z) < REACH && Math.abs(player.pos.y - rack.y) < 1.5;

  // ── Yours ─────────────────────────────────────────────────────────────────
  save.register({
    id: 'jetpack',
    scope: 'yours',
    collect: () => ({ have: jets.worn }),
    validate: (raw) => ({ have: !!raw && typeof raw === 'object' && raw.have === true }),
    restore: (r) => wear(r.have, false),
  });

  // On your back (from the rack), or off it (back onto the rack).
  // byHand: you did it, here and now (not a save being opened).
  function wear(on, byHand) {
    if (on === jets.worn) return;
    if (!on && jets.on) {
      jets.stop(player);
      out();
    }
    jets.worn = on;
    pack.object.visible = on;
    if (stand) stand.hung.object.visible = !on;
    if (byHand) {
      sound.sfx('jet-strap', { on });
      hud.flash(on ? 'jetpack on · jump, and hold space to fly' : 'jetpack hung back up on its rack', SAY);
      save.touch();
    }
    tell();
  }

  // ── The jets ──────────────────────────────────────────────────────────────
  const heard = { thrust: 0, others: 0 };
  sound.addLayer(jetSounds(heard));
  builder.idleWhile(() => jets.on);
  const controls = {
    get held() {
      return input.isDown('jump');
    },
    pressed: () => input.jumped(),
    get blocked() {
      return input.blocked;
    },
  };
  function lit() {
    player.character.stance(FLYING);
    sound.sfx('jet-ignite');
    tell();
  }
  function out() {
    if (player.character.stood === FLYING) player.character.stance(null);
    tell();
  }

  // the vapour they leave, drawn round where you are (render/origin.js)
  const puffs = makePuffs();
  scene.add(puffs);
  const flow = []; // { x, y, z, vx, vy, vz, age, life }
  let owed = 0;
  function vapour(dt) {
    if (jets.thrust > 0.03) {
      owed += jets.thrust * VAPOUR.rate * dt;
      while (owed >= 1 && flow.length < PUFFS) {
        owed -= 1;
        const n = pack.nozzles[flow.length % 2];
        n.getWorldPosition(_v);
        _d.set(0, -1, 0).transformDirection(n.matrixWorld);
        const s = VAPOUR.out[0] + (VAPOUR.out[1] - VAPOUR.out[0]) * jets.thrust;
        const life = VAPOUR.life[0] + Math.random() * (VAPOUR.life[1] - VAPOUR.life[0]);
        const v = player.vel;
        const k = VAPOUR.carry;
        const w = VAPOUR.scatter;
        flow.push({ x: _v.x, y: _v.y, z: _v.z, vx: _d.x * s + v.x * k + (Math.random() - 0.5) * w, vy: _d.y * s + v.y * k + (Math.random() - 0.5) * w, vz: _d.z * s + v.z * k + (Math.random() - 0.5) * w, age: 0, life });
      }
      owed = Math.min(owed, 3);
    }
    if (!flow.length) {
      puffs.count = 0;
      return;
    }
    // what's under you, for the vapour to spread out over
    const floor = player.pos.y - player.height;
    const drag = Math.exp(-dt * VAPOUR.drag);
    for (let i = flow.length - 1; i >= 0; i--) {
      const f = flow[i];
      f.age += dt;
      if (f.age > f.life) {
        flow.splice(i, 1);
        continue;
      }
      f.vx *= drag;
      f.vy *= drag;
      f.vz *= drag;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.z += f.vz * dt;
      if (f.y < floor + 0.15) {
        // blown out across the ground
        const spread = Math.abs(f.vy) * 0.6;
        const a = Math.random() * Math.PI * 2;
        f.vx += Math.cos(a) * spread;
        f.vz += Math.sin(a) * spread;
        f.vy = 0.3;
        f.y = floor + 0.15;
      }
    }
    puffs.position.copy(player.pos);
    let n = 0;
    for (const f of flow) {
      const k = f.age / f.life;
      const size = (VAPOUR.size[0] + f.age * VAPOUR.size[1]) * (1 - k * k * k);
      _m.compose(_p.set(f.x - player.pos.x, f.y - player.pos.y, f.z - player.pos.z), _q, _s.setScalar(size));
      puffs.setMatrixAt(n++, _m);
    }
    puffs.count = n;
    puffs.instanceMatrix.needsUpdate = true;
  }

  // ── J ─────────────────────────────────────────────────────────────────────
  // At its rack, on your feet: J would put it on, or hang it back up.
  const atRack = () => !!rack && nearRack() && !jets.on && !player.carrier && !player.aboard;
  commands.add({
    id: 'jetpack',
    keys: ['KeyJ'],
    group: 'JETPACK',
    label: 'at the launch site: strap on the jetpack · hang it back up',
    // at hand there: in the pack, which is how a pad gets at it, and a button on a touch screen
    now: () => (atRack() ? (jets.worn ? 'hang up' : 'strap on') : ''),
    run() {
      if (jets.on) return hud.flash('land first');
      if (rack && nearRack()) return wear(!jets.worn, true);
      if (jets.worn) return hud.flash('jump, and hold space to fly · J at its rack hangs it back up', SAY);
      if (!rack) return hud.flash('there’s no jetpack in this world', 2400);
      const p = player.pos;
      const d = Math.hypot(rack.x - p.x, rack.z - p.z);
      if (d < REACH * 3) return hud.flash('walk up to the rack, then J', 2200);
      const a = Math.atan2(rack.x - p.x, -(rack.z - p.z));
      hud.flash(`a jetpack hangs on a rack at the launch site, ${Math.round(d)} m ${WAYS[((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8]} · the launch site is on the map`, SAY);
    },
  });
  commands.describe({ group: 'JETPACK', help: 'space, held', pad: ['PadA'], label: 'off the ground: fire the jets · climb' });
  commands.describe({ group: 'JETPACK', help: 'shift', pad: ['PadB'], label: 'flying: dive, and faster' });
  commands.describe({ group: 'JETPACK', help: 'W A S D', pad: ['PadLS'], label: 'flying: steer · let go of space to come down' });

  // ── Everyone else here ────────────────────────────────────────────────────
  // They're told whether you have it (and how high you are, flying), and you
  // see theirs.
  function tell() {
    toldAt = time;
    save.say('jetpack', jets.on ? { have: true, y: round(player.pos.y), burn: round(jets.thrust, 100) } : { have: jets.worn });
  }
  if (peers) {
    const others = new Jetpackers({ peers, make: makeJetpack });
    save.on('message', (msg) => msg.ch === 'jetpack' && others.hear(msg.from, msg.body));
    // someone new: tell them you have one
    peers.on('change', () => jets.worn && tell());
    game.addSystem({ name: 'jetpackers', phase: 'world', update: ({ dt }) => (heard.others = others.update(dt, player.pos)) });
  }

  // ── Each frame ────────────────────────────────────────────────────────────
  // After you've moved: whether the jets fire or cut out, how hard they go,
  // and how you hang under them.
  let cued = false;
  game.addSystem({
    name: 'jetpack',
    phase: 'update',
    update({ dt }) {
      time += dt;
      const what = jets.step(dt, player, controls);
      if (what === 'ignite') lit();
      else if (what) {
        out();
        if (what === 'landed') sound.sfx('jet-cut');
      }
      jets.update(dt, player, input.running());
      if (jets.on) {
        // tipped about the hips, not the feet
        const root = player.character.root;
        root.rotation.x = jets.pitch;
        root.rotation.z = jets.roll;
        _o.set(0, PIVOT, 0).applyEuler(root.rotation);
        root.position.x -= _o.x;
        root.position.y += PIVOT - _o.y;
        root.position.z -= _o.z;
        if (time - toldAt > TELL) tell();
      }
      pack.burn(jets.thrust);
      vapour(dt);
      heard.thrust = jets.thrust;
      // what J would do here, or how to fly
      let html = null;
      if (jets.on) html = input.isTouch ? `tap jump: climb · let go to come down · ${Math.round(player.height)} m up` : `<b>space</b> climb · <b>shift</b> dive · let go to come down · ${Math.round(player.height)} m up`;
      else if (atRack()) {
        const K = (word) => (input.isTouch ? word : 'J');
        html = jets.worn ? `<b>${K('hang up')}</b> hang the jetpack back up` : `<b>${K('strap on')}</b> strap on the jetpack`;
      }
      if (html) {
        hud.cue({ html });
        cued = true;
      } else if (cued) {
        hud.cue(null);
        cued = false;
      }
    },
  });

  game.addSystem({
    name: 'jetpack-rack',
    phase: 'world',
    update() {
      if (!rack) return;
      const d = Math.hypot(rack.x - game.focus.x, rack.z - game.focus.z);
      if (d < SHOW) show(true);
      else if (d > HIDE) show(false);
    },
  });

  // ── From the console ──────────────────────────────────────────────────────
  game.provide('jetpack', {
    rack,
    jets,
    get have() {
      return jets.worn;
    },
    get flying() {
      return jets.on;
    },
    // stand in front of the rack, facing it
    async go() {
      if (!rack) return null;
      const f = rack.front;
      await game.api.teleport(f.x, f.z, f.yaw);
      return { x: f.x, z: f.z };
    },
    give() {
      wear(true, true);
      return jets.worn;
    },
    state: () => ({ have: jets.worn, flying: jets.on, thrust: round(jets.thrust, 100), height: round(player.height) }),
  });
}
