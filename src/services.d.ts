// What main.js provides before any feature installs: the save, opened first
// because the seed and the land are inside it, and what the visitor prefers.

import type { WorldSave } from './save/worldSave.js';
import type { Settings } from './game/settings.js';

declare module './game/game.ts' {
  interface Services {
    save: WorldSave;
    settings: Settings;
  }
}
