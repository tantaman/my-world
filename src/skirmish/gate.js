// The gate in the forest: the way in to Dry Wells.
//
// A sandstone gateway on a slab of paving, out of place among the trees: two
// square towers with a lintel between them and a low wall off each side, a
// red banner on one tower and a blue on the other, the town's name over the
// arch. The archway itself is full of light: the white glare and blue sky of
// somewhere much hotter than here. Walk into it and you're there.
//
// Everything is built round the site's own origin (x, z, at the height of
// the top of the slab) and that group is what's put in the world, so nothing
// big goes to the graphics card (render/origin.js). The glare is drawn from
// the plane's own corners, not from where it is.
//
//   buildGate(site, ground) -> {
//     object    the group, placed and turned where the site is
//     glare     its uniforms: { uTime }
//     solids    capsules for the world's Solids
//   }
//   ground(x, z) -> height of the ground in the world

import * as THREE from 'three';
import { Mesher } from '../build/geometry.js';
import { toWorld } from '../world/frame.js';
import { NAME, HALF, SKIRT, DOOR } from './site.js';

const col = (hex) => new THREE.Color(hex);
const PAL = { stone: col(0xd8c39a), dark: col(0xb9a37c), cap: col(0xc4ae86), paving: col(0xb7a88e), skirt: col(0xa39680), red: col(0xa8452e), blue: col(0x47607e), wood: col(0x6b4a2a) };
const TOWER = { wide: 2.4, deep: 2.2, tall: 5.6 };
const WING = { out: 6.4, deep: 1, tall: 3.2 };

const _m = new THREE.Matrix4();
const _w = { x: 0, z: 0 };

export function buildGate(site, ground) {
  const object = new THREE.Group();
  object.position.set(site.x, site.top, site.z);
  object.rotation.y = site.yaw;
  // the ground under a point of the site's frame, measured from the slab's top
  const g = (lx, lz) => {
    toWorld(site, lx, lz, _w);
    return ground(_w.x, _w.z) - site.top;
  };
  const m = new Mesher();
  const solids = [];
  const box = (x0, y0, z0, x1, y1, z1, color) => {
    _m.makeTranslation((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    m.add(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), _m, (p, n) => (n.y > 0.5 ? PAL.cap : color));
  };

  // ── The slab: its top, and its sloping sides down to below the ground ──
  const corners = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ];
  const low = (x, z) => Math.min(-0.3, g(x, z) - 0.4);
  const top = corners.map(([u, v]) => new THREE.Vector3(u * HALF.x, 0, v * HALF.z));
  const foot = corners.map(([u, v]) => new THREE.Vector3(u * (HALF.x + SKIRT), 0, v * (HALF.z + SKIRT)));
  m.tris([top[0], top[2], top[1], top[0], top[3], top[2]], () => PAL.paving);
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    // the side, in strips so its foot follows the ground
    const n = 6;
    for (let k = 0; k < n; k++) {
      const ta = top[i].clone().lerp(top[j], k / n);
      const tb = top[i].clone().lerp(top[j], (k + 1) / n);
      const fa = foot[i].clone().lerp(foot[j], k / n);
      const fb = foot[i].clone().lerp(foot[j], (k + 1) / n);
      fa.y = low(fa.x, fa.z);
      fb.y = low(fb.x, fb.z);
      m.tris([ta, fa, tb, tb, fa, fb], () => PAL.skirt);
    }
  }
  // paving joints: a few darker lines across it
  for (let x = -HALF.x + 1.4; x < HALF.x; x += 1.4) box(x - 0.02, 0, -HALF.z + 0.1, x + 0.02, 0.012, HALF.z - 0.1, PAL.skirt);
  const rise = site.top - site.low;
  for (const z of [-3.2, 0, 3.2]) solids.push(capsule(site, -HALF.x + 1.8, z, HALF.x - 1.8, z, 1.8, 0, 0, -rise - 1, rise + 0.4));
  for (const [u, v] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const span = u ? HALF.z : HALF.x;
    for (let t = -span + 0.6; t <= span - 0.6; t += 1.2) {
      const ax = u ? u * (HALF.x - 0.3) : t;
      const az = v ? v * (HALF.z - 0.3) : t;
      const bx = u ? u * (HALF.x + SKIRT) : t;
      const bz = v ? v * (HALF.z + SKIRT) : t;
      solids.push(capsule(site, ax, az, bx, bz, 0.6, 0, Math.min(0, g(bx, bz)), -rise - 1));
    }
  }

  // ── The gateway ──
  const x0 = DOOR.half;
  const x1 = DOOR.half + TOWER.wide;
  for (const s of [-1, 1]) {
    const a = Math.min(s * x0, s * x1);
    const b = Math.max(s * x0, s * x1);
    box(a, 0, -TOWER.deep / 2, b, TOWER.tall, TOWER.deep / 2, PAL.stone);
    box(a - 0.12, TOWER.tall, -TOWER.deep / 2 - 0.12, b + 0.12, TOWER.tall + 0.3, TOWER.deep / 2 + 0.12, PAL.dark);
    // battlements
    for (const bx of [a + 0.3, (a + b) / 2, b - 0.3]) box(bx - 0.25, TOWER.tall + 0.3, -TOWER.deep / 2, bx + 0.25, TOWER.tall + 0.75, TOWER.deep / 2, PAL.stone);
    // a slit of a window
    box((a + b) / 2 - 0.12, 3.4, TOWER.deep / 2, (a + b) / 2 + 0.12, 4.5, TOWER.deep / 2 + 0.03, col(0x1b1712));
    // the wall off to the side
    const wa = Math.min(s * x1, s * WING.out);
    const wb = Math.max(s * x1, s * WING.out);
    box(wa, 0, -WING.deep / 2, wb, WING.tall, WING.deep / 2, PAL.stone);
    box(wa, WING.tall, -WING.deep / 2 - 0.08, wb, WING.tall + 0.18, WING.deep / 2 + 0.08, PAL.dark);
    // a banner down the front of the tower: red on one, blue on the other
    box((a + b) / 2 - 0.5, 1.5, TOWER.deep / 2 + 0.03, (a + b) / 2 + 0.5, 3.2, TOWER.deep / 2 + 0.06, s < 0 ? PAL.red : PAL.blue);
    box((a + b) / 2 - 0.6, 3.2, TOWER.deep / 2 + 0.02, (a + b) / 2 + 0.6, 3.3, TOWER.deep / 2 + 0.1, PAL.wood);
    solids.push(capsule(site, s * (x0 + 0.95), 0, s * (x1 - 0.95), 0, 0.95, TOWER.tall, TOWER.tall, 0));
    solids.push(capsule(site, s * (x1 + 0.3), 0, s * WING.out, 0, WING.deep / 2, WING.tall, WING.tall, 0));
  }
  box(-x0, DOOR.tall, -0.9, x0, 5.3, 0.9, PAL.stone);
  box(-x0 - 0.1, 5.3, -1, x0 + 0.1, 5.5, 1, PAL.dark);
  // the shoulders of the arch
  for (const s of [-1, 1]) box(Math.min(s * x0, s * (x0 - 0.5)), DOOR.tall - 0.5, -0.9, Math.max(s * x0, s * (x0 - 0.5)), DOOR.tall, 0.9, PAL.dark);

  const body = new THREE.Mesh(m.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0, side: THREE.DoubleSide }));
  body.castShadow = body.receiveShadow = true;
  object.add(body);

  // ── Its name, over the arch, front and back ──
  const sign = new THREE.MeshBasicMaterial({ map: nameTexture(), transparent: true, toneMapped: false });
  for (const s of [1, -1]) {
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 0.9), sign);
    plate.position.set(0, 4.62, s * 0.92);
    plate.rotation.y = s > 0 ? 0 : Math.PI;
    object.add(plate);
  }

  // ── The light in the archway ──
  const glare = { uTime: { value: 0 } };
  const light = new THREE.Mesh(
    new THREE.PlaneGeometry(x0 * 2, DOOR.tall),
    new THREE.ShaderMaterial({
      uniforms: glare,
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        varying vec2 vUv;
        void main() {
          // sky over sand, wavering in the heat, burnt out towards the middle
          float y = vUv.y + sin(vUv.x * 18.0 + uTime * 1.7) * 0.012 + sin(vUv.x * 7.0 - uTime * 1.1) * 0.01;
          vec3 sky = mix(vec3(0.95, 0.9, 0.78), vec3(0.3, 0.52, 0.9), smoothstep(0.42, 1.0, y));
          vec3 sand = mix(vec3(0.86, 0.72, 0.5), vec3(0.98, 0.9, 0.72), smoothstep(0.0, 0.42, y));
          vec3 colour = y > 0.42 ? sky : sand;
          // a wall and a dome, far off
          float town = step(abs(vUv.x - 0.5), 0.34) * step(y, 0.5 + 0.035 * step(abs(vUv.x - 0.32), 0.05) + 0.06 * smoothstep(0.09, 0.0, abs(vUv.x - 0.62))) * step(0.42, y);
          colour = mix(colour, vec3(0.8, 0.68, 0.5), town);
          float burn = 1.0 - smoothstep(0.0, 0.75, length((vUv - vec2(0.5, 0.5)) * vec2(1.0, 1.25)));
          gl_FragColor = vec4(colour * (1.6 + 2.2 * burn), 1.0);
        }`,
      side: THREE.DoubleSide,
    }),
  );
  light.position.set(0, DOOR.tall / 2, 0);
  object.add(light);
  // ...which falls on the paving in front of it, after dark
  const spill = new THREE.PointLight(0xffe2b0, 14, 16, 1.6);
  spill.position.set(0, 2.4, 1.6);
  object.add(spill);

  return { object, glare, solids };
}

// A solid: a capsule from (ax, az) to (bx, bz) in the site's frame, r
// across, its top `topA`..`topB` and bottom `bottom` m over the slab's top.
function capsule(site, ax, az, bx, bz, r, topA, topB, bottom, step) {
  const a = toWorld(site, ax, az);
  const b = toWorld(site, bx, bz);
  const s = { ax: a.x, az: a.z, bx: b.x, bz: b.z, r, bottom: site.top + bottom, topA: site.top + topA, topB: site.top + topB };
  if (step !== undefined) s.step = step;
  return s;
}

// The town's name, cut into the stone and painted.
function nameTexture() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const g = c.getContext('2d');
  g.font = 'bold 76px Georgia, serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = 'rgba(60, 38, 22, 0.9)';
  g.fillText(NAME.toUpperCase(), 256, 68);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
