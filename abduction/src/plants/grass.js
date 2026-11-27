// Grass (PLAN.md 5.7) and stones.
//
// Two kinds of grass, for two distances:
// - tufts of thin curved blades, made as geometry: along the verge's strip
//   of gravel by the road and in the forecourt's cracks, where the camera
//   passes close. The verge's cast shadows (they show in 12) and are in the
//   ground's mirror;
// - a carpet over the far shoulder and the field: crossed cards, each
//   showing a few dozen blades painted to a canvas here (paintBlades) and
//   cut out by alpha test, thick along the fence and near the road, thinning
//   into the field and the fog, standing in its water. Thousands of blades
//   for a few triangles each card.
// And stones: squashed, wet and shiny, on the verge's gravel and the far
// shoulder.
import {
  Group, InstancedMesh, BufferGeometry, Float32BufferAttribute, IcosahedronGeometry, Object3D, MeshStandardNodeMaterial,
  DoubleSide, CanvasTexture, NoColorSpace,
} from 'three/webgpu';
import {
  vec3, float, mix, positionLocal, hash, instanceIndex, uniform, sin, texture, uv, max, fwidth, log2, normalViewGeometry,
} from 'three/tsl';
import { ROAD, FENCE, SHOULDER, FORECOURT, SHOP, COW, SIGN } from '../set/layout.js';
import { rand } from '../noise1.js';

// Colours (linear albedo): the tufts, the carpet's blades, the stones.
const TUFT = { dark: [0.03, 0.045, 0.014], light: [0.09, 0.13, 0.03] };
const BLADES = [0.045, 0.065, 0.024];
const STONE = { dark: [0.06, 0.05, 0.04], light: [0.2, 0.16, 0.115] };

// The carpet's card: its size (m) and the canvas painted on it.
const CARD = { w: 1.1, h: 0.42 };
const BLADES_PX = { w: 512, h: 256, count: 90 };
// The carpet's cards per square metre, by distance past the road (m).
const CARPET = { near: 4.2, far: 0.6, fade: 22, depth: 60, x0: -150, x1: 170 };

// Where the gravel strip by the road is (m): from about here to the road's edge.
const VERGE_GRAVEL = 1.2;

// One tuft: blades from a common foot, curving out, each in `SEG` pieces.
const SEG = 2;
function tuftGeometry(blades, seed, { h0, h1, w0, w1 }) {
  const pos = [];
  const nor = [];
  for (let b = 0; b < blades; b++) {
    const ang = rand(b, seed) * Math.PI * 2;
    const lean = 0.15 + rand(b, seed + 1) * 0.55;
    const h = h0 + rand(b, seed + 2) * (h1 - h0);
    const w = w0 + rand(b, seed + 3) * (w1 - w0);
    const dx = Math.cos(ang);
    const dz = Math.sin(ang);
    // Each blade's foot a little off the tuft's middle.
    const fx = (rand(b, seed + 4) - 0.5) * 0.06;
    const fz = (rand(b, seed + 5) - 0.5) * 0.06;
    const px = -dz;
    const pz = dx;
    const pt = (i) => {
      const f = i / SEG;
      const out = lean * h * f * f;
      return [fx + dx * out, h * f * (1 - 0.25 * f * lean), fz + dz * out, w * (1 - f * 0.9)];
    };
    for (let i = 0; i < SEG; i++) {
      const [x0, y0, z0, wa] = pt(i);
      const [x1, y1, z1, wb] = pt(i + 1);
      const quad = [
        [x0 - px * wa, y0, z0 - pz * wa], [x0 + px * wa, y0, z0 + pz * wa], [x1 + px * wb, y1, z1 + pz * wb],
        [x0 - px * wa, y0, z0 - pz * wa], [x1 + px * wb, y1, z1 + pz * wb], [x1 - px * wb, y1, z1 - pz * wb],
      ];
      for (const v of quad) { pos.push(...v); nor.push(dx * 0.4, 0.9, dz * 0.4); }
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new Float32BufferAttribute(nor, 3));
  return g;
}

// The canvas on a carpet card: blades from its foot, tall and short,
// leaning, lighter at the tips. Grey: the material gives it its colour.
function paintBlades() {
  const c = document.createElement('canvas');
  c.width = BLADES_PX.w;
  c.height = BLADES_PX.h;
  const g = c.getContext('2d');
  let i = 0;
  const next = () => rand(i++, 777);
  for (let b = 0; b < BLADES_PX.count; b++) {
    const x = BLADES_PX.w * (0.03 + next() * 0.94);
    const h = BLADES_PX.h * (0.35 + Math.pow(next(), 0.7) * 0.62);
    const bend = (next() - 0.5) * h * 0.7;
    const w = 3 + next() * 4;
    const v0 = Math.round(70 + next() * 60);
    const v1 = Math.round(150 + next() * 100);
    const grad = g.createLinearGradient(0, BLADES_PX.h, 0, BLADES_PX.h - h);
    grad.addColorStop(0, `rgb(${v0},${v0},${v0})`);
    grad.addColorStop(1, `rgb(${v1},${v1},${v1})`);
    g.fillStyle = grad;
    const top = BLADES_PX.h - h;
    g.beginPath();
    g.moveTo(x - w / 2, BLADES_PX.h);
    g.quadraticCurveTo(x - w / 2 + bend * 0.3, top + h * 0.45, x + bend, top);
    g.quadraticCurveTo(x + w / 2 + bend * 0.3, top + h * 0.45, x + w / 2, BLADES_PX.h);
    g.closePath();
    g.fill();
  }
  const t = new CanvasTexture(c);
  t.colorSpace = NoColorSpace;
  return t;
}

// Two cards crossed at right angles, standing on the ground, their normals
// mostly up so they shade like the ground they cover.
function crossedCards() {
  const pos = [];
  const nor = [];
  const uvs = [];
  const idx = [];
  for (let k = 0; k < 2; k++) {
    const a = k * Math.PI / 2;
    const cx = Math.cos(a) * CARD.w / 2;
    const cz = Math.sin(a) * CARD.w / 2;
    const base = pos.length / 3;
    const n = [-Math.sin(a) * 0.35, 0.94, Math.cos(a) * 0.35];
    for (const [x, y, z, u, v] of [[-cx, 0, -cz, 0, 0], [cx, 0, cz, 1, 0], [cx, CARD.h, cz, 1, 1], [-cx, CARD.h, -cz, 0, 1]]) {
      pos.push(x, y, z);
      nor.push(...n);
      uvs.push(u, v);
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
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
  const dummy = new Object3D();
  const place = (mesh, spots) => {
    spots.forEach(([x, z, s, r, sy = 1], i) => {
      dummy.position.set(x, 0, z);
      dummy.rotation.set(0, r, 0);
      dummy.scale.set(s, s * sy, s);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.frustumCulled = false;
    group.add(mesh);
    return mesh;
  };

  // Tufts. Each a little different in colour, swaying by its height squared.
  const tuftMat = new MeshStandardNodeMaterial({ side: DoubleSide, roughness: 0.6 });
  const tint = hash(float(instanceIndex).mul(1.37));
  tuftMat.colorNode = mix(vec3(...TUFT.dark), vec3(...TUFT.light), tint.mul(0.6).add(positionLocal.y.mul(1.2)).clamp(0, 1));
  const k = positionLocal.y.mul(positionLocal.y).mul(4);
  tuftMat.positionNode = positionLocal.add(vec3(sin(time.mul(2.3).add(tint.mul(6.28))).mul(0.035).mul(k), 0, 0));

  // The verge's: tall clumps on the gravel by the road, in runs; they cast
  // shadows and are in the ground's mirror.
  const vergeTuft = tuftGeometry(11, 3, { h0: 0.18, h1: 0.5, w0: 0.005, w1: 0.011 });
  const verge = scatter(1400, 1, (i, s) => {
    const x = -90 + rand(i, s) * 180;
    const z = ROAD.z0 - 0.08 - Math.pow(rand(i, s + 1), 1.5) * VERGE_GRAVEL * 1.2;
    const runs = Math.sin(x * 0.7) + Math.sin(x * 2.3) + Math.sin(x * 0.23) + (rand(i, s + 4) - 0.5) * 1.5;
    return runs > 0.9 ? [x, z, 0.75 + rand(i, s + 2) * 0.6, rand(i, s + 3) * 6, 0.8 + rand(i, s + 5) * 0.5] : null;
  });
  // Long grass round the welcome sign's posts (02).
  for (let i = 0; i < 70; i++) {
    const a = rand(i, 61) * Math.PI * 2;
    const r = Math.sqrt(rand(i, 62));
    verge.push([SIGN.x + Math.cos(a) * r * 2.2, SIGN.z + Math.sin(a) * r * 1.3, 1.0 + rand(i, 63) * 0.5, rand(i, 64) * 6, 0.9 + rand(i, 65) * 0.5]);
  }
  const vm = place(new InstancedMesh(vergeTuft, tuftMat, verge.length), verge);
  vm.castShadow = true;
  vm.receiveShadow = true;

  // Sparse, short, in the forecourt's cracks and at the shop's foot: drawn,
  // but left out of the mirror (layer 1).
  const crackTuft = tuftGeometry(7, 5, { h0: 0.1, h1: 0.26, w0: 0.006, w1: 0.012 });
  const cracks = scatter(500, 3, (i, s) => {
    const x = FORECOURT.x0 + rand(i, s) * (FORECOURT.x1 - FORECOURT.x0);
    const z = rand(i, s + 1) < 0.3 ? SHOP.z1 + 0.15 : rand(i, s + 1) * FORECOURT.z1;
    return rand(i, s + 4) < 0.5 ? [x, z, 0.5 + rand(i, s + 2) * 0.6, rand(i, s + 3) * 6] : null;
  });
  const cm = place(new InstancedMesh(crackTuft, tuftMat, cracks.length), cracks);
  cm.receiveShadow = true;
  cm.layers.set(1);

  // The carpet: crossed cards over the far shoulder and the field, thick
  // from the shoulder's middle to the fence and a little past it, thinning
  // with distance; none where the cow stands.
  const blades = paintBlades();
  const carpetMat = new MeshStandardNodeMaterial({ side: DoubleSide, roughness: 0.7, alphaTest: 0.5 });
  const b = texture(blades, uv());
  const lod = log2(max(fwidth(uv().x).mul(BLADES_PX.w), fwidth(uv().y).mul(BLADES_PX.h))).max(0);
  carpetMat.opacityNode = b.a.mul(lod.mul(0.12).add(1));
  const ct = hash(float(instanceIndex).mul(2.71));
  carpetMat.colorNode = vec3(...BLADES).mul(b.rgb).mul(mix(vec3(0.75, 0.85, 0.8), vec3(1.25, 1.1, 0.85), ct));
  carpetMat.normalNode = normalViewGeometry;
  const ck = uv().y.mul(uv().y);
  carpetMat.positionNode = positionLocal.add(vec3(sin(time.mul(1.9).add(ct.mul(6.28))).mul(0.06).mul(ck), 0, 0));
  const carpetStart = SHOULDER.z0 + 0.8;
  const area = (CARPET.x1 - CARPET.x0) * CARPET.depth;
  // Drawn by rejection: a spot is kept by how thick the carpet is there.
  const carpet = scatter(Math.round(area * CARPET.near), 2, (i, s) => {
    const x = CARPET.x0 + rand(i, s) * (CARPET.x1 - CARPET.x0);
    const z = carpetStart + rand(i, s + 1) * CARPET.depth;
    const past = z - carpetStart;
    // Thickest along the fence, thinning into the field and away from the middle.
    const fence = Math.exp(-Math.abs(z - FENCE.z) / 3);
    const density = CARPET.far + (CARPET.near - CARPET.far) * Math.max(fence, Math.exp(-past / CARPET.fade)) * Math.exp(-Math.abs(x) / 120);
    if (rand(i, s + 6) * CARPET.near > density) return null;
    if (Math.abs(x - COW.x) < 1.6 && Math.abs(z - COW.z) < 1.2) return null;
    const tall = 0.6 + fence * 0.5 + rand(i, s + 5) * 0.4;
    return [x, z, 0.8 + rand(i, s + 2) * 0.5, rand(i, s + 3) * 6, tall];
  });
  const carpetMesh = place(new InstancedMesh(crossedCards(), carpetMat, carpet.length), carpet);
  carpetMesh.receiveShadow = true;
  carpetMesh.layers.set(1);

  // Stones on the verge's gravel, a few on the concrete by it, and on the
  // far shoulder: wet and shiny, pale where the light catches them.
  const stoneMat = new MeshStandardNodeMaterial({ roughness: 0.25 });
  stoneMat.colorNode = mix(vec3(...STONE.dark), vec3(...STONE.light), hash(float(instanceIndex).mul(5.1)).pow(0.7));
  const stones = scatter(2200, 4, (i, s) => {
    const near = rand(i, s) < 0.7;
    const z = near ? ROAD.z0 - 0.05 - Math.pow(rand(i, s + 1), 1.4) * VERGE_GRAVEL * 1.4 : ROAD.z1 + 0.1 + rand(i, s + 1) * 1.6;
    const x = near ? -45 + rand(i, s + 2) * 75 : -90 + rand(i, s + 2) * 180;
    return [x, z, 0.012 + Math.pow(rand(i, s + 3), 3) * 0.045, rand(i, s + 4) * 6];
  });
  const sm = new InstancedMesh(new IcosahedronGeometry(1, 0), stoneMat, stones.length);
  stones.forEach(([x, z, s, r], i) => {
    dummy.position.set(x, s * 0.2, z);
    dummy.rotation.set(rand(i, 9) * 0.4, r, rand(i, 10) * 0.4);
    dummy.scale.set(s * (1 + rand(i, 11) * 0.8), s * (0.45 + rand(i, 12) * 0.25), s);
    dummy.updateMatrix();
    sm.setMatrixAt(i, dummy.matrix);
  });
  sm.receiveShadow = true;
  sm.frustumCulled = false;
  sm.layers.set(1);   // too small to matter in the ground's mirror
  group.add(sm);
  return { object: group, update(t) { time.value = t; } };
}
