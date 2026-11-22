// A visit ends at the door. Only a walk back out can carry a sound into
// the woods. Teleports, flying away and re-entry interrupt that last beat.
import * as THREE from 'three';
import { toWorld } from '../landmarks/sites.js';

const _look = new THREE.Vector3();
const _toward = new THREE.Vector3();
const _point = {};

export class Visit {
  constructor(site, built, random = Math.random) {
    this.site = site;
    this.built = built;
    this.random = random;
    this.time = 0;
    this.nextSound = 4;
    this.nextMotion = 0.2;
    this.encounters = 0;
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
      play({ asylum: 'ward-pipes', post: 'depot-bell', baths: 'bath-drain', furnace: 'furnace-knock' }[site.kind], at.x, site.top + 2.4, at.z);
    }
    if (this.print && this.steps >= 4 && this.quiet > 0.85 && this.time >= this.nextHeel) {
      play('stray-heel', this.print.x, site.top + 0.12, this.print.z);
      this.steps = 0;
      this.print = null;
      this.nextHeel = this.time + 7 + random() * 8;
    }
    // The first figure waits in the aisle you entered. Later figures
    // emerge at doorways. You have time to make out a face before it goes.
    const figure = built.phantom;
    if (!this.motion && this.time >= this.nextMotion) {
      const inHall = Math.abs(local.x) < 4 && local.z > 0;
      const doors = built.crossings.filter((p) => Math.hypot(p.x - local.x, p.z - local.z) < 14);
      const door = doors[Math.floor(random() * doors.length)] || built.crossings[0];
      const entry = this.encounters === 0 && inHall;
      const side = entry ? 1 : door.side;
      this.motion = { age: 0, x: entry ? 0.27 : door.x - side * 0.9, z: entry ? Math.max(-site.d + 3, local.z - 11) : door.z, side, entry };
      this.encounters++;
    }
    const m = this.motion;
    if (m) {
      m.age += dt;
      const dist = Math.hypot(local.x - m.x, local.z - m.z);
      if (m.fade === undefined && (m.age > 5.8 || (m.age > 1.2 && dist < 3.6))) m.fade = m.age;
      if (m.fade === undefined && Math.abs(local.x) < 1.95 && dist > 3) {
        toWorld(site, m.x, m.z, _point);
        camera.getWorldDirection(_look);
        _toward.set(_point.x - camera.position.x, site.top + 1.5 - camera.position.y, _point.z - camera.position.z).normalize();
        // It closes ground only in the clear central aisle, while off screen.
        if (_look.dot(_toward) < 0.22) {
          const advance = Math.min(dist - 3, dt * 2.5);
          m.z += ((local.z - m.z) / dist) * advance;
          m.x += ((local.x - m.x) / dist) * advance;
        }
      }
      const gone = m.fade === undefined ? 0 : Math.min(1, (m.age - m.fade) / 1.45);
      const x = m.x + (m.entry ? 0.13 : m.side * 0.35) * Math.sin(m.age * 0.66) + gone * m.side * 1.45;
      figure.position.set(x, 0.07 + 0.06 * Math.sin(m.age * 1.65), m.z + (m.entry ? Math.min(1, m.age * 0.18) : 0));
      figure.rotation.y = Math.atan2(local.x - x, local.z - figure.position.z);
      figure.rotation.z = 0.033 * Math.sin(m.age * 0.8);
      figure.visible = gone < 1;
      figure.material.opacity = Math.min(1, m.age / 0.72) * (1 - gone) * (0.8 + 0.09 * Math.sin(m.age * 4.8));
      if (gone === 1) {
        const echo = toWorld(site, m.x, m.z);
        play('whisper', echo.x, site.top + 1.4, echo.z);
        this.nextMotion = this.time + 7 + random() * 9;
        this.motion = null;
      }
    }
  }

  leave(local, feet) {
    this.built.phantom.visible = false;
    if (this.time > 2 && Math.abs(local.x) < 3 && Math.abs(local.z - this.site.d) < 3 && Math.abs(feet - this.site.top) < 1.3) {
      this.exitDelay = 2.4 + this.random() * 1.8;
    }
  }

  outside(dt, pos, play) {
    if (this.exitDelay <= 0) return false;
    const d = Math.hypot(pos.x - this.site.door.x, pos.z - this.site.door.z);
    if (d > 40 || Math.abs(pos.y - this.site.top) > 7) {
      this.built.phantom.visible = false;
      return false;
    }
    this.exitDelay -= dt;
    const figure = this.built.phantom;
    figure.visible = this.exitDelay > 0 && this.exitDelay < 2.1;
    figure.position.set(0.62, 0.06, this.site.d - 0.74);
    figure.rotation.y = 0;
    figure.material.opacity = 0.57 * Math.min(1, Math.max(0, this.exitDelay * 2));
    if (this.exitDelay > 0) return true;
    const threshold = toWorld(this.site, 0, this.site.d + 1);
    play('stray-heel', threshold.x, this.site.top + 0.2, threshold.z);
    return false;
  }
}
