// The cow: a Holstein, 1.45 m at the withers, black patches on white, a pink
// muzzle and udder, black ears, thin white legs with dark hooves, a tail
// with a white switch. Built as a dairy cow is shaped: a straight top line
// from withers to tail head, a deep chest and a belly that hangs out behind
// the ribs, bony hook and pin bones at a square rump, thin thighs, a deep
// neck with a dewlap. Each piece is a field of blended bones and swellings
// (props/sdf.js) meshed once; the patches are painted per vertex from a
// noise field in the standing cow's own space, so they run on across the
// pieces' joins (PLAN.md 5.10).
//
// It flicks its tail and turns its head; in the beam (ufo/lift.js moves it)
// its legs hang from the elbows and stifles. Facing +X, origin on the ground
// under its middle.
import { Group, Mesh, MeshPhysicalNodeMaterial } from 'three/webgpu';
import { attribute, uniform, vec3 } from 'three/tsl';
import { noise1 } from '../noise1.js';
import { mesh, sphere, ellipsoid, roundCone, capsule, smin, fbm3 } from './sdf.js';

// Where the moving parts hang from, in the standing cow (metres).
const NECK_ROOT = [0.5, 1.2, 0];
const NECK_LEN = 0.44;
const NECK_TURN = 0.32;     // radians the neck is turned toward the cow's left (-Z), where the road is
const POLL = [NECK_ROOT[0] + NECK_LEN * Math.cos(NECK_TURN), NECK_ROOT[1] + 0.07, -NECK_LEN * Math.sin(NECK_TURN)];
const TAIL = [-0.96, 1.36, 0];
const FORE = [0.6, 0.83, 0.17];
const HIND = [-0.45, 0.87, 0.19];
const STEP = { body: 0.033, head: 0.019, leg: 0.018, tail: 0.016 };   // mesh cell sizes, m

// Hide colours, linear.
const WHITE = [0.6, 0.58, 0.53];
const BLACK = [0.011, 0.01, 0.009];
const PINK = [0.42, 0.24, 0.21];
const MUZZLE = [0.2, 0.14, 0.13];
const HOOF = [0.035, 0.03, 0.026];
const SHINE = 0.3;           // the hide's specular, of a usual dielectric's
// In the beam the cow is lit from all round by the glowing air about it, not
// only from above: this much light (as radiance a white hide gives back,
// times its colour) at full lift, bluish as the beam is.
const BEAM_GLOW = 3;
const BEAM_TINT = [0.9, 0.95, 1.0];

const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const smooth = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };

// ---- the pieces' fields, each in its own frame (its pivot at the origin)

// Body and neck. The neck runs from the shoulders, turned toward the road,
// deep and narrow, with the dewlap under it.
function body(x, y, z) {
  const az = Math.abs(z);
  let d = ellipsoid(x, y, z, 0.17, 1.07, 0, 0.56, 0.36, 0.28);                 // ribs
  d = smin(d, ellipsoid(x, y, z, -0.18, 0.94, 0, 0.55, 0.33, 0.305), 0.16);     // belly
  d = smin(d, ellipsoid(x, y, z, -0.62, 1.27, 0, 0.34, 0.15, 0.24), 0.12);      // pelvis: the wide flat rump
  d = smin(d, ellipsoid(x, y, z, -0.64, 1.1, 0, 0.3, 0.25, 0.2), 0.12);         // rump
  d = smin(d, capsule(x, y, z, [0.5, 1.34, 0], [-0.84, 1.355, 0], 0.095), 0.1);   // the back
  d = smin(d, ellipsoid(x, y, z, 0.46, 1.33, 0, 0.17, 0.12, 0.09), 0.08);       // withers
  d = smin(d, ellipsoid(x, y, az, 0.46, 1.11, 0.15, 0.2, 0.28, 0.13), 0.1);     // shoulder blades
  d = smin(d, ellipsoid(x, y, z, 0.63, 0.9, 0, 0.17, 0.2, 0.2), 0.12);          // chest, brisket
  d = smin(d, capsule(x, y, az, [0.55, 1.05, 0.18], [0.6, 0.83, 0.17], 0.082), 0.08);  // upper forelegs
  d = smin(d, sphere(x, y, az, -0.4, 1.32, 0.2, 0.06), 0.1);                   // hook bones
  d = smin(d, sphere(x, y, az, -0.88, 1.275, 0.08, 0.055), 0.06);              // pin bones
  d = smin(d, capsule(x, y, z, [-0.82, 1.37, 0], [-0.96, 1.345, 0], 0.052), 0.05);   // tail head
  d = smin(d, ellipsoid(x, y, az, -0.62, 0.98, 0.14, 0.22, 0.3, 0.12), 0.1);    // thighs
  d = smin(d, ellipsoid(x, y, z, -0.47, 0.64, 0, 0.19, 0.14, 0.16), 0.09);      // udder
  for (const tx of [-0.4, -0.54]) d = smin(d, capsule(x, y, az, [tx, 0.56, 0.07], [tx, 0.47, 0.072], 0.017), 0.03);
  // The neck, in its own turned frame.
  const c = Math.cos(NECK_TURN), s = Math.sin(NECK_TURN);
  const nx = (x - NECK_ROOT[0]) * c - z * s, nz = (x - NECK_ROOT[0]) * s + z * c, ny = y - NECK_ROOT[1];
  const neck = roundCone(nx, ny, nz / 0.6, [-0.05, -0.02, 0], [NECK_LEN, 0.07, 0], 0.27, 0.13) * 0.6;
  d = smin(d, neck, 0.12);
  d = smin(d, ellipsoid(nx, ny, nz, 0.2, -0.25, 0, 0.24, 0.1, 0.05), 0.09);    // dewlap
  return d;
}

// The head, from the poll, facing +X, carried nose down.
function head(x, y, z) {
  const az = Math.abs(z);
  let d = ellipsoid(x, y, z, 0.04, 0.03, 0, 0.1, 0.105, 0.098);                // poll, cranium
  d = smin(d, roundCone(x, y, z, [0.07, 0.02, 0], [0.28, -0.27, 0], 0.096, 0.062), 0.06);   // forehead to nose
  d = smin(d, ellipsoid(x, y, z, 0.31, -0.31, 0, 0.065, 0.06, 0.075), 0.04);   // muzzle
  d = smin(d, ellipsoid(x, y, az, 0.08, -0.08, 0.04, 0.11, 0.085, 0.07), 0.05);  // cheeks
  d = smin(d, roundCone(x, y, z, [0.02, -0.12, 0], [0.25, -0.34, 0], 0.06, 0.045), 0.05);   // jaw
  d = smin(d, sphere(x, y, az, 0.13, 0.02, 0.088, 0.027), 0.03);               // eyes
  // Ears: thin leaves out sideways, drooping.
  const ex = x + 0.005, ey = y - 0.03, ez = az - 0.17;
  const dr = 0.4;
  d = smin(d, ellipsoid(ex, ey * Math.cos(dr) + ez * Math.sin(dr), ez * Math.cos(dr) - ey * Math.sin(dr), 0, 0, 0, 0.017, 0.042, 0.085), 0.025);
  d = smin(d, capsule(x, y, az, [0.02, 0.1, 0.06], [0.01, 0.13, 0.085], 0.014), 0.02);   // horn buds
  return d;
}

// A lower foreleg from the elbow: forearm, knee, cannon, fetlock, hoof.
function foreleg(x, y, z) {
  let d = roundCone(x, y, z, [0, 0.08, 0], [0.012, -0.39, 0], 0.074, 0.044);
  d = smin(d, ellipsoid(x, y, z, 0.016, -0.405, 0, 0.05, 0.052, 0.046), 0.03);
  d = smin(d, roundCone(x, y, z, [0.016, -0.41, 0], [0.026, -0.68, 0], 0.037, 0.032), 0.03);
  d = smin(d, sphere(x, y, z, 0.03, -0.7, 0, 0.041), 0.025);
  d = smin(d, roundCone(x, y, z, [0.03, -0.71, 0], [0.058, -0.76, 0], 0.034, 0.034), 0.02);
  return smin(d, hoof(x - 0.07, y + 0.78, z), 0.012);
}

// A lower hind leg from the stifle: gaskin back to the hock, cannon, hoof.
function hindleg(x, y, z) {
  let d = roundCone(x, y, z, [0, 0.08, 0], [-0.2, -0.33, 0], 0.1, 0.048);
  d = smin(d, sphere(x, y, z, -0.21, -0.35, 0, 0.048), 0.03);
  d = smin(d, sphere(x, y, z, -0.255, -0.315, 0, 0.034), 0.03);              // point of the hock
  d = smin(d, roundCone(x, y, z, [-0.2, -0.36, 0], [-0.16, -0.73, 0], 0.04, 0.033), 0.03);
  d = smin(d, sphere(x, y, z, -0.155, -0.745, 0, 0.042), 0.025);
  d = smin(d, roundCone(x, y, z, [-0.155, -0.755, 0], [-0.128, -0.8, 0], 0.034, 0.034), 0.02);
  return smin(d, hoof(x + 0.115, y + 0.82, z), 0.012);
}

// A cloven hoof, its sole at y = -0.05 of its own origin.
function hoof(x, y, z) {
  const d = roundCone(x, y, z, [-0.008, 0.012, 0], [0.006, -0.03, 0], 0.036, 0.046);
  return Math.max(d, -(y + 0.05));
}

function tail(x, y, z) {
  let d = roundCone(x, y, z, [0, 0, 0], [-0.07, -0.68, 0], 0.034, 0.015);
  d = smin(d, ellipsoid(x, y, z, -0.075, -0.79, 0, 0.042, 0.13, 0.042), 0.03);
  return d;
}

// ---- the patches: big black islands on white, from noise in the standing cow's space

function patches(x, y, z) {
  let n = fbm3(x * 1.55 + 4.2, y * 1.55 + 0.7, z * 1.9 + 2.3, 3);
  n += 0.32 * Math.exp(-((x - 0.6) ** 2) / 0.12);           // black over the neck and shoulders
  n += 0.12 * Math.exp(-((x + 0.2) ** 2) / 0.2);            // and along the barrel
  n -= 0.75 * smooth(0.8, 0.55, y);                          // white underneath and down the legs
  return n;
}

function hideColour(x, y, z) {
  const c = mixc(WHITE, BLACK, smooth(-0.035, 0.035, patches(x, y, z)));
  // Mud and wet low on the legs.
  return mixc(c, [0.16, 0.13, 0.1], smooth(0.32, 0.08, y) * 0.7);
}

// ---- building it

const at = (p, f) => (x, y, z) => f(x - p[0], y - p[1], z - p[2]);

export function createCow() {
  const g = new Group();   // placed by ufo/lift.js
  const root = new Group();
  g.add(root);
  // Hair is matte: little of the light comes back off its surface, so the
  // black stays black even under the beam, which is many times brighter
  // than anything else on it.
  const material = new MeshPhysicalNodeMaterial({ vertexColors: true, roughness: 0.78, specularIntensity: SHINE });
  const glow = uniform(0);
  material.emissiveNode = attribute('color', 'vec3').mul(vec3(...BEAM_TINT)).mul(glow);
  const piece = (geometry, parent, p) => {
    const m = new Mesh(geometry, material);
    m.castShadow = true;
    m.receiveShadow = true;
    const pivot = new Group();
    pivot.position.set(...p);
    pivot.add(m);
    parent.add(pivot);
    return pivot;
  };

  // The body and neck, standing as they are (their frame is the cow's).
  piece(mesh(body, {
    min: [-1.06, 0.36, -0.45], max: [1.12, 1.56, 0.45], step: STEP.body,
    colour: (x, y, z) => {
      const udder = smooth(0.24, 0.14, Math.hypot((x + 0.47) / 1.2, y - 0.6, z / 1.1));
      return mixc(hideColour(x, y, z), PINK, udder);
    },
  }), root, [0, 0, 0]);

  // The head: a white face, black round the eyes and on the ears, a dark muzzle.
  const headPivot = piece(mesh(head, {
    min: [-0.12, -0.42, -0.3], max: [0.42, 0.2, 0.3], step: STEP.head,
    colour: (x, y, z) => {
      const c0 = Math.cos(NECK_TURN), s0 = Math.sin(NECK_TURN);
      let c = hideColour(POLL[0] + x * c0 + z * s0, POLL[1] + y, POLL[2] - x * s0 + z * c0);
      const az = Math.abs(z);
      const blaze = smooth(0.07, 0.03, az - Math.max(0, x - 0.1) * 0.15) * smooth(0.0, 0.08, x);
      c = mixc(c, WHITE, blaze);
      c = mixc(c, BLACK, smooth(0.08, 0.035, Math.hypot(x - 0.13, y - 0.02, az - 0.085)));    // eyes
      c = mixc(c, BLACK, smooth(0.1, 0.13, az) * smooth(0.06, 0.03, x));                     // ears
      c = mixc(c, MUZZLE, smooth(0.25, 0.3, x - (y + 0.27) * 0.3) * smooth(-0.2, -0.26, y));  // muzzle
      return c;
    },
  }), root, POLL);
  headPivot.rotation.y = NECK_TURN;

  // Legs, each from its joint, so they can hang.
  const legs = [];
  for (const [p, field, min, max] of [
    [FORE, foreleg, [-0.13, -0.88, -0.09], [0.16, 0.18, 0.09]],
    [HIND, hindleg, [-0.33, -0.92, -0.11], [0.13, 0.2, 0.11]],
  ]) {
    for (const s of [-1, 1]) {
      const pos = [p[0], p[1], s * p[2]];
      const geometry = mesh(field, {
        min, max, step: STEP.leg,
        colour: (x, y, z) => {
          const c = hideColour(x + pos[0], y + pos[1], z + pos[2]);
          return mixc(c, HOOF, smooth(-0.78, -0.8, y + (field === hindleg ? 0.01 : -0.03)));
        },
      });
      legs.push(piece(geometry, root, pos));
    }
  }

  // The tail: black above, its switch white.
  const tailPivot = piece(mesh(tail, {
    min: [-0.16, -0.96, -0.07], max: [0.06, 0.05, 0.07], step: STEP.tail,
    colour: (x, y, z) => mixc(hideColour(x + TAIL[0], y + TAIL[1], z), WHITE, smooth(-0.6, -0.7, y)),
  }), root, TAIL);

  return {
    object: g,
    // hang: 0 standing .. 1 legs hanging in the beam
    pose(t, hang) {
      glow.value = hang * BEAM_GLOW;
      tailPivot.rotation.x = 0.3 * Math.sin(t * 2.1) * (0.5 + 0.5 * noise1(t * 0.7, 4));
      tailPivot.rotation.z = -0.06 + 0.08 * noise1(t * 1.3, 5);
      // The head turned further toward the road, wandering; tossing in the beam.
      headPivot.rotation.y = NECK_TURN + 0.25 + 0.2 * noise1(t * 0.25, 6) + hang * 0.25 * Math.sin(t * 1.4);
      headPivot.rotation.z = 0.08 * noise1(t * 0.4, 7) + hang * 0.25;
      for (const [i, leg] of legs.entries()) {
        leg.rotation.z = hang * (0.25 + 0.15 * Math.sin(t * 2 + i));
        leg.rotation.x = hang * 0.15 * Math.sin(t * 1.7 + i * 1.3);
      }
    },
  };
}
