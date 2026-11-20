// What the forest sounds like from where you stand.

import { CONFIG } from '../config.js';
import { Soundscape } from './soundscape.js';
import { SHARED, SKY } from '../render/uniforms.js';

const WATER_EVERY = 250; // ms between looks round for water to hear
const WATER_REACH = 45; // metres

export function installAudio(game) {
  const { chunks, gen, sky, player, camera, hud, commands, settings } = game;

  const sound = new Soundscape();
  const remembered = settings.get('sound', 'boolean');
  if (remembered !== undefined) sound.enabled = remembered;
  if (CONFIG.mute) sound.enabled = false;
  game.provide('sound', sound);

  // ── What's underfoot ──────────────────────────────────────────────────────
  const ground = { h: 0, path: 0, forest: 0 };
  function groundHere() {
    const { x, z } = player.pos;
    if (!chunks.groundAt(x, z, ground)) {
      ground.path = gen.pathMask(x, z);
      ground.forest = gen.forest(x, z);
    }
    return ground;
  }
  function surfaceHere() {
    if (player.wade > 0.04) return 'water';
    const g = groundHere();
    if (g.path > 0.45) return 'dirt';
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

  // ── Every frame ───────────────────────────────────────────────────────────
  const water = { run: 0, foam: 0, rx: 0, ry: 0, rz: 0, still: 0, sx: 0, sy: 0, sz: 0 };
  let waterCheck = 0;
  game.addSystem({
    name: 'sound',
    phase: 'audio',
    update({ dt, now }) {
      if (now > waterCheck) {
        waterCheck = now + WATER_EVERY;
        chunks.waterAround(player.pos.x, player.pos.z, WATER_REACH, water);
      }
      sound.update(dt, {
        hours: sky.hours,
        night: SKY.uNight.value,
        forest: groundHere().forest,
        height: player.pos.y,
        wind: SHARED.uWind.value,
        camera,
        water,
      });
    },
  });
}
