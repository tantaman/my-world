// The one "weathered" material every painted or concrete surface uses
// (PLAN.md 5.8), with knobs per surface: a photo-scanned surface under it
// all (concrete, render, rusty sheet, planks), a tiling base, streaks running
// down from edges, dirt low down (and the green band along the foot of the
// shop wall), peeling paint showing a darker, rougher layer with a step at
// its edge, rust round seams and feet, and everything outdoors a little wet.
//
// The photo (materials/textures.js) is sampled in world space from three
// sides and blended by the normal (triplanar), so a merged box needs no UVs
// and a lathed drum no seam, and a repeat is `photoScale` metres wherever it
// is. It is used as detail round the surface's own colour: its average is
// read from its smallest mip, so `colour` stays the colour of the surface and
// the photo only says where it is lighter, darker, rustier or rougher. Where
// paint peels, the photo's own dark patches can say where (`photoPeel`), so
// flakes have the shapes of real ones rather than of noise.
//
// Every knob is a uniform and every part is always in the graph (a missing
// band has height -1, a missing sign or photo is a 1x1 texture), so all
// weathered surfaces compile to the same shader program: one compile, not
// forty.
import { MeshStandardNodeMaterial, Color, DataTexture, SRGBColorSpace, NoColorSpace } from 'three/webgpu';
import {
  vec2, vec3, vec4, float, positionWorld, normalWorld, normalWorldGeometry, cameraViewMatrix, mix, smoothstep, clamp, step,
  uniform, texture, uv, select, abs, pow, dot, normalize,
} from 'three/tsl';
import { faceUV, fbm2, noise2, bumpNormal } from './noise.js';

const DEFAULTS = {
  colour: '#8a8378',     // the paint or render
  under: '#4a4038',      // what shows where paint has gone
  scale: 1.0,            // metres per repeat of the base blotches
  vary: 0.25,            // how much the base colour wanders
  streaks: 0.4,          // dark streaks down from edges, 0..1
  dirt: 0.5,             // dirt low down, 0..1
  dirtHeight: 0.8,       // metres it reaches up
  band: null,            // { colour, height }: a painted band at the foot
  peel: 0,               // 0..1 of the surface with paint gone
  rust: 0,               // 0..1
  rough: 0.75,           // roughness of the paint
  wet: 0.25,             // 0..1: outdoors, rain-darkened and smoother
  metal: 0,
  bump: 0.6,             // strength of the surface's relief
  emissive: null,        // a node to add as light (this one gets its own program)
  map: null,             // a texture (signs), multiplying the colour
  // The photo-scanned surface (pbr() from materials/textures.js), or null.
  photo: null,
  photoScale: 1.0,       // metres per repeat of the photo
  photoAmount: 1.0,      // 0..1: how much of its light and dark is kept
  photoSat: 0.4,         // 0: only its light and dark, 1: its own colour too
  photoContrast: 1.0,    // above 1 deepens its stains
  photoBump: 1.0,        // strength of its normal map
  photoPeel: 0,          // 0..1: how far its dark patches, not noise, say where paint is gone
  turn: false,           // turn the photo a quarter (grain along the other axis)
};

// The 1x1 stand-ins, so a surface without a sign or a photo has the same program.
function pixel(rgba, srgb) {
  const t = new DataTexture(new Uint8Array(rgba), 1, 1);
  t.colorSpace = srgb ? SRGBColorSpace : NoColorSpace;
  t.needsUpdate = true;
  return t;
}
const WHITE = pixel([255, 255, 255, 255], true);
const FLAT = pixel([128, 128, 255, 255], false);
const NO_ARM = pixel([255, 191, 0, 255], false);
const NO_PHOTO = { map: WHITE, normal: FLAT, arm: NO_ARM };

// Above every mip chain's length: sampling there gives a texture's average.
const MEAN_LEVEL = 16;
const LUMA = vec3(0.2126, 0.7152, 0.0722);
// How sharply the three projections hand over on a curved surface.
const BLEND_SHARPNESS = 4;
// How much of the photo's ambient occlusion darkens the colour (the night's
// light is nearly all direct, so three's aoNode would barely show it).
const PHOTO_AO = 0.6;

export function weathered(options = {}) {
  const o = { ...DEFAULTS, ...options };
  const photo = o.photo ?? NO_PHOTO;
  const m = new MeshStandardNodeMaterial();
  const u = {
    colour: uniform(new Color(o.colour)),
    under: uniform(new Color(o.under)),
    band: uniform(new Color(o.band?.colour ?? '#000000')),
    bandHeight: uniform(o.band ? o.band.height : -1),
    scale: uniform(o.scale),
    vary: uniform(o.vary),
    streaks: uniform(o.streaks),
    dirt: uniform(o.dirt),
    dirtHeight: uniform(o.dirtHeight),
    peel: uniform(o.peel),
    rust: uniform(o.rust),
    rough: uniform(o.rough),
    wet: uniform(o.wet),
    metal: uniform(o.metal),
    bump: uniform(o.bump),
    photoScale: uniform(o.photoScale),
    photoAmount: uniform(o.photo ? o.photoAmount : 0),
    photoSat: uniform(o.photoSat),
    photoContrast: uniform(o.photoContrast),
    photoBump: uniform(o.photo ? o.photoBump : 0),
    photoPeel: uniform(o.photo ? o.photoPeel : 0),
    turn: uniform(o.turn ? 1 : 0),
  };
  const map = o.map ?? texture(WHITE, uv());

  // The photo, from three sides. Each side's coordinate runs so that its
  // tangent, bitangent and the face's normal are right-handed, which is what
  // the normal map was made for.
  const P = positionWorld;
  const Ng = normalWorldGeometry;
  const sx = select(Ng.x.lessThan(0), float(-1), float(1));
  const sy = select(Ng.y.lessThan(0), float(-1), float(1));
  const sz = select(Ng.z.lessThan(0), float(-1), float(1));
  const wRaw = pow(abs(Ng), vec3(BLEND_SHARPNESS));
  const w = wRaw.div(wRaw.x.add(wRaw.y).add(wRaw.z));
  const turned = (q) => select(u.turn.greaterThan(0.5), vec2(q.y, q.x.negate()), q).div(u.photoScale);
  const uvX = turned(vec2(P.z.mul(sx).negate(), P.y));
  const uvY = turned(vec2(P.x, P.z.mul(sy).negate()));
  const uvZ = turned(vec2(P.x.mul(sz), P.y));
  const tri = (t) => texture(t, uvX).mul(w.x).add(texture(t, uvY).mul(w.y)).add(texture(t, uvZ).mul(w.z));
  const photoC = tri(photo.map).rgb;
  const photoMean = texture(photo.map, vec2(0.5)).level(MEAN_LEVEL).rgb.max(0.002);
  const arm = tri(photo.arm);
  const armMean = texture(photo.arm, vec2(0.5)).level(MEAN_LEVEL);
  // Detail round 1: its light and dark, and (by photoSat) its hue.
  const lum = dot(photoC, LUMA);
  const meanLum = dot(photoMean, LUMA);
  const rel = lum.div(meanLum);
  let detail = mix(vec3(rel), photoC.div(photoMean), u.photoSat).max(0);
  detail = pow(detail, vec3(u.photoContrast));
  detail = mix(vec3(1), detail.mul(mix(float(1), arm.r, PHOTO_AO)), u.photoAmount);
  // Where it is darker than its average: flakes gone, stains.
  const dark = float(1).sub(rel);

  const p = faceUV().div(u.scale);
  const y = positionWorld.y;
  const blot = fbm2(p, 1.0, 4);
  const fine = fbm2(p, 0.12, 2);
  let c = u.colour.mul(blot.mul(u.vary).add(1)).mul(fine.mul(0.08).add(1)).mul(detail);
  // Streaks: noise stretched tall.
  const streak = smoothstep(0.1, 0.6, fbm2(vec2(p.x.mul(6), y.mul(0.35)), 1.0, 3)).mul(u.streaks);
  c = c.mul(float(1).sub(streak.mul(0.45)));
  // Peeling paint: where noise, or the photo's dark patches, pass a threshold.
  const peelN = mix(fbm2(p.add(vec2(3.1, 7.7)), 0.6, 4), dark, u.photoPeel);
  const peel = smoothstep(float(0.55).sub(u.peel), float(0.62).sub(u.peel), peelN).mul(step(0.001, u.peel));
  const underDetail = mix(vec3(1), detail, 0.5);
  c = mix(c, u.under.mul(blot.mul(0.2).add(0.85)).mul(underDetail), peel);
  // Rust near the bottom and on blotches.
  const rustN = smoothstep(0.2, 0.7, fbm2(p.add(11.0), 0.4, 3).add(smoothstep(0.6, 0.0, y).mul(0.4)).add(dark.mul(u.photoAmount).mul(0.3)));
  const rust = rustN.mul(u.rust);
  c = mix(c, vec3(0.22, 0.09, 0.03).mul(fine.mul(0.3).add(1)).mul(underDetail), rust);
  // A painted band at the foot.
  const bn = noise2(vec2(p.x.mul(3), 0), 1.0).mul(0.03);
  const inBand = smoothstep(u.bandHeight.add(0.01), u.bandHeight.sub(0.01), y.add(bn));
  c = mix(c, u.band.mul(blot.mul(0.2).add(0.9)).mul(detail), inBand);
  // Dirt low down.
  const dirt = smoothstep(u.dirtHeight, 0, y.add(fbm2(p, 0.5, 2).mul(0.25))).mul(u.dirt);
  c = c.mul(float(1).sub(dirt.mul(0.55)));
  c = c.mul(map.rgb);
  // Wet: darker and smoother, more so on what faces up.
  const wet = u.wet.mul(normalWorld.y.max(0).mul(0.6).add(0.4));
  m.colorNode = c.mul(float(1).sub(wet.mul(0.3)));
  const photoRough = arm.g.sub(armMean.g).mul(u.photoAmount);
  m.roughnessNode = clamp(u.rough.add(photoRough).add(peel.mul(0.15)).add(rust.mul(0.2)).add(blot.mul(0.08)).sub(wet.mul(0.35)), 0.08, 1);
  m.metalnessNode = u.metal.mul(float(1).sub(rust)).mul(float(1).sub(peel));
  // Relief: the photo's normal map (each side's tilt added to the surface's
  // own normal), then the blotches and a step at the edge of the paint.
  const tn = (t, q) => texture(t, q).xy.mul(2).sub(1);
  const nX = tn(photo.normal, uvX);
  const nY = tn(photo.normal, uvY);
  const nZ = tn(photo.normal, uvZ);
  // The turn spins the tangent frame too.
  const spin = (n) => select(u.turn.greaterThan(0.5), vec2(n.y.negate(), n.x), n);
  const tX = spin(nX);
  const tY = spin(nY);
  const tZ = spin(nZ);
  const tilt = vec3(0, tX.y, tX.x.mul(sx).negate()).mul(w.x)
    .add(vec3(tY.x, 0, tY.y.mul(sy).negate()).mul(w.y))
    .add(vec3(tZ.x.mul(sz), tZ.y, 0).mul(w.z));
  const nWorld = normalize(normalWorld.add(tilt.mul(u.photoBump)));
  const nView = normalize(cameraViewMatrix.mul(vec4(nWorld, 0)).xyz);
  const h = blot.mul(0.002).add(fine.mul(0.0008)).add(peel.mul(0.0012)).mul(u.bump);
  m.normalNode = bumpNormal(h, float(1), nView);
  if (o.emissive) m.emissiveNode = o.emissive;
  m.userData.knobs = u;
  return m;
}
