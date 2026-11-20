// Things you can bump into and stand on that aren't terrain or trees: walls,
// footings, stumps, felled trunks. Each solid is a capsule in plan view (a
// segment a→b with a radius) with a bottom height and a top height that can
// slope from a to b (a felled trunk lying down a hillside).
//
//   { ax, az, bx, bz, r, bottom, topA, topB, step? }
//
// `step` is how far below its top you can be and still walk up onto it
// (defaults to the player's usual step height).
// Owners (a building, a stump...) replace their whole list at once.
//
// There is one of these for the whole world. The player, the animals and the
// camera all read it; whoever puts something solid in the world writes to it.

const CELL = 8;
const ck = (cx, cz) => (cx + 32768) * 65536 + (cz + 32768);

export class Solids {
  constructor() {
    this.owners = new Map(); // owner -> [solid]
    this.grid = new Map(); // cell -> Set<solid>
  }

  set(owner, list) {
    this.clear(owner);
    if (!list || !list.length) return;
    this.owners.set(owner, list);
    for (const s of list) {
      const x0 = Math.floor((Math.min(s.ax, s.bx) - s.r) / CELL);
      const x1 = Math.floor((Math.max(s.ax, s.bx) + s.r) / CELL);
      const z0 = Math.floor((Math.min(s.az, s.bz) - s.r) / CELL);
      const z1 = Math.floor((Math.max(s.az, s.bz) + s.r) / CELL);
      for (let cz = z0; cz <= z1; cz++) {
        for (let cx = x0; cx <= x1; cx++) {
          const k = ck(cx, cz);
          let set = this.grid.get(k);
          if (!set) this.grid.set(k, (set = new Set()));
          set.add(s);
        }
      }
    }
  }

  clear(owner) {
    const list = this.owners.get(owner);
    if (!list) return;
    this.owners.delete(owner);
    for (const [k, set] of this.grid) {
      for (const s of list) set.delete(s);
      if (!set.size) this.grid.delete(k);
    }
  }

  // fn(solid) for every solid whose cell lies within r of (x, z). Each solid once.
  forEachNear(x, z, r, fn) {
    const x0 = Math.floor((x - r) / CELL);
    const x1 = Math.floor((x + r) / CELL);
    const z0 = Math.floor((z - r) / CELL);
    const z1 = Math.floor((z + r) / CELL);
    if (x0 === x1 && z0 === z1) {
      const set = this.grid.get(ck(x0, z0));
      if (set) for (const s of set) fn(s);
      return;
    }
    const seen = this._seen || (this._seen = new Set());
    seen.clear();
    for (let cz = z0; cz <= z1; cz++) {
      for (let cx = x0; cx <= x1; cx++) {
        const set = this.grid.get(ck(cx, cz));
        if (!set) continue;
        for (const s of set) {
          if (seen.has(s)) continue;
          seen.add(s);
          fn(s);
        }
      }
    }
  }
}
