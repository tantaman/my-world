// A hollow-eyed face above a garment with an uneven hem. Ring widths,
// folds and colouring give the silhouette volume from any viewing angle.
import * as THREE from 'three';
import { weatherGrain } from './surfaces.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export function makePhantom(porter) {
  const parts = [];
  const color = new THREE.Color(),
    normal = new THREE.Vector3();
  function add(geometry, hex, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, rz = 0) {
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    g.deleteAttribute('uv');
    g.scale(sx, sy, sz).rotateZ(rz).translate(x, y, z);
    const attr = g.attributes.normal,
      rgb = [];
    color.setHex(hex);
    for (let i = 0; i < attr.count; i++) {
      normal.fromBufferAttribute(attr, i);
      const p = g.attributes.position,
        u = p.getX(i),
        h = p.getY(i),
        z = p.getZ(i);
      const k = 0.31 + 0.25 * Math.max(0, normal.y) + 0.4 * Math.max(0, normal.x * 0.64 + normal.z * 0.72) + 0.08 * Math.cos(u * 54 + z * 20 + h);
      // The lower shift is soaked. Dark folds climb from its torn hem.
      const dye = h < 1.55 ? 0.39 + 0.61 * Math.min(1, Math.max(0, h * 0.87 + 0.21 * Math.cos(14 * u + z * 31))) : 1;
      rgb.push(color.r * k * dye, color.g * k * dye, color.b * k * dye);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(rgb, 3));
    parts.push(g);
  }
  const oval = (hex, x, y, z, rx, ry, rz, tilt = 0) => add(new THREE.SphereGeometry(1, 14, 10), hex, x, y, z, rx, ry, rz, tilt);
  function bone(hex, a, b, r1, r2) {
    const axis = new THREE.Vector3().subVectors(b, a);
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const g = new THREE.CylinderGeometry(r2, r1, axis.length(), 7);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis.normalize()));
    add(g, hex, mid.x, mid.y, mid.z);
  }
  const v = (x, y, z) => new THREE.Vector3(x, y, z);
  const skin = 0x9ba69a,
    hair = 0x172023,
    cloth = porter ? 0x3d4947 : 0x67766c;
  // A pleated shift with torn slits rising from its lower edge.
  const rings = [
    [0.08, 0.41, 0.23],
    [0.28, 0.4, 0.22],
    [0.71, 0.32, 0.2],
    [1.18, 0.2, 0.15],
    [1.44, 0.27, 0.16],
    [1.57, 0.21, 0.11],
    [1.62, 0.095, 0.085],
  ];
  const vertices = [],
    indices = [],
    n = 40;
  for (let j = 0; j < rings.length; j++)
    for (let i = 0; i < n; i++) {
      const [y, w, d] = rings[j],
        t = (i / n) * Math.PI * 2;
      const pleat = 1 + (0.14 - j * 0.014) * Math.cos(10 * t + j * 0.2);
      const hem = j === 0 ? 0.12 * Math.sin(5 * t) + 0.09 * Math.cos(13 * t) : 0;
      vertices.push(w * Math.cos(t) * pleat - 0.05 * (1 - y), y + hem, d * Math.sin(t) * pleat - 0.07 * (1 - y));
      if (j > 0 && !(j === 1 && i % 11 === 0)) {
        const a = (j - 1) * n + i,
          b = (j - 1) * n + ((i + 1) % n);
        indices.push(a, a + n, b, b, a + n, b + n);
      }
    }
  const dress = new THREE.BufferGeometry();
  dress.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  dress.setIndex(indices);
  dress.computeVertexNormals();
  add(dress, cloth);
  oval(skin, -0.028, 1.66, 0.022, 0.078, 0.14, 0.078);
  oval(hair, -0.045, 1.94, -0.013, 0.185, 0.256, 0.162, -0.17);
  oval(skin, -0.052, 1.92, 0.052, 0.148, 0.213, 0.123, -0.17);
  for (const side of [-1, 1]) {
    oval(0x13171a, -0.053 + side * 0.066, 1.952 - side * 0.012, 0.157, 0.047, 0.042, 0.021, -side * 0.24);
    oval(0x4d5850, -0.052 + side * 0.075, 1.891, 0.142, 0.046, 0.049, 0.013, side * 0.28);
    oval(0x828f88, -0.053 + side * 0.065, 1.951 - side * 0.012, 0.174, 0.009, 0.009, 0.005);
    const shoulder = v(side * 0.205, 1.48, 0),
      elbow = v(side * 0.32, side === 1 ? 1.3 : 1.14, 0.045),
      hand = v(side * 0.35, side === 1 ? 1.46 : 0.9, side === 1 ? 0.46 : 0.09);
    bone(cloth, shoulder, elbow, 0.106, 0.084);
    bone(cloth, elbow, hand, 0.083, 0.052);
    oval(skin, hand.x, hand.y - 0.035, hand.z, 0.049, 0.08, 0.033);
    for (let k = 0; k < 4; k++) {
      const x = hand.x + (k - 1.5) * 0.021;
      bone(skin, v(x, hand.y - 0.05, hand.z), v(x + side * 0.015, hand.y - 0.16 + 0.018 * Math.abs(k - 1.5), hand.z + 0.022), 0.011, 0.006);
    }
    if (!porter) {
      for (let k = 0; k < 4; k++) oval(hair, -0.04 + side * (0.118 + 0.01 * k), 1.85 - k * 0.032, 0.047 - k * 0.023, 0.028, 0.23 + k * 0.023, 0.05, side * -0.11);
    }
  }
  oval(0x9c9b80, -0.05, 1.897, 0.165, 0.027, 0.046, 0.024);
  oval(0x363434, -0.042, 1.827, 0.147, 0.036, 0.044, 0.012);
  // A torn seam and dried runs on the front of the shift.
  if (!porter) {
    for (let i = 0; i < 5; i++) oval(0x55372f, 0.085 + i * 0.016, 1.28 - i * 0.045, 0.151, 0.012, 0.11 + i * 0.025, 0.013, -0.08);
    for (let i = 0; i < 6; i++) oval(hair, -0.168 + i * 0.047, 2.025 - i * 0.016, 0.144, 0.025, 0.098 - i * 0.009, 0.015, -0.32);
  }
  if (porter) {
    oval(0x333d40, -0.052, 2.097, 0.013, 0.194, 0.065, 0.18);
    oval(0x424b49, -0.047, 2.064, 0.115, 0.197, 0.018, 0.164);
    for (let i = 0; i < 4; i++) oval(0xaaa382, 0.018, 1.42 - i * 0.14, 0.153, 0.016, 0.016, 0.01);
  }
  const geometry = mergeGeometries(parts);
  parts.forEach((p) => p.dispose());
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, depthWrite: true, side: THREE.DoubleSide });
  const clock = { value: 0 };
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uClothTime = clock;
    shader.uniforms.uClothGrain = { value: weatherGrain() };
    shader.vertexShader =
      'varying vec3 vBody; uniform float uClothTime;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
      vBody=position;
      float hem=1.-smoothstep(.06,1.14,position.y);
      transformed.x+=hem*.052*sin(position.z*21.+uClothTime*1.72);
      transformed.z+=hem*.036*sin(position.x*19.+uClothTime*1.38);`,
      );
    shader.fragmentShader =
      'varying vec3 vBody; uniform sampler2D uClothGrain;\n' +
      shader.fragmentShader.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
      vec2 sheet=vec2(atan(vBody.z,vBody.x)*.38,vBody.y);
      vec3 dirt=texture2D(uClothGrain,sheet*vec2(3.2,.85)).rgb;
      if(vBody.y<1.64) {
        float wet=smoothstep(.43,.6,dirt.r+.12*(1.-vBody.y));
        diffuseColor.rgb*=mix(vec3(.74,.82,.78),vec3(.26,.20,.16),wet)*(.63+.52*dirt.b);
        if(vBody.y<.32 && dirt.g>.57+vBody.y*.23) discard;
      } else {
        float bruise=smoothstep(.46,.65,dirt.g);
        diffuseColor.rgb*=mix(vec3(.93,1.,.94),vec3(.43,.34,.39),bruise);
      }`,
      );
  };
  const phantom = new THREE.Mesh(geometry, mat);
  phantom.onBeforeRender = () => {
    clock.value = (performance.now() % 120000) * 0.001;
  };
  phantom.visible = false;
  phantom.name = porter ? 'Night porter' : 'Veiled visitor';
  phantom.renderOrder = 2;
  return phantom;
}
