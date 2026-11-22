// A small walk-through entrance on dry ground near the player's start.
import * as THREE from 'three';
import { toWorld } from '../landmarks/sites.js';

export const ENTRY = 2; // m either side of the centre of the doorway
const DRY = 12;
const RINGS = [215, 265, 325, 390, 480, 570];

export function findGate(gen, start, keepOff) {
  const candidates = [];
  for (const r of RINGS) {
    const n = Math.ceil(2 * Math.PI * r / 24);
    for (let i = 0; i < n; i++) {
      const a = r * 0.382 + i * 2 * Math.PI / n;
      const x = start.x + r * Math.cos(a);
      const z = start.z + r * Math.sin(a);
      const y = gen.height(x, z);
      if (gen.water.edge < DRY) continue;
      const yaw = Math.atan2(start.x - x, start.z - z);
      const site = { x, y, z, yaw };
      let spread = 0;
      for (const [u, v] of [[-2.7, 0], [2.7, 0], [-2, 4], [2, 4], [-2, -2], [2, -2]]) {
        const p = toWorld(site, u, v);
        spread = Math.max(spread, Math.abs(y - gen.height(p.x, p.z)));
      }
      if (spread <= 1.1) candidates.push({ ...site, score: spread + r * 0.002 });
    }
  }
  const best = candidates.sort((a, b) => a.score - b.score).find((s) => !keepOff(s.x - 15, s.z - 15, s.x + 15, s.z + 15));
  if (!best) return null;
  return { ...best, id: 'arena:saltworks', approach: { ...toWorld(best, 0, 5), yaw: best.yaw + Math.PI } };
}

export function plaque(text, sub, tint = '#f9d298') {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#222a28';
  ctx.fillRect(0, 0, 512, 128);
  ctx.strokeStyle = tint;
  ctx.lineWidth = 3;
  ctx.strokeRect(8, 8, 496, 112);
  ctx.textAlign = 'center';
  ctx.fillStyle = tint;
  ctx.font = 'bold 47px sans-serif';
  ctx.fillText(text, 256, 59, 478);
  ctx.font = '19px monospace';
  ctx.fillText(sub, 256, 94, 460);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshBasicMaterial({ map: texture });
}

export function gateModel(site, ground) {
  const object = new THREE.Group();
  object.position.set(site.x, site.y, site.z);
  object.rotation.y = site.yaw;
  const stone = new THREE.MeshStandardMaterial({ color: 0xb38255, roughness: 1 });
  const trim = new THREE.MeshStandardMaterial({ color: 0xe1b477, roughness: 0.9 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x46625c, roughness: 0.65 });
  function block(x, y, z, w, h, d, material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = true;
    object.add(mesh);
  }
  const solids = [];
  for (const x of [-2.65, 2.65]) {
    const p = toWorld(site, x, 0);
    block(x, 1.1, 0, 1.2, 4.5, 1.35, stone);
    block(x, 2.6, 0, 1.35, 0.2, 1.49, trim);
    block(x, 0.28, 0, 1.43, 0.27, 1.5, trim);
    block(x, 3.75, 0, 0.28, 0.86, 0.28, metal);
    solids.push({ ax: p.x, az: p.z, bx: p.x, bz: p.z, r: 0.67, bottom: site.y - 1.2, topA: site.y + 3.35, topB: site.y + 3.35 });
  }
  block(0, 3.02, 0, 6.72, 0.16, 1.54, trim);
  block(0, 3.6, 0, 6.5, 1.12, 1.25, stone);
  block(0, 4.18, 0, 6.8, 0.2, 1.55, trim);

  const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.92, 0.98), plaque('SALTWORKS', 'WALK THROUGH TO JOIN'));
  sign.position.set(0, 3.6, 0.64);
  object.add(sign);
  for (let i = 0; i < 5; i++) {
    for (const x of [-1.6, 1.6]) {
      const z = i * 0.78;
      const p = toWorld(site, x, z);
      block(x, ground(p.x, p.z) - site.y + 0.055, z, 0.42, 0.17, 0.58, i % 2 ? stone : trim);
    }
  }
  return { object, solids };
}
