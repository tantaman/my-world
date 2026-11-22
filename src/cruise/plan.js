// The ship, on paper: how big she is, the shape of her hull, her decks and
// what's on each, where the stairs and lifts go up through her, and where
// every stateroom is. What she looks like (hull.js, decks.js) and what's
// solid (decks.js) are both drawn from this, and the tests walk it.
//
// No three.js in here.
//
// The ship's own frame (m): z along her, the bow at +z and the stern at −z;
// x across, port at +x (the side she lies alongside the pier with) and
// starboard at −x; y up from the waterline.
//
// She is a big modern cruise ship, about the size of the real ones: 300 m
// long, 36 m across, her decks numbered as theirs are, from the bottom up.
// Decks 1 to 3 are the crew's and the engines', down at and under the water,
// and aren't walked. The rest:
//
//    4  Gangway    where you come aboard; the dining room, the atrium, the theatre
//    5  Galleria   shops, the dining room's balcony, the theatre's balcony
//    6  Promenade  the nightclub, the casino, a bar; outside, a walk all the
//                  way round under the lifeboats
//    7–13          staterooms (7 with windows, 8–12 with balconies, 13 suites,
//                  and the bridge at the front of 13)
//   14  Lido       pools, hot tubs, the buffet
//   15  Sports     the running track, mini golf, the foot of the slides
//   16  Sky        the slide tower, a lookout forward
//
// Three cores go up through her (CORES), aft, midships and forward: on every
// deck a lobby with four lifts on its forward side and a staircase on its
// aft side, two flights to a deck. On the staterooms' decks two corridors run
// her length, port and starboard (CORR), the cabins either side of them, and
// the lobbies join them. Everywhere else is a room.
//
// A deck's layout (layout(n)) is rooms: rectangles of floor with walls round
// them, joined where there's an opening in the wall between them. Whatever
// isn't a room is the crew's: not drawn, not walked.
//
//   layout(n) -> {
//     n, y           the deck number, and the height of its floor
//     rooms          [{ id, kind, name?, x0, z0, x1, z1, out?, open?, hull?,
//                       up? (how far its ceiling is over the floor, if it's
//                       higher than a deck: it goes up through those above) }]
//                    out: under the sky (railings rather than walls at the
//                    ship's side); open: sides with nothing along them at all
//                    ('x0', 'x1', 'z0', 'z1'); hull: sides that are the
//                    ship's own side (windows in them)
//     openings       [[x0, z0, x1, z1]]: gaps in the walls (a thin box across
//                    the wall's line): doorways, archways
//     doors          [{ x, z, nx, nz, w, kind, cabin? }]: door leaves in some
//                    of those, facing (nx, nz) the way they open
//     holes          [[x0, z0, x1, z1]]: no floor (a stairwell, the atrium's well)
//     pools          [[x0, z0, x1, z1]]: no floor either, but a pool's tank in it,
//                    so the deck under it has its ceiling there
//     blocks         [[x0, z0, x1, z1, h]]: solid (under a staircase)
//     cabins         staterooms on it (cabinsOn(n))
//     wells          rails round the holes: [[x0, z0, x1, z1]]
//   }
//   walls(layout) -> [{ x0, z0, x1, z1, nx, nz, kind, room }]: every run of
//     wall, the face into its room (nx, nz); kind 'wall', 'hull' (the ship's
//     side, windowed), 'rail' (open deck), 'glass' (a room's glass: sides
//     listed in its `glass`)
//   floorStrips(layout) -> [{ x, z0, z1, r }]: the floor as strips along her
//   flights(core, n) -> the treads and landings of a core's stairs from deck
//     n up to the next: [{ x0, z0, x1, z1, top }] (tops over the waterline)

export const SHIP = { name: 'HALCYON', line: 'Tidewater Cruises', home: 'MERIDIAN' };

export const LENGTH = 300; // m overall
export const BOW = 150;
export const STERN = -150;
export const HALF_BEAM = 18; // m: half her breadth, at the decks
export const DRAFT = 8.4; // m: how far her keel is under the water
const BOW_START = 60; // m: forward of this her sides close in to the stem
const STERN_START = -138; // ...and aft of this they tuck in a little to the transom
const STERN_TUCK = 3.5; // m: how far
// A real ship's decks are under 3 m apart, but seen from behind, as you are
// here, rooms that low close in round you: hers are a metre more, so her
// rooms are tall and airy, as on a ship of the grand hotels.
export const DECK_H = 4; // m from one deck's floor to the next
export const DECK4_Y = 7; // m: deck 4's floor over the waterline
export const SLAB = 0.42; // m: the deck under each floor: the ceiling below is this far under it
export const H_IN = DECK_H - SLAB; // m: a room's height, floor to ceiling
export const FIRST = 4;
export const LAST = 16;
export const deckY = (n) => DECK4_Y + (n - FIRST) * DECK_H;
export const HULL_T = 0.4; // m: the ship's side, inboard of where the plating is
export const WALL_T = 0.14; // m: a wall inside
// The windows in her side, inside and out: from the sill to the head (m over the floor).
export const WINDOW = { sill: 0.75, head: H_IN - 0.6 };
// The funnel's casing, and the top of it, 22 m over the sports deck (m).
export const FUNNEL = { z0: -70, z1: -54, half: 5.5, top: deckY(15) + 22 };

// Each deck: its number, its name in the lifts, and what's on it.
export const DECKS = [
  { n: 4, name: 'Gangway', says: 'guest services · the Lantern Room · the Meridian Theatre · the gallery' },
  { n: 5, name: 'Galleria', says: 'shops · Café Mistral · the dining room and theatre balconies' },
  { n: 6, name: 'Promenade', says: 'Afterglow nightclub · the casino · the Compass Bar · the promenade' },
  { n: 7, name: 'Deck 7', says: 'staterooms' },
  { n: 8, name: 'Deck 8', says: 'staterooms' },
  { n: 9, name: 'Deck 9', says: 'staterooms' },
  { n: 10, name: 'Deck 10', says: 'staterooms' },
  { n: 11, name: 'Deck 11', says: 'staterooms' },
  { n: 12, name: 'Deck 12', says: 'staterooms' },
  { n: 13, name: 'Deck 13', says: 'suites · the bridge' },
  { n: 14, name: 'Lido', says: 'pools · hot tubs · the Galley Market buffet' },
  { n: 15, name: 'Sports', says: 'running track · mini golf · the slides' },
  { n: 16, name: 'Sky', says: 'the top of the slides · the lookout' },
];
export const DECK_BY_N = new Map(DECKS.map((d) => [d.n, d]));
const CABIN_DECKS = [7, 13];
export const isCabinDeck = (n) => n >= CABIN_DECKS[0] && n <= CABIN_DECKS[1];

// The cores: the stairs and lifts, at z along her, from deck 4 to their top.
export const CORES = [
  { id: 'aft', z: -80, top: 16 },
  { id: 'mid', z: 12, top: 15, glass: true },
  { id: 'fwd', z: 64, top: 16 },
];
// A core, from its z (m): the whole of it across the middle of the ship
// (block); its lobby; the staircase aft of the lobby (from its back wall to
// where the flights meet the mid landing and the top of the flights, the
// landing at deck level beyond that), half its width and the gap between its
// flights; and the lifts forward of the lobby: four cars (where their middles
// are across her, half the width inside one, half the width of its door).
export const CORE = {
  block: [-8.6, 6],
  lobby: [-3, 3],
  half: 6.8,
  stair: { back: -8.3, mid: -6.8, top: -4.4, half: 3.6, gap: 0.15, risers: 9 },
  lifts: { z0: 3, z1: 5.6, xs: [-5.1, -1.7, 1.7, 5.1], half: 1.15, door: 0.55 },
};
// The corridors of the staterooms' decks, across her (|x|, m); the cabins
// inboard of them run to the middle (less the spine of pipes and wires
// down it), those outboard to her side.
export const CORR = [6.8, 8.4];
const SPINE = 0.3;
const CABIN_W = { inside: 3.4, outside: 3.6, suite: 7.2 }; // m along her
const BALCONY = 1.8; // m deep
const MIN_DEEP = 5; // m: a cabin no deeper than this, where her sides close in, isn't one
// Where the staterooms' decks end, aft and forward (they step back toward
// the top, as her front does).
const CABINS_AFT = -140;
const cabinsFore = (n) => 116 - (n - 7) * 2.5;
const BRIDGE_DEEP = 10; // m: the bridge, across the front of deck 13
export const ATRIUM = { z0: 18, z1: 44, half: 14, well: [21, 41, 8], decks: [4, 6] };

// How far out her side is at z, at the decks (m from the middle).
export function halfBeam(z) {
  if (z >= BOW) return 0;
  if (z > BOW_START) {
    const t = (z - BOW_START) / (BOW - BOW_START);
    return HALF_BEAM * Math.pow(1 - t * t, 0.55);
  }
  if (z < STERN_START) {
    const t = Math.min(1, (STERN_START - z) / (STERN_START - STERN));
    return HALF_BEAM - STERN_TUCK * t * t;
  }
  return HALF_BEAM;
}
// The most a room between z0 and z1 can reach out, inside her side.
export const inner = (z0, z1) => Math.min(halfBeam(z0), halfBeam(z1)) - HULL_T;

// ── Staterooms ──────────────────────────────────────────────────────────────
// Numbered as on a real ship: the deck, then three figures; even numbers to
// port, odd to starboard, counting up from forward to aft. The cabins
// outboard of the corridors are the 100s and 200s, those inboard the 500s
// and 600s.
//   { no, deck, side (+1 port, −1 starboard), kind ('inside', 'oceanview',
//     'balcony', 'suite'), x0, z0, x1, z1 (the room), balcony ([x0, z0, x1,
//     z1] or null), door: { x, z, w, nx, nz } (in the corridor wall, opening
//     into the cabin) }
const cabinCache = new Map();
export function cabinsOn(n) {
  if (!isCabinDeck(n)) return [];
  if (cabinCache.has(n)) return cabinCache.get(n);
  const out = [];
  const fore = n === 13 ? cabinsFore(n) - BRIDGE_DEEP : cabinsFore(n);
  const aft = CABINS_AFT;
  const outsideKind = n === 7 ? 'oceanview' : 'balcony';
  for (const side of [1, -1]) {
    // outboard: the whole length of the corridor
    let k = 0;
    for (let z1 = fore - 0.6; ; ) {
      const suite = n === 13 && Math.abs(z1 - 12) > 40;
      const w = suite ? CABIN_W.suite : CABIN_W.outside;
      const z0 = z1 - w;
      if (z0 < aft + 0.6) break;
      const reach = inner(z0, z1);
      const kind = suite ? 'suite' : outsideKind;
      const withBalcony = kind !== 'oceanview';
      const xi = CORR[1];
      const xo = withBalcony ? Math.min(HALF_BEAM - HULL_T - BALCONY, reach - BALCONY) : reach;
      if (xo - xi >= MIN_DEEP) {
        const no = n * 1000 + 100 + 2 * k + (side > 0 ? 0 : 1);
        out.push(cabin(no, n, side, kind, xi, z0, xo, z1, withBalcony ? [xo, z0, reach, z1] : null));
        k++;
      }
      z1 = z0;
    }
    // inboard: between the cores
    k = 0;
    const gaps = CORES.map((c) => [c.z + CORE.block[0], c.z + CORE.block[1]]);
    for (let z1 = fore - 0.6; ; ) {
      const z0 = z1 - CABIN_W.inside;
      if (z0 < aft + 0.6) break;
      const hit = gaps.find(([a, b]) => z0 < b && z1 > a);
      if (hit) {
        z1 = hit[0];
        continue;
      }
      const no = n * 1000 + 500 + 2 * k + (side > 0 ? 0 : 1);
      out.push(cabin(no, n, side, 'inside', SPINE, z0, CORR[0], z1, null));
      k++;
      z1 = z0;
    }
  }
  cabinCache.set(n, out);
  return out;
}

// One cabin, its rectangle given as |x| from the middle (xi inboard, xo
// outboard) on side `side`.
function cabin(no, deck, side, kind, xi, z0, xo, z1, balcony) {
  const a = side * xi;
  const b = side * xo;
  const room = { x0: Math.min(a, b), z0, x1: Math.max(a, b), z1 };
  // the door is in the corridor wall: outboard cabins' on their inboard
  // side, inboard cabins' on their outboard side; toward the forward end of
  // the cabin (the bathroom is beside it, the beds beyond)
  const onCorr = kind === 'inside' ? side * CORR[0] : side * CORR[1];
  const doorZ = z1 - 0.75;
  const nx = kind === 'inside' ? -side : side; // into the cabin
  const bal = balcony && { x0: Math.min(side * balcony[0], side * balcony[2]), z0: balcony[1], x1: Math.max(side * balcony[0], side * balcony[2]), z1: balcony[3] };
  return { no, deck, side, kind, ...room, balcony: bal, door: { x: onCorr, z: doorZ, w: 0.9, nx, nz: 0 } };
}

export function cabinByNo(no) {
  const n = Math.floor(no / 1000);
  return cabinsOn(n).find((c) => c.no === no) || null;
}

// ── A deck ─────────────────────────────────────────────────────────────────

class Deck {
  constructor(n) {
    this.n = n;
    this.y = deckY(n);
    this.rooms = [];
    this.openings = [];
    this.doors = [];
    this.holes = [];
    this.pools = [];
    this.blocks = [];
    this.wells = [];
    this.cabins = [];
    this.byId = new Map();
  }

  room(id, kind, x0, z0, x1, z1, extra = {}) {
    const r = { id, kind, x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1), ...extra };
    this.rooms.push(r);
    this.byId.set(id, r);
    return r;
  }

  // An opening in the wall between two rooms that touch: all of the side
  // they share, or w of it, centred (or at `at` along it).
  link(a, b, w = Infinity, at = null) {
    const A = typeof a === 'string' ? this.byId.get(a) : a;
    const B = typeof b === 'string' ? this.byId.get(b) : b;
    if (!A || !B) throw new Error(`deck ${this.n}: no room to link (${typeof a === 'string' ? a : a.id}, ${typeof b === 'string' ? b : b.id})`);
    const E = 0.05;
    let line = null;
    if (Math.abs(A.x1 - B.x0) < E || Math.abs(B.x1 - A.x0) < E) {
      const x = Math.abs(A.x1 - B.x0) < E ? A.x1 : A.x0;
      const lo = Math.max(A.z0, B.z0);
      const hi = Math.min(A.z1, B.z1);
      if (hi - lo > E) line = { axis: 'x', at: x, lo, hi };
    } else if (Math.abs(A.z1 - B.z0) < E || Math.abs(B.z1 - A.z0) < E) {
      const z = Math.abs(A.z1 - B.z0) < E ? A.z1 : A.z0;
      const lo = Math.max(A.x0, B.x0);
      const hi = Math.min(A.x1, B.x1);
      if (hi - lo > E) line = { axis: 'z', at: z, lo, hi };
    }
    if (!line) throw new Error(`deck ${this.n}: ${A.id} and ${B.id} don't touch`);
    let { lo, hi } = line;
    if (Number.isFinite(w) && hi - lo > w) {
      const mid = at ?? (lo + hi) / 2;
      lo = Math.max(lo, mid - w / 2);
      hi = Math.min(hi, lo + w);
    }
    return this.gap(line.axis, line.at, lo, hi);
  }

  // a gap in a wall that runs along `axis` ('x': a wall at x = at, running
  // along z from lo to hi; 'z': at z = at, along x)
  gap(axis, at, lo, hi) {
    const t = WALL_T * 2;
    const o = axis === 'x' ? [at - t, lo, at + t, hi] : [lo, at - t, hi, at + t];
    this.openings.push(o);
    return o;
  }
}

const ROOM_NAMES = {
  dining: 'the Lantern Room, the main dining room',
  theatre: 'the Meridian Theatre',
  club: 'Afterglow, the nightclub',
  casino: 'Casino Halcyon',
  bar: 'the Compass Bar',
  atrium: 'the Atrium',
  cafe: 'Café Mistral',
  gallery: 'the art gallery',
  galleria: 'the Galleria',
  shop: 'a shop in the Galleria',
  champagne: 'Bubbles, the champagne bar',
  buffet: 'the Galley Market, the buffet',
  lido: 'the Lido deck',
  promenade: 'the promenade',
  terrace: 'the aft terrace',
  track: 'the running track',
  golf: 'mini golf',
  sun: 'the sun deck',
  sky: 'the Sky deck',
  lookout: 'the lookout',
  tower: 'the slide tower',
  splash: 'the splash pool',
  lobby: 'a lift lobby',
  stair: 'the stairs',
  corridor: 'a corridor',
  passage: 'a passage',
  vestibule: 'the doors out to the promenade',
  foyer: 'the theatre foyer',
  stage: 'the stage',
  cabin: 'a stateroom',
  balcony: 'a balcony',
  lift: 'a lift',
};
export const roomName = (kind) => ROOM_NAMES[kind] || kind;

const cache = new Map();
export function layout(n) {
  if (cache.has(n)) return cache.get(n);
  const d = new Deck(n);
  if (n >= 4 && n <= 6) publicDeck(d);
  else if (isCabinDeck(n)) cabinDeck(d);
  else if (n === 14) lidoDeck(d);
  else if (n === 15) sportsDeck(d);
  else if (n === 16) skyDeck(d);
  cache.set(n, d);
  return d;
}

// ── The cores ────────────────────────────────────────────────────────────────
const coresOn = (n) => CORES.filter((c) => n <= c.top);

// The lobby, the stairs and the lifts of each core on this deck. `sides`:
// what the lobby opens onto, port and starboard (rooms already made), or
// null where it should open onto nothing in particular yet (they're linked
// afterwards).
function cores(d) {
  const { stair: S, lifts: L } = CORE;
  for (const c of coresOn(d.n)) {
    const lobby = d.room(`lobby-${c.id}`, 'lobby', -CORE.half, c.z + CORE.lobby[0], CORE.half, c.z + CORE.lobby[1], { core: c.id });
    d.room(`stair-${c.id}`, 'stair', -S.half, c.z + S.back, S.half, c.z + CORE.lobby[0], { core: c.id, open: ['z1'] });
    d.gap('z', c.z + CORE.lobby[0], -S.half, S.half);
    // the flights' well: no floor, but deck 4's (the bottom), which has the
    // flight up standing on it and a cupboard under the flight coming down
    const first = d.n === FIRST;
    const top = d.n === c.top;
    if (!first) d.holes.push([-S.half, c.z + S.back, S.half, c.z + S.top]);
    else d.blocks.push([-S.half, c.z + S.back, S.half, c.z + S.mid, 1.4], [-S.half, c.z + S.mid, -S.gap, c.z + S.top, 1.4]);
    // at the top, a rail across where there's no flight up (to port)
    if (top) d.wells.push([S.gap, c.z + S.top - 0.05, S.half, c.z + S.top + 0.05]);
    for (const x of L.xs) {
      // the midships cars look out over the atrium through their glass backs
      const glassy = c.glass && d.n >= ATRIUM.decks[0] && d.n <= ATRIUM.decks[1];
      const car = d.room(`lift-${c.id}-${x}`, 'lift', x - L.half, c.z + L.z0 + 0.2, x + L.half, c.z + L.z1 - 0.2, { core: c.id, liftX: x, ...(glassy ? { glass: ['z1'] } : {}) });
      const o = d.gap('z', c.z + L.z0, x - L.door, x + L.door);
      d.gap('z', c.z + L.z0 + 0.2, x - L.door, x + L.door);
      d.doors.push({ x, z: c.z + L.z0, nx: 0, nz: -1, w: L.door * 2, kind: 'lift', core: c.id, liftX: x, opening: o });
      car.door = o;
    }
    // the gap between the lobby's wall and a car's, so a door can be walked through
    for (const x of L.xs) d.room(`sill-${c.id}-${x}`, 'sill', x - L.door, c.z + L.z0, x + L.door, c.z + L.z0 + 0.2, { open: ['z0', 'z1'] });
    lobby.lifts = L.xs;
  }
}

// ── Decks 4, 5 and 6 ─────────────────────────────────────────────────────────
function publicDeck(d) {
  const n = d.n;
  const [cA, cM, cF] = CORES.map((c) => c.z);
  const bk = (c) => [c + CORE.block[0], c + CORE.block[1]];
  const [aA0, aA1] = bk(cA);
  const [mA0, mA1] = bk(cM);
  const [fA0, fA1] = bk(cF);
  const W = (z0, z1, cap = Infinity) => Math.min(cap, inner(z0, z1));
  // promenade deck: the rooms stop short of her side, and a walk goes round outside
  const side = n === 6 ? 15.4 : Infinity;
  cores(d);
  // a passage each side of each core, joining what's aft of it to what's forward
  for (const c of CORES) {
    const [z0, z1] = bk(c.z);
    for (const s of [1, -1]) {
      const p = d.room(`passage-${c.id}-${s}`, 'passage', s * CORE.half, z0, s * CORR[1], z1, { open: [] });
      d.link(p, `lobby-${c.id}`);
    }
  }
  const P = (c, s) => d.byId.get(`passage-${c}-${s}`);
  // A room between two cores (or a core and an end), joined to the passages either end.
  const between = (id, kind, z0, z1, ends, extra = {}) => {
    const h = W(z0, z1, side);
    const r = d.room(id, kind, -h, z0, h, z1, { hull: ['x0', 'x1'], ...extra });
    for (const [c, at] of ends) for (const s of [1, -1]) d.link(r, P(c, s), Infinity, at);
    return r;
  };

  if (n === 4) {
    between('dining', 'dining', -144, aA0, [['aft']], { up: DECK_H * 2 - SLAB });
    between('gallery', 'gallery', aA1, -40, [['aft']]);
    const gang = between('gangway', 'gangway', -40, mA0, [['mid']], { name: 'the gangway lobby' });
    d.link('gallery', gang, 8, 0);
    d.link('gallery', gang, 8, 0);
    atriumRoom(d, [['mid']]);
    d.room('foyer', 'foyer', -W(ATRIUM.z1, fA0), ATRIUM.z1, W(ATRIUM.z1, fA0), fA0, { hull: ['x0', 'x1'] });
    d.link('atrium', 'foyer', 16);
    for (const s of [1, -1]) d.link('foyer', P('fwd', s));
    theatre(d, n);
    // the shell door in her port side, where the gangway comes aboard
    d.gap('x', gang.x1, -24, -20);
    gang.shell = { z0: -24, z1: -20 };
  } else if (n === 5) {
    between('dining-balcony', 'dining', -144, aA0, [['aft']], { name: 'the Lantern Room balcony' });
    d.holes.push([-7, -132, 7, -110]);
    d.wells.push([-7, -132, 7, -110]);
    galleria(d, aA1, mA0, P);
    atriumRoom(d, [['mid']]);
    d.room('cafe', 'cafe', -W(ATRIUM.z1, fA0), ATRIUM.z1, W(ATRIUM.z1, fA0), fA0, { hull: ['x0', 'x1'] });
    d.link('atrium', 'cafe', 16);
    for (const s of [1, -1]) d.link('cafe', P('fwd', s));
    theatre(d, n);
  } else {
    between('club', 'club', -136, aA0, [['aft']]);
    between('casino', 'casino', aA1, -30, [['aft']]);
    between('bar', 'bar', -30, mA0, [['mid']]);
    d.link('casino', 'bar', 10, 0);
    atriumRoom(d, [['mid']], side);
    const ch = d.room('champagne', 'champagne', -side, ATRIUM.z1, side, fA0);
    d.link('atrium', ch, 12);
    for (const s of [1, -1]) d.link(ch, P('fwd', s));
    // the theatre goes up through here: nothing forward of the forward core
    d.holes.push([-15, fA1, 15, 126]);
    // the promenade, all the way along both sides, and round the stern
    const pz = [-136, 85];
    for (const s of [1, -1]) {
      const o = Math.min(HALF_BEAM - HULL_T, inner(pz[0], pz[1]));
      d.room(`promenade-${s}`, 'promenade', s * (side + 0.2), pz[0], s * o, pz[1], { out: true, rail: [s > 0 ? 'x1' : 'x0'] });
      // out through doors at each core: a vestibule across the outboard band
      for (const c of CORES) {
        if (c.id === 'fwd') continue;
        const v = d.room(`vestibule-${c.id}-${s}`, 'vestibule', s * CORR[1], c.z - 2, s * (side + 0.2), c.z + 2);
        d.link(v, P(c.id, s), 3);
        d.link(v, `promenade-${s}`, 2.4);
        d.doors.push({ x: s * (side + 0.2), z: c.z, nx: s, nz: 0, w: 2.4, kind: 'glass' });
      }
    }
    const tz = [-146, -136];
    const th = inner(tz[0], tz[1]);
    d.room('terrace', 'terrace', -th, tz[0], th, tz[1], { out: true, rail: ['x0', 'x1', 'z0'] });
    for (const s of [1, -1]) d.link('terrace', `promenade-${s}`);
    d.link('terrace', 'club', 4);
    d.doors.push({ x: 0, z: -136, nx: 0, nz: -1, w: 4, kind: 'glass' });
  }
}

function atriumRoom(d, ends, cap = Infinity) {
  const h = Math.min(ATRIUM.half, cap);
  // its aft wall is glass, onto the lifts
  const r = d.room('atrium', 'atrium', -h, ATRIUM.z0, h, ATRIUM.z1, { glass: ['z0'], ...(d.n === ATRIUM.decks[0] ? { up: DECK_H * (ATRIUM.decks[1] - ATRIUM.decks[0] + 1) - SLAB } : {}) });
  const [w0, w1, wh] = ATRIUM.well;
  if (d.n > ATRIUM.decks[0]) {
    d.holes.push([-wh, w0, wh, w1]);
    d.wells.push([-wh, w0, wh, w1]);
  }
  // the lobby of the midships core opens onto it, through the lifts' glass
  // backs (and the passages either side of the lifts lead in)
  for (const [c] of ends) for (const s of [1, -1]) d.link(r, d.byId.get(`passage-${c}-${s}`));
  return r;
}

function galleria(d, z0, z1, P) {
  const street = CORR[1];
  const g = d.room('galleria', 'galleria', -street, z0, street, z1, { name: 'the Galleria' });
  for (const s of [1, -1]) {
    d.link(g, P('aft', s));
    d.link(g, P('mid', s));
  }
  // shops down both sides
  const names = [
    ['Sea Glass Jewellers', 'Duty Free', 'Sweet Harbour', 'Timepieces'],
    ['The Logo Shop', 'Perfumery', 'Photo Studio', 'Sundries'],
  ];
  for (const s of [1, -1]) {
    const list = names[s > 0 ? 0 : 1];
    const len = (z1 - z0) / list.length;
    list.forEach((name, i) => {
      const a = z0 + i * len + 0.3;
      const b = z0 + (i + 1) * len - 0.3;
      const o = inner(a, b);
      const shop = d.room(`shop-${s}-${i}`, 'shop', s * street, a, s * o, b, { name, hull: [s > 0 ? 'x1' : 'x0'], shop: i + (s > 0 ? 0 : 4) });
      d.link(g, shop, Math.min(6, b - a - 1.4));
    });
  }
}

function theatre(d, n) {
  const fA1 = CORES[2].z + CORE.block[1];
  if (n === 4) {
    const z0 = fA1;
    const seats = d.room('theatre', 'theatre', -inner(z0, 110), z0, inner(z0, 110), 110, { up: DECK_H * 3 - SLAB, hull: ['x0', 'x1'], open: ['z1'] });
    d.room('stage', 'stage', -inner(110, 126), 110, inner(110, 126), 126, { up: DECK_H * 3 - SLAB, hull: ['x0', 'x1'], open: ['z0'] });
    for (const s of [1, -1]) d.link(seats, d.byId.get(`passage-fwd-${s}`));
  } else if (n === 5) {
    // the balcony, raked up toward the back; the rest of the theatre's height
    const z0 = fA1;
    const b = d.room('theatre-balcony', 'theatre', -inner(z0, 92), z0, inner(z0, 92), 92, { name: 'the Meridian Theatre balcony', hull: ['x0', 'x1'], rake: { from: 92, step: 1, rise: 0.22, rows: 9 }, open: ['z1'] });
    for (const s of [1, -1]) d.link(b, d.byId.get(`passage-fwd-${s}`));
    d.holes.push([-12, 92, 12, 126]);
    d.wells.push([-inner(z0, 92) + 0.4, 91.9, inner(z0, 92) - 0.4, 92.1]);
  }
}

// ── Staterooms ───────────────────────────────────────────────────────────────
function cabinDeck(d) {
  const n = d.n;
  const fore = n === 13 ? cabinsFore(n) - BRIDGE_DEEP : cabinsFore(n);
  cores(d);
  for (const s of [1, -1]) {
    const c = d.room(`corridor-${s}`, 'corridor', s * CORR[0], CABINS_AFT, s * CORR[1], fore);
    for (const core of CORES) d.link(c, `lobby-${core.id}`);
  }
  for (const k of cabinsOn(n)) {
    const r = d.room(`cabin-${k.no}`, 'cabin', k.x0, k.z0, k.x1, k.z1, { cabin: k.no, hull: k.kind === 'inside' ? [] : [k.side > 0 ? 'x1' : 'x0'] });
    const corr = d.byId.get(`corridor-${k.side}`);
    const o = d.link(r, corr, k.door.w, k.door.z);
    d.doors.push({ x: k.door.x, z: k.door.z, nx: k.door.nx, nz: 0, w: k.door.w, kind: 'cabin', cabin: k.no, opening: o });
    if (k.balcony) {
      const b = k.balcony;
      const bal = d.room(`balcony-${k.no}`, 'balcony', b.x0, b.z0, b.x1, b.z1, { out: true, cabin: k.no, rail: [k.side > 0 ? 'x1' : 'x0'] });
      r.hull = [];
      d.link(r, bal, Math.min(2.2, b.z1 - b.z0 - 0.8));
    }
    d.cabins.push(k);
  }
  if (n === 13) {
    // the bridge, across her front: crew only, but you can look in
    const z0 = fore + 0.2;
    const z1 = cabinsFore(n);
    d.room('bridge', 'bridge', -inner(z0, z1), z0, inner(z0, z1), z1, { crew: true });
  }
}

// ── Decks 14, 15 and 16 ──────────────────────────────────────────────────────
// Out in the open, the cores are deckhouses: their lobbies open through glass
// doors port and starboard onto the deck.
const deckhouse = (d, c, room) => {
  for (const s of [1, -1]) {
    d.link(`lobby-${c}`, room(s), 2.6);
    d.doors.push({ x: s * CORE.half, z: CORES.find((k) => k.id === c).z, nx: s, nz: 0, w: 2.6, kind: 'glass' });
  }
};

export const POOLS = [
  // the pools and tubs of the Lido deck, and the splash pool the slides end
  // in, up on the sun deck: their insides (x0, z0, x1, z1), how far their
  // rim stands over the deck, how deep the water is in them and how far its
  // surface is under the rim. A tub has a bench round its inside.
  { id: 'main', deck: 14, x0: -6.5, z0: -42, x1: 6.5, z1: -16, rim: 0.5, deep: 1.5, free: 0.15, name: 'the main pool' },
  { id: 'cove', deck: 14, x0: -5, z0: 24, x1: 5, z1: 40, rim: 0.5, deep: 1.3, free: 0.15, name: 'the Cove pool' },
  { id: 'tub-1', deck: 14, x0: 10, z0: -12, x1: 13, z1: -9, rim: 0.6, deep: 0.9, free: 0.12, tub: true, name: 'a hot tub' },
  { id: 'tub-2', deck: 14, x0: -13, z0: -12, x1: -10, z1: -9, rim: 0.6, deep: 0.9, free: 0.12, tub: true, name: 'a hot tub' },
  { id: 'tub-3', deck: 14, x0: 10, z0: 44, x1: 13, z1: 47, rim: 0.6, deep: 0.9, free: 0.12, tub: true, name: 'a hot tub' },
  { id: 'tub-4', deck: 14, x0: -13, z0: 44, x1: -10, z1: 47, rim: 0.6, deep: 0.9, free: 0.12, tub: true, name: 'a hot tub' },
  // (its steps at the forward end: the slides come in at the other)
  { id: 'splash', deck: 15, x0: -8, z0: -128, x1: 4, z1: -110, rim: 0.5, deep: 1.4, free: 0.15, splash: true, fwd: true, name: 'the splash pool' },
];
// The steps down into a pool, at its aft end (forward, for one that says
// so), across its middle: this wide, this deep a tread, this far down each
// (m). A tub's bench, this wide.
export const POOL_STEPS = { wide: 3, tread: 0.4, rise: 0.25 };
export const TUB_BENCH = 0.45;
// The floor of a pool (or tub) at (x, z) in the ship's frame, over its deck's
// floor: the steps at its aft end, a tub's bench, or its bottom.
export function poolBed(p, x, z) {
  const water = p.rim - p.free;
  const bottom = water - p.deep;
  if (p.tub) {
    const e = Math.min(x - p.x0, p.x1 - x, z - p.z0, p.z1 - z);
    return e < TUB_BENCH ? 0.05 : bottom;
  }
  const mid = (p.x0 + p.x1) / 2;
  if (Math.abs(x - mid) < POOL_STEPS.wide / 2) {
    const k = Math.floor((p.fwd ? p.z1 - z : z - p.z0) / POOL_STEPS.tread);
    const top = p.rim - POOL_STEPS.rise * (k + 1);
    if (top > bottom) return top;
  }
  return bottom;
}
const poolHoles = (d) => {
  for (const p of POOLS) if (p.deck === d.n) d.pools.push([p.x0, p.z0, p.x1, p.z1]);
};

function lidoDeck(d) {
  cores(d);
  const [cA, cM, cF] = CORES.map((c) => c.z);
  const fA1 = cF + CORE.block[1];
  const deckO = (z0, z1) => inner(z0, z1) + HULL_T - 0.15;
  // the open deck, in pieces round the deckhouses
  const aft = d.room('aft-deck', 'splash', -deckO(-138, cA + CORE.block[0]), -138, deckO(-138, cA + CORE.block[0]), cA + CORE.block[0], { out: true, rail: ['x0', 'x1', 'z0'] });
  const mid1 = d.room('lido-aft', 'lido', -deckO(cA + CORE.block[1], cM + CORE.block[0]), cA + CORE.block[1], deckO(cA + CORE.block[1], cM + CORE.block[0]), cM + CORE.block[0], { out: true, rail: ['x0', 'x1'] });
  const mid2 = d.room('lido-fwd', 'lido', -deckO(cM + CORE.block[1], cF + CORE.block[0]), cM + CORE.block[1], deckO(cM + CORE.block[1], cF + CORE.block[0]), cF + CORE.block[0], { out: true, rail: ['x0', 'x1'] });
  // beside each deckhouse, the deck goes on past it
  for (const c of CORES) {
    for (const s of [1, -1]) {
      const z0 = c.z + CORE.block[0];
      const z1 = c.z + CORE.block[1];
      if (c.id === 'fwd') continue;
      d.room(`beside-${c.id}-${s}`, c.id === 'aft' ? 'splash' : 'lido', s * CORE.half, z0, s * deckO(z0, z1), z1, { out: true, rail: [s > 0 ? 'x1' : 'x0'] });
    }
  }
  for (const s of [1, -1]) {
    d.link(aft, `beside-aft-${s}`);
    d.link(mid1, `beside-aft-${s}`);
    d.link(mid1, `beside-mid-${s}`);
    d.link(mid2, `beside-mid-${s}`);
  }
  deckhouse(d, 'aft', (s) => `beside-aft-${s}`);
  deckhouse(d, 'mid', (s) => `beside-mid-${s}`);
  // the buffet, forward, indoors, round the forward core
  const z1 = 106;
  const buf = d.room('buffet', 'buffet', -inner(cF + CORE.block[0], z1), cF + CORE.block[0], inner(cF + CORE.block[0], z1), z1, { hull: ['x0', 'x1'] });
  poolHoles(d);
  d.link(mid2, buf, 4, 9);
  d.link(mid2, buf, 4, -9);
  d.doors.push({ x: 9, z: buf.z0, nx: 0, nz: -1, w: 4, kind: 'glass' }, { x: -9, z: buf.z0, nx: 0, nz: -1, w: 4, kind: 'glass' });
  // the forward core stands in the buffet: its lobby opens into it either side
  for (const s of [1, -1]) {
    const p = d.room(`passage-fwd-${s}`, 'buffet', s * CORE.half, cF + CORE.block[0], s * CORR[1], fA1, { open: ['z1', 'z0'] });
    d.link(p, 'lobby-fwd');
  }
}

// The open space over the pools, round which the running track goes.
export const TRACK = { hole: [-11, -45, 11, 50], outer: 17 };

function sportsDeck(d) {
  cores(d);
  const [cA, cM, cF] = CORES.map((c) => c.z);
  const deckO = (z0, z1) => inner(z0, z1) + HULL_T - 0.15;
  const A0 = cA + CORE.block[0];
  const A1 = cA + CORE.block[1];
  const M0 = cM + CORE.block[0];
  const M1 = cM + CORE.block[1];
  const F0 = cF + CORE.block[0];
  const F1 = cF + CORE.block[1];
  const sun = d.room('sun', 'sun', -deckO(-134, A0), -134, deckO(-134, A0), A0, { out: true, rail: ['x0', 'x1', 'z0'] });
  const t1 = d.room('track-aft', 'track', -deckO(A1, M0), A1, deckO(A1, M0), M0, { out: true, rail: ['x0', 'x1'] });
  const t2 = d.room('track-fwd', 'track', -deckO(M1, F0), M1, deckO(M1, F0), F0, { out: true, rail: ['x0', 'x1'] });
  for (const c of CORES) {
    for (const s of [1, -1]) {
      const z0 = c.z + CORE.block[0];
      const z1 = c.z + CORE.block[1];
      d.room(`beside-${c.id}-${s}`, c.id === 'aft' ? 'sun' : c.id === 'mid' ? 'track' : 'golf', s * CORE.half, z0, s * deckO(z0, z1), z1, { out: true, rail: [s > 0 ? 'x1' : 'x0'] });
    }
    deckhouse(d, c.id, (s) => `beside-${c.id}-${s}`);
  }
  const golf = d.room('golf', 'golf', -deckO(F1, 100), F1, deckO(F1, 100), 100, { out: true, rail: ['x0', 'x1', 'z1'] });
  for (const s of [1, -1]) {
    d.link(sun, `beside-aft-${s}`);
    d.link(t1, `beside-aft-${s}`);
    d.link(t1, `beside-mid-${s}`);
    d.link(t2, `beside-mid-${s}`);
    d.link(t2, `beside-fwd-${s}`);
    d.link(golf, `beside-fwd-${s}`);
  }
  const [hx0, hz0, hx1, hz1] = TRACK.hole;
  // the open space over the pools, fore and aft of the midships deckhouse
  // (beside it, the deck goes across to its doors)
  d.holes.push([hx0, hz0, hx1, M0], [hx0, M1, hx1, hz1]);
  d.wells.push([hx0, hz0, hx1, M0], [hx0, M1, hx1, hz1]);
  d.blocks.push([FUNNEL.half * -1, FUNNEL.z0, FUNNEL.half, FUNNEL.z1, 6]);
  // the slide tower: under the flights coming down, a cupboard, as at the foot of a core
  const S = CORE.stair;
  d.blocks.push([TOWER.x - S.half, TOWER.z + S.back, TOWER.x + S.half, TOWER.z + S.mid, 1.4], [TOWER.x - S.half, TOWER.z + S.mid, TOWER.x - S.gap, TOWER.z + S.top, 1.4]);
  poolHoles(d);
}

function skyDeck(d) {
  cores(d);
  const cores16 = CORES.filter((c) => c.top >= 16);
  const deckO = (z0, z1) => Math.min(14, inner(z0, z1) + HULL_T - 0.15);
  for (const c of cores16) {
    const z0 = c.z + CORE.block[0];
    const z1 = c.z + CORE.block[1];
    const kind = c.id === 'aft' ? 'sky' : 'lookout';
    const span = c.id === 'aft' ? [-100, -50] : [z0 - 2, 80];
    const a = d.room(`${kind}-aft`, kind, -deckO(span[0], z0), span[0], deckO(span[0], z0), z0, { out: true, rail: ['x0', 'x1', 'z0'] });
    const f = d.room(`${kind}-fwd`, kind, -deckO(z1, span[1]), z1, deckO(z1, span[1]), span[1], { out: true, rail: ['x0', 'x1', 'z1'] });
    for (const s of [1, -1]) {
      d.room(`beside-${c.id}-${s}`, kind, s * CORE.half, z0, s * deckO(z0, z1), z1, { out: true, rail: [s > 0 ? 'x1' : 'x0'] });
      d.link(a, `beside-${c.id}-${s}`);
      d.link(f, `beside-${c.id}-${s}`);
    }
    deckhouse(d, c.id, (s) => `beside-${c.id}-${s}`);
  }
  d.blocks.push([-FUNNEL.half, FUNNEL.z0, FUNNEL.half, FUNNEL.z1, 20]);
}

// ── Walls ────────────────────────────────────────────────────────────────────
// Each room's sides, less what's open and the openings in them. A side on
// her hull is 'hull'; one out in the open on her side, 'rail'.
export function walls(L) {
  if (L._walls) return L._walls;
  const out = [];
  const E = 0.06;
  for (const r of L.rooms) {
    const sides = [
      ['x0', r.x0, r.z0, r.x0, r.z1, 1, 0],
      ['x1', r.x1, r.z0, r.x1, r.z1, -1, 0],
      ['z0', r.x0, r.z0, r.x1, r.z0, 0, 1],
      ['z1', r.x0, r.z1, r.x1, r.z1, 0, -1],
    ];
    for (const [name, x0, z0, x1, z1, nx, nz] of sides) {
      if (r.open && r.open.includes(name)) continue;
      const alongZ = x0 === x1;
      const at = alongZ ? x0 : z0;
      // the gaps on this line
      const cuts = [];
      for (const o of L.openings) {
        if (alongZ) {
          if (o[0] - E <= at && o[2] + E >= at) cuts.push([o[1], o[3]]);
        } else if (o[1] - E <= at && o[3] + E >= at) cuts.push([o[0], o[2]]);
      }
      cuts.sort((a, b) => a[0] - b[0]);
      const lo = alongZ ? z0 : x0;
      const hi = alongZ ? z1 : x1;
      let from = lo;
      const kind = r.rail && r.rail.includes(name) ? 'rail' : r.glass && r.glass.includes(name) ? 'glass' : r.hull && r.hull.includes(name) ? 'hull' : 'wall';
      const push = (a, b) => {
        if (b - a < 0.05) return;
        if (alongZ) out.push({ x0: at, z0: a, x1: at, z1: b, nx, nz, kind, room: r });
        else out.push({ x0: a, z0: at, x1: b, z1: at, nx, nz, kind, room: r });
      };
      for (const [a, b] of cuts) {
        if (b <= from || a >= hi) continue;
        push(from, Math.max(from, a));
        from = Math.max(from, b);
      }
      push(from, hi);
    }
  }
  L._walls = out;
  return out;
}

// ── Floors ───────────────────────────────────────────────────────────────────
// The deck's floor as strips along her, ROW apart across: wherever a room
// is, less its holes. (Solids are capsules, and a floor is a lot of them.)
export const ROW = 1;
const DZ = 0.25;
export function floorStrips(L) {
  if (L._strips) return L._strips;
  const out = [];
  const r = ROW / 2 + 0.06;
  let zMin = Infinity;
  let zMax = -Infinity;
  for (const m of L.rooms) {
    zMin = Math.min(zMin, m.z0);
    zMax = Math.max(zMax, m.z1);
  }
  const inHole = (x, z) => L.holes.some(([x0, z0, x1, z1]) => x > x0 && x < x1 && z > z0 && z < z1) || L.pools.some(([x0, z0, x1, z1]) => x > x0 && x < x1 && z > z0 && z < z1);
  const floored = (x, z) => !inHole(x, z) && L.rooms.some((m) => m.kind !== 'crew' && !m.crew && x >= m.x0 - 0.2 && x <= m.x1 + 0.2 && z >= m.z0 - 0.05 && z <= m.z1 + 0.05);
  for (let x = -HALF_BEAM + ROW / 2; x < HALF_BEAM; x += ROW) {
    let start = null;
    for (let z = zMin; z <= zMax + DZ; z += DZ) {
      const on = z <= zMax && floored(x, z + DZ / 2);
      if (on && start === null) start = z;
      else if (!on && start !== null) {
        const a = start;
        const b = z;
        if (b - a > 0.2) out.push({ x, z0: a, z1: b, r });
        start = null;
      }
    }
  }
  L._strips = out;
  return out;
}

// ── Stairs ───────────────────────────────────────────────────────────────────
// From deck n up to the next, in core c: the first flight up to port, going
// aft; the landing halfway, across the back; the second flight to
// starboard, coming forward to the next deck's landing. Each tread is a box:
// [{ x0, z0, x1, z1, top }], tops over the waterline.
export function flights(c, n) {
  if (n >= c.top) return [];
  return stairFlights(0, c.z, deckY(n));
}

// One turn of such a staircase, from y up DECK_H: across her at x (the
// middle of it), the core's z as for a core.
export function stairFlights(x, z, y) {
  const S = CORE.stair;
  const rise = DECK_H / 2 / S.risers;
  const run = (S.top - S.mid) / (S.risers - 1);
  const out = [];
  for (let i = 1; i < S.risers; i++) {
    const za = z + S.top - (i - 1) * run;
    out.push({ x0: x + S.gap, z0: za - run, x1: x + S.half, z1: za, top: y + i * rise, flight: 1 });
  }
  out.push({ x0: x - S.half, z0: z + S.back, x1: x + S.half, z1: z + S.mid, top: y + DECK_H / 2, landing: true });
  for (let i = 1; i < S.risers; i++) {
    const za = z + S.mid + (i - 1) * run;
    out.push({ x0: x - S.half, z0: za, x1: x - S.gap, z1: za + run, top: y + DECK_H / 2 + i * rise, flight: 2 });
  }
  return out;
}

// The slide tower, on the sun deck (15), to starboard aft: a staircase
// going round three times, a deck's height each, up to a platform 12 m over
// the deck, where the slides (slides.js) start. Its staircase is a core's,
// set at (x, z) as a core is at its z.
export const TOWER = { x: -13, z: -99.7, x0: -17.2, z0: -108.6, x1: -8.8, z1: -100, deck: 15, turns: 3, platform: [-18.5, -110, -7.5, -98.5] };
TOWER.top = deckY(TOWER.deck) + TOWER.turns * DECK_H;
export function towerFlights() {
  const out = [];
  for (let k = 0; k < TOWER.turns; k++) out.push(...stairFlights(TOWER.x, TOWER.z, deckY(TOWER.deck) + k * DECK_H));
  return out;
}
// The platform at the top: its floor, less the well the stairs come up.
export function towerPlatform() {
  const S = CORE.stair;
  const [x0, z0, x1, z1] = TOWER.platform;
  const hole = [TOWER.x - S.half, TOWER.z + S.back, TOWER.x + S.half, TOWER.z + S.top];
  return { rect: [x0, z0, x1, z1], hole, y: TOWER.top };
}

// ── Rectangles ───────────────────────────────────────────────────────────────
// Lists of [x0, z0, x1, z1], cut and overlapped: what's drawn of a floor (a
// room less the holes in it) and a ceiling (what of the deck above is over it).
export function subtract(rects, cuts) {
  let out = rects;
  for (const c of cuts) {
    const next = [];
    for (const r of out) {
      if (c[0] >= r[2] || c[2] <= r[0] || c[1] >= r[3] || c[3] <= r[1]) {
        next.push(r);
        continue;
      }
      if (c[0] > r[0]) next.push([r[0], r[1], c[0], r[3]]);
      if (c[2] < r[2]) next.push([c[2], r[1], r[2], r[3]]);
      const x0 = Math.max(r[0], c[0]);
      const x1 = Math.min(r[2], c[2]);
      if (c[1] > r[1]) next.push([x0, r[1], x1, c[1]]);
      if (c[3] < r[3]) next.push([x0, c[3], x1, r[3]]);
    }
    out = next;
  }
  return out.filter((r) => r[2] - r[0] > 0.01 && r[3] - r[1] > 0.01);
}
export function intersect(rects, others) {
  const out = [];
  for (const r of rects) {
    for (const o of others) {
      const x0 = Math.max(r[0], o[0]);
      const z0 = Math.max(r[1], o[1]);
      const x1 = Math.min(r[2], o[2]);
      const z1 = Math.min(r[3], o[3]);
      if (x1 - x0 > 0.01 && z1 - z0 > 0.01) out.push([x0, z0, x1, z1]);
    }
  }
  return out;
}
export const rectOf = (r) => [r.x0, r.z0, r.x1, r.z1];

// Which deck a height is on: the deck whose floor is at or just under y.
export function deckAt(y) {
  const n = Math.floor((y - DECK4_Y + 0.6) / DECK_H) + FIRST;
  return Math.max(FIRST, Math.min(LAST, n));
}

// Which room of deck n (x, z) is in, or null.
export function roomAt(n, x, z) {
  const L = layout(n);
  let best = null;
  for (const r of L.rooms) {
    if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) {
      if (!best || (r.x1 - r.x0) * (r.z1 - r.z0) < (best.x1 - best.x0) * (best.z1 - best.z0)) best = r;
    }
  }
  return best;
}

// Where (x, z) is along her, in words: forward, midships, aft.
export function whereAlong(z) {
  return z > 40 ? 'forward' : z < -40 ? 'aft' : 'midships';
}
