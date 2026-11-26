// Fog, in two layers (PLAN.md 5.4).
//
// 1. Distance fog on every material, thicker near the ground: the optical
//    depth of an exponential-height fog along the view ray, in closed form.
// 2. Light scattered toward the camera by the fog round each lamp, added in
//    the lens pass from the depth buffer and a list of lights. For a point
//    source in even fog, the light gathered along a view ray has a closed
//    form, so the cones, halos and the warm sky cost no geometry and no
//    marching. Stopping at the depth hides the glow behind walls.
import { Vector4, Color } from 'three/webgpu';
import {
  Fn, uniform, uniformArray, vec3, vec4, float, Loop, dot, length, normalize, atan, clamp, max, min, exp,
  smoothstep, mx_noise_float, positionWorld, cameraPosition, abs, select, If, int, mix,
} from 'three/tsl';

// Distance fog: density at the ground (per metre) and how fast it thins with height.
export const FOG = {
  colour: new Color(0.030, 0.028, 0.032),   // linear; meets the sky at the horizon
  density: 0.017,       // per metre at y = 0
  falloff: 0.075,       // per metre of height
};

export const fogUniforms = {
  colour: uniform(FOG.colour.clone()),
  density: uniform(FOG.density),
  falloff: uniform(FOG.falloff),
};

// 0 (clear) .. 1 (all fog) for the current fragment, for scene.fogNode.
export const fogFactor = Fn(() => {
  const eye = cameraPosition;
  const d = positionWorld.sub(eye);
  const dist = length(d);
  const ry = d.y.div(max(dist, 1e-3));
  const b = fogUniforms.falloff;
  const k = b.mul(ry).mul(dist);
  // (1 - e^-k) / k, without dividing by zero when the ray is level.
  const shape = select(abs(k).lessThan(1e-3), float(1).sub(k.mul(0.5)), float(1).sub(exp(k.negate())).div(k));
  const od = fogUniforms.density.mul(exp(b.negate().mul(eye.y))).mul(dist).mul(shape);
  return float(1).sub(exp(od.negate()));
});

// The light list for the scattering: each entry is a lamp (or anything else
// that lights the fog), as a position, a colour times strength, an aim and
// the cosine of its cone (below -1 for no cone).
export const SCATTER_MAX = 16;

export function createScatterLights() {
  const pos = Array.from({ length: SCATTER_MAX }, () => new Vector4());
  const col = Array.from({ length: SCATTER_MAX }, () => new Vector4());
  const aim = Array.from({ length: SCATTER_MAX }, () => new Vector4(0, -1, 0, -2));
  const u = {
    pos: uniformArray(pos, 'vec4'),
    col: uniformArray(col, 'vec4'),
    aim: uniformArray(aim, 'vec4'),
    count: uniform(0, 'int'),
  };
  let n = 0;
  return {
    uniforms: u,
    begin() { n = 0; },
    // position, colour (Color), strength, aim (Vector3 or null), cone half-angle (radians), softness 0..1
    add(p, colour, strength, dir = null, half = Math.PI, soft = 0.25) {
      if (n >= SCATTER_MAX || strength <= 0) return;
      pos[n].set(p.x, p.y, p.z, 0);
      col[n].set(colour.r * strength, colour.g * strength, colour.b * strength, 0);
      if (dir) aim[n].set(dir.x, dir.y, dir.z, Math.cos(half));
      else aim[n].set(0, -1, 0, -2);
      col[n].w = Math.cos(Math.max(0, half * (1 - soft)));
      n++;
    },
    end() { u.count.value = n; },
  };
}

// The light gathered along the ray eye + ray * s, 0 < s < dist, from every
// light in the list. time drifts the wisps.
export const scatter = Fn(([eye, ray, dist, lights, time, density]) => {
  const sum = vec3(0).toVar();
  Loop(lights.count, ({ i }) => {
    const p = lights.pos.element(i).xyz.toVar();
    const c = lights.col.element(i).toVar();
    const a = lights.aim.element(i).toVar();
    const rel = p.sub(eye);
    const b = dot(rel, ray).toVar();
    const h = max(length(rel.sub(ray.mul(b))), 0.12).toVar();
    const glow = atan(dist.sub(b).div(h)).add(atan(b.div(h))).div(h);
    // The cone: is the ray inside it where it passes the light? Three points
    // round the nearest one, so a cone crossed below its lamp still shows.
    const coneSum = float(0).toVar();
    const wispSum = float(0).toVar();
    Loop({ start: int(-1), end: int(2), type: 'int', condition: '<', name: 'j' }, ({ j }) => {
      const s = clamp(b.add(h.mul(float(j)).mul(0.9)), 0, dist);
      const q = eye.add(ray.mul(s));
      const v = normalize(q.sub(p));
      const inCone = select(a.w.lessThan(-1.5), float(1), smoothstep(a.w, c.w, dot(v, a.xyz)));
      coneSum.addAssign(inCone);
      // Wisps: slow 3D noise, denser low down.
      const n = mx_noise_float(q.mul(vec3(0.22, 0.35, 0.22)).add(vec3(time.mul(0.15), time.mul(-0.05), time.mul(0.1))));
      wispSum.addAssign(n.mul(0.55).add(0.75).mul(exp(q.y.mul(-0.06))));
    });
    const near = clamp(b, 0, dist);
    const atten = exp(density.mul(near).mul(-0.6));
    sum.addAssign(c.xyz.mul(glow).mul(coneSum.div(3)).mul(wispSum.div(3)).mul(atten));
  });
  return sum;
});
