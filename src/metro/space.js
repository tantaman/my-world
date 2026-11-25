// The Metro as somewhere you can be (a space: world/spaces.js): the
// platforms of its stations, to walk along, under the coffered vaults of
// those below the street; and its tunnels, for the trains that carry you
// through them, and for the camera to keep inside of.
//
// A platform's edges and ends are its walls: you walk along it, wait, get on
// a train and off again, and leave by the way you came in (the act key at
// its end). The ones above the street, on a viaduct or the ground, are open
// to the sky; you're on them only while your feet are at their height, so
// walking under a viaduct is walking on the street.
//
// From the street, an entrance's escalators go down into a well, open to the
// sky at the top and roofed over further down (where the escalators go in
// under the street): that's walked down into, while the entrance is stood up
// (addWell).
//
// Under the street, a station's vault is lit (light 0.85: your eyes keep the
// daylight they had) and a tunnel only dimly (0.5: whatever your headlamp
// was doing, it goes on doing).
//
// No three.js in here.

import { TUNNEL, TUBE, onLevel } from './network.js';

const CELL = 64; // m: the squares rooms and tunnels are looked up by
const END = 7; // m a vault runs on past the end of its platforms
const SPRING = 0.5; // m over a platform's floor where its vault springs from
const WIDER = 1.6; // m a vault reaches out past its outermost platform or track
const ABOVE = 1.2; // m under a platform's floor that feet still count as on it
const OPEN_UP = 6; // m over an open platform's floor that still counts as on it
const LIGHT = { station: 0.85, tunnel: 0.5 };

const _o = { a: 0, c: 0 };
const _w = { along: 0, c: 0 };

export class MetroSpace {
  constructor(net) {
    this.surface = 'platform';
    this.rooms = [];
    this.grid = new Map(); // "i,j" -> { rooms: [], tubes: [] }
    let [x0, z0, x1, z1] = [Infinity, Infinity, -Infinity, -Infinity];
    const cell = (i, j) => {
      const k = `${i},${j}`;
      let c = this.grid.get(k);
      if (!c) this.grid.set(k, (c = { rooms: [], tubes: [] }));
      return c;
    };
    const cover = (bx0, bz0, bx1, bz1, fn) => {
      [x0, z0, x1, z1] = [Math.min(x0, bx0), Math.min(z0, bz0), Math.max(x1, bx1), Math.max(z1, bz1)];
      for (let i = Math.floor(bx0 / CELL); i <= Math.floor(bx1 / CELL); i++) for (let j = Math.floor(bz0 / CELL); j <= Math.floor(bz1 / CELL); j++) fn(cell(i, j));
    };
    for (const L of net.levels) {
      const under = L.what === 'tunnel';
      const cs = [...L.platforms.flatMap((p) => [p.c0, p.c1]), ...L.tracks.flatMap((t) => [t - TUBE.half, t + TUBE.half])];
      const c0 = Math.min(...cs) - (under ? WIDER : 0);
      const c1 = Math.max(...cs) + (under ? WIDER : 0);
      const room = {
        L,
        under,
        a0: L.a0 - (under ? END : 0),
        a1: L.a1 + (under ? END : 0),
        c0,
        c1,
        mid: (c0 + c1) / 2,
        half: (c1 - c0) / 2,
        spring: L.floor + SPRING,
        crown: L.rail + TUBE.vault,
      };
      this.rooms.push(room);
      // (its corners in the world, for the squares it's in)
      const xs = [];
      const zs = [];
      for (const a of [room.a0, room.a1]) {
        for (const c of [room.c0, room.c1]) {
          xs.push(L.x + L.dx * a - L.dz * c);
          zs.push(L.z + L.dz * a + L.dx * c);
        }
      }
      cover(Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs), (c) => c.rooms.push(room));
    }
    for (const t of net.tracks) {
      for (let i = 0; i + 1 < t.n; i++) {
        if (t.kind[i] !== TUNNEL) continue;
        const tube = { ax: t.x[i], az: t.z[i], ay: t.y[i], bx: t.x[i + 1], bz: t.z[i + 1], by: t.y[i + 1] };
        const r = TUBE.half;
        cover(Math.min(tube.ax, tube.bx) - r, Math.min(tube.az, tube.bz) - r, Math.max(tube.ax, tube.bx) + r, Math.max(tube.az, tube.bz) + r, (c) => c.tubes.push(tube));
      }
    }
    Object.assign(this, { x0, z0, x1, z1 });
    this._hit = { room: null, tube: null, well: null, floor: 0, roof: 0, c: 0, a: 0, across: 0, u: 0 };
    this.wells = new Set();
  }

  // An entrance's well: { x, z (the top of its escalators), dx, dz (the way
  // down), half (m across), run (m along), g0 (the street's height at its
  // top), depth (m down to its foot), open (how much of it, from the top,
  // is open to the sky, 0..1) }
  addWell(w) {
    this.wells.add(w);
  }

  removeWell(w) {
    this.wells.delete(w);
  }

  // Where (x, z) is in a well: out.along (m from its top), out.c (across). -> the well, or null
  _well(x, z, out) {
    for (const w of this.wells) {
      const ox = x - w.x;
      const oz = z - w.z;
      const along = ox * w.dx + oz * w.dz;
      if (along < 0 || along > w.run) continue;
      const c = -ox * w.dz + oz * w.dx;
      if (Math.abs(c) > w.half) continue;
      out.along = along;
      out.c = c;
      return w;
    }
    return null;
  }

  // The floor of a well `along` m down it, and its roof.
  wellFloor(w, along) {
    return w.g0 - (w.depth * along) / w.run;
  }

  wellRoof(w, along) {
    return along / w.run < w.open ? Infinity : w.g0 - 0.25;
  }

  _cell(x, z) {
    return this.grid.get(`${Math.floor(x / CELL)},${Math.floor(z / CELL)}`);
  }

  // The vault's roof c m across a room (the rail's height under a vault's
  // crown, at its middle; down to where it springs, at its sides).
  roof(room, c) {
    if (!room.under) return Infinity;
    const u = Math.min(1, Math.abs(c - room.mid) / room.half);
    return room.spring + (room.crown - room.spring) * Math.sqrt(1 - u * u);
  }

  // The platform of a room (x, z) is on, if any.
  platformAt(room, a, c) {
    for (const p of room.L.platforms) if (c >= p.c0 && c <= p.c1 && a >= p.a0 && a <= p.a1) return p;
    return null;
  }

  // What's at (x, z) for feet at about y: a room (a station's level), or a
  // tunnel. Fills this._hit.
  _find(x, z, y) {
    const h = this._hit;
    const w = this.wells.size ? this._well(x, z, _w) : null;
    if (w) {
      const floor = this.wellFloor(w, _w.along);
      const roof = this.wellRoof(w, _w.along);
      // (on the street over its roofed end is on the street, not in it)
      if (y >= floor - ABOVE && y <= (roof === Infinity ? w.g0 + OPEN_UP : roof)) {
        h.room = null;
        h.tube = null;
        h.well = w;
        h.floor = floor;
        h.roof = roof;
        h.a = _w.along;
        h.c = _w.c;
        return h;
      }
    }
    h.well = null;
    const cell = this._cell(x, z);
    if (!cell) return null;
    for (const room of cell.rooms) {
      onLevel(room.L, x, z, _o);
      if (_o.a < room.a0 || _o.a > room.a1 || _o.c < room.c0 || _o.c > room.c1) continue;
      const p = this.platformAt(room, _o.a, _o.c);
      if (!room.under && !p) continue;
      const floor = p ? room.L.floor : room.L.rail;
      const roof = this.roof(room, _o.c);
      if (y < floor - ABOVE || y > (room.under ? roof : floor + OPEN_UP)) continue;
      h.room = room;
      h.tube = null;
      h.floor = floor;
      h.roof = roof;
      h.a = _o.a;
      h.c = _o.c;
      return h;
    }
    for (const t of cell.tubes) {
      const ex = t.bx - t.ax;
      const ez = t.bz - t.az;
      const l2 = ex * ex + ez * ez || 1;
      const u = ((x - t.ax) * ex + (z - t.az) * ez) / l2;
      if (u < -0.02 || u > 1.02) continue;
      const k = u < 0 ? 0 : u > 1 ? 1 : u;
      const across = (-(x - t.ax) * ez + (z - t.az) * ex) / Math.sqrt(l2);
      if (Math.abs(across) > TUBE.half) continue;
      const rail = t.ay + (t.by - t.ay) * k;
      if (y < rail - ABOVE || y > rail + TUBE.top) continue;
      h.room = null;
      h.tube = t;
      h.floor = rail;
      h.roof = rail + TUBE.top;
      h.across = across;
      return h;
    }
    return null;
  }

  inside(x, z, y, out) {
    const h = this._find(x, z, y);
    if (!h) return false;
    out.floor = h.floor;
    out.roof = h.roof;
    return true;
  }

  // On foot, the platform is all there is: its edges and its ends are walls,
  // and anywhere else (over the track) is in them, the way out towards it.
  walls(x, z, out, y = Infinity) {
    const h = this._find(x, z, Number.isFinite(y) ? y : -Infinity);
    out.d = Infinity;
    out.nx = 0;
    out.nz = 0;
    if (!h) return out;
    if (h.well) {
      // its sides, and its far end (the top is open, to the street)
      const w = h.well;
      const side = w.half - 0.15 - Math.abs(h.c);
      const end = w.run - 0.3 - h.a;
      if (side < end) {
        const sign = h.c >= 0 ? -1 : 1;
        out.d = side;
        out.nx = -w.dz * sign;
        out.nz = w.dx * sign;
      } else {
        out.d = end;
        out.nx = -w.dx;
        out.nz = -w.dz;
      }
      return out;
    }
    if (h.tube) {
      const t = h.tube;
      const l = Math.hypot(t.bx - t.ax, t.bz - t.az) || 1;
      const [px, pz] = [-(t.bz - t.az) / l, (t.bx - t.ax) / l];
      const sign = h.across >= 0 ? -1 : 1;
      out.d = TUBE.half - 0.4 - Math.abs(h.across);
      out.nx = px * sign;
      out.nz = pz * sign;
      return out;
    }
    const L = h.room.L;
    let best = -Infinity;
    let na = 0;
    let nc = 0;
    for (const p of L.platforms) {
      // how far inside this platform (< 0: outside it), and the way in
      const ins = [
        [h.c - p.c0, 0, 1],
        [p.c1 - h.c, 0, -1],
        [h.a - p.a0, 1, 0],
        [p.a1 - h.a, -1, 0],
      ];
      let d = Infinity;
      let dir = null;
      for (const e of ins) if (e[0] < d) [d, dir] = [e[0], e];
      if (d < 0) {
        // outside: how far from it, and the way to it
        const ca = Math.max(p.a0 - h.a, 0, h.a - p.a1);
        const cc = Math.max(p.c0 - h.c, 0, h.c - p.c1);
        d = -Math.hypot(ca, cc);
        const l = -d || 1;
        dir = [d, (h.a < p.a0 ? ca : -ca) / l, (h.c < p.c0 ? cc : -cc) / l];
      }
      if (d > best) [best, na, nc] = [d, dir[1], dir[2]];
    }
    out.d = best;
    out.nx = L.dx * na - L.dz * nc;
    out.nz = L.dz * na + L.dx * nc;
    return out;
  }

  // Open air, at least m from the vault, the tube or the floor? (Only under
  // the street: an open platform's air is the sky's.)
  air(x, y, z, m = 0) {
    const w = this.wells.size ? this._well(x, z, _w) : null;
    if (w && Math.abs(_w.c) < w.half - m && y > this.wellFloor(w, _w.along) + m && y < this.wellRoof(w, _w.along) - m) return true;
    const cell = this._cell(x, z);
    if (!cell) return false;
    for (const room of cell.rooms) {
      if (!room.under) continue;
      onLevel(room.L, x, z, _o);
      if (_o.a < room.a0 + m || _o.a > room.a1 - m || _o.c < room.c0 + m || _o.c > room.c1 - m) continue;
      const floor = this.platformAt(room, _o.a, _o.c) ? room.L.floor : room.L.rail;
      if (y > floor + m && y < this.roof(room, _o.c) - m) return true;
    }
    for (const t of cell.tubes) {
      const ex = t.bx - t.ax;
      const ez = t.bz - t.az;
      const l2 = ex * ex + ez * ez || 1;
      const u = ((x - t.ax) * ex + (z - t.az) * ez) / l2;
      if (u < -0.02 || u > 1.02) continue;
      const k = u < 0 ? 0 : u > 1 ? 1 : u;
      const across = (-(x - t.ax) * ez + (z - t.az) * ex) / Math.sqrt(l2);
      if (Math.abs(across) > TUBE.half - m) continue;
      const rail = t.ay + (t.by - t.ay) * k;
      if (y > rail + m && y < rail + TUBE.top - m) return true;
    }
    return false;
  }

  light(x, z) {
    if (this.wells.size && this._well(x, z, _w)) return 1;
    const cell = this._cell(x, z);
    if (!cell) return 1;
    for (const room of cell.rooms) {
      onLevel(room.L, x, z, _o);
      if (_o.a >= room.a0 && _o.a <= room.a1 && _o.c >= room.c0 && _o.c <= room.c1) return room.under ? LIGHT.station : 1;
    }
    return cell.tubes.length ? LIGHT.tunnel : 1;
  }

  // The vault under the street that (x, z) is in, for a rail at about y, if any.
  stationAt(x, z, y) {
    const cell = this._cell(x, z);
    if (!cell) return null;
    for (const room of cell.rooms) {
      if (!room.under || Math.abs(y - room.L.rail) > 3) continue;
      onLevel(room.L, x, z, _o);
      if (_o.a >= room.a0 && _o.a <= room.a1 && _o.c >= room.c0 && _o.c <= room.c1) return room;
    }
    return null;
  }

  // The room for a level.
  roomOf(L) {
    return this.rooms.find((r) => r.L === L) || null;
  }
}
