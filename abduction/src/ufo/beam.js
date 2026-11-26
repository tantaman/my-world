// The beam (PLAN.md 5.11, 14 and 15): a cone from the opening to the ground,
// 2.5 m wide at the top and 3.5 m at the bottom. Its brightness per pixel is
// how far the view ray travels inside it (solved exactly, so the edges are
// soft and nothing bands), times streaks that drift, times a fade toward the
// ground. It grows down when it starts and draws up from the ground when it
// stops. A spot light (light/rig.js) lights the ground, the cow and the
// trees; rain in it lights up (weather/rain.js, through the fog's list).
import { Mesh, CylinderGeometry, MeshBasicNodeMaterial, AdditiveBlending, BackSide, Vector3, Color } from 'three/webgpu';
import {
  Fn, vec2, vec3, float, uniform, positionWorld, cameraPosition, normalize, dot, sqrt, max, min, smoothstep, mix,
  mx_noise_float, atan, clamp, length, exp,
} from 'three/tsl';
import { T, ramp } from '../timeline.js';

const TOP_R = 1.25;
const BOTTOM_R = 2.4;
const DENSITY = 0.3;      // brightness per metre of beam the ray crosses
const COLOUR = [0.75, 0.88, 1.0];

export function createBeam({ rig, scatterLights }) {
  const u = {
    axis: uniform(new Vector3()),   // a point on the axis at the hull's opening
    top: uniform(10),               // y of the opening
    bottom: uniform(0),             // y where the beam ends below
    level: uniform(0),
    time: uniform(0),
  };
  const geo = new CylinderGeometry(TOP_R, BOTTOM_R, 1, 40, 1, true);
  geo.translate(0, -0.5, 0);   // top at 0, bottom at -1: scaled to length each frame
  const mat = new MeshBasicNodeMaterial({ side: BackSide, transparent: true, depthWrite: false, blending: AdditiveBlending, fog: false });
  mat.colorNode = Fn(() => {
    const ray = normalize(positionWorld.sub(cameraPosition));
    const h = clamp(u.top.sub(positionWorld.y).div(max(u.top.sub(u.bottom), 0.01)), 0, 1);
    const radius = mix(float(TOP_R), float(BOTTOM_R), h);
    // The chord of the ray across the cone, in the horizontal plane at this height.
    const o = cameraPosition.xz.sub(u.axis.xz);
    const d = ray.xz;
    const dd = max(dot(d, d), 1e-4);
    const s = dot(o, d).negate().div(dd);
    const closest = length(o.add(d.mul(s)));
    const chord = sqrt(max(radius.mul(radius).sub(closest.mul(closest)), 0)).mul(2).div(sqrt(dd));
    // Streaks drifting up, and wisps.
    const ang = atan(positionWorld.z.sub(u.axis.z), positionWorld.x.sub(u.axis.x));
    const streak = mx_noise_float(vec3(ang.mul(3.0), positionWorld.y.mul(0.25).sub(u.time.mul(0.9)), 0.5)).mul(0.45).add(0.75);
    const wisp = mx_noise_float(positionWorld.mul(0.6).add(vec3(0, u.time.mul(-0.6), 0))).mul(0.3).add(0.85);
    // Brighter at the opening and where it meets the ground.
    const nearTop = exp(h.mul(-3)).mul(1.3);
    const nearGround = smoothstep(0.85, 1.0, h).mul(0.2);
    const edge = smoothstep(0.0, 0.25, chord).mul(float(1).sub(smoothstep(0.86, 1.0, h).mul(0.75)));
    return vec3(...COLOUR).mul(chord.mul(DENSITY)).mul(streak).mul(wisp).mul(nearTop.add(nearGround).add(0.3)).mul(edge).mul(u.level);
  })();
  const mesh = new Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 4;
  mesh.layers.set(1);

  const light = rig.lights.beam;
  const ufoLight = rig.lights.ufoLight;
  const colour = new Color(...COLOUR);
  const down = new Vector3(0, -1, 0);

  return {
    object: mesh,
    // opening: world position of the hull's opening.
    update(t, opening, visible) {
      u.time.value = t;
      // How far down it reaches, 0 (at the hull) .. 1 (on the ground), and from where.
      const grow = ramp(t, T.beamStart, T.beamGround);
      const lift = ramp(t, T.beamUp, T.beamOff);
      const on = visible && t >= T.beamStart && t < T.beamOff;
      mesh.visible = on;
      const top = opening.y;
      const reachY = top * (1 - grow);
      const bottomY = Math.max(reachY, 0);
      const startY = lift > 0 ? Math.min(top, bottomY + (top - bottomY) * lift) : bottomY;
      u.axis.value.copy(opening);
      u.top.value = top;
      u.bottom.value = 0;
      u.level.value = on ? 1 - 0.3 * lift : 0;
      const len = Math.max(0.01, top - startY);
      mesh.position.copy(opening);
      mesh.scale.set(1, len, 1);
      // Its light on the ground and the cow, and the glow under the hull.
      const reached = grow >= 0.999 && lift < 0.5;
      light.intensity = on && reached ? (light.userData.cd ?? 6000) * (1 - lift * 2) : on ? 800 * grow : 0;
      light.position.copy(opening);
      light.target.position.set(opening.x, 0, opening.z);
      ufoLight.intensity = visible ? 250 * (0.4 + 0.6 * (on ? 1 : 0)) : 0;
      ufoLight.position.set(opening.x, opening.y - 0.6, opening.z);
      if (on) {
        scatterLights.add(opening, colour, 3.2 * (1 - lift), down, 0.17, 0.4);
      }
    },
  };
}
