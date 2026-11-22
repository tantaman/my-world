// Sun-baked plaster, painted steel and shallow salt beds. The plan's boxes
// are also the visible cover, so every solid sightline agrees with the match.
import * as THREE from 'three';
import { mulberry32 } from '../noise.js';
import { BARRIERS, COLORS, OVERLOOK, RELAYS } from './layout.js';
import { EYE } from './motion.js';
import { plaque } from './gate.js';

const TRACES = 96;
const VIEW_FAR = 235;
const radians = THREE.MathUtils.lerp;

function surface(base, salt) {
  const random = mulberry32(salt);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 1300; i++) {
    ctx.fillStyle = random() > 0.5 ? 'rgba(70,37,20,.12)' : 'rgba(255,245,213,.18)';
    ctx.fillRect(random() * 128, random() * 128, 0.6 + random() * 9, 0.7 + random() * 3);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

const material = (color, opts = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, ...opts });
const basic = (color) => new THREE.MeshBasicMaterial({ color });

function mesh(parent, geometry, mat, x, y, z) {
  const item = new THREE.Mesh(geometry, mat);
  item.position.set(x, y, z);
  parent.add(item);
  item.receiveShadow = true;
  return item;
}

const block = (p, m, x, y, z, w, h, d) => mesh(p, new THREE.BoxGeometry(w, h, d), m, x, y, z);
const drum = (p, m, x, y, z, r, h, n = 24) => mesh(p, new THREE.CylinderGeometry(r, r, h, n), m, x, y, z);
const sign = (p, mat, x, y, z, width, turn = 0) => {
  const item = mesh(p, new THREE.PlaneGeometry(width, width / 4), mat, x, y, z);
  item.rotation.y = turn;
  return item;
};

function stage(scene) {
  const sand = surface('#ddba86', 75);
  sand.repeat.set(20, 16);
  block(scene, material(0xffffff, { map: sand }), 0, -0.42, 0, 72, 0.82, 61);
  const dust = material(0xc38e61);
  const top = material(0xe4c28e);
  const plaster = material(0xf9d8ae, { map: surface('#ead4ad', 26) });
  const oxide = material(0x46716c);
  const dark = material(0x4c4035);
  const timber = material(0x9b724c);
  const runner = material(0xa56144);
  const warden = material(0x427772);
  const pool = material(0x4c9791, { roughness: 0.34 });

  for (const b of BARRIERS) {
    const w = b.x1 - b.x0;
    const d = b.z1 - b.z0;
    const x = (b.x0 + b.x1) / 2;
    const z = (b.z0 + b.z1) / 2;
    const h = b.y1;
    const cover = block(scene, b.kind === 'crate' ? timber : plaster, x, h / 2, z, w, h, d);
    cover.castShadow = true;
    if (b.kind === 'basin') {
      block(scene, pool, x, h + 0.014, z, w - 0.5, 0.02, d - 0.5);
      for (let i = -1; i <= 1; i++) block(scene, top, x + i * 4.2, h + 0.025, z, 0.08, 0.04, d - 0.22);
      continue;
    }
    if (b.kind === 'crate') {
      for (const u of [-0.36, 0.36]) block(scene, dark, x + w * u, h / 2, z, 0.11, h + 0.05, d + 0.045);
      block(scene, top, x, h * 0.8, z, w + 0.04, 0.07, d + 0.06);
      continue;
    }
    block(scene, top, x, h, z, w + 0.15, 0.16, d + 0.15);
    block(scene, dust, x, 0.2, z, w + 0.035, 0.4, d + 0.035);
    if (b.kind === 'wall') {
      for (let u = 2; u < Math.max(w, d) - 1; u += 5) {
        const alongX = w > d;
        block(scene, top, alongX ? b.x0 + u : x, h * 0.48, alongX ? z : b.z0 + u, alongX ? 0.34 : w + 0.11, h * 0.96, alongX ? d + 0.11 : 0.34);
      }
      continue;
    }
    block(scene, x < 0 ? runner : warden, x, h - 0.55, z, w + 0.045, 0.34, d + 0.045);
    const n = Math.max(1, Math.floor(w / 2.4));
    for (let i = 0; i < n; i++) {
      const u = b.x0 + (i + 0.5) * w / n;
      block(scene, dark, u, h * 0.62, z, 0.68, 0.75, d + 0.045);
      block(scene, oxide, u, h * 0.62 - 0.23, z, 0.75, 0.12, d + 0.12);
    }
    block(scene, oxide, x, 0.96, z, Math.min(1.5, w - 0.4), 1.92, d + 0.035);
    block(scene, top, x, 2, z, Math.min(1.8, w - 0.28), 0.13, d + 0.22);
  }

  // Distant terraced mesas frame the yard above the walls.
  const random = mulberry32(842);
  const far = [material(0xa37464), material(0xc09378), material(0xb8846b)];
  for (let i = 0; i < 19; i++) {
    const a = i / 19 * Math.PI * 2;
    const d = 92 + random() * 61;
    const h = 12 + random() * 26;
    const r = 11 + random() * 20;
    const butte = mesh(scene, new THREE.CylinderGeometry(r * 0.63, r, h, 8), far[i % far.length], Math.cos(a) * d, h / 2 - 3, Math.sin(a) * d);
    butte.rotation.y = a;
  }

  for (let team = 0; team < 2; team++) {
    const z = team === 0 ? 27.42 : -27.42;
    const yaw = team === 0 ? Math.PI : 0;
    sign(scene, plaque(team === 0 ? 'RUNNER BAY' : 'WARDEN BAY', 'SALTWORKS'), team === 0 ? 12 : -7, 3.2, z, 5, yaw);
    block(scene, team === 0 ? runner : warden, team === 0 ? 12 : -7, 0.011, team === 0 ? 25 : -25, 17, 0.02, 4.6);
  }

  return RELAYS.map((site, i) => {
    const { x, z, r } = site;
    const tint = i === 0 ? '#ffbd72' : '#a3e6e8';
    const off = i === 0 ? 0xf2ae66 : 0x70cace;
    const glow = basic(off);
    drum(scene, dark, x, 0.015, z, r, 0.028, 48);
    drum(scene, oxide, x, 0.033, z, r - 0.12, 0.021, 48);
    const ring = mesh(scene, new THREE.RingGeometry(r - 0.26, r - 0.16, 64), glow, x, 0.054, z);
    ring.rotation.x = -Math.PI / 2;
    // The indicators sit just above the deck so the entire circle stays walkable.
    for (const s of [-1, 1]) block(scene, glow, x + s * 2.28, 0.054, z, 0.1, 0.019, 2.8);
    const signs = [sign(scene, plaque(site.label, site.name.toUpperCase(), tint), x, 3.2, z + 0.02, 3.4),
      sign(scene, plaque(site.label, site.name.toUpperCase(), tint), x, 3.2, z - 0.02, 3.4, Math.PI)];
    for (const board of signs) board.material.transparent = true;
    return { glow, off, signs };
  });
}

function athlete(team) {
  const root = new THREE.Group();
  const uniform = material(COLORS[team]);
  const cloth = material(team === 0 ? 0x614d41 : 0x34545c);
  const visor = material(0x182c37, { roughness: 0.3 });
  mesh(root, new THREE.CapsuleGeometry(0.26, 0.43, 5, 10), uniform, 0, 1.14, 0);
  const helmet = mesh(root, new THREE.SphereGeometry(0.23, 12, 8), cloth, 0, 1.6, 0);
  helmet.scale.y = 1.06;
  block(root, visor, 0, 1.61, -0.174, 0.34, 0.12, 0.13);
  block(root, cloth, 0, 1.21, 0.22, 0.32, 0.42, 0.16);
  const legs = [];
  for (const s of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(s * 0.137, 0.82, 0);
    mesh(leg, new THREE.CapsuleGeometry(0.102, 0.46, 3, 8), cloth, 0, -0.36, 0);
    block(leg, visor, 0, -0.75, -0.06, 0.2, 0.11, 0.32);
    root.add(leg);
    legs.push(leg);
    const arm = mesh(root, new THREE.CapsuleGeometry(0.093, 0.22, 3, 8), uniform, s * 0.28, 1.2, -0.17);
    arm.rotation.x = -Math.PI / 3;
  }
  block(root, visor, 0.23, 1.26, -0.41, 0.15, 0.14, 0.52);
  return { root, legs };
}

function marker(camera) {
  const group = new THREE.Group();
  const frame = material(0x243334, { metalness: 0.45, roughness: 0.56 });
  const trim = material(0xc5ad83);
  const light = basic(0xaaf9ed);
  group.rotation.set(-0.045, 0.15, -0.05);
  block(group, frame, 0, 0, 0, 0.15, 0.175, 0.59);
  block(group, trim, 0, 0.08, -0.06, 0.16, 0.044, 0.39);
  block(group, frame, 0, -0.073, -0.035, 0.118, 0.19, 0.19);
  block(group, light, -0.078, 0.02, -0.07, 0.011, 0.023, 0.36);
  block(group, light, 0, 0.113, -0.203, 0.018, 0.025, 0.027);
  const muzzle = block(group, light, 0, 0.025, -0.306, 0.084, 0.069, 0.03);
  camera.add(group);
  return { group, muzzle };
}

function beams(color) {
  const positions = new Float32Array(TRACES * 6);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
  const line = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.8, depthWrite: false }));
  line.frustumCulled = false;
  return line;
}

export class ArenaView {
  constructor(aspect) {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xc1dce0);
    this.scene.fog = new THREE.FogExp2(0xd6d7c1, 0.0085);
    this.camera = new THREE.PerspectiveCamera(75, aspect, 0.05, VIEW_FAR);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);
    this.marker = marker(this.camera);
    this.scene.add(new THREE.HemisphereLight(0xfff2d5, 0xb99a86, 1.65));
    const sun = new THREE.DirectionalLight(0xffead5, 2.2);
    sun.position.set(-33, 55, 44);
    sun.castShadow = true;
    Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 46, bottom: -46, far: 150 });
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.bias = -0.00025;
    sun.shadow.normalBias = 0.07;
    this.sun = sun;
    this.scene.add(sun);
    this.relays = stage(this.scene);
    this.actors = Array.from({ length: 10 }, (_, i) => athlete(i < 5 ? 0 : 1));
    this.scene.add(...this.actors.map((a) => a.root));
    this.beams = COLORS.map(beams);
    this.scene.add(...this.beams);
    this.state = null;
  }

  update(dt, now, client, aspect) {
    const { state, pose, look } = client;
    const me = client.me;
    const spectator = state?.fighters.find((f) => f.hp > 0 && (!me || f.team === me.team));
    const own = me?.hp > 0;
    const watch = own ? me : spectator;
    const camera = this.camera;
    const reset = !this.state || !state || this.state.round !== state.round || this.epoch !== client.epoch;
    if (camera.aspect !== aspect) {
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
    }
    const k = 1 - Math.exp(-dt * 17);
    for (const [i, { root, legs }] of this.actors.entries()) {
      const f = state?.fighters[i];
      root.visible = !!f && f.hp > 0 && f !== watch;
      if (!f) continue;
      const a = root.position;
      if (reset) a.set(f.pos.x, f.pos.y, f.pos.z);
      else a.set(radians(a.x, f.pos.x, k), radians(a.y, f.pos.y, k), radians(a.z, f.pos.z, k));
      root.rotation.y = f.yaw;
      const stride = f.grounded ? Math.min(0.61, Math.hypot(f.vel.x, f.vel.z) * 0.095) : 0.16;
      legs[0].rotation.x = Math.sin(now * 0.012 + i) * stride;
      legs[1].rotation.x = -legs[0].rotation.x;
    }
    const at = own ? pose.pos : watch ? this.actors[watch.id].root.position : OVERLOOK;
    camera.position.set(at.x, at.y + (watch ? EYE : 0), at.z);
    camera.rotation.set(own ? look.pitch : watch?.pitch ?? OVERLOOK.pitch, own ? look.yaw : watch?.yaw ?? OVERLOOK.yaw, 0, 'YXZ');
    this.marker.group.visible = own;
    const shots = state?.traces || [];
    const shot = shots.findLast((s) => s.from === me?.id);
    const kick = shot ? Math.max(0, 1 - (state.age - shot.at) / 0.12) : 0;
    const sway = own ? Math.min(1, Math.hypot(pose.vel.x, pose.vel.z) * 0.16) : 0;
    this.marker.group.position.set(0.35 + Math.sin(now * 0.008) * sway * 0.009, -0.34 + Math.cos(now * 0.016) * sway * 0.012, -0.62 + kick * 0.052);
    this.marker.muzzle.visible = kick > 0.45;
    for (const [team, line] of this.beams.entries()) {
      const position = line.geometry.getAttribute('position');
      let n = 0;
      for (const { from, team: side, at: fired, start, end } of shots) {
        if (side !== team || state.age - fired > 0.11 || n + 2 > position.count) continue;
        const t = from === watch?.id ? 0.025 : 0;
        position.setXYZ(n++, radians(start.x, end.x, t), radians(start.y, end.y, t), radians(start.z, end.z, t));
        position.setXYZ(n++, end.x, end.y, end.z);
      }
      position.needsUpdate = true;
      line.geometry.setDrawRange(0, n);
    }
    for (const [i, relay] of this.relays.entries()) {
      const active = state?.relay === i;
      relay.glow.color.setHex(active ? 0xfec260 : relay.off);
      relay.signs[0].position.y = relay.signs[1].position.y = 3.12 + Math.sin(now / (active ? 210 : 650)) * 0.075;
    }
    this.state = state;
    this.epoch = client.epoch;
  }

  dispose() {
    disposeModel(this.scene);
    this.sun.shadow.dispose();
  }
}

export function disposeModel(model) {
  const geometries = new Set();
  const materials = new Set();
  model.traverse((m) => {
    if (m.geometry) geometries.add(m.geometry);
    if (m.material) materials.add(m.material);
  });
  for (const geometry of geometries) geometry.dispose();
  for (const mat of materials) {
    mat.map?.dispose();
    mat.dispose();
  }
}
