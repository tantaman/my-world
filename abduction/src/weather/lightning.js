// Lightning (PLAN.md 5.6). A strike is five things switched by one envelope
// flash(t): the bolt itself, the clouds lit round it (weather/sky.js), a
// directional light from its side (which turns the trees green in 11), the
// fog and environment brightened, and the bolt's streak in the wet road,
// which the ground's mirror gives for nothing because the bolt is in the scene.
import { Group, Mesh, BufferGeometry, Float32BufferAttribute, MeshBasicNodeMaterial, AdditiveBlending, Vector3, Color } from 'three/webgpu';
import { uniform, vec3, uv, smoothstep, abs, float, positionWorld } from 'three/tsl';
import { flash, T } from '../timeline.js';
import { rand } from '../noise1.js';

// Where each bolt comes down, and how tall it is (metres).
export const BOLTS = [
  { at: [215, 0, 92], top: 260, seed: 3 },    // strike 1, beyond the road, left of the sign
  { at: [-25, 0, 230], top: 260, seed: 11 },  // strike 2, over the trees, a little right of north
];
const HALVINGS = 7;
const WIDTH = 0.9;           // metres, the ribbon's width at the cloud
const BRIGHT = 60;           // emissive strength, so bloom makes the glow

// A jagged line from cloud to ground by midpoint displacement, with forks.
function boltPoints(base, top, seed) {
  let pts = [new Vector3(base[0] + (rand(seed, 1) - 0.5) * 40, top, base[2] + (rand(seed, 2) - 0.5) * 20), new Vector3(...base)];
  let spread = top * 0.18;
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
  const forks = 1 + Math.floor(rand(seed, 9) * 3);
  for (let f = 0; f < forks; f++) {
    const start = Math.floor(pts.length * (0.15 + 0.4 * rand(seed, 20 + f)));
    const fork = [pts[start].clone()];
    const dir = new Vector3((rand(seed, 30 + f) - 0.5) * 2, -1, (rand(seed, 40 + f) - 0.5)).normalize();
    for (let i = 1; i < 18; i++) {
      const p = fork[i - 1].clone().addScaledVector(dir, top * 0.02);
      p.x += (rand(r++, seed) - 0.5) * 6;
      p.z += (rand(r++, seed) - 0.5) * 3;
      fork.push(p);
    }
    lines.push(fork);
  }
  return lines;
}

// A ribbon through the points, flat in the plane facing roughly south (the
// camera is always south of the bolts), narrowing toward the ground.
function ribbon(lines) {
  const pos = [];
  const uvs = [];
  for (const [li, pts] of lines.entries()) {
    const w0 = li === 0 ? WIDTH : WIDTH * 0.5;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const wa = w0 * (1 - (i / pts.length) * 0.6);
      const wb = w0 * (1 - ((i + 1) / pts.length) * 0.6);
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;
      const quad = [
        [a.x - nx * wa, a.y - ny * wa, a.z, 0], [a.x + nx * wa, a.y + ny * wa, a.z, 1], [b.x + nx * wb, b.y + ny * wb, b.z, 1],
        [a.x - nx * wa, a.y - ny * wa, a.z, 0], [b.x + nx * wb, b.y + ny * wb, b.z, 1], [b.x - nx * wb, b.y - ny * wb, b.z, 0],
      ];
      for (const [x, y, z, u] of quad) { pos.push(x, y, z); uvs.push(u, 0); }
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  return g;
}

export function createLightning({ rig }) {
  const group = new Group();
  const level = uniform(0);
  const material = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending, fog: false });
  const core = smoothstep(0.5, 0.0, abs(uv().x.sub(0.5)));
  material.colorNode = vec3(0.85, 0.9, 1.0).mul(core.mul(core).mul(BRIGHT)).mul(level);
  const meshes = BOLTS.map((b) => {
    const m = new Mesh(ribbon(boltPoints(b.at, b.top, b.seed)), material);
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
      const b = BOLTS[f.which];
      // The direction to the middle of the bolt, for the sky's glow.
      dir.set(b.at[0], b.top * 0.6, b.at[2]).sub(camera.position).normalize();
      state.boltDir.copy(dir);
      light.position.set(b.at[0], b.top * 0.7, b.at[2]);
      light.target.position.set(0, 0, 10);
      light.intensity = f.flash * 2.2;
    },
  };
}
