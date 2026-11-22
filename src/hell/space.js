// Hell as somewhere to be: what world/spaces.js asks of a space. It is one
// space, a long way under the forest, as wide as the whole pit: its floor is
// the land's (land.js), or the roadway of a bridge you're on, or the top of
// something built that you're standing on; its roof is the dark, a long way
// up; and its walls are whatever is too steep to walk up, too deep to wade,
// or built.
//
//   space.ref           the angle of whoever is being followed (see land.js:
//                       a circle doesn't close, so where you are has a turn
//                       to it). follow(x, z) keeps it.
//   space.solids        built things in it: a Solids of its own (the world's
//                       is for the forest overhead, which the deer read too)
//
// Nothing here is drawn; terrain.js draws the same land.

import { Solids } from '../world/solids.js';
import { segDist } from '../core/geom.js';
import { WADE } from './plan.js';

const LID = 300; // m over the vestibule's floor: as high as anything flies
const STEEP = 1.05; // rise per metre you can still walk up
const LOOK = [0.15, 0.3, 0.45, 0.6, 0.75, 0.9]; // m ahead that the ground is felt for a wall
const LIP = 0.15; // m: a rise this much over what the slope allows is a wall
const DEEP = 8; // how much harder each metre too deep is to walk into than a metre of rock
const AIRBORNE = 1.6; // m over the ground: higher than this, no wall is in your way
const ON_DECK = 1.2; // m under a roadway's top that still counts as standing on it
const STEP = 0.45; // m: how high a built thing you can step up onto
const HEAD = 1.5; // m of head room

const _s = { h: 0, liq: 0, kind: 0, r: 0, th: 0 };
const _d = { top: 0, under: 0 };
const _seg = { d: 0, t: 0, nx: 0, nz: 0 };

export class HellSpace {
  constructor(land) {
    this.land = land;
    this.id = 'hell';
    this.surface = 'rock';
    this.x0 = land.cx - land.reach;
    this.z0 = land.cz - land.reach;
    this.x1 = land.cx + land.reach;
    this.z1 = land.cz + land.reach;
    this.lid = land.top + LID;
    this.ref = 0;
    this.solids = new Solids();
    this._found = { top: -Infinity, under: Infinity };
  }

  // Keep the turn of whoever is at (x, z): call it as they move.
  follow(x, z) {
    this.ref = this.land.polar(x, z, this.ref, _s).th;
    return this.ref;
  }

  // The land at (x, z), as whoever is being followed sees it: _s.
  _land(x, z) {
    return this.land.sample(x, z, this.ref, _s, false);
  }

  // What stands in for the ground at (x, z) for feet about y: the land, or
  // the bed of something too deep made out to be a wall (see walls()).
  _felt(x, z) {
    const s = this._land(x, z);
    const depth = s.liq - s.h;
    const h = depth > WADE ? s.h + DEEP * (depth - WADE) + depth : s.h;
    // (and what was built across the way stands on it)
    return h + this.land.barrier(s.r, s.th, x, z);
  }

  // The built things over and under feet at (x, z, y): the highest top they
  // can stand on (into this._found.top) and the lowest underside over their
  // head (.under).
  _built(x, z, y) {
    const f = this._found;
    f.top = -Infinity;
    f.under = Infinity;
    this.solids.forEachNear(x, z, 0.5, (s) => {
      segDist(x, z, s.ax, s.az, s.bx, s.bz, _seg);
      if (_seg.d > s.r) return;
      const top = s.topA + (s.topB - s.topA) * _seg.t;
      if (y >= top - (s.step ?? STEP)) f.top = Math.max(f.top, top);
      else if (s.bottom > y + 0.5) f.under = Math.min(f.under, s.bottom);
    });
    return f;
  }

  inside(x, z, y, out) {
    if (!(y < this.lid) || x < this.x0 || z < this.z0 || x > this.x1 || z > this.z1) return false;
    const s = this._land(x, z);
    if (s.r > this.land.reach) return false;
    let floor = s.h;
    let roof = this.lid;
    if (this.land.deck(s.r, s.th, _d)) {
      if (y >= _d.top - ON_DECK) floor = _d.top;
      else roof = _d.under;
    }
    const b = this._built(x, z, y);
    if (b.top > floor) floor = b.top;
    if (b.under < roof) roof = b.under;
    out.floor = floor;
    out.roof = roof;
    return true;
  }

  // How far (x, z) is from what would stop someone whose feet are at y:
  // ground too steep to walk up, something too deep to wade, a wall.
  walls(x, z, out, y = -Infinity) {
    out.d = Infinity;
    out.nx = 0;
    out.nz = 0;
    const here = this._land(x, z);
    const ground = here.h;
    const r = here.r;
    const th = here.th;
    // up on a bridge, or in the air: only what is built is in the way
    const onDeck = this.land.deck(r, th, _d) && y >= _d.top - ON_DECK;
    if (!onDeck && y < ground + AIRBORNE) {
      const e = 0.3;
      const gx = this._felt(x + e, z) - this._felt(x - e, z);
      const gz = this._felt(x, z + e) - this._felt(x, z - e);
      const g = Math.hypot(gx, gz);
      if (g > 2 * e * STEEP * 0.6) {
        const ux = gx / g;
        const uz = gz / g;
        const from = Math.max(y, ground);
        for (const d of LOOK) {
          if (this._felt(x + ux * d, z + uz * d) <= from + STEEP * d + LIP) continue;
          out.d = d - 0.15;
          out.nx = -ux;
          out.nz = -uz;
          break;
        }
      }
    }
    this.solids.forEachNear(x, z, 1.6, (s) => {
      segDist(x, z, s.ax, s.az, s.bx, s.bz, _seg);
      const d = _seg.d - s.r;
      if (d >= out.d) return;
      const top = s.topA + (s.topB - s.topA) * _seg.t;
      if (y >= top - (s.step ?? STEP) || y + HEAD < s.bottom) return;
      out.d = d;
      out.nx = _seg.nx;
      out.nz = _seg.nz;
    });
    return out;
  }

  // Is (x, y, z) open air in it, at least m clear of the ground?
  air(x, y, z, m = 0) {
    if (!(y < this.lid) || x < this.x0 || z < this.z0 || x > this.x1 || z > this.z1) return false;
    const s = this._land(x, z);
    if (s.r > this.land.reach) return false;
    if (this.land.deck(s.r, s.th, _d) && y > _d.under - m && y < _d.top + m) return false;
    return y > Math.max(s.h, s.liq > -1e8 ? s.liq - 0.2 : s.h) + m;
  }

  // How deep whatever lies at (x, z) is (m; 0 on dry ground), and in
  // out.kind which liquid it is.
  depth(x, z, out = null) {
    const s = this._land(x, z);
    if (out) out.kind = s.kind;
    return s.liq > s.h ? s.liq - s.h : 0;
  }
}
