// The van: a white 1980s panel van with orange and red stripes and its name
// on the side, rust at the sills (PLAN.md 5.10).
import { Group, Mesh, PlaneGeometry, BoxGeometry, MeshStandardNodeMaterial, Color } from 'three/webgpu';
import { texture, uv, vec3 } from 'three/tsl';
import { VAN } from '../set/layout.js';
import { weathered } from '../materials/weathered.js';
import { signTexture } from '../set/signs.js';
import { extrudedBody, wheel, darkGlass, pane } from './vehicle.js';

export function createVan() {
  const g = new Group();
  const { len: L, wid: W, h: H } = VAN;
  const tailMat = new MeshStandardNodeMaterial({ color: new Color(0.35, 0.03, 0.02), roughness: 0.3 });
  const paint = weathered({ colour: '#c4bba8', under: '#6e5a44', rust: 0.18, streaks: 0.35, dirt: 0.6, dirtHeight: 0.6, rough: 0.35, metal: 0.1, wet: 0.3, scale: 0.8, bump: 0.3 });
  // Side profile, back to front.
  const profile = [
    [0, 0.38], [0, 1.95], [0.08, 2.06], [3.75, 2.08], [3.95, 2.0], [4.45, 1.35], [5.08, 1.18], [L, 1.05], [L, 0.38],
    [4.55, 0.38], [4.5, 0.62], [3.65, 0.62], [3.6, 0.38], [1.35, 0.38], [1.3, 0.62], [0.45, 0.62], [0.4, 0.38],
  ];
  g.add(extrudedBody(profile, W, paint, 0.07));
  // Glass: windscreen and the cab's side windows.
  const glass = darkGlass();
  const ws = pane(W - 0.25, 0.78, glass);
  ws.position.set(L / 2 - 0.95, 1.68, 0);
  ws.rotation.set(0, Math.PI / 2, 0);
  ws.rotateX(-0.9);
  g.add(ws);
  for (const s of [-1, 1]) {
    const side = pane(0.75, 0.55, glass);
    side.position.set(L / 2 - 1.5, 1.62, s * (W / 2 + 0.005));
    g.add(side);
    // The stripes and the name, a decal on each side.
    const decalMat = new MeshStandardNodeMaterial({ roughness: 0.35, transparent: true });
    const tex = signTexture('van', 1024, 256);
    decalMat.colorNode = texture(tex, uv()).rgb;
    const decal = new Mesh(new PlaneGeometry(3.1, 0.78), decalMat);
    decal.position.set(-0.35, 1.32, s * (W / 2 + 0.012));
    if (s < 0) decal.rotation.y = Math.PI;
    g.add(decal);
  }
  // The back: two doors, their windows, the lights.
  const seam = weathered({ colour: '#2a2723', rough: 0.6, bump: 0 });
  const backSeam = new Mesh(new BoxGeometry(0.02, 1.45, 0.02), seam);
  backSeam.position.set(-L / 2 - 0.075, 1.2, 0);
  g.add(backSeam);
  for (const z of [-0.45, 0.45]) {
    const w = pane(0.62, 0.42, glass);
    w.rotation.y = Math.PI / 2;
    w.position.set(-L / 2 - 0.075, 1.6, z);
    const tl = new Mesh(new BoxGeometry(0.04, 0.32, 0.18), tailMat);
    tl.position.set(-L / 2 - 0.075, 0.85, z * 2.05);
    g.add(w, tl);
  }
  // Bumpers and wheels.
  const chrome = weathered({ colour: '#9a978f', rust: 0.4, metal: 0.8, rough: 0.35, bump: 0 });
  const fb = new Mesh(new BoxGeometry(0.12, 0.2, W + 0.05), chrome);
  fb.position.set(L / 2 + 0.03, 0.45, 0);
  const rb = fb.clone();
  rb.position.x = -L / 2 - 0.03;
  g.add(fb, rb);
  for (const [x, z] of [[L / 2 - 0.85, 1], [L / 2 - 0.85, -1], [-L / 2 + 0.85, 1], [-L / 2 + 0.85, -1]]) {
    const w = wheel(0.36, 0.24);
    w.position.set(x, 0.36, z * (W / 2 - 0.12));
    g.add(w);
  }
  // Lamps, off.
  const lampMat = new MeshStandardNodeMaterial({ color: new Color(0.6, 0.6, 0.55), roughness: 0.2 });
  for (const z of [-0.7, 0.7]) {
    const l = new Mesh(new BoxGeometry(0.04, 0.16, 0.26), lampMat);
    l.position.set(L / 2 + 0.01, 0.82, z);
    g.add(l);
  }
  g.position.set(VAN.x, 0, VAN.z);
  g.rotation.y = VAN.heading;
  return { object: g, update() {} };
}
