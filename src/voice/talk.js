// Whether you are talking, and how: aloud, to whoever is near enough to hear,
// or on the radio, to everyone in the world.
//
// Push to talk: each frame you are told which of the two is being held, and
// this decides what goes out. Letting go doesn't cut you off on the instant —
// the last word is still on its way out of your mouth, and still in the
// network — so you stay on for HANG seconds after. The radio wins if both are
// held; let go of it and keep talking, and you are straight back to talking
// aloud.

import { Emitter } from '../core/events.js';

export const QUIET = '';
export const ALOUD = 'aloud';
export const RADIO = 'radio';
export const MODES = [QUIET, ALOUD, RADIO];

const HANG = 0.3; // seconds you stay on after letting go

// Emits:
//   'change'  (mode, was)   you started or stopped talking, or switched how
export class Talk extends Emitter {
  constructor({ hang = HANG } = {}) {
    super();
    this.hang = hang;
    this.mode = QUIET;
    this.quiet = 0; // seconds since anything was held
  }

  get talking() {
    return this.mode !== QUIET;
  }

  // held: { aloud, radio }, what is being held down this frame. -> the mode.
  update(dt, held) {
    const want = held.radio ? RADIO : held.aloud ? ALOUD : QUIET;
    if (want !== QUIET) {
      this.quiet = 0;
      this.#set(want);
    } else if (this.mode !== QUIET) {
      this.quiet += dt;
      if (this.quiet >= this.hang) this.#set(QUIET);
    }
    return this.mode;
  }

  // Off at once, hang or no hang: you have left, or been cut off.
  stop() {
    this.quiet = 0;
    this.#set(QUIET);
  }

  #set(mode) {
    if (mode === this.mode) return;
    const was = this.mode;
    this.mode = mode;
    this.emit('change', mode, was);
  }
}
