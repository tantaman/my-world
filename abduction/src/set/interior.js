// The shop, through the glass (PLAN.md 5.9): a room; a counter with a till;
// wall shelves and two wire racks carrying a few hundred instanced bottles,
// tins and boxes in reds, ambers and greens; two pendant lamps; ceiling
// tubes. Its lights are in light/rig.js.
import { Group, Mesh, BoxGeometry, CylinderGeometry, InstancedMesh, Object3D, Color, MeshStandardNodeMaterial, BackSide, SphereGeometry } from 'three/webgpu';
import { vec3, instanceIndex, hash, float, mix, color } from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SHOP } from './layout.js';
import { weathered } from '../materials/weathered.js';
import { rand } from '../noise1.js';

export function createInterior() {
  const g = new Group();
  const S = SHOP;
  const T = 0.26;
  const wall = weathered({ colour: '#6a3e2c', under: '#3a2a20', scale: 1.0, streaks: 0.3, dirt: 0.4, rough: 0.85, wet: 0, bump: 0 });
  const floor = weathered({ colour: '#4a4038', scale: 0.6, streaks: 0, dirt: 0, rough: 0.6, wet: 0, bump: 0 });
  const ceiling = weathered({ colour: '#5a5650', scale: 1, streaks: 0, dirt: 0, rough: 0.9, wet: 0, bump: 0 });
  // The room: a box seen from inside.
  const room = new Mesh(new BoxGeometry(S.x1 - S.x0 - 2 * T, S.wall - 0.02, S.z1 - S.z0 - 2 * T), [wall, wall, ceiling, floor, wall, wall]);
  room.material = [wall, wall, ceiling, floor, wall, wall].map((m) => { const c = m.clone(); c.side = BackSide; return c; });
  room.position.set((S.x0 + S.x1) / 2, S.wall / 2 + 0.01, (S.z0 + S.z1) / 2);
  room.receiveShadow = true;
  g.add(room);

  const wood = weathered({ colour: '#9a7a50', scale: 0.4, streaks: 0, dirt: 0.2, rough: 0.5, wet: 0, bump: 0 });
  const metal = weathered({ colour: '#5a5a56', rust: 0.2, metal: 0.5, rough: 0.5, wet: 0, bump: 0 });
  const add = (geo, m, x, y, z) => { const mesh = new Mesh(geo, m); mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; g.add(mesh); return mesh; };
  // Counter with a till, near the window.
  add(new BoxGeometry(3.2, 0.95, 0.7), wood, -0.8, 0.475, -1.3);
  add(new BoxGeometry(3.3, 0.05, 0.8), wood, -0.8, 0.97, -1.3);
  add(new BoxGeometry(0.42, 0.25, 0.36), weathered({ colour: '#d8d6cc', rough: 0.4, wet: 0, bump: 0 }), 0.4, 1.12, -1.3);
  add(new BoxGeometry(0.3, 0.06, 0.2), metal, 0.4, 1.28, -1.25);

  // Shelving: three wall shelves along the back wall and two racks.
  const shelves = [];
  for (let i = 0; i < 3; i++) shelves.push({ x0: -6.5 + i * 3.6, x1: -3.6 + i * 3.6, z: S.z0 + T + 0.25, levels: [0.4, 0.85, 1.3, 1.75, 2.2] });
  shelves.push({ x0: 1.8, x1: 4.6, z: -3.6, levels: [0.3, 0.75, 1.2, 1.65] });
  shelves.push({ x0: 1.8, x1: 4.6, z: -2.3, levels: [0.3, 0.75, 1.2, 1.65] });
  for (const s of shelves) {
    for (const y of s.levels) add(new BoxGeometry(s.x1 - s.x0, 0.03, 0.4), metal, (s.x0 + s.x1) / 2, y, s.z);
    for (const x of [s.x0, s.x1]) add(new BoxGeometry(0.04, s.levels.at(-1) + 0.1, 0.42), metal, x, (s.levels.at(-1) + 0.1) / 2, s.z);
  }
  // Goods: one instanced box shape for everything, sized and coloured per instance.
  const goods = [];
  for (const s of shelves) {
    for (const y of s.levels) {
      let x = s.x0 + 0.08;
      while (x < s.x1 - 0.1) {
        const w = 0.07 + rand(goods.length, 1) * 0.14;
        const h = 0.1 + rand(goods.length, 2) * 0.25;
        goods.push([x + w / 2, y + 0.015 + h / 2, s.z + (rand(goods.length, 3) - 0.5) * 0.1, w, h]);
        x += w + 0.015;
      }
    }
  }
  const goodsMat = new MeshStandardNodeMaterial({ roughness: 0.5 });
  const pick = hash(float(instanceIndex).mul(1.7));
  const palette = mix(mix(color('#7a1810'), color('#a8661c'), smoothstepJS(pick, 0.3, 0.55)), color('#2c4a26'), smoothstepJS(pick, 0.75, 0.9));
  goodsMat.colorNode = palette.mul(hash(float(instanceIndex).mul(3.1)).mul(0.6).add(0.6));
  // Two shapes: bottles (most of what the original's shelves hold) and boxes.
  const bottle = new CylinderGeometry(0.35, 0.5, 1, 8);
  const neck = new CylinderGeometry(0.15, 0.15, 0.35, 6);
  neck.translate(0, 0.62, 0);
  const bottleGeo = mergeGeometries([bottle.toNonIndexed(), neck.toNonIndexed()]);
  const bottles = goods.filter((_, i) => rand(i, 5) < 0.7);
  const boxes = goods.filter((_, i) => rand(i, 5) >= 0.7);
  const d = new Object3D();
  for (const [geo, list, depth] of [[bottleGeo, bottles, null], [new BoxGeometry(1, 1, 0.12), boxes, 1]]) {
    const inst = new InstancedMesh(geo, goodsMat, list.length);
    list.forEach(([x, y, z, w, h], i) => {
      d.position.set(x, y - (depth ? 0 : h * 0.12), z);
      d.scale.set(depth ? w : 0.07, depth ? h : h * 0.8, depth ?? 0.07);
      d.updateMatrix();
      inst.setMatrixAt(i, d.matrix);
    });
    g.add(inst);
  }

  // Pendant lamps over the counter, and ceiling tubes.
  const shade = weathered({ colour: '#8a4a22', rough: 0.5, metal: 0.3, wet: 0, bump: 0 });
  const bulb = new MeshStandardNodeMaterial({ color: new Color(1, 0.8, 0.6) });
  bulb.emissiveNode = vec3(1.0, 0.62, 0.32).mul(9);
  for (const [x, z] of [[-0.5, -1.5], [3.4, -2.0]]) {
    add(new CylinderGeometry(0.005, 0.005, 0.7, 3), metal, x, S.wall - 0.35, z);
    const sh = add(new CylinderGeometry(0.08, 0.26, 0.2, 14, 1, true), shade, x, S.wall - 0.8, z);
    sh.material = shade.clone();
    sh.material.side = 2;
    add(new SphereGeometry(0.08, 10, 8), bulb, x, S.wall - 0.88, z);
  }
  const tube = new MeshStandardNodeMaterial({ color: new Color(1, 1, 1) });
  tube.emissiveNode = vec3(1.0, 0.96, 0.9).mul(5);
  for (const x of [-5, 1.5]) add(new BoxGeometry(1.2, 0.05, 0.1), tube, x, S.wall - 0.05, -4.5);
  return { object: g, update() {} };
}

// smoothstep for nodes with the edges first given as plain numbers.
function smoothstepJS(x, a, b) {
  const t = x.sub(a).div(b - a).clamp(0, 1);
  return t.mul(t).mul(float(3).sub(t.mul(2)));
}
