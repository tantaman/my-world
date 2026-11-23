// Birds: a body, a head that pecks and looks about, a fanned tail, two legs
// that tuck up in flight, and wings in two joints (arm and hand) that beat,
// glide, and fold back along the body when the bird lands.
//
// Wings are thin two-layer slabs so the upper side and the underside can be
// different colours (a crow is black both ways; a hawk is pale beneath).

import * as THREE from 'three';
import { RigBuilder, lin, at, along, ellipsoid, stick, cone } from '../render/rig.js';
import { clamp, lerp } from '../noise.js';

// A flat wing panel along +x: chord c0 at the root, c1 at the tip, swept
// back by `sweep` at the tip. Top and bottom faces carry their own normals.
function panel(len, c0, c1, sweep, thick) {
  const g = new THREE.BoxGeometry(1, thick, 1, 3, 1, 1);
  g.translate(0.5, 0, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const z = p.getZ(i);
    const chord = c0 + (c1 - c0) * x;
    p.setXYZ(i, x * len, p.getY(i), (z - 0.15) * chord - sweep * x * x);
  }
  g.computeVertexNormals();
  return g;
}

// Plumage: { back, wing, wingUnder, head, breast, belly, tail, beak, legs,
//   cap?, cheek?, bib?, crest?, bar? (wing bar colour), eye? }
// A bird kept elsewhere (an eagle, src/mounts/) can be handed to buildBird
// as a spec of its own; `like` says whose shape it has (beak, tail, wings).
export const BIRDS = {
  robin: { len: 0.24, span: 0.36, plumage: { back: 0x4f4a44, wing: 0x45403b, wingUnder: 0x8a7a6a, head: 0x2a2725, breast: 0xc0602a, belly: 0xe2d6c8, tail: 0x2e2b28, beak: 0xd8a83a, legs: 0x5a4a3a } },
  jay: { len: 0.28, span: 0.4, plumage: { back: 0x5a7fb8, wing: 0x3f6ab8, wingUnder: 0xb8c0cc, head: 0x6688c0, breast: 0xd8dade, belly: 0xeeeeee, tail: 0x3a64b0, beak: 0x1a1a1a, legs: 0x2a2a2a, crest: 0x6a8ec4, bib: 0x1c1c22, bar: 0xf2f2f2 } },
  chickadee: { len: 0.13, span: 0.2, plumage: { back: 0x8a8a84, wing: 0x6e6e6a, wingUnder: 0xc8c4bc, head: 0x141414, breast: 0xece8de, belly: 0xd8c8a8, tail: 0x5e5e5a, beak: 0x1a1a1a, legs: 0x3a3a3a, cheek: 0xf4f4f0, bib: 0x141414 } },
  cardinal: { len: 0.22, span: 0.3, plumage: { back: 0xb0201c, wing: 0x981c18, wingUnder: 0xc04a40, head: 0xc8221c, breast: 0xd02a22, belly: 0xc83a30, tail: 0x8a1a16, beak: 0xe0602a, legs: 0x8a5a4a, crest: 0xc8221c, bib: 0x161010 } },
  goldfinch: { len: 0.12, span: 0.21, plumage: { back: 0xe8c418, wing: 0x1a1a1a, wingUnder: 0x8a8a7a, head: 0xf0cc18, breast: 0xf2d020, belly: 0xf2e090, tail: 0x1a1a1a, beak: 0xe0a070, legs: 0x8a6a5a, cap: 0x141414, bar: 0xf0f0e0 } },
  junco: { len: 0.15, span: 0.24, plumage: { back: 0x50545c, wing: 0x484c54, wingUnder: 0xa8a8a8, head: 0x44484e, breast: 0x4a4e56, belly: 0xf0f0ee, tail: 0x34363c, beak: 0xe8c8b0, legs: 0x9a7a6a } },
  sparrow: { len: 0.15, span: 0.23, plumage: { back: 0x8a6a48, wing: 0x7a5a3a, wingUnder: 0xc8b8a0, head: 0x7a6a5a, breast: 0xc8b8a0, belly: 0xe0d6c4, tail: 0x6a5038, beak: 0x6a5a4a, legs: 0xa88a6a, cap: 0x8a4a28, bar: 0xe8e0d0 } },
  crow: { len: 0.45, span: 0.9, plumage: { back: 0x16171c, wing: 0x14151a, wingUnder: 0x1c1d22, head: 0x16171c, breast: 0x18191e, belly: 0x1a1b20, tail: 0x131418, beak: 0x0e0e10, legs: 0x101012 } },
  hawk: { len: 0.52, span: 1.22, plumage: { back: 0x5a3f2a, wing: 0x5e432c, wingUnder: 0xe6dccb, head: 0x4a3424, breast: 0xece2d2, belly: 0xd8c8b0, tail: 0xb4542a, beak: 0x2a2a2e, legs: 0xd8b840, cheek: 0x6a4a32 } },
  owl: { len: 0.5, span: 1.2, plumage: { back: 0x6a5440, wing: 0x6e5844, wingUnder: 0xc8b494, head: 0x7a6248, breast: 0xb09a7a, belly: 0xc4b08e, tail: 0x5e4a38, beak: 0x2a2a2a, legs: 0xb8a888, eye: 0xe8b820, tufts: 0x4a3828, cheek: 0xc89a60 } },
};

export function buildBird(kind, seed, spec = BIRDS[kind]) {
  if (spec.like) kind = spec.like;
  const P = {};
  for (const k in spec.plumage) P[k] = lin(spec.plumage[k]);
  const r = new RigBuilder(seed);
  r.grain = 0.12;
  const L = spec.len; // beak to tail tip
  const half = spec.span / 2;
  const owl = kind === 'owl';
  const bodyR = L * (owl ? 0.2 : 0.16);
  const legH = L * (owl ? 0.12 : 0.14);
  const body = r.bone(null, 0, legH + bodyR * 0.9, 0, 'body');
  const head = r.bone(body, 0, bodyR * (owl ? 0.75 : 0.55), L * (owl ? 0.06 : 0.2), 'head');
  const tail = r.bone(body, 0, bodyR * 0.1, -L * 0.18, 'tail');
  const wing = [];
  const hand = [];
  const legs = [];
  for (const side of [1, -1]) {
    const w = r.bone(body, side * bodyR * 0.7, bodyR * 0.45, L * 0.06, side > 0 ? 'wingL' : 'wingR');
    const h = r.bone(w, side * half * 0.42, 0, 0, side > 0 ? 'handL' : 'handR');
    // droop (z), then roll the wing upright about its span (x), then sweep it
    // back (y): a folded wing lies flat against the bird's side
    w.rotation.order = 'YXZ';
    wing.push(w);
    hand.push(h);
    legs.push(r.bone(body, side * bodyR * 0.35, -bodyR * 0.7, 0, 'leg'));
  }

  // body: back colour above, breast in front, belly beneath
  r.part(body, ellipsoid(bodyR * 0.95, bodyR, L * (owl ? 0.24 : 0.24), 9, 7), {
    matrix: at(0, 0, owl ? 0 : L * 0.02, owl ? -0.5 : 0),
    color: (p, n, w) => {
      // a perched bird's folded wings are a patch on each flank
      if (Math.abs(n.x) > 0.55 && n.y > -0.25 && w.z < L * 0.1 && !owl) return P.bar && w.y > legH + bodyR * 1.05 ? P.bar : P.wing;
      if (n.y > 0.35) return P.back;
      if (n.z > 0.1 || owl) return n.y < -0.5 ? P.belly : P.breast;
      return P.belly;
    },
  });
  // head
  const hr = L * (owl ? 0.17 : 0.11);
  r.part(head, ellipsoid(hr * (owl ? 1.1 : 1), hr, hr * (owl ? 0.85 : 1.05), 9, 7), {
    color: (p, n) => {
      if (P.cap && n.y > 0.45) return P.cap;
      if (P.bib && n.y < -0.25 && n.z > 0.15) return P.bib;
      if (P.cheek && Math.abs(n.x) > 0.65 && n.y < 0.35) return P.cheek;
      return P.head;
    },
  });
  if (owl) {
    // a pale facial disc and big yellow eyes; ear tufts
    r.part(head, ellipsoid(hr * 0.9, hr * 0.8, hr * 0.2, 8, 5), { matrix: at(0, -hr * 0.05, hr * 0.68), color: P.cheek });
    r.mirror((side) => [head, ellipsoid(hr * 0.2, hr * 0.2, hr * 0.12, 6, 4), { matrix: at(side * hr * 0.36, hr * 0.12, hr * 0.85), color: P.eye, grain: 0 }]);
    r.mirror((side) => [head, cone(hr * 0.18, hr * 0.55, 4), { matrix: at(side * hr * 0.6, hr * 0.7, hr * 0.1, -0.2, 0, -side * 0.35), color: P.tufts }]);
  } else {
    r.mirror((side) => [head, ellipsoid(hr * 0.16, hr * 0.16, hr * 0.12, 5, 3), { matrix: at(side * hr * 0.72, hr * 0.15, hr * 0.5), color: lin(0x050505), grain: 0 }]);
  }
  if (P.crest) r.part(head, cone(hr * 0.45, hr * 1.1, 5), { matrix: at(0, hr * 0.6, -hr * 0.2, -0.75), color: P.crest });
  const beakLen = L * (kind === 'crow' ? 0.15 : kind === 'hawk' || owl ? 0.06 : kind === 'cardinal' || kind === 'goldfinch' ? 0.07 : 0.08);
  const beakR = kind === 'cardinal' || kind === 'goldfinch' || kind === 'junco' ? hr * 0.42 : hr * 0.3;
  const beak = cone(beakR, beakLen, 5);
  r.part(head, beak, { matrix: at(0, -hr * (owl ? 0.25 : 0.1), hr * (owl ? 0.75 : 0.85), Math.PI / 2 + (kind === 'hawk' || owl ? 0.5 : 0.08)), color: P.beak, grain: 0.05 });

  // tail: a flat fan
  const tl = L * (kind === 'hawk' ? 0.36 : owl ? 0.28 : 0.42);
  r.part(tail, panel(tl, L * 0.08, L * (kind === 'crow' || kind === 'hawk' ? 0.26 : 0.18), 0, L * 0.02), {
    matrix: at(0, 0, 0, 0, Math.PI / 2, 0),
    color: (p, n) => (n.y < -0.5 ? P.wingUnder.clone().lerp(P.tail, 0.5) : P.tail),
  });

  // wings: arm and hand panels, a white bar if the bird has one
  r.mirror((side) => {
    const i = side > 0 ? 0 : 1;
    const chord = L * (kind === 'hawk' || owl ? 0.5 : kind === 'crow' ? 0.42 : 0.38);
    const arm = panel(half * 0.44, chord, chord * 0.95, chord * 0.1, L * 0.025);
    r.part(wing[i], arm, {
      matrix: at(0, 0, 0, 0, 0, 0, side, 1, 1),
      color: (p, n) => (n.y < -0.5 ? P.wingUnder : P.bar && p.z < -0.1 * chord && p.z > -0.35 * chord ? P.bar : P.wing),
    });
    const tipChord = kind === 'hawk' || kind === 'crow' || owl ? chord * 0.6 : chord * 0.3;
    const handG = panel(half * 0.6, chord * 0.95, tipChord, chord * (kind === 'hawk' ? 0.05 : 0.35), L * 0.02);
    return [hand[i], handG, {
      matrix: at(0, 0, -chord * 0.1 * 0, 0, 0, 0, side, 1, 1),
      color: (p, n) => {
        if (n.y < -0.5) return kind === 'hawk' && p.x > half * 0.5 ? lin(0x2a2420) : P.wingUnder;
        return P.wing;
      },
    }];
  });
  // legs
  for (const lg of legs) {
    r.part(lg, stick(L * 0.012, L * 0.01, 3), { matrix: along(0, 0, 0, 0, -legH * 1.15, L * 0.02, 1, 1), color: P.legs, grain: 0 });
    r.part(lg, ellipsoid(L * 0.025, L * 0.006, L * 0.05, 4, 3), { matrix: at(0, -legH * 1.12, L * 0.04), color: P.legs, grain: 0 });
  }
  const mesh = r.build({ shadow: L > 0.3 });
  return { mesh, kind, body, head, tail, wing, hand, legs, len: L, span: spec.span, legH, bodyR, restY: body.position.y };
}

// Poses a bird. Inputs (set by the brain): flying, flap (0..1 effort), glide,
// bank, climb (vertical speed), hop (0..1 phase-driven), peck, lookYaw.
export class BirdAnim {
  constructor(rig) {
    this.rig = rig;
    this.flying = 0; // blends 0 (standing) → 1 (wings out)
    this.wantFly = false;
    this.flap = 1;
    this.flapRate = rig.len < 0.2 ? 18 : rig.len < 0.3 ? 12 : rig.len < 0.48 ? 5 : 3.2;
    this.bound = rig.len < 0.2; // finches flap-and-fold in flight
    this.phase = Math.random() * 6;
    this.time = Math.random() * 10;
    this.bank = 0;
    this.climb = 0;
    this.speed = 0;
    this.peck = 0;
    this.lookYaw = 0;
    this.hop = 0;
  }

  update(dt) {
    const g = this.rig;
    this.time += dt;
    this.flying = lerp(this.flying, this.wantFly ? 1 : 0, 1 - Math.exp(-dt * (this.wantFly ? 14 : 6)));
    const f = this.flying;
    // flap effort: hard on take-off and climbing, glide when descending
    let effort = clamp(this.flap, 0, 1);
    if (this.bound) {
      const cycle = (this.time * 1.6) % 1;
      if (cycle > 0.55 && this.climb < 1) effort *= 0.0;
    }
    this.phase += dt * this.flapRate * Math.PI * 2 * (0.7 + 0.3 * effort) * (effort > 0.02 ? 1 : 0);
    const s = Math.sin(this.phase);
    const amp = 0.95 * effort;
    const glideDihedral = g.kind === 'hawk' ? 0.12 : 0.05;
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? 1 : -1;
      const w = g.wing[i];
      const h = g.hand[i];
      // open: beat about the body axis; folded: swept back and tucked down
      const openZ = side * (glideDihedral + amp * s);
      const handZ = side * amp * 0.6 * Math.sin(this.phase - 0.8);
      // folded, the wing shrinks into the flank (painted on the body)
      w.scale.setScalar(0.12 + 0.88 * Math.min(1, f * 1.6));
      w.rotation.z = lerp(side * -0.15, openZ, f);
      w.rotation.x = lerp(-1.35, 0, f);
      w.rotation.y = lerp(side * 1.45, side * -0.05 * effort * Math.cos(this.phase), f);
      // the hand folds back over the arm
      h.rotation.z = lerp(0, handZ, f);
      h.rotation.y = lerp(side * 2.95, side * 0.1 * (1 - effort), f);
    }
    // body: level in flight, tipped by the climb, rolled into turns
    g.body.rotation.x = lerp(-0.08 - this.peck * 0.5, clamp(-this.climb * 0.12, -0.5, 0.5), f);
    g.body.rotation.z = this.bank * f;
    g.body.position.y = g.restY + Math.sin(this.phase) * -0.03 * g.len * effort * f + this.hop * g.len * 0.25;
    g.head.rotation.x = lerp(this.peck * 1.0, clamp(this.climb * 0.05, -0.3, 0.3), f);
    g.head.rotation.y = this.lookYaw * (1 - f);
    g.tail.rotation.x = lerp(0.25 + this.peck * 0.3, Math.sin(this.time * 2) * 0.05, f);
    for (const lg of g.legs) lg.rotation.x = lerp(this.hop * -0.4, 1.3, f);
  }
}
