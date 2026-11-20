// Wood chips, leaves, clods of earth: little boxes thrown up by work, that
// fall, come to rest on the ground and fade.

import * as THREE from 'three';

const _p = new THREE.Vector3();

export class Chips {
  constructor(scene, chunks) {
    this.chunks = chunks;
    this.max = 220;
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.06, 0.035, 0.05), new THREE.MeshStandardMaterial({ roughness: 1 }), this.max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    scene.add(this.mesh);
    this.p = [];
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._s = new THREE.Vector3();
    this._c = new THREE.Color();
  }

  // n chips of `color` from `at`, thrown at about `speed` m/s over `spread`
  // metres; (dx, dz) leans them one way.
  burst(at, n, color, speed, spread, dx = 0, dz = 0) {
    for (let i = 0; i < n; i++) {
      if (this.p.length >= this.max) this.p.shift();
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.4 + Math.random() * 0.8);
      this.p.push({
        x: at.x + (Math.random() - 0.5) * spread,
        y: at.y + Math.random() * spread * 0.5,
        z: at.z + (Math.random() - 0.5) * spread,
        vx: Math.cos(a) * s * 0.6 + dx * s,
        vy: s * (0.6 + Math.random() * 0.7),
        vz: Math.sin(a) * s * 0.6 + dz * s,
        r: Math.random() * 6,
        w: (Math.random() - 0.5) * 18,
        life: 1.1 + Math.random() * 0.9,
        color: this._c.set(color).multiplyScalar(0.75 + Math.random() * 0.5).clone(),
        rest: false,
      });
    }
  }

  update(dt) {
    const keep = [];
    for (const q of this.p) {
      q.life -= dt;
      if (q.life <= 0) continue;
      if (!q.rest) {
        q.vy -= 9.8 * dt;
        q.x += q.vx * dt;
        q.y += q.vy * dt;
        q.z += q.vz * dt;
        q.r += q.w * dt;
        const g = this.chunks.heightAt(q.x, q.z) + 0.02;
        if (q.y < g) {
          q.y = g;
          q.rest = true;
        }
      }
      keep.push(q);
    }
    this.p = keep;
    const n = Math.min(this.max, keep.length);
    for (let i = 0; i < n; i++) {
      const q = keep[i];
      const s = Math.min(1, q.life * 2);
      this._q.setFromEuler(this._e.set(q.r, q.r * 0.7, 0));
      this._m.compose(_p.set(q.x, q.y, q.z), this._q, this._s.set(s, s, s));
      this.mesh.setMatrixAt(i, this._m);
      this.mesh.setColorAt(i, q.color);
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
