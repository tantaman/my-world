// Photographs of real surfaces: scans of real ground, bark, stone, paint,
// all CC0 (Poly Haven), for the fine detail that code alone draws too clean.
//
//   const litter = photo('forrest_ground_03', 2); // its id, and how many metres one covers
//   litter.map, litter.normal, litter.arm        // textures, repeating
//   litter.metres                                // that, fitted to the world's period
//
// A photo is never what colour something is. The code still says that (the
// country's ground, a cabin's paint); the photo only says where it is a
// little lighter or darker, which way the light catches it, where it's in
// the shade of its own lumps. PHOTO_GLSL does that: it divides the photo by
// its own average (its smallest mipmap), so on average it changes nothing,
// and far off, where the mipmaps have averaged it away, nothing at all. That
// is also why a photo needs no fading out with distance, and why the same
// photo can lie under any country's colours.
//
// Each is three files in public/photos/<id>/: the colour (diff.jpg), the
// normal in OpenGL's convention (nor_gl.jpg), and Poly Haven's packed map
// (arm.jpg: ambient occlusion in red, roughness in green, metalness in blue).
// `npm run photos` (tools/photos.mjs) reads src/ for photo('id') calls and
// fetches whichever aren't there, so there is no list to keep: use a photo
// in code, run it, and commit what it fetched.
//
// Laid on the ground from above, a photo is sampled at worldXZ() (glsl.js),
// which repeats on the world's period: so `metres` is fitted to a whole
// number of repeats in the period, and nothing jumps when the origin moves.
//
// ?no=photos (config.js) leaves them out, to see what they do: a material
// asks photosOn() when it is made, and builds its shader without them.
// photosReady() resolves once every photo asked for has loaded (or failed),
// so a still is never taken half-dressed (tools/look.mjs).

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { PERIOD } from './glsl.js';

export type Photo = {
  id: string;
  map: THREE.Texture;
  normal: THREE.Texture;
  arm: THREE.Texture;
  metres: number;
  // uniforms: the colour's average (linear RGB; zero until it has loaded,
  // and PHOTO_GLSL changes nothing till then) and the ambient occlusion's
  mean: { value: THREE.Vector3 };
  aoMean: { value: number };
};


const cache = new Map<string, Photo>();
const pending: Promise<void>[] = [];

export const photosOn = (): boolean => !CONFIG.no.has('photos');

// Metres per repeat, fitted to a whole number of repeats in the period.
export const fitMetres = (metres: number): number => PERIOD / Math.max(1, Math.round(PERIOD / metres));

// Where the files are served from (Vite's base; the page's own folder).
const BASE: string = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? './';

// A stand-in of one pixel, for where there is nothing to load from (Node, in
// the tests): mid grey, a flat normal, unshaded and fully rough.
function pixel(rgba: number[], srgb: boolean): THREE.Texture {
  const t = new THREE.DataTexture(new Uint8Array(rgba), 1, 1);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.needsUpdate = true;
  return t;
}

// The average of an image, once it has loaded (each channel 0..1; linear
// light, from sRGB, if srgb): read off a small copy, once, rather than off
// the smallest mipmap for every pixel drawn.
const AVERAGE_OVER = 32; // px a side of the copy it's read off
const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
function average(image: CanvasImageSource, srgb: boolean): [number, number, number] {
  const c = document.createElement('canvas');
  c.width = c.height = AVERAGE_OVER;
  const g = c.getContext('2d', { willReadFrequently: true });
  if (!g) return [0.5, 0.5, 0.5];
  g.drawImage(image, 0, 0, AVERAGE_OVER, AVERAGE_OVER);
  const d = g.getImageData(0, 0, AVERAGE_OVER, AVERAGE_OVER).data;
  const sum = [0, 0, 0];
  for (let i = 0; i < d.length; i += 4) for (let k = 0; k < 3; k++) sum[k] += srgb ? toLinear(d[i + k] / 255) : d[i + k] / 255;
  const n = d.length / 4;
  return [sum[0] / n, sum[1] / n, sum[2] / n];
}

let loader: THREE.TextureLoader | null = null;
function load(url: string, srgb: boolean, loaded: (t: THREE.Texture) => void = () => {}): THREE.Texture {
  if (typeof document === 'undefined') return pixel(srgb ? [128, 128, 128, 255] : [128, 128, 255, 255], srgb);
  loader ??= new THREE.TextureLoader();
  let done = () => {};
  pending.push(new Promise((r) => (done = r)));
  const t = loader.load(url, (tex) => {
    loaded(tex);
    done();
  }, undefined, () => {
    console.warn(`photo missing: ${url} (npm run photos)`);
    done();
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  // (filtered finely for ground seen at a glancing angle, as finely as the
  // quality setting says: three.js keeps it to what the card can do)
  t.anisotropy = CONFIG.photoFilter;
  return t;
}

export function photo(id: string, metres: number): Photo {
  let p = cache.get(id);
  if (!p) {
    const dir = `${BASE}photos/${id}/`;
    const mean = { value: new THREE.Vector3() };
    const aoMean = { value: 1 };
    p = {
      id,
      map: load(`${dir}diff.jpg`, true, (t) => mean.value.fromArray(average(t.image as CanvasImageSource, true))),
      normal: load(`${dir}nor_gl.jpg`, false),
      arm: load(`${dir}arm.jpg`, false, (t) => (aoMean.value = Math.max(average(t.image as CanvasImageSource, false)[0], 0.05))),
      metres: fitMetres(metres),
      mean,
      aoMean,
    };
    // (with nothing to load from, the stand-ins' own: mid grey, unshaded)
    if (typeof document === 'undefined') mean.value.setScalar(toLinear(128 / 255));
    cache.set(id, p);
  }
  return p;
}

// Resolves when every photo asked for so far has loaded, or given up.
export function photosReady(): Promise<void> {
  return Promise.all(pending).then(() => {});
}

// What a photo does to a surface, in GLSL (WebGL 2: textureLod).
//
//   photoShade(map, arm, uv, dx, dy, sat, mean, aoMean)
//                     what to multiply the surface's own colour by: the
//                     photo's light and dark round its average (and its hue,
//                     by sat, 0..1), in the shade of its own lumps. mean and
//                     aoMean are the photo's (its uniforms of those names):
//                     until it has loaded, mean is zero, and this is 1
//   photoTilt(normal, uv, dx, dy)
//                     which way the photo's normal map leans, as (along u,
//                     along v): tip the surface's normal by it, in whatever
//                     frame u and v run
//
// dx and dy are dFdx(uv) and dFdy(uv), worked out before any branch the
// photo is read in (a pixel's neighbours may not have taken it, and then
// the card can't tell how far apart they are).
export const PHOTO_GLSL = /* glsl */ `
const vec3 PHOTO_LUMA = vec3(0.2126, 0.7152, 0.0722);
// how much of the photo's own ambient occlusion darkens it (the rest of the
// shade in its hollows is the light's to give)
const float PHOTO_AO = 0.6;
vec3 photoShade(sampler2D map, sampler2D arm, vec2 uv, vec2 dx, vec2 dy, float sat, vec3 mean, float aoMean) {
  if (mean.g <= 0.0) return vec3(1.0);
  vec3 c = textureGrad(map, uv, dx, dy).rgb;
  float rel = dot(c, PHOTO_LUMA) / dot(mean, PHOTO_LUMA);
  vec3 shade = max(mix(vec3(rel), c / max(mean, vec3(0.002)), sat), vec3(0.0));
  float ao = textureGrad(arm, uv, dx, dy).r;
  return shade * mix(1.0, min(ao / aoMean, 1.25), PHOTO_AO);
}
vec2 photoTilt(sampler2D normal, vec2 uv, vec2 dx, vec2 dy) {
  return textureGrad(normal, uv, dx, dy).xy * 2.0 - 1.0;
}
`;
