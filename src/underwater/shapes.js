// What lives under the water, made in code like everything else: fish
// bodies, pondweed, kelp and seagrass, with their colours baked into the
// vertices. Each geometry also carries `aBend` per vertex: how much of the
// swimming or swaying that point does (0 at a fish's nose or a plant's root).

import * as THREE from 'three';

const _p = new THREE.Vector3();
const _n = new THREE.Vector3();
const _c = new THREE.Color();
const lin = (hex) => new THREE.Color(hex); // sRGB hex -> linear colour

// Geometries appended into one, with a colour and a bend for every vertex.
class Shape {
  constructor() {
    this.pos = [];
    this.nor = [];
    this.col = [];
    this.bend = [];
    this.idx = [];
    this.count = 0;
  }

  // geo, moved by matrix (after deform(p) in its own space); color(p, n) ->
  // THREE.Color and bend(p) -> number, both in the shape's space.
  add(geo, { matrix = new THREE.Matrix4(), deform = null, color, bend }) {
    const pos = geo.attributes.position;
    const nor = geo.attributes.normal;
    const nm = new THREE.Matrix3().getNormalMatrix(matrix);
    const base = this.count;
    for (let i = 0; i < pos.count; i++) {
      _p.fromBufferAttribute(pos, i);
      _n.fromBufferAttribute(nor, i);
      if (deform) deform(_p);
      _p.applyMatrix4(matrix);
      _n.applyMatrix3(nm).normalize();
      this.pos.push(_p.x, _p.y, _p.z);
      this.nor.push(_n.x, _n.y, _n.z);
      const c = color(_p, _n);
      this.col.push(c.r, c.g, c.b);
      this.bend.push(bend(_p));
      this.count++;
    }
    if (geo.index) for (let i = 0; i < geo.index.count; i++) this.idx.push(base + geo.index.getX(i));
    else for (let i = 0; i < pos.count; i++) this.idx.push(base + i);
    geo.dispose();
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('aBend', new THREE.Float32BufferAttribute(this.bend, 1));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

// A flat triangle (both faces, in the x = 0 plane unless turned).
function tri(a, b, c) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...c], 3));
  g.computeVertexNormals();
  return g;
}

// ── Fish ────────────────────────────────────────────────────────────────────
// A fish one metre long, nose to +z, back to +y. `look` says how it's made:
//   depth, width   of the body, as fractions of its length
//   back, belly, fin   colours (sRGB hex)
//   mark(x, y, z) -> 0..1, how dark it's marked there (bars, spots, stripes)
//   forked         a forked tail rather than a broad one
export function fishShape(look) {
  const s = new Shape();
  const back = lin(look.back);
  const belly = lin(look.belly);
  const fin = lin(look.fin);
  const dark = lin(look.dark ?? 0x101410);
  const along = (p) => Math.max(0, 0.42 - p.z) * 1.6; // the tail end swings
  const body = new THREE.SphereGeometry(0.5, 14, 9);
  s.add(body, {
    // a fish's taper: full behind the head, narrowing to the root of the tail
    deform: (p) => {
      const t = Math.min(1, Math.max(0, -p.z / 0.5));
      const k = 1 - 0.78 * t * t;
      const nose = p.z > 0.3 ? 1 - (p.z - 0.3) * 1.3 : 1;
      p.x *= k * nose;
      p.y *= k * nose;
    },
    matrix: new THREE.Matrix4().makeScale(look.width, look.depth, 1),
    color: (p) => {
      const up = Math.max(0, Math.min(1, p.y / (look.depth * 0.5) * 0.5 + 0.5));
      _c.copy(belly).lerp(back, Math.pow(up, 0.8));
      const m = look.mark ? look.mark(p.x, p.y, p.z) : 0;
      if (m > 0) _c.lerp(dark, m);
      // an eye
      if (p.z > 0.32 && p.z < 0.4 && Math.abs(p.y - look.depth * 0.08) < look.depth * 0.09) _c.setRGB(0.01, 0.01, 0.01);
      return _c;
    },
    bend: along,
  });
  // the tail
  const h = look.depth * (look.forked ? 0.62 : 0.5);
  const fork = look.forked ? -0.62 : -0.68;
  for (const sgn of [1, -1]) {
    s.add(tri([0, 0, -0.44], [0, sgn * h, -0.7], [0, sgn * h * 0.15, fork]), { color: () => _c.copy(fin), bend: along });
  }
  // a fin along the back, and one under the belly
  s.add(tri([0, look.depth * 0.42, 0.12], [0, look.depth * 0.75, -0.02], [0, look.depth * 0.38, -0.2]), { color: () => _c.copy(fin), bend: along });
  s.add(tri([0, -look.depth * 0.4, -0.12], [0, -look.depth * 0.62, -0.22], [0, -look.depth * 0.3, -0.3]), { color: () => _c.copy(fin), bend: along });
  // and the pectoral fins, out from behind the gills
  for (const sgn of [1, -1]) {
    s.add(tri([sgn * look.width * 0.4, -look.depth * 0.1, 0.22], [sgn * look.width * 2.2, -look.depth * 0.35, 0.08], [sgn * look.width * 0.4, -look.depth * 0.2, 0.06]), { color: () => _c.copy(fin), bend: () => 0.15 });
  }
  return s.build();
}

// ── Plants ──────────────────────────────────────────────────────────────────
// Each stands one metre tall from its root at the origin (scaled to its real
// height where it's put), and sways more the higher up it is (aBend).

// Pondweed: a slender stem with narrow leaves all the way up.
export function weedShape() {
  const s = new Shape();
  const stem = lin(0x3a4a1c);
  const leaf = lin(0x4f6a22);
  const up = (p) => Math.max(0, p.y);
  s.add(new THREE.CylinderGeometry(0.008, 0.012, 1, 4, 1, true), { matrix: new THREE.Matrix4().makeTranslation(0, 0.5, 0), color: () => _c.copy(stem), bend: up });
  for (let i = 0; i < 9; i++) {
    const y = 0.08 + i * 0.1;
    const a = i * 2.3;
    const l = 0.13 - i * 0.006;
    const m = new THREE.Matrix4().makeRotationY(a);
    s.add(tri([0, y, 0], [l, y + 0.05, 0.015], [l * 0.6, y + 0.09, -0.015]), { matrix: m, color: (p) => _c.copy(leaf).multiplyScalar(0.8 + p.y * 0.4), bend: up });
  }
  return s.build();
}

// Kelp: a long stipe, broad wavy blades off it, a float at the top.
export function kelpShape() {
  const s = new Shape();
  const stipe = lin(0x5a4618);
  const blade = lin(0x8a7428);
  const up = (p) => Math.max(0, p.y);
  s.add(new THREE.CylinderGeometry(0.01, 0.02, 1, 4, 1, true), { matrix: new THREE.Matrix4().makeTranslation(0, 0.5, 0), color: () => _c.copy(stipe), bend: up });
  for (let i = 0; i < 12; i++) {
    const y = 0.14 + i * 0.07;
    const side = i % 2 ? 1 : -1;
    const m = new THREE.Matrix4().makeRotationY(i * 1.1);
    const w = 0.05;
    // a blade, a long leaf held up and out from the stem
    s.add(tri([0, y, 0], [side * 0.22, y + 0.1, w], [side * 0.06, y + 0.18, -w]), {
      matrix: m,
      color: (p) => _c.copy(blade).multiplyScalar(0.75 + 0.5 * Math.max(0, p.y)),
      bend: up,
    });
  }
  s.add(new THREE.SphereGeometry(0.03, 6, 4), { matrix: new THREE.Matrix4().makeTranslation(0, 1, 0), color: () => _c.copy(blade).multiplyScalar(1.3), bend: up });
  return s.build();
}

// Seagrass: a tuft of long thin blades.
export function seagrassShape() {
  const s = new Shape();
  const green = lin(0x3e6a2a);
  const up = (p) => Math.max(0, p.y);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const r = 0.05;
    const m = new THREE.Matrix4().makeRotationY(a);
    s.add(tri([r - 0.012, 0, 0], [r + 0.012, 0, 0], [r * 3, 0.85 + (i % 3) * 0.1, 0]), { matrix: m, color: (p) => _c.copy(green).multiplyScalar(0.6 + 0.6 * p.y), bend: up });
  }
  return s.build();
}
