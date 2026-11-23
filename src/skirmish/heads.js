// The fighters' heads. Nobody in Dry Wells shows their face: a Raider's is
// wound in a checked scarf, with dark glasses over what the scarf leaves; a
// Warden's is in a hood with goggles over it. What you can tell them by is
// what they wear, which is the point.
//
// A head is the hikers' size (player/head.js), placed from its middle at eye
// level, +z the way it looks, +y up. Its shape is a stack of sections
// (HEAD), the way the hikers' clothes are cut (player/clothing.js tailored):
// everything worn on it is that same shape stood a little way off it, so a
// lens, a strap or a helmet follows the head it is on.
//
//   raiderHead(head, look)   -> { brow, crown }
//   wardenHead(head, look)   -> { brow, crown }
//       as Character.dress asks: where something worn on the head goes, and
//       how big round the head is there
//   each also hangs a 'helmet' on the head (an object of that name, hidden:
//   whoever has bought one wears it) and, under it, what they wear without
//   ('hat')

import * as THREE from 'three';
import { tailored, foldAt, textile, material as M, piece, cord, group } from '../player/clothing.js';

// The head's sections, chin to crown: [height, half width, half depth, how
// far forward its middle is].
const HEAD = [
  [-0.118, 0.02, 0.022, 0.058],
  [-0.106, 0.036, 0.04, 0.046],
  [-0.088, 0.048, 0.056, 0.032],
  [-0.066, 0.057, 0.069, 0.019],
  [-0.04, 0.064, 0.08, 0.008],
  [-0.015, 0.069, 0.088, 0.001],
  [0.01, 0.073, 0.094, -0.004],
  [0.04, 0.075, 0.098, -0.008],
  [0.068, 0.073, 0.096, -0.01],
  [0.092, 0.064, 0.085, -0.01],
  [0.11, 0.047, 0.063, -0.01],
  [0.12, 0.024, 0.033, -0.01],
  [0.123, 0.004, 0.006, -0.01],
];
const SQUARE = 0.9; // how square its sections are (1: an ellipse)
const TOP = HEAD[HEAD.length - 1][0];

// The section at height y: [half width, half depth, middle].
function sectionAt(y, out) {
  let i = 1;
  while (i < HEAD.length - 1 && HEAD[i][0] < y) i++;
  const a = HEAD[i - 1];
  const b = HEAD[i];
  const t = Math.min(1, Math.max(0, (y - a[0]) / (b[0] - a[0])));
  for (let k = 1; k < 4; k++) out[k - 1] = a[k] + (b[k] - a[k]) * t;
  return out;
}
const _sec = [0, 0, 0];
const round = (v) => Math.sign(v) * Math.pow(Math.abs(v), SQUARE);
// The point `off` m off the head, `a` radians round from the front (+ to the
// wearer's left) at height y.
function onHead(a, y, off, out) {
  const [w, d, z] = sectionAt(y, _sec);
  return out.set((w + off) * round(Math.sin(a)), y, z + (d + off) * round(Math.cos(a)));
}

// The head's own sections from y0 up to y1, stood `off` off it, as rows for
// tailored(): a hood, a helmet's shell, a scarf. shape(y, section), if given,
// changes a section ([half width, half depth, middle]) before it's stood off.
function rows(off, y0, y1, shape = null) {
  const ys = [y0];
  // (under the chin the head has no sections of its own: one every so often)
  for (let y = y0 + 0.014; y < HEAD[0][0] - 0.004 && y < y1 - 0.004; y += 0.014) ys.push(y);
  for (const r of HEAD) if (r[0] > y0 + 0.004 && r[0] < y1 - 0.004) ys.push(r[0]);
  ys.push(y1);
  return ys.map((y) => {
    const sec = sectionAt(y, _sec);
    if (shape) shape(y, sec);
    const [w, d, z] = sec;
    // (a shell goes on over the top of the head, where the head itself comes to a point)
    const lid = y > TOP - 0.02 ? off * Math.min(1, (y - (TOP - 0.02)) / 0.02) : 0;
    return [y + lid, Math.max(0.002, w + off - lid * 0.6), Math.max(0.002, d + off - lid * 0.6), z];
  });
}
// Cloth over the lower face doesn't follow the jaw in under the chin: it
// hangs from the cheeks to the collar.
const COLLAR = [0.072, 0.082, 0.002]; // the section it has come to at the collar
function drape(y, sec) {
  const t = THREE.MathUtils.smoothstep(-y, 0.062, 0.135);
  for (let k = 0; k < 3; k++) sec[k] += (COLLAR[k] - sec[k]) * t;
}
// (+ to the wearer's left: a span round the head on one side, low to high)
const span = (side, a, b) => (side > 0 ? [a, b] : [-b, -a]);

// A slab that follows the head: from a0 to a1 round it, between bottom(t)
// and top(t) up it (t: -1 at a0 .. 1 at a1), its faces off0 and off1 off the
// head. A lens, a strap, a frame.
function slab(a0, a1, bottom, top, off0, off1, cols = 20, rws = 5) {
  const pos = [];
  const uv = [];
  const idx = [];
  const p = new THREE.Vector3();
  const face = (off, flip) => {
    const first = pos.length / 3;
    for (let j = 0; j <= rws; j++) {
      for (let i = 0; i <= cols; i++) {
        const t = (i / cols) * 2 - 1;
        const a = a0 + (a1 - a0) * (i / cols);
        const y0 = bottom(t);
        const y = y0 + (top(t) - y0) * (j / rws);
        onHead(a, y, off, p);
        pos.push(p.x, p.y, p.z);
        uv.push(a / (Math.PI * 2), y); // (as tailored cloth is: round it, and up it in metres)
      }
    }
    for (let j = 0; j < rws; j++) {
      for (let i = 0; i < cols; i++) {
        const a = first + j * (cols + 1) + i;
        const b = a + 1;
        const c = a + cols + 1;
        const d = c + 1;
        if (flip) idx.push(a, c, b, b, c, d);
        else idx.push(a, b, c, b, d, c);
      }
    }
    return first;
  };
  const outer = face(off1, false);
  const inner = face(off0, true);
  // its edges: round the outside of the two faces
  const at = (first, i, j) => first + j * (cols + 1) + i;
  const wall = (i0, j0, i1, j1) => idx.push(at(outer, i0, j0), at(inner, i0, j0), at(outer, i1, j1), at(outer, i1, j1), at(inner, i0, j0), at(inner, i1, j1));
  for (let i = 0; i < cols; i++) {
    wall(i + 1, 0, i, 0);
    wall(i, rws, i + 1, rws);
  }
  for (let j = 0; j < rws; j++) {
    wall(0, j, 0, j + 1);
    wall(cols, j + 1, cols, j);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

// Two colours in squares, as a cloth is woven in them: one tile, repeated.
const checked = new Map();
function checks(a, b, round = 20, up = 36) {
  const key = `${a}:${b}:${round}:${up}`;
  if (checked.has(key)) return checked.get(key);
  const A = new THREE.Color(a).convertLinearToSRGB();
  const B = new THREE.Color(b).convertLinearToSRGB();
  const data = new Uint8Array(4 * 4 * 4);
  // (a broken check: one square in four the other colour, the rest threaded with it)
  const tile = ['abab', 'bbab', 'abab', 'abbb'];
  tile.forEach((row, y) => [...row].forEach((ch, x) => data.set([...(ch === 'a' ? A : B).toArray().map((v) => Math.round(v * 255)), 255], (y * 4 + x) * 4)));
  const tex = new THREE.DataTexture(data, 4, 4);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(round, up);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  checked.set(key, tex);
  return tex;
}

// (what a lens is seen by is the sky in it: bright enough of itself to read as glass in any light)
const LENS = new THREE.MeshStandardMaterial({ color: 0xc8842a, roughness: 0.12, metalness: 0.2, emissive: 0x4a2a08 }); // a Warden's goggles: amber
const TINT = new THREE.MeshStandardMaterial({ color: 0x15171c, roughness: 0.1, metalness: 0.3, emissive: 0x06080c }); // a Raider's dark glasses

// The skin there is to see: the head itself, and its nose.
function bare(head, skin) {
  piece(head, tailored(rows(0, HEAD[0][0], TOP), { segments: 32, squareness: SQUARE }), skin);
  const nose = new THREE.SphereGeometry(1, 12, 10).scale(0.011, 0.021, 0.015).rotateX(-0.32);
  piece(head, nose, skin, 0, -0.026, 0.089);
  // the brow, over the eyes
  piece(head, new THREE.SphereGeometry(1, 14, 8).scale(0.052, 0.009, 0.012), skin, 0, 0.026, 0.083);
}

// A helmet: a shell off the head down to the ears, lower behind, its rim
// rolled; a rail down each side, a mount on the front, a strap under the chin.
function helmet(head, shell, trim) {
  const g = group(head);
  g.name = 'helmet';
  g.visible = false;
  const OFF = 0.02;
  const dome = tailored(rows(OFF, 0.026, TOP, (y, sec) => y < 0.04 && ((sec[0] += 0.003), (sec[1] += 0.004))), { segments: 36, squareness: 0.94 });
  // lower over the nape than over the brow
  const p = dome.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const back = THREE.MathUtils.smoothstep(-p.getZ(i), -0.02, 0.09);
    const low = 1 - THREE.MathUtils.smoothstep(p.getY(i), 0.026, 0.075);
    p.setY(i, p.getY(i) - 0.04 * back * low);
  }
  dome.computeVertexNormals();
  piece(g, dome, shell);
  const edge = (t) => 0.024 - 0.04 * THREE.MathUtils.smoothstep(Math.abs(t), 0.35, 0.95);
  piece(g, slab(-Math.PI, Math.PI, (t) => edge(t) - 0.004, (t) => edge(t) + 0.006, OFF - 0.001, OFF + 0.004, 48, 1), trim);
  for (const side of [-1, 1]) {
    piece(g, slab(...span(side, 1.2, 1.95), () => 0.024, () => 0.04, OFF, OFF + 0.007, 8, 1), trim);
    cord(g, trim, 0.0035, [[side * 0.086, 0.012, 0.02], [side * 0.082, -0.05, 0.03], [side * 0.05, -0.108, 0.05], [0, -0.126, 0.062]]);
  }
  piece(g, slab(-0.2, 0.2, () => 0.05, () => 0.082, OFF, OFF + 0.006, 6, 2), trim);
  return g;
}

// ── A Raider ────────────────────────────────────────────────────────────────
// look: { skin, scarf: [colour, colour], helmet }
export function raiderHead(head, look) {
  const skin = M(look.skin, 0.62);
  bare(head, skin);
  const [a, b] = look.scarf;
  const cloth = M(0xffffff, 0.92, { map: checks(a, b) });
  const wound = group(head);
  wound.name = 'hat';
  // wound round the head: down to the brow in front, over the ears, low behind
  const folds = (y, across, front) => 0.004 * foldAt(y - 0.07 - 0.03 * across, 0.012) + 0.0035 * foldAt(y - 0.045 + 0.022 * across, 0.011) + 0.003 * foldAt(y - 0.095 - 0.01 * front, 0.012);
  const wrap = tailored(rows(0.008, 0.03, TOP), { segments: 40, squareness: SQUARE, crease: folds });
  {
    const p = wrap.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const back = THREE.MathUtils.smoothstep(-p.getZ(i), -0.045, 0.06);
      const low = 1 - THREE.MathUtils.smoothstep(p.getY(i), 0.03, 0.07);
      p.setY(i, p.getY(i) - 0.085 * back * low);
    }
    wrap.computeVertexNormals();
  }
  piece(wound, wrap, cloth);
  // the roll of it across the brow
  piece(wound, slab(-1.9, 1.9, (t) => 0.026 - 0.012 * t * t, (t) => 0.044 - 0.012 * t * t, 0.006, 0.016, 28, 2), cloth);
  // ...and across the nose and mouth, down into the collar; an end hanging at the shoulder
  const veil = tailored(
    rows(0.007, -0.15, -0.007, drape),
    {
      segments: 40,
      squareness: SQUARE,
      crease: (y, across, front) => 0.004 * foldAt(y + 0.06 - 0.03 * across, 0.011) + 0.004 * foldAt(y + 0.1 + 0.02 * across, 0.012) + (front > 0 ? 0.013 * Math.exp(-((across / 0.2) ** 2) - ((y + 0.026) / 0.026) ** 2) : 0),
    },
  );
  piece(head, veil, cloth);
  const tail = tailored([[-0.2, 0.03, 0.007], [-0.17, 0.036, 0.009, 0, 0.004], [-0.1, 0.03, 0.011, 0.004, 0.006], [-0.03, 0.026, 0.012, 0.008, 0.004], [0.01, 0.018, 0.01, 0.01]], { segments: 12, crease: (y, across) => 0.003 * foldAt(across * 0.03 - 0.004, 0.006) });
  const hung = piece(head, tail, cloth, -0.068, -0.01, -0.03);
  hung.rotation.set(0.08, 0.5, 0.12);
  // dark glasses: a lens each side of the nose, in a frame, an arm back to each ear
  const frame = M(0x241a12, 0.45);
  for (const side of [-1, 1]) {
    // (how far along from the nose, -1, to the temple, 1)
    const out = (t) => side * t;
    const bottom = (t) => 0.006 * out(t) ** 2 * (out(t) < 0 ? 1.6 : 0.6);
    const top = (t) => -0.003 * out(t) ** 2;
    piece(head, slab(...span(side, 0.1, 0.74), (t) => -0.016 + bottom(t), (t) => 0.016 + top(t), 0.0115, 0.0135, 10, 3), TINT);
    piece(head, slab(...span(side, 0.07, 0.79), (t) => -0.0195 + bottom(t), (t) => 0.0195 + top(t), 0.006, 0.0125, 10, 3), frame);
    piece(head, slab(...span(side, 0.76, 1.5), () => 0.008, () => 0.014, 0.008, 0.011, 6, 1), frame);
  }
  piece(head, slab(-0.09, 0.09, () => 0.006, () => 0.014, 0.008, 0.0125, 4, 1), frame);
  helmet(head, M(look.helmet, 0.78, textile('canvas')), M(0x2b2a24, 0.8));

  const brow = group(head);
  onHead(0, 0.07, 0.012, brow.position);
  brow.rotation.x = -0.25;
  const [rx, rz, z] = sectionAt(0.07, _sec);
  return { brow, crown: { rx: rx + 0.01, rz: rz + 0.01, z, y: 0.07 } };
}

// ── A Warden ────────────────────────────────────────────────────────────────
// look: { hood, cap, helmet }
export function wardenHead(head, look) {
  const hood = M(look.hood, 0.94, textile('twill'));
  // a hood over the whole head and down the neck, the nose and the chin showing through it
  const knit = tailored(rows(0.004, -0.16, TOP, drape), {
    segments: 40,
    squareness: SQUARE,
    crease: (y, across, front) => 0.003 * foldAt(y + 0.105 + 0.02 * across, 0.012) + (front > 0 ? 0.013 * Math.exp(-((across / 0.17) ** 2) - ((y + 0.028) / 0.024) ** 2) : 0),
  });
  piece(head, knit, hood);
  // goggles: one lens across both eyes, in a frame that stands off the face, on a strap
  const rubber = M(0x24272c, 0.7);
  const top = (t) => 0.034 - 0.01 * t ** 4;
  const bottom = (t) => -0.026 + 0.012 * Math.exp(-((t / 0.2) ** 2)) + 0.012 * t ** 4;
  piece(head, slab(-0.98, 0.98, bottom, top, 0.012, 0.0165, 28, 4), LENS);
  piece(head, slab(-1.06, 1.06, (t) => bottom(t) - 0.007, (t) => top(t) + 0.007, 0.002, 0.014, 28, 4), rubber);
  piece(head, slab(-Math.PI, Math.PI, () => -0.004, () => 0.02, 0.003, 0.0065, 48, 1), M(look.strap, 0.85, textile('canvas')));
  // without a helmet: a peaked cap
  const hat = group(head);
  hat.name = 'hat';
  const cloth = M(look.cap, 0.9, textile('twill'));
  piece(hat, tailored(rows(0.009, 0.04, TOP), { segments: 36, squareness: 0.86 }), cloth);
  piece(hat, slab(-Math.PI, Math.PI, () => 0.036, () => 0.05, 0.008, 0.0115, 48, 1), cloth);
  {
    // the peak: out over the eyes from the front of the band
    const s = new THREE.Shape();
    const N = 16;
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * 2 - 1;
      const x = Math.sin((a * Math.PI) / 2) * 0.078;
      const z = 0.06 + Math.cos((a * Math.PI) / 2) * 0.1;
      if (i === 0) s.moveTo(x, z);
      else s.lineTo(x, z);
    }
    s.lineTo(0.06, 0.04);
    s.lineTo(-0.06, 0.04);
    const peak = new THREE.ExtrudeGeometry(s, { depth: 0.004, bevelEnabled: true, bevelThickness: 0.001, bevelSize: 0.001, bevelSegments: 1, curveSegments: 4 });
    peak.rotateX(Math.PI / 2);
    const m = piece(hat, peak, cloth, 0, 0.046, 0);
    m.rotation.x = 0.16;
  }
  helmet(head, M(look.helmet, 0.6), rubber);

  const brow = group(head);
  onHead(0, 0.075, 0.014, brow.position);
  brow.rotation.x = -0.25;
  const [rx, rz, z] = sectionAt(0.07, _sec);
  return { brow, crown: { rx: rx + 0.012, rz: rz + 0.012, z, y: 0.07 } };
}
