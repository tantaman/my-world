// What Hell's ground is strewn with, and who is on it: the rocks and crags,
// the trees of the wood, the tombs and their fires, and the shades of each
// circle, doing what the poem has them do.
//
// The ground is cut into squares CELL m across, each furnished when you come
// near it (world/strewn.js). A square is looked over on a grid of spots; at
// each, strew() decides from where in Hell the spot is (which circle, which
// ditch, how deep in what) whether anything is there.
//
// Like the land, a square is furnished for a turn of the circles (land.js),
// and one turn on it is furnished differently.

import { mulberry32 } from '../noise.js';
import { R, ONE, BOLGE, LIQUID, TAU, bankTop, zoneAt } from './plan.js';
import { boulder, crag, thornTree, bareTree, cypress, reeds, tomb, hole, iceHead, cloaked, weight } from './models.js';
import { createHellStone } from './look.js';
import { shade, createShadeMaterial, createFlameMaterial, createFlameHaze, flameGeometry } from '../render/shades.js';
import { makeCreature } from './creatures.js';
import { Strewn, kind } from '../world/strewn.js';

export const CELL = 64; // m
const SPOTS = 8; // spots along a square's side (the wood has half as many again)

const _o = {};
const _a = {};

// One of the creatures' shapes (creatures.js), as a geometry to strew.
function shapeOf(name) {
  let geo = null;
  makeCreature(name, null, { rough: true }).traverse((o) => {
    if (o.isMesh && !geo) geo = o.geometry;
  });
  return geo;
}

// What can be put down: a shape, what it is drawn with, and, if it is in
// the way, how wide and tall (m, at a scale of 1).
function makeKit() {
  const stone = createHellStone({ hot: true });
  const body = createShadeMaterial();
  const iron = createShadeMaterial({ rolling: true });
  const legs = createShadeMaterial({ hip: 0.05 });
  const fire = createFlameMaterial();
  const K = (geo, mat, solid = null) => ({ ...kind(geo, mat, solid, stone), shadow: !!solid, receiveShadow: true });
  return {
    boulder: K(boulder(1), stone, { r: 0.6, top: 0.6, step: 0.7 }),
    boulder2: K(boulder(9), stone, { r: 0.6, top: 0.6, step: 0.7 }),
    crag: K(crag(2), stone, { r: 0.75, top: 3 }),
    crag2: K(crag(21), stone, { r: 0.75, top: 3 }),
    thorn: K(thornTree(3), stone, { r: 0.3, top: 3 }),
    thorn2: K(thornTree(31), stone, { r: 0.3, top: 3 }),
    thorn3: K(thornTree(57), stone, { r: 0.3, top: 3 }),
    bare: K(bareTree(5), stone, { r: 0.28, top: 4 }),
    cypress: K(cypress(), stone, { r: 0.26, top: 9 }),
    reeds: K(reeds(7), stone),
    tomb: K(tomb(11), stone, { r: 0.8, top: 1.15, len: 0.85 }),
    weight: K(weight(13), iron),
    hole: K(hole(), legs),
    head: K(iceHead(0), body),
    headBowed: K(iceHead(1), body),
    headBack: K(iceHead(-1), body),
    stand: K(shade('stand'), body),
    bowed: K(shade('bowed'), body),
    push: K(shade('push'), body),
    raise: K(shade('raise'), body),
    sit: K(shade('sit'), body),
    supine: K(shade('supine'), body),
    prone: K(shade('prone'), body),
    cloaked: K(cloaked(), body),
    flame: { ...kind(flameGeometry(), fire), haze: createFlameHaze() },
    serpent: K(shapeOf('serpent'), stone),
  };
}

export class Furniture extends Strewn {
  // land, space: Hell's · group: where its meshes go
  constructor({ land, space, group }) {
    super({ land, space, group, kit: makeKit(), strew, cell: CELL });
  }

  turnOf(x, z, ref) {
    const p = this.land.polar(x, z, ref, _o);
    return p.r > ONE ? Math.round(p.th / TAU) : 0;
  }
}

// ── What is where ───────────────────────────────────────────────────────────
// Look over the square at (x0, z0) and put down what belongs in it.
//   put(kind, x, y, z, yaw, scale, more)
// more: { go: [dirX, dirZ, speed, span], phase, rise, sink, stride, shade,
// red, tall, tiltX, tiltZ } (see shades.js for the first five).
export function strew(land, ref, x0, z0, seed, put) {
  const rnd = mulberry32(seed);
  const mid = land.sample(x0 + CELL / 2, z0 + CELL / 2, ref, _o, false);
  const wooded = mid.rr > R.wood - 40 && mid.rr < R.bloodIn + 40;
  const n = wooded ? 11 : SPOTS;
  const g = CELL / n;
  const at = (x, z) => land.sample(x, z, ref, _a, false);
  for (let b = 0; b < n; b++) {
    for (let a = 0; a < n; a++) {
      const x = x0 + (a + rnd()) * g;
      const z = z0 + (b + rnd()) * g;
      const u = rnd(); // whether anything is here
      const v = rnd(); // and which, how big, which way
      const w = rnd();
      const s = land.sample(x, z, ref, _o, false);
      if (s.r > R.wall - 4) continue;
      const rr = s.rr;
      const y = s.h;
      const depth = s.liq > s.h ? s.liq - s.h : 0;
      // which way is on round the circle (to the left, facing in), and inward
      const tx = -(z - land.cz) / s.r;
      const tz = (x - land.cx) / s.r;
      const yawIn = Math.atan2(-tz, tx); // facing the middle
      // (not on a slope, for things that stand)
      const level = () => Math.abs(at(x + 1.2, z).h - y) < 0.8 && Math.abs(at(x, z + 1.2).h - y) < 0.8;
      // something that walks on round the circle: which way (±1), how fast, over how long a stretch
      const walker = (kind, dir, speed, span, more = {}) => {
        const dx = tx * dir;
        const dz = tz * dir;
        const y0 = at(x - (dx * span) / 2, z - (dz * span) / 2).h;
        const y1 = at(x + (dx * span) / 2, z + (dz * span) / 2).h;
        put(kind, x, (y0 + y1) / 2, z, Math.atan2(dx, dz), 0.94 + w * 0.14, { go: [dx, dz, speed, span], phase: v, rise: y1 - y0, stride: 1, shade: 0.75 + w * 0.5, ...more });
      };
      const body = (kind, more = {}) => put(kind, x, y, z, v * TAU, 0.94 + w * 0.14, { shade: 0.7 + w * 0.5, ...more });

      if (rr >= R.acheronOut) {
        // ── The vestibule: the crowd that runs after the banner, for ever
        if (rr < R.wall - 30 && rr > R.acheronOut + 24) {
          if (u < 0.32) walker('stand', 1, 3.2 + v * 0.8, 56);
          else if (u < 0.36 && level()) put(v < 0.5 ? 'boulder' : 'boulder2', x, y, z, w * TAU, 0.7 + v * 1.4);
        } else if (u < 0.05 && rr < R.wall - 4 && level()) put('boulder', x, y, z, w * TAU, 0.8 + v * 1.8);
      } else if (rr >= R.acheronIn) {
        // Acheron itself: nothing stands in it
      } else if (rr >= R.c1 + 10) {
        // ── Limbo: they stand about, and sigh
        const slope = rr > R.limboFoot;
        if (u < (slope ? 0.03 : 0.06) && level()) body(v < 0.3 ? 'bowed' : 'stand');
        else if (u < 0.085 && level() && depth === 0) put(slope ? 'bare' : 'cypress', x, y, z, w * TAU, 0.8 + v * 0.7);
        else if (u < 0.1 && level()) put('boulder2', x, y, z, w * TAU, 0.6 + v);
      } else if (rr >= R.c2 + 10) {
        // ── The second circle: nothing on the ground but the rock (they are in the air)
        if (u < 0.05 && level()) put(v < 0.5 ? 'crag' : 'crag2', x, y, z, w * TAU, 0.7 + v * 1.1);
        else if (u < 0.1 && level()) put('boulder', x, y, z, w * TAU, 0.7 + v * 1.5);
        // ...and over it the lustful, borne on round by the wind like starlings
        else if (u < 0.24 && rr < R.c1 - 20) {
          const speed = 15 + v * 9;
          put(w < 0.5 ? 'prone' : 'supine', x, y, z, Math.atan2(tx, tz), 1, { go: [tx, tz, speed, 220], phase: w, sink: -(5 + v * v * 44), tiltX: (w - 0.5) * 1.4, tiltZ: (v - 0.5) * 1.2, shade: 0.6 + w * 0.5 });
        }
      } else if (rr >= R.c3 + 10) {
        // ── The third: lying in the mud, under the rain
        if (u < 0.26 && rr < R.c2 - 14) body(v < 0.55 ? 'prone' : 'supine', { sink: 0.04 + depth * 0.6 });
        else if (u < 0.29 && level()) body('sit');
      } else if (rr >= R.c4 + 15) {
        // ── The fourth: two crowds, rolling weights at each other round the ring
        if (rr < R.c3 - 14 && u < 0.34) {
          // the inner half goes one way round and the outer the other
          const dir = rr > (R.c3 + R.c4) / 2 ? 1 : -1;
          const speed = 0.55 + (Math.floor(rr / 8) % 3) * 0.1;
          const shadeOf = 0.75 + w * 0.5;
          const dx = tx * dir;
          const dz = tz * dir;
          const y0 = at(x - dx * 24, z - dz * 24).h;
          const y1 = at(x + dx * 24, z + dz * 24).h;
          const go = { go: [dx, dz, speed, 48], phase: v, rise: y1 - y0 };
          put('push', x, (y0 + y1) / 2, z, Math.atan2(dx, dz), 1, { ...go, stride: 1, shade: shadeOf });
          put('weight', x + dx * 1.15, (y0 + y1) / 2, z + dz * 1.15, Math.atan2(dx, dz), 0.8 + w * 0.35, { ...go, shade: shadeOf });
        }
      } else if (rr >= R.dis) {
        // ── Styx: the wrathful, in the mire to the waist; reeds at its edges
        if (depth > 0.25 && depth < 1.5 && u < 0.2) body(v < 0.5 ? 'raise' : 'stand', { sink: Math.min(depth - 0.1, 1.0), stride: 0.9, go: [0, 0, 1.4 + v, 0], phase: w });
        else if (depth > 0 && depth < 0.5 && u < 0.5) put('reeds', x, s.liq - 0.1, z, w * TAU, 0.8 + v * 0.8);
        else if (depth === 0 && u < 0.1 && rr < R.c4 - 20) put('reeds', x, y, z, w * TAU, 0.8 + v * 0.6);
      } else if (rr >= R.c6 + 14) {
        // ── The sixth: the tombs, and fire among them
        if (rr < R.dis - 14 && u < 0.36 && level()) {
          put('tomb', x, y, z, yawIn + (v - 0.5) * 1.2, 0.9 + w * 0.3);
          put('flame', x, y + 0.5, z, w * TAU, 0.7 + v * 0.4, { tall: 1.1 + v * 0.8 });
        } else if (u < 0.42 && rr < R.dis - 8) put('flame', x, y - 0.05, z, w * TAU, 0.4 + v * 0.5, { tall: 1.1 + w * 0.8 });
      } else if (rr >= R.bloodOut) {
        // ── Under the ruin: the rock it brought down
        if (u < 0.3) put(v < 0.5 ? 'boulder' : 'boulder2', x, y, z, w * TAU, 0.8 + v * v * 3);
        else if (u < 0.34 && level()) put('crag2', x, y, z, w * TAU, 0.6 + v);
      } else if (rr >= R.bloodIn) {
        // ── Phlegethon: in the blood, each as deep as they shed it
        if (depth > 0.5 && u < 0.2) body(v < 0.4 ? 'raise' : 'stand', { sink: Math.min(depth - 0.05, 1.05 + w * 0.5), red: 2.2, shade: 0.5 });
      } else if (rr >= R.wood) {
        // ── The wood
        if (depth > 0 || s.kind === LIQUID.blood) continue;
        if (u < 0.5) put(v < 0.34 ? 'thorn' : v < 0.67 ? 'thorn2' : 'thorn3', x, y, z, w * TAU, 0.8 + rnd() * 0.75, { shade: 0.7 + w * 0.6 });
      } else if (rr >= R.brink + 17) {
        // ── The sand: some lie on it, some sit, most run
        if (s.kind === LIQUID.blood || Math.abs(at(x + 2, z).h - y) > 0.6) continue; // (not on the brook's margins)
        if (u < 0.045) body('supine', { red: 1.3 });
        else if (u < 0.13) walker('stand', v < 0.5 ? 1 : -1, 2.6 + w * 1.2, 48, { red: 1.25 });
        else if (u < 0.2 && rr < R.brink + 90) put('sit', x, y, z, yawIn + (v - 0.5), 1, { red: 1.25, shade: 0.8 });
        else if (u < 0.24) put('flame', x, y - 0.1, z, w * TAU, 0.3 + v * 0.4, { tall: 0.8 + w });
      } else if (rr >= R.bolge) {
        // under the great cliff
        if (u < 0.12 && rr > R.brink - 60) put(v < 0.5 ? 'boulder' : 'boulder2', x, y, z, w * TAU, 1 + v * v * 4);
      } else if (rr >= R.bank) {
        ditch(land, s, x, y, z, depth, u, v, w, tx, tz, yawIn, walker, body, put);
      } else if (rr >= R.shelf) {
        // the bank round the well, and the shelf in it: bare
      } else if (rr < R.shelf - 6 && rr > 34) {
        // ── Cocytus: fixed in the ice, each zone its own way
        const zone = zoneAt(rr);
        if (zone < 3 && u < 0.26) put(zone === 0 ? 'headBowed' : zone === 2 ? 'headBack' : 'head', x, y + 0.02, z, v * TAU, 0.95 + w * 0.15, { shade: 0.6 + w * 0.4 });
      }
    }
  }
}

// A spot in Malebolge: what is on the floor of the ditch it is in.
function ditch(land, s, x, y, z, depth, u, v, w, tx, tz, yawIn, walker, body, put) {
  const i = Math.min(BOLGE.n - 1, Math.floor((R.bolge - s.r) / BOLGE.pitch));
  const q = R.bolge - i * BOLGE.pitch - s.r - BOLGE.bank; // how far across the ditch (m)
  if (q < BOLGE.wall + 1 || q > BOLGE.ditch - BOLGE.wall - 1) return; // on a bank, or a wall
  const floor = land.top + bankTop(i) - BOLGE.tilt - BOLGE.deep;
  if (y > floor + 0.9) return; // on the stair, or the fallen bridge
  const outer = q < BOLGE.ditch / 2;
  switch (i) {
    case 0: // panders one way, seducers the other, under the lash
      if (u < 0.5) walker('stand', outer ? -1 : 1, 1.9 + v * 0.5, 60);
      break;
    case 1: // flatterers, sunk in it
      if (u < 0.36) body(v < 0.5 ? 'raise' : 'stand', { sink: 0.35 + depth * 0.8 + w * 0.3, shade: 0.5 });
      break;
    case 2: // simoniacs: the holes, and the feet
      if (u < 0.5) put('hole', x, y, z, v * TAU, 1, { go: [0, 0, 1.2 + w * 1.5, 0], phase: v, stride: 0.8 });
      break;
    case 3: // diviners, walking backward-faced, weeping
      if (u < 0.42) walker('bowed', 1, 0.34, 40);
      break;
    case 4: // barrators: the pitch closes over them; one comes up, now and then
      if (u < 0.07) body('raise', { sink: 0.9 + w * 0.5, shade: 0.25 });
      break;
    case 5: // hypocrites, in lead
      if (u < 0.44) walker('cloaked', -1, 0.28, 36, { stride: 0 });
      break;
    case 6: // thieves, running among the serpents
      if (u < 0.16) walker('stand', v < 0.5 ? 1 : -1, 3.4, 60);
      else if (u < 0.5) put('serpent', x, y, z, v * TAU, 0.8 + w * 1.1);
      else if (u < 0.56) body('prone', { shade: 0.45 });
      break;
    case 7: // false counsellors: each a flame, moving along the gully
      if (u < 0.34) {
        const dir = v < 0.5 ? 1 : -1;
        put('flame', x, y - 0.1, z, w * TAU, 0.9 + v * 0.5, { tall: 2.1 + w * 1.2, go: [tx * dir, tz * dir, 0.5 + w * 0.5, 56], phase: v });
      }
      break;
    case 8: // sowers of discord, going round to be cloven again
      if (u < 0.4) walker(v < 0.3 ? 'bowed' : 'stand', 1, 0.8 + w * 0.3, 52, { red: 1.7, shade: 0.7 });
      break;
    default: // falsifiers: heaped, sick
      if (u < 0.3) body(v < 0.5 ? 'prone' : 'supine', { shade: 0.6 });
      else if (u < 0.5) body('sit', { shade: 0.6 });
  }
}
