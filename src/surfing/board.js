// A surfboard, made in code like everything else: an outline drawn as a
// curve (a pointed nose, wide through the middle, a squared-off tail),
// pushed out into a thin slab with its rails rounded off, a stringer down
// the middle, a stripe round the deck, and three fins under the tail.
//
// In its own frame its deck is at y = 0 (where the feet go), its nose
// toward +z and its middle at the origin.

import * as THREE from 'three';

export const BOARD = {
  length: 2.05, // m
  width: 0.52,
  thick: 0.065,
  nose: 0.55, // how far back from the nose it's widest, of the length
  tail: 0.34, // how wide the tail is, of the width
  fin: { h: 0.12, l: 0.11, back: 0.12, side: 0.17 }, // m: the fins, and how far up from the tail
};

// The board's outline, as half-widths along its length (z from the tail at
// -L/2 to the nose at +L/2): a curve, round through the middle.
function outline() {
  const L = BOARD.length;
  const W = BOARD.width / 2;
  const s = new THREE.Shape();
  const n = 24;
  const half = (t) => {
    // t: 0 at the tail .. 1 at the nose
    const peak = 1 - BOARD.nose;
    if (t < peak) {
      const k = t / peak;
      return W * (BOARD.tail + (1 - BOARD.tail) * Math.sin((k * Math.PI) / 2) ** 0.8);
    }
    const k = (t - peak) / (1 - peak);
    return W * Math.cos((k * Math.PI) / 2) ** 0.75;
  };
  s.moveTo(0, -L / 2);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    s.lineTo(half(t), -L / 2 + t * L);
  }
  for (let i = n; i >= 0; i--) {
    const t = i / n;
    s.lineTo(-half(t), -L / 2 + t * L);
  }
  return s;
}

const M = (hex, rough = 0.45) => new THREE.MeshStandardMaterial({ color: hex, roughness: rough, metalness: 0 });

// -> the board (a Group), and its colours swapped by setColors().
export function makeBoard({ deck = 0xf2ede0, rail = 0x2b8fb3 } = {}) {
  const g = new THREE.Group();
  const T = BOARD.thick;
  const bevel = T * 0.42;
  const geo = new THREE.ExtrudeGeometry(outline(), { depth: T - 2 * bevel, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.9, bevelSegments: 3, curveSegments: 4 });
  // the shape is drawn in x, y; lay it down: its y along z, pushed out along -y
  geo.rotateX(Math.PI / 2);
  geo.translate(0, -bevel, 0);
  geo.computeVertexNormals();
  const deckM = M(deck, 0.35);
  const body = new THREE.Mesh(geo, deckM);
  body.castShadow = true;
  body.receiveShadow = true;
  g.add(body);
  // a stripe round the deck, near the rail, and the stringer down the middle
  const railM = M(rail, 0.4);
  // (flat outlines laid face up, nose to +z)
  const flat = (sx, sz, y) => {
    const f = new THREE.ShapeGeometry(outline(), 4);
    f.rotateX(-Math.PI / 2);
    f.rotateY(Math.PI);
    f.scale(sx, 1, sz);
    f.translate(0, y, 0);
    return f;
  };
  g.add(new THREE.Mesh(flat(1, 1, 0.001), railM), new THREE.Mesh(flat(0.84, 0.95, 0.002), deckM));
  const stringer = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.003, BOARD.length * 0.93), M(0x9c7b52, 0.6));
  stringer.position.y = 0.003;
  g.add(stringer);
  // a traction pad on the tail, where the back foot goes
  const pad = new THREE.Mesh(new THREE.BoxGeometry(BOARD.width * 0.5, 0.008, 0.32), M(0x1d1f24, 0.9));
  pad.position.set(0, 0.004, -BOARD.length / 2 + 0.24);
  g.add(pad);
  // three fins under the tail
  const finShape = new THREE.Shape();
  const F = BOARD.fin;
  finShape.moveTo(0, 0);
  finShape.lineTo(F.l, 0);
  finShape.quadraticCurveTo(F.l * 0.5, -F.h * 0.4, -F.l * 0.35, -F.h);
  finShape.quadraticCurveTo(-F.l * 0.1, -F.h * 0.4, 0, 0);
  const finGeo = new THREE.ShapeGeometry(finShape, 4);
  finGeo.rotateY(-Math.PI / 2);
  const finM = M(0x2a3138, 0.5);
  finM.side = THREE.DoubleSide;
  for (const [x, back] of [[0, F.back * 0.6], [F.side * BOARD.width, F.back + 0.08], [-F.side * BOARD.width, F.back + 0.08]]) {
    const fin = new THREE.Mesh(finGeo, finM);
    fin.position.set(x, -T, -BOARD.length / 2 + back);
    fin.castShadow = true;
    g.add(fin);
  }
  g.userData.setColors = (d, r) => {
    deckM.color.setHex(d);
    railM.color.setHex(r);
  };
  return g;
}

// Three boards stood up in the sand, nose up, leaning a little each their
// own way: where a break is, seen from along the beach. In its own frame the
// sand is at y = 0 and they stand along x, facing +z (the sea).
export function makeRack() {
  const g = new THREE.Group();
  const colors = [
    [0xf4e3b5, 0xd2553a],
    [0xe9f1f2, 0x2b8fb3],
    [0xf2ede0, 0x4f9a4a],
  ];
  colors.forEach(([deck, rail], i) => {
    const b = makeBoard({ deck, rail });
    b.rotation.order = 'YXZ';
    b.rotation.set(-Math.PI / 2 + 0.1 * (i - 1), (i - 1) * 0.35, 0.08 * (1 - i));
    // a third of it in the sand
    b.position.set((i - 1) * 0.75, BOARD.length * 0.5 - 0.35, -0.05 * i);
    g.add(b);
  });
  return g;
}
