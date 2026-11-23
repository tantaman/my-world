// One pad as the whole of someone's controls: what a hiker on another part of
// a split screen walks, looks, swims and jumps with.
//
// It answers what player.js asks of the game's own controls (input.js), by
// the same names, from that one pad alone: the left stick walks, the right
// stick looks, A jumps, B runs (and dives), the d-pad zooms, as BINDINGS has
// them. It has no mouse and no keyboard, and none of the game's commands: the
// buttons left over are the split screen's own (index.ts asks pressed()).

import { Pads } from '../player/gamepad.js';
import { BINDINGS } from '../player/input.js';

const NO_LOOK = Object.freeze({ x: 0, y: 0 });

export class PadControls {
  // index: which pad (Gamepad.index) · list: () => the pads, as
  // navigator.getGamepads() gives them (the browser's, unless given)
  constructor(index, list = undefined) {
    this.index = index;
    this.pads = new Pads(list);
    this.pads.only = new Set([index]);
    this._jumped = false;
    this._axes = { x: 0, y: 0 };
  }

  // Read the pad: once a frame, before its hiker moves.
  read() {
    this.pads.read();
    this._jumped = BINDINGS.jump.some((code) => this.pads.went.has(code));
    return this;
  }

  // Did this button (PadSelect, PadStart…) go down since the last read?
  pressed(code) {
    return this.pads.went.has(code);
  }

  // What kind of pad it is, for what its buttons are called (gamepad.js).
  get kind() {
    return this.pads.kind;
  }

  // ── What player.js asks ───────────────────────────────────────────────────

  consumeLook() {
    return NO_LOOK; // (a distance, from a mouse: there's none)
  }

  lookRate() {
    return this.pads.look;
  }

  consumeZoom() {
    return 0; // (the mouse wheel's)
  }

  isDown(action) {
    return BINDINGS[action].some((code) => this.pads.down.has(code));
  }

  // x right, y forward, in [-1, 1]. (Player may change what it's handed.)
  moveAxes() {
    this._axes.x = this.pads.move.x;
    this._axes.y = -this.pads.move.y;
    return this._axes;
  }

  running() {
    return this.isDown('run');
  }

  diving() {
    return this.isDown('run');
  }

  jumped() {
    const j = this._jumped;
    this._jumped = false;
    return j;
  }
}
