// What src/jetpack/index.js provides as game.jetpack, while it is still
// JavaScript (see the top of src/game/game.ts).

import type { Jets } from './jets.js';
import type { rackAt } from './rack.js';

export interface Jetpack {
  rack: ReturnType<typeof rackAt>;
  jets: Jets;
  readonly have: boolean; // it's on your back
  readonly flying: boolean; // ...and the jets are carrying you
  // Something that carries you asking the jets for a push along instead of a
  // flight: say so each frame while you want one. -> 0..1, how hard they're
  // going for you (nothing until they catch, a moment after).
  want(): number;
  readonly along: number; // the same, without asking
  go(): Promise<{ x: number; z: number } | null>; // stand in front of the rack
  give(on?: boolean): boolean; // strapped on, or off again, wherever you are
  state(): { have: boolean; flying: boolean; pushing: boolean; thrust: number; height: number };
}

declare module '../game/game.ts' {
  interface Services {
    jetpack: Jetpack;
  }
}
