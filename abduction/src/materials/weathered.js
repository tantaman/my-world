// The one "weathered" material every painted or concrete surface uses
// (PLAN.md 5.8), with knobs per surface: a tiling base, streaks running down
// from edges, dirt low down (and the green band along the foot of the shop
// wall), peeling paint showing a darker, rougher layer with a step at its
// edge, rust round seams and feet, and everything outdoors a little wet.
//
// Every knob is a uniform and every part is always in the graph (a missing
// band has height -1, a missing sign is a white texture), so all weathered
// surfaces compile to the same shader program: one compile, not forty.
import { MeshStandardNodeMaterial, Color, DataTexture, SRGBColorSpace } from 'three/webgpu';
import {
  vec2, vec3, float, positionWorld, normalWorld, mix, smoothstep, clamp, step, uniform, texture, uv,
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
};

const WHITE = new DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
WHITE.colorSpace = SRGBColorSpace;
WHITE.needsUpdate = true;

export function weathered(options = {}) {
  const o = { ...DEFAULTS, ...options };
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
  };
  const map = o.map ?? texture(WHITE, uv());

  const p = faceUV().div(u.scale);
  const y = positionWorld.y;
  const blot = fbm2(p, 1.0, 4);
  const fine = fbm2(p, 0.12, 2);
  let c = u.colour.mul(blot.mul(u.vary).add(1)).mul(fine.mul(0.08).add(1));
  // Streaks: noise stretched tall.
  const streak = smoothstep(0.1, 0.6, fbm2(vec2(p.x.mul(6), y.mul(0.35)), 1.0, 3)).mul(u.streaks);
  c = c.mul(float(1).sub(streak.mul(0.45)));
  // Peeling paint.
  const peelN = fbm2(p.add(vec2(3.1, 7.7)), 0.6, 4);
  const peel = smoothstep(float(0.55).sub(u.peel), float(0.62).sub(u.peel), peelN).mul(step(0.001, u.peel));
  c = mix(c, u.under.mul(blot.mul(0.2).add(0.85)), peel);
  // Rust near the bottom and on blotches.
  const rustN = smoothstep(0.2, 0.7, fbm2(p.add(11.0), 0.4, 3).add(smoothstep(0.6, 0.0, y).mul(0.4)));
  const rust = rustN.mul(u.rust);
  c = mix(c, vec3(0.22, 0.09, 0.03).mul(fine.mul(0.3).add(1)), rust);
  // A painted band at the foot.
  const bn = noise2(vec2(p.x.mul(3), 0), 1.0).mul(0.03);
  const inBand = smoothstep(u.bandHeight.add(0.01), u.bandHeight.sub(0.01), y.add(bn));
  c = mix(c, u.band.mul(blot.mul(0.2).add(0.9)), inBand);
  // Dirt low down.
  const dirt = smoothstep(u.dirtHeight, 0, y.add(fbm2(p, 0.5, 2).mul(0.25))).mul(u.dirt);
  c = c.mul(float(1).sub(dirt.mul(0.55)));
  c = c.mul(map.rgb);
  // Wet: darker and smoother, more so on what faces up.
  const wet = u.wet.mul(normalWorld.y.max(0).mul(0.6).add(0.4));
  m.colorNode = c.mul(float(1).sub(wet.mul(0.3)));
  m.roughnessNode = clamp(u.rough.add(peel.mul(0.15)).add(rust.mul(0.2)).add(blot.mul(0.08)).sub(wet.mul(0.35)), 0.08, 1);
  m.metalnessNode = u.metal.mul(float(1).sub(rust)).mul(float(1).sub(peel));
  // Relief: the blotches, and a step at the edge of the paint.
  const h = blot.mul(0.002).add(fine.mul(0.0008)).add(peel.mul(0.0012)).mul(u.bump);
  m.normalNode = bumpNormal(h, float(1));
  if (o.emissive) m.emissiveNode = o.emissive;
  m.userData.knobs = u;
  return m;
}
