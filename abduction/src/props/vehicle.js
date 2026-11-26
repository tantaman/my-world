// What the van and the sedan share: a body extruded from a side profile with
// rounded corners, wheels, dark glass. Each returns an Object3D whose origin
// is on the ground under the middle, facing +X.
import { Group, Mesh, Shape, ExtrudeGeometry, CylinderGeometry, BoxGeometry, MeshStandardNodeMaterial, Color } from 'three/webgpu';
import { weathered } from '../materials/weathered.js';

// A side profile [[x, y], ...] (x along the length from the back, y up),
// extruded to `width` and centred, with softened edges.
export function extrudedBody(profile, width, material, bevel = 0.06) {
  const s = new Shape();
  s.moveTo(profile[0][0], profile[0][1]);
  for (let i = 1; i < profile.length; i++) s.lineTo(profile[i][0], profile[i][1]);
  s.closePath();
  const g = new ExtrudeGeometry(s, { depth: width - 2 * bevel, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 4 });
  const len = Math.max(...profile.map((p) => p[0]));
  g.translate(-len / 2, 0, -(width - 2 * bevel) / 2);
  g.computeVertexNormals();
  const m = new Mesh(g, material);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

const tyreMat = weathered({ colour: '#151515', rough: 0.85, dirt: 0.3, bump: 0 });

// A wheel: tyre and hub, its axle along Z.
export function wheel(radius, width, hubColour = '#d8d4c8') {
  const g = new Group();
  const tyre = new Mesh(new CylinderGeometry(radius, radius, width, 20), tyreMat);
  tyre.rotation.x = Math.PI / 2;
  const hubMat = weathered({ colour: hubColour, rust: 0.3, rough: 0.4, metal: 0.5, bump: 0 });
  const hub = new Mesh(new CylinderGeometry(radius * 0.55, radius * 0.55, width + 0.02, 14), hubMat);
  hub.rotation.x = Math.PI / 2;
  g.add(tyre, hub);
  g.traverse((o) => { o.castShadow = true; });
  return g;
}

export function darkGlass() {
  return new MeshStandardNodeMaterial({ color: new Color(0.01, 0.012, 0.013), roughness: 0.05, metalness: 0.2 });
}

export function pane(w, h, material) {
  const m = new Mesh(new BoxGeometry(w, h, 0.02), material);
  return m;
}
