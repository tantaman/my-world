// The van: a white late-seventies American panel van (the Econoline and
// G-series shape): long flat sides that bend in at a waist crease, rounded
// roof edges, a windscreen raked back over a short sloping hood and a blunt
// nose, two plain rear doors, chrome bumpers, a black grille with square
// lamps, cream steel wheels. Its livery is a three-band swoosh curling round
// at the back with the station's name over it and a radio mast at its tip;
// it is dirty low down and rusting at the sills and arches (PLAN.md 5.10).
//
// The skin is one loft (props/loft.js) painted through an atlas
// (props/atlas.js): windows, seams, handles' recesses, livery, dirt and rust
// are paint and relief on it, in metres; bumpers, lamps, grille, mirrors,
// handles, rails and wheels are parts on it. It never moves, so it is merged
// into one mesh per material.
import { Group, BoxGeometry, CylinderGeometry, Color, MeshStandardNodeMaterial } from 'three/webgpu';
import { texture, uv } from 'three/tsl';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { VAN } from '../set/layout.js';
import { WORDS } from '../words.js';
import { canvasTexture } from '../set/signs.js';
import { curve, loftBody, stations, archBottom, sideZ } from './loft.js';
import { createAtlas, letter, surf, fbm, noise, smooth, clamp01 } from './atlas.js';
import { bodyMaterial, chrome, plastic, lens, wheel, sweep, roundedRect, mergeByMaterial, groundShadow, part } from './vehicle.js';

// Sizes, metres, along the van from its middle (nose +X).
const REAR = -VAN.len / 2 + 0.06;    // the rear face; the bumper stands past it
const FRONT = VAN.len / 2 - 0.13;    // the nose
const HW = VAN.wid / 2;              // half the width at the waist
const ROOF = VAN.h - 0.04;
const SILL = 0.4;                    // the side's bottom edge
const WAIST = 1.12;                  // the crease along the side
const AXLE = { rear: -1.42, front: 1.72 };
const TYRE = { r: 0.31, w: 0.215, rim: 0.18 };
const ARCH = 0.39;                   // wheel arch radius
const SCREEN = { top: [1.27, ROOF - 0.03], base: [1.9, 1.28] };  // windscreen, [x, y] at roof and cowl
const B_PILLAR = 0.64;               // the front door's back edge
const CARGO_DOOR = -0.62;            // the side door's back edge (+Z side)
const LIVERY_STRETCH = 1.1;          // the livery drawn 2.5 m long, stretched to fit the side

const PAINT = '#e7e3d8';
const PAINT_SURF = surf(0.5, 0.3, 0.85);
const GLASS = '#0a0c0e';
const GLASS_SURF = surf(0.5, 0.05, 1);

const arches = [AXLE.rear, AXLE.front].map((xc) => ({ xc, r: ARCH, yc: TYRE.r, bot: SILL }));
const bot = (() => {
  const base = curve([[REAR, 0.47], [REAR + 0.25, SILL], [FRONT - 0.4, SILL], [FRONT, 0.5]], 0.05);
  const arch = archBottom(0, arches);
  return (x) => Math.max(base(x), arch(x));
})();
const top = curve([[REAR, ROOF], [SCREEN.top[0] - 0.08, ROOF], SCREEN.top, SCREEN.base, [2.36, 1.05], [FRONT, 1.0]], 0.04);
const rt = curve([[REAR, 0.18], [1.1, 0.17], [1.7, 0.12], [2.1, 0.12], [FRONT, 0.13]], 0.12);
const hw = curve([[REAR, HW], [2.0, HW], [FRONT, HW - 0.04]], 0.2);
const section = (x) => ({ bot: bot(x), top: top(x), hw: hw(x), waist: WAIST, tuck: 0.03, lean: 0.055, rb: 0.05, rw: 0.12, rt: rt(x), shoulder: 0 });

// Where the windscreen's line is at height y (its inside edge, inset by d).
const screenX = (y, d = 0) => SCREEN.top[0] + ((SCREEN.top[1] - y) / (SCREEN.top[1] - SCREEN.base[1])) * (SCREEN.base[0] - SCREEN.top[0]) - d;

const ATLAS = {
  side: { px: [0, 0, 2048, 640], a: [-2.64, 2.64], b: [2.14, 0] },
  sideL: { px: [0, 648, 2048, 640], a: [2.64, -2.64], b: [2.14, 0] },
  top: { px: [0, 1296, 1360, 480], a: [-2.64, 2.64], b: [-1.06, 1.06] },
  rear: { px: [1368, 1296, 680, 752], a: [-1.06, 1.06], b: [2.14, 0] },
  front: { px: [0, 1784, 680, 264], a: [1.06, -1.06], b: [1.3, 0.2] },
  floor: { px: [688, 1784, 672, 264], a: [-2.64, 2.64], b: [-1.06, 1.06] },
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
    rear: { x: REAR, r: 0.12 },
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

function addParts(g) {
  const shine = chrome();
  const black = plastic('#131415', 0.5);
  const dark = plastic('#0b0b0b', 0.85);   // what is under it
  const red = lens('#9a1208', { rough: 0.25 });
  const clear = lens('#b9b6ad', { rough: 0.08 });
  const amber = lens('#a0560c', { rough: 0.1 });

  // Bumpers: a deep chrome C-section across each end, wrapping round the corners.
  const bumperProfile = [[0.0, -0.1], [0.05, -0.095], [0.068, -0.06], [0.072, 0.0], [0.068, 0.06], [0.055, 0.09], [0.02, 0.1], [-0.03, 0.1], [-0.03, -0.1]];
  const bumperPath = (x0, dir, y) => {
    const path = [];
    for (let k = 0; k <= 24; k++) {
      const z = -1.02 + (2.04 * k) / 24;
      const wrap = Math.max(0, Math.abs(z) - 0.86) / 0.16;
      path.push([x0 - dir * 0.16 * wrap * wrap, y, z]);
    }
    return path;
  };
  for (const [x0, dir, y] of [[FRONT + 0.04, 1, 0.45], [REAR - 0.03, -1, 0.4]]) {
    g.add(part(sweep(bumperProfile, bumperPath(x0, dir, y), (p) => [dir * (1 - Math.max(0, Math.abs(p[2]) - 0.86) * 3), 0, Math.sign(p[2]) * Math.max(0, Math.abs(p[2]) - 0.86) * 3]), shine));
  }
  // The rear bumper's step and plate.
  const plateTex = canvasTexture(256, 128, (ctx, w, h) => {
    ctx.fillStyle = '#d8d2bf'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#3a3a36'; ctx.lineWidth = 6; ctx.strokeRect(5, 5, w - 10, h - 10);
    ctx.fillStyle = '#26303a'; ctx.font = '900 64px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('TNG 418', w / 2, h * 0.56);
  });
  const plateMat = new MeshStandardNodeMaterial({ roughness: 0.5 });
  plateMat.colorNode = texture(plateTex, uv()).rgb.mul(0.8);
  const plate = part(new BoxGeometry(0.008, 0.15, 0.3), plateMat, REAR - 0.105, 0.4, 0);
  g.add(plate);

  // Front: a black grille with a chrome surround, square lamps in chrome bezels, amber lamps under them.
  const gx = FRONT + 0.01;
  g.add(part(new RoundedBoxGeometry(0.08, 0.34, 1.72, 2, 0.02), black, gx - 0.03, 0.77, 0));
  for (let k = 0; k < 5; k++) g.add(part(new BoxGeometry(0.02, 0.018, 1.04), dark, gx + 0.012, 0.66 + k * 0.05, 0));
  for (const z of [-0.26, 0, 0.26]) g.add(part(new BoxGeometry(0.02, 0.24, 0.018), dark, gx + 0.012, 0.76, z));
  const surround = roundedRect(1.14, 0.3, 0.03, 2).map(([a, b]) => [gx + 0.025, 0.76 + b, a]);
  surround.push(surround[0]);
  g.add(part(sweep([[0.012, 0], [0, 0.012], [-0.012, 0], [0, -0.012]], surround, () => [1, 0, 0]), shine));
  for (const s of [-1, 1]) {
    g.add(part(new RoundedBoxGeometry(0.05, 0.21, 0.21, 2, 0.02), shine, gx + 0.01, 0.82, s * 0.72));
    g.add(part(new BoxGeometry(0.04, 0.16, 0.16), clear, gx + 0.02, 0.82, s * 0.72));
    g.add(part(new RoundedBoxGeometry(0.05, 0.075, 0.21, 2, 0.015), amber, gx + 0.005, 0.655, s * 0.72));
  }

  // Rear: tail lamps on the corners (red over a white reversing lamp), handles, hinges.
  for (const s of [-1, 1]) {
    g.add(part(new RoundedBoxGeometry(0.05, 0.24, 0.13, 2, 0.012), red, REAR - 0.012, 0.92, s * 0.925));
    g.add(part(new RoundedBoxGeometry(0.05, 0.1, 0.13, 2, 0.012), clear, REAR - 0.012, 0.75, s * 0.925));
    g.add(part(new RoundedBoxGeometry(0.035, 0.045, 0.15, 2, 0.01), black, REAR - 0.012, 1.14, s * 0.11));
    for (const y of [0.78, 1.68]) g.add(part(new BoxGeometry(0.03, 0.07, 0.05), dark, REAR - 0.01, y, s * 0.88));
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
    const handles = s > 0 ? [B_PILLAR + 0.12, B_PILLAR - 0.1] : [B_PILLAR + 0.12];
    for (const x of handles) {
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
  for (const z of [-0.27, 0.27]) g.add(part(new BoxGeometry(0.02, 0.014, 0.55), black, xw, top(xw) + 0.014, z));
  // Underneath: the frame, axles, the exhaust.
  g.add(part(new BoxGeometry(4.3, 0.22, 1.2), dark, -0.1, 0.34, 0));
  for (const x of [AXLE.rear, AXLE.front]) {
    const axle = part(new CylinderGeometry(0.05, 0.05, 1.7, 8), dark, x, TYRE.r, 0);
    axle.rotation.x = Math.PI / 2;
    g.add(axle);
  }
  const pipe = part(new CylinderGeometry(0.03, 0.03, 0.7, 8), dark, REAR + 0.25, 0.24, -0.55);
  pipe.rotation.z = Math.PI / 2;
  g.add(pipe);
}

let railMat = null;
const railPaint = () => (railMat ??= new MeshStandardNodeMaterial({ color: new Color('#cfcabd'), roughness: 0.45 }));

let wheelFace = null;
function vanWheel() {
  return wheel({
    radius: TYRE.r, width: TYRE.w, rim: TYRE.rim, dish: 0.04,
    draw: (wheelFace ??= drawSteelWheel),
  });
}

// A cream steel wheel: eight round holes in the dish, five nuts, a small
// chrome cap, rust round the rim's lip.
function drawSteelWheel(ctx, w) {
  const c = w / 2;
  const k = w / 2 / (TYRE.rim + 0.02);   // px per metre
  ctx.fillStyle = '#d9d2bb'; ctx.fillRect(0, 0, w, w);
  const ring = (r, colour, width) => { ctx.strokeStyle = colour; ctx.lineWidth = width * k; ctx.beginPath(); ctx.arc(c, c, r * k, 0, Math.PI * 2); ctx.stroke(); };
  ring(TYRE.rim + 0.005, '#6e5a44', 0.022);
  ring(TYRE.rim - 0.02, '#a49c88', 0.008);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    ctx.fillStyle = '#141210';
    ctx.beginPath(); ctx.arc(c + Math.cos(a) * 0.118 * k, c + Math.sin(a) * 0.118 * k, 0.026 * k, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = '#b9b4a8'; ctx.beginPath(); ctx.arc(c, c, 0.07 * k, 0, Math.PI * 2); ctx.fill();
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.3;
    ctx.fillStyle = '#4a4640';
    ctx.beginPath(); ctx.arc(c + Math.cos(a) * 0.055 * k, c + Math.sin(a) * 0.055 * k, 0.009 * k, 0, Math.PI * 2); ctx.fill();
  }
  const cap = ctx.createRadialGradient(c - 0.01 * k, c - 0.012 * k, 0, c, c, 0.042 * k);
  cap.addColorStop(0, '#f2f0ea'); cap.addColorStop(0.6, '#a9a7a0'); cap.addColorStop(1, '#55534e');
  ctx.fillStyle = cap; ctx.beginPath(); ctx.arc(c, c, 0.042 * k, 0, Math.PI * 2); ctx.fill();
  // Brake dust and grime toward the rim.
  const g = ctx.createRadialGradient(c, c, 0.08 * k, c, c, (TYRE.rim + 0.02) * k);
  g.addColorStop(0, 'rgba(70,55,40,0)'); g.addColorStop(1, 'rgba(70,55,40,0.55)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, w);
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
  ctx.stroke();
};

// A seam: a dark groove with a faint highlight beside it.
function seam(c, s, pts, { width = 0.006, light = [0.006, 0.004] } = {}) {
  line(c, pts, width, 'rgba(40,36,30,0.85)');
  line(s, pts, width * 1.6, surf(0.22, 0.6, 0.3));
  const lit = pts.map(([a, b]) => [a + light[0], b + light[1]]);
  line(c, lit, width * 0.6, 'rgba(255,253,245,0.35)');
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

function paintSide(at, side) {
  const name = side > 0 ? 'side' : 'sideL';
  // The livery first, so dirt goes over it.
  at.paint(name, (c) => {
    c.save();
    c.translate(side > 0 ? -2.2 : 0.55, 0);
    c.scale(side * LIVERY_STRETCH, 1);
    livery(c);
    c.restore();
  });
  // Dirt low down and thrown up behind the wheels, streaks from the roof
  // rail and the window corners, a little panel-to-panel tint.
  at.pixels(name, 90, (x, y, px) => {
    const n = fbm(x * 2.2, y * 2.2, 4);
    let dirt = smooth(0.95, 0.35, y + 0.18 * n) * 0.5;
    for (const xc of [AXLE.rear, AXLE.front]) {
      const d = Math.hypot(x - xc + 0.15, (y - 0.5) * 1.3);
      dirt += smooth(1.0, 0.35, d) * 0.3 * (0.6 + 0.4 * fbm(x * 6, y * 6, 3));
    }
    const streak = smooth(0.15, 0.6, fbm(x * 16, y * 0.7 + 3.1, 3)) * smooth(0.6, 1.9, y) * 0.22;
    const a = clamp01(dirt + streak);
    px.c = [0.38 - 0.06 * n, 0.33 - 0.05 * n, 0.27 - 0.04 * n, a * 0.85];
    px.s = [0.5, 0.3 + 0.55 * a, 0.85 * (1 - a), a];
  });
  // Rust: along the sill, round the arches, at the foot of the door seams.
  at.pixels(name, 260, (x, y, px) => {
    let r = smooth(SILL + 0.13, SILL + 0.01, y + 0.06 * fbm(x * 5, y * 5, 3)) * (0.55 + 0.6 * fbm(x * 1.7 + 9, 0.5, 2));
    for (const xc of [AXLE.rear, AXLE.front]) {
      const d = Math.hypot(x - xc, y - TYRE.r) - ARCH;
      if (d > -0.01) r = Math.max(r, smooth(0.09, 0.0, d) * (0.55 + 0.7 * fbm(x * 7 + 4, y * 7, 3)));
    }
    for (const xs of [B_PILLAR, CARGO_DOOR]) r = Math.max(r, smooth(0.05, 0, Math.abs(x - xs)) * smooth(0.8, 0.45, y) * 0.75);
    const breakup = fbm(x * 13, y * 13, 4);
    const v = clamp01((r * (0.7 + 1.1 * breakup) - 0.36) * 2.4);
    if (v <= 0.01) return;
    const t = clamp01(0.5 + 0.8 * noise(x * 31, y * 31));
    px.c = [0.24 + 0.24 * t, 0.11 + 0.1 * t, 0.05 + 0.03 * t, v];
    px.s = [0.5 + 0.08 * noise(x * 90, y * 90), 0.88, 0, v];
  }, side > 0 ? [-2.64, 2.64, 1.0, 0.2] : [2.64, -2.64, 1.0, 0.2]);

  at.paint(name, (c, s) => {
    // The front door and its window.
    const doorTop = ROOF - 0.12;
    const door = [
      [B_PILLAR, SILL + 0.02], [B_PILLAR, doorTop], [screenX(doorTop, -0.04), doorTop],
      [screenX(1.26, -0.06), 1.26],
    ];
    const front = [];
    for (let k = 0; k <= 8; k++) {
      const u = k / 8;
      front.push([screenX(1.26, -0.06) - 0.42 * u * u - 0.02 * u, 1.26 - 0.52 * u]);
    }
    seam(c, s, [...door, ...front.slice(1), [1.2, SILL + 0.06], [B_PILLAR + 0.04, SILL + 0.02]]);
    const wTop = ROOF - 0.2;
    window(c, s, [[B_PILLAR + 0.07, WAIST + 0.12], [B_PILLAR + 0.07, wTop], [screenX(wTop, 0.11), wTop], [screenX(WAIST + 0.14, 0.11), WAIST + 0.14]], [B_PILLAR + 0.38, 1.62]);
    // The hood's edge on the fender, and the fender's seam down to the bumper.
    seam(c, s, [[screenX(1.22, -0.05), 1.22], [2.1, 1.08], [FRONT, 1.0]]);
    // The cargo door (this side only) and the rear corner's panel seam.
    if (side > 0) {
      seam(c, s, [[CARGO_DOOR, SILL + 0.02], [CARGO_DOOR + 0.008, 1.1], [CARGO_DOOR - 0.004, 1.5], [CARGO_DOOR, doorTop]]);
      seam(c, s, [[CARGO_DOOR, doorTop], [B_PILLAR, doorTop]]);
    } else {
      // A fuel filler door.
      c.fillStyle = 'rgba(60,55,48,0.5)'; c.fillRect(-1.95, 0.86, 0.17, 0.17);
      seam(c, s, [[-1.95, 0.86], [-1.78, 0.86], [-1.78, 1.03], [-1.95, 1.03], [-1.95, 0.86]], { width: 0.004 });
    }
    // The waist crease: a highlight over a shadow, and a ridge in the relief.
    line(c, [[REAR, WAIST + 0.012], [FRONT - 0.3, WAIST + 0.012]], 0.012, 'rgba(255,253,246,0.4)');
    line(c, [[REAR, WAIST - 0.01], [FRONT - 0.3, WAIST - 0.01]], 0.014, 'rgba(70,62,52,0.35)');
    line(s, [[REAR, WAIST], [FRONT - 0.3, WAIST]], 0.02, surf(0.64, 0.3, 0.85));
    // Recesses behind the handles.
    for (const x of side > 0 ? [B_PILLAR + 0.12, B_PILLAR - 0.1] : [B_PILLAR + 0.12]) {
      c.fillStyle = 'rgba(30,28,25,0.5)';
      c.beginPath(); c.ellipse(x, 1.09, 0.09, 0.035, 0, 0, Math.PI * 2); c.fill();
    }
  });
}

// The livery, in metres from its back end at the van's waist line: three
// bands curling round a C, the name over them, a mast at the tip.
function livery(c) {
  const cx = 0.28;
  const cy = 1.535;
  const bands = [
    { r: 0.243, w: 0.078, colour: '#7c1c10', arm: 0.36, end: 2.5 },
    { r: 0.177, w: 0.044, colour: '#c2401a', arm: 0.3, end: 2.4 },
    { r: 0.132, w: 0.034, colour: '#d8781c', arm: 0.26, end: 2.3 },
  ];
  // Clip the runs' tips at a slant.
  c.save();
  c.beginPath();
  c.moveTo(-0.2, 2.2); c.lineTo(2.08, 2.2); c.lineTo(2.62, 1.2); c.lineTo(-0.2, 1.2); c.closePath();
  c.clip();
  for (const b of bands) {
    c.beginPath();
    c.moveTo(cx + b.arm, cy + b.r);
    c.lineTo(cx, cy + b.r);
    c.arc(cx, cy, b.r, Math.PI / 2, (3 * Math.PI) / 2, false);
    c.lineTo(b.end, cy - b.r);
    c.lineWidth = b.w;
    c.strokeStyle = b.colour;
    c.lineCap = 'butt';
    c.stroke();
  }
  c.restore();
  // The name, condensed, leaning forward, fitted to its length.
  const textLeft = cx + 0.05;
  const textWidth = 1.66;
  const cap = 0.255;
  c.save();
  c.font = `900 100px Impact, "Arial Narrow", "Helvetica Neue", Arial, sans-serif`;
  const measured = c.measureText(WORDS.van).width / 100;   // in cap-heights of 100 px font... per metre of size
  c.restore();
  const size = cap / 0.73;   // Impact's capitals are about 0.73 of its size
  const stretch = textWidth / (measured * size);
  letter(c, WORDS.van, textLeft, cy + 0.005, size, { font: 'Impact, "Arial Narrow", Arial, sans-serif', weight: '900', colour: '#0a0908', skew: 0.18, stretch });
  letter(c, '104.7 FM', 2.08, cy - 0.12, 0.05, { font: 'Arial', weight: '700', colour: '#b9471e', align: 'right', stretch: 0.8 });
  // The mast: a lattice of thin lines narrowing upward, waves from its tip.
  const mx = 2.32;
  const base = cy - 0.24, tip = cy + 0.19;
  c.strokeStyle = '#141210';
  c.lineWidth = 0.009;
  c.beginPath();
  c.moveTo(mx - 0.07, base); c.lineTo(mx, tip); c.lineTo(mx + 0.07, base);
  for (let k = 0; k < 6; k++) {
    const f0 = k / 6, f1 = (k + 1) / 6;
    const y0 = base + (tip - base) * f0, y1 = base + (tip - base) * f1;
    const w0 = 0.07 * (1 - f0), w1 = 0.07 * (1 - f1);
    c.moveTo(mx - w0, y0); c.lineTo(mx + w1, y1);
    c.moveTo(mx + w0, y0); c.lineTo(mx - w1, y1);
  }
  c.stroke();
  c.fillStyle = '#141210';
  c.beginPath(); c.moveTo(mx - 0.13, base - 0.02); c.lineTo(mx + 0.15, base - 0.02); c.lineTo(mx + 0.06, base + 0.03); c.lineTo(mx - 0.06, base + 0.03); c.fill();
  c.strokeStyle = '#9a3020';
  c.lineWidth = 0.007;
  for (let k = 1; k <= 3; k++) {
    for (const s of [-1, 1]) {
      c.beginPath();
      c.arc(mx, tip, 0.035 * k + 0.02, s > 0 ? -0.55 : Math.PI - 0.55, s > 0 ? 0.55 : Math.PI + 0.55);
      c.stroke();
    }
  }
  const star = (x, y, r) => {
    c.fillStyle = '#141210';
    c.beginPath();
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      const rr = k % 2 ? r * 0.25 : r;
      c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    c.fill();
  };
  star(mx - 0.15, cy + 0.06, 0.03);
  star(mx + 0.16, cy + 0.08, 0.03);
  // Wear: a few scuffs through the bands.
  c.fillStyle = 'rgba(231,227,216,0.55)';
  for (let k = 0; k < 40; k++) {
    const x = (k * 0.618 * 2.5) % 2.5;
    const y = cy - 0.27 + ((k * 0.381) % 1) * 0.12;
    c.fillRect(x, y, 0.01 + (k % 5) * 0.006, 0.004);
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
    c.fillRect(SCREEN.base[0] + 0.0, -0.75, 0.05, 1.5);
    seam(c, s, [[SCREEN.base[0] + 0.07, -0.86], [SCREEN.base[0] + 0.07, 0.86]]);
    for (const z of [-0.86, 0.86]) seam(c, s, [[SCREEN.base[0] + 0.07, z], [FRONT, z * 0.97]]);
  });
  // Grime gathers along the roof's edges and over the hood; streaks back from the screen.
  at.pixels('top', 60, (x, z, px) => {
    const n = fbm(x * 2.5, z * 2.5, 4);
    const edge = smooth(0.55, 0.95, Math.abs(z)) * 0.35;
    const hood = x > SCREEN.base[0] ? 0.15 : 0;
    const a = clamp01((edge + hood + 0.12 * n + 0.08) * (x < SCREEN.top[0] || x > SCREEN.base[0] ? 1 : 0.4));
    px.c = [0.4, 0.36, 0.3, a * 0.7];
    px.s = [0.5, 0.32 + 0.4 * a, 0.85 * (1 - a), a];
  });
}

function paintRear(at) {
  at.paint('rear', (c, s) => {
    const y0 = 0.5, y1 = ROOF - 0.1;
    // The doors' raised upper panels.
    for (const sgn of [-1, 1]) {
      const za = sgn * 0.07, zb = sgn * 0.8;
      const [l, r] = za < zb ? [za, zb] : [zb, za];
      c.beginPath(); c.roundRect(l, 1.26, r - l, 0.6, 0.09);
      c.lineWidth = 0.01; c.strokeStyle = 'rgba(90,82,70,0.35)'; c.stroke();
      s.beginPath(); s.roundRect(l, 1.26, r - l, 0.6, 0.09);
      s.fillStyle = surf(0.6, 0.3, 0.85); s.fill();
      s.lineWidth = 0.02; s.strokeStyle = surf(0.55, 0.3, 0.85); s.stroke();
      c.beginPath(); c.moveTo(l + 0.05, 1.865); c.lineTo(r - 0.05, 1.865); c.lineWidth = 0.008; c.strokeStyle = 'rgba(255,253,246,0.45)'; c.stroke();
    }
    // The split, the doors' outer edges and top, the crease across.
    seam(c, s, [[0, y0], [0, y1]], { width: 0.008 });
    for (const z of [-0.86, 0.86]) seam(c, s, [[z, y0], [z, y1]]);
    seam(c, s, [[-0.86, y1], [0.86, y1]]);
    line(c, [[-0.9, 1.15], [0.9, 1.15]], 0.012, 'rgba(255,253,246,0.35)');
    line(c, [[-0.9, 1.13], [0.9, 1.13]], 0.012, 'rgba(70,62,52,0.3)');
    line(s, [[-0.9, 1.14], [0.9, 1.14]], 0.02, surf(0.64, 0.3, 0.85));
  });
  // Dirt: heavy low down, streaks from the handles and the roof.
  at.pixels('rear', 110, (z, y, px) => {
    const n = fbm(z * 3, y * 3, 4);
    const low = smooth(1.05, 0.45, y + 0.15 * n) * 0.6;
    const streak = smooth(0.2, 0.65, fbm(z * 18 + 5, y * 0.8, 3)) * smooth(0.5, 1.95, y) * 0.25;
    const handle = smooth(0.08, 0.0, Math.abs(Math.abs(z) - 0.11) - 0.05) * smooth(1.14, 0.6, y) * smooth(0.4, 1.1, y) * 0.35;
    const a = clamp01(low + streak + handle);
    px.c = [0.37 - 0.05 * n, 0.32 - 0.05 * n, 0.26 - 0.04 * n, a * 0.85];
    px.s = [0.5, 0.3 + 0.55 * a, 0.85 * (1 - a), a];
  });
  at.pixels('rear', 260, (z, y, px) => {
    let r = smooth(0.62, 0.48, y + 0.06 * fbm(z * 6, y * 6, 3));
    r = Math.max(r, smooth(0.08, 0, Math.abs(Math.abs(z) - 0.925) - 0.07) * smooth(0.06, 0, Math.abs(y - 0.84) - 0.18) * 0.7);
    const v = clamp01((r * (0.75 + 0.9 * fbm(z * 12, y * 12, 4)) - 0.3) * 2.6);
    if (v <= 0.01) return;
    const t = clamp01(0.5 + 0.8 * noise(z * 31, y * 31));
    px.c = [0.24 + 0.24 * t, 0.11 + 0.1 * t, 0.05 + 0.03 * t, v];
    px.s = [0.5 + 0.08 * noise(z * 90, y * 90), 0.88, 0, v];
  }, [-1.06, 1.06, 1.1, 0.4]);
}

function paintFront(at) {
  at.paint('front', (c, s) => {
    // Behind the grille.
    c.fillStyle = '#121212'; c.fillRect(-0.98, 0.6, 1.96, 0.4);
    s.fillStyle = surf(0.5, 0.6, 0.2); s.fillRect(-0.98, 0.6, 1.96, 0.4);
  });
  at.pixels('front', 120, (z, y, px) => {
    const n = fbm(z * 3, y * 3, 3);
    const a = clamp01(smooth(0.9, 0.45, y + 0.1 * n) * 0.55 + 0.1);
    px.c = [0.36, 0.31, 0.25, a * 0.8];
    px.s = [0.5, 0.3 + 0.5 * a, 0.85 * (1 - a), a];
  });
}
