// The animals. Never saved or shared: each visitor meets their own.

import { Wildlife } from './wildlife.js';
import { SKY } from '../render/uniforms.js';

// The features this uses, so it is installed after them (game/features.js).
export const after = ['render', 'ui', 'world', 'player', 'audio', 'save'];
export function installWildlife(game) {
  const { scene, camera, gen, chunks, solids, player, peers, sound, hud, sky } = game;
  const wildlife = new Wildlife({ scene, gen, chunks, solids, player, peers, sound, camera, hud });
  game.provide('wildlife', wildlife);
  game.addSystem({
    name: 'wildlife',
    phase: 'world',
    update: ({ dt }) => wildlife.update(dt, { hours: sky.hours, night: SKY.uNight.value }),
  });
}
