// The look.
//
// 1. The scene is rendered at low resolution (a few hundred lines tall) into
//    an HDR target with a depth texture.
// 2. A composite pass, still at low resolution, adds depth-based outlines on
//    silhouettes, height fog that melts into the sky, filmic tone mapping,
//    colour grading and ordered dithering onto a slightly reduced palette.
// 3. An upscale pass blows the art pixels up to the screen with a tunable
//    "soft pixel" filter: hard enough to read as pixel art, soft enough that
//    the pixels blur together into something that feels painted / real.

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { SKY } from './uniforms.js';
import { SKY_GLSL, SKY_UNIFORMS_GLSL } from './glsl.js';

const FS_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

const COMPOSITE_FRAG = /* glsl */ `
#include <packing>
${SKY_UNIFORMS_GLSL}
${SKY_GLSL}
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform vec2 uRes;
uniform float uNear;
uniform float uFar;
uniform mat4 uProjInv;
uniform mat4 uCamWorld;
uniform vec3 uCamPos;
uniform float uExposure;
uniform float uOutline;
uniform float uLevels;
uniform float uDither;
uniform float uFogDensity;
uniform float uFogHeight;
uniform float uFogFar;
uniform float uFogTint;
varying vec2 vUv;

float viewZ(float d) { return -perspectiveDepthToViewZ(d, uNear, uFar); }

vec3 aces(vec3 x) {
  const float a = 2.51; const float b = 0.03; const float c = 2.43; const float d = 0.59; const float e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}
vec3 toSRGB(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}
float bayer4(vec2 p) {
  ivec2 i = ivec2(mod(p, 4.0));
  int idx = i.x + i.y * 4;
  int m[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
  return (float(m[idx]) + 0.5) / 16.0;
}

void main() {
  vec2 px = 1.0 / uRes;
  vec3 col = texture2D(tColor, vUv).rgb;
  float d = texture2D(tDepth, vUv).x;
  bool sky = d >= 0.99999;

  if (!sky) {
    float z = viewZ(d);
    // Silhouette outline: darken pixels whose neighbours are much further away.
    float zl = viewZ(texture2D(tDepth, vUv - vec2(px.x, 0.0)).x);
    float zr = viewZ(texture2D(tDepth, vUv + vec2(px.x, 0.0)).x);
    float zu = viewZ(texture2D(tDepth, vUv + vec2(0.0, px.y)).x);
    float zd = viewZ(texture2D(tDepth, vUv - vec2(0.0, px.y)).x);
    float far = max(max(zl, zr), max(zu, zd));
    float edge = smoothstep(0.06, 0.2, (far - z) / z);
    col *= 1.0 - edge * uOutline;

    // Height fog with sun in-scattering, coloured by the sky behind it.
    vec4 vp = uProjInv * vec4(vUv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
    vp.xyz /= vp.w;
    float dist = length(vp.xyz);
    vec3 rd = normalize(mat3(uCamWorld) * vp.xyz);
    float b = uFogHeight;
    float ry = abs(rd.y) < 1e-3 ? 1e-3 : rd.y;
    float fogAmt = uFogDensity * exp(-uCamPos.y * b) * (1.0 - exp(-dist * ry * b)) / (ry * b);
    float fog = 1.0 - exp(-max(fogAmt, 0.0));
    fog = max(fog, smoothstep(uFogFar * 0.55, uFogFar, dist));
    vec3 frd = normalize(vec3(rd.x, clamp(rd.y, 0.0, 0.08), rd.z));
    col = mix(col, skyGradient(frd) * uFogTint, clamp(fog, 0.0, 1.0));
  }

  // Filmic tone map + grade
  col = aces(col * uExposure);
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(l), col, 1.12);                          // a touch more saturation
  col = mix(col, col * vec3(0.92, 0.98, 1.08), (1.0 - smoothstep(0.0, 0.35, l)) * 0.6); // cool shadows
  col = mix(col, col * vec3(1.05, 1.0, 0.92), smoothstep(0.5, 1.0, l) * 0.5);           // warm highlights
  col = toSRGB(clamp(col, 0.0, 1.0));

  // Ordered dither onto a reduced palette: pixel-art texture without banding.
  float th = mix(0.5, bayer4(gl_FragCoord.xy), uDither);
  col = floor(col * uLevels + th) / uLevels;

  gl_FragColor = vec4(col, 1.0);
}`;

const UPSCALE_FRAG = /* glsl */ `
uniform sampler2D tLow;
uniform vec2 uLowRes;
uniform float uSoft;
uniform float uVignette;
varying vec2 vUv;
void main() {
  // "Soft pixel" sampling: snap to the nearest art pixel, but blend across a
  // band at each pixel edge whose width is uSoft (0 = nearest, 1 = bilinear).
  vec2 p = vUv * uLowRes - 0.5;
  vec2 i = floor(p);
  vec2 f = p - i;
  float w = max(uSoft, 1e-3);
  f = clamp((f - 0.5) / w + 0.5, 0.0, 1.0);
  f = f * f * (3.0 - 2.0 * f);
  vec3 col = texture2D(tLow, (i + f + 0.5) / uLowRes).rgb;
  vec2 q = vUv - 0.5;
  col *= 1.0 - dot(q, q) * uVignette;
  gl_FragColor = vec4(col, 1.0);
}`;

export class PixelPipeline {
  constructor(renderer) {
    this.renderer = renderer;
    this.pixelSize = CONFIG.pixelSize;
    this.softness = CONFIG.softness;
    this.outline = CONFIG.outline;
    this.levels = CONFIG.colorLevels;
    this.dither = 1;
    this.enabled = CONFIG.pixelArt;

    this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const quadGeo = new THREE.PlaneGeometry(2, 2);

    this.composite = new THREE.ShaderMaterial({
      uniforms: {
        ...SKY,
        tColor: { value: null },
        tDepth: { value: null },
        uRes: { value: new THREE.Vector2() },
        uNear: { value: 0.1 },
        uFar: { value: 1000 },
        uProjInv: { value: new THREE.Matrix4() },
        uCamWorld: { value: new THREE.Matrix4() },
        uCamPos: { value: new THREE.Vector3() },
        uExposure: { value: 1 },
        uOutline: { value: this.outline },
        uLevels: { value: this.levels },
        uDither: { value: 1 },
        uFogDensity: { value: 0.0021 },
        uFogHeight: { value: 0.03 },
        uFogFar: { value: 250 },
        uFogTint: { value: 0.82 },
      },
      vertexShader: FS_VERT,
      fragmentShader: COMPOSITE_FRAG,
      depthTest: false,
      depthWrite: false,
    });
    this.upscale = new THREE.ShaderMaterial({
      uniforms: {
        tLow: { value: null },
        uLowRes: { value: new THREE.Vector2() },
        uSoft: { value: this.softness },
        uVignette: { value: 0.55 },
      },
      vertexShader: FS_VERT,
      fragmentShader: UPSCALE_FRAG,
      depthTest: false,
      depthWrite: false,
    });
    this.compositeQuad = new THREE.Mesh(quadGeo, this.composite);
    this.upscaleQuad = new THREE.Mesh(quadGeo, this.upscale);
    this.compositeQuad.frustumCulled = false;
    this.upscaleQuad.frustumCulled = false;
    this.lowW = 0;
    this.lowH = 0;
  }

  // Screen size in device pixels.
  setSize(w, h) {
    this.screenW = w;
    this.screenH = h;
    const ps = this.currentPixelSize();
    const lw = Math.max(64, Math.round(w / ps));
    const lh = Math.max(36, Math.round(h / ps));
    if (lw === this.lowW && lh === this.lowH) return;
    this.lowW = lw;
    this.lowH = lh;
    if (this.rtScene) {
      this.rtScene.depthTexture.dispose();
      this.rtScene.dispose();
      this.rtLow.dispose();
    }
    this.rtScene = new THREE.WebGLRenderTarget(lw, lh, {
      type: THREE.HalfFloatType,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: true,
      depthTexture: new THREE.DepthTexture(lw, lh, THREE.UnsignedIntType),
    });
    this.rtLow = new THREE.WebGLRenderTarget(lw, lh, {
      type: THREE.UnsignedByteType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
    });
    this.composite.uniforms.uRes.value.set(lw, lh);
    this.upscale.uniforms.uLowRes.value.set(lw, lh);
  }

  currentPixelSize() {
    if (!this.enabled) return 1;
    if (this.pixelSize > 0) return this.pixelSize;
    // Aim for ~pixelTargetHeight art-pixel lines; in portrait, keep enough columns too.
    const t = CONFIG.pixelTargetHeight;
    return Math.max(1, Math.min(this.screenH / t, this.screenW / (t * 0.9)));
  }

  setPixelSize(ps) {
    this.pixelSize = ps;
    this.lowW = 0;
    this.setSize(this.screenW, this.screenH);
  }

  render(scene, camera, exposure) {
    const r = this.renderer;
    const u = this.composite.uniforms;
    u.tColor.value = this.rtScene.texture;
    u.tDepth.value = this.rtScene.depthTexture;
    u.uNear.value = camera.near;
    u.uFar.value = camera.far;
    u.uProjInv.value.copy(camera.projectionMatrixInverse);
    u.uCamWorld.value.copy(camera.matrixWorld);
    u.uCamPos.value.copy(camera.position);
    u.uExposure.value = exposure;
    u.uOutline.value = this.outline;
    u.uLevels.value = this.levels;
    u.uDither.value = this.dither;
    u.uFogFar.value = (CONFIG.viewRadius - 0.15) * CONFIG.chunkSize;
    this.upscale.uniforms.uSoft.value = this.enabled ? this.softness : 1;
    this.upscale.uniforms.tLow.value = this.rtLow.texture;

    r.setRenderTarget(this.rtScene);
    r.clear();
    r.render(scene, camera);

    r.setRenderTarget(this.rtLow);
    r.render(this.compositeQuad, this.quadCam);

    r.setRenderTarget(null);
    r.render(this.upscaleQuad, this.quadCam);
  }
}
