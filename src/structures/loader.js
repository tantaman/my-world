// Places registered structures into the world on their flattened pads.

import * as THREE from 'three';

export function placeStructures(scene, structures, gen, materials) {
  const placed = [];
  for (const s of structures) {
    const groundY = gen.height(s.x, s.z);
    const obj = s.build({ THREE, groundY, materials, world: gen });
    if (!obj) continue;
    obj.position.set(s.x, groundY, s.z);
    obj.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    obj.userData.structure = s;
    scene.add(obj);
    placed.push({ def: s, object: obj });
  }
  return placed;
}
