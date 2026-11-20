// The heads-up display: coordinates, prompts, the tool bar, the help panel.
// Installed early, because nearly everything has something to say on it.

import { Hud } from './hud.js';

export function installHud(game) {
  const hud = new Hud();
  game.provide('hud', hud);

  game.commands.add({ id: 'help', keys: ['KeyH', 'Slash'], run: () => hud.toggleHelp() });

  // The help panel lists whatever keys ended up bound, by whichever features.
  hud.helpSource = () => game.commands.help();
  game.on('ready', () => hud.renderHelp(hud.helpSource()));
  game.on('fault', (system) => hud.flash(`${system.name} has stopped · see the console`));

  game.addSystem({
    name: 'hud',
    phase: 'late',
    update() {
      const { player, sky } = game;
      if (player && sky) hud.update(player.pos, player.camYaw, sky.hours);
    },
  });
}
