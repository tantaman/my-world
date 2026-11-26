// The jets: when they fire, when they cut out, how the jetpack carries you
// while they burn, how hard they're going and how you hang under them. No
// game in here: index.js hands it the hiker (Player) and the controls each
// frame, after the hiker has moved, and the tests drive it the same way.
//
// On the ground you walk on your own feet, and the jetpack is only something
// on your back. Off the ground (a jump, or a step off a ledge) hold jump a
// moment, or press it again, and the jets fire. From then until you touch
// down the jetpack carries you (Player.carrier, with `fly`, as the eagle
// does): jump held climbs, shift dives and goes faster, and with neither the
// jets throttle back and let you down slowly. Touch down, on the ground, a
// roof or the water, and they cut out: you're on your own feet again.
//
// step() says what happened, if anything:
//   'ignite'  the jets fired: you're flying
//   'landed'  you touched down, and they cut out
//   'lost'    something else carries you now (a horse you called): they're out
//
// Something else that carries you can ask the jets for a push along instead
// of a flight: a skateboard under your feet (skateboarding/). It says it
// wants one each frame (want()), and once they've caught, `along` is how hard
// they're going for it. They fly you nowhere while they do it, so none of the
// above applies: the pushing is the carrier's own to do. It can say which way
// it wants pushing (along, or into a turn it's carving), and the jetpack
// swings round on your back as they catch, flat to it, to point them back
// from that way (swing()).

import { CONFIG } from '../config.js';
import { SWIM_DEPTH } from '../player/player.js';
import { clamp } from '../noise.js';
import { wrapAngle as wrap } from '../core/geom.js';

// s of jump held off the ground before the jets fire: longer than a jump
// takes to tap, so an ordinary jump is still a jump. A push asked for by
// whatever carries you waits the same, so a tap of it is still a tap.
export const HOLD = 0.22;
// m/s up the jets give you as they catch, so lighting them feels like a kick
// (the climb itself builds up from there).
const KICK = 3;
// How the jetpack flies (Player.carrier.fly): m/s along (cruise, and fast
// with shift), m/s up climbing, and down with the jets throttled back (glide)
// and cut to a flicker (dive, with shift); how high over the ground it goes
// (m), and how quickly it gets up to speed and slows (1/s).
export const FLIGHT = { cruise: 12, fast: 24, climb: 8, glide: -1.6, dive: -14, ceiling: 120, agility: 2.2 };
// How hard the jets go (0..1) climbing, gliding, diving, and pushing along
// whatever carries you (full blast: there's nothing to come down from), and
// how quickly (1/s) they spool up and down to it.
export const BURN = { climb: 1, glide: 0.42, dive: 0.12, along: 1, spool: 6 };
// How you hang under it: tipped forward into the way you're going, up to
// `most` radians at full speed; banked into turns, `bank` radians per m/s of
// speed per rad/s of turn, up to `bankMost`; eased at `ease` (1/s).
export const LEAN = { most: 0.55, bank: 0.03, bankMost: 0.5, ease: 4 };
// Pushing something along, the jetpack turns on its mount, flat to your back,
// to point the jets back the way it goes: round at `ease` (1/s), as long as
// `across` (0..1) of that way lies across your back. (Any less and the way
// goes through you, and it stays turned as it was.)
export const SWING = { ease: 12, across: 0.35 };
// The flames show above this much thrust (model.js).
export const LIT = 0.02;

// How you hold yourself flying (Character.stance): feet together and a
// little drawn up, the body upright over them, arms out for balance. The
// root's tilt is the jets' (pitch, roll above), and the body goes with it.
export const FLYING = Object.freeze({
  feet: [
    [0.1, -0.03],
    [-0.1, 0.05],
  ],
  out: [0.12, 0.12],
  crouch: 0.1,
  lean: 0.05,
  tuck: 0.4,
  arms: 'out',
});

// What carries you while the jets burn: your own size and pace (player.js,
// on foot), and its flight. size: how tall you are beside the grown-up
// hiker (player.size).
export function jetCarrier(size = 1) {
  return {
    walk: CONFIG.walkSpeed,
    run: CONFIG.runSpeed,
    swim: 1.3,
    depth: SWIM_DEPTH * size,
    jump: CONFIG.jumpSpeed,
    radius: 0.32,
    height: 1.5 * size,
    eye: 1.45 * size,
    back: 1.5,
    agility: 11,
    turn: 6,
    push: 0,
    fly: { ...FLIGHT },
    landing: false,
  };
}

export class Jets {
  constructor() {
    this.worn = false; // the jetpack is on your back
    this.on = false; // the jets are burning: you're flying
    this.carrier = null; // what carries you while they are (jetCarrier)
    this.hold = null; // ...and what you're held by (player/rides.ts)
    this.thrust = 0; // 0..1 how hard they're going, eased
    this.pitch = 0; // radians the body is tipped forward
    this.roll = 0; // ...and banked to the right
    this.aloft = false; // off the ground, on your own feet, last frame
    this.air = 0; // s off the ground so far
    this.asked = false; // whatever carries you has asked for a push along
    this.ask = 0; // ...and how long (s) it has been asking
    this.pushing = false; // the jets have caught, and are pushing it along
    this.toward = { x: 0, y: 0, z: 1 }; // ...which way it said it goes, in the world
    this.aimed = false; // ...said since the last swing()
    this.aim = 0; // how far round on your back the jetpack swings to push that way (radians)
    this.swung = false; // swung round for a push, until its flames are out
    this.swivel = 0; // how far round it is now (radians about your back's normal: + turns its top to your right)
  }

  // After the hiker has moved this frame.
  //   player    the Player
  //   controls  { held: jump is down, pressed(): was it pressed this frame
  //             (asked only when it would matter, since asking takes it),
  //             blocked: the keys are elsewhere (the map is open) }
  // -> 'ignite' | 'landed' | 'lost' | null
  step(dt, player, controls) {
    if (this.on) {
      // something else has you now (it's theirs to carry you, and left alone)
      if (!this.hold.held || player.carrier !== this.carrier) {
        this.#out();
        return 'lost';
      }
      if (player.grounded) {
        this.hold.release();
        this.#out();
        return 'landed';
      }
      return null;
    }
    const was = this.aloft;
    this.aloft = !player.grounded && !player.swimming;
    this.air = this.aloft ? this.air + dt : 0;
    if (!this.worn || !this.aloft || !player.rides.free || controls.blocked) return null;
    // held since the jump (or the step off the edge), or pressed again up there
    // (not the press that jumped: that frame you weren't up yet)
    if ((controls.held && this.air >= HOLD) || (was && controls.pressed())) {
      const carrier = jetCarrier(player.size);
      const hold = player.rides.take({ by: 'jetpack', what: 'your jetpack', carrier });
      if (!hold) return null;
      this.on = true;
      this.carrier = carrier;
      this.hold = hold;
      player.vel.y = Math.max(player.vel.y, KICK);
      return 'ignite';
    }
    return null;
  }

  // Something else that carries you — a skateboard under your feet — asking
  // the jets for a push along instead of a flight. Say so each frame while you
  // want one: held for HOLD they catch, and they're out as soon as you stop
  // asking. What comes back is how hard they're going for you, which is
  // nothing until they catch; the push itself is yours to give.
  // toward: which way it wants pushing, if you'd say ({ x, y, z }, a unit
  // vector in the world: along the ground, say), for the jets to point back along
  // -> 0..1
  want(toward = null) {
    this.asked = true;
    if (toward) {
      this.toward.x = toward.x;
      this.toward.y = toward.y;
      this.toward.z = toward.z;
      this.aimed = true;
    }
    return this.along;
  }

  // How hard the jets are pushing whatever has you along (0..1).
  get along() {
    return this.pushing ? this.thrust : 0;
  }

  // Cut them out now, wherever you are (taken off, moved somewhere else).
  stop(player) {
    if (!this.on) return;
    this.hold.release();
    this.#out();
  }

  #out() {
    this.on = false;
    this.carrier = null;
    this.hold = null;
    this.pitch = 0;
    this.roll = 0;
    this.aloft = false;
    this.air = 0;
  }

  // How hard the jets are going and how you hang under them, after step().
  // A push asked for by whatever carries you (want()) catches and goes out
  // here too, there being nothing else of it the jetpack does.
  // diving: shift is down.
  update(dt, player, diving) {
    // asked for a push, with the jetpack on your back to give it and no
    // flight of its own in the way: held a moment and the jets catch
    const asked = this.asked && this.worn && !this.on;
    this.asked = false;
    this.ask = asked ? this.ask + dt : 0;
    this.pushing = this.ask >= HOLD;
    const want = this.on ? (player.climbing ? BURN.climb : diving ? BURN.dive : BURN.glide) : this.pushing ? BURN.along : 0;
    this.thrust += (want - this.thrust) * (1 - Math.exp(-dt * BURN.spool));
    if (this.thrust < 1e-3 && !this.on && !this.pushing) this.thrust = 0;
    if (!this.on) return;
    const sy = Math.sin(player.yaw);
    const cy = Math.cos(player.yaw);
    const ahead = player.vel.x * sy + player.vel.z * cy;
    const speed = Math.hypot(player.vel.x, player.vel.z);
    const pitch = LEAN.most * clamp(ahead / FLIGHT.fast, -0.3, 1);
    const roll = clamp(-player.turnRate * speed * LEAN.bank, -LEAN.bankMost, LEAN.bankMost);
    const k = 1 - Math.exp(-dt * LEAN.ease);
    this.pitch += (pitch - this.pitch) * k;
    this.roll += (roll - this.roll) * k;
  }

  // How far the jetpack is turned round on your back, after update(). Flat
  // to your back it hangs upright, the nozzles down; pushing something along,
  // it swings round as they catch to point them back the way it goes (as near
  // as your back lets it), and back upright once their flames are out.
  // toBack(v): v, a direction in the world, turned into the frame of your back
  // (+z into the body, y up the spine, +x to your left), as a new vector or a
  // scratch one. -> radians about your back's normal
  swing(dt, toBack) {
    if (this.aimed) {
      const a = aimAlong(toBack(this.toward));
      if (a !== null) this.aim = a;
      this.aimed = false;
    }
    if (this.pushing) this.swung = true;
    else if (this.on || this.thrust <= LIT) this.swung = false;
    this.swivel += wrap((this.swung ? this.aim : 0) - this.swivel) * (1 - Math.exp(-dt * SWING.ease));
    return this.swivel;
  }
}

// How far round on your back to turn the jetpack (radians about the back's
// normal) for its jets to point back along d, a direction in the back's
// frame; null if d goes through your back more than across it.
export function aimAlong(d) {
  if (Math.hypot(d.x, d.y) < SWING.across * Math.hypot(d.x, d.y, d.z)) return null;
  return Math.atan2(-d.x, d.y);
}
