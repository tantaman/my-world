// The heads-up display: coordinates, prompts, the tool bar, the help panel
// and the settings panel. Nearly everything has something to say on it, so
// nearly every feature comes after this one. It comes after nothing itself.

import { Hud } from './hud.js';
import { SettingsPanel } from './settingsPanel.js';

export function installHud(game) {
  // The settings panel has the keyboard while it's open. The keyboard comes
  // later (the player feature), so it's asked for when the panel opens.
  const settings = new SettingsPanel({ block: (on) => game.input && game.input.setBlocked(on) });
  const hud = new Hud({ settings });
  game.provide('hud', hud);

  // One panel at a time: opening help or the settings (they sit in the same
  // corner) closes whatever else is up.
  const toggleHelp = () => {
    if (!hud.helpOpen) game.emit('panel', 'help');
    hud.toggleHelp();
  };
  game.on('panel', (which) => which !== 'help' && hud.closeHelp());
  game.commands.add({ id: 'help', keys: ['KeyH', 'Slash'], run: toggleHelp });
  hud.button('help-btn', toggleHelp);

  const toggleSettings = () => {
    if (!settings.isOpen) game.emit('panel', 'settings');
    settings.toggle();
  };
  game.on('panel', (which) => which !== 'settings' && settings.close());
  game.commands.add({ id: 'settings', keys: ['KeyO'], group: 'LOOK', label: 'settings · the picture, sound, the hour', run: toggleSettings });
  hud.button('settings-btn', toggleSettings);

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
      if (player) hud.updateGuide(player.pos, player.camYaw);
      settings.refresh();
    },
  });
}
