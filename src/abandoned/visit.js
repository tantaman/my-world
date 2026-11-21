// A visit ends at the door. Only a walk back out can carry a sound into
// the woods. Teleports, flying away and re-entry interrupt that last beat.
import * as THREE from 'three';
import { toWorld } from '../landmarks/sites.js';

const _look = new THREE.Vector3();
const _toward = new THREE.Vector3();
export class Visit {
  constructor(site, built, random = Math.random) {
    this.site = site;
    this.built = built;
    this.random = random;
    this.time = 0;
    this.nextSound = 4;
    this.nextMotion = 2;
    this.motion = null;
    this.nextHeel = 6;
    this.steps = 0;
    this.quiet = 0;
    this.exitDelay = 0;
    this.read = new Set();
  }

  footstep(x, z) {
    this.steps++;
    this.quiet = 0;
    // Remember a footfall you have walked away from.
    if (this.steps % 4 === 1) this.print = { x, z };
  }

  update(dt, local, camera, play, tell) {
    this.time += dt;
    this.quiet += dt;
    const { site, built, random } = this;
    for (const trace of built.traces) {
      if (!this.read.has(trace) && Math.hypot(local.x - trace.x, local.z - trace.z) < 2.5) {
        this.read.add(trace);
        tell(trace.text);
      }
    }
    if (this.time >= this.nextSound) {
      this.nextSound = this.time + 12 + random() * 15;
      const near = built.crossings.filter((p) => Math.hypot(p.x - local.x, p.z - local.z) < 20);
      const point = near[Math.floor(random() * near.length)] || built.crossings[0];
      const at = toWorld(site, point.x + point.side * 4, point.z);
      play(site.kind === 'asylum' ? 'ward-pipes' : 'depot-bell', at.x, site.top + 2.4, at.z);
    }
    if (this.print && this.steps >= 4 && this.quiet > 0.85 && this.time >= this.nextHeel) {
      play('stray-heel', this.print.x, site.top + 0.12, this.print.z);
      this.steps = 0;
      this.print = null;
      this.nextHeel = this.time + 7 + random() * 8;
    }
    camera.getWorldDirection(_look);
    const alignment = (p) => {
      const point = toWorld(site, p.x, p.z);
      return _toward
        .set(point.x - camera.position.x, site.top + 1 - camera.position.y, point.z - camera.position.z)
        .normalize()
        .dot(_look);
    };
    if (!this.motion && this.time >= this.nextMotion) {
      const possible = built.crossings.filter((p) => {
        const dist = Math.hypot(p.x - local.x, p.z - local.z);
        const dot = alignment(p);
        return dist > 3 && dist < 16 && dot > 0.42 && dot < 0.91;
      });
      if (possible.length) {
        const p = possible[Math.floor(random() * possible.length)];
        this.motion = { x: p.x + p.side * 0.48, z: p.z, side: p.side, age: 0 };
      }
      this.nextMotion = this.time + (this.motion ? 9 + random() * 12 : 0.8);
    }
    const m = this.motion;
    if (m) {
      m.age += dt;
      built.fold.position.set(m.x, 0.92, m.z + m.side * m.age * 2.8);
      built.fold.visible = m.age < 0.85 && alignment(built.fold.position) < 0.95;
      if (!built.fold.visible) this.motion = null;
    }
  }

  leave(local, feet) {
    this.built.fold.visible = false;
    if (this.time > 2 && Math.abs(local.x) < 3 && Math.abs(local.z - this.site.d) < 3 && Math.abs(feet - this.site.top) < 1.3) {
      this.exitDelay = 2.4 + this.random() * 1.8;
    }
  }

  outside(dt, pos, play) {
    if (this.exitDelay <= 0) return false;
    const d = Math.hypot(pos.x - this.site.door.x, pos.z - this.site.door.z);
    if (d > 40 || Math.abs(pos.y - this.site.top) > 7) return false;
    this.exitDelay -= dt;
    if (this.exitDelay > 0) return true;
    const threshold = toWorld(this.site, 0, this.site.d + 1);
    play('stray-heel', threshold.x, this.site.top + 0.2, threshold.z);
    return false;
  }
}
