// Milestone 0's grey boxes: every object of PLAN.md section 4 at its size,
// for fitting the camera and the lens before anything is modelled. Shown
// with ?blockout instead of the real set.
import { Group, Mesh, HemisphereLight, BoxGeometry, CylinderGeometry, PlaneGeometry, MeshStandardNodeMaterial, Color } from 'three/webgpu';
import * as L from './layout.js';

export function createBlockout({ ground: withGround = true, light = true } = {}) {
  const group = new Group();
  const grey = new MeshStandardNodeMaterial({ color: new Color(0.5, 0.5, 0.5), roughness: 0.8 });
  const dark = new MeshStandardNodeMaterial({ color: new Color(0.15, 0.15, 0.15), roughness: 0.9 });
  const box = (x0, y0, z0, x1, y1, z1, m = grey) => {
    const mesh = new Mesh(new BoxGeometry(x1 - x0, y1 - y0, z1 - z0), m);
    mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    group.add(mesh);
    return mesh;
  };
  const ground = new Mesh(new PlaneGeometry(900, 400), dark);
  ground.rotation.x = -Math.PI / 2;
  ground.position.z = 100;
  if (withGround) group.add(ground);
  const S = L.SHOP;
  box(S.x0, 0, S.z0, S.x1, S.parapet, S.z1);
  const C = L.CANOPY;
  box(C.x0, C.under, C.z0, C.x1, C.under + C.thick, C.z1);
  for (const is of L.ISLANDS) {
    box(is.x - L.ISLAND.len / 2, 0, is.z - L.ISLAND.wid / 2, is.x + L.ISLAND.len / 2, L.ISLAND.h, is.z + L.ISLAND.wid / 2);
    box(is.x - 0.22, 0, is.z - 0.22, is.x + 0.22, C.under, is.z + 0.22);
    box(is.x + L.ISLAND.pumpDx - 0.37, 0, is.z - 0.25, is.x + L.ISLAND.pumpDx + 0.37, L.PUMP.h, is.z + 0.25);
  }
  const V = L.VAN;
  box(V.x - V.len / 2, 0.3, V.z - V.wid / 2, V.x + V.len / 2, V.h, V.z + V.wid / 2);
  for (let k = 0; k < L.LAMPS.count; k++) {
    const x = L.lampX(k);
    box(x - 0.08, 0, L.LAMPS.z - 0.08, x + 0.08, L.LAMPS.pole, L.LAMPS.z + 0.08);
    box(x - 0.25, L.LAMPS.pole - 0.1, L.LAMPS.z, x + 0.25, L.LAMPS.pole, L.LAMPS.z + L.LAMPS.arm);
  }
  for (let x = L.FENCE.x0; x <= L.FENCE.x1; x += L.FENCE.step) {
    box(x - 0.06, 0, L.FENCE.z - 0.06, x + 0.06, L.FENCE.post, L.FENCE.z + 0.06);
  }
  const sign = box(-L.SIGN.w / 2, L.SIGN.y, -0.05, L.SIGN.w / 2, L.SIGN.y + L.SIGN.h, 0.05);
  sign.position.set(L.SIGN.x, L.SIGN.y + L.SIGN.h / 2, L.SIGN.z);
  sign.rotation.y = L.SIGN.yaw;
  box(L.COW.x - 1.1, 0.6, L.COW.z - 0.3, L.COW.x + 1.1, L.COW.shoulder, L.COW.z + 0.3);
  const tree = new CylinderGeometry(3, 3, 1.2, 10);
  for (let i = 0; i < 40; i++) {
    const m = new Mesh(tree, grey);
    m.position.set(L.TREES.x0 + ((i * 37) % 300), 6, L.TREES.z0 + ((i * 53) % 110));
    group.add(m);
  }
  if (!light) return { object: group, update() {} };
  const ufo = new Mesh(new CylinderGeometry(L.UFO.radius, L.UFO.radius * 0.6, L.UFO.depth, 24), grey);
  ufo.position.set(L.UFO.x, L.UFO.y + 4, L.UFO.z);
  group.add(ufo);
  if (light) group.add(new HemisphereLight(0xbbbbcc, 0x222222, 2.0));
  return { object: group, update() {} };
}
