// The saucer (PLAN.md 5.11), 12 m across, modelled after the original's
// frames at 49, 53, 55 and 57 s: a lens of dark gunmetal, convex above and
// below, stepped in rings.
//
// Underneath, from the middle out: the opening (a bore 4 m across, lit
// windows round its wall, vanes in its ceiling) inside a rounded lip that
// carries a thin broken ring of white light and glows when the beam is on;
// a flat ring; a step whose outward face is a row of vents; then the main
// slope, panelled, ribbed between its eight round lamps (each in a housing
// whose cup is lit), with plates and small lights scattered over it; a
// groove; and the rim. The rim is a polished band whose outward face carries
// twenty short strips of light, white with a few amber: so from below they
// show on the near side and are hidden on the far, as in the original. On
// top, two more steps and a low dome.
//
// One material for every metal piece (each tagged with a `part` the shader
// reads), one for every light: two draws. The metal mirrors the night as
// seen from up here (reflections.js), so it reads as metal, with panel
// seams, a tone per panel and the light each lamp spills on the plates
// round it. The small lights are unlit and over 1, for the bloom; what
// glows over a wide area is the metal's own emission, under 1.
import {
  Group, Mesh, Float32BufferAttribute, BoxGeometry, Matrix4, Vector3,
  MeshStandardNodeMaterial, MeshBasicNodeMaterial,
} from 'three/webgpu';
import {
  vec3, float, uniform, positionLocal, atan, length, fract, smoothstep, abs, mix, step, max, min, attribute, hash,
  floor, fwidth, exp, sin, uv, texture, dot, lights as lightsOnly,
} from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { T, ramp } from '../timeline.js';
import { lathe, tagged } from './lathe.js';
import { createHullEnvironment } from './reflections.js';
import { pbr } from '../materials/textures.js';

// Sizes, metres, in the saucer's own frame: y = 0 at the bottom of the lip
// round the opening, the lowest point.
export const SAUCER = {
  radius: 6.0,        // the rim
  rimY: 1.455,        // the middle of the rim's band of lights
  bore: 2.0,          // the opening's radius
  boreTop: 0.86,      // its ceiling
  lampR: 4.4,         // the ring of lamps underneath
  lamps: 8,
};
const TAU = Math.PI * 2;
const LAMP_PHASE = 0.2;        // radians: where the first lamp is
const RIM_DASHES = 20;
const DASH_FILL = 0.56;        // of each dash's share of the rim
const DASH_HALF = 0.035;       // metres: half a dash's height
const AMBER = new Set([2, 6, 11, 17]);
const VENTS = 16;
const RIBS = 24;
const PLATES = 44;
const TICKS = 26;
// The hull's panel seams: how many round, underneath and on top, and the rings (radius underneath, on top).
const SEAMS = { under: 24, top: 32, rings: [[3.0, 5.35], [4.05, 4.3], [4.8, 3.15]] };

// Glows, linear HDR (exposure 0.85). Everything over 1 blooms with its
// whole value (post/pipeline.js), and the saucer's many small lights
// together laid a grey veil over the hull at twice these: kept just high
// enough to read white, and what glows over a wide area (the bore, the lip)
// kept under 1.
const DASH_WHITE = [2.4, 2.45, 2.6];
const DASH_AMBER = [2.5, 1.2, 0.36];
const LAMP_LENS = [3.0, 3.1, 3.3];
const TICK = [1.8, 1.85, 2.0];
const RING = { base: 2.0, on: 4.5, dashes: 64 };   // the lip's broken ring, before and once the beam is called
const CUP_GLOW = 1.5;                     // the inside of a lamp's housing, brightest by the lens
// The lamps' light on the plates round them: strongest a little outward of
// each lamp (the original's bright patch on the rim side of each), metres.
const SPILL = { strength: 0.3, out: 0.3, along: 0.55, across: 0.3 };
const WINDOWS = { base: 0.7, on: 2.6, count: 18 };   // the lit windows round the bore, some dark
const LIP_GLOW = { base: 0.05, on: 0.9 };
const CEILING_GLOW = { base: 0.015, on: 0.9 };

// Metal: colour is the reflectance (F0) for metalness 1.
const GUNMETAL = [0.34, 0.35, 0.37];
// The photo-scanned wear: metres a tile, its mean colour, how much of its
// variation goes into the hull's colour, and the roughness factor it gives.
// (The plate's colour averages 0.028 linear; its roughness runs 0.47 to 0.73.)
const WEAR = { metres: 2.6, mean: 0.028, tone: 0.4, roughFrom: [0.47, 0.73], rough: [0.75, 1.35] };
const ENV_GAIN = 1.0;          // how strongly the hull mirrors reflections.js's night (its own levels are tuned)

// The hull's outline, (radius, height), outward normal to the right of the way it runs.
const LIP = [[2.0, 0.12], [2.03, 0.05], [2.1, 0.012], [2.18, 0.0], [2.42, 0.0], [2.55, 0.02], [2.66, 0.07], [2.72, 0.15], [2.75, 0.22]];
const UNDER = [[2.75, 0.22], [3.3, 0.29], [3.33, 0.31], [3.33, 0.68], [3.62, 0.72], [3.66, 0.76], [5.18, 1.02], [5.2, 1.07],
  [5.62, 1.12], [5.66, 1.16], [5.7, 1.15], [5.93, 1.22]];
const RIM = [[5.93, 1.22], [6.0, 1.29], [6.0, 1.33], [5.985, 1.345], [5.985, 1.365], [6.0, 1.38], [6.0, 1.55], [5.97, 1.61], [5.9, 1.64]];
const TOP = [[5.9, 1.64], [4.8, 1.86], [4.77, 1.92], [3.7, 2.08], [3.67, 2.14], [2.62, 2.24], [2.5, 2.27], [2.45, 2.34]];
const DOME = { r: 2.42, y: 2.34, h: 0.82 };
// The main slope underneath, between the vent step and the groove.
const SLOPE = { r0: 3.66, y0: 0.76, r1: 5.18, y1: 1.02 };

// Parts, as the shader reads them.
const P = { hull: 0, detail: 1, vent: 2, dome: 3, cup: 4, boreWall: 5, ceiling: 6, lip: 7, rim: 8 };

// A small seeded random, so the plates and small lights stay where they are.
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s ^ (s >>> 15), 2246822507) + 0x9e3779b9) >>> 0;
    s = Math.imul(s ^ (s >>> 13), 3266489909) >>> 0;
    return ((s ^ (s >>> 16)) >>> 0) / 4294967296;
  };
}

// The slope's height at radius r, and its outward normal and up-slope direction in (r, y).
function slopeAt(r) {
  const f = (r - SLOPE.r0) / (SLOPE.r1 - SLOPE.r0);
  return SLOPE.y0 + f * (SLOPE.y1 - SLOPE.y0);
}
const SLOPE_DR = SLOPE.r1 - SLOPE.r0;
const SLOPE_DY = SLOPE.y1 - SLOPE.y0;
const SLOPE_L = Math.hypot(SLOPE_DR, SLOPE_DY);
const SLOPE_N = [SLOPE_DY / SLOPE_L, -SLOPE_DR / SLOPE_L];   // outward (down and out)
const SLOPE_T = [SLOPE_DR / SLOPE_L, SLOPE_DY / SLOPE_L];   // up the slope, outward

const _m = new Matrix4();
const _x = new Vector3();
const _y = new Vector3();
const _z = new Vector3();
const _p = new Vector3();

// A frame on the slope at (r, angle): x up the slope, y out of the hull, z round.
function slopeFrame(r, angle, lift = 0) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  _x.set(SLOPE_T[0] * c, SLOPE_T[1], SLOPE_T[0] * s);
  _y.set(SLOPE_N[0] * c, SLOPE_N[1], SLOPE_N[0] * s);
  _z.crossVectors(_x, _y);
  _p.set(r * c, slopeAt(r), r * s).addScaledVector(_y, lift);
  return _m.makeBasis(_x, _y, _z).setPosition(_p).clone();
}

// A frame on the vent step's outward face at angle: x round, y up, z out.
function stepFrame(angle, y, r) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  _x.set(s, 0, -c);
  _y.set(0, 1, 0);
  _z.set(c, 0, s);
  _p.set(r * c, y, r * s);
  return _m.makeBasis(_x, _y, _z).setPosition(_p).clone();
}

function box(w, h, d, part, matrix) {
  return tagged(new BoxGeometry(w, h, d), part).applyMatrix4(matrix);
}

// Attributes the light pieces carry: their glow and whether the ring drives them.
function glowing(geo, glow, kind) {
  const n = geo.attributes.position.count;
  const g = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) g.set(glow, i * 3);
  geo.setAttribute('glow', new Float32BufferAttribute(g, 3));
  geo.setAttribute('kind', new Float32BufferAttribute(new Float32Array(n).fill(kind), 1));
  geo.deleteAttribute('part');
  return geo;
}

function buildMetal() {
  const pieces = [
    lathe([[0, SAUCER.boreTop], [SAUCER.bore, SAUCER.boreTop]], { segments: 128, part: P.ceiling }),
    lathe([[SAUCER.bore, SAUCER.boreTop], [SAUCER.bore, 0.12]], { segments: 128, part: P.boreWall }),
    lathe(LIP, { segments: 192, part: P.lip }),
    lathe(UNDER, { segments: 256, part: P.hull }),
    lathe(RIM, { segments: 256, part: P.rim }),
    lathe(TOP, { segments: 256, part: P.hull }),
  ];
  const dome = [];
  for (let i = 0; i <= 14; i++) {
    const a = (i / 14) * (Math.PI / 2);
    dome.push([DOME.r * Math.cos(a), DOME.y + DOME.h * Math.sin(a)]);
  }
  pieces.push(lathe(dome, { segments: 128, part: P.dome }));

  // The lamps' housings: a short drum standing out of the slope, its cup lit.
  for (let k = 0; k < SAUCER.lamps; k++) {
    const m = slopeFrame(SAUCER.lampR, LAMP_PHASE + (k / SAUCER.lamps) * TAU);
    pieces.push(lathe([[0.3, -0.03], [0.3, 0.075], [0.28, 0.1], [0.22, 0.1]], { segments: 24, part: P.detail }).applyMatrix4(m));
    pieces.push(lathe([[0.22, 0.1], [0.2, 0.0]], { segments: 24, part: P.cup }).applyMatrix4(m));
  }

  // Ribs down the slope, between the lamps.
  const ribLen = SLOPE_L * 0.93;
  for (let k = 0; k < RIBS; k++) {
    const angle = LAMP_PHASE + ((k + 0.5) / RIBS) * TAU;
    const m = slopeFrame((SLOPE.r0 + SLOPE.r1) / 2, angle, 0.012);
    pieces.push(box(ribLen, 0.045, 0.07, P.detail, m));
  }

  // Vents round the step: a frame, a dark inside, slats.
  for (let k = 0; k < VENTS; k++) {
    const angle = LAMP_PHASE + ((k + 0.5) / VENTS) * TAU;
    const m = stepFrame(angle, 0.495, 3.33);
    const w = 0.62;
    const h = 0.25;
    const bar = 0.035;
    const at = (x, y, z) => new Matrix4().makeTranslation(x, y, z).premultiply(m);
    pieces.push(box(w, h, 0.01, P.vent, at(0, 0, 0.006)));
    pieces.push(box(w + bar * 2, bar, 0.04, P.detail, at(0, h / 2 + bar / 2, 0.02)));
    pieces.push(box(w + bar * 2, bar, 0.04, P.detail, at(0, -h / 2 - bar / 2, 0.02)));
    pieces.push(box(bar, h, 0.04, P.detail, at(w / 2 + bar / 2, 0, 0.02)));
    pieces.push(box(bar, h, 0.04, P.detail, at(-w / 2 - bar / 2, 0, 0.02)));
    for (let s = 1; s <= 4; s++) pieces.push(box(w, 0.016, 0.025, P.detail, at(0, -h / 2 + (s * h) / 5, 0.016)));
  }

  // Plates on the slope, kept off the lamps and the ribs.
  const rand = rng(7);
  let placed = 0;
  for (let tries = 0; placed < PLATES && tries < 2000; tries++) {
    const r = SLOPE.r0 + 0.25 + rand() * (SLOPE_DR - 0.5);
    const cell = TAU / RIBS;
    const slot = Math.floor(rand() * RIBS);
    const angle = LAMP_PHASE + slot * cell + (0.2 + rand() * 0.6) * cell;
    const lampSlot = ((slot % 3) + 3) % 3;
    if (lampSlot !== 1 && Math.abs(r - SAUCER.lampR) < 0.55) continue;
    const across = Math.min(cell * r * 0.55, 0.2 + rand() * 0.5);
    const along = 0.18 + rand() * 0.45;
    const m = slopeFrame(r, angle, 0.008);
    pieces.push(box(along, 0.03, across, P.detail, m));
    placed++;
  }

  const geo = mergeGeometries(pieces, false);
  for (const p of pieces) p.dispose();
  return geo;
}

function buildLights() {
  const pieces = [];
  // The rim's strips, on the band's outward face.
  const share = TAU / RIM_DASHES;
  for (let k = 0; k < RIM_DASHES; k++) {
    const g = lathe([[SAUCER.radius + 0.006, SAUCER.rimY - DASH_HALF], [SAUCER.radius + 0.006, SAUCER.rimY + DASH_HALF]], {
      segments: 6, phiStart: k * share, phiLength: share * DASH_FILL,
    });
    pieces.push(glowing(g, AMBER.has(k) ? DASH_AMBER : DASH_WHITE, 0));
  }
  // The lamps' lenses, set in their cups.
  for (let k = 0; k < SAUCER.lamps; k++) {
    const m = slopeFrame(SAUCER.lampR, LAMP_PHASE + (k / SAUCER.lamps) * TAU);
    // A bright core and a dimmer ring of diffuser round it.
    pieces.push(glowing(lathe([[0.14, 0.012], [0.07, 0.018], [0, 0.02]], { segments: 24 }).applyMatrix4(m), LAMP_LENS, 0));
    pieces.push(glowing(lathe([[0.2, 0.0], [0.14, 0.012]], { segments: 24 }).applyMatrix4(m), LAMP_LENS.map((v) => v * 0.3), 0));
  }
  // Small lights scattered over the slope and the flat ring.
  const rand = rng(23);
  for (let k = 0; k < TICKS; k++) {
    const onSlope = rand() < 0.7;
    const angle = rand() * TAU;
    const long = 0.12 + rand() * 0.16;
    const turn = rand() < 0.5;
    const level = 0.5 + rand() * 0.7;
    let m;
    if (onSlope) {
      const r = SLOPE.r0 + 0.2 + rand() * (SLOPE_DR - 0.4);
      m = slopeFrame(r, angle, 0.012);
    } else {
      const r = 2.85 + rand() * 0.4;
      const c = Math.cos(angle);
      const s = Math.sin(angle);
      _x.set(c, 0, s);
      _y.set(0, -1, 0);
      _z.crossVectors(_x, _y);
      m = new Matrix4().makeBasis(_x, _y, _z).setPosition(r * c, 0.22 + (r - 2.75) * 0.13 - 0.008, r * s);
    }
    const g = new BoxGeometry(turn ? 0.045 : long, 0.012, turn ? long : 0.045).applyMatrix4(m);
    g.deleteAttribute('uv');
    pieces.push(glowing(tagged(g, 0), TICK.map((v) => v * level), 0));
  }
  // The broken ring on the lip, facing down.
  pieces.push(glowing(lathe([[2.22, -0.004], [2.29, -0.004]], { segments: 256 }), [1, 1, 1], 1));
  for (const p of pieces) {
    if (!p.attributes.uv) p.setAttribute('uv', new Float32BufferAttribute(new Float32Array(p.attributes.position.count * 2), 2));
  }
  const geo = mergeGeometries(pieces, false);
  for (const p of pieces) p.dispose();
  return geo;
}

// litBy: the only real lights the metal answers to (the one under the hull).
// The scene's others are left out on purpose: the forecourt's upward bounce
// light, mirrored in 160 square metres of polished underside, turned the
// whole hull a flat grey; what the metal shows of the forecourt and the
// lamps is in reflections.js instead.
export function createSaucer({ litBy = [] } = {}) {
  const group = new Group();
  const u = { time: uniform(0), ring: uniform(0), lights: uniform(1) };

  // The metal.
  const metal = new MeshStandardNodeMaterial({ metalness: 1, roughness: 0.3 });
  metal.envMap = createHullEnvironment();
  metal.envMapIntensity = ENV_GAIN;
  metal.lightsNode = lightsOnly(litBy);
  const pos = positionLocal;
  const part = attribute('part', 'float');
  const is = (k) => float(1).sub(step(0.5, abs(part.sub(k))));
  const r = length(pos.xz);
  const ang = atan(pos.z, pos.x);
  const below = float(1).sub(step(1.3, pos.y));
  // Panel seams: radial (24 underneath, between the ribs; 32 on top) and a
  // few rings.
  const n = mix(float(SEAMS.top), float(SEAMS.under), below);
  const cellA = ang.sub(LAMP_PHASE).mul(n.div(TAU));
  const dRad = fract(cellA.add(0.5)).sub(0.5).mul(r).mul(float(TAU).div(n));
  const rings = SEAMS.rings.map(([under, top]) => mix(float(top), float(under), below));
  const dRing = rings.map((k) => abs(r.sub(k))).reduce((a, b) => min(a, b));
  const band = rings.map((k) => step(k, r)).reduce((a, b) => a.add(b));
  const line = (d, w) => float(1).sub(smoothstep(w, fwidth(d).mul(1.5).add(w), abs(d)));
  const seams = max(line(dRad, 0.01), line(dRing, 0.01)).mul(is(P.hull));
  // A tone and a roughness for each panel.
  const panel = hash(floor(cellA).add(band.mul(97)).add(below.mul(5003)));
  const tone = panel.mul(0.3).add(0.85);
  const partTone = mix(float(1), float(1.35), is(P.detail)).mul(mix(float(1), float(1.15), is(P.rim)))
    .mul(mix(float(1), float(0.06), is(P.vent))).mul(mix(float(1), float(1.5), is(P.dome)))
    .mul(mix(float(1), float(0.5), is(P.ceiling)));
  // Wear from a photo-scanned plate (CC0), seen from below: smudges in the
  // roughness, a little in the colour, so the highlights break up.
  const plate = pbr('metal_plate');   // a literal: tools/assets.mjs reads the source for it
  const wearUV = pos.xz.div(WEAR.metres);
  const wearRough = smoothstep(WEAR.roughFrom[0], WEAR.roughFrom[1], texture(plate.arm, wearUV).g);
  const wearTone = mix(float(1), dot(texture(plate.map, wearUV).rgb, vec3(0.333)).div(WEAR.mean), WEAR.tone);
  metal.colorNode = vec3(...GUNMETAL).mul(tone).mul(partTone).mul(wearTone).mul(float(1).sub(seams.mul(0.7)));
  let rough = float(0.27).add(panel.sub(0.5).mul(0.14)).mul(mix(float(WEAR.rough[0]), float(WEAR.rough[1]), wearRough));
  rough = mix(rough, float(0.65), seams);
  rough = mix(rough, float(0.18), is(P.rim));
  rough = mix(rough, float(0.2), is(P.lip));
  rough = mix(rough, float(0.22), is(P.dome));
  rough = mix(rough, float(0.85), is(P.vent));
  metal.roughnessNode = rough;

  // What glows on the metal: the lamps' spill on the slope, their cups, the
  // bore's windows and ceiling, and the lip once the ring is on.
  const lampCell = ang.sub(LAMP_PHASE).mul(SAUCER.lamps / TAU);
  const dLampA = fract(lampCell.add(0.5)).sub(0.5).mul(r).mul(TAU / SAUCER.lamps);
  const dLampR = r.sub(SAUCER.lampR + SPILL.out).div(SPILL.along);
  const dLampT = dLampA.div(SPILL.across);
  const spill = exp(dLampT.mul(dLampT).add(dLampR.mul(dLampR)).negate())
    .mul(SPILL.strength).mul(is(P.hull).add(is(P.detail)).mul(below));
  const cool = vec3(0.85, 0.92, 1.0);
  const winCell = ang.mul(WINDOWS.count / TAU);
  const winA = fract(winCell);
  const winLit = hash(floor(winCell).add(31)).mul(1.4).sub(0.2).clamp(0, 1);
  const win = step(0.2, winA).mul(step(winA, 0.8)).mul(step(0.36, pos.y)).mul(step(pos.y, 0.6)).mul(winLit);
  const boreGlow = win.mul(u.ring.mul(WINDOWS.on - WINDOWS.base).add(WINDOWS.base)).add(u.ring.mul(0.8)).mul(is(P.boreWall));
  const vane = line(fract(ang.mul(24 / TAU).add(0.5)).sub(0.5).mul(r).mul(TAU / 24), 0.03);
  const ceiling = float(1).sub(vane.mul(0.15)).mul(u.ring.mul(CEILING_GLOW.on - CEILING_GLOW.base).add(CEILING_GLOW.base))
    .mul(float(1).sub(smoothstep(0.4, SAUCER.bore, r).mul(0.6))).mul(is(P.ceiling));
  const lip = smoothstep(2.75, 2.0, r).mul(u.ring.mul(LIP_GLOW.on - LIP_GLOW.base).add(LIP_GLOW.base)).mul(is(P.lip));
  metal.emissiveNode = cool.mul(spill.add(is(P.cup).mul(CUP_GLOW).mul(smoothstep(0.0, 0.1, uv().y))).add(boreGlow).add(ceiling).add(lip)).mul(u.lights);
  const hull = new Mesh(buildMetal(), metal);
  group.add(hull);

  // The lights: unlit, over 1.
  const lights = new MeshBasicNodeMaterial();
  const kind = attribute('kind', 'float');
  const ringDash = step(0.22, fract(ang.mul(RING.dashes / TAU)));
  const ringLevel = u.ring.mul(RING.on - RING.base).add(RING.base).mul(ringDash);
  // A slight shimmer on each strip, never a chase.
  const shimmer = sin(u.time.mul(9).add(hash(floor(ang.mul(RIM_DASHES / TAU))).mul(40))).mul(0.06).add(1);
  lights.colorNode = attribute('glow', 'vec3').mul(mix(shimmer, ringLevel, kind)).mul(u.lights);
  const lamps = new Mesh(buildLights(), lights);
  group.add(lamps);

  return {
    object: group,
    uniforms: u,
    update(t) {
      u.time.value = t;
      u.ring.value = ramp(t, T.ringOn, T.ringOn + 0.3) * (1 - ramp(t, T.beamOff, T.beamOff + 0.8));
    },
  };
}
