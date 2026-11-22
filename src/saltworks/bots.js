// Bots walk a shared grid of clear paths, and reevaluate their target as
// sight lines and relay state change.
import { BARRIERS, RELAYS, WIDTH, LENGTH, relayAt } from './layout.js';
import { eye, lineOfSight } from './motion.js';
import { rayBoxes } from '../spaceport/mover.js';
import { wrapAngle } from '../core/geom.js';

const STRIDE = 2; // m between navigation nodes
const COLS = WIDTH / STRIDE;
const ROWS = LENGTH / STRIDE;
const CLEARANCE = 0.68; // m, includes room to steer round a corner
const expanded = BARRIERS.map((b) => ({
  ...b, x0: b.x0 - CLEARANCE, x1: b.x1 + CLEARANCE, z0: b.z0 - CLEARANCE, z1: b.z1 + CLEARANCE,
}));
const holdPoints = [{ x: -21, z: -5 }, { x: 27, z: 7 }, { x: 10, z: -7 }, { x: -13, z: -8 }];
const crossPoints = [{ x: -20, z: 3 }, { x: 23, z: 17 }, { x: 11, z: 1 }, { x: -2, z: 13 }];
let grid;

function walkable(a, b) {
  const x = b.x - a.x;
  const z = b.z - a.z;
  const d = Math.hypot(x, z);
  return d < 0.001 || rayBoxes({ x: a.x, y: 0.5, z: a.z }, { x: x / d, y: 0, z: z / d }, expanded, d) === Infinity;
}

function navigation() {
  if (grid) return grid;
  const nodes = Array.from({ length: COLS * ROWS }, (_, i) => {
    const x = (i % COLS + 0.5) * STRIDE - WIDTH / 2;
    const z = (Math.floor(i / COLS) + 0.5) * STRIDE - LENGTH / 2;
    return expanded.some((b) => x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1) ? null : { x, z, i, edges: [] };
  });
  for (const n of nodes) {
    if (!n) continue;
    const col = n.i % COLS;
    for (const i of [n.i - COLS, n.i + COLS, col > 0 ? n.i - 1 : -1, col < COLS - 1 ? n.i + 1 : -1]) {
      if (nodes[i] && walkable(n, nodes[i])) n.edges.push(nodes[i]);
    }
  }
  grid = nodes.filter(Boolean);
  return grid;
}

function nearest(p, requireSight) {
  let distance = Infinity;
  let best = null;
  for (const n of navigation()) {
    const d = (n.x - p.x) ** 2 + (n.z - p.z) ** 2;
    if (d >= distance || (requireSight && !walkable(p, n))) continue;
    distance = d;
    best = n;
  }
  return best;
}

export function route(from, to) {
  if (walkable(from, to)) return [to];
  const start = nearest(from, true) || nearest(from, false);
  const end = nearest(to, true);
  if (!end) return [];
  const pending = [start];
  const prev = new Map([[start, null]]);
  for (let i = 0; i < pending.length; i++) {
    const node = pending[i];
    if (node === end) {
      const path = [to];
      for (let n = end; n; n = prev.get(n)) path.push(n);
      return path.reverse();
    }
    for (const next of node.edges) {
      if (prev.has(next)) continue;
      prev.set(next, node);
      pending.push(next);
    }
  }
  return [];
}

const chest = (f) => ({ ...f.body.pos, y: f.body.pos.y + 1.3 });
const approach = (a, b, n) => a + Math.max(-n, Math.min(n, wrapAngle(b - a)));

export class Bot {
  constructor(index) {
    this.index = index;
    this.path = [];
    this.thinkIn = 0;
    this.planIn = 0;
    this.target = null;
    this.seen = 0;
    this.station = null;
    this.goal = null;
  }

  think(me, match, dt) {
    const p = me.body.pos;
    const team = me.team;
    const at = relayAt(p);
    const site = match.relay;
    const starting = (match.round + this.index % 3) % RELAYS.length;
    const use = site < 0 ? team === 0 && at >= 0 : team === 1 && at === site;
    const ownEye = eye(me.body);
    this.thinkIn -= dt;
    if (this.thinkIn <= 0) {
      this.thinkIn = 0.15;
      const enemies = match.fighters.filter((f) => f.hp > 0 && f.team !== team);
      const target = enemies.reduce((best, f) => {
        const score = Math.hypot(f.body.pos.x - p.x, f.body.pos.z - p.z) * (f === this.target ? 0.75 : 1);
        return score < (best?.score ?? Infinity) && lineOfSight(ownEye, chest(f)) ? { f, score } : best;
      }, null)?.f || null;
      if (target !== this.target) this.seen = 0;
      this.target = target;
    }
    if (this.target?.hp <= 0) this.target = null;
    this.seen += dt;

    // Once the relay is live, Wardens converge on it and Runners hold the yard.
    // Before then, send one squad through the crossyard while the rest go wide.
    const goal = site >= 0 ? team === 1 ? RELAYS[site] : holdPoints[site]
      : team === 1 ? holdPoints[(match.round + this.index) % holdPoints.length]
        : this.index % 3 === 2 && match.time > 58 ? crossPoints[(match.round + this.index) % crossPoints.length] : RELAYS[starting];

    this.planIn -= dt;
    if (goal !== this.goal || this.planIn <= 0) {
      this.goal = goal;
      this.path = route(p, goal);
      this.planIn = 1.5 + (this.index % 3) * 0.2;
    }
    while (this.path.length && Math.hypot(this.path[0].x - p.x, this.path[0].z - p.z) < 0.65) this.path.shift();
    const next = this.path[0];
    let dx = next ? next.x - p.x : 0;
    let dz = next ? next.z - p.z : 0;
    let aim = dx || dz ? Math.atan2(-dx, -dz) : me.yaw;
    let tilt = 0;
    if (this.target) {
      const t = chest(this.target);
      aim = Math.atan2(p.x - t.x, p.z - t.z);
      tilt = Math.atan2(t.y - ownEye.y, Math.hypot(t.x - p.x, t.z - p.z));
      // Small fixed differences make the bots react and aim at different rates.
      aim += Math.sin(match.age * 4 + this.index * 2) * 0.035;
      if (!use) {
        dx *= 0.3;
        dz *= 0.3;
      }
    }
    const yaw = approach(me.yaw, aim, dt * 4);
    const pitch = approach(me.pitch, tilt, dt * 2.5);
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    const norm = Math.max(this.target ? 4 : 1, Math.hypot(dx, dz));
    const fire = !!this.target && this.seen > 0.4 + (this.index % 5) * 0.075 && Math.abs(wrapAngle(yaw - aim)) < 0.07;
    return { yaw, pitch, fire, use, jump: false, x: use ? 0 : (dx * c - dz * s) / norm, z: use ? 0 : (-dx * s - dz * c) / norm };
  }
}
