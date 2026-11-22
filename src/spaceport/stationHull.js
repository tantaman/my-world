// Cardassian hull plating. A bay's local +Z points out from the core.
// Batch the fixed metalwork and lamps into two meshes for the whole deck.
import * as THREE from 'three';
import { Mesher } from '../build/geometry.js';
import { NOISE_GLSL } from '../render/glsl.js';

const TAU = Math.PI * 2;

export class Metalwork {
  constructor() {
    this.metal = new Mesher();
    this.lamps = new Mesher();
    this.frame = new THREE.Matrix4();
  }

  face(angle) {
    this.frame.makeRotationY(angle);
  }

  add(geometry, color, x = 0, y = 0, z = 0, tilt = 0, lit = false) {
    const transform = new THREE.Matrix4().makeRotationX(tilt).setPosition(x, y, z).premultiply(this.frame);
    const tint = new THREE.Color(color);
    (lit ? this.lamps : this.metal).add(geometry, transform, () => tint);
  }

  box(x, y, z, w, h, depth, color, tilt = 0, lit = false) {
    this.add(new THREE.BoxGeometry(w, h, depth), color, x, y, z, tilt, lit);
  }

  // Spin a closed cross section around the core, or just through one bay.
  shell(profile, color, start = 0, arc = TAU, segments = 96) {
    const points = [...profile, profile[0]].map(([r, y]) => new THREE.Vector2(r, y));
    this.add(new THREE.LatheGeometry(points, segments, start, arc), color);
  }

  finish(panelScale = 1) {
    const group = new THREE.Group();
    const material = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.74, metalness: 0.22, side: THREE.DoubleSide });
    // Seams follow the radius of the station. Surface grain and differently
    // toned replacement panels give the broad faces of the pylons a scale.
    material.onBeforeCompile = (shader) => {
      shader.uniforms.panelScale = { value: panelScale };
      shader.vertexShader = 'varying vec3 vHull;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vHull = position;');
      shader.fragmentShader = `varying vec3 vHull; uniform float panelScale;
${NOISE_GLSL}
` + shader.fragmentShader.replace('#include <color_fragment>', `
        #include <color_fragment>
        float radius = length(vHull.xz);
        float angle = atan(vHull.x, vHull.z);
        // Integer repetitions meet at the seam on the back of each ring.
        float repeats = max(12.0, floor(radius / (3.2 * panelScale)) * 6.0);
        vec2 uv = vec2(angle * repeats / 6.283185, (radius + vHull.y * 1.3) / (2.2 * panelScale));
        uv.x += mod(floor(uv.y), 2.0) * 0.5;
        vec2 cell = abs(fract(uv) - 0.5);
        vec2 aa = min(fwidth(uv), vec2(0.23)) + 0.002;
        vec2 seam = smoothstep(vec2(0.48) - aa, vec2(0.5) + aa, cell);
        float grain = fbm4(vHull.xz / panelScale * 1.7 + vHull.y * 0.67);
        diffuseColor.rgb *= (0.83 + 0.17 * hash12(floor(uv)) + 0.15 * grain)
                          * (1.0 - 0.27 * max(seam.x, seam.y));`);
    };
    if (!this.metal.empty) group.add(new THREE.Mesh(this.metal.build(), material));
    if (!this.lamps.empty) group.add(new THREE.Mesh(this.lamps.build(), new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(2.3, 2.3, 2.3), side: THREE.DoubleSide })));
    return group;
  }
}

const IRON = 0x504b4c;
const ARMOR = 0x9c9290;
const EDGE = 0xc6b8a9;
const RECESS = 0x36343c;
const BRASS = 0xa17750;
const LAMP = 0xffdfa3;

// The pylons flare out at the roots and turn in over the docking ring.
// Each station along the curve has a chamfered, eight-sided cross section.
const BLADE = [
  // height, radius, radial half-depth, half-width
  [0, 88, 8.4, 5.5], [7, 93, 7.5, 5.2], [17, 95, 6.6, 4.4],
  [29, 92, 6.2, 3.7], [41, 85, 6, 3.2], [51, 74, 5.8, 2.7],
  [57, 65, 4.1, 2.4], [59, 60, 2.6, 1.9],
];
function pylon(m, side) {
  const bevel = [[-0.6, -1], [0.6, -1], [1, -0.55], [1, 0.58], [0.6, 1], [-0.6, 1], [-1, 0.58], [-1, -0.55]];
  const rings = BLADE.map(([h, r, d, w]) => bevel.map(([x, z]) => new THREE.Vector3(x * w, h * side, r + z * d)));
  const face = (a, b, c, d, color) => {
    const points = (side > 0 ? [a, b, c, a, c, d] : [c, b, a, d, c, a]).map(v => v.clone().applyMatrix4(m.frame));
    m.metal.tris(points, () => new THREE.Color(color));
  };
  for (let j = 1; j < rings.length; j++) {
    const base = rings[j - 1], tip = rings[j];
    for (let i = 0; i < 8; i++) {
      const k = (i + 1) % 8;
      face(base[i], tip[i], tip[k], base[k], [IRON, ARMOR, ARMOR, EDGE, ARMOR, EDGE, ARMOR, IRON][i]);
    }
    // Long recesses on both spines hold stacked vanes. Leave a plating
    // seam between levels, and put windows in the upper docking galleries.
    for (const inward of [false, true]) {
      const left = inward ? 0 : 5, right = inward ? 1 : 4;
      const point = (u, v, offset = 0.15) => {
        const p = base[left].clone().lerp(base[right], u);
        p.lerp(tip[left].clone().lerp(tip[right], u), v);
        p.z += inward ? -offset : offset;
        return p;
      };
      face(point(0.15, 0.09), point(0.15, 0.91), point(0.85, 0.91), point(0.85, 0.09), IRON);
      for (let n = 1; n <= 4; n++) {
        const v = n * 0.17;
        face(point(0.21, v, 0.22), point(0.21, v + 0.035, 0.22), point(0.79, v + 0.035, 0.22), point(0.79, v, 0.22), j > 4 && n === 2 ? LAMP : BRASS);
      }
    }
    // A dark inset and a bronze rib sit proud of each broad cheek.
    for (const flank of [-1, 1]) {
      const cheek = (ring, t) => {
        const a = flank > 0 ? 2 : 7, b = flank > 0 ? 3 : 6;
        const p = ring[a].clone().lerp(ring[b], t);
        p.x += flank * 0.04;
        return p;
      };
      face(cheek(base, 0.17), cheek(tip, 0.17), cheek(tip, 0.72), cheek(base, 0.72), RECESS);
      face(cheek(base, 0.78), cheek(tip, 0.78), cheek(tip, 0.92), cheek(base, 0.92), BRASS);
    }
  }
  m.box(0, side * 58.5, 60.8, 4.4, 2.1, 5.6, IRON);
  m.box(0, side * 59.7, 60.5, 2.5, 0.38, 3.1, 0xf1a969, 0, true);
}

function ring(m, r, width, height, bays) {
  m.face(0);
  const inner = r - width, outer = r + width;
  m.shell([[inner, -height * 0.5], [inner + 1.2, -height], [outer - 1.3, -height], [outer, -height * 0.45], [outer, height * 0.45], [outer - 1.3, height], [inner + 1.2, height], [inner, height * 0.5]], IRON);
  for (let i = 0; i < bays; i++) {
    const a = i * TAU / bays;
    m.face(a);
    const half = Math.PI / bays * 0.97;
    m.shell([[inner + 0.4, height * 0.58], [outer + 0.2, height * 0.42], [outer - 1, height + 0.27], [r - 0.65, height + 0.55], [inner + 1.4, height + 0.2]], i % 4 === 1 ? 0x877b74 : ARMOR, -half, half * 2, 3);
    // Raised service panels, a recessed equatorial band, lit cabin windows.
    m.box(0, height + 0.56, r, 2.4, 0.42, width * 1.16, EDGE);
    for (let j = -1; j <= 1; j++) {
      m.face(a + j * half * 0.52);
      m.box(0, 0.12, outer + 0.03, 0.64, 0.44, 0.12, i % 5 === 2 ? 0xa8def2 : LAMP, 0, true);
    }
  }
}

export function buildStationHull() {
  const m = new Metalwork();
  ring(m, 87, 5.5, 3.4, 54);
  ring(m, 47, 6.8, 4.1, 36);
  for (let i = 0; i < 3; i++) {
    m.face(i * TAU / 3);
    m.box(0, 0, 54, 6.8, 3.5, 73, IRON);
    m.box(0, 1.7, 54, 5.1, 2, 70, ARMOR);
    for (let r = 23; r < 85; r += 3.8) m.box(0, 2.85, r, 4.3, 0.48, 2.8, EDGE);
    m.add(new THREE.CylinderGeometry(6.6, 7.9, 2.5, 8), IRON, 0, 4.5, 85);
    m.add(new THREE.CylinderGeometry(3.9, 6.6, 2.2, 8), ARMOR, 0, 6.7, 85);
    for (const side of [-1, 1]) pylon(m, side);
  }
  // Radial docking ports between the pylon roots.
  for (let i = 0; i < 9; i++) {
    m.face((i + 0.5) * TAU / 9);
    m.box(0, 0, 92, 4, 3, 6, ARMOR);
    m.add(new THREE.CylinderGeometry(2, 2, 1.2, 12), IRON, 0, 0, 95, Math.PI / 2);
    m.add(new THREE.CylinderGeometry(1.35, 1.35, 0.18, 12), BRASS, 0, 0, 95.65, Math.PI / 2);
  }
  const rings = m.finish();
  const c = new Metalwork();
  // The Promenade drum, stepped decks, Ops crown, and lower reactor spindle.
  c.shell([[0.1, -19], [2.2, -18], [3.7, -13], [8, -11], [11, -8.8], [19, -6.5], [23, -3], [23.5, 3.7], [21, 6], [17, 7.3], [15, 10], [10, 11.4], [9, 14], [5, 16.6], [3, 17.2], [0.1, 17.5]], ARMOR);
  for (const [r, y] of [[22.9, -2.2], [23.5, 2.2], [18.1, 6.7], [14.9, 9.9], [9.5, 11.6]]) {
    c.shell([[r - 0.8, y - 0.65], [r + 0.3, y - 0.5], [r + 0.3, y + 0.35], [r - 0.8, y + 0.65]], IRON);
  }
  for (let i = 0; i < 48; i++) {
    c.face(i * TAU / 48);
    c.box(0, 0.4, 23.48, 1.25, 0.55, 0.28, LAMP, 0, true);
    if (i % 4 === 0) c.box(0, 4.8, 21.6, 1.35, 2, 3.4, EDGE, -0.3);
  }
  for (let i = 0; i < 30; i++) {
    c.face(i * TAU / 30);
    c.box(0, 8.45, 16.25, 0.7, 0.38, 0.5, LAMP, 0, true);
    if (i % 5 === 0) {
      c.box(0, 11.4, 8.7, 1.1, 1.35, 4.5, EDGE, -0.3);
      c.box(0, 4.3, 20.4, 1.8, 0.85, 5.6, EDGE, -0.28);
    }
  }
  c.face(0);
  c.add(new THREE.CylinderGeometry(0.2, 0.8, 6, 8), EDGE, 0, 20.2);
  return { rings, core: c.finish() };
}
