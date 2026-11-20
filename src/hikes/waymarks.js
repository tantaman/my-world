// What stands on a hike: a cairn of stones where the photo was taken, a
// signpost at the trailhead pointing up the trail, and chains to hold on to
// where the trail has them. Made of primitives, like everything else; seeded,
// so each hike's cairn is its own.

import * as THREE from 'three';
import { mulberry32 } from '../noise.js';

const STONE = new THREE.MeshStandardMaterial({ color: 0x7a766c, roughness: 1, flatShading: true });
const WOOD = new THREE.MeshStandardMaterial({ color: 0x6b4f35, roughness: 0.95 });
const WOOD_DARK = new THREE.MeshStandardMaterial({ color: 0x4a3524, roughness: 0.95 });
const STEEL = new THREE.MeshStandardMaterial({ color: 0x5a5651, roughness: 0.5, metalness: 0.55 });

// Chains: a post every so often beside the tread, on the side where the
// ground falls away, and the chain slung from one to the next.
const POST_GAP = 2.2; // m between posts, along the trail
const POST_ASIDE = 1.0; // m from the middle of the tread
const POST_H = 0.95; // m it stands
const POST_W = 0.07; // m across
const CHAIN_W = 0.045; // m: as thick as a chain looks
const SAG = 0.14; // m it hangs, half way between posts
const LINKS = 6; // straight pieces of it between two posts
const LOOK_ASIDE = 2.5; // m to either side the fall of the ground is judged at
const SIDE_RUN = 3; // posts either side whose judgement counts, so it doesn't swap sides at every post
const PERCHED = 0.4; // m: a post on the brink stands no lower than this under the tread

// About a metre of stones, each a little smaller than the one under it.
export function makeCairn(seed) {
  const rng = mulberry32(seed >>> 0);
  const g = new THREE.Group();
  g.name = 'cairn';
  let y = -0.05;
  const COUNT = 7;
  for (let k = 0; k < COUNT; k++) {
    const r = 0.34 * (1 - k / (COUNT + 2)) * (0.85 + rng() * 0.3);
    const flat = 0.5 + rng() * 0.2;
    const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), STONE);
    stone.scale.set(1 + rng() * 0.25, flat, 1 + rng() * 0.25);
    stone.rotation.set((rng() - 0.5) * 0.25, rng() * Math.PI * 2, (rng() - 0.5) * 0.25);
    stone.position.set((rng() - 0.5) * 0.08, y + r * flat * 0.8, (rng() - 0.5) * 0.08);
    y += r * flat * 1.45;
    stone.castShadow = true;
    stone.receiveShadow = true;
    g.add(stone);
  }
  return g;
}

// A post with a board pointing the way (along +z; turn it with rotation.y).
export function makeSignpost() {
  const g = new THREE.Group();
  g.name = 'signpost';
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.13, 1.75, 0.13), WOOD);
  post.position.y = 0.8;
  const board = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.24, 0.85), WOOD);
  board.position.set(0, 1.45, 0.3);
  // the arrow's point
  const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.001, 0.17, 0.2, 4, 1), WOOD);
  tip.rotation.x = Math.PI / 2;
  tip.scale.set(0.3, 1, 0.71);
  tip.position.set(0, 1.45, 0.82);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, 0.2), WOOD_DARK);
  cap.position.y = 1.68;
  for (const m of [post, board, tip, cap]) {
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
  }
  return g;
}

// Chains along stretches of trail, each [x, z, x, z, ...] in the world;
// heightAt(x, z) is the ground. One mesh, measured from its first post and put
// there (render/origin.js), or null if there's nothing to put up.
export function makeChains(lines, heightAt) {
  const posts = [];
  for (const line of lines) {
    const along = postsAlong(line);
    // which side falls away: judged over a run of posts, not each alone
    const fall = along.map(({ x, z, nx, nz }) => {
      const h = heightAt(x, z);
      return h - heightAt(x + nx * LOOK_ASIDE, z + nz * LOOK_ASIDE) - (h - heightAt(x - nx * LOOK_ASIDE, z - nz * LOOK_ASIDE));
    });
    along.forEach((p, k) => {
      let sum = 0;
      for (let j = Math.max(0, k - SIDE_RUN); j <= Math.min(along.length - 1, k + SIDE_RUN); j++) sum += fall[j];
      const side = sum >= 0 ? 1 : -1;
      const x = p.x + p.nx * POST_ASIDE * side;
      const z = p.z + p.nz * POST_ASIDE * side;
      const y = Math.max(heightAt(x, z), heightAt(p.x, p.z) - PERCHED);
      // a chain runs to the next post if that one is on the same side
      posts.push({ x, z, y, side, first: k === 0 });
    });
  }
  if (!posts.length) return null;
  const at = { x: Math.round(posts[0].x), z: Math.round(posts[0].z) };
  const parts = [];
  posts.forEach((p, k) => {
    parts.push(bar(p.x - at.x, p.y - 0.15, p.z - at.z, p.x - at.x, p.y + POST_H, p.z - at.z, POST_W));
    const q = posts[k + 1];
    if (!q || q.first || q.side !== p.side) return;
    // from just under the top of one post to the next
    const [ax, ay, az] = [p.x - at.x, p.y + POST_H - 0.08, p.z - at.z];
    const [bx, by, bz] = [q.x - at.x, q.y + POST_H - 0.08, q.z - at.z];
    let prev = [ax, ay, az];
    for (let i = 1; i <= LINKS; i++) {
      const t = i / LINKS;
      const cur = [ax + (bx - ax) * t, ay + (by - ay) * t - SAG * 4 * t * (1 - t), az + (bz - az) * t];
      parts.push(bar(...prev, ...cur, CHAIN_W));
      prev = cur;
    }
  });
  const mesh = new THREE.Mesh(merge(parts), STEEL);
  mesh.name = 'chains';
  mesh.position.set(at.x, 0, at.z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// Points every POST_GAP along a line, with the way across it (nx, nz).
function postsAlong(line) {
  const out = [];
  let next = 0; // m into this stretch of the line that the next post goes
  let across = [1, 0];
  for (let k = 0; k + 3 < line.length; k += 2) {
    const [ax, az, bx, bz] = [line[k], line[k + 1], line[k + 2], line[k + 3]];
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 1e-6) continue;
    const [nx, nz] = (across = [-(bz - az) / len, (bx - ax) / len]);
    for (; next < len; next += POST_GAP) out.push({ x: ax + ((bx - ax) * next) / len, z: az + ((bz - az) * next) / len, nx, nz });
    next -= len;
  }
  // and one where it ends
  const e = line.length - 2;
  if (e >= 2) out.push({ x: line[e], z: line[e + 1], nx: across[0], nz: across[1] });
  return out;
}

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _Y = new THREE.Vector3(0, 1, 0);
const _one = new THREE.Vector3(1, 1, 1);

// A square bar w across from (ax, ay, az) to (bx, by, bz).
function bar(ax, ay, az, bx, by, bz, w) {
  _a.set(ax, ay, az);
  _b.set(bx, by, bz).sub(_a);
  const len = _b.length();
  const g = new THREE.BoxGeometry(w, len, w);
  _q.setFromUnitVectors(_Y, _b.normalize());
  _m.compose(_a.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2), _q, _one);
  return g.applyMatrix4(_m);
}

// Box geometries as one.
function merge(geos) {
  const pos = [];
  const nor = [];
  const idx = [];
  let n = 0;
  for (const g of geos) {
    pos.push(...g.attributes.position.array);
    nor.push(...g.attributes.normal.array);
    for (const i of g.index.array) idx.push(n + i);
    n += g.attributes.position.count;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setIndex(idx);
  out.computeBoundingSphere();
  return out;
}
