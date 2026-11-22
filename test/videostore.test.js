// The video store: where it is (grown from the seed, and pinned, since it's
// a place on the map people track), that its shelving leaves room to walk
// and reach every box, that the films are grown the same every time and put
// out in order, what a cover is painted with, the rules of renting, and
// that every sign can be spelled in its little font.

import test from 'node:test';
import assert from 'node:assert/strict';
import { growWorld, LANDS } from '../src/world/lands.js';
import { Sites } from '../src/landmarks/sites.js';
import { Towns } from '../src/towns/towns.js';
import { Caves } from '../src/caves/caves.js';
import { Lines, clearOfPlaces, clearOfCaves } from '../src/railway/lines.js';
import { HIKES } from '../src/world/hikes.js';
import { Landforms } from '../src/world/landforms.js';
import { findSite as findPad, clearOf as padClear } from '../src/spaceport/site.js';
import { findSite, clearOf, SLAB, SKIRT, DOOR_STEP } from '../src/videostore/site.js';
import { Branches, hasBranch, BRANCH } from '../src/videostore/branches.js';
import { Airports } from '../src/airports/airports.js';
import { FACES, RACKS, SECTIONS, SOLIDS, HALF_W, BACK, FRONT, CEILING, DOOR, QUEUE, CLERK, slotAt, aim, fillOrder, walkable, signs } from '../src/videostore/floorplan.js';
import { Catalog, STORE, STAFF, GENRES, sortKey, plural } from '../src/videostore/catalog.js';
import { paintCover, Atlas, COVER, titleBand } from '../src/videostore/covers.js';
import { Counter, HANDS, TERMS, DAY, dueAt, daysLate, termsOf } from '../src/videostore/browse.js';
import { glyph, layout } from '../src/videostore/font.js';
import { matchesGolden } from './helpers/golden.js';
import { movieDetails } from '../worker/movies.js';

const SEED = 20261119;

// The world as the game has it: the things the store keeps clear of, made
// the way their features make them.
function worldOf(land) {
  const gen = growWorld(SEED, [], land);
  const start = gen.findSpawn(0, 0);
  const landforms = new Landforms(HIKES);
  const keepHike = (x0, z0, x1, z1) => !!landforms.reaches(x0, z0, x1, z1);
  const sites = new Sites(gen, { start });
  const caves = new Caves({ gen, keepOff: keepHike });
  const lines = new Lines(gen, { start, keepClear: [clearOfPlaces(sites), clearOfCaves((a, b, c, d) => caves.inBox(a, b, c, d))], keepOff: keepHike });
  const towns = new Towns(gen, { start, sites, keepOff: keepHike });
  const padKeep = padClear({ landforms, sites, towns, caves, lines });
  const spaceport = findPad(gen, start, padKeep);
  // the airfield by the start, as the airports make it (the branches keep off it)
  const field = () => {
    const keep = (x0, z0, x1, z1) => padKeep(x0, z0, x1, z1) || (spaceport.box[0] <= x1 && spaceport.box[2] >= x0 && spaceport.box[1] <= z1 && spaceport.box[3] >= z0);
    return new Airports(gen, { cards: HIKES.map(({ load, ...card }) => card), start, keepOff: keep }).site('home');
  };
  return { gen, start, spaceport, towns, field, keepOff: clearOf({ landforms, sites, towns, caves, lines, spaceport }) };
}

test('branches stand beside the villages people live in, inside the town\'s square, and are pinned', () => {
  const { gen, start, towns, field, keepOff } = worldOf(LANDS[0]);
  const home = findSite(gen, start, keepOff);
  const airfield = field();
  const clear = (a, b) => a[2] < b[0] || a[0] > b[2] || a[3] < b[1] || a[1] > b[3];
  const branches = new Branches(gen, { towns, keepOff, also: (...box) => !clear(box, home.box) || !clear(box, airfield.box) });
  const pinned = {};
  let rolled = 0;
  for (let j = -3; j < 3; j++) {
    for (let i = -3; i < 3; i++) {
      const t = towns.cell(i, j);
      const b = t && branches.forTown(t);
      if (t && hasBranch(t, gen.seed)) rolled++;
      if (!b) continue;
      assert.ok(BRANCH.kinds.includes(t.kind) && t.people > 0, `${b.name}: beside a town people live in`);
      assert.equal(b.name, `${STORE.name}, ${t.name}`);
      const S = towns.size;
      assert.ok(b.box[0] >= i * S && b.box[2] <= (i + 1) * S && b.box[1] >= j * S && b.box[3] <= (j + 1) * S, 'inside its town\'s square');
      assert.ok(!keepOff(...b.box) && clear(b.box, home.box) && clear(b.box, airfield.box), 'clear of everything it keeps clear of, the airfield among it');
      assert.ok(b.top - b.low < 3.6, 'on flat enough ground');
      // facing the town: its front (+z) turned towards the middle of the street
      const fx = Math.sin(b.yaw);
      const fz = Math.cos(b.yaw);
      assert.ok(fx * (t.x - b.x) + fz * (t.z - b.z) > 0, 'facing the town');
      assert.equal(branches.byId(b.id), b, 'found again by its id');
      const round = (v) => Math.round(v * 1000) / 1000;
      pinned[b.id] = { name: b.name, x: round(b.x), z: round(b.z), yaw: round(b.yaw), top: round(b.top) };
    }
  }
  assert.ok(Object.keys(pinned).length >= 2, 'there are some');
  assert.ok(Object.keys(pinned).length >= rolled - 1, 'nearly every village that has one finds somewhere for it');
  matchesGolden(`videostore-branches-${SEED}`, pinned, { tolerance: 1e-6 });
});

test('a branch is the same looked for a little at a time, waiting on the railway', () => {
  const { gen, towns, keepOff } = worldOf(LANDS[0]);
  let asked = 0;
  const slow = (...box) => keepOff(...box);
  slow.ready = () => ++asked > 4;
  const outright = new Branches(gen, { towns, keepOff });
  const bit = new Branches(gen, { towns, keepOff: slow });
  let town = null;
  for (let k = 0; !town; k++) {
    const t = towns.cell(k % 7, Math.floor(k / 7));
    if (t && hasBranch(t, gen.seed) && outright.forTown(t)) town = t;
  }
  assert.equal(bit.peek(town), undefined, 'not known at first');
  let rounds = 0;
  while (bit.pump(1) > 0) rounds++;
  assert.ok(rounds > 1 && asked > 4, 'it took a while');
  assert.deepEqual(bit.peek(town), outright.forTown(town));
});

test('the video store is grown from the seed: the same every time, on flat dry ground, clear of what was there first', () => {
  for (const land of LANDS) {
    const { gen, start, spaceport, keepOff } = worldOf(land);
    const site = findSite(gen, start, keepOff);
    assert.ok(site, `land ${land} has a video store`);
    assert.deepEqual(findSite(gen, start, keepOff), site, 'and the same one again');
    const d = Math.hypot(site.x - start.x, site.z - start.z);
    assert.ok(d >= 250 && d <= 650, `a walk from the start (${d.toFixed(0)} m)`);
    gen.height(site.x, site.z);
    assert.ok(gen.water.edge >= 30, 'out of the water');
    assert.ok(site.top > site.low && site.top - site.low < 3.6, `on ground that's flat enough (${(site.top - site.low).toFixed(2)} m)`);
    const b = site.box;
    assert.ok(!keepOff(b[0], b[1], b[2], b[3]), 'clear of everything it keeps clear of');
    const p = spaceport.box;
    assert.ok(p[2] < b[0] || p[0] > b[2] || p[3] < b[1] || p[1] > b[3], 'the launch site among them');
    // its front faces the start, and you're set down on the pavement facing its doors
    const fx = Math.sin(site.yaw);
    const fz = Math.cos(site.yaw);
    assert.ok(((start.x - site.x) * fx + (start.z - site.z) * fz) / d > 0.99, 'its front faces the way people come');
    const back = { x: site.door.x - site.x, z: site.door.z - site.z };
    assert.ok(Math.abs(Math.hypot(back.x, back.z) - DOOR_STEP.z) < 1e-6, 'the door step is in front of the doors');
    assert.ok(Math.abs(Math.cos(site.door.yaw - site.yaw - Math.PI) - 1) < 1e-9, '...facing them');
    // the place on the map people track is where it was
    const round = (v) => Math.round(v * 1000) / 1000;
    matchesGolden(land > 1 ? `videostore-${SEED}-land${land}` : `videostore-${SEED}`, { id: site.id, x: round(site.x), z: round(site.z), yaw: round(site.yaw), top: round(site.top) }, { tolerance: 1e-6 });
  }
});

test('the video store keeps off somewhere it is told to', () => {
  const gen = growWorld(SEED);
  const start = gen.findSpawn(0, 0);
  const first = findSite(gen, start);
  const box = first.box;
  const second = findSite(gen, start, (x0, z0, x1, z1) => x1 > box[0] && x0 < box[2] && z1 > box[1] && z0 < box[3]);
  assert.ok(second && second.id !== first.id, 'somewhere else');
  assert.ok(second.box[2] <= box[0] || second.box[0] >= box[2] || second.box[3] <= box[1] || second.box[1] >= box[3], 'clear of it');
  assert.ok(SLAB[0] - SKIRT < -HALF_W && SLAB[3] > DOOR_STEP.z, 'the slab is under the shop and the door step');
});

// ── Inside ──────────────────────────────────────────────────────────────────

test('every run of shelving is inside the walls, and none overlaps another', () => {
  const rect = (f) => {
    const d = f.depth;
    const xs = [f.x0, f.x0 + f.ux * f.len, f.x0 - f.nx * d, f.x0 + f.ux * f.len - f.nx * d];
    const zs = [f.z0, f.z0 + f.uz * f.len, f.z0 - f.nz * d, f.z0 + f.uz * f.len - f.nz * d];
    return [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)];
  };
  for (const f of FACES) {
    const [x0, z0, x1, z1] = rect(f);
    assert.ok(x0 >= -HALF_W - 1e-9 && x1 <= HALF_W + 1e-9 && z0 >= BACK - 1e-9 && z1 <= FRONT + 1e-9, `${f.id} is inside the walls`);
    assert.ok(f.cols > 0 && f.rows > 0, `${f.id} has room for tapes`);
    assert.ok(Math.abs(Math.hypot(f.ux, f.uz) - 1) < 1e-9 && Math.abs(f.ux * f.nx + f.uz * f.nz) < 1e-9, `${f.id} runs along its front`);
    assert.ok(RACKS[f.kind].height < CEILING - 0.5, 'under the ceiling');
  }
  for (let i = 0; i < FACES.length; i++) {
    for (let j = i + 1; j < FACES.length; j++) {
      const a = rect(FACES[i]);
      const b = rect(FACES[j]);
      const over = Math.min(a[2], b[2]) - Math.max(a[0], b[0]) > 0.02 && Math.min(a[3], b[3]) - Math.max(a[1], b[1]) > 0.02;
      assert.ok(!over, `${FACES[i].id} and ${FACES[j].id} don't overlap`);
    }
  }
});

test('every box can be reached from the floor in front of it, and the aisles join up', () => {
  // somewhere to stand within a pace or so in front of it (a box in a
  // corner, from a little to one side)
  for (const f of FACES) {
    for (let c = 0; c < f.cols; c += 3) {
      const s = slotAt(f, c, 0);
      let ok = false;
      for (const d of [0.7, 0.9, 1.2]) for (const t of [0, -0.4, 0.4, -0.8, 0.8]) ok = ok || walkable(s.x + f.nx * d + f.ux * t, s.z + f.nz * d + f.uz * t, 0.3);
      assert.ok(ok, `you can stand in front of ${f.id} column ${c}`);
    }
  }
  // from just inside the doors, everywhere you can stand is somewhere you
  // can walk to: a flood over a grid of the floor
  const STEP = 0.25;
  const key = (i, j) => `${i}:${j}`;
  const cell = (i, j) => ({ x: -HALF_W + (i + 0.5) * STEP, z: BACK + (j + 0.5) * STEP });
  const W = Math.round((2 * HALF_W) / STEP);
  const D = Math.round((FRONT - BACK) / STEP);
  let open = 0;
  for (let i = 0; i < W; i++) for (let j = 0; j < D; j++) if (walkable(cell(i, j).x, cell(i, j).z, 0.32)) open++;
  const seen = new Set();
  const first = [Math.floor(W / 2), D - 4];
  assert.ok(walkable(cell(...first).x, cell(...first).z, 0.32), 'you can stand inside the doors');
  const todo = [first];
  seen.add(key(...first));
  while (todo.length) {
    const [i, j] = todo.pop();
    for (const [a, b] of [
      [i + 1, j],
      [i - 1, j],
      [i, j + 1],
      [i, j - 1],
    ]) {
      if (a < 0 || b < 0 || a >= W || b >= D || seen.has(key(a, b))) continue;
      const p = cell(a, b);
      if (!walkable(p.x, p.z, 0.32)) continue;
      seen.add(key(a, b));
      todo.push([a, b]);
    }
  }
  assert.equal(seen.size, open, 'no corner of the shop is shut off from the doors');
  // and among it, the counter, where you're served
  const q = { x: (QUEUE.x0 + QUEUE.x1) / 2, z: CLERK.z };
  assert.ok(seen.has(key(Math.floor((q.x + HALF_W) / STEP), Math.floor((q.z - BACK) / STEP))), 'you can get to the counter');
  assert.ok(DOOR.x0 < -1 && DOOR.x1 > 1, 'the doors are wide enough to walk through');
});

test('a point on a box is that box’s slot, and between the boxes is none', () => {
  for (const f of FACES) {
    for (const [c, r] of [
      [0, 0],
      [f.cols - 1, f.rows - 1],
      [Math.floor(f.cols / 2), 1],
    ]) {
      const s = slotAt(f, c, r);
      assert.deepEqual(aim(f, s.x, s.y, s.z), { col: c, row: r }, `${f.id} ${c} ${r}`);
    }
    const s = slotAt(f, 0, 0);
    assert.equal(aim(f, s.x - f.ux * 1, s.y, s.z - f.uz * 1), null, 'off the end of it');
    assert.equal(aim(f, s.x, f.y0 - 0.2, s.z), null, 'under the bottom shelf');
  }
});

test('the signs hang over head height, and every one can be spelled', () => {
  for (const s of signs()) {
    assert.ok(s.y > 1.9 || s.text === SECTIONS.family.sign, `${s.text} is up out of the way (${s.y.toFixed(2)} m)`);
    for (const ch of s.text) assert.ok(glyph(ch), `"${ch}" in ${s.text}`);
  }
  const more = [STORE.name, STORE.motto, 'BE KIND, PLEASE REWIND', 'NO LATE FEES*', '$9.99 SALE', 'OPEN', 'RETURNS', ...STAFF.map((s) => `${s.name}’S PICKS`)];
  for (const text of more) for (const ch of text.toUpperCase()) assert.ok(glyph(ch) || ch === '*', `"${ch}" in ${text}`);
  for (const ch of 'RETURNS OPEN 10 AM TO MIDNIGHT') assert.ok(glyph(ch, true), `"${ch}" in the small font`);
  const L = layout('AB');
  assert.equal(L.width, 11, 'two letters and a gap');
  assert.ok(L.dots.every(([x, y]) => x >= 0 && x < 11 && y >= 0 && y < 7));
});

test('nothing solid stands in the doorway or the gate', () => {
  for (const [x0, z0, x1, z1] of SOLIDS) {
    const inDoor = x1 > DOOR.x0 + 0.3 && x0 < DOOR.x1 - 0.3 && z1 > FRONT - 3;
    assert.ok(!inDoor || x1 - x0 < 0.2, `[${[x0, z0, x1, z1].map((v) => v.toFixed(1))}] is clear of the way in`);
  }
  assert.ok(walkable(0, FRONT - 0.5) && walkable(0, FRONT - 2.5), 'you can walk straight in');
});

// ── The films ───────────────────────────────────────────────────────────────

test('the shelves are repeatable, with generated films that vary by world', () => {
  const a = new Catalog(SEED);
  const b = new Catalog(SEED);
  assert.deepEqual(
    a.films.map((f) => f.title),
    b.films.map((f) => f.title),
  );
  const c = new Catalog(42);
  const same = c.films.filter((f, i) => !f.tmdbId && a.films[i]?.title === f.title).length;
  assert.ok(same < a.films.length * 0.05, `another seed, other films (${same} the same)`);
});

test('every slot holds a distinct edition, and every generated sleeve has its details', () => {
  const cat = new Catalog(SEED);
  const slots = FACES.reduce((n, f) => n + f.cols * f.rows, 0);
  assert.equal(cat.slots.size, slots, 'no empty slots');
  assert.ok(cat.films.length > 1500, `plenty to choose from (${cat.films.length})`);
  const editions = new Set(cat.films.map((f) => `${f.title} · ${f.format}`));
  assert.equal(editions.size, cat.films.length, 'a movie can come in both formats');
  const ratings = new Set(['G', 'PG', 'PG-13', 'R', 'NR']);
  for (const f of cat.films) {
    assert.ok(f.year <= STORE.year && f.year >= 1930, `${f.title} (${f.year})`);
    assert.ok(GENRES[f.genre], f.genre);
    assert.equal(cat.byId(f.id), f);
    assert.equal(cat.slotsOf(f.id).length, f.copies, `${f.title}: as many slots as copies`);
    if (f.section === 'picks') assert.ok(f.staff && f.note, 'a staff pick says who picked it, and why');
    if (f.section === 'picks' || f.section === 'new') {
      assert.ok(Number.isInteger(f.tmdbId), 'curated shelves carry real films');
      assert.equal(f.quote, undefined, 'real films have no invented critic quote');
      continue;
    }
    const text = [f.title, f.tagline, f.blurb, f.director, ...f.cast, f.quote.text, f.quote.by].join(' ');
    assert.ok(!/[{}]|undefined|null/.test(text), `${f.title}: nothing left unfilled (${text})`);
    assert.ok(ratings.has(f.rating), f.rating);
    assert.ok(f.mins >= 70 && f.mins <= 160);
    assert.ok(f.stars >= 2 && f.stars <= 5);
    if (f.genre === 'foreign') assert.ok(f.lang && f.means, 'a foreign film says what it means');
  }
  // "a slacker pizza guy has"; "two best friends have"
  const blurbs = cat.films.map((f) => f.blurb).join(' ');
  assert.doesNotMatch(blurbs, /\b(friends|brothers|sisters|roommates|counsellors|family|kids and their grandpa) has\b/);
  assert.doesNotMatch(blurbs, /\b(he|she) (are|have|dig|move|discover) /);
  assert.equal(plural('Mailman'), 'Mailmen');
  assert.equal(plural('Werewolf'), 'Werewolves');
  assert.equal(plural('Lady'), 'Ladies');
});

test('the tapes are out in alphabetical order, bay by bay, and a new release’s copies stand side by side', () => {
  const cat = new Catalog(SEED);
  assert.equal(sortKey('The Long Summer'), 'LONG SUMMER');
  assert.equal(sortKey('A Kiss in Paris'), 'KISS IN PARIS');
  const bySection = new Map();
  for (const f of FACES) {
    if (f.section === 'picks') continue;
    if (!bySection.has(f.section)) bySection.set(f.section, []);
    bySection.get(f.section).push(f);
  }
  for (const [section, faces] of bySection) {
    let last = '';
    for (const f of faces) {
      for (const [c, r] of fillOrder(f)) {
        const film = cat.at(f.id, c, r);
        const k = sortKey(film.title);
        assert.ok(k >= last, `${section}: ${film.title} after ${last}`);
        last = k;
      }
    }
  }
  for (const film of cat.section('new')) {
    const where = cat.slotsOf(film.id);
    assert.ok(where.length >= 3, `${film.title}: several copies`);
    assert.ok(
      where.every((s) => s.face === where[0].face && s.row === where[0].row),
      `${film.title}: on one shelf`,
    );
    const cols = where.map((s) => s.col).sort((a, b) => a - b);
    assert.equal(cols[cols.length - 1] - cols[0], cols.length - 1, `${film.title}: side by side`);
  }
});

test('which new releases are all out changes from day to day, the same for everyone', () => {
  const cat = new Catalog(SEED);
  const day = 20500;
  assert.deepEqual([...cat.allOut(day)], [...new Catalog(SEED).allOut(day)]);
  const days = new Set();
  for (let d = day; d < day + 10; d++) {
    const out = cat.allOut(d);
    assert.equal(out.size, 2);
    for (const id of out) assert.equal(cat.byId(id).section, 'new', 'only new releases run out');
    days.add([...out].join(','));
  }
  assert.ok(days.size > 5, 'different ones on different days');
});

// ── Covers ──────────────────────────────────────────────────────────────────

test('a cover is painted edge to edge, each a little different, and the atlas holds them all', () => {
  const cat = new Catalog(SEED);
  const paint = (f, w = COVER.w, h = COVER.h) => {
    const img = { width: w, data: new Uint8Array(w * h * 4) };
    paintCover(f, img, 0, 0, w, h);
    return img.data;
  };
  const seen = new Set();
  for (const f of cat.films.slice(0, 300)) {
    const d = paint(f);
    for (let i = 3; i < d.length; i += 4) assert.equal(d[i], 255, `${f.title}: every pixel painted`);
    seen.add(Buffer.from(d).toString('base64'));
    const T = titleBand(f);
    assert.ok(T.at === 'top' || T.at === 'bottom');
  }
  assert.ok(seen.size > 290, `no two alike (${seen.size} of 300)`);
  for (const motif of new Set(Object.values(GENRES).flatMap((G) => G.cover.motifs))) {
    const f = cat.films.find((x) => x.cover.motif === motif);
    assert.ok(f, `${motif} is on some cover`);
    paint(f, 72, 108); // and paints big as well as small
  }
  const atlas = new Atlas(cat.films.length);
  atlas.paint(cat.films, 0, 50);
  const r = atlas.rect(cat.films[49].id);
  assert.ok(r.u0 >= 0 && r.u1 <= 1 && r.v0 >= 0 && r.v1 <= 1 && r.u1 > r.u0 && r.v1 > r.v0);
  assert.ok(Math.abs((r.u1 - r.u0) * atlas.width - COVER.w) < 1e-9 && Math.abs((r.v1 - r.v0) * atlas.height - COVER.h) < 1e-9);
});

// ── Renting ─────────────────────────────────────────────────────────────────

const NOW = new Date(2026, 10, 20, 15, 30).getTime(); // a Friday afternoon

test('three tapes in your hands at once, put back the last one first', () => {
  const cat = new Catalog(SEED);
  const k = new Counter();
  const films = cat.section('comedy').slice(0, 4);
  assert.equal(k.take(films[0], 'a'), 'ok');
  assert.equal(k.take(films[0], 'a'), 'have', 'not the same box twice');
  assert.equal(k.take(films[1], 'b'), 'ok');
  assert.equal(k.take(films[2], 'c'), 'ok');
  assert.equal(k.hands.length, HANDS);
  assert.equal(k.take(films[3], 'd'), 'full');
  assert.deepEqual([...k.taken()], ['a', 'b', 'c'], 'their boxes are off the shelf');
  assert.equal(k.putBack().key, 'c');
  assert.deepEqual(
    k.dropAll().map((h) => h.key),
    ['a', 'b'],
  );
  assert.equal(k.taken().size, 0, 'and back on it');
});

test('renting: a new release for two nights, anything else for five, the sale tapes yours to keep', () => {
  const cat = new Catalog(SEED);
  const k = new Counter();
  const fresh = cat.section('new')[0];
  const old = cat.section('drama')[0];
  const sale = cat.section('sale')[0];
  k.take(fresh, 'new:0:0');
  k.take(old, 'right-a:0:0');
  k.take(sale, 'island1-sale:0:0');
  const r = k.checkout(NOW, (id) => cat.byId(id), '1234 5678 9012');
  assert.equal(r.total, Math.round((TERMS.new.price + TERMS.catalog.price + TERMS.sale.price) * 100) / 100);
  assert.equal(new Date(r.items[0].due).getDate(), 22, 'due back two nights later');
  assert.equal(new Date(r.items[1].due).getDate(), 25, '...or five');
  assert.equal(new Date(r.items[0].due).getHours(), 23, 'by midnight');
  assert.equal(r.items[2].buy, true);
  assert.equal(r.due, r.items[0].due, 'the soonest due');
  assert.equal(k.hands.length, 0);
  assert.deepEqual(
    k.out.map((o) => o.title),
    [fresh.title, old.title],
  );
  assert.deepEqual(
    k.owned.map((o) => o.title),
    [sale.title],
  );
  assert.deepEqual(k.card, { number: '1234 5678 9012', since: NOW, rentals: 2 });
  assert.ok(k.taken().has('new:0:0') && !k.taken().has('island1-sale:0:0'), 'what you have out is off the shelf; what you bought is gone for good');
  assert.equal(termsOf(cat.section('family')[0]), TERMS.family);
  assert.equal(termsOf(cat.section('picks')[0]), TERMS.picks);
});

test('late fees: a day’s fee for every day past midnight on the day it was due', () => {
  assert.equal(daysLate(dueAt(NOW, 2), NOW + DAY), 0);
  assert.equal(daysLate(dueAt(NOW, 2), dueAt(NOW, 2) + 1000), 1);
  assert.equal(daysLate(dueAt(NOW, 2), dueAt(NOW, 2) + 3 * DAY - 1000), 3);
  const cat = new Catalog(SEED);
  const k = new Counter();
  k.take(cat.section('new')[0], 'n');
  k.take(cat.section('horror')[0], 'h');
  k.checkout(NOW, (id) => cat.byId(id), '0');
  const r = k.returnAll(dueAt(NOW, 2) + 2 * DAY - 1000); // the new release two days late; the other in time
  assert.deepEqual(
    r.items.map((i) => i.late),
    [2, 0],
  );
  assert.equal(r.fees, 2 * TERMS.new.late);
  assert.equal(k.out.length, 0);
  assert.equal(k.returnAll(NOW), null, 'nothing left to return');
});

test('what you have out is kept, and a save with nonsense in it is tidied', () => {
  const cat = new Catalog(SEED);
  const k = new Counter();
  k.take(cat.section('action')[3], 'left-a:0:0');
  k.checkout(NOW, (id) => cat.byId(id), '1111 2222 3333');
  const saved = JSON.parse(JSON.stringify(k.serialize()));
  const again = new Counter();
  again.load(saved);
  assert.deepEqual(again.serialize(), k.serialize());
  const tidy = Counter.validate({ out: [{ id: 'x' }, null, saved.out[0], { ...saved.out[0], title: 7 }], owned: 'lots', card: { number: 5 } });
  assert.deepEqual(tidy, { out: [saved.out[0]], owned: [], card: null });
  assert.deepEqual(Counter.validate(null), { out: [], owned: [], card: null });
});

test('a saved VHS rental does not hide the DVD or a movie that replaced its old slot', () => {
  const cat = new Catalog(SEED);
  const editions = cat.section('new').filter((f) => f.tmdbId === 558);
  const vhs = editions.find((f) => f.format === 'VHS');
  const dvd = editions.find((f) => f.format === 'DVD');
  assert.notEqual(vhs.id, dvd.id);
  const keyFor = (id) => {
    const { face, col, row } = cat.slotsOf(id)[0];
    return `${face}:${col}:${row}`;
  };
  const vhsKey = keyFor(vhs.id);
  const dvdKey = keyFor(dvd.id);
  const k = new Counter();
  k.take(vhs, vhsKey);
  const checkout = k.checkout(NOW, (id) => cat.byId(id));
  assert.equal(checkout.items[0].format, 'VHS');
  const saved = k.serialize();
  saved.out.push({ ...saved.out[0], id: 18, title: 'Old Generated Movie', key: dvdKey });
  k.load(saved);
  assert.deepEqual([...k.taken((key) => cat.slots.get(key))], [vhsKey]);
  assert.deepEqual(k.returnAll(NOW).items.map((item) => item.title), [vhs.title, 'Old Generated Movie']);
});

test('film details request only stocked IDs and use the U.S. theatrical certification', async (t) => {
  const api = t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url.origin, 'https://api.themoviedb.org');
    assert.equal(url.pathname, '/3/movie/558');
    assert.equal(url.searchParams.get('append_to_response'), 'credits,release_dates');
    assert.equal(options.headers.authorization, 'Bearer test-token');
    return Response.json({
      id: 558,
      title: 'Spider-Man 2',
      runtime: 127,
      tagline: 'A test tagline',
      overview: 'A test synopsis',
      credits: { cast: [{ name: 'Tobey Maguire' }], crew: [{ job: 'Director', name: 'Sam Raimi' }] },
      release_dates: { results: [
        { iso_3166_1: 'GB', release_dates: [{ type: 3, certification: 'PG' }] },
        { iso_3166_1: 'US', release_dates: [
          { type: 5, certification: 'NR', release_date: '2007-10-30T00:00:00.000Z' },
          { type: 3, certification: 'PG-13' },
          { type: 5, release_date: '2004-11-30T00:00:00.000Z' },
        ] },
      ] },
    });
  });
  const url = 'https://game.example/api/videostore/movies/558';
  assert.equal((await movieDetails(new Request(url), '', null, '558')).status, 204);
  assert.equal((await movieDetails(new Request(url), 'test-token', null, '999999999')).status, 404);
  assert.equal((await movieDetails(new Request(url, { method: 'POST' }), 'test-token', null, '558')).status, 405);
  assert.equal(api.mock.callCount(), 0);
  const response = await movieDetails(new Request(url), 'test-token', null, '558');
  assert.deepEqual(await response.json(), {
    title: 'Spider-Man 2',
    tagline: 'A test tagline',
    blurb: 'A test synopsis',
    mins: 127,
    rating: 'PG-13',
    homeYear: '2004',
    cast: ['Tobey Maguire'],
    director: 'Sam Raimi',
  });
  assert.equal(api.mock.callCount(), 1);
});
