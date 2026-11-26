// Geometry written straight into typed arrays, a vertex at a time, for the
// building material (build/surfaces.js: its colour, its surface and wear,
// and where on its pattern each vertex is). A city tile is a hundred
// thousand vertices: the Mesher's arrays of numbers and vectors would be
// most of the work of building it.
//
//   const b = new Batch();
//   const k = b.vertex(x, y, z, nx, ny, nz, r, g, bl, surf, u, v);
//   b.tri(k, k + 1, k + 2);
//   new THREE.Mesh(b.build(), material)
//
// surf is the surface (SURF) plus its wear (0..1), as the material reads it.

import * as THREE from 'three';

export class Batch {
  constructor(size = 4096, grade = false) {
    this.n = 0; // vertices
    this.m = 0; // indices
    this.grade = grade ? new Float32Array(0) : null;
    this._alloc(size, size * 2);
  }

  _alloc(nv, ni) {
    const grow = (a, len) => {
      const b = new a.constructor(len);
      b.set(a.subarray(0, Math.min(a.length, len)));
      return b;
    };
    this.pos = this.pos ? grow(this.pos, nv * 3) : new Float32Array(nv * 3);
    this.nor = this.nor ? grow(this.nor, nv * 3) : new Float32Array(nv * 3);
    this.col = this.col ? grow(this.col, nv * 3) : new Float32Array(nv * 3);
    this.surf = this.surf ? grow(this.surf, nv) : new Float32Array(nv);
    this.uv = this.uv ? grow(this.uv, nv * 2) : new Float32Array(nv * 2);
    if (this.grade) this.grade = grow(this.grade, nv * 2);
    this.idx = this.idx ? grow(this.idx, ni) : new Uint32Array(ni);
  }

  get empty() {
    return this.m === 0;
  }

  vertex(x, y, z, nx, ny, nz, r, g, b, surf, u, v) {
    if (this.n >= this.surf.length) this._alloc(this.surf.length * 2, this.idx.length);
    const k = this.n++;
    const k3 = k * 3;
    this.pos[k3] = x;
    this.pos[k3 + 1] = y;
    this.pos[k3 + 2] = z;
    this.nor[k3] = nx;
    this.nor[k3 + 1] = ny;
    this.nor[k3 + 2] = nz;
    this.col[k3] = r;
    this.col[k3 + 1] = g;
    this.col[k3 + 2] = b;
    this.surf[k] = surf;
    this.uv[k * 2] = u;
    this.uv[k * 2 + 1] = v;
    return k;
  }

  tri(a, b, c) {
    if (this.m + 3 > this.idx.length) this._alloc(this.surf.length, this.idx.length * 2);
    this.idx[this.m++] = a;
    this.idx[this.m++] = b;
    this.idx[this.m++] = c;
  }

  // A flat quad a, b, c, d (each [x, y, z], round in that order), facing
  // the way that winding says, its pattern's grain (u, v) given per corner.
  // Its normal is across its diagonals, so one that has closed up to a
  // triangle at a corner (a wall where the roof comes down to the ground)
  // still faces the right way: a normal of nothing is NaN in the shader, and
  // one NaN pixel is a white blot across the bloom.
  quad(a, b, c, d, r, g, bl, surf, uvs) {
    const [ex, ey, ez] = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const [fx, fy, fz] = [d[0] - b[0], d[1] - b[1], d[2] - b[2]];
    let [nx, ny, nz] = [ey * fz - ez * fy, ez * fx - ex * fz, ex * fy - ey * fx];
    const l = Math.hypot(nx, ny, nz);
    // (and one with no area at all isn't drawn)
    if (l < 1e-9) return;
    [nx, ny, nz] = [nx / l, ny / l, nz / l];
    const k = this.vertex(a[0], a[1], a[2], nx, ny, nz, r, g, bl, surf, uvs[0], uvs[1]);
    this.vertex(b[0], b[1], b[2], nx, ny, nz, r, g, bl, surf, uvs[2], uvs[3]);
    this.vertex(c[0], c[1], c[2], nx, ny, nz, r, g, bl, surf, uvs[4], uvs[5]);
    this.vertex(d[0], d[1], d[2], nx, ny, nz, r, g, bl, surf, uvs[6], uvs[7]);
    this.tri(k, k + 1, k + 2);
    this.tri(k, k + 2, k + 3);
  }

  build() {
    const g = new THREE.BufferGeometry();
    const n = this.n;
    g.setAttribute('position', new THREE.BufferAttribute(this.pos.slice(0, n * 3), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(this.nor.slice(0, n * 3), 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col.slice(0, n * 3), 3));
    g.setAttribute('aSurf', new THREE.BufferAttribute(this.surf.slice(0, n), 1));
    g.setAttribute('aUV', new THREE.BufferAttribute(this.uv.slice(0, n * 2), 2));
    if (this.grade) g.setAttribute('aRoadGrade', new THREE.BufferAttribute(this.grade.slice(0, n * 2), 2));
    g.setIndex(new THREE.BufferAttribute(n > 65535 ? this.idx.slice(0, this.m) : Uint16Array.from(this.idx.subarray(0, this.m)), 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}
