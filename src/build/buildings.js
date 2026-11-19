// Player-built buildings: stone footings, walls of round logs or hewn timbers
// stacked Lincoln-log fashion, and gable roofs over finished rooms.
//
// The rules are physical rather than a recipe:
//
// - Footings belong to a building, and their tops must all sit at one level
//   (the building's datum, y0). A pier can make up a little unevenness, but
//   on a slope you'll need to cut and fill the ground first.
// - A log runs between two grid nodes along x or z. It must be supported at
//   both ends, by a footing (bottom course only), by a log crossing beneath it
//   half a course lower, or by the log directly below it in the same wall.
// - Where a log crosses another, it rides high until you cut the notch.
//   Nothing can rest on a log until it's notched down into place.
// - Leaving gaps in the lower courses and spanning over them gives you doors
//   and windows. Walls that close a loop make rooms, and a rectangular room
//   with walls level all round can take a roof.

import * as THREE from 'three';
import { HALF, LOG_D, TIMBER_H, TIMBER_W, OVERHANG, PIER, MAX_SPAN, MAX_LEVEL, JOIN_RADIUS, ROOF, height, raise } from './constants.js';
import { Mesher, addRoundLog, addTimber, addChink, addChalk, addFooting, addRoof, alongMatrix, phash } from './geometry.js';

const nk = (x, z) => `${x},${z}`;
const nodeXZ = (axis, line, n) => (axis === 'x' ? [n, line] : [line, n]);

export class Buildings {
  constructor({ scene, solids, material }) {
    this.scene = scene;
    this.solids = solids;
    this.material = material;
    this.list = [];
    this.nextId = 1;
    this.dirty = false;
    this.onChange = null; // (building)
  }

  // ── Lookup ────────────────────────────────────────────────────────────────
  // The building whose footings are nearest (x, z), within JOIN_RADIUS.
  buildingFor(x, z, r = JOIN_RADIUS) {
    let best = null;
    let bd = r;
    for (const b of this.list) {
      for (const f of b.footings.values()) {
        const d = Math.hypot(f.x - x, f.z - z);
        if (d < bd) {
          bd = d;
          best = b;
        }
      }
    }
    return best;
  }

  // ── Footings ──────────────────────────────────────────────────────────────
  footingCandidate(x, z, ground) {
    const b = this.buildingFor(x, z);
    if (b && b.footings.has(nk(x, z))) return { ok: false, reason: 'there is a footing here already' };
    if (!b) return { ok: true, b: null, y0: ground + PIER.first, pier: PIER.first };
    const pier = b.y0 - ground;
    if (pier < PIER.min) return { ok: false, b, pier, reason: `ground is ${cm(PIER.min - pier)} too high for the footings: dig it down` };
    if (pier > PIER.max) return { ok: false, b, pier, reason: `ground is ${cm(pier - PIER.max)} too low for the footings: fill it in` };
    return { ok: true, b, y0: b.y0, pier };
  }

  addFooting(x, z, ground) {
    const c = this.footingCandidate(x, z, ground);
    if (!c.ok) return null;
    let b = c.b;
    if (!b) {
      b = { id: this.nextId++, y0: c.y0, sill: null, footings: new Map(), logs: [], roofs: [], rooms: [], mesh: null, pid: 1 };
      this.list.push(b);
    }
    b.footings.set(nk(x, z), { x, z, ground });
    this.refresh(b);
    return b;
  }

  canRemoveFooting(b, f) {
    for (const L of b.logs) {
      if (L.k !== 0) continue;
      const [x, z] = nodeXZ(L.axis, L.line, L.s0);
      const [x1, z1] = nodeXZ(L.axis, L.line, L.s1);
      if (f.x >= Math.min(x, x1) && f.x <= Math.max(x, x1) && f.z >= Math.min(z, z1) && f.z <= Math.max(z, z1)) {
        return 'a sill log rests on it';
      }
    }
    return null;
  }

  removeFooting(b, f) {
    b.footings.delete(nk(f.x, f.z));
    if (!b.footings.size) {
      this._dispose(b);
      this.list.splice(this.list.indexOf(b), 1);
      this.dirty = true;
      return;
    }
    this.refresh(b);
  }

  // ── Logs ──────────────────────────────────────────────────────────────────
  // What holds up a log end at node n on (axis, line) at level k?
  // 'ok' (something seated), 'unseated' (only an unnotched log), or null.
  _support(b, axis, line, n, k) {
    if (k === 0) {
      const [x, z] = nodeXZ(axis, line, n);
      return b.footings.has(nk(x, z)) ? 'ok' : null;
    }
    let res = null;
    for (const P of b.logs) {
      let hit = false;
      if (P.axis !== axis) hit = P.k === k - 1 && P.line === n && P.s0 <= line && line <= P.s1;
      else hit = P.line === line && P.k === k - 2 && P.s0 <= n && n <= P.s1;
      if (!hit) continue;
      if (P.seated) return 'ok';
      res = 'unseated';
    }
    return res;
  }

  // Where would a log from node s0 to s1 along `axis` on `line` go?
  // -> { ok, k, reason }
  logCandidate(b, axis, line, s0, s1) {
    if (s1 < s0) [s0, s1] = [s1, s0];
    const span = s1 - s0;
    if (span < 1) return { ok: false, reason: 'pick two points on the grid' };
    if (span > MAX_SPAN) return { ok: false, reason: `longer than the longest log (${MAX_SPAN} m)` };
    const start = !b.logs.length || b.sill === null ? 0 : axis === b.sill ? 0 : 1;
    for (let k = start; k <= MAX_LEVEL; k += 2) {
      let overlap = false;
      for (const L of b.logs) {
        if (L.axis === axis && L.line === line && L.k === k && Math.max(L.s0, s0) < Math.min(L.s1, s1)) {
          overlap = true;
          break;
        }
      }
      if (overlap) continue;
      // anything it would cross that's still riding high?
      if (k > 0 && b.logs.some((P) => P.axis !== axis && P.k === k - 1 && !P.seated && P.line >= s0 && P.line <= s1 && P.s0 <= line && line <= P.s1)) {
        return { ok: false, k, s0, s1, reason: 'the log underneath still needs notching' };
      }
      const a = this._support(b, axis, line, s0, k);
      const c = this._support(b, axis, line, s1, k);
      if (a === 'ok' && c === 'ok') return { ok: true, k, s0, s1 };
      let reason;
      if (a === 'unseated' || c === 'unseated') reason = 'the log underneath still needs notching';
      else if (k === 0) reason = 'both ends need a footing';
      else if (a || c) reason = 'one end has nothing under it';
      else reason = 'needs a crossing log or the course below at both ends';
      return { ok: false, k, s0, s1, reason };
    }
    return { ok: false, reason: 'the wall is as high as it goes' };
  }

  addLog(b, kind, axis, line, s0, s1) {
    const c = this.logCandidate(b, axis, line, s0, s1);
    if (!c.ok) return null;
    if (!b.logs.length) b.sill = axis;
    const L = { id: b.pid++, kind, axis, line, s0: c.s0, s1: c.s1, k: c.k, notches: [] };
    b.logs.push(L);
    this.refresh(b);
    return L;
  }

  // Why a log can't come out (or null if it can).
  canRemoveLog(b, L) {
    for (const Q of b.logs) {
      if (Q === L) continue;
      if (Q.axis !== L.axis) {
        if (Q.k === L.k + 1 && Q.s0 <= L.line && L.line <= Q.s1 && L.s0 <= Q.line && Q.line <= L.s1) return 'a log crosses on top of it';
      } else if (Q.line === L.line && Q.k === L.k + 2 && Math.max(Q.s0, L.s0) < Math.min(Q.s1, L.s1)) return 'a log rests on it';
    }
    for (const r of b.roofs) {
      const top = this.logTop(b, L);
      if (top < r.eave - 0.05) continue;
      const onX = L.axis === 'x' && (L.line === r.z0 || L.line === r.z1) && L.s1 > r.x0 && L.s0 < r.x1;
      const onZ = L.axis === 'z' && (L.line === r.x0 || L.line === r.x1) && L.s1 > r.z0 && L.s0 < r.z1;
      if (onX || onZ) return 'the roof rests on it';
    }
    return null;
  }

  removeLog(b, L) {
    b.logs.splice(b.logs.indexOf(L), 1);
    if (!b.logs.length) b.sill = null;
    this.refresh(b);
  }

  logBottom(b, L) {
    return b.y0 + L.k * HALF + (L.seated ? 0 : raise(L.kind));
  }

  logTop(b, L) {
    return this.logBottom(b, L) + height(L.kind);
  }

  // ── Notches ───────────────────────────────────────────────────────────────
  // The un-cut notch nearest the point p within r: { b, L, n, x, y, z, ready }.
  // ready = the log below is seated, so the notch can be cut now.
  notchNear(p, r) {
    let best = null;
    let bd = r;
    for (const b of this.list) {
      for (const L of b.logs) {
        if (L.seated) continue;
        const cy = this.logBottom(b, L) + height(L.kind) / 2;
        for (const n of L.below) {
          if (L.notches.includes(n)) continue;
          const [x, z] = nodeXZ(L.axis, L.line, n);
          const d = Math.hypot(x - p.x, cy - p.y, z - p.z);
          if (d < bd) {
            bd = d;
            const P = b.logs.find((Q) => Q.axis !== L.axis && Q.k === L.k - 1 && Q.line === n && Q.s0 <= L.line && L.line <= Q.s1);
            best = { b, L, n, x, y: cy, z, ready: !P || P.seated };
          }
        }
      }
    }
    return best;
  }

  notch(b, L, n) {
    if (!L.notches.includes(n)) L.notches.push(n);
    const was = L.seated;
    this.refresh(b);
    return !was && L.seated;
  }

  // ── Rooms & roofs ─────────────────────────────────────────────────────────
  _rooms(b) {
    if (!b.logs.length) return [];
    let minX = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxZ = -Infinity;
    const walls = new Set();
    for (const L of b.logs) {
      const [ax, az] = nodeXZ(L.axis, L.line, L.s0);
      const [bx, bz] = nodeXZ(L.axis, L.line, L.s1);
      minX = Math.min(minX, ax, bx);
      maxX = Math.max(maxX, ax, bx);
      minZ = Math.min(minZ, az, bz);
      maxZ = Math.max(maxZ, az, bz);
      for (let s = L.s0; s < L.s1; s++) walls.add(L.axis === 'x' ? `x${s},${L.line}` : `z${L.line},${s}`);
    }
    const W = maxX - minX + 2;
    const D = maxZ - minZ + 2;
    const id = (i, j) => (j + 1) * (W + 1) + (i + 1);
    const seen = new Uint8Array((W + 1) * (D + 1));
    const flood = (si, sj, out) => {
      const stack = [si, sj];
      seen[id(si, sj)] = 1;
      while (stack.length) {
        const j = stack.pop();
        const i = stack.pop();
        if (out) out.push([minX + i, minZ + j]);
        const x = minX + i;
        const z = minZ + j;
        const nb = [
          [i + 1, j, `z${x + 1},${z}`],
          [i - 1, j, `z${x},${z}`],
          [i, j + 1, `x${x},${z + 1}`],
          [i, j - 1, `x${x},${z}`],
        ];
        for (const [ni, nj, wk] of nb) {
          if (ni < -1 || nj < -1 || ni >= W || nj >= D) continue;
          if (seen[id(ni, nj)] || walls.has(wk)) continue;
          seen[id(ni, nj)] = 1;
          stack.push(ni, nj);
        }
      }
    };
    flood(-1, -1, null);
    const rooms = [];
    for (let j = 0; j < D - 1; j++) {
      for (let i = 0; i < W - 1; i++) {
        if (seen[id(i, j)]) continue;
        const cells = [];
        flood(i, j, cells);
        let x0 = Infinity;
        let z0 = Infinity;
        let x1 = -Infinity;
        let z1 = -Infinity;
        for (const [x, z] of cells) {
          x0 = Math.min(x0, x);
          z0 = Math.min(z0, z);
          x1 = Math.max(x1, x + 1);
          z1 = Math.max(z1, z + 1);
        }
        rooms.push({ cells, x0, z0, x1, z1, area: cells.length, rect: cells.length === (x1 - x0) * (z1 - z0) });
      }
    }
    return rooms;
  }

  roomAt(b, x, z) {
    const cx = Math.floor(x);
    const cz = Math.floor(z);
    for (const r of b.rooms) {
      if (cx < r.x0 || cx >= r.x1 || cz < r.z0 || cz >= r.z1) continue;
      if (r.cells.some(([a, c]) => a === cx && c === cz)) return r;
    }
    return null;
  }

  // Highest seated wall top over a unit wall segment, and whether an
  // unnotched log sits on top of it.
  _segTop(b, axis, line, s) {
    let top = -Infinity;
    let loose = false;
    let topK = -1;
    for (const L of b.logs) {
      if (L.axis !== axis || L.line !== line || L.s0 > s || L.s1 < s + 1) continue;
      if (L.k > topK) {
        topK = L.k;
        loose = !L.seated;
      }
      if (L.seated) top = Math.max(top, this.logTop(b, L));
    }
    return { top, loose };
  }

  roofCandidate(b, x, z) {
    const room = this.roomAt(b, x, z);
    if (!room) return { ok: false, reason: 'aim inside a room with walls all round' };
    if (!room.rect) return { ok: false, room, reason: 'roofs go on rectangular rooms' };
    if (b.roofs.some((r) => r.x0 === room.x0 && r.z0 === room.z0 && r.x1 === room.x1 && r.z1 === room.z1)) {
      return { ok: false, room, reason: 'this room is roofed' };
    }
    let lo = Infinity;
    let hi = -Infinity;
    let loose = false;
    const seg = (axis, line, s) => {
      const t = this._segTop(b, axis, line, s);
      lo = Math.min(lo, t.top);
      hi = Math.max(hi, t.top);
      loose = loose || t.loose;
    };
    for (let s = room.x0; s < room.x1; s++) {
      seg('x', room.z0, s);
      seg('x', room.z1, s);
    }
    for (let s = room.z0; s < room.z1; s++) {
      seg('z', room.x0, s);
      seg('z', room.x1, s);
    }
    if (loose) return { ok: false, room, reason: 'notch the top course in first' };
    if (lo - b.y0 < ROOF.minWall) {
      const courses = Math.ceil((ROOF.minWall - (lo - b.y0)) / (HALF * 2));
      return { ok: false, room, reason: `walls need ${courses} more course${courses > 1 ? 's' : ''} before a roof` };
    }
    if (lo < hi - ROOF.slack) {
      const courses = Math.round((hi - lo) / (HALF * 2));
      return { ok: false, room, reason: `bring the walls up level: one side is ${courses} course${courses > 1 ? 's' : ''} short` };
    }
    const w = room.x1 - room.x0;
    const d = room.z1 - room.z0;
    return {
      ok: true,
      room,
      roof: { x0: room.x0, z0: room.z0, x1: room.x1, z1: room.z1, eave: hi, axis: w >= d ? 'x' : 'z' },
      cost: Math.ceil(room.area * ROOF.cost),
    };
  }

  addRoof(b, roof) {
    const r = { id: b.pid++, ...roof };
    b.roofs.push(r);
    this.refresh(b);
    return r;
  }

  removeRoof(b, r) {
    b.roofs.splice(b.roofs.indexOf(r), 1);
    this.refresh(b);
  }

  // ── Derived state, meshes, collision ──────────────────────────────────────
  refresh(b) {
    for (const L of b.logs) {
      L.below = [];
      L.ends = [false, false];
      for (const P of b.logs) {
        if (P.axis === L.axis) continue;
        if (P.line < L.s0 || P.line > L.s1 || L.line < P.s0 || L.line > P.s1) continue;
        if (P.k === L.k - 1) L.below.push(P.line);
        if (Math.abs(P.k - L.k) === 1) {
          if (P.line === L.s0) L.ends[0] = true;
          if (P.line === L.s1) L.ends[1] = true;
        }
      }
      L.notches = L.notches.filter((n) => L.below.includes(n));
      L.seated = L.below.every((n) => L.notches.includes(n));
    }
    b.rooms = this._rooms(b);
    this._rebuild(b);
    this.dirty = true;
    if (this.onChange) this.onChange(b);
  }

  _dispose(b) {
    if (b.mesh) {
      this.scene.remove(b.mesh);
      b.mesh.geometry.dispose();
      b.mesh = null;
    }
    this.solids.clear(b);
  }

  _rebuild(b) {
    this._dispose(b);
    const m = new Mesher();
    const solids = [];
    for (const f of b.footings.values()) {
      addFooting(m, f.x, f.z, f.ground, b.y0, f.x * 31 + f.z * 17);
      solids.push({ ax: f.x, az: f.z, bx: f.x, bz: f.z, r: 0.26, bottom: f.ground - 0.2, topA: b.y0, topB: b.y0, step: 0.5 });
    }
    for (const L of b.logs) {
      const g = this.logGeom(b, L);
      const seed = b.id * 1000 + L.id;
      if (L.kind === 'log') addRoundLog(m, alongMatrix(L.axis, g.cx, g.cy, g.cz, phash(seed, 1, 2) * 6), g.len, seed);
      else addTimber(m, timberMatrix(L.axis, g.cx, g.cy, g.cz), g.len, seed);
      // chalk marks where notches are still to cut
      for (const n of L.below) {
        if (L.notches.includes(n)) continue;
        const [x, z] = nodeXZ(L.axis, L.line, n);
        addChalk(m, alongMatrix(L.axis, x, g.cy, z), (L.kind === 'log' ? LOG_D : TIMBER_H) / 2);
      }
      const [ax, az] = nodeXZ(L.axis, L.line, g.a);
      const [bx, bz] = nodeXZ(L.axis, L.line, g.b);
      const r = L.kind === 'log' ? LOG_D / 2 : TIMBER_W / 2;
      // the bottom course is a threshold you can step over
      const step = L.k === 0 ? g.bottom + g.h - Math.min(...[...b.footings.values()].map((f) => f.ground)) + 0.1 : undefined;
      solids.push({ ax, az, bx, bz, r, bottom: g.bottom, topA: g.bottom + g.h, topB: g.bottom + g.h, step });
    }
    // clay chinking in the seams between seated round logs
    for (const L of b.logs) {
      if (L.kind !== 'log' || !L.seated) continue;
      for (const U of b.logs) {
        if (U.kind !== 'log' || !U.seated || U.axis !== L.axis || U.line !== L.line || U.k !== L.k + 2) continue;
        const s0 = Math.max(L.s0, U.s0);
        const s1 = Math.min(L.s1, U.s1);
        if (s1 <= s0) continue;
        const c = (s0 + s1) / 2;
        const [x, z] = nodeXZ(L.axis, L.line, c);
        const y = b.y0 + U.k * HALF + 0.015;
        addChink(m, chinkMatrix(L.axis, x, y, z), s1 - s0);
      }
    }
    for (const r of b.roofs) addRoof(m, r, ROOF.pitch, ROOF.overhang, b.id * 100 + r.id);
    if (!m.empty) {
      b.mesh = new THREE.Mesh(m.build(), this.material);
      b.mesh.castShadow = true;
      b.mesh.receiveShadow = true;
      b.mesh.userData.building = b;
      this.scene.add(b.mesh);
    }
    this.solids.set(b, solids);
  }

  // Placement of a log in the world: ends (with overhang), centre, height.
  logGeom(b, L) {
    const oh = OVERHANG[L.kind];
    const a = L.s0 - (L.ends && L.ends[0] ? oh : 0);
    const e = L.s1 + (L.ends && L.ends[1] ? oh : 0);
    const h = height(L.kind);
    const bottom = this.logBottom(b, L);
    const c = (a + e) / 2;
    const [cx, cz] = nodeXZ(L.axis, L.line, c);
    return { a, b: e, len: e - a, h, bottom, cx, cy: bottom + h / 2, cz };
  }

  // ── Ray casting (aiming, camera) ──────────────────────────────────────────
  // Nearest piece hit by the ray: { t, b, type: 'log' | 'footing' | 'roof', piece }.
  raycast(o, d, maxT = 60, skipRoofs = false) {
    let best = null;
    let bt = maxT;
    for (const b of this.list) {
      for (const L of b.logs) {
        const g = this.logGeom(b, L);
        const r = L.kind === 'log' ? LOG_D / 2 : TIMBER_W / 2;
        const [ax, az] = nodeXZ(L.axis, L.line, g.a);
        const [bx, bz] = nodeXZ(L.axis, L.line, g.b);
        const t = rayBox(o, d, Math.min(ax, bx) - (L.axis === 'z' ? r : 0), g.bottom, Math.min(az, bz) - (L.axis === 'x' ? r : 0), Math.max(ax, bx) + (L.axis === 'z' ? r : 0), g.bottom + g.h, Math.max(az, bz) + (L.axis === 'x' ? r : 0));
        if (t !== null && t < bt) {
          bt = t;
          best = { t, b, type: 'log', piece: L };
        }
      }
      for (const f of b.footings.values()) {
        const t = rayBox(o, d, f.x - 0.25, f.ground - 0.1, f.z - 0.25, f.x + 0.25, b.y0, f.z + 0.25);
        if (t !== null && t < bt) {
          bt = t;
          best = { t, b, type: 'footing', piece: f };
        }
      }
      if (skipRoofs) continue;
      for (const r of b.roofs) {
        const t = rayRoof(o, d, r);
        if (t !== null && t < bt) {
          bt = t;
          best = { t, b, type: 'roof', piece: r };
        }
      }
    }
    return best;
  }

  // ── Persistence ───────────────────────────────────────────────────────────
  serialize() {
    return this.list.map((b) => ({
      y0: b.y0,
      sill: b.sill,
      footings: [...b.footings.values()].map((f) => [f.x, f.z, Math.round(f.ground * 1000) / 1000]),
      logs: b.logs.map((L) => [L.kind, L.axis, L.line, L.s0, L.s1, L.k, L.notches]),
      roofs: b.roofs.map((r) => [r.x0, r.z0, r.x1, r.z1, Math.round(r.eave * 1000) / 1000, r.axis]),
    }));
  }

  load(arr) {
    if (!Array.isArray(arr)) return;
    for (const d of arr) {
      const b = { id: this.nextId++, y0: d.y0, sill: d.sill, footings: new Map(), logs: [], roofs: [], rooms: [], mesh: null, pid: 1 };
      for (const [x, z, ground] of d.footings || []) b.footings.set(nk(x, z), { x, z, ground });
      for (const [kind, axis, line, s0, s1, k, notches] of d.logs || []) b.logs.push({ id: b.pid++, kind, axis, line, s0, s1, k, notches: notches || [] });
      for (const [x0, z0, x1, z1, eave, axis] of d.roofs || []) b.roofs.push({ id: b.pid++, x0, z0, x1, z1, eave, axis });
      this.list.push(b);
      this.refresh(b);
    }
    this.dirty = false;
  }
}

const cm = (m) => `${Math.max(1, Math.round(m * 100))} cm`;

// Hewn timber: the box is (across, length, up) in local space; lay it along axis.
function timberMatrix(axis, x, y, z) {
  if (axis === 'z') return alongMatrix('z', x, y, z);
  // along x, local x (width) must end up horizontal across the wall (world z)
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -Math.PI / 2);
  q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2));
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(1, 1, 1));
}

function chinkMatrix(axis, x, y, z) {
  return timberMatrix(axis, x, y, z);
}

// Slab test. Returns entry t or null.
function rayBox(o, d, x0, y0, z0, x1, y1, z1) {
  let tmin = 0;
  let tmax = Infinity;
  const lo = [x0, y0, z0];
  const hi = [x1, y1, z1];
  const oo = [o.x, o.y, o.z];
  const dd = [d.x, d.y, d.z];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(dd[i]) < 1e-9) {
      if (oo[i] < lo[i] || oo[i] > hi[i]) return null;
      continue;
    }
    let ta = (lo[i] - oo[i]) / dd[i];
    let tb = (hi[i] - oo[i]) / dd[i];
    if (ta > tb) [ta, tb] = [tb, ta];
    tmin = Math.max(tmin, ta);
    tmax = Math.min(tmax, tb);
    if (tmin > tmax) return null;
  }
  return tmin;
}

// Ray against the two slopes of a gable roof.
function rayRoof(o, d, r) {
  const along = r.axis === 'x';
  const ou = along ? o.x : o.z;
  const ov = along ? o.z : o.x;
  const du = along ? d.x : d.z;
  const dv = along ? d.z : d.x;
  const u0 = (along ? r.x0 : r.z0) - ROOF.overhang;
  const u1 = (along ? r.x1 : r.z1) + ROOF.overhang;
  const vc = along ? (r.z0 + r.z1) / 2 : (r.x0 + r.x1) / 2;
  const half = (along ? r.z1 - r.z0 : r.x1 - r.x0) / 2;
  const tan = Math.tan(ROOF.pitch);
  let best = null;
  for (const sgn of [-1, 1]) {
    // y = eave + (half - sgn (v - vc)) tan
    const c0 = o.y + sgn * tan * (ov - vc) - r.eave - half * tan;
    const c1 = d.y + sgn * tan * dv;
    if (Math.abs(c1) < 1e-9) continue;
    const t = -c0 / c1;
    if (t < 0 || (best !== null && t >= best)) continue;
    const u = ou + du * t;
    const w = sgn * (ov + dv * t - vc);
    if (u < u0 || u > u1 || w < 0 || w > half + ROOF.overhang) continue;
    best = t;
  }
  return best;
}
