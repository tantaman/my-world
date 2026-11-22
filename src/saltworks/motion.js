// The same movement and sight tests run in the browser and in the room.
import { MOVE, moveBody, rayBox, rayBoxes } from '../spaceport/mover.js';
import { wrapAngle } from '../core/geom.js';
import { COLLISION } from './layout.js';

export const EYE = MOVE.eye;
export const RANGE = 55;
const SPEED = 0.72;
const clamp = (n, limit) => Math.max(-limit, Math.min(limit, Number.isFinite(n) ? n : 0));
export const IDLE = Object.freeze({ x: 0, z: 0, yaw: 0, pitch: 0, jump: false, fire: false, use: false, reload: false });

export function controls(msg) {
  const x = clamp(msg.x, 1);
  const z = clamp(msg.z, 1);
  const length = Math.max(1, Math.hypot(x, z));
  return {
    x: x / length,
    z: z / length,
    yaw: Number.isFinite(msg.yaw) ? wrapAngle(msg.yaw) : 0,
    pitch: clamp(msg.pitch, 1.45),
    jump: msg.jump === true,
    fire: msg.fire === true,
    use: msg.use === true,
    reload: msg.reload === true,
  };
}

export function move(body, input, dt) {
  const c = Math.cos(input.yaw);
  const s = Math.sin(input.yaw);
  moveBody(body, { x: (c * input.x - s * input.z) * SPEED, z: (-s * input.x - c * input.z) * SPEED }, input.jump, dt, COLLISION);
}

export function eye(body) {
  const { x, y, z } = body.pos;
  return { x, y: y + EYE, z };
}

export function forward(yaw, pitch) {
  const c = Math.cos(pitch);
  return { x: -Math.sin(yaw) * c, y: Math.sin(pitch), z: -Math.cos(yaw) * c };
}

export function lineOfSight(from, to) {
  const x = to.x - from.x;
  const y = to.y - from.y;
  const z = to.z - from.z;
  const d = Math.hypot(x, y, z);
  return d > 0 && d <= RANGE && rayBoxes(from, { x: x / d, y: y / d, z: z / d }, COLLISION.boxes, d) === Infinity;
}

export function trace(origin, direction, from, fighters) {
  let distance = Math.min(RANGE, rayBoxes(origin, direction, COLLISION.boxes, RANGE));
  let hit = null;
  for (const fighter of fighters) {
    if (fighter === from || fighter.hp <= 0) continue;
    const { x, y, z } = fighter.body.pos;
    const r = MOVE.half;
    const t = rayBox(origin, direction, x - r, y + 0.08, z - r, x + r, y + MOVE.height, z + r, distance);
    if (t >= distance) continue;
    distance = t;
    hit = fighter;
  }
  return { distance, hit };
}
