// What the crosshair is on: rays against the ground and against trunks.

import * as THREE from 'three';

// March a ray over the terrain. -> { t, p } or null
export function groundRay(chunks, o, d, maxT) {
  let prevT = 0;
  let t = 0.3;
  const at = (tt) => o.y + d.y * tt - chunks.heightAt(o.x + d.x * tt, o.z + d.z * tt);
  if (at(0) < 0) return null;
  while (t <= maxT) {
    if (at(t) < 0) {
      let a = prevT;
      let b = t;
      for (let i = 0; i < 8; i++) {
        const m = (a + b) / 2;
        if (at(m) < 0) b = m;
        else a = m;
      }
      const p = new THREE.Vector3().copy(o).addScaledVector(d, b);
      p.y = chunks.heightAt(p.x, p.z);
      return { t: b, p };
    }
    prevT = t;
    t += 0.15 + t * 0.02;
  }
  return null;
}

// Ray against a vertical cylinder (in plan). -> t or null
export function rayCircle(o, d, cx, cz, r) {
  const ox = o.x - cx;
  const oz = o.z - cz;
  const a = d.x * d.x + d.z * d.z;
  if (a < 1e-9) return null;
  const b = 2 * (ox * d.x + oz * d.z);
  const c = ox * ox + oz * oz - r * r;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  return t > 0 ? t : null;
}
