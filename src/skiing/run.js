// A run: from when the skis go on to when they come off. How far and how
// fast you went, how far you came down, and the points for what you did in
// the air: tricks landed one after another (each within COMBO s of the last
// on the snow) make a combo, worth their points times how many there were,
// and banked once the snow has had you for a while. Fall before then and the
// combo is lost.

// s on the snow before a combo is banked
export const COMBO = 3.5;

export class Run {
  constructor() {
    this.reset();
  }

  reset(x = 0, y = 0, z = 0) {
    this.time = 0;
    this.distance = 0;
    this.top = 0; // m/s
    this.from = y; // where you set off, how high
    this.drop = 0; // m come down
    this.points = 0; // banked
    this.falls = 0;
    this.best = null; // { name, points } the best single trick
    this.combo = []; // [{ name, points }] landed, not yet banked
    this.since = 0;
    this._at = { x, y, z };
  }

  // The combo as it stands: its points, times how many tricks.
  get pending() {
    let p = 0;
    for (const t of this.combo) p += t.points;
    return p * this.combo.length;
  }

  // One frame: where you are now, how fast, and whether you're on the snow.
  // -> the points banked, if a combo was
  update(dt, x, y, z, speed, grounded) {
    this.time += dt;
    const a = this._at;
    const step = Math.hypot(x - a.x, z - a.z);
    if (step < 20) this.distance += step;
    a.x = x;
    a.y = y;
    a.z = z;
    this.top = Math.max(this.top, speed);
    this.drop = Math.max(this.drop, this.from - y);
    if (!this.combo.length || !grounded) return 0;
    this.since += dt;
    return this.since > COMBO ? this.bank() : 0;
  }

  landed(name, points) {
    if (points <= 0) return;
    const t = { name: name || 'air', points };
    this.combo.push(t);
    this.since = 0;
    if (!this.best || points > this.best.points) this.best = t;
  }

  // -> the points banked
  bank() {
    const p = this.pending;
    this.points += p;
    this.combo = [];
    this.since = 0;
    return p;
  }

  // -> the points lost
  fall() {
    const p = this.pending;
    this.combo = [];
    this.since = 0;
    this.falls++;
    return p;
  }
}
