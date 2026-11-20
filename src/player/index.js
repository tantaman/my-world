// You: the controls, the hiker, the camera that follows.

import { Input } from './input.js';
import { Player } from './player.js';
import { SHARED, WADE } from '../render/uniforms.js';

const round = (v, f = 100) => Math.round(v * f) / f;
const finite = (v, otherwise) => (Number.isFinite(v) ? v : otherwise);

export function installPlayer(game) {
  const { scene, camera, chunks, gen, solids, hud, commands, save } = game;

  const input = new Input(game.renderer.domElement);
  const player = new Player({ scene, camera, world: chunks, input, solids });
  game.provide('input', input);
  game.provide('player', player);

  input.on('touch', () => hud.showTouchActions());
  input.bindButton(document.getElementById('act-use'), 'use');
  input.bindButton(document.getElementById('act-alt'), 'alt');

  // Where the path starts, and where you appear when the world opens: there,
  // unless a save remembers where you were standing.
  player.start = gen.findSpawn(0, 0);
  player.arrival = player.start;
  save.register({
    id: 'player',
    scope: 'yours',
    local: 'state',
    collect: () => ({ x: round(player.pos.x), z: round(player.pos.z), yaw: round(player.yaw, 1000), camYaw: round(player.camYaw, 1000), camPitch: round(player.camPitch, 1000) }),
    validate: (p) => {
      const at = p && typeof p === 'object' ? p : {};
      return { x: finite(at.x, null), z: finite(at.z, null), yaw: finite(at.yaw, 0), camYaw: finite(at.camYaw, undefined), camPitch: finite(at.camPitch, undefined) };
    },
    restore: (p) => {
      if (p && p.x !== null && p.z !== null) player.arrival = p;
    },
  });

  commands.describe({ group: 'WANDER', help: 'W A S D', label: 'walk' });
  commands.describe({ group: 'WANDER', help: 'shift', label: 'run' });
  commands.describe({ group: 'WANDER', help: 'space', label: 'jump' });
  commands.describe({ group: 'WANDER', help: 'mouse · Q E', label: 'look around' });
  commands.describe({ group: 'WANDER', help: 'scroll', label: 'zoom' });
  commands.add({
    id: 'home',
    keys: ['KeyR'],
    group: 'WANDER',
    label: 'back to the start',
    run() {
      const s = player.start;
      player.spawn(s.x, s.z, s.yaw);
      hud.flash('back to the start');
    },
  });

  game.addSystem({
    name: 'player',
    phase: 'update',
    update({ dt }) {
      player.update(dt);
      game.focus.copy(player.pos); // the world streams in around you
      if (player.hasMoved) hud.hideHint();
      SHARED.uPlayer.value.copy(player.pos);
      // ripples and froth around your legs, more when you're moving
      const speed = Math.hypot(player.vel.x, player.vel.z);
      const wade = player.wade > 0.02 ? Math.min(1, player.wade * 3) * (0.35 + 0.65 * Math.min(1, speed / 2)) : 0;
      WADE.uWade.value += (wade - WADE.uWade.value) * (1 - Math.exp(-dt * 4));
    },
  });
}
