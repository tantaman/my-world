// Keeping the world, and the other people in it.
//
// The WorldSave itself is made in main.js, before the game: which world to
// open decides the seed everything else is grown from. This installs the rest
// — the people you share it with, the panel, the key — once there is a world
// for them to be in. What gets saved is registered by each feature as it
// installs (game.save.register); see domains.js.

import { Peers } from '../player/peers.js';
import { SharePanel } from './sharePanel.js';
import { standHeight } from '../player/player.js';

// The features this uses, so it is installed after them (game/features.js).
export const after = ['render', 'ui', 'world', 'player'];
export function installSave(game) {
  const { scene, chunks, player, input, hud, commands, save } = game;

  // Everyone else in this world (someone swimming floats, just as you do).
  const peers = new Peers(scene, (x, z) => standHeight(chunks, x, z));
  game.provide('peers', peers);

  const share = new SharePanel({ save, peers, input, hud });
  game.provide('share', share);
  const toggle = () => {
    if (!share.isOpen) game.emit('panel', 'share');
    share.toggle();
  };
  game.on('panel', (which) => which !== 'share' && share.close());
  commands.add({ id: 'save', keys: ['KeyL'], group: 'WANDER', label: 'save this world · get a link', run: toggle });
  hud.button('save-btn', toggle);

  save.attach({ peers, where: () => ({ x: player.pos.x, z: player.pos.z, yaw: player.yaw }) });

  game.addSystem({ name: 'peers', phase: 'world', update: ({ dt }) => peers.update(dt) });
  // A world on the server sends what you change within a moment, and tells
  // everyone else in it where you are standing; a local one is written down
  // in this browser.
  game.addSystem({ name: 'save', phase: 'late', update: () => save.tick() });
}
