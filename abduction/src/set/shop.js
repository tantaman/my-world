// The shop: rendered concrete, a dark green band along the foot of the wall,
// a flat roof with a parapet, a vent stack and a thin mast with guy wires.
// The front has a glazed part with a glass door; the west end a green door
// under a lamp. Boxes with sizes from layout.js; the look is the weathered
// material. The inside is set/interior.js; the glass is materials/glass.js.
import { Group, Mesh, BoxGeometry, CylinderGeometry, SphereGeometry, Color, MeshStandardNodeMaterial, TubeGeometry, CatmullRomCurve3, Vector3 } from 'three/webgpu';
import { vec3, float } from 'three/tsl';
import { SHOP, PHONE } from './layout.js';
import { weathered } from '../materials/weathered.js';
import { signBoard } from './signs.js';
import { createGlass } from '../materials/glass.js';

export function createShop() {
  const group = new Group();
  const S = SHOP;
  const G = S.glass;

  const render = weathered({ colour: '#7d776b', under: '#5d574d', scale: 1.4, vary: 0.3, streaks: 0.55, dirt: 0.6, dirtHeight: 1.0,
    band: { colour: '#1f3a2a', height: S.band }, rough: 0.85, wet: 0.2, bump: 1 });
  const roofMat = weathered({ colour: '#4c4a45', scale: 2, streaks: 0.2, dirt: 0, rough: 0.8, wet: 0.5 });
  const trim = weathered({ colour: '#2f3a33', under: '#555', peel: 0.15, rust: 0.2, rough: 0.6, wet: 0.2 });
  const frame = weathered({ colour: '#1d211e', rust: 0.25, rough: 0.5, metal: 0.4, wet: 0.2, bump: 0 });
  const doorMat = weathered({ colour: '#2e5a3a', under: '#6b6150', peel: 0.25, rust: 0.2, rough: 0.6, streaks: 0.4, dirt: 0.4 });

  const box = (x0, y0, z0, x1, y1, z1, m = render) => {
    const mesh = new Mesh(new BoxGeometry(x1 - x0, y1 - y0, z1 - z0), m);
    mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };
  const T = 0.25; // wall thickness

  // Back and side walls.
  box(S.x0, 0, S.z0, S.x1, S.wall, S.z0 + T);
  box(S.x0, 0, S.z0, S.x0 + T, S.wall, S.z1);
  box(S.x1 - T, 0, S.z0, S.x1, S.wall, S.z1);
  // The front: solid west part, sill and head round the glass, east part.
  box(S.x0, 0, S.z1 - T, G.x0, S.wall, S.z1);
  box(G.x1, 0, S.z1 - T, S.x1, S.wall, S.z1);
  box(G.x0, 0, S.z1 - T, G.x1, G.sill, S.z1);
  box(G.x0, G.head, S.z1 - T, G.x1, S.wall, S.z1);
  // Roof slab, parapet and its coping.
  box(S.x0, S.wall, S.z0, S.x1, S.wall + 0.25, S.z1, roofMat);
  box(S.x0 - 0.05, S.wall, S.z1 - 0.2, S.x1 + 0.05, S.parapet, S.z1 + 0.05);
  box(S.x0 - 0.05, S.wall, S.z0 - 0.05, S.x1 + 0.05, S.parapet, S.z0 + 0.2);
  box(S.x0 - 0.05, S.wall, S.z0, S.x0 + 0.2, S.parapet, S.z1);
  box(S.x1 - 0.2, S.wall, S.z0, S.x1 + 0.05, S.parapet, S.z1);
  box(S.x0 - 0.1, S.parapet, S.z1 - 0.25, S.x1 + 0.1, S.parapet + 0.08, S.z1 + 0.1, trim);
  // A ledge along the front above the windows.
  box(S.x0, 2.95, S.z1, S.x1, 3.05, S.z1 + 0.35, trim);

  // The shutter box over the glass, and the mullions.
  const sb = S.shutterBox;
  box(G.x0, sb.y, S.z1, G.x1, sb.y + sb.h, S.z1 + sb.d, trim);
  for (const x of G.mullions) box(x - 0.06, G.sill, S.z1 - 0.12, x + 0.06, G.head, S.z1 + 0.04, frame);
  box(G.x0, G.head - 0.08, S.z1 - 0.12, G.x1, G.head, S.z1 + 0.04, frame);
  box(G.x0, G.sill, S.z1 - 0.12, G.x1, G.sill + 0.06, S.z1 + 0.06, frame);
  // The glass, the door's own panes included.
  const glass = createGlass();
  const pane = new Mesh(new BoxGeometry(G.x1 - G.x0, G.head - G.sill, 0.02), glass);
  pane.position.set((G.x0 + G.x1) / 2, (G.sill + G.head) / 2, S.z1 - 0.06);
  pane.renderOrder = 2;
  group.add(pane);
  // The door (glass in a frame) reaches the ground.
  box(S.door.x0, 0, S.z1 - 0.14, S.door.x1, G.sill, S.z1 - 0.02, frame);
  const close = signBoard('close', [0.42, 0.18], { px: 96, depth: 0.005, streaks: 0, dirt: 0 });
  close.position.set((S.door.x0 + S.door.x1) / 2, 1.55, S.z1 + 0.02);
  group.add(close);

  // The west door: green, with a small sign.
  const wd = S.westDoor;
  box(wd.x - 0.06, 0, wd.z - wd.w / 2, wd.x + 0.02, wd.h, wd.z + wd.w / 2, doorMat);
  box(wd.x - 0.1, wd.h, wd.z - wd.w / 2 - 0.1, wd.x + 0.02, wd.h + 0.1, wd.z + wd.w / 2 + 0.1, frame);
  const staff = signBoard('staff', [0.34, 0.12], { px: 64, depth: 0.005 });
  staff.position.set(wd.x - 0.08, 1.6, wd.z);
  staff.rotation.y = -Math.PI / 2;
  group.add(staff);

  // Lamps on the walls: the door's (a dish) and the caged one on the front.
  const glow = new MeshStandardNodeMaterial({ color: new Color(0.1, 0.08, 0.05), roughness: 0.4 });
  glow.emissiveNode = vec3(1.0, 0.72, 0.38).mul(10);
  const dish = weathered({ colour: '#2a2a28', rust: 0.3, metal: 0.6, rough: 0.5, bump: 0 });
  const westLamp = new Group();
  const shade = new Mesh(new CylinderGeometry(0.08, 0.24, 0.16, 16, 1, true), dish);
  const bulb = new Mesh(new SphereGeometry(0.07, 12, 8), glow);
  bulb.position.y = -0.05;
  const arm = new Mesh(new BoxGeometry(0.3, 0.03, 0.03), dish);
  arm.position.set(0.15, 0.1, 0);
  westLamp.add(shade, bulb, arm);
  westLamp.position.set(S.westLamp.x - 0.3, S.westLamp.y, S.westLamp.z);
  group.add(westLamp);
  const caged = new Group();
  const cage = new Mesh(new CylinderGeometry(0.11, 0.11, 0.26, 10, 1, true), frame);
  const cbulb = new Mesh(new SphereGeometry(0.09, 12, 8), glow);
  const cap = new Mesh(new CylinderGeometry(0.13, 0.13, 0.05, 12), dish);
  cap.position.y = 0.14;
  caged.add(cage, cbulb, cap);
  caged.position.set(S.wallLamp.x, S.wallLamp.y, S.wallLamp.z + 0.12);
  group.add(caged);

  // Signs on the front's west part.
  const south = signBoard('south', [0.75, 1.05], { px: 256 });
  south.position.set(-7.6, 1.75, S.z1 + 0.03);
  const oil = signBoard('oil', [0.62, 0.95], { px: 256 });
  oil.position.set(-5.0, 1.75, S.z1 + 0.03);
  const tires = signBoard('tires', [0.72, 0.48], { px: 160 });
  tires.position.set(-4.0, 1.95, S.z1 + 0.03);
  group.add(south, oil, tires);

  // The phone box (grey, conduit running up).
  const phoneMat = weathered({ colour: '#6e706c', rust: 0.25, rough: 0.6, metal: 0.3 });
  box(PHONE.x - 0.25, 1.1, S.z1, PHONE.x + 0.25, 1.75, S.z1 + 0.18, phoneMat);
  const conduit = new Mesh(new CylinderGeometry(0.025, 0.025, S.wall - 1.75, 6), frame);
  conduit.position.set(PHONE.x + 0.15, (S.wall + 1.75) / 2, S.z1 + 0.05);
  group.add(conduit);

  // On the roof: the vent stack and the mast with its guy wires.
  const v = S.vent;
  box(v.x - v.w / 2, S.wall, v.z - v.w / 2, v.x + v.w / 2, S.wall + v.h, v.z + v.w / 2, render);
  box(v.x - v.w / 2 - 0.08, S.wall + v.h, v.z - v.w / 2 - 0.08, v.x + v.w / 2 + 0.08, S.wall + v.h + 0.1, v.z + v.w / 2 + 0.08, trim);
  const mast = new Mesh(new CylinderGeometry(0.03, 0.04, S.mast.h, 6), frame);
  mast.position.set(S.mast.x, S.wall + S.mast.h / 2, S.mast.z);
  group.add(mast);
  const top = new Vector3(S.mast.x, S.wall + S.mast.h, S.mast.z);
  for (const [dx, dz] of [[2.5, 2.5], [-2.5, 2], [0.5, -3]]) {
    const end = new Vector3(S.mast.x + dx, S.wall + 0.25, S.mast.z + dz);
    const mid = top.clone().lerp(end, 0.5);
    mid.y -= 0.05;
    const wire = new Mesh(new TubeGeometry(new CatmullRomCurve3([top, mid, end]), 8, 0.008, 4), frame);
    group.add(wire);
  }

  return { object: group, update() {} };
}
