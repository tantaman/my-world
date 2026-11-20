// Real places, set into whichever land a world is grown on.
//
// A land (worldgen.js, land2.js) grows a forest from a seed.
// withRealPlaces(Land) is that land with real places (`hikes`: landform.js)
// set into it: inside one the ground, its trails, its lakes and its woods are
// the real ones, and the forest takes over again round its edge.
//
// It is grown *from* the land, and wraps what the land says, so a land has
// nothing to know about real places and a new land gets them for nothing. What
// it asks of a land in return is in worldgen.js under "real places". With no
// places in it, it grows exactly what the land grows: the golden tests grow
// the lands bare, and test/hikes.test.js checks that the hikes in the game
// leave the rest of the world as it was.
//
// lands.js grows every world through this.

import { smoothstep } from '../noise.js';
import { Landform, TRAIL_HALF, VIEW_WORN } from './landform.js';

export function withRealPlaces(Land) {
  return class extends Land {
    constructor(seed, structures = [], hikes = []) {
      super(seed, structures);
      // Settled into the land around them before anything is asked of them.
      // More can come later (addHike), as their land is fetched.
      this.hikes = [];
      this.lands = [];
      for (const def of hikes) this.addHike(def);
    }

    // A hike, whole (card and land: see landforms.js). Ask for nothing within
    // its reach before it's here: what was grown there without it is wrong.
    addHike(def) {
      if (this.lands.some((L) => L.id === def.id)) return;
      const L = new Landform(def);
      this._settle(L);
      this.lands.push(L);
      this.hikes.push(def);
      // (a structure on real land stands on the real ground)
      for (const p of this.pads) p.y = this.naturalHeight(p.x, p.z);
    }

    // ── Footpaths ───────────────────────────────────────────────────────────
    // On real land the forest's paths fade away and the real trails take over.
    pathMask(x, z) {
      const m = super.pathMask(x, z);
      if (!this.lands.length) return m;
      const keep = 1 - this._landWeight(x, z);
      if (keep >= 1) return m;
      let mask = m * keep;
      this.pathEdgeMain += (1 - keep) * 40;
      this.pathEdgeSide += (1 - keep) * 40;
      for (const L of this.lands) {
        if (L.weight(x, z) <= 0) continue;
        const d = L.trail(x, z);
        mask = Math.max(mask, 1 - smoothstep(0.5, 1.0, d / TRAIL_HALF));
        if (d - TRAIL_HALF < this.pathEdgeMain) this.pathEdgeMain = d - TRAIL_HALF;
        // the ground is worn bare where people stand to look at the view
        const v = L.fromView(x, z);
        if (v < VIEW_WORN * 1.5) mask = Math.max(mask, (1 - smoothstep(VIEW_WORN * 0.5, VIEW_WORN, v)) * 0.9);
      }
      this.pathEdge = Math.min(this.pathEdgeMain, this.pathEdgeSide);
      return mask;
    }

    // ── Height ──────────────────────────────────────────────────────────────
    broadHeight(x, z, minWavelength = 0) {
      const h = super.broadHeight(x, z, minWavelength);
      return this.lands.length ? this._onLand(x, z, h, 0, false) : h;
    }

    naturalHeight(x, z, pm = this.pathMask(x, z)) {
      const h = super.naturalHeight(x, z, pm);
      return this.lands.length ? this._onLand(x, z, h, pm, true) : h;
    }

    // The forest's own land, as if there were no real places in it.
    forestHeight(x, z, minWavelength = 0) {
      return super.broadHeight(x, z, minWavelength);
    }

    forestNaturalHeight(x, z) {
      return super.naturalHeight(x, z, super.pathMask(x, z));
    }

    // The ground h blended toward any real land at (x, z).
    _onLand(x, z, h, pm, detail) {
      for (const L of this.lands) {
        const w = L.weight(x, z);
        if (w <= 0) continue;
        let g = L.ground(x, z) + L.offset;
        // the small bumps, and a path a touch sunken, as in the forest
        if (detail) g += this._detailHeight(x, z) * (1 - pm * 0.9) - pm * 0.14;
        h += (g - h) * w;
      }
      return h;
    }

    _landWeight(x, z) {
      let w = 0;
      for (const L of this.lands) w = Math.max(w, L.weight(x, z));
      return w;
    }

    // Metres past the outer edge of the nearest real place. Large if none.
    landClearance(x, z) {
      let best = 1e9;
      for (const L of this.lands) best = Math.min(best, L.clearance(x, z));
      return best;
    }

    // Sets the real land at the height of the forest around it: the trailhead
    // at the forest's average level just outside the hike. Hikes that overlap
    // share one datum (landform.js), that of the first of them, so the same
    // real height stands at the same height in each: a datum says whose ring
    // and whose trailhead, and what real height its heights start from.
    _settle(L) {
      const def = L.def;
      const d = def.datum || this._ownDatum(L);
      const K = 64;
      let sum = 0;
      for (let k = 0; k < K; k++) {
        const a = (k / K) * Math.PI * 2;
        sum += this._baseHeight(d.at[0] + Math.cos(a) * d.outer, d.at[1] + Math.sin(a) * d.outer);
      }
      L.offset = sum / K - d.anchor + ((def.base || 0) - (d.base || 0)) * def.scale;
    }

    // For a hike that doesn't say: its own trailhead (or, failing one, the
    // lowest of its rim), its own ring.
    _ownDatum(L) {
      const t = L.trailhead;
      let anchor = Infinity;
      if (t) anchor = L.raw(L.cx + t.x, L.cz + t.z);
      else for (let k = 0; k < 64; k++) anchor = Math.min(anchor, L.raw(L.cx + Math.cos((k / 64) * Math.PI * 2) * L.radius, L.cz + Math.sin((k / 64) * Math.PI * 2) * L.radius));
      return { at: [L.cx, L.cz], outer: L.outer, anchor, base: L.def.base || 0 };
    }

    // A real place's clearings (where its photo was taken, its trailhead)
    // count as a structure's does, so nothing grows on them, unless `lands`
    // is false: the drainage network asks about the forest alone.
    padClearance(x, z, lands = true) {
      let best = super.padClearance(x, z);
      if (!lands) return best;
      for (const L of this.lands) {
        if (L.weight(x, z) <= 0) continue;
        const d = L.clearing(x, z);
        if (d < best) best = d;
      }
      return best;
    }

    // ── Ecology ─────────────────────────────────────────────────────────────
    forest(x, z) {
      let f = super.forest(x, z);
      for (const L of this.lands) {
        const w = L.weight(x, z);
        if (w > 0) f += (L.forest(x, z) - f) * w;
      }
      return f;
    }

    // What the ground is made of at (x, z), where a real place has its own
    // kind of country (country.js). Fills out.bare and out.sand (0..1: how
    // much of it is bare ground, and beach) and out.land (0..1: how far it is
    // that country's ground and not the forest's), and returns the country,
    // or null in the forest, where all three are 0.
    surface(x, z, out) {
      out.bare = 0;
      out.sand = 0;
      out.land = 0;
      let country = null;
      for (const L of this.lands) {
        const w = L.weight(x, z);
        if (w <= out.land) continue;
        const g = L.country.ground;
        // bare in patches, the size of a clearing, unless it's all bare or none is
        let bare = g.barren;
        if (bare > 0) bare += this.nMoist(x * 0.031 + 5, z * 0.031 - 3) * 1.3 * Math.min(bare, 1 - bare);
        // a beach where the map has one; else the rock the sea breaks on, and
        // above it, or a strand all along it
        let sand = L.beaches.length ? 1 - smoothstep(-0.5, 2.5, L.strand(x, z)) : 0;
        if (g.shelf > 0 || L.country.shore === 'beach') {
          const u = L.shore(x, z);
          if (L.sea) {
            if (g.shelf > 0) bare = Math.max(bare, 1 - smoothstep(g.shelf * 0.45, g.shelf, u));
            else sand = Math.max(sand, 1 - smoothstep(2, 5, u));
          }
        }
        bare *= 1 - sand;
        out.bare = Math.max(0, Math.min(1, bare)) * w;
        out.sand = sand * w;
        out.land = w;
        country = L.country;
      }
      return country;
    }

    // The country a plant at (x, z) grows in, if it isn't the forest: a real
    // place's, on its own ground and half way out through where it gives way.
    countryAt(x, z) {
      for (const L of this.lands) if (L.weight(x, z) > 0.5) return L.country;
      return null;
    }

    species(x, z) {
      let s = super.species(x, z);
      for (const L of this.lands) {
        const w = L.weight(x, z);
        if (w > 0) s += (L.species(x, z, s) - s) * w;
      }
      return s;
    }

    // What a land has high up (a treeline, snow, birch groves: land2.js) is
    // the forest's: a real place is as high as it really is, and wooded as it
    // really is.
    groves(x, z) {
      const v = super.groves(x, z);
      return v > 0 ? v * (1 - this._landWeight(x, z)) : v;
    }

    above(x, z, h) {
      const v = super.above(x, z, h);
      return v > 0 ? v * (1 - this._landWeight(x, z)) : v;
    }

    snow(x, z, h) {
      const v = super.snow(x, z, h);
      return v > 0 ? v * (1 - this._landWeight(x, z)) : v;
    }
  };
}
