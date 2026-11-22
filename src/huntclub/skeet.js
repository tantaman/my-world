// Skeet: the field, a target's flight, what a shot's pattern breaks, and the
// rules of a round. No three.js in here: the tests read it.
//
// The field is laid out as a real one is, in the club's own frame (m, see
// site.js): station 8 at the origin, the high house at the left end of the
// base chord (-x, seen from the stations) and the low house at the right
// (+x), and stations 1 to 7 round an arc towards +z, where the clubhouse is.
// From each house a target is thrown over the same spot, the crossing point,
// a little out from station 8, at about head-and-a-half height, and goes on
// to come down about 55 m from where it was thrown.
//
// A round is 25 targets: singles from each house at every station, a pair
// thrown together (a double) at stations 1, 2, 6 and 7, and the option, the
// first target you lose thrown again (or, if you lose none, one more from
// the low house at station 8). A single is shot with one shell, a double with
// two: a target you don't break with the shell meant for it is lost.

// ── The field ───────────────────────────────────────────────────────────────
export const FIELD = {
  chord: 36.8, // m between stations 1 and 7, either end of the base chord
  radius: 19.2, // m: the arc stations 1–7 stand on (its middle is behind the chord)
  cross: 5.5, // m out from station 8 towards station 4: where the targets cross
  crossUp: 4.6, // m over the ground there that they cross at
  jitter: 0.5, // m either way a throw may pass the crossing point by
  pad: 0.75, // m: half the side of a station's square pad
};
const HALF = FIELD.chord / 2;
// how far behind the chord the arc's middle is
const BEHIND = Math.sqrt(FIELD.radius * FIELD.radius - HALF * HALF);

// The stations, 1 to 8: { n, x, z, face }, face: the way a shooter there
// faces the crossing point (the angle of that direction, as atan2(dx, dz)).
export const STATIONS = (() => {
  const out = [];
  const a1 = Math.atan2(BEHIND, -HALF);
  const a7 = Math.atan2(BEHIND, HALF);
  for (let k = 1; k <= 7; k++) {
    const a = a1 + ((a7 - a1) * (k - 1)) / 6;
    out.push({ n: k, x: FIELD.radius * Math.cos(a), z: -BEHIND + FIELD.radius * Math.sin(a) });
  }
  out.push({ n: 8, x: 0, z: 0 });
  for (const s of out) s.face = Math.atan2(0 - s.x, FIELD.cross - s.z);
  return out;
})();

// The two houses: their footprint [x0, z0, x1, z1], how tall they are (m),
// and the mouth the trap throws from (in the face towards the field, `up` m
// over the house's ground).
export const HOUSES = {
  H: { name: 'high house', box: [-HALF - 3.4, -3.9, -HALF - 0.6, -1.05], height: 4.4, mouth: { x: -HALF - 0.6, z: -1.9, up: 3.05 } },
  L: { name: 'low house', box: [HALF + 0.6, -3.9, HALF + 3.4, -1.05], height: 2.0, mouth: { x: HALF + 0.6, z: -1.9, up: 1.07 } },
};
export const HOUSE_NAME = { H: 'high house', L: 'low house' };

// ── A target in flight ──────────────────────────────────────────────────────
// A clay target is a little dome of pitch, and it glides: it holds itself up
// on the air while it's fast, and comes down as the air slows it. So: gravity,
// drag on its speed, and lift from how fast it's going across the ground.
export const CLAY = {
  speed: 24, // m/s out of the trap
  drag: 0.012, // per m: how hard the air slows it (the drag is this × speed²)
  lift: 0.024, // per m: how much it's held up (the lift is this × its speed across the ground²)
  r: 0.055, // m, its radius
};
const G = 9.81;
const STEP = 1 / 120; // s: the most a target moves on in one go

// c: { x, y, z, vx, vy, vz }. Moves it on dt seconds.
export function fly(c, dt) {
  const n = Math.max(1, Math.ceil(dt / STEP - 1e-9));
  const h = dt / n;
  for (let i = 0; i < n; i++) {
    const v = Math.hypot(c.vx, c.vy, c.vz);
    const across = c.vx * c.vx + c.vz * c.vz;
    c.vx -= CLAY.drag * v * c.vx * h;
    c.vz -= CLAY.drag * v * c.vz * h;
    c.vy += (-CLAY.drag * v * c.vy - G + CLAY.lift * across) * h;
    c.x += c.vx * h;
    c.y += c.vy * h;
    c.z += c.vz * h;
  }
  return c;
}

// Where c will be in t seconds, without moving it. -> { x, y, z, vx, vy, vz }
export function ahead(c, t, out = {}) {
  out.x = c.x;
  out.y = c.y;
  out.z = c.z;
  out.vx = c.vx;
  out.vy = c.vy;
  out.vz = c.vz;
  return t > 0 ? fly(out, t) : out;
}

// The velocity to throw a target at from `from` ({ x, y, z }) so that it
// passes over `over` ({ x, y, z }) at that height. -> { vx, vy, vz }
export function launch(from, over) {
  const dx = over.x - from.x;
  const dz = over.z - from.z;
  const far = Math.hypot(dx, dz);
  const ux = dx / far;
  const uz = dz / far;
  // the height it's at, over there, thrown at angle a
  const heightAt = (a) => {
    const c = { x: 0, y: from.y, z: 0, vx: CLAY.speed * Math.cos(a), vy: CLAY.speed * Math.sin(a), vz: 0 };
    for (let i = 0; i < 2000 && c.x < far; i++) fly(c, STEP);
    return c.y;
  };
  let lo = -0.4;
  let hi = 1.0;
  for (let i = 0; i < 40; i++) {
    const a = (lo + hi) / 2;
    if (heightAt(a) < over.y) lo = a;
    else hi = a;
  }
  const a = (lo + hi) / 2;
  return { vx: ux * CLAY.speed * Math.cos(a), vy: CLAY.speed * Math.sin(a), vz: uz * CLAY.speed * Math.cos(a) };
}

// ── The shot ────────────────────────────────────────────────────────────────
// A shotgun throws a cloud of pellets that opens as it goes: a skeet gun's
// is about as wide as a man's chest 20 m out. It takes a moment to get there,
// and a target crossing in front of you moves on a good deal in that moment,
// so you have to shoot where it's going to be: lead it.
export const SHOT = {
  speed: 340, // m/s, the pellets on average over the first few tens of metres
  spread: 0.026, // radians: the pattern's radius is this × the distance (a little more open than a real skeet choke)
  core: 0.03, // m: ...plus this
  sure: 0.6, // inside this share of the radius, a target is always broken
  edge: 0.3, // ...at the edge of the pattern, this often (a pellet or two)
  far: 38, // m: past this the pattern thins out...
  gone: 60, // m: ...to nothing here
};

// What the pattern does to a target at p ({ x, y, z }, where it is when the
// shot gets there), shot along the ray from o in direction d (unit), from a
// gun at `from`. -> { off, radius, dist, chance, along }: how far off the
// middle of the pattern it was, how wide the pattern was there, how far it
// was from the gun, and how likely it was to break.
export function pattern(o, d, p, from) {
  const px = p.x - o.x;
  const py = p.y - o.y;
  const pz = p.z - o.z;
  const along = px * d.x + py * d.y + pz * d.z;
  const off = Math.hypot(px - along * d.x, py - along * d.y, pz - along * d.z);
  const dist = Math.hypot(p.x - from.x, p.y - from.y, p.z - from.z);
  const radius = SHOT.spread * dist + SHOT.core;
  let chance = 0;
  if (along > 0) {
    const sure = radius * SHOT.sure;
    const rim = radius + CLAY.r;
    if (off <= sure) chance = 1;
    else if (off <= rim) chance = 1 - ((1 - SHOT.edge) * (off - sure)) / (rim - sure);
    if (dist > SHOT.far) chance *= Math.max(0, 1 - (dist - SHOT.far) / (SHOT.gone - SHOT.far));
  }
  return { off, radius, dist, chance, along };
}

// How long the shot takes to get to target c from `from`, and where c is
// then: -> { t, p } (two goes at it are plenty: the target moves a metre or so).
export function meeting(c, from, out = {}) {
  let t = Math.hypot(c.x - from.x, c.y - from.y, c.z - from.z) / SHOT.speed;
  for (let i = 0; i < 2; i++) {
    ahead(c, t, out);
    t = Math.hypot(out.x - from.x, out.y - from.y, out.z - from.z) / SHOT.speed;
  }
  ahead(c, t, out);
  return { t, p: out };
}

// Where the pattern went, from the target's point of view, in the words a
// coach would use: 'behind it', 'in front of it', 'over it', 'under it'.
// d: the ray shot along; p: where the target was when the shot got there,
// moving at v ({ vx, vy, vz }).
export function missedBy(o, d, p, v) {
  const along = (p.x - o.x) * d.x + (p.y - o.y) * d.y + (p.z - o.z) * d.z;
  // from the target to the middle of the pattern, across the line of the shot
  const qx = o.x + d.x * along - p.x;
  const qy = o.y + d.y * along - p.y;
  const qz = o.z + d.z * along - p.z;
  // the way it's moving, and up, across the line of the shot
  const vd = v.vx * d.x + v.vy * d.y + v.vz * d.z;
  const mx = v.vx - vd * d.x;
  const my = v.vy - vd * d.y;
  const mz = v.vz - vd * d.z;
  const ml = Math.hypot(mx, my, mz) || 1;
  const ux = -d.y * d.x;
  const uy = 1 - d.y * d.y;
  const uz = -d.y * d.z;
  const ul = Math.hypot(ux, uy, uz) || 1;
  const lead = (qx * mx + qy * my + qz * mz) / ml;
  const rise = (qx * ux + qy * uy + qz * uz) / ul;
  if (Math.abs(lead) >= Math.abs(rise)) return lead < 0 ? 'behind it' : 'in front of it';
  return rise > 0 ? 'over it' : 'under it';
}

// ── What's yours ────────────────────────────────────────────────────────────
// What's kept of you at the club ('huntclub', yours): whether you've been
// given a shotgun, your best round, how many rounds you've shot to the end,
// and whether you've been. A save is bytes somebody sent us: made safe here
// before it's believed.
export function validateRecord(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  return {
    gun: r.gun === true,
    best: Number.isInteger(r.best) && r.best >= 0 && r.best <= TARGETS ? r.best : null,
    rounds: Number.isInteger(r.rounds) && r.rounds >= 0 ? r.rounds : 0,
    visited: r.visited === true,
  };
}

// ── A round ─────────────────────────────────────────────────────────────────
// [station, what's thrown]: 'H' the high house, 'L' the low, 'D' both at once.
export const SCHEDULE = [
  [1, 'H'], [1, 'L'], [1, 'D'],
  [2, 'H'], [2, 'L'], [2, 'D'],
  [3, 'H'], [3, 'L'],
  [4, 'H'], [4, 'L'],
  [5, 'H'], [5, 'L'],
  [6, 'H'], [6, 'L'], [6, 'D'],
  [7, 'H'], [7, 'L'], [7, 'D'],
  [8, 'H'], [8, 'L'],
];
export const TARGETS = 25;

// The houses a throw comes from.
export const housesOf = (kind) => (kind === 'D' ? ['H', 'L'] : [kind]);

export class Round {
  constructor() {
    this.i = 0; // the next of SCHEDULE
    this.results = []; // [{ station, house, dead, option }], in the order they were shot
    this.option = null; // { station, house } once a target has been lost, until it's thrown again
    this.optionTaken = false;
  }

  // What's thrown next: { station, kind, option } or null when the round is over.
  get next() {
    if (this.option && !this.optionTaken) return { station: this.option.station, kind: this.option.house, option: true };
    if (this.i < SCHEDULE.length) return { station: SCHEDULE[this.i][0], kind: SCHEDULE[this.i][1], option: false };
    if (!this.optionTaken) return { station: 8, kind: 'L', option: true };
    return null;
  }

  get done() {
    return this.next === null;
  }

  get score() {
    return this.results.filter((r) => r.dead).length;
  }

  // dead: { H: bool, L: bool } for the houses the throw came from.
  record(dead) {
    const next = this.next;
    if (!next) return;
    for (const house of housesOf(next.kind)) this.results.push({ station: next.station, house, dead: !!dead[house], option: next.option });
    if (next.option) {
      this.optionTaken = true;
      return;
    }
    this.i++;
    if (!this.option && !this.optionTaken) {
      const lost = housesOf(next.kind).find((h) => !dead[h]);
      if (lost) this.option = { station: next.station, house: lost };
    }
  }
}
