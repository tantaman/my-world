// The other fighters in the arena: bots, each with a name and a knack.
//
// A bot finds its way about on the arena's nodes (orrery.js): it picks
// somewhere to go, works out the way there (walking, stepping off onto a
// pad, flying), and goes. When it can see someone it turns to them, takes a
// moment to react, and fires once its aim is near enough. Its aim wobbles,
// and settles the longer it holds it, so a good bot hits more often than a
// poor one but nobody hits every time. In a fight it dodges from side to
// side, where there's floor to dodge onto, and now and then jumps.
//
// No three.js in here. A bot reads the arena only through what it is handed
// each frame, and answers with what it would do:
//   think(me, others, dt) -> { wish: { x, z }, jump, fire, yaw, pitch }

import { BOXES, NODES, WAYS, nodeById, nodeAt, floorAt } from './orrery.js';
import { MOVE, rayBoxes } from './mover.js';
import { wrapAngle } from '../core/geom.js';

// Who they are. skill 0..1.
export const ROSTER = [
  { name: 'Vex', skill: 0.8, color: 0xe0503a },
  { name: 'Rook', skill: 0.62, color: 0x3fa0e8 },
  { name: 'Sparrow', skill: 0.45, color: 0xe8c440 },
  { name: 'Ingot', skill: 0.7, color: 0x8be05a },
  { name: 'Juno', skill: 0.55, color: 0xc070e8 },
];

const LOOK_EVERY = 0.15; // s between looks round for someone to fight
const ARRIVED = 0.9; // m from a node (in plan) that counts as there
const STUCK = 2.5; // s without getting nearer the next node before thinking again
const CHEST = 1.2; // m above the feet a bot aims at
const DODGE = [0.35, 0.9]; // s between changes of which way to dodge
const SAFE_AHEAD = 2.5; // m of floor wanted ahead of a dodge
const HOP_TIME = 0.75; // s a hop is in the air, near enough
const DROP_PACE = 0.3; // of running speed, stepping off a ledge onto the floor below

// What a skill comes to.
export function knack(skill) {
  return {
    reaction: 0.9 - 0.45 * skill, // s from first seeing someone to firing
    turn: 3 + 7 * skill, // rad/s it can turn its aim
    wobble: 0.22 - 0.13 * skill, // rad its aim strays by, fresh after each shot
    settle: 0.7 + 1.4 * skill, // 1/s that wobble dies away while it holds aim
    trigger: 0.06 - 0.035 * skill, // rad from dead on that it will fire at
    hop: 0.15 + 0.35 * skill, // chance a second of jumping in a fight
  };
}

export class Bot {
  // rng: () => 0..1, for everything this bot decides by chance
  constructor(skill, rng) {
    this.k = knack(skill);
    this.rng = rng;
    this.path = []; // node ids still to reach, the next first
    this.goal = null;
    this.target = null; // the fighter it's fighting
    this.seen = 0; // s since it started seeing them
    this.lookIn = 0;
    this.yaw = 0;
    this.pitch = 0;
    this.off = { yaw: 0, pitch: 0 }; // the wobble in its aim
    this.dodge = 0; // -1, 0 or 1: which way it's dodging
    this.dodgeIn = 0;
    this.hopping = false;
    this.best = Infinity; // how near it has got to its next node
    this.since = 0; // ...and how long since it got any nearer
    this.out = { wish: { x: 0, z: 0 }, jump: false, fire: false, yaw: 0, pitch: 0 };
  }

  // Back in after a death: facing the way it came in, going nowhere yet.
  respawn(yaw) {
    this.yaw = yaw;
    this.pitch = 0;
    this.path.length = 0;
    this.goal = null;
    this.target = null;
    this.seen = 0;
    this.rerollAim();
  }

  // A jump pad has thrown it: on to wherever that lands it, if that was the
  // way it was going, or else think again once it's down.
  thrown(padId) {
    const step = this.path[0];
    if (step && nodeById.get(step.id).pad === padId) this.path.shift();
    else this.path.length = 0;
    this.best = Infinity;
    this.since = 0;
  }

  // After a shot, the aim strays afresh.
  rerollAim() {
    const a = this.rng() * Math.PI * 2;
    const r = this.k.wobble * (0.4 + 0.6 * this.rng());
    this.off.yaw = Math.cos(a) * r;
    this.off.pitch = Math.sin(a) * r * 0.6;
  }

  // me: the fighter this bot is ({ body, alive, reload }); others: everyone
  // else in the arena.
  think(me, others, dt) {
    const o = this.out;
    o.fire = false;
    o.jump = false;
    const p = me.body.pos;
    // ── Who to fight ──
    this.lookIn -= dt;
    if (this.lookIn <= 0) {
      this.lookIn = LOOK_EVERY;
      const was = this.target;
      this.target = this._pick(me, others);
      if (this.target !== was) {
        this.seen = 0;
        this.rerollAim();
      }
    }
    if (this.target && !this.target.alive) this.target = null;
    // ── Aim ──
    const t = this.target;
    if (t) {
      this.seen += dt;
      const tp = t.body.pos;
      const dx = tp.x - p.x;
      const dy = tp.y + CHEST - (p.y + MOVE.eye);
      const dz = tp.z - p.z;
      const wantYaw = Math.atan2(-dx, -dz);
      const wantPitch = Math.atan2(dy, Math.hypot(dx, dz));
      const settle = Math.exp(-dt * this.k.settle);
      this.off.yaw *= settle;
      this.off.pitch *= settle;
      this.yaw = turnTo(this.yaw, wantYaw + this.off.yaw, this.k.turn * dt);
      this.pitch = turnTo(this.pitch, wantPitch + this.off.pitch, this.k.turn * dt);
      const err = Math.hypot(wrapAngle(this.yaw - wantYaw), this.pitch - wantPitch);
      if (me.reload <= 0 && this.seen >= this.k.reaction && err < this.k.trigger + 0.35 / Math.max(4, Math.hypot(dx, dz))) {
        o.fire = true;
      }
    }
    // ── Where to go ──
    this._walk(me, dt);
    // in a fight, dodge from side to side, and now and then hop
    if (t && me.body.grounded) {
      this.dodgeIn -= dt;
      if (this.dodgeIn <= 0) {
        this.dodgeIn = DODGE[0] + this.rng() * (DODGE[1] - DODGE[0]);
        this.dodge = this.rng() < 0.15 ? 0 : this.rng() < 0.5 ? -1 : 1;
        this.hopping = this.rng() < this.k.hop;
      }
      if (this.dodge) {
        const sx = Math.cos(this.yaw) * this.dodge;
        const sz = -Math.sin(this.yaw) * this.dodge;
        if (floorAhead(p, sx, sz, SAFE_AHEAD)) {
          o.wish.x += sx;
          o.wish.z += sz;
        }
      }
      // a hop only where it will come down on something
      if (this.hopping && hopSafe(p, me.body.vel, o.wish)) o.jump = true;
    }
    if (!t) {
      // look where it's going
      const w = o.wish;
      if (Math.hypot(w.x, w.z) > 0.1) this.yaw = turnTo(this.yaw, Math.atan2(-w.x, -w.z), this.k.turn * 0.6 * dt);
      this.pitch = turnTo(this.pitch, 0, dt);
    }
    o.yaw = this.yaw;
    o.pitch = this.pitch;
    return o;
  }

  // The nearest fighter it can see, keeping to the one it has while it can.
  _pick(me, others) {
    const eye = { x: me.body.pos.x, y: me.body.pos.y + MOVE.eye, z: me.body.pos.z };
    let best = null;
    let bestD = Infinity;
    for (const f of others) {
      if (!f.alive) continue;
      const d = canSee(eye, f.body.pos);
      if (d === null) continue;
      const score = f === this.target ? d * 0.6 : d;
      if (score < bestD) {
        bestD = score;
        best = f;
      }
    }
    return best;
  }

  // Follow the way to wherever it's going, choosing somewhere new on
  // arriving; sitting still in the air, where a pad has thrown it.
  _walk(me, dt) {
    const o = this.out;
    o.wish.x = o.wish.z = 0;
    const b = me.body;
    const p = b.pos;
    if (!b.grounded) {
      // in the air (a pad threw it, it stepped off a ledge, it hopped): lean
      // towards where it should come down
      const step = this.path[0];
      if (step) steer(p, nodeAt(step.id), step.how, o.wish);
      return;
    }
    if (!this.path.length) {
      const from = nearestNode(p);
      if (!from) return;
      this.goal = NODES[Math.floor(this.rng() * NODES.length)].id;
      this.path = route(from, this.goal) || [];
      this.best = Infinity;
      this.since = 0;
      if (!this.path.length) return;
    }
    let next = nodeAt(this.path[0].id);
    let d = Math.hypot(next.x - p.x, next.z - p.z);
    if (d < ARRIVED && Math.abs(next.y - p.y) < 1.2) {
      this.path.shift();
      this.best = Infinity;
      this.since = 0;
      if (!this.path.length) return;
      next = nodeAt(this.path[0].id);
      d = Math.hypot(next.x - p.x, next.z - p.z);
    }
    // a long way off a node it should be near (a pad threw it short, a
    // dodge took it wide): start again from wherever it is
    if (d < this.best - 0.05) {
      this.best = d;
      this.since = 0;
    } else if ((this.since += dt) > STUCK || Math.abs(next.y - p.y) > 4) {
      this.path.length = 0;
      return;
    }
    steer(p, next, this.path[0].how, o.wish);
  }
}

// Which way to go (into `wish`) from p to the node at `next`, got to by
// `how` ('walk', 'drop' or 'fly'): straight at it, easing off on the way in
// so as not to run on off an edge, and walking (not running) off a drop.
export function steer(p, next, how, wish) {
  const dx = next.x - p.x;
  const dz = next.z - p.z;
  const d = Math.max(Math.hypot(dx, dz), 1e-3);
  let k = 1;
  if (d < 1.5) k = Math.max(0.35, d / 1.5);
  if (how === 'drop' && next.y < p.y - MOVE.step) k = Math.min(k, DROP_PACE);
  wish.x = (dx / d) * k;
  wish.z = (dz / d) * k;
  return wish;
}

// Turn angle a towards b by at most `most` radians.
function turnTo(a, b, most) {
  const d = wrapAngle(b - a);
  return a + Math.max(-most, Math.min(most, d));
}

// Can an eye at `eye` see a fighter standing at `pos`? -> how far, or null.
export function canSee(eye, pos) {
  const tx = pos.x - eye.x;
  const ty = pos.y + CHEST - eye.y;
  const tz = pos.z - eye.z;
  const d = Math.hypot(tx, ty, tz);
  if (d < 1e-3) return null;
  const dir = { x: tx / d, y: ty / d, z: tz / d };
  return rayBoxes(eye, dir, BOXES, d) === Infinity ? d : null;
}

// Is there floor (not more than a step down, and well under the feet, not
// at its very edge) `ahead` m along (dx, dz), and halfway there?
function floorAhead(p, dx, dz, ahead) {
  const l = Math.hypot(dx, dz);
  if (l < 1e-3) return true;
  for (const f of [0.5, 1]) {
    const x = p.x + (dx / l) * ahead * f;
    const z = p.z + (dz / l) * ahead * f;
    if (floorAt(x, z, p.y + MOVE.step, -MOVE.half) <= p.y - MOVE.step) return false;
  }
  return true;
}

// Would a hop from p, going at vel and pushing towards wish, come down on
// floor?
function hopSafe(p, vel, wish) {
  const vx = vel.x + wish.x * 2;
  const vz = vel.z + wish.z * 2;
  return floorAhead(p, vx, vz, Math.hypot(vx, vz) * HOP_TIME + 1);
}

// The node nearest a body that's on the same floor as it, or null.
export function nearestNode(p) {
  let best = null;
  let bestD = Infinity;
  for (const n of NODES) {
    if (n.pad) continue;
    const at = nodeAt(n.id);
    if (Math.abs(at.y - p.y) > 1.6) continue;
    const d = Math.hypot(at.x - p.x, at.z - p.z);
    if (d < bestD) {
      bestD = d;
      best = n.id;
    }
  }
  return best;
}

// The way from one node to another, as the nodes to reach in turn (not the
// first) and how each is got to: [{ id, how }], or null. Fewest metres,
// flying counted as half its distance.
export function route(from, to) {
  if (from === to) return [];
  const dist = new Map([[from, 0]]);
  const prev = new Map(); // id -> { from, how }
  const open = new Set([from]);
  while (open.size) {
    let at = null;
    for (const id of open) if (at === null || dist.get(id) < dist.get(at)) at = id;
    open.delete(at);
    if (at === to) break;
    const a = nodeById.get(at);
    for (const { to: next, how } of WAYS.get(at)) {
      const b = nodeById.get(next);
      const step = Math.hypot(b.x - a.x, b.z - a.z) * (how === 'fly' ? 0.5 : 1);
      const d = dist.get(at) + step;
      if (d < (dist.get(next) ?? Infinity)) {
        dist.set(next, d);
        prev.set(next, { from: at, how });
        open.add(next);
      }
    }
  }
  if (!prev.has(to)) return null;
  const out = [];
  for (let id = to; id !== from; id = prev.get(id).from) out.unshift({ id, how: prev.get(id).how });
  return out;
}
