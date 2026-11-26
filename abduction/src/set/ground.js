// The ground: one flat mesh at y = 0 for the forecourt, the verge, the road,
// the far shoulder and the field, with one material that knows which is
// where (PLAN.md 5.3). Most of every frame is this, wet.
//
// Two things sell the wet look, and they are separate:
// - the long bright streaks under every lamp are the lamp's own highlight on
//   a surface that is smooth but not flat: real lights, low roughness and a
//   gentle normal give them, breaking into patches where the roughness
//   changes from puddle to damp concrete. The lamps that are not real lights
//   are painted in here the same way (farLamps);
// - the upside-down van in a puddle is a true mirror image: the scene drawn
//   again from below by reflector(), added where the ground is wet.
import { Mesh, Group, PlaneGeometry, MeshStandardNodeMaterial } from 'three/webgpu';
import {
  Fn, vec2, vec3, vec4, float, positionWorld, cameraPosition, reflector, smoothstep, mix, max, min, abs, clamp, pow,
  normalize, dot, length, exp, step, fract, floor, Loop, select, cameraViewMatrix, uniform, hash, sin, sqrt, uv,
} from 'three/tsl';
import * as L from './layout.js';
import { noise2, fbm2, cellEdge } from '../materials/noise.js';

// Hand-placed puddles where the original has them: [x, z, radius x, radius z].
export const PUDDLES = [
  [6.5, 6.8, 4.0, 2.2],    // in front of the van, where it is mirrored in 04
  [-0.5, 9.0, 3.0, 2.2],   // beside island A
  [-11.5, 12.6, 3.5, 1.2], // under the first street lamps
  [-1.2, 12.8, 4.5, 1.0],
  [9.0, 12.8, 3.0, 1.0],
  [-8.0, 8.0, 3.2, 2.0],   // the forecourt in front of the camera at the start
  [-4.0, 4.5, 2.5, 1.6],
  [1.0, 23.6, 4.0, 1.4],   // the far shoulder, where the cow and the beam are mirrored
  [-6.0, 23.4, 3.0, 1.0],
];

const EXTENT = { x0: -420, x1: 420, z0: -60, z1: 320 };

export function createGround({ farLamps, has }) {
  const geometry = new PlaneGeometry(EXTENT.x1 - EXTENT.x0, EXTENT.z1 - EXTENT.z0, 1, 1);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate((EXTENT.x0 + EXTENT.x1) / 2, 0, (EXTENT.z0 + EXTENT.z1) / 2);

  const time = uniform(0);
  const mirrorOn = has('mirror');
  const mirror = mirrorOn ? reflector({ resolutionScale: 0.5, generateMipmaps: true, bounces: false }) : null;
  if (mirror) mirror.target.rotateX(-Math.PI / 2);

  // Zones across the ground, by z (and x for the forecourt's ends).
  const zones = (p) => {
    const z = p.y;
    const x = p.x;
    const edge = fbm2(p, 2.0, 2).mul(0.25);
    const forecourtX = smoothstep(L.FORECOURT.x0 - 0.5, L.FORECOURT.x0 + 0.5, x).mul(smoothstep(L.FORECOURT.x1 + 0.5, L.FORECOURT.x1 - 0.5, x));
    const forecourt = step(-0.01, z).mul(smoothstep(L.FORECOURT.z1 + 0.15, L.FORECOURT.z1 - 0.05, z.add(edge.mul(0.3)))).mul(forecourtX);
    const road = smoothstep(L.ROAD.z0 - 0.05, L.ROAD.z0 + 0.05, z.add(edge.mul(0.2))).mul(smoothstep(L.ROAD.z1 + 0.05, L.ROAD.z1 - 0.05, z.add(edge.mul(0.2))));
    const field = smoothstep(L.FENCE.z - 1.0, L.FENCE.z + 1.0, z.add(edge.mul(3)));
    return { forecourt, road, field };
  };

  // Height of the surface's detail (metres), for its normal and where water sits.
  const detail = Fn(([p, forecourt, road]) => {
    // Slab joints every 4 m on the forecourt, and cracks.
    const s = p.div(L.FORECOURT.slab);
    const j = min(abs(fract(s.x).sub(0.5)), abs(fract(s.y).sub(0.5)));
    const joint = smoothstep(0.495, 0.5, j.add(0.0)).mul(forecourt);
    const crackEdge = cellEdge(p.mul(0.3).add(noise2(p, 2.0).mul(0.9)));
    const crack = smoothstep(0.025, 0.0, crackEdge).mul(smoothstep(0.1, 0.6, fbm2(p.add(40), 6.0, 2).add(0.4))).mul(forecourt);
    const grain = fbm2(p, 0.35, 3).mul(0.002).add(fbm2(p, 3.0, 2).mul(0.006));
    const asphalt = noise2(p, 0.08).mul(0.0012).mul(road);
    return grain.add(asphalt).sub(joint.mul(0.004)).sub(crack.mul(0.006));
  });

  // 0 (damp) .. 1 (standing water).
  const wetness = Fn(([p, z, forecourt, road, field]) => {
    const blob = float(0).toVar();
    for (const [x, zz, rx, rz] of PUDDLES) {
      const d = length(p.sub(vec2(x, zz)).div(vec2(rx, rz)));
      blob.assign(max(blob, smoothstep(1.0, 0.55, d.add(fbm2(p.add(x), 1.2, 3).mul(0.35)))));
    }
    const n = fbm2(p.add(vec2(17, -3)), 4.0, 4);
    const puddles = smoothstep(0.08, 0.2, n);
    const forecourtW = max(blob, puddles).mul(forecourt).mul(0.95).add(float(0.32).mul(forecourt));
    // Water along the road's edges and in its ruts.
    const rut = smoothstep(0.9, 0.0, abs(z.sub(L.ROAD.z0 + 0.6))).add(smoothstep(0.9, 0.0, abs(z.sub(L.ROAD.z1 - 0.6))));
    const roadW = clamp(rut.mul(smoothstep(-0.1, 0.25, n)).add(smoothstep(0.15, 0.3, n)).add(0.35), 0, 1).mul(road);
    const fieldW = smoothstep(-0.25, 0.1, fbm2(p, 7.0, 3)).mul(0.9).mul(field);
    const rest = float(1).sub(forecourt).sub(road).sub(field).max(0);
    const restW = max(blob, smoothstep(0.15, 0.35, n)).mul(rest).add(rest.mul(0.15));
    return clamp(forecourtW.add(roadW).add(fieldW).add(restW), 0, 1);
  });

  const material = new MeshStandardNodeMaterial({ metalness: 0 });

  const p = positionWorld.xz;
  const z = positionWorld.z;
  const zn = zones(p);
  const forecourt = zn.forecourt;
  const road = zn.road;
  const field = zn.field;
  const dirt = float(1).sub(forecourt).sub(road).sub(field).max(0);

  // Albedo per zone (linear).
  const concrete = vec3(0.13, 0.125, 0.115).mul(fbm2(p, 2.5, 3).mul(0.25).add(0.9)).mul(fbm2(p.add(9), 0.4, 2).mul(0.1).add(1));
  const stain = smoothstep(0.0, 0.5, fbm2(p.add(33), 5, 3));
  const concreteC = mix(concrete, concrete.mul(vec3(0.55, 0.5, 0.45)), stain.mul(0.6));
  const asphaltC = vec3(0.065, 0.062, 0.06).mul(fbm2(p, 1.5, 3).mul(0.2).add(1));
  // Road markings: white edge lines and a dashed yellow centre, worn.
  const wear = smoothstep(-0.3, 0.2, fbm2(p, 0.6, 3));
  const edgeLine = smoothstep(0.08, 0.06, abs(z.sub(L.ROAD.z0 + 0.25))).add(smoothstep(0.08, 0.06, abs(z.sub(L.ROAD.z1 - 0.25))));
  const dash = step(fract(p.x.div(9.0)), 0.45);
  const centreLine = smoothstep(0.08, 0.06, abs(z.sub(L.ROAD.centre))).mul(dash);
  const roadC = mix(mix(asphaltC, vec3(0.55, 0.55, 0.52), edgeLine.mul(wear).mul(0.8)), vec3(0.5, 0.36, 0.06), centreLine.mul(wear));
  const dirtC = vec3(0.075, 0.06, 0.045).mul(fbm2(p, 0.7, 3).mul(0.35).add(1));
  const fieldC = mix(vec3(0.05, 0.065, 0.035), vec3(0.09, 0.075, 0.05), smoothstep(-0.2, 0.3, fbm2(p, 3, 3)));
  const albedo = concreteC.mul(forecourt).add(roadC.mul(road)).add(fieldC.mul(field)).add(dirtC.mul(dirt));

  const w = wetness(p, z, forecourt, road, field).toVar();
  const h = detail(p, forecourt, road);
  // Water fills the grooves: wetter in joints and cracks.
  const wet = clamp(w.add(h.mul(-40).max(0)), 0, 1).toVar();

  material.colorNode = albedo.mul(mix(0.6, 0.4, wet));
  const dryRough = mix(float(0.55), float(0.72), road.add(dirt).add(field));
  material.roughnessNode = mix(dryRough.mul(1.15).min(0.85), float(0.05), smoothstep(0.5, 0.9, wet));

  // Normal: the surface's detail, flattening to a mirror where water stands,
  // plus faint rings where rain falls on it.
  const eps = 0.015;
  const hx = detail(p.add(vec2(eps, 0)), forecourt, road);
  const hz = detail(p.add(vec2(0, eps)), forecourt, road);
  const flat = smoothstep(0.55, 0.95, wet);
  const cell = floor(p.mul(1.6));
  const local = fract(p.mul(1.6)).sub(0.5);
  const phase = fract(time.mul(0.9).add(hash(cell.x.add(cell.y.mul(113.0)))));
  const ring = sin(length(local).sub(phase.mul(0.5)).mul(60.0)).mul(smoothstep(0.5, 0.0, phase)).mul(smoothstep(0.45, 0.0, length(local)));
  const rip = ring.mul(0.0015).mul(flat);
  const gx = hx.sub(h).div(eps).mul(float(1).sub(flat.mul(0.9))).add(rip);
  const gz = hz.sub(h).div(eps).mul(float(1).sub(flat.mul(0.9))).add(rip);
  const nWorld = normalize(vec3(gx.negate(), 1, gz.negate()));
  material.normalNode = cameraViewMatrix.mul(vec4(nWorld, 0)).xyz.normalize();

  // The mirror, and the street lamps that are not real lights.
  const V = normalize(cameraPosition.sub(positionWorld));
  const cosV = max(dot(nWorld, V), 0.0);
  const fresnel = float(0.02).add(float(0.98).mul(pow(float(1).sub(cosV), 5)));
  let emissive = vec3(0);
  if (mirror) {
    mirror.uvNode = mirror.uvNode.add(vec2(gx, gz).mul(0.06));
    mirror.levelNode = smoothstep(0.95, 0.4, wet).mul(5);
    emissive = mirror.rgb.mul(fresnel).mul(smoothstep(0.3, 0.9, wet));
  }
  const painted = Fn(() => {
    const sum = vec3(0).toVar();
    const rough = mix(float(0.5), float(0.06), smoothstep(0.45, 0.9, wet));
    const shin = float(2).div(rough.mul(rough)).sub(2);
    Loop(farLamps.count, ({ i }) => {
      const lp = farLamps.pos.element(i);
      const Lv = lp.xyz.sub(positionWorld);
      const d2 = dot(Lv, Lv);
      const Ld = Lv.div(sqrt(d2));
      const ndl = max(dot(nWorld, Ld), 0);
      const cone = smoothstep(0.15, 0.45, Ld.y);
      const E = lp.w.mul(ndl).mul(cone).div(d2);
      const H = normalize(Ld.add(V));
      const spec = pow(max(dot(nWorld, H), 0), shin).mul(shin.add(8).div(25.13)).mul(fresnel.mul(0.5).add(0.04));
      sum.addAssign(vec3(1.0, 0.77, 0.56).mul(E).mul(material.colorNode.mul(0.318).add(spec)));
    });
    return sum;
  });
  if (has('farlamps')) emissive = emissive.add(painted());
  material.emissiveNode = emissive;

  const mesh = new Mesh(geometry, material);
  mesh.receiveShadow = true;
  mesh.name = 'ground';
  const object = new Group().add(mesh);
  if (mirror) object.add(mirror.target);

  return {
    object,
    mirror,
    update(t) { time.value = t; },
  };
}
