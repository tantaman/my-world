// The saucer's trails (PLAN.md 5.11, 12 and 17): from points on its rim,
// each a ribbon through the last places that point has been, facing the
// camera, tapering, blue-white, additive. A fast sideways zigzag gives the
// electric look as it leaves. Faded by speed, so there are none while it
// hovers. Where a point has been is the flight evaluated at earlier times,
// so the trails need no state either.
import { Mesh, BufferGeometry, Float32BufferAttribute, BufferAttribute, MeshBasicNodeMaterial, AdditiveBlending, Vector3, DynamicDrawUsage } from 'three/webgpu';
import { attribute, vec3, float, uv, smoothstep, abs } from 'three/tsl';
import { flightAt, createFlightState } from './flight.js';
import { UFO } from '../set/layout.js';
import { T } from '../timeline.js';

const POINTS = [0.35, 2.45, 3.6];   // radians round the rim the trails leave from
const SEGMENTS = 50;
const STEP = 1 / 60;                // seconds between a ribbon's points
const WIDTH = 0.35;                 // metres at the saucer
const GLOW = 7;

export function createTrails({ camera }) {
  const n = POINTS.length * SEGMENTS * 2;
  const pos = new Float32Array(n * 3);
  const fade = new Float32Array(n);
  const uvs = new Float32Array(n * 2);
  const index = [];
  for (let p = 0; p < POINTS.length; p++) {
    for (let i = 0; i < SEGMENTS; i++) {
      const v = (p * SEGMENTS + i) * 2;
      uvs.set([i / (SEGMENTS - 1), 0, i / (SEGMENTS - 1), 1], v * 2);
      if (i < SEGMENTS - 1) index.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
    }
  }
  const geo = new BufferGeometry();
  const posAttr = new BufferAttribute(pos, 3).setUsage(DynamicDrawUsage);
  const fadeAttr = new BufferAttribute(fade, 1).setUsage(DynamicDrawUsage);
  geo.setAttribute('position', posAttr);
  geo.setAttribute('fade', fadeAttr);
  geo.setAttribute('uv', new BufferAttribute(uvs, 2));
  geo.setIndex(index);

  const mat = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending, fog: false });
  const across = abs(uv().y.sub(0.5)).mul(2);
  mat.colorNode = vec3(0.6, 0.8, 1.0).mul(attribute('fade', 'float')).mul(float(1).sub(across).pow(1.5)).mul(GLOW);
  const mesh = new Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.layers.set(1);

  const state = createFlightState();
  const pts = Array.from({ length: SEGMENTS }, () => new Vector3());
  const speeds = new Float32Array(SEGMENTS);
  const local = new Vector3();
  const toCam = new Vector3();
  const tangent = new Vector3();
  const side = new Vector3();

  return {
    object: mesh,
    update(t) {
      const live = t > T.ufoArrive && t < T.ufoGone + 1;
      mesh.visible = live;
      if (!live) return;
      for (let p = 0; p < POINTS.length; p++) {
        for (let i = 0; i < SEGMENTS; i++) {
          const ti = t - i * STEP;
          flightAt(ti, state);
          const a = POINTS[p];
          local.set(Math.cos(a) * UFO.radius, 1.1, Math.sin(a) * UFO.radius).applyEuler(state.rotation);
          pts[i].copy(state.position).add(local);
          // The electric zigzag, strongest as it leaves.
          const zig = ti > T.ufoTip ? 0.25 * Math.sin(ti * 90 + p * 2) * Math.min(1, i / 6) : 0.04 * Math.sin(ti * 50 + p);
          pts[i].y += zig;
          speeds[i] = state.visible ? state.speed : 0;
        }
        for (let i = 0; i < SEGMENTS; i++) {
          const prev = pts[Math.max(0, i - 1)];
          const next = pts[Math.min(SEGMENTS - 1, i + 1)];
          tangent.subVectors(prev, next).normalize();
          toCam.subVectors(camera.position, pts[i]).normalize();
          side.crossVectors(tangent, toCam).normalize();
          const taper = 1 - i / SEGMENTS;
          const w = WIDTH * taper;
          const v = (p * SEGMENTS + i) * 2;
          pos.set([pts[i].x - side.x * w, pts[i].y - side.y * w, pts[i].z - side.z * w], v * 3);
          pos.set([pts[i].x + side.x * w, pts[i].y + side.y * w, pts[i].z + side.z * w], v * 3 + 3);
          const f = Math.min(1, speeds[i] / 12) * taper * taper;
          fade[v] = f;
          fade[v + 1] = f;
        }
      }
      posAttr.needsUpdate = true;
      fadeAttr.needsUpdate = true;
    },
  };
}
