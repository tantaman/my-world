// The people of a town. Some towns have them and some don't (towns.js says
// how many live where); in those that do, they stroll from one door to the
// next, stop and stand about, turn to look at you, and when you come up to
// one, wave and say something. After dark most go indoors. The figures in a
// dark town are something else: they stand where they are and watch you, and
// they only ever move while you're not looking.
//
// Like the animals, they're nobody's to keep: nothing about them is saved or
// shared. What each looks like is grown from the town's seed, so everyone
// meets the same people there; where they wander is their own business.
//
// Each person is ONE skinned mesh (wildlife/rig.js): a single draw call
// however many pieces they have. Their walk is a few sines on the hips,
// knees and shoulders. Cloth blends across the joints as they move.
//
//   new Townsfolk(town, { scene, ground })
//   .update(dt, { player, night, hours, inView })
//   .dispose()
//
// Emits:
//   'hello'   ({ x, y, z, line, voice })  someone has something to say to you
//   'vanish'  ({ x, z })                  a watcher was there a moment ago

import * as THREE from 'three';
import { RigBuilder, lin, at, ellipsoid, limb, box, disposeAnimal } from '../wildlife/rig.js';
import { tailored, sleeve, trouserLeg, bootUpper, outsole, handShape, foldAt } from '../player/clothing.js';
import { mulberry32, clamp, smoothstep } from '../noise.js';
import { wrapAngle } from '../core/geom.js';
import { Emitter } from '../core/events.js';
import { toWorld, toLocal } from '../landmarks/sites.js';
import { FRONT_STEP, OPEN } from './towns.js';

const WALK = [1.1, 1.45]; // m/s, slowest and quickest stroll
const STRIDE = 1.35; // m a full stride covers (two steps), for a grown-up
const LANE = 1.6; // m either side of the middle of the street where people walk
const IDLE = [5, 18]; // s someone stands about before going somewhere else
const NOTICE = 9; // m: closer than this, people turn to look at you
const GREET = 3.6; // m: ...and closer than this, wave and say something
const AGAIN = 50; // s before the same person greets you again
const CHATTER = 7; // s at least between one greeting and the next, from anyone
const WAIT = 1.4; // m: someone walking stops if you're this close in front
const INDOORS = 0.55; // how dark (SKY.uNight) before most go in
const OUT_AGAIN = 0.4; // ...and how light before they come out again
const WATCH = { near: 6.5, step: 1.6, every: [3.5, 7], back: [14, 35] }; // a watcher: how close it comes, how far each move, how often, how long gone

const SKIN = [0xe8c4a8, 0xdcae90, 0xc68c6c, 0xa86f50, 0x8a5a3c, 0x6a4430].map(lin);
const PALE = [0xd8d0c8, 0xccc6be, 0xbab4ac].map(lin);
const HAIR = [0x2a1c14, 0x4a3020, 0x6a4a2a, 0x8a6a3a, 0xb89a6a, 0x9a9a9a, 0x1a1a1a].map(lin);
const BOOT = lin(0x2a1e16);
const orNone = (hex) => (hex === null ? null : lin(hex)); // a colour, or none (no vest)
const WHITE = lin(0xe8e2d4);
const OUTFITS = {
  western: {
    shirt: [0xe8e2d0, 0x5a7a9a, 0x9a3a2a, 0xc8b490, 0x8a8a7a].map(lin),
    vest: [0x3a2a1c, 0x2a2a2a, 0x6a4a2a, null, null].map(orNone),
    legs: [0x3a4a6a, 0x5a4a3a, 0x6a5a48, 0x4a4038].map(lin),
    dress: [0x6a2a3a, 0x2a4a6a, 0x3a5a3a, 0x8a6a4a, 0xa89a7a].map(lin),
    hat: ['cowboy', 'cowboy', 'cowboy', 'bowler', 'none'],
    hatColor: [0x8a6a4a, 0x3a2a1c, 0x1a1a1a, 0xc8b490, 0x5a4a3a].map(lin),
    herHat: ['bonnet', 'none', 'none'],
    lines: {
      morning: ['Mornin’.', 'Mornin’, stranger.', 'Early riser, huh?'],
      day: ['Howdy.', 'Afternoon.', 'Howdy, stranger.', 'Hot one today.', 'You ain’t from around here.', 'Mind the horses.', 'Saloon’s open, if you’re thirsty.', 'Watch yourself out in them woods.', 'Welcome to {town}.'],
      evening: ['Evenin’.', 'Evenin’, stranger.', 'Gettin’ dark.'],
      night: ['Kinda late to be wanderin’.', 'Evenin’.', 'Can’t sleep neither?'],
    },
  },
  village: {
    shirt: [0xc85a3a, 0x3a6a8a, 0x5a8a4a, 0xe8d8a8, 0x8a5a9a, 0xe8e2d4].map(lin),
    vest: [null, null, 0x4a5a3a, 0x5a4a6a].map(orNone),
    legs: [0x4a4a5a, 0x6a5a4a, 0x3a4a6a, 0x5a5a48].map(lin),
    dress: [0xd87a7a, 0x7aa8d8, 0xe8c86a, 0x8ac87a, 0xf0e8e0, 0xb88ac8].map(lin),
    hat: ['cap', 'none', 'none', 'straw'],
    hatColor: [0x5a5a4a, 0x4a4a5a, 0xd8c070].map(lin),
    herHat: ['none', 'none', 'straw', 'bonnet'],
    lines: {
      morning: ['Good morning!', 'Morning! Lovely day.', 'You’re out early.'],
      day: ['Hello there!', 'Lovely day for a walk.', 'Have you come far?', 'Afternoon!', 'The inn does a fine supper.', 'Welcome to {town}!', 'Isn’t the green pretty?', 'Mind how you go.'],
      evening: ['Good evening.', 'Evening! It’s getting dark.', 'Lovely evening.'],
      night: ['You’re up late.', 'Goodnight!', 'Mind the dark.'],
    },
  },
  creepy: {
    shirt: [0x1a1a1e, 0x2a2420, 0x24242a].map(lin),
    vest: [null],
    legs: [0x141416, 0x1e1a18].map(lin),
    dress: [0x141416, 0x1e1a1c, 0x2a2228].map(lin),
    hat: ['top', 'top', 'none'],
    hatColor: [0x111113, 0x1a1616].map(lin),
    herHat: ['bonnet', 'none'],
    coat: true,
    lines: null,
  },
};

const _l = { x: 0, z: 0 };
const pick = (list, rnd) => list[Math.floor(rnd() * list.length)];
const lerp = (a, b, t) => a + (b - a) * t;

// ── One person ───────────────────────────────────────────────────────────────
// What they look like: grown from a seed and their town's way of dressing.
export function lookOf(style, rnd) {
  const O = OUTFITS[style];
  const her = rnd() < 0.45;
  const child = style === 'village' && rnd() < 0.18;
  const dark = style === 'creepy';
  return {
    her,
    child,
    dark,
    height: child ? 0.62 + rnd() * 0.08 : dark ? 1.04 + rnd() * 0.1 : 0.93 + rnd() * 0.12,
    build: dark ? 0.86 : 0.92 + rnd() * 0.18,
    skin: pick(dark ? PALE : SKIN, rnd),
    hair: pick(HAIR, rnd),
    shirt: pick(O.shirt, rnd),
    vest: her || child ? null : pick(O.vest, rnd),
    legs: pick(O.legs, rnd),
    dress: her ? pick(O.dress, rnd) : null,
    apron: her && style === 'village' && rnd() < 0.4,
    coat: !!O.coat && !her,
    hat: child ? 'none' : her ? pick(O.herHat, rnd) : pick(O.hat, rnd),
    hatColor: pick(O.hatColor, rnd),
    beard: !her && !child && rnd() < (style === 'western' ? 0.45 : 0.25),
  };
}

// The body: bones and parts, one mesh.
export function buildPerson(look, seed) {
  const r = new RigBuilder(seed);
  r.grain = 0.1;
  const hips = r.bone(null, 0, 0.92, 0, 'hips');
  const spine = r.bone(hips, 0, 0.08, 0, 'spine');
  const chest = r.bone(spine, 0, 0.22, 0, 'chest');
  const neck = r.bone(chest, 0, 0.23, 0, 'neck');
  const head = r.bone(neck, 0, 0.1, 0, 'head');
  const B = look.build;
  const legs = [];
  const arms = [];
  for (const side of [1, -1]) {
    const thigh = r.bone(hips, side * 0.09, -0.03, 0, 'thigh');
    const shin = r.bone(thigh, 0, -0.42, 0, 'shin');
    const foot = r.bone(shin, 0, -0.42, 0, 'foot');
    legs.push({ side, thigh, shin, foot });
    const arm = r.bone(chest, side * 0.19 * B, 0.17, 0, 'arm');
    const fore = r.bone(arm, 0, -0.28, 0, 'fore');
    arms.push({ side, arm, fore });
  }

  const shirt = look.coat ? look.shirt : look.dress || look.shirt;
  const rubber = lin(0x292622);
  const blendAt = (parent, upper, lower, jointY, width, topY, topWidth) => (p) => {
    if (p.y > topY) {
      const w = smoothstep(topY, topY + topWidth, p.y);
      return [upper, 1 - w, parent, w];
    }
    const w = smoothstep(-width, width, jointY - p.y);
    return [upper, 1 - w, lower, w];
  };
  for (const { side, thigh, shin, foot } of legs) {
    r.part(thigh, trouserLeg(side, null, 0.09 / (B * 0.88)), {
      matrix: at(0, 0, 0, 0, 0, 0, B * 0.88, 1, 0.89),
      color: look.legs, weights: blendAt(hips, thigh, shin, 0.47, 0.085, 0.71, 0.2),
    });
    r.part(foot, bootUpper(), { matrix: at(0, 0.02, 0), color: BOOT });
    r.part(foot, outsole(), { matrix: at(0, 0.02, 0), color: rubber });
  }
  if (look.dress || look.coat) {
    const length = look.dress ? 0.79 : 0.56;
    const width = look.dress ? 0.285 : 0.218;
    const skirt = tailored([[-length, width, width * 0.77, -0.007, 0.012],
      [-length + 0.02, width, width * 0.77, -0.007, 0.012],
      [-length * 0.65, width * 0.9, width * 0.69], [-0.18, 0.181, 0.14],
      [-0.02, 0.161, 0.119], [0.10, 0.137, 0.105]], { segments: 32 });
    const vertices = skirt.attributes.position;
    for (let i = 0; i < vertices.count; i++) {
      const x = vertices.getX(i), z = vertices.getZ(i);
      const fullness = smoothstep(0, length, -vertices.getY(i));
      const pleat = 1 + 0.075 * fullness * Math.cos(8 * Math.atan2(x, z));
      vertices.setXYZ(i, x * pleat, vertices.getY(i), z * pleat);
    }
    skirt.computeVertexNormals();
    r.part(hips, skirt, {
      matrix: at(0, 0, 0, 0, 0, 0, B, 1, 1),
      color: (p) => look.apron && p.z > 0.06 && Math.abs(p.x) < 0.13 ? WHITE : shirt,
      weights: (p) => {
        const w = 0.52 * smoothstep(0, length, 0.92 - p.y);
        return [hips, 1 - w, legs[p.x >= 0 ? 0 : 1].thigh, w];
      },
    });
  }

  const torso = tailored([[-0.06, 0.165, 0.12], [-0.035, 0.17, 0.123, 0, 0.009],
    [0.03, 0.157, 0.119, 0, 0.012], [0.08, 0.147, 0.109], [0.18, 0.156, 0.116],
    [0.29, 0.182, 0.124, 0.005], [0.36, 0.199, 0.119], [0.395, 0.18, 0.108],
    [0.425, 0.115, 0.092], [0.44, 0.067, 0.063]], { squareness: 0.9, segments: 32,
      crease: (y, x) => 0.005 * foldAt(y - 0.10 - 0.047 * x, 0.014) +
        0.005 * foldAt(y - 0.34 + 0.084 * Math.abs(x), 0.013),
    });
  r.part(spine, torso, {
    matrix: at(0, 0, 0, 0, 0, 0, B, 1, 1),
    color: (p) => {
      if (look.apron && p.z > 0.06 && Math.abs(p.x) < 0.10 && p.y < 0.29) return WHITE;
      if (look.vest && (p.z < 0 || Math.abs(p.x) > Math.max(0.008, (p.y - 0.17) * 0.4))) return look.vest;
      return shirt;
    },
    weights: (p) => {
      const w = smoothstep(1.11, 1.33, p.y);
      return [spine, 1 - w, chest, w];
    },
  });
  r.part(neck, limb(0.05, 0.055, 0.12, 14), { matrix: at(0, 0.08, 0), color: look.skin });
  const collar = tailored([[-0.04, 0.085, 0.077], [-0.012, 0.071, 0.069], [0.006, 0.061, 0.061]]);
  r.part(neck, collar, { color: shirt.clone().multiplyScalar(0.79) });
  // A folded shirt collar and fastenings above the waist, readable when
  // someone turns to greet you. Keep them on the chest as it breathes.
  const edging = shirt.clone().multiplyScalar(0.74);
  const collarCloth = shirt.clone().lerp(WHITE, 0.16);
  for (const side of [-1, 1]) {
    const leaf = new THREE.Shape().moveTo(0, 0.018).lineTo(side * 0.053, 0.027)
      .lineTo(side * 0.080, -0.007).lineTo(side * 0.042, -0.054).closePath();
    r.part(chest, new THREE.ExtrudeGeometry(leaf, { depth: 0.003, bevelEnabled: false }), {
      matrix: at(side * 0.003, 0.195, 0.084, -0.53, side * 0.24), color: collarCloth,
    });
  }
  if (!look.apron) {
    r.part(chest, box(0.012, 0.20, 0.004), { matrix: at(0, 0.065, 0.127, -0.03), color: edging });
    for (const y of [-0.013, 0.042, 0.097, 0.151]) {
      r.part(chest, ellipsoid(0.005, 0.005, 0.003), { matrix: at(0, y, 0.13), color: BOOT });
    }
    if (!look.vest && !look.dress) {
      const pocket = new THREE.Shape().moveTo(-0.033, 0.031).lineTo(0.034, 0.031)
        .lineTo(0.03, -0.024).lineTo(0, -0.037).lineTo(-0.03, -0.024).closePath();
      r.part(chest, new THREE.ExtrudeGeometry(pocket, { depth: 0.003, bevelEnabled: false }), {
        matrix: at(0.087 * B, 0.082, 0.115, 0, 0.34), color: shirt.clone().multiplyScalar(0.9),
      });
    }
  }
  if (!look.dress && !look.coat) {
    r.part(hips, tailored([[0.031, 0.167, 0.122], [0.038, 0.169, 0.124],
      [0.065, 0.169, 0.122], [0.069, 0.165, 0.12]]), { matrix: at(0, 0, 0, 0, 0, 0, B, 1, 1), color: BOOT });
    r.part(hips, box(0.032, 0.022, 0.007), { matrix: at(0, 0.052, 0.125), color: lin(0x9c8a65) });
  }
  for (const { side, arm, fore } of arms) {
    r.part(arm, sleeve(side), {
      matrix: at(0, 0, 0, 0, 0, 0, B * 0.79, 1, 0.83), color: shirt,
      weights: blendAt(chest, arm, fore, 1.11, 0.06, 1.36, 0.08),
    });
    r.part(fore, handShape(side), { matrix: at(0, -0.236, 0), color: look.skin });
  }
  face(r, head, look);
  hat(r, head, look);

  const mesh = r.build();
  mesh.scale.setScalar(look.height);
  return { mesh, hips, spine, chest, neck, head, legs, arms };
}

// Sculpt the sockets, cheekbones and nasal bridge into the same surface.
// Hair follows the temples down behind the ears, leaving the forehead bare.
function face(r, head, look) {
  const rows = [
    [-0.066, 0.027, 0.042, 0.028], [-0.052, 0.055, 0.069, 0.015],
    [-0.034, 0.071, 0.084, 0.01], [-0.016, 0.081, 0.095],
    [0, 0.087, 0.10], [0.018, 0.091, 0.103], [0.036, 0.095, 0.106],
    [0.049, 0.097, 0.104], [0.062, 0.098, 0.104], [0.075, 0.10, 0.106],
    [0.09, 0.10, 0.108], [0.105, 0.098, 0.108], [0.125, 0.095, 0.105],
    [0.151, 0.091, 0.10], [0.174, 0.076, 0.087], [0.19, 0.052, 0.06], [0.199, 0.012, 0.018],
  ];
  const face = tailored(rows, { segments: 44 });
  const p = face.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = Math.abs(p.getX(i)), y = p.getY(i), z = p.getZ(i);
    if (z < 0.05) continue;
    const ridge = Math.exp(-((x / 0.016) ** 2)) * Math.exp(-(((y - 0.045) / 0.043) ** 2));
    const tip = Math.exp(-((x / 0.022) ** 2) - (((y - 0.032) / 0.012) ** 2));
    const socket = Math.exp(-(((x - 0.039) / 0.024) ** 2) - (((y - 0.068) / 0.013) ** 2));
    const cheek = Math.exp(-(((x - 0.057) / 0.026) ** 2) - (((y - 0.042) / 0.019) ** 2));
    p.setZ(i, z + 0.025 * ridge + 0.014 * tip - 0.011 * socket + 0.008 * cheek);
  }
  face.computeVertexNormals();
  const lips = look.skin.clone().lerp(lin(0x834f49), 0.42);
  r.part(head, face, { color: (p) => {
    const hairline = 0.136 - 0.08 * (1 - smoothstep(-0.06, 0.07, p.z));
    if (p.y > hairline || (look.her && p.z < -0.04 && p.y > -0.03)) return look.hair;
    if (look.beard && (Math.abs(p.x) > 0.028 || Math.abs(p.y + 0.005) > 0.007) && p.y < 0.011 + 0.023 * Math.abs(p.x) / 0.095 && p.z > -0.035) return look.hair;
    return look.skin;
  } });
  r.part(head, ellipsoid(0.027, 0.004, 0.005), { matrix: at(0, -0.004, 0.102), color: lips });
  const iris = lin(0x44392e);
  const eyeWhite = look.skin.clone().lerp(WHITE, 0.54);
  for (const side of [-1, 1]) {
    const x = side * 0.038;
    r.part(head, ellipsoid(0.016, 0.005, 0.008, 12, 8), { matrix: at(x, 0.068, 0.09, 0, side * 0.33), color: eyeWhite });
    r.part(head, ellipsoid(0.005, 0.0048, 0.003), { matrix: at(x + side * 0.002, 0.068, 0.097), color: iris });
    r.part(head, ellipsoid(0.022, 0.004, 0.006), { matrix: at(x, 0.083, 0.098, 0, side * 0.38, -side * 0.09), color: look.hair });
    r.part(head, ellipsoid(0.014, 0.024, 0.015), { matrix: at(side * 0.095, 0.045, -0.003, 0.14), color: look.skin });
  }
}

function hat(r, head, look) {
  const c = look.hatColor;
  // A felt or straw brim dips over the eyes and lifts at the sides.
  const brim = (width, height, curl, color) => {
    const rings = [];
    for (let i = 0; i <= 5; i++) rings.push(new THREE.Vector2(lerp(0.077, width, i / 5), -0.003));
    for (let i = 5; i >= 0; i--) rings.push(new THREE.Vector2(lerp(0.077, width, i / 5), 0.003));
    const geo = new THREE.LatheGeometry(rings, 36);
    const v = geo.attributes.position;
    for (let i = 0; i < v.count; i++) {
      const x = v.getX(i), z = v.getZ(i);
      v.setXYZ(i, x, v.getY(i) + curl * (x * x - 0.68 * z * z) / (width * width), z * 0.92);
    }
    geo.computeVertexNormals();
    r.part(head, geo, { matrix: at(0, height, 0), color });
  };
  const band = (color) => r.part(head, tailored([[0.153, 0.105, 0.108],
    [0.156, 0.107, 0.11], [0.173, 0.104, 0.107]]), { color });
  switch (look.hat) {
    case 'cowboy':
      brim(0.182, 0.151, 0.04, c);
      r.part(head, tailored([[0.15, 0.105, 0.109], [0.17, 0.104, 0.107],
        [0.224, 0.088, 0.097], [0.244, 0.076, 0.083, 0, 0.01], [0.25, 0.061, 0.071]]), { color: c });
      band(BOOT);
      break;
    case 'top':
      r.part(head, new THREE.CylinderGeometry(0.15, 0.15, 0.015, 12, 1), { matrix: at(0, 0.15, 0), color: c });
      r.part(head, new THREE.CylinderGeometry(0.095, 0.095, 0.26, 10, 1), { matrix: at(0, 0.28, 0), color: c });
      break;
    case 'bowler':
      r.part(head, ellipsoid(0.11, 0.08, 0.12), { matrix: at(0, 0.15, 0), color: c });
      r.part(head, new THREE.CylinderGeometry(0.145, 0.145, 0.012, 12, 1), { matrix: at(0, 0.14, 0), color: c });
      break;
    case 'cap':
      r.part(head, ellipsoid(0.115, 0.05, 0.125), { matrix: at(0, 0.15, 0.01), color: c });
      r.part(head, box(0.15, 0.014, 0.08), { matrix: at(0, 0.135, 0.12), color: c });
      break;
    case 'straw':
      brim(0.191, 0.152, 0.015, lin(0xc6ae70));
      r.part(head, tailored([[0.15, 0.105, 0.108], [0.174, 0.102, 0.105],
        [0.212, 0.096, 0.098], [0.226, 0.085, 0.089], [0.231, 0.065, 0.07]]), { color: lin(0xbca067) });
      band(lin(0x61523b));
      break;
    case 'bonnet':
      r.part(head, ellipsoid(0.13, 0.135, 0.12), { matrix: at(0, 0.08, -0.025), color: look.dark ? lin(0x111113) : look.dress || c });
      break;
    default:
  }
}

// How a person moves: walking, standing, turning to look, waving.
export class Body {
  constructor(look, seed) {
    Object.assign(this, buildPerson(look, seed));
    this.look = look;
    this.phase = Math.random();
    this.walk = 0; // 0..1, how much of a walk the legs are in
    this.waving = 0; // s left of a wave
    this.headYaw = 0;
    this.t = Math.random() * 10;
  }

  // speed: m/s along the ground; lookAt: yaw the head would like to turn to,
  // relative to the body, or null
  pose(dt, speed, lookAt) {
    this.t += dt;
    const L = this.look;
    const stride = STRIDE * L.height;
    this.phase += (speed * dt) / stride;
    const want = clamp(speed / 1.2, 0, 1);
    this.walk += (want - this.walk) * Math.min(1, dt * 6);
    const k = this.walk;
    const ph = this.phase * Math.PI * 2;
    const A = (L.dress ? 0.32 : 0.45) * k;
    for (const { side, thigh, shin, foot } of this.legs) {
      const s = Math.sin(ph + (side > 0 ? 0 : Math.PI));
      const c = Math.cos(ph + (side > 0 ? 0 : Math.PI));
      thigh.rotation.x = -A * s;
      shin.rotation.x = 0.85 * k * Math.max(0, c) + 0.05;
      foot.rotation.x = -(thigh.rotation.x + shin.rotation.x) * 0.8;
    }
    this.hips.position.y = this.hips.userData.rest.y - 0.02 * k + Math.abs(Math.cos(ph)) * 0.028 * k;
    this.hips.rotation.y = Math.sin(ph) * 0.08 * k;
    this.chest.rotation.y = -Math.sin(ph) * 0.12 * k;
    // breathing, standing about
    this.chest.rotation.x = Math.sin(this.t * 1.7) * 0.015 + (this.look.dark ? 0.06 : 0);
    for (const { side, arm, fore } of this.arms) {
      const s = Math.sin(ph + (side > 0 ? 0 : Math.PI));
      arm.rotation.x = 0.55 * A * s;
      arm.rotation.z = side * 0.07;
      fore.rotation.x = -0.18 - 0.2 * k;
      fore.rotation.z = 0;
    }
    if (this.waving > 0) {
      // the right hand up, waving
      this.waving -= dt;
      const up = clamp(Math.min(this.waving * 3, (1.8 - this.waving) * 4), 0, 1);
      const right = this.arms[1];
      right.arm.rotation.x = lerp(right.arm.rotation.x, -1.0, up);
      right.arm.rotation.z = lerp(right.arm.rotation.z, -0.74, up);
      right.fore.rotation.x = lerp(right.fore.rotation.x, -2.0, up);
      right.fore.rotation.z = (-0.45 + Math.sin(this.t * 11) * 0.36) * up;
    }
    const target = lookAt === null ? Math.sin(this.t * 0.3) * 0.3 : clamp(lookAt, -1.3, 1.3);
    this.headYaw += (target - this.headYaw) * Math.min(1, dt * (lookAt === null ? 1 : 4));
    this.neck.rotation.y = this.headYaw * 0.4;
    this.head.rotation.y = this.headYaw * 0.6;
  }

  dispose() {
    disposeAnimal(this.mesh);
  }
}

// ── A town's people ──────────────────────────────────────────────────────────
// Where they go: the front of each building, out in the street, and the
// middle of the green or the gate of the graveyard. A person walks from one to
// another out along their side of the street, down it, and in again.
export function spotsOf(town) {
  const out = [];
  for (const lot of town.lots) {
    if (lot.ruin) continue;
    const p = toWorld(lot, (lot.u * 7) % 1.4 - 0.7, lot.d / 2 + FRONT_STEP);
    out.push({ x: p.x, z: p.z, yaw: lot.yaw + Math.PI, lot, open: !!OPEN[lot.type] });
  }
  return out;
}

export class Townsfolk extends Emitter {
  constructor(town, { scene, ground }) {
    super();
    this.town = town;
    this.scene = scene;
    this.ground = ground;
    this.spots = spotsOf(town);
    this.style = town.style;
    this.watchers = town.style === 'creepy';
    this.people = [];
    const rnd = mulberry32(town.seed ^ 0x5eed);
    const O = OUTFITS[town.style];
    this.lines = O.lines;
    for (let i = 0; i < town.people && this.spots.length; i++) {
      const look = lookOf(town.style, rnd);
      const body = new Body(look, Math.floor(rnd() * 1e9));
      const home = this.spots[Math.floor(rnd() * this.spots.length)];
      const p = {
        body,
        home,
        x: home.x + (rnd() - 0.5) * 2,
        z: home.z + (rnd() - 0.5) * 2,
        yaw: home.yaw + (rnd() - 0.5),
        speed: 0,
        pace: lerp(WALK[0], WALK[1], rnd()) * (look.child ? 1.15 : 1),
        path: [],
        idle: rnd() * IDLE[1],
        greeted: -AGAIN,
        indoors: false,
        owl: town.style === 'western' && i < 2, // stays out after dark
        voice: look.her || look.child ? 1.35 + rnd() * 0.3 : 0.85 + rnd() * 0.25,
        gone: 0, // a watcher, gone from where it was: s until it's back
        moveIn: 0,
      };
      body.mesh.position.set(p.x, ground(p.x, p.z), p.z);
      body.mesh.rotation.y = p.yaw;
      scene.add(body.mesh);
      this.people.push(p);
    }
    this.clock = 0;
    this.said = -CHATTER; // when anyone last said hello
  }

  // ctx: { player: { x, z }, night: 0..1, hours, inView(x, y, z, r) }
  update(dt, ctx) {
    this.clock += dt;
    for (const p of this.people) {
      if (this.watchers) this._watch(p, dt, ctx);
      else this._live(p, dt, ctx);
      const m = p.body.mesh;
      m.visible = !p.indoors && p.gone <= 0;
      if (!m.visible) continue;
      m.position.set(p.x, this.ground(p.x, p.z), p.z);
      m.rotation.y = p.yaw;
      const toYou = Math.atan2(ctx.player.x - p.x, ctx.player.z - p.z);
      const d = Math.hypot(ctx.player.x - p.x, ctx.player.z - p.z);
      p.body.pose(dt, p.speed, d < NOTICE ? wrapAngle(toYou - p.yaw) : null);
    }
  }

  // Someone who lives here: stands about, walks somewhere, goes in at night.
  _live(p, dt, ctx) {
    const { player, night } = ctx;
    const d = Math.hypot(player.x - p.x, player.z - p.z);
    const toYou = Math.atan2(player.x - p.x, player.z - p.z);
    // after dark, home and indoors; out again in the morning
    if (!p.owl) {
      if (night > INDOORS && !p.indoors && !p.path.length && !p.goingHome) this._goTo(p, p.home, true);
      if (night < OUT_AGAIN && p.indoors) {
        p.indoors = false;
        p.goingHome = false;
        p.idle = 2 + Math.random() * 10;
      }
    }
    if (p.indoors) return;
    if (p.path.length) {
      // walking: stop for you if you're in the way
      const w = p.path[0];
      const ahead = Math.abs(wrapAngle(toYou - p.yaw)) < 0.7;
      const blocked = d < WAIT && ahead;
      const dx = w.x - p.x;
      const dz = w.z - p.z;
      const left = Math.hypot(dx, dz);
      const want = blocked ? 0 : p.pace;
      p.speed += (want - p.speed) * Math.min(1, dt * 4);
      if (left < 0.25) {
        p.path.shift();
        if (!p.path.length) {
          p.speed = 0;
          p.idle = lerp(IDLE[0], IDLE[1], Math.random());
          if (p.goingHome) p.indoors = true;
        }
      } else {
        const yaw = Math.atan2(dx, dz);
        p.yaw += wrapAngle(yaw - p.yaw) * Math.min(1, dt * 5);
        const step = Math.min(left, p.speed * dt);
        p.x += Math.sin(p.yaw) * step;
        p.z += Math.cos(p.yaw) * step;
      }
    } else {
      p.speed = 0;
      // standing about: face whoever comes up to talk
      if (d < NOTICE * 0.6) p.yaw += wrapAngle(toYou - p.yaw) * Math.min(1, dt * 2);
      p.idle -= dt;
      if (p.idle <= 0 && d > GREET) {
        const near = this.spots.filter((s) => Math.hypot(s.x - p.x, s.z - p.z) < 60);
        const list = near.length > 1 ? near : this.spots;
        this._goTo(p, list[Math.floor(Math.random() * list.length)]);
      }
    }
    // saying hello
    if (d < GREET && this.clock - p.greeted > AGAIN && this.clock - this.said > CHATTER && this.lines) {
      p.greeted = this.said = this.clock;
      p.body.waving = 1.8;
      this.emit('hello', { x: p.x, y: this.ground(p.x, p.z) + 1.6 * p.body.look.height, z: p.z, line: this._line(ctx.hours), voice: p.voice });
    }
  }

  // A watcher: never seen to move. While you're looking it stands and turns
  // its head to you; while you aren't, it comes a little closer, and close
  // up it isn't there at all, until it is again somewhere else.
  _watch(p, dt, ctx) {
    const { player, inView } = ctx;
    const seen = (x, z) => inView(x, this.ground(x, z) + 1, z, 1.2);
    if (p.gone > 0) {
      p.gone -= dt;
      if (p.gone <= 0) {
        // back, somewhere you aren't looking
        const free = this.spots.filter((s) => !seen(s.x, s.z) && Math.hypot(s.x - player.x, s.z - player.z) > 14);
        if (!free.length) p.gone = 3;
        else {
          const s = free[Math.floor(Math.random() * free.length)];
          p.x = s.x;
          p.z = s.z;
        }
      }
      return;
    }
    const d = Math.hypot(player.x - p.x, player.z - p.z);
    const toYou = Math.atan2(player.x - p.x, player.z - p.z);
    p.speed = 0;
    if (seen(p.x, p.z)) return;
    if (d < WATCH.near - 0.5) {
      p.gone = lerp(WATCH.back[0], WATCH.back[1], Math.random());
      this.emit('vanish', { x: p.x, z: p.z });
      return;
    }
    p.moveIn -= dt;
    if (p.moveIn <= 0 && d < 45) {
      p.moveIn = lerp(WATCH.every[0], WATCH.every[1], Math.random());
      const step = Math.min(WATCH.step, d - WATCH.near);
      const nx = p.x + Math.sin(toYou) * step;
      const nz = p.z + Math.cos(toYou) * step;
      // only along open ground: the street, or where it already stood
      toLocal(this.town, nx, nz, _l);
      if (Math.abs(_l.z) <= this.town.half + 3 && Math.abs(_l.x) < this.town.len / 2 + 6 && !seen(nx, nz)) {
        p.x = nx;
        p.z = nz;
      }
      p.yaw = toYou;
    }
    return;
  }

  // Walk to a spot: out to this side of the street, along, and in.
  _goTo(p, s, home = false) {
    const t = this.town;
    const a = toLocal(t, p.x, p.z, {});
    const b = toLocal(t, s.x, s.z, {});
    const lane = (b.z < 0 ? -1 : 1) * LANE;
    const w = (u, v) => toWorld(t, u, v, {});
    p.path = [w(a.x, lane), w(b.x, lane), { x: s.x, z: s.z }];
    p.goingHome = home;
  }

  _line(hours) {
    const L = this.lines;
    const when = hours < 5 || hours > 21.5 ? 'night' : hours < 11 ? 'morning' : hours < 18 ? 'day' : 'evening';
    return pick(L[when], Math.random).replace('{town}', this.town.name);
  }

  dispose() {
    for (const p of this.people) {
      this.scene.remove(p.body.mesh);
      p.body.dispose();
    }
    this.people.length = 0;
  }
}

