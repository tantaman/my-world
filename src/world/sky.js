// Sky dome, sun/moon, ambient light and time-of-day palettes.
//
// `open` is how much of the sky reaches the eye: 1 out in the forest, less
// in the mouth of a cave, next to nothing deep inside one. Whoever knows
// (the caves) sets it every frame. It dims the sky's light and the sun's on
// everything — what lights a cave is whatever you bring into it, and the
// rock of the cave itself takes back what daylight reaches it (caves/look.js)
// — and lets the eye adjust,
// so that inside, the dark is something you can see by your lamp, and the
// mouth, looked back at, is a blaze of daylight.

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { NOISE_GLSL, SKY_GLSL, SKY_UNIFORMS_GLSL } from '../render/glsl.js';
import { SKY } from '../render/uniforms.js';
import { smoothstep, lerp } from '../noise.js';

// Palette keyframes by sun elevation (degrees). Linear HDR colours.
const KEYS = [
  { e: -18, zen: [0.004, 0.007, 0.022], hor: [0.014, 0.02, 0.045], sun: [0.0, 0.0, 0.0], amb: [0.04, 0.055, 0.11], gnd: [0.012, 0.014, 0.018], light: [0.32, 0.4, 0.62], li: 0.5, ai: 1.2, exp: 2.2 },
  { e: -6, zen: [0.02, 0.03, 0.08], hor: [0.18, 0.1, 0.12], sun: [0.6, 0.2, 0.1], amb: [0.07, 0.07, 0.12], gnd: [0.02, 0.02, 0.02], light: [0.4, 0.42, 0.6], li: 0.25, ai: 1.1, exp: 1.6 },
  { e: 0, zen: [0.07, 0.11, 0.25], hor: [0.95, 0.42, 0.2], sun: [1.6, 0.55, 0.2], amb: [0.22, 0.2, 0.28], gnd: [0.05, 0.04, 0.03], light: [1.0, 0.45, 0.2], li: 0.9, ai: 1.2, exp: 1.25 },
  { e: 8, zen: [0.12, 0.22, 0.48], hor: [1.0, 0.68, 0.42], sun: [1.5, 0.85, 0.45], amb: [0.36, 0.38, 0.48], gnd: [0.1, 0.085, 0.055], light: [1.0, 0.7, 0.42], li: 2.4, ai: 1.5, exp: 1.1 },
  { e: 20, zen: [0.08, 0.21, 0.6], hor: [0.62, 0.64, 0.64], sun: [1.2, 0.95, 0.7], amb: [0.42, 0.48, 0.6], gnd: [0.11, 0.11, 0.07], light: [1.0, 0.86, 0.66], li: 3.1, ai: 1.6, exp: 1.08 },
  { e: 45, zen: [0.06, 0.19, 0.6], hor: [0.48, 0.58, 0.72], sun: [1.0, 0.95, 0.85], amb: [0.45, 0.52, 0.65], gnd: [0.11, 0.12, 0.07], light: [1.0, 0.95, 0.86], li: 3.3, ai: 1.6, exp: 1.0 },
  { e: 90, zen: [0.05, 0.17, 0.58], hor: [0.45, 0.56, 0.72], sun: [1.0, 0.97, 0.9], amb: [0.45, 0.52, 0.66], gnd: [0.11, 0.12, 0.07], light: [1.0, 0.97, 0.92], li: 3.4, ai: 1.6, exp: 1.0 },
];

function sampleKeys(elev) {
  let a = KEYS[0];
  let b = KEYS[KEYS.length - 1];
  if (elev <= a.e) return { ...a, t: 0, a, b: a };
  for (let i = 0; i < KEYS.length - 1; i++) {
    if (elev >= KEYS[i].e && elev <= KEYS[i + 1].e) {
      a = KEYS[i];
      b = KEYS[i + 1];
      break;
    }
  }
  const t = elev >= b.e ? 1 : (elev - a.e) / (b.e - a.e);
  const mix3 = (k) => [lerp(a[k][0], b[k][0], t), lerp(a[k][1], b[k][1], t), lerp(a[k][2], b[k][2], t)];
  return {
    zen: mix3('zen'),
    hor: mix3('hor'),
    sun: mix3('sun'),
    amb: mix3('amb'),
    gnd: mix3('gnd'),
    light: mix3('light'),
    li: lerp(a.li, b.li, t),
    ai: lerp(a.ai, b.ai, t),
    exp: lerp(a.exp, b.exp, t),
  };
}

// Shadow map texels the edge of a shadow is spread over.
const SHADOW_SOFT = 2;

// How bright the picture is made deep in a cave, whatever the hour outside.
const DARK_EXPOSURE = 2.1;

const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _center = new THREE.Vector3();

export class Sky {
  constructor(scene) {
    this.scene = scene;
    this.hours = CONFIG.timeOfDay;
    this.exposure = 1;
    this.open = 1;
    this.sunDir = new THREE.Vector3();
    this.lightDir = new THREE.Vector3(0, 1, 0);
    // 0..1: how much of the sun cloud overhead is taking (set by whoever
    // knows what the sky is doing: the country feature). The light goes flat.
    this.overcast = 0;

    const mat = new THREE.ShaderMaterial({
      uniforms: SKY,
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = position;
          vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_Position = p.xyww;
        }`,
      fragmentShader: /* glsl */ `
        ${SKY_UNIFORMS_GLSL}
        ${NOISE_GLSL}
        ${SKY_GLSL}
        varying vec3 vDir;
        void main() {
          vec3 rd = normalize(vDir);
          vec3 col = skyGradient(rd);
          float sd = dot(rd, uSunDir);
          // sun disc
          col += uSunColor * smoothstep(0.9993, 0.9997, sd) * 12.0 * (1.0 - uNight);
          // moon
          vec3 md = normalize(-uSunDir + vec3(0.25, 0.1, 0.0));
          float mdot = dot(rd, md);
          col += vec3(0.7, 0.75, 0.9) * smoothstep(0.9994, 0.9997, mdot) * 1.6 * uNight;
          col += vec3(0.1, 0.12, 0.2) * pow(max(mdot, 0.0), 60.0) * 0.4 * uNight;
          // stars: one in a few hundred cells of the sky has one, somewhere
          // in it, a point a pixel or so across however finely it's drawn
          if (rd.y > 0.0 && uNight > 0.01) {
            vec3 sp = rd * 260.0;
            vec3 cell = floor(sp);
            float s = hash13(cell);
            if (s > 0.9975) {
              vec3 at = cell + 0.5 + (vec3(hash13(cell + 1.7), hash13(cell + 5.3), hash13(cell + 9.1)) - 0.5) * 0.5;
              float px = length(fwidth(sp)) * 0.7; // a pixel, in cells
              float star = 1.0 - smoothstep(0.0, max(px, 0.05) * 1.3, length(sp - at));
              float tw = 0.6 + 0.4 * sin(uTime * (2.0 + s * 5.0) + s * 40.0);
              col += vec3(0.8, 0.85, 1.0) * star * tw * uNight * smoothstep(0.0, 0.25, rd.y) * 1.6;
            }
          }
          // clouds: a soft drifting layer
          if (rd.y > 0.0) {
            vec2 uv = rd.xz / (rd.y + 0.18) * 1.6 + vec2(uTime * 0.006, uTime * 0.002);
            float c = fbm4(uv * 0.9);
            float c2 = fbm4(uv * 2.3 + 4.0);
            float cov = smoothstep(0.56, 0.8, c * 0.75 + c2 * 0.35) * smoothstep(0.0, 0.25, rd.y);
            float lit = clamp(0.55 + 0.45 * dot(normalize(vec3(rd.x, 0.0, rd.z)), normalize(vec3(uSunDir.x, 0.0, uSunDir.z) + 1e-4)), 0.0, 1.0);
            vec3 cloudCol = mix(uHorizon * 0.75 + uZenith * 0.2, uHorizon * 0.6 + uSunColor * 0.65, lit * (1.0 - uNight));
            cloudCol = mix(cloudCol, cloudCol * 0.72, smoothstep(0.6, 0.95, c2));
            col = mix(col, cloudCol, cov * 0.85);
          }
          gl_FragColor = vec4(col, 1.0);
        }`,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(500, 32, 16), mat);
    this.dome.renderOrder = -1000;
    this.dome.frustumCulled = false;
    scene.add(this.dome);

    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true;
    const S = CONFIG.shadowExtent;
    const sc = this.sun.shadow.camera;
    sc.left = -S;
    sc.right = S;
    sc.top = S;
    sc.bottom = -S;
    sc.near = 1;
    sc.far = 400;
    this.sun.shadow.mapSize.set(CONFIG.shadowMapSize, CONFIG.shadowMapSize);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.06;
    // a little soft at the edge, as the sun's own width makes a real one
    this.sun.shadow.radius = SHADOW_SOFT;
    // (and on what is drawn over the rest, the water: render/pipeline.js)
    this.sun.layers.enableAll();
    scene.add(this.sun);
    scene.add(this.sun.target);

    this.hemi = new THREE.HemisphereLight(0xffffff, 0x222211, 1);
    this.hemi.layers.enableAll();
    scene.add(this.hemi);
  }

  // Sun position from the hour of day. A gentle tilt keeps shadows angled even at noon.
  computeSunDir(hours, out) {
    const t = ((hours - 6) / 12) * Math.PI; // 6h = sunrise, 18h = sunset
    const elev = Math.sin(t) * 1.05 - 0.05;
    const az = t * 0.9 + 0.5;
    out.set(Math.cos(az) * Math.cos(elev), Math.sin(elev), Math.sin(az) * Math.cos(elev) * 0.85 + 0.3);
    return out.normalize();
  }

  update(focus, cameraPos) {
    this.dome.position.copy(cameraPos);
    const sd = this.computeSunDir(this.hours, this.sunDir);
    const elevDeg = THREE.MathUtils.radToDeg(Math.asin(sd.y));
    const k = sampleKeys(elevDeg);
    const night = smoothstep(-2, -12, elevDeg);

    SKY.uSunDir.value.copy(sd);
    SKY.uZenith.value.setRGB(...k.zen);
    SKY.uHorizon.value.setRGB(...k.hor);
    SKY.uSunColor.value.setRGB(...k.sun);
    SKY.uNight.value = night;
    this.exposure = lerp(DARK_EXPOSURE, k.exp, this.open);

    // At night the "sun" light becomes moonlight from the opposite side.
    const lightDir = this.lightDir;
    if (night > 0.5) lightDir.set(-sd.x + 0.25, -sd.y + 0.1, -sd.z).normalize();
    else lightDir.copy(sd);
    if (lightDir.y < 0.06) lightDir.y = 0.06;
    lightDir.normalize();

    this.sun.color.setRGB(...k.light);
    const fadeAtHorizon = night > 0.5 ? 1 : smoothstep(-3, 2, elevDeg);
    this.sun.intensity = k.li * Math.max(fadeAtHorizon, night > 0.5 ? 1 : 0) * (1 - 0.8 * this.overcast) * this.open;
    this.hemi.color.setRGB(...k.amb);
    this.hemi.groundColor.setRGB(...k.gnd);
    this.hemi.intensity = k.ai * (1 + 0.3 * this.overcast) * this.open;

    // Shadow camera follows the player, snapped to shadow texels to avoid shimmer.
    const S = CONFIG.shadowExtent;
    const texel = (2 * S) / CONFIG.shadowMapSize;
    const right = _right.crossVectors(THREE.Object3D.DEFAULT_UP, lightDir).normalize();
    const up = _up.crossVectors(lightDir, right).normalize();
    const r = focus.dot(right);
    const u = focus.dot(up);
    const center = _center
      .copy(focus)
      .addScaledVector(right, Math.round(r / texel) * texel - r)
      .addScaledVector(up, Math.round(u / texel) * texel - u);
    this.sun.target.position.copy(center);
    this.sun.position.copy(center).addScaledVector(lightDir, 200);
    this.sun.target.updateMatrixWorld();
  }
}
