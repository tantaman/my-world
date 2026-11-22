// What render provides to the game, and so what `game.<name>` is for the
// features that come after it (see the top of game/game.ts). Its index.js
// is still JavaScript, which is why this is said here and not beside it.

import type { WebGLRenderer, Scene, PerspectiveCamera } from 'three';
import type { Origin } from './origin.js';
import type { Pipeline } from './pipeline.js';
import type { Lights } from './lights.js';

declare module '../game/game.ts' {
  interface Services {
    renderer: WebGLRenderer;
    origin: Origin;
    scene: Scene;
    camera: PerspectiveCamera;
    pipeline: Pipeline;
    lights: Lights;
  }
}
