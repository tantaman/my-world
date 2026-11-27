// Shop glass (PLAN.md 5.9): a thin sheet with ordinary transparency, low
// roughness, reflecting what scene.environment holds. Dirty the way a
// shopfront is: a film smeared across it, rain dried in runs down it, and
// more of the film (and of the reflection) seen as the glass is looked
// along rather than through, so it reads as a surface from the side.
// Not `transmission`: that costs a copy of the whole frame.
import { MeshStandardNodeMaterial, Color, DoubleSide } from 'three/webgpu';
import { float, vec2, vec3, smoothstep, positionWorld, positionView, normalView, abs, dot, normalize, pow } from 'three/tsl';
import { fbm2 } from './noise.js';

const GRAZING = 0.45;      // opacity the film gains seen edge on
const RUNS = 0.1;          // opacity of the dried rain runs

export function createGlass({ opacity = 0.16, tint = '#1a1f1d' } = {}) {
  const m = new MeshStandardNodeMaterial({ transparent: true, depthWrite: false, side: DoubleSide, metalness: 0 });
  const p = positionWorld;
  const smear = smoothstep(-0.1, 0.5, fbm2(p.xy, 0.5, 4));
  // Runs: noise stretched down the glass, broken along their length.
  const runs = smoothstep(0.35, 0.7, fbm2(vec2(p.x.mul(14), p.y.mul(0.8)), 1.0, 3)).mul(smoothstep(-0.2, 0.3, fbm2(p.xy.mul(vec2(3, 0.6)), 1.0, 2)));
  const facing = abs(dot(normalView, normalize(positionView).negate()));
  const grazing = pow(float(1).sub(facing), 4);
  const c = new Color(tint);
  m.colorNode = vec3(c.r, c.g, c.b).add(runs.mul(0.05));
  m.roughnessNode = float(0.04).add(smear.mul(0.25)).add(runs.mul(0.3));
  m.opacityNode = float(opacity).add(smear.mul(0.12)).add(runs.mul(RUNS)).add(grazing.mul(GRAZING)).min(0.9);
  m.envMapIntensity = 1.5;
  return m;
}
