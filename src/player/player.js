// Third-person explorer: movement, simple physics, collision with trunks and
// boulders, and an orbiting follow camera that stays out of the hillside.

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { Character } from './character.js';
import { lerp, clamp } from '../noise.js';

const PLAYER_RADIUS = 0.32;
const _dir = new THREE.Vector3();

export class Player {
  constructor(scene, camera, world, input) {
    this.camera = camera;
    this.world = world; // ChunkManager (heightAt, forEachCollider)
    this.input = input;
    this.character = new Character();
    scene.add(this.character.root);

    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0; // facing; model faces +z when yaw = 0
    this.grounded = false;
    this.turnRate = 0;

    this.camYaw = Math.PI;
    this.camPitch = 0.32;
    this.camDist = 6;
    this.camDistSmooth = 6;
    this.camTarget = new THREE.Vector3();
    this.hasMoved = false;
    this.onJump = null; // ()
    this.onLand = null; // (strength 0..1)
  }

  spawn(x, z, yaw, camYaw = yaw + Math.PI) {
    this.pos.set(x, this.world.heightAt(x, z), z);
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
    if (input.down('KeyQ')) this.camYaw += dt * 1.8;
    if (input.down('KeyE')) this.camYaw -= dt * 1.8;

    // Camera-relative movement
    const axes = input.moveAxes();
    const fx = -Math.sin(this.camYaw);
    const fz = -Math.cos(this.camYaw);
    const rx = Math.cos(this.camYaw);
    const rz = -Math.sin(this.camYaw);
    let wx = fx * axes.y + rx * axes.x;
    let wz = fz * axes.y + rz * axes.x;
    const wl = Math.hypot(wx, wz);
    const amount = Math.min(1, wl);
    if (wl > 1e-4) {
      wx /= wl;
      wz /= wl;
      this.hasMoved = true;
    }
    const speed = (input.running() ? CONFIG.runSpeed : CONFIG.walkSpeed) * amount;

    const accel = this.grounded ? 11 : 2.5;
    const k = 1 - Math.exp(-accel * dt);
    this.vel.x = lerp(this.vel.x, wx * speed, k);
    this.vel.z = lerp(this.vel.z, wz * speed, k);

    if (this.grounded && input.jumped()) {
      this.vel.y = CONFIG.jumpSpeed;
      this.grounded = false;
      if (this.onJump) this.onJump();
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

    // Ground
    const wasGrounded = this.grounded;
    const fallSpeed = -this.vel.y;
    const gh = this.world.heightAt(this.pos.x, this.pos.z);
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
    if (!wasGrounded && this.grounded && fallSpeed > 2.5 && this.onLand) this.onLand(Math.min(1, fallSpeed / 12));

    // Facing
    const hs = Math.hypot(this.vel.x, this.vel.z);
    let turn = 0;
    if (hs > 0.3) {
      const target = Math.atan2(this.vel.x, this.vel.z);
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
    const kd = snap ? 1 : 1 - Math.exp(-dt * (dist < this.camDistSmooth ? 14 : 3));
    this.camDistSmooth = lerp(this.camDistSmooth, dist, kd);

    const cam = this.camera;
    cam.position.copy(this.camTarget).addScaledVector(dir, this.camDistSmooth);
    const floor = this.world.heightAt(cam.position.x, cam.position.z) + 0.35;
    if (cam.position.y < floor) cam.position.y = floor;
    cam.lookAt(this.camTarget);
  }
}
