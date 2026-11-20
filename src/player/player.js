// Third-person explorer: movement, simple physics, collision with trunks and
// boulders, and an orbiting follow camera that stays out of the hillside.
// In water you wade, slower the deeper it gets, and the current leans on you
// the deeper you're in it; where it's too deep to stand you swim: you float
// with your head and shoulders out, and running water carries you along.

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { Character } from './character.js';
import { lerp, clamp, smoothstep } from '../noise.js';
import { Emitter } from '../core/events.js';
import { segDist, waterSample } from '../core/geom.js';

const PLAYER_RADIUS = 0.32;
// How high a ledge you can walk onto without jumping. Less than one course of
// a log wall (0.32 m) so walls stay walls; sills and piers set their own
// (higher) step so you can walk in through a doorway over the threshold.
const STEP_UP = 0.28;
const BODY_H = 1.5; // head clearance (a little forgiving under door headers)
// Being walked somewhere (steer): close enough at this many metres, and
// slowing down over the last few so as not to overshoot.
const STEER_ARRIVE = 0.08;
const STEER_EASE = 0.7;
// Water deeper than this floats you: you swim with your feet this far down.
export const SWIM_DEPTH = 1.12;
// How much of the current's speed it carries you at: wading in it up to your
// knees (WADE_PUSH depth, m) and over, and swimming.
const WADE_PUSH = [0.15, 0.9];
const PUSH = { wade: 0.3, swim: 0.85 };
const _dir = new THREE.Vector3();
const _seg = { d: 0, nx: 0, nz: 0, t: 0 };
const _w = waterSample();

// Where someone at (x, z) stands: on the ground, or afloat in deep water.
// world is the ChunkManager.
export function standHeight(world, x, z) {
  const g = world.heightAt(x, z);
  if (world.waterAt(x, z, _w) && _w.level - g > SWIM_DEPTH) return _w.level - SWIM_DEPTH;
  return g;
}

// Emits:
//   'footstep'  (run 0..1)       a heel came down
//   'jump'      ()
//   'land'      (strength 0..1)
export class Player extends Emitter {
  // world: the ChunkManager (heightAt, waterAt, forEachCollider)
  // solids: built things you bump into and stand on (src/world/solids.js)
  constructor({ scene, camera, world, input, solids = null }) {
    super();
    this.camera = camera;
    this.world = world;
    this.input = input;
    this.solids = solids;
    this.character = new Character();
    // Feet find the ground under each of them (terrain, or a sill underfoot).
    this.character.groundAt = (x, z) => this.groundAt(x, z, this.pos.y + 0.02);
    this.character.onFootstep = (run) => this.emit('footstep', run);
    scene.add(this.character.root);

    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    // the water here: how deep (m, 0 out of it) and which way it runs (m/s)
    this.wade = 0;
    this.current = { x: 0, z: 0 };
    this.yaw = 0; // facing; model faces +z when yaw = 0
    this.grounded = false;
    this.turnRate = 0;

    this.camYaw = Math.PI;
    this.camPitch = 0.32;
    this.camDist = 6;
    this.camDistSmooth = 6;
    this.camTarget = new THREE.Vector3();
    this.hasMoved = false;
    // { x, z, yaw }: where the path starts, and where to appear when the
    // world opens (the start, unless a save remembers where you stood).
    this.start = null;
    this.arrival = null;
    // Things other than the hillside that the camera must stay in front of:
    // (origin, dir, maxDist) -> the distance at which the view is blocked.
    this.cameraBlockers = [];
    // While working (chopping, digging) you barely move and face the work.
    this.busy = 0;
    this.faceTo = null; // { x, z } or null
    // How deep the water is where you are (0 on dry land), and whether you're
    // out of your depth and swimming.
    this.wade = 0;
    this.swimming = false;
    // The solid you're standing on (a sill, a dock), or null on the ground.
    // One with a `surface` says what your footsteps sound like on it.
    this.underfoot = null;
    this.groundSolid = null; // ...and the one the last groundAt() found
    // Something else can walk you: { x, z, run } to head for, or null (the
    // blueprint foreman sets it). Your own keys or stick always win, and
    // `manual` says whether they moved you this frame.
    this.steer = null;
    this.manual = false;
  }

  // Ground height under (x, z) for feet at y: terrain or the top of something built.
  // (Which solid that was, if any, is left in this.groundSolid.)
  groundAt(x, z, y = Infinity) {
    let g = standHeight(this.world, x, z);
    this.groundSolid = null;
    if (this.solids) {
      this.solids.forEachNear(x, z, 1, (s) => {
        segDist(x, z, s.ax, s.az, s.bx, s.bz, _seg);
        if (_seg.d > s.r + 0.08) return;
        const top = s.topA + (s.topB - s.topA) * _seg.t;
        if (top > g && y >= top - (s.step ?? STEP_UP)) {
          g = top;
          this.groundSolid = s;
        }
      });
    }
    return g;
  }

  // Appear where a world opens. Call once the ground there has streamed in.
  arrive() {
    const a = this.arrival;
    this.spawn(a.x, a.z, a.yaw ?? 0, a.camYaw);
    if (typeof a.camPitch === 'number') this.camPitch = a.camPitch;
  }

  spawn(x, z, yaw, camYaw = yaw + Math.PI) {
    this.pos.set(x, this.groundAt(x, z), z);
    this.vel.set(0, 0, 0);
    this.yaw = yaw;
    this.camYaw = camYaw;
    this.camTarget.set(x, this.pos.y + 1.45, z);
    this.character.root.position.copy(this.pos);
    this.character.root.rotation.y = yaw;
    this.updateCamera(1 / 60, true);
  }

  update(dt) {
    const input = this.input;
    const look = input.consumeLook();
    const sens = 0.0026;
    this.camYaw -= look.x * sens;
    this.camPitch = clamp(this.camPitch + look.y * sens, -0.35, 1.25);
    const z = input.consumeZoom();
    if (z) this.camDist = clamp(this.camDist * (z > 0 ? 1.12 : 1 / 1.12), 2.2, 16);
    if (input.isDown('turnLeft')) this.camYaw += dt * 1.8;
    if (input.isDown('turnRight')) this.camYaw -= dt * 1.8;

    // Camera-relative movement
    const axes = input.moveAxes();
    const fx = -Math.sin(this.camYaw);
    const fz = -Math.cos(this.camYaw);
    const rx = Math.cos(this.camYaw);
    const rz = -Math.sin(this.camYaw);
    let wx = fx * axes.y + rx * axes.x;
    let wz = fz * axes.y + rz * axes.x;
    let wl = Math.hypot(wx, wz);
    let amount = Math.min(1, wl);
    let running = input.running();
    this.manual = wl > 1e-4;
    if (this.manual) this.hasMoved = true;
    // ...or, with your hands off the controls, wherever you're being walked
    else if (this.steer) {
      const dx = this.steer.x - this.pos.x;
      const dz = this.steer.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > STEER_ARRIVE) {
        wx = dx;
        wz = dz;
        wl = d;
        amount = Math.min(1, d / STEER_EASE);
        running = !!this.steer.run;
      }
    }
    if (wl > 1e-4) {
      wx /= wl;
      wz /= wl;
    }
    // water: wading drags at you; swimming is slow, and there's no running.
    // Standing on something built over it (a dock, a boat) you're out of it.
    const inWater = this.world.waterAt(this.pos.x, this.pos.z, _w) && _w.depth > 0 && !(this.underfoot && this.pos.y > _w.level);
    const depth = inWater ? _w.depth : 0;
    this.wade = depth;
    this.current.x = inWater ? _w.flowX : 0;
    this.current.z = inWater ? _w.flowZ : 0;
    this.swimming = depth > SWIM_DEPTH;
    const drag = this.swimming ? 0.42 : 1 - 0.5 * smoothstep(0.12, 1.0, depth);
    const run = running && !this.swimming;
    const speed = (run ? CONFIG.runSpeed : CONFIG.walkSpeed) * amount * (1 - this.busy * 0.85) * drag;
    const push = this.swimming ? PUSH.swim : PUSH.wade * smoothstep(WADE_PUSH[0], WADE_PUSH[1], depth);

    const accel = this.grounded ? 11 : 2.5;
    const k = 1 - Math.exp(-accel * dt);
    this.vel.x = lerp(this.vel.x, wx * speed + this.current.x * push, k);
    this.vel.z = lerp(this.vel.z, wz * speed + this.current.z * push, k);

    if (this.grounded && input.jumped() && !this.swimming) {
      this.vel.y = CONFIG.jumpSpeed;
      this.grounded = false;
      this.emit('jump');
    }
    this.vel.y -= CONFIG.gravity * dt;

    // Integrate
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.pos.y += this.vel.y * dt;

    // Collide with trunks / boulders (circle push-out)
    this.world.forEachCollider(this.pos.x, this.pos.z, (cx, cz, r) => {
      const dx = this.pos.x - cx;
      const dz = this.pos.z - cz;
      const d = Math.hypot(dx, dz);
      const min = r + PLAYER_RADIUS;
      if (d < min && d > 1e-5) {
        const push = (min - d) / d;
        this.pos.x += dx * push;
        this.pos.z += dz * push;
        // remove velocity into the obstacle
        const nx = dx / d;
        const nz = dz / d;
        const vn = this.vel.x * nx + this.vel.z * nz;
        if (vn < 0) {
          this.vel.x -= vn * nx;
          this.vel.z -= vn * nz;
        }
      }
    });

    // Walls, footings, felled trunks: push out of anything that's not underfoot.
    if (this.solids) {
      this.solids.forEachNear(this.pos.x, this.pos.z, 1.5, (s) => {
        segDist(this.pos.x, this.pos.z, s.ax, s.az, s.bx, s.bz, _seg);
        const min = s.r + PLAYER_RADIUS;
        if (_seg.d >= min) return;
        const top = s.topA + (s.topB - s.topA) * _seg.t;
        if (this.pos.y >= top - (s.step ?? STEP_UP) || this.pos.y + BODY_H < s.bottom) return;
        const push = min - _seg.d;
        this.pos.x += _seg.nx * push;
        this.pos.z += _seg.nz * push;
        const vn = this.vel.x * _seg.nx + this.vel.z * _seg.nz;
        if (vn < 0) {
          this.vel.x -= vn * _seg.nx;
          this.vel.z -= vn * _seg.nz;
        }
      });
    }

    // Ground
    const wasGrounded = this.grounded;
    const fallSpeed = -this.vel.y;
    const gh = this.groundAt(this.pos.x, this.pos.z, this.pos.y);
    const under = this.groundSolid;
    if (this.pos.y <= gh) {
      this.pos.y = gh;
      this.vel.y = 0;
      this.grounded = true;
    } else if (this.grounded && this.pos.y - gh < 0.35 && this.vel.y <= 0) {
      this.pos.y = gh; // stick to the slope when walking downhill
      this.vel.y = 0;
    } else {
      this.grounded = false;
    }
    this.underfoot = this.grounded ? under : null;
    if (!wasGrounded && this.grounded && fallSpeed > 2.5) this.emit('land', Math.min(1, fallSpeed / 12));

    // Facing
    const hs = Math.hypot(this.vel.x, this.vel.z);
    let turn = 0;
    const facing = this.faceTo ? Math.hypot(this.faceTo.x - this.pos.x, this.faceTo.z - this.pos.z) > 0.05 : false;
    if (hs > 0.3 || facing) {
      const target = facing
        ? Math.atan2(this.faceTo.x - this.pos.x, this.faceTo.z - this.pos.z)
        : Math.atan2(this.vel.x, this.vel.z);
      let d = target - this.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      const step = d * (1 - Math.exp(-dt * 12));
      this.yaw += step;
      turn = step / Math.max(dt, 1e-4);
    }
    this.turnRate = lerp(this.turnRate, turn, 1 - Math.exp(-dt * 8));

    const root = this.character.root;
    root.position.copy(this.pos);
    root.rotation.y = this.yaw;
    this.character.update(dt, hs, this.grounded, this.vel.y, this.turnRate);
    // bob a little while swimming
    if (this.swimming) root.position.y += Math.sin(this.character.time * 2.6) * 0.04;

    this.updateCamera(dt, false);
  }

  updateCamera(dt, snap) {
    const kT = snap ? 1 : 1 - Math.exp(-dt * 10);
    this.camTarget.x = lerp(this.camTarget.x, this.pos.x, kT);
    this.camTarget.z = lerp(this.camTarget.z, this.pos.z, kT);
    this.camTarget.y = lerp(this.camTarget.y, this.pos.y + 1.45, snap ? 1 : 1 - Math.exp(-dt * 6));

    // Pull in if the hillside is between us and the camera.
    let dist = this.camDist;
    const cp = Math.cos(this.camPitch);
    const dir = _dir.set(Math.sin(this.camYaw) * cp, Math.sin(this.camPitch), Math.cos(this.camYaw) * cp);
    for (let i = 1; i <= 8; i++) {
      const t = (i / 8) * dist;
      const px = this.camTarget.x + dir.x * t;
      const pz = this.camTarget.z + dir.z * t;
      const py = this.camTarget.y + dir.y * t;
      if (py < this.world.heightAt(px, pz) + 0.35) {
        dist = Math.max(1.2, t * 0.9);
        break;
      }
    }
    // ...or a wall or roof.
    for (const blocked of this.cameraBlockers) {
      const hit = blocked(this.camTarget, dir, dist);
      if (hit < dist) dist = Math.max(0.6, hit - 0.25);
    }
    const kd = snap ? 1 : 1 - Math.exp(-dt * (dist < this.camDistSmooth ? 14 : 3));
    this.camDistSmooth = lerp(this.camDistSmooth, dist, kd);

    const cam = this.camera;
    cam.position.copy(this.camTarget).addScaledVector(dir, this.camDistSmooth);
    let floor = this.world.heightAt(cam.position.x, cam.position.z) + 0.35;
    // and keep it out of the water
    if (this.world.waterAt(cam.position.x, cam.position.z, _w)) floor = Math.max(floor, _w.level + 0.3);
    if (cam.position.y < floor) cam.position.y = floor;
    cam.lookAt(this.camTarget);
  }
}
