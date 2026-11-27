// Trees (PLAN.md 5.7): grown in code, acacias in the wind, as the original's
// are. A trunk rises bare for a third to a half of the tree, leaning a
// little, and carries on thinner up into the crown; two or three limbs leave
// it at different heights and spread up and out in a V, bowed, and each ends
// in branches that hold up heads of rounded clumps of leaves. The heads sit
// on a dome: high ones near the middle, low ones far out, with sky between
// them, so a crown is a broad, deep dome, lumpy and ragged at the edge, not
// a flat lid. Most trees lean a little toward -X, some the other way.
//
// A clump is a few dozen leaf cards turned every way, each showing a cluster
// of small leaves painted to a canvas here (paintCluster) and cut out by
// alpha test, so a clump's edge is ragged and the eye reads leaves, not
// cards. Their normals are bent mostly outward from the crown and a little
// from the clump, so a crown shades as one dome with lumps: lit on top and
// on the faces toward a light, darker underneath, green where lightning or
// the saucer lights it, near-black against the fog where nothing does.
//
// They stand in loose rows across the field: one by one along the fence,
// few behind with fog and sky between, denser off in the fog; and one big
// tree behind the cow, as in the original, its crown lit by the beam.
//
// Five shapes, instanced, turned and scaled; each grown twice, in full for
// the trees near where the camera goes and with fewer, larger cards for those
// off in the fog. Wood and leaves are one geometry and one material (wood is
// the part with no cut-out), so a shape costs one draw. They sway, harder
// while the saucer is overhead.
import {
  Group, InstancedMesh, BufferGeometry, Float32BufferAttribute, Object3D, Vector3, MeshPhysicalNodeMaterial, DoubleSide,
  CanvasTexture, NoColorSpace,
} from 'three/webgpu';
import {
  positionLocal, vec3, float, sin, cos, uniform, instanceIndex, hash, uv, mix, Fn, max, step, texture, attribute, fwidth,
  log2, normalViewGeometry,
} from 'three/tsl';
import { TREES, COW } from '../set/layout.js';
import { rand } from '../noise1.js';

const TAU = Math.PI * 2;

// The five shapes. height: m. spread: the crown's radius, and depth: how deep
// it is, each a fraction of the height. fork: where the first limb leaves
// the trunk, a fraction of the height. limbs: how many; heads: how many heads
// of leaves each limb ends in. clump: a head's main clump's radius, a
// fraction of the crown's. top: clumps over the middle that round the dome.
// lean: radians.
const KINDS = [
  // Big and spreading, a broad dome of many heads (the one behind the cow).
  { height: 10.0, spread: 0.55, depth: 0.42, fork: 0.34, limbs: 3, heads: 3, clump: 0.27, top: 2, lean: 0.1 },
  // Rounder and fuller, a dome.
  { height: 8.2, spread: 0.62, depth: 0.4, fork: 0.34, limbs: 3, heads: 2, clump: 0.28, top: 2, lean: 0.14 },
  // An umbrella: flatter-topped, a few heads held apart on long limbs.
  { height: 7.6, spread: 0.78, depth: 0.32, fork: 0.4, limbs: 3, heads: 2, clump: 0.25, top: 1, lean: 0.08 },
  // Young: small and round, low down.
  { height: 6.2, spread: 0.62, depth: 0.42, fork: 0.34, limbs: 2, heads: 3, clump: 0.32, top: 1, lean: 0.16 },
  // Tall and thin, leaning, a few heads high up.
  { height: 9.0, spread: 0.58, depth: 0.34, fork: 0.46, limbs: 3, heads: 2, clump: 0.3, top: 1, lean: 0.2 },
];
const SHAPES = KINDS.length;

// The trunk's radius at its foot (m): this, plus this much per metre of height.
const TRUNK_R = 0.12;
const TRUNK_R_PER_M = 0.024;
// How far (m) the trunk's knee is pushed aside, at most: trunks that bend.
const KNEE = 0.45;
// Where on the crown's dome the heads of leaves are: their angle from its top
// (radians), from this to this, more of them toward the edge.
const DOME = [0.4, 1.3];

// The two levels of detail: cards per square metre of a clump's surface, a
// card's size (m), how many sides the wood has and in how many pieces it bends.
const DETAIL = [
  { cardsPerM2: 4.4, card: 0.6, trunkSides: 7, limbSides: 5, branchSides: 4, segments: 5 },
  { cardsPerM2: 0.55, card: 1.45, trunkSides: 5, limbSides: 4, branchSides: 3, segments: 2 },
];
// Leaf cards keep out of this much of a clump's middle (a fraction of its
// radius): unseen there, and the clump reads as a rounded mass.
const HOLLOW = 0.35;
// Trees nearer than this (m) to where the camera goes are drawn in full.
const NEAR = { x: -6, z: 12, r: 85 };
// Beyond this (m) from there, none: the fog has them.
const FAR_R = 190;

// Where they stand: rows across the field, in three bands by how far past
// TREES.z0 (m) a row is: along the fence, trees one by one; behind them few,
// with fog and sky between, as the original's; then denser into the fog.
// step: m between trees along a row, at least, and the most added at random;
// row: m between rows, likewise, and how much more per metre past TREES.z0.
// A tree is left out if its crown would crowd one already placed (gap: two
// trees stand at least this times the sum of their crowns' radii apart).
const PLACING = [
  { to: 14, step: [11, 13], row: [9, 5, 0], jitter: [8, 6], gap: 1.0 },
  { to: 60, step: [15, 16], row: [11, 7, 0], jitter: [10, 6], gap: 1.1 },
  { to: Infinity, step: [11, 12], row: [10, 7, 0.04], jitter: [6, 4], gap: 0.95 },
];
// How big a tree is drawn: its shape's height times this, plus up to this much at random.
const SCALE = [0.8, 0.35];
// No tree taller than this (m): the saucer comes in over the field at 12 to 14 m.
const MAX_HEIGHT = 10.5;
// The big tree that stands behind the cow in the original, its crown lit by
// the beam: where, from the cow (m; 9 m behind it from the road at 42 s, a
// little to its left), and its shape, scale and turn (leaning a little
// toward -X, to the right there).
const BEHIND_COW = { dx: 4.1, dz: 8, shape: 0, scale: 0.85, turn: Math.PI + 0.4 };

// Colours (linear albedo): leaves, a full green with little blue (the
// lightning and the fog bring blue enough), and the wood, dark brown.
const LEAF = [0.09, 0.25, 0.012];
const WOOD = [0.035, 0.026, 0.018];

// How much of a dielectric's specular the leaves and the wood keep: a crown's
// bent normals face every way, and the full sheen at their grazing edges
// greys a crown against the sky; on the limbs it turns them pale grey.
const LEAF_SPECULAR = 0.25;
const WOOD_SPECULAR = 0.4;

// How much darker a card is deep in its clump, and low in the crown (0..1 of
// its albedo taken away at the very middle, and at the crown's underside).
const DEEP = 0.25;
const UNDER = 0.5;
// How much a card's normal follows its own clump's round rather than the
// crown's: low, so a crown shades as one dome with lumps, not a heap of balls.
const CLUMP_ROUND = 0.3;

// The painted cluster of leaves on each card: its size (px) and how many leaves.
const CLUSTER_PX = 512;
const CLUSTER_LEAVES = 1100;

// The sway's reference height (m): the crown moves by its height over this, squared.
const SWAY_HEIGHT = 8;

// A repeatable stream of random numbers in 0..1.
const stream = (seed) => {
  let i = 0;
  return () => rand(i++, seed);
};

// The canvas a card shows: small leaves, lighter and darker, some yellower,
// thick in the middle and thinning to the edge, on a few dark twigs. Near
// grey: the material gives it its green.
function paintCluster() {
  const c = document.createElement('canvas');
  c.width = c.height = CLUSTER_PX;
  const g = c.getContext('2d');
  const next = stream(4242);
  const mid = CLUSTER_PX / 2;
  const R = CLUSTER_PX * 0.47;
  g.lineCap = 'round';
  for (let i = 0; i < 7; i++) {
    const a = next() * TAU;
    g.strokeStyle = 'rgb(60,52,44)';
    g.lineWidth = 3 + next() * 3;
    g.beginPath();
    g.moveTo(mid + Math.cos(a) * R * 0.05, mid + Math.sin(a) * R * 0.05);
    g.quadraticCurveTo(mid + Math.cos(a + 0.3) * R * 0.5, mid + Math.sin(a + 0.3) * R * 0.5, mid + Math.cos(a) * R * 0.85, mid + Math.sin(a) * R * 0.85);
    g.stroke();
  }
  for (let i = 0; i < CLUSTER_LEAVES; i++) {
    const a = next() * TAU;
    const r = Math.sqrt(next()) * R;
    // Fewer toward the edge, so it is ragged rather than round.
    if (next() < Math.pow(r / R, 2.5)) continue;
    const len = CLUSTER_PX * (0.03 + next() * 0.035);
    const v = 110 + next() * 145 - (r / R) * 25;
    const warm = next() * 0.25;   // some leaves yellower, some bluer
    g.fillStyle = `rgb(${Math.round(v * (0.9 + warm))},${Math.round(v)},${Math.round(v * (1.05 - warm * 1.4))})`;
    g.save();
    g.translate(mid + Math.cos(a) * r, mid + Math.sin(a) * r);
    g.rotate(next() * Math.PI);
    g.beginPath();
    g.ellipse(0, 0, len / 2, len * 0.19, 0, 0, TAU);
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
      const th = (s / sides) * TAU;
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

// A piece of wood from a to b, bowed up by `rise` (m) and out (away from the
// tree's axis through `axis`) by `out` (m), radius r0 to r1.
const wood = (a, b, rise, r0, r1, out = 0, axis = a) => {
  const bow = a.clone().lerp(b, 0.5);
  _d.set(bow.x - axis.x, 0, bow.z - axis.z);
  if (_d.lengthSq() > 1e-6) bow.addScaledVector(_d.normalize(), out);
  bow.y += rise;
  return { a, b, bow, r0, r1 };
};

// The skeleton of one tree shape, the same for both levels of detail: the
// trunk, the limbs and branches (wood), and the clumps of leaves.
function skeleton(kind, seed) {
  const next = stream(seed * 101 + 7);
  const H = kind.height * (0.94 + next() * 0.12);
  const R = kind.spread * H;
  const D = kind.depth * H;
  const forkY = kind.fork * H;
  const lean = kind.lean * (0.7 + next() * 0.6);    // radians, toward +X here (turned to -X when placed)
  const trunkR = TRUNK_R + TRUNK_R_PER_M * H;
  // The trunk: up from the ground, leaning, a slight knee low down.
  const fork = new Vector3(Math.tan(lean) * forkY, forkY, (next() - 0.5) * 0.3);
  const knee = new Vector3(fork.x * 0.25 + (next() - 0.5) * KNEE, forkY * 0.45, fork.z * 0.3 + (next() - 0.5) * KNEE);
  const pieces = [{ a: new Vector3(0, -0.1, 0), bow: knee, b: fork, r0: trunkR, r1: trunkR * 0.8, sides: 'trunkSides' }];
  // The crown's middle, over the fork and carried on a little along the lean.
  const midY = H - D * 0.5;
  const centre = new Vector3(fork.x + Math.tan(lean) * (midY - forkY) * 0.5, midY, fork.z);
  // The trunk carries on, thinner and leaning aside, up into the crown, and
  // the limbs leave it at different heights: not all from one point.
  const la = next() * TAU;
  const lead = new Vector3(centre.x + Math.cos(la) * R * 0.15, H - D * 0.7, centre.z + Math.sin(la) * R * 0.15);
  pieces.push({ ...wood(fork, lead, 0, trunkR * 0.75, trunkR * 0.35), sides: 'limbSides' });
  const clumps = [];
  const clump = (c, rx, ry) => clumps.push({ c, rx, ry });
  const phase = next() * TAU;
  for (let l = 0; l < kind.limbs; l++) {
    const a = phase + (l / kind.limbs) * TAU + (next() - 0.5) * 0.7;
    const from = fork.clone().lerp(lead, ((l * 2) % kind.limbs) / kind.limbs * 0.55 + next() * 0.15);
    // Where the limb divides: well out, a little under the crown, so the
    // limbs show beneath it in a V, bowed outward as they go.
    const er = R * (0.3 + next() * 0.15);
    const ey = Math.max(from.y + 0.5, from.y + (H - D - from.y) * (0.6 + next() * 0.25));
    const elbow = new Vector3(centre.x + Math.cos(a) * er, ey, centre.z + Math.sin(a) * er);
    const len = from.distanceTo(elbow);
    pieces.push({ ...wood(from, elbow, 0.05 * len, trunkR * (0.68 - 0.2 * (from.y - forkY) / (lead.y - forkY)), trunkR * 0.36, 0.12 * len, centre), sides: 'limbSides' });
    for (let h = 0; h < kind.heads; h++) {
      // A head: a main clump and a few smaller ones round it, at the end of a
      // branch, somewhere on the dome: high near the middle, low far out.
      const ha = a + (kind.heads > 1 ? (h - (kind.heads - 1) / 2) * (0.6 + next() * 0.5) * (TAU / kind.limbs) / kind.heads : 0) + (next() - 0.5) * 0.3;
      const rx = R * kind.clump * (0.85 + next() * 0.35);
      const ry = Math.min(rx * (0.6 + next() * 0.2), D * 0.5);
      const phi = DOME[0] + Math.sqrt(next()) * (DOME[1] - DOME[0]);
      const hr = Math.max(Math.sin(phi) * (R - rx * 0.6), er + 0.3);
      const hy = H - D + Math.cos(phi) * (D - ry);
      const hc = new Vector3(centre.x + Math.cos(ha) * hr, hy, centre.z + Math.sin(ha) * hr);
      clump(hc, rx, ry);
      pieces.push({ ...wood(elbow, hc.clone().setY(hy - ry * 0.35), 0.3, trunkR * 0.34, trunkR * 0.16, 0.2, centre), sides: 'branchSides' });
      const satellites = 1 + Math.floor(next() * 3);
      for (let s = 0; s < satellites; s++) {
        const sa = ha + (next() - 0.5) * 1.6;
        const out = rx * (0.55 + next() * 0.45);
        const k = 0.5 + next() * 0.3;
        clump(new Vector3(hc.x + Math.cos(sa) * out, hy + (next() - 0.4) * ry * 1.1, hc.z + Math.sin(sa) * out), rx * k, ry * k);
      }
    }
  }
  // Over the middle, at the top of the trunk: the top of the dome.
  for (let i = 0; i < kind.top; i++) {
    const rx = R * kind.clump * (1.0 + next() * 0.3);
    const ry = Math.min(rx * 0.72, D * 0.45);
    const a = next() * TAU;
    const off = R * 0.18 * next();
    const c = new Vector3(centre.x + Math.cos(a) * off, H - ry * 0.95, centre.z + Math.sin(a) * off);
    clump(c, rx, ry);
    pieces.push({ ...wood(lead, c.clone().setY(c.y - ry * 0.5), 0.2, trunkR * 0.35, trunkR * 0.2), sides: 'branchSides' });
  }
  return { pieces, clumps, centre, H, R, D, seed };
}

// One shape's geometry at one level of detail.
function build(sk, detail) {
  const parts = new Parts();
  const next = stream(sk.seed * 977 + Math.round(detail.cardsPerM2 * 100));
  for (const w of sk.pieces) {
    const n = w.sides === 'trunkSides' ? detail.segments : Math.max(1, detail.segments - (w.sides === 'limbSides' ? 2 : 3));
    const pts = curve(w.a, w.bow, w.b, n);
    tube(parts, pts, pts.map((_, i) => w.r0 + (w.r1 - w.r0) * (i / (pts.length - 1))), detail[w.sides]);
  }
  // Leaf cards through each clump, turned every way, their normals bent
  // outward from the clump and from the crown, darker deep inside and low.
  const right = new Vector3();
  const up = new Vector3();
  const n = new Vector3();
  const bent = new Vector3();
  const p = new Vector3();
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  // The crown's normals point away from a point low in it, so its top faces up.
  const ball = sk.centre.clone().setY(sk.H - sk.D * 0.8);
  const bottom = sk.H - sk.D;
  for (const c of sk.clumps) {
    // The surface of the ellipsoid, nearly (m²).
    const area = 4 * Math.PI * (c.rx * c.rx + 2 * c.rx * c.ry) / 3;
    const cards = Math.max(5, Math.round(area * detail.cardsPerM2));
    for (let k = 0; k < cards; k++) {
      // A point in the clump, out of its middle, the underside a little flattened.
      let x; let y; let z; let rr;
      do {
        x = next() * 2 - 1; y = next() * 2 - 1; z = next() * 2 - 1;
        rr = Math.sqrt(x * x + y * y + z * z);
      } while (rr > 1 || rr < HOLLOW);
      y = Math.max(y, -0.7);
      p.set(c.c.x + x * c.rx, c.c.y + y * c.ry, c.c.z + z * c.rx);
      n.set(next() - 0.5, next() - 0.5 + 0.15, next() - 0.5).normalize();
      right.set(0, 1, 0).cross(n);
      if (right.lengthSq() < 0.01) right.set(1, 0, 0);
      right.normalize();
      up.crossVectors(n, right).normalize();
      const s = detail.card * (0.75 + next() * 0.5) * 0.5;
      // Partly the clump's own round (its ellipsoid's normal), mostly the crown's, a little up.
      bent.set(x / c.rx, y / c.ry, z / c.rx).normalize().multiplyScalar(CLUMP_ROUND);
      _d.set((p.x - ball.x) / sk.R, (p.y - ball.y) / sk.D, (p.z - ball.z) / sk.R).normalize();
      bent.addScaledVector(_d, 1 - CLUMP_ROUND).add(_t.set(0, 0.2, 0)).normalize();
      const low = Math.min(1, Math.max(0, (p.y - bottom) / sk.D));
      const shade = (1 - DEEP * (1 - rr)) * (1 - UNDER * (1 - low));
      const hue = 0.9 + next() * 0.2;
      const col = [LEAF[0] * shade * (2 - hue), LEAF[1] * shade, LEAF[2] * shade * hue];
      const turn = next() * TAU;
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

// Where the trees stand: [x, z, turn, scale, shape, level of detail].
function placements(skeletons) {
  const out = [];
  const crowns = [];   // [x, z, radius] of each placed, to keep the next off it
  const lod = (x, z) => (Math.hypot(x - NEAR.x, z - NEAR.z) < NEAR.r ? 0 : 1);
  const b = BEHIND_COW;
  out.push([COW.x + b.dx, COW.z + b.dz, b.turn, b.scale, b.shape, lod(COW.x + b.dx, COW.z + b.dz)]);
  crowns.push([COW.x + b.dx, COW.z + b.dz, skeletons[b.shape].R * b.scale]);
  let i = 0;
  let z = TREES.z0;
  while (z < TREES.z1) {
    const P = PLACING.find((band) => z < TREES.z0 + band.to);
    let x = TREES.x0 + rand(i, 1) * 8;
    while (x < TREES.x1) {
      i++;
      const px = x + (rand(i, 5) - 0.5) * P.jitter[0];
      const pz = z + (rand(i, 6) - 0.5) * P.jitter[1];
      x += P.step[0] + rand(i, 4) * P.step[1];
      // Keep the cow's patch and the beam's ground clear.
      if (Math.abs(px - COW.x) < 7 && pz < TREES.z0 + 6) continue;
      if (rand(i, 7) < 0.12) continue;
      const d = Math.hypot(px - NEAR.x, pz - NEAR.z);
      if (d > FAR_R) continue;
      const shape = Math.floor(rand(i, 10) * SHAPES);
      const scale = Math.min(SCALE[0] + rand(i, 9) * SCALE[1], MAX_HEIGHT / (skeletons[shape].H * 1.1));
      const r = skeletons[shape].R * scale;
      if (crowns.some(([cx, cz, cr]) => Math.hypot(px - cx, pz - cz) < (r + cr) * P.gap)) continue;
      crowns.push([px, pz, r]);
      // Leaning toward -X, give or take; one in five the other way.
      const turn = (rand(i, 11) < 0.2 ? 0 : Math.PI) + (rand(i, 8) - 0.5) * 1.2;
      out.push([px, pz, turn, scale, shape, lod(px, pz)]);
    }
    z += P.row[0] + rand(i, 3) * P.row[1] + (z - TREES.z0) * P.row[2];
  }
  return out;
}

export function createTrees() {
  const group = new Group();
  const time = uniform(0);
  const gust = uniform(0);
  const skeletons = KINDS.map((k, s) => skeleton(k, s + 1));
  const spots = placements(skeletons);

  // Sway: the crown moves most, by its height squared.
  const sway = Fn(() => {
    const ph = hash(float(instanceIndex).mul(7.31)).mul(6.28);
    const k = positionLocal.y.div(SWAY_HEIGHT).pow(2);
    const amp = float(0.06).add(gust.mul(0.35));
    const sx = sin(time.mul(1.1).add(ph)).add(sin(time.mul(2.7).add(ph.mul(2))).mul(0.3)).mul(amp).mul(k);
    const sz = cos(time.mul(0.9).add(ph)).mul(amp).mul(k).mul(0.6);
    return positionLocal.add(vec3(sx, 0, sz));
  });

  const cluster = paintCluster();
  const material = new MeshPhysicalNodeMaterial({ side: DoubleSide, roughness: 0.8, alphaTest: 0.5 });
  const leaf = texture(cluster, uv());
  const isWood = step(uv().x, -0.5);
  material.specularIntensityNode = mix(float(LEAF_SPECULAR), float(WOOD_SPECULAR), isWood);
  // Far off, the texture's smaller copies average the leaves' cut-out away:
  // make up for it, so distant crowns stay whole.
  const lod = log2(max(fwidth(uv().x), fwidth(uv().y)).mul(CLUSTER_PX)).max(0);
  material.opacityNode = max(leaf.a.mul(lod.mul(0.06).add(1)), isWood);
  // Each tree a little different in colour: some yellower, some darker.
  const h = hash(float(instanceIndex).mul(3.3));
  const tint = mix(vec3(0.8, 0.9, 0.85), vec3(1.2, 1.1, 0.8), h);
  material.colorNode = attribute('color').mul(mix(leaf.rgb.mul(tint), vec3(1), isWood));
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
        dummy.scale.set(scale * (0.9 + 0.2 * rand(i, s + 20)), scale * (0.9 + 0.2 * rand(i, s + 30)), scale * (0.9 + 0.2 * rand(i, s + 40)));
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
