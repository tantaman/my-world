// What the van and the sedan share: the painted body's material, chrome,
// rubber, black plastic and lamp lenses; wheels (a lathed tyre with round
// shoulders and a lathed rim with its face painted on); sweeps of a small
// profile along a path, for bumpers, rails and trim; and merging a finished
// model by material so it costs one draw per material. Every model faces
// +X with its origin on the ground under its middle.
import {
  Group, Mesh, BufferGeometry, Float32BufferAttribute, LatheGeometry, PlaneGeometry, Vector2, Vector3, Matrix4,
  MeshStandardNodeMaterial, MeshPhysicalNodeMaterial, MeshBasicNodeMaterial, Color,
} from 'three/webgpu';
import { texture, uv, float, vec3, color, normalWorld, reflectVector, bumpMap, mix, smoothstep, positionLocal, mx_noise_float } from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { canvasTexture } from '../set/signs.js';

const BODY_BUMP = 1.2;   // strength of the painted relief (seams, creases, pitting)
const WET_TOP = 0.45;    // how much smoother rain leaves what faces up, 0..1

// The painted body: colour from the atlas, roughness and clearcoat from its
// surface canvas, relief from the surface canvas's height. Rain on what
// faces up makes it smoother and a little darker.
export function bodyMaterial({ colour, surface }, { bump = BODY_BUMP, metal = 0 } = {}) {
  const m = new MeshPhysicalNodeMaterial();
  const c = texture(colour, uv());
  const s = texture(surface, uv());
  const up = normalWorld.y.max(0);
  m.colorNode = c.rgb.mul(float(1).sub(up.mul(0.08)));
  m.roughnessNode = s.g.mul(float(1).sub(up.mul(WET_TOP))).max(0.035);
  m.metalnessNode = float(metal);
  m.clearcoatNode = s.b;
  m.clearcoatRoughnessNode = float(0.05).add(s.g.mul(0.2));
  m.normalNode = bumpMap(texture(surface, uv()), float(bump));
  return m;
}

// Plated metal. There is no environment map to reflect, so it is painted
// as chrome looks: light where its reflection looks up at the canopy and
// sky, dark where it looks down at the wet ground, part metal so the lamps
// put sharp highlights in it, a little grime in its low parts.
export function chrome({ high = '#e4e2dc', low = '#3c3b38', rough = 0.22, grime = 0.35 } = {}) {
  const m = new MeshPhysicalNodeMaterial();
  const n = mx_noise_float(positionLocal.mul(vec3(3.0, 9.0, 3.0))).mul(0.5).add(0.5);
  const dirty = smoothstep(0.45, 0.9, n).mul(grime);
  const sky = smoothstep(-0.35, 0.45, reflectVector.y);
  m.colorNode = mix(mix(color(low), color(high), sky), vec3(0.16, 0.13, 0.1), dirty);
  m.metalnessNode = float(0.4).sub(dirty.mul(0.3));
  m.roughnessNode = float(rough).add(dirty.mul(0.45));
  m.clearcoat = 1;
  m.clearcoatRoughness = 0.05;
  return m;
}

export function rubber(colour = '#121212', rough = 0.82) {
  const m = new MeshStandardNodeMaterial({ color: new Color(colour), roughness: rough });
  m.roughnessNode = float(rough).mul(float(1).sub(normalWorld.y.max(0).mul(0.35)));
  return m;
}

export function plastic(colour = '#151617', rough = 0.55) {
  return new MeshStandardNodeMaterial({ color: new Color(colour), roughness: rough });
}

// A lamp's lens: coloured glass over a reflector, lit by `glow` (a colour
// times a strength, or 0 for off).
export function lens(colour, { glow = 0, rough = 0.12 } = {}) {
  const m = new MeshPhysicalNodeMaterial({ color: new Color(colour), roughness: rough, clearcoat: 1, clearcoatRoughness: 0.05 });
  if (glow) m.emissiveNode = color(colour).mul(glow);
  return m;
}

// A tyre's cross-section, lathed: radius R, width w, sitting on a rim of
// radius rim. The axle is along Z, the outer face toward +Z.
function tyreGeometry(R, w, rim) {
  const h = w / 2;
  const prof = [
    [rim, -h * 0.82], [rim + 0.012, -h * 0.94], [rim + (R - rim) * 0.45, -h * 1.0], [R - 0.035, -h * 0.98],
    [R - 0.012, -h * 0.86], [R, -h * 0.66], [R, -h * 0.25], [R + 0.002, 0], [R, h * 0.25], [R, h * 0.66],
    [R - 0.012, h * 0.86], [R - 0.035, h * 0.98], [rim + (R - rim) * 0.45, h * 1.0], [rim + 0.012, h * 0.94], [rim, h * 0.82],
  ];
  const g = new LatheGeometry(prof.map(([r, y]) => new Vector2(r, y)), 48);
  g.rotateX(Math.PI / 2);
  return g;
}

// A rim's face, lathed from [r, depth] (depth toward the outside), with
// texture coordinates laid flat across the face so a painted disc fits it.
function rimGeometry(prof, face) {
  const g = new LatheGeometry(prof.map(([r, y]) => new Vector2(r, y)), 48);
  const p = g.attributes.position;
  const uvs = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    uvs[i * 2] = 0.5 + p.getX(i) / (2 * face);
    uvs[i * 2 + 1] = 0.5 - p.getZ(i) / (2 * face);
  }
  g.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  g.rotateX(Math.PI / 2);
  return g;
}

const TYRE = rubber('#141414', 0.86);

// A wheel: tyre and rim, the axle along Z, the outer face toward +Z.
// draw(ctx, size) paints the rim's face (a canvas of size x size, the
// face's radius at its edge).
export function wheel({ radius, width, rim, dish = 0.035, draw, rimRough = 0.4 }) {
  const g = new Group();
  const tyre = new Mesh(tyreGeometry(radius, width, rim), TYRE);
  const h = width / 2;
  const face = rim + 0.02;
  const prof = [
    [0.0005, h * 0.62 - dish + 0.03], [rim * 0.25, h * 0.62 - dish + 0.026], [rim * 0.32, h * 0.62 - dish + 0.012],
    [rim * 0.36, h * 0.62 - dish], [rim * 0.7, h * 0.62 - dish * 0.8], [rim * 0.86, h * 0.62 - dish * 0.2],
    [rim * 0.95, h * 0.62], [rim + 0.01, h * 0.8], [rim + 0.018, h * 0.86], [rim + 0.008, h * 0.88], [rim - 0.01, h * 0.84],
    [rim - 0.012, -h * 0.6], [rim * 0.4, -h * 0.4],
  ];
  const tex = canvasTexture(256, 256, (ctx, w) => draw(ctx, w));
  const m = new MeshStandardNodeMaterial({ roughness: rimRough, metalness: 0.25 });
  m.colorNode = texture(tex, uv()).rgb;
  // Outside in, so the lathe's faces look out of the wheel.
  const rimMesh = new Mesh(rimGeometry(prof.reverse(), face), m);
  g.add(tyre, rimMesh);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

// A profile [[n, b], ...] swept along a path of points: n along `out(p, i)`
// (made square to the path), b square to both. Open ends, smooth normals.
export function sweep(profile, path, out, { closed = true } = {}) {
  const pos = [], uvs = [], idx = [];
  const P = path.map((p) => new Vector3(...p));
  const t = new Vector3(), n = new Vector3(), b = new Vector3(), o = new Vector3();
  let along = 0;
  for (let i = 0; i < P.length; i++) {
    const a = P[Math.max(0, i - 1)], c = P[Math.min(P.length - 1, i + 1)];
    t.subVectors(c, a).normalize();
    o.set(...out(path[i], i));
    n.copy(o).addScaledVector(t, -o.dot(t)).normalize();
    b.crossVectors(t, n);
    if (i > 0) along += P[i].distanceTo(P[i - 1]);
    for (let k = 0; k < profile.length; k++) {
      const [pn, pb] = profile[k];
      pos.push(P[i].x + n.x * pn + b.x * pb, P[i].y + n.y * pn + b.y * pb, P[i].z + n.z * pn + b.z * pb);
      uvs.push(along, k / (profile.length - 1));
    }
  }
  const w = profile.length;
  const ring = closed ? w : w - 1;
  for (let i = 0; i < P.length - 1; i++) {
    for (let k = 0; k < ring; k++) {
      const k1 = (k + 1) % w;
      const a = i * w + k, bb = i * w + k1, c = (i + 1) * w + k, d = (i + 1) * w + k1;
      idx.push(a, bb, c, bb, d, c);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// A rounded rectangle as a closed profile, w x h, corner radius r, for sweeps.
export function roundedRect(w, h, r, per = 3) {
  const out = [];
  const corners = [[w / 2 - r, h / 2 - r, 0], [-w / 2 + r, h / 2 - r, 0.5], [-w / 2 + r, -h / 2 + r, 1], [w / 2 - r, -h / 2 + r, 1.5]];
  for (const [cx, cy, a0] of corners) {
    for (let k = 0; k <= per; k++) {
      const a = (a0 + (k / per) * 0.5) * Math.PI;
      out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
  }
  return out;
}

// Merges every mesh under root that shares a material into one mesh, in
// root's frame, keeping position, normal and uv. Leaves root holding only
// the merged meshes. For a model that moves as one.
export function mergeByMaterial(root) {
  root.updateMatrixWorld(true);
  const inv = new Matrix4().copy(root.matrixWorld).invert();
  const groups = new Map();
  root.traverse((o) => {
    if (!o.isMesh) return;
    if (!groups.has(o.material)) groups.set(o.material, []);
    groups.get(o.material).push(o);
  });
  const out = [];
  const m = new Matrix4();
  for (const [material, meshes] of groups) {
    const geos = meshes.map((mesh) => {
      let g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
      for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
      if (!g.attributes.normal) g.computeVertexNormals();
      if (!g.attributes.uv) g.setAttribute('uv', new Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      m.multiplyMatrices(inv, mesh.matrixWorld);
      g.applyMatrix4(m);
      return g;
    });
    const mesh = new Mesh(mergeGeometries(geos, false), material);
    mesh.castShadow = meshes.some((x) => x.castShadow);
    mesh.receiveShadow = true;
    out.push(mesh);
  }
  root.clear();
  for (const mesh of out) root.add(mesh);
  return root;
}

// The dark under a vehicle where no light reaches the ground: a soft
// rounded patch the size of its body, darker under each tyre. Without it a
// car on a lit wet road looks as if it floats. Not in the ground's mirror
// (layer 1), and kept out of merging (it is see-through).
const UNDER_DARK = 0.85;   // how dark at its middle, 0..1
export function groundShadow(len, wid, wheels) {
  const pad = 0.35;
  const W = len + 2 * pad, D = wid + 2 * pad;
  const px = 96;   // per metre
  const tex = canvasTexture(Math.round(W * px), Math.round(D * px), (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.filter = `blur(${Math.round(0.14 * px)}px)`;
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.beginPath(); ctx.roundRect(pad * px, pad * px, len * px, wid * px, 0.3 * px); ctx.fill();
    ctx.filter = `blur(${Math.round(0.05 * px)}px)`;
    ctx.fillStyle = 'rgba(0,0,0,1)';
    for (const [x, z, r] of wheels) {
      ctx.beginPath(); ctx.ellipse((x + W / 2) * px, (z + D / 2) * px, r * 1.1 * px, 0.17 * px, 0, 0, Math.PI * 2); ctx.fill();
    }
  });
  const m = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
  m.colorNode = vec3(0, 0, 0);
  m.opacityNode = texture(tex, uv()).a.mul(UNDER_DARK);
  const mesh = new Mesh(new PlaneGeometry(W, D), m);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.006;
  mesh.layers.set(1);
  mesh.renderOrder = 1;
  return mesh;
}

// A mesh with shadows both ways, placed.
export function part(geometry, material, x = 0, y = 0, z = 0) {
  const mesh = new Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}
