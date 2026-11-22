// The lifts: a ride in one, from deck to deck.
//
// Each core has four cars (plan.js's CORE.lifts), the midships one with glass
// backs that look out over the atrium. Walk up to a car's doors in a lobby
// and they open, as if it had come for you. Step in, and the panel lights:
// choose a deck, and the doors close, it goes, and they open again on the
// deck you chose. While it goes it carries you (player.aboard).
//
// No three.js in here: the tests ride them.
//
//   new LiftRide(fromY, toY)   ride.update(dt) -> false once the doors are
//                              open on the new deck; ride.y (the car's
//                              floor), ride.doors (0 shut .. 1 open),
//                              ride.phase ('closing', 'moving', 'opening', 'open')
//   travelTime(from, to)       how long a ride takes, door to door (s)

export const LIFT = {
  speed: 2.5, // m/s at its fastest
  accel: 1.1, // m/s² speeding up and slowing down
  doors: 1.4, // s for the doors to close, or to open
  settle: 0.4, // s standing still after the doors shut, before it goes (and before they open)
  approach: 1.5, // m from a car's doors that they open for you
};

// How long the car is moving, over a distance d (m): up to speed and back
// down, or, if it's short, only part of the way up.
export function moveTime(d) {
  const { speed: v, accel: a } = LIFT;
  const ramp = (v * v) / a; // distance used getting up to speed and back
  if (d <= ramp) return 2 * Math.sqrt(d / a);
  return (2 * v) / a + (d - ramp) / v;
}

// How far it has gone, t s after it started on a ride of d (m).
export function moveAt(d, t) {
  const { speed: v, accel: a } = LIFT;
  const T = moveTime(d);
  if (t <= 0) return 0;
  if (t >= T) return d;
  const top = Math.min(v, Math.sqrt(a * d)); // the fastest it gets
  const tr = top / a; // s getting up to it
  if (t < tr) return 0.5 * a * t * t;
  const cruise = T - 2 * tr;
  if (t < tr + cruise) return 0.5 * a * tr * tr + top * (t - tr);
  const left = T - t;
  return d - 0.5 * a * left * left;
}

export function travelTime(from, to) {
  return LIFT.doors * 2 + LIFT.settle * 2 + moveTime(Math.abs(to - from));
}

export class LiftRide {
  constructor(fromY, toY) {
    this.from = fromY;
    this.to = toY;
    this.t = 0;
    this.y = fromY;
    this.doors = 1;
    this.phase = 'closing';
    this.dist = Math.abs(toY - fromY);
    this.dir = Math.sign(toY - fromY);
    this.moving = moveTime(this.dist);
  }

  update(dt) {
    this.t += dt;
    const { doors: D, settle: S } = LIFT;
    const t = this.t;
    const m0 = D + S;
    const m1 = m0 + this.moving;
    if (t < D) {
      this.phase = 'closing';
      this.doors = 1 - t / D;
    } else if (t < m1 + S) {
      this.phase = 'moving';
      this.doors = 0;
      this.y = this.from + this.dir * moveAt(this.dist, t - m0);
    } else if (t < m1 + S + D) {
      this.phase = 'opening';
      this.y = this.to;
      this.doors = (t - m1 - S) / D;
    } else {
      this.phase = 'open';
      this.y = this.to;
      this.doors = 1;
      return false;
    }
    return true;
  }

  // how fast it's going now (m/s, + up)
  get speed() {
    const t = this.t - LIFT.doors - LIFT.settle;
    if (t <= 0 || t >= this.moving) return 0;
    const dt = 1 / 120;
    return (this.dir * (moveAt(this.dist, t + dt) - moveAt(this.dist, t - dt))) / (2 * dt);
  }
}
