// What player provides to the game, and so what `game.<name>` is for the
// features that come after it (see the top of game/game.ts). Its index.js
// is still JavaScript, which is why this is said here and not beside it.

import type { Player } from './player.js';

declare module '../game/game.ts' {
  interface Services {
    player: Player;
  }
}
