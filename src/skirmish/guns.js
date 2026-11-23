// What the fighters carry, as things to draw: the six guns, the knife, the
// three grenades and the charge.
//
// Each is made the way a real one is put together: parts cut from plate to
// their outline as seen from the side (a receiver, a stock, a magazine), with
// their edges broken, and turned parts (a barrel, a scope, a cylinder) along
// the bore. In flat colours: blued steel, walnut, black and olive plastic.
// None is a copy of a real gun; each is the plain idea of its kind.
//
//   gunModel(kind) -> a group, held at its origin (the middle of the grip,
//   in the right hand), pointing along −z, its top +y. On its userData:
//     muzzle   where its shots leave it (a Vector3 in its own frame)
//     fore     where the other hand holds it (a Vector3), or null: one hand
//     light    the charge's lamp (a mesh, to blink)
//
// The same model is in a fighter's hands and, nearer the eye, in your own.

import * as THREE from 'three';

const M = (color, roughness, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
const MAT = {
  steel: M(0x33373d, 0.46, 0.3), // blued
  bright: M(0xa3a6ab, 0.36, 0.4), // bare, worn
  black: M(0x1b1c1e, 0.66, 0.05), // plastic
  rubber: M(0x101112, 0.92),
  wood: M(0x7d4f2c, 0.56), // walnut
  woodDark: M(0x55331d, 0.6),
  olive: M(0x4d5437, 0.82),
  can: M(0x8a8f8a, 0.6, 0.2), // a grenade's painted tin
  pale: M(0xd9d8cf, 0.55, 0.1),
  band: M(0xc9a23a, 0.6),
  brass: M(0xb38f3e, 0.4, 0.6),
  glass: M(0x0b1016, 0.12, 0.3),
  stick: M(0x8f3a27, 0.78), // a stick of the charge, in waxed paper
  tape: M(0x151515, 0.85),
  lamp: new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.25, 0.15) }),
  digits: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 0.18, 0.1) }),
  wireRed: M(0xb02a1e, 0.6),
  wireYellow: M(0xc9a52c, 0.6),
};
const EDGE = 0.0025; // m the edges of a plate are broken by

function add(g, geometry, material) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  g.add(mesh);
  return mesh;
}

// A part cut from plate: its outline from the gun's right side as [ahead, up]
// points (m ahead of the grip, and above it), `wide` across. holes: outlines
// cut through it (a trigger guard). x: how far to the right of the middle.
function plate(g, material, outline, wide, { edge = EDGE, x = 0, holes = [] } = {}) {
  const shape = new THREE.Shape();
  outline.forEach(([u, v], i) => (i ? shape.lineTo(u, v) : shape.moveTo(u, v)));
  for (const hole of holes) {
    const path = new THREE.Path();
    hole.forEach(([u, v], i) => (i ? path.lineTo(u, v) : path.moveTo(u, v)));
    shape.holes.push(path);
  }
  const depth = Math.max(0.0008, wide - 2 * edge);
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: edge > 0, bevelThickness: edge, bevelSize: edge, bevelSegments: 2, curveSegments: 4 });
  geo.translate(0, 0, -depth / 2);
  geo.rotateY(Math.PI / 2); // ahead is −z, across is x
  geo.translate(x, 0, 0);
  return add(g, geo, material);
}

// A turned part along the bore: from `from` to `to` m ahead of the grip, `up`
// above it, r its radius (r1 at the far end, if it tapers).
function rod(g, material, r, from, to, up, { r1 = r, x = 0, sides = 14 } = {}) {
  const geo = new THREE.CylinderGeometry(r1, r, Math.abs(to - from), sides);
  geo.rotateX(-Math.PI / 2); // its far end ahead
  geo.translate(x, up, -(from + to) / 2);
  return add(g, geo, material);
}

// A turned part across the gun (a handle, a pin): from x0 to x1 to the right
// of the middle, `ahead` of the grip and `up` above it.
function stud(g, material, r, x0, x1, ahead, up, sides = 10) {
  const geo = new THREE.CylinderGeometry(r, r, Math.abs(x1 - x0), sides);
  geo.rotateZ(Math.PI / 2);
  geo.translate((x0 + x1) / 2, up, -ahead);
  return add(g, geo, material);
}

// A small block: [ahead from, to], [up from, to], wide.
function block(g, material, [u0, u1], [v0, v1], wide, x = 0) {
  const geo = new THREE.BoxGeometry(wide, v1 - v0, u1 - u0);
  geo.translate(x, (v0 + v1) / 2, -(u0 + u1) / 2);
  return add(g, geo, material);
}

// A trigger guard and the trigger in it, under a gun at `up`, from u0 to u1.
function guard(g, material, u0, u1, up, deep = 0.036) {
  const t = 0.004;
  plate(
    g,
    material,
    [
      [u0, up],
      [u1, up],
      [u1, up - deep + 0.008],
      [u1 - 0.008, up - deep],
      [u0 + 0.004, up - deep],
      [u0, up - deep + 0.006],
    ],
    0.012,
    {
      edge: 0.001,
      holes: [
        [
          [u0 + t, up - t * 0.5],
          [u1 - t, up - t * 0.5],
          [u1 - t, up - deep + 0.009],
          [u1 - 0.009, up - deep + t],
          [u0 + t, up - deep + t],
        ],
      ],
    },
  );
  plate(
    g,
    MAT.steel,
    [
      [u0 + 0.014, up],
      [u0 + 0.02, up],
      [u0 + 0.017, up - deep * 0.62],
      [u0 + 0.012, up - deep * 0.6],
    ],
    0.006,
    { edge: 0.0008 },
  );
}

const V = (x, y, z) => new THREE.Vector3(x, y, z);

const MAKE = {
  // A service pistol: a slide on a plastic frame.
  sidearm(g) {
    const bore = 0.068;
    plate(g, MAT.steel, [[-0.047, 0.05], [-0.047, 0.08], [-0.042, 0.086], [0.14, 0.086], [0.146, 0.08], [0.146, 0.05]], 0.027);
    // cuts for the thumb to rack it by, and where the brass comes out
    for (let i = 0; i < 5; i++) block(g, MAT.black, [-0.04 + i * 0.006, -0.037 + i * 0.006], [0.056, 0.08], 0.0285);
    block(g, MAT.bright, [0.035, 0.07], [0.07, 0.0865], 0.02, 0.0045);
    plate(
      g,
      MAT.black,
      [[0.136, 0.05], [0.136, 0.034], [0.09, 0.03], [0.024, 0.03], [0.02, 0.0], [0.006, -0.072], [-0.04, -0.082], [-0.047, -0.07], [-0.028, 0.0], [-0.03, 0.022], [-0.052, 0.04], [-0.047, 0.05]],
      0.029,
      { edge: 0.004 },
    );
    // the grip's roughened sides, and the foot of the magazine
    plate(g, MAT.rubber, [[0.012, -0.004], [0.0, -0.066], [-0.034, -0.074], [-0.02, -0.004]], 0.0315, { edge: 0.002 });
    plate(g, MAT.black, [[0.012, -0.074], [0.008, -0.088], [-0.044, -0.097], [-0.044, -0.084]], 0.03, { edge: 0.002 });
    guard(g, MAT.black, 0.024, 0.086, 0.032);
    block(g, MAT.black, [-0.04, -0.03], [0.086, 0.094], 0.016);
    block(g, MAT.black, [0.132, 0.139], [0.086, 0.093], 0.004);
    rod(g, MAT.bright, 0.0062, 0.14, 0.149, bore);
    rod(g, MAT.rubber, 0.0042, 0.148, 0.1495, bore);
    return { muzzle: V(0, bore, -0.15), fore: V(0.022, -0.035, 0.006) };
  },

  // A long-barrelled revolver: bright steel, a walnut grip.
  magnum(g) {
    const bore = 0.07;
    plate(
      g,
      MAT.bright,
      [[-0.03, 0.03], [-0.03, 0.085], [-0.012, 0.1], [0.078, 0.1], [0.082, 0.05], [0.07, 0.03]],
      0.02,
      { holes: [[[0.012, 0.047], [0.06, 0.047], [0.06, 0.092], [0.012, 0.092]]] },
    );
    // the cylinder, six chambers, and the rod it turns on
    rod(g, MAT.bright, 0.0215, 0.013, 0.059, bore - 0.001, { sides: 12 });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.52;
      rod(g, MAT.steel, 0.0052, 0.0125, 0.0595, bore - 0.001 + Math.sin(a) * 0.0195, { x: Math.cos(a) * 0.0195, sides: 6 });
    }
    rod(g, MAT.bright, 0.0098, 0.08, 0.235, bore, { r1: 0.0092 });
    rod(g, MAT.bright, 0.0068, 0.082, 0.19, bore - 0.018);
    block(g, MAT.bright, [0.082, 0.228], [bore + 0.008, bore + 0.014], 0.008);
    block(g, MAT.steel, [0.214, 0.228], [bore + 0.014, bore + 0.026], 0.003);
    block(g, MAT.steel, [-0.022, -0.012], [0.1, 0.108], 0.012);
    rod(g, MAT.rubber, 0.0055, 0.234, 0.2355, bore);
    // the hammer, back
    plate(g, MAT.steel, [[-0.03, 0.07], [-0.046, 0.092], [-0.04, 0.098], [-0.022, 0.082]], 0.008, { edge: 0.001 });
    plate(
      g,
      MAT.wood,
      [[-0.028, 0.034], [0.006, 0.03], [0.012, -0.012], [0.002, -0.07], [-0.03, -0.092], [-0.058, -0.078], [-0.04, -0.02], [-0.046, 0.022]],
      0.03,
      { edge: 0.007 },
    );
    stud(g, MAT.brass, 0.005, -0.0158, 0.0158, -0.022, -0.02);
    guard(g, MAT.bright, 0.008, 0.062, 0.032);
    return { muzzle: V(0, bore, -0.236), fore: V(0.022, -0.04, 0.006) };
  },

  // A machine pistol with a wire stock: all steel and black plastic.
  smg(g) {
    const bore = 0.062;
    plate(g, MAT.steel, [[-0.11, 0.03], [-0.11, 0.08], [-0.1, 0.088], [0.2, 0.088], [0.235, 0.076], [0.235, 0.036], [0.2, 0.03]], 0.042, { edge: 0.004 });
    // where the brass comes out, and the handle that cocks it
    block(g, MAT.rubber, [0.03, 0.085], [0.058, 0.078], 0.0425, 0.0005);
    stud(g, MAT.steel, 0.005, -0.04, -0.02, 0.104, 0.071);
    rod(g, MAT.black, 0.0155, 0.235, 0.29, bore, { sides: 12 });
    rod(g, MAT.steel, 0.0082, 0.29, 0.34, bore);
    rod(g, MAT.rubber, 0.0052, 0.3395, 0.3405, bore);
    // the magazine, straight down ahead of the trigger, in its housing
    plate(g, MAT.steel, [[0.092, 0.03], [0.132, 0.03], [0.13, -0.018], [0.094, -0.018]], 0.034, { edge: 0.003 });
    plate(g, MAT.black, [[0.097, -0.018], [0.127, -0.018], [0.122, -0.165], [0.092, -0.165]], 0.022, { edge: 0.002 });
    plate(g, MAT.black, [[-0.028, 0.03], [0.022, 0.03], [0.014, -0.02], [0.0, -0.078], [-0.04, -0.084], [-0.044, -0.07], [-0.03, -0.01]], 0.03, { edge: 0.005 });
    guard(g, MAT.steel, 0.022, 0.09, 0.031);
    // sights
    plate(g, MAT.steel, [[-0.08, 0.088], [-0.08, 0.104], [-0.07, 0.104], [-0.062, 0.088]], 0.014, { edge: 0.001 });
    plate(g, MAT.steel, [[0.2, 0.086], [0.204, 0.106], [0.21, 0.106], [0.218, 0.082]], 0.01, { edge: 0.001 });
    // the stock: two wires back to a plate for the shoulder
    for (const x of [-0.017, 0.017]) rod(g, MAT.steel, 0.0042, -0.34, -0.1, 0.07, { x, sides: 8 });
    plate(g, MAT.steel, [[-0.335, 0.085], [-0.335, -0.02], [-0.347, -0.02], [-0.347, 0.085]], 0.044, { edge: 0.003 });
    return { muzzle: V(0, bore, -0.342), fore: V(0, -0.03, -0.112) };
  },

  // A pump shotgun: a barrel over its magazine, walnut to hold it by.
  shotgun(g) {
    const bore = 0.076;
    plate(g, MAT.steel, [[-0.07, 0.034], [-0.07, 0.086], [-0.06, 0.094], [0.14, 0.094], [0.15, 0.086], [0.15, 0.04], [0.09, 0.03], [0.0, 0.03]], 0.04, { edge: 0.004 });
    block(g, MAT.rubber, [0.03, 0.1], [0.062, 0.082], 0.0405, 0.0005);
    rod(g, MAT.steel, 0.0112, 0.15, 0.79, bore, { r1: 0.0105 });
    rod(g, MAT.steel, 0.0108, 0.15, 0.66, bore - 0.026);
    rod(g, MAT.bright, 0.0115, 0.655, 0.668, bore - 0.026);
    plate(g, MAT.steel, [[0.6, bore - 0.03], [0.6, bore + 0.006], [0.616, bore + 0.006], [0.616, bore - 0.03]], 0.008, { edge: 0.001 });
    rod(g, MAT.brass, 0.0026, 0.776, 0.782, bore + 0.013, { sides: 8 });
    rod(g, MAT.rubber, 0.0092, 0.7895, 0.7905, bore);
    // the slide under the barrel, ribbed for the hand
    rod(g, MAT.wood, 0.0235, 0.2, 0.37, bore - 0.027, { sides: 16 });
    for (let i = 0; i < 6; i++) rod(g, MAT.woodDark, 0.0242, 0.218 + i * 0.024, 0.224 + i * 0.024, bore - 0.027, { sides: 16 });
    for (const x of [-0.014, 0.014]) rod(g, MAT.steel, 0.003, 0.15, 0.2, bore - 0.03, { x, sides: 6 });
    // the stock: the wrist in the hand, and back to the shoulder
    plate(
      g,
      MAT.wood,
      [[-0.07, 0.086], [-0.2, 0.072], [-0.39, 0.058], [-0.4, 0.05], [-0.4, -0.06], [-0.39, -0.068], [-0.16, -0.03], [-0.07, -0.05], [-0.03, -0.052], [0.006, -0.012], [0.012, 0.03], [-0.07, 0.034]],
      0.036,
      { edge: 0.008 },
    );
    plate(g, MAT.rubber, [[-0.4, 0.056], [-0.4, -0.066], [-0.414, -0.066], [-0.414, 0.056]], 0.036, { edge: 0.004 });
    guard(g, MAT.steel, 0.014, 0.078, 0.031);
    return { muzzle: V(0, bore, -0.792), fore: V(0, bore - 0.05, -0.27) };
  },

  // A rifle that fires as long as the trigger is held: stamped steel, walnut
  // at the hand and the shoulder, a curved magazine.
  rifle(g) {
    const bore = 0.076;
    plate(g, MAT.steel, [[-0.085, 0.036], [-0.085, 0.092], [-0.07, 0.104], [0.19, 0.104], [0.2, 0.096], [0.2, 0.04], [0.1, 0.034]], 0.04, { edge: 0.003 });
    // the lid over the works, ribbed, and the handle that cocks it
    plate(g, MAT.black, [[-0.07, 0.104], [-0.06, 0.112], [0.15, 0.112], [0.16, 0.104]], 0.034, { edge: 0.003 });
    block(g, MAT.rubber, [0.05, 0.13], [0.074, 0.094], 0.0405, 0.0005);
    stud(g, MAT.steel, 0.0045, 0.02, 0.04, 0.112, 0.084);
    // the hand guard, the tube over the barrel, the barrel and its brake
    plate(g, MAT.wood, [[0.2, 0.046], [0.2, 0.098], [0.43, 0.094], [0.44, 0.086], [0.44, 0.054], [0.43, 0.046]], 0.044, { edge: 0.008 });
    for (let i = 0; i < 3; i++) block(g, MAT.woodDark, [0.27 + i * 0.045, 0.292 + i * 0.045], [0.066, 0.074], 0.0445);
    rod(g, MAT.steel, 0.0078, 0.2, 0.47, bore + 0.03);
    rod(g, MAT.steel, 0.0086, 0.2, 0.66, bore);
    rod(g, MAT.steel, 0.0118, 0.66, 0.705, bore, { sides: 10 });
    rod(g, MAT.rubber, 0.006, 0.7045, 0.7055, bore);
    // the fore sight on its block, the rear on the lid
    plate(g, MAT.steel, [[0.462, bore - 0.012], [0.462, bore + 0.036], [0.468, bore + 0.064], [0.478, bore + 0.064], [0.484, bore + 0.036], [0.484, bore - 0.012]], 0.012, { edge: 0.001 });
    stud(g, MAT.steel, 0.0036, -0.011, 0.011, 0.473, bore + 0.066, 8);
    plate(g, MAT.steel, [[0.17, 0.104], [0.17, 0.122], [0.18, 0.126], [0.196, 0.104]], 0.018, { edge: 0.001 });
    // the magazine, curving forward
    plate(
      g,
      MAT.steel,
      [[0.078, 0.04], [0.132, 0.04], [0.146, -0.03], [0.168, -0.094], [0.196, -0.146], [0.152, -0.168], [0.124, -0.118], [0.1, -0.05]],
      0.026,
      { edge: 0.003 },
    );
    plate(g, MAT.wood, [[-0.04, 0.036], [0.02, 0.036], [0.01, -0.02], [-0.004, -0.086], [-0.05, -0.09], [-0.056, -0.076], [-0.036, -0.016]], 0.03, { edge: 0.006 });
    guard(g, MAT.steel, 0.02, 0.08, 0.036);
    // the stock, and the plate at its end
    plate(g, MAT.wood, [[-0.085, 0.092], [-0.33, 0.082], [-0.345, 0.074], [-0.345, -0.034], [-0.33, -0.04], [-0.085, 0.04]], 0.034, { edge: 0.008 });
    plate(g, MAT.steel, [[-0.345, 0.078], [-0.345, -0.038], [-0.354, -0.038], [-0.354, 0.078]], 0.034, { edge: 0.003 });
    return { muzzle: V(0, bore, -0.707), fore: V(0, 0.046, -0.27) };
  },

  // A bolt-action rifle with a telescope on it, in an olive stock.
  longrifle(g) {
    const bore = 0.086;
    plate(
      g,
      MAT.olive,
      [[0.47, 0.044], [0.47, 0.066], [0.46, 0.074], [0.12, 0.078], [-0.07, 0.078], [-0.092, 0.05], [-0.13, 0.084], [-0.36, 0.08], [-0.385, 0.072], [-0.385, -0.058], [-0.37, -0.066], [-0.15, -0.026], [-0.06, -0.07], [-0.02, -0.074], [0.012, -0.018], [0.02, 0.03], [0.14, 0.034]],
      0.04,
      { edge: 0.009 },
    );
    plate(g, MAT.rubber, [[-0.385, 0.076], [-0.385, -0.062], [-0.4, -0.062], [-0.4, 0.076]], 0.04, { edge: 0.004 });
    // (a rest for the cheek, raised)
    plate(g, MAT.black, [[-0.16, 0.084], [-0.17, 0.098], [-0.3, 0.098], [-0.31, 0.082]], 0.03, { edge: 0.004 });
    // the action, and the bolt's handle down its right side
    rod(g, MAT.steel, 0.0145, -0.08, 0.15, bore);
    stud(g, MAT.steel, 0.0044, 0.012, 0.04, -0.054, bore - 0.004, 8);
    add(g, new THREE.SphereGeometry(0.0095, 12, 10).translate(0.045, bore - 0.006, 0.054), MAT.black);
    rod(g, MAT.steel, 0.0118, 0.15, 0.9, bore, { r1: 0.0085 });
    rod(g, MAT.steel, 0.0125, 0.9, 0.945, bore, { sides: 10 });
    rod(g, MAT.rubber, 0.006, 0.9445, 0.9455, bore);
    // the telescope on two rings: the glass at each end, a knob on top and one at the side
    const up = bore + 0.05;
    rod(g, MAT.black, 0.0135, -0.05, 0.25, up, { sides: 16 });
    rod(g, MAT.black, 0.0135, 0.25, 0.32, up, { r1: 0.0225, sides: 16 });
    rod(g, MAT.black, 0.0225, 0.32, 0.355, up, { sides: 16 });
    rod(g, MAT.black, 0.019, -0.105, -0.05, up, { r1: 0.0135, sides: 16 });
    rod(g, MAT.glass, 0.0205, 0.3545, 0.3555, up, { sides: 16 });
    rod(g, MAT.glass, 0.017, -0.1055, -0.1045, up, { sides: 16 });
    add(g, new THREE.CylinderGeometry(0.0105, 0.0105, 0.02, 12).translate(0, up + 0.02, -0.1), MAT.black);
    add(g, new THREE.CylinderGeometry(0.0105, 0.0105, 0.02, 12).rotateZ(Math.PI / 2).translate(0.02, up, -0.1), MAT.black);
    for (const u of [0.02, 0.18]) plate(g, MAT.steel, [[u, bore + 0.01], [u, up + 0.016], [u + 0.016, up + 0.016], [u + 0.016, bore + 0.01]], 0.03, { edge: 0.003 });
    // its magazine, a box under the action
    plate(g, MAT.black, [[0.05, 0.034], [0.112, 0.034], [0.11, 0.004], [0.054, 0.0]], 0.026, { edge: 0.003 });
    guard(g, MAT.steel, 0.012, 0.05, 0.03, 0.03);
    return { muzzle: V(0, bore, -0.947), fore: V(0, 0.03, -0.25) };
  },

  // A fighting knife: one edge, a guard, a grip that won't slip.
  knife(g) {
    plate(g, MAT.bright, [[0.062, -0.014], [0.062, 0.014], [0.17, 0.015], [0.235, 0.004], [0.24, -0.002], [0.2, -0.014]], 0.0042, { edge: 0.0012 });
    plate(g, MAT.steel, [[0.074, 0.005], [0.074, 0.009], [0.168, 0.01], [0.168, 0.006]], 0.0056, { edge: 0.0005 });
    plate(g, MAT.steel, [[0.052, -0.026], [0.052, 0.024], [0.062, 0.024], [0.062, -0.026]], 0.012, { edge: 0.002 });
    plate(g, MAT.rubber, [[-0.062, -0.014], [-0.066, 0.008], [-0.058, 0.016], [0.052, 0.014], [0.052, -0.015], [0.03, -0.018], [-0.02, -0.013], [-0.05, -0.018]], 0.022, { edge: 0.007 });
    for (let i = 0; i < 5; i++) block(g, MAT.black, [-0.04 + i * 0.019, -0.034 + i * 0.019], [-0.016, 0.0155], 0.0228);
    return { muzzle: V(0, 0, -0.24), fore: null };
  },

  // The charge: sticks bound together, a clock wired to them, a lamp.
  charge(g) {
    for (let i = 0; i < 4; i++) {
      const x = (i - 1.5) * 0.047;
      rod(g, MAT.stick, 0.023, -0.12, 0.12, 0, { x, sides: 14 });
      for (const end of [-0.1215, 0.1215]) rod(g, MAT.pale, 0.019, end - 0.0006, end + 0.0006, 0, { x, sides: 14 });
    }
    for (const u of [-0.075, 0.075]) block(g, MAT.tape, [u - 0.014, u + 0.014], [-0.0245, 0.0245], 0.19);
    // the clock, strapped on top: its numbers, its keys
    plate(g, MAT.black, [[-0.05, 0.024], [-0.05, 0.058], [0.05, 0.058], [0.05, 0.024]], 0.12, { edge: 0.004 });
    const digits = add(g, new THREE.PlaneGeometry(0.058, 0.02).rotateX(-Math.PI / 2).translate(-0.022, 0.0585, -0.018), MAT.digits);
    digits.castShadow = false;
    for (let i = 0; i < 6; i++) block(g, MAT.can, [-0.034 + Math.floor(i / 3) * 0.02, -0.022 + Math.floor(i / 3) * 0.02], [0.058, 0.0605], 0.012, -0.036 + (i % 3) * 0.017);
    const light = add(g, new THREE.SphereGeometry(0.008, 10, 8).translate(0.044, 0.064, -0.03), MAT.lamp);
    light.castShadow = false;
    // its wires, down to the sticks
    const wire = (material, pts) => add(g, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => V(...p))), 16, 0.0028, 6), material);
    wire(MAT.wireRed, [[0.03, 0.05, -0.05], [0.05, 0.05, -0.085], [0.06, 0.02, -0.122], [0.045, 0.004, -0.124]]);
    wire(MAT.wireYellow, [[-0.01, 0.05, -0.05], [-0.02, 0.055, -0.09], [-0.03, 0.022, -0.124], [-0.024, 0.004, -0.124]]);
    wire(MAT.wireRed, [[0.01, 0.05, 0.05], [0.02, 0.052, 0.09], [0.028, 0.02, 0.124], [0.022, 0.004, 0.124]]);
    return { muzzle: V(0, 0, 0), fore: V(-0.11, 0, 0), light };
  },
};

// A grenade, upright: its body, the fuse screwed into the top, the lever
// held down its side and the ring to pull.
function grenade(g, kind) {
  if (kind === 'frag') {
    add(g, new THREE.SphereGeometry(0.031, 16, 12).scale(1, 1.14, 1), MAT.olive);
    for (const y of [-0.012, 0.012]) add(g, new THREE.TorusGeometry(0.0312, 0.0016, 6, 20).rotateX(Math.PI / 2).translate(0, y, 0), MAT.tape);
  } else {
    const tall = kind === 'smoke' ? 0.118 : 0.104;
    const r = kind === 'smoke' ? 0.029 : 0.026;
    add(g, new THREE.CylinderGeometry(r, r, tall, 16), kind === 'smoke' ? MAT.can : MAT.pale);
    for (const y of [-tall / 2, tall / 2]) add(g, new THREE.CylinderGeometry(r + 0.0012, r + 0.0012, 0.006, kind === 'flash' ? 8 : 16).translate(0, y, 0), MAT.steel);
    add(g, new THREE.CylinderGeometry(r + 0.0006, r + 0.0006, 0.016, 16).translate(0, tall * 0.2, 0), kind === 'smoke' ? MAT.band : MAT.steel);
    // (a flash has holes round it, for the light to get out)
    if (kind === 'flash') for (let i = 0; i < 8; i++) add(g, new THREE.CylinderGeometry(0.0042, 0.0042, 0.003, 8).rotateX(Math.PI / 2).translate(0, -0.012, r).rotateY((i / 8) * Math.PI * 2), MAT.rubber);
  }
  const top = kind === 'frag' ? 0.034 : kind === 'smoke' ? 0.059 : 0.052;
  add(g, new THREE.CylinderGeometry(0.009, 0.011, 0.018, 10).translate(0, top + 0.008, 0), MAT.steel);
  // the lever, over the top and down the side
  const lever = new THREE.Shape();
  [[-0.004, top + 0.017], [0.012, top + 0.017], [0.034, top - 0.006], [0.035, top - 0.07], [0.031, top - 0.07], [0.03, top - 0.008], [0.01, top + 0.013], [-0.004, top + 0.013]].forEach(([x, y], i) => (i ? lever.lineTo(x, y) : lever.moveTo(x, y)));
  add(g, new THREE.ExtrudeGeometry(lever, { depth: 0.012, bevelEnabled: false }).translate(0, 0, -0.006), MAT.bright);
  add(g, new THREE.TorusGeometry(0.011, 0.0012, 6, 18).rotateY(Math.PI / 2).translate(-0.012, top + 0.006, 0.012), MAT.bright);
  return { muzzle: V(0, 0, -0.05), fore: null };
}

// What `kind` looks like: a gun's id, 'knife', 'frag' | 'flash' | 'smoke',
// or 'charge'.
export function gunModel(kind) {
  const g = new THREE.Group();
  Object.assign(g.userData, MAKE[kind] ? MAKE[kind](g) : grenade(g, kind));
  g.userData.kind = kind;
  return g;
}

// How it is held: 'long' at the shoulder, 'short' out in front in both
// hands, 'knife', 'thrown', or the 'charge'.
export const holdOf = (kind) => (kind === 'knife' ? 'knife' : kind === 'charge' ? 'charge' : kind === 'sidearm' || kind === 'magnum' ? 'short' : MAKE[kind] ? 'long' : 'thrown');
