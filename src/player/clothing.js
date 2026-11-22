// Horizontal sections of a sewn garment. Each row, from bottom to top, is
// [height, half width, half depth, centre z, fold height]. A fold runs
// obliquely across the cloth and dies out wherever adjacent rows are flat.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { smoothstep } from '../noise.js';

export function tailored(rows, { segments = 24, squareness = 1, side = 1, surface, crease } = {}) {
  // Extra sections let the folds narrow to a ridge and flatten out again.
  if (crease) {
    const sections = [rows[0]];
    for (let r = 1; r < rows.length; r++) {
      const a = rows[r - 1];
      const b = rows[r];
      const steps = Math.ceil((b[0] - a[0]) / 0.012);
      for (let j = 1; j <= steps; j++) {
        sections.push(Array.from({ length: 5 }, (_, k) =>
          THREE.MathUtils.lerp(a[k] ?? 0, b[k] ?? 0, j / steps)));
      }
    }
    rows = sections;
  }
  const positions = [];
  const uv = [];
  const colors = [];
  const indices = [];
  const round = (v) => Math.sign(v) * Math.pow(Math.abs(v), squareness);
  const stride = segments + 1; // two vertices at the back seam for the unwrapped UVs
  for (let row = 0; row < rows.length; row++) {
    const [height, width, depth, z = 0, fold = 0] = rows[row];
    for (let i = 0; i <= segments; i++) {
      const angle = Math.PI + i * 2 * Math.PI / segments;
      const across = Math.sin(angle);
      const front = Math.cos(angle);
      const wave = 0.72 * side * across + 0.28 * Math.sin(2 * angle + 5 * height);
      const inset = crease ? crease(height, across, front) : 0;
      const x = (width + inset) * round(across);
      const y = height + fold * wave;
      positions.push(x, y, z + (depth + inset) * round(front));
      uv.push(i / segments, y);
      if (surface) colors.push(...surface(x, height, front, angle));
      if (row && i < segments) {
        const a = (row - 1) * stride + i;
        const b = a + 1;
        indices.push(a, b, a + stride, b, b + stride, a + stride);
      }
    }
  }
  // Give each end its own rim so its flat normal doesn't round off the hem.
  for (const row of [0, rows.length - 1]) {
    const first = positions.length / 3;
    for (let i = 0; i < segments; i++) {
      const j = 3 * (row * stride + i);
      positions.push(...positions.slice(j, j + 3));
      uv.push(positions[j], positions[j + 2]);
      if (surface) colors.push(...colors.slice(j, j + 3));
    }
    for (let i = 1; i < segments - 1; i++) {
      if (row) indices.push(first, first + i, first + i + 1);
      else indices.push(first, first + i + 1, first + i);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  if (surface) g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  // Both sides of the UV seam should catch the same light.
  const normals = g.attributes.normal;
  const n = new THREE.Vector3(), other = new THREE.Vector3();
  for (let row = 0; row < rows.length; row++) {
    const a = row * stride, b = a + segments;
    n.fromBufferAttribute(normals, a).add(other.fromBufferAttribute(normals, b)).normalize();
    normals.setXYZ(a, n.x, n.y, n.z);
    normals.setXYZ(b, n.x, n.y, n.z);
  }
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

// A narrow pinched valley and the wider rolls of fabric that flank it.
export function foldAt(distance, width) {
  const t = distance / width;
  return Math.exp(-0.28 * t * t) - 2 * Math.exp(-2.4 * t * t);
}

// A tile of woven yarn, generated once and filtered down to its mean tone
// at trail distance. The relief tile stores height in red and roughness in green.
const textiles = new Map();
export function textile(type) {
  if (textiles.has(type)) return textiles.get(type);
  const size = 128;
  const dye = new Uint8Array(size * size * 4);
  const surface = new Uint8Array(dye.length);
  const twill = type === 'twill', canvas = type === 'canvas';
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const warp = Math.cos(Math.PI * x / 2), weft = Math.cos(Math.PI * y / 2);
      const yarn = twill ? Math.cos(Math.PI * (x + y) / 4) : (warp + weft + warp * weft) / 3;
      const grid = !twill && !canvas && (x % 16 < 2 || y % 16 < 2) ? 1 : 0;
      const fleck = Math.sin(x * 31.127 + y * 73.93) * 953.143;
      const value = 0.91 + 0.047 * yarn + 0.022 * grid + 0.04 * (fleck - Math.floor(fleck) - 0.5);
      dye.fill(Math.round(255 * value), i, i + 3);
      dye[i + 3] = 255;
      surface.set([Math.round(122 + 48 * yarn + 40 * grid), Math.round(227 - 18 * yarn - 21 * grid), 0, 255], i);
    }
  }
  const tile = (data) => {
    const tex = new THREE.DataTexture(data, size, size);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(canvas ? 5 : 7, canvas ? 9 : 12);
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    return tex;
  };
  const relief = tile(surface);
  const maps = { map: tile(dye), roughnessMap: relief, bumpMap: relief, bumpScale: canvas ? 0.00065 : 0.00035 };
  textiles.set(type, maps);
  return maps;
}

// The elbow and knee sit at -0.28 and -0.42 in both human rigs. Leave
// several sections across each bend so a sleeve or trouser leg flexes.
export function sleeve(side, surface) {
  const cloth = tailored([
    [-0.52, 0.043, 0.045, 0], [-0.493, 0.045, 0.047],
    [-0.48, 0.054, 0.058, -0.003, 0.006], [-0.46, 0.05, 0.052, 0, 0.009],
    [-0.40, 0.057, 0.059, 0.004], [-0.335, 0.061, 0.064, -0.003, -0.012],
    [-0.315, 0.055, 0.056, -0.005, -0.01], [-0.282, 0.061, 0.064, -0.009, -0.007],
    [-0.25, 0.059, 0.061], [-0.18, 0.067, 0.073], [-0.085, 0.078, 0.08],
    [-0.025, 0.08, 0.082], [0.028, 0.065, 0.066], [0.056, 0.036, 0.041],
    [0.063, 0.012, 0.016],
  ], { side, surface, segments: 24, crease: surface && ((y, x, front) =>
    0.005 * foldAt(y + 0.32 + 0.041 * x * side, 0.012) * (0.65 + 0.35 * front) +
    0.004 * foldAt(y + 0.22 - 0.065 * x * side, 0.014) +
    0.003 * foldAt(y + 0.446 + 0.023 * front, 0.011)) });
  const p = cloth.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const inset = THREE.MathUtils.smoothstep(p.getY(i), -0.045, 0.063);
    p.setX(i, p.getX(i) - side * inset * 0.076);
  }
  cloth.computeVertexNormals();
  return cloth;
}

// A grown-up's hiking trousers, hem to waist, in the hip's frame (the knee is
// at -0.42): rows as tailored() takes them.
const TROUSERS = [
  [-0.80, 0.063, 0.064], [-0.783, 0.073, 0.074, 0, 0.008],
  [-0.768, 0.065, 0.065, 0, 0.009], [-0.748, 0.075, 0.078, -0.004, 0.012],
  [-0.72, 0.061, 0.065, 0, 0.014], [-0.63, 0.069, 0.082, -0.009],
  [-0.54, 0.073, 0.084, -0.012], [-0.48, 0.065, 0.074, -0.003, -0.012],
  [-0.45, 0.072, 0.078, 0.002, -0.012], [-0.42, 0.072, 0.083, 0.007],
  [-0.38, 0.076, 0.088, 0.007], [-0.31, 0.08, 0.096, 0.003],
  [-0.17, 0.093, 0.109], [-0.065, 0.10, 0.116, -0.004], [0.025, 0.102, 0.128], [0.07, 0.10, 0.118], [0.12, 0.095, 0.111],
];

// rows: the leg's sections, if not TROUSERS (joggers, gathered at the ankle)
export function trouserLeg(side, surface, hipOffset = 0.095, rows = TROUSERS) {
  const cloth = tailored(rows, { side, surface, segments: 24, crease: surface && ((y, x, front) =>
    0.006 * foldAt(y + 0.39 - 0.041 * x * side, 0.014) +
    0.005 * foldAt(y + 0.46 + 0.035 * x * side, 0.012) * (0.6 - 0.4 * front) +
    0.005 * foldAt(y + 0.72 - 0.042 * x * side, 0.012)) });
  // Each upper leg widens into one half of the seat. Their inseams meet
  // above the crotch and the common waist follows the pelvis when striding.
  const p = cloth.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = side * p.getX(i);
    const join = THREE.MathUtils.smoothstep(p.getY(i), -0.18, -0.01);
    const waist = Math.max(0, (x + 0.058) / 0.158) * 0.18 - hipOffset;
    p.setX(i, side * THREE.MathUtils.lerp(x, waist, join));
  }
  cloth.computeVertexNormals();
  return cloth;
}

// A relaxed, partly closed hand in the wrist frame. Four fingers curl
// toward the palm, with the thumb opposed at the front of the grip.
export function handShape(side) {
  const palm = tailored([[-0.064, 0.020, 0.032], [-0.054, 0.024, 0.039],
    [-0.025, 0.026, 0.037], [0.012, 0.019, 0.026]], { squareness: 0.82, segments: 16 });
  const pieces = [palm];
  for (let finger = 0; finger < 4; finger++) {
    const length = [0.030, 0.034, 0.031, 0.024][finger];
    const phalanx = new THREE.SphereGeometry(1, 10, 8);
    phalanx.scale(0.013, length, 0.011);
    phalanx.rotateZ(-side * 0.28);
    phalanx.translate(-side * 0.004, -0.060, 0.027 - 0.018 * finger);
    pieces.push(phalanx);
  }
  const thumb = new THREE.SphereGeometry(1, 12, 8);
  thumb.scale(0.014, 0.030, 0.014);
  thumb.rotateX(-0.52);
  thumb.translate(-side * 0.019, -0.034, 0.029);
  pieces.push(thumb);
  return mergeGeometries(pieces);
}

export function bootUpper() {
  return tailored([
    [-0.052, 0.058, 0.115, 0.045], [-0.037, 0.059, 0.115, 0.045],
    [-0.018, 0.056, 0.109, 0.043], [0.002, 0.053, 0.088, 0.026],
    [0.032, 0.05, 0.065, 0.008], [0.073, 0.052, 0.058],
    [0.094, 0.055, 0.059], [0.10, 0.049, 0.052],
  ], { squareness: 0.76, segments: 20 });
}

export function outsole() {
  return tailored([
    [-0.07, 0.057, 0.12, 0.045], [-0.062, 0.061, 0.12, 0.045],
    [-0.047, 0.061, 0.119, 0.045], [-0.042, 0.058, 0.116, 0.045],
  ], { squareness: 0.75, segments: 20 });
}

// ── Putting it on ───────────────────────────────────────────────────────────
// A hiker's clothes (hikers/) are hung from the bones of player/character.js
// with these. Everything is placed in its bone's frame, in metres of the
// grown-up body (a smaller hiker is the same body made smaller).

export const material = (hex, rough = 0.85, extra) => new THREE.MeshStandardMaterial({ color: hex, roughness: rough, metalness: 0, ...extra });

// A rigid piece, on whichever bone carries it.
export function piece(parent, geometry, mat, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(geometry, mat);
  mesh.castShadow = true;
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}

// A round strap or cord through points [[x, y, z], ...]. Its path is kept
// on the geometry (geometry.parameters.path), to put things along it.
export function cord(parent, mat, radius, points) {
  const path = new THREE.CatmullRomCurve3(points.map(([x, y, z]) => new THREE.Vector3(x, y, z)));
  return piece(parent, new THREE.TubeGeometry(path, points.length * 3, radius, 6), mat);
}

export function group(parent, x = 0, y = 0, z = 0) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}

// Cloth that bridges a moving joint: a sleeve over shoulder and elbow, a
// trouser leg over hip and knee. It follows the upper bone, blends into the
// lower one over bendWidth (m) either side of the joint, and is held to the
// body above it (the chest, the hips) from anchorStart (m, up the bone) on.
// Dressed with the limb straight (Character.dress sees to that).
export function limb(upper, lower, geometry, mat, bendWidth, anchorStart) {
  const p = geometry.attributes.position;
  const weights = new Float32Array(p.count * 4);
  const indices = new Uint16Array(p.count * 4);
  for (let i = 0; i < p.count; i++) {
    const w = smoothstep(-bendWidth, bendWidth, lower.position.y - p.getY(i));
    const anchor = smoothstep(anchorStart, 0.05, p.getY(i));
    weights[i * 4] = 1 - w - anchor;
    weights[i * 4 + 2] = anchor;
    indices[i * 4 + 2] = 2;
    weights[i * 4 + 1] = w;
    indices[i * 4 + 1] = 1;
  }
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(indices, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
  const cloth = new THREE.SkinnedMesh(geometry, mat);
  upper.add(cloth);
  upper.updateWorldMatrix(true, true);
  cloth.bind(new THREE.Skeleton([upper, lower, upper.parent]));
  // The straight rest pose's sphere doesn't cover all the swimming and
  // crouching poses. Bound the full sweep about the upper joint.
  geometry.computeBoundingSphere();
  cloth.boundingSphere = new THREE.Sphere(new THREE.Vector3(),
    geometry.boundingSphere.radius + geometry.boundingSphere.center.length());
  cloth.castShadow = true;
  return cloth;
}
