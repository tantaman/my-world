// Points marked by hand in the original's frames, for tools/survey.mjs:
// what each is in the set (a name from POINTS, as a function of the layout)
// and where it is in the 1440x1080 frame. Read off with a 25 px grid laid
// over a crop of the frame, zoomed twice.
//
// A mark is [point, [px, py]] or [point, [px, py], u] where the point is
// somewhere along a line (a road's edge, say) and u is a first guess at
// where: the solve finds it.
import * as S from '../src/set/layout.js';

// The layout's unknowns: first guesses from layout.js and how far (sigma,
// metres or radians) each may move before it costs as much as a mark six
// pixels out. Sigma 0 holds a value. The shop's west end holds the X
// origin; the shop's front (z = 0) and the camera's height (EYE) the rest.
export const LAYOUT = {
  shopX0: { v: S.SHOP.x0, sigma: 0 },
  shopX1: { v: S.SHOP.x1, sigma: 6 },
  wall: { v: S.SHOP.wall, sigma: 1.5 },
  parapet: { v: S.SHOP.parapet, sigma: 2 },
  glassX0: { v: S.SHOP.glass.x0, sigma: 3 },
  doorX0: { v: S.SHOP.door.x0, sigma: 3 },
  doorX1: { v: S.SHOP.door.x1, sigma: 3 },
  glassX1: { v: S.SHOP.glass.x1, sigma: 4 },
  wdZ: { v: S.SHOP.westDoor.z, sigma: 1 },
  canX0: { v: S.CANOPY.x0, sigma: 5 },
  canX1: { v: S.CANOPY.x1, sigma: 8 },
  canZ1: { v: S.CANOPY.z1, sigma: 5 },
  canUnder: { v: S.CANOPY.under, sigma: 1.5 },
  canTop: { v: S.CANOPY.under + S.CANOPY.thick, sigma: 1.5 },
  colAx: { v: S.ISLANDS[0].x, sigma: 6 },
  colAz: { v: S.ISLANDS[0].z, sigma: 5 },
  colBx: { v: S.ISLANDS[1].x, sigma: 6 },
  colBz: { v: S.ISLANDS[1].z, sigma: 5 },
  pumpDx: { v: S.ISLAND.pumpDx, sigma: 1 },
  drumDx: { v: S.ISLAND.drumDx, sigma: 1 },
  // Lamp 0 here is the nearest in 01, the right-hand one (layout.js's lamp 1).
  lampX0: { v: S.lampX(1), sigma: 8 },
  lampStep: { v: S.LAMPS.step, sigma: 6 },
  lampZ: { v: S.LAMPS.z, sigma: 4 },
  lampH: { v: S.LAMPS.pole - 0.07, sigma: 1 },   // the glowing head, a little under the pole's top
  lampArm: { v: S.LAMPS.arm, sigma: 0.6 },
  // Each near lamp's own error from an even row, and the row's slope (dz/dx).
  lampD0: { v: 0, sigma: 0 },
  lampD1: { v: 0, sigma: 0 },
  lampD2: { v: 0, sigma: 0 },
  lampD3: { v: 0, sigma: 0 },
  lampSlope: { v: 0, sigma: 0 },
  vanX: { v: S.VAN.x, sigma: 6 },
  vanZ: { v: S.VAN.z, sigma: 4 },
  vanHead: { v: S.VAN.heading, sigma: 2 },
  vanLen: { v: S.VAN.len, sigma: 0.4 },
  vanWid: { v: S.VAN.wid, sigma: 0.2 },
  vanH: { v: S.VAN.h, sigma: 0.2 },
  iceX: { v: S.ICE.x, sigma: 3 },
  iceZ: { v: S.ICE.z, sigma: 1 },
  signX: { v: S.SIGN.x, sigma: 6 },
  signZ: { v: S.SIGN.z, sigma: 6 },
  signYaw: { v: S.SIGN.yaw, sigma: 1.5 },
  signY: { v: S.SIGN.y, sigma: 1 },
  signW: { v: S.SIGN.w, sigma: 1 },
  signH: { v: S.SIGN.h, sigma: 0.5 },
  roadZ0: { v: S.ROAD.z0, sigma: 4 },
  roadZ1: { v: S.ROAD.z1, sigma: 4 },
  fenceZ: { v: S.FENCE.z, sigma: 5 },
  drumShopX: { v: S.DRUM_SHOP.x, sigma: 3 },
  drumShopZ: { v: S.DRUM_SHOP.z, sigma: 1 },
  benchX: { v: S.BENCH.x, sigma: 3 },
  mullX: { v: S.SHOP.glass.mullions[1], sigma: 3 },
  glassSill: { v: S.SHOP.glass.sill, sigma: 0.5 },
  glassHead: { v: S.SHOP.glass.head, sigma: 0.8 },
  phoneX: { v: S.PHONE.x, sigma: 3 },
  ufoY: { v: S.UFO.y + 1.46, sigma: 6 },          // the middle of its rim (ufo/saucer.js)
  // The canopy's tubes: the long one, the crooked twin, the far one (by how
  // they look from 01), as [x, z] on the underside.
  tLongX: { v: S.CANOPY.tubes[0][0], sigma: 6 }, tLongZ: { v: S.CANOPY.tubes[0][1], sigma: 4 },
  tTwinX: { v: S.CANOPY.tubes[1][0], sigma: 6 }, tTwinZ: { v: S.CANOPY.tubes[1][1], sigma: 4 },
  tFarX: { v: S.CANOPY.tubes[2][0], sigma: 6 }, tFarZ: { v: S.CANOPY.tubes[2][1], sigma: 4 },
  tFourX: { v: S.CANOPY.tubes[2][0], sigma: 6 }, tFourZ: { v: S.CANOPY.tubes[2][1], sigma: 4 },
  cowX: { v: S.COW.x, sigma: 8 },
  cowZ: { v: S.COW.z, sigma: 8 },
};

const ISLAND_TOP = S.ISLAND.h;
const DOOR_H = S.SHOP.westDoor.h;

// The van's own frame: lx along it in half-lengths (-1 the rear, +1 the
// nose), y up, lz across in half-widths (+1 its local +Z side), turned as
// van.js turns it (three's rotation.y = vanHead).
function van(L, lx, y, lz) {
  const a = lx * L.vanLen / 2, b = lz * L.vanWid / 2;
  const c = Math.cos(L.vanHead), s = Math.sin(L.vanHead);
  return [L.vanX + a * c + b * s, y, L.vanZ - a * s + b * c];
}
// The welcome sign's board: a along it from its middle in metres (-w/2 the
// arrow's tip), y up, as welcome.js turns it.
function sign(L, a, y, b = 0) {
  const c = Math.cos(L.signYaw), s = Math.sin(L.signYaw);
  return [L.signX + a * c + b * s, y, L.signZ - a * s + b * c];
}
const lamp = (L, k) => L.lampX0 + k * L.lampStep + (L[`lampD${k}`] ?? 0);
const lampZ = (L, k) => L.lampZ + L.lampSlope * (lamp(L, k) - L.lampX0);

// Named points. 'name(a,b)' passes numbers on.
export const POINTS = {
  shopFW: (L) => [L.shopX0, 0, 0],                 // the shop's front west corner, at the foot
  shopFWc: (L) => [L.shopX0, L.wall, 0],           // under the cornice there
  shopFWp: (L) => [L.shopX0, L.parapet, 0],        // the parapet's top there
  shopFE: (L) => [L.shopX1, 0, 0],
  shopFEc: (L) => [L.shopX1, L.wall, 0],
  shopFEp: (L) => [L.shopX1, L.parapet, 0],
  wdNearFoot: (L) => [L.shopX0, 0, L.wdZ + 0.5],    // the west door's near edge (the shop's front side)
  wdNearTop: (L) => [L.shopX0, DOOR_H, L.wdZ + 0.5],
  wdFarTop: (L) => [L.shopX0, DOOR_H, L.wdZ - 0.5],
  westLamp: (L) => [L.shopX0 - 0.15, 2.7, L.wdZ],
  shopFoot: (L, u) => [u, 0, 0],                   // somewhere along the foot of the front wall
  drumShop: (L, u, y = 0) => [L.drumShopX, y, L.drumShopZ],
  glass0: (L, u, y) => [L.glassX0, y, 0],          // the glazing's west edge, at height y
  door0: (L, u, y) => [L.doorX0, y, 0],
  mull: (L, u, y) => [L.mullX, y, 0],              // the mullion between the glazing's west edge and the door
  glass0s: (L) => [L.glassX0, L.glassSill, 0],     // the glazing's west edge at the sill
  glass0h: (L) => [L.glassX0, L.glassHead, 0],     // and at the head
  mulls: (L) => [L.mullX, L.glassSill, 0],
  mullh: (L) => [L.mullX, L.glassHead, 0],
  phone: (L, u, y) => [L.phoneX, y, S.PHONE.z],
  bench: (L, u, y) => [L.benchX, y, S.BENCH.z],
  door1: (L, u, y) => [L.doorX1, y, 0],
  glass1: (L, u, y) => [L.glassX1, y, 0],
  canBW: (L) => [L.canX0, L.canUnder, 0],          // the canopy's underside, west edge, at the shop
  canBWt: (L) => [L.canX0, L.canTop, 0],           // its top there
  canFWu: (L) => [L.canX0, L.canUnder, L.canZ1],   // front west corner, underside
  canFWt: (L) => [L.canX0, L.canTop, L.canZ1],     // and top
  canFEu: (L) => [L.canX1, L.canUnder, L.canZ1],
  canFEt: (L) => [L.canX1, L.canTop, L.canZ1],
  canBEu: (L) => [L.canX1, L.canUnder, 0],
  canFront: (L, u) => [u, L.canUnder, L.canZ1],    // somewhere along the front edge, underside
  colAtop: (L) => [L.colAx, L.canUnder, L.colAz],
  colAfoot: (L) => [L.colAx, ISLAND_TOP, L.colAz],
  colBtop: (L) => [L.colBx, L.canUnder, L.colBz],
  colBfoot: (L) => [L.colBx, ISLAND_TOP, L.colBz],
  colA: (L, u, y) => [L.colAx, y, L.colAz],
  colAAt: (L, u) => [L.colAx, u, L.colAz],         // somewhere up column A
  colBAt: (L, u) => [L.colBx, u, L.colBz],
  canEast: (L, u) => [L.canX1, L.canUnder, u],     // somewhere along the canopy's east edge, underside
  colB: (L, u, y) => [L.colBx, y, L.colBz],
  pumpA: (L, u, y) => [L.colAx + L.pumpDx, y, L.colAz],
  pumpB: (L, u, y) => [L.colBx + L.pumpDx, y, L.colBz],
  drumA: (L, u, y) => [L.colAx + L.drumDx, y, L.colAz + 0.1],   // (small.js stands them 0.1 m off the line)
  drumB: (L, u, y) => [L.colBx + L.drumDx, y, L.colBz + 0.1],
  head: (L, u, k) => [lamp(L, k), L.lampH, lampZ(L, k) + L.lampArm],   // a street lamp's head
  foot: (L, u, k) => [lamp(L, k), 0, lampZ(L, k)],                     // and its pole's foot
  pole: (L, u, k, y) => [lamp(L, k), y, lampZ(L, k)],
  poleAt: (L, u, k) => [lamp(L, k), u, lampZ(L, k)],                   // somewhere up its pole
  tube: (L, u, i) => [L[['tLongX', 'tTwinX', 'tFarX', 'tFourX'][i]], L.canUnder - 0.15, L[['tLongZ', 'tTwinZ', 'tFarZ', 'tFourZ'][i]]],
  ufo: (L) => [L.cowX, L.ufoY, L.cowZ],                            // the saucer's middle, hovering over the cow
  van: (L, u, lx, y, lz) => van(L, lx, y, lz),
  ice: (L, u, lx, y, lz) => [L.iceX + lx * S.ICE.w / 2, y, L.iceZ + lz * S.ICE.d / 2],
  // a metres along the board from its middle, fy the fraction of its height from the bottom.
  // (a in metres of a 3.2 m board, scaled with the fitted width)
  sign: (L, u, a, fy) => sign(L, a * L.signW / 3.2, L.signY + fy * L.signH),
  signTip: (L) => sign(L, -L.signW / 2, L.signY + L.signH / 2),
  signPostL: (L, u, y = 0) => sign(L, -L.signW * 0.25, y, -0.08),
  signPostR: (L, u, y = 0) => sign(L, L.signW * 0.35, y, -0.08),
  road0: (L, u) => [u, 0, L.roadZ0],               // the road's near edge, somewhere
  road1: (L, u) => [u, 0, L.roadZ1],               // its far edge
  roadMid: (L, u) => [u, 0, (L.roadZ0 + L.roadZ1) / 2],
  fence: (L, u, y = 0) => [u, y, L.fenceZ],
  cow: (L, u, y = 0) => [L.cowX, y, L.cowZ],
};

// Parses 'name(1,2)' into POINTS.name(L, u, 1, 2).
const cache = new Map();
export function pointFn(spec) {
  if (cache.has(spec)) return cache.get(spec);
  const m = /^(\w+)(?:\((.*)\))?$/.exec(spec);
  const f = POINTS[m[1]];
  if (!f) throw new Error(`no point ${spec}`);
  const args = m[2] ? m[2].split(',').map(Number) : [];
  const fn = (L, u) => f(L, u, ...args);
  cache.set(spec, fn);
  return fn;
}

// Each frame: its name, t (seconds), a first guess at the camera, the marks.
export const FRAMES = [
  {
    name: '01-establishing', t: 0.5,
    guess: { x: -21.8, z: 8.2, yaw: -8.5, pitch: 2.6 },
    marks: [
      ['tube(0)', [690, 440]],
      ['tube(1)', [948, 455]],
      ['tube(2)', [785, 483]],
      ['shopFW', [268, 708]],
      ['shopFWc', [268, 450]],
      ['shopFWp', [282, 327]],
      ['wdNearFoot', [165, 700]],
      ['wdNearTop', [167, 537]],
      ['wdFarTop', [101, 534]],
      ['westLamp', [117, 503]],
      ['glass0(2.6)', [457, 507]],
      ['canBW', [458, 425]],
      ['canFWu', [1100, 412]],
      ['canFWt', [1098, 376]],
      ['canFEu', [1016, 484]],
      ['colAtop', [860, 436]],
      ['colAfoot', [860, 662]],
      ['head(0)', [1287, 323]],
      ['head(1)', [1115, 441]],
      ['foot(1)', [1094, 625]],
      ['head(2)', [1047, 485]],
      ['foot(2)', [1033, 612]],
      ['head(3)', [1012, 510]],
      ['foot(3)', [1002, 605]],
      ['head(4)', [990, 524]],
      ['head(5)', [976, 534]],
      ['head(6)', [965, 541]],
      ['signTip', [1212, 630]],
      ['signPostL', [1293, 737]],
      ['van(-1,2.06,-1)', [584, 554]],
      ['van(-1,2.06,1)', [625, 552]],
      ['van(-1,0.35,-1)', [580, 638]],
      ['van(-0.546,0,1)', [682, 657]],
      ['van(0.66,0,1)', [745, 652]],
      ['ice(-1,0,1)', [417, 697]],
      ['ice(-1,0,-1)', [362, 690]],
      ['ice(1,0,1)', [467, 690]],
      ['ice(-1,1.05,1)', [418, 612]],
    ],
  },
  {
    name: '04-station', t: 17,
    guess: { x: -9, z: 3, yaw: 8, pitch: 4 },
    marks: [
      ['tube(0)', [630, 305]],
      ['tube(1)', [1062, 337]],
      ['tube(2)', [858, 410]],
      ['canFWt', [1365, 107]],
      ['canFWu', [1370, 177]],
      ['canFEu', [1147, 410]],
      ['canBWt', [255, 240]],
      ['canBW', [260, 282]],
      ['colAtop', [905, 280]],
      ['colAfoot', [908, 667]],
      ['colBtop', [957, 395]],
      ['head(1)', [1255, 365]],
      ['foot(1)', [1232, 587]],
      ['head(2)', [1156, 434]],
      ['foot(2)', [1142, 552]],
      ['head(3)', [1115, 462]],
      ['head(4)', [1091, 478]],
      ['head(5)', [1077, 489]],
      ['head(6)', [1067, 496]],
      ['van(-1,0.4,-1)', [555, 610]],
      ['van(-1,2.06,-1)', [565, 492]],
      ['van(-1,2.06,1)', [650, 490]],
      ['van(-0.546,0,1)', [688, 630]],
      ['van(0.66,0,1)', [790, 615]],
      ['ice(1,1.05,1)', [170, 602]],
      ['ice(1,0.1,1)', [172, 708]],
      ['shopFoot', [172, 702], -6],
      ['shopFoot', [280, 676], -4],
      ['drumShop', [317, 676]],
      ['glass0(0.75)', [268, 580]],
      ['glass0(2.6)', [268, 425]],
    ],
  },
  {
    name: '02-lightning-sign', t: 5.8,
    guess: { x: -21, z: 8, yaw: 28, pitch: 1 },
    marks: [
      ['tube(0)', [120, 327]],
      ['tube(1)', [417, 350]],
      ['tube(2)', [232, 385]],
      ['canFWt', [602, 251]],
      ['canFWu', [602, 297]],
      ['canFEu', [495, 389]],
      ['colAtop', [313, 325]],
      ['colAfoot', [313, 597]],
      ['head(0)', [830, 202]],
      ['foot(0)', [784, 605]],
      ['head(1)', [597, 346]],
      ['foot(1)', [574, 545]],
      ['head(2)', [520, 396]],
      ['foot(2)', [504, 525]],
      ['head(3)', [479, 422]],
      ['foot(3)', [470, 520]],
      ['head(4)', [459, 436]],
      ['head(5)', [444, 446]],
      ['head(6)', [433, 454]],
      ['van(-0.546,0,1)', [114, 585]],
      ['van(0.66,0,1)', [189, 578]],
      ['signTip', [770, 560]],
      ['sign(1.6,0.83)', [1167, 499]],
      ['sign(1.6,0.17)', [1167, 630]],
      ['sign(-1.152,0.96)', [882, 475]],
      ['sign(-1.152,0.04)', [882, 637]],
      ['signPostL', [882, 695]],
      ['signPostR', [1100, 697]],
    ],
  },
  {
    name: '05-car', t: 20,
    guess: { x: -5, z: 6, yaw: 45, pitch: 3 },
    marks: [
      ['canFWu', [798, 100]],
      ['canFEu', [409, 362]],
      ['colAtop', [156, 134]],
      ['head(0)', [1073, 50]],
      ['foot(0)', [1031, 681]],
      ['head(1)', [519, 329]],
      ['foot(1)', [494, 553]],
      ['head(2)', [400, 396]],
      ['foot(2)', [386, 530]],
      ['head(3)', [353, 425]],
      ['foot(3)', [342, 519]],
      ['head(4)', [325, 442]],
      ['head(5)', [311, 451]],
      ['head(6)', [299, 459]],
      ['cow', [1120, 550]],
      ['road0', [957, 662], 0],
      ['road0', [1200, 706], -3],
    ],
  },
  {
    name: '18-return', t: 71,
    guess: { x: -2, z: 13.5, yaw: -38, pitch: 3 },
    marks: [
      ['colAtop', [350, 297]],
      ['colAfoot', [350, 785]],
      ['colBtop', [810, 456]],
      ['colBfoot', [810, 700]],
      ['canFEu', [1100, 449]],
      ['canFEt', [1094, 411]],
      ['canBEu', [625, 497]],
      ['head(1)', [1306, 386]],
      ['foot(1)', [1281, 684]],
      ['head(2)', [1287, 491]],
      ['head(3)', [1283, 527]],
      ['van(0.66,0,1)', [622, 702]],
      ['door0(1.4)', [222, null]],
      ['door1(1.4)', [290, null]],
    ],
  },
  {
    name: '10-pasture', t: 42,
    guess: { x: -1, z: 9, yaw: 80, pitch: 4 },
    marks: [
      ['canFEu', [181, 350]],
      ['head(0)', [1186, 19]],
      ['foot(0)', [1200, 744]],
      ['head(1)', [300, 325]],
      ['foot(1)', [266, 594]],
      ['head(2)', [125, 409]],
      ['foot(2)', [105, 562]],
      ['head(3)', [58, 446]],
      ['foot(3)', [45, 550]],
      ['head(4)', [25, 466]],
      ['road0', [269, 600], 12],
      ['road0', [720, 675], 4],
      ['road0', [1440, 759], -6],
      ['roadMid', [876, 634], 2],
      ['roadMid', [1132, 656], -1],
      ['fence', [488, 550], 10],
      ['fence', [621, 550], 6],
      ['fence', [815, 569], 3],
      ['fence', [1102, 572], -2],
      ['cow', [917, 566]],
      ['cow(1.45)', [917, 524]],
    ],
  },
  {
    name: '12-ufo-arrives', t: 48,
    guess: { x: -4, z: 10, yaw: 75, pitch: 4 },
    marks: [
      ['foot(0)', [980, 970]],
      ['poleAt(0)', [990, 500], 3],
      ['poleAt(0)', [968, 200], 5],
      ['head(1)', [110, 357]],
      ['foot(1)', [63, 660]],
      ['road0', [560, 850], 2],
      ['road0', [800, 905], 0],
      ['road0', [1100, 960], -2],
      ['road0', [1400, 1000], -4],
      ['roadMid', [700, 735], 0],
      ['roadMid', [900, 765], -3],
      ['fence', [520, 630], 10],
      ['fence', [730, 640], 5],
      ['fence', [1050, 650], -2],
      ['fence', [1270, 660], -7],
      ['cow', [845, 638]],
      ['cow(1.45)', [845, 590]],
    ],
  },
  {
    name: '13-ufo-hover', t: 53,
    guess: { x: -4.3, z: 12, yaw: 80, pitch: 20 },
    marks: [
      ['poleAt(0)', [318, 1000], 0.5],
      ['poleAt(0)', [378, 400], 2.5],
      ['poleAt(0)', [408, 200], 3.5],
      ['poleAt(0)', [445, 50], 5],
      ['cow', [740, 870]],
      ['cow(1.45)', [740, 820]],
      ['roadMid', [450, 1005], 0],
      ['roadMid', [690, 1045], -2],
      ['ufo', [715, 410]],
    ],
  },
  {
    name: '06-canopy-pan', t: 24.5,
    guess: { x: -3, z: 3, yaw: 12, pitch: 3 },
    marks: [
      ['tube(3)', [600, 355]],
      ['tube(1)', [1020, 225]],
      ['colAtop', [905, 22]],
      ['colAAt', [905, 550], 1.5],
      ['drumA(1.06)', [900, 660]],
      ['drumA(0.18)', [900, 865]],
      ['colBtop', [762, 345]],
      ['colBfoot', [762, 630]],
      ['head(1)', [1050, 343]],
      ['foot(1)', [1023, 590]],
      // (lamp 2 is behind column A)
      ['head(3)', [818, 458]],
      ['foot(3)', [805, 548]],
      ['canFEu', [958, 378]],
      ['canEast', [600, 377], 5],
      ['van(-1,2.06,-1)', [165, 455]],
      ['van(-1,2.06,1)', [300, 462]],
      ['van(-1,0.4,-1)', [145, 655]],
      ['van(-1,0.4,1)', [300, 670]],
      ['van(-0.546,0,1)', [375, 695]],
      ['van(0.66,0,1)', [528, 650]],
      ['van(1,0.45,1)', [562, 612]],
    ],
  },
  {
    name: '09-under-canopy', t: 36,
    guess: { x: -2, z: 2.5, yaw: 15, pitch: 4 },
    marks: [
      ['tube(3)', [530, 407]],
      ['tube(1)', [1068, 285]],
      ['colAAt', [1195, 400], 3],
      ['colAAt', [1205, 700], 1.2],
      ['colBtop', [710, 395]],
      ['colBfoot', [708, 702]],
      ['pumpA(1.9)', [1042, 485]],
      ['drumA(1.06)', [1285, 750]],
      ['poleAt(1)', [900, 500], 3],
      ['foot(1)', [902, 655]],
      ['head(2)', [730, 494]],
      ['head(3)', [650, 524]],
      ['foot(3)', [637, 612]],
      ['head(4)', [608, 540]],
      ['foot(4)', [599, 608]],
      ['head(5)', [584, 550]],
      ['head(6)', [567, 556]],
      ['van(-1,2.06,-1)', [55, 490]],
      ['van(-1,2.06,1)', [250, 497]],
      ['van(-1,0.4,1)', [255, 780]],
      ['van(-0.546,0,1)', [330, 800]],
      ['van(0.66,0,1)', [470, 735]],
      ['van(1,0.45,1)', [500, 690]],
    ],
  },
  {
    name: '03-light-in-sky', t: 11,
    guess: { x: -15, z: 6, yaw: -10, pitch: 22 },
    marks: [
      ['tube(0)', [830, 750]],
      ['tube(1)', [1220, 750]],
      ['tube(2)', [1005, 825]],
      ['canFWt', [1428, 565]],
      ['canFWu', [1420, 612]],
      ['canBWt', [478, 680]],
      ['canBW', [482, 728]],
      ['colAtop', [1085, 725]],
      ['head(1)', [1420, 725]],
      ['head(2)', [1335, 808]],
      ['head(3)', [1298, 845]],
      ['head(4)', [1272, 865]],
      ['head(5)', [1255, 878]],
      ['van(-1,2.06,-1)', [725, 922]],
      ['van(-1,2.06,1)', [818, 922]],
      ['van(-1,0.4,-1)', [715, 1035]],
      ['van(0.66,0,1)', [950, 1062]],
      ['glass0(2.6)', [485, 857]],
    ],
  },
  {
    name: '07-shopfront', t: 27,
    guess: { x: -4.2, z: 3.6, yaw: -53, pitch: -4 },
    marks: [
      ['glass0h', [517, 245]],
      ['glass0s', [517, 657]],
      ['mullh', [816, 288]],
      ['mulls', [816, 622]],
      ['door0(0)', [1053, 672]],
      ['door1(0)', [1144, 665]],
      ['phone(1.4)', [455, null]],
      ['drumShop', [626, 868]],
      ['drumShop(0.88)', [626, 672]],
      ['bench(0.45)', [899, null]],
      ['van(-1,2.06,-1)', [1290, 418]],
      ['van(-1,0.45,-1)', [1258, 680]],
    ],
  },
  {
    name: '08-interior', t: 30,
    guess: { x: -2.9, z: 2.8, yaw: -52, pitch: -3 },
    marks: [
      ['glass0h', [160, 252]],
      ['glass0s', [162, 858]],
      ['mullh', [750, 205]],
      ['mulls', [752, 762]],
      ['door0(0)', [1053, 665]],
      ['door1(0)', [1148, 640]],
      ['drumShop(0.88)', [367, 782]],
      ['bench(0.45)', [845, null]],
    ],
  },
  // The camera stands near lamp 1 (marks' lamp 0) until 68 s.
  {
    name: '14-beam', holdXZ: true, t: 55,
    guess: { x: -6.1, z: 11.6, yaw: 58, pitch: 22 },
    marks: [
      ['poleAt(0)', [47, 1067], 0.5],
      ['poleAt(0)', [100, 533], 2.5],
      ['poleAt(0)', [153, 67], 5],
      ['ufo', [720, 355]],
      ['cow', [713, 807]],
      ['cow(1.45)', [713, 757]],
      ['roadMid', [400, 940], 2],
      ['roadMid', [667, 1027], 0],
    ],
  },
  {
    name: '15-cow-rising', holdXZ: true, t: 57,
    guess: { x: -6.1, z: 11.6, yaw: 58, pitch: 22 },
    marks: [
      ['poleAt(0)', [60, 933], 1],
      ['poleAt(0)', [120, 400], 3],
      ['ufo', [720, 387]],
      ['fence', [707, 853], 4],
      ['roadMid', [387, 980], 2],
      ['roadMid', [747, 1067], 0],
    ],
  },
  {
    name: '16-ufo-empty', holdXZ: true, t: 61,
    guess: { x: -6.1, z: 11.6, yaw: 58, pitch: 20 },
    marks: [
      ['poleAt(0)', [53, 1040], 0.5],
      ['poleAt(0)', [147, 520], 2.5],
      ['poleAt(0)', [287, 7], 5],
      ['ufo', [713, 450]],
    ],
  },
  {
    name: '17-ufo-leaves', holdXZ: true, t: 63,
    guess: { x: -6.1, z: 11.6, yaw: 48, pitch: 13 },
    marks: [
      ['poleAt(0)', [200, 1080], 0.5],
      ['poleAt(0)', [253, 587], 2.5],
      ['poleAt(0)', [340, 13], 5],
      ['head(1)', [113, 507]],
      ['foot(1)', [53, 800]],
    ],
  },
  // Between the stills, for the walk (fewer marks: where the camera stands).
  {
    name: 't3.5', t: 3.5,
    guess: { x: -18, z: 6.7, yaw: -10, pitch: 2 },
    marks: [
      ['canFWt', [1133, 355]],
      ['canFWu', [1133, 400]],
      ['colAtop', [875, 427]],
      ['head(0)', [1337, 299]],
      ['foot(0)', [1308, 690]],
      ['head(1)', [1143, 437]],
      ['foot(1)', [1121, 633]],
      ['head(2)', [1070, 485]],
      ['foot(2)', [1055, 617]],
      ['head(3)', [1033, 510]],
      ['head(4)', [1010, 525]],
      ['signTip', [1277, 643]],
    ],
  },
  {
    name: 't8.5', t: 8.5,
    guess: { x: -15, z: 6.9, yaw: -24, pitch: 7 },
    marks: [
      ['shopFW', [300, 790]],
      ['shopFWp', [300, 360]],
      ['wdNearFoot', [210, 768]],
      ['wdNearTop', [210, 590]],
      ['wdFarTop', [155, 590]],
      ['canFWt', [1288, 388]],
      ['canFWu', [1282, 430]],
      ['colAtop', [1015, 490]],
      ['colAfoot', [1015, 735]],
      ['head(1)', [1278, 492]],
      ['foot(1)', [1268, 680]],
      ['head(2)', [1208, 545]],
      ['foot(2)', [1200, 660]],
      ['head(3)', [1172, 570]],
      ['head(4)', [1150, 585]],
      ['ice(1,1.05,1)', [578, 690]],
    ],
  },
  {
    name: 't33', t: 33,
    guess: { x: -3.8, z: 1.3, yaw: 10, pitch: 4 },
    marks: [
      ['van(-1,2.06,-1)', [120, 440]],
      ['van(-1,2.06,1)', [395, 440]],
      ['van(-1,0.4,1)', [400, 735]],
      ['van(-1,0.4,-1)', [90, 720]],
      ['van(-0.546,0,1)', [437, 755]],
      ['van(0.66,0,1)', [515, 690]],
      ['colAAt', [1335, 400], 3],
      ['colAAt', [1340, 650], 1.2],
      ['colBtop', [730, 345]],
      ['colBfoot', [730, 655]],
      ['pumpA(1.9)', [1165, 445]],
      ['foot(1)', [868, 605]],
      ['poleAt(1)', [868, 450], 3],
      ['head(2)', [660, 445]],
      ['head(3)', [570, 478]],
      ['foot(3)', [563, 570]],
      ['head(4)', [523, 495]],
      ['tube(1)', [1140, 255]],
      ['tube(2)', [540, 352]],
    ],
  },
  {
    name: 't49', t: 49,
    guess: { x: -4.9, z: 9.3, yaw: 50, pitch: 10 },
    marks: [
      ['cow', [925, 760]],
      ['poleAt(0)', [1000, 300], 4],
      ['poleAt(0)', [1010, 800], 1],
      ['head(1)', [140, 465]],
      ['foot(1)', [74, 760]],
    ],
  },
  {
    name: 't50', t: 50,
    guess: { x: -5.2, z: 9.7, yaw: 54, pitch: 15 },
    marks: [
      ['cow', [816, 862]],
      ['poleAt(0)', [850, 300], 4],
      ['poleAt(0)', [858, 800], 1],
    ],
  },
  {
    name: 't51', t: 51,
    guess: { x: -5.6, z: 10.1, yaw: 55, pitch: 20 },
    marks: [
      ['cow', [730, 905]],
      ['poleAt(0)', [658, 300], 4],
      ['poleAt(0)', [662, 900], 1],
      ['ufo', [730, 395]],
    ],
  },
  {
    name: 't52', t: 52,
    guess: { x: -5.9, z: 10.4, yaw: 56, pitch: 20 },
    marks: [
      ['cow', [720, 890]],
      ['poleAt(0)', [560, 40], 5],
      ['poleAt(0)', [500, 920], 1],
      ['ufo', [720, 400]],
    ],
  },
].map((f) => ({ ...f, marks: f.marks.map(([p, ...rest]) => [typeof p === 'string' ? pointFn(p) : p, ...rest, ...(rest.length < 2 ? [null] : []), 1, p]) }));
