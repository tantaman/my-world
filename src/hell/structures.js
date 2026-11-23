// What was built in Hell, and what stands too big to strew: the bridges of
// Malebolge, the wall of Dis with its towers and gates, the castle of Limbo,
// the tower on the shore of Styx, and the falls where the brook goes over
// the brink.
//
// Each is a shape made once (sculpt.js) and put where the land says it is
// (land.js: the spokes, each sector's quay, castle and brook). The bridges
// are all of the pit's, and stand for as long as you're near it. The rest
// belong to a sector of the upper circles (which never end), and come and go
// with the sectors round you. The wall runs right round, in lengths, with a
// tower between each two; the lengths near you are drawn.
//
// Nothing here stops you: what can't be walked through is the land's to say
// (land.barrier), and a bridge's roadway is too (land.deck).

import * as THREE from 'three';
import { Sculpt, vary } from '../render/sculpt.js';
import { R, H, BOLGE, SECTOR, STEPS, bankTop, bolgeOuter } from './plan.js';
import { WALL, CASTLE, BROOK } from './land.js';
import { SHARED } from '../render/uniforms.js';
import { NOISE_GLSL } from '../render/glsl.js';
import { flameGeometry, stillFlames, createFlameHaze, hazeOver } from '../render/shades.js';
import { OVER } from '../render/pipeline.js';
import { SEEN } from './look.js';

const IRON = [0.07, 0.066, 0.07]; // Malebolge's stone, "of an iron colour"
const DIS = [0.09, 0.05, 0.04]; // the city's, red with the fire in it
const GREY = [0.13, 0.125, 0.115]; // the castle's
const LENGTH = 16; // m: one length of the wall of Dis
const TOWER_EVERY = 4; // lengths between towers
const WALL_NEAR = 1000; // m: lengths of wall this close are drawn
const SIGHT = 1500; // m: a sector's own things (a castle, a gate) are made this close
const PIT_NEAR = R.brink + 500;
const FALL_WIDE = 5; // m: the brook, where it goes over
const HEAT = 0.42; // how much of a stone's heat shows: dull red, not white
const LAMP = 420; // how bright a castle's lantern is (candela) // m from the axis: inside this, the bridges stand

const _p = { x: 0, z: 0 };
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3(1, 1, 1);
const _e = new THREE.Euler();

// Arch stones, cut as wedges. One arch can also stop short where it broke.
function stoneArch(s, x, spring, half, rise, thick, depth, color, { last = 12, hot = 0 } = {}) {
  const band = (i, r, z) => {
    const a = i * Math.PI / 12;
    return [x + Math.cos(a) * (half + r), spring + Math.sin(a) * (rise + r), z];
  };
  for (let i = 0; i < last; i++) {
    const a = i + 0.025;
    const b = i + 0.975;
    const stone = vary(color, (i * 0.37) % 1, 0.21);
    for (const z of [-depth / 2, depth / 2]) s.quad(band(a, 0, z), band(b, 0, z), band(b, thick, z), band(a, thick, z), stone, hot);
    for (const r of [0, thick]) s.quad(band(a, r, -depth / 2), band(b, r, -depth / 2), band(b, r, depth / 2), band(a, r, depth / 2), stone, hot);
    for (const e of [a, b]) s.quad(band(e, 0, -depth / 2), band(e, thick, -depth / 2), band(e, thick, depth / 2), band(e, 0, depth / 2), stone, hot);
  }
}

// ── Shapes ──────────────────────────────────────────────────────────────────
// One bridge over one ditch: its outer springing at the origin, running +z
// (inward) BOLGE.ditch m, its far end lower by the field's tilt. The top is
// the roadway land.deck() says is there.
function bridge() {
  const s = new Sculpt();
  const span = BOLGE.ditch;
  const drop = (BOLGE.tilt * BOLGE.ditch) / BOLGE.pitch;
  const half = BOLGE.deck;
  const N = 18;
  const top = (u) => -drop * u + BOLGE.rise * (1 - (2 * u - 1) ** 2);
  const under = (u) => top(u) - 1.4 - 15 * (1 - Math.sqrt(Math.max(0, 1 - (2 * u - 1) ** 2)));
  for (let i = 0; i < N; i++) {
    const u0 = i / N;
    const u1 = (i + 1) / N;
    const t = (i * 0.37) % 1;
    const c = vary(IRON, t, 0.22);
    const w0 = half + 0.5 * Math.abs(2 * u0 - 1) ** 3;
    const w1 = half + 0.5 * Math.abs(2 * u1 - 1) ** 3;
    const a = [u0 * span, top(u0), under(u0), w0];
    const b = [u1 * span, top(u1), under(u1), w1];
    // the roadway, the soffit, and the two faces
    s.quad([-a[3], a[1], a[0]], [a[3], a[1], a[0]], [b[3], b[1], b[0]], [-b[3], b[1], b[0]], c);
    s.quad([-a[3], a[2], a[0]], [a[3], a[2], a[0]], [b[3], b[2], b[0]], [-b[3], b[2], b[0]], vary(IRON, 1 - t, 0.22));
    for (const k of [-1, 1]) {
      s.quad([k * a[3], a[2], a[0]], [k * a[3], a[1], a[0]], [k * b[3], b[1], b[0]], [k * b[3], b[2], b[0]], vary(IRON, (t + 0.5) % 1, 0.22));
      // Stone ribs below the roadway trace the opening from either bank.
      const x0 = k * (a[3] + 0.15);
      const x1 = k * (b[3] + 0.15);
      s.quad([x0, a[2], a[0]], [x0, a[2] + 0.65, a[0]], [x1, b[2] + 0.65, b[0]], [x1, b[2], b[0]], vary(IRON, t, 0.28));
    }
  }
  // Raised iron braziers on the abutments, outside the walkable span.
  for (const z of [0.8, span - 0.8]) for (const side of [-1, 1]) {
    const x = side * (half + 0.52);
    const y = top(z / span);
    s.box(x, y - 0.4, z, 0.9, 2.5, 1.2, IRON);
    s.drum(x, y + 0.8, z, 0.35, 0.18, 0.22, [0.06, 0.045, 0.03], { sides: 8 });
    s.ball(x, y + 1.15, z, 0.22, [0.48, 0.11, 0.016], { sy: 1.5, hot: 1 });
  }
  return s.build();
}

// One length of the wall of Dis: LENGTH m along x, WALL.thick through,
// standing on the origin; red-hot from within, its merlons black against it.
function wallLength() {
  const s = new Sculpt();
  const courses = 6;
  for (let c = 0; c < courses; c++) {
    const h = WALL.h / courses;
    const hot = 0.34 - 0.2 * (c / courses);
    s.box(0, h * (c + 0.5), 0, LENGTH + 0.05, h - 0.06, WALL.thick - (c % 2) * 0.12, vary(DIS, (c * 0.31) % 1), { hot: hot * HEAT });
  }
  for (const x of [-5.4, 5.4]) {
    s.box(x, WALL.h * 0.48, 0, 1.25, WALL.h * 0.96, WALL.thick + 0.7, vary(DIS, 0.15), { hot: 0.055 });
    s.box(x, 0.9, 0, 1.8, 1.8, WALL.thick + 1.4, vary(DIS, 0.3));
  }
  s.box(0, WALL.h - 0.28, 0, LENGTH + 0.05, 0.56, WALL.thick + 0.55, vary(DIS, 0.48), { hot: 0.025 });
  for (let i = 0; i < 6; i++) s.box(-LENGTH / 2 + (i + 0.5) * (LENGTH / 6), WALL.h + 0.7, -(WALL.thick / 2 - 0.4), LENGTH / 12, 1.4, 0.8, [0.03, 0.026, 0.026]);
  s.box(0, -2, 0, LENGTH + 0.05, 4, WALL.thick + 0.6, vary(DIS, 0.2));
  return s.build();
}

// A tower of the wall: square, half as high again, a fire in its crown.
function wallTower(tall = 1) {
  const s = new Sculpt();
  const w = 7.5;
  const h = WALL.h * 1.6 * tall;
  const courses = 8;
  for (let c = 0; c < courses; c++) {
    s.box(0, (h / courses) * (c + 0.5), 0, w - c * 0.08, h / courses - 0.08, w - c * 0.08, vary(DIS, (c * 0.43) % 1), { hot: (0.3 - 0.15 * (c / courses)) * HEAT });
  }
  s.box(0, -2, 0, w + 0.6, 4, w + 0.6, vary(DIS, 0.6));
  for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) s.box((x * (w - 1.2)) / 2, h + 0.9, (z * (w - 1.2)) / 2, 1.3, 1.8, 1.3, [0.03, 0.026, 0.026]);
  // the fire in it
  s.box(0, h + 0.2, 0, w - 3.6, 0.4, w - 3.6, [0.4, 0.1, 0.02], { hot: 0.7 });
  return s.build();
}

// The gate of Dis: two towers and the arch between them, the way through
// WALL.gate wide. It stands across the origin, the wall running off ±x.
function gateOfDis() {
  const s = new Sculpt();
  const half = LENGTH / 2;
  const jamb = (half - WALL.gate / 2) / 1;
  for (const k of [-1, 1]) {
    // what is left of the wall's length either side of the way through
    const cx = k * (WALL.gate / 2 + jamb / 2);
    for (let c = 0; c < 7; c++) s.box(cx, (WALL.h * 1.25 * (c + 0.5)) / 7, 0, jamb, (WALL.h * 1.25) / 7 - 0.06, WALL.thick + 1.6, vary(DIS, (c * 0.37 + k * 0.2 + 1) % 1), { hot: (0.36 - 0.2 * (c / 7)) * HEAT });
  }
  // the arch over the way, and the wall above it
  const spring = 6.2;
  stoneArch(s, 0, spring, WALL.gate / 2, 3.3, 1.3, WALL.thick + 2.4, [0.14, 0.073, 0.049], { hot: 0.16 });
  s.box(0, spring + WALL.gate / 2 + (WALL.h * 1.25 - spring - WALL.gate / 2) / 2 + 0.6, 0, WALL.gate + 1, WALL.h * 1.25 - spring - WALL.gate / 2 - 0.6, WALL.thick + 1.6, vary(DIS, 0.5), { hot: 0.2 * HEAT });
  // the high tower over it, where the Furies stand, its top burning
  const th = 38;
  for (let c = 0; c < 6; c++) s.box(0, WALL.h * 1.25 + ((th - WALL.h * 1.25) * (c + 0.5)) / 6, 0.8, 7 - c * 0.2, (th - WALL.h * 1.25) / 6 - 0.08, 6 - c * 0.2, vary(DIS, (c * 0.29) % 1), { hot: (0.22 + 0.1 * (c / 6)) * HEAT });
  s.box(0, th + 0.2, 0.8, 2.6, 0.4, 2.2, [0.4, 0.1, 0.02], { hot: 0.7 });
  for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) s.box(x * 2.9, th + 0.9, 0.8 + z * 2.4, 1.1, 1.8, 1.1, [0.03, 0.026, 0.026]);
  s.box(0, -2, 0, LENGTH, 4, WALL.thick + 2.4, vary(DIS, 0.3));
  return s.build();
}

// A mosque of the city, seen over the wall: a drum, a dome, a minaret,
// "vermilion, as if issuing from the fire".
function mosque(seed = 0) {
  const s = new Sculpt();
  const k = 1 + (seed % 3) * 0.25;
  s.drum(0, -1, 0, 5.2 * k, 5.6 * k, 9 * k, vary(DIS, 0.3), { sides: 8, hot: 0.42 * HEAT });
  s.ball(0, 8 * k, 0, 5.3 * k, vary(DIS, 0.7), { sy: 0.9, hot: 0.5 * HEAT });
  s.drum(7.5 * k, -1, 2 * k, 0.9, 1.2, 19 * k, vary(DIS, 0.5), { sides: 6, hot: 0.4 * HEAT });
  s.drum(7.5 * k, 18 * k, 2 * k, 0.05, 1.3, 2.6, [0.2, 0.06, 0.03], { sides: 6, hot: 0.7 });
  return s.build();
}

// The tower on the near shore of Styx: tall and thin, two small fires at
// its top to call the boat.
function shoreTower() {
  const s = new Sculpt();
  const h = 27;
  for (let c = 0; c < 9; c++) s.drum(0, (h / 9) * c - (c === 0 ? 2 : 0), 0, 2.5 - c * 0.07, 2.6 - c * 0.07, h / 9 + (c === 0 ? 2 : 0), vary([0.06, 0.058, 0.055], (c * 0.41) % 1), { sides: 9 });
  s.drum(0, h, 0, 3.2, 2.6, 0.9, vary([0.06, 0.058, 0.055], 0.5), { sides: 9 });
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    s.box(Math.cos(a) * 2.9, h + 1.6, Math.sin(a) * 2.9, 0.9, 1.4, 0.7, [0.03, 0.03, 0.03], { ry: -a });
  }
  return s.build();
}

// A castle of Limbo: seven walls ringed round a keep, their gates in a
// line (toward -z here: the caller turns that to face the river), and a
// light in the keep's lantern.
function castle() {
  const s = new Sculpt();
  CASTLE.walls.forEach((ring, w) => {
    const n = Math.round((2 * Math.PI * ring) / 5.4);
    const h = CASTLE.h + (w === CASTLE.walls.length - 1 ? 0.8 : 0);
    // each ring stands where the knoll has fallen to by then (land.js)
    const t = Math.min(1, Math.max(0, (ring - 18) / (CASTLE.moat - 10 - 18)));
    const y0 = -CASTLE.knoll * t * t * (3 - 2 * t);
    for (let i = 0; i < n; i++) {
      const a = ((i + 0.5) / n) * Math.PI * 2;
      const x = Math.sin(a) * ring;
      const z = -Math.cos(a) * ring;
      // leave the gate: the stretch about -z
      const across = Math.abs(x);
      if (z < 0 && across < CASTLE.gate / 2 + 0.3) continue;
      const len = (2 * Math.PI * ring) / n + 0.08;
      s.box(x, y0 + h / 2 - 1, z, len, h + 2, CASTLE.thick, vary(GREY, (i * 0.37 + w * 0.13) % 1, 0.14), { ry: -a });
      if (i % 2 === 0) s.box(x, y0 + h + 0.45, z, len * 0.5, 0.9, CASTLE.thick, vary(GREY, (i * 0.11) % 1, 0.14), { ry: -a });
      if ((i + w * 2) % 9 === 4) {
        const tall = h + 2.5 + (6 - w) * 0.48;
        s.box(x, y0 + tall / 2 - 0.9, z, 3.5, tall + 1.8, 3.1, vary(GREY, 0.24), { ry: -a });
        s.box(x, y0 + tall, z, 3.86, 0.55, 3.46, vary(GREY, 0.65), { ry: -a });
        s.box(x, y0 + tall + 0.51, z, 2.6, 0.65, 2.5, vary(GREY, 0.42), { ry: -a });
      }
    }
    // Build the arch at its own origin and put its opening on the gate line.
    s.frame = new THREE.Matrix4().makeTranslation(0, y0, -ring);
    for (const side of [-1, 1]) {
      const x = side * (CASTLE.gate / 2 + 0.69);
      s.box(x, h / 2, 0, 1.35, h + 3, CASTLE.thick + 1.1, vary(GREY, 0.7));
      s.box(x, h + 1.54, 0, 1.59, 0.48, CASTLE.thick + 1.44, vary(GREY, 0.5));
    }
    stoneArch(s, 0, 3.3, CASTLE.gate / 2, 2.25, 0.55, CASTLE.thick + 0.87, GREY);
    s.box(0, h + 0.29, 0, CASTLE.gate + 0.8, 0.62, CASTLE.thick + 0.6, vary(GREY, 0.4));
    s.frame = null;
  });
  // The keep rises in three stone terraces to an open colonnade.
  for (let i = 0; i < 3; i++) {
    const base = i * 7;
    const width = 37 - i * 7;
    const depth = 31 - i * 5.2;
    s.box(0, base + 2.8, 0, width, 8.6, depth, vary(GREY, 0.28 + i * 0.16));
    s.box(0, base + 6.8, 0, width + 0.9, 0.56, depth + 0.8, vary(GREY, 0.64));
    for (const side of [-1, 1]) {
      for (let j = -2; j <= 2; j++) {
        s.box(j * width * 0.16, base + 3.6, side * depth / 2, 1.3, 6.2, 0.75, vary(GREY, 0.46));
      }
    }
  }
  s.box(0, 22, 0, 20, 2.1, 16, GREY);
  for (const z of [-7, 7]) for (let x = -8; x <= 8; x += 3.2) {
    s.drum(x, 23, z, 0.43, 0.6, 7.6, vary(GREY, 0.74), { sides: 10 });
    s.box(x, 30.3, z, 1.17, 0.48, 1.12, GREY);
  }
  s.box(0, 31.2, 0, 20, 1, 16, vary(GREY, 0.6));
  for (const side of [-1, 1]) {
    s.quad([side * 10.1, 31.7, -8.1], [0, 35.3, -8.1], [0, 35.3, 8.1], [side * 10.1, 31.7, 8.1], vary(GREY, 0.24));
    for (const z of [-8, 8]) s.quad([side * 10, 31.7, z], [0, 31.7, z], [0, 35.3, z], [side * 0.01, 35.29, z], GREY);
  }
  s.ball(0, 27, 0, 1.6, [1, 0.86, 0.6], { hot: 1 });
  return s.build();
}

// Carved arches in the scarp above the outer edge of the three upper rings.
// At ground level the piers are sunk into the existing cliff face.
function arcade(kind) {
  const s = new Sculpt();
  const broken = kind === 'lustful';
  const colour = broken ? [0.092, 0.09, 0.104] : kind === 'gluttons' ? [0.075, 0.084, 0.087] : [0.16, 0.126, 0.086];
  const span = 14;
  const spring = broken ? 18 : 21;
  for (let i = -3; i <= 3; i++) {
    const x = (i + 0.5) * span;
    const height = spring * (broken && (i === -2 || i === 2) ? 0.58 : 1);
    s.box(x, height / 2 - 2.5, 0, 2.45, height + 5, 5.2, vary(colour, 0.4));
    s.box(x, height - 0.4, 0, 3.65, 1.15, 5.85, vary(colour, 0.63));
    s.drum(x, -4, 2.45, 0.43, 0.82, height + 4, vary(colour, 0.72), { sides: 7 });
  }
  for (let i = -2; i <= 3; i++) {
    const x = i * span;
    if (broken && (i === -1 || i === 2 || i === 3)) continue;
    const last = broken && i === -2 ? 4 : 12;
    stoneArch(s, x, spring, span / 2 - 1.2, 9.5, 1.18, 4.8, colour, { last });
    if (!broken) stoneArch(s, x, spring, span / 2 - 1.2, 9.5, 0.32, 5.75, vary(colour, 0.74));
  }
  if (!broken) {
    s.box(7, 33.1, -0.52, 85, 1.6, 6.1, vary(colour, 0.61));
    s.box(7, 35.1, -0.52, 84, 2.7, 4.9, vary(colour, 0.27));
  }
  return s.build();
}

// ── The falls ───────────────────────────────────────────────────────────────
// The brook going over the brink: a ribbon down the cliff's face, drawn
// running. `profile(d)` is how far out from the brink's lip (m) the cliff is
// d m down.
function fallsGeometry(height, width) {
  const N = 24;
  const pos = [];
  const uv = [];
  const idx = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    // out over the lip, then down, spreading a little
    const out = 2.5 + 30 * Math.pow(t, 0.55);
    const w = (width / 2) * (1 + t * 1.4);
    pos.push(-w, -height * Math.pow(t, 1.25), out, w, -height * Math.pow(t, 1.25), out);
    uv.push(0, t, 1, t);
    if (i < N) {
      const b = i * 2;
      idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

function createFallsMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: SHARED.uTime, uSeeFar: SEEN.uSeeFar },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying float vFar;
      void main() {
        vUv = uv;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vFar = length(mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      ${NOISE_GLSL}
      uniform float uTime;
      uniform float uSeeFar;
      varying vec2 vUv;
      varying float vFar;
      void main() {
        if (vFar > uSeeFar) discard;
        float x = abs(vUv.x - 0.5) * 2.0;
        // streaks falling, faster the further down
        float fall = vUv.y * 14.0 - uTime * (1.2 + vUv.y * 2.0);
        float n = fbm4(vec2(vUv.x * 9.0, fall)) * 0.7 + vnoise(vec2(vUv.x * 31.0, fall * 2.3)) * 0.3;
        float edge = smoothstep(1.0, 0.55, x + (n - 0.5) * 0.5);
        float a = edge * smoothstep(0.25, 0.6, n + (1.0 - vUv.y) * 0.35);
        if (a < 0.04) discard;
        vec3 col = mix(vec3(0.16, 0.012, 0.008), vec3(0.5, 0.05, 0.03), smoothstep(0.5, 0.9, n));
        // spray where it lands
        col += vec3(0.25, 0.1, 0.08) * smoothstep(0.85, 1.0, vUv.y);
        gl_FragColor = vec4(col * 0.55, a * 0.92);
      }`,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

// ── Where they stand ────────────────────────────────────────────────────────
// The light from a fire on something built: one at (x, y, z) `size` wide and
// `tall` high (the flame's own scale), from its upper part.
const LIT_NEAR = 160; // m: further off than this, a built fire lights nothing you'd see
function fireLight(x, y, z, size, tall, seed) {
  const big = Math.sqrt(size * tall);
  return { x, y: y + tall * 0.6, z, color: [1, 0.4, 0.12], power: 16 * big * big, range: 16 * big, decay: 2, flicker: seed % 97 };
}

export class Structures {
  // land: Hell's · group: where its meshes go · stone, fire: what the built
  // things and their flames are drawn with (look.js, shades.js)
  constructor({ land, group, stone, fire }) {
    this.land = land;
    this.group = group;
    this.stone = stone;
    this.fire = fire;
    this.bridges = null;
    this.sectors = new Map(); // k -> THREE.Group
    this.wallAt = null; // the length the wall was last laid out round
    this.shapes = {};
    this.flame = flameGeometry();
    this.falls = createFallsMaterial();
    // lengths of wall and their towers: two meshes, set out again as you go
    const cap = 2 * Math.ceil(WALL_NEAR / LENGTH) + 8;
    this.wall = new THREE.InstancedMesh(wallLength(), stone, cap);
    this.towers = new THREE.InstancedMesh(wallTower(), stone, Math.ceil(cap / TOWER_EVERY) + 2);
    this.towerFires = new THREE.InstancedMesh(stillFlames(this.flame, Math.ceil(cap / TOWER_EVERY) + 2), fire, Math.ceil(cap / TOWER_EVERY) + 2);
    // the light in a castle's lantern: one lamp, there from the start (a
    // light that came and went would have every material made again), put in
    // whichever castle is nearest
    this.lamp = new THREE.PointLight(0xffe2b0, 0, 280, 1.6);
    this.castles = new Map(); // k -> where its lantern is
    group.add(this.lamp);
    // the light the fires give, on the towers and in the sector's own places
    // (render/lights.js): lightsNear()
    this.towerLit = [];
    this.towerFires.layers.set(OVER); // (as a flame must be: render/flame.js)
    this.haze = createFlameHaze();
    for (const m of [this.wall, this.towers, this.towerFires]) {
      m.count = 0;
      m.frustumCulled = false;
      m.visible = false;
      group.add(m);
    }
    this.wall.castShadow = this.wall.receiveShadow = true;
    this.towers.castShadow = this.towers.receiveShadow = true;
    // the air over the towers' fires shimmering
    this.towerHaze = hazeOver(this.towerFires, this.haze);
    this.towerHaze.visible = false;
    group.add(this.towerHaze);
  }

  _shape(name, make) {
    return (this.shapes[name] ||= make());
  }

  // Where (r, th) is in the world, as a Vector3 at height h over Hell's top.
  _at(r, th, h, out = _v) {
    this.land.place(r, th, _p);
    return out.set(_p.x, this.land.top + h, _p.z);
  }

  // Which way is inward at angle th, as a turn about y (+z of a shape to the axis).
  _inward(th) {
    return Math.atan2(-Math.cos(th + this.land.turn), -Math.sin(th + this.land.turn));
  }

  // r, th: where you are in Hell
  update(r, th) {
    this._bridges(r);
    this._wall(r, th);
    const k0 = this.land.sectorOf(th);
    const want = new Set();
    for (let k = k0 - 2; k <= k0 + 2; k++) {
      // (how far off a sector is: along the arc at your radius, roughly)
      if (Math.abs(k * SECTOR - th) * Math.max(r, R.brink) > SIGHT + SECTOR * r * 0.5) continue;
      want.add(k);
      if (!this.sectors.has(k)) this._sector(k);
    }
    for (const [k, g] of this.sectors) {
      if (want.has(k)) continue;
      this.group.remove(g);
      g.traverse((o) => {
        if (o.isInstancedMesh) o.dispose();
        else if (o.geometry && o.userData.own) o.geometry.dispose();
      });
      this.sectors.delete(k);
      this.castles.delete(k);
    }
    // the lamp, in the nearest castle
    let best = null;
    this.land.place(r, th, _p);
    for (const at of this.castles.values()) {
      const d = Math.hypot(at.x - _p.x, at.z - _p.z);
      if (!best || d < best.d) best = { at, d };
    }
    this.lamp.intensity = best ? LAMP : 0;
    if (best) this.lamp.position.copy(best.at);
  }

  // The fires near `eye` that give light (render/lights.js), onto out.
  lightsNear(eye, out) {
    const near = (f) => Math.abs(f.x - eye.x) < LIT_NEAR && Math.abs(f.z - eye.z) < LIT_NEAR;
    if (this.wall.visible) for (const f of this.towerLit) if (near(f)) out.push(f);
    for (const g of this.sectors.values()) for (const f of g.userData.lit) if (near(f)) out.push(f);
  }

  // The bridges: one over every ditch but the sixth, along every spoke.
  _bridges(r) {
    if (this.bridges || r > PIT_NEAR) return;
    const L = this.land;
    const n = L.spokes.length * (BOLGE.n - 1);
    const mesh = new THREE.InstancedMesh(this._shape('bridge', bridge), this.stone, n);
    let a = 0;
    for (const th of L.spokes) {
      for (let i = 0; i < BOLGE.n; i++) {
        if (i === BOLGE.broken) continue;
        const r0 = bolgeOuter(i) - BOLGE.bank;
        this._at(r0, th, bankTop(i) - (BOLGE.tilt * BOLGE.bank) / BOLGE.pitch);
        _q.setFromEuler(_e.set(0, this._inward(th), 0));
        mesh.setMatrixAt(a++, _m.compose(_v, _q, _s));
      }
    }
    mesh.frustumCulled = false;
    mesh.castShadow = mesh.receiveShadow = true;
    this.group.add(mesh);
    this.bridges = mesh;
  }

  // The wall of Dis, in lengths round the stretch nearest you.
  _wall(r, th) {
    const near = Math.abs(r - WALL.r) < WALL_NEAR;
    this.wall.visible = this.towers.visible = this.towerFires.visible = this.towerHaze.visible = near;
    if (!near) return;
    const L = this.land;
    const per = LENGTH / WALL.r; // radians a length
    const mine = Math.round(th / per);
    if (this.wallAt === mine) return;
    this.wallAt = mine;
    const half = Math.ceil(Math.sqrt(Math.max(0, WALL_NEAR ** 2 - (r - WALL.r) ** 2)) / LENGTH);
    let w = 0;
    let t = 0;
    for (let i = mine - half; i <= mine + half && w < this.wall.instanceMatrix.count; i++) {
      const a = i * per;
      // not where a gate stands
      const gate = L.sector(L.sectorOf(a)).quay;
      if (Math.abs(a - gate) * WALL.r < LENGTH * 0.75) continue;
      this._at(WALL.r, a, H.dis);
      _q.setFromEuler(_e.set(0, this._inward(a), 0));
      this.wall.setMatrixAt(w++, _m.compose(_v, _q, _s));
      if (((i % TOWER_EVERY) + TOWER_EVERY) % TOWER_EVERY === 0 && t < this.towers.instanceMatrix.count) {
        this._at(WALL.r, a + per / 2, H.dis);
        this.towers.setMatrixAt(t, _m.compose(_v, _q, _s));
        _v.y += WALL.h * 1.6 + 0.3;
        this.towerFires.setMatrixAt(t, _m.compose(_v, _q, _s.set(3.2, 4.2, 3.2)));
        _s.set(1, 1, 1);
        t++;
      }
    }
    this.wall.count = w;
    this.towers.count = this.towerFires.count = this.towerHaze.count = t;
    this.towerLit.length = 0;
    const m = new THREE.Matrix4();
    for (let i = 0; i < t; i++) {
      this.towerFires.getMatrixAt(i, m);
      this.towerLit.push(fireLight(m.elements[12], m.elements[13], m.elements[14], 3.2, 4.2, i));
    }
    this.wall.instanceMatrix.needsUpdate = this.towers.instanceMatrix.needsUpdate = this.towerFires.instanceMatrix.needsUpdate = true;
  }

  // What sector k has of its own.
  _sector(k) {
    const L = this.land;
    const s = L.sector(k);
    const g = new THREE.Group();
    const add = (geo, mat, r, th, h, yaw, own = false) => {
      const mesh = new THREE.Mesh(geo, mat);
      this._at(r, th, h, mesh.position);
      mesh.rotation.y = yaw;
      mesh.userData.own = own;
      mesh.castShadow = mesh.receiveShadow = mat === this.stone;
      g.add(mesh);
      return mesh;
    };
    const fires = [];
    const fire = (r, th, h, size, tall) => fires.push([this._at(r, th, h).clone(), size, tall]);

    // Rock-cut ruins beside each descent, clear of the ramp itself.
    const arcades = ['lustful', 'gluttons', 'avaricious'];
    arcades.forEach((kind, i) => {
      const step = STEPS[i];
      const a = s.pass[i] - 105 / step.at;
      add(this._shape(kind, () => arcade(kind)), this.stone, step.at - 3, a, step.lo + 5, this._inward(a));
    });

    // the gate of Dis, the mosques behind the wall either side of it
    add(this._shape('gate', gateOfDis), this.stone, WALL.r, s.quay, H.dis, this._inward(s.quay));
    fire(WALL.r - 0.8, s.quay, H.dis + 38.4, 3.4, 5);
    for (let i = 0; i < 5; i++) {
      const off = ((i - 2) * 46 + (i % 2) * 17) / WALL.r;
      add(this._shape(`mosque${i % 3}`, () => mosque(i % 3)), this.stone, WALL.r - 34 - (i % 3) * 22, s.quay + off + 0.012, H.dis, this._inward(s.quay) + i);
    }
    // the tower on the near shore, by the spit the way down ends in
    const shore = STEPS[3].at - STEPS[3].w / 2 + 6;
    add(this._shape('shoreTower', shoreTower), this.stone, shore, s.pass[3] + 16 / shore, STEPS[3].lo, 0);
    for (const side of [-1, 1]) fire(shore + side * 1.1, s.pass[3] + 16 / shore, STEPS[3].lo + 28.6, 0.8, 1.5);

    // a castle, if this sector of Limbo has one
    if (s.castle === s.castle) {
      // its gates face out, toward the river: -z of the shape to the outside
      add(this._shape('castle', castle), this.stone, CASTLE.r, s.castle, H.limbo + CASTLE.knoll, this._inward(s.castle));
      this.castles.set(k, this._at(CASTLE.r, s.castle, H.limbo + CASTLE.knoll + 27).clone());
    }

    // the brook's fall over the brink
    const lip = R.brink + STEPS[5].w / 2;
    const falls = add(this._shape('falls', () => fallsGeometry(H.c7 - H.bolge - 4, FALL_WIDE)), this.falls, lip - 4, s.brook, H.c7 + BROOK.level + 0.2, this._inward(s.brook));
    falls.renderOrder = 2;

    g.userData.lit = fires.map(([at, size, tall], i) => fireLight(at.x, at.y, at.z, size, tall, k * 31 + i));
    if (fires.length) {
      const fm = new THREE.InstancedMesh(stillFlames(this.flame, fires.length), this.fire, fires.length);
      fm.layers.set(OVER);
      fires.forEach(([at, size, tall], i) => fm.setMatrixAt(i, _m.compose(at, _q.identity(), _v.set(size, tall, size))));
      fm.frustumCulled = false;
      g.add(fm, hazeOver(fm, this.haze));
    }
    this.group.add(g);
    this.sectors.set(k, g);
  }
}
