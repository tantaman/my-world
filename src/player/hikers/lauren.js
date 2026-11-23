// Lauren: a royal-blue ribbed tank top with a fine gold chain at her neck,
// black leggings, grey wool socks and charcoal hiking boots with mint at the
// heel; a black packable daypack, its blue hydration hose looped across her
// chest; and her blue-violet down jacket tied round her waist by its sleeves.
// A white cap with grey stitching, her long dark-brown hair pulled back
// through the back of it into a ponytail that swings as she goes, gold
// aviators with mirrored violet lenses, small pearl studs, and a wide smile.
// Drawn from photos of her hiking up a snowfield.
//
// She is the grown-up body made smaller (SIZE), and her head is a
// grown-up's (../head.js builds it to her look: what each of LOOK is, is at
// the top of head.js). Everything here is in metres of the grown-up body,
// like the bones it hangs from; on the head, from eye level, +z the way she
// looks, the size a real head is.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { smoothstep, lerp, clamp } from '../../noise.js';
import { tailored, sleeve, trouserLeg, bootUpper, outsole, handShape, textile, material as M, piece, cord, group, limb } from '../clothing.js';
import { buildHead, buildGlasses, buildCap, lensMaterial } from '../head.js';

// How tall she is beside the grown-up: about 1.62 m to 1.8.
const SIZE = 0.9;

// ── Colours (as in the photographs, out of the snow's glare) ─────────────────
const SKIN = 0xd2a689;
const HAIR = 0x553824;
const HAIR_ENDS = 0x7a5436; // lighter at the ends, where the sun has had them
const TANK = 0x1f3a9e;
const GOLD = 0xd0ab62;
const PEARL = 0xf2eee6;
const LEGGINGS = 0x17181c;
const SOCK = 0x8a8c90;
const BOOT = 0x3c4047;
const BOOT_MESH = 0x585e66;
const MINT = 0x5cc4ae;
const TOE = 0x2c2f33;
const MIDSOLE = 0x9a9ea3;
const TREAD = 0x232427;
const LACE = 0x8a9892;
const PACK = 0x25282d;
const PACK_TRIM = 0x5c6066;
const STRAP = 0x3d4045;
const HOSE = 0x2848cf;
const PUFFER = 0x5160c4;
const CAP = 0xf1f1ef;
const CAP_SEAM = 0x7c818e;
const EYELET = 0x3a3d48;

const _p = new THREE.Vector3();
const _q = new THREE.Vector3();
const _d = new THREE.Color();
const rgb = (hex) => _d.set(hex).toArray([]);

// ── Her head ────────────────────────────────────────────────────────────────
// The cap: a soft six-panel cap, rounder and lower than a snapback, its
// brim curved down at the sides and stitched round in rows; open at the back
// over the strap for her ponytail. (What each is, is at buildCap in head.js.)
const CAP_SPEC = {
  rx: 0.088, rz: 0.106, z: -0.006,
  front: 0.096, back: 0.084,
  square: 2.6,
  y: 0.026, tilt: 0.04,
  colour: CAP, seam: CAP_SEAM,
  brim: { w: 0.089, l: 0.07, attach: 1.2, colour: CAP, curve: 5, rows: 5 },
  segments: [72, 18],
  opening: { across: 0.24, up: 0.22 },
  eyelets: EYELET,
};
// Where her hair is gathered into the ponytail, at the back of her head in
// the cap's opening (in the cap's frame), and how long the ponytail is.
const PONY_ROOT = new THREE.Vector3(0, 0.016, -0.096);
const PONY_LENGTH = 0.2;
const HAIR_COLOUR = new THREE.Color(HAIR);

const LOOK = {
  // the cranium; cheekbones high and wide; a narrower, softer jaw; the
  // cheeks full; a small chin, a little pointed
  skull: [
    [[0, 0.02, -0.01], [0.0745, 0.091, 0.096]],
    [[0, -0.02, 0.012], [0.071, 0.054, 0.075]],
    [[0, -0.049, 0.004], [0.061, 0.052, 0.078]],
    [[0, -0.04, 0.02], [0.067, 0.04, 0.071]],
    [[0, -0.084, 0.037], [0.024, 0.02, 0.026]],
  ],
  round: 0.018,
  eyeX: 0.031,
  brow: 0.026,
  // a small nose with a low bridge and a soft, round tip
  nose: {
    nasion: { y: 0.012, z: 0.0868 },
    slope: 0.56,
    hump: 0,
    tip: { y: -0.0335, round: 0.007 },
    under: { z: 0.0925, slope: 1.6 },
    bridgeRound: 0.0052,
    tipRound: 0.0085,
    steep: [1.25, 2.1],
    sideCurve: 26,
    ala: { x: 0.0128, y: -0.0385, rx: 0.0068, ry: 0.0058, lift: 0.0082 },
    nostril: 0.0072,
    base: -0.0462,
  },
  // a wide smile, the corners well up, the upper teeth all showing
  mouth: { y: -0.0645, w: 0.029, smile: 0.0062, parted: 0.0078, teeth: [0.97, 0.84] },
  relief: {
    socket: 0.0055,
    browRidge: 0.0016,
    cheekbones: [0.0048, 0.046, -0.02],
    cheeks: [0.007, 0.037, -0.028], // round, lifted by the smile
    teeth: 0.0062,
    lips: [0.0018, 0.0028],
    lipW: [0.024, 0.022],
    chin: [0.0012, -0.093],
  },
  ear: { x: 0.0715, y: -0.004, z: -0.012, h: 0.0275, w: 0.0155, flare: 0.3, lean: 0.18 },
  colour: {
    rosy: new THREE.Color(0xc87566),
    lip: new THREE.Color(0xa85a58),
    brow: new THREE.Color(0xd8ad90),
    root: new THREE.Color(0x2a1c15), // skin seen through her hair
    nostril: new THREE.Color(0x2a1410),
    socket: new THREE.Color(0x80604f),
    teeth: new THREE.Color(0xece5d8),
    mouth: new THREE.Color(0x3a1715),
  },
  hair: {
    beard: null,
    // drawn back behind her ears, up from the nape, to the ponytail; under
    // the cap round the rest (its band is set high, so the hair shows in the
    // cap's opening at the back)
    scalp: {
      line: [0.06, -0.012, -0.078], from: [1.05, 1.25], band: { y: 0.062, tilt: CAP_SPEC.tilt },
      len: 0.0042, thin: 0.9, colour: HAIR_COLOUR, comb: 5,
      toward: new THREE.Vector3(0, CAP_SPEC.y + PONY_ROOT.y, PONY_ROOT.z),
    },
    // fine, arched
    brows: { inner: 0.01, span: 0.042, drop: 0, arch: 0.0065, tail: 0.0035, half: [0.0034, 0.0014], len: 0.0024, colour: HAIR_COLOUR },
    deepest: 0.0042,
  },
};

// Aviators: thin gold wire round big teardrop lenses, a bar across the brow
// and a bridge arched over the nose; mirrored violet.
const GLASSES = {
  y: 0.002, // lens centres
  z: 0.097, // the front of the frame at the bridge
  r: 0.105, // radius the front is bent round (m)
  temple: new THREE.Vector3(0.079, 0.02, -0.022), // the arm rests on the ear
};
// The lens's outline (u out from the bridge, v up from its centre): a nearly
// straight top, rising a little outward, round at the outer corner, swelling
// down and out into the teardrop and back up the inside.
const LENS_OUTLINE = [
  [0.0095, 0.0125], [0.03, 0.0148], [0.05, 0.0162], [0.0595, 0.0128], [0.0625, 0.004],
  [0.0612, -0.008], [0.0565, -0.0205], [0.0465, -0.0285], [0.033, -0.03],
  [0.0205, -0.0252], [0.0122, -0.0155], [0.0088, -0.004], [0.0086, 0.0065],
];
const WIRE = 0.0011; // m, how thick the frame's wire is

function aviators(head) {
  const curve = new THREE.CatmullRomCurve3(LENS_OUTLINE.map(([u, v]) => new THREE.Vector3(u, v, 0)), true);
  const pts = curve.getSpacedPoints(80).slice(0, -1);
  // out from the lens by the wire's thickness, along each point's normal in
  // the outline (it goes round clockwise, so out is to the left of the way)
  const out = pts.map((p, i) => {
    const a = pts[(i + pts.length - 1) % pts.length];
    const b = pts[(i + 1) % pts.length];
    const t = new THREE.Vector2(b.x - a.x, b.y - a.y).normalize();
    return new THREE.Vector2(p.x - t.y * WIRE * 1.6, p.y + t.x * WIRE * 1.6);
  });
  const inner = pts.map((p) => new THREE.Vector2(p.x, p.y));
  const rim = new THREE.Shape(out);
  rim.holes.push(new THREE.Path(inner));
  const frameFlat = new THREE.ExtrudeGeometry(rim, { depth: WIRE * 1.2, bevelEnabled: false, curveSegments: 4 });
  frameFlat.translate(0, 0, -WIRE * 0.6);
  // the brow bar across to the middle, and the bridge arched over the nose
  const wire = (points) => {
    const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(([u, v, z]) => new THREE.Vector3(u, v, z))), 12, WIRE * 0.6, 5).toNonIndexed();
    g.deleteAttribute('uv');
    return g;
  };
  frameFlat.deleteAttribute('uv');
  const frame = mergeGeometries([
    frameFlat,
    wire([[0, 0.0178, 0.0004], [0.012, 0.0172, 0.0002], [0.024, 0.0163, 0]]),
    wire([[0, 0.0078, 0.0012], [0.0045, 0.0076, 0.0008], [0.0092, 0.0045, 0]]),
  ]);
  const lens = new THREE.ShapeGeometry(new THREE.Shape(inner.map((p) => p.clone())), 6);
  lens.translate(0, 0, -WIRE * 0.2);
  buildGlasses(head, {
    ...GLASSES, frame, lens,
    hinge: [0.0632, 0.0085], arm: [0.0018, 0.0022],
    frameMat: M(GOLD, 0.3, { metalness: 0.3 }),
    lensMat: lensMaterial({ color: 0x3a3090, tint: [0.7, 0.62, 1.0], mirror: 0.5 }),
  });
}

// A tube along `curve`, `radius(t)` across at t (0 at its start, 1 at its
// end), squashed to `flat` of that one way (along the curve's binormal),
// coloured `colour(t, round)` if given. Closed at the start, ending in a point.
function taperedTube(curve, radius, { along = 24, round = 8, flat = 1, colour } = {}) {
  const frames = curve.computeFrenetFrames(along, false);
  const pos = [];
  const col = [];
  const index = [];
  for (let i = 0; i <= along; i++) {
    const t = i / along;
    const c = curve.getPointAt(t);
    const r = radius(t);
    for (let j = 0; j <= round; j++) {
      const a = (j / round) * Math.PI * 2;
      const n = frames.normals[i];
      const b = frames.binormals[i];
      pos.push(
        c.x + r * (Math.cos(a) * n.x + flat * Math.sin(a) * b.x),
        c.y + r * (Math.cos(a) * n.y + flat * Math.sin(a) * b.y),
        c.z + r * (Math.cos(a) * n.z + flat * Math.sin(a) * b.z),
      );
      if (colour) col.push(...colour(t, j / round));
      if (i && j) {
        const p = i * (round + 1) + j;
        const q = p - (round + 1);
        index.push(q - 1, p - 1, p, q - 1, p, q);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  if (colour) g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

// The ponytail, hanging down its own -y from where it's gathered, arching
// out and back (-z) on the way: a core and locks of hair round it, a tie
// at the top. -> its geometry, in that frame.
function ponytail() {
  const L = PONY_LENGTH;
  const spine = new THREE.CatmullRomCurve3([
    [0, 0.004, 0.008], [0, -0.012, -0.008], [0, -0.05, -0.016], [0, -0.44 * L, -0.017],
    [0, -0.68 * L, -0.013], [0, -0.86 * L, -0.008], [0, -L, -0.004],
  ].map(([x, y, z]) => new THREE.Vector3(x, y, z)));
  // how thick it is at t of the way down: gathered at the tie, full below
  // it, thinning to the ends
  const thick = (t) => lerp(0.0105, 0.017, smoothstep(0.02, 0.2, t)) * (1 - 0.8 * smoothstep(0.45, 1, t));
  const hair = new THREE.Color(HAIR);
  const ends = new THREE.Color(HAIR_ENDS);
  const c = new THREE.Color();
  const pieces = [];
  pieces.push(taperedTube(spine, (t) => thick(t) * 0.78, { along: 28, round: 10, flat: 0.8, colour: () => hair.toArray([]) }));
  let seed = 4;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const LOCKS = 30;
  const n = new THREE.Vector3();
  const b = new THREE.Vector3();
  for (let k = 0; k < LOCKS; k++) {
    const a = (k / LOCKS) * Math.PI * 2 + rnd() * 0.3;
    const out = 0.55 + 0.45 * rnd();
    const reach = 0.84 + 0.16 * rnd();
    const wave = (rnd() - 0.5) * 0.006;
    const tone = 0.82 + 0.38 * rnd();
    const pts = [];
    for (let i = 0; i <= 10; i++) {
      const t = (i / 10) * reach;
      const p = spine.getPointAt(t);
      const tangent = spine.getTangentAt(t);
      n.set(1, 0, 0);
      b.crossVectors(tangent, n).normalize();
      // spread round the core, drawn in at the tie and gathered at the ends
      const r = thick(t) * out * (1 - 0.35 * smoothstep(0.6, 1, t / reach));
      p.addScaledVector(n, Math.cos(a) * r + wave * Math.sin(9 * t)).addScaledVector(b, Math.sin(a) * r * 0.8);
      pts.push(p);
    }
    const lock = new THREE.CatmullRomCurve3(pts);
    pieces.push(taperedTube(lock, (t) => lerp(0.0062, 0.0009, smoothstep(0.25, 1, t)) * (0.8 + 0.4 * smoothstep(0, 0.08, t)), {
      along: 20, round: 5, flat: 0.6,
      colour: (t, u) => c.copy(hair).lerp(ends, 0.5 * smoothstep(0.55, 1, t)).multiplyScalar(tone * (0.9 + 0.2 * Math.sin(u * Math.PI * 2))).toArray([]),
    }));
  }
  return mergeGeometries(pieces);
}

// Her face, hair, earrings, aviators, cap and ponytail, on the head bone.
// -> { brow, crown, pony } (as Character.dress asks, and the ponytail's pivot)
function herHead(head, skin) {
  buildHead(head, skin, LOOK);

  // small pearl studs in her ear lobes
  const E = LOOK.ear;
  const pearl = M(PEARL, 0.22);
  for (const sx of [-1, 1]) {
    piece(head, new THREE.SphereGeometry(0.0027, 10, 8), pearl, sx * (E.x + 0.0035), E.y - E.h * 0.74, E.z + 0.004);
  }

  aviators(head);

  const { hat, at } = buildCap(head, CAP_SPEC);
  // Where something strapped round the cap sits (a headlamp): the middle of
  // the front panel, facing out of it.
  const ph = 0.6;
  const brow = new THREE.Group();
  at(0, 1, ph, brow.position);
  at(0, 1, ph + 0.01, _q).sub(brow.position);
  brow.rotation.x = -Math.atan2(-_q.z, _q.y);
  brow.translateZ(0.0012);
  hat.add(brow);

  // The ponytail through the back of the cap, with its tie.
  const pony = group(hat, PONY_ROOT.x, PONY_ROOT.y, PONY_ROOT.z);
  pony.name = 'ponytail';
  const hairMat = M(0xffffff, 0.55, { vertexColors: true });
  piece(pony, ponytail(), hairMat);
  // the hair gathered up into it, filling the cap's opening
  const gathered = piece(hat, new THREE.SphereGeometry(0.018, 14, 10), M(HAIR, 0.55), PONY_ROOT.x, PONY_ROOT.y + 0.002, PONY_ROOT.z - 0.008);
  gathered.scale.set(1.3, 1.0, 0.55);
  const tie = piece(pony, new THREE.TorusGeometry(0.0098, 0.003, 6, 16), M(0x151517, 0.5), 0, -0.008, -0.004);
  tie.rotation.x = Math.PI / 2 - 0.25;
  return { brow, crown: { rx: CAP_SPEC.rx, rz: CAP_SPEC.rz, z: CAP_SPEC.z, y: at(1, 0, ph, new THREE.Vector3()).y }, pony };
}

// ── The ponytail swinging ───────────────────────────────────────────────────
// Its end is a weight on a string from where it's gathered: it falls, it's
// dragged along as she goes and bobs as she steps, and its own spring
// draws it back to how it hangs, down and back over her pack, whichever way
// she's leaning. It's kept from swinging forward into her neck, or up.
const PONY_HANG = new THREE.Vector3(0, -0.97, -0.24).normalize(); // how it hangs, in the chest's frame
const PONY_SPRING = 120; // 1/s², how stiffly it's drawn back to that
const PONY_DAMP = 4; // 1/s, how soon a swing dies
const PONY_BACK = -0.12; // how far forward it comes: its end stays this far back of straight down at least (of its length, in the chest's frame; -z is back)
const PONY_UP = 0.35; // ...and no higher than this (of its length, up)
const GRAVITY = new THREE.Vector3(0, -9.81, 0);
const DOWN = new THREE.Vector3(0, -1, 0);
const _root = new THREE.Vector3();
const _rest = new THREE.Vector3();
const _was = new THREE.Vector3();
const _rootV = new THREE.Vector3();
const _scale = new THREE.Vector3();
const _chest = new THREE.Quaternion();
const _toChest = new THREE.Quaternion();
const _toHat = new THREE.Quaternion();

function swinging(pony, chest) {
  const tip = new THREE.Vector3(); // where its end is, in the world
  const vel = new THREE.Vector3(); // ...and how fast it goes
  const last = new THREE.Vector3(); // where it was gathered, last frame
  let fresh = true;
  return (dt) => {
    if (dt <= 0) return;
    const hat = pony.parent;
    hat.updateWorldMatrix(true, false); // and the chest, which it's on
    hat.matrixWorld.decompose(_p, _toHat, _scale);
    _toHat.invert(); // the world into the cap's frame
    chest.matrixWorld.decompose(_p, _chest, _scale);
    _toChest.copy(_chest).invert(); // ...and into the chest's
    _root.copy(pony.position).applyMatrix4(hat.matrixWorld);
    const len = PONY_LENGTH * _scale.x;
    _rest.copy(PONY_HANG).applyQuaternion(_chest).multiplyScalar(len).add(_root);
    // put back as it hangs the first time, and after a jump across the world
    if (fresh || _root.distanceToSquared(last) > 1) {
      tip.copy(_rest);
      vel.set(0, 0, 0);
      _rootV.set(0, 0, 0);
      fresh = false;
    } else {
      _rootV.subVectors(_root, last).divideScalar(dt);
    }
    last.copy(_root);
    // fall, spring back, and slow against the way she's going
    vel.addScaledVector(GRAVITY, dt).addScaledVector(_q.subVectors(_rest, tip), PONY_SPRING * dt);
    vel.sub(_rootV).multiplyScalar(Math.exp(-PONY_DAMP * dt)).add(_rootV);
    _was.copy(tip);
    tip.addScaledVector(vel, dt);
    // on its string, kept back off her neck, and not up
    _p.subVectors(tip, _root).applyQuaternion(_toChest);
    if (_p.lengthSq() < 1e-12) _p.copy(PONY_HANG);
    _p.normalize();
    _p.z = Math.min(_p.z, PONY_BACK);
    _p.y = Math.min(_p.y, PONY_UP);
    _p.normalize().applyQuaternion(_chest); // back into the world
    tip.copy(_p).multiplyScalar(len).add(_root);
    vel.subVectors(tip, _was).divideScalar(dt);
    // turn it to hang that way, in the cap's frame
    pony.quaternion.setFromUnitVectors(DOWN, _p.applyQuaternion(_toHat));
  };
}

// ── Her body (the chest's frame) ────────────────────────────────────────────
// Hem to neck, as tailored() takes them: her waist in, her hips and bust
// out, her shoulders narrower than the grown-up's jacket.
const TORSO = [
  [-0.075, 0.186, 0.116, -0.006], [-0.04, 0.176, 0.112, -0.005],
  [0.02, 0.16, 0.104, -0.002], [0.09, 0.136, 0.097, 0.003],
  [0.15, 0.135, 0.098, 0.007], [0.21, 0.145, 0.104, 0.011],
  [0.26, 0.156, 0.11, 0.014], [0.31, 0.165, 0.113, 0.014],
  [0.36, 0.172, 0.111, 0.01], [0.4, 0.177, 0.104, 0.004],
  [0.432, 0.171, 0.094, -0.002], [0.46, 0.146, 0.083, -0.006],
  [0.482, 0.108, 0.07, -0.01], [0.497, 0.074, 0.06, -0.012], [0.508, 0.056, 0.052, -0.012],
];
const TORSO_SQUARE = 0.9;
// Her bust, standing out of the front of her chest (m), at height y, across
// her (-1..1 round the front) and how far round to the front (front: 1).
const bust = (y, across, front) => 0.017 * Math.exp(-(((y - 0.305) / 0.055) ** 2)) * Math.exp(-(((Math.abs(across) - 0.42) / 0.3) ** 2)) * smoothstep(0.2, 0.75, front);

// The tank top: it stands this far off her skin, and where it isn't, it's
// tucked this far under it. Its straps are over her shoulders this far out
// from the middle; at the front its neckline scoops down to NECK_FRONT
// between them, at the back to NECK_BACK; under her arms it comes up to
// ARMHOLE.
const TANK_OFF = 0.0028;
const TANK_TUCK = -0.005;
const STRAPS = [0.088, 0.126];
const NECK_FRONT = 0.372;
const NECK_BACK = 0.395;
const ARMHOLE = 0.3;
// How far inside the tank top (x, y) is, on the front or the back (m;
// negative outside it): under the neckline between the straps, under the
// armhole outside them, and the straps themselves over her shoulders.
function inTank(x, y, front) {
  const ax = Math.abs(x);
  const u = Math.min(1, ax / STRAPS[0]);
  const neck = front > 0 ? lerp(NECK_FRONT, 0.452, u ** 2.2) : lerp(NECK_BACK, 0.455, u ** 3);
  const arm = lerp(ARMHOLE, 0.43, smoothstep(0.172, STRAPS[1], ax));
  const edge = ax < STRAPS[0] ? neck : ax > STRAPS[1] ? arm : 1;
  const strap = Math.min(ax - STRAPS[0], STRAPS[1] - ax);
  return Math.max(strap, edge - y);
}

// The same rows with more between them from `from` up, `step` apart: where
// her shoulders turn over to her neck, so an edge across them runs smooth.
function finer(rows, from, step) {
  const out = [];
  for (let i = 0; i < rows.length; i++) {
    out.push(rows[i]);
    const next = rows[i + 1];
    if (!next || next[0] <= from) continue;
    for (let y = Math.max(from, rows[i][0]) + step; y < next[0] - step / 2; y += step) {
      const t = (y - rows[i][0]) / (next[0] - rows[i][0]);
      out.push(Array.from({ length: 5 }, (_, k) => lerp(rows[i][k] ?? 0, next[k] ?? 0, t)));
    }
  }
  return out;
}

// A row of rows at height y: [half width, half depth, centre z].
function rowAt(rows, y) {
  for (let i = 1; i < rows.length; i++) {
    if (y <= rows[i][0] || i === rows.length - 1) {
      const a = rows[i - 1];
      const b = rows[i];
      const t = clamp((y - a[0]) / (b[0] - a[0]), 0, 1);
      return [lerp(a[1], b[1], t), lerp(a[2], b[2], t), lerp(a[3] ?? 0, b[3] ?? 0, t)];
    }
  }
  return rows[0].slice(1, 4);
}

// The point on her (or the tank top's) front, or back, at height y and x
// across, `off` out from it -> out.
function onTorso(y, x, side, off, out = new THREE.Vector3()) {
  const [w, d, zc] = rowAt(TORSO, y);
  const a = Math.min(1, Math.pow(Math.min(1, Math.abs(x) / w), 1 / TORSO_SQUARE));
  const f = Math.sqrt(1 - a * a);
  const across = Math.sign(x) * a;
  const depth = d + (side > 0 ? bust(y, across, f) : 0) + off;
  return out.set(x, y, zc + side * depth * Math.pow(f, TORSO_SQUARE));
}

// ── Her arms (the shoulder's frame: the elbow at -0.28) ─────────────────────
// Bare, slim, wrist to shoulder.
const ARM = [
  [-0.515, 0.025, 0.021], [-0.49, 0.026, 0.022], [-0.45, 0.029, 0.025],
  [-0.4, 0.034, 0.029, 0.002], [-0.35, 0.037, 0.032, 0.003], [-0.31, 0.036, 0.032, 0.001],
  [-0.28, 0.033, 0.032, -0.004], [-0.255, 0.034, 0.033, -0.003], [-0.2, 0.037, 0.036],
  [-0.13, 0.04, 0.039], [-0.06, 0.043, 0.042], [-0.01, 0.047, 0.045],
  [0.025, 0.046, 0.044], [0.05, 0.034, 0.034], [0.062, 0.013, 0.015],
];

// ── Her legs (the hip's frame: the knee at -0.42, the ankle at -0.85) ───────
// Leggings, close all the way down, into her socks.
const LEGGINGS_ROWS = [
  [-0.775, 0.036, 0.04], [-0.74, 0.038, 0.042], [-0.68, 0.043, 0.049, -0.004],
  [-0.6, 0.049, 0.057, -0.009], [-0.53, 0.049, 0.056, -0.008], [-0.47, 0.045, 0.05, -0.002],
  [-0.42, 0.046, 0.05, 0.004], [-0.37, 0.05, 0.054, 0.004], [-0.3, 0.058, 0.064, 0.002],
  [-0.2, 0.068, 0.075], [-0.1, 0.08, 0.086, -0.004], [-0.02, 0.092, 0.098, -0.008],
  [0.025, 0.098, 0.104, -0.008], [0.07, 0.09, 0.098, -0.004], [0.12, 0.08, 0.092],
];
// Her socks, in the knee's frame (the ankle at -0.43): up out of her boots,
// over the leggings, the cuff turned at the top.
const SOCK_ROWS = [
  [-0.41, 0.038, 0.043], [-0.37, 0.039, 0.044], [-0.32, 0.042, 0.047, -0.002],
  [-0.296, 0.045, 0.05, -0.003], [-0.272, 0.0465, 0.0515, -0.003], [-0.262, 0.0455, 0.0505, -0.003],
];
const CUFF = -0.296;

// ── Her pack (its own frame, against her back: +z towards her) ──────────────
// A packable daypack, not much in it: soft and rounded, with a pocket low on
// its face. Bottom to top, as tailored() takes them.
const PACK_Y = 0.25; // its middle, up the chest
const PACK_ROWS = [
  [-0.19, 0.098, 0.04, -0.052], [-0.178, 0.122, 0.056, -0.058], [-0.14, 0.133, 0.065, -0.064],
  [-0.04, 0.136, 0.066, -0.066], [0.06, 0.132, 0.063, -0.064], [0.12, 0.124, 0.058, -0.06],
  [0.158, 0.11, 0.051, -0.055], [0.18, 0.084, 0.042, -0.049], [0.193, 0.045, 0.03, -0.044], [0.198, 0.012, 0.014, -0.04],
];
const PACK_DEPTH = 0.13; // from her back to its face

// ── Her jacket, tied round her waist (the hips' frame) ──────────────────────
// The back of it hangs over her seat and the backs of her thighs, round to
// her hips either side; its sleeves come round the front and are knotted,
// their ends hanging.
const TIE_Y = 0.065; // where it's tied
const SKIRT_ROUND = 1.72; // radians either side of the middle of her back it comes round
const SKIRT_LONG = [0.33, 0.22]; // how far it hangs at the back, and at her hips
const SKIRT_TOP = [0.182, 0.124, -0.01]; // half width, half depth and middle at the tie
const SKIRT_HEM = [0.206, 0.138, -0.01]; // ...and at the hem
const SKIRT_CHANNEL = 0.068; // between its lines of stitching
const SKIRT_LOFT = 0.009;
const SKIRT_LEGS = 0.6; // how much the bottom of it goes with the thigh behind it

// How full a channel of down is at d along it: 0 at the stitching, 1 between.
function channel(d, apart) {
  const f = (((d / apart) % 1) + 1) % 1;
  return Math.sqrt(Math.sin(Math.PI * f));
}

// The back of the jacket, hanging from the tie: a sheet round her, from one
// hip round the back to the other, skinned to the hips and her thighs.
function skirt(body, mat) {
  const ROUND = 40; // sections round her
  const ROWS = 14; // ...and down
  const pos = [];
  const col = [];
  const index = [];
  const weights = [];
  const bones = [];
  const v = new THREE.Vector3();
  for (let j = 0; j <= ROWS; j++) {
    const s = j / ROWS;
    for (let i = 0; i <= ROUND; i++) {
      const u = (i / ROUND) * 2 - 1; // -1 at her right hip, 1 at her left
      const phi = u * SKIRT_ROUND;
      const long = lerp(SKIRT_LONG[0], SKIRT_LONG[1], smoothstep(0.5, SKIRT_ROUND, Math.abs(phi)));
      const y = TIE_Y - s * long;
      const k = smoothstep(0, 1, s);
      const w = lerp(SKIRT_TOP[0], SKIRT_HEM[0], k);
      const d = lerp(SKIRT_TOP[1], SKIRT_HEM[1], k);
      const zc = lerp(SKIRT_TOP[2], SKIRT_HEM[2], k);
      // puffed out between the stitching, flat at the top where it's drawn in
      const loft = SKIRT_LOFT * (channel(s * long + 0.02, SKIRT_CHANNEL) - 1) * smoothstep(0, 0.12, s);
      v.set(Math.sin(phi) * (w + loft), y, zc - Math.cos(phi) * (d + loft));
      pos.push(v.x, v.y, v.z);
      const tone = 0.78 + 0.22 * channel(s * long + 0.02, SKIRT_CHANNEL);
      col.push(tone, tone, tone);
      // the lower down, the more it goes with the thigh behind it
      const legs = SKIRT_LEGS * smoothstep(0.05, 1, s);
      const left = smoothstep(-0.08, 0.08, v.x);
      weights.push(1 - legs, legs * left, legs * (1 - left), 0);
      bones.push(0, 1, 2, 0);
      if (i && j) {
        const a = j * (ROUND + 1) + i;
        const b = a - (ROUND + 1);
        index.push(b - 1, a - 1, a, b - 1, a, b);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(bones, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
  g.setIndex(index);
  g.computeVertexNormals();
  const mesh = new THREE.SkinnedMesh(g, mat);
  mesh.castShadow = true;
  body.hips.add(mesh);
  body.hips.updateWorldMatrix(true, true);
  mesh.bind(new THREE.Skeleton([body.hips, body.legL.hip, body.legR.hip]));
  mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, -0.1, 0), 0.6);
  return mesh;
}

// Its sleeves, round the front of her waist from either side of the back,
// knotted in the middle, the ends hanging down from the knot.
function tiedSleeves(hips, mat) {
  const puffy = (len) => (t, u) => {
    const tone = 0.8 + 0.2 * channel(t * len, 0.07);
    return [tone, tone, tone];
  };
  for (const sx of [1, -1]) {
    // (from inside the back of it, where its shoulder is)
    const round = new THREE.CatmullRomCurve3([
      [sx * 0.135, TIE_Y + 0.006, -0.05], [sx * 0.178, TIE_Y + 0.002, 0.0], [sx * 0.153, TIE_Y - 0.012, 0.072],
      [sx * 0.093, TIE_Y - 0.03, 0.112], [sx * 0.03, TIE_Y - 0.042, 0.13],
    ].map(([x, y, z]) => new THREE.Vector3(x, y, z)));
    piece(hips, taperedTube(round, (t) => 0.024 - 0.003 * t, { along: 20, round: 10, flat: 0.8, colour: puffy(0.32) }), mat);
    // its end, out of the knot and hanging, crossed over to the other side
    const end = new THREE.CatmullRomCurve3([
      [sx * 0.012, TIE_Y - 0.045, 0.14], [-sx * 0.008, TIE_Y - 0.075, 0.146],
      [-sx * 0.02, TIE_Y - 0.12, 0.144], [-sx * 0.026, TIE_Y - 0.165, 0.138],
    ].map(([x, y, z]) => new THREE.Vector3(x, y, z)));
    const cuff = taperedTube(end, (t) => lerp(0.025, 0.022, t) * (t > 0.9 ? 0.85 : 1), { along: 14, round: 10, flat: 0.75, colour: puffy(0.13) });
    piece(hips, cuff, mat);
  }
  const knot = piece(hips, new THREE.SphereGeometry(0.027, 14, 10), mat, 0, TIE_Y - 0.044, 0.136);
  knot.scale.set(1.35, 0.85, 0.75);
}

export const LAUREN = {
  id: 'lauren',
  name: 'Lauren',
  size: SIZE,
  dress(body) {
    const skin = M(SKIN, 0.62);

    // ── Head and neck ──
    piece(body.neck, new THREE.CylinderGeometry(0.046, 0.055, 0.13, 16), skin, 0, 0.052);
    const { brow, crown, pony } = herHead(body.head, skin);

    // ── Her and her tank top ──
    piece(body.chest, tailored(TORSO, { segments: 64, squareness: TORSO_SQUARE, crease: (y, across, front) => bust(y, across, front) }), skin);
    const tank = tailored(finer(TORSO, 0.36, 0.004), {
      segments: 112,
      squareness: TORSO_SQUARE,
      crease: (y, across, front) => {
        const [w] = rowAt(TORSO, y);
        const x = w * Math.sign(across) * Math.pow(Math.abs(across), TORSO_SQUARE);
        // (eased in over more than the cloth's cut, so the edge runs smooth)
        return bust(y, across, front) + lerp(TANK_TUCK, TANK_OFF, clamp(inTank(x, y, front) / 0.024 + 0.5, 0, 1));
      },
      // ribbed, and a little darker at the hem
      surface: (x, y) => {
        const tone = y < -0.06 ? 0.86 : 1;
        return [tone, tone, tone];
      },
    });
    piece(body.chest, tank, M(TANK, 0.82, { vertexColors: true, ...textile('canvas') }));

    // a fine gold chain, round the base of her neck and down to a little
    // pendant over her breastbone
    {
      const chain = [];
      for (let i = 0; i < 32; i++) {
        const a = (i / 32) * Math.PI * 2; // from the back, round by her left
        const front = -Math.cos(a);
        const t = smoothstep(0.1, 1, front);
        // round the base of her neck behind, lying on her chest in front
        _q.set(Math.sin(a) * 0.059, 0.497, -0.012 - Math.cos(a) * 0.056);
        onTorso(lerp(0.488, 0.413, t ** 1.3), Math.sin(a) * 0.066, 1, 0.0012, _p);
        _p.lerp(_q, 1 - smoothstep(0.05, 0.55, front));
        chain.push([_p.x, _p.y, _p.z]);
      }
      chain.push(chain[0]);
      cord(body.chest, M(GOLD, 0.3, { metalness: 0.3 }), 0.0007, chain);
      onTorso(0.411, 0, 1, 0.0022, _p);
      piece(body.chest, new THREE.SphereGeometry(0.0026, 8, 6), M(GOLD, 0.28, { metalness: 0.3 }), _p.x, _p.y, _p.z);
    }

    // ── Arms ──
    for (const [A, side] of [[body.armL, 1], [body.armR, -1]]) {
      limb(A.shoulder, A.elbow, sleeve(side, undefined, { rows: ARM, crease: () => 0 }), skin, 0.055, -0.035);
      const hand = handShape(side);
      hand.scale(0.88, 0.94, 0.9);
      piece(A.elbow, hand, skin, 0, -0.229);
    }

    // ── Legs ──
    const sock = M(0xffffff, 0.97, { vertexColors: true, ...textile('canvas') });
    const boot = M(0xffffff, 0.75, { vertexColors: true, ...textile('canvas') });
    const sole = M(0xffffff, 0.9, { vertexColors: true });
    for (const L of [body.legL, body.legR]) {
      limb(L.hip, L.knee, trouserLeg(L.side, (x, y) => {
        const band = y > 0.085 ? 0.8 : 1; // the waistband
        return [band, band, band];
      }, 0.095, LEGGINGS_ROWS), M(LEGGINGS, 0.7, { vertexColors: true, ...textile('twill') }), 0.087, -0.18);
      // the socks go with her shins, and with her feet low down
      limb(L.knee, L.ankle, tailored(SOCK_ROWS, { segments: 20, surface: (x, y) => rgb(SOCK).map((c) => c * (y > CUFF ? 0.85 : 1)) }), sock, 0.03, 0);
      // charcoal suede with lighter mesh panels, mint round the heel and the
      // collar, a dark rubber toe; a pale midsole over a dark tread
      piece(L.ankle, bootUpper((x, y, front) => {
        if (y > 0.094) return rgb(MINT);
        if (front < -0.85 && y > 0.02) return rgb(MINT);
        if (front > 0.72 && y < -0.022) return rgb(TOE);
        if (y > -0.03 && y < 0.07 && Math.abs(front) < 0.6) return rgb(BOOT_MESH);
        return rgb(BOOT);
      }), boot);
      piece(L.ankle, outsole((x, y) => rgb(y > -0.05 ? MIDSOLE : TREAD)), sole);
      cord(L.ankle, M(LACE, 0.8), 0.0028, [[-0.031, -0.006, 0.112], [0.03, 0.008, 0.094],
        [-0.029, 0.023, 0.082], [0.028, 0.038, 0.067], [-0.028, 0.05, 0.059], [0.026, 0.066, 0.056]]);
    }

    // ── Her jacket, tied round her waist ──
    const down = M(PUFFER, 0.42, { vertexColors: true, side: THREE.DoubleSide, ...textile('ripstop') });
    skirt(body, down);
    tiedSleeves(body.hips, down);

    // ── Her pack ──
    const [, bd, bz] = rowAt(TORSO, PACK_Y);
    const bp = group(body.chest, 0, PACK_Y, bz - bd - 0.006);
    const packMat = M(PACK, 0.72, textile('ripstop'));
    piece(bp, tailored(PACK_ROWS, { segments: 36, squareness: 0.8 }), packMat);
    // the pocket low on its face, zipped across the top
    piece(bp, tailored([[-0.172, 0.096, 0.016, -0.118], [-0.155, 0.108, 0.024, -0.122],
      [-0.075, 0.11, 0.025, -0.123], [-0.052, 0.1, 0.018, -0.12]], { segments: 28, squareness: 0.82 }), packMat);
    const trim = M(PACK_TRIM, 0.6);
    cord(bp, trim, 0.0022, [[-0.085, -0.06, -0.141], [-0.03, -0.057, -0.146], [0.03, -0.057, -0.146], [0.085, -0.06, -0.141]]);
    piece(bp, new THREE.BoxGeometry(0.008, 0.022, 0.003), trim, 0.07, -0.072, -0.147);
    // the main zip, up one side, over the top and down the other
    {
      const zip = [];
      for (let i = 0; i <= 16; i++) {
        const a = (i / 16) * Math.PI; // from low on her left, over the top, to low on her right
        const y = lerp(-0.12, 0.199, Math.sin(a));
        const [w, , z] = rowAt(PACK_ROWS, y);
        zip.push([Math.cos(a) * Math.max(w, 0.02), y, z]);
      }
      cord(bp, trim, 0.0024, zip);
    }
    // a loop to hang it by
    cord(bp, M(STRAP, 0.9), 0.003, [[-0.012, 0.192, -0.02], [-0.008, 0.212, -0.024], [0.008, 0.212, -0.024], [0.012, 0.192, -0.02]]);
    // The shoulder straps, from the top of the pack over her shoulders,
    // down the front past her bust and round under her arms to its foot.
    for (const sx of [-1, 1]) {
      const at = (y, x, side, off) => onTorso(y, sx * x, side, off, new THREE.Vector3()).toArray();
      // her side, round from the front (1) to the back (-1)
      const side = (y, f, off) => {
        const [w, d, zc] = rowAt(TORSO, y);
        return [sx * (w + off) * Math.sqrt(1 - f * f), y, zc + (d + off) * f];
      };
      const strap = cord(body.chest, M(STRAP, 0.9, textile('canvas')), 0.0075, [
        [sx * 0.074, PACK_Y + 0.16, bz - bd - 0.035],
        at(0.452, 0.098, -1, 0.009),
        [sx * 0.104, 0.481, -0.018],
        at(0.452, 0.11, 1, 0.008),
        at(0.4, 0.12, 1, 0.008),
        at(0.33, 0.132, 1, 0.008),
        at(0.25, 0.144, 1, 0.008),
        side(0.19, 0.25, 0.008),
        side(0.14, -0.1, 0.008),
        [sx * 0.12, PACK_Y - 0.17, bz - bd - 0.04],
      ]);
      // flattened into a strap: wide across, thin through
      const g = strap.geometry;
      const pos = g.attributes.position;
      const path = g.parameters.path;
      const segs = g.parameters.tubularSegments;
      const frames = path.computeFrenetFrames(segs, false);
      for (let ring = 0; ring <= segs; ring++) {
        const c = path.getPointAt(ring / segs);
        // across the strap is across her body where it lies against her
        const n = _q.copy(c).sub(_p.set(0, c.y, 0)).normalize(); // out from her middle
        const t = frames.tangents[ring];
        const across = _p.crossVectors(t, n).normalize();
        for (let k = 0; k <= 6; k++) {
          const i = ring * 7 + k;
          const off = new THREE.Vector3(pos.getX(i) - c.x, pos.getY(i) - c.y, pos.getZ(i) - c.z);
          const a = off.dot(across);
          const b = off.dot(n);
          off.copy(across).multiplyScalar(a * 2.6).addScaledVector(n, b * 0.55);
          pos.setXYZ(i, c.x + off.x, c.y + off.y, c.z + off.z);
        }
      }
      g.computeVertexNormals();
    }
    // The hydration hose: out of the top of the pack, over her right
    // shoulder, down and across her chest in a loop, clipped to her left strap.
    cord(body.chest, M(HOSE, 0.3), 0.0052, [
      [-0.05, PACK_Y + 0.17, bz - bd - 0.04],
      onTorso(0.455, -0.103, -1, 0.02).toArray(),
      [-0.112, 0.492, -0.012],
      onTorso(0.45, -0.118, 1, 0.02).toArray(),
      onTorso(0.41, -0.1, 1, 0.014).toArray(),
      onTorso(0.384, -0.05, 1, 0.009).toArray(),
      onTorso(0.378, 0, 1, 0.008).toArray(),
      onTorso(0.386, 0.06, 1, 0.01).toArray(),
      onTorso(0.402, 0.104, 1, 0.018).toArray(),
      onTorso(0.39, 0.122, 1, 0.022).toArray(),
    ]);

    // What's worn on her back goes on her pack.
    const back = group(bp, 0, 0, -PACK_DEPTH);
    return { brow, crown, back, swing: swinging(pony, body.chest) };
  },
};
