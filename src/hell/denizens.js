// Where Hell's keepers and monsters stand, and what little they do.
//
// Their shapes are creatures.js's. This puts them where the poem has them:
// Minos at the foot of the first way down, his tail about him; Cerberus in
// the third circle's mud; Plutus at the foot of the way into the fourth; the
// Furies on the tower over the gate of Dis; the Minotaur at the top of the
// ruin; centaurs along the river of blood, harpies in the wood; in Malebolge
// the demons with their whips and the Malebranche with their hooks; the
// giants round the well; and Lucifer in the ice, his six wings beating.
//
// The first five are who they are, and stand in sector 0, where the poem's
// road goes. Centaurs and harpies every sector has, as it has its own ways
// down (land.js). The rest belong to the pit, of which there is one.
//
// (Charon, Phlegyas, Geryon and Antaeus carry you: they are rides.js's.)

import * as THREE from 'three';
import { R, H, STEPS, SECTOR, BOLGE, bolgeOuter } from './plan.js';
import { WALL } from './land.js';
import { hash2i } from '../noise.js';

const NEAR = 700; // m: a sector's are made when you're this close to it (along the arc)
const GALLOP = 9; // m/s: the centaurs, along the bank
const RUN = 3.6; // m/s: the banner, and the crowd behind it
const GIANTS = ['nimrod', 'ephialtes', 'nimrod', 'ephialtes', 'nimrod']; // round the well, besides Antaeus
export const GIANT_OUT = 10; // m in from the well's lip that a giant stands: against its wall, his chest over the rim

const frac = (h) => (h >>> 8) / 16777216;
const _p = { x: 0, z: 0 };

export class Denizens {
  // land: Hell's · group: where they go · make(name): one of creatures.js's shapes
  constructor({ land, group, make }) {
    this.land = land;
    this.group = group;
    this.make = make;
    this.sectors = new Map(); // k -> { group, ticks }
    this.pit = null;
    this.time = 0;
  }

  // One, standing at (r, th), h over Hell's top, turned `yaw` from facing the
  // middle of the pit.
  _stand(into, name, r, th, h, yaw = 0, scale = 1) {
    const L = this.land;
    const g = this.make(name);
    L.place(r, th, _p);
    g.position.set(_p.x, h === null ? L.height(_p.x, _p.z, th) : L.top + h, _p.z);
    g.rotation.y = Math.atan2(L.cx - _p.x, L.cz - _p.z) + yaw;
    g.scale.setScalar(scale);
    into.add(g);
    return g;
  }

  // r, th: where you are in Hell
  update(dt, r, th) {
    this.time += dt;
    const L = this.land;
    const k0 = L.sectorOf(th);
    const want = new Set();
    for (let k = k0 - 1; k <= k0 + 1; k++) {
      if (Math.abs(k * SECTOR - th) * Math.max(r, R.brink) > NEAR + SECTOR * r * 0.5) continue;
      want.add(k);
      if (!this.sectors.has(k)) this.sectors.set(k, this._sector(k));
    }
    for (const [k, s] of this.sectors) {
      if (want.has(k)) {
        for (const tick of s.ticks) tick(this.time, dt);
        continue;
      }
      this.group.remove(s.group);
      this.sectors.delete(k);
    }
    // the pit's own, while you're in it or on its brink
    const near = r < R.brink + 250;
    if (near && !this.pit) this.pit = this._pit();
    if (this.pit) {
      this.pit.group.visible = near;
      if (near) for (const tick of this.pit.ticks) tick(this.time, dt);
    }
  }

  _sector(k) {
    const L = this.land;
    const s = L.sector(k);
    const group = new THREE.Group();
    const ticks = [];
    const rnd = (n) => frac(hash2i(k, n, L.seed ^ 0x51d));

    if (k === 0) {
      // Minos, where the first way down comes out
      const c1 = STEPS[0];
      const foot = (st) => st.at - ((st.hi - st.lo) / st.pass.slope - st.pass.back) - 9;
      this._stand(group, 'minos', foot(c1), s.pass[0] + 9 / c1.at, null, Math.PI);
      // Cerberus, over the gluttons, a little on from the second
      const c2 = STEPS[1];
      const dog = this._stand(group, 'cerberus', foot(c2) - 24, s.pass[1] + 14 / c2.at, null, Math.PI - 0.5);
      const heads = dog.userData.parts || {};
      ticks.push((t) => {
        ['head1', 'head2', 'head3'].forEach((h, i) => {
          if (heads[h]) heads[h].rotation.set(Math.sin(t * 1.3 + i * 2) * 0.12, Math.sin(t * 0.9 + i * 1.7) * 0.22, 0);
        });
      });
      // Plutus, at the foot of the third
      this._stand(group, 'plutus', foot(STEPS[2]), s.pass[2] - 8 / STEPS[2].at, null, Math.PI);
      // the Furies, on the high tower over the gate
      for (let i = -1; i <= 1; i++) this._stand(group, 'fury', WALL.r - 0.8, s.quay + (i * 1.5) / WALL.r, H.dis + 38.6, Math.PI);
      // the Minotaur, stretched along the edge of the ruin
      const ruin = STEPS[4];
      this._stand(group, 'minotaur', ruin.at + ruin.pass.back + 7, s.pass[4] - 15 / ruin.at, null, 0.6);
    }

    // the ensign the vestibule's crowd runs after, going on round for ever
    {
      const banner = this.make('banner');
      const flag = (banner.userData.parts || {}).flag;
      const r = R.acheronOut + 105;
      group.add(banner);
      ticks.push((t) => {
        const th = (k - 0.5 + ((t * RUN) / (SECTOR * r)) % 1) * SECTOR;
        L.place(r, th, _p);
        banner.position.set(_p.x, L.height(_p.x, _p.z, th), _p.z);
        banner.rotation.y = Math.atan2(-(_p.z - L.cz), _p.x - L.cx);
        if (flag) flag.rotation.y = Math.sin(t * 5) * 0.25;
      });
    }

    // centaurs, in file along the bank of the river of blood
    const n = 4;
    for (let i = 0; i < n; i++) {
      const c = this.make('centaur');
      const parts = c.userData.parts || {};
      const r = R.bloodOut + 9 + (i % 2) * 5;
      const dir = rnd(7) < 0.5 ? 1 : -1;
      const span = SECTOR * 0.86; // they keep to their sector, and turn back at its ends
      group.add(c);
      ticks.push((t) => {
        // back and forth along the arc, a length behind each other
        const along = ((t * GALLOP + i * 9) / r) % (2 * span);
        const a = along < span ? along : 2 * span - along;
        const going = (along < span ? 1 : -1) * dir;
        const th = (k - 0.43) * SECTOR + (dir > 0 ? a : span - a);
        L.place(r, th, _p);
        c.position.set(_p.x, L.height(_p.x, _p.z, th), _p.z);
        // on round to the left is +th; they face the way they go
        c.rotation.y = Math.atan2(-(_p.z - L.cz) * going, (_p.x - L.cx) * going);
        const g = t * 9 + i;
        if (parts.legFL) parts.legFL.rotation.x = Math.sin(g) * 0.7;
        if (parts.legFR) parts.legFR.rotation.x = Math.sin(g + 0.6) * 0.7;
        if (parts.legBL) parts.legBL.rotation.x = Math.sin(g + Math.PI) * 0.7;
        if (parts.legBR) parts.legBR.rotation.x = Math.sin(g + Math.PI + 0.6) * 0.7;
        c.position.y += Math.abs(Math.sin(g)) * 0.12;
      });
    }
    // harpies, in the thorn trees
    for (let i = 0; i < 7; i++) {
      const r = R.wood + 30 + rnd(20 + i) * (R.bloodIn - R.wood - 60);
      const th = (k + (rnd(40 + i) - 0.5) * 0.8) * SECTOR;
      L.place(r, th, _p);
      const h = this._stand(group, 'harpy', r, th, null, rnd(60 + i) * 6.28);
      h.position.y += 3.6 + rnd(80 + i) * 1.4;
      const parts = h.userData.parts || {};
      ticks.push((t) => {
        const flap = Math.max(0, Math.sin(t * 0.5 + i * 2.1) - 0.8) * 5;
        // (a wing opens as its turn grows, left and right alike: creatures.js)
        if (parts.wingL) parts.wingL.rotation.z = flap * 0.6;
        if (parts.wingR) parts.wingR.rotation.z = flap * 0.6;
      });
    }
    this.group.add(group);
    return { group, ticks };
  }

  _pit() {
    const L = this.land;
    const group = new THREE.Group();
    const ticks = [];
    L.spokes.forEach((th, j) => {
      // the first ditch: horned demons with scourges, on its floor
      const d0 = bolgeOuter(0) - BOLGE.bank;
      for (const [q, off] of [[BOLGE.ditch * 0.3, 22], [BOLGE.ditch * 0.7, -26]]) {
        const s = this._stand(group, 'scourger', d0 - q, th + off / d0, null, Math.PI / 2 + j);
        const arm = (s.userData.parts || {}).armR;
        if (arm) ticks.push((t) => (arm.rotation.x = -0.4 + Math.max(0, Math.sin(t * 2.2 + j * 1.3)) * 1.1));
      }
      // the fifth: the Malebranche, on its banks, watching the pitch
      const d4 = bolgeOuter(4) - BOLGE.bank;
      for (const [r, off, turn] of [[d4 + 2.5, 9, 0], [d4 - BOLGE.ditch - 2.5, -11, Math.PI], [d4 + 2.5, -34, 0.3]]) {
        const d = this._stand(group, 'devil', r, th + off / d4, null, turn);
        const parts = d.userData.parts || {};
        ticks.push((t) => {
          const beat = 0.12 + Math.sin(t * 1.1 + j + off) * 0.16;
          if (parts.wingL) parts.wingL.rotation.z = beat;
          if (parts.wingR) parts.wingR.rotation.z = beat;
        });
      }
    });
    // the ninth ditch: the one with the sword, where the first bridge crosses
    const d8 = bolgeOuter(8) - BOLGE.bank - BOLGE.ditch / 2;
    this._stand(group, 'devil', d8, L.spokes[0] - 12 / d8, null, Math.PI / 2);

    // the giants, on the shelf round the well, looking out over its rim
    GIANTS.forEach((name, i) => {
      const th = L.spokes[0] + ((i + 1) * Math.PI * 2) / (GIANTS.length + 1);
      this._stand(group, name, R.well - GIANT_OUT, th, H.shelf, Math.PI);
    });

    // Lucifer, at the middle of everything
    const lucifer = this.make('lucifer');
    lucifer.position.set(L.cx, L.top + H.centre, L.cz);
    // he faces the way you come: toward the first bridge
    L.place(100, L.spokes[0], _p);
    lucifer.rotation.y = Math.atan2(_p.x - L.cx, _p.z - L.cz);
    group.add(lucifer);
    const parts = lucifer.userData.parts || {};
    ticks.push((t) => {
      // three pairs of wings, each a little after the last, and the three jaws working
      for (let i = 1; i <= 6; i++) {
        const w = parts[`wing${i}`];
        if (w) w.rotation.z = Math.sin(t * 0.9 - Math.floor((i - 1) / 2) * 0.7) * 0.2;
      }
      // (a jaw shuts as its turn falls, on what it chews)
      for (const [jaw, at] of [['jawFront', 0], ['jawLeft', 1.3], ['jawRight', 2.6]]) if (parts[jaw]) parts[jaw].rotation.x = -0.12 + Math.sin(t * 1.7 + at) * 0.16;
    });
    this.group.add(group);
    return { group, ticks };
  }
}
