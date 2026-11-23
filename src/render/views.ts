// More than one picture on the screen at once: a split screen, with a camera
// for each part of it.
//
//   views.show([{ camera, rect, before, after }, …])   split it between these
//   views.show([])                                     one picture again
//
// rect is where a part is: { x, y, w, h }, fractions of the screen from its
// top left. The first part is the game's own camera, drawn through the game's
// own pipeline, which is fitted to the part while the screen is split and
// given the whole of it back after (whole()). Each of the others is drawn
// through a pipeline of its own, made like it: it takes on how the game's
// own looks as it draws (pipeline.lookLike: pixel art, the haze a country
// has) and shares its lights, and what is drawn into their shadows
// (casters.ts), picked again for where they are as each part is drawn. So
// each part is drawn as finely as it is big, and has an eye of its own to
// adjust to the light (pipeline.js, 5.).
//
// Everything else is the same for every part: one scene, one sky, one
// world, drawn from each camera in turn. What differs between them besides
// the camera (whose hiker the grass parts round, where the sun's shadows are
// drawn) is said by before(), called just before a part is drawn, and put
// back by after(), once it has been.
//
// A camera's aspect is the part's; the render feature draws each part as it
// would the whole screen.

import { Vector2 } from 'three';
import type { WebGLRenderer, PerspectiveCamera } from 'three';
import { Pipeline } from './pipeline.js';

// Where a part of the screen is: fractions of it, from its top left.
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Part {
  camera: PerspectiveCamera;
  rect: Rect;
  before?(): void;
  after?(): void;
}

const _size = new Vector2();

// A camera made to fit a picture of this shape (width over height).
function fit(camera: PerspectiveCamera, aspect: number): void {
  if (!(aspect > 0) || camera.aspect === aspect) return;
  camera.aspect = aspect;
  camera.updateProjectionMatrix();
}

export class Views {
  parts: Part[] = [];
  private renderer: WebGLRenderer;
  private pipeline: Pipeline;
  private camera: PerspectiveCamera;
  private pipes: Pipeline[] = []; // for the parts after the first
  private whole_ = true;

  // pipeline, camera: the game's own, which the first part is drawn through
  constructor(renderer: WebGLRenderer, pipeline: Pipeline, camera: PerspectiveCamera) {
    this.renderer = renderer;
    this.pipeline = pipeline;
    this.camera = camera;
  }

  // Is the screen split between more than one camera?
  get split(): boolean {
    return this.parts.length > 1;
  }

  // Split the screen between these parts, or none (or one) for it whole.
  show(parts: Part[]): void {
    this.parts = parts;
    const want = Math.max(0, parts.length - 1);
    while (this.pipes.length > want) this.pipes.pop()!.dispose();
  }

  // Draw every part: each(pipeline, camera) draws the scene the way the
  // whole screen is otherwise drawn, and here it lands in the part.
  draw(each: (pipeline: Pipeline, camera: PerspectiveCamera) => void): void {
    const r = this.renderer;
    r.getSize(_size);
    const W = _size.x;
    const H = _size.y;
    const dpr = r.getPixelRatio();
    this.whole_ = false;
    try {
      for (let i = 0; i < this.parts.length; i++) {
        const part = this.parts[i];
        const { x, y, w, h } = part.rect;
        const left = Math.round(x * W);
        const top = Math.round(y * H);
        const width = Math.round((x + w) * W) - left;
        const height = Math.round((y + h) * H) - top;
        if (width < 1 || height < 1) continue;
        let pipe = this.pipeline;
        if (i > 0) {
          pipe = this.pipes[i - 1] ??= new Pipeline(r, { lights: this.pipeline.lights, casters: this.pipeline.casters });
          pipe.lookLike(this.pipeline);
        }
        const pw = Math.round(width * dpr);
        const ph = Math.round(height * dpr);
        if (pipe.screenW !== pw || pipe.screenH !== ph) pipe.setSize(pw, ph);
        fit(part.camera, width / height);
        // (three.js counts a viewport from the bottom)
        r.setViewport(left, H - top - height, width, height);
        r.setScissor(left, H - top - height, width, height);
        r.setScissorTest(true);
        part.before?.();
        try {
          each(pipe, part.camera);
        } finally {
          part.after?.();
        }
      }
    } finally {
      r.setViewport(0, 0, W, H);
      r.setScissor(0, 0, W, H);
      r.setScissorTest(false);
    }
  }

  // The whole screen to the game's own camera and pipeline again: when it
  // isn't split, or while something other than the forest is drawn over all
  // of it (game.covered: the map, a place of its own).
  whole(): void {
    if (this.whole_) return;
    this.whole_ = true;
    this.renderer.getSize(_size);
    const dpr = this.renderer.getPixelRatio();
    this.pipeline.setSize(Math.floor(_size.x * dpr), Math.floor(_size.y * dpr));
    fit(this.camera, _size.x / _size.y);
  }
}
