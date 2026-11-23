// The public gallery circles the central core. Walk past the shop counters
// on the inner wall or look out through the observation windows on the right.
import * as THREE from 'three';
import { Metalwork } from './stationHull.js';
import { Body } from '../people/body.js';
import { wrapAngle } from '../core/geom.js';

const TAU = Math.PI * 2;
const BAYS = 18;
export const WALK = { inner: 14.8, outer: 20.15 }; // m, including clearance from the counter and windows
const BRONZE = 0x986642, TRIM = 0xcd9c69, IRON = 0x51474a, TEAL = 0x326568;
const AMBER = 0xffd7a2, PANEL = 0x48424a, DARK = 0x2f2930;
const SHOPS = new Map([
  [1, ['Quark’s', 0xf9a95e]], [3, ['Replimat', 0x9bd6b5]], [6, ['Infirmary', 0x9fd8e4]],
  [9, ['Bajoran shrine', 0xf0a76e]], [12, ['Security', 0xf0b670]], [15, ['Docking ports', 0xb4d9e0]],
]);

// A sign is painted once at build time. Its size in the room stays the same
// whatever the pixel resolution of the rest of the picture.
function sign(text, color, angle) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 112;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = text === 'Quark’s' ? '#183b38' : '#221d22';
  ctx.fillRect(0, 0, 512, 112);
  ctx.fillStyle = '#' + color.toString(16);
  ctx.fillRect(12, 9, 488, 3);
  ctx.fillRect(12, 100, 488, 2);
  ctx.font = text === 'Quark’s' ? 'italic bold 76px Georgia, serif' : 'bold 52px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 61, 465);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(4.35, 0.95), new THREE.MeshBasicMaterial({ map }));
  mesh.position.set(14.04 * Math.sin(angle), 2.94, 14.04 * Math.cos(angle));
  mesh.rotation.y = angle;
  return mesh;
}

function storefront(m, i, shop) {
  // The recessed counter can be approached from anywhere on the gallery.
  const width = 4.45;
  m.box(0, 1.9, 10.5, width, 3.8, 0.5, shop ? TEAL : PANEL);
  for (const side of [-1, 1]) {
    m.box(side * 2.28, 1.68, 12.1, 0.4, 3.4, 3.7, IRON);
    m.box(side * 2.23, 1.59, 13.68, 0.22, 3.1, 0.23, BRONZE);
  }
  // Tapered jambs and a projecting lintel frame each shop window.
  for (const side of [-1, 1]) {
    m.box(side * 2.16, 1.68, 13.78, 0.16, 2.87, 0.36, TRIM, -0.12);
    for (let j = 0; j < 5; j++) m.box(side * 2.15, 2.17 + j * 0.13, 13.91, 0.43, 0.045, 0.31, IRON);
  }
  m.box(0, 3.44, 13.65, 4.6, 0.17, 0.66, BRONZE);
  m.box(0, 3.32, 13.79, 3.96, 0.06, 0.43, AMBER, 0, true);
  if (!shop) {
    // Split Cardassian doors behind a brass coaming.
    for (const side of [-1, 1]) {
      m.box(side * 0.94, 1.42, 13.15, 1.84, 2.84, 0.2, i % 2 ? IRON : TEAL);
      m.box(side * 0.19, 1.42, 13.27, 0.08, 2.5, 0.06, TRIM);
    }
    m.box(1.5, 1.67, 13.29, 0.23, 0.33, 0.06, AMBER, 0, true);
    return;
  }
  const [name, tint] = shop;
  m.box(0, 0.51, 13.65, 4.16, 1.02, 1.05, name === 'Quark’s' ? 0x82482d : IRON);
  m.box(0, 1.05, 13.68, 4.3, 0.14, 1.2, TRIM);
  m.box(0, 0.72, 14.2, 3.88, 0.065, 0.06, tint, 0, true);
  if (name === 'Quark’s') {
    for (let j = -3; j <= 3; j++) {
      m.box(j * 0.52, 0.41, 14.19, 0.35, 0.37, 0.04, 0x533a31);
      m.add(new THREE.CylinderGeometry(0.084, 0.052, 0.2, 10), 0xcabe9d, j * 0.51, 1.23, 13.65);
    }
  }
  if (name === 'Quark’s' || name === 'Replimat') {
    // Bottles on backlit shelves at the bar, serving bowls at the Replimat.
    for (const y of [1.5, 2.3]) {
      m.box(0, y, 11.16, 4, 0.1, 0.85, BRONZE);
      m.box(0, y - 0.06, 11.49, 3.9, 0.04, 0.04, tint, 0, true);
      for (let j = -3; j <= 3; j++) {
        const bar = name === 'Quark’s';
        m.add(new THREE.CylinderGeometry(bar ? 0.09 : 0.22, bar ? 0.13 : 0.11, bar ? 0.38 : 0.17, 8), [0x71a3a1, 0xc47555, 0xc2ac81][(j + 3) % 3], j * 0.51, y + (bar ? 0.24 : 0.14), 11.18);
        if (bar) m.box(j * 0.51, y + 0.49, 11.18, 0.09, 0.15, 0.09, TRIM);
      }
    }
  } else {
    m.box(0, 1.85, 10.82, 2.6, 1.4, 0.12, DARK);
    for (let j = 0; j < 6; j++) m.box(-0.36 + (j % 2) * 0.3, 1.42 + j * 0.16, 10.9, 1.55 - (j % 3) * 0.3, 0.045, 0.04, tint, 0, true);
  }
}

// Station staff use the same articulated bodies as the townspeople. Behind
// the bar, the lobes and the bald ridged forehead read in silhouette.
function attendant(bay, barkeep) {
  const skin = new THREE.Color(barkeep ? 0xc88a57 : 0x995e45);
  const person = new Body({
    height: barkeep ? 0.98 : 1.04, build: barkeep ? 1.1 : 0.95,
    skin, hair: barkeep ? skin : new THREE.Color(0x392b30),
    shirt: new THREE.Color(barkeep ? 0xb3823f : 0x318b8b), legs: new THREE.Color(0x302d36),
    vest: new THREE.Color(barkeep ? 0x915467 : 0x36373d),
  }, bay);
  if (barkeep) {
    const form = new THREE.SphereGeometry(1, 16, 12);
    const skinMat = new THREE.MeshStandardMaterial({ color: skin });
    const hollow = new THREE.MeshStandardMaterial({ color: 0xa36746 });
    for (const side of [-1, 1]) {
      for (const [x, z, w, h, d, mat] of [[0.126, 0, 0.075, 0.112, 0.05, skinMat], [0.145, 0.03, 0.043, 0.075, 0.025, hollow], [0.056, 0.091, 0.058, 0.025, 0.021, skinMat]]) {
        const lobe = new THREE.Mesh(form, mat);
        lobe.scale.set(w, h, d);
        lobe.position.set(side * x, x < 0.1 ? 0.10 : 0.054, z);
        lobe.rotation.z = -side * 0.18;
        person.head.add(lobe);
      }
    }
  }
  const a = bay * TAU / BAYS;
  person.mesh.position.set(Math.sin(a) * 12.65, 0.06, Math.cos(a) * 12.65);
  person.mesh.rotation.y = a;
  return person;
}

export function buildPromenade() {
  const m = new Metalwork();
  const fittings = new THREE.Group();
  const staff = [attendant(1, true), attendant(3, false)];
  fittings.add(...staff.map(p => p.mesh));
  // Alternating stone and metal annuli underfoot, upper balcony over the shops.
  const band = (a, b, y, h, color) => m.shell([[a, y - h], [b, y - h], [b, y], [a, y]], color);
  band(10, 21.2, -0.02, 0.35, 0x766762);
  band(15.15, 19.74, 0, 0.025, 0x998880);
  band(15.54, 15.6, 0.012, 0.02, BRONZE);
  band(19.29, 19.35, 0.012, 0.02, BRONZE);
  band(10, 15, 4.45, 0.34, IRON);
  band(14.92, 15.09, 4.42, 0.12, TRIM);
  band(14.9, 15, 5.34, 0.09, BRONZE);
  band(10, 21.3, 7.4, 0.3, PANEL);
  for (let i = 0; i < BAYS; i++) {
    const a = i * TAU / BAYS;
    m.face(a);
    const shop = SHOPS.get(i);
    storefront(m, i, shop);
    if (shop) {
      fittings.add(sign(...shop, a));
      if (i === 1 || i === 3) {
        const light = new THREE.PointLight(shop[1], 22, 9);
        light.position.set(13.1 * Math.sin(a), 2.9, 13.1 * Math.cos(a));
        fittings.add(light);
      }
    }
    m.box(0, 5.65, 12, 4.4, 2.45, 0.28, IRON);
    for (const x of [-1.64, -0.82, 0, 0.82, 1.64]) {
      m.box(x, 4.88, 14.92, 0.065, 0.83, 0.08, BRONZE);
      m.box(x, 5.8, 12.21, 0.22, 1.58, 0.08, BRONZE);
    }
    // Broad viewports sit in a low sill, between strongly raked bronze ribs.
    m.face(a + Math.PI / BAYS);
    const rib = 0.42;
    m.box(0, 1.22, 20.73, rib, 2.53, 0.43, BRONZE, 0.14);
    m.box(0, 3.8, 20.66, rib, 2.95, 0.43, BRONZE, -0.17);
    m.box(0, 6.09, 19.7, rib, 2.85, 0.49, TRIM, -0.60);
    m.box(0, 6.95, 16.4, rib, 0.51, 5.5, BRONZE, 0.10);
    m.box(0, 6.78, 16.6, 0.16, 0.08, 3.6, AMBER, 0.10, true);
    m.box(0, 2.01, 13.22, 0.46, 4, 0.7, BRONZE, -0.10);
    m.box(0, 0.012, 17.47, 0.04, 0.012, 5.7, IRON);
    m.face(a);
    m.box(0, 0.36, 20.91, 7.43, 0.72, 0.58, IRON);
    m.box(0, 0.77, 20.86, 7.4, 0.12, 0.67, TRIM);
    m.box(0, 5.98, 20.32, 7.22, 0.18, 0.32, IRON);
    m.box(0, 6.69, 19.76, 7.03, 0.74, 0.67, PANEL);
  }
  const object = m.finish(0.42);
  object.add(fittings);
  return {
    object,
    update(dt, visitor) {
      for (const p of staff) {
        const pos = p.mesh.position;
        const dx = visitor.x - pos.x, dz = visitor.z - pos.z;
        const near = Math.hypot(dx, dz) < 7;
        p.pose(dt, 0, near ? wrapAngle(Math.atan2(dx, dz) - p.mesh.rotation.y) : null);
      }
    },
  };
}
