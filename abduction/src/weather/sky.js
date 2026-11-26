// The sky (PLAN.md 5.6): a dome, never fogged, drawn first. Storm cloud from
// noise warped by itself, stretched toward the horizon, two layers drifting
// slowly; dark blue-grey overhead, browner and warmer toward the lamps,
// meeting the fog at the horizon. A lightning strike lights it from inside,
// brightest round the bolt. The small light in the clouds (9.5 to 15 s) is
// the saucer, a long way off.
import { Mesh, SphereGeometry, MeshBasicNodeMaterial, BackSide, Color, Vector3 } from 'three/webgpu';
import {
  Fn, vec2, vec3, float, positionLocal, normalize, max, mix, smoothstep, exp, dot, uniform, clamp, pow, abs,
  mx_fractal_noise_float, cameraPosition, acos, color,
} from 'three/tsl';
import { T, ramp, env } from '../timeline.js';
import { fogUniforms } from './fog.js';

export const SKY = {
  overhead: new Color(0.034, 0.031, 0.044),
  warm: new Color(0.075, 0.058, 0.048),    // toward the lamps (low, +X along the road)
  cloudLight: 1.6,                         // how much brighter the lit cloud edges are
  drift: [0.004, 0.0015],                  // cloud layers' speeds (uv units a second)
};

const RADIUS = 1500;

export function createSky({ camera }) {
  const u = {
    time: uniform(0),
    flash: uniform(0),
    bolt: uniform(new Vector3(0, 0.3, 1).normalize()),
    speck: uniform(0),                     // the far-off saucer, 0..1
    speckDir: uniform(new Vector3(0.87, 0.47, -0.15).normalize()),
  };

  const material = new MeshBasicNodeMaterial({ side: BackSide, depthWrite: false, fog: false });
  material.colorNode = Fn(() => {
    const dir = normalize(positionLocal);
    const up = max(dir.y, 0.0);
    const uv = dir.xz.div(dir.y.add(0.15));
    const t = u.time;
    // Domain-warped clouds, two layers.
    const warp = vec2(
      mx_fractal_noise_float(vec3(uv.mul(0.8), t.mul(0.01)), 3, 2.0, 0.5),
      mx_fractal_noise_float(vec3(uv.mul(0.8).add(5.2), t.mul(0.01)), 3, 2.0, 0.5),
    );
    const c1 = mx_fractal_noise_float(vec3(uv.mul(0.7).add(warp.mul(0.35)).add(vec2(t.mul(SKY.drift[0]), 0)), 1.0), 5, 2.0, 0.55);
    const c2 = mx_fractal_noise_float(vec3(uv.mul(2.6).add(warp.mul(0.3)).add(vec2(t.mul(SKY.drift[1]), t.mul(0.001))), 4.0), 4, 2.0, 0.5);
    const density = clamp(c1.mul(0.7).add(c2.mul(0.2)).add(0.5), 0, 1);
    // Gradient: overhead to the warm glow low over the lamps.
    const toLamps = smoothstep(-0.2, 1.0, dir.z.mul(0.5).add(dir.x.mul(0.6)));
    const low = float(1).sub(smoothstep(0.0, 0.55, up));
    const base = mix(color(SKY.overhead), color(SKY.warm), low.mul(toLamps.mul(0.7).add(0.3)));
    // Thick cloud is darker; thin gaps a little lighter, lit from below.
    let c = base.mul(mix(float(SKY.cloudLight), float(0.55), density)).toVar();
    // Toward the horizon, the fog.
    c.assign(mix(c, vec3(fogUniforms.colour), smoothstep(0.22, 0.0, up)));
    // Lightning, inside the clouds round the bolt.
    const ang = acos(clamp(dot(dir, u.bolt), -1, 1));
    const glow = u.flash.mul(exp(ang.mul(ang).div(-0.18))).mul(density.mul(1.5).add(0.3));
    c.addAssign(vec3(0.55, 0.6, 0.8).mul(glow.mul(1.1).add(u.flash.mul(0.04))));
    // The far-off saucer: a cyan-white point, twinkling.
    const sp = acos(clamp(dot(dir, u.speckDir), -1, 1));
    c.addAssign(vec3(0.5, 1.0, 1.1).mul(u.speck).mul(exp(sp.mul(sp).div(-0.000012)).mul(18).add(exp(sp.mul(sp).div(-0.0004)).mul(0.25))));
    return c;
  })();

  const mesh = new Mesh(new SphereGeometry(RADIUS, 48, 24), material);
  mesh.renderOrder = -10;
  mesh.frustumCulled = false;

  return {
    object: mesh,
    uniforms: u,
    update(t, { flash, boltDir }) {
      u.time.value = t;
      u.flash.value = flash;
      if (boltDir) u.bolt.value.copy(boltDir);
      const [a, b] = T.lightInSky;
      u.speck.value = ramp(t, a, a + 0.8) * (1 - ramp(t, b - 0.8, b)) * (0.7 + 0.3 * Math.sin(t * 23) * Math.sin(t * 7.3));
      mesh.position.copy(camera.position);
    },
  };
}
