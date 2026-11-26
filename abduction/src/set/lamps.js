// The row of street lamps along the verge (PLAN.md 4): tapered poles with a
// collar part way up, an arm out over the road, a flat head glowing warm.
// One instanced mesh per part; which few are real lights is light/rig.js.
import { Group, InstancedMesh, CylinderGeometry, BoxGeometry, TorusGeometry, Object3D, MeshStandardNodeMaterial, Color } from 'three/webgpu';
import { vec3 } from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { LAMPS, lampX } from './layout.js';
import { weathered } from '../materials/weathered.js';

const HEAD_GLOW = 14;     // emissive strength of a lamp's glass (blooms above 1)

export function createLamps() {
  const group = new Group();
  const n = LAMPS.count;
  const paint = weathered({ colour: '#1e201f', rust: 0.35, rough: 0.55, metal: 0.4, streaks: 0.3, wet: 0.4, bump: 0 });
  const glass = new MeshStandardNodeMaterial({ color: new Color(1, 0.9, 0.8), roughness: 0.2 });
  glass.emissiveNode = vec3(1.0, 0.84, 0.69).mul(HEAD_GLOW);

  const shaft = LAMPS.pole - LAMPS.arm;
  const pole = new CylinderGeometry(0.055, 0.1, shaft, 10);
  pole.translate(0, shaft / 2, 0);
  const collar = new CylinderGeometry(0.11, 0.11, 0.25, 10);
  collar.translate(0, 1.9, 0);
  // The arm: a quarter turn of tube from the pole's top out over the road,
  // centred so it leaves the pole going up and reaches the head going out.
  const arm = new TorusGeometry(LAMPS.arm, 0.04, 6, 14, Math.PI / 2);
  arm.rotateY(Math.PI / 2);
  arm.translate(0, shaft, LAMPS.arm);
  const head = new BoxGeometry(0.22, 0.09, 0.55);
  head.translate(0, LAMPS.pole - 0.04, LAMPS.arm);
  const lens = new BoxGeometry(0.16, 0.02, 0.42);
  lens.translate(0, LAMPS.pole - 0.095, LAMPS.arm);

  // Everything painted is one geometry, so a lamp is two draws: paint and glass.
  const painted = mergeGeometries([pole, collar, arm, head].map((g) => { const n = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(n.attributes)) if (!['position', 'normal', 'uv'].includes(k)) n.deleteAttribute(k); return n; }));
  const parts = [[painted, paint], [lens, glass]];
  const dummy = new Object3D();
  for (const [g, m] of parts) {
    const inst = new InstancedMesh(g, m, n);
    for (let k = 0; k < n; k++) {
      dummy.position.set(lampX(k), 0, LAMPS.z);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      inst.setMatrixAt(k, dummy.matrix);
    }
    inst.castShadow = m !== glass;
    inst.receiveShadow = true;
    inst.frustumCulled = false;
    group.add(inst);
  }
  return { object: group, update() {} };
}
