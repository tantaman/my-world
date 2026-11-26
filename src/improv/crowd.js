// The people at the club: the audience in their seats, and whoever's on the
// stage.
//
// The audience is a room full of people sitting still, near enough, so
// they're cheap: a dozen people (people/body.js) are sat down once, their
// seated bodies baked into plain meshes, and each is drawn at every seat it
// fills (one instanced mesh each). How full the room is decides how many
// seats are filled, a different handful of them each show. When the room
// laughs they rock back and bounce in their seats.
//
//   new Templates(seed)                       the people, baked: templates.pump()
//                                             -> true while there are more to sit down
//   new Audience(seats, { material, templates, seed })   seats: club.js's, for one room
//   audience.fill(share, seed)                how many are in, 0..1, and which
//   audience.update(dt, laugh)                laugh: 0..1, how hard the room's laughing
//   audience.taken(i)                         whether someone's in seat i
//
// The performers are people too, but they walk on and off, hold the mic,
// and talk with their hands, so each is a whole body:
//
//   new Performer(person, seed)   person: from sets.js (look, voice)
//   performer.update(dt, to, { speaking, mic, stageY })
//     to: a mark { x, z, yaw } to walk to and stand at, or null to walk off
//     to the wings (`wings`, set by whoever made it) and vanish
//
// All of it in the club's frame, under its group.

import * as THREE from 'three';
import { Body } from '../people/body.js';
import { lin } from '../render/rig.js';
import { mulberry32 } from '../noise.js';

const SKIN = [0xe8c4a8, 0xdcae90, 0xc68c6c, 0xa86f50, 0x8a5a3c, 0x6a4430]; // light .. dark
const HAIR = [0x1a1a1a, 0x2a1c14, 0x4a3020, 0x6a4a2a, 0xb89a6a, 0x9a9a9a, 0x0e0e0e];
const SHIRTS = [0x2a3a5a, 0x7a2a2a, 0xd8d0c0, 0x3a5a3a, 0x1a1a1e, 0x8a6a9a, 0xc87a3a, 0x4a7aa8, 0xe8e2d4, 0x5a5a62, 0xa83a5a, 0x2a6a6a];
const LEGS = [0x2a3a5a, 0x1e2230, 0x1a1a1c, 0x6a5a48, 0x3a3a44];
const DRESSES = [0x1a1a1e, 0x8a1a2a, 0x2a4a7a, 0x3a5a3a, 0x7a5a8a];
const TEMPLATES = 12; // people baked, to fill the seats with
const SEAT_DROP = 0.37; // m the hips come down, sat on a chair
const WALK = 1.25; // m/s a performer walks on and off at
const TURN = 5; // 1/s how quickly they turn to where they're going

// A person as they'd come out for a night at a comedy club.
export function audienceLook(rnd) {
  const her = rnd() < 0.5;
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  return {
    her,
    child: false,
    dark: false,
    height: 0.92 + rnd() * 0.12,
    build: 0.9 + rnd() * 0.2,
    skin: lin(pick(SKIN)),
    hair: lin(pick(HAIR)),
    shirt: lin(pick(SHIRTS)),
    vest: null,
    legs: lin(pick(LEGS)),
    dress: her && rnd() < 0.35 ? lin(pick(DRESSES)) : null,
    apron: false,
    coat: false,
    hat: 'none',
    hatColor: lin(0x000000),
    beard: !her && rnd() < 0.3,
  };
}

// A performer's look, from what sets.js says of them.
export function performerLook(p) {
  const L = p.look;
  return {
    her: L.her,
    child: false,
    dark: false,
    height: L.height,
    build: L.build,
    skin: lin(SKIN[L.skin] ?? SKIN[0]),
    hair: lin(HAIR[L.hair] ?? HAIR[0]),
    shirt: lin(L.shirt),
    vest: null,
    legs: lin(L.legs),
    dress: null,
    apron: false,
    coat: false,
    hat: 'none',
    hatColor: lin(0x000000),
    beard: !!L.beard,
  };
}

// Sit a body down in a chair: hips down to the seat, thighs out in front,
// shins down, forearms forward onto the lap (or the table).
export function sit(body) {
  body.hips.position.y = body.hips.userData.rest.y - SEAT_DROP;
  body.spine.rotation.x = -0.06;
  for (const { thigh, shin, foot } of body.legs) {
    thigh.rotation.set(-1.5, 0, 0);
    shin.rotation.set(1.45, 0, 0);
    foot.rotation.set(0.05, 0, 0);
  }
  for (const { side, arm, fore } of body.arms) {
    arm.rotation.set(-0.42, 0, side * 0.1);
    fore.rotation.set(-1.0, 0, 0);
  }
}

// A skinned body, as it stands now, baked into a plain geometry.
const _v = new THREE.Vector3();
export function bake(body) {
  const mesh = body.mesh;
  mesh.updateMatrixWorld(true);
  mesh.skeleton.update();
  const src = mesh.geometry;
  const pos = src.attributes.position;
  const out = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    _v.fromBufferAttribute(pos, i);
    mesh.applyBoneTransform(i, _v);
    out[i * 3] = _v.x;
    out[i * 3 + 1] = _v.y;
    out[i * 3 + 2] = _v.z;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(out, 3));
  g.setAttribute('color', src.attributes.color.clone());
  if (src.index) g.setIndex(src.index.clone());
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3(1, 1, 1);

// The people the seats are filled with: a dozen, each sat down once and
// baked, shared by every room.
export class Templates {
  constructor(seed = 1) {
    this.seed = seed;
    this.geos = [];
  }

  get ready() {
    return this.geos.length >= TEMPLATES;
  }

  // One person at a time (each takes a few milliseconds).
  pump() {
    if (this.ready) return false;
    const k = this.geos.length;
    const rnd = mulberry32(this.seed * 31 + k * 7919);
    const body = new Body(audienceLook(rnd), this.seed + k);
    sit(body);
    this.geos.push(bake(body));
    body.dispose();
    return !this.ready;
  }

  dispose() {
    for (const g of this.geos) g.dispose();
    this.geos = [];
  }
}

export class Audience {
  constructor(seats, { material, templates, seed = 1, group }) {
    this.seats = seats;
    this.material = material;
    this.templates = templates;
    this.group = group;
    this.meshes = []; // a mesh per template, and the seats it fills
    this.t = 0;
    this.share = 0;
    this.lastSeed = -1;
    const rnd = mulberry32(seed);
    // which person sits in each seat, and how they sit
    this.who = seats.map(() => Math.floor(rnd() * TEMPLATES));
    this.lean = seats.map(() => (rnd() - 0.5) * 0.35);
    this.phase = seats.map(() => rnd() * 10);
  }

  get ready() {
    return this.meshes.length >= TEMPLATES;
  }

  // A mesh for each person baked since last asked.
  catchUp() {
    const T = this.templates.geos;
    if (this.meshes.length >= T.length) return;
    while (this.meshes.length < T.length) {
      const k = this.meshes.length;
      const seats = this.seats.map((s, i) => i).filter((i) => this.who[i] === k);
      const mesh = new THREE.InstancedMesh(T[k], this.material, Math.max(1, seats.length));
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      this.meshes.push({ mesh, seats, shown: [] });
      this.group.add(mesh);
    }
    if (this.lastSeed !== -1) this.fill(this.share, this.lastSeed, true);
  }

  // How full the room is (0..1), and which of the seats, for a show.
  fill(share, seed, force = false) {
    this.catchUp();
    if (!force && share === this.share && seed === this.lastSeed) return;
    this.share = share;
    this.lastSeed = seed;
    const rnd = mulberry32(seed);
    const rank = this.seats.map(() => rnd());
    const order = this.seats.map((s, i) => i).sort((a, b) => rank[a] - rank[b]);
    const filled = (this.filled = new Set(order.slice(0, Math.round(share * this.seats.length))));
    for (const m of this.meshes) {
      m.shown = m.seats.filter((i) => filled.has(i));
      m.mesh.count = m.shown.length;
    }
    this.place(0);
  }

  // Whether someone's in seat i (of this room's seats).
  taken(i) {
    return !!this.filled && this.filled.has(i);
  }

  get count() {
    return this.meshes.reduce((n, m) => n + m.shown.length, 0);
  }

  // Each in their seat, rocking back and bouncing as hard as the room is laughing.
  place(laugh) {
    for (const m of this.meshes) {
      m.shown.forEach((i, j) => {
        const s = this.seats[i];
        const ph = this.phase[i];
        const k = laugh * (0.6 + 0.4 * Math.sin(ph * 3.7));
        const bounce = k * 0.025 * Math.abs(Math.sin(this.t * 9 + ph));
        const back = k * (0.1 + 0.06 * Math.sin(this.t * 2.3 + ph));
        _p.set(s.x, bounce, s.z);
        _q.setFromEuler(_e.set(-back, s.yaw + this.lean[i], 0, 'YXZ'));
        _m.compose(_p, _q, _s);
        m.mesh.setMatrixAt(j, _m);
      });
      m.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  update(dt, laugh) {
    this.catchUp();
    this.t += dt;
    if (laugh > 0.01 || this.rocking) this.place(laugh);
    this.rocking = laugh > 0.01;
  }

  // (the baked people are the templates': theirs to throw away)
  dispose() {
    for (const m of this.meshes) {
      this.group.remove(m.mesh);
      m.mesh.dispose();
    }
    this.meshes = [];
  }
}

// ── On the stage ─────────────────────────────────────────────────────────────
// The microphone in a performer's hand.
function handMic() {
  const g = new THREE.Group();
  const black = new THREE.MeshStandardMaterial({ color: 0x18181a, roughness: 0.5, metalness: 0.4 });
  const grille = new THREE.MeshStandardMaterial({ color: 0x9a9ea4, roughness: 0.35, metalness: 0.8 });
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.012, 0.17, 10), black);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.026, 12, 10), grille);
  head.position.y = 0.1;
  g.add(handle, head);
  return g;
}

export class Performer {
  constructor(person, seed) {
    this.person = person;
    this.body = new Body(performerLook(person), seed);
    this.mesh = this.body.mesh;
    this.mesh.visible = false;
    this.x = 0;
    this.z = 0;
    this.y = 0;
    this.yaw = 0;
    this.on = false; // on the stage (or walking on or off it)
    this.wings = { x: 0, z: 0 };
    this.t = Math.random() * 10;
    this.talk = 0; // 0..1, easing in and out of talking with their hands
    this.mic = handMic();
    this.mic.visible = false;
    // in the right hand, pointing up out of it
    const right = this.body.arms.find((a) => a.side < 0) || this.body.arms[1];
    right.fore.add(this.mic);
    this.mic.position.set(0, -0.26, 0.02);
    this.mic.rotation.x = Math.PI;
  }

  update(dt, to, { speaking = false, mic = false, stageY = 0 } = {}) {
    this.t += dt;
    const B = this.body;
    if (to && !this.on) {
      // on from the wings
      this.on = true;
      this.x = this.wings.x;
      this.z = this.wings.z;
      this.yaw = Math.atan2(to.x - this.x, to.z - this.z);
    }
    if (!this.on) {
      this.mesh.visible = false;
      return;
    }
    const goal = to || this.wings;
    const dx = goal.x - this.x;
    const dz = goal.z - this.z;
    const d = Math.hypot(dx, dz);
    let speed = 0;
    let want = to && to.yaw !== undefined ? to.yaw : this.yaw;
    if (d > 0.05) {
      speed = Math.min(WALK, d / Math.max(dt, 1e-3));
      const step = Math.min(d, WALK * dt);
      this.x += (dx / d) * step;
      this.z += (dz / d) * step;
      want = Math.atan2(dx, dz);
    } else if (!to) {
      // off, into the wings
      this.on = false;
      this.mesh.visible = false;
      return;
    }
    let dy = want - this.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    this.yaw += dy * Math.min(1, dt * TURN);
    this.mesh.visible = true;
    this.mesh.position.set(this.x, stageY, this.z);
    this.mesh.rotation.y = this.yaw;
    B.pose(dt, speed, speaking ? Math.sin(this.t * 0.7) * 0.25 : null);
    // talking with their hands, and the mic up to the mouth
    this.talk += ((speaking ? 1 : 0) - this.talk) * Math.min(1, dt * 4);
    const g = this.talk;
    const right = B.arms.find((a) => a.side < 0) || B.arms[1];
    const left = B.arms.find((a) => a.side > 0) || B.arms[0];
    const s1 = Math.sin(this.t * 3.1);
    const s2 = Math.sin(this.t * 1.7 + 1);
    left.arm.rotation.x = lerp(left.arm.rotation.x, -0.35 - 0.35 * s1, g);
    left.arm.rotation.z = lerp(left.arm.rotation.z, 0.15 + 0.12 * s2, g);
    left.fore.rotation.x = lerp(left.fore.rotation.x, -1.0 - 0.45 * s2, g);
    this.mic.visible = mic;
    if (mic) {
      right.arm.rotation.x = -0.32;
      right.arm.rotation.z = -0.32;
      right.fore.rotation.x = -2.05;
      right.fore.rotation.z = 0.35;
    } else {
      right.arm.rotation.x = lerp(right.arm.rotation.x, -0.3 + 0.3 * s2, g * 0.7);
      right.fore.rotation.x = lerp(right.fore.rotation.x, -0.9 + 0.35 * s1, g * 0.7);
    }
    // a little lean into it
    B.chest.rotation.x += g * 0.04 * Math.sin(this.t * 2.2);
  }

  dispose() {
    this.mic.traverse((o) => {
      if (o.isMesh) {
        o.geometry.dispose();
        o.material.dispose();
      }
    });
    this.body.dispose();
  }
}

const lerp = (a, b, t) => a + (b - a) * t;
