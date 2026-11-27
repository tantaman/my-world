// The sedan that passes at 16.5 to 24 s: a boxy early-eighties American
// four-door (the Caprice and Dynasty shape), dark teal metallic under a
// clearcoat: a long flat hood, a raked windscreen, an upright formal roof
// with a vinyl top and thick rear pillars, a short trunk; chrome round the
// windows, along the sills, on the bumpers and the grille; rectangular
// headlamps lit, red tail lamps, whitewall tyres on hubcaps that turn. It
// drives the near lane toward -X at about 14 m/s (PLAN.md 5.10). Its
// headlights are bright lenses for bloom and one spot light from
// light/rig.js; it also lights the fog (weather/fog.js).
//
// Built as the van is: one lofted skin (props/loft.js) painted through an
// atlas (props/atlas.js), parts on it, merged by material; the wheels apart,
// so they can turn.
import { Group, BoxGeometry, CylinderGeometry, RingGeometry, Mesh, Color, Vector3, MeshPhysicalNodeMaterial, MeshStandardNodeMaterial, DoubleSide } from 'three/webgpu';
import { vec3 } from 'three/tsl';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { ROAD } from '../set/layout.js';
import { T } from '../timeline.js';
import { curve, loftBody, stations, archBottom, sideZ } from './loft.js';
import { createAtlas, surf, fbm, smooth, clamp01 } from './atlas.js';
import { bodyMaterial, chrome, plastic, lens, wheel, sweep, roundedRect, mergeByMaterial, groundShadow, part } from './vehicle.js';

export const CAR = {
  speed: 9,                                    // m/s: the original's crosses the frame at about half the rate 14 gave, 19.5 to 20.5 s
  // Driving toward -X, a little in from the near lane's middle: at 20.5 s
  // the original's car is about a fifth smaller in frame than in the near lane's middle.
  lane: ROAD.centre - 0.9,
  passX: 0.5,                                  // where it is at T.carPasses (so at 19.5 s it is where the original's is)
  wheel: 0.325,                                // tyre radius, m
};
// The lit lenses' brightness, for bloom: the original's are small white-hot
// rectangles with a modest glow, the body round them still readable.
const HEADLIGHT_GLOW = 7;
// Their light in the fog: a soft pool ahead on the road, not a searchlight.
const HEADLIGHT_FOG = { strength: 0.15, half: 0.25, soft: 0.8 };
const TAIL_GLOW = 1.4;      // the tail lamps: red, not so bright the tone curve turns them pink

// Sizes, metres, along the car from its middle (nose +X).
const LEN = 4.95;
const REAR = -LEN / 2 + 0.05;
const FRONT = LEN / 2 - 0.06;
const HW = 0.91;
const ROOF = 1.385;
const WAIST = 0.94;          // the belt: bottom of the side windows, top of the hood
const SILL = 0.3;
const AXLE = { rear: -1.225, front: 1.525 };
const TYRE = { r: CAR.wheel, w: 0.205, rim: 0.19 };
const ARCH = 0.405;
const SCREEN = { top: [0.06, ROOF - 0.02], base: [0.78, 0.99] };
const BACKLIGHT = { top: [-1.04, ROOF - 0.02], base: [-1.62, 0.99] };
const B_PILLAR = -0.32;
const C_PILLAR = -1.0;       // where the rear door's window ends and the thick pillar starts
const LEAN = 0.17;           // how far the roof's edge stands in from the shoulder

const PAINT = '#1f403b';
const PAINT_SURF = surf(0.5, 0.26, 1);
const VINYL = '#1c2523';
const GLASS = '#07090a';
const BRIGHT = '#8e8f8b';    // chrome, painted

const arches = [AXLE.rear, AXLE.front].map((xc) => ({ xc, r: ARCH, yc: TYRE.r, bot: SILL }));
const bot = (() => {
  const base = curve([[REAR, 0.4], [REAR + 0.35, SILL], [FRONT - 0.4, SILL], [FRONT, 0.42]], 0.05);
  const arch = archBottom(0, arches);
  return (x) => Math.max(base(x), arch(x));
})();
const top = curve([[REAR, 0.935], [BACKLIGHT.base[0] - 0.04, 0.99], BACKLIGHT.base, BACKLIGHT.top, [-0.94, ROOF], [-0.02, ROOF], SCREEN.top, SCREEN.base, [1.25, 0.965], [FRONT, 0.905]], 0.025);
const rt = (x) => 0.035 + 0.04 * clamp01((top(x) - WAIST) / (ROOF - WAIST));
const section = (x) => {
  const t = top(x);
  return { bot: bot(x), top: t, hw: HW, waist: WAIST, tuck: 0.035, lean: LEAN * clamp01((t - WAIST - 0.02) / (ROOF - WAIST)), rb: 0.04, rw: 0.04, rt: rt(x), shoulder: 0.035 };
};
const lineX = (a, b, y, d = 0) => a[0] + ((a[1] - y) / (a[1] - b[1])) * (b[0] - a[0]) - d * Math.sign(b[0] - a[0]);

const ATLAS = {
  side: { px: [0, 0, 2048, 300], a: [-2.52, 2.52], b: [1.46, 0] },
  sideL: { px: [0, 304, 2048, 300], a: [2.52, -2.52], b: [1.46, 0] },
  top: { px: [0, 608, 1400, 280], a: [-2.52, 2.52], b: [-0.95, 0.95] },
  rear: { px: [1408, 608, 640, 200], a: [-0.95, 0.95], b: [1.05, 0.25] },
  front: { px: [1408, 812, 640, 200], a: [0.95, -0.95], b: [1.0, 0.25] },
  floor: { px: [0, 892, 1400, 132], a: [-2.52, 2.52], b: [-0.95, 0.95] },
};

export function carX(t) {
  return CAR.passX - CAR.speed * (t - T.carPasses);
}

export function createSedan({ rig, scatterLights }) {
  const at = createAtlas(2048, 1024, ATLAS);
  paintSedan(at);
  const body = bodyMaterial(at.textures(), { metal: 0.15 });

  const g = new Group();
  const shell = new Group();
  shell.add(part(loftBody({
    section,
    stations: stations(REAR, FRONT, 0.045, arches),
    rear: { x: REAR, r: 0.06 },
    front: { x: FRONT, r: 0.07 },
    uv: {
      side: (x, y) => at.uv('side', x, y),
      sideL: (x, y) => at.uv('sideL', x, y),
      top: (x, z) => at.uv('top', x, z),
      floor: (x, z) => at.uv('floor', x, z),
      rear: (z, y) => at.uv('rear', z, y),
      front: (z, y) => at.uv('front', z, y),
    },
  }), body));
  addParts(shell);
  mergeByMaterial(shell);
  g.add(shell);
  const wheelsAt = [];
  for (const x of [AXLE.rear, AXLE.front]) for (const s of [-1, 1]) wheelsAt.push([x, s * (HW - 0.035 - TYRE.w / 2), TYRE.r]);
  g.add(groundShadow(FRONT - REAR, 2 * HW, wheelsAt));

  const wheels = [];
  for (const x of [AXLE.rear, AXLE.front]) {
    for (const s of [-1, 1]) {
      const w = sedanWheel();
      const spin = new Group();   // turns about Z; the wheel inside faces its side
      spin.position.set(x, TYRE.r, s * (HW - 0.035 - TYRE.w / 2));
      if (s < 0) w.rotation.y = Math.PI;
      spin.add(w);
      g.add(spin);
      wheels.push(spin);
    }
  }

  // It drives toward -X: turn it round.
  g.rotation.y = Math.PI;
  const light = rig.lights.headlight;
  const front = new Vector3();
  const aim = new Vector3();
  const fogAim = new Vector3(-1, -0.08, 0).normalize();
  const colour = new Color('#fff4e0');

  return {
    object: g,
    update(t) {
      const on = t > T.carSeen - 3 && t < T.carGone + 2;
      g.visible = on;
      light.intensity = on ? light.userData.cd ?? 9000 : 0;
      if (!on) return;
      const x = carX(t);
      g.position.set(x, 0, CAR.lane);
      // Rolling forward (local +X): clockwise seen from +Z.
      for (const w of wheels) w.rotation.z = -(CAR.speed * t) / CAR.wheel;
      front.set(x - FRONT - 0.1, 0.68, CAR.lane);
      light.position.copy(front);
      aim.set(x - 30, 0, CAR.lane + 0.5);
      light.target.position.copy(aim);
      scatterLights.add(front, colour, HEADLIGHT_FOG.strength, fogAim, HEADLIGHT_FOG.half, HEADLIGHT_FOG.soft);
    },
  };
}

// ---------------------------------------------------------------- the parts

function addParts(g) {
  const shine = chrome({ grime: 0.15 });
  const black = plastic('#0f1011', 0.45);
  const dark = plastic('#0a0a0a', 0.85);
  const paint = new MeshPhysicalNodeMaterial({ color: new Color(PAINT), roughness: 0.3, metalness: 0.15, clearcoat: 1, clearcoatRoughness: 0.06 });
  const head = new MeshStandardNodeMaterial({ color: new Color(1, 1, 1) });
  head.emissiveNode = vec3(1.0, 0.96, 0.88).mul(HEADLIGHT_GLOW);
  const tail = lens('#7a0604', { glow: TAIL_GLOW, rough: 0.15 });
  const amber = lens('#b0600c', { glow: 0.6, rough: 0.15 });

  // Bumpers: painted, with a chrome strip along the top, wrapping the corners.
  const bumper = [[0.0, -0.08], [0.06, -0.075], [0.085, -0.03], [0.09, 0.04], [0.07, 0.075], [0.0, 0.08]];
  const strip = roundedRect(0.025, 0.035, 0.008, 1);
  const path = (x0, dir, y) => {
    const pts = [];
    for (let k = 0; k <= 24; k++) {
      const z = -0.93 + (1.86 * k) / 24;
      const wrap = Math.max(0, Math.abs(z) - 0.78) / 0.15;
      pts.push([x0 - dir * 0.2 * wrap * wrap, y, z]);
    }
    return pts;
  };
  const outward = (dir) => (p) => {
    const w = Math.max(0, Math.abs(p[2]) - 0.78) * 4;
    return [dir * Math.max(0, 1 - w), 0, Math.sign(p[2]) * w];
  };
  for (const [x0, dir] of [[FRONT + 0.02, 1], [REAR - 0.02, -1]]) {
    g.add(part(sweep(bumper, path(x0, dir, 0.44), outward(dir), { closed: false }), paint));
    g.add(part(sweep(strip, path(x0 + dir * 0.085, dir, 0.49), outward(dir)), shine));
    g.add(part(sweep(strip, path(x0 + dir * 0.07, dir, 0.375), outward(dir)), black));
  }
  // Grille: a chrome frame of fine vertical bars between the lamps.
  const gx = FRONT + 0.012;
  g.add(part(new BoxGeometry(0.04, 0.2, 0.72), dark, gx - 0.01, 0.7, 0));
  for (let k = -8; k <= 8; k++) g.add(part(new BoxGeometry(0.03, 0.18, 0.012), shine, gx + 0.008, 0.7, k * 0.04));
  const frame = roundedRect(0.74, 0.22, 0.015, 2).map(([a, b]) => [gx + 0.02, 0.7 + b, a]);
  frame.push(frame[0]);
  g.add(part(sweep([[0.012, 0], [0, 0.01], [-0.012, 0], [0, -0.01]], frame, () => [1, 0, 0]), shine));
  g.add(part(new BoxGeometry(0.03, 0.04, 0.12), shine, gx + 0.03, 0.83, 0));
  // Headlamps: two rectangles each side in a chrome bezel; corner lamps wrapping round.
  for (const s of [-1, 1]) {
    g.add(part(new RoundedBoxGeometry(0.04, 0.14, 0.4, 2, 0.012), shine, gx - 0.005, 0.7, s * 0.6));
    for (const z of [0.5, 0.7]) g.add(part(new BoxGeometry(0.03, 0.1, 0.17), head, gx + 0.012, 0.7, s * z));
    const corner = part(new RoundedBoxGeometry(0.16, 0.1, 0.06, 2, 0.015), amber, FRONT - 0.07, 0.7, s * (HW - 0.045));
    corner.rotation.y = s * 0.35;
    g.add(corner);
    // Tail lamps: wide red lenses on the rear face, a clear reversing lamp inboard.
    g.add(part(new RoundedBoxGeometry(0.03, 0.15, 0.5, 2, 0.01), tail, REAR - 0.012, 0.73, s * 0.6));
    g.add(part(new RoundedBoxGeometry(0.03, 0.15, 0.1, 2, 0.01), lens('#c8c4ba', { rough: 0.1 }), REAR - 0.012, 0.73, s * 0.3));
    // Mirrors at the windscreen's foot, door handles, the sill's chrome strip.
    const zm = sideZ(section(0.7), 1.0);
    g.add(part(new RoundedBoxGeometry(0.1, 0.09, 0.14, 2, 0.02), paint, 0.68, 1.05, s * (zm + 0.07)));
    for (const x of [0.2, -0.85]) g.add(part(new RoundedBoxGeometry(0.13, 0.025, 0.02, 2, 0.008), shine, x, 0.87, s * (sideZ(section(x), 0.87) + 0.005)));
    const sill = [];
    for (let x = AXLE.rear + ARCH + 0.04; x <= AXLE.front - ARCH - 0.04; x += 0.1) sill.push([x, 0.43, s * (sideZ(section(x), 0.43) + 0.004)]);
    g.add(part(sweep(roundedRect(0.012, 0.03, 0.005, 1), sill, () => [0, 0, s]), shine));
  }
  // Underneath.
  g.add(part(new BoxGeometry(4.2, 0.2, 1.3), dark, 0.0, 0.25, 0));
  for (const x of [AXLE.rear, AXLE.front]) {
    const axle = part(new CylinderGeometry(0.05, 0.05, 1.5, 8), dark, x, TYRE.r, 0);
    axle.rotation.x = Math.PI / 2;
    g.add(axle);
  }
}

let face = null;
const WHITEWALL = new MeshStandardNodeMaterial({ color: new Color('#a39e93'), roughness: 0.8, side: DoubleSide });
function sedanWheel() {
  const w = wheel({ radius: TYRE.r, width: TYRE.w, rim: TYRE.rim, dish: 0.015, draw: (face ??= drawHubcap), rimRough: 0.3 });
  const ring = new Mesh(new RingGeometry(TYRE.rim + 0.045, TYRE.rim + 0.07, 40), WHITEWALL);
  ring.position.z = TYRE.w / 2 + 0.002;
  w.add(ring);
  return w;
}

// A full wheel cover: a silver dish with a ring of slots, a dark centre.
function drawHubcap(ctx, w) {
  const c = w / 2;
  const k = w / 2 / (TYRE.rim + 0.02);
  ctx.fillStyle = '#8e8f8c'; ctx.fillRect(0, 0, w, w);
  const dish = ctx.createRadialGradient(c - 0.03 * k, c - 0.04 * k, 0, c, c, TYRE.rim * k);
  dish.addColorStop(0, '#d4d4d0'); dish.addColorStop(0.7, '#9a9b98'); dish.addColorStop(1, '#5c5d5a');
  ctx.fillStyle = dish; ctx.beginPath(); ctx.arc(c, c, TYRE.rim * k, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#2a2b2a'; ctx.lineWidth = 0.012 * k; ctx.lineCap = 'round';
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(c + Math.cos(a) * 0.1 * k, c + Math.sin(a) * 0.1 * k);
    ctx.lineTo(c + Math.cos(a) * 0.165 * k, c + Math.sin(a) * 0.165 * k);
    ctx.stroke();
  }
  ctx.fillStyle = '#262726'; ctx.beginPath(); ctx.arc(c, c, 0.055 * k, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#a9aaa6'; ctx.beginPath(); ctx.arc(c, c, 0.03 * k, 0, Math.PI * 2); ctx.fill();
}

// ---------------------------------------------------------------- the paint

const strokePath = (ctx, pts, close = false) => {
  ctx.beginPath();
  ctx.moveTo(...pts[0]);
  for (const p of pts.slice(1)) ctx.lineTo(...p);
  if (close) ctx.closePath();
};

function seam(c, s, pts, width = 0.005) {
  strokePath(c, pts); c.lineWidth = width; c.strokeStyle = 'rgba(5,10,9,0.9)'; c.stroke();
  strokePath(s, pts); s.lineWidth = width * 1.6; s.strokeStyle = surf(0.25, 0.5, 0.4); s.stroke();
}

// Glass with a bright chrome surround.
function glass(c, s, pts) {
  strokePath(c, pts, true); c.fillStyle = GLASS; c.fill();
  strokePath(s, pts, true); s.fillStyle = surf(0.5, 0.04, 1); s.fill();
  strokePath(c, pts, true); c.lineWidth = 0.016; c.strokeStyle = BRIGHT; c.lineJoin = 'round'; c.stroke();
  strokePath(s, pts, true); s.lineWidth = 0.016; s.strokeStyle = surf(0.6, 0.15, 1); s.lineJoin = 'round'; s.stroke();
}

function paintSedan(at) {
  for (const name of Object.keys(ATLAS)) {
    at.paint(name, (c, s) => {
      c.fillStyle = name === 'floor' ? '#141413' : PAINT;
      s.fillStyle = name === 'floor' ? surf(0.5, 0.9, 0) : PAINT_SURF;
      c.fillRect(-9, -9, 18, 18);
      s.fillRect(-9, -9, 18, 18);
    });
  }
  // A little road dirt low down, and the paint's flake: a fine speckle in its roughness.
  for (const name of ['side', 'sideL', 'rear', 'front']) {
    at.pixels(name, 70, (a, y, px) => {
      const n = fbm(a * 3, y * 3, 3);
      const d = clamp01(smooth(0.6, 0.2, y + 0.1 * n) * 0.6);
      px.c = [0.2, 0.19, 0.16, d * 0.7];
      px.s = [0.5, 0.26 + 0.4 * d, 1 - 0.7 * d, d];
    });
  }
  for (const [name, side] of [['side', 1], ['sideL', -1]]) {
    at.paint(name, (c, s) => {
      const winTop = ROOF - 0.075;
      const sill = WAIST + 0.025;
      // Side windows, front and rear doors, and the black pillar between.
      glass(c, s, [[B_PILLAR + 0.04, sill], [B_PILLAR + 0.04, winTop], [lineX(SCREEN.top, SCREEN.base, winTop, 0.07), winTop], [lineX(SCREEN.top, SCREEN.base, sill, 0.07), sill]]);
      glass(c, s, [[C_PILLAR, sill], [C_PILLAR + 0.03, winTop], [B_PILLAR - 0.04, winTop], [B_PILLAR - 0.04, sill]]);
      c.fillStyle = '#0c0d0d'; c.fillRect(B_PILLAR - 0.03, sill, 0.06, winTop - sill);
      // Door seams: the front door's leading edge behind the arch, the shared
      // edge at the pillar, the rear door's edge round the rear arch.
      seam(c, s, [[0.97, SILL + 0.03], [0.97, WAIST - 0.02], [lineX(SCREEN.top, SCREEN.base, WAIST + 0.02, -0.03), WAIST + 0.02]]);
      seam(c, s, [[B_PILLAR, SILL + 0.03], [B_PILLAR, WAIST]]);
      const rearEdge = [[C_PILLAR - 0.06, WAIST], [C_PILLAR - 0.1, 0.72]];
      for (let k = 1; k <= 6; k++) {
        const a = Math.PI * 0.62 - (k / 6) * Math.PI * 0.3;
        rearEdge.push([AXLE.rear + (ARCH + 0.04) * Math.cos(a), TYRE.r + (ARCH + 0.04) * Math.sin(a)]);
      }
      rearEdge.push([AXLE.rear + ARCH + 0.06, SILL + 0.03]);
      seam(c, s, rearEdge);
      seam(c, s, [[AXLE.front - ARCH - 0.06, SILL + 0.03], [AXLE.rear + ARCH + 0.06, SILL + 0.03]]);
      // The trunk lid's and the hood's edges seen from the side.
      seam(c, s, [[BACKLIGHT.base[0] - 0.06, 0.97], [REAR + 0.05, 0.92]]);
      // Marker lamps.
      c.fillStyle = '#9a5a14';
      c.fillRect(2.15, 0.6, 0.12, 0.05);
      c.fillStyle = '#5a0a06';
      c.fillRect(-2.32, 0.64, 0.1, 0.05);
      // A crease low along the doors.
      strokePath(c, [[REAR + 0.1, 0.62], [FRONT - 0.1, 0.62]]); c.lineWidth = 0.008; c.strokeStyle = 'rgba(160,190,180,0.25)'; c.stroke();
      strokePath(s, [[REAR + 0.1, 0.615], [FRONT - 0.1, 0.615]]); s.lineWidth = 0.014; s.strokeStyle = surf(0.62, 0.26, 1); s.stroke();
    });
  }
  at.paint('top', (c, s) => {
    const half = (x) => HW - 0.035 - LEAN * clamp01((top(x) - WAIST - 0.02) / (ROOF - WAIST)) - rt(x) - 0.03;
    const pane = (x0, x1) => {
      const pts = [];
      for (let k = 0; k <= 8; k++) { const x = x0 + ((x1 - x0) * k) / 8; pts.push([x, -half(x)]); }
      for (let k = 8; k >= 0; k--) { const x = x0 + ((x1 - x0) * k) / 8; pts.push([x, half(x)]); }
      glass(c, s, pts);
    };
    // The vinyl roof, matte and grained, edged in chrome.
    c.fillStyle = VINYL; c.fillRect(BACKLIGHT.top[0] - 0.02, -0.8, SCREEN.top[0] - BACKLIGHT.top[0] + 0.02, 1.6);
    s.fillStyle = surf(0.5, 0.62, 0.05); s.fillRect(BACKLIGHT.top[0] - 0.02, -0.8, SCREEN.top[0] - BACKLIGHT.top[0] + 0.02, 1.6);
    pane(SCREEN.top[0] + 0.03, SCREEN.base[0] - 0.04);
    pane(BACKLIGHT.base[0] + 0.05, BACKLIGHT.top[0] - 0.03);
    // Hood and trunk lid seams; the cowl.
    seam(c, s, [[SCREEN.base[0] + 0.04, -0.78], [SCREEN.base[0] + 0.04, 0.78]]);
    seam(c, s, [[BACKLIGHT.base[0] - 0.05, -0.8], [BACKLIGHT.base[0] - 0.05, 0.8]]);
    for (const z of [-0.84, 0.84]) {
      seam(c, s, [[SCREEN.base[0] + 0.04, z], [FRONT, z]]);
      seam(c, s, [[BACKLIGHT.base[0] - 0.05, z], [REAR, z]]);
    }
    c.fillStyle = '#0d0f0e'; c.fillRect(SCREEN.base[0] - 0.02, -0.7, 0.05, 1.4);
  });
  at.pixels('top', 60, (x, z, px) => {
    if (x < BACKLIGHT.top[0] - 0.02 || x > SCREEN.top[0]) return;
    const n = fbm(x * 40, z * 40, 2);
    px.c = [0.11 + 0.02 * n, 0.14 + 0.02 * n, 0.135 + 0.02 * n, 0.5];
  });
  at.paint('rear', (c, s) => {
    c.fillStyle = '#2a0503'; c.fillRect(-0.88, 0.63, 1.76, 0.2);
    seam(c, s, [[-0.84, 0.86], [0.84, 0.86]]);
    c.fillStyle = BRIGHT; c.fillRect(-0.2, 0.6, 0.4, 0.012);
  });
  at.paint('front', (c, s) => {
    c.fillStyle = '#0a0a0a'; c.fillRect(-0.9, 0.58, 1.8, 0.26);
    s.fillStyle = surf(0.5, 0.6, 0.2); s.fillRect(-0.9, 0.58, 1.8, 0.26);
  });
}
