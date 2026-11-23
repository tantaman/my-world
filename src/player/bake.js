// One body: the pieces of someone dressed that keep their shape, merged into
// a few meshes.
//
// A hiker is dressed a piece at a time (clothing.js): a panel, a buckle, a
// lace, each a mesh hung on whichever bone carries it. Drawn like that, one
// person is fifty-odd draws, and as many again for their shadow, and on a
// split screen every part draws everyone. So once someone is dressed, the
// pieces that keep their shape are merged into one skinned mesh for each kind
// of surface. Every vertex is carried wholly by what its piece hung from (a
// bone, or a group on one), so it moves exactly as the piece did. A plain or
// woven surface also takes its colour and its roughness into the vertices,
// so all the pieces with the same weave (or none) are one mesh, whatever
// colour each is.
//
// Left as they were:
//   - cloth that bends over a joint (already skinned: clothing.js limb())
//   - whatever is drawn its own way each time (an onBeforeRender: the hair's
//     layers, fewer from further off), or has morph targets, a list of
//     surfaces, a draw range or a render order of its own, or is hidden or on
//     a layer of its own
//   - anything named, and all it holds: something put on and taken off and
//     found again by its name (a fighter's helmet: skirmish/figures.js)
//   - whatever is hung on afterwards (a tool in the hand, a headlamp): it
//     isn't part of what was dressed
//
// The merged pieces stay where they hung, on no layer. They aren't drawn,
// but whatever hangs from them still is, and moves with them.

import * as THREE from 'three';

// m (of the grown-up body) added round what the pieces covered as they were
// dressed, for whatever pose they're in later (an arm raised over the head),
// in the sphere a merged mesh is kept in view by.
const POSE_SLACK = 0.5;

const LAYER_DRAWN = 1; // layer 0's bit: what a camera draws
const plainRender = THREE.Object3D.prototype.onBeforeRender;
const plainCompile = THREE.Material.prototype.onBeforeCompile;
const plainKey = THREE.Material.prototype.customProgramCacheKey;
// The maps a surface is drawn with that are read through its uvs.
const MAPS = ['map', 'roughnessMap', 'bumpMap', 'normalMap', 'metalnessMap', 'emissiveMap', 'alphaMap', 'aoMap', 'lightMap'];

const _rootInv = new THREE.Matrix4();
const _rel = new THREE.Matrix4();
const _normal = new THREE.Matrix3();
const _v = new THREE.Vector3();
const _c = new THREE.Color();

// Does this piece keep its shape, and is it drawn the plain way, so that it
// can go into a merged mesh? (Its own transform, against what it hangs from,
// is taken to stay as it was dressed.)
function mergeable(o, root) {
  if (!o.isMesh || o.isSkinnedMesh || o.isInstancedMesh || o.isBatchedMesh) return false;
  if (o.onBeforeRender !== plainRender || o.renderOrder !== 0 || !o.frustumCulled || o.layers.mask !== LAYER_DRAWN) return false;
  if (Array.isArray(o.material) || o.customDepthMaterial || o.customDistanceMaterial || o.morphTargetInfluences) return false;
  const g = o.geometry;
  const a = g.attributes;
  // (groups are only for a list of surfaces: with one, the whole is drawn)
  if (!a.position || !a.normal || a.tangent || g.drawRange.start !== 0 || g.drawRange.count !== Infinity) return false;
  if (Object.keys(g.morphAttributes).length || (a.color && a.color.itemSize !== 3)) return false;
  // shown, and nobody's to find again by name, all the way up
  for (let p = o; p && p !== root; p = p.parent) if (!p.visible || p.name) return false;
  return true;
}

// Can the surface go into a mesh with others, its colour and roughness in
// its vertices? (A plain MeshStandardMaterial, opaque, not drawn its own way.)
function foldable(m) {
  return m.type === 'MeshStandardMaterial' && m.onBeforeCompile === plainCompile && m.customProgramCacheKey === plainKey && !m.transparent && !m.displacementMap && !m.envMap;
}

// What such surfaces must share to be one: everything but their colour and
// roughness.
function surfaceKey(m) {
  return JSON.stringify([
    ...MAPS.map((k) => m[k]?.uuid ?? null),
    m.bumpScale, m.normalScale.x, m.normalScale.y, m.metalness, m.emissive.getHex(), m.emissiveIntensity, m.aoMapIntensity,
    m.side, m.alphaTest, m.alphaToCoverage, m.flatShading, m.depthTest, m.depthWrite, m.wireframe, m.fog, m.toneMapped, m.opacity, m.dithering,
    m.polygonOffset, m.polygonOffsetFactor, m.polygonOffsetUnits, m.shadowSide,
  ]);
}

// A surface for merged pieces: as theirs, white, rough as its vertices say
// (aRough), so their own roughness can differ.
function sharedSurface(m) {
  const s = m.clone();
  s.color.set(0xffffff);
  s.roughness = 1;
  s.vertexColors = true;
  s.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aRough;\nvarying float vRough;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRough = aRough;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vRough;')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor *= vRough;');
  };
  s.customProgramCacheKey = () => 'baked-surface-v1';
  return s;
}

// The attributes a piece of its own kind brings, and their sizes: pieces are
// merged with others whose are the same.
const attributesOf = (g) =>
  Object.keys(g.attributes)
    .sort()
    .map((k) => `${k}:${g.attributes[k].itemSize}`)
    .join(',');

// Merge the pieces in `dressed` (the objects just hung on the body, with all
// they hold) that keep their shape.
//   root    the body's root: what everything is measured from
//   hips    the body from the hips, which hides the whole of it but not what
//           is on the root (first person); what hung under it is merged
//           under it, and the rest onto the root
// -> { meshes, made }: the merged meshes, hung on hips or root, and what was
//    made for them (their geometries, new surfaces and the skeleton), for
//    whoever puts them away. Each mesh's userData.pieces says where each
//    piece went: [{ piece, start, count }], start and count in vertices.
export function bake(root, hips, dressed) {
  root.updateMatrixWorld(true);
  _rootInv.copy(root.matrixWorld).invert();
  const under = new Set();
  hips.traverse((o) => under.add(o));

  // The pieces, sorted into what each will be merged into.
  const groups = new Map();
  const bones = new Map(); // what a piece hung from -> its place in the skeleton
  for (const top of dressed) {
    top.traverse((o) => {
      if (!mergeable(o, root)) return;
      const m = o.material;
      const fold = foldable(m);
      const on = under.has(o) ? hips : root;
      const key = `${on === hips}|${o.castShadow}|${fold ? surfaceKey(m) : `${m.uuid}|${attributesOf(o.geometry)}`}`;
      if (!groups.has(key)) groups.set(key, { fold, material: m, on, castShadow: o.castShadow, pieces: [] });
      if (!bones.has(o.parent)) bones.set(o.parent, bones.size);
      groups.get(key).pieces.push(o);
    });
  }
  if (!groups.size) return { meshes: [], made: [] };

  // Each bone as it is now, measured from the root, is how it was when its
  // pieces were hung on it.
  const list = [...bones.keys()];
  const inverses = list.map((b) => new THREE.Matrix4().multiplyMatrices(_rootInv, b.matrixWorld).invert());
  const skeleton = new THREE.Skeleton(list, inverses);
  const meshes = [];
  const made = [skeleton];
  for (const g of groups.values()) {
    const mesh = merge(g, bones, skeleton);
    meshes.push(mesh);
    made.push(mesh.geometry);
    if (mesh.material !== g.material) made.push(mesh.material);
  }
  // and the pieces themselves aren't drawn any more
  for (const g of groups.values()) for (const p of g.pieces) p.layers.disableAll();
  return { meshes, made };
}

// One merged mesh: the group's pieces, each moved to where it is from the
// root and bound wholly to what it hung from.
function merge(group, bones, skeleton) {
  const { pieces, fold } = group;
  const m = group.material;
  const first = pieces[0].geometry;
  const withUv = fold ? MAPS.some((k) => m[k]) : !!first.attributes.uv;
  const withColor = fold || !!first.attributes.color;
  // (a piece of its own kind brings whatever else its surface reads, as it is)
  const others = fold ? [] : Object.keys(first.attributes).filter((k) => !['position', 'normal', 'uv', 'color'].includes(k));
  let vertices = 0;
  let indices = 0;
  for (const p of pieces) {
    vertices += p.geometry.attributes.position.count;
    indices += p.geometry.index ? p.geometry.index.count : p.geometry.attributes.position.count;
  }
  const position = new Float32Array(vertices * 3);
  const normal = new Float32Array(vertices * 3);
  const uv = withUv ? new Float32Array(vertices * 2) : null;
  const color = withColor ? new Float32Array(vertices * 3) : null;
  const rough = fold ? new Float32Array(vertices) : null;
  const extra = others.map((k) => new Float32Array(vertices * first.attributes[k].itemSize));
  const skinIndex = new Uint16Array(vertices * 4);
  const skinWeight = new Float32Array(vertices * 4);
  const index = vertices > 65535 ? new Uint32Array(indices) : new Uint16Array(indices);
  const where = [];

  let v0 = 0;
  let i0 = 0;
  for (const p of pieces) {
    const g = p.geometry;
    const a = g.attributes;
    const n = a.position.count;
    _rel.multiplyMatrices(_rootInv, p.matrixWorld);
    _normal.getNormalMatrix(_rel);
    // a piece mirrored as it was hung (an ear on the other side) was drawn
    // with its faces turned the other way; merged, they're turned in it
    const mirrored = _rel.determinant() < 0;
    const bone = bones.get(p.parent);
    // its own colours, where its surface reads them, times the surface's
    const tint = (fold ? p.material.vertexColors : true) && a.color ? a.color : null;
    if (fold) _c.copy(p.material.color);
    else _c.setRGB(1, 1, 1);
    for (let i = 0; i < n; i++) {
      const v = v0 + i;
      _v.fromBufferAttribute(a.position, i).applyMatrix4(_rel);
      position[v * 3] = _v.x;
      position[v * 3 + 1] = _v.y;
      position[v * 3 + 2] = _v.z;
      _v.fromBufferAttribute(a.normal, i).applyMatrix3(_normal).normalize();
      normal[v * 3] = _v.x;
      normal[v * 3 + 1] = _v.y;
      normal[v * 3 + 2] = _v.z;
      if (uv && a.uv) {
        uv[v * 2] = a.uv.getX(i);
        uv[v * 2 + 1] = a.uv.getY(i);
      }
      if (color) {
        color[v * 3] = (tint ? tint.getX(i) : 1) * _c.r;
        color[v * 3 + 1] = (tint ? tint.getY(i) : 1) * _c.g;
        color[v * 3 + 2] = (tint ? tint.getZ(i) : 1) * _c.b;
      }
      if (rough) rough[v] = p.material.roughness;
      for (let k = 0; k < others.length; k++) {
        const src = a[others[k]];
        for (let c = 0; c < src.itemSize; c++) extra[k][v * src.itemSize + c] = src.getComponent(i, c);
      }
      skinIndex[v * 4] = bone;
      skinWeight[v * 4] = 1;
    }
    const count = g.index ? g.index.count : n;
    const at = (i) => v0 + (g.index ? g.index.getX(i) : i);
    for (let i = 0; i < count; i += 3) {
      index[i0 + i] = at(i);
      index[i0 + i + 1] = at(mirrored ? i + 2 : i + 1);
      index[i0 + i + 2] = at(mirrored ? i + 1 : i + 2);
    }
    where.push({ piece: p, start: v0, count: n });
    v0 += n;
    i0 += count;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  if (uv) geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  if (color) geometry.setAttribute('color', new THREE.BufferAttribute(color, 3));
  if (rough) geometry.setAttribute('aRough', new THREE.BufferAttribute(rough, 1));
  others.forEach((k, j) => geometry.setAttribute(k, new THREE.BufferAttribute(extra[j], first.attributes[k].itemSize)));
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
  geometry.setAttribute('skinWeight', new THREE.BufferAttribute(skinWeight, 4));
  geometry.setIndex(new THREE.BufferAttribute(index, 1));

  const mesh = new THREE.SkinnedMesh(geometry, fold ? sharedSurface(m) : m);
  mesh.name = ''; // (found by nobody)
  mesh.castShadow = group.castShadow;
  mesh.receiveShadow = true;
  // The vertices are measured from the root, and each bone's place is too,
  // so the mesh is bound as it stands, wherever it is hung.
  mesh.bind(skeleton, new THREE.Matrix4());
  group.on.add(mesh);
  // Kept in view by a sphere round what the pieces covered as they were
  // dressed, in the frame of what the mesh hangs on, with room for any pose.
  group.on.updateMatrixWorld(true);
  _rel.multiplyMatrices(_rootInv, group.on.matrixWorld).invert();
  const box = new THREE.Box3();
  for (let v = 0; v < vertices; v++) box.expandByPoint(_v.fromArray(position, v * 3).applyMatrix4(_rel));
  const centre = box.getCenter(new THREE.Vector3());
  let far = 0;
  for (let v = 0; v < vertices; v++) far = Math.max(far, centre.distanceTo(_v.fromArray(position, v * 3).applyMatrix4(_rel)));
  mesh.boundingSphere = new THREE.Sphere(centre, far + POSE_SLACK);
  mesh.userData.pieces = where;
  return mesh;
}
