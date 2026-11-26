// Trees (PLAN.md 5.7): grown in code, acacia-like. A trunk that forks two or
// three times low down and spreads into a flat crown; tubes for wood; a few
// hundred leaf cards per tree clustered at the branch ends, their normals
// bent outward so the crown shades as one mass. Four shapes, instanced,
// turned and scaled. They are near-black shapes against fog with a little
// warm rim from the lamps, so the effort is in the silhouette, not the bark.
// They sway; harder while the saucer is overhead.
import {
  Group, InstancedMesh, BufferGeometry, Float32BufferAttribute, CylinderGeometry, Object3D, Vector3, Quaternion,
  MeshStandardNodeMaterial, DoubleSide, Matrix4,
} from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  positionLocal, vec3, float, sin, cos, uniform, instanceIndex, hash, uv, smoothstep, length, mx_noise_float, mix, Fn, max,
} from 'three/tsl';
import { TREES, COW } from '../set/layout.js';
import { rand } from '../noise1.js';

const SHAPES = 4;
const LEAVES = 900;           // cards per tree
const CARD = 1.1;             // metres across a card

// One tree's geometry: { wood, leaves }, both BufferGeometry, about 6 to 8 m tall.
function growTree(seed) {
  const r = (i) => rand(i, seed * 101 + 7);
  let ri = 0;
  const next = () => r(ri++);
  const wood = [];
  const tips = [];
  const height = 4.8 + next() * 2.2;
  const crownY = height - 0.6;
  // Branch from a start point to an end, as a tapered cylinder.
  const limb = (a, b, r0, r1) => {
    const dir = b.clone().sub(a);
    const len = dir.length();
    const c = new CylinderGeometry(r1, r0, len, 6, 1, true);
    c.translate(0, len / 2, 0);
    const q = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), dir.normalize());
    c.applyMatrix4(new Matrix4().makeRotationFromQuaternion(q).setPosition(a));
    wood.push(c);
  };
  const forkY = 0.9 + next() * 1.0;
  const base = new Vector3(0, 0, 0);
  const fork = new Vector3((next() - 0.5) * 0.6, forkY, (next() - 0.5) * 0.6);
  limb(base, fork, 0.24, 0.17);
  const arms = 2 + Math.floor(next() * 2);
  for (let i = 0; i < arms; i++) {
    const ang = (i / arms) * Math.PI * 2 + next() * 1.2;
    const spread = 1.5 + next() * 2.2;
    const mid = fork.clone().add(new Vector3(Math.cos(ang) * spread * 0.55, (crownY - forkY) * 0.5, Math.sin(ang) * spread * 0.55));
    limb(fork, mid, 0.15, 0.1);
    const subs = 3 + Math.floor(next() * 2);
    for (let j = 0; j < subs; j++) {
      const a2 = ang + (next() - 0.5) * 1.8;
      const reach = spread * (0.7 + next() * 0.7);
      const end = new Vector3(fork.x + Math.cos(a2) * reach, crownY - 0.3 + next() * 0.9, fork.z + Math.sin(a2) * reach);
      limb(mid, end, 0.09, 0.04);
      tips.push(end);
    }
  }
  // Leaf cards round the tips, in a flattened cloud.
  const pos = [];
  const nor = [];
  const uvs = [];
  const centre = new Vector3(0, crownY + 0.2, 0);
  for (const t of tips) centre.x += t.x / tips.length, centre.z += t.z / tips.length;
  const per = Math.floor(LEAVES / tips.length);
  const right = new Vector3();
  const up = new Vector3();
  for (const t of tips) {
    const cloudR = 1.6 + next() * 1.3;
    for (let k = 0; k < per; k++) {
      const a = next() * Math.PI * 2;
      const rr = Math.sqrt(next()) * cloudR;
      // A dome over each tip: thicker in the middle, thin at the edge.
      const dome = 1 - (rr / cloudR) * (rr / cloudR);
      const p = new Vector3(t.x + Math.cos(a) * rr, t.y - 0.25 + next() * 1.1 * dome, t.z + Math.sin(a) * rr);
      // A card turned at random, mostly lying flat-ish.
      const n = new Vector3(next() - 0.5, 1.2 + next(), next() - 0.5).normalize();
      right.set(1, 0, 0).cross(n).normalize();
      if (right.lengthSq() < 0.01) right.set(0, 0, 1);
      up.copy(n).cross(right).normalize();
      const s = CARD * (0.7 + next() * 0.6);
      const corners = [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]];
      // Bent normal: outward from the crown's middle, a little up.
      const bent = p.clone().sub(centre).normalize().multiplyScalar(0.7).add(new Vector3(0, 0.6, 0)).normalize();
      for (const [cx, cy] of corners) {
        pos.push(p.x + (right.x * cx + up.x * cy) * s * 0.5, p.y + (right.y * cx + up.y * cy) * s * 0.5, p.z + (right.z * cx + up.z * cy) * s * 0.5);
        nor.push(bent.x, bent.y, bent.z);
        uvs.push((cx + 1) / 2, (cy + 1) / 2);
      }
    }
  }
  const leaves = new BufferGeometry();
  leaves.setAttribute('position', new Float32BufferAttribute(pos, 3));
  leaves.setAttribute('normal', new Float32BufferAttribute(nor, 3));
  leaves.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  const merged = mergeGeometries(wood.map((g) => g.toNonIndexed()));
  return { wood: merged, leaves };
}

// Where the trees stand: loose rows across the field, thinning into the fog.
function placements() {
  const out = [];
  let i = 0;
  for (let z = TREES.z0; z < TREES.z1; z += 9 + rand(i, 3) * 6) {
    for (let x = TREES.x0; x < TREES.x1; x += 10 + rand(i, 4) * 10) {
      i++;
      const px = x + (rand(i, 5) - 0.5) * 8;
      const pz = z + (rand(i, 6) - 0.5) * 5;
      // Keep the cow's patch and the beam's ground clear.
      if (Math.abs(px - COW.x) < 7 && pz < TREES.z0 + 6) continue;
      if (rand(i, 7) < 0.25) continue;
      out.push([px, pz, rand(i, 8) * Math.PI * 2, 0.75 + rand(i, 9) * 0.5, Math.floor(rand(i, 10) * SHAPES)]);
    }
  }
  return out;
}

export function createTrees() {
  const group = new Group();
  const time = uniform(0);
  const gust = uniform(0);
  const shapes = Array.from({ length: SHAPES }, (_, s) => growTree(s + 1));
  const spots = placements();

  // Sway: the crown moves most, by its height squared.
  const sway = Fn(() => {
    const ph = hash(float(instanceIndex).mul(7.31)).mul(6.28);
    const k = positionLocal.y.div(7).pow(2);
    const amp = float(0.06).add(gust.mul(0.35));
    const sx = sin(time.mul(1.1).add(ph)).add(sin(time.mul(2.7).add(ph.mul(2))).mul(0.3)).mul(amp).mul(k);
    const sz = cos(time.mul(0.9).add(ph)).mul(amp).mul(k).mul(0.6);
    return positionLocal.add(vec3(sx, 0, sz));
  });

  const bark = new MeshStandardNodeMaterial({ roughness: 0.9 });
  bark.colorNode = vec3(0.05, 0.04, 0.032);
  bark.positionNode = sway();
  const leaf = new MeshStandardNodeMaterial({ side: DoubleSide, roughness: 0.75, alphaTest: 0.5 });
  // A card is a clump of small leaves: blotchy, see-through between them.
  const c = uv().sub(0.5);
  const clump = mx_noise_float(vec3(uv().mul(5.0), hash(float(instanceIndex)).mul(10))).mul(0.5).add(0.62).sub(length(c).mul(1.3));
  leaf.opacityNode = smoothstep(0.1, 0.2, clump);
  leaf.colorNode = mix(vec3(0.035, 0.05, 0.02), vec3(0.06, 0.075, 0.03), hash(float(instanceIndex).mul(3.3)));
  leaf.positionNode = sway();

  const dummy = new Object3D();
  for (let s = 0; s < SHAPES; s++) {
    const mine = spots.filter((p) => p[4] === s);
    if (!mine.length) continue;
    const wood = new InstancedMesh(shapes[s].wood, bark, mine.length);
    const leaves = new InstancedMesh(shapes[s].leaves, leaf, mine.length);
    mine.forEach(([x, z, rot, scale], i) => {
      dummy.position.set(x, 0, z);
      dummy.rotation.set(0, rot, 0);
      dummy.scale.set(scale, scale * (0.9 + 0.2 * rand(i, s)), scale);
      dummy.updateMatrix();
      wood.setMatrixAt(i, dummy.matrix);
      leaves.setMatrixAt(i, dummy.matrix);
    });
    for (const m of [wood, leaves]) {
      m.castShadow = false;
      m.receiveShadow = true;
      m.frustumCulled = false;
      m.layers.set(1);   // not in the ground's mirror: lost in fog there anyway
      group.add(m);
    }
  }
  return {
    object: group,
    count: spots.length,
    update(t, g = 0) { time.value = t; gust.value = g; },
  };
}
