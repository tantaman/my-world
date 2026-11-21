// Adventures: start one whenever you like (I), and the quiet forest turns on
// you for a while. A tornado, a hurricane, a wildfire, an avalanche, a bear
// or a mountain lion hunting you, an outlaws' stronghold to take with your
// rifle, a cave to go down into for what's at the bottom of it. Everything
// about them lives in this folder; this plugs them into the game.
//
//   adventures.js   which there are, the one you're on, your health, how it ends
//   board.js        the board you pick one from
//   banner.js       the banner while one is on, the red when you're hurt, the end
//   fx.js           rain, flames, puffs, things flying, lightning
//   sound.js        the air (gale, rain, fire, twister), thunder, shots, roars
//   places.js       finding somewhere for one: water, a mountainside, a clearing
//   storm.js        a storm's sky, wind, rain, lightning and flying debris
//   tornado.js, hurricane.js, wildfire.js, avalanche.js, hunted.js,
//   stronghold.js, dungeon.js     the adventures
//   prowler.js      a bear or a lion that is after you
//   camp.js         the stronghold, its stockade and towers; guards.js its men
//
// Nothing an adventure does is saved or shared: it happens to you alone, in
// your own browser, and when it's over it's cleared away, so the world you
// share with others is just as it was. Only your record of them is kept
// ('adventures', yours, with your map marks).
//
// From the console:
//   world.adventures.begin('tornado')    set off on one
//   world.adventures.view()              how it's going
//   world.adventures.abandon()

import './adventures.css';
import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { SHARED, SKY } from '../render/uniforms.js';
import { Adventures, validateRecord } from './adventures.js';
import { AdventureBoard } from './board.js';
import { Banner } from './banner.js';
import { adventureAir } from './sound.js';
import { tornado } from './tornado.js';
import { hurricane } from './hurricane.js';
import { wildfire } from './wildfire.js';
import { avalanche } from './avalanche.js';
import { bear, lion } from './hunted.js';
import { stronghold } from './stronghold.js';
import { dungeon } from './dungeon.js';

const EASE = 0.8; // per second: how fast the sky follows what an adventure makes of it
const FAR = (CONFIG.viewRadius - 0.15) * CONFIG.chunkSize; // m: how far you see on a clear day
const SHELTER_ROOF = 9; // m: a roof this close over your head keeps the weather off
const _up = new THREE.Vector3(0, 1, 0);
const _head = new THREE.Vector3();

// The features this uses, so it is installed after them (game/features.js).
// And after country, so the sky an adventure makes is the one drawn.
export const after = ['render', 'ui', 'world', 'player', 'audio', 'build', 'caves', 'fires', 'wildlife', 'hunting', 'country'];
export function installAdventures(game) {
  const { scene, camera, chunks, gen, player, input, sky, pipeline, spaces, solids, caves, headlamp, fires, landforms, wildlife, hunting, builder, sound, hud, commands, save } = game;

  // ── What an adventure may do to the world ─────────────────────────────────
  // The sky and the air, as the one under way would have them this frame
  // (back to nothing before each frame's update; eased into, and out of).
  //   overcast, haze      as the sky and the picture have them (0..1, 1..)
  //   sight               m you can see to at most (0: as far as on a clear day)
  //   wind                more sway in the trees
  //   gloom, gloomColor   how far the sky is turned to that colour (storm, smoke)
  //   flash               lightning, this frame
  const neutral = () => ({ overcast: 0, haze: 1, sight: 0, wind: 0, gloom: 0, gloomColor: null, flash: 0 });
  const look = neutral();
  const shown = neutral();
  const air = { wind: 0, rain: 0, fire: 0, roar: 0 };
  sound.addLayer(adventureAir(air));

  const kit = {
    scene,
    camera,
    chunks,
    gen,
    player,
    sky,
    spaces,
    solids,
    caves,
    headlamp,
    fires,
    landforms,
    wildlife,
    sound,
    carcasses: hunting.carcasses,
    targets: hunting.targets,
    buildings: builder.buildings,
    look,
    air,
    ground: (x, z) => chunks.heightAt(x, z),
    // Hurt, by how much and what it was.
    hurt: (n, why) => adventures.hurt(n, why),
    // Worn down by it, a little at a time (smoke, heat, cold).
    wear: (n, why) => adventures.wear(n, why),
    say: (msg, ms = 2400) => hud.flash(msg, ms),
    // Shove you along the ground by (dx, dz) metres, this frame.
    push(dx, dz) {
      player.pos.x += dx;
      player.pos.z += dz;
    },
    // Throw you: off your feet, at this speed (m/s).
    fling(vx, vy, vz) {
      player.vel.set(vx, vy, vz);
      if (vy > 0) player.grounded = false;
    },
    // Is the weather kept off you here: in a cave, or under a roof you built?
    sheltered() {
      if (player.space) return true;
      _head.set(player.pos.x, player.pos.y + 1.7, player.pos.z);
      return !!builder.buildings.raycast(_head, _up, SHELTER_ROOF);
    },
  };

  const adventures = new Adventures({
    kit,
    body: {
      where: () => ({ x: player.pos.x, y: player.pos.y, z: player.pos.z, yaw: player.yaw, camYaw: player.camYaw }),
      // (on whatever floor is about as high as you were, if that was a cave's)
      back: (home) => player.spawn(home.x, home.z, home.yaw, home.camYaw, spaces.at(home.x, home.z, home.y + 0.05) ? home.y : Infinity),
    },
  });
  game.provide('adventures', adventures);
  for (const kind of [tornado, hurricane, wildfire, avalanche, bear, lion, stronghold, dungeon]) adventures.define(kind);

  // ── On the screen ─────────────────────────────────────────────────────────
  const banner = new Banner(document.getElementById('hud') || document.body);
  const board = new AdventureBoard({
    kinds: adventures.kinds,
    record: () => adventures.record,
    now: () => (adventures.active && adventures.state !== 'over' ? adventures.kind.title : null),
    onGo(id) {
      const why = adventures.begin(id);
      if (why) hud.flash(why, 3200);
    },
    onQuit: () => adventures.abandon(),
    input,
  });

  // One panel at a time: opening this one closes whatever else is up.
  const toggle = () => {
    if (!board.isOpen) game.emit('panel', 'adventures');
    board.toggle();
  };
  game.on('panel', (which) => which !== 'adventures' && board.close());
  commands.add({ id: 'adventures', keys: ['KeyJ'], group: 'ADVENTURE', label: 'adventures · start one, or give it up', run: toggle });

  // A button for it in the corner, beside the map's.
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.id = 'adventure-btn';
  btn.textContent = 'adventure';
  btn.setAttribute('aria-label', 'Adventures');
  const corner = document.getElementById('corner');
  if (corner) {
    corner.insertBefore(btn, document.getElementById('map-btn'));
    hud.button('adventure-btn', toggle);
  }

  adventures.on('state', (state) => {
    // lit while one is on
    if (state === 'idle') delete btn.dataset.state;
    else btn.dataset.state = 'live';
    if (state === 'travel') hud.flash(`${adventures.kind.title} · get to ${adventures.dest.label} and it begins`, 3600);
  });
  adventures.on('start', () => sound.sfx('adv-start'));
  adventures.on('hurt', (n) => {
    banner.hurt(n);
    sound.sfx('adv-hurt', { size: Math.min(1, n / 30) });
    player.camPitch += (Math.random() - 0.5) * Math.min(0.08, n / 300);
    player.camYaw += (Math.random() - 0.5) * Math.min(0.1, n / 250);
  });
  adventures.on('end', (kind, outcome, line) => {
    if (outcome === 'won') {
      banner.card('YOU MADE IT', line, true);
      sound.sfx('adv-won');
    } else if (outcome === 'lost') {
      banner.blackout();
      banner.card("YOU DIDN'T MAKE IT", `${line} · you're back where it began`, false);
      sound.sfx('adv-lost');
    } else hud.flash(`${kind.title} · given up`);
  });

  // ── Your record ───────────────────────────────────────────────────────────
  save.register({
    id: 'adventures',
    scope: 'yours',
    local: 'marks',
    collect: () => adventures.serialize(),
    validate: validateRecord,
    restore: (data) => adventures.load(data),
  });
  adventures.on('record', () => save.touch());

  // ── Every frame ───────────────────────────────────────────────────────────
  // After the sky has been worked out for the hour (world) and the country's
  // weather (country), so the storm an adventure makes is the one drawn.
  const gloom = new THREE.Color(); // the colour the sky is going to, kept as it eases off
  const tint = new THREE.Color();
  let fogSet = null; // the fog distance this last set, to hand back
  game.addSystem({
    name: 'adventures',
    phase: 'world',
    update({ dt }) {
      Object.assign(look, neutral());
      air.wind = air.rain = air.fire = air.roar = 0;
      adventures.update(dt);

      const k = 1 - Math.exp(-dt * EASE);
      for (const key of ['overcast', 'haze', 'sight', 'wind', 'gloom']) {
        // 0 for sight means no limit: as far as the eye sees on a clear day
        const want = key === 'sight' && !look.sight ? FAR : look[key];
        const from = key === 'sight' && !shown.sight ? FAR : shown[key];
        shown[key] = from + (want - from) * k;
      }
      if (shown.overcast > 0.002) sky.overcast = Math.max(sky.overcast, shown.overcast);
      if (shown.haze > 1.002) pipeline.haze = Math.max(pipeline.haze, shown.haze);
      // The fog comes in as close as it says, but never further out than
      // anyone else has it (a hike sees far), and is handed back after.
      if (shown.sight >= FAR - 1) shown.sight = 0;
      if (shown.sight) {
        const theirs = pipeline.fogFar === fogSet ? 0 : pipeline.fogFar;
        pipeline.fogFar = fogSet = Math.min(theirs || FAR, shown.sight);
      } else if (fogSet !== null) {
        if (pipeline.fogFar === fogSet) pipeline.fogFar = 0;
        fogSet = null;
      }
      if (shown.wind > 0.01) SHARED.uWind.value += shown.wind;
      if (look.gloomColor) gloom.copy(look.gloomColor);
      if (shown.gloom > 0.002) {
        SKY.uHorizon.value.lerp(gloom, shown.gloom);
        SKY.uZenith.value.lerp(tint.copy(gloom).multiplyScalar(0.6), shown.gloom * 0.9);
        // the sun's own colour too, which lights the clouds and its glow
        SKY.uSunColor.value.lerp(tint.copy(gloom).multiplyScalar(1.4), shown.gloom * 0.85);
      }
      if (look.flash > 0) {
        sky.hemi.intensity += look.flash * 5;
        sky.sun.intensity += look.flash * 2;
      }
      banner.update(adventures.view(), { x: player.pos.x, z: player.pos.z, camYaw: player.camYaw });
    },
  });
}
