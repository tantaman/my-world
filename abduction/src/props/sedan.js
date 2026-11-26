// The sedan that passes at 16.5 to 24 s: a boxy 1980s saloon, dark teal,
// headlights on, wheels turning, along the near lane toward -X at about
// 14 m/s (PLAN.md 5.10). Its headlights are bright rectangles for bloom and
// one spot light from light/rig.js; it also lights the fog (weather/fog.js).
import { Group, Mesh, BoxGeometry, MeshStandardNodeMaterial, Color, Vector3 } from 'three/webgpu';
import { vec3 } from 'three/tsl';
import { ROAD } from '../set/layout.js';
import { T } from '../timeline.js';
import { weathered } from '../materials/weathered.js';
import { extrudedBody, wheel, darkGlass, pane } from './vehicle.js';

export const CAR = {
  speed: 14,                                   // m/s
  lane: (ROAD.z0 + ROAD.centre) / 2,           // the near lane, driving toward -X
  passX: -2.6,                                 // where it is at T.carPasses
  wheel: 0.31,
};
const HEADLIGHT_GLOW = 30;

export function carX(t) {
  return CAR.passX - CAR.speed * (t - T.carPasses);
}

export function createSedan({ rig, scatterLights }) {
  const g = new Group();
  const L = 4.7;
  const W = 1.75;
  const paint = new MeshStandardNodeMaterial({ color: new Color('#16302e'), roughness: 0.25, metalness: 0.4 });
  const profile = [
    [0, 0.32], [0, 0.95], [0.9, 1.0], [1.35, 1.38], [3.0, 1.4], [3.55, 0.98], [L, 0.9], [L, 0.32],
    [4.0, 0.32], [3.95, 0.55], [3.25, 0.55], [3.2, 0.32], [1.45, 0.32], [1.4, 0.55], [0.7, 0.55], [0.65, 0.32],
  ];
  const body = extrudedBody(profile, W, paint, 0.06);
  g.add(body);
  const glass = darkGlass();
  for (const s of [-1, 1]) {
    const side = pane(1.55, 0.32, glass);
    side.position.set(-0.15 + 2.2 - L / 2, 1.18, s * (W / 2 - 0.02));
    g.add(side);
  }
  const ws = pane(W - 0.2, 0.55, glass);
  ws.position.set(3.28 - L / 2, 1.18, 0);
  ws.rotation.y = Math.PI / 2;
  ws.rotateX(-0.85);
  g.add(ws);
  const head = new MeshStandardNodeMaterial({ color: new Color(1, 1, 1) });
  head.emissiveNode = vec3(1.0, 0.96, 0.88).mul(HEADLIGHT_GLOW);
  const tail = new MeshStandardNodeMaterial({ color: new Color(0.3, 0, 0) });
  tail.emissiveNode = vec3(1.0, 0.05, 0.02).mul(4);
  for (const z of [-0.6, 0.6]) {
    const h = new Mesh(new BoxGeometry(0.04, 0.13, 0.32), head);
    h.position.set(L / 2 + 0.01, 0.72, z);
    const tl = new Mesh(new BoxGeometry(0.04, 0.12, 0.3), tail);
    tl.position.set(-L / 2 - 0.01, 0.78, z);
    g.add(h, tl);
  }
  const wheels = [];
  for (const [x, z] of [[1.35, 1], [1.35, -1], [-1.25, 1], [-1.25, -1]]) {
    const w = wheel(CAR.wheel, 0.2, '#8e8e88');
    w.position.set(x, CAR.wheel, z * (W / 2 - 0.1));
    g.add(w);
    wheels.push(w);
  }
  // It drives toward -X: turn it round.
  g.rotation.y = Math.PI;
  const light = rig.lights.headlight;
  const front = new Vector3();
  const aim = new Vector3();
  const fogAim = new Vector3(-1, -0.08, 0).normalize();
  const colour = new Color('#fff4e0');

  return {
    object: g,
    update(t) {
      const on = t > T.carSeen - 3 && t < T.carGone + 2;
      g.visible = on;
      light.intensity = on ? light.userData.cd ?? 9000 : 0;
      if (!on) return;
      const x = carX(t);
      g.position.set(x, 0, CAR.lane);
      for (const w of wheels) w.rotation.z = (CAR.speed * t) / CAR.wheel;
      front.set(x - L / 2 - 0.1, 0.72, CAR.lane);
      light.position.copy(front);
      aim.set(x - 30, 0, CAR.lane + 0.5);
      light.target.position.copy(aim);
      scatterLights.add(front, colour, 2.2, fogAim, 0.35, 0.7);
    },
  };
}
