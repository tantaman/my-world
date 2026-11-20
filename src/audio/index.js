// What the forest sounds like from where you stand.

import { CONFIG } from '../config.js';
import { Soundscape } from './soundscape.js';
import { SHARED, SKY } from '../render/uniforms.js';

const WATER_EVERY = 250; // ms between looks round for water to hear
const WATER_REACH = 45; // metres
// How far (m) the land must rise above the line from your ear to a stretch of
// water to muffle it completely.
const BANK_HIDES = 1.5;

export function installAudio(game) {
  const { chunks, gen, sky, player, camera, hud, commands, settings } = game;

  const sound = new Soundscape();
  const remembered = settings.get('sound', 'boolean');
  if (remembered !== undefined) sound.enabled = remembered;
  if (CONFIG.mute) sound.enabled = false;
  game.provide('sound', sound);

  // ── What's underfoot ──────────────────────────────────────────────────────
  const ground = { h: 0, path: 0, forest: 0, above: 0, snow: 0 };
  function groundHere() {
    const { x, z } = player.pos;
    if (!chunks.groundAt(x, z, ground)) {
      ground.path = gen.pathMask(x, z);
      ground.forest = gen.forest(x, z);
      ground.above = ground.snow = 0;
    }
    return ground;
  }
  function surfaceHere() {
    // something built underfoot says what it's made of (a dock: 'boards')
    if (player.underfoot && player.underfoot.surface) return player.underfoot.surface;
    if (player.wade > 0.04) return 'water';
    const g = groundHere();
    if (g.snow > 0.5) return 'snow';
    // a trail, or the stony ground up above the trees
    if (g.path > 0.45 || g.above > 0.6) return 'dirt';
    return g.forest > 0.62 ? 'litter' : 'grass';
  }
  player.on('footstep', (run) => sound.footstep(surfaceHere(), run, player.swimming ? 'swim' : 'step', player.wade));
  player.on('jump', () => sound.footstep(surfaceHere(), 0.5, 'jump'));
  player.on('land', (strength) => sound.footstep(surfaceHere(), 1, 'land', strength));

  // ── On and off ────────────────────────────────────────────────────────────
  function toggle() {
    sound.setEnabled(!sound.enabled);
    hud.setSound(sound.enabled);
    hud.flash(sound.enabled ? 'sound on' : 'sound off');
    settings.set('sound', sound.enabled);
  }
  hud.setSound(sound.enabled);
  hud.button('sound-btn', toggle);
  commands.add({ id: 'sound', keys: ['KeyN'], group: 'LOOK', label: 'sound on / off', run: toggle });

  // ── The water you can hear ────────────────────────────────────────────────
  // How much of a source the land hides from the ear: the most the ground
  // rises above the straight line between them.
  function hidden(ear, src) {
    let over = 0;
    for (const f of [0.25, 0.5, 0.75]) {
      const x = ear.x + (src.x - ear.x) * f;
      const z = ear.z + (src.z - ear.z) * f;
      const line = ear.y + (src.y - ear.y) * f;
      over = Math.max(over, chunks.heightAt(x, z) - line);
    }
    return Math.min(1, over / BANK_HIDES);
  }
  // The water going past your legs, for the gurgle round them.
  const wading = { depth: 0, speed: 0, x: 0, y: 0, z: 0 };

  // ── Every frame ───────────────────────────────────────────────────────────
  const water = { sources: [], count: 0, still: 0, sx: 0, sy: 0, sz: 0 };
  let waterCheck = 0;
  game.addSystem({
    name: 'sound',
    phase: 'audio',
    update({ dt, now }) {
      if (now > waterCheck) {
        waterCheck = now + WATER_EVERY;
        chunks.waterAround(player.pos.x, player.pos.z, WATER_REACH, water);
        for (let i = 0; i < water.count; i++) water.sources[i].hidden = hidden(camera.position, water.sources[i]);
      }
      wading.depth = player.wade;
      wading.speed = Math.hypot(player.current.x - player.vel.x, player.current.z - player.vel.z);
      wading.x = player.pos.x;
      wading.y = player.pos.y + Math.min(player.wade, 0.8) * 0.5;
      wading.z = player.pos.z;
      sound.update(dt, {
        hours: sky.hours,
        night: SKY.uNight.value,
        forest: groundHere().forest,
        height: player.pos.y,
        wind: SHARED.uWind.value,
        camera,
        water,
        wading,
      });
    },
  });
}
