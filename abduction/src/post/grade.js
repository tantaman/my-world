// Tone mapping and the grade: dark, a little washed of colour, warm
// highlights and cool shadows, blacks at zero (PLAN.md 5.13 and section 11:
// the median pixel about 35 to 45 of 255, the brightest percent 120 to 190).
import { Fn, vec3, float, dot, mix, max, pow, agxToneMapping, smoothstep, clamp } from 'three/tsl';

export const GRADE = {
  exposure: 0.6,        // before tone mapping (AgX: a gentler toe than ACES, so the darks keep detail)
  saturation: 0.9,    // 1 leaves colour as it is
  lift: 0.0,        // pulls the blacks down to zero
  contrast: 0.25,      // 0..1, an S-curve after tone mapping
  gamma: 1.22,         // above 1 darkens the mids
  warm: [1.04, 1.0, 0.94],   // multiplies the highlights
  cool: [0.97, 0.98, 1.04], // multiplies the shadows
};

const LUMA = vec3(0.2126, 0.7152, 0.0722);

// hdr: linear scene light. Returns display-linear colour (the pipeline's own
// output transform then encodes it as sRGB).
export const grade = Fn(([hdr, exposure]) => {
  let c = agxToneMapping(hdr, exposure);
  const y = dot(c, LUMA);
  c = mix(vec3(y), c, GRADE.saturation);
  const tint = mix(vec3(...GRADE.cool), vec3(...GRADE.warm), smoothstep(0.02, 0.35, y));
  c = c.mul(tint);
  c = mix(c, smoothstep(0.0, 1.0, c), GRADE.contrast);
  c = max(c.add(GRADE.lift), 0);
  c = pow(c, vec3(GRADE.gamma));
  return clamp(c, 0, 1);
});
