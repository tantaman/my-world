// The landing, made in code like everything else: vertex-coloured boxes and
// quads gathered into one mesh, with the young alligator they keep in its
// pen as a mesh of its own.
//
//   the dock    plank decking on posts, from the bank out to where the boat
//               ties up, with a cleat at its end and a ramp up onto it
//   the shack   a little board shack on the bank, its tin roof sloping back,
//               a ticket window with a counter facing the water, and the
//               tour's name on a board along the front
//   the pen     a slab of concrete inside a low block wall and a chain-link
//               fence, a patch of turf at one end, and on the concrete a
//               young alligator, black with yellow bands, as in the photo
//               taken there
//
// Everything is placed in a frame of its own, `at`: x, z where the shack
// and the pen stand back from the water, y the ground there, and `yaw` the
// way to the water. The dock is given in world terms, from the bank to the
// boat. Built round the frame's own origin and put in the world as a whole
// (render/origin.js).
//
//   buildLanding({ at, dock: { a, b, top }, ground, name, materials }) -> {
//     object    the group, placed and turned
//     solids    capsules for the world's Solids (the dock, the shack, the pen)
//     gator     the young alligator's rig (wildlife/gators.js), to breathe
//     window    where you stand to buy a ticket, in world terms: { x, z }
//     clear     discs in world terms ({ x, z, r }) to keep plants and grass off
//   }
//   dock.a, dock.b   world { x, z }: where the dock leaves the bank, and its end
//   dock.top         the world height of its planks
//   ground           (x, z) -> the world height of the ground

import * as THREE from 'three';
import { Kit } from '../build/kit.js';
import { buildGator } from '../wildlife/gators.js';

const col = (hex) => new THREE.Color(hex);
const PAL = {
  plank: [col(0x8a7356), col(0x7a6348), col(0x958060)],
  post: col(0x4e3f30),
  board: col(0xb9ad94),
  boardDark: col(0x9a8e76),
  trim: col(0x5a2a22),
  roof: col(0x8e8c86),
  rust: col(0x8a4a2c),
  window: col(0x1c2024),
  counter: col(0x6c5640),
  sign: col(0xe8e2d0),
  red: col(0xb02a1e),
  ink: col(0x1a1a1e),
  concrete: col(0xb8b4aa),
  stain: col(0x8e8a80),
  block: col(0x9c988e),
  turf: col(0x3f7a2a),
  fence: col(0x6a6e72),
  cleat: col(0x2a2a2c),
};
const DOCK_W = 1.8; // m across the planks
const POST_EVERY = 2; // m between pairs of posts
export const SHACK = { w: 3.4, d: 2.6, h: 2.5, x: 5.5, z: -1.2 }; // m, and where it stands in the frame
export const PEN = { w: 3.4, d: 2.4, x: -4, z: -0.6 };

const _q = new THREE.Vector3();

export function buildLanding({ at, dock, ground, name, materials }) {
  const object = new THREE.Group();
  object.position.set(at.x, at.y, at.z);
  object.rotation.y = at.yaw;
  object.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(object.matrixWorld).invert();
  const local = (x, z, y = 0) => _q.set(x, y, z).applyMatrix4(inv);
  const world = (lx, lz) => {
    const c = Math.cos(at.yaw);
    const s = Math.sin(at.yaw);
    return { x: at.x + lx * c + lz * s, z: at.z - lx * s + lz * c };
  };
  const g = (lx, lz) => {
    const w = world(lx, lz);
    return ground(w.x, w.z) - at.y;
  };
  const k = new Kit();
  const solids = [];
  const clear = [];
  const solid = (a, b, r, bottom, top, step) => solids.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z, r, bottom, topA: top, topB: top, ...(step ? { step } : {}), surface: 'boards' });

  // ── The dock ────────────────────────────────────────────────────────────
  // laid out along its own line, in the frame
  const A = local(dock.a.x, dock.a.z).clone();
  const B = local(dock.b.x, dock.b.z).clone();
  const top = dock.top - at.y;
  const len = Math.hypot(B.x - A.x, B.z - A.z);
  const ux = (B.x - A.x) / len;
  const uz = (B.z - A.z) / len;
  const vx = uz;
  const vz = -ux;
  const P = (s, t, y) => [A.x + ux * s + vx * t, y, A.z + uz * s + vz * t];
  const hw = DOCK_W / 2;
  for (let s = -1.2, n = 0; s < len; s += 0.3, n++) {
    const s1 = Math.min(len, s + 0.27);
    const c = PAL.plank[n % 3];
    k.quad(P(s, -hw, top), P(s, hw, top), P(s1, hw, top), P(s1, -hw, top), [0, 1, 0], c);
    k.quad(P(s, hw, top), P(s, hw, top - 0.06), P(s1, hw, top - 0.06), P(s1, hw, top), [vx, 0, vz], c.clone().multiplyScalar(0.8));
    k.quad(P(s1, -hw, top), P(s1, -hw, top - 0.06), P(s, -hw, top - 0.06), P(s, -hw, top), [-vx, 0, -vz], c.clone().multiplyScalar(0.8));
  }
  // the posts, down into the mud, and the stringers along the sides
  for (let s = 0; s <= len + 0.01; s += POST_EVERY) {
    for (const t of [-hw + 0.08, hw - 0.08]) {
      const [x, , z] = P(Math.min(s, len - 0.1), t, 0);
      const foot = g(x, z) - 0.6;
      k.box(x - 0.08, foot, z - 0.08, x + 0.08, top + 0.25, z + 0.08, PAL.post);
    }
  }
  // the cleat the boat ties to, and a ramp up onto the dock from the bank
  {
    const [x, , z] = P(len - 0.35, hw - 0.25, 0);
    k.box(x - 0.18, top, z - 0.05, x + 0.18, top + 0.12, z + 0.05, PAL.cleat);
    const rampFrom = -3.2;
    const [rx0, , rz0] = P(rampFrom, 0, 0);
    const low = g(rx0, rz0) + 0.02;
    for (let s = rampFrom, n = 0; s < -1.2; s += 0.3, n++) {
      const s1 = Math.min(-1.2, s + 0.27);
      const y0 = low + ((top - low) * (s - rampFrom)) / (-1.2 - rampFrom);
      const y1 = low + ((top - low) * (s1 - rampFrom)) / (-1.2 - rampFrom);
      k.quad(P(s, -hw, y0), P(s, hw, y0), P(s1, hw, y1), P(s1, -hw, y1), [0, 1, 0], PAL.plank[n % 3]);
    }
  }
  const da = world(A.x - ux * 1.2, A.z - uz * 1.2);
  const db = world(B.x, B.z);
  solid(da, db, hw, dock.top - 3, dock.top, 0.5);
  clear.push({ x: (da.x + db.x) / 2, z: (da.z + db.z) / 2, r: len / 2 + 2.5 });

  // ── The shack ───────────────────────────────────────────────────────────
  const S = SHACK;
  const sx0 = S.x - S.w / 2;
  const sx1 = S.x + S.w / 2;
  const sz0 = S.z - S.d / 2; // its back
  const sz1 = S.z + S.d / 2; // its front, facing the water
  const floor = Math.max(g(sx0, sz0), g(sx1, sz0), g(sx0, sz1), g(sx1, sz1)) + 0.35;
  // on blocks, a little off the wet ground
  for (const [x, z] of [[sx0 + 0.2, sz0 + 0.2], [sx1 - 0.2, sz0 + 0.2], [sx0 + 0.2, sz1 - 0.2], [sx1 - 0.2, sz1 - 0.2]]) k.box(x - 0.15, g(x, z) - 0.2, z - 0.15, x + 0.15, floor, z + 0.15, PAL.block);
  k.box(sx0, floor - 0.08, sz0, sx1, floor, sz1, PAL.post);
  // the walls, boards up and down, a window in the front with its counter
  const wall = (x0, z0, x1, z1, n) => {
    const steps = Math.max(1, Math.round(Math.hypot(x1 - x0, z1 - z0) / 0.2));
    for (let i = 0; i < steps; i++) {
      const t0 = i / steps;
      const t1 = (i + 1) / steps;
      const c = i % 2 ? PAL.board : PAL.boardDark;
      const h = S.h - (n[2] !== 0 ? 0 : 0);
      k.quad([x0 + (x1 - x0) * t0, floor, z0 + (z1 - z0) * t0], [x0 + (x1 - x0) * t1, floor, z0 + (z1 - z0) * t1], [x0 + (x1 - x0) * t1, floor + h, z0 + (z1 - z0) * t1], [x0 + (x1 - x0) * t0, floor + h, z0 + (z1 - z0) * t0], n, c);
    }
  };
  wall(sx1, sz1, sx0, sz1, [0, 0, 1]);
  wall(sx0, sz0, sx1, sz0, [0, 0, -1]);
  wall(sx0, sz1, sx0, sz0, [-1, 0, 0]);
  wall(sx1, sz0, sx1, sz1, [1, 0, 0]);
  // (the window, and the counter out in front of it)
  k.box(S.x - 0.8, floor + 0.95, sz1 + 0.005, S.x + 0.8, floor + 1.9, sz1 + 0.02, PAL.window);
  k.box(S.x - 0.95, floor + 0.9, sz1, S.x + 0.95, floor + 0.96, sz1 + 0.35, PAL.counter);
  for (const x of [S.x - 0.9, S.x + 0.9]) k.box(x - 0.03, floor + 0.95, sz1, x + 0.03, floor + 1.95, sz1 + 0.04, PAL.trim);
  k.box(S.x - 0.9, floor + 1.9, sz1, S.x + 0.9, floor + 1.96, sz1 + 0.04, PAL.trim);
  // the roof: tin, sloping to the back, rusty along its edges
  const roofF = floor + S.h + 0.35;
  const roofB = floor + S.h - 0.05;
  for (let i = 0, x = sx0 - 0.25; x < sx1 + 0.25; x += 0.3, i++) {
    const x1 = Math.min(sx1 + 0.25, x + 0.3);
    const c = i % 2 ? PAL.roof : PAL.roof.clone().multiplyScalar(0.88);
    k.quad([x, roofF, sz1 + 0.45], [x1, roofF, sz1 + 0.45], [x1, roofB, sz0 - 0.3], [x, roofB, sz0 - 0.3], [0, 0.98, 0.17], c);
    k.quad([x1, roofF - 0.02, sz1 + 0.45], [x, roofF - 0.02, sz1 + 0.45], [x, roofB - 0.02, sz0 - 0.3], [x1, roofB - 0.02, sz0 - 0.3], [0, -1, 0], PAL.rust);
  }
  // the gable ends under the slope
  for (const x of [sx0, sx1]) {
    const n = [x < S.x ? -1 : 1, 0, 0];
    const a = [x, floor + S.h, sz1];
    const b = [x, floor + S.h, sz0];
    const c = [x, roofB + 0.02, sz0];
    const d = [x, roofF - 0.05, sz1];
    if (x < S.x) k.quad(a, b, c, d, n, PAL.boardDark);
    else k.quad(b, a, d, c, n, PAL.boardDark);
  }
  // its name on a board along the front, under the eave
  const signY = floor + S.h + 0.12;
  k.box(sx0 + 0.1, signY - 0.3, sz1 + 0.02, sx1 - 0.1, signY + 0.3, sz1 + 0.06, PAL.sign);
  const words = name.toUpperCase().replace(/[^A-Z0-9 ]/g, '');
  const parts = words.split(' ');
  const first = parts.slice(0, Math.ceil(parts.length / 2)).join(' ');
  const second = parts.slice(Math.ceil(parts.length / 2)).join(' ');
  const px = Math.min(0.03, (S.w - 0.4) / (Math.max(first.length, second.length) * 6));
  k.words(first, S.x, signY + 0.12, sz1 + 0.062, 0, 1, px, PAL.red, { deep: 0.006 });
  k.words(second, S.x, signY - 0.13, sz1 + 0.062, 0, 1, px, PAL.ink, { deep: 0.006 });
  const corner = (lx, lz) => world(lx, lz);
  solid(corner(sx0 + 0.3, S.z), corner(sx1 - 0.3, S.z), S.d / 2, at.y - 1, at.y + floor + S.h, 0);
  clear.push({ ...world(S.x, S.z), r: Math.max(S.w, S.d) * 0.75 + 0.5 });

  // ── The pen ─────────────────────────────────────────────────────────────
  const N = PEN;
  const px0 = N.x - N.w / 2;
  const px1 = N.x + N.w / 2;
  const pz0 = N.z - N.d / 2;
  const pz1 = N.z + N.d / 2;
  const slab = Math.max(g(px0, pz0), g(px1, pz0), g(px0, pz1), g(px1, pz1)) + 0.12;
  k.box(px0, slab - 0.4, pz0, px1, slab, pz1, PAL.concrete);
  // wet stains on the concrete, and a patch of turf at one end
  for (let i = 0; i < 9; i++) {
    const x = px0 + 0.3 + ((i * 0.37) % 1) * (N.w - 0.6);
    const z = pz0 + 0.3 + ((i * 0.61) % 1) * (N.d - 0.6);
    const r = 0.18 + ((i * 0.29) % 1) * 0.3;
    k.quad([x - r, slab + 0.003, z + r], [x + r, slab + 0.003, z + r], [x + r, slab + 0.003, z - r], [x - r, slab + 0.003, z - r], [0, 1, 0], PAL.stain);
  }
  k.box(px0, slab, pz0, px0 + 0.7, slab + 0.03, pz1, PAL.turf);
  // the low wall round it, and the fence on that
  const wallH = 0.45;
  const fenceH = 1.25;
  for (const [x0, z0, x1, z1] of [[px0, pz0, px1, pz0], [px0, pz1, px1, pz1], [px0, pz0, px0, pz1], [px1, pz0, px1, pz1]]) {
    k.box(Math.min(x0, x1) - 0.08, slab - 0.1, Math.min(z0, z1) - 0.08, Math.max(x0, x1) + 0.08, slab + wallH, Math.max(z0, z1) + 0.08, PAL.block);
    // chain-link: posts, rails, and a mesh of thin wires
    const len2 = Math.hypot(x1 - x0, z1 - z0);
    const posts = Math.ceil(len2 / 1.2);
    for (let i = 0; i <= posts; i++) {
      const x = x0 + ((x1 - x0) * i) / posts;
      const z = z0 + ((z1 - z0) * i) / posts;
      k.box(x - 0.025, slab + wallH, z - 0.025, x + 0.025, slab + wallH + fenceH, z + 0.025, PAL.fence);
    }
    const dx = (x1 - x0) / len2;
    const dz = (z1 - z0) / len2;
    k.box(Math.min(x0, x1) - 0.02, slab + wallH + fenceH - 0.03, Math.min(z0, z1) - 0.02, Math.max(x0, x1) + 0.02, slab + wallH + fenceH, Math.max(z0, z1) + 0.02, PAL.fence);
    // the wire: diamonds of it, as thin strips running up both ways at 45°,
    // so you see through it
    const nx = dz;
    const nz = -dx;
    const y0 = slab + wallH;
    const strip = (s0, ya, s1, yb) => {
      const t = 0.006;
      const a = [x0 + dx * s0, ya, z0 + dz * s0];
      const b = [x0 + dx * s1, yb, z0 + dz * s1];
      // across the strip, in the fence's plane, square to its run
      const ux = (s1 - s0) * dx;
      const uz = (s1 - s0) * dz;
      const uy = yb - ya;
      const L = Math.hypot(ux, uy, uz);
      if (!(L > 1e-4)) return;
      const cx = (-uy * dx) / L;
      const cz = (-uy * dz) / L;
      const cy = Math.hypot(ux, uz) / L;
      k.quad([a[0] - cx * t, a[1] - cy * t, a[2] - cz * t], [b[0] - cx * t, b[1] - cy * t, b[2] - cz * t], [b[0] + cx * t, b[1] + cy * t, b[2] + cz * t], [a[0] + cx * t, a[1] + cy * t, a[2] + cz * t], [nx, 0, nz], PAL.fence);
    };
    const MESH = 0.1; // m between wires
    for (let s = -fenceH; s < len2; s += MESH) {
      // each wire from the bottom up at 45°, and the other way, cut at the ends
      for (const dir of [1, -1]) {
        let sa = dir > 0 ? s : s + fenceH;
        let ya = y0;
        let sb = dir > 0 ? s + fenceH : s;
        let yb = y0 + fenceH;
        const clip = (sv, yv, so, yo) => {
          if (so === sv) return [sv, yv];
          if (sv < 0) return [0, yv + ((yo - yv) * (0 - sv)) / (so - sv)];
          if (sv > len2) return [len2, yv + ((yo - yv) * (len2 - sv)) / (so - sv)];
          return [sv, yv];
        };
        if ((sa < 0 && sb < 0) || (sa > len2 && sb > len2)) continue;
        [sa, ya] = clip(sa, ya, sb, yb);
        [sb, yb] = clip(sb, yb, sa, ya);
        strip(sa, ya, sb, yb);
      }
    }
  }
  solid(world(px0, N.z), world(px1, N.z), N.d / 2 + 0.1, at.y - 1, at.y + slab + wallH + fenceH, 0);
  clear.push({ ...world(N.x, N.z), r: Math.max(N.w, N.d) * 0.75 + 0.4 });

  const mesh = new THREE.Mesh(k.build(), materials.wood);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  object.add(mesh);

  // the young alligator on its concrete, lying still, its mouth a little
  // open, its head toward the turf
  const gator = buildGator(1049, 1.35);
  gator.mesh.position.set(N.x - 0.15, slab + gator.rest, N.z + 0.15);
  gator.mesh.rotation.y = -Math.PI / 2 + 0.25;
  for (const leg of gator.legs) leg.bone.rotation.y = leg.side * (leg.front ? 0.35 : -0.25);
  gator.spine.forEach((b, i) => (b.rotation.y = i > 5 ? 0.08 : 0));
  gator.jaw.rotation.x = 0.12;
  object.add(gator.mesh);

  return { object, solids, gator, window: world(S.x, sz1 + 0.8), clear, floor: at.y + floor, slab: at.y + slab };
}
