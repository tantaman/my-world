// You: the controls, the hiker, the camera that follows. Which hiker you are
// (hikers.js) is yours to choose on the settings panel, and remembered here.

import { Input } from './input.js';
import { padNames } from './gamepad.js';
import { Player } from './player.js';
import { HIKERS, hiker } from './hikers.js';
import { SHARED, WADE } from '../render/uniforms.js';

const round = (v, f = 100) => Math.round(v * f) / f;
const finite = (v, otherwise) => (Number.isFinite(v) ? v : otherwise);

// The features this uses, so it is installed after them (game/features.js).
export const after = ['render', 'ui', 'world'];
export function installPlayer(game) {
  const { scene, camera, chunks, gen, solids, spaces, basins, hud, commands, save, settings } = game;

  const input = new Input(game.renderer.domElement);
  const player = new Player({ scene, camera, world: chunks, input, solids, spaces, basins, who: hiker(settings.get('hiker', 'string')) });
  game.provide('input', input);
  game.provide('player', player);

  input.on('touch', () => hud.showTouchActions());
  // With a pad in hand the help panel and the prompts call the controls by its
  // buttons, the button the d-pad has gone to in a panel is ringed (body.pad,
  // in index.html), and the first time, it says where to find them.
  let padSeen = false;
  input.on('pad', (on) => {
    hud.namePad(on ? (codes) => padNames(codes, input.pads.kind) : null);
    document.body.classList.toggle('pad', on);
    if (on && !padSeen) hud.flash(`controller ready · ${input.pads.name('PadStart')} lists its buttons`, 3000);
    padSeen ||= on;
  });
  input.bindButton(document.getElementById('act-use'), 'use');
  input.bindButton(document.getElementById('act-alt'), 'alt');
  // on a touch screen, a button to dive with, there while you're out of your depth
  const diveBtn = document.getElementById('act-dive');
  input.bindButton(diveBtn, 'dive');

  // Where the path starts, and where you appear when the world opens: there,
  // unless a save remembers where you were standing. Under the ground (in a
  // cave) how high you were is kept too, or you'd come back on the hill above.
  player.start = gen.findSpawn(0, 0);
  player.arrival = player.start;
  save.register({
    id: 'player',
    scope: 'yours',
    local: 'state',
    collect: () => ({
      x: round(player.pos.x),
      z: round(player.pos.z),
      ...(player.space ? { y: round(player.pos.y) } : {}),
      yaw: round(player.yaw, 1000),
      camYaw: round(player.camYaw, 1000),
      camPitch: round(player.camPitch, 1000),
    }),
    validate: (p) => {
      const at = p && typeof p === 'object' ? p : {};
      return { x: finite(at.x, null), z: finite(at.z, null), y: finite(at.y, undefined), yaw: finite(at.yaw, 0), camYaw: finite(at.camYaw, undefined), camPitch: finite(at.camPitch, undefined) };
    },
    restore: (p) => {
      if (p && p.x !== null && p.z !== null) player.arrival = p;
    },
  });

  // Who you are: a preference of this browser's, not the world's (two people
  // can be in one world as whoever they like), told to the others here with
  // where you are standing (save/index.js).
  hud.setting({
    id: 'hiker',
    group: 'YOU',
    label: 'who is hiking',
    options: HIKERS.map((h) => ({ value: h.id, label: h.name })),
    get: () => player.character.who.id,
    set: (id) => {
      player.be(hiker(id));
      settings.set('hiker', player.character.who.id);
    },
  });

  commands.describe({ group: 'WANDER', help: 'W A S D', pad: ['PadLS'], label: 'walk' });
  commands.describe({ group: 'WANDER', help: 'shift', pad: ['PadB'], label: 'run' });
  commands.describe({ group: 'WANDER', help: 'space', pad: ['PadA'], label: 'jump' });
  commands.describe({ group: 'WANDER', help: 'shift · space', pad: ['PadB', 'PadA'], label: 'out of your depth: dive · come up' });
  commands.describe({ group: 'WANDER', help: 'W · mouse', pad: ['PadLS', 'PadRS'], label: 'under water, swim where you look' });
  commands.describe({ group: 'WANDER', help: 'mouse · Q E', pad: ['PadRS'], label: 'look around' });
  commands.describe({ group: 'WANDER', help: 'scroll', pad: ['PadUp', 'PadDown'], label: 'zoom' });
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
      const canDive = player.swimming && !player.carrier;
      if (diveBtn && diveBtn.hidden === canDive) diveBtn.hidden = !canDive;
      if (player.hasMoved) hud.hideHint();
      SHARED.uPlayer.value.copy(player.pos);
      // ripples and froth around your legs, more when you're moving
      const speed = Math.hypot(player.vel.x, player.vel.z);
      const wade = player.wade > 0.02 && player.under < 0.8 ? Math.min(1, player.wade * 3) * (0.35 + 0.65 * Math.min(1, speed / 2)) : 0;
      WADE.uWade.value += (wade - WADE.uWade.value) * (1 - Math.exp(-dt * 4));
      // the water going past your legs: the current, less your own way through it
      WADE.uWadeFlow.value.set(player.current.x - player.vel.x, player.current.z - player.vel.z);
    },
  });
}
