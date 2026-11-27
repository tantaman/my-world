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
//
// The surfaces are photo-scanned (CC0, Poly Haven; materials/textures.js):
// concrete with its aggregate for the forecourt, tarred gravel for the road,
// muddy gravel for the verge's strip, sparse grass for the field. The ground
// is hundreds of metres across, so each is looked up twice, at two sizes and
// turned, and the two mixed by slow noise, and the forecourt is stained at a
// third, larger size: no tile repeats where the eye can catch it. Each photo
// gives the pattern only; its colour is scaled to the zone's own (`ALBEDO`),
// so the night's exposure is set here and not by the photographer's.
//
// Over that, in code: the slab joints and cracks, oil stains by the pumps,
// the road's markings, where water stands (the hand-placed puddles where the
// original has them, and noise), and faint rings where rain lands.
import { Mesh, Group, PlaneGeometry, MeshStandardNodeMaterial } from 'three/webgpu';
import {
  Fn, vec2, vec3, vec4, float, positionWorld, cameraPosition, reflector, smoothstep, mix, max, min, abs, clamp, pow,
  normalize, dot, length, step, fract, floor, Loop, cameraViewMatrix, uniform, hash, sin, sqrt, texture, fwidth,
} from 'three/tsl';
import * as L from './layout.js';
import { noise2, fbm2, cellEdge } from '../materials/noise.js';
import { pbr } from '../materials/textures.js';

// Hand-placed puddles where the original has them: [x, z, radius x, radius z].
export const PUDDLES = [
  [6.5, 6.8, 4.0, 2.2],    // in front of the van, where it is mirrored in 04
  [-0.5, 9.0, 3.0, 2.2],   // beside island A
  [-11.5, 12.6, 3.5, 1.2], // under the first street lamps
  [-1.2, 12.8, 4.5, 1.0],
  [9.0, 12.8, 3.0, 1.0],
  [-8.0, 8.0, 3.2, 2.0],   // the forecourt in front of the camera at the start
  [-4.0, 4.5, 2.5, 1.6],
  [2.5, 3.6, 2.6, 1.5],    // under the canopy, the tubes mirrored in it in 09
  [1.0, 23.6, 4.0, 1.4],   // the far shoulder, where the cow and the beam are mirrored
  [-6.0, 23.4, 3.0, 1.0],
];

// Oil and dirt where cars stand and fill up: [x, z, radius (m)].
const OIL = [
  [1.5 + 0.9, 9.4, 1.3], [1.5 - 0.6, 6.7, 1.0],  // island A, both sides of the pump
  [9.5 + 0.9, 9.4, 1.2], [9.5 - 0.4, 6.6, 1.1],  // island B
  [8.6, 2.6, 1.6], [5.0, 2.4, 1.1],              // under the van
  [-6.0, 9.5, 1.4], [16.0, 6.5, 1.8],             // where other cars have stood
];

const EXTENT = { x0: -420, x1: 420, z0: -60, z1: 320 };

// The photos, with the size of ground each covers (metres) and the mean of
// its colour map (linear), measured, so that colour / mean is its pattern.
const SURFACES = {
  concrete: { tex: pbr('granular_concrete'), size: 2.4, mean: [0.156, 0.136, 0.102] },
  stains: { tex: pbr('damaged_concrete_floor'), size: 9.0, mean: [0.0665, 0.0453, 0.028] },
  asphalt: { tex: pbr('tarred_gravel'), size: 2.2, mean: [0.0524, 0.0462, 0.0382] },
  dirt: { tex: pbr('brown_mud_rocks_01'), size: 1.3, mean: [0.103, 0.079, 0.049] },
  grass: { tex: pbr('sparse_grass'), size: 2.0, mean: [0.0816, 0.0491, 0.0087] },
};

// Each zone's colour (linear albedo, dry; wet ground is darker, below).
const ALBEDO = {
  concrete: [0.072, 0.065, 0.056],
  asphalt: [0.039, 0.037, 0.035],
  dirt: [0.06, 0.048, 0.036],
  field: [0.05, 0.05, 0.028],
  paintWhite: [0.5, 0.5, 0.47],
  paintYellow: [0.5, 0.34, 0.05],
};

// Roughness of each surface where it is damp but not under water; standing
// water is POOL_ROUGH, a mirror.
const DAMP_ROUGH = { concrete: 0.22, asphalt: 0.3, dirt: 0.5, field: 0.6 };
const POOL_ROUGH = 0.025;
// How much each photo's normal map bends the light (1 = as scanned).
const BUMP = { concrete: 0.8, asphalt: 0.9, dirt: 0.7, field: 0.5 };
// Wet ground's colour against dry: damp, and under standing water.
const DARKEN = { damp: 0.62, pool: 0.4 };

// The second lookup of each photo: this much bigger, turned by this much (radians).
const SECOND = { scale: 1.37, turn: 0.71 };
// How wide the slab joints and cracks are (m).
const JOINT_W = 0.022;
const CRACK_W = 0.014;
// The cracks' two networks: how big their cells are (m).
const CRACK_CELL = { big: 3.2, fine: 1.1 };
// The road's markings (m): line width, the edge lines' distance in from the
// edge, and the centre line's dashes.
const LINE_W = 0.12;
const EDGE_IN = 0.22;
const DASH = { period: 9.0, on: 3.2 };
// The verge: concrete to this far short of the road (m), more or less by
// VERGE_RAGGED (m), then a strip of muddy gravel.
const VERGE_STRIP = 1.0;
const VERGE_RAGGED = 0.7;
// The welcome sign stands in a patch of dirt and long grass (02): its size (m).
const SIGN_PATCH = { rx: 2.6, rz: 1.6 };

// A photo looked up at p (metres) twice, at two sizes and turns, the two
// mixed by `m` (0..1): its colour as a multiple of its mean, and the slope of
// its surface (dh/dx, dh/dz), from the normal map (OpenGL's convention).
function lookup(surface, p, m, withNormal = true) {
  const { tex, size, mean } = surface;
  const c = Math.cos(SECOND.turn);
  const s = Math.sin(SECOND.turn);
  const uvA = p.div(size);
  const uvB = vec2(p.x.mul(c).sub(p.y.mul(s)), p.x.mul(s).add(p.y.mul(c))).div(size * SECOND.scale).add(vec2(0.37, 0.61));
  const colour = mix(texture(tex.map, uvA).rgb, texture(tex.map, uvB).rgb, m).div(vec3(...mean));
  if (!withNormal) return { colour };
  const nA = texture(tex.normal, uvA).xyz.mul(2).sub(1);
  const nB = texture(tex.normal, uvB).xyz.mul(2).sub(1);
  const sA = nA.xy.div(nA.z.max(0.3)).negate();
  const sBuv = nB.xy.div(nB.z.max(0.3)).negate();
  // Turned back into the ground's own axes.
  const sB = vec2(sBuv.x.mul(c).add(sBuv.y.mul(s)), sBuv.y.mul(c).sub(sBuv.x.mul(s)));
  return { colour, slope: mix(sA, sB, m) };
}

// A line of width w (m) at distance d (m) from it, without shimmer far off:
// a line thinner than a pixel fades rather than flickers.
const line = (d, w) => {
  const aa = fwidth(d).max(1e-4);
  const half = w * 0.5;
  const cover = smoothstep(aa.add(half), max(float(half).sub(aa), 0), d);
  return cover.mul(min(float(w).div(aa.mul(2)), 1));
};

export function createGround({ farLamps, has }) {
  const geometry = new PlaneGeometry(EXTENT.x1 - EXTENT.x0, EXTENT.z1 - EXTENT.z0, 1, 1);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate((EXTENT.x0 + EXTENT.x1) / 2, 0, (EXTENT.z0 + EXTENT.z1) / 2);

  const time = uniform(0);
  const mirrorOn = has('mirror');
  const mirror = mirrorOn ? reflector({ resolutionScale: 0.5, generateMipmaps: true, bounces: false }) : null;
  if (mirror) {
    mirror.target.rotateX(-Math.PI / 2);
    // Its camera is a copy of the main one, which also sees layer 1 (rain,
    // trails, most grass): keep those out of the reflection.
    const base = mirror.reflector.getVirtualCamera.bind(mirror.reflector);
    mirror.reflector.getVirtualCamera = (camera) => {
      const virtual = base(camera);
      virtual.layers.set(0);
      return virtual;
    };
  }

  const material = new MeshStandardNodeMaterial({ metalness: 0 });
  const p = positionWorld.xz;
  const x = p.x;
  const z = p.y;

  // Zones across the ground, by z (and x for the forecourt's ends). The
  // forecourt's concrete runs on over the verge, nearly to the road, its
  // edge broken; between it and the road a strip of muddy gravel.
  const edge = fbm2(p, 2.0, 2).mul(0.25);
  const forecourtX = smoothstep(L.FORECOURT.x0 - 0.5, L.FORECOURT.x0 + 0.5, x).mul(smoothstep(L.FORECOURT.x1 + 0.5, L.FORECOURT.x1 - 0.5, x));
  const concreteEnd = float(L.ROAD.z0 - VERGE_STRIP).sub(noise2(p, 3.0).add(1).mul(0.5 * VERGE_RAGGED)).add(noise2(p, 0.35).mul(0.08));
  const signPatch = smoothstep(1.0, 0.8, length(p.sub(vec2(L.SIGN.x, L.SIGN.z)).div(vec2(SIGN_PATCH.rx, SIGN_PATCH.rz))).add(noise2(p, 0.6).mul(0.18)));
  const forecourt = step(-0.01, z).mul(smoothstep(0.03, -0.03, z.sub(concreteEnd))).mul(forecourtX).mul(float(1).sub(signPatch)).toVar();
  const road = smoothstep(L.ROAD.z0 - 0.04, L.ROAD.z0 + 0.04, z.add(edge.mul(0.12))).mul(smoothstep(L.ROAD.z1 + 0.04, L.ROAD.z1 - 0.04, z.add(edge.mul(0.12)))).toVar();
  const field = smoothstep(L.FENCE.z - 1.0, L.FENCE.z + 1.0, z.add(edge.mul(3))).toVar();
  const dirt = float(1).sub(forecourt).sub(road).sub(field).max(0).toVar();

  // Which of each photo's two lookups shows, by slow noise.
  const m = smoothstep(-0.3, 0.3, noise2(p.add(vec2(31, 7)), 11.0)).toVar();
  const conc = lookup(SURFACES.concrete, p, m);
  const asph = lookup(SURFACES.asphalt, p, m);
  const drt = lookup(SURFACES.dirt, p, m);
  const grs = lookup(SURFACES.grass, p, m, false);
  // Big stains over the concrete: the damaged floor's blotches, softened.
  const stain = lookup(SURFACES.stains, p.add(vec2(13, 5)), float(1).sub(m), false).colour;
  const stainK = pow(stain.dot(vec3(0.2126, 0.7152, 0.0722)).clamp(0.25, 3.0), 1.4);

  // Slab joints, every few metres on the forecourt; cracks, wandering, in
  // patches. Both dark, and water sits in them.
  const s = p.div(L.FORECOURT.slab);
  const jd = float(0.5).sub(max(abs(fract(s.x).sub(0.5)), abs(fract(s.y).sub(0.5)))).mul(L.FORECOURT.slab);
  const joint = line(jd, JOINT_W).mul(forecourt).mul(smoothstep(-0.6, 0.0, noise2(p, 6.0)));
  const warp = vec2(noise2(p, 1.7), noise2(p.add(19), 1.7)).mul(0.45).add(vec2(noise2(p, 0.4), noise2(p.add(5), 0.4)).mul(0.12))
    .add(vec2(noise2(p, 0.11), noise2(p.add(9), 0.11)).mul(0.025));
  const crackBig = line(cellEdge(p.add(warp).div(CRACK_CELL.big)).mul(CRACK_CELL.big * 0.5), CRACK_W).mul(smoothstep(-0.05, 0.35, fbm2(p.add(40), 9.0, 2)));
  const crackFine = line(cellEdge(p.add(warp.mul(0.6)).div(CRACK_CELL.fine).add(3.3)).mul(CRACK_CELL.fine * 0.5), CRACK_W * 0.7).mul(smoothstep(0.25, 0.55, fbm2(p.add(70), 5.0, 2)));
  const crack = max(crackBig, crackFine).mul(forecourt);
  const groove = max(joint, crack).toVar();

  // Oil: dark, smoother patches by the pumps and where the van stands.
  // (One noise for all their edges: they are far enough apart not to look alike.)
  const oilEdge = fbm2(p.add(vec2(11, 3)), 0.6, 3).mul(0.5).toVar();
  const oil = OIL.reduce((acc, [ox, oz, r]) => {
    const d = length(p.sub(vec2(ox, oz))).div(r);
    return max(acc, smoothstep(1.0, 0.3, d.add(oilEdge)));
  }, float(0)).mul(forecourt).toVar();

  // Albedo per zone (linear).
  const contrast = (c, k) => pow(c.max(0.001), k);
  const concreteC = vec3(...ALBEDO.concrete).mul(contrast(conc.colour, 1.5)).mul(stainK).mul(oil.mul(-0.55).add(1)).mul(groove.mul(-0.7).add(1));
  // The road: its markings, white at both edges and a dashed yellow centre, worn.
  const wear = smoothstep(-0.35, 0.25, fbm2(p, 0.7, 3)).mul(smoothstep(0.55, 0.95, asph.colour.x));
  const edgeLine = line(abs(z.sub(L.ROAD.z0 + EDGE_IN)), LINE_W).add(line(abs(z.sub(L.ROAD.z1 - EDGE_IN)), LINE_W));
  const dash = smoothstep(0.0, 0.02, fract(x.div(DASH.period))).mul(smoothstep(DASH.on / DASH.period + 0.02, DASH.on / DASH.period, fract(x.div(DASH.period))));
  const centreLine = line(abs(z.sub(L.ROAD.centre)), LINE_W).mul(dash);
  const paint = clamp(edgeLine.add(centreLine), 0, 1).mul(wear).mul(road).toVar();
  // A wider band of tyre wear down each lane, a little darker.
  const lanes = smoothstep(1.4, 0.2, abs(abs(z.sub(L.ROAD.centre)).sub(1.75))).mul(0.12);
  const asphaltC = vec3(...ALBEDO.asphalt).mul(contrast(asph.colour, 1.1)).mul(lanes.negate().add(1));
  const roadC = mix(mix(asphaltC, vec3(...ALBEDO.paintWhite), edgeLine.mul(wear).clamp(0, 1)), vec3(...ALBEDO.paintYellow), centreLine.mul(wear));
  const dirtC = vec3(...ALBEDO.dirt).mul(drt.colour);
  const fieldC = vec3(...ALBEDO.field).mul(mix(grs.colour, drt.colour, 0.3));
  const albedo = concreteC.mul(forecourt).add(roadC.mul(road)).add(fieldC.mul(field)).add(dirtC.mul(dirt));

  // 0 (damp) .. 1 (standing water).
  const wetness = Fn(() => {
    const blob = float(0).toVar();
    const blobEdge = fbm2(p, 1.2, 3).mul(0.35).toVar();
    for (const [px, pz, rx, rz] of PUDDLES) {
      const d = length(p.sub(vec2(px, pz)).div(vec2(rx, rz)));
      blob.assign(max(blob, smoothstep(1.0, 0.35, d.add(blobEdge))));
    }
    const n = fbm2(p.add(vec2(17, -3)), 4.0, 4);
    const puddles = smoothstep(0.02, 0.3, n);
    const forecourtW = max(blob, puddles).mul(0.95).add(0.32).mul(forecourt);
    // Water along the road's edges and in its ruts.
    const rut = smoothstep(0.9, 0.0, abs(z.sub(L.ROAD.z0 + 0.6))).add(smoothstep(0.9, 0.0, abs(z.sub(L.ROAD.z1 - 0.6))));
    const roadW = clamp(rut.mul(smoothstep(0.0, 0.3, n)).mul(0.8).add(smoothstep(0.2, 0.35, n)).add(0.3), 0, 1).mul(road);
    const fieldW = smoothstep(-0.25, 0.1, fbm2(p, 7.0, 3)).mul(0.9).mul(field);
    const restW = max(blob, smoothstep(0.15, 0.35, n)).add(0.15).mul(dirt);
    return clamp(forecourtW.add(roadW).add(fieldW).add(restW), 0, 1);
  });
  const w = wetness().toVar();
  // Water fills the low places first: the grooves, and the darker pits of
  // each photo, which also breaks a puddle's edge up.
  const lum = (c) => c.dot(vec3(0.2126, 0.7152, 0.0722));
  const pits = float(1).sub(lum(conc.colour).mul(forecourt).add(lum(asph.colour).mul(road)).add(lum(drt.colour).mul(dirt.add(field))));
  const ragged = noise2(p, 0.18).mul(0.12);
  const wet = clamp(w.add(groove.mul(0.5)).add(pits.mul(0.22)).add(ragged.mul(smoothstep(0.3, 0.6, w))), 0, 1).toVar();
  const pool = smoothstep(0.62, 0.8, wet).toVar();

  material.colorNode = albedo.mul(mix(DARKEN.damp, DARKEN.pool, pool));

  // Roughness: each surface's own where damp, in patches, rougher in its
  // pits; oil and paint smoother; standing water a mirror.
  const damp = float(DAMP_ROUGH.concrete).mul(forecourt).add(float(DAMP_ROUGH.asphalt).mul(road))
    .add(float(DAMP_ROUGH.dirt).mul(dirt)).add(float(DAMP_ROUGH.field).mul(field));
  const patchy = fbm2(p.add(vec2(5, 11)), 1.6, 3).mul(0.2).add(fbm2(p.add(vec2(2, 7)), 0.3, 2).mul(0.06));
  const dampR = damp.add(patchy).add(pits.mul(0.18)).sub(oil.mul(0.15)).sub(paint.mul(0.1)).clamp(0.12, 0.85);
  const roughness = mix(dampR, float(POOL_ROUGH), pool).toVar();
  material.roughnessNode = roughness;

  // Normal: each photo's own, flattening to a mirror where water stands,
  // plus faint rings where rain falls on it.
  const bump = conc.slope.mul(forecourt.mul(BUMP.concrete)).add(asph.slope.mul(road.mul(BUMP.asphalt)))
    .add(drt.slope.mul(dirt.mul(BUMP.dirt).add(field.mul(BUMP.field))));
  const flat = smoothstep(0.5, 0.8, wet);
  const cell = floor(p.mul(1.6));
  const local = fract(p.mul(1.6)).sub(0.5);
  const phase = fract(time.mul(0.9).add(hash(cell.x.add(cell.y.mul(113.0)))));
  const ring = sin(length(local).sub(phase.mul(0.5)).mul(60.0)).mul(smoothstep(0.5, 0.0, phase)).mul(smoothstep(0.45, 0.0, length(local)));
  const rip = ring.mul(0.0015).mul(flat);
  const slope = bump.mul(float(1).sub(flat.mul(0.95))).add(rip).toVar();
  const nWorld = normalize(vec3(slope.x.negate(), 1, slope.y.negate()));
  material.normalNode = cameraViewMatrix.mul(vec4(nWorld, 0)).xyz.normalize();

  // The mirror, and the street lamps that are not real lights.
  const V = normalize(cameraPosition.sub(positionWorld));
  const cosV = max(dot(nWorld, V), 0.0);
  const fresnel = float(0.02).add(float(0.98).mul(pow(float(1).sub(cosV), 5)));
  let emissive = vec3(0);
  if (mirror) {
    mirror.uvNode = mirror.uvNode.add(slope.mul(0.06));
    // Sharp in puddles, blurred by roughness elsewhere.
    mirror.levelNode = roughness.mul(14).min(5);
    emissive = mirror.rgb.mul(fresnel).mul(float(1).sub(roughness).pow(2));
  }
  const painted = Fn(() => {
    const sum = vec3(0).toVar();
    const rough = roughness.max(0.05);
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
