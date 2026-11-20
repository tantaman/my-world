// Campfires: ring a pit with stones, lay a fire, light it, feed it, put it
// out. Everything about them lives in this folder; this plugs them into the
// game.
//
//   fires.js      what a fire is, how it burns down, and how it is saved
//   tool.js       the campfire tool on the tool bar
//   look.js       flames, glowing coals, smoke and sparks
//   geometry.js   the stone ring, the teepee of firewood, the ash
//   sound.js      the crackle, and the strike, catch and hiss

import { Fires, FIRE, firesSave } from './fires.js';
import { campfireTool } from './tool.js';
import { crackle } from './sound.js';

// How much room a fire ring needs from other work, past its centre (m).
const ROOM = {
  dig: FIRE.ring + 0.5, // the shovel leaves the pit alone
  wall: FIRE.ring, // no wall through it
  footing: FIRE.ring + 0.6, // no footing in it
  roof: 0.5, // and no roof over it: no room within this of it can be roofed
};

// The features this uses, so it is installed after them (game/features.js).
export const after = ['render', 'world', 'audio', 'build'];
export function installFires(game) {
  const { scene, camera, solids, sky, builder, sound, save } = game;

  const fires = new Fires({ scene, solids, sky });
  game.provide('fires', fires);

  builder.register(campfireTool(fires, solids));
  builder.obstacles.addSource((x, z, R, out) => {
    for (const f of fires.list.values()) {
      if (Math.hypot(f.x - x, f.z - z) < R + 1) out.push({ x: f.x, z: f.z, what: 'a fire ring', ...ROOM, roofWhy: 'no chimney' });
    }
  });

  // Part of the world, so shared with everyone in it. A fire burning down
  // changes nothing that is saved: only making, laying, lighting, feeding,
  // putting out and taking apart do.
  save.register({ ...firesSave, collect: () => fires.serialize(), restore: (data) => fires.load(data), adopt: (data) => fires.adopt(data) });
  fires.on('change', () => save.touch());

  sound.addLayer(crackle(fires));

  // After the tools (update) and before the sound (audio): what you just lit
  // is lit, and heard, this frame.
  game.addSystem({ name: 'fires', phase: 'world', update: ({ dt }) => fires.update(dt, camera.position) });
}
