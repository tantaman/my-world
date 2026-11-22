// A wave's tally: how long you were up on it, how far you went along it, how
// fast, what you did on it, and what all that comes to. Riding the face
// counts for itself, by the second and how fast; each turn, barrel and air
// counts on top, half as much again if you do the same thing twice running.
// It's yours once the wave is over and you're still on your feet (kicked
// out, ridden in, or the wave ran out under you); fall, and it's lost.
//
// No three.js in here: the tests read it.

export const RIDE = {
  face: 3, // points a second for each m/s you go, up on a wave
  least: 2, // s up before a wave counts at all
};

export class Ride {
  constructor() {
    this.reset();
  }

  reset() {
    this.time = 0; // s up on your feet
    this.distance = 0; // m
    this.top = 0; // m/s
    this.points = 0; // so far, this wave
    this.moves = []; // { name, points }
    this.tube = 0; // s in the barrel, all told
    this.airs = 0;
    this.up = false;
  }

  // Stood up on a wave.
  start() {
    this.reset();
    this.up = true;
  }

  // dt s on your feet, going speed m/s; onFace: up on the face of a wave.
  update(dt, speed, onFace) {
    if (!this.up) return;
    this.time += dt;
    this.distance += speed * dt;
    if (speed > this.top) this.top = speed;
    if (onFace) this.points += speed * dt * RIDE.face;
  }

  // Something done on it: -> the points it counted for.
  add(name, points) {
    const last = this.moves[this.moves.length - 1];
    const p = Math.round(last && last.name === name ? points / 2 : points);
    this.moves.push({ name, points: p });
    this.points += p;
    return p;
  }

  // The wave's over and you're on your feet: -> what it came to (0 for a
  // wave too short to count).
  bank() {
    const p = this.up && this.time >= RIDE.least ? Math.round(this.points) : 0;
    this.up = false;
    return p;
  }

  // Fallen: -> what was lost.
  lose() {
    const p = this.up ? Math.round(this.points) : 0;
    this.up = false;
    this.points = 0;
    return p;
  }
}
