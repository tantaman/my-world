// The van: a white late-seventies American panel van (the Econoline and
// G-series shape): long flat sides that bend in at a waist crease, rounded
// roof edges, a windscreen raked back over a short sloping hood and a blunt
// nose, two plain rear doors, a chrome bumper at the front and a flat dull
// one at the back, a black grille with square lamps, cream steel wheels.
// Its livery is a three-band swoosh curling round at the back with the
// station's name over it and a radio mast at its tip. It is a working van
// left out in the weather, as the original's is: grey-cream rather than
// white, dirt run down from the roof's edge, the window corners, the hinges
// and the handles, every seam dark, road film low down and rust along the
// sills and round the arches (PLAN.md 5.10).
//
// The skin is one loft (props/loft.js) painted through an atlas
// (props/atlas.js): windows, seams, handles' recesses, livery, dirt and rust
// are paint and relief on it, in metres; bumpers, lamps, grille, mirrors,
// handles, hinges, rails and wheels are parts on it. It never moves, so it
// is merged into one mesh per material.
import { Group, BoxGeometry, CylinderGeometry, Color, MeshStandardNodeMaterial } from 'three/webgpu';
import { texture, uv } from 'three/tsl';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { VAN } from '../set/layout.js';
import { WORDS } from '../words.js';
import { canvasTexture } from '../set/signs.js';
import { curve, loftBody, stations, archBottom, sideZ } from './loft.js';
import { createAtlas, letter, measure, surf, fbm, noise, smooth, clamp01 } from './atlas.js';
import { bodyMaterial, chrome, plastic, lens, wheel, sweep, roundedRect, mergeByMaterial, groundShadow, part } from './vehicle.js';

// Along the van everything is a fraction of its length, so it keeps the
// original's proportions at whatever size the survey gives (set/layout.js):
// the axles where the survey's own marks put them (tools/marks.mjs, in
// half-lengths from the middle); the doors, windscreen and livery as
// measured on the original's frames at 17 s and 36 s, as fractions of the
// way from the rear face to the front bumper (along()). Across, fractions
// of its width; heights in metres.
// The survey marked the rear's top corners (tools/marks.mjs: van(±1) at
// 2.06 m), which on a rounded roof stand in from the sides: the body at the
// waist is this much wider each side than VAN.wid says.
const ROOF_INSET = 0.03;             // m
const HL = VAN.len / 2;              // half the length, bumpers in
const HW = VAN.wid / 2 + ROOF_INSET; // half the width at the waist
const SZ = VAN.wid / 2.0;            // the nose's parts were drawn for a van 2 m wide
const REAR = -HL + 0.04;             // the rear face; the bumper stands past it
const FRONT = HL - 0.13;             // the nose; the bumper stands past it
const along = (f) => REAR + f * (HL - REAR);
const AXLE = { rear: -0.546 * HL, front: 0.66 * HL };
const ROOF = VAN.h - 0.04;
const SILL = 0.4;                    // the side's bottom edge
const WAIST = 1.17;                  // the crease along the side and across the back
const TYRE = { r: 0.31, w: 0.215, rim: 0.2 };
const ARCH = 0.39;                   // wheel arch radius
const SCREEN = { top: [along(0.685), ROOF - 0.03], base: [AXLE.front + 0.1, 1.28] };  // windscreen, [x, y] at roof and cowl
const B_PILLAR = along(0.59);        // the front door's back edge
const CARGO_DOOR = along(0.32);      // the side door's back edge (+Z side), just ahead of the rear arch
const DOOR_TOP = ROOF - 0.12;        // the side doors' top edge
const END_R = 0.1;                   // how far round the rear face's edges are rounded, m
// The rear doors, on the flat of the rear face: outer edges (z), top and foot (y).
const BACK = { edge: HW - END_R - 0.015, top: ROOF - END_R - 0.03, foot: 0.52 };
const HINGES = [1.66, 1.25, 0.64];   // heights of the rear doors' hinges, m
const HANDLE_Y = WAIST + 0.03;       // the rear doors' handles
const BUMPER_Y = 0.43;               // the rear bumper's middle: its top meets the doors' foot

// The livery, measured on the original at 36 s: from the C's back edge
// (x0) to the bottom band's tip (x1), its foot at y0; the name's place
// along it (fractions of its length), its capitals' height and its
// baseline over the foot (m); the mast's place along it.
const LIVERY = {
  x0: along(0.08), x1: B_PILLAR - 0.05, y0: 1.3,
  name: { from: 0.112, to: 0.768, cap: 0.186, base: 0.222 },
  mast: 0.868,
};
// Each band lies between two edges, each the height of its top arm and of
// its run over the livery's foot and how far in from the C's back it
// turns (m). The bands are thinner over the top than along the run, as
// the original's are; cream shows between them.
const BANDS = [
  { colour: ['#b03f1c', '#7c2314'], out: { top: 0.418, bot: 0, left: 0 }, in: { top: 0.379, bot: 0.058, left: 0.058 } },
  { colour: ['#c84a1f', '#bb3b1a'], out: { top: 0.369, bot: 0.069, left: 0.07 }, in: { top: 0.341, bot: 0.128, left: 0.118 } },
  { colour: ['#e3952f', '#d9822a'], out: { top: 0.331, bot: 0.137, left: 0.13 }, in: { top: 0.293, bot: 0.183, left: 0.182 } },
];
const LETTERING = '"Avenir Next Condensed", "Arial Narrow", "Roboto Condensed", "Helvetica Neue", Arial, sans-serif';
const INK = '#1b130d';               // the name and the mast: brown-black

const PAINT = '#d3cbac';             // a white gone grey-cream
const PAINT_SURF = surf(0.5, 0.3, 0.8);
const GLASS = '#0a0c0e';
const GLASS_SURF = surf(0.5, 0.05, 1);
// Grime, as 0..1 sRGB: the road's film, what has run down and the rust.
const FILM = [0.33, 0.3, 0.25];
const RUN = [0.16, 0.14, 0.11];

const arches = [AXLE.rear, AXLE.front].map((xc) => ({ xc, r: ARCH, yc: TYRE.r, bot: SILL }));
const bot = (() => {
  const base = curve([[REAR, 0.44], [REAR + 0.25, SILL], [FRONT - 0.4, SILL], [FRONT, 0.5]], 0.05);
  const arch = archBottom(0, arches);
  return (x) => Math.max(base(x), arch(x));
})();
const top = curve([[REAR, ROOF], [SCREEN.top[0] - 0.08, ROOF], SCREEN.top, SCREEN.base, [FRONT - 0.11, 1.05], [FRONT, 1.0]], 0.04);
const rt = curve([[REAR, 0.18], [SCREEN.top[0] - 0.17, 0.17], [SCREEN.base[0] - 0.2, 0.12], [FRONT - 0.3, 0.12], [FRONT, 0.13]], 0.12);
const hw = curve([[REAR, HW], [FRONT - 0.4, HW], [FRONT, HW - 0.04]], 0.2);
const section = (x) => ({ bot: bot(x), top: top(x), hw: hw(x), waist: WAIST, tuck: 0.03, lean: 0.055, rb: 0.05, rw: 0.12, rt: rt(x), shoulder: 0 });

// Where the windscreen's line is at height y (its inside edge, inset by d).
const screenX = (y, d = 0) => SCREEN.top[0] + ((SCREEN.top[1] - y) / (SCREEN.top[1] - SCREEN.base[1])) * (SCREEN.base[0] - SCREEN.top[0]) - d;

// The atlas: each region a little larger than the van. The rear, seen
// close from 33 s to 40 s, gets the most pixels a metre; the far side the
// fewest.
const SPAN = HL + 0.1;
const ACROSS = HW + 0.1;
const ATLAS = {
  side: { px: [0, 0, 2048, 640], a: [-SPAN, SPAN], b: [2.14, 0] },
  sideL: { px: [0, 652, 2048, 500], a: [SPAN, -SPAN], b: [2.14, 0] },
  top: { px: [0, 1164, 1290, 560], a: [-SPAN, SPAN], b: [-ACROSS, ACROSS] },
  rear: { px: [1302, 1164, 746, 884], a: [-ACROSS, ACROSS], b: [2.14, 0] },
  front: { px: [0, 1736, 640, 312], a: [ACROSS, -ACROSS], b: [1.3, 0.2] },
  floor: { px: [652, 1736, 638, 312], a: [-SPAN, SPAN], b: [-ACROSS, ACROSS] },
};

export function createVan() {
  const at = createAtlas(2048, 2048, ATLAS);
  paintVan(at);
  const tex = at.textures();
  const body = bodyMaterial(tex);

  const g = new Group();
  const skin = part(loftBody({
    section,
    stations: stations(REAR, FRONT, 0.05, arches),
    rear: { x: REAR, r: END_R },
    front: { x: FRONT, r: 0.1 },
    uv: {
      side: (x, y) => at.uv('side', x, y),
      sideL: (x, y) => at.uv('sideL', x, y),
      top: (x, z) => at.uv('top', x, z),
      floor: (x, z) => at.uv('floor', x, z),
      rear: (z, y) => at.uv('rear', z, y),
      front: (z, y) => at.uv('front', z, y),
    },
  }), body);
  g.add(skin);
  addParts(g);
  mergeByMaterial(g);
  const wheelsAt = [];
  for (const x of [AXLE.rear, AXLE.front]) for (const s of [-1, 1]) wheelsAt.push([x, s * (HW - 0.04 - TYRE.w / 2), TYRE.r]);
  g.add(groundShadow(FRONT - REAR, 2 * HW, wheelsAt));
  g.position.set(VAN.x, 0, VAN.z);
  g.rotation.y = VAN.heading;
  return { object: g, update() {} };
}

// ---------------------------------------------------------------- the parts

// A bumper's path across an end of the van at x0, height y: straight across,
// then bending back `back` metres round each corner from |z| = bend to its
// ends at |z| = half. dir is the way out (+1 the nose).
function bumperPath(x0, dir, y, half, bend, back) {
  const path = [];
  for (let k = 0; k <= 32; k++) {
    const z = -half + (2 * half * k) / 32;
    const w = Math.max(0, Math.abs(z) - bend) / (half - bend);
    path.push([x0 - dir * back * w * w, y, z]);
  }
  return path;
}

function addParts(g) {
  const shine = chrome();
  // The rear bumper: plated once, gone dull and grey with dirt.
  const dull = chrome({ high: '#b4afa3', low: '#4f4c46', rough: 0.42, grime: 0.6 });
  const black = plastic('#131415', 0.5);
  const dark = plastic('#0b0b0b', 0.85);   // what is under it
  const hinge = plastic('#8f8b81', 0.6);
  const red = lens('#8a1008', { rough: 0.25 });
  const clear = lens('#c9c5b8', { rough: 0.1 });
  const amber = lens('#a0560c', { rough: 0.1 });

  // Front bumper: a deep chrome C-section, wrapping round the corners.
  const cSection = [[0.0, -0.1], [0.05, -0.095], [0.068, -0.06], [0.072, 0.0], [0.068, 0.06], [0.055, 0.09], [0.02, 0.1], [-0.03, 0.1], [-0.03, -0.1]];
  g.add(part(sweep(cSection, bumperPath(FRONT + 0.04, 1, 0.45, HW + 0.02, HW - 0.14, 0.16), () => [1, 0, 0]), shine));
  // Rear bumper: a flat squared strip, its face 0.2 m deep, standing out
  // from the rear face so its top shows, its ends turned just round the
  // corners and closed.
  const strip = [[-0.05, -0.115], [0.058, -0.115], [0.07, -0.1], [0.072, -0.03], [0.072, 0.03], [0.07, 0.1], [0.058, 0.115], [-0.05, 0.115]];
  const rearFace = -HL - 0.03;   // where its face stands
  g.add(part(sweep(strip, bumperPath(rearFace + 0.072, -1, BUMPER_Y, HW + 0.05, HW - 0.09, 0.12), () => [-1, 0, 0], { caps: true }), dull));
  // The plate on it: dark, light characters, in a dark surround.
  const plateTex = canvasTexture(256, 96, (ctx, w, h) => {
    ctx.fillStyle = '#1d1e20'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#5f5c55'; ctx.lineWidth = 5; ctx.strokeRect(6, 6, w - 12, h - 12);
    ctx.fillStyle = '#9d988a'; ctx.font = '700 54px "Arial Narrow", Arial, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('TNG 418', w / 2, h * 0.55);
  });
  const plateMat = new MeshStandardNodeMaterial({ roughness: 0.55 });
  plateMat.colorNode = texture(plateTex, uv()).rgb.mul(0.85);
  g.add(part(new BoxGeometry(0.008, 0.115, 0.31), plateMat, rearFace - 0.004, BUMPER_Y - 0.01, 0));
  g.add(part(new BoxGeometry(0.006, 0.14, 0.36), dark, rearFace - 0.001, BUMPER_Y - 0.01, 0));

  // Front: a black grille with a chrome surround, square lamps in chrome bezels, amber lamps under them.
  const gx = FRONT + 0.01;
  g.add(part(new RoundedBoxGeometry(0.08, 0.34, 2 * (HW - 0.14), 2, 0.02), black, gx - 0.03, 0.77, 0));
  for (let k = 0; k < 5; k++) g.add(part(new BoxGeometry(0.02, 0.018, 1.04 * SZ), dark, gx + 0.012, 0.66 + k * 0.05, 0));
  for (const z of [-0.26, 0, 0.26]) g.add(part(new BoxGeometry(0.02, 0.24, 0.018), dark, gx + 0.012, 0.76, z * SZ));
  const surround = roundedRect(1.14 * SZ, 0.3, 0.03, 2).map(([a, b]) => [gx + 0.025, 0.76 + b, a]);
  surround.push(surround[0]);
  g.add(part(sweep([[0.012, 0], [0, 0.012], [-0.012, 0], [0, -0.012]], surround, () => [1, 0, 0]), shine));
  for (const s of [-1, 1]) {
    const z = s * 0.72 * SZ;
    g.add(part(new RoundedBoxGeometry(0.05, 0.21, 0.21, 2, 0.02), shine, gx + 0.01, 0.82, z));
    g.add(part(new BoxGeometry(0.04, 0.16, 0.16), clear, gx + 0.02, 0.82, z));
    g.add(part(new RoundedBoxGeometry(0.05, 0.075, 0.21, 2, 0.015), amber, gx + 0.005, 0.655, z));
  }

  // Rear: tall tail lamps wrapped round the corners, red over a white
  // reversing lamp in a black frame; handles; hinges on the doors' outer edges.
  const lampX = REAR + 0.03;
  for (const s of [-1, 1]) {
    const z = s * (HW - 0.06);
    g.add(part(new RoundedBoxGeometry(0.1, 0.3, 0.14, 2, 0.008), black, lampX, 0.86, z));
    g.add(part(new RoundedBoxGeometry(0.11, 0.175, 0.125, 2, 0.006), red, lampX, 0.915, z - s * 0.004));
    g.add(part(new RoundedBoxGeometry(0.11, 0.08, 0.125, 2, 0.006), clear, lampX, 0.77, z - s * 0.004));
    g.add(part(new RoundedBoxGeometry(0.035, 0.045, 0.15, 2, 0.01), black, REAR - 0.012, HANDLE_Y, s * 0.105));
    for (const y of HINGES) g.add(part(new RoundedBoxGeometry(0.016, 0.05, 0.05, 1, 0.004), hinge, REAR - 0.002, y, s * BACK.edge));
  }

  // Sides: mirrors on stalks, door handles, the rain rail along the roof.
  for (const s of [-1, 1]) {
    const xm = SCREEN.base[0] - 0.2;
    const zSide = sideZ(section(xm), 1.3);
    const arm = part(new BoxGeometry(0.04, 0.03, 0.2), black, xm, 1.32, s * (zSide + 0.08));
    const head = part(new RoundedBoxGeometry(0.06, 0.24, 0.15, 2, 0.02), black, xm - 0.02, 1.44, s * (zSide + 0.2));
    const stay = part(new BoxGeometry(0.025, 0.2, 0.025), black, xm + 0.01, 1.52, s * (zSide + 0.13));
    stay.rotation.x = s * 0.6;
    g.add(arm, head, stay);
    for (const x of handlesOn(s)) {
      const z = sideZ(section(x), 1.1);
      g.add(part(new RoundedBoxGeometry(0.15, 0.04, 0.03, 2, 0.01), black, x, 1.1, s * (z + 0.008)));
    }
    // The rain rail: a small lip along the roof's edge, turning down the windscreen pillar.
    const rail = [];
    for (let x = REAR + 0.12; x <= SCREEN.top[0] + 0.02; x += 0.1) rail.push([x, ROOF - 0.1, s * (sideZ(section(x), ROOF - 0.1) + 0.006)]);
    for (let k = 1; k <= 6; k++) {
      const y = ROOF - 0.1 - k * 0.1;
      const x = screenX(y) - 0.05;
      rail.push([x, y, s * (sideZ(section(x), y) + 0.006)]);
    }
    g.add(part(sweep(roundedRect(0.016, 0.018, 0.006, 1), rail, () => [0, 0, s]), railPaint()));
    // Wheels: the face out.
    for (const x of [AXLE.rear, AXLE.front]) {
      const w = vanWheel();
      w.position.set(x, TYRE.r, s * (HW - 0.04 - TYRE.w / 2));
      if (s < 0) w.rotation.y = Math.PI;
      g.add(w);
    }
  }
  // Wipers, parked at the foot of the windscreen.
  const xw = SCREEN.base[0] - 0.09;
  for (const z of [-0.27, 0.27]) g.add(part(new BoxGeometry(0.02, 0.014, 0.55 * SZ), black, xw, top(xw) + 0.014, z * SZ));
  // Underneath: the frame, axles, the exhaust.
  g.add(part(new BoxGeometry(FRONT - REAR - 0.7, 0.22, 2 * HW - 0.6), dark, (FRONT + REAR) / 2 - 0.1, 0.34, 0));
  for (const x of [AXLE.rear, AXLE.front]) {
    const axle = part(new CylinderGeometry(0.05, 0.05, 2 * HW - 0.3, 8), dark, x, TYRE.r, 0);
    axle.rotation.x = Math.PI / 2;
    g.add(axle);
  }
  const pipe = part(new CylinderGeometry(0.03, 0.03, 0.7, 8), dark, REAR + 0.25, 0.24, -(HW - 0.32));
  pipe.rotation.z = Math.PI / 2;
  g.add(pipe);
}

// The side doors' handles: the front door's on both sides, the cargo door's on this side only.
const handlesOn = (side) => (side > 0 ? [B_PILLAR + 0.12, B_PILLAR - 0.1] : [B_PILLAR + 0.12]);

let railMat = null;
const railPaint = () => (railMat ??= new MeshStandardNodeMaterial({ color: new Color('#a59e8d'), roughness: 0.6 }));

let wheelFace = null;
function vanWheel() {
  return wheel({
    radius: TYRE.r, width: TYRE.w, rim: TYRE.rim, dish: 0.035,
    draw: (wheelFace ??= drawSteelWheel), rimRough: 0.55, rimMetal: 0,
  });
}

// A cream-painted steel wheel, as the original's: a ring of ten round holes
// in the dish, a raised hub with five nuts round a small chrome cap, a
// darker lip at the rim, brake dust and rust gathered toward it.
function drawSteelWheel(ctx, w) {
  const c = w / 2;
  const k = w / 2 / (TYRE.rim + 0.02);   // px per metre
  const disc = (r, fill) => { ctx.fillStyle = fill; ctx.beginPath(); ctx.arc(c, c, r * k, 0, Math.PI * 2); ctx.fill(); };
  const ring = (r, colour, width) => { ctx.strokeStyle = colour; ctx.lineWidth = width * k; ctx.beginPath(); ctx.arc(c, c, r * k, 0, Math.PI * 2); ctx.stroke(); };
  ctx.fillStyle = '#26231f'; ctx.fillRect(0, 0, w, w);   // past the rim: the tyre's bead
  disc(TYRE.rim + 0.012, '#7d7563');                     // the rim's lip
  disc(TYRE.rim - 0.006, '#c9bfa2');                     // the dish
  ring(TYRE.rim - 0.012, 'rgba(60,52,40,0.55)', 0.007);
  ring(TYRE.rim - 0.035, 'rgba(240,232,210,0.25)', 0.006);
  const HOLES = 10, HOLE_R = 0.118, HOLE = 0.017;
  for (let i = 0; i < HOLES; i++) {
    const a = (i / HOLES) * Math.PI * 2 + 0.2;
    const x = c + Math.cos(a) * HOLE_R * k, y = c + Math.sin(a) * HOLE_R * k;
    ctx.fillStyle = '#120f0c'; ctx.beginPath(); ctx.arc(x, y, HOLE * k, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(232,224,200,0.45)'; ctx.lineWidth = 0.004 * k;
    ctx.beginPath(); ctx.arc(x, y, (HOLE + 0.002) * k, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
    ctx.strokeStyle = 'rgba(30,24,18,0.5)';
    ctx.beginPath(); ctx.arc(x, y, (HOLE + 0.003) * k, 1.15 * Math.PI, 1.85 * Math.PI); ctx.stroke();
  }
  // The hub, raised: a shadow round it, five nuts, the cap.
  ring(0.078, 'rgba(70,62,50,0.35)', 0.005);
  disc(0.075, '#cfc6aa');
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.3;
    ctx.fillStyle = '#3e3a34';
    ctx.beginPath(); ctx.arc(c + Math.cos(a) * 0.053 * k, c + Math.sin(a) * 0.053 * k, 0.01 * k, 0, Math.PI * 2); ctx.fill();
  }
  const cap = ctx.createRadialGradient(c - 0.006 * k, c - 0.008 * k, 0, c, c, 0.028 * k);
  cap.addColorStop(0, '#f3efe4'); cap.addColorStop(0.6, '#b4ae9f'); cap.addColorStop(1, '#5e5a50');
  ctx.fillStyle = cap; ctx.beginPath(); ctx.arc(c, c, 0.028 * k, 0, Math.PI * 2); ctx.fill();
  // Brake dust and road dirt toward the rim, in blotches.
  const g = ctx.createRadialGradient(c, c, 0.06 * k, c, c, (TYRE.rim + 0.01) * k);
  g.addColorStop(0, 'rgba(72,58,42,0)'); g.addColorStop(0.7, 'rgba(72,58,42,0.25)'); g.addColorStop(1, 'rgba(60,46,32,0.7)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(c, c, (TYRE.rim + 0.012) * k, 0, Math.PI * 2); ctx.fill();
  for (let i = 0; i < 260; i++) {
    const a = i * 2.39996, r = (0.05 + 0.15 * Math.sqrt((i * 0.618034) % 1)) * k;
    const v = noise(i * 0.37, 1.3);
    if (v < 0.05) continue;
    ctx.fillStyle = `rgba(${v > 0.45 ? '92,50,24' : '60,48,36'},${0.15 + 0.35 * v})`;
    ctx.beginPath(); ctx.arc(c + Math.cos(a) * r, c + Math.sin(a) * r, (0.0015 + 0.004 * v) * k, 0, Math.PI * 2); ctx.fill();
  }
}

// ---------------------------------------------------------------- the paint

function paintVan(at) {
  for (const name of Object.keys(ATLAS)) {
    at.paint(name, (c, s) => {
      c.fillStyle = name === 'floor' ? '#1d1a17' : PAINT;
      s.fillStyle = name === 'floor' ? surf(0.5, 0.9, 0) : PAINT_SURF;
      c.fillRect(-9, -9, 18, 18);
      s.fillRect(-9, -9, 18, 18);
    });
  }
  for (const side of [1, -1]) paintSide(at, side);
  paintTop(at);
  paintRear(at);
  paintFront(at);
}

const line = (ctx, pts, width, style) => {
  ctx.beginPath();
  ctx.moveTo(...pts[0]);
  for (const p of pts.slice(1)) ctx.lineTo(...p);
  ctx.lineWidth = width;
  ctx.strokeStyle = style;
  ctx.lineJoin = 'round';
  ctx.stroke();
};

// A seam: a dark gap, the grime gathered either side of it, a faint
// highlight on its lip, and a groove in the relief.
function seam(c, s, pts, { width = 0.011, halo = 0.045, light = [0.007, 0.004] } = {}) {
  for (const f of [1, 0.6, 0.3]) line(c, pts, halo * f, 'rgba(52,44,34,0.1)');
  line(c, pts, width, 'rgba(14,12,10,0.96)');
  line(s, pts, width * 1.6, surf(0.22, 0.65, 0.2));
  const lit = pts.map(([a, b]) => [a + light[0], b + light[1]]);
  line(c, lit, width * 0.5, 'rgba(255,250,236,0.22)');
}

// A window: dark glass in a black rubber gasket, a hint of a seat behind it.
function window(c, s, path, seat = null) {
  const trace = (ctx) => { ctx.beginPath(); ctx.moveTo(...path[0]); for (const p of path.slice(1)) ctx.lineTo(...p); ctx.closePath(); };
  trace(c); c.fillStyle = GLASS; c.fill();
  trace(s); s.fillStyle = GLASS_SURF; s.fill();
  if (seat) {
    c.save();
    trace(c); c.clip();
    c.fillStyle = '#18181b';
    c.beginPath(); c.ellipse(seat[0], seat[1], 0.11, 0.13, 0, 0, Math.PI * 2); c.fill();
    c.fillRect(seat[0] - 0.14, seat[1] - 0.55, 0.28, 0.42);
    c.restore();
  }
  trace(c); c.lineWidth = 0.035; c.strokeStyle = '#101010'; c.lineJoin = 'round'; c.stroke();
  trace(s); s.lineWidth = 0.035; s.strokeStyle = surf(0.38, 0.55, 0.2); s.lineJoin = 'round'; s.stroke();
}

// Dirt that has run down a panel from a ledge at height `top`: thin dark
// streaks, each column its own length (up to `len` m) and wavering a
// little. 0..1.
function runs(x, y, top, len, seed) {
  const below = top - y;
  if (below < 0 || below > len) return 0;
  const w = x + 0.006 * noise(y * 9 + seed, x * 4);
  const col = 0.6 * noise(w * 48 + seed * 7.3, 0.37 + seed) + 0.4 * noise(w * 130, 1.71 + seed);
  const reach = len * (0.2 + 0.8 * clamp01(0.5 + 0.9 * noise(x * 7 + seed, 4.13)));
  return smooth(0.3, 0.75, col) * smooth(reach, reach * 0.2, below) * (0.55 + 0.45 * clamp01(0.5 + noise(x * 3 + seed, y * 5)));
}

// Grit along a ledge at height y0: dark specks within `band` metres of it. 0..1.
const grit = (x, y, y0, band, seed) => smooth(0.25, 0.65, fbm(x * 26 + seed, y * 26, 3)) * smooth(band, 0, Math.abs(y - y0));

// Film (the road's, an even grey-brown wash) and runs (darker) as one
// colour over the paint, and the surface that goes with them: rougher, its
// clearcoat dulled.
function grime(px, film, run) {
  const f = clamp01(film), r = clamp01(run);
  const a = 1 - (1 - f) * (1 - r);
  if (a < 0.004) return;
  const wr = r / a, wf = 1 - wr;
  px.c = [FILM[0] * wf + RUN[0] * wr, FILM[1] * wf + RUN[1] * wr, FILM[2] * wf + RUN[2] * wr, a];
  px.s = [0.5, 0.3 + 0.5 * a, 0.8 * (1 - a), a];
}

// Rust, v 0..1, its colour from dark crust to brown-orange by t: mostly
// crust, as the original's is.
function rust(px, v, t, x, y) {
  const k = t * t;
  px.c = [0.1 + 0.3 * k, 0.075 + 0.13 * k, 0.055 + 0.04 * k, v];
  px.s = [0.5 + 0.1 * noise(x * 90, y * 90), 0.9, 0, v];
}

function paintSide(at, side) {
  const name = side > 0 ? 'side' : 'sideL';
  // Draw in the van's own x (the -Z side's region runs the other way).
  const own = (draw) => at.paint(name, (c, s) => {
    if (side < 0) { c.scale(-1, 1); s.scale(-1, 1); }
    draw(c, s);
  });
  // The livery first, so the dirt goes over it.
  own((c) => livery(c, side < 0));
  const flip = side > 0 ? [-SPAN, SPAN] : [SPAN, -SPAN];

  // The road's film low down and thrown up behind the wheels, a thin
  // mottled wash everywhere, smudges; runs from the rain rail and from the
  // window's bottom corners; grit along the rail.
  const windowFoot = [B_PILLAR + 0.07, screenX(WAIST + 0.14, 0.11)];
  at.pixels(name, side > 0 ? 170 : 90, (a, y, px) => {
    const x = side * a;
    const n = fbm(x * 2.2 + side * 5, y * 2.2, 4);
    let film = 0.08 + 0.06 * n + smooth(1.0, 0.42, y + 0.15 * n) * 0.5;
    for (const xc of [AXLE.rear, AXLE.front]) {
      const d = Math.hypot((x - xc + 0.12) * 0.8, y - TYRE.r);
      film += smooth(ARCH + 0.4, ARCH, d) * 0.3 * (0.6 + 0.5 * fbm(x * 7, y * 7, 3));
    }
    film += smooth(0.2, 0.55, fbm(x * 1.4 + 3.1, y * 2.1 - 1.7, 3)) * 0.13;
    let run = runs(x, y, ROOF - 0.1, 0.6, side) * 0.45;
    for (const xc of windowFoot) run = Math.max(run, runs(x, y, WAIST + 0.12, 0.45, side + 3) * 0.7 * smooth(0.08, 0.02, Math.abs(x - xc)));
    run = Math.max(run, grit(x, y, ROOF - 0.12, 0.07, side));
    grime(px, film, run);
  });
  // Rust: along the sill, round the arches, at the foot of the door seams.
  at.pixels(name, 260, (a, y, px) => {
    const x = side * a;
    let r = smooth(SILL + 0.16, SILL + 0.01, y + 0.07 * fbm(x * 5, y * 5, 3)) * (0.65 + 0.6 * fbm(x * 1.7 + 9, 0.5, 2));
    for (const xc of [AXLE.rear, AXLE.front]) {
      const d = Math.hypot(x - xc, y - TYRE.r) - ARCH;
      if (d > -0.01) r = Math.max(r, smooth(0.13, 0.0, d) * (0.65 + 0.7 * fbm(x * 7 + 4, y * 7, 3)));
    }
    for (const xs of [B_PILLAR, CARGO_DOOR]) r = Math.max(r, smooth(0.05, 0, Math.abs(x - xs)) * smooth(0.85, 0.45, y) * 0.8);
    // Broken up into flecks and blotches where paint has chipped.
    const breakup = 0.6 * fbm(x * 9, y * 9, 3) + 0.6 * fbm(x * 30 + 2, y * 30, 3);
    const v = clamp01((r * (0.65 + 1.2 * breakup) - 0.3) * 3);
    if (v <= 0.01) return;
    rust(px, v, clamp01(0.45 + 0.8 * noise(x * 31, y * 31)), x, y);
  }, [flip[0], flip[1], 1.0, 0.2]);

  own((c, s) => {
    // The front door and its window.
    const doorTop = DOOR_TOP;
    const door = [
      [B_PILLAR, SILL + 0.02], [B_PILLAR, doorTop], [screenX(doorTop, -0.04), doorTop],
      [screenX(1.26, -0.06), 1.26],
    ];
    const front = [];
    const xa = screenX(1.26, -0.06), xb = AXLE.front - 0.27;
    for (let k = 0; k <= 8; k++) {
      const u = k / 8;
      front.push([xa + (xb - xa) * (0.95 * u * u + 0.05 * u), 1.26 - 0.52 * u]);
    }
    seam(c, s, [...door, ...front.slice(1), [AXLE.front - ARCH - 0.13, SILL + 0.06], [B_PILLAR + 0.04, SILL + 0.02]]);
    const wTop = ROOF - 0.2;
    window(c, s, [[B_PILLAR + 0.07, WAIST + 0.12], [B_PILLAR + 0.07, wTop], [screenX(wTop, 0.11), wTop], [screenX(WAIST + 0.14, 0.11), WAIST + 0.14]], [B_PILLAR + 0.32, 1.62]);
    // The hood's edge on the fender, and the fender's seam down to the bumper.
    seam(c, s, [[screenX(1.22, -0.05), 1.22], [FRONT - 0.37, 1.08], [FRONT, 1.0]]);
    // The cargo door (this side only), or a fuel filler door.
    if (side > 0) {
      seam(c, s, [[CARGO_DOOR, SILL + 0.02], [CARGO_DOOR + 0.008, 1.1], [CARGO_DOOR - 0.004, 1.5], [CARGO_DOOR, doorTop]]);
      seam(c, s, [[CARGO_DOOR, doorTop], [B_PILLAR, doorTop]]);
    } else {
      const fx = AXLE.rear - ARCH - 0.25;
      c.fillStyle = 'rgba(60,55,48,0.5)'; c.fillRect(fx, 0.86, 0.17, 0.17);
      seam(c, s, [[fx, 0.86], [fx + 0.17, 0.86], [fx + 0.17, 1.03], [fx, 1.03], [fx, 0.86]], { width: 0.005, halo: 0.02 });
    }
    // The waist crease: a highlight over a shadow, and a ridge in the relief.
    line(c, [[REAR, WAIST + 0.012], [FRONT - 0.3, WAIST + 0.012]], 0.012, 'rgba(255,250,238,0.28)');
    line(c, [[REAR, WAIST - 0.01], [FRONT - 0.3, WAIST - 0.01]], 0.016, 'rgba(60,52,42,0.4)');
    line(s, [[REAR, WAIST], [FRONT - 0.3, WAIST]], 0.02, surf(0.64, 0.3, 0.8));
    // A crease along the sill between the arches, and a lip round each arch.
    const xs0 = AXLE.rear + ARCH + 0.02, xs1 = AXLE.front - ARCH - 0.02;
    line(c, [[xs0, SILL + 0.105], [xs1, SILL + 0.105]], 0.01, 'rgba(255,250,238,0.22)');
    line(c, [[xs0, SILL + 0.09], [xs1, SILL + 0.09]], 0.012, 'rgba(50,44,36,0.4)');
    line(s, [[xs0, SILL + 0.1], [xs1, SILL + 0.1]], 0.016, surf(0.62, 0.35, 0.7));
    for (const xc of [AXLE.rear, AXLE.front]) {
      const a0 = Math.asin((SILL - TYRE.r) / ARCH);
      for (const [ctx, r, w, style] of [[c, ARCH + 0.02, 0.01, 'rgba(255,250,238,0.2)'], [c, ARCH + 0.004, 0.008, 'rgba(30,26,22,0.6)'], [s, ARCH + 0.016, 0.02, surf(0.66, 0.4, 0.6)]]) {
        ctx.beginPath(); ctx.arc(xc, TYRE.r, r, a0, Math.PI - a0); ctx.lineWidth = w; ctx.strokeStyle = style; ctx.stroke();
      }
    }
    // Recesses behind the handles, grimy.
    for (const x of handlesOn(side)) {
      c.fillStyle = 'rgba(28,24,20,0.55)';
      c.beginPath(); c.ellipse(x, 1.09, 0.09, 0.035, 0, 0, Math.PI * 2); c.fill();
    }
  });
}

// The livery, in the van's metres on its side: three bands curling round a
// C at the back, the name over them, a mast on a hill at their tip with
// waves from it. On the far side (flip) the bands are mirrored and the
// lettering still reads left to right.
function livery(c, flip) {
  const { x0, x1, y0 } = LIVERY;
  const L = x1 - x0;
  const armEnd = x0 + LIVERY.name.from * L + 0.012;
  const mx = x0 + LIVERY.mast * L;
  // An edge of a band: from the arm's end along the top, round the C, along the run.
  const edge = (e) => {
    const t = y0 + e.top, b = y0 + e.bot;
    const ry = (t - b) / 2, rx = ry * 0.85, my = (t + b) / 2, cx = x0 + e.left + rx;
    const pts = [[armEnd, t]];
    for (let k = 0; k <= 24; k++) {
      const a = Math.PI / 2 + (k / 24) * Math.PI;
      pts.push([cx + rx * Math.cos(a), my + ry * Math.sin(a)]);
    }
    pts.push([x1 + 0.4, b]);
    return pts;
  };
  // The runs' tips are cut on a slant, the top band shortest.
  c.save();
  c.beginPath();
  c.moveTo(x0 - 0.1, y0 + 0.6); c.lineTo(x1 - 0.42, y0 + 0.6); c.lineTo(x1 - 0.3, y0 + 0.183); c.lineTo(x1 + 0.03, y0 - 0.01);
  c.lineTo(x0 - 0.1, y0 - 0.01); c.closePath();
  c.clip();
  for (const band of BANDS) {
    const outer = edge(band.out), inner = edge(band.in).reverse();
    c.beginPath();
    c.moveTo(...outer[0]);
    for (const p of [...outer.slice(1), ...inner]) c.lineTo(...p);
    c.closePath();
    const grad = c.createLinearGradient(0, y0 + band.out.top, 0, y0 + band.out.bot);
    grad.addColorStop(0, band.colour[0]); grad.addColorStop(1, band.colour[1]);
    c.fillStyle = grad;
    c.fill();
  }
  c.restore();
  // The hill the mast stands on, dark over the bands' tips.
  c.fillStyle = '#2c1810';
  c.beginPath();
  c.moveTo(mx - 0.2, y0 + 0.005);
  c.bezierCurveTo(mx - 0.1, y0 + 0.02, mx - 0.06, y0 + 0.075, mx, y0 + 0.078);
  c.bezierCurveTo(mx + 0.07, y0 + 0.075, mx + 0.12, y0 + 0.03, mx + 0.24, y0 + 0.005);
  c.closePath();
  c.fill();
  // The mast: a lattice of thin lines narrowing upward.
  const base = y0 + 0.07, tip = y0 + 0.4, half = 0.045;
  c.strokeStyle = INK;
  c.lineWidth = 0.008;
  c.beginPath();
  c.moveTo(mx - half, base); c.lineTo(mx, tip); c.lineTo(mx + half, base);
  for (let k = 0; k < 7; k++) {
    const f0 = k / 7, f1 = (k + 1) / 7;
    const ya = base + (tip - base) * f0, yb = base + (tip - base) * f1;
    const wa = half * (1 - f0), wb = half * (1 - f1);
    c.moveTo(mx - wa, ya); c.lineTo(mx + wb, yb);
    c.moveTo(mx + wa, ya); c.lineTo(mx - wb, yb);
  }
  c.stroke();
  // Waves from its tip, both ways, faded.
  c.strokeStyle = 'rgba(122,52,30,0.7)';
  c.lineWidth = 0.005;
  for (let k = 0; k < 4; k++) {
    for (const a0 of [0, Math.PI]) {
      c.beginPath();
      c.arc(mx, tip, 0.03 + 0.024 * k, a0 - 0.85, a0 + 0.85);
      c.stroke();
    }
  }
  // Sparkles either side.
  const star = (x, y, r) => {
    c.fillStyle = INK;
    c.beginPath();
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      const rr = k % 2 ? r * 0.22 : r;
      c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    c.fill();
  };
  star(mx - 0.11, y0 + 0.25, 0.024);
  star(mx + 0.13, y0 + 0.26, 0.024);
  // The name: condensed, italic, outlined in cream, fitted to its length.
  // On the far side it ends at the C's mouth rather than starting there.
  const { width, cap } = measure(c, WORDS.van, LETTERING, { weight: '700', italic: true });
  const size = LIVERY.name.cap / cap;
  const len = (LIVERY.name.to - LIVERY.name.from) * L;
  const style = { font: LETTERING, weight: '700', italic: true, colour: INK, stretch: len / (width * size), outline: { colour: '#e4dece', width: 0.006 } };
  letter(c, WORDS.van, x0 + LIVERY.name.from * L, y0 + LIVERY.name.base, size, { ...style, align: flip ? 'right' : 'left' });
  // The frequency, small and pale on the middle band, before the mast.
  const fm = measure(c, '104.7 FM', LETTERING, { weight: '700', italic: true });
  const fmSize = 0.034 / fm.cap;
  letter(c, '104.7 FM', mx - 0.08, y0 + 0.083, fmSize, { font: LETTERING, weight: '700', italic: true, colour: '#efc6a4', stretch: 0.85, align: flip ? 'left' : 'right' });
  // Wear: the paint chipped back to cream along the bottom band.
  for (let k = 0; k < 140; k++) {
    const u = (k * 0.618034) % 1, v = (k * 0.7548777) % 1;
    const x = x0 + 0.12 + u * (L - 0.3);
    if (noise(x * 4, 0.5) < -0.1) continue;
    c.fillStyle = `rgba(214,205,186,${0.25 + 0.45 * v})`;
    c.fillRect(x, y0 + 0.003 + v * v * 0.045, 0.003 + 0.012 * ((k * 0.381966) % 1), 0.0015 + 0.003 * v);
  }
}

function paintTop(at) {
  at.paint('top', (c, s) => {
    // The windscreen, between the pillars.
    const half = (x) => hw(x) - 0.055 - rt(x) - 0.045;
    const x0 = SCREEN.top[0] + 0.09, x1 = SCREEN.base[0] - 0.06;
    const pts = [];
    for (let k = 0; k <= 10; k++) { const x = x0 + ((x1 - x0) * k) / 10; pts.push([x, -half(x)]); }
    for (let k = 10; k >= 0; k--) { const x = x0 + ((x1 - x0) * k) / 10; pts.push([x, half(x)]); }
    window(c, s, pts);
    // The cowl's vent and the hood's seams.
    c.fillStyle = '#1b1a18';
    c.fillRect(SCREEN.base[0], -0.75 * SZ, 0.05, 1.5 * SZ);
    const zh = HW - 0.14;
    seam(c, s, [[SCREEN.base[0] + 0.07, -zh], [SCREEN.base[0] + 0.07, zh]]);
    for (const z of [-zh, zh]) seam(c, s, [[SCREEN.base[0] + 0.07, z], [FRONT, z * 0.97]]);
  });
  // Grime gathers along the roof's edges, in the rails and over the hood.
  at.pixels('top', 70, (x, z, px) => {
    const n = fbm(x * 2.5, z * 2.5, 4);
    const edge = smooth(HW - 0.45, HW - 0.05, Math.abs(z)) * 0.35;
    const hood = x > SCREEN.base[0] ? 0.15 : 0;
    const glass = x < SCREEN.top[0] || x > SCREEN.base[0] ? 1 : 0.4;
    const film = (edge + hood + 0.12 * n + 0.1) * glass;
    const run = grit(x, Math.abs(z), HW - 0.08, 0.06, 7) * 0.8 * glass;
    grime(px, film, run);
  });
}

function paintRear(at) {
  const { edge, top: y1, foot: y0 } = BACK;
  at.paint('rear', (c, s) => {
    // The doors' raised upper panels.
    for (const sgn of [-1, 1]) {
      const za = sgn * 0.035, zb = sgn * (edge - 0.05);
      const [l, r] = za < zb ? [za, zb] : [zb, za];
      const pb = WAIST + 0.07, pt = y1 - 0.06;
      c.beginPath(); c.roundRect(l, pb, r - l, pt - pb, 0.09);
      c.lineWidth = 0.01; c.strokeStyle = 'rgba(80,72,60,0.4)'; c.stroke();
      s.beginPath(); s.roundRect(l, pb, r - l, pt - pb, 0.09);
      s.fillStyle = surf(0.6, 0.3, 0.8); s.fill();
      s.lineWidth = 0.02; s.strokeStyle = surf(0.55, 0.3, 0.8); s.stroke();
      line(c, [[l + 0.05, pt + 0.004], [r - 0.05, pt + 0.004]], 0.008, 'rgba(255,250,238,0.35)');
      line(c, [[l + 0.05, pb - 0.006], [r - 0.05, pb - 0.006]], 0.01, 'rgba(60,52,42,0.3)');
    }
    // The crease across at the waist, and one low over the bumper.
    for (const [y, k] of [[WAIST, 1], [0.64, 0.7]]) {
      line(c, [[-ACROSS, y + 0.012], [ACROSS, y + 0.012]], 0.012, `rgba(255,250,238,${0.3 * k})`);
      line(c, [[-ACROSS, y - 0.01], [ACROSS, y - 0.01]], 0.014, `rgba(60,52,42,${0.38 * k})`);
      line(s, [[-ACROSS, y], [ACROSS, y]], 0.02, surf(0.64, 0.3, 0.8));
    }
  });
  // The road's film heavy low down and up the corners; runs from the
  // doors' top edge, from the hinges (rusty) and from the handles; grit
  // along the top seam; dark over the bumper.
  at.pixels('rear', 200, (z, y, px) => {
    const n = fbm(z * 3, y * 3, 4);
    let film = 0.09 + 0.06 * n + smooth(1.15, 0.5, y + 0.15 * n) * 0.55;
    film += smooth(0.2, 0.55, fbm(z * 1.6 + 8, y * 2 + 2, 3)) * 0.14;
    film += smooth(0.66, 0.54, y) * 0.3;
    let run = runs(z, y, y1 + 0.01, 0.7, 11) * 0.45;
    run = Math.max(run, runs(z, y, HANDLE_Y - 0.03, 0.4, 12) * 0.6 * smooth(0.12, 0.04, Math.abs(Math.abs(z) - 0.105)));
    run = Math.max(run, grit(z, y, y1, 0.05, 5));
    for (const yh of HINGES) run = Math.max(run, runs(z, y, yh - 0.03, 0.3, 13 + yh) * smooth(0.06, 0.01, Math.abs(Math.abs(z) - edge)));
    grime(px, film, run);
  });
  // The seams over the dirt: the split, the doors' outer edges and top.
  at.paint('rear', (c, s) => {
    seam(c, s, [[0, y0], [0, y1]], { width: 0.009 });
    for (const z of [-edge, edge]) seam(c, s, [[z, y0], [z, y1]]);
    seam(c, s, [[-edge, y1], [edge, y1]]);
  });
  // Rust: along the doors' foot, at the corners and under the hinges.
  at.pixels('rear', 260, (z, y, px) => {
    let r = smooth(0.58, 0.52, y + 0.06 * fbm(z * 6, y * 6, 3)) * (0.2 + 0.7 * smooth(0.4, 0.85, Math.abs(z) / ACROSS));
    r = Math.max(r, smooth(0.07, 0, Math.abs(z) - (HW - 0.08)) * smooth(0.9, 0.5, y) * 0.8);
    for (const yh of HINGES) r = Math.max(r, smooth(0.05, 0, Math.abs(Math.abs(z) - edge)) * smooth(0.16, 0, yh - 0.03 - y) * smooth(0, 0.01, yh - y) * 0.7);
    const v = clamp01((r * (0.6 + 1.1 * fbm(z * 12, y * 12, 4)) - 0.45) * 2.6);
    if (v <= 0.01) return;
    rust(px, v, clamp01(0.45 + 0.8 * noise(z * 31, y * 31)), z, y);
  }, [-ACROSS, ACROSS, 1.8, 0.4]);
}

function paintFront(at) {
  at.paint('front', (c, s) => {
    // Behind the grille.
    c.fillStyle = '#121212'; c.fillRect(-HW, 0.6, 2 * HW, 0.4);
    s.fillStyle = surf(0.5, 0.6, 0.2); s.fillRect(-HW, 0.6, 2 * HW, 0.4);
  });
  at.pixels('front', 120, (z, y, px) => {
    const n = fbm(z * 3, y * 3, 3);
    grime(px, smooth(0.9, 0.45, y + 0.1 * n) * 0.55 + 0.1, 0);
  });
}
