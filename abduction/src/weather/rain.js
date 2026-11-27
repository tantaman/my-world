// Rain (PLAN.md 5.5): thin, short, sparse streaks, easy to see against a
// lamp or in the beam, nearly invisible against dark sky; none under the
// canopy; nothing on the lens. Instanced quads in a box that follows the
// camera, each drop's place a function of its index and t (so it needs no
// state and repeats exactly), stretched along its fall by 1/60 s of travel,
// turned to face the camera about the fall direction, lit by the same list
// of lights as the fog, plus lightning. On layer 1, so the ground's mirror
// leaves it out.
import { Mesh, InstancedBufferGeometry, PlaneGeometry, MeshBasicNodeMaterial, AdditiveBlending, Vector3 } from 'three/webgpu';
import {
  Fn, vec3, vec4, float, uniform, instanceIndex, hash, positionLocal, cameraPosition, cameraProjectionMatrix, cameraViewMatrix,
  normalize, cross, fract, mod, length, dot, max, smoothstep, Loop, exp, step, uv, abs, varying, mix, select,
} from 'three/tsl';
import { CANOPY } from '../set/layout.js';

export const RAIN = {
  count: 20000,
  box: [40, 20, 40],        // metres round the camera
  fall: 9,                  // m/s
  wind: [1.4, 0, 0.6],      // m/s
  width: 0.006,             // metres
  brightness: 0.55,         // how much a drop gathers of the light round it
  // The original's drops are 10 to 20 pixels long at 2048 wide (a shutter of
  // about 1/120 s), seen over the whole sky, and only a little brighter in
  // the beam or under a lamp.
  shutter: 1 / 120,         // seconds of fall in a streak
  ambient: 0.08,            // how bright a drop is with no light near it
  most: 0.35,               // the brightest a drop gets from the lights round it
};

export function createRain({ scatterLights }) {
  const base = new PlaneGeometry(1, 1);
  const geo = new InstancedBufferGeometry();
  geo.index = base.index;
  geo.setAttribute('position', base.getAttribute('position'));
  geo.setAttribute('uv', base.getAttribute('uv'));
  geo.instanceCount = RAIN.count;

  const time = uniform(0);
  const flash = uniform(0);
  const centre = uniform(new Vector3());
  const L = scatterLights.uniforms;
  const vel = vec3(RAIN.wind[0], -RAIN.fall, RAIN.wind[2]);
  const box = vec3(...RAIN.box);

  const glow = varying(float(0), 'vRainGlow');
  const material = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending, fog: false });
  material.vertexNode = Fn(() => {
    const id = float(instanceIndex);
    const seed = vec3(hash(id), hash(id.add(17.3)), hash(id.add(41.7)));
    // Where the drop is: its seed moved by its fall, wrapped into the box round the camera.
    const travelled = seed.mul(box).add(vel.mul(time));
    const rel = mod(travelled.sub(centre).add(box.mul(0.5)), box).sub(box.mul(0.5));
    const p = centre.add(rel).toVar();
    // Gone under the canopy (below its underside, inside its footprint).
    const under = step(CANOPY.x0, p.x).mul(step(p.x, CANOPY.x1)).mul(step(CANOPY.z0, p.z)).mul(step(p.z, CANOPY.z1)).mul(step(p.y, CANOPY.under));
    const below = step(p.y, 0.0);
    const keep = float(1).sub(under).mul(float(1).sub(below));
    // A streak along the fall, facing the camera.
    const along = normalize(vel);
    const toCam = normalize(cameraPosition.sub(p));
    const side = normalize(cross(along, toCam));
    const len = length(vel).mul(RAIN.shutter).mul(hash(id.add(3.3)).mul(0.6).add(0.7));
    const corner = positionLocal.xy;
    const world = p.add(along.mul(corner.y.mul(len))).add(side.mul(corner.x.mul(RAIN.width).mul(keep)));
    // How lit it is: the lights in the fog's list, near it.
    const lit = float(0).toVar();
    Loop(L.count, ({ i }) => {
      const lp = L.pos.element(i).xyz;
      const c = L.col.element(i);
      const a = L.aim.element(i);
      const d = p.sub(lp);
      const d2 = dot(d, d);
      const cone = select(a.w.lessThan(-1.5), float(1), smoothstep(a.w, c.w, dot(normalize(d), a.xyz)));
      lit.addAssign(c.x.add(c.y).add(c.z).mul(cone).div(d2.add(1.0)));
    });
    const far = smoothstep(4, 18, length(p.sub(cameraPosition)));
    const fromLights = lit.mul(RAIN.brightness);
    const capped = fromLights.div(fromLights.div(RAIN.most).add(1));
    glow.assign(capped.add(flash.mul(0.25)).add(RAIN.ambient).mul(float(1).sub(far.mul(0.5))).mul(keep));
    return cameraProjectionMatrix.mul(cameraViewMatrix).mul(vec4(world, 1));
  })();
  const across = abs(uv().x.sub(0.5)).mul(2);
  material.colorNode = vec3(0.85, 0.88, 0.95).mul(glow).mul(float(1).sub(across));

  const mesh = new Mesh(geo, material);
  mesh.frustumCulled = false;
  mesh.layers.set(1);
  mesh.renderOrder = 5;
  return {
    object: mesh,
    update(t, camera, f = 0) {
      time.value = t;
      flash.value = f;
      centre.value.copy(camera.position);
    },
  };
}
