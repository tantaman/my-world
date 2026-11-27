// How a cave looks: its rock, what hangs from its roof and stands on its
// floor, glowworms, crystals, and the boulders round its mouth. Built from
// what build.js worked out; one group per cave.
//
// Lighting. Daylight gets into a cave only as far as its mouth: how much
// reaches each vertex was worked out when it was built (aSky), from how far
// along the passages it is. The sky dims its light and the sun's on
// everything once you're inside (Sky.open), so the rock undoes that for
// itself — uSkyFill — and takes only its own share: of the sky's light, aSky;
// of the sun's, all of it in the mouth (where the shadow map does the
// detail) and none past the first bend. What's left to see by deep inside is
// what you bring: the headlamp (lamp.js).
//
// A cave is built round a spot of its own (the corner its rock was meshed
// from): the group is put there, and everything in it is measured from it,
// so no big number goes to the graphics card (render/origin.js). The rock's
// grain is drawn from that same frame, which never moves.

import * as THREE from 'three';
import { SHARED } from '../render/uniforms.js';
import { NOISE_GLSL, POINT_GLSL } from '../render/glsl.js';
import { createShadowDepthMaterial } from '../world/materials.js';

const GLOW = 0.008; // m: a glowworm's light

// Shared by every cave: 1 / Sky.open, set each frame (see index.js).
export const ROCK = { uSkyFill: { value: 1 } };

// The rock. With { decor: true }, for things on it (stalactites): instanced,
// with aSky per instance and nothing to cut off at the hillside. vRock is
// where in the cave a point is, from the cave's own spot (the group's: see
// caveObject), which is level with the world's zero, so its y is a height.
export function createRockMaterial({ decor = false } = {}) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: decor ? 0.6 : 0.88, metalness: 0 });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uSkyFill = ROCK.uSkyFill;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute float aSky;
        varying float vSky;
        varying vec3 vRock;
        ${decor ? '' : 'attribute float aGround; varying float vGround;'}`,
      )
      .replace(
        '#include <fog_vertex>',
        `#include <fog_vertex>
        vSky = aSky;
        ${decor ? '' : 'vGround = aGround;'}
        #ifdef USE_INSTANCING
          vRock = (instanceMatrix * vec4(transformed, 1.0)).xyz;
        #else
          vRock = transformed;
        #endif`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uSkyFill;
        varying float vSky;
        varying vec3 vRock;
        ${decor ? '' : 'varying float vGround;'}
        ${NOISE_GLSL}`,
      )
      .replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
        ${decor ? '' : 'if (vRock.y > vGround + 0.04) discard; // out on the hillside: the cutting is open to the sky'}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        // grain finer than the mesh: pits, crystals glinting in the stone
        float g = vnoise(vRock.xz * 5.1 + vRock.y * 3.7) * 0.6 + vnoise(vRock.zy * 11.3 - vRock.x * 2.1) * 0.4;
        diffuseColor.rgb *= 0.8 + 0.4 * g;`,
      )
      .replace(
        '#include <lights_fragment_begin>',
        THREE.ShaderChunk.lights_fragment_begin.replace(
          'getDirectionalLightInfo( directionalLight, directLight );',
          `getDirectionalLightInfo( directionalLight, directLight );
          directLight.color *= uSkyFill * smoothstep(0.03, 0.45, vSky);`,
        ),
      )
      .replace(
        '#include <lights_fragment_maps>',
        `irradiance *= max(vSky, 0.004) * uSkyFill;
        #include <lights_fragment_maps>
        #if defined( RE_IndirectSpecular )
        radiance *= max(vSky, 0.004) * uSkyFill; // (the sky it mirrors, render/skyLight.ts)
        #endif`,
      );
  };
  mat.customProgramCacheKey = () => (decor ? 'cave-decor-v5' : 'cave-rock-v5');
  return mat;
}

// The rock as the sun sees it, for shadows: cut off where it pokes out of the
// hillside, like the rock itself, or the cutting would sit in its shadow.
export function createRockDepthMaterial() {
  const mat = createShadowDepthMaterial();
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aGround;\nvarying float vGround;\nvarying float vRockY;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGround = aGround;\nvRockY = (modelMatrix * vec4(transformed, 1.0)).y;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vGround;\nvarying float vRockY;')
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif (vRockY > vGround + 0.04) discard;');
  };
  mat.customProgramCacheKey = () => 'cave-rock-depth-v1';
  return mat;
}

// Crystals: lit like stone and glowing from inside, each with a slow pulse of
// its own. Their colour is the instance colour.
export function createCrystalMaterial() {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.25, metalness: 0.1, emissive: 0xffffff });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = SHARED.uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vPulse;\nuniform float uTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 ip = instanceMatrix[3].xyz;
        #else
          vec3 ip = vec3(0.0);
        #endif
        vPulse = 0.75 + 0.25 * sin(uTime * 0.7 + ip.x * 3.1 + ip.z * 1.7) + position.y * 0.5;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vPulse;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance = vColor.rgb * 0.55 * vPulse;');
  };
  mat.customProgramCacheKey = () => 'cave-crystal-v1';
  return mat;
}

// Glowworms: specks of blue-green, brightening and fading slowly.
// Only dim things: you see them best with your lamp off.
export function createGlowMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: SHARED.uTime, uLines: SHARED.uLines },
    vertexShader: /* glsl */ `
      ${POINT_GLSL}
      attribute float aPhase;
      uniform float uTime;
      varying float vGlow;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        float dist = -mv.z;
        vGlow = (0.55 + 0.45 * sin(uTime * (0.25 + fract(aPhase * 7.3) * 0.3) + aPhase)) * (1.0 - smoothstep(18.0, 34.0, dist));
        gl_PointSize = pointPx(${GLOW}, dist);
      }`,
    fragmentShader: /* glsl */ `
      varying float vGlow;
      void main() {
        if (vGlow < 0.02) discard;
        gl_FragColor = vec4(vec3(0.2, 0.85, 0.75) * vGlow, 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

// ── Shapes ──────────────────────────────────────────────────────────────────
// A dripstone: base at y = 0, tip at y = -1 (hanging) or +1 (standing), a
// little crooked and ringed, wet and pale at the tip.
export function makeDripstone(hanging) {
  const geo = new THREE.CylinderGeometry(hanging ? 0.04 : 0.32, 1, 1, 7, 5, false);
  geo.translate(0, 0.5, 0);
  if (hanging) geo.scale(1, -1, 1);
  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const t = Math.abs(y); // 0 at the base, 1 at the tip
    const ring = 1 + 0.08 * Math.sin(t * 19 + x * 3);
    const lean = t * t * 0.18;
    pos.setXYZ(i, x * ring + lean, y, z * ring);
    const pale = 0.6 + 0.4 * t;
    col[i * 3] = 0.24 * pale + 0.04;
    col[i * 3 + 1] = 0.22 * pale + 0.035;
    col[i * 3 + 2] = 0.185 * pale + 0.03;
  }
  if (hanging) geo.index.array.reverse(); // the flip turned it inside out
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  return geo;
}

// A crystal: a six-sided prism with a pointed end, base at y = 0, tip at y = 1.
export function makeCrystal() {
  const prism = new THREE.CylinderGeometry(1, 0.85, 0.72, 6, 1, false);
  prism.translate(0, 0.36, 0);
  const tip = new THREE.ConeGeometry(1, 0.28, 6, 1, true);
  tip.translate(0, 0.86, 0);
  const geo = mergeSimple([prism.toNonIndexed(), tip.toNonIndexed()]);
  const n = geo.attributes.position.count;
  const col = new Float32Array(n * 3).fill(1);
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals(); // flat facets
  return geo;
}

function mergeSimple(list) {
  let n = 0;
  for (const g of list) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3);
  let o = 0;
  for (const g of list) {
    pos.set(g.attributes.position.array, o);
    o += g.attributes.position.array.length;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  return geo;
}

// ── One cave ────────────────────────────────────────────────────────────────
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

// The materials and shapes every cave shares.
export function caveKit(models, vegetation) {
  return {
    rock: createRockMaterial(),
    rockDepth: createRockDepthMaterial(),
    decor: createRockMaterial({ decor: true }),
    crystal: createCrystalMaterial(),
    glow: createGlowMaterial(),
    hang: makeDripstone(true),
    stand: makeDripstone(false),
    crystalGeo: makeCrystal(),
    boulder: models.rock.lod0,
    vegetation,
  };
}

// Everything to draw for a built cave (build.js's result), in one group, put
// at the cave's own spot (mesh.origin) with all of it measured from there.
export function caveObject(kit, built) {
  const group = new THREE.Group();
  group.name = built.cave.id;
  const { mesh, decor, rocks } = built;
  const [ox, oy, oz] = mesh.origin;
  group.position.set(ox, oy, oz);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(mesh.position, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(mesh.normal, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(mesh.color, 3));
  geo.setAttribute('aSky', new THREE.BufferAttribute(mesh.sky, 1));
  geo.setAttribute('aGround', new THREE.BufferAttribute(mesh.ground, 1));
  geo.setIndex(new THREE.BufferAttribute(mesh.index, 1));
  geo.computeBoundingSphere();
  const rock = new THREE.Mesh(geo, kit.rock);
  rock.customDepthMaterial = kit.rockDepth;
  rock.castShadow = true;
  rock.receiveShadow = true;
  rock.renderOrder = 1; // after the land, which hides most of it
  group.add(rock);

  const drip = (list, shape, hanging) => {
    const n = list.length / 6;
    if (!n) return;
    // they grow only out of the daylight: next to no skylight on them
    const g = shape.clone();
    g.setAttribute('aSky', new THREE.InstancedBufferAttribute(new Float32Array(n).fill(0.02), 1));
    const im = new THREE.InstancedMesh(g, kit.decor, n);
    for (let i = 0; i < n; i++) {
      const o = i * 6;
      _p.set(list[o] - ox, list[o + 1] - oy, list[o + 2] - oz);
      _q.setFromAxisAngle(_s.set(0, 1, 0), list[o + 5] * 6.283);
      _s.set(list[o + 4], list[o + 3], list[o + 4]);
      im.setMatrixAt(i, _m.compose(_p, _q, _s));
      const v = 0.85 + list[o + 5] * 0.3;
      im.setColorAt(i, _c.setRGB(v, v * (0.97 + list[o + 5] * 0.04), v * 0.94));
    }
    im.castShadow = !hanging;
    im.receiveShadow = true;
    im.computeBoundingSphere();
    group.add(im);
  };
  drip(decor.hang, kit.hang, true);
  drip(decor.stand, kit.stand, false);

  if (decor.crystals.length) {
    const n = decor.crystals.length / 8;
    const im = new THREE.InstancedMesh(kit.crystalGeo, kit.crystal, n);
    for (let i = 0; i < n; i++) {
      const o = i * 8;
      const [x, y, z, len, rad, yaw, out, hue] = decor.crystals.subarray(o, o + 8);
      _p.set(x - ox, y - oy, z - oz);
      // turned about its own length, then leant out from the wall
      _e.set(Math.cos(out) * 0.55, yaw, -Math.sin(out) * 0.55, 'XZY');
      _q.setFromEuler(_e);
      _s.set(rad, len, rad);
      im.setMatrixAt(i, _m.compose(_p, _q, _s));
      im.setColorAt(i, _c.setHSL(0.72 + (hue - 0.5) * 0.35, 0.75, 0.62));
    }
    im.computeBoundingSphere();
    group.add(im);
  }

  if (decor.glow.length) {
    const n = decor.glow.length / 4;
    const p = new Float32Array(n * 3);
    const ph = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const o = i * 4;
      p[i * 3] = decor.glow[o] - ox;
      p[i * 3 + 1] = decor.glow[o + 1] - oy;
      p[i * 3 + 2] = decor.glow[o + 2] - oz;
      ph[i] = decor.glow[o + 3];
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    g.setAttribute('aPhase', new THREE.BufferAttribute(ph, 1));
    g.computeBoundingSphere();
    group.add(new THREE.Points(g, kit.glow));
  }

  if (rocks.length) {
    const im = new THREE.InstancedMesh(kit.boulder, kit.vegetation, rocks.length);
    rocks.forEach((r, i) => {
      _p.set(r.x - ox, r.y - oy, r.z - oz);
      _q.setFromAxisAngle(_s.set(0, 1, 0), r.yaw);
      _s.set(r.s, r.sy, r.s * 1.1);
      im.setMatrixAt(i, _m.compose(_p, _q, _s));
      const v = 0.75 + (r.yaw / 6.283) * 0.35;
      im.setColorAt(i, _c.setRGB(v, v * 0.98, v * 0.94));
    });
    im.castShadow = true;
    im.receiveShadow = true;
    im.computeBoundingSphere();
    group.add(im);
  }
  return group;
}

// Free what caveObject made (the shared kit stays).
export function disposeCave(group) {
  group.traverse((o) => {
    if (o.isInstancedMesh) {
      if (o.geometry.attributes.aSky) o.geometry.dispose();
      o.dispose();
    } else if (o.isMesh || o.isPoints) o.geometry.dispose();
  });
}
