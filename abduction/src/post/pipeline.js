// The frame after the scene is drawn (PLAN.md 5.1 and 5.13), as one
// RenderPipeline:
//
//   scene pass (HDR, 4x multisampled, drawn larger than the output)
//   bloom of it
//   then, per output pixel, one lens pass: slide rows for interference and
//   the last glitch, warp like a fisheye, sample the scene and bloom with
//   colour fringing, add the light scattered by the fog along that pixel's
//   ray, tone map and grade, then grain, vignette and the fade to black.
//
// The mirror in the ground is drawn by the ground's own material (set/ground.js).
import { RenderPipeline, Matrix4, Vector3 } from 'three/webgpu';
import {
  Fn, pass, uniform, vec2, vec3, vec4, float, screenUV, screenSize, dot, length, normalize, min, max, mix, step,
  smoothstep, abs, pow, hash, floor, getViewPosition, select, clamp,
} from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { grade, GRADE } from './grade.js';
import { interference, staticDots } from './interference.js';
import { glitch } from './glitch.js';
import { scatter } from '../weather/fog.js';

const ASPECT = 4 / 3;

export const LENS = {
  // Barrel warp: an output point p (r = 1 at the top edge's middle) samples
  // the drawn scene at p (1 + k r^2) zoom. k from straight poles in the
  // original (plumb lines at 42 s and 57 s both give 0.13 to 0.14).
  k: 0.135,
  zoom: 0.727,           // so the corners just reach the drawn picture's corners: never black but for the vignette
  overdraw: 1.3,         // the scene is drawn this much larger, so the warped middle stays sharp
  fringe: 0.0012,        // colour fringing at the corners, as a fraction of the radius (the original shows little outside its tears)
  emiSplit: 0.0008,      // red and blue apart over the whole picture at full interference, of the width
  grain: 0.0028,         // sensor noise, display-linear: the original is smooth (its compression crushes grain: 0.7 of 255 in flat sky)
  // The original's mean frame (every frame averaged) is not darkened at its
  // edges at all: a soft circle cuts off only the corners, from about 1.39
  // to 1.62 half-heights from the middle (the corners are at 1.67).
  vignette: [1.39, 1.62],
  scatterFar: 900,       // metres: the sky counts as this far for the fog's glow
};

// The overlay's FOV against what three.js is told. The number the original
// shows moves with its zoom, but its picture is far narrower than a lens of
// that many degrees: fitted through our lens (tools/fit.mjs, still 01), the
// tangent of the half-angle drawn is this times the overlay's.
export const FOV_TAN = 0.613;
export const drawnFov = (shown) => (2 * Math.atan(FOV_TAN * Math.tan((shown * Math.PI) / 360)) * 180) / Math.PI;

// The direction, in the camera's own frame (x right, y up, z ahead), that
// shows at a point of the finished picture (u, v from its top left, 0..1),
// through the lens's warp, for a drawn vertical fov in degrees.
export function rayThroughLens(u, v, fov, out) {
  const px = (u - 0.5) * 2 * ASPECT;
  const py = (0.5 - v) * 2;
  const s = (1 + LENS.k * (px * px + py * py)) * LENS.zoom;
  const tan = Math.tan((fov * Math.PI) / 360);
  return out.set(px * s * tan, py * s * tan, 1).normalize();
}

// Bloom: tight round bright things (the original's lamp heads have a small halo;
// the broad glow round them is the fog's, weather/fog.js). A wide radius laid
// a veil over the saucer's hull from the lamp beside it.
const BLOOM = { strength: 0.45, radius: 0.45, threshold: 1.0 };

export function createPipeline(renderer, scene, camera, { raw, scatterLights, fogDensity, has }) {
  const scenePass = pass(scene, camera, { samples: 4 });
  scenePass.setResolutionScale(raw ? 1 : LENS.overdraw);
  const color = scenePass.getTextureNode('output');
  const depth = scenePass.getTextureNode('depth');
  const glow = has('bloom') ? bloom(color, BLOOM.strength, BLOOM.radius, BLOOM.threshold) : null;
  const glowTex = glow ? glow.getTextureNode() : null;

  const u = {
    time: uniform(0),
    emi: uniform(0),
    glitch: uniform(0),
    black: uniform(0),
    k: uniform(LENS.k),
    exposure: uniform(GRADE.exposure),
    projInv: uniform(new Matrix4()),
    camWorld: uniform(new Matrix4()),
    eye: uniform(new Vector3()),
  };

  // The HDR light arriving at a source uv: the scene, its bloom, and (once,
  // not per colour) the fog's glow.
  const sceneAt = (uv) => {
    const c = color.sample(uv).rgb;
    return glowTex ? c.add(glowTex.sample(uv).rgb) : c;
  };

  const fogGlow = Fn(([uv]) => {
    const d = depth.sample(uv).r;
    const viewPos = getViewPosition(uv, d, u.projInv);
    const dist = min(length(viewPos), LENS.scatterFar);
    const rayWorld = normalize(u.camWorld.mul(vec4(normalize(viewPos), 0)).xyz);
    return scatter(u.eye, rayWorld, dist, scatterLights.uniforms, u.time, fogDensity);
  });

  const lens = Fn(() => {
    const suv = screenUV;
    const pix = suv.mul(screenSize);
    // Rows slid sideways by the saucer's interference and the final glitch.
    const inter = raw ? vec3(0) : interference(suv, u.time, u.emi);
    const gl = raw ? vec3(0) : glitch(suv, u.time, u.glitch);
    const p = suv.sub(0.5).mul(vec2(2 * ASPECT, 2)).toVar();
    p.x.addAssign(inter.x.add(gl.x).mul(2 * ASPECT));
    const r2 = dot(p, p);
    // The barrel warp, zoomed so the left and right edges just fit; the
    // corners fall a little outside the drawn picture, under the vignette.
    const q = raw ? p : p.mul(u.k.mul(r2).add(1)).mul(LENS.zoom);
    const toUV = (qq) => qq.div(vec2(2 * ASPECT, 2)).add(0.5);
    const uv = toUV(q);
    const inside = step(0, uv.x).mul(step(uv.x, 1)).mul(step(0, uv.y)).mul(step(uv.y, 1));
    // Colour fringing toward the edges; while the saucer is near, red and
    // blue apart sideways over the whole picture (the original's fence posts
    // and the hull's ring fringe at 57 s); and the tears' and glitch's split.
    const fr = r2.mul(LENS.fringe);
    const sideways = vec2(inter.y.add(gl.y).add(u.emi.mul(LENS.emiSplit)).mul(2 * ASPECT), 0);
    const red = sceneAt(toUV(q.mul(fr.add(1)).add(sideways))).r;
    const mid = sceneAt(uv);
    const blue = sceneAt(toUV(q.mul(float(1).sub(fr)).sub(sideways))).b;
    let hdr = vec3(red, mid.g, blue);
    if (has('scatter')) hdr = hdr.add(fogGlow(uv));
    let c = grade(hdr, u.exposure).toVar();
    if (!raw) {
      // Dotted static in the bands.
      c.addAssign(staticDots(pix, u.time, inter.z));
      // Sensor noise, changing every frame, stronger in the dark.
      const n = hash(pix.x.add(pix.y.mul(4096.0)).add(floor(u.time.mul(60)).mul(1013.0))).sub(0.5);
      const y = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c.addAssign(n.mul(LENS.grain).mul(float(1).sub(y.mul(0.6))));
      // The vignette: a soft circle that takes only the corners (measured in
      // display values, so raised to 2.2 here, before the output encodes).
      const vig = float(1).sub(smoothstep(LENS.vignette[0], LENS.vignette[1], length(p)));
      c.mulAssign(pow(vig, 2.2).mul(inside));
    }
    // The glitch's blocks going dark, then the fade to black.
    c.mulAssign(float(1).sub(gl.z).mul(float(1).sub(u.black)));
    return vec4(max(c, 0), 1);
  });

  const pipeline = new RenderPipeline(renderer);
  pipeline.outputNode = lens();

  return {
    pipeline,
    uniforms: u,
    // Call each frame after the camera has moved.
    update(t, { emi, glitch: g, black }) {
      u.time.value = t;
      u.emi.value = emi;
      u.glitch.value = g;
      u.black.value = black;
      camera.updateMatrixWorld();
      u.projInv.value.copy(camera.projectionMatrixInverse);
      u.camWorld.value.copy(camera.matrixWorld);
      u.eye.value.setFromMatrixPosition(camera.matrixWorld);
    },
    render() { pipeline.render(); },
  };
}
