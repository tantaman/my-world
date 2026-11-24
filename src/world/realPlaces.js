// Real places, set into whichever land a world is grown on.
//
// A land (worldgen.js) grows a forest from a seed.
// withRealPlaces(Land) is that land with real places set into it:
//
//   the real Earth (earth.js), under all of the world: its seas and coasts,
//     how high and how rugged its land is, and the country its climate makes
//     it. The forest's own hills, ridges and water are still what you walk
//     on, but laid over the Earth's land, raised and flattened to it, and its
//     sea is the Earth's. So the water runs over the Earth's land like any
//     other: it's the forest's land, as far as the water is concerned
//     (forestHeight)
//   hikes (landform.js), each a piece of real ground: inside one the ground,
//     its trails, its lakes and its woods are the real ones, and the land
//     round it takes over again round its edge. On the Earth a hike stands at
//     its real height, so its land meets the Earth's round it
//
// It is grown *from* the land, and wraps what the land says, so a land has
// nothing to know about real places and a new land gets them for nothing. What
// it asks of a land in return is in worldgen.js under "real places". With no
// places in it (no Earth, no hikes), it grows exactly what the land grows: the
// golden tests grow the lands bare, test/hikes.test.js checks that the hikes
// in the game leave the rest of the world as it was, and test/earth.test.js
// that the Earth leaves the middle of it as it was.
//
// lands.js grows every world through this.

import { smoothstep, createSimplex2 } from '../noise.js';
import { Landform, TRAIL_HALF, VIEW_WORN } from './landform.js';
import { COUNTRY } from './country.js';
import { EARTH, earthCountry, treelineOf, snowlineOf } from './earth.js';
import { SEA } from './sea.js';

// How rugged (real m: the Earth's relief) the land is where it's all lake
// country, from nothing to none of it; and where it's mountains, from none
// to all of it. Between, the hills.
const LOWLAND = [15, 60];
const MOUNTAINS = [150, 450];
// How far the forest's own hills and ridges may be stretched or flattened to
// be as rugged as the Earth is there, as a share of their own height. Not
// much more than they are: stretched up and not out, a ridge only gets
// steeper, and past this the mountains are cliffs (the Earth's own heights
// carry the rest of a range's size).
const RUGGED = [0.03, 1.4];
// ...and where the Earth is finer, round a hike (earth.js, DETAIL), its own
// heights have its ridges and valleys in them: the forest's are flattened to
// this (or flatter still, where the country is), for the roughness under them.
const FINE_RUGGED = 0.1;
// ...and where it's a range of mountains (earth.js, MOUNTAIN), its heights a
// few hundred metres apart have the range's own ridges and valleys in them:
// the forest's are flattened to this, for the crags and gullies between.
const MID_RUGGED = 0.4;
// The borders between climates wander this far (game m) either way, over
// this many metres, so a country doesn't end along the edge of a cell.
const BORDER = [2500, 9000];
// Along the Earth's coasts, where the shore isn't rock, a beach: up to the
// height the forest's beaches go (sea.js), as far in as the first of these
// (real km from the coast), and gone by the second.
const BEACH = [0.4, 0.8];
// m over the sea from which the Earth's land is inland: the sea's floor has
// come all the way in, and no hollow goes below the sea (sea.js).
const SEA_INLAND = SEA.inland[1];

export function withRealPlaces(Land) {
  return class extends Land {
    // earth: the real Earth (earth.js), whose tiles come as they're needed, or
    // null for none: the land's own forest goes on for ever, as the golden
    // tests grow it.
    constructor(seed, structures = [], hikes = [], earth = null) {
      super(seed, structures);
      // (Until here, while the land was being grown, the Earth wasn't set: what
      // the land works out as it's grown, its own sea's lie round the start,
      // is the land's alone, and out on the Earth nothing asks it.)
      this.earth = earth;
      // the noise the borders between the Earth's climates wander by: fields
      // of its own, numbered clear of the land's (worldgen.js, sea.js)
      const field = (k) => createSimplex2((seed * 131 + k * 7919) >>> 0);
      this._borderA = field(70);
      this._borderB = field(71);
      // the tiles of it handed over so far, as they came (for whoever grows
      // a world of their own from this one's: a worker)
      this.earthGot = [];
      this._ea = { x: NaN, z: NaN, height: 0, relief: 0, coast: 0, lat: 0, lon: 0, fine: 0, mid: 0 };
      this._eb = { x: NaN, z: NaN, height: 0, relief: 0, coast: 0, lat: 0, lon: 0, fine: 0, mid: 0 };
      this._ce = { x: NaN, z: NaN, low: 0, mtn: 0, alp: 0, bench: 0 };
      this._ec = { x: NaN, z: NaN, country: null, place: null };
      this._place = { country: null, out: 0 };
      // Settled into the land around them before anything is asked of them.
      // More can come later (addHike), as their land is fetched.
      this.hikes = [];
      this.landforms = [];
      for (const def of hikes) this.addHike(def);
    }

    // What a worker is handed to grow the same Earth as this one: its plain
    // facts, and every tile of it here so far (null: no Earth).
    get earthCopy() {
      return this.earth ? { meta: this.earth.meta, got: this.earthGot } : null;
    }

    // A tile of the Earth has come (earth.js). If anything was asked about it
    // before it did, the water's network is worked out again from scratch:
    // nothing worked out half-way, wrong, is kept.
    addEarth(tile) {
      if (!this.earth) return;
      this.earthGot.push(tile);
      const missed = this.earth.missed;
      this.earth.missed = false;
      if (tile.climate) this.earth.setClimate(tile.climate);
      else this.earth.addTile(tile);
      if (missed) this.water.net.reset();
    }

    // A hike, whole (card and land: see landforms.js). Ask for nothing within
    // its reach before it's here: what was grown there without it is wrong.
    addHike(def) {
      if (this.landforms.some((L) => L.id === def.id)) return;
      const L = new Landform(def);
      this._settle(L);
      L.settled();
      // (on the Earth its sea is the Earth's, and runs on past its edge)
      if (this.earth) L.openToSea();
      this.landforms.push(L);
      this.hikes.push(def);
      // (a structure on real land stands on the real ground)
      for (const p of this.pads) p.y = this.naturalHeight(p.x, p.z);
    }

    // ── Footpaths ───────────────────────────────────────────────────────────
    // On real land the forest's paths fade away and the real trails take over.
    pathMask(x, z) {
      const m = super.pathMask(x, z);
      if (!this.landforms.length) return m;
      const keep = 1 - this._landformWeight(x, z);
      if (keep >= 1) return m;
      let mask = m * keep;
      this.pathEdgeMain += (1 - keep) * 40;
      this.pathEdgeSide += (1 - keep) * 40;
      for (const L of this.landforms) {
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

    // ── The Earth ───────────────────────────────────────────────────────────
    // What the Earth is at (x, z) (earth.js), the last asked kept.
    _earthAt(x, z, e = this._ea) {
      if (e.x !== x || e.z !== z) {
        this.earth.at(x, z, e);
        e.x = x;
        e.z = z;
      }
      return e;
    }

    // The kind of country the Earth is at (x, z): a real place's own, near
    // one; else by its climate, read a little way off so the borders wander.
    // (this._ec.place says how far out through a real place's reach it is,
    // or is null.)
    _earthCountry(x, z) {
      const k = this._ec;
      if (k.x === x && k.z === z) return k.country;
      const f = 1 / BORDER[1];
      const wx = x + this._borderA(x * f + 1.7, z * f - 3.1) * BORDER[0];
      const wz = z + this._borderB(x * f - 4.3, z * f + 2.9) * BORDER[0];
      const place = this.earth.placeAt(wx, wz, this._place);
      let country;
      if (place) country = place.country;
      else {
        const off = this._earthAt(wx, wz, this._eb);
        const here = this._earthAt(x, z);
        country = earthCountry(this.earth.climateAt(off.lat, off.lon), here.lat, here.height / EARTH.scale, here.relief / EARTH.scale);
      }
      k.x = x;
      k.z = z;
      k.country = country;
      k.place = place;
      return country;
    }

    // The Earth's kind of country at (x, z) (country.js), or null with no Earth.
    earthAt(x, z) {
      return this.earth ? this._earthCountry(x, z) : null;
    }

    // The country the land is, on the Earth: lake country where the Earth is
    // flat, mountains where it's rugged, and none of the forest's own high
    // country (the Earth has its own).
    country(x, z) {
      const c = super.country(x, z);
      if (!this.earth) return c;
      const k = this._ce;
      if (k.x === x && k.z === z) return k;
      const r = this._earthAt(x, z).relief / EARTH.scale;
      const low = 1 - smoothstep(LOWLAND[0], LOWLAND[1], r);
      k.bench = c.bench * (1 - low);
      k.low = low;
      k.mtn = smoothstep(MOUNTAINS[0], MOUNTAINS[1], r);
      k.alp = 0;
      k.x = x;
      k.z = z;
      return k;
    }

    // ── Height ──────────────────────────────────────────────────────────────
    broadHeight(x, z, minWavelength = 0) {
      const h = this.forestHeight(x, z, minWavelength);
      return this.landforms.length ? this._onLandforms(x, z, h, 0, false) : h;
    }

    naturalHeight(x, z, pm = this.pathMask(x, z)) {
      const h = super.naturalHeight(x, z, pm);
      return this.landforms.length ? this._onLandforms(x, z, h, pm, true) : h;
    }

    // The land, as if there were no hikes in it: on the Earth, the forest's
    // hills and ridges stretched or flattened to be as rugged as the Earth is
    // there, standing on the Earth's land at its real height, by the Earth's
    // sea. (The sea's floor and beaches are laid over that as over the
    // forest's: inland, away from the coast, no hollow goes below the sea;
    // near it, a hollow under the sea's level is the sea.) With no Earth, the
    // land's own.
    forestHeight(x, z, minWavelength = 0) {
      if (!this.earth) return super.broadHeight(x, z, minWavelength);
      const e = this._earthAt(x, z);
      const land = this.ownLand(x, z, minWavelength);
      const c = this.country(x, z);
      // (a share of it at the shore, all of it inland, and none out at sea: the
      // forest's hills don't stand up out of a channel between two islands)
      const calm = e.coast >= 0 ? EARTH.shore + (1 - EARTH.shore) * smoothstep(0, EARTH.calm, e.coast) : EARTH.shore * (1 - smoothstep(0, EARTH.calm, -e.coast));
      let rugged = Math.max(RUGGED[0], Math.min(RUGGED[1], e.relief / this.ownSpread(c))) * calm;
      if (e.mid > 0) rugged += (Math.min(MID_RUGGED, rugged) - rugged) * e.mid;
      if (e.fine > 0) rugged += (Math.min(FINE_RUGGED, rugged) - rugged) * e.fine;
      // how far toward the sea, as the sea's own fall says it (sea.js): all
      // the way at the coast, none at all inland
      const D = SEA_INLAND * (1 - smoothstep(0, EARTH.inland, e.coast));
      const h = this.sea.level + (land - this.ownMean(c)) * rugged + e.height + D;
      return this.bySea(h, D, EARTH.floor, EARTH.soft);
    }

    forestNaturalHeight(x, z) {
      return super.naturalHeight(x, z, super.pathMask(x, z));
    }

    // The ground h blended toward any real land at (x, z).
    _onLandforms(x, z, h, pm, detail) {
      for (const L of this.landforms) {
        const w = L.weight(x, z);
        if (w <= 0) continue;
        let g = L.ground(x, z) + L.offset;
        // the small bumps, and a path a touch sunken, as in the forest
        if (detail) g += this._detailHeight(x, z) * (1 - pm * 0.9) - pm * 0.14;
        h += (g - h) * w;
      }
      return h;
    }

    _landformWeight(x, z) {
      let w = 0;
      for (const L of this.landforms) w = Math.max(w, L.weight(x, z));
      return w;
    }

    // Metres past the outer edge of the nearest real place. Large if none.
    landformClearance(x, z) {
      let best = 1e9;
      for (const L of this.landforms) best = Math.min(best, L.clearance(x, z));
      return best;
    }

    // Sets the real land at the height of the forest around it: the trailhead
    // at the forest's average level just outside the hike. Hikes that overlap
    // share one datum (landform.js), that of the first of them, so the same
    // real height stands at the same height in each: a datum says whose ring
    // and whose trailhead, and what real height its heights start from.
    //
    // On the Earth, though, a real place stands at its real height: its sea
    // at the Earth's sea, and its land where the Earth's land is (the same
    // land, finer). The real height its heights start from (`base`, its
    // lowest) stands where the Earth has that height, at the Earth's scale;
    // so one brought in at a scale of its own (life size, a zoo) has its
    // lowest ground where the Earth has it, and the rest at its own scale
    // above that.
    _settle(L) {
      const def = L.def;
      if (this.earth) {
        L.offset = this.sea.level + (def.base || 0) * EARTH.scale;
        return;
      }
      const d = def.datum || this._ownDatum(L);
      const K = 64;
      let sum = 0;
      for (let k = 0; k < K; k++) {
        const a = (k / K) * Math.PI * 2;
        sum += this._baseHeight(d.at[0] + Math.cos(a) * d.outer, d.at[1] + Math.sin(a) * d.outer);
      }
      L.offset = this.datumLevel(sum / K) - d.anchor + ((def.base || 0) - (d.base || 0)) * def.scale;
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
    // count as a structure's does, so nothing grows on them, unless `real`
    // is false: the drainage network asks about the forest alone.
    padClearance(x, z, real = true) {
      let best = super.padClearance(x, z);
      if (!real) return best;
      for (const L of this.landforms) {
        if (L.weight(x, z) <= 0) continue;
        const d = L.clearing(x, z);
        if (d < best) best = d;
      }
      return best;
    }

    // ── Ecology ─────────────────────────────────────────────────────────────
    // (On the Earth, none out in the open above its treeline either: the
    // forest's own lone trees stand in its high country, but no real range
    // has pines dotted over its snowfields.)
    loneTrees(x, z) {
      const v = super.loneTrees(x, z);
      return this.earth ? v * (1 - this.above(x, z, this._baseHeight(x, z))) : v;
    }

    // (On the Earth, as thickly wooded as its country is, and not above its
    // treeline.)
    forest(x, z) {
      let f = super.forest(x, z);
      if (this.earth) f *= this._earthCountry(x, z).woods * (1 - this._earthHigh(x, z, this._baseHeight(x, z), 'above'));
      for (const L of this.landforms) {
        const w = L.weight(x, z);
        if (w > 0) f += (L.forest(x, z) - f) * w;
      }
      return f;
    }

    // What the ground is made of at (x, z), where a real place has its own
    // kind of country (country.js). Fills out.bare and out.sand (0..1: how
    // much of it is bare ground, and beach), out.land (0..1: how far it is
    // that country's ground and not the forest's) and out.country (its id),
    // and returns the country, or null in the forest, where all four are 0.
    //
    // Out on the Earth, the Earth's country is under all of that (the forest
    // is a country there too, and is returned), with a beach along its coast
    // unless its shore is rock; a real place's is over it, wherever it's more
    // than half that place.
    surface(x, z, out) {
      out.bare = 0;
      out.sand = 0;
      out.land = 0;
      out.country = 0;
      let country = null;
      if (this.earth) {
        // (the forest's own country too, out on the Earth: so that it's the
        // Earth that lays its beaches, along its coasts, and not every low
        // field of a delta that is a beach)
        const c = this._earthCountry(x, z);
        let bare = c.ground.barren;
        if (bare > 0) bare += this.nMoist(x * 0.031 + 5, z * 0.031 - 3) * 1.3 * Math.min(bare, 1 - bare);
        let sand = 0;
        const coast = this._earthAt(x, z).coast;
        if (c.shore !== 'rock' && coast < BEACH[1]) sand = (1 - smoothstep(SEA.sand * 0.75, SEA.sand * 1.2, this._baseHeight(x, z) - this.sea.level)) * (1 - smoothstep(BEACH[0], BEACH[1], coast));
        out.bare = Math.max(0, Math.min(1, bare)) * (1 - sand);
        out.sand = sand;
        out.land = 1;
        out.country = c.id;
        country = c;
      }
      const under = { bare: out.bare, sand: out.sand, land: out.land, country: out.country, of: country };
      let most = 0;
      for (const L of this.landforms) {
        const w = L.weight(x, z);
        if (w <= most) continue;
        most = w;
        const g = L.country.ground;
        // bare in patches, the size of a clearing, unless it's all bare or none is
        let bare = g.barren;
        if (bare > 0) bare += this.nMoist(x * 0.031 + 5, z * 0.031 - 3) * 1.3 * Math.min(bare, 1 - bare);
        // and a cliff is bare rock, whatever the country: nothing grows on it
        bare = Math.max(bare, L.rocky(x, z));
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
        // and stone where the map says it is: a scree, bare rock
        if (L.cover) bare = Math.max(bare, L.bare(x, z));
        bare *= 1 - sand;
        // over the Earth's ground, by as much of it as is this place
        out.bare = under.bare + (Math.max(0, Math.min(1, bare)) - under.bare) * w;
        out.sand = under.sand + (sand - under.sand) * w;
        out.land = under.land + (1 - under.land) * w;
        if (w > 0.5 || !under.of) {
          out.country = L.country.id;
          country = L.country;
        } else {
          out.country = under.country;
          country = under.of;
        }
      }
      return country;
    }

    // The country a plant at (x, z) grows in, if it isn't the forest: a real
    // place's, on its own ground and half way out through where it gives way.
    // On the Earth, where it's more than half the Earth's, its country there
    // (or null where that's the forest).
    countryAt(x, z) {
      for (const L of this.landforms) if (L.weight(x, z) > 0.5) return L.country;
      if (this.earth) {
        const c = this._earthCountry(x, z);
        if (c !== COUNTRY.forest) return c;
      }
      return null;
    }

    // Whether any of the square (x0, z0)–(x1, z1) may have a country other
    // than the forest's (surface(), countryAt()), or ground strewn with what a
    // real place's map says (thicket(), talus()): near a real place, or out
    // on the Earth.
    countryIn(x0, z0, x1, z1) {
      const mx = (x0 + x1) / 2;
      const mz = (z0 + z1) / 2;
      const r = Math.hypot(x1 - x0, z1 - z0) / 2;
      if (this.earth) return true;
      return this.landforms.some((L) => L.clearance(mx, mz) < r);
    }

    // Metres from (x, z) to the real place's own water there, a stream's
    // bank or a lake's shore (negative in it); far, off real land or with
    // none near. (The forest's water gives way on real land, so it isn't asked.)
    realWater(x, z) {
      for (const L of this.landforms) if (L.weight(x, z) > 0.5) return L.waterNear(x, z);
      return 1e9;
    }

    species(x, z) {
      let s = super.species(x, z);
      for (const L of this.landforms) {
        const w = L.weight(x, z);
        if (w > 0) s += (L.species(x, z, s) - s) * w;
      }
      return s;
    }

    // What a land has high up (a treeline, snow, birch groves: worldgen.js) is
    // the forest's: a real place is as high as it really is, and wooded as it
    // really is. Its own country may have a treeline and snow of its own, at
    // their real heights, and its map tundra and ice (landform.js).
    groves(x, z) {
      const v = super.groves(x, z);
      return v > 0 ? v * (1 - this._landformWeight(x, z)) : v;
    }

    // And on the Earth, its own treeline and snow line, by its country and
    // how far from the equator it is (earth.js).
    above(x, z, h) {
      const v = this._onEarth(x, z, h, super.above(x, z, h), 'above');
      return this._ownHigh(x, z, v > 0 ? v * (1 - this._landformWeight(x, z)) : v, 'above');
    }

    snow(x, z, h) {
      const v = this._onEarth(x, z, h, super.snow(x, z, h), 'snow');
      return this._ownHigh(x, z, v > 0 ? v * (1 - this._landformWeight(x, z)) : v, 'snow');
    }

    treeline(x, z) {
      return this._lineOnEarth(x, z, super.treeline(x, z), 'above');
    }

    snowline(x, z) {
      return this._lineOnEarth(x, z, super.snowline(x, z), 'snow');
    }

    _onEarth(x, z, h, v, what) {
      return this.earth ? this._earthHigh(x, z, h, what) : v;
    }

    // The real heights [from, to] the Earth's treeline (or snow line) is
    // over at (x, z), in the game. Round a real place, its own lines give way
    // to the Earth's over its reach: a ski resort photographed in winter has
    // the snow down to the valleys round it, and further off only on the tops.
    _earthLine(x, z, what) {
      const lat = this._earthAt(x, z).lat;
      const c = this._earthCountry(x, z);
      const place = this._ec.place;
      const lines = what === 'above' ? treelineOf : snowlineOf;
      let [a, b] = lines(c, lat);
      if (place) {
        const [ea, eb] = lines(COUNTRY.forest, lat);
        const t = smoothstep(0, 1, place.out);
        a += (ea - a) * t;
        b += (eb - b) * t;
      }
      const at = (m) => this.sea.level + m * EARTH.scale;
      return [at(a), at(b)];
    }

    _earthHigh(x, z, h, what) {
      const [a, b] = this._earthLine(x, z, what);
      return smoothstep(a, b, h);
    }

    _lineOnEarth(x, z, line, what) {
      return this.earth ? this._earthLine(x, z, what)[1] : line;
    }

    _ownHigh(x, z, v, what) {
      for (const L of this.landforms) {
        if (!L.high) continue;
        const w = L.weight(x, z);
        if (w > 0) v += L[what](x, z) * w;
      }
      return v;
    }

    // Whether above() or snow() can be more than 0 anywhere in the square
    // (x0, z0)–(x1, z1).
    highIn(x0, z0, x1, z1) {
      if (super.highIn(x0, z0, x1, z1)) return true;
      if (this.earth) return true;
      const mx = (x0 + x1) / 2;
      const mz = (z0 + z1) / 2;
      const r = Math.hypot(x1 - x0, z1 - z0) / 2;
      return this.landforms.some((L) => L.high && L.clearance(mx, mz) < r);
    }

    // Where the map says what covers a real place's land: how much of a
    // thicket of shrubs (x, z) is in, and how thickly strewn with boulders.
    thicket(x, z) {
      return this._covered(x, z, 'thicket');
    }

    talus(x, z) {
      return this._covered(x, z, 'talus');
    }

    _covered(x, z, what) {
      let v = 0;
      for (const L of this.landforms) {
        if (!L.cover) continue;
        const w = L.weight(x, z);
        if (w > 0) v = Math.max(v, L[what](x, z) * w);
      }
      return v;
    }
  };
}
