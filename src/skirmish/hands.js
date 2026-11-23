// What's in your hands, as you see it from your own eyes: the gun at the
// bottom right of the view, and your own two arms up to it out of the
// corners, in your side's sleeves.
//
// It is the same model a fighter holds (guns.js) and the same arms a fighter
// has (outfits.js), bent to it the same way (figures.js reach): a hand on
// the grip, the other where the gun is held by, or at the magazine while
// it's changed. It comes up when you change to it, kicks when it fires, dips
// while you load it, sways as you run.
//
// Drawn half size and half as far away, which looks the same and keeps it
// out of a wall you're up against.
//
//   const hands = new Hands(camera)     hangs itself on the camera
//   hands.dress(side, n)                whose arms: the nth of that side
//   hands.update(dt, me, kind, show, bob)   each frame: me, your fighter;
//                                       kind, what you hold; bob, how far
//                                       through a stride you are (radians)
//   hands.fired(knife)                  it has just gone off (or swung)
//   hands.muzzleAt(out)                 where your shots leave it, in the world

import * as THREE from 'three';
import { MOVE } from './mover.js';
import { GUNS, DRAW } from './arms.js';
import { gunModel, holdOf } from './guns.js';
import { armOn, sleeveOf } from './outfits.js';
import { reach } from './figures.js';

const SIZE = 0.5; // drawn this size, that much nearer
// How each kind of thing is held in front of you. rest: where its grip is,
// from the eye (m: to the right, up, and ahead as −z). turn: how it's turned
// there (radians). right, left: where each shoulder would be, from where its
// hand holds the thing (m, in the body's own frame: x to your left, z
// ahead), or null for a hand that isn't on it. Elbows go down and out.
const HOLD = {
  long: { rest: [0.14, -0.185, -0.4], turn: [0.02, 0.06, 0], right: [-0.17, -0.22, -0.42], left: [0.3, -0.3, -0.3] },
  short: { rest: [0.12, -0.165, -0.42], turn: [0.02, 0.06, 0], right: [-0.16, -0.26, -0.4], left: [0.26, -0.27, -0.38] },
  knife: { rest: [0.16, -0.17, -0.36], turn: [-0.35, 0.5, 0.5], right: [-0.12, -0.24, -0.42], left: null },
  thrown: { rest: [0.17, -0.15, -0.36], turn: [0.2, 0.3, 0.2], right: [-0.12, -0.26, -0.4], left: null },
  charge: { rest: [0.03, -0.2, -0.42], turn: [0.5, 1.2, 0], right: [-0.22, -0.24, -0.38], left: [0.24, -0.24, -0.38] },
};
const POLE = { right: new THREE.Vector3(-0.55, -0.8, -0.15), left: new THREE.Vector3(0.55, -0.8, -0.15) };
const KICK = { gun: 0.14, knife: 0.3 }; // s a kick lasts

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();

export class Hands {
  constructor(camera) {
    this.camera = camera;
    this.group = new THREE.Group();
    this.group.scale.setScalar(SIZE);
    camera.add(this.group);
    // (your arms are made in the body's frame, which looks along +z; the eye looks along −z)
    this.body = new THREE.Group();
    this.body.rotation.y = Math.PI;
    this.group.add(this.body);
    this.arms = null; // { right, left }: each { base, shoulder, elbow }
    this.whose = '';
    this.held = new Map(); // kind -> its model
    this.kind = '';
    this.hold = HOLD.long;
    this.kick = 0; // 1 just fired .. 0
    this.muzzle = new THREE.Object3D(); // on whichever is up, where its shots leave it
    // the flash at the muzzle, and its light on the walls
    const flare = new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 4.2, 1.6), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    this.flare = new THREE.Group();
    for (const turn of [0, Math.PI / 2]) {
      const quad = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.22), flare);
      quad.rotation.z = turn;
      this.flare.add(quad);
    }
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.3, 6).rotateX(-Math.PI / 2), flare);
    cone.position.z = -0.12;
    this.flare.add(cone);
    this.flare.visible = false;
    this.muzzle.add(this.flare);
    this.flareLeft = 0;
    this.light = new THREE.PointLight(0xffc880, 0, 14, 1.6);
    camera.add(this.light);
  }

  // Whose arms they are: the nth of a side.
  dress(side, n) {
    const whose = `${side}:${n}`;
    if (whose === this.whose) return;
    this.whose = whose;
    if (this.arms) {
      for (const A of Object.values(this.arms)) {
        A.base.traverse((o) => {
          if (!o.isMesh) return;
          o.geometry.dispose();
          if (o.isSkinnedMesh) o.skeleton.dispose();
        });
        this.body.remove(A.base);
      }
    }
    const look = sleeveOf(side, n);
    const arm = (s) => {
      const base = new THREE.Group();
      this.body.add(base);
      const shoulder = new THREE.Bone();
      const elbow = new THREE.Bone();
      elbow.position.set(0, -0.28, 0);
      shoulder.add(elbow);
      base.add(shoulder);
      armOn({ shoulder, elbow }, s, look);
      base.traverse((o) => {
        if (!o.isMesh) return;
        o.castShadow = false;
        o.frustumCulled = false;
      });
      return { base, shoulder, elbow };
    };
    this.arms = { left: arm(1), right: arm(-1) };
    this._place();
  }

  _hold(kind) {
    if (kind === this.kind) return;
    const was = this.held.get(this.kind);
    if (was) was.visible = false;
    this.kind = kind;
    let model = this.held.get(kind);
    if (!model) {
      model = gunModel(kind);
      model.traverse((o) => {
        if (!o.isMesh) return;
        o.castShadow = false;
        o.frustumCulled = false;
      });
      this.group.add(model);
      this.held.set(kind, model);
    }
    model.visible = true;
    model.add(this.muzzle);
    this.muzzle.position.copy(model.userData.muzzle);
    this.hold = HOLD[holdOf(kind)];
    this._place();
  }

  // Each shoulder where this way of holding has it.
  _place() {
    if (!this.arms) return;
    const { rest, right, left } = this.hold;
    const s = 1 / SIZE;
    // (the grip at rest, in the body's frame: x the other way, z ahead)
    const gx = -rest[0] * s;
    const gy = rest[1] * s;
    const gz = -rest[2] * s;
    this.arms.right.base.position.set(gx + right[0], gy + right[1], gz + right[2]);
    this.arms.left.base.visible = !!left;
    if (!left) return;
    // (the other hand's place on it, as near as makes no odds: the thing is hardly turned)
    const model = this.held.get(this.kind);
    const fore = (model && model.userData.fore) || _v.set(0, 0, 0);
    this.arms.left.base.position.set(gx - fore.x + left[0], gy + fore.y + left[1], gz - fore.z + left[2]);
  }

  // It has just gone off: knife, swung.
  fired(knife = false) {
    this.kick = 1;
    if (knife) return;
    this.flareLeft = 0.045;
    this.flare.rotation.z = Math.random() * Math.PI;
  }

  // Where your shots leave it, in the world.
  muzzleAt(out) {
    this.camera.updateMatrixWorld(true);
    return this.muzzle.getWorldPosition(out);
  }

  update(dt, me, kind, show, bob) {
    this.group.visible = show;
    this.flareLeft -= dt;
    this.flare.visible = show && this.flareLeft > 0;
    this.light.intensity = this.flare.visible ? 9 : 0;
    if (!show) return;
    this._hold(kind);
    const model = this.held.get(kind);
    const gun = GUNS[kind];
    const b = me.body;
    const speed = Math.hypot(b.vel.x, b.vel.z);
    const knife = kind === 'knife';
    this.kick = Math.max(0, this.kick - dt / (knife ? KICK.knife : KICK.gun));
    const kk = this.kick * this.kick;
    const up = Math.min(1, me.draw / DRAW); // 1 just changed to .. 0 ready
    const load = gun && me.reloading > 0 ? Math.sin(Math.min(1, (gun.reload - me.reloading) / gun.reload) * Math.PI) : 0;
    const walk = Math.min(1, speed / MOVE.speed);
    const { rest, turn } = this.hold;
    const s = 1 / SIZE;
    model.position.set((rest[0] + Math.cos(bob * 0.5) * 0.006 * walk) * s, (rest[1] + Math.abs(Math.sin(bob * 0.5)) * 0.007 * walk - up * up * 0.3 - load * 0.1 + kk * 0.01) * s, (rest[2] + kk * 0.045) * s);
    if (knife) model.rotation.set(turn[0] - kk * 1.1, turn[1] + kk * 0.9, turn[2]);
    else model.rotation.set(turn[0] + kk * 0.12 + up * 0.8 + load * 0.45, turn[1] + load * 0.4, turn[2] - load * 0.55);

    // your arms, to it
    if (!this.arms) return;
    this.camera.updateMatrixWorld(true);
    const at = model.userData;
    const R = this.arms.right;
    _v.set(0, 0, 0);
    if (kind === 'charge') _v.set(0.11, 0, 0);
    reach(R, R.base.worldToLocal(model.localToWorld(_v)), POLE.right);
    const L = this.arms.left;
    if (!L.base.visible) return;
    if (at.fore) _v.copy(at.fore);
    else _v.set(-0.11, 0, 0);
    // (the other hand goes to the magazine and back while it's changed)
    if (load && gun) _v.lerp(_w.set(0, -0.15, _v.z * 0.4), load);
    reach(L, L.base.worldToLocal(model.localToWorld(_v)), POLE.left);
  }
}
