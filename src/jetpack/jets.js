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

import { CONFIG } from '../config.js';
import { SWIM_DEPTH } from '../player/player.js';
import { clamp } from '../noise.js';

// s of jump held off the ground before the jets fire: longer than a jump
// takes to tap, so an ordinary jump is still a jump.
export const HOLD = 0.22;
// m/s up the jets give you as they catch, so lighting them feels like a kick
// (the climb itself builds up from there).
const KICK = 3;
// How the jetpack flies (Player.carrier.fly): m/s along (cruise, and fast
// with shift), m/s up climbing, and down with the jets throttled back (glide)
// and cut to a flicker (dive, with shift); how high over the ground it goes
// (m), and how quickly it gets up to speed and slows (1/s).
export const FLIGHT = { cruise: 12, fast: 24, climb: 8, glide: -1.6, dive: -14, ceiling: 120, agility: 2.2 };
// How hard the jets go (0..1) climbing, gliding and diving, and how quickly
// (1/s) they spool up and down to it.
export const BURN = { climb: 1, glide: 0.42, dive: 0.12, spool: 6 };
// How you hang under it: tipped forward into the way you're going, up to
// `most` radians at full speed; banked into turns, `bank` radians per m/s of
// speed per rad/s of turn, up to `bankMost`; eased at `ease` (1/s).
export const LEAN = { most: 0.55, bank: 0.03, bankMost: 0.5, ease: 4 };

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
// on foot), and its flight.
export function jetCarrier() {
  return {
    walk: CONFIG.walkSpeed,
    run: CONFIG.runSpeed,
    swim: 1.3,
    depth: SWIM_DEPTH,
    jump: CONFIG.jumpSpeed,
    radius: 0.32,
    height: 1.5,
    eye: 1.45,
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
    this.thrust = 0; // 0..1 how hard they're going, eased
    this.pitch = 0; // radians the body is tipped forward
    this.roll = 0; // ...and banked to the right
    this.aloft = false; // off the ground, on your own feet, last frame
    this.air = 0; // s off the ground so far
  }

  // After the hiker has moved this frame.
  //   player    the Player
  //   controls  { held: jump is down, pressed(): was it pressed this frame
  //             (asked only when it would matter, since asking takes it),
  //             blocked: the keys are elsewhere (the map is open) }
  // -> 'ignite' | 'landed' | 'lost' | null
  step(dt, player, controls) {
    if (this.on) {
      if (player.carrier !== this.carrier) {
        this.#out();
        return 'lost';
      }
      if (player.grounded) {
        player.carrier = null;
        this.#out();
        return 'landed';
      }
      return null;
    }
    const was = this.aloft;
    this.aloft = !player.grounded && !player.swimming;
    this.air = this.aloft ? this.air + dt : 0;
    if (!this.worn || !this.aloft || player.carrier || player.aboard || controls.blocked) return null;
    // held since the jump (or the step off the edge), or pressed again up there
    // (not the press that jumped: that frame you weren't up yet)
    if ((controls.held && this.air >= HOLD) || (was && controls.pressed())) {
      this.on = true;
      this.carrier = jetCarrier();
      player.carrier = this.carrier;
      player.vel.y = Math.max(player.vel.y, KICK);
      return 'ignite';
    }
    return null;
  }

  // Cut them out now, wherever you are (taken off, moved somewhere else).
  stop(player) {
    if (!this.on) return;
    if (player.carrier === this.carrier) player.carrier = null;
    this.#out();
  }

  #out() {
    this.on = false;
    this.carrier = null;
    this.pitch = 0;
    this.roll = 0;
    this.aloft = false;
    this.air = 0;
  }

  // How hard the jets are going and how you hang under them, after step().
  // diving: shift is down.
  update(dt, player, diving) {
    const want = !this.on ? 0 : player.climbing ? BURN.climb : diving ? BURN.dive : BURN.glide;
    this.thrust += (want - this.thrust) * (1 - Math.exp(-dt * BURN.spool));
    if (this.thrust < 1e-3 && !this.on) this.thrust = 0;
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
}
