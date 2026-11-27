// The beam (PLAN.md 5.11, 14 and 15), as the original's frames at 54 to 59
// s show it: a column of milky blue-white light as wide as the opening (4
// m), a little wider at the ground, brightest just under the hull, with
// streaks running down it and smoke turning in it, and a bright mist where
// it meets the ground.
//
// Its brightness per pixel is how far the view ray travels inside it
// (solved exactly on the cone's far wall, so the edges are soft and nothing
// bands), times the streaks and smoke, times how bright it is at that
// height. Growing, its lower end comes down soft, a glowing front a few
// metres long (53.5 to 54.2 s); stopping, the lower end draws back up the
// same way (59.0 to 59.8 s). A short, wider column of the same light stands
// at its foot: the mist it lights on the field.
//
// A spot light (light/rig.js) lights the ground, the cow, the fence post and
// the trees; the light under the hull, the lit ground's glow on the metal.
// Rain in it lights up through the fog's list (weather/rain.js), from two
// entries: the opening, and halfway down.
import {
  Group, Mesh, CylinderGeometry, MeshBasicNodeMaterial, AdditiveBlending, BackSide, Vector3, Color, InstancedBufferGeometry, PlaneGeometry,
} from 'three/webgpu';
import {
  Fn, vec3, vec4, float, uniform, positionWorld, positionLocal, cameraPosition, cameraProjectionMatrix, cameraViewMatrix,
  normalize, dot, sqrt, max, smoothstep, mix, mx_noise_float, mx_fractal_noise_float, clamp, length, exp, sign, abs,
  instanceIndex, hash, fract, cos, sin, cross, varying, uv,
} from 'three/tsl';
import { T, ramp, clamp as clamp01 } from '../timeline.js';

const BOTTOM_GROW = 0.35;     // the beam is this much wider at the ground than at the opening (fraction)
const DENSITY = 0.085;         // brightness per metre of beam the ray crosses
const TOP_GLOW = { gain: 1.7, reach: 2.0 };   // extra brightness just under the hull, and how far down it lasts (m)
const FRONT = 3.5;            // metres over which the beam's lower end fades, while it moves
const GROW_EASE = 1.7;        // the power of its growth against time: slow out of the hull
const LANDED_SOFT = 0.3;      // and once it stands on the ground
const COLOUR = [0.78, 0.9, 1.0];
const FOOT = { radius: 3.6, height: 2.2, density: 0.11 };   // the lit mist at its foot (m)
const SPOT = { cd: 3600, angle: 0.25, penumbra: 0.55 };   // its light on the ground
const UNDER = { cd: 35, drop: 2.2 };    // the lit ground's glow on the hull: a light this far under the opening
// Its entry in the fog's list: strength, a cone, and how far above the
// opening its point is. The point is up inside the hull, so the bright
// tip of the cone's glow is hidden by the metal and what shows below is a
// haze as wide as the opening, not a spike from a point in it.
const SCATTER = { strength: 3.0, half: 0.25, soft: 0.5, above: 8 };
// Rain falling through it, lit: the scene's rain is lit only near the
// opening (by the fog's list, which falls off with distance), so the beam
// has drops of its own, all the way down.
// Short (1/120 s of fall), thin, sparse and only a little brighter than the
// rain outside, as the original's are at 57 s.
const DROPS = { count: 90, fall: 9, length: 0.08, width: 0.006, glow: 0.55 };

// The light gathered across a vertical cone, per pixel, from its far wall.
// radius: the cone's radius at this height; axis: a point on its axis.
const chordAcross = (axis, radius) => {
  const ray = normalize(positionWorld.sub(cameraPosition));
  const o = cameraPosition.xz.sub(axis.xz);
  const d = ray.xz;
  const dd = max(dot(d, d), 1e-4);
  const s = dot(o, d).negate().div(dd);
  const near = o.add(d.mul(s));
  const closest = length(near);
  const chord = sqrt(max(radius.mul(radius).sub(closest.mul(closest)), 0)).mul(2).div(sqrt(dd));
  // Where across the beam the ray passes, -1 .. 1 as the camera sees it.
  const across = closest.div(max(radius, 0.01)).mul(sign(o.x.mul(d.y).sub(o.y.mul(d.x))));
  return { chord, across };
};

export function createBeam({ rig, scatterLights }) {
  const u = {
    axis: uniform(new Vector3()),   // a point on the axis at the opening
    top: uniform(10),               // y of the opening
    low: uniform(0),                // y of the lower end's fully lit part
    soft: uniform(FRONT),           // metres the lower end fades over (0 on the ground)
    topR: uniform(2),               // radius at the opening
    level: uniform(0),
    foot: uniform(0),
    time: uniform(0),
  };

  const geo = new CylinderGeometry(1, 1 + BOTTOM_GROW, 1, 64, 1, true);
  geo.translate(0, -0.5, 0);   // top at 0, bottom at -1: scaled to the ground each frame
  const mat = new MeshBasicNodeMaterial({ side: BackSide, transparent: true, depthWrite: false, blending: AdditiveBlending, fog: false });
  mat.colorNode = Fn(() => {
    const y = positionWorld.y;
    const h = clamp(u.top.sub(y).div(max(u.top, 0.01)), 0, 1);   // 0 at the opening, 1 at the ground
    const radius = u.topR.mul(h.mul(BOTTOM_GROW).add(1));
    const { chord, across } = chordAcross(u.axis, radius);
    const t = u.time;
    // Streaks down its length, fine and broad, drifting slowly down.
    const fine = mx_noise_float(vec3(across.mul(9), y.mul(0.05).add(t.mul(0.35)), 1.7)).mul(0.3).add(0.85);
    const broad = mx_noise_float(vec3(across.mul(3.2), y.mul(0.03).add(t.mul(0.2)), 4.1)).mul(0.4).add(0.85);
    // Smoke turning in it, more of it lower down.
    const smoke = mx_fractal_noise_float(vec3(across.mul(1.6), y.mul(0.22).add(t.mul(0.55)), t.mul(0.12)), 3, 2.0, 0.5)
      .mul(mix(float(0.35), float(0.75), h)).add(1);
    // Brightest under the hull, then a steady glow, a little more near the ground.
    const fromTop = u.top.sub(y);
    const profile = exp(fromTop.div(-TOP_GLOW.reach)).mul(TOP_GLOW.gain).add(0.55).add(smoothstep(2.5, 0, y).mul(0.35));
    // The lower end, soft while it moves.
    const end = smoothstep(u.low.sub(0.01), u.low.add(u.soft), y);
    const edge = smoothstep(0.0, 0.6, chord);
    return vec3(...COLOUR).mul(chord.mul(DENSITY)).mul(fine).mul(broad).mul(max(smoke, 0.2)).mul(profile).mul(end).mul(edge)
      .mul(u.level);
  })();
  const mesh = new Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 4;
  mesh.layers.set(1);

  // The mist at its foot.
  const footGeo = new CylinderGeometry(FOOT.radius, FOOT.radius, FOOT.height, 48, 1, true);
  footGeo.translate(0, FOOT.height / 2, 0);
  const footMat = new MeshBasicNodeMaterial({ side: BackSide, transparent: true, depthWrite: false, blending: AdditiveBlending, fog: false });
  footMat.colorNode = Fn(() => {
    const y = positionWorld.y;
    const { chord, across } = chordAcross(u.axis, float(FOOT.radius));
    const n = mx_fractal_noise_float(vec3(across.mul(2.0), y.mul(0.8).sub(u.time.mul(0.3)), u.time.mul(0.2)), 2, 2.0, 0.5).mul(0.5).add(1);
    const low = exp(max(y, 0).div(-0.55));
    // Brighter toward the middle, where the beam itself comes down.
    const core = float(1).sub(smoothstep(0.2, 1.0, abs(across))).mul(1.5).add(0.4);
    return vec3(...COLOUR).mul(chord.mul(FOOT.density)).mul(low).mul(core).mul(max(n, 0.2)).mul(u.foot);
  })();
  const foot = new Mesh(footGeo, footMat);
  foot.frustumCulled = false;
  foot.renderOrder = 4;
  foot.layers.set(1);
  mesh.add(foot);

  // Its own lit rain: drops placed from their index and t, inside the cone.
  const plane = new PlaneGeometry(1, 1);
  const dropGeo = new InstancedBufferGeometry();
  dropGeo.index = plane.index;
  dropGeo.setAttribute('position', plane.getAttribute('position'));
  dropGeo.setAttribute('uv', plane.getAttribute('uv'));
  dropGeo.instanceCount = DROPS.count;
  const dropGlow = varying(float(0), 'vBeamDrop');
  const dropMat = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending, fog: false });
  dropMat.vertexNode = Fn(() => {
    const id = float(instanceIndex);
    const span = max(u.top, 1);
    const y = fract(hash(id.add(3.3)).sub(u.time.mul(DROPS.fall).div(span))).mul(span);
    const h = float(1).sub(y.div(span));
    const radius = u.topR.mul(h.mul(BOTTOM_GROW).add(1));
    const a = hash(id).mul(Math.PI * 2);
    const rr = sqrt(hash(id.add(7.1))).mul(radius).mul(0.95);
    const p = vec3(u.axis.x.add(cos(a).mul(rr)), y, u.axis.z.add(sin(a).mul(rr)));
    const along = vec3(0, -1, 0);
    const side = normalize(cross(along, normalize(cameraPosition.sub(p))));
    const corner = positionLocal.xy;
    const world = p.add(along.mul(corner.y.mul(DROPS.length))).add(side.mul(corner.x.mul(DROPS.width)));
    const end = smoothstep(u.low.sub(0.01), u.low.add(u.soft), y);
    const lit = exp(u.top.sub(y).div(-4)).mul(1.5).add(0.5);
    dropGlow.assign(lit.mul(end).mul(hash(id.add(11.9)).mul(0.7).add(0.3)).mul(u.level).mul(DROPS.glow));
    return cameraProjectionMatrix.mul(cameraViewMatrix).mul(vec4(world, 1));
  })();
  dropMat.colorNode = vec3(0.85, 0.92, 1.0).mul(dropGlow).mul(float(1).sub(abs(uv().x.sub(0.5)).mul(2)));
  const drops = new Mesh(dropGeo, dropMat);
  drops.frustumCulled = false;
  drops.renderOrder = 5;
  drops.layers.set(1);

  const group = new Group();
  group.add(mesh, drops);

  const light = rig.lights.beam;
  light.angle = SPOT.angle;
  light.penumbra = SPOT.penumbra;
  const under = rig.lights.ufoLight;
  under.distance = 40;
  const colour = new Color(...COLOUR);
  const down = new Vector3(0, -1, 0);
  const _source = new Vector3();

  return {
    object: group,
    // opening: world position of the beam's top, in the hull's bore; topR: its radius there.
    update(t, opening, visible, topR) {
      u.time.value = t;
      // How far down it reaches, 0 (at the hull) .. 1 (on the ground), and how far it has drawn back.
      // Slow out of the opening, quickening toward the ground (the original's 53.6 to 54.4 s).
      const grow = Math.pow(clamp01((t - T.beamStart) / (T.beamGround - T.beamStart)), GROW_EASE);
      const back = ramp(t, T.beamUp, T.beamOff);
      const on = visible && t >= T.beamStart && t < T.beamOff + 0.2;
      mesh.visible = on;
      drops.visible = on;
      const top = opening.y;
      u.axis.value.copy(opening);
      u.top.value = top;
      u.topR.value = topR;
      // The lower end: coming down, soft; landing, it firms up; going back
      // up, it softens again.
      const landed = ramp(t, T.beamGround - 0.2, T.beamGround + 0.4);
      const rising = ramp(t, T.beamUp, T.beamUp + 0.3);
      u.low.value = back > 0 ? back * top : top * (1 - grow);
      u.soft.value = FRONT + (LANDED_SOFT - FRONT) * landed * (1 - rising);
      u.level.value = on ? 1 : 0;
      u.foot.value = on ? ramp(t, T.beamGround - 0.25, T.beamGround + 0.3) * (1 - ramp(t, T.beamUp, T.beamUp + 0.5)) : 0;
      mesh.position.set(opening.x, top, opening.z);
      mesh.scale.set(topR, Math.max(0.01, top), topR);
      foot.position.set(0, -1, 0);
      foot.scale.set(1 / topR, 1 / Math.max(0.01, top), 1 / topR);
      // Its light on the ground and the cow, while the beam touches it.
      // Lighting the field only once it is down.
      const lit = on ? Math.min(ramp(t, T.beamGround - 0.2, T.beamGround + 0.25), 1 - back) : 0;
      light.intensity = SPOT.cd * lit;
      light.position.copy(opening);
      light.target.position.set(opening.x, 0, opening.z);
      // The lit ground and mist shine back up on the hull.
      under.intensity = UNDER.cd * lit;
      under.position.set(opening.x, top - UNDER.drop, opening.z);
      if (on) {
        const strength = 1 - back;
        _source.copy(opening).y += SCATTER.above;
        scatterLights.add(_source, colour, SCATTER.strength * strength, down, SCATTER.half, SCATTER.soft);
      }
    },
  };
}
