// The fence along the field: wooden posts every 4 m, some leaning, three
// wires. Posts instanced; wires are long thin tubes, one per strand.
import { Group, InstancedMesh, BoxGeometry, CylinderGeometry, Object3D, Mesh } from 'three/webgpu';
import { FENCE } from './layout.js';
import { weathered } from '../materials/weathered.js';
import { pbr } from '../materials/textures.js';
import { rand } from '../noise1.js';

const WIRES = [0.45, 0.78, 1.1];   // heights of the strands, metres

export function createFence() {
  const group = new Group();
  const wood = weathered({ colour: '#4a3e30', under: '#2c241b', scale: 0.3, vary: 0.4, streaks: 0.6, dirt: 0.5, rough: 0.9, wet: 0.5,
    photo: pbr('wood_planks_grey'), photoScale: 1.2, photoSat: 0.4, photoContrast: 1.3 });
  const wire = weathered({ colour: '#3a3a38', rust: 0.6, metal: 0.5, rough: 0.5, bump: 0, photo: pbr('rust_coarse_01'), photoScale: 0.4 });
  const count = Math.floor((FENCE.x1 - FENCE.x0) / FENCE.step) + 1;
  const post = new BoxGeometry(0.12, FENCE.post + 0.1, 0.12);
  post.translate(0, (FENCE.post + 0.1) / 2 - 0.1, 0);
  const posts = new InstancedMesh(post, wood, count);
  const dummy = new Object3D();
  for (let i = 0; i < count; i++) {
    dummy.position.set(FENCE.x0 + i * FENCE.step + (rand(i, 1) - 0.5) * 0.4, 0, FENCE.z + (rand(i, 2) - 0.5) * 0.15);
    const lean = rand(i, 3) < 0.25 ? (rand(i, 4) - 0.5) * 0.35 : (rand(i, 4) - 0.5) * 0.06;
    dummy.rotation.set((rand(i, 5) - 0.5) * 0.08, rand(i, 6) * 0.6, lean);
    dummy.scale.set(1, 0.9 + rand(i, 7) * 0.2, 1);
    dummy.updateMatrix();
    posts.setMatrixAt(i, dummy.matrix);
  }
  posts.castShadow = true;
  posts.receiveShadow = true;
  posts.frustumCulled = false;
  group.add(posts);
  for (const h of WIRES) {
    const w = new Mesh(new CylinderGeometry(0.006, 0.006, FENCE.x1 - FENCE.x0, 3), wire);
    w.rotation.z = Math.PI / 2;
    w.position.set((FENCE.x0 + FENCE.x1) / 2, h, FENCE.z);
    group.add(w);
  }
  return { object: group, update() {} };
}
