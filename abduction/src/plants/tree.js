// Trees (PLAN.md 5.7): grown in code, acacias bent by the wind. A trunk that
// rises, leans and forks low; two to four limbs spreading up and out; twigs
// to a dozen clumps of leaves that together make a wide, flat-topped crown
// with sky between the clumps. Every tree leans the same way, give or take,
// as wind-swept trees do (toward -X, as the original's do from the road).
//
// A clump is a few dozen leaf cards turned every way, each showing a cluster
// of small leaves painted to a canvas here (paintCluster) and cut out by
// alpha test, so a clump's edge is ragged and the eye reads leaves, not
// cards. Their normals are bent outward from the clump and the crown, so a
// crown shades as a few round masses: near-black against the fog, green
// where lightning or the saucer lights it.
//
// Five shapes, instanced, turned a little and scaled; each grown twice, in
// full for the trees near where the camera goes and with fewer, larger cards
// for those off in the fog. Wood and leaves are one geometry and one material
// (wood is the part with no cut-out), so a shape costs one draw. They sway,
// harder while the saucer is overhead.
import {
  Group, InstancedMesh, BufferGeometry, Float32BufferAttribute, Object3D, Vector3, MeshStandardNodeMaterial, DoubleSide,
  CanvasTexture, NoColorSpace,
} from 'three/webgpu';
import {
  positionLocal, vec3, float, sin, cos, uniform, instanceIndex, hash, uv, mix, Fn, max, step, texture, attribute, fwidth,
  log2, normalViewGeometry,
} from 'three/tsl';
import { TREES, COW } from '../set/layout.js';
import { rand } from '../noise1.js';

const SHAPES = 5;

// The two levels of detail: cards per cubic metre of clump, a card's size
// (m), how many sides the wood has and in how many pieces it bends.
const DETAIL = [
  { cardsPerM3: 13, card: 0.85, trunkSides: 7, limbSides: 5, twigSides: 4, segments: 5 },
  { cardsPerM3: 2.6, card: 1.5, trunkSides: 5, limbSides: 4, twigSides: 3, segments: 2 },
];
// Trees nearer than this (m) to where the camera goes are drawn in full.
const NEAR = { x: -6, z: 12, r: 85 };
// Beyond this (m) from there, none: the fog has them.
const FAR_R = 190;

// Colours (linear albedo): leaves, and the wood.
const LEAF = [0.11, 0.17, 0.05];
const WOOD = [0.04, 0.034, 0.028];

// The painted cluster of leaves on each card: its size (px) and how many leaves.
const CLUSTER_PX = 512;
const CLUSTER_LEAVES = 1100;

// A repeatable stream of random numbers in 0..1.
const stream = (seed) => {
  let i = 0;
  return () => rand(i++, seed);
};

// The canvas a card shows: small leaves, lighter and darker, thick in the
// middle and thinning to the edge, on a few dark twigs. Grey: the material
// gives it its green.
function paintCluster() {
  const c = document.createElement('canvas');
  c.width = c.height = CLUSTER_PX;
  const g = c.getContext('2d');
  const next = stream(4242);
  const mid = CLUSTER_PX / 2;
  const R = CLUSTER_PX * 0.47;
  g.lineCap = 'round';
  for (let i = 0; i < 7; i++) {
    const a = next() * Math.PI * 2;
    g.strokeStyle = 'rgb(60,52,44)';
    g.lineWidth = 3 + next() * 3;
    g.beginPath();
    g.moveTo(mid + Math.cos(a) * R * 0.05, mid + Math.sin(a) * R * 0.05);
    g.quadraticCurveTo(mid + Math.cos(a + 0.3) * R * 0.5, mid + Math.sin(a + 0.3) * R * 0.5, mid + Math.cos(a) * R * 0.85, mid + Math.sin(a) * R * 0.85);
    g.stroke();
  }
  for (let i = 0; i < CLUSTER_LEAVES; i++) {
    const a = next() * Math.PI * 2;
    const r = Math.sqrt(next()) * R;
    // Fewer toward the edge, so it is ragged rather than round.
    if (next() < Math.pow(r / R, 2.5)) continue;
    const len = CLUSTER_PX * (0.03 + next() * 0.035);
    const v = Math.round(120 + next() * 135 - (r / R) * 30);
    g.fillStyle = `rgb(${v},${v},${v})`;
    g.save();
    g.translate(mid + Math.cos(a) * r, mid + Math.sin(a) * r);
    g.rotate(next() * Math.PI);
    g.beginPath();
    g.ellipse(0, 0, len / 2, len * 0.19, 0, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
  const t = new CanvasTexture(c);
  t.colorSpace = NoColorSpace;
  return t;
}

// Geometry being gathered: positions, normals, uvs (wood has uv -1: no
// cut-out), colours (the albedo, times how deep in the crown).
class Parts {
  constructor() { this.pos = []; this.nor = []; this.uv = []; this.col = []; this.idx = []; }
  get count() { return this.pos.length / 3; }
  vertex(p, n, u, v, c) {
    this.pos.push(p.x, p.y, p.z);
    this.nor.push(n.x, n.y, n.z);
    this.uv.push(u, v);
    this.col.push(c[0], c[1], c[2]);
  }
  geometry() {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    return g;
  }
}

const _t = new Vector3();
const _n = new Vector3();
const _b = new Vector3();
const _p = new Vector3();
const _d = new Vector3();

// A tube through points with a radius at each, `sides` round.
function tube(parts, pts, radii, sides) {
  const base = parts.count;
  _n.set(0, 0, 1);
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    _t.subVectors(b, a).normalize();
    // Carry the frame along the curve, so the tube does not twist.
    _n.addScaledVector(_t, -_n.dot(_t));
    if (_n.lengthSq() < 1e-6) _n.set(1, 0, 0).addScaledVector(_t, -_t.x);
    _n.normalize();
    _b.crossVectors(_t, _n);
    for (let s = 0; s < sides; s++) {
      const th = (s / sides) * Math.PI * 2;
      _d.copy(_n).multiplyScalar(Math.cos(th)).addScaledVector(_b, Math.sin(th));
      _p.copy(pts[i]).addScaledVector(_d, radii[i]);
      parts.vertex(_p, _d, -1, -1, WOOD);
    }
  }
  for (let i = 0; i + 1 < pts.length; i++) {
    for (let s = 0; s < sides; s++) {
      const a = base + i * sides + s;
      const b = base + i * sides + ((s + 1) % sides);
      parts.idx.push(a, b, a + sides, b, b + sides, a + sides);
    }
  }
}

// Points along a curve from a to b, bowed toward `bow` (a quadratic Bézier).
function curve(a, bow, b, n) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    out.push(new Vector3(
      u * u * a.x + 2 * u * t * bow.x + t * t * b.x,
      u * u * a.y + 2 * u * t * bow.y + t * t * b.y,
      u * u * a.z + 2 * u * t * bow.z + t * t * b.z,
    ));
  }
  return out;
}

// The skeleton of one tree shape, the same for both levels of detail: the
// trunk, the limbs, the twigs and the clumps, about 5 to 8 m tall.
function skeleton(seed) {
  const next = stream(seed * 101 + 7);
  const height = 5.0 + next() * 2.8;
  const radius = 0.55 * height + 0.5 + next() * 1.5;  // the crown's, m
  const lean = 0.25 + next() * 0.35;             // radians, toward +X here (turned to -X when placed)
  const forkY = 0.9 + next() * 1.6;
  const trunkR = 0.13 + 0.025 * height;
  // The trunk: up from the ground, then leaning, a knee low down.
  const knee = new Vector3(0.05, forkY * 0.35, (next() - 0.5) * 0.2);
  const fork = new Vector3(Math.tan(lean) * forkY * 0.9, forkY, (next() - 0.5) * 0.5);
  const trunk = { a: new Vector3(0, -0.1, 0), bow: knee, b: fork, r0: trunkR, r1: trunkR * 0.75 };
  // The crown's middle, further along the lean.
  const crownY = height - 0.5;
  const centre = new Vector3(fork.x + Math.tan(lean) * (crownY - forkY) * 0.55, crownY, fork.z);
  // Clumps round it, flat on top, the edges a little lower.
  const clumps = [];
  const n = 12 + Math.floor(next() * 7);
  const phase = next() * Math.PI * 2;
  for (let i = 0; i < n; i++) {
    const a = phase + (i / n) * Math.PI * 2 + (next() - 0.5) * 0.5;
    const rr = radius * (i % 4 === 0 ? 0.2 + next() * 0.3 : 0.6 + next() * 0.4);
    const fall = (rr / radius) * (rr / radius);
    clumps.push({
      c: new Vector3(centre.x + Math.cos(a) * rr, crownY - fall * 0.8 + (next() - 0.5) * 0.4, centre.z + Math.sin(a) * rr),
      rx: 0.85 + next() * 0.8,
      ry: 0.38 + next() * 0.3,
      a,
    });
  }
  // Limbs from the fork, each feeding the clumps nearest its way round.
  const nl = 2 + Math.floor(next() * 3);
  const lp = next() * Math.PI * 2;
  const ways = Array.from({ length: nl }, (_, i) => lp + (i / nl) * Math.PI * 2 + (next() - 0.5) * 0.6);
  const apart = (a, b) => Math.abs((((a - b) % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2) - Math.PI);
  const limbs = [];
  ways.forEach((a, i) => {
    const mine = clumps.filter((c) => ways.every((b, j) => j === i || apart(c.a, a) <= apart(c.a, b)));
    if (!mine.length) return;
    const mean = mine.reduce((m, c) => m.add(c.c), new Vector3()).multiplyScalar(1 / mine.length);
    const end = fork.clone().lerp(mean, 0.6);
    end.y = fork.y + (crownY - fork.y) * (0.55 + next() * 0.2);
    const bow = fork.clone().lerp(end, 0.5).add(new Vector3(0, 0.3, 0));
    limbs.push({ a: fork, bow, b: end, r0: trunkR * 0.7, r1: trunkR * 0.4, clumps: mine });
  });
  return { trunk, limbs, clumps, centre, seed };
}

// One shape's geometry at one level of detail.
function build(sk, detail) {
  const parts = new Parts();
  const next = stream(sk.seed * 977 + detail.cardsPerM3 * 13);
  const { trunk } = sk;
  const tp = curve(trunk.a, trunk.bow, trunk.b, detail.segments);
  tube(parts, tp, tp.map((_, i) => trunk.r0 + (trunk.r1 - trunk.r0) * (i / (tp.length - 1))), detail.trunkSides);
  for (const limb of sk.limbs) {
    const lp = curve(limb.a, limb.bow, limb.b, Math.max(2, detail.segments - 1));
    tube(parts, lp, lp.map((_, i) => limb.r0 + (limb.r1 - limb.r0) * (i / (lp.length - 1))), detail.limbSides);
    for (const c of limb.clumps) {
      const to = c.c.clone().add(new Vector3(0, -c.ry * 0.4, 0));
      const bow = limb.b.clone().lerp(to, 0.5).add(new Vector3(0, 0.35, 0));
      const twig = curve(limb.b, bow, to, Math.max(1, detail.segments - 2));
      tube(parts, twig, twig.map((_, i) => limb.r1 * (1 - 0.6 * (i / (twig.length - 1)))), detail.twigSides);
    }
  }
  // Leaf cards through each clump, turned every way, their normals bent
  // outward from the clump and from the crown, darker deep inside.
  const right = new Vector3();
  const up = new Vector3();
  const n = new Vector3();
  const bent = new Vector3();
  const p = new Vector3();
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  for (const c of sk.clumps) {
    const volume = (4 / 3) * Math.PI * c.rx * c.rx * c.ry;
    const cards = Math.max(4, Math.round(volume * detail.cardsPerM3));
    for (let k = 0; k < cards; k++) {
      // A point in the clump, flattened on top.
      let x; let y; let z;
      do { x = next() * 2 - 1; y = next() * 2 - 1; z = next() * 2 - 1; } while (x * x + y * y + z * z > 1);
      y = Math.min(y, 0.45);
      p.set(c.c.x + x * c.rx, c.c.y + y * c.ry, c.c.z + z * c.rx);
      const depth = Math.sqrt(x * x + y * y + z * z);
      n.set(next() - 0.5, next() - 0.5 + 0.15, next() - 0.5).normalize();
      right.set(0, 1, 0).cross(n);
      if (right.lengthSq() < 0.01) right.set(1, 0, 0);
      right.normalize();
      up.crossVectors(n, right).normalize();
      const s = detail.card * (0.75 + next() * 0.5) * 0.5;
      bent.set(x, y * 0.6 + 0.2, z).normalize().multiplyScalar(0.5)
        .add(_d.subVectors(p, sk.centre).setY(0).normalize().multiplyScalar(0.3)).add(_t.set(0, 0.8, 0)).normalize();
      const shade = 0.45 + 0.55 * depth;
      const hue = 0.9 + next() * 0.2;
      const col = [LEAF[0] * shade * (2 - hue), LEAF[1] * shade, LEAF[2] * shade * hue];
      const turn = next() * Math.PI * 2;
      const base = parts.count;
      for (const [cx, cy] of corners) {
        _p.copy(p).addScaledVector(right, cx * s).addScaledVector(up, cy * s);
        // The cluster turned on the card, so no two read the same.
        const u = 0.5 + 0.5 * (cx * Math.cos(turn) - cy * Math.sin(turn)) * 0.999;
        const v = 0.5 + 0.5 * (cx * Math.sin(turn) + cy * Math.cos(turn)) * 0.999;
        parts.vertex(_p, bent, u, v, col);
      }
      parts.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }
  return parts.geometry();
}

// Where the trees stand: loose rows across the field, closer near the road,
// thinning into the fog. [x, z, turn, scale, shape, level of detail].
function placements() {
  const out = [];
  let i = 0;
  let z = TREES.z0;
  while (z < TREES.z1) {
    const near = z < TREES.z0 + 40;
    let x = TREES.x0 + rand(i, 1) * 8;
    while (x < TREES.x1) {
      i++;
      const px = x + (rand(i, 5) - 0.5) * 5;
      const pz = z + (rand(i, 6) - 0.5) * 4;
      x += (near ? 10 : 9) + rand(i, 4) * (near ? 7 : 8);
      // Keep the cow's patch and the beam's ground clear.
      if (Math.abs(px - COW.x) < 7 && pz < TREES.z0 + 6) continue;
      if (rand(i, 7) < 0.15) continue;
      const d = Math.hypot(px - NEAR.x, pz - NEAR.z);
      if (d > FAR_R) continue;
      // Leaning toward -X, give or take.
      const turn = Math.PI + (rand(i, 8) - 0.5) * 0.9;
      out.push([px, pz, turn, 0.8 + rand(i, 9) * 0.45, Math.floor(rand(i, 10) * SHAPES), d < NEAR.r ? 0 : 1]);
    }
    z += (near ? 7.5 : 9) + rand(i, 3) * (near ? 3.5 : 6) + (z - TREES.z0) * 0.04;
  }
  return out;
}

export function createTrees() {
  const group = new Group();
  const time = uniform(0);
  const gust = uniform(0);
  const skeletons = Array.from({ length: SHAPES }, (_, s) => skeleton(s + 1));
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

  const cluster = paintCluster();
  const material = new MeshStandardNodeMaterial({ side: DoubleSide, roughness: 0.8, alphaTest: 0.5 });
  const leaf = texture(cluster, uv());
  const wood = step(uv().x, -0.5);
  // Far off, the texture's smaller copies average the leaves' cut-out away:
  // make up for it, so distant crowns stay whole.
  const lod = log2(max(fwidth(uv().x), fwidth(uv().y)).mul(CLUSTER_PX)).max(0);
  material.opacityNode = max(leaf.a.mul(lod.mul(0.08).add(1)), wood);
  // Each tree a little different in colour: some yellower, some darker.
  const h = hash(float(instanceIndex).mul(3.3));
  const tint = mix(vec3(0.8, 0.9, 0.85), vec3(1.2, 1.1, 0.8), h);
  material.colorNode = attribute('color').mul(mix(leaf.rgb.mul(tint), vec3(1), wood));
  // The bent normals as they are, on both faces of a card.
  material.normalNode = normalViewGeometry;
  material.positionNode = sway();

  const dummy = new Object3D();
  for (let level = 0; level < DETAIL.length; level++) {
    for (let s = 0; s < SHAPES; s++) {
      const mine = spots.filter((p) => p[4] === s && p[5] === level);
      if (!mine.length) continue;
      const geometry = build(skeletons[s], DETAIL[level]);
      const mesh = new InstancedMesh(geometry, material, mine.length);
      mine.forEach(([x, z, turn, scale], i) => {
        dummy.position.set(x, 0, z);
        dummy.rotation.set(0, turn, 0);
        dummy.scale.set(scale * (0.9 + 0.2 * rand(i, s + 20)), scale * (0.88 + 0.24 * rand(i, s + 30)), scale * (0.9 + 0.2 * rand(i, s + 40)));
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      });
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      mesh.layers.set(1);   // not in the ground's mirror: lost in fog there anyway
      group.add(mesh);
    }
  }
  return {
    object: group,
    count: spots.length,
    update(t, g = 0) { time.value = t; gust.value = g; },
  };
}
