// Who has you: the one thing that is carrying you or moving you, and whose
// it is.
//
// Being carried (player.carrier: a horse, a canoe, a jetpack) and being moved
// (player.aboard: a train, skis, a tube) are the two ways the hiker stops
// going about on their own feet, and one rule covers both: one at a time.
// Each ride used to set those two itself, behind a check of its own (or none)
// that nothing else had you, and then watched every frame for having been
// elbowed out. Now a ride asks for you here, and is told if it loses you:
//
//   const hold = player.rides.take({
//     by: 'tubing',                 // whose it is
//     what: 'your tube',            // how to name it, to whoever is told to get off it first
//     aboard: mover,                // what moves you (and/or carrier: what carries you)
//     lost: (why) => stow(),        // it has been taken from you: put it away
//   });
//   if (!hold) return hud.flash(player.rides.why());   // 'get off your horse first'
//   …
//   hold.release();                 // you got off
//
// While it has you a ride can change what it has you by (a canoe is slid
// down the bank, which moves you, then floats, which carries you):
// hold.set({ aboard: null }).
//
// A ride loses you without letting go in two ways, and `lost` says which:
//
//   'moved'   you were put somewhere else (a teleport, a place picked on
//             the map) further than the ride's `slack` (m) from where it
//             last had you. Only what moves you (aboard) gives a slack;
//             leave it out and being moved is the ride's own business (a
//             train puts you back in your seat).
//   'taken'   something set player.carrier or player.aboard without asking
//             (nothing in the game does; the console might).
//
// By the time `lost` is called you are already on your own feet.

import type { Player } from './player.js';

// Something carrying you. Player only needs to know how it moves, not what
// it is (its owner draws it).
export interface Carrier {
  walk: number; // m/s on the ground
  run: number; // ...with shift
  swim: number; // m/s out of its depth
  swimRun?: number; // ...with shift, if faster
  depth: number; // deeper than this (m) it swims, feet this far under
  jump?: number; // take-off speed (m/s), 0 if it can't
  radius: number; // how wide it is, to trunks and walls (m)
  height: number; // head room it needs, rider and all (m)
  eye: number; // how high above its feet the camera looks (m)
  back: number; // how much further back the camera sits to take it in (m)
  agility: number; // how quickly it gets up to speed (1/s)
  turn: number; // how quickly it turns the way it's going (1/s)
  push: number; // how much of the current carries it (0..1)
  keel?: number; // if it floats (a boat): the water it needs (m)
  bow?: number; // ...and how far ahead of its middle that has to hold (m)
  fly?: Flight | null; // if it flies
  landing?: boolean; // set by its owner while it comes down to land
}

// How something that flies goes: m/s along and up (glide and dive sink, so
// are negative), and how high over the ground it goes (m).
export interface Flight {
  cruise: number;
  fast: number;
  climb: number;
  glide: number;
  dive: number;
  ceiling: number;
  agility: number;
}

// Where something that moves you says you are this frame.
export interface Placed {
  x: number;
  y: number; // where your feet are
  z: number;
  yaw: number; // which way you face
  heading?: number; // which way you're going, if not the way you face
  grounded: boolean; // false while you're off the ground
  behind: number; // how quickly (1/s) the camera swings round behind the way you're going
  back: number; // how much further back the camera sits (m)
  wade: number; // how deep in the water you sit (m), if you're in it
  flowX: number; // ...and which way it runs (m/s)
  flowZ: number;
}

// Something that moves you itself. Your keys don't move you while it does
// (it may read them itself, as skis do).
export interface Aboard {
  place(out: Placed, dt: number): void;
  posesCharacter?: boolean; // true while the ride places and animates the hiker itself
  slack?: number; // put further than this (m) from where it had you, you're out of it ('moved')
}

export type LostWhy = 'moved' | 'taken';

export interface Ride {
  by: string;
  what: string | (() => string);
  carrier?: Carrier | null;
  aboard?: Aboard | null;
  lost?(why: LostWhy): void;
}

// What a ride holds you by, from take() until it lets go or loses you.
export class Hold {
  held = true;
  readonly ride: Ride;
  private rides: Rides;

  constructor(rides: Rides, ride: Ride) {
    this.rides = rides;
    this.ride = ride;
  }

  // Change what carries or moves you, while this has you. What isn't named
  // stays as it is.
  set(parts: { carrier?: Carrier | null; aboard?: Aboard | null }): void {
    if (this.held) this.rides._set(this, parts);
  }

  // You got off. (Letting go twice, or after losing you, does nothing.)
  release(): void {
    if (this.held) this.rides._release(this);
  }
}

export class Rides {
  private player: Player;
  private hold: Hold | null = null;
  // where what moves you last put you, for telling that something else has moved you since
  private put: { x: number; y: number; z: number } | null = null;

  constructor(player: Player) {
    this.player = player;
  }

  // Nothing has you: you're on your own feet (or swimming).
  get free(): boolean {
    return !this.player.carrier && !this.player.aboard;
  }

  // Whose you are, as its ride said it ('mounts'), or null: free, or had by
  // something that didn't ask.
  get by(): string | null {
    return this.hold ? this.hold.ride.by : null;
  }

  // What has you, by name: 'your horse'. ('' when nothing has.)
  get what(): string {
    if (this.free) return '';
    const what = this.hold ? this.hold.ride.what : '';
    return (typeof what === 'function' ? what() : what) || 'what you’re on';
  }

  // What to tell someone who can't do a thing because of what has them.
  why(): string {
    return this.free ? '' : `get off ${this.what} first`;
  }

  // -> the hold, or null while something else has you.
  take(ride: Ride): Hold | null {
    this.check();
    if (!this.free) return null;
    const hold = new Hold(this, ride);
    this.hold = hold;
    this.put = null;
    this._set(hold, { carrier: ride.carrier ?? null, aboard: ride.aboard ?? null });
    return hold;
  }

  // Take you from whatever has you (it's told, as 'taken'), to put you
  // somewhere it couldn't follow.
  drop(): void {
    this._lose('taken');
  }

  // ── For the player ──────────────────────────────────────────────────────

  // Each frame, before you're moved: has something set what carries or
  // moves you over the hold's head, or put you somewhere else?
  check(): void {
    const hold = this.hold;
    if (!hold) return;
    const p = this.player;
    if (p.carrier !== (hold.ride.carrier ?? null) || p.aboard !== (hold.ride.aboard ?? null)) {
      // whoever did it has you now: leave what they set alone
      this.hold = null;
      this.put = null;
      hold.held = false;
      if (hold.ride.lost) hold.ride.lost('taken');
      return;
    }
    const a = hold.ride.aboard;
    if (a && a.slack !== undefined && this.put && Math.hypot(p.pos.x - this.put.x, p.pos.y - this.put.y, p.pos.z - this.put.z) > a.slack) this._lose('moved');
  }

  // What moves you has put you here (each frame it does).
  placed(x: number, y: number, z: number): void {
    if (!this.hold) return;
    if (!this.put) this.put = { x, y, z };
    else {
      this.put.x = x;
      this.put.y = y;
      this.put.z = z;
    }
  }

  // ── For a hold ──────────────────────────────────────────────────────────

  _set(hold: Hold, parts: { carrier?: Carrier | null; aboard?: Aboard | null }): void {
    if (this.hold !== hold) return;
    const p = this.player;
    if ('carrier' in parts) p.carrier = hold.ride.carrier = parts.carrier ?? null;
    if ('aboard' in parts) {
      if (p.aboard !== (parts.aboard ?? null)) this.put = null;
      p.aboard = hold.ride.aboard = parts.aboard ?? null;
    }
  }

  _release(hold: Hold): void {
    if (this.hold !== hold) return;
    this._clear(hold);
  }

  private _clear(hold: Hold): void {
    this.hold = null;
    this.put = null;
    hold.held = false;
    // (only what was its own: if something has set these over its head, they're that thing's now)
    const p = this.player;
    if (p.carrier === (hold.ride.carrier ?? null)) p.carrier = null;
    if (p.aboard === (hold.ride.aboard ?? null)) p.aboard = null;
  }

  private _lose(why: LostWhy): void {
    const hold = this.hold;
    if (!hold) {
      // had by something that didn't ask: it can only be let go of
      this.player.carrier = null;
      this.player.aboard = null;
      return;
    }
    this._clear(hold);
    if (hold.ride.lost) hold.ride.lost(why);
  }
}
