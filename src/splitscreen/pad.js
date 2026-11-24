// One pad as the whole of someone's controls: what a hiker on another part of
// a split screen walks, looks, swims and jumps with.
//
// It answers what player.js asks of the game's own controls (input.js), by
// the same names, from that one pad alone: the left stick walks, the right
// stick looks, A jumps, B runs (and dives), the d-pad zooms, as BINDINGS has
// them. It has no mouse and no keyboard, and none of the game's commands: the
// buttons left over are the split screen's own (index.ts asks pressed()).
//
// While their panel is open (partHud.ts) the pad is the panel's: `blocked`,
// and the hiker is told nothing, as yours is while a panel has the keyboard.

import { Pads, padNames } from '../player/gamepad.js';
import { BINDINGS } from '../player/input.js';

const NO_LOOK = Object.freeze({ x: 0, y: 0 });

export class PadControls {
  // index: which pad (Gamepad.index) · list: () => the pads, as
  // navigator.getGamepads() gives them (the browser's, unless given)
  constructor(index, list = undefined) {
    this.index = index;
    this.pads = new Pads(list);
    this.pads.only = new Set([index]);
    // The pad is working something else (their panel): nothing it does is
    // walking, looking or jumping, though pressed() still answers.
    this.blocked = false;
    this._jumped = false;
    this._axes = { x: 0, y: 0 };
  }

  // Read the pad: once a frame, before its hiker moves.
  read() {
    this.pads.read();
    this._jumped = !this.blocked && BINDINGS.jump.some((code) => this.pads.went.has(code));
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

  // What the pad does, by what its buttons are called, for their panel to
  // list: [{ keys, does }]. locked: is their camera locked behind them
  // (player.js)? Then the sticks turn them.
  keys(locked = false) {
    const named = (...codes) => padNames(codes, this.kind);
    return [
      { keys: named('PadLS'), does: locked ? 'walk · left and right turn you' : 'walk' },
      { keys: named('PadRS'), does: locked ? 'turn · look up and down' : 'look around' },
      { keys: named('PadA'), does: 'jump · out of your depth, come up' },
      { keys: named('PadB'), does: 'run · out of your depth, dive' },
      { keys: named('PadUp', 'PadDown'), does: 'zoom · all the way in, your eyes' },
      { keys: named('PadSelect'), does: 'be someone else' },
    ];
  }

  // ── What player.js asks ───────────────────────────────────────────────────

  consumeLook() {
    return NO_LOOK; // (a distance, from a mouse: there's none)
  }

  lookRate() {
    return this.blocked ? NO_LOOK : this.pads.look;
  }

  consumeZoom() {
    return 0; // (the mouse wheel's)
  }

  isDown(action) {
    return !this.blocked && BINDINGS[action].some((code) => this.pads.down.has(code));
  }

  // x right, y forward, in [-1, 1]. (Player may change what it's handed.)
  moveAxes() {
    this._axes.x = this.blocked ? 0 : this.pads.move.x;
    this._axes.y = this.blocked ? 0 : -this.pads.move.y;
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
