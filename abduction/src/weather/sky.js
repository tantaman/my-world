// The sky (PLAN.md 5.6): a dome, never fogged, drawn first. The clouds are a
// photographed storm sky (a CC0 HDRI's panorama, src/materials/textures.js),
// taken down to night: its brightness becomes how thin the cloud is, and
// the colour is ours, dark blue-grey overhead, browner and warmer low toward
// the lamps, meeting the fog at the horizon. It turns very slowly. A
// lightning strike lights it from inside, brightest round the bolt and where
// the cloud is thick. The small light in the clouds (9.5 to 15 s) is the
// saucer, a long way off.
import { Mesh, SphereGeometry, MeshBasicNodeMaterial, BackSide, Color, Vector3 } from 'three/webgpu';
import {
  Fn, vec2, vec3, float, positionLocal, normalize, max, mix, smoothstep, exp, dot, uniform, clamp, pow, abs,
  mx_fractal_noise_float, acos, atan, color, texture, PI,
} from 'three/tsl';
import { T, ramp } from '../timeline.js';
import { fogUniforms } from './fog.js';
import { skyPanorama } from '../materials/textures.js';

export const SKY = {
  overhead: new Color(0.034, 0.031, 0.044),
  warm: new Color(0.075, 0.058, 0.048),    // toward the lamps (low, +X along the road)
  // The panorama is a daytime sky, brighter overhead than low down; only its
  // structure is used. Its display brightness, measured by elevation (from
  // the zenith, 0, to the horizon, 1): mean MEAN[0] - MEAN[1] down^2.2,
  // spread SPREAD[0] + SPREAD[1] down. A pixel's distance from that mean in
  // spreads is how lit the cloud is, from -SPAN to +SPAN.
  mean: [0.74, 0.26],
  spread: [0.06, 0.05],
  span: [-2.0, 2.4],
  dark: 0.75,                              // thick cloud, times the base colour
  light: 3.6,                              // thin cloud and gaps, times the base colour
  turn: 0.0006,                            // radians a second the clouds turn
  yaw: 2.2,                                // which way the panorama faces (radians)
  drift: [0.004, 0.0015],                  // the fine noise's drift (uv units a second)
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

  // The photographed sky: heavy, billowing storm cloud with lighter gaps.
  const panorama = skyPanorama('overcast_soil_puresky');
  const material = new MeshBasicNodeMaterial({ side: BackSide, depthWrite: false, fog: false });
  material.colorNode = Fn(() => {
    const dir = normalize(positionLocal);
    const up = max(dir.y, 0.0);
    const t = u.time;
    // The panorama: round the horizon, and from the zenith (top) down to the horizon (bottom).
    const around = atan(dir.z, dir.x).add(SKY.yaw).add(t.mul(SKY.turn)).div(PI.mul(2)).add(0.5);
    const down = acos(clamp(up, 0, 1)).div(PI.mul(0.5));
    const photo = texture(panorama, vec2(around, float(1).sub(down))).rgb;
    const lum = pow(dot(photo, vec3(0.2126, 0.7152, 0.0722)), 1 / 2.2);
    // A little moving noise on top, so a held shot is not a still photograph.
    const uv = dir.xz.div(dir.y.add(0.15));
    const fine = mx_fractal_noise_float(vec3(uv.mul(2.6).add(vec2(t.mul(SKY.drift[0]), t.mul(SKY.drift[1]))), 4.0), 3, 2.0, 0.5);
    const z = lum.sub(float(SKY.mean[0]).sub(pow(down, 2.2).mul(SKY.mean[1]))).div(down.mul(SKY.spread[1]).add(SKY.spread[0]));
    const lit = smoothstep(SKY.span[0], SKY.span[1], z.add(fine.mul(0.3)));
    const density = float(1).sub(lit);
    // Gradient: overhead to the warm glow low over the lamps.
    const toLamps = smoothstep(-0.2, 1.0, dir.z.mul(0.5).add(dir.x.mul(0.6)));
    const low = float(1).sub(smoothstep(0.0, 0.55, up));
    const base = mix(color(SKY.overhead), color(SKY.warm), low.mul(toLamps.mul(0.7).add(0.3)));
    // Thick cloud is darker; thin gaps a little lighter, lit from below.
    let c = base.mul(mix(float(SKY.dark), float(SKY.light), lit)).toVar();
    // Toward the horizon, the fog.
    c.assign(mix(c, vec3(fogUniforms.colour), smoothstep(0.22, 0.0, up)));
    // Lightning, inside the clouds round the bolt.
    const ang = acos(clamp(dot(dir, u.bolt), -1, 1));
    // (Tight round the bolt: away from it the original's sky stays dark through a strike.)
    const glow = u.flash.mul(exp(ang.mul(ang).div(-0.09))).mul(density.mul(1.5).add(0.3));
    c.addAssign(vec3(0.55, 0.6, 0.8).mul(glow.mul(0.9).add(u.flash.mul(0.01))));
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
