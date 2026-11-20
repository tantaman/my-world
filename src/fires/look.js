// How a fire looks while it burns: flames, glowing charcoal, smoke and sparks.
//
// Flames are a billboard drawn by a shader. The embers and the charred wood
// glow through cracks in the charcoal. Smoke and sparks come from one shared
// pool for every fire, so a dozen fires cost no more draw calls than one.

import * as THREE from 'three';
import { SHARED } from '../render/uniforms.js';
import { NOISE_GLSL } from '../render/glsl.js';

// Which way smoke drifts and flames lean, as the trees sway.
export const WIND = new THREE.Vector2(1, 0.45).normalize();

const smooth = (t) => t * t * (3 - 2 * t);

// A wavering 0..1 that never quite repeats, different for every fire.
export function flicker(t, seed) {
  return 0.5 + 0.22 * Math.sin(t * 13.1 + seed) + 0.17 * Math.sin(t * 7.3 + seed * 1.7) + 0.11 * Math.sin(t * 23.9 + seed * 0.3);
}

// ── Materials ───────────────────────────────────────────────────────────────
// Charcoal: lit like anything else, and glowing from inside through a mesh of
// cracks that crawl as the heat moves. `userData.glow` is set per fire; wood
// glows hardest down in the coals and not at all half a metre up from `base`,
// the floor of the pit.
export function createCoalMaterial(base) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, emissive: 0xff4a12 });
  mat.userData.glow = { value: 0 };
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uGlow = mat.userData.glow;
    shader.uniforms.uBase = { value: base };
    shader.uniforms.uTime = SHARED.uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCoal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCoal = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vCoal;
        uniform float uGlow;
        uniform float uBase;
        uniform float uTime;
        ${NOISE_GLSL}`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        {
          vec2 q = vec2(vCoal.x * 13.0 + vCoal.y * 7.0, vCoal.z * 13.0 - vCoal.y * 9.0);
          float c = vnoise(q + vec2(uTime * 0.21, -uTime * 0.17));
          float cracks = smoothstep(0.42, 0.78, c);
          float pulse = 0.7 + 0.3 * sin(uTime * 2.7 + c * 14.0);
          float low = 1.0 - smoothstep(0.04, 0.42, vCoal.y - uBase);
          totalEmissiveRadiance *= uGlow * low * (0.12 + 2.4 * cracks * pulse);
        }`,
      );
  };
  mat.customProgramCacheKey = () => 'coal-v1';
  return mat;
}

// Flames: a quad that turns about its upright axis to face you, filled with
// noise that rises and licks into tongues. Additive and HDR, so the tone
// mapping turns the hot core yellow-white and leaves the edges orange.
export function createFlameMaterial(seed) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: SHARED.uTime, uWind: SHARED.uWind, uHeat: { value: 0 }, uSeed: { value: (seed % 97) * 0.37 } },
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform float uWind;
      uniform float uSeed;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec3 c = modelMatrix[3].xyz;
        float sx = length(modelMatrix[0].xyz);
        float sy = length(modelMatrix[1].xyz);
        vec2 toCam = cameraPosition.xz - c.xz;
        toCam /= max(length(toCam), 1e-4);
        vec3 right = vec3(toCam.y, 0.0, -toCam.x);
        // the top of the flame leans downwind and wavers
        float lean = uv.y * uv.y * (0.12 * uWind + 0.07 * sin(uTime * 2.1 + uSeed));
        vec3 wp = c + right * position.x * sx + vec3(0.0, position.y * sy, 0.0) + vec3(${WIND.x.toFixed(3)}, 0.0, ${WIND.y.toFixed(3)}) * lean * sy;
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uHeat;
      uniform float uSeed;
      varying vec2 vUv;
      ${NOISE_GLSL}
      void main() {
        float y = vUv.y;
        float n1 = fbm4(vec2(vUv.x * 3.1 + uSeed, y * 2.2 - uTime * 2.4));
        float n2 = vnoise(vec2(vUv.x * 7.0 - uSeed, y * 5.5 - uTime * 4.3));
        float x = (vUv.x - 0.5) * 2.0 + (n1 - 0.5) * 0.7 * y;
        // a teardrop that breaks up into licking tongues towards the top
        float w = mix(0.95, 0.12, pow(y, 0.85));
        float body = 1.0 - smoothstep(0.35, 1.0, abs(x) / w);
        float top = 1.0 - smoothstep(0.25, 0.95, y + (n1 - 0.5) * 0.75 + (n2 - 0.5) * 0.3);
        float base = smoothstep(0.0, 0.1, y);
        float f = body * top * base * (0.55 + 0.75 * n2);
        if (f < 0.03) discard;
        vec3 col = mix(vec3(0.85, 0.16, 0.02), vec3(1.0, 0.46, 0.07), smoothstep(0.1, 0.45, f));
        col = mix(col, vec3(1.0, 0.86, 0.5), smoothstep(0.5, 0.9, f));
        gl_FragColor = vec4(col * f * (1.6 + 2.6 * uHeat), 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

// ── Smoke and sparks ────────────────────────────────────────────────────────
// Sparks are single art pixels, like the fireflies; smoke is soft round puffs
// that rise, swell, drift downwind and thin out, and catch the firelight low
// down.
const MAX_SPARKS = 160;
const MAX_PUFFS = 110;

export class FireFx {
  constructor(scene) {
    // sparks
    this.sp = [];
    const spGeo = new THREE.BufferGeometry();
    spGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_SPARKS * 3), 3).setUsage(THREE.DynamicDrawUsage));
    spGeo.setAttribute('aLife', new THREE.BufferAttribute(new Float32Array(MAX_SPARKS), 1).setUsage(THREE.DynamicDrawUsage));
    this.spGeo = spGeo;
    this.sparksMesh = new THREE.Points(
      spGeo,
      new THREE.ShaderMaterial({
        vertexShader: /* glsl */ `
          attribute float aLife;
          varying float vLife;
          void main() {
            vLife = aLife;
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            gl_Position = projectionMatrix * mv;
            gl_PointSize = -mv.z < 7.0 ? 2.0 : 1.0;
          }`,
        fragmentShader: /* glsl */ `
          varying float vLife;
          void main() {
            if (vLife <= 0.0) discard;
            vec3 hot = mix(vec3(3.2, 0.7, 0.12), vec3(5.0, 2.6, 0.7), smoothstep(0.4, 1.0, vLife));
            gl_FragColor = vec4(hot * smoothstep(0.0, 0.35, vLife), 1.0);
          }`,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.sparksMesh.frustumCulled = false;
    scene.add(this.sparksMesh);

    // smoke
    this.pf = [];
    const base = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.setIndex(base.index);
    geo.setAttribute('position', base.attributes.position);
    geo.setAttribute('uv', base.attributes.uv);
    geo.setAttribute('aPuff', new THREE.InstancedBufferAttribute(new Float32Array(MAX_PUFFS * 4), 4).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aLook', new THREE.InstancedBufferAttribute(new Float32Array(MAX_PUFFS * 3), 3).setUsage(THREE.DynamicDrawUsage));
    geo.instanceCount = 0;
    this.pfGeo = geo;
    this.smokeMat = new THREE.ShaderMaterial({
      uniforms: { uAmbient: { value: new THREE.Color(0.5, 0.5, 0.5) }, uTime: SHARED.uTime },
      vertexShader: /* glsl */ `
        attribute vec4 aPuff; // xyz centre, w size
        attribute vec3 aLook; // x opacity, y seed, z firelight
        varying vec2 vUv;
        varying vec3 vLook;
        void main() {
          vUv = uv;
          vLook = aLook;
          vec4 mv = viewMatrix * vec4(aPuff.xyz, 1.0);
          mv.xy += position.xy * aPuff.w;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uAmbient;
        uniform float uTime;
        varying vec2 vUv;
        varying vec3 vLook;
        ${NOISE_GLSL}
        void main() {
          vec2 p = vUv - 0.5;
          float n = vnoise(vUv * 3.5 + vLook.y * 17.0 + vec2(0.0, -uTime * 0.15));
          float d = length(p) * 2.0 + (n - 0.5) * 0.6;
          float a = pow(1.0 - smoothstep(0.0, 1.0, d), 1.6) * vLook.x;
          if (a < 0.01) discard;
          vec3 col = uAmbient * (0.85 + 0.3 * n) + vec3(1.0, 0.42, 0.12) * vLook.z;
          gl_FragColor = vec4(col, a);
        }`,
      transparent: true,
      depthWrite: false,
    });
    this.smokeMesh = new THREE.Mesh(geo, this.smokeMat);
    this.smokeMesh.frustumCulled = false;
    this.smokeMesh.renderOrder = 5; // under the flames, which add their light on top
    scene.add(this.smokeMesh);
  }

  // What a fire gives off this frame, by the state it's in (see fireState).
  emit(f, st, dt) {
    const burning = st.state === 'burning';
    const h = st.heat;
    f.sparkAcc = (f.sparkAcc || 0) + dt * (burning ? 2 + 7 * h : 0.6 * h);
    while (f.sparkAcc >= 1) {
      f.sparkAcc -= 1;
      this._spark(f, burning ? 1 + h : 0.6);
    }
    f.puffAcc = (f.puffAcc || 0) + dt * (burning ? 1.2 + 1.8 * h : 0.25 + 0.9 * h);
    while (f.puffAcc >= 1) {
      f.puffAcc -= 1;
      // out of the flame tips, or off the embers
      this._puff(f, burning ? 0.55 + 0.75 * h : 0.15, burning ? 0.26 + 0.1 * h : 0.2, burning ? 0.45 + 0.8 * h : 0.2, burning ? 0.22 * h : 0.08 * h);
    }
  }

  // A shower of sparks: wood thrown on, a fire lit.
  sparks(f, n, speed) {
    for (let i = 0; i < n; i++) this._spark(f, speed);
  }

  // Earth thrown on a fire: a big pale cloud of steam and ash.
  steam(f) {
    for (let i = 0; i < 18; i++) this._puff(f, 0.15 + Math.random() * 0.3, 0.38, 0.9 + Math.random() * 0.5, 0.05, 1.4);
  }

  _spark(f, speed) {
    if (this.sp.length >= MAX_SPARKS) this.sp.shift();
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * 0.18;
    const life = 0.5 + Math.random() * 1.1;
    this.sp.push({
      x: f.x + Math.cos(a) * r,
      y: f.y + 0.15 + Math.random() * 0.3,
      z: f.z + Math.sin(a) * r,
      vx: (Math.random() - 0.5) * 0.6,
      vy: (1.2 + Math.random() * 1.6) * speed,
      vz: (Math.random() - 0.5) * 0.6,
      life,
      max: life,
    });
  }

  _puff(f, opacity, size, up, warm, spread = 0.12) {
    if (this.pf.length >= MAX_PUFFS) this.pf.shift();
    this.pf.push({
      x: f.x + (Math.random() - 0.5) * spread,
      y: f.y + up,
      z: f.z + (Math.random() - 0.5) * spread,
      vy: 0.45 + Math.random() * 0.35,
      drift: 0.25 + Math.random() * 0.35,
      size,
      grow: 0.18 + Math.random() * 0.14,
      opacity,
      warm,
      seed: Math.random(),
      age: 0,
      life: 5 + Math.random() * 3,
      fy: f.y,
    });
  }

  // sky: the Sky (world/sky.js), whose light the smoke takes its colour from
  update(dt, sky) {
    // nothing in the air, and nothing was last frame either
    if (!this.sp.length && !this.pf.length && this.idle) return;
    this.idle = !this.sp.length && !this.pf.length;
    const wind = SHARED.uWind.value;

    // sparks: hot air carries them up, they wander, cool and wink out
    const sp = this.sp;
    let n = 0;
    const pos = this.spGeo.attributes.position;
    const life = this.spGeo.attributes.aLife;
    for (let i = 0; i < sp.length; i++) {
      const s = sp[i];
      s.life -= dt;
      if (s.life <= 0) continue;
      s.vx += ((Math.random() - 0.5) * 3 + WIND.x * wind * 0.8) * dt;
      s.vz += ((Math.random() - 0.5) * 3 + WIND.y * wind * 0.8) * dt;
      s.vy -= 0.6 * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.z += s.vz * dt;
      sp[n++] = s;
    }
    sp.length = n;
    for (let i = 0; i < n; i++) {
      pos.setXYZ(i, sp[i].x, sp[i].y, sp[i].z);
      life.setX(i, sp[i].life / sp[i].max);
    }
    this.spGeo.setDrawRange(0, n);
    pos.needsUpdate = true;
    life.needsUpdate = true;

    // smoke
    const pf = this.pf;
    let m = 0;
    for (let i = 0; i < pf.length; i++) {
      const p = pf[i];
      p.age += dt;
      if (p.age >= p.life) continue;
      const k = p.age / p.life;
      p.y += p.vy * (1 - 0.5 * k) * dt;
      p.x += WIND.x * wind * p.drift * (0.3 + k) * dt;
      p.z += WIND.y * wind * p.drift * (0.3 + k) * dt;
      pf[m++] = p;
    }
    pf.length = m;
    const P = this.pfGeo.attributes.aPuff;
    const L = this.pfGeo.attributes.aLook;
    for (let i = 0; i < m; i++) {
      const p = pf[i];
      const k = p.age / p.life;
      const fade = smooth(Math.min(1, p.age / 0.6)) * (1 - smooth(k));
      P.setXYZW(i, p.x, p.y, p.z, p.size + p.grow * p.age);
      L.setXYZ(i, p.opacity * fade * 0.24, p.seed, p.warm * Math.max(0, 1 - (p.y - p.fy) / 2.2));
    }
    this.pfGeo.instanceCount = m;
    P.needsUpdate = true;
    L.needsUpdate = true;

    // Smoke takes the colour of the light it's in: skylight, and the sun.
    if (sky) {
      const c = this.smokeMat.uniforms.uAmbient.value;
      c.copy(sky.hemi.color).multiplyScalar(sky.hemi.intensity * 0.4);
      const sun = Math.max(0, sky.sunDir.y);
      c.r += sky.sun.color.r * sky.sun.intensity * 0.07 * (0.3 + sun);
      c.g += sky.sun.color.g * sky.sun.intensity * 0.07 * (0.3 + sun);
      c.b += sky.sun.color.b * sky.sun.intensity * 0.07 * (0.3 + sun);
    }
  }
}
