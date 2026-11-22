// A fixed field of stars shared by both orbital destinations.
import * as THREE from 'three';
import { mulberry32 } from '../noise.js';

export const SKY_R = 3000; // m from the station
const STARS = 1800;

export function makeStars() {
  const _v = new THREE.Vector3();
  const rng = mulberry32(1969);
  // stars: most anywhere, more along a band across the sky
  const pos = new Float32Array(STARS * 3);
  const colors = new Float32Array(STARS * 3);
  const band = new THREE.Vector3(0.3, 0.5, 0.81).normalize();
  for (let i = 0; i < STARS; i++) {
    _v.set(rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1);
    if (_v.lengthSq() > 1 || _v.lengthSq() < 1e-4) {
      i--;
      continue;
    }
    _v.normalize();
    if (i % 3 === 0) _v.addScaledVector(band, -_v.dot(band) * (0.85 + rng() * 0.15)).normalize();
    pos.set([_v.x * SKY_R, _v.y * SKY_R, _v.z * SKY_R], i * 3);
    const b = 0.08 + Math.pow(rng(), 4) * 2.4; // most faint, a few bright
    const warm = rng();
    colors.set([b * (0.85 + warm * 0.25), b * 0.92, b * (1.15 - warm * 0.3)], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const stars = new THREE.Points(geo, new THREE.PointsMaterial({ size: 1, sizeAttenuation: false, vertexColors: true, depthWrite: false }));
  stars.renderOrder = -2;
  stars.frustumCulled = false;
  return stars;
}
