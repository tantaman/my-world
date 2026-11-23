// Who is met on the mountain, one at a time, where the poem has them:
//
//   Cato         an old man alone, beside the burrow on the plain (Canto I)
//   the boat     the Angel of God, "the Celestial Pilot", bringing the souls
//                over the sea to the shore at dawn, and gone again (II)
//   Belacqua     sitting behind his great rock on the terrace, hugging his
//                knees (IV)
//   two angels   in green, over the valley at evening, to drive off the
//                serpent, which comes through the grass (VIII)
//   the angel    of the gate, seated on its threshold with his sword (IX)
//   seven angels one at the foot of each stair, who wipe a P from your brow
//                with a wing as you pass (XII–XXVII); the last stands
//                outside the fire, on the verge
//   the lady     on the far bank of Lethe, "singing and culling floweret
//                after floweret" (XXVIII)
//
// Each is made once (models.js) and stood where it goes; what moves is
// moved here, a little each frame.

import * as THREE from 'three';
import { angel, cato, lady, serpent, boat, soul, boulder, createFigureMaterial, SOUL } from './models.js';
import { R, AT, BURROW, VALLEY, WAYS, TERRACES, STREAM, DAY } from './plan.js';

const GREEN = [0.12, 0.42, 0.14]; // "green as the little leaflets just now born"
const ASH = [0.32, 0.3, 0.27]; // the gate angel's robe: "ashes, or earth that dry is excavated"
const BOAT = { far: 1900, hours: [5.35, 5.95, 6.25, 6.85], seats: 9 }; // m out it comes from; when it sets out, lands, leaves, and is gone
const LADY = { along: [-140, 40], speed: 0.35 }; // where along the stream she walks (m), and how fast (m/s)
const SERPENT = { long: 90, speed: 1.4 }; // m it crosses the valley over, how fast
const FLAP = 1.6; // s a wing takes to beat, when an angel wipes a P

const _p = { x: 0, z: 0 };

export class People {
  // land: Purgatory's · group: where they stand
  constructor({ land, group }) {
    this.land = land;
    this.group = group;
    this.mat = createFigureMaterial();
    this.time = 0;
    this.flaps = new Map(); // stair -> s since its angel beat its wing
    // Cato, beside the burrow, turned toward where you come out of it
    this.cato = this._stand(cato(), BURROW.r + 6, AT.cato, null, this._facing(BURROW.r + 6, AT.cato, BURROW.r + 14, AT.burrow));
    // Belacqua's rock, and him behind it in its shadow
    const rock = this._stand(boulder(5), 1932, AT.rock, null, 0.4);
    rock.scale.setScalar(4.2);
    this.belacqua = this._stand(soul('sit'), 1926.5, AT.rock + 2.6 / 1926, null, this._facing(1926.5, AT.rock, 1950, AT.cleft));
    // the angel of the gate, seated on its threshold beside the door
    this.gateAngel = this._stand(
      angel({ robe: ASH, wing: [0.8, 0.78, 0.74], seated: true, sword: true }),
      R.cliff + 0.4,
      AT.gate + 2.4 / R.cliff,
      null,
      this._facing(R.cliff + 0.4, AT.gate, R.cliff + 12, AT.gate),
    );
    // an angel at the foot of each stair, turned toward whoever comes
    this.angels = [];
    for (let k = 0; k < 7; k++) {
      const w = WAYS[k + 1];
      const verge = k === 6; // (the last stands outside the flame, on the verge)
      const r = verge ? TERRACES[6].r - 0.8 : w.ra + 1.7;
      const th = w.a0 + (verge ? 3 : 1.6) / w.ra;
      const a = this._stand(angel(), r, th, null, this._facing(r, th, w.ra + 1, w.a0 + 12 / w.ra));
      a.userData.base = a.position.y;
      this.angels.push(a);
    }
    // the two angels in green over the valley, and the serpent
    this.valley = [VALLEY.r - VALLEY.rad - 12, VALLEY.r + VALLEY.rad + 6].map((r) => {
      const a = this._stand(angel({ robe: GREEN, wing: GREEN, sword: true, blunt: true }), r, AT.valley, 4, this._facing(r, AT.valley, VALLEY.r, AT.valley));
      a.visible = false;
      a.userData.base = a.position.y;
      return a;
    });
    this.serpent = this._stand(serpent(), VALLEY.r + 40, AT.valley, null, 0);
    this.serpent.visible = false;
    // the lady over Lethe
    this.lady = this._stand(lady(), 0, 0, null, 0);
    this.ladyAt = LADY.along[0];
    this.ladyDir = 1;
    // the angel's boat, and the souls in it
    this.boat = new THREE.Group();
    const hull = new THREE.Mesh(boat(), this.mat);
    hull.scale.set(1.2, 1, 1.3);
    this.boat.add(hull);
    const pilot = new THREE.Mesh(angel(), this.mat);
    pilot.position.set(0, 0, -2.9);
    this.boat.add(pilot);
    const sit = soul('sit');
    const shades = new THREE.MeshStandardMaterial({ color: new THREE.Color(...SOUL), roughness: 0.85 });
    for (let i = 0; i < BOAT.seats; i++) {
      const m = new THREE.Mesh(sit, shades);
      m.position.set(i % 2 ? 0.35 : -0.35, -0.2, -1.8 + i * 0.45);
      this.boat.add(m);
    }
    this.boat.visible = false;
    group.add(this.boat);
  }

  // A shape stood on the island at (r, th), h m over the ground there (null:
  // on it), facing yaw.
  _stand(geo, r, th, h, yaw) {
    const L = this.land;
    L.place(r, th, _p);
    const m = new THREE.Mesh(geo, this.mat);
    m.position.set(_p.x, L.height(_p.x, _p.z) + (h || 0), _p.z);
    m.rotation.y = yaw;
    m.castShadow = true;
    this.group.add(m);
    return m;
  }

  // The yaw that faces from (r0, th0) toward (r1, th1).
  _facing(r0, th0, r1, th1) {
    const L = this.land;
    const a = L.place(r0, th0, {});
    const b = L.place(r1, th1, {});
    return Math.atan2(b.x - a.x, b.z - a.z);
  }

  // The angel at the foot of stair k + 1 beats his wing.
  wing(k) {
    this.flaps.set(k, 0);
  }

  // here: { r, th, h, hours, region } (or null: nothing moves)
  update(dt, eye, here) {
    if (!here) return;
    this.time += dt;
    const t = this.time;
    const L = this.land;
    // the angels at the stairs stand light on their feet, and beat a wing
    // when they wipe a P
    this.angels.forEach((a, k) => {
      let lift = Math.sin(t * 0.8 + k) * 0.04;
      const f = this.flaps.get(k);
      if (f !== undefined) {
        const now = f + dt;
        if (now > FLAP) this.flaps.delete(k);
        else {
          this.flaps.set(k, now);
          lift += Math.sin((now / FLAP) * Math.PI) * 0.5;
        }
      }
      a.position.y = a.userData.base + lift;
    });
    // the valley at evening: the angels come down to their stations, and
    // the serpent comes through the grass and is driven off
    const evening = here.hours > DAY.set - 1.5 || here.hours < DAY.rise;
    for (const a of this.valley) {
      a.visible = evening;
      a.position.y = a.userData.base + Math.sin(t * 0.6) * 0.15;
    }
    const crawl = here.hours > DAY.set - 1.2 && here.hours < DAY.set - 0.2;
    this.serpent.visible = crawl;
    if (crawl) {
      const u = ((here.hours - (DAY.set - 1.2)) * SERPENT.speed * 60) % SERPENT.long;
      const r = VALLEY.r + VALLEY.rad * 0.6 - u * 0.4;
      const th = AT.valley + (u - SERPENT.long / 2) / VALLEY.r;
      L.place(r, th, _p);
      this.serpent.position.set(_p.x, L.height(_p.x, _p.z) + 0.02, _p.z);
      this.serpent.rotation.y = this._facing(r, th, r - 1, th + 2 / VALLEY.r);
    }
    // the lady walks her bank, gathering flowers
    this.ladyAt += this.ladyDir * LADY.speed * dt;
    if (this.ladyAt > LADY.along[1] || this.ladyAt < LADY.along[0]) this.ladyDir *= -1;
    const a = this._bank(this.ladyAt, _p);
    const b = this._bank(this.ladyAt + this.ladyDir, {});
    this.lady.position.set(a.x, L.height(a.x, a.z), a.z);
    this.lady.rotation.set(Math.max(0, Math.sin(t * 0.7)) * 0.35, Math.atan2(b.x - a.x, b.z - a.z), 0, 'YXZ'); // bending to the flowers as she goes
    // the angel's boat: in over the sea at dawn, and away again
    const [set, land, leave, gone] = BOAT.hours;
    const h = here.hours;
    this.boat.visible = h > set && h < gone;
    if (this.boat.visible) {
      const k = h < land ? 1 - (h - set) / (land - set) : h < leave ? 0 : (h - leave) / (gone - leave);
      const ease = k * k;
      const r = R.shore + 4 + ease * BOAT.far;
      const th = AT.burrow - 0.05;
      L.place(r, th, _p);
      this.boat.position.set(_p.x, L.top + 0.15, _p.z);
      this.boat.rotation.y = this._facing(r, th, r - 10, th) + (h > leave ? Math.PI : 0);
    }
  }

  // Where on the far bank of Lethe `along` m along the stream is: out.x, z.
  _bank(along, out) {
    return this.land.streamPoint(along, out, -(STREAM.half + STREAM.bank + 2.2));
  }
}
