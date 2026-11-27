// The shop: rendered concrete stained dark in patches, a dark green plinth
// along the foot of the wall with a steel strip over it, a flat roof with a
// parapet, pipes along the top of the wall, a vent stack and a thin mast with
// guy wires. The front has a glazed part in deep dark frames, a roller
// shutter half down behind the glass, a shutter box and a ledge over it, and
// a glass door with a CLOSE sign; the west end a green door under a lamp.
// Sizes from layout.js; the look is the weathered material over photos of
// real concrete, paint and rusty sheet. The inside is set/interior.js; the
// glass is materials/glass.js.
import { Group, Mesh, BoxGeometry, CylinderGeometry, SphereGeometry, Color, MeshStandardNodeMaterial, PlaneGeometry } from 'three/webgpu';
import { vec3 } from 'three/tsl';
import { SHOP, PHONE } from './layout.js';
import { weathered } from '../materials/weathered.js';
import { pbr } from '../materials/textures.js';
import { signBoard } from './signs.js';
import { createGlass } from '../materials/glass.js';
import { boxMesh, tubeMesh, sagging, shadowed } from './shapes.js';
import { metals } from '../materials/metals.js';

const T = 0.25;              // wall thickness, metres
const PLINTH_PROUD = 0.025;  // how far the green plinth stands out of the wall, metres
const MULLION = 0.085;       // width of a mullion, metres
const SHUTTER_DOWN = 0.42;   // metres of roller shutter showing below the head, behind the glass
const PIPE_Y = [3.18, 3.28]; // heights of the two pipes along the top of the wall, metres

export function createShop() {
  const group = new Group();
  const S = SHOP;
  const G = S.glass;

  const concrete = pbr('dirty_concrete', { res: '2k' });
  const sheet = pbr('rusty_metal_02');
  const render = weathered({ colour: '#8b887d', under: '#5d574d', scale: 1.4, vary: 0.22, streaks: 0.5, dirt: 0.45, dirtHeight: 1.0,
    rough: 0.85, wet: 0.15, bump: 0.6, photo: concrete, photoScale: 2.4, photoSat: 0.25, photoContrast: 1.6, photoBump: 0.6 });
  const plinth = weathered({ colour: '#1c3a2f', under: '#4e4a40', peel: 0.05, scale: 0.8, vary: 0.2, streaks: 0.3, dirt: 0.5, dirtHeight: 0.35,
    rough: 0.6, wet: 0.25, photo: pbr('painted_concrete'), photoScale: 1.6, photoSat: 0.35, photoContrast: 1.2 });
  const roofMat = weathered({ colour: '#4c4a45', scale: 2, streaks: 0.2, dirt: 0, rough: 0.8, wet: 0.5,
    photo: concrete, photoScale: 3, photoContrast: 1.3 });
  const trim = weathered({ colour: '#38403a', under: '#555048', peel: 0.12, rust: 0.2, rough: 0.6, wet: 0.2, streaks: 0.5,
    photo: sheet, photoScale: 0.9, photoSat: 0.3, photoContrast: 1.2 });
  const frame = metals().black;
  const shutter = weathered({ colour: '#3a3f3c', rust: 0.15, rough: 0.6, metal: 0.3, wet: 0, streaks: 0.3, dirt: 0,
    photo: pbr('painted_metal_shutter'), photoScale: 1.2, photoSat: 0.2, photoContrast: 1.4, photoBump: 1.5 });
  const doorMat = weathered({ colour: '#2e5a3a', under: '#6b6150', peel: 0.25, rust: 0.2, rough: 0.6, streaks: 0.4, dirt: 0.4,
    photo: sheet, photoScale: 0.8, photoSat: 0.4, photoPeel: 0.5 });
  const { pipe, cable } = metals();

  const box = (x0, y0, z0, x1, y1, z1, m = render, r = 0) => {
    const mesh = boxMesh(x0, y0, z0, x1, y1, z1, m, r);
    group.add(mesh);
    return mesh;
  };

  // Back and side walls.
  box(S.x0, 0, S.z0, S.x1, S.wall, S.z0 + T);
  box(S.x0, 0, S.z0, S.x0 + T, S.wall, S.z1);
  box(S.x1 - T, 0, S.z0, S.x1, S.wall, S.z1);
  // The front: solid west part, sill and head round the glass, east part.
  box(S.x0, 0, S.z1 - T, G.x0, S.wall, S.z1);
  box(G.x1, 0, S.z1 - T, S.x1, S.wall, S.z1);
  box(G.x0, 0, S.z1 - T, S.door.x0, G.sill, S.z1);
  box(S.door.x1, 0, S.z1 - T, G.x1, G.sill, S.z1);
  box(G.x0, G.head, S.z1 - T, G.x1, S.wall, S.z1);
  // The green plinth along the foot of the front and both ends, a steel
  // strip along its top. (The door's opening is left clear.)
  const P = PLINTH_PROUD;
  const bandH = S.band;
  for (const [a, b] of [[S.x0 - P, S.door.x0], [S.door.x1, S.x1 + P]]) {
    box(a, 0, S.z1, b, bandH, S.z1 + P, plinth);
    box(a, bandH, S.z1, b, bandH + 0.025, S.z1 + P + 0.012, pipe);
  }
  for (const x of [S.x0 - P, S.x1]) {
    box(x, 0, S.z0 - P, x + P, bandH, S.z1, plinth);
    box(x - (x < 0 ? 0.012 : 0), bandH, S.z0 - P, x + P + (x > 0 ? 0.012 : 0), bandH + 0.025, S.z1, pipe);
  }
  box(S.x0 - P, 0, S.z0 - P, S.x1 + P, bandH, S.z0, plinth);
  // Roof slab, parapet and its coping.
  box(S.x0, S.wall, S.z0, S.x1, S.wall + 0.25, S.z1, roofMat);
  box(S.x0 - 0.05, S.wall, S.z1 - 0.2, S.x1 + 0.05, S.parapet, S.z1 + 0.05);
  box(S.x0 - 0.05, S.wall, S.z0 - 0.05, S.x1 + 0.05, S.parapet, S.z0 + 0.2);
  box(S.x0 - 0.05, S.wall, S.z0, S.x0 + 0.2, S.parapet, S.z1);
  box(S.x1 - 0.2, S.wall, S.z0, S.x1 + 0.05, S.parapet, S.z1);
  box(S.x0 - 0.1, S.parapet, S.z1 - 0.25, S.x1 + 0.1, S.parapet + 0.08, S.z1 + 0.1, trim, 0.015);
  box(S.x0 - 0.1, S.parapet, S.z0 - 0.1, S.x1 + 0.1, S.parapet + 0.08, S.z0 + 0.25, trim, 0.015);
  // A ledge along the front above the windows, and the pipes along the top
  // of the wall on brackets.
  box(S.x0, 2.95, S.z1, S.x1, 3.05, S.z1 + 0.35, trim, 0.01);
  for (const [i, y] of PIPE_Y.entries()) {
    const r = i ? 0.035 : 0.045;
    const p = shadowed(new Mesh(new CylinderGeometry(r, r, S.x1 - S.x0 + 0.2, 10), pipe));
    p.rotation.z = Math.PI / 2;
    p.position.set((S.x0 + S.x1) / 2, y, S.z1 + 0.09 + i * 0.03);
    group.add(p);
  }
  for (let x = S.x0 + 0.6; x < S.x1; x += 1.8) box(x - 0.02, PIPE_Y[0] - 0.06, S.z1, x + 0.02, PIPE_Y[1] + 0.05, S.z1 + 0.15, frame);

  // The shutter box over the glass, the roller shutter half down behind
  // the glass, and the deep dark frame: mullions, head and sill.
  const sb = S.shutterBox;
  box(G.x0 - 0.05, sb.y, S.z1, G.x1 + 0.05, sb.y + sb.h, S.z1 + sb.d, trim, 0.02);
  box(G.x0, sb.y - 0.02, S.z1 + 0.04, G.x1, sb.y + 0.01, S.z1 + sb.d - 0.03, frame);
  const roller = new Mesh(new PlaneGeometry(G.x1 - G.x0, SHUTTER_DOWN), shutter);
  roller.position.set((G.x0 + G.x1) / 2, G.head - SHUTTER_DOWN / 2, S.z1 - 0.16);
  group.add(roller);
  const M = MULLION / 2;
  for (const x of G.mullions) box(x - M, G.sill, S.z1 - 0.14, x + M, G.head, S.z1 + 0.05, frame, 0.008);
  box(G.x0, G.head - 0.09, S.z1 - 0.14, G.x1, G.head, S.z1 + 0.05, frame, 0.008);
  box(G.x0 - 0.03, G.sill, S.z1 - 0.14, S.door.x0, G.sill + 0.06, S.z1 + 0.09, frame, 0.008);
  box(S.door.x1, G.sill, S.z1 - 0.14, G.x1 + 0.03, G.sill + 0.06, S.z1 + 0.09, frame, 0.008);
  // The glass, the door's own panes included.
  const glass = createGlass();
  const pane = new Mesh(new BoxGeometry(G.x1 - G.x0, G.head - G.sill, 0.02), glass);
  pane.position.set((G.x0 + G.x1) / 2, (G.sill + G.head) / 2, S.z1 - 0.06);
  pane.renderOrder = 2;
  group.add(pane);
  // The door: glass in a frame reaching the ground, a bar handle, and the
  // CLOSE sign hung on a cord.
  const D = S.door;
  const DS = 0.06;  // the door's stiles and rails, metres
  box(D.x0 + M, 0, S.z1 - 0.1, D.x0 + M + DS, G.sill, S.z1 - 0.02, frame);
  box(D.x1 - M - DS, 0, S.z1 - 0.1, D.x1 - M, G.sill, S.z1 - 0.02, frame);
  box(D.x0 + M, 0.02, S.z1 - 0.1, D.x1 - M, 0.14, S.z1 - 0.02, frame);
  box(D.x0 + M, G.sill - 0.02, S.z1 - 0.1, D.x1 - M, G.sill + 0.02, S.z1 - 0.02, frame);
  box(D.x0 - 0.02, 0, S.z1 - 0.2, D.x1 + 0.02, 0.02, S.z1 + 0.03, pipe);
  const lowPane = new Mesh(new BoxGeometry(D.x1 - D.x0 - 2 * M, G.sill - 0.14, 0.015), glass);
  lowPane.position.set((D.x0 + D.x1) / 2, (G.sill + 0.14) / 2, S.z1 - 0.06);
  lowPane.renderOrder = 2;
  group.add(lowPane);
  group.add(tubeMesh([[D.x0 + 0.12, 0.85, S.z1 + 0.02], [D.x0 + 0.12, 0.88, S.z1 + 0.07], [D.x0 + 0.12, 1.32, S.z1 + 0.07],
    [D.x0 + 0.12, 1.35, S.z1 + 0.02]], 0.012, pipe, { segments: 12 }));
  const cx = (D.x0 + D.x1) / 2;
  const close = signBoard('close', [0.4, 0.17], { px: 128, depth: 0.004, streaks: 0, dirt: 0 });
  close.position.set(cx, 1.62, S.z1 - 0.035);
  close.rotation.z = 0.04;
  group.add(close);
  group.add(tubeMesh([[cx - 0.16, 1.71, S.z1 - 0.035], [cx, 1.86, S.z1 - 0.035], [cx + 0.16, 1.71, S.z1 - 0.035]], 0.002, cable, { segments: 6, sides: 3 }));

  // The west door: green, in a frame, with a small sign.
  const wd = S.westDoor;
  box(wd.x - 0.06, 0, wd.z - wd.w / 2, wd.x + 0.02, wd.h, wd.z + wd.w / 2, doorMat);
  box(wd.x - 0.1, wd.h, wd.z - wd.w / 2 - 0.1, wd.x + 0.02, wd.h + 0.1, wd.z + wd.w / 2 + 0.1, frame);
  for (const s of [-1, 1]) box(wd.x - 0.1, 0, wd.z + s * (wd.w / 2 + 0.05) - 0.05, wd.x + 0.02, wd.h, wd.z + s * (wd.w / 2 + 0.05) + 0.05, frame);
  box(wd.x - 0.1, 0.95, wd.z + wd.w / 2 - 0.15, wd.x - 0.06, 1.05, wd.z + wd.w / 2 - 0.08, pipe);
  const staff = signBoard('staff', [0.34, 0.12], { px: 64, depth: 0.005 });
  staff.position.set(wd.x - 0.08, 1.6, wd.z);
  staff.rotation.y = -Math.PI / 2;
  group.add(staff);

  // Lamps on the walls: the door's (a dish) and the caged one on the front.
  const glow = new MeshStandardNodeMaterial({ color: new Color(0.1, 0.08, 0.05), roughness: 0.4 });
  glow.emissiveNode = vec3(1.0, 0.72, 0.38).mul(10);
  const dish = weathered({ colour: '#2a2a28', rust: 0.3, metal: 0.6, rough: 0.5, bump: 0, photo: sheet, photoScale: 0.4, photoSat: 0.5 });
  const westLamp = new Group();
  const shade = shadowed(new Mesh(new CylinderGeometry(0.08, 0.24, 0.16, 16, 1, true), dish));
  const bulb = new Mesh(new SphereGeometry(0.07, 12, 8), glow);
  bulb.position.y = -0.05;
  const arm = shadowed(new Mesh(new BoxGeometry(0.3, 0.03, 0.03), dish));
  arm.position.set(0.15, 0.1, 0);
  westLamp.add(shade, bulb, arm);
  westLamp.position.set(S.westLamp.x - 0.3, S.westLamp.y, S.westLamp.z);
  group.add(westLamp);
  const caged = new Group();
  const cbulb = new Mesh(new SphereGeometry(0.075, 12, 8), glow);
  const cap = shadowed(new Mesh(new CylinderGeometry(0.11, 0.12, 0.05, 14), dish));
  cap.position.y = 0.15;
  const base = shadowed(new Mesh(new CylinderGeometry(0.11, 0.1, 0.03, 14), dish));
  base.position.y = -0.14;
  caged.add(cbulb, cap, base);
  // The cage: four wires round, three down.
  for (const y of [-0.08, 0, 0.08]) {
    const ring = shadowed(new Mesh(new CylinderGeometry(0.105, 0.105, 0.012, 14, 1, true), frame));
    ring.position.y = y;
    caged.add(ring);
  }
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + 0.4;
    const bar = shadowed(new Mesh(new BoxGeometry(0.01, 0.28, 0.01), frame));
    bar.position.set(Math.cos(a) * 0.105, 0, Math.sin(a) * 0.105);
    caged.add(bar);
  }
  const bracket = shadowed(new Mesh(new BoxGeometry(0.04, 0.04, 0.16), dish));
  bracket.position.set(0, 0.15, -0.08);
  caged.add(bracket);
  caged.position.set(S.wallLamp.x, S.wallLamp.y, S.wallLamp.z + 0.12);
  group.add(caged);

  // Signs on the front's west part.
  const south = signBoard('south', [0.75, 1.05], { px: 256 });
  south.position.set(-7.9, 1.75, S.z1 + 0.03);
  const oil = signBoard('oil', [0.62, 0.95], { px: 256 });
  oil.position.set(-6.7, 1.75, S.z1 + 0.03);
  const tires = signBoard('tires', [0.72, 0.48], { px: 192 });
  tires.position.set(-5.5, 1.85, S.z1 + 0.03);
  group.add(south, oil, tires);

  // The phone box: a black steel frame, a grey face with a dark screen and
  // a grille, its cable running up the wall to the top and its conduit down
  // to the ground.
  const phoneMat = weathered({ colour: '#7b7d78', rust: 0.15, rough: 0.55, metal: 0.25, streaks: 0.5,
    photo: sheet, photoScale: 0.5, photoSat: 0.3, photoContrast: 1.3 });
  const PB = { w: 0.42, h: 0.66, y: 1.12 };
  const px0 = PHONE.x - PB.w / 2;
  const px1 = PHONE.x + PB.w / 2;
  box(px0, PB.y, S.z1, px1, PB.y + PB.h, S.z1 + 0.1, frame, 0.01);
  box(px0 + 0.035, PB.y + 0.035, S.z1 + 0.1, px1 - 0.035, PB.y + PB.h - 0.035, S.z1 + 0.11, phoneMat);
  box(PHONE.x - 0.08, PB.y + PB.h - 0.24, S.z1 + 0.11, PHONE.x + 0.08, PB.y + PB.h - 0.13, S.z1 + 0.117, frame);
  for (let k = 0; k < 4; k++) {
    const y = PB.y + 0.16 + k * 0.025;
    box(PHONE.x - 0.08, y, S.z1 + 0.11, PHONE.x + 0.08, y + 0.009, S.z1 + 0.116, frame);
  }
  group.add(tubeMesh([[PHONE.x + 0.05, PB.y + PB.h, S.z1 + 0.05], [PHONE.x + 0.07, PB.y + PB.h + 0.5, S.z1 + 0.04],
    [PHONE.x + 0.12, PB.y + PB.h + 1.0, S.z1 + 0.04], [PHONE.x + 0.1, PIPE_Y[0], S.z1 + 0.06]], 0.012, cable, { segments: 20 }));
  group.add(tubeMesh([[PHONE.x - 0.04, PB.y, S.z1 + 0.05], [PHONE.x - 0.05, PB.y - 0.5, S.z1 + 0.05],
    [PHONE.x - 0.02, 0.2, S.z1 + 0.06], [PHONE.x - 0.03, 0, S.z1 + 0.08]], 0.016, pipe, { segments: 16 }));

  // On the roof: the vent stack and the mast with its guy wires.
  const v = S.vent;
  box(v.x - v.w / 2, S.wall, v.z - v.w / 2, v.x + v.w / 2, S.wall + v.h, v.z + v.w / 2, render);
  box(v.x - v.w / 2 - 0.08, S.wall + v.h, v.z - v.w / 2 - 0.08, v.x + v.w / 2 + 0.08, S.wall + v.h + 0.1, v.z + v.w / 2 + 0.08, trim);
  const mast = shadowed(new Mesh(new CylinderGeometry(0.03, 0.04, S.mast.h, 6), frame));
  mast.position.set(S.mast.x, S.wall + S.mast.h / 2, S.mast.z);
  group.add(mast);
  const top = [S.mast.x, S.wall + S.mast.h, S.mast.z];
  for (const [dx, dz] of [[2.5, 2.5], [-2.5, 2], [0.5, -3]]) {
    group.add(tubeMesh(sagging(top, [S.mast.x + dx, S.wall + 0.25, S.mast.z + dz], 0.05), 0.008, frame, { segments: 8, sides: 4 }));
  }

  return { object: group, update() {} };
}
