// The saucer (PLAN.md 5.11): a lathed hull about 11 m across, dark metal
// with panel lines from a polar grid, a dome on top, stepped rings
// underneath. Short strips round the rim (white with a few amber, chasing),
// eight round lamps underneath, a broken ring of light round the opening in
// the middle (brightening at 53.3 s). All emissive and bright enough to
// bloom; the one real light under it is light/rig.js's.
import {
  Group, Mesh, LatheGeometry, Vector2, InstancedMesh, BoxGeometry, SphereGeometry, TorusGeometry, Object3D,
  MeshStandardNodeMaterial, Color,
} from 'three/webgpu';
import {
  vec3, float, uniform, positionLocal, atan, length, fract, smoothstep, abs, mix, instanceIndex, sin, step, hash, max,
} from 'three/tsl';
import { UFO } from '../set/layout.js';
import { T, ramp } from '../timeline.js';

const RIM_LIGHTS = 24;
const RIM_GLOW = 15;      // emissive strength (PLAN 5.13)

// The hull's outline: radius against height, from the opening to the dome's top.
const R = UFO.radius;
const PROFILE = [
  [1.3, 0.0], [1.35, 0.06], [2.2, 0.16], [2.25, 0.3], [3.4, 0.42], [3.45, 0.56], [4.7, 0.78], [R, 1.02],
  [R + 0.05, 1.12], [R - 0.05, 1.24], [4.4, 1.52], [3.0, 1.86], [2.3, 1.98], [2.2, 2.2], [1.6, 2.55], [0.8, 2.75], [0.0, 2.8],
];

export function createSaucer() {
  const group = new Group();
  const u = { time: uniform(0), ring: uniform(0), lights: uniform(1) };

  const hullGeo = new LatheGeometry(PROFILE.map(([r, y]) => new Vector2(r, y)), 64);
  const hull = new MeshStandardNodeMaterial({ metalness: 0.85, roughness: 0.38 });
  // Panel lines: a polar grid in the colour and roughness.
  const ang = atan(positionLocal.z, positionLocal.x);
  const rad = length(positionLocal.xz);
  const seams = max(smoothstep(0.035, 0.0, abs(fract(ang.mul(16 / 6.2832)).sub(0.5)).mul(-1).add(0.5)),
    smoothstep(0.03, 0.0, abs(fract(rad.mul(1.1)).sub(0.5)).mul(-1).add(0.5)));
  hull.colorNode = mix(vec3(0.16, 0.16, 0.17), vec3(0.04, 0.04, 0.045), seams);
  hull.roughnessNode = mix(float(0.35), float(0.7), seams);
  const hullMesh = new Mesh(hullGeo, hull);
  hullMesh.castShadow = true;
  group.add(hullMesh);

  // Rim strips, chasing: one instanced box, its glow per instance from the time.
  const rimMat = new MeshStandardNodeMaterial({ color: new Color(0.2, 0.2, 0.2) });
  const idx = float(instanceIndex);
  const amber = step(0.8, hash(idx.mul(3.7)));
  const chase = sin(idx.mul(6.2832 / 6).sub(u.time.mul(5))).mul(0.4).add(0.75);
  rimMat.emissiveNode = mix(vec3(0.85, 0.92, 1.0), vec3(1.0, 0.6, 0.25), amber).mul(chase).mul(RIM_GLOW).mul(u.lights);
  const rim = new InstancedMesh(new BoxGeometry(0.75, 0.07, 0.06), rimMat, RIM_LIGHTS);
  const d = new Object3D();
  for (let i = 0; i < RIM_LIGHTS; i++) {
    const a = (i / RIM_LIGHTS) * Math.PI * 2;
    d.position.set(Math.cos(a) * (R + 0.07), 1.12, Math.sin(a) * (R + 0.07));
    d.rotation.set(0, -a + Math.PI / 2, 0);
    d.updateMatrix();
    rim.setMatrixAt(i, d.matrix);
  }
  group.add(rim);

  // Eight round lamps underneath.
  const lampMat = new MeshStandardNodeMaterial({ color: new Color(0.3, 0.3, 0.3) });
  lampMat.emissiveNode = vec3(0.9, 0.95, 1.0).mul(12).mul(u.lights);
  const lamps = new InstancedMesh(new SphereGeometry(0.16, 10, 6), lampMat, 8);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.2;
    d.position.set(Math.cos(a) * 3.0, 0.42, Math.sin(a) * 3.0);
    d.rotation.set(0, 0, 0);
    d.updateMatrix();
    lamps.setMatrixAt(i, d.matrix);
  }
  group.add(lamps);

  // The broken ring round the opening.
  const ringMat = new MeshStandardNodeMaterial({ color: new Color(0.3, 0.3, 0.3) });
  const ra = atan(positionLocal.z, positionLocal.x);
  const dashes = step(0.25, fract(ra.mul(20 / 6.2832)));
  ringMat.emissiveNode = vec3(0.85, 0.93, 1.0).mul(dashes.mul(0.6).add(0.4)).mul(u.ring.mul(12).add(3)).mul(u.lights);
  const ring = new Mesh(new TorusGeometry(1.75, 0.07, 6, 48), ringMat);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.17;
  group.add(ring);
  // The opening: a disc that glows with the beam.
  const holeMat = new MeshStandardNodeMaterial({ color: new Color(0, 0, 0) });
  holeMat.emissiveNode = vec3(0.8, 0.9, 1.0).mul(u.ring.mul(5).add(0.2));
  const hole = new Mesh(new SphereGeometry(1.3, 24, 6, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.5), holeMat);
  hole.scale.y = 0.12;
  hole.position.y = 0.05;
  group.add(hole);

  return {
    object: group,
    uniforms: u,
    update(t) {
      u.time.value = t;
      u.ring.value = ramp(t, T.ringOn, T.ringOn + 0.3) * (1 - ramp(t, T.beamOff, T.beamOff + 0.8));
    },
  };
}
