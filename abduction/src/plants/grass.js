// Grass (PLAN.md 5.7): instanced tufts of five to nine curved blades,
// sparse along cracks and the verge, thick along the fence and in the field
// where it stands in water. Only the verge's tufts cast shadows (their
// shadows show in 12). And stones: squashed, wet and shiny, along the road's
// edges.
import { Group, InstancedMesh, BufferGeometry, Float32BufferAttribute, IcosahedronGeometry, Object3D, MeshStandardNodeMaterial, DoubleSide } from 'three/webgpu';
import { vec3, float, mix, positionLocal, hash, instanceIndex, uniform, sin } from 'three/tsl';
import { VERGE, ROAD, FENCE, SHOULDER, FORECOURT, SHOP } from '../set/layout.js';
import { rand } from '../noise1.js';

// One tuft: blades from a common foot, curving out.
function tuftGeometry(blades = 7, seed = 1) {
  const pos = [];
  const nor = [];
  const SEG = 4;
  for (let b = 0; b < blades; b++) {
    const ang = rand(b, seed) * Math.PI * 2;
    const lean = 0.2 + rand(b, seed + 1) * 0.5;
    const h = 0.14 + rand(b, seed + 2) * 0.22;
    const w = 0.012 + rand(b, seed + 3) * 0.01;
    const dx = Math.cos(ang);
    const dz = Math.sin(ang);
    const px = -dz;
    const pz = dx;
    const pt = (i) => {
      const f = i / SEG;
      const out = lean * h * f * f;
      return [dx * out, h * f * (1 - 0.25 * f * lean), dz * out, w * (1 - f)];
    };
    for (let i = 0; i < SEG; i++) {
      const [x0, y0, z0, w0] = pt(i);
      const [x1, y1, z1, w1] = pt(i + 1);
      const quad = [
        [x0 - px * w0, y0, z0 - pz * w0], [x0 + px * w0, y0, z0 + pz * w0], [x1 + px * w1, y1, z1 + pz * w1],
        [x0 - px * w0, y0, z0 - pz * w0], [x1 + px * w1, y1, z1 + pz * w1], [x1 - px * w1, y1, z1 - pz * w1],
      ];
      for (const v of quad) { pos.push(...v); nor.push(dx * 0.4, 0.9, dz * 0.4); }
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new Float32BufferAttribute(nor, 3));
  return g;
}

function scatter(count, seed, area) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const p = area(i, seed);
    if (p) out.push(p);
  }
  return out;
}

export function createGrass() {
  const group = new Group();
  const time = uniform(0);
  const mat = new MeshStandardNodeMaterial({ side: DoubleSide, roughness: 0.55 });
  const tint = hash(float(instanceIndex).mul(1.37));
  mat.colorNode = mix(vec3(0.022, 0.03, 0.012), vec3(0.05, 0.045, 0.025), tint);
  mat.roughnessNode = float(0.8);
  const k = positionLocal.y.mul(positionLocal.y).mul(4);
  mat.positionNode = positionLocal.add(vec3(sin(time.mul(2.3).add(tint.mul(6.28))).mul(0.03).mul(k), 0, 0));
  const geo = tuftGeometry(7, 3);
  const dummy = new Object3D();
  const make = (spots, shadows) => {
    const m = new InstancedMesh(geo, mat, spots.length);
    spots.forEach(([x, z, s, r], i) => {
      dummy.position.set(x, 0, z);
      dummy.rotation.set(0, r, 0);
      dummy.scale.set(s, s * (0.7 + 0.6 * rand(i, 77)), s);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    });
    m.castShadow = shadows;
    m.receiveShadow = true;
    m.frustumCulled = false;
    group.add(m);
  };
  // Along the verge (casts shadows), clumped.
  make(scatter(1100, 1, (i, s) => {
    const x = -90 + rand(i, s) * 180;
    const z = VERGE.z0 + 0.1 + rand(i, s + 1) * (VERGE.z1 - VERGE.z0 - 0.2);
    return Math.sin(x * 0.7) + Math.sin(x * 2.3) + Math.sin(x * 0.23) > 0.6 ? [x, z, 0.8 + rand(i, s + 2) * 0.9, rand(i, s + 3) * 6] : null;
  }), true);
  // The far shoulder, the fence line and the field near the road, thick.
  make(scatter(9000, 2, (i, s) => {
    const x = -110 + rand(i, s) * 220;
    const z = SHOULDER.z0 + 0.3 + Math.pow(rand(i, s + 1), 1.6) * 22;
    return [x, z, 0.5 + rand(i, s + 2) * 0.7, rand(i, s + 3) * 6];
  }), false);
  // Sparse, in the forecourt's cracks and at the shop's foot.
  make(scatter(500, 3, (i, s) => {
    const x = FORECOURT.x0 + rand(i, s) * (FORECOURT.x1 - FORECOURT.x0);
    const z = rand(i, s + 1) < 0.3 ? SHOP.z1 + 0.15 : rand(i, s + 1) * FORECOURT.z1;
    return rand(i, s + 4) < 0.5 ? [x, z, 0.4 + rand(i, s + 2) * 0.5, rand(i, s + 3) * 6] : null;
  }), false);

  // Stones along both edges of the road.
  const stoneMat = new MeshStandardNodeMaterial({ roughness: 0.18 });
  stoneMat.colorNode = mix(vec3(0.035, 0.032, 0.03), vec3(0.08, 0.07, 0.06), hash(float(instanceIndex).mul(5.1)));
  const stones = scatter(1800, 4, (i, s) => {
    const side = rand(i, s) < 0.6 ? ROAD.z0 - 0.15 - rand(i, s + 1) * 0.9 : ROAD.z1 + 0.1 + rand(i, s + 1) * 1.2;
    return [-90 + rand(i, s + 2) * 180, side, 0.015 + Math.pow(rand(i, s + 3), 4) * 0.05, rand(i, s + 4) * 6];
  });
  const sm = new InstancedMesh(new IcosahedronGeometry(1, 0), stoneMat, stones.length);
  stones.forEach(([x, z, s, r], i) => {
    dummy.position.set(x, s * 0.25, z);
    dummy.rotation.set(rand(i, 9), r, rand(i, 10));
    dummy.scale.set(s * (1 + rand(i, 11)), s * 0.5, s);
    dummy.updateMatrix();
    sm.setMatrixAt(i, dummy.matrix);
  });
  sm.receiveShadow = true;
  sm.frustumCulled = false;
  group.add(sm);
  return { object: group, update(t) { time.value = t; } };
}
