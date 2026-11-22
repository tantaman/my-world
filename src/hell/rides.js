// The ways across and down that nobody walks: Charon's boat over Acheron,
// Phlegyas's over Styx to the gate of Dis, Geryon's back down the great
// cliff, and Antaeus's hand into the well.
//
// Each is a Ride: something that waits at one end of a way, takes you when
// you step onto it and stand a moment, carries you to the other end and sets
// you down there, where it waits to take you back. Come to the end it isn't
// at and it comes over for you. While it has you it is what moves you
// (player.aboard: player/player.js).
//
// The boats and Geryon belong to a sector of the circles they serve (every
// sector has its own: the circles don't end), and are made as you come near.
// Antaeus is the one he is.
//
//   new Rides({ land, space, group, make }).update(dt, player, r, th) -> cue
// make(name): one of creatures.js's shapes. cue: null, or what to say to
// someone standing where a ride would take them: { text, progress }.

import * as THREE from 'three';
import { R, H, STEPS } from './plan.js';
import { WALL } from './land.js';
import { GIANT_OUT } from './denizens.js';

const REACH = 1.9; // m: this close to where a ride takes you from, you're on it
const DWELL = 0.9; // s you stand there before it goes
const CALL = 34; // m: come this close to the end it isn't at, and it comes over
const REARM = 4.5; // m you must step away before it takes you again
const NEAR = 520; // m: a sector's rides are made this close, and kept twice as far

const smooth = (t) => t * t * (3 - 2 * t);
const _a = {};
const _o = {};

// A way from A to B and back. A subclass says where: at(t, out) fills
// out.x, y, z and out.yaw for t in 0..1 (0 at A), and has `time` (s, one
// way), `name`, and `ends` (where you stand to board at each: [A, B], each
// { x, y, z }) and `sets` (where you're set down: [A, B]).
class Ride {
  constructor() {
    this.t = 0; // where it is along its way, 0..1
    this.going = 0; // +1 toward B, -1 toward A, 0 waiting
    this.rider = false;
    this.armed = true;
    this.dwell = 0;
    this.object = new THREE.Group();
    this._p = { x: 0, y: 0, z: 0, yaw: 0 };
    this.aboard = {
      place: (out, dt) => {
        this._step(dt * (this.pace || 1));
        const p = this.at(this.t, this._p);
        out.x = p.x;
        out.y = p.y + (this.stand || 0);
        out.z = p.z;
        out.yaw = p.yaw + (this.going < 0 ? Math.PI : 0);
        out.grounded = !this.flies;
        out.behind = 1.2;
        out.back = this.back || 0;
      },
    };
  }

  _step(dt) {
    if (!this.going) return;
    this.t = Math.min(1, Math.max(0, this.t + (this.going * dt) / this.time));
    if (this.t === 0 || this.t === 1) this.going = 0;
  }

  // The end it is at (0 or 1), or -1 on its way.
  get end() {
    return this.going ? -1 : this.t < 0.5 ? 0 : 1;
  }

  // dt; player: the Player. -> a cue, or null.
  update(dt, player) {
    const p = player.pos;
    if (this.rider) {
      // (the player steps it along, from aboard.place)
      if (!this.going) {
        // there: set down
        const to = this.sets[this.end];
        player.aboard = null;
        player.pos.set(to.x, to.y, to.z);
        player.vel.set(0, 0, 0);
        if (to.yaw !== undefined) player.yaw = to.yaw;
        this.rider = false;
        this.armed = false;
      }
    } else {
      this._step(dt);
      const d = this.ends.map((e) => Math.hypot(p.x - e.x, p.z - e.z) + Math.abs(p.y - e.y) * 2);
      const here = this.end;
      if (Math.min(d[0], d[1]) > REARM) this.armed = true;
      // come over for someone waiting at the other end
      if (here >= 0 && d[1 - here] < CALL && d[1 - here] < d[here] && !player.aboard) this.going = here === 0 ? 1 : -1;
      if (here >= 0 && this.armed && d[here] < REACH && !player.aboard) {
        this.dwell += dt;
        if (this.dwell >= DWELL) {
          this.dwell = 0;
          this.rider = true;
          this.going = here === 0 ? 1 : -1;
          player.aboard = this.aboard;
          return null;
        }
        this._pose();
        return { text: this.name, progress: this.dwell / DWELL };
      }
      this.dwell = 0;
    }
    this._pose();
    return null;
  }

  // Put what is seen of it where it is.
  _pose() {
    const p = this.at(this.t, this._p);
    this.object.position.set(p.x, p.y, p.z);
    this.object.rotation.y = p.yaw + (this.turned || 0);
    if (this.pose) this.pose(this.t, this.going);
  }

  // How far its nearer end is from (x, z).
  far(x, z) {
    return Math.min(...this.ends.map((e) => Math.hypot(x - e.x, z - e.z)));
  }
}

// ── Boats ───────────────────────────────────────────────────────────────────
// A boat straight over a water between two shores, on a line through the
// axis at angle th: from where the water is first deep enough going in from
// r0, to where it last is before r1.
class Ferry extends Ride {
  constructor({ land, th, r0, r1, name, speed, make, crew }) {
    super();
    this.name = name;
    // each shore: the first water deep enough to float it, coming from the land
    const shore = (from, to) => {
      const step = from < to ? 1 : -1;
      for (let r = from; step * (to - r) > 0; r += step) {
        land.place(r, th, _a);
        const s = land.sample(_a.x, _a.z, th, _o, false);
        if (s.liq - s.h > 0.55) return { r, level: s.liq };
      }
      return { r: (from + to) / 2, level: land.top };
    };
    const a = shore(r0, r1);
    const b = shore(r1, r0);
    this.level = a.level;
    const A = land.place(a.r, th, {});
    const B = land.place(b.r, th, {});
    this.A = A;
    this.B = B;
    this.time = Math.hypot(B.x - A.x, B.z - A.z) / speed;
    this.yaw = Math.atan2(B.x - A.x, B.z - A.z);
    const boat = make('boat');
    this.deck = boat.userData.deck ?? 0.15;
    this.stand = this.deck;
    this.back = 3;
    this.object.add(boat);
    // who rows it stands in the stern
    const who = make(crew);
    who.position.set(0, this.deck, -2.3);
    this.object.add(who);
    this.who = who;
    const y = this.level;
    this.ends = [{ x: A.x, y: y - 0.5, z: A.z }, { x: B.x, y: y - 0.5, z: B.z }];
    // set down a few steps up the shore, facing on
    const up = (r, away) => {
      const p = land.place(r, th, {});
      return { x: p.x, z: p.z, y: land.height(p.x, p.z, th) + 0.3, yaw: this.yaw + (away ? Math.PI : 0) };
    };
    const out = Math.sign(r0 - r1);
    this.sets = [up(a.r + out * 7, true), up(b.r - out * 7, false)];
    this._pose();
  }

  at(t, out) {
    const k = smooth(t);
    out.x = this.A.x + (this.B.x - this.A.x) * k;
    out.z = this.A.z + (this.B.z - this.A.z) * k;
    out.y = this.level;
    out.yaw = this.yaw;
    return out;
  }

  pose(t, going) {
    // it rocks a little, more under way; and turns about at each shore
    const now = performance.now() / 1000;
    this.object.rotation.z = Math.sin(now * 1.1) * (going ? 0.035 : 0.015);
    this.object.position.y += Math.sin(now * 0.8) * 0.03;
    if (going < 0) this.object.rotation.y += Math.PI;
  }
}

// ── Geryon ──────────────────────────────────────────────────────────────────
// Down the great cliff in wide slow wheels, from the lip beside the brook's
// fall to the stony field at its foot; and back up the same way.
class Flight extends Ride {
  constructor({ land, th, make }) {
    super();
    this.name = "Geryon's back";
    this.time = 46;
    this.flies = true;
    this.back = 7;
    const lip = R.brink + STEPS[5].w / 2;
    this.land = land;
    this.th = th;
    this.top = land.top + H.c7 + 1.2;
    this.bottom = land.top + H.bolge + 2.2;
    this.rad = [60, 16]; // how wide his wheeling is, at the top and at the bottom,
    this.c0 = lip + 1.5 - this.rad[0]; // and where its middle is: he starts with his shoulders on the lip
    this.c1 = lip - 79;
    this.turns = 1.75;
    // (he is put so that where you sit on him is where the ride is)
    const g = make('geryon');
    this.seat = g.userData.seat || [0, 0, 0];
    g.position.set(-this.seat[0], 0, -this.seat[2]);
    this.stand = this.seat[1];
    this.object.add(g);
    this.parts = g.userData.parts || {};
    const a = this.at(0, {});
    const b = this.at(1, {});
    // you step onto him from the ground at either end, and are set down on it
    const back = land.place(lip + 7, th, {});
    this.ends = [{ x: a.x, y: land.height(a.x, a.z, th), z: a.z }, { x: b.x, y: land.height(b.x, b.z, th), z: b.z }];
    this.sets = [
      { x: back.x, z: back.z, y: land.height(back.x, back.z, th) + 0.2 },
      { x: b.x, z: b.z, y: land.height(b.x, b.z, th) + 0.2 },
    ];
    this._pose();
  }

  at(t, out) {
    const k = smooth(t);
    const ang = k * this.turns * Math.PI * 2;
    const rad = this.rad[0] + (this.rad[1] - this.rad[0]) * Math.pow(k, 1.5);
    const c = this.c0 + (this.c1 - this.c0) * k;
    // round a middle that lies on the line from the axis through th: out
    // toward the cliff at ang 0, then on round
    const L = this.land;
    const ox = Math.cos(this.th + L.turn);
    const oz = Math.sin(this.th + L.turn);
    const x = L.cx + ox * c + (ox * Math.cos(ang) - oz * Math.sin(ang)) * rad;
    const z = L.cz + oz * c + (oz * Math.cos(ang) + ox * Math.sin(ang)) * rad;
    out.x = x;
    out.z = z;
    out.y = this.top + (this.bottom - this.top) * k;
    // heading: the way round he is going
    const hx = -ox * Math.sin(ang) - oz * Math.cos(ang);
    const hz = -oz * Math.sin(ang) + ox * Math.cos(ang);
    out.yaw = Math.atan2(hx, hz);
    return out;
  }

  pose(t, going) {
    const now = performance.now() / 1000;
    // banked into the turn, his tail and his paws working
    this.object.rotation.z = going ? -0.22 * going : 0;
    if (going < 0) this.object.rotation.y += Math.PI;
    if (this.parts.tail) this.parts.tail.rotation.x = Math.sin(now * 1.4) * 0.14;
    if (this.parts.pawL) this.parts.pawL.rotation.x = Math.sin(now * 2.1) * 0.3;
    if (this.parts.pawR) this.parts.pawR.rotation.x = Math.sin(now * 2.1 + 1.4) * 0.3;
    this.object.position.y += Math.sin(now * 0.9) * 0.25;
  }
}

// ── Antaeus ─────────────────────────────────────────────────────────────────
// He stands in the well; you step onto his hand at its lip, and he sets you
// down at his feet. (And lifts you out again.)
class Hand extends Ride {
  constructor({ land, th, make }) {
    super();
    this.name = "Antaeus's hand";
    this.time = 7;
    this.flies = true;
    this.back = 5;
    const A = land.place(R.well + 2.2, th, {});
    const B = land.place(R.well - 20, th, {});
    this.A = { x: A.x, z: A.z, y: land.top + H.lip + 0.4 };
    this.B = { x: B.x, z: B.z, y: land.top + H.shelf + 0.4 };
    this.yaw = Math.atan2(B.x - A.x, B.z - A.z);
    this.ends = [this.A, this.B];
    this.sets = [
      { x: A.x, z: A.z, y: this.A.y, yaw: this.yaw + Math.PI },
      { x: B.x, z: B.z, y: this.B.y, yaw: this.yaw },
    ];
    // the giant himself stands against the well's wall beside the way, facing out
    const giant = make('antaeus');
    const at = land.place(R.well - GIANT_OUT, th + 9 / R.well, {});
    this.giant = giant;
    giant.position.set(at.x, land.top + H.shelf, at.z);
    giant.rotation.y = Math.atan2(at.x - land.cx, at.z - land.cz);
    this.arm = giant.userData.parts ? giant.userData.parts.arm : null;
    this._pose();
  }

  at(t, out) {
    const k = smooth(t);
    out.x = this.A.x + (this.B.x - this.A.x) * k;
    out.z = this.A.z + (this.B.z - this.A.z) * k;
    // up off the lip, over, and down
    out.y = this.A.y + (this.B.y - this.A.y) * k + Math.sin(Math.PI * k) * 5;
    out.yaw = this.yaw;
    return out;
  }

  pose(t) {
    // (his arm swings forward as its turn falls: out to the lip, then down to his feet)
    if (this.arm) this.arm.rotation.x = -0.3 + smooth(t) * 0.6;
  }
}

// ── All of them ─────────────────────────────────────────────────────────────
export class Rides {
  constructor({ land, group, make }) {
    this.land = land;
    this.group = group;
    this.make = make;
    this.rides = new Map(); // id -> Ride
    // how fast time goes for them (the play-through hurries them along)
    this.pace = 1;
  }

  _add(id, ride) {
    this.rides.set(id, ride);
    this.group.add(ride.object);
    if (ride.giant) this.group.add(ride.giant);
  }

  _drop(id) {
    const ride = this.rides.get(id);
    this.group.remove(ride.object);
    if (ride.giant) this.group.remove(ride.giant);
    this.rides.delete(id);
  }

  // The rides a sector has, by where they are: [id, r (about), make]
  _of(k) {
    const L = this.land;
    const s = L.sector(k);
    const lip = R.brink + STEPS[5].w / 2;
    return [
      [`charon:${k}`, R.acheronOut, s.ferry, () => new Ferry({ land: L, th: s.ferry, r0: R.acheronOut + 14, r1: R.acheronIn - 14, name: "Charon's boat", speed: 4.6, make: this.make, crew: 'charon' })],
      [`phlegyas:${k}`, R.c4 - 60, s.quay, () => new Ferry({ land: L, th: s.quay, r0: R.c4 - 20, r1: WALL.r + 2, name: "Phlegyas's boat", speed: 13, make: this.make, crew: 'phlegyas' })],
      [`geryon:${k}`, lip, s.brook + 15 / lip, () => new Flight({ land: L, th: s.brook + 15 / lip, make: this.make })],
    ];
  }

  // He stands by the first spoke's bridge, a little on round from it.
  _antaeus() {
    return new Hand({ land: this.land, th: this.land.spokes[0] + 14 / R.well, make: this.make });
  }

  // -> a cue for the HUD, or null
  update(dt, player, r, th) {
    const L = this.land;
    const p = player.pos;
    const want = new Set();
    const k0 = L.sectorOf(th);
    for (let k = k0 - 1; k <= k0 + 1; k++) {
      for (const [id, rr, a, make] of this._of(k)) {
        const at = L.place(rr, a, _a);
        const d = Math.hypot(at.x - p.x, at.z - p.z);
        const has = this.rides.get(id);
        if (d < NEAR || (has && (d < NEAR * 2 || has.rider))) {
          want.add(id);
          if (!has) this._add(id, make());
        }
      }
    }
    // Antaeus, when you're in the pit
    if (r < R.brink) {
      want.add('antaeus');
      if (!this.rides.has('antaeus')) this._add('antaeus', this._antaeus());
    }
    let cue = null;
    for (const [id, ride] of [...this.rides]) {
      if (!want.has(id) && !ride.rider) {
        this._drop(id);
        continue;
      }
      ride.pace = this.pace;
      cue = ride.update(dt * this.pace, player) || cue;
    }
    return cue;
  }

  // The ride nearest (x, z) of a kind ('charon', 'phlegyas', 'geryon',
  // 'antaeus'), made if it wasn't: for the console, and the play-through.
  nearest(kind, th) {
    if (kind === 'antaeus') {
      if (!this.rides.has('antaeus')) this._add('antaeus', this._antaeus());
      return this.rides.get('antaeus');
    }
    const k = this.land.sectorOf(th);
    for (const [id, , , make] of this._of(k)) {
      if (!id.startsWith(kind)) continue;
      if (!this.rides.has(id)) this._add(id, make());
      return this.rides.get(id);
    }
    return null;
  }
}
