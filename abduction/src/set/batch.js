// Merges the set's unmoving meshes, by material, into one mesh each, so the
// scene is drawn in a few dozen calls rather than hundreds (PLAN.md section
// 8's budget: under 150), in every pass that draws it: the scene, the
// mirror, and each shadow map.
//
// Only plain meshes with one material are merged; instanced meshes, meshes
// with a material per face, and anything transparent are left as they are.
import { Mesh, Group } from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export function batchStatic(root) {
  root.updateMatrixWorld(true);
  const buckets = new Map();
  const merged = [];
  root.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || Array.isArray(o.material) || o.material.transparent) return;
    if (o.geometry.morphAttributes && Object.keys(o.geometry.morphAttributes).length) return;
    const key = `${o.material.uuid}|${o.castShadow}|${o.receiveShadow}|${o.renderOrder}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(o);
  });
  const out = new Group();
  let before = 0;
  for (const meshes of buckets.values()) {
    if (meshes.length < 2) continue;
    const geos = meshes.map((m) => {
      let g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
      // Keep only what every mesh has, so they can be merged.
      for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
      if (!g.attributes.uv) return null;
      g.applyMatrix4(m.matrixWorld);
      return g;
    });
    if (geos.some((g) => !g)) continue;
    const g = mergeGeometries(geos, false);
    if (!g) continue;
    const first = meshes[0];
    const mesh = new Mesh(g, first.material);
    mesh.castShadow = first.castShadow;
    mesh.receiveShadow = first.receiveShadow;
    mesh.renderOrder = first.renderOrder;
    out.add(mesh);
    merged.push(...meshes);
    before += meshes.length;
  }
  for (const m of merged) m.removeFromParent();
  root.add(out);
  return { meshes: before, into: out.children.length };
}
