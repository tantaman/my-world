// Lightning (PLAN.md 5.6). A strike is five things switched by one envelope
// flash(t): the bolt itself, the clouds lit round it (weather/sky.js), a
// directional light from its side (which turns the trees green in 11), the
// fog and environment brightened, and the bolt's streak in the wet road,
// which the ground's mirror gives for nothing because the bolt is in the scene.
import { Group, Mesh, BufferGeometry, Float32BufferAttribute, MeshBasicNodeMaterial, AdditiveBlending, DoubleSide, Vector3, Color } from 'three/webgpu';
import { uniform, vec3, uv, smoothstep, abs, float, positionWorld } from 'three/tsl';
import { flash, T } from '../timeline.js';
import { cameraAt } from '../camera/path.js';
import { rayThroughLens, drawnFov } from '../post/pipeline.js';
import { rand } from '../noise1.js';

// Each bolt as the original shows it: the strike's time, where its top and
// its foot are in the finished picture (u, v from the top left, 0..1, read
// off stills 02 and 11), and how far off it is (metres). Its place in the
// world is worked out from our camera at that moment, through our lens, so
// it stays where the original has it however the camera is keyed.
export const BOLTS = [
  // field: lux at the peak on what faces the camera (the second strike turns the trees green; the first lights little).
  { strike: T.strike1, top: [0.493, 0.07], foot: [0.43, 0.44], distance: 230, seed: 3, field: 1.2 },   // beyond the road, over the sign
  { strike: T.strike2, top: [0.41, 0.19], foot: [0.38, 0.42], distance: 210, seed: 11, field: 4 },     // over the trees
];
const HALVINGS = 7;
const WIDTH = 0.7;           // metres, the ribbon's width at the cloud: the original's bolts are thin
const BRIGHT = 45;           // emissive strength, so bloom makes the glow
// The light a strike throws on the field, from the camera's side and above
// (the original's trees turn green in the flash, lit on the faces we see).
const FROM = [-60, 18];      // metres behind the camera, and up: low, so it skims the ground and lights the trees' faces

// A jagged line from the cloud (top) down to its foot by midpoint
// displacement, with forks; both ends are points in the world.
function boltPoints(top, foot, seed) {
  let pts = [top.clone(), foot.clone()];
  const height = top.distanceTo(foot);
  let spread = height * 0.18;
  let r = seed * 100;
  for (let h = 0; h < HALVINGS; h++) {
    const next = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      const m = a.clone().lerp(b, 0.5);
      m.x += (rand(r++, seed) - 0.5) * spread;
      m.z += (rand(r++, seed) - 0.5) * spread * 0.5;
      m.y += (rand(r++, seed) - 0.5) * spread * 0.15;
      next.push(m, b);
    }
    pts = next;
    spread *= 0.55;
  }
  const lines = [pts];
  // One to three short forks off the upper part.
  const forks = 3 + Math.floor(rand(seed, 9) * 3);
  for (let f = 0; f < forks; f++) {
    const start = Math.floor(pts.length * (0.15 + 0.4 * rand(seed, 20 + f)));
    const fork = [pts[start].clone()];
    const dir = new Vector3((rand(seed, 30 + f) - 0.5) * 2, -1, (rand(seed, 40 + f) - 0.5)).normalize();
    for (let i = 1; i < 18; i++) {
      const p = fork[i - 1].clone().addScaledVector(dir, height * 0.02);
      p.x += (rand(r++, seed) - 0.5) * 6;
      p.z += (rand(r++, seed) - 0.5) * 3;
      fork.push(p);
    }
    lines.push(fork);
  }
  return lines;
}

// A ribbon through the points, turned to face `toward` (where the camera
// is when the bolt strikes), narrowing toward the ground.
function ribbon(lines, toward) {
  const seg = new Vector3();
  const side = new Vector3();
  const pos = [];
  const uvs = [];
  for (const [li, pts] of lines.entries()) {
    const w0 = li === 0 ? WIDTH : WIDTH * 0.5;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const wa = w0 * (1 - (i / pts.length) * 0.6);
      const wb = w0 * (1 - ((i + 1) / pts.length) * 0.6);
      seg.subVectors(b, a);
      side.subVectors(toward, a).cross(seg).normalize();
      const quad = [
        [a.x - side.x * wa, a.y - side.y * wa, a.z - side.z * wa, 0], [a.x + side.x * wa, a.y + side.y * wa, a.z + side.z * wa, 1],
        [b.x + side.x * wb, b.y + side.y * wb, b.z + side.z * wb, 1],
        [a.x - side.x * wa, a.y - side.y * wa, a.z - side.z * wa, 0], [b.x + side.x * wb, b.y + side.y * wb, b.z + side.z * wb, 1],
        [b.x - side.x * wb, b.y - side.y * wb, b.z - side.z * wb, 0],
      ];
      for (const [x, y, z, u] of quad) { pos.push(x, y, z); uvs.push(u, 0); }
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  return g;
}

// Where a point of the original's picture at time t is, `distance` metres
// out from our camera then (the hand's sway left out).
const _view = {};
const _ray = new Vector3();
const _f = new Vector3();
const _r = new Vector3();
const _u = new Vector3();
function seenAt(t, [u, v], distance) {
  cameraAt(t, _view);
  const yaw = (_view.yaw * Math.PI) / 180;
  const pitch = (_view.pitch * Math.PI) / 180;
  _f.set(Math.cos(pitch) * Math.cos(yaw), Math.sin(pitch), Math.cos(pitch) * Math.sin(yaw));
  _r.set(-Math.sin(yaw), 0, Math.cos(yaw));
  _u.crossVectors(_r, _f);
  rayThroughLens(u, v, drawnFov(_view.fov), _ray);
  const d = new Vector3().addScaledVector(_r, _ray.x).addScaledVector(_u, _ray.y).addScaledVector(_f, _ray.z);
  return new Vector3(_view.x, _view.y, _view.z).addScaledVector(d, distance);
}

export function createLightning({ rig }) {
  const group = new Group();
  const level = uniform(0);
  // Both sides: which way a ribbon's triangles wind depends on the bolt's shape.
  const material = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending, fog: false, side: DoubleSide });
  const core = float(1).sub(smoothstep(0.0, 0.5, abs(uv().x.sub(0.5))));
  material.colorNode = vec3(0.85, 0.9, 1.0).mul(core.mul(core).mul(BRIGHT)).mul(level);
  const placed = BOLTS.map((b) => {
    const top = seenAt(b.strike, b.top, b.distance);
    const foot = seenAt(b.strike, b.foot, b.distance);
    cameraAt(b.strike, _view);
    return { top, foot, mid: top.clone().lerp(foot, 0.4), seen: new Vector3(_view.x, _view.y, _view.z), seed: b.seed, field: b.field };
  });
  const meshes = placed.map((b) => {
    const m = new Mesh(ribbon(boltPoints(b.top, b.foot, b.seed), b.seen), material);
    m.frustumCulled = false;
    m.visible = false;
    group.add(m);
    return m;
  });
  const dir = new Vector3();
  const light = rig.lights.lightning;
  const state = { flash: 0, which: 0, boltDir: new Vector3(0, 0.4, 1).normalize() };

  return {
    object: group,
    state,
    update(t, camera) {
      const f = flash(t);
      state.flash = f.flash;
      state.which = f.which;
      level.value = f.flash;
      meshes.forEach((m, i) => { m.visible = f.flash > 0.01 && i === f.which; });
      const b = placed[f.which];
      // The direction to the middle of the bolt, for the sky's glow.
      dir.copy(b.mid).sub(camera.position).normalize();
      state.boltDir.copy(dir);
      camera.getWorldDirection(_f);
      _f.y = 0;
      _f.normalize();
      light.position.copy(camera.position).addScaledVector(_f, FROM[0]).setY(FROM[1]);
      light.target.position.copy(camera.position).addScaledVector(_f, 40);
      light.intensity = f.flash * b.field;
    },
  };
}
