// What world provides to the game, and so what `game.<name>` is for the
// features that come after it (see the top of game/game.ts). Its index.js
// is still JavaScript, which is why this is said here and not beside it.

import type { ChunkManager } from './chunks.js';
import type { Grass } from './grass.js';
import type { Sky } from './sky.js';
import type { Landforms } from './landforms.js';
import type { Solids } from './solids.js';
import type { Breakers } from './breakers.js';
import type { Spaces } from './spaces.js';
import type { Basins } from './basins.js';
import type { Paved } from './paved.ts';
import type { Vector3, Material } from 'three';
import type { growWorld } from './lands.js';

declare module '../game/game.ts' {
  interface Services {
    gen: ReturnType<typeof growWorld>;
    materials: { vegetation: Material; vegetationShadow: Material; [name: string]: Material };
    chunks: ChunkManager;
    grass: Grass;
    sky: Sky;
    landforms: Landforms;
    solids: Solids;
    breakers: Breakers;
    spaces: Spaces;
    basins: Basins;
    paved: Paved;
    focus: Vector3;
    followed: Set<{ x: number; z: number }>;
  }
}
