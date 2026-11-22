// Waves breaking on a shore: sets of them rolling in at one place, rearing
// up as the water shoals, breaking at the peak and peeling away along the
// crest, and rolling on in as white water up the beach.
//
// The sea everywhere else only rises and falls in a slow, low swell
// (waterSurface.js). A break is somewhere a feature has found the coast will
// take one (surfing/spots.js) and handed it here, as what the sea there is
// like: where on the shore, which way is out to sea, how far out the shore
// lies along the stretch of it either side, how deep the sea gets going out,
// and how big the waves come in, how often, and how fast they peel. Nothing
// here reads the land; the break is the whole of what is known.
//
// How it goes, in the break's own frame: u is how far out to sea (along the
// way out, n), v how far along the shore (t, n turned a quarter left), both
// from the break's point on the shore.
//
//   - Each wave comes in from `far` m out as a crest along the shore. It
//     slows as the water shoals (a wave in shallow water goes at √(g·depth)),
//     so where a crest is, by time since it came in, is worked out once from
//     the depths and kept as a table (CREST_N steps): the same table for the
//     water's shader as for anyone asking here.
//   - The crest follows the shore: at v it is that far out from where the
//     shore is at v (the `shore` table), so waves wrap into a cove.
//   - It comes in first at the peak (v = 0) and later either side of it,
//     1/peel s for each metre along, so it breaks there first and the break
//     runs away along the crest at `peel` m/s: the line a surfer rides.
//   - It stands higher as the water shoals (H ∝ depth^-¼), its face drawing
//     up steeper and hollow, until it is GAMMA times as high as the water is
//     deep, and breaks: the lip throws and falls while the water shoals to LIP
//     of the depth it broke in, and after that it is white water, rolling in
//     BORE times as high as the water is deep, up the beach and gone.
//   - Waves come in sets: SET waves of a CYCLE are the big ones, the rest
//     small, and the small ones break further in.
//
// Everything a wave is at a place is worked out from two numbers about it
// (how long since it came in, how high it breaks) and the tables; so each
// frame update() finds the waves in, and the water's shader is handed those
// and the tables (BREAKERS in render/uniforms.js) and works out the same as
// here, in BREAKER_GLSL: the waves you see are the waves that carry you.
//
// Pure: no three.js in here, so the tests can ride it.
//
// A break (set()):
//   x, z      its point on the shore, where the peak breaks in to
//   nx, nz    the way out to sea there (unit)
//   span      m either side along the shore the shore table reaches
//   shore     SHORE_N numbers: how far out (m along n) the shore lies, from
//             v = -span to +span
//   far       m out the depth table reaches, and waves come in from
//   depth     DEPTH_N numbers: how deep the sea is (m) going out from the
//             shore, from 0 to far
//   size      m: how high a set wave stands as it breaks
//   period    s between waves
//   peel      m/s the break runs along the crest
//   reach     [m, m] along the shore, toward -v and +v, that it breaks
//   seed      for the waves' sizes and timing

import { mulberry32 } from '../noise.js';

export const BREAKER = {
  gravity: 9.8, // m/s², for how fast a wave goes in shallow water
  gamma: 0.78, // a wave breaks once it stands this many times as high as the water is deep
  lip: 0.62, // ...its lip has fallen once the water is this much of the depth it broke in
  bore: 0.5, // white water rolls in this many times as high as the water is deep
  least: 0.25, // m: a crest is slowed as if by water no shallower than this, so it never stops
  runup: 5, // m up the beach past the waterline the white water runs
  round: 8, // m: how round the peak is, where the crest comes in first
  fade: 40, // m along the shore past `reach` over which the waves die away
  waves: 10, // the most waves in at once (and in the shader)
  // a set: CYCLE waves, the first SET of them big, each this much of `size`
  cycle: 9,
  set: [0.8, 0.95, 1.05, 1, 0.9, 0.85],
  small: [0.38, 0.52], // ...and the rest between these
  // the shape across a crest: how long its back is, of the wavelength there;
  // the face is that, drawn in by up to `hollow` as it steepens; neither
  // shorter than these (m)
  back: 0.3,
  hollow: 0.65,
  shortest: [3, 0.9],
};

// The tables' sizes (each a whole number of fours: they go to the shader as vec4s).
export const SHORE_N = 20;
export const DEPTH_N = 28;
export const CREST_N = 48;

const _o = { rise: 0, gu: 0, gv: 0, fu: 0, fv: 0 };
const _w = { u: 0, U: 0, H: 0, r: 0, lip: 0, back: 0, face: 0, steep: 0, c: 0, dx: 0 };
const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);
const smooth = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
const mix = (a, b, t) => a + (b - a) * t;
// A table of n values over [lo, hi], read between its steps (held at its ends).
function table(a, n, lo, hi, x) {
  const f = clamp(((x - lo) / (hi - lo)) * (n - 1), 0, n - 1);
  const i = Math.min(n - 2, Math.floor(f));
  return a[i] + (a[i + 1] - a[i]) * (f - i);
}

// The crest of a wave coming in over these depths (m, DEPTH_N of them from
// the shore out to far): where it is (m out), at CREST_N even steps of time
// from when it comes in at far until it has run BREAKER.runup up the beach,
// and how long that takes (s).
export function crestTable(depth, far) {
  const step = 0.05;
  const path = [far];
  let u = far;
  while (u > -BREAKER.runup && path.length < 1e5) {
    u -= Math.sqrt(BREAKER.gravity * Math.max(depthAt(depth, far, u), BREAKER.least)) * step;
    path.push(u);
  }
  const end = (path.length - 1) * step;
  const crest = new Float32Array(CREST_N);
  for (let i = 0; i < CREST_N; i++) {
    const f = (i / (CREST_N - 1)) * (path.length - 1);
    const j = Math.min(path.length - 2, Math.floor(f));
    crest[i] = path[j] + (path[j + 1] - path[j]) * (f - j);
  }
  return { crest, end };
}

// How deep the sea is (m) u m out from the shore: from the table, and up the
// beach (u < 0) as steep as it starts.
export function depthAt(depth, far, u) {
  if (u < 0) return (u * depth[1] * (DEPTH_N - 1)) / far;
  return table(depth, DEPTH_N, 0, far, u);
}

export class Breakers {
  // uniforms: BREAKERS (render/uniforms.js) to keep up to date, or null
  constructor(uniforms = null) {
    this.u = uniforms;
    this.spot = null;
    this.time = 0; // s, the break's own clock
    this.on = 0; // 0..1, faded in as a break is set
    this.crest = null;
    this.end = 0; // s from coming in to gone up the beach
    // the waves in now: { k, tau (s since it came in at the peak), h (m it breaks at) }
    this.waves = [];
    this._sizes = new Map();
  }

  // The break to roll in, or null for none. (The same one again changes nothing.)
  set(spot) {
    if (spot === this.spot) return;
    this.spot = spot || null;
    this.waves.length = 0;
    this._sizes.clear();
    this.on = 0;
    if (!spot) return this._write();
    const { crest, end } = crestTable(spot.depth, spot.far);
    this.crest = crest;
    this.end = end;
    this.tx = -spot.nz;
    this.tz = spot.nx;
    this._rng = spot.seed >>> 0;
    // the longest a wave takes to be gone, either end of where it breaks
    this.late = this.delay(Math.max(spot.reach[0], spot.reach[1]) + BREAKER.fade);
    this.update(0);
  }

  // s after the peak that the crest comes in at v m along the shore
  delay(v) {
    const a = BREAKER.round;
    return (Math.sqrt(v * v + a * a) - a) / this.spot.peel;
  }

  // When the k-th wave comes in at the peak (s on the break's clock), and how
  // high it breaks (m).
  _wave(k) {
    let w = this._sizes.get(k);
    if (w) return w;
    const S = this.spot;
    const B = BREAKER;
    const r = mulberry32((this._rng ^ Math.imul(k, 0x9e3779b1)) >>> 0);
    const j = ((k % B.cycle) + B.cycle) % B.cycle;
    const m = Math.floor(k / B.cycle);
    const setR = mulberry32((this._rng ^ Math.imul(m, 0x85ebca6b) ^ 0x5e7) >>> 0)();
    const big = j < B.set.length ? B.set[j] * (0.85 + 0.3 * setR) : mix(B.small[0], B.small[1], r());
    w = { k, at: (k + 0.3 * (r() - 0.5)) * S.period, h: S.size * big };
    this._sizes.set(k, w);
    if (this._sizes.size > 64) this._sizes.delete(this._sizes.keys().next().value);
    return w;
  }

  // Time goes on (s): which waves are in, and the shader told.
  update(dt) {
    const S = this.spot;
    if (!S) return;
    this.time += dt;
    this.on = Math.min(1, this.on + dt / 2);
    const t = this.time;
    this.waves.length = 0;
    const first = Math.floor((t - this.end - this.late) / S.period) - 1;
    const last = Math.floor(t / S.period) + 1;
    for (let k = first; k <= last && this.waves.length < BREAKER.waves; k++) {
      const w = this._wave(k);
      const tau = t - w.at;
      if (tau < 0 || tau - this.late > this.end) continue;
      this.waves.push({ k, tau, h: w.h });
    }
    this._write();
  }

  // ── What a wave is, and the water it raises ───────────────────────────────
  // The k-th of this.waves at v m along the shore: fills and returns
  //   u     m out (along n from the break's point) its crest is
  //   H     m it stands
  //   r     how deep the water under the crest is, of how deep it breaks in:
  //         over 1 still to break, under 1 broken
  //   lip   0 as it breaks .. 1 its lip has fallen; over 1 white water
  //   back, face   m: how long its back and its face are
  //   c     m/s it comes in at
  //   U     m out from the shore at v its crest is
  //   dx    how much further out its crest is for each m along the shore
  // or null where it isn't (not yet come, gone, or past the ends).
  waveAt(i, v, out = _w) {
    const S = this.spot;
    const w = this.waves[i];
    if (!S || !w) return null;
    return this._at(w.tau, w.h, v, out);
  }

  _at(tauK, hK, v, out) {
    const S = this.spot;
    const B = BREAKER;
    const tau = tauK - this.delay(v);
    if (tau < 0 || tau > this.end) return null;
    const side = v < 0 ? S.reach[0] : S.reach[1];
    const H0 = hK * (1 - smooth(side, side + B.fade, Math.abs(v)));
    if (H0 < 0.02) return null;
    const U = table(this.crest, CREST_N, 0, this.end, tau);
    const d = Math.max(depthAt(S.depth, S.far, U), 0);
    const c = Math.sqrt(B.gravity * Math.max(d, B.least));
    const r = d / (H0 / B.gamma);
    let H;
    let steep;
    let lip;
    if (r >= 1) {
      H = H0 * Math.pow(r, -0.25);
      steep = 1 - smooth(1, 1.9, r);
      lip = -1;
    } else {
      lip = (1 - r) / (1 - B.lip);
      H = mix(H0, B.bore * d, smooth(0, 1, lip));
      steep = 1 - 0.3 * smooth(1, 2, lip);
    }
    // in from far out, and gone up the beach
    H *= smooth(0, 0.3, 1 - U / S.far) * smooth(-B.runup, 0.5, U);
    const len = S.period * c;
    const back = clamp(B.back * len, B.shortest[0], 40);
    const ve = clamp((v + S.span) / (2 * S.span), 0, 1) * (SHORE_N - 1);
    const vi = Math.min(SHORE_N - 2, Math.floor(ve));
    const dv = (2 * S.span) / (SHORE_N - 1);
    const shoreSlope = Math.abs(v) < S.span ? (S.shore[vi + 1] - S.shore[vi]) / dv : 0;
    const a = B.round;
    out.u = table(S.shore, SHORE_N, -S.span, S.span, v) + U;
    out.U = U;
    out.H = H;
    out.r = r;
    out.lip = lip;
    out.back = back;
    out.face = Math.max(back * (1 - B.hollow * steep), B.shortest[1]);
    out.steep = steep;
    out.c = c;
    out.dx = shoreSlope + (c * v) / Math.sqrt(v * v + a * a) / S.peel;
    return out;
  }

  // How far (m) the waves raise the water at (x, z) now, and its slope (gx,
  // gz: rise per m) and which way and how fast the water goes there with them
  // (fx, fz, m/s): fills and returns out, or null away from the break. And
  // the wave you're on there, if any: out.wave is null, or (filled into
  // out.on) the one standing highest over the spot:
  //   x       m behind its crest (in front of it, under 0)
  //   H, lip, r, face, back, c, steep   as waveAt()
  //   ix, iz  which way it is coming in (unit)
  sample(x, z, out = {}) {
    const S = this.spot;
    if (!S || !this.on) return null;
    const px = x - S.x;
    const pz = z - S.z;
    const u = px * S.nx + pz * S.nz;
    const v = px * this.tx + pz * this.tz;
    const o = this._sum(u, v, _o);
    if (!o) return null;
    const k = this.on;
    out.wave = null;
    if (o.main >= 0) {
      const m = (out.on ||= {});
      const a = this._at(this.waves[o.main].tau, this.waves[o.main].h, v, _w);
      const n = Math.hypot(1, a.dx);
      m.x = u - a.u;
      m.H = a.H * k;
      m.lip = a.lip;
      m.r = a.r;
      m.face = a.face;
      m.back = a.back;
      m.c = a.c;
      m.steep = a.steep;
      // coming in: against n, and along the shore the way the crest lies
      const iu = -1 / n;
      const iv = a.dx / n;
      m.ix = iu * S.nx + iv * this.tx;
      m.iz = iu * S.nz + iv * this.tz;
      out.wave = m;
    }
    out.rise = o.rise * k;
    out.gx = (o.gu * S.nx + o.gv * this.tx) * k;
    out.gz = (o.gu * S.nz + o.gv * this.tz) * k;
    out.fx = (o.fu * S.nx + o.fv * this.tx) * k;
    out.fz = (o.fu * S.nz + o.fv * this.tz) * k;
    return out;
  }

  // m the water is raised at (x, z), 0 away from the break.
  rise(x, z) {
    const s = this.sample(x, z, _r);
    return s ? s.rise : 0;
  }

  // The waves' sum at (u, v), as BREAKER_GLSL has it.
  _sum(u, v, o) {
    const S = this.spot;
    if (Math.abs(v) > S.span + BREAKER.fade || u > S.far + 50 || u < -60) return null;
    o.rise = o.gu = o.gv = o.fu = o.fv = 0;
    o.main = -1;
    let most = 0;
    for (let i = 0; i < this.waves.length; i++) {
      const w = this.waves[i];
      const a = this._at(w.tau, w.h, v, _w);
      if (!a) continue;
      const x = u - a.u;
      let g = 0;
      let dg = 0;
      if (x >= 0) {
        const q = x / a.back;
        if (q >= 1) continue;
        const p = 1 + 0.6 * a.steep;
        const c0 = 0.5 + 0.5 * Math.cos(Math.PI * q);
        g = Math.pow(c0, p);
        dg = (p * Math.pow(Math.max(c0, 1e-6), p - 1) * -0.5 * Math.PI * Math.sin(Math.PI * q)) / a.back;
      } else {
        const q = -x / a.face;
        if (q >= 1) continue;
        const m = 2 + a.steep;
        const f1 = 0.5 + 0.5 * Math.cos(Math.PI * q);
        const f2 = Math.pow(1 - q, m);
        g = mix(f1, f2, a.steep);
        dg = mix((0.5 * Math.PI * Math.sin(Math.PI * q)) / a.face, (m * Math.pow(1 - q, m - 1)) / a.face, a.steep);
      }
      const h = a.H * g;
      o.rise += h;
      if (h > most) {
        most = h;
        o.main = i;
      }
      const du = a.H * dg;
      o.gu += du;
      o.gv -= du * a.dx;
      // the water under a crest goes in with it, as fast as it stands high
      // for the depth (shallow-water waves)
      const d = Math.max(depthAt(S.depth, S.far, a.U), BREAKER.least);
      const f = (a.c * h) / (d + h);
      const n = Math.hypot(1, a.dx);
      o.fu -= f / n;
      o.fv += (f * a.dx) / n;
    }
    return o;
  }
}
const _r = {};

// ── For the water's shader ──────────────────────────────────────────────────
// The same as Breakers._sum above, from what Breakers._write puts in the
// uniforms (BREAKERS in render/uniforms.js). breakers(rel), rel the drawn
// place less uBreakAt (both slid with the scene: render/origin.js), gives
// (rise, d/dx, d/dz, white): how much of it is white water, 0..1, for the
// foam. Keep the two in step.
const V4 = (n) => n / 4;
export const BREAKER_GLSL = /* glsl */ `
uniform vec2 uBreakAt;
uniform vec4 uBreakWay;   // nx, nz, peel (m/s), on (0..1)
uniform vec4 uBreakSpan;  // span, reach toward -v, reach toward +v, far
uniform vec4 uBreakTime;  // end (s), period (s)
uniform vec4 uBreakShore[${V4(SHORE_N)}];
uniform vec4 uBreakDepth[${V4(DEPTH_N)}];
uniform vec4 uBreakCrest[${V4(CREST_N)}];
uniform vec4 uBreakWaves[${V4(BREAKER.waves * 2)}]; // tau, h of each wave in; h 0 for none
float breakTab(int which, float lo, float hi, float x) {
  float n = which == 0 ? ${SHORE_N.toFixed(1)} : which == 1 ? ${DEPTH_N.toFixed(1)} : ${CREST_N.toFixed(1)};
  float f = clamp((x - lo) / (hi - lo) * (n - 1.0), 0.0, n - 1.0);
  int i = min(int(n) - 2, int(floor(f)));
  int j = i + 1;
  float a, b;
  if (which == 0) { a = uBreakShore[i >> 2][i & 3]; b = uBreakShore[j >> 2][j & 3]; }
  else if (which == 1) { a = uBreakDepth[i >> 2][i & 3]; b = uBreakDepth[j >> 2][j & 3]; }
  else { a = uBreakCrest[i >> 2][i & 3]; b = uBreakCrest[j >> 2][j & 3]; }
  return a + (b - a) * (f - float(i));
}
float breakDepth(float u) {
  float far = uBreakSpan.w;
  if (u < 0.0) return u * uBreakDepth[0][1] * ${(DEPTH_N - 1).toFixed(1)} / far;
  return breakTab(1, 0.0, far, u);
}
vec4 breakers(vec2 rel) {
  vec4 o = vec4(0.0);
  if (uBreakWay.w <= 0.0) return o;
  vec2 n = uBreakWay.xy;
  vec2 tv = vec2(-n.y, n.x);
  float u = dot(rel, n);
  float v = dot(rel, tv);
  float span = uBreakSpan.x;
  float far = uBreakSpan.w;
  if (abs(v) > span + ${BREAKER.fade.toFixed(1)} || u > far + 50.0 || u < -60.0) return o;
  float end = uBreakTime.x;
  float a = ${BREAKER.round.toFixed(1)};
  float delay = (sqrt(v * v + a * a) - a) / uBreakWay.z;
  float side = v < 0.0 ? uBreakSpan.y : uBreakSpan.z;
  float fadeV = 1.0 - smoothstep(side, side + ${BREAKER.fade.toFixed(1)}, abs(v));
  float shore = breakTab(0, -span, span, v);
  float dvs = 2.0 * span / ${(SHORE_N - 1).toFixed(1)};
  float shoreSlope = 0.0;
  if (abs(v) < span) {
    float ve = clamp((v + span) / (2.0 * span), 0.0, 1.0) * ${(SHORE_N - 1).toFixed(1)};
    int vi = min(${SHORE_N - 2}, int(floor(ve)));
    int vj = vi + 1;
    shoreSlope = (uBreakShore[vj >> 2][vj & 3] - uBreakShore[vi >> 2][vi & 3]) / dvs;
  }
  float gu = 0.0;
  for (int k = 0; k < ${BREAKER.waves}; k++) {
    vec2 w = k % 2 == 0 ? uBreakWaves[k >> 1].xy : uBreakWaves[k >> 1].zw;
    float H0 = w.y * fadeV;
    if (H0 < 0.02) continue;
    float tau = w.x - delay;
    if (tau < 0.0 || tau > end) continue;
    float U = breakTab(2, 0.0, end, tau);
    float d = max(breakDepth(U), 0.0);
    float c = sqrt(${BREAKER.gravity.toFixed(2)} * max(d, ${BREAKER.least.toFixed(3)}));
    float r = d / (H0 / ${BREAKER.gamma.toFixed(3)});
    float H, steep, lip;
    if (r >= 1.0) {
      H = H0 * pow(r, -0.25);
      steep = 1.0 - smoothstep(1.0, 1.9, r);
      lip = -1.0;
    } else {
      lip = (1.0 - r) / ${(1 - BREAKER.lip).toFixed(4)};
      H = mix(H0, ${BREAKER.bore.toFixed(3)} * d, smoothstep(0.0, 1.0, lip));
      steep = 1.0 - 0.3 * smoothstep(1.0, 2.0, lip);
    }
    H *= smoothstep(0.0, 0.3, 1.0 - U / far) * smoothstep(${(-BREAKER.runup).toFixed(1)}, 0.5, U);
    float back = clamp(${BREAKER.back.toFixed(3)} * uBreakTime.y * c, ${BREAKER.shortest[0].toFixed(2)}, 40.0);
    float face = max(back * (1.0 - ${BREAKER.hollow.toFixed(3)} * steep), ${BREAKER.shortest[1].toFixed(2)});
    float dx = shoreSlope + c * v / sqrt(v * v + a * a) / uBreakWay.z;
    float x = u - (shore + U);
    float g, dg;
    if (x >= 0.0) {
      float q = x / back;
      if (q >= 1.0) continue;
      float p = 1.0 + 0.6 * steep;
      float c0 = 0.5 + 0.5 * cos(PI * q);
      g = pow(c0, p);
      dg = p * pow(max(c0, 1e-6), p - 1.0) * -0.5 * PI * sin(PI * q) / back;
    } else {
      float q = -x / face;
      if (q >= 1.0) continue;
      float m = 2.0 + steep;
      g = mix(0.5 + 0.5 * cos(PI * q), pow(1.0 - q, m), steep);
      dg = mix(0.5 * PI * sin(PI * q) / face, m * pow(1.0 - q, m - 1.0) / face, steep);
    }
    float du = H * dg;
    o.x += H * g;
    o.y += du;
    o.z -= du * dx;
    // white: feathering along the crest as it comes to break; once broken,
    // its face and crest, and a trail of foam behind
    float wh = (1.0 - smoothstep(1.0, 1.3, r)) * (1.0 - smoothstep(0.2, 1.2, abs(x + 0.2))) * 0.6;
    if (lip >= 0.0) {
      float on = smoothstep(0.05, 0.5, lip);
      float front = x < 0.0 ? 1.0 - smoothstep(0.6, 1.0, -x / face) : exp(-x / (4.0 + 6.0 * min(lip, 2.0)));
      wh = max(wh, on * front);
    }
    o.w = max(o.w, wh * smoothstep(0.05, 0.3, H));
  }
  // (u, v) slope to the world's x, z
  vec2 gw = o.y * n + o.z * tv;
  o.y = gw.x;
  o.z = gw.y;
  o.xyz *= uBreakWay.w;
  return o;
}
`;

// Fill the uniforms from the break and the waves in now.
Breakers.prototype._write = function () {
  const U = this.u;
  if (!U) return;
  const S = this.spot;
  if (!S) {
    U.uBreakWay.value.w = 0;
    return;
  }
  U.uBreakAt.value.set(S.x, S.z);
  U.uBreakWay.value.set(S.nx, S.nz, S.peel, this.on);
  U.uBreakSpan.value.set(S.span, S.reach[0], S.reach[1], S.far);
  U.uBreakTime.value.set(this.end, S.period, 0, 0);
  const put = (vecs, src, n) => {
    for (let i = 0; i < n; i += 4) vecs[i >> 2].set(src[i] ?? 0, src[i + 1] ?? 0, src[i + 2] ?? 0, src[i + 3] ?? 0);
  };
  put(U.uBreakShore.value, S.shore, SHORE_N);
  put(U.uBreakDepth.value, S.depth, DEPTH_N);
  put(U.uBreakCrest.value, this.crest, CREST_N);
  const w = U.uBreakWaves.value;
  for (let k = 0; k < BREAKER.waves; k++) {
    const v = w[k >> 1];
    const wave = this.waves[k];
    const tau = wave ? wave.tau : 0;
    const h = wave ? wave.h : 0;
    if (k % 2 === 0) {
      v.x = tau;
      v.y = h;
    } else {
      v.z = tau;
      v.w = h;
    }
  }
};
