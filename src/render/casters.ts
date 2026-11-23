// Shadows drawn from what each light can reach, not from whole meshes.
//
// Three.js decides what to draw into a shadow map a whole object at a time:
// if any of it is in the light's reach, all of it is drawn. A chunk's plants
// of one kind are one mesh of instances 64 m across. The sun's shadow is cast
// into a box 120 m across round the hiker, which takes in a corner of each of
// several chunks, and every plant in them was drawn into it. A fire's light
// reaches 16 m, and every plant in each chunk round it was drawn six times
// over, once into each face of the cube its shadow is cast into. Most of them
// were thrown away by the graphics card, out of reach, after it had worked
// out where every corner of every leaf was: with a fire lit, about three
// times the plants the shadows needed.
//
// So a mesh that hands its shadow over (add) is drawn only for the picture.
// For each light that casts shadows (light), a copy of it is drawn only into
// that light's shadow: it is on a layer of the light's own, which only that
// light's shadow camera sees, and holds just the instances within its reach.
// Which ones is worked out again only when the light has moved far enough
// (the margins below) or the mesh has changed (an instance hidden, a coarser
// model), so the copies are seldom written. What is drawn into each shadow
// is no different: only what was out of reach is left out.
//
//   const cast = casters.add(mesh);   // reads mesh.castShadow, and takes it over
//   cast.on = lod <= 1;               // where mesh.castShadow = … would have been
//   casters.light(sun);               // a light whose shadow they are drawn into
//   casters.update();                 // each frame, once the lights are placed
//
// The copies are children of the mesh, so they are where it is and shown
// while it is; disposing the mesh disposes them. Everything is worked out in
// the scene's own coordinates (where the game thinks things are), from the
// mesh's matrix and the lights' positions, so it doesn't matter whether the
// scene has been slid to be drawn (origin.js).

import * as THREE from 'three';

// The first layer a light's copies are drawn on (after OVER and HEAT,
// pipeline.js), and the last there is.
const FIRST_LAYER = 3;
const LAST_LAYER = 31;
const BOX_MARGIN = 8; // m: how far the sun's shadow may move before its plants are picked again
const BALL_MARGIN = 2; // m: how far a light's reach may move before they are
const SWAY = 2; // m: the most the wind moves any part of a plant from where it is modelled

type Lit = THREE.DirectionalLight | THREE.PointLight;

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _m = new THREE.Matrix4();

// Where o is in the scene it is in: its position, through its parents'
// matrices up to (not including) the scene.
function placeOf(o: THREE.Object3D, out: THREE.Vector3): THREE.Vector3 {
  out.copy(o.position);
  for (let p = o.parent; p && !(p as THREE.Scene).isScene; p = p.parent) {
    if (p.matrixAutoUpdate) p.updateMatrix();
    out.applyMatrix4(p.matrix);
  }
  return out;
}

// o's matrix into the scene it is in.
function matrixOf(o: THREE.Object3D, out: THREE.Matrix4): THREE.Matrix4 {
  if (o.matrixAutoUpdate) o.updateMatrix();
  out.copy(o.matrix);
  for (let p = o.parent; p && !(p as THREE.Scene).isScene; p = p.parent) {
    if (p.matrixAutoUpdate) p.updateMatrix();
    out.premultiply(p.matrix);
  }
  return out;
}

// A box a sun's shadow takes in: at the light, its axes (z towards the
// light), and its bounds across (x, y) and along (near, far), in m.
interface Box {
  at: THREE.Vector3;
  x: THREE.Vector3;
  y: THREE.Vector3;
  z: THREE.Vector3;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  near: number;
  far: number;
}
const box = (): Box => ({ at: new THREE.Vector3(), x: new THREE.Vector3(), y: new THREE.Vector3(), z: new THREE.Vector3(), x0: 0, x1: 0, y0: 0, y1: 0, near: 0, far: 0 });

// What one light's shadow can take in, and what its plants were last picked
// for: a box for the sun (its shadow camera is orthographic), a ball for a
// light that shines every way.
class Reach {
  light: Lit;
  layer: number;
  isBox: boolean;
  live = false;
  picks = 0; // how many times they have been picked: a copy picked before the last is out of date
  private picked = false;
  private ball = new THREE.Vector4(); // picked for: centre and radius (m, margin included)
  private box = box(); // picked for, margin included
  private now = box(); // what it takes in this frame

  constructor(light: Lit, layer: number) {
    this.light = light;
    this.layer = layer;
    this.isBox = (light as THREE.DirectionalLight).isDirectionalLight === true;
  }

  // Whether its shadow is being drawn now, and if so, whether what was
  // picked for still takes it in: if not, its plants are picked again.
  update(): void {
    const l = this.light;
    const shadow = l.shadow;
    this.live = l.castShadow && l.visible && l.intensity > 0 && (shadow.autoUpdate || shadow.needsUpdate);
    if (!this.live) return;
    if (this.isBox) this.updateBox();
    else this.updateBall();
  }

  private updateBall(): void {
    const l = this.light as THREE.PointLight;
    const c = placeOf(l, _a);
    const r = l.distance || l.shadow.camera.far; // (as three.js's shadow takes it)
    const b = this.ball;
    if (this.picked && Math.hypot(c.x - b.x, c.y - b.y, c.z - b.z) + r <= b.w) return;
    b.set(c.x, c.y, c.z, r + BALL_MARGIN);
    this.picked = true;
    this.picks++;
  }

  private updateBox(): void {
    const l = this.light as THREE.DirectionalLight;
    const cam = l.shadow.camera;
    const n = this.now;
    // as the shadow camera will be set (DirectionalLightShadow.updateMatrices):
    // at the light, looking at its target, with the camera's up
    placeOf(l, n.at);
    n.z.subVectors(n.at, placeOf(l.target, _b));
    if (n.z.lengthSq() === 0) n.z.z = 1;
    n.z.normalize();
    n.x.crossVectors(cam.up, n.z);
    if (n.x.lengthSq() === 0) {
      // (as Matrix4.lookAt does, looking straight along its up)
      if (Math.abs(cam.up.z) === 1) n.z.x += 0.0001;
      else n.z.z += 0.0001;
      n.z.normalize();
      n.x.crossVectors(cam.up, n.z);
    }
    n.x.normalize();
    n.y.crossVectors(n.z, n.x);
    const dx = (cam.right - cam.left) / (2 * cam.zoom);
    const dy = (cam.top - cam.bottom) / (2 * cam.zoom);
    const cx = (cam.right + cam.left) / 2;
    const cy = (cam.top + cam.bottom) / 2;
    n.x0 = cx - dx;
    n.x1 = cx + dx;
    n.y0 = cy - dy;
    n.y1 = cy + dy;
    n.near = cam.near;
    n.far = cam.far;
    if (this.picked && this.holds(n)) return;
    const b = this.box;
    b.at.copy(n.at);
    b.x.copy(n.x);
    b.y.copy(n.y);
    b.z.copy(n.z);
    b.x0 = n.x0 - BOX_MARGIN;
    b.x1 = n.x1 + BOX_MARGIN;
    b.y0 = n.y0 - BOX_MARGIN;
    b.y1 = n.y1 + BOX_MARGIN;
    b.near = n.near - BOX_MARGIN;
    b.far = n.far + BOX_MARGIN;
    this.picked = true;
    this.picks++;
  }

  // Whether box n lies inside the one picked for: all eight of its corners do.
  private holds(n: Box): boolean {
    for (let i = 0; i < 8; i++) {
      const u = i & 1 ? n.x1 : n.x0;
      const v = i & 2 ? n.y1 : n.y0;
      const d = i & 4 ? n.far : n.near;
      _a.copy(n.at).addScaledVector(n.x, u).addScaledVector(n.y, v).addScaledVector(n.z, -d);
      if (!this.touches(_a.x, _a.y, _a.z, 0)) return false;
    }
    return true;
  }

  // Whether a ball at (x, y, z) of radius r (m, in the scene) is within what
  // was picked for.
  touches(x: number, y: number, z: number, r: number): boolean {
    if (!this.isBox) {
      const b = this.ball;
      const dx = x - b.x;
      const dy = y - b.y;
      const dz = z - b.z;
      const R = b.w + r;
      return dx * dx + dy * dy + dz * dz <= R * R;
    }
    const b = this.box;
    const ox = x - b.at.x;
    const oy = y - b.at.y;
    const oz = z - b.at.z;
    const u = ox * b.x.x + oy * b.x.y + oz * b.x.z;
    if (u < b.x0 - r || u > b.x1 + r) return false;
    const v = ox * b.y.x + oy * b.y.y + oz * b.y.z;
    if (v < b.y0 - r || v > b.y1 + r) return false;
    const d = -(ox * b.z.x + oy * b.z.y + oz * b.z.z);
    return d >= b.near - r && d <= b.far + r;
  }
}

// A mesh whose shadow is drawn from its copies. `on` is whether it casts one
// at all: what its castShadow would have been.
export class Cast {
  mesh: THREE.InstancedMesh;
  on: boolean;
  // by light: the copy drawn into its shadow, which of its picks it holds,
  // and which version of the mesh's instances it was picked from
  copies: (THREE.InstancedMesh | undefined)[] = [];
  private picks: number[] = [];
  private versions: number[] = [];

  constructor(mesh: THREE.InstancedMesh) {
    this.mesh = mesh;
    this.on = mesh.castShadow;
    mesh.castShadow = false;
  }

  update(reaches: Reach[]): void {
    const mesh = this.mesh;
    for (let i = 0; i < reaches.length; i++) {
      const reach = reaches[i];
      let copy = this.copies[i];
      if (!this.on) {
        if (copy) copy.visible = false;
        continue;
      }
      // (shown only while the mesh is: picked once it is shown again)
      if (!reach.live || !mesh.visible) continue;
      if (!copy || copy.instanceMatrix.count < mesh.instanceMatrix.count) {
        if (copy) this.drop(copy);
        copy = this.copies[i] = this.copy(reach.layer);
        this.picks[i] = -1;
      }
      // whatever the mesh is drawn with now (a coarser model further off)
      copy.material = mesh.material;
      copy.customDepthMaterial = mesh.customDepthMaterial;
      copy.customDistanceMaterial = mesh.customDistanceMaterial;
      if (copy.geometry !== mesh.geometry) {
        copy.geometry = mesh.geometry;
        this.picks[i] = -1;
      }
      if (this.picks[i] !== reach.picks || this.versions[i] !== mesh.instanceMatrix.version) {
        this.pick(copy, reach);
        this.picks[i] = reach.picks;
        this.versions[i] = mesh.instanceMatrix.version;
      }
      copy.visible = copy.count > 0;
    }
  }

  private copy(layer: number): THREE.InstancedMesh {
    const mesh = this.mesh;
    const copy = new THREE.InstancedMesh(mesh.geometry, mesh.material, mesh.instanceMatrix.count);
    copy.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    copy.count = 0;
    copy.name = 'shadow';
    copy.layers.set(layer);
    copy.castShadow = true;
    copy.receiveShadow = false;
    // where the mesh is: a child of it, put nowhere of its own
    copy.matrixAutoUpdate = false;
    copy.boundingSphere = new THREE.Sphere();
    mesh.add(copy);
    copy.updateMatrixWorld(true);
    return copy;
  }

  // Into the copy, the instances of the mesh within the light's reach.
  private pick(copy: THREE.InstancedMesh, reach: Reach): void {
    const mesh = this.mesh;
    const geo = mesh.geometry;
    if (!geo.boundingSphere) geo.computeBoundingSphere();
    const gs = geo.boundingSphere as THREE.Sphere;
    const L = matrixOf(mesh, _m).elements;
    const sL = Math.sqrt(Math.max(L[0] * L[0] + L[1] * L[1] + L[2] * L[2], L[4] * L[4] + L[5] * L[5] + L[6] * L[6], L[8] * L[8] + L[9] * L[9] + L[10] * L[10]));
    // none of it in reach (most of them, most of the time)
    if (!mesh.boundingSphere) mesh.computeBoundingSphere();
    const all = (mesh.boundingSphere as THREE.Sphere).center;
    _a.copy(all).applyMatrix4(_m);
    if (!reach.touches(_a.x, _a.y, _a.z, (mesh.boundingSphere as THREE.Sphere).radius * sL + SWAY)) {
      copy.count = 0;
      return;
    }
    const src = mesh.instanceMatrix.array as Float32Array;
    const dst = copy.instanceMatrix.array as Float32Array;
    const gx = gs.center.x;
    const gy = gs.center.y;
    const gz = gs.center.z;
    let k = 0;
    let x0 = Infinity;
    let y0 = Infinity;
    let z0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    let z1 = -Infinity;
    for (let j = 0; j < mesh.count; j++) {
      const o = j * 16;
      const s2 = Math.max(
        src[o] * src[o] + src[o + 1] * src[o + 1] + src[o + 2] * src[o + 2],
        src[o + 4] * src[o + 4] + src[o + 5] * src[o + 5] + src[o + 6] * src[o + 6],
        src[o + 8] * src[o + 8] + src[o + 9] * src[o + 9] + src[o + 10] * src[o + 10],
      );
      if (!(s2 > 0)) continue; // hidden (felled, picked up): shrunk to nothing
      // its middle and reach in the mesh's own space...
      const lx = src[o + 12] + src[o] * gx + src[o + 4] * gy + src[o + 8] * gz;
      const ly = src[o + 13] + src[o + 1] * gx + src[o + 5] * gy + src[o + 9] * gz;
      const lz = src[o + 14] + src[o + 2] * gx + src[o + 6] * gy + src[o + 10] * gz;
      const lr = gs.radius * Math.sqrt(s2) + SWAY / (sL || 1);
      // ...and in the scene's
      const wx = L[0] * lx + L[4] * ly + L[8] * lz + L[12];
      const wy = L[1] * lx + L[5] * ly + L[9] * lz + L[13];
      const wz = L[2] * lx + L[6] * ly + L[10] * lz + L[14];
      if (!reach.touches(wx, wy, wz, lr * sL)) continue;
      for (let e = 0; e < 16; e++) dst[k * 16 + e] = src[o + e];
      k++;
      x0 = Math.min(x0, lx - lr);
      y0 = Math.min(y0, ly - lr);
      z0 = Math.min(z0, lz - lr);
      x1 = Math.max(x1, lx + lr);
      y1 = Math.max(y1, ly + lr);
      z1 = Math.max(z1, lz + lr);
    }
    copy.count = k;
    const m = copy.instanceMatrix;
    m.clearUpdateRanges();
    if (k > 0) {
      m.addUpdateRange(0, k * 16);
      m.needsUpdate = true;
      // (the copy's space is the mesh's: it sits in it at nothing)
      const s = copy.boundingSphere as THREE.Sphere;
      s.center.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
      s.radius = Math.hypot(x1 - x0, y1 - y0, z1 - z0) / 2;
    }
  }

  private drop(copy: THREE.InstancedMesh): void {
    this.mesh.remove(copy);
    copy.dispose();
  }

  dispose(): void {
    for (const copy of this.copies) if (copy) this.drop(copy);
    this.copies.length = 0;
  }
}

export class Casters {
  private reaches: Reach[] = [];
  private casts = new Set<Cast>();

  // A light whose shadow the meshes here are drawn into, from just what is
  // within its reach. Its shadow camera is given a layer of its own.
  light(light: Lit): void {
    if (this.reaches.some((r) => r.light === light)) return;
    if (!(light as THREE.DirectionalLight).isDirectionalLight && !(light as THREE.PointLight).isPointLight) throw new Error('casters: only a directional or a point light');
    const layer = FIRST_LAYER + this.reaches.length;
    if (layer > LAST_LAYER) throw new Error('casters: no layers left for another light');
    // (it sees what is on layer 0 too, as every shadow does: that is
    // everything else that casts one)
    light.shadow.camera.layers.enable(layer);
    this.reaches.push(new Reach(light, layer));
  }

  // Take over the shadow of a mesh of instances. -> its Cast: set `on`
  // where you would have set mesh.castShadow.
  add(mesh: THREE.InstancedMesh): Cast {
    const cast = new Cast(mesh);
    this.casts.add(cast);
    const gone = () => {
      mesh.removeEventListener('dispose', gone);
      this.casts.delete(cast);
      cast.dispose();
    };
    mesh.addEventListener('dispose', gone);
    return cast;
  }

  // Once a frame, before the scene is drawn and once the lights are where
  // they will be drawn from.
  update(): void {
    const reaches = this.reaches;
    for (const r of reaches) r.update();
    for (const cast of this.casts) cast.update(reaches);
  }

  // How many instances are drawn into the shadows being cast now, and how
  // many the meshes that cast them hold, a light at a time (for the stats).
  count(): { drawn: number; of: number } {
    let drawn = 0;
    let of = 0;
    for (const cast of this.casts) {
      if (!cast.on || !cast.mesh.visible) continue;
      this.reaches.forEach((reach, i) => {
        if (!reach.live) return;
        of += cast.mesh.count;
        const copy = cast.copies[i];
        if (copy && copy.visible) drawn += copy.count;
      });
    }
    return { drawn, of };
  }
}
