// What Dry Wells looks like: the town standing still, before anyone is in it.
//
//   the walls     sun-bleached plaster in half a dozen sandy shades, the
//                 courses of block showing through where it has come away,
//                 darker with dust towards the ground; doors and shuttered
//                 windows on the blocks, awnings over some, beam ends under
//                 the roof lines, a cap along every top
//   the ground    packed sand, paved where the sites are, with a great A or
//                 B painted on it and on the wall behind
//   the rest      wooden crates, the well, a cart, a dead truck, palms in the
//                 corners of the yards, washing strung across the streets;
//                 domes and a tower over the roofs; and outside the wall,
//                 dunes away to a hazy sky with the sun high in it
//
// The solid things are town.js's boxes, drawn as they are: what you see is
// what stops you. Everything else here is only for looking at.
//
// The town sits at its own origin, never slid like the forest
// (render/origin.js): everything in it is within a few hundred metres of
// zero, so position is fine to draw patterns from.
//
//   const town = buildTown();   town.group goes in the scene; town.sun is the light

import * as THREE from 'three';
import { BOXES, SITES, BOUNDS, PALMS } from './town.js';
import { Mesher } from '../build/geometry.js';
import { mulberry32 } from '../noise.js';
import { CONFIG } from '../config.js';

export const SUN_DIR = new THREE.Vector3(0.42, 0.78, 0.46).normalize();
const SKY_R = 1400;
const SHADES = [0xdcc7a0, 0xd2b88c, 0xe3cfa8, 0xc9ae84, 0xd8c097, 0xcfb78f];
const TINT = { ground: 0xc9ae80, fence: 0xd6c098, wall: 0xcbb38a, low: 0xc4ab82, stone: 0xb5a78f, step: 0xbcae96, pillar: 0xd4c2a0, roof: 0xa98f6c, well: 0xa99c86 };
const WOODS = [0x8a6238, 0x7d5730, 0x94693d];
const DOORS = [0x5b3a22, 0x2f5d6b, 0x6b4a2a, 0x3d6b4f, 0x7a3b2c];
const CLOTH = [0xb5432f, 0x2f6fa8, 0xd9b44a, 0xe8e2d0, 0x3f8f6a, 0xc96f2b];

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3(1, 1, 1);

export function buildTown() {
  const group = new THREE.Group();
  const rng = mulberry32(90210);
  const plaster = new Mesher();
  const wood = new Mesher();
  const flat = new Mesher(); // doors, shutters, cloth: their own colours, no pattern
  const boxAt = (m, x0, y0, z0, x1, y1, z1, color) => {
    _m.makeTranslation((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    const c = new THREE.Color(color);
    m.add(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), _m, () => c);
  };

  // ── The solid things ──────────────────────────────────────────────────────
  let nth = 0;
  for (const b of BOXES) {
    if (b.look === 'truck' || b.look === 'palm') continue;
    if (b.look === 'crate' || b.look === 'cart') {
      crate(wood, b, WOODS[nth++ % WOODS.length]);
      continue;
    }
    const shade = b.look === 'block' ? SHADES[nth++ % SHADES.length] : TINT[b.look];
    boxAt(plaster, b.x0, b.y0, b.z0, b.x1, b.y1, b.z1, shade);
    if (b.look === 'block') dress(b, shade, rng, plaster, wood, flat);
    if (b.look === 'fence' || b.look === 'wall') {
      // a cap along the top
      boxAt(plaster, b.x0 - 0.08, b.y1, b.z0 - 0.08, b.x1 + 0.08, b.y1 + 0.16, b.z1 + 0.08, new THREE.Color(shade).multiplyScalar(0.86));
    }
    if (b.look === 'well') wellHead(b, wood, plaster);
  }
  const walls = new THREE.Mesh(plaster.build(), plasterMaterial());
  walls.castShadow = walls.receiveShadow = true;
  group.add(walls);
  const timber = new THREE.Mesh(wood.build(), woodMaterial());
  timber.castShadow = timber.receiveShadow = true;
  group.add(timber);

  // ── Things only to look at ────────────────────────────────────────────────
  for (const b of BOXES) if (b.look === 'truck') group.add(truck(b));
  for (const [x, z] of PALMS) group.add(palm(x, z, 6.5, rng));
  // outside the wall, over its top: more palms, more roofs
  for (let i = 0; i < 26; i++) {
    const a = rng() * Math.PI * 2;
    const r = 70 + rng() * 60;
    group.add(palm(Math.cos(a) * r, Math.sin(a) * r, 8 + rng() * 5, rng));
  }
  for (let i = 0; i < 34; i++) {
    const a = rng() * Math.PI * 2;
    const r = 62 + rng() * 90;
    const w = 6 + rng() * 10;
    const h = 5 + rng() * 9;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    boxAt(flat, x - w / 2, 0, z - w / 2, x + w / 2, h, z + w / 2, new THREE.Color(SHADES[i % SHADES.length]).multiplyScalar(0.92));
  }
  washing(flat, rng, -9, 18, 6, 24, 'x');
  washing(flat, rng, 9, 20, 6, 22, 'x');
  washing(flat, rng, 0, -15, 6, -15.5, 'x', 5.4);
  washing(flat, rng, -17, -9, 6, -9, 'z', 5.6);
  const decor = new THREE.Mesh(flat.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide }));
  decor.castShadow = decor.receiveShadow = true;
  group.add(decor);
  roofs(group);
  for (const s of SITES) siteMarks(group, s);

  // ── The desert, the sky, the light ────────────────────────────────────────
  group.add(desert(rng));
  group.add(sky());
  const sun = new THREE.DirectionalLight(0xfff0d8, 3.4);
  sun.position.copy(SUN_DIR).multiplyScalar(140);
  sun.castShadow = true;
  // (the town is twice as far across as the forest's shadows reach: twice the map)
  sun.shadow.mapSize.set(CONFIG.shadowMapSize * 2, CONFIG.shadowMapSize * 2);
  const cam = sun.shadow.camera;
  cam.left = cam.bottom = -68;
  cam.right = cam.top = 68;
  cam.near = 20;
  cam.far = 300;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.04;
  group.add(sun, sun.target);
  // light off the sand, warm, from below and all round; the sky's from above
  group.add(new THREE.HemisphereLight(0xa9c4e8, 0xd8b98a, 1.25));
  group.add(new THREE.AmbientLight(0xe8d8c0, 0.35));
  return { group, sun };
}

// ── The blocks' faces ───────────────────────────────────────────────────────

// Doors, windows, awnings and beam ends on a block of buildings, and a cap
// along its roof line.
function dress(b, shade, rng, plaster, wood, flat) {
  const trim = new THREE.Color(shade).multiplyScalar(0.84);
  _m.makeTranslation((b.x0 + b.x1) / 2, b.y1 + 0.18, (b.z0 + b.z1) / 2);
  plaster.add(new THREE.BoxGeometry(b.x1 - b.x0 + 0.24, 0.36, b.z1 - b.z0 + 0.24), _m, () => trim);
  // each face: where it is, which way it looks, how long it runs
  const faces = [
    { at: (t) => [b.x0 + t, b.z0], out: [0, -1], len: b.x1 - b.x0 },
    { at: (t) => [b.x0 + t, b.z1], out: [0, 1], len: b.x1 - b.x0 },
    { at: (t) => [b.x0, b.z0 + t], out: [-1, 0], len: b.z1 - b.z0 },
    { at: (t) => [b.x1, b.z0 + t], out: [1, 0], len: b.z1 - b.z0 },
  ];
  const tall = b.y1 - b.y0;
  for (const f of faces) {
    const n = Math.floor(f.len / 4.4);
    for (let i = 0; i < n; i++) {
      const t = ((i + 0.5) / n) * f.len + (rng() - 0.5) * 0.8;
      const [x, z] = f.at(t);
      // not out through the town wall, nor where the face runs along it
      if (Math.abs(x + f.out[0]) > BOUNDS.x1 - 0.5 || Math.abs(z + f.out[1]) > BOUNDS.z1 - 0.5) continue;
      const pick = rng();
      const yaw = Math.atan2(f.out[0], f.out[1]);
      if (pick < 0.3) {
        // a door, a step, and now and then an awning over it
        slab(flat, x, 1.05, z, yaw, 1.1, 2.1, 0.07, DOORS[Math.floor(rng() * DOORS.length)]);
        slab(wood, x, 2.18, z, yaw, 1.34, 0.14, 0.12, WOODS[0]);
        slab(plaster, x, 0.07, z, yaw, 1.5, 0.14, 0.5, 0xb5a78f);
        if (rng() < 0.45) awning(flat, x, 2.55, z, yaw, CLOTH[Math.floor(rng() * CLOTH.length)]);
      } else if (pick < 0.78 && tall > 4.5) {
        // a window with shutters, high enough to be someone's upstairs
        const y = 3 + rng() * (tall - 4.6);
        slab(flat, x, y, z, yaw, 0.8, 1.1, 0.05, 0x1d2630);
        const paint = DOORS[Math.floor(rng() * DOORS.length)];
        for (const s of [-1, 1]) slab(flat, x + Math.cos(yaw) * s * 0.62, y, z - Math.sin(yaw) * s * 0.62, yaw, 0.4, 1.12, 0.09, paint);
        slab(plaster, x, y - 0.62, z, yaw, 1.0, 0.1, 0.22, 0xb5a78f);
      }
    }
    // beam ends under the roof line
    const beams = Math.floor(f.len / 1.3);
    for (let i = 0; i < beams; i++) {
      const [x, z] = f.at(((i + 0.5) / beams) * f.len);
      if (Math.abs(x + f.out[0]) > BOUNDS.x1 - 0.5 || Math.abs(z + f.out[1]) > BOUNDS.z1 - 0.5) continue;
      _m.makeRotationY(Math.atan2(f.out[0], f.out[1])).setPosition(x + f.out[0] * 0.2, b.y1 - 0.75, z + f.out[1] * 0.2);
      const c = new THREE.Color(WOODS[i % WOODS.length]).multiplyScalar(0.8);
      wood.add(new THREE.CylinderGeometry(0.07, 0.07, 0.5, 6).rotateX(Math.PI / 2), _m, () => c);
    }
  }
}

// A slab standing against a wall at (x, z), facing yaw: w wide, h tall, d proud.
function slab(m, x, y, z, yaw, w, h, d, color) {
  _m.makeRotationY(yaw).setPosition(x + Math.sin(yaw) * d * 0.5, y, z + Math.cos(yaw) * d * 0.5);
  const c = new THREE.Color(color);
  m.add(new THREE.BoxGeometry(w, h, d), _m, () => c);
}

// Cloth on two poles, sloping down from the wall.
function awning(m, x, y, z, yaw, color) {
  _q.setFromEuler(new THREE.Euler(0.42, yaw, 0, 'YXZ'));
  _m.compose(_v.set(x + Math.sin(yaw) * 0.6, y, z + Math.cos(yaw) * 0.6), _q, _s);
  const c = new THREE.Color(color);
  const pale = new THREE.Color(color).lerp(new THREE.Color(0xf0e8d8), 0.75);
  // in stripes
  m.add(new THREE.PlaneGeometry(1.8, 1.3, 6, 1).rotateX(-Math.PI / 2), _m, (p) => (Math.floor((p.x + 0.9) / 0.3) % 2 ? c : pale));
}

// A line of washing across a street, from (x, z) along an axis.
function washing(m, rng, x, z, len, z2, axis, y = 5.2) {
  const n = 7;
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n - 0.5;
    const px = axis === 'x' ? x + t * len : x;
    const pz = axis === 'x' ? z + (z2 - z) * (t + 0.5) : z + t * len;
    const sag = Math.cos(t * Math.PI) * 0.35;
    const w = 0.45 + rng() * 0.25;
    const h = 0.5 + rng() * 0.4;
    _m.makeRotationY(axis === 'x' ? Math.atan2(z2 - z, len) * -1 : Math.PI / 2).setPosition(px, y - sag - h / 2, pz);
    const c = new THREE.Color(CLOTH[Math.floor(rng() * CLOTH.length)]);
    m.add(new THREE.PlaneGeometry(w, h), _m, () => c);
  }
}

// A crate (or the cart): boards, a frame round each face.
function crate(m, b, color) {
  const w = b.x1 - b.x0;
  const h = b.y1 - b.y0;
  const d = b.z1 - b.z0;
  const c = new THREE.Color(color);
  const dark = new THREE.Color(color).multiplyScalar(0.72);
  _m.makeTranslation((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2);
  m.add(new THREE.BoxGeometry(w - 0.06, h - 0.02, d - 0.06), _m, () => c);
  // the frame: a batten along every edge
  const t = 0.09;
  const bar = (cx, cy, cz, sx, sy, sz) => {
    _m.makeTranslation(cx, cy, cz);
    m.add(new THREE.BoxGeometry(sx, sy, sz), _m, () => dark);
  };
  const mx = (b.x0 + b.x1) / 2;
  const my = (b.y0 + b.y1) / 2;
  const mz = (b.z0 + b.z1) / 2;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) bar(mx + (sx * (w - t)) / 2, my, mz + (sz * (d - t)) / 2, t, h, t);
  for (const sy of [-1, 1]) {
    for (const sz of [-1, 1]) bar(mx, my + (sy * (h - t)) / 2, mz + (sz * (d - t)) / 2, w, t, t);
    for (const sx of [-1, 1]) bar(mx + (sx * (w - t)) / 2, my + (sy * (h - t)) / 2, mz, t, t, d);
  }
  if (b.look === 'cart') {
    // two wheels and a pair of shafts
    for (const s of [-1, 1]) {
      _m.makeRotationZ(Math.PI / 2).setPosition(mx + (s * (w + 0.1)) / 2, 0.5, mz);
      m.add(new THREE.CylinderGeometry(0.5, 0.5, 0.08, 14), _m, () => dark);
      bar(mx + s * 0.5, 0.8, b.z1 + 0.8, 0.07, 0.07, 1.6);
    }
  }
}

// The posts and the beam over the well, and its rope.
function wellHead(b, wood, plaster) {
  const mx = (b.x0 + b.x1) / 2;
  const mz = (b.z0 + b.z1) / 2;
  const c = new THREE.Color(WOODS[1]);
  for (const s of [-1, 1]) {
    _m.makeTranslation(mx + s * 1.2, b.y1 + 0.9, mz);
    wood.add(new THREE.BoxGeometry(0.16, 1.8, 0.16), _m, () => c);
  }
  _m.makeTranslation(mx, b.y1 + 1.8, mz);
  wood.add(new THREE.BoxGeometry(2.8, 0.16, 0.16), _m, () => c);
  // the dark of the shaft
  _m.makeRotationX(-Math.PI / 2).setPosition(mx, b.y1 + 0.01, mz);
  const dark = new THREE.Color(0x15130f);
  plaster.add(new THREE.PlaneGeometry(b.x1 - b.x0 - 0.7, b.z1 - b.z0 - 0.7), _m, () => dark);
}

// A dead truck: a cab, a flat bed, four flat tyres.
function truck(b) {
  const g = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color: 0x6f8a86, roughness: 0.7, metalness: 0.2 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x24262a, roughness: 0.8 });
  const rust = new THREE.MeshStandardMaterial({ color: 0x7a5236, roughness: 0.9 });
  const w = b.x1 - b.x0;
  const d = b.z1 - b.z0;
  const mx = (b.x0 + b.x1) / 2;
  const add = (geo, mat, x, y, z) => {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(mx + x, y, b.z0 + z);
    mesh.castShadow = mesh.receiveShadow = true;
    g.add(mesh);
    return mesh;
  };
  add(new THREE.BoxGeometry(w - 0.3, 0.3, d - 0.2), rust, 0, 0.75, d / 2);
  add(new THREE.BoxGeometry(w - 0.2, 1.1, 1.7), paint, 0, 1.45, d - 0.95);
  add(new THREE.BoxGeometry(w - 0.5, 0.5, 0.06), dark, 0, 1.65, d - 0.08);
  add(new THREE.BoxGeometry(w - 0.2, 0.55, 0.12), paint, 0, 1.15, 0.1);
  for (const s of [-1, 1]) {
    add(new THREE.BoxGeometry(0.1, 0.55, d - 1.9), paint, (s * (w - 0.3)) / 2, 1.15, (d - 1.9) / 2);
    for (const z of [0.9, d - 1]) add(new THREE.CylinderGeometry(0.45, 0.45, 0.3, 12).rotateZ(Math.PI / 2), dark, (s * (w - 0.5)) / 2, 0.42, z);
  }
  return g;
}

// A palm: a leaning trunk in rings, and fronds drooping from its top.
function palm(x, z, tall, rng) {
  const g = new THREE.Group();
  const bark = new THREE.MeshStandardMaterial({ color: 0x8a7353, roughness: 0.95 });
  const leaf = new THREE.MeshStandardMaterial({ color: 0x4d7a36, roughness: 0.8, side: THREE.DoubleSide });
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.26, tall, 7), bark);
  trunk.position.y = tall / 2;
  trunk.castShadow = true;
  g.add(trunk);
  const turn = rng() * Math.PI;
  for (let i = 0; i < 9; i++) {
    const frond = new THREE.Mesh(frondGeometry(2.6 + rng() * 0.8), leaf);
    frond.position.y = tall;
    frond.rotation.set(0, turn + (i / 9) * Math.PI * 2, 0);
    frond.castShadow = true;
    g.add(frond);
  }
  g.position.set(x, 0, z);
  return g;
}

// One frond: a strip arching out and down, narrowing to its tip.
function frondGeometry(len) {
  const n = 6;
  const pos = [];
  const idx = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const out = t * len;
    const y = Math.sin(t * 2.2) * 0.7 - t * t * 1.5;
    const w = 0.42 * (1 - t * 0.85);
    pos.push(-w, y - 0.12, out, 0, y, out, w, y - 0.12, out);
    if (i < n) {
      const a = i * 3;
      idx.push(a, a + 3, a + 1, a + 1, a + 3, a + 4, a + 1, a + 4, a + 2, a + 2, a + 4, a + 5);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Over the roofs, out of anyone's reach: domes, and a tower with a peaked cap.
function roofs(group) {
  const white = new THREE.MeshStandardMaterial({ color: 0xe9dfc8, roughness: 0.7 });
  const tile = new THREE.MeshStandardMaterial({ color: 0x3f7f8a, roughness: 0.5, metalness: 0.1 });
  const dome = (x, y, z, r, mat) => {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    group.add(mesh);
  };
  dome(-12.5, 7, -21, 3.4, tile);
  dome(12.5, 6.5, -21, 2.2, white);
  dome(-23, 7.5, 17, 2.8, white);
  dome(26, 7, 20, 2, tile);
  const tower = new THREE.Mesh(new THREE.BoxGeometry(2.6, 7, 2.6), white);
  tower.position.set(0, 6 + 3.5, 21);
  tower.castShadow = true;
  group.add(tower);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(2.3, 2.4, 4).rotateY(Math.PI / 4), tile);
  cap.position.set(0, 6 + 7 + 1.2, 21);
  cap.castShadow = true;
  group.add(cap);
}

// A site: paving under where the charge goes, a border round it, and its
// letter on the ground and on the wall.
function siteMarks(group, s) {
  const [x0, z0, x1, z1] = s.zone;
  const y = s.id === 'A' ? 0.47 : 0.02;
  const paint = new THREE.MeshBasicMaterial({ map: letterTexture(s.id), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, toneMapped: false });
  const onGround = new THREE.Mesh(new THREE.PlaneGeometry(5, 5), paint);
  onGround.rotation.x = -Math.PI / 2;
  onGround.position.set(s.id === 'A' ? 36.6 : -33, y, s.id === 'A' ? -21 : -24);
  group.add(onGround);
  // on a wall, where both sides see it coming in
  const onWall = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 3.4), paint);
  if (s.id === 'A') {
    onWall.position.set(34, 3.6, -5.92);
    onWall.rotation.y = Math.PI;
  } else {
    onWall.position.set(-43.92, 3.4, -20);
    onWall.rotation.y = Math.PI / 2;
  }
  group.add(onWall);
  // the edge of where the charge may be set
  const line = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.75, 0.2, 0.12), transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  const edge = (cx, cz, w, d) => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), line);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(cx, 0.015, cz);
    group.add(mesh);
  };
  const t = 0.14;
  edge((x0 + x1) / 2, z0, x1 - x0, t);
  edge((x0 + x1) / 2, z1, x1 - x0, t);
  edge(x0, (z0 + z1) / 2, t, z1 - z0);
  edge(x1, (z0 + z1) / 2, t, z1 - z0);
}

// A site's letter, stencilled in red, worn.
function letterTexture(letter) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.font = 'bold 220px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = 'rgba(176, 44, 28, 0.85)';
  g.fillText(letter, 128, 140);
  g.lineWidth = 8;
  g.strokeStyle = 'rgba(176, 44, 28, 0.8)';
  g.strokeRect(14, 14, 228, 228);
  // worn: bits of it rubbed away
  g.globalCompositeOperation = 'destination-out';
  const rng = mulberry32(letter.charCodeAt(0));
  for (let i = 0; i < 260; i++) {
    g.globalAlpha = 0.25 + rng() * 0.5;
    g.fillRect(rng() * 256, rng() * 256, 2 + rng() * 9, 1 + rng() * 4);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ── Outside the wall ────────────────────────────────────────────────────────

// Sand out to the horizon, rising into dunes away from the town.
function desert(rng) {
  const geo = new THREE.PlaneGeometry(SKY_R * 2, SKY_R * 2, 96, 96).rotateX(-Math.PI / 2);
  const p = geo.attributes.position;
  const col = [];
  const phase = [rng() * 6, rng() * 6, rng() * 6];
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const z = p.getZ(i);
    const r = Math.hypot(x, z);
    // flat under the town and for a way round it, then rising, gently
    const out = Math.min(1, Math.max(0, (r - 80) / 320));
    const h = out * out * (Math.sin(x * 0.011 + phase[0]) * Math.cos(z * 0.013 + phase[1]) * 14 + Math.sin((x + z) * 0.027 + phase[2]) * 4 + 9);
    p.setY(i, r < 64 ? -0.03 : Math.max(-0.03, h));
    const k = 0.9 + 0.12 * Math.sin(x * 0.05) * Math.cos(z * 0.04);
    col.push(0.79 * k, 0.68 * k, 0.5 * k);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
  mesh.receiveShadow = true;
  return mesh;
}

// The sky: deep blue overhead, pale and dusty at the horizon, and the sun.
function sky() {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uSun: { value: SUN_DIR } },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uSun;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float up = clamp(d.y, 0.0, 1.0);
        vec3 zenith = vec3(0.16, 0.36, 0.78);
        vec3 horizon = vec3(0.86, 0.80, 0.68);
        vec3 col = mix(horizon, zenith, pow(up, 0.55));
        float s = max(dot(d, uSun), 0.0);
        col += vec3(1.0, 0.86, 0.6) * (pow(s, 24.0) * 0.5 + pow(s, 900.0) * 30.0);
        col = mix(col, horizon * 0.92, smoothstep(0.0, -0.08, d.y));
        gl_FragColor = vec4(col * 1.25, 1.0);
      }`,
    side: THREE.BackSide,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(SKY_R, 32, 18), mat);
  mesh.renderOrder = -1;
  mesh.frustumCulled = false;
  return mesh;
}

// ── Materials ───────────────────────────────────────────────────────────────

const NOISE = /* glsl */ `
  float tHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float tNoise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(tHash(i), tHash(i + vec2(1, 0)), f.x), mix(tHash(i + vec2(0, 1)), tHash(i + vec2(1, 1)), f.x), f.y);
  }`;

// A standard material that also knows where each pixel is in the town, and
// which way its face looks, to draw a pattern from.
function patterned(params, pattern, key) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, ...params });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vTownPos;\nvarying vec3 vTownNormal;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvTownPos = (modelMatrix * vec4(position, 1.0)).xyz;\nvTownNormal = normal;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec3 vTownPos;\nvarying vec3 vTownNormal;\n${NOISE}`).replace('#include <color_fragment>', `#include <color_fragment>\n{\n vec3 an = abs(vTownNormal);\n vec2 uv = an.y > 0.5 ? vTownPos.xz : (an.x > 0.5 ? vTownPos.zy : vTownPos.xy);\n${pattern}\n}`);
  };
  mat.customProgramCacheKey = () => key;
  return mat;
}

// Plaster over block: blotched, the courses showing through in patches,
// dusty towards the ground; on the flat, sand, in faint drifts.
function plasterMaterial() {
  return patterned(
    { roughness: 0.92, metalness: 0 },
    /* glsl */ `
    float blotch = tNoise(uv * 0.55) * 0.5 + tNoise(uv * 2.3) * 0.3 + tNoise(uv * 11.0) * 0.2;
    if (an.y < 0.5) {
      vec2 b = uv / vec2(0.62, 0.31);
      b.x += 0.5 * floor(mod(b.y, 2.0));
      vec2 f = fract(b);
      float mortar = smoothstep(0.0, 0.07, f.x) * smoothstep(0.0, 0.12, f.y);
      float bare = smoothstep(0.52, 0.7, tNoise(uv * 0.3 + 7.3));
      float each = 0.9 + 0.2 * tHash(floor(b));
      diffuseColor.rgb *= mix(1.0, (0.8 + 0.2 * mortar) * each, bare);
      diffuseColor.rgb *= mix(0.74, 1.0, smoothstep(0.0, 1.3, vTownPos.y + 0.25 * tNoise(uv * 1.7)));
      diffuseColor.rgb *= 0.84 + 0.3 * blotch;
    } else {
      float drift = tNoise(uv * 0.18) * 0.6 + tNoise(uv * 1.9) * 0.4;
      diffuseColor.rgb *= 0.86 + 0.26 * drift;
    }`,
    'skirmish-plaster',
  );
}

// Boards, a hand wide, each a shade its own.
function woodMaterial() {
  return patterned(
    { roughness: 0.85, metalness: 0 },
    /* glsl */ `
    float board = floor(uv.x / 0.22);
    float edge = smoothstep(0.0, 0.035, fract(uv.x / 0.22));
    float grain = tNoise(vec2(uv.x * 30.0, uv.y * 2.0));
    diffuseColor.rgb *= (0.82 + 0.3 * tHash(vec2(board, 3.0))) * (0.7 + 0.3 * edge) * (0.9 + 0.16 * grain);`,
    'skirmish-wood',
  );
}
