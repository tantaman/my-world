// The small things round the station (PLAN.md 5.10): pumps, oil drums, the
// bench, the ice chest, the bin. Sizes from set/layout.js. Each maker
// returns an Object3D standing on the ground at the origin, facing +Z.
import { Group, Mesh, BoxGeometry, CylinderGeometry, LatheGeometry, Vector2, TubeGeometry, CatmullRomCurve3, Vector3 } from 'three/webgpu';
import { texture, uv } from 'three/tsl';
import { PUMP, ISLANDS, ISLAND, BENCH, DRUM_SHOP, ICE, BIN } from '../set/layout.js';
import { weathered } from '../materials/weathered.js';
import { signTexture } from '../set/signs.js';

const shadowed = (m) => { m.castShadow = true; m.receiveShadow = true; return m; };

// A white box, rusted, a three-row dial, a hose and nozzle.
export function pump() {
  const g = new Group();
  const body = weathered({ colour: '#d9d3c3', under: '#6b5f4b', peel: 0.12, rust: 0.45, streaks: 0.5, dirt: 0.6, rough: 0.55, metal: 0.2, scale: 0.5 });
  const dark = weathered({ colour: '#202220', rust: 0.3, rough: 0.5 });
  const dial = weathered({ colour: '#ffffff', map: texture(signTexture('dial', 128, 160), uv()), streaks: 0.2, dirt: 0, rough: 0.3, scale: 0.4 });
  const main = shadowed(new Mesh(new BoxGeometry(PUMP.w, PUMP.h, PUMP.d), [body, body, body, body, body, body]));
  main.position.y = PUMP.h / 2;
  const face = new Mesh(new BoxGeometry(PUMP.w * 0.7, PUMP.h * 0.3, 0.01), [dark, dark, dark, dark, dial, dark]);
  face.position.set(0, PUMP.h * 0.72, PUMP.d / 2 + 0.005);
  const face2 = face.clone();
  face2.position.z = -face.position.z;
  face2.rotation.y = Math.PI;
  const top = shadowed(new Mesh(new BoxGeometry(PUMP.w + 0.04, 0.08, PUMP.d + 0.04), body));
  top.position.y = PUMP.h + 0.04;
  const holster = new Mesh(new BoxGeometry(0.12, 0.2, 0.1), dark);
  holster.position.set(PUMP.w / 2 + 0.05, 1.05, 0.1);
  const hose = new Mesh(new TubeGeometry(new CatmullRomCurve3([
    new Vector3(PUMP.w / 2, 1.5, 0), new Vector3(PUMP.w / 2 + 0.15, 0.6, 0.2), new Vector3(PUMP.w / 2 + 0.12, 0.25, 0.25), new Vector3(PUMP.w / 2 + 0.06, 1.0, 0.12),
  ]), 20, 0.018, 5), dark);
  g.add(main, face, face2, top, holster, hose);
  return g;
}

// An oil drum: a lathed profile with two ribs, white-banded and rusty.
export function drum() {
  const pts = [];
  const r = 0.29;
  const h = 0.88;
  pts.push(new Vector2(0, 0), new Vector2(r - 0.01, 0), new Vector2(r, 0.02));
  for (const y of [0.29, 0.59]) pts.push(new Vector2(r, y - 0.02), new Vector2(r + 0.012, y), new Vector2(r, y + 0.02));
  pts.push(new Vector2(r, h - 0.02), new Vector2(r - 0.01, h), new Vector2(0, h - 0.01));
  const m = weathered({ colour: '#3b3f3a', under: '#d8d2c2', peel: 0.0, rust: 0.6, streaks: 0.4, dirt: 0.5, rough: 0.6, metal: 0.4, scale: 0.35,
    band: { colour: '#d4cfbf', height: 0.55 } });
  const mesh = shadowed(new Mesh(new LatheGeometry(pts, 20), m));
  return mesh;
}

// Green-grey slats on a black frame.
export function bench() {
  const g = new Group();
  const slat = weathered({ colour: '#5d6a5e', under: '#3a332a', peel: 0.2, rust: 0, streaks: 0.4, dirt: 0.3, rough: 0.7, scale: 0.4 });
  const frame = weathered({ colour: '#1a1b1a', rust: 0.4, rough: 0.5, metal: 0.4 });
  const L = BENCH.len;
  for (let i = 0; i < 3; i++) {
    const s = shadowed(new Mesh(new BoxGeometry(L, 0.03, 0.1), slat));
    s.position.set(0, 0.45, -0.12 + i * 0.12);
    g.add(s);
  }
  for (let i = 0; i < 2; i++) {
    const s = shadowed(new Mesh(new BoxGeometry(L, 0.1, 0.03), slat));
    s.position.set(0, 0.62 + i * 0.14, -0.2);
    s.rotation.x = -0.12;
    g.add(s);
  }
  for (const x of [-L / 2 + 0.1, L / 2 - 0.1]) {
    const leg = shadowed(new Mesh(new BoxGeometry(0.05, 0.45, 0.4), frame));
    leg.position.set(x, 0.225, -0.02);
    const back = shadowed(new Mesh(new BoxGeometry(0.05, 0.45, 0.04), frame));
    back.position.set(x, 0.66, -0.22);
    g.add(leg, back);
  }
  return g;
}

// The ice chest: a white box with ICE on its front, its lid a little open.
export function iceChest() {
  const g = new Group();
  const body = weathered({ colour: '#ddd8cb', rust: 0.25, streaks: 0.5, dirt: 0.7, rough: 0.5, scale: 0.5 });
  const label = weathered({ colour: '#ffffff', map: texture(signTexture('ice', 512, 200), uv()), rust: 0.15, streaks: 0.4, dirt: 0.6, rough: 0.5, scale: 0.5 });
  const main = shadowed(new Mesh(new BoxGeometry(ICE.w, ICE.h, ICE.d), [body, body, body, body, label, body]));
  main.position.y = ICE.h / 2;
  const lid = shadowed(new Mesh(new BoxGeometry(ICE.w + 0.04, 0.08, ICE.d + 0.04), body));
  lid.position.set(0, ICE.h + 0.08, -0.05);
  lid.rotation.x = -0.12;
  g.add(main, lid);
  return g;
}

export function bin() {
  const m = weathered({ colour: '#2a2c2a', rust: 0.4, rough: 0.6, metal: 0.3, dirt: 0.5 });
  const mesh = shadowed(new Mesh(new CylinderGeometry(0.28, 0.25, 0.9, 14), m));
  mesh.position.y = 0.45;
  return mesh;
}

// All of them where they stand.
export function createSmallProps() {
  const group = new Group();
  for (const is of ISLANDS) {
    const p = pump();
    p.position.set(is.x + ISLAND.pumpDx, ISLAND.h, is.z);
    const d = drum();
    d.position.set(is.x + ISLAND.drumDx, ISLAND.h, is.z + 0.1);
    group.add(p, d);
  }
  const d = drum();
  d.position.set(DRUM_SHOP.x, 0, DRUM_SHOP.z);
  const b = bench();
  b.position.set(BENCH.x, 0, BENCH.z + 0.05);
  const ice = iceChest();
  ice.position.set(ICE.x, 0, ICE.z);
  const bn = bin();
  bn.position.set(BIN.x, 0, BIN.z);
  group.add(d, b, ice, bn);
  return { object: group, update() {} };
}
