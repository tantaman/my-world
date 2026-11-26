// Shop glass (PLAN.md 5.9): a thin sheet with ordinary transparency, low
// roughness, a little smeared dirt, reflecting what scene.environment holds.
// Not `transmission`: that costs a copy of the whole frame.
import { MeshStandardNodeMaterial, Color, DoubleSide } from 'three/webgpu';
import { float, vec3, smoothstep, positionWorld } from 'three/tsl';
import { fbm2 } from './noise.js';

export function createGlass({ opacity = 0.16, tint = '#1a1f1d' } = {}) {
  const m = new MeshStandardNodeMaterial({ transparent: true, depthWrite: false, side: DoubleSide, metalness: 0 });
  const smear = smoothstep(-0.1, 0.5, fbm2(positionWorld.xy, 0.5, 4));
  m.colorNode = vec3(new Color(tint).r, new Color(tint).g, new Color(tint).b);
  m.roughnessNode = float(0.04).add(smear.mul(0.25));
  m.opacityNode = float(opacity).add(smear.mul(0.12));
  m.envMapIntensity = 1.5;
  return m;
}
