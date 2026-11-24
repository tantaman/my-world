// A session: from stepping onto the board to stepping off it. How far and
// how fast you went, and the points for the tricks you landed: each landed
// within LINE s of rolling after the last makes a line, worth their points
// times how many there were, banked once you've rolled on that long without
// another. Bail before then and the line is lost.

// s rolling before a line is banked
export const LINE = 3;

export class Session {
  constructor() {
    this.time = 0;
    this.distance = 0;
    this.top = 0; // m/s
    this.points = 0; // banked
    this.bails = 0;
    /** @type {{ name: string, points: number } | null} the best single trick */
    this.best = null;
    /** @type {{ name: string, points: number }[]} landed, not yet banked */
    this.line = [];
    this.since = 0;
    this._at = { x: 0, z: 0 };
  }

  reset(x = 0, z = 0) {
    this.time = this.distance = this.top = this.points = this.bails = this.since = 0;
    this.best = null;
    this.line = [];
    this._at = { x, z };
  }

  // The line as it stands: its points, times how many tricks.
  get pending() {
    let p = 0;
    for (const t of this.line) p += t.points;
    return p * this.line.length;
  }

  // One frame: where you are now, how fast, and whether you're rolling.
  // -> the points banked, if a line was
  update(dt, x, z, speed, rolling) {
    this.time += dt;
    const a = this._at;
    const step = Math.hypot(x - a.x, z - a.z);
    if (step < 20) this.distance += step;
    a.x = x;
    a.z = z;
    this.top = Math.max(this.top, speed);
    if (!this.line.length || !rolling) return 0;
    this.since += dt;
    return this.since > LINE ? this.bank() : 0;
  }

  landed(name, points) {
    if (points <= 0) return;
    const t = { name: name || 'air', points };
    this.line.push(t);
    this.since = 0;
    if (!this.best || points > this.best.points) this.best = t;
  }

  // -> the points the line came to
  bank() {
    const p = this.pending;
    this.points += p;
    this.line = [];
    this.since = 0;
    return p;
  }

  // Bailed: the line is lost. -> what it would have been worth
  bail() {
    const lost = this.pending;
    this.line = [];
    this.since = 0;
    this.bails++;
    return lost;
  }
}
