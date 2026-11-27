// What the saucer's metal reflects: the night as seen from where it hovers,
// painted once into a small equirectangular picture (HDR, linear) that three
// blurs by roughness (PMREM) like any environment map. Polished metal is
// only as bright as what it mirrors, and with nothing to mirror the hull
// drew black. The scene itself has no environment map: this is the saucer's
// own, so nothing else changes.
//
// From (1, 12, 26.8): storm cloud overhead, a little brighter and browner
// toward the horizon where the fog holds the lamps' light; the forecourt's
// glow low toward -Z (the canopy's tubes a bright patch); the street lamps a
// row of small hot spots below the horizon along X, which is what puts
// sharp highlights on the rim; the dark field below.
import { DataTexture, RGBAFormat, HalfFloatType, EquirectangularReflectionMapping, LinearFilter, DataUtils, Vector3 } from 'three/webgpu';
import { UFO, LAMPS, lampX, CANOPY } from '../set/layout.js';

const W = 256;                   // texels round
const H = 128;                   // texels from straight down to straight up

// Linear radiance of each part, before the material's envMapIntensity.
const ZENITH = [0.030, 0.029, 0.036];
const HORIZON = [0.085, 0.070, 0.062];   // fog lit by the lamps, all round
const GROUND = [0.016, 0.014, 0.012];   // the field under it, a little lit by the lamps through the fog
const WARM = [0.32, 0.22, 0.13];          // the forecourt's glow in the fog, toward -Z
const WARM_WIDTH = 0.9;                   // radians of azimuth it spreads over
const CANOPY_GLOW = [1.6, 1.75, 1.6];     // the canopy's tubes, seen from up here
const LAMP_GLOW = [7.0, 5.4, 4.0];        // a street lamp's head
const LAMP_SIZE = 0.035;                  // radians: a lamp's spot, a little more than its head
const CLOUD = 0.45;                       // how much the clouds vary the sky (fraction)

function hash2(i, j) {
  let h = (i * 374761393 + j * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

// Smooth value noise on the texture's grid, wrapping round.
function cloud(u, v) {
  let s = 0;
  let amp = 0.5;
  let fu = u * 8;
  let fv = v * 6;
  let wrap = 8;
  for (let o = 0; o < 4; o++) {
    const i = Math.floor(fu);
    const j = Math.floor(fv);
    const a = fu - i;
    const b = fv - j;
    const sa = a * a * (3 - 2 * a);
    const sb = b * b * (3 - 2 * b);
    const h = (x, y) => hash2(((x % wrap) + wrap) % wrap + o * 101, y + o * 37);
    const n = (h(i, j) * (1 - sa) + h(i + 1, j) * sa) * (1 - sb) + (h(i, j + 1) * (1 - sa) + h(i + 1, j + 1) * sa) * sb;
    s += (n * 2 - 1) * amp;
    amp *= 0.5;
    fu *= 2;
    fv *= 2;
    wrap *= 2;
  }
  return s;
}

export function createHullEnvironment() {
  const data = new Uint16Array(W * H * 4);
  const from = new Vector3(UFO.x, UFO.y, UFO.z);
  // The hot spots, as unit directions from the saucer.
  const spots = [];
  for (let k = 0; k < LAMPS.count; k++) {
    const d = new Vector3(lampX(k), LAMPS.pole - 0.1, LAMPS.z + LAMPS.arm).sub(from);
    if (d.length() > 120) continue;
    spots.push({ dir: d.normalize(), colour: LAMP_GLOW, size: LAMP_SIZE });
  }
  const canopy = new Vector3((CANOPY.x0 + CANOPY.x1) / 2, CANOPY.under, (CANOPY.z0 + CANOPY.z1) / 2).sub(from).normalize();
  spots.push({ dir: canopy, colour: CANOPY_GLOW, size: 0.16 });
  const toward = new Vector3();
  const rgb = [0, 0, 0];
  for (let j = 0; j < H; j++) {
    const v = (j + 0.5) / H;
    const el = (v - 0.5) * Math.PI;
    const up = Math.sin(el);
    for (let i = 0; i < W; i++) {
      const u = (i + 0.5) / W;
      const az = (u - 0.5) * Math.PI * 2;
      toward.set(Math.cos(az) * Math.cos(el), up, Math.sin(az) * Math.cos(el));
      // Sky and ground, meeting in the fog at the horizon.
      if (up >= 0) {
        const f = Math.pow(1 - up, 3);
        const c = 1 + CLOUD * cloud(u, v);
        for (let k = 0; k < 3; k++) rgb[k] = (ZENITH[k] + (HORIZON[k] - ZENITH[k]) * f) * c;
      } else {
        const f = Math.pow(1 + up, 4);
        for (let k = 0; k < 3; k++) rgb[k] = GROUND[k] + (HORIZON[k] - GROUND[k]) * f;
      }
      // The forecourt's warm glow, low toward -Z.
      const off = Math.atan2(Math.sin(az + Math.PI / 2), Math.cos(az + Math.PI / 2));
      const warm = Math.exp(-(off * off) / (WARM_WIDTH * WARM_WIDTH)) * Math.exp(-((el + 0.25) ** 2) / 0.06);
      for (let k = 0; k < 3; k++) rgb[k] += WARM[k] * warm;
      for (const s of spots) {
        const a = Math.acos(Math.min(1, toward.dot(s.dir)));
        if (a > s.size * 4) continue;
        const g = Math.exp(-(a * a) / (s.size * s.size));
        for (let k = 0; k < 3; k++) rgb[k] += s.colour[k] * g;
      }
      const o = (j * W + i) * 4;
      data[o] = DataUtils.toHalfFloat(rgb[0]);
      data[o + 1] = DataUtils.toHalfFloat(rgb[1]);
      data[o + 2] = DataUtils.toHalfFloat(rgb[2]);
      data[o + 3] = DataUtils.toHalfFloat(1);
    }
  }
  const tex = new DataTexture(data, W, H, RGBAFormat, HalfFloatType);
  tex.mapping = EquirectangularReflectionMapping;
  tex.magFilter = LinearFilter;
  tex.minFilter = LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}
