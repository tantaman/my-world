// What you've shot, lying where it fell until you dress it.
//
// A kill is the animal's own body, handed over by wildlife.kill, tipped over
// onto its side. Like the animals themselves it isn't saved or shared: it's
// yours to dress while you're here, and the forest takes it back when you go.
// Only the last few are kept; older ones go the same way.

import { yieldOf } from './quarry.js';

const FALL = 0.45; // seconds it takes to go over
const KEEP = 6; // kills lying about at once, at most
// A body that doesn't say how it's built (wildlife.kill's torso): this.
const SOME_BODY = { a: -0.3, b: 0.3, y: 0.4, r: 0.18 };

// "a white-tailed buck" -> "the white-tailed buck"
export const the = (label) => label.replace(/^(a|an) /, 'the ');

export class Carcasses {
  // ground: (x, z) -> the height of the ground there
  constructor({ scene, ground }) {
    this.scene = scene;
    this.ground = ground;
    this.list = [];
    this._n = 0;
  }

  // Lay down a body from wildlife.kill. -> the carcass
  //   { id, kind, label, x, z, cuts, dress, ... }: x, z the middle of it
  add(body) {
    const T = body.torso || SOME_BODY;
    const fx = Math.sin(body.yaw);
    const fz = Math.cos(body.yaw);
    const mid = (T.a + T.b) / 2;
    const got = yieldOf(body.kind, body.scale) || { cuts: 1, dress: 2 };
    const c = {
      id: ++this._n,
      kind: body.kind,
      label: body.label,
      name: the(body.label),
      mesh: body.mesh,
      dispose: body.dispose,
      yaw: body.yaw,
      fx,
      fz,
      x: body.x + fx * mid,
      z: body.z + fz * mid,
      mid,
      half: (T.b - T.a) / 2 + T.r, // from the middle to either end
      y: T.y,
      r: T.r,
      cuts: got.cuts,
      dress: got.dress,
      side: Math.random() < 0.5 ? -1 : 1,
      t: 0,
    };
    c.mesh.rotation.order = 'YXZ';
    c.mesh.rotation.set(0, c.yaw, 0);
    this._pose(c, 0);
    this.scene.add(c.mesh);
    this.list.push(c);
    while (this.list.length > KEEP) this.remove(this.list[0]);
    return c;
  }

  // The kill whose body is nearest (x, z), within `pad` of it. -> carcass or null
  near(x, z, pad) {
    let best = null;
    let bd = pad;
    for (const c of this.list) {
      // along the body, and across it
      const dx = x - c.x;
      const dz = z - c.z;
      const along = Math.max(0, Math.abs(dx * c.fx + dz * c.fz) - (c.half - c.r));
      const across = dx * c.fz - dz * c.fx;
      const d = Math.hypot(along, across) - c.r;
      if (d < bd) {
        bd = d;
        best = c;
      }
    }
    return best;
  }

  remove(c) {
    const i = this.list.indexOf(c);
    if (i < 0) return;
    this.list.splice(i, 1);
    this.scene.remove(c.mesh);
    if (c.dispose) c.dispose();
  }

  // Each frame: the ones just shot go over.
  update(dt) {
    for (const c of this.list) {
      if (c.t >= FALL) continue;
      c.t = Math.min(FALL, c.t + dt);
      const k = c.t / FALL;
      this._pose(c, k * k);
    }
  }

  // Part way over (k: 0 standing, 1 on its side): turned about its length,
  // with the middle of the torso coming down to lie its thickness off the
  // ground where the animal stood.
  _pose(c, k) {
    const phi = c.side * (Math.PI / 2) * k;
    const m = c.mesh;
    m.rotation.z = phi;
    // where the middle of the torso is from the mesh's origin, turned
    const lx = -c.y * Math.sin(phi);
    const ly = c.y * Math.cos(phi);
    const lz = c.mid;
    const cy = Math.cos(c.yaw);
    const sy = Math.sin(c.yaw);
    const wx = lx * cy + lz * sy;
    const wz = -lx * sy + lz * cy;
    const h = this.ground(c.x, c.z) + c.y + (c.r - c.y) * k;
    m.position.set(c.x - wx, h - ly, c.z - wz);
  }

  clear() {
    while (this.list.length) this.remove(this.list[0]);
  }
}
