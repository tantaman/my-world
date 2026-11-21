import * as THREE from 'three';
import { NOISE_GLSL, WORLD_GLSL, WORLD_NOISE_GLSL, GROUND_GLSL, wave } from '../render/glsl.js';
import { SHARED, LAND, UNDER } from '../render/uniforms.js';
import { CUTS, CUT_GLSL, SHRINK, RIM } from './cuts.js';
import { SEA } from './sea.js';

// A shader here that needs to know where in the world something is asks
// worldXZ() (render/glsl.js), never modelMatrix alone: while a frame is drawn
// the scene sits round an origin near the camera (render/origin.js), so
// modelMatrix gives a *drawn* position, good for distances and for nothing
// that should stay put on the ground.

// ── Terrain ────────────────────────────────────────────────────────────────
// The ground colour is computed per pixel from where it is in the world:
// meadow grass, leaf litter and moss under the trees, packed dirt on the
// paths, bare rock on steep slopes, and, on a land with high ground, thin
// turf and stones above the trees and snow on the tops. At low resolution
// this reads as
// hand-placed pixel texture.
// Under water it turns to silt, pebbles and cobbles, darkening (reds first)
// with depth, with the light netted over it by the ripples, and a damp band
// and a little beach along the shore. By the sea the beach is sand, and so is
// the seabed, in ripples, with rock where it's steep. Where the ground is cut
// away for something else to stand in for it (a cave's mouth:
// world/cuts.js), it isn't drawn, and round the hole it is bare rock.
// With the camera under water, the post-process does the darkening (for
// everything down there, not just the ground), and the net of light reaches
// further down.
export function createTerrainMaterial() {
  const mat = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0 });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = SHARED.uTime;
    shader.uniforms.uOrigin = SHARED.uOrigin;
    Object.assign(shader.uniforms, LAND);
    Object.assign(shader.uniforms, CUTS);
    shader.uniforms.uSea = UNDER.uSea;
    shader.uniforms.uUnder = UNDER.uUnder;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute vec2 aGround;
        attribute vec2 aWater; // water level, region (1 where water may stand)
        attribute vec2 aHigh; // how far above the trees, snow (0..1 each)
        attribute vec4 aLand; // what a real place's ground is made of, and whose it is (zero in the forest: see groundColor)
        varying vec2 vGround;
        varying vec2 vWater;
        varying vec2 vHigh;
        varying vec3 vLand;
        flat varying float vCountry;
        varying vec3 vWorldPos;
        varying vec3 vWorldNormal;`,
      )
      .replace(
        '#include <fog_vertex>',
        `#include <fog_vertex>
        vGround = aGround;
        vWater = aWater;
        vHigh = aHigh;
        vLand = aLand.xyz;
        vCountry = aLand.w;
        vWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vWorldNormal = normalize(mat3(modelMatrix) * objectNormal);`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec2 vGround;
        varying vec2 vWater;
        varying vec2 vHigh;
        varying vec3 vLand;
        flat varying float vCountry;
        varying vec3 vWorldPos;
        varying vec3 vWorldNormal;
        uniform float uTime;
        uniform float uSea;
        uniform float uUnder;
        ${NOISE_GLSL}
        ${WORLD_GLSL}
        ${WORLD_NOISE_GLSL}
        ${GROUND_GLSL}
        // Above the trees: thin, tawny turf among stones. Snow on top of that
        // where it lies, in drifts, but not on the cliffs.
        vec3 highGround(vec3 col, vec2 wp, vec2 high, float slope) {
          if (high.x + high.y < 0.001) return col;
          float n1 = wnoise(wp, 0.45, vec2(21.0));
          float n2 = wnoise(wp, 2.3, vec2(-8.0));
          float n3 = wnoise(wp, 0.12, vec2(-3.0));
          float gentle = 1.0 - smoothstep(0.3, 0.45, slope + (n1 - 0.5) * 0.12);
          vec3 turf = mix(vec3(0.085, 0.105, 0.04), vec3(0.15, 0.135, 0.075), smoothstep(0.35, 0.75, n1));
          vec3 stone = vec3(0.17, 0.165, 0.15) * (0.8 + 0.4 * n2);
          turf = mix(turf, stone, smoothstep(0.55, 0.8, n2 + (1.0 - n3) * 0.15) * 0.85);
          col = mix(col, turf, clamp(high.x * 1.3 - 0.15 + (n3 - 0.5) * 0.5, 0.0, 1.0) * gentle);
          float lie = clamp(high.y * 1.6 - 0.3 + (n3 - 0.5) * 0.9 + (n1 - 0.5) * 0.25, 0.0, 1.0);
          lie *= 1.0 - smoothstep(0.26, 0.4, slope + (n2 - 0.5) * 0.08);
          vec3 snow = vec3(0.6, 0.62, 0.66) * (0.93 + 0.1 * n2);
          return mix(col, snow, lie);
        }
        ${CUT_GLSL}
        // Round stones, about "many" to the metre and one at most to a cell:
        // how far into the nearest one wp is (0 at its middle, 1 at its
        // edge), and a number of its own.
        float pebble(vec2 wp, float many, float size, out float id) {
          float m = cellsIn(many);
          vec2 p = wp * (m / PERIOD);
          vec2 c = floor(p);
          vec2 f = fract(p);
          float best = 9.0;
          id = 0.0;
          for (int j = -1; j <= 1; j++) {
            for (int i = -1; i <= 1; i++) {
              vec2 o = vec2(float(i), float(j));
              vec2 k = wrapCell(c + o, m);
              vec2 at = o + 0.2 + 0.6 * vec2(hash12(k), hash12(k + 17.3));
              vec2 d = (f - at) / (size * (0.7 + 0.5 * hash12(k + 5.1)));
              // a little longer one way than the other, like a worn stone
              float a = hash12(k + 9.7) * 6.2832;
              d = mat2(cos(a), sin(a), -sin(a), cos(a)) * d * vec2(1.0, 1.35);
              float r = length(d);
              if (r < best) {
                best = r;
                id = hash12(k + 3.3);
              }
            }
          }
          return best;
        }
        // Light gathered into a moving net by the ripples overhead.
        float causticAt(vec2 wp, float t) {
          float m = cellsIn(1.3);
          float m2 = cellsIn(1.3 * 2.1);
          vec2 q = wp * (m / PERIOD) + vec2(wnoise(wp, 0.6, vec2(t * 0.21)), wnoise(wp, 0.6, vec2(4.0 - t * 0.17))) * 1.4;
          float n = tnoise(q, m) * 0.6 + tnoise(q * (m2 / m) + 7.0, m2) * 0.4;
          return pow(1.0 - abs(n * 2.0 - 1.0), 8.0);
        }`,
      )
      .replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
        float cutF = groundCut(vWorldPos);
        if (cutF < -${SHRINK.toFixed(3)}) discard;`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec2 wp = worldXZ(vWorldPos);
        diffuseColor.rgb = groundColor(wp, vWorldPos.y, vGround.x, vGround.y, 1.0 - vWorldNormal.y, vLand, vCountry);
        // by the sea: a beach of pale sand, up from the waterline
        float seaY = vWorldPos.y - uSea;
        bool seaWater = uSea > -1000.0 && abs(vWater.x - uSea) < 0.05; // the water here is the sea's
        bool bySea = seaY < ${(SEA.sand + 1).toFixed(1)} && seaY > -400.0 && (seaWater || vWater.y < 0.01);
        if (bySea) {
          float s1 = wnoise(wp, 0.5);
          float s2 = wnoise(wp, 3.7, vec2(11.0));
          vec3 sand = mix(vec3(0.36, 0.31, 0.22), vec3(0.3, 0.26, 0.19), smoothstep(0.3, 0.75, s2)) * (0.9 + 0.2 * s1);
          float onSand = 1.0 - smoothstep(${(SEA.sand * 0.75).toFixed(2)}, ${(SEA.sand * 1.2).toFixed(2)}, seaY + (s1 - 0.5) * 0.8);
          onSand *= 1.0 - smoothstep(0.42, 0.6, 1.0 - vWorldNormal.y); // not on a cliff
          diffuseColor.rgb = mix(diffuseColor.rgb, sand, onSand);
        }
        // high ground, and snow where it lies (over a beach too, in winter)
        diffuseColor.rgb = highGround(diffuseColor.rgb, wp, vHigh, 1.0 - vWorldNormal.y);
        if (cutF < ${RIM.toFixed(3)} + 1.0) {
          // broken rock round a hole in the ground, ragged at its edge
          float rn = wnoise(wp, 1.3, vec2(vWorldPos.y)) * 0.65 + wnoise(wp, 4.7) * 0.35;
          float rim = cutRim(cutF + (rn - 0.5) * 2.2);
          vec3 stone = vec3(0.15, 0.14, 0.125) * (0.65 + 0.6 * wnoise(wp, 3.1, vec2(-vWorldPos.y * 2.0)));
          stone = mix(stone, vec3(0.06, 0.1, 0.03), smoothstep(0.55, 0.8, wnoise(wp, 0.9)) * 0.6);
          diffuseColor.rgb = mix(diffuseColor.rgb, stone, rim);
        }
        if (vWater.y > 0.01) {
          float wd = vWater.x - vWorldPos.y; // depth under the water surface
          float n1 = wnoise(wp, 0.7);
          float n2 = wnoise(wp, 2.9, vec2(5.0));
          // a beach of sand and gravel just above the water, damp at the edge
          vec3 sand = mix(vec3(0.19, 0.16, 0.11), vec3(0.15, 0.135, 0.11), smoothstep(0.35, 0.7, n2));
          float beach = (1.0 - smoothstep(0.08, 0.3 + 0.35 * n1, -wd)) * vWater.y;
          if (!seaWater) diffuseColor.rgb = mix(diffuseColor.rgb, sand, beach * 0.85);
          diffuseColor.rgb *= 1.0 - 0.4 * (1.0 - smoothstep(0.0, 0.1 + 0.08 * n2, -wd)) * vWater.y;
          if (wd > 0.0) {
            // silt, pebbles and cobbles, rounded so they catch the light on
            // top, and the light dappled by the ripples overhead
            vec3 silt = vec3(0.11, 0.095, 0.065) * (0.8 + 0.4 * n1);
            vec3 bed = silt;
            float cid;
            float cob = pebble(wp, 1.4, 0.55, cid);
            float isCob = step(0.45, fract(cid * 3.7)); // not every cell has one
            vec3 cobC = mix(vec3(0.15, 0.145, 0.13), vec3(0.19, 0.16, 0.11), cid) * (0.75 + 0.5 * fract(cid * 7.3));
            bed = mix(bed, cobC * (0.65 + 0.4 * sqrt(max(0.0, 1.0 - cob * cob))), (1.0 - smoothstep(0.82, 1.0, cob)) * isCob);
            float id;
            float peb = pebble(wp, 4.3, 0.42, id);
            vec3 pebC = mix(vec3(0.13, 0.12, 0.10), vec3(0.2, 0.18, 0.14), id) * (0.8 + 0.4 * fract(id * 5.1));
            float onPeb = (1.0 - smoothstep(0.75, 1.0, peb)) * smoothstep(0.25, 0.55, n2) * (1.0 - isCob * step(cob, 0.82));
            bed = mix(bed, pebC * (0.8 + 0.35 * sqrt(max(0.0, 1.0 - peb * peb))), onPeb);
            // a hairline of shadow round each stone where it sits in the silt
            bed *= 1.0 - 0.35 * (smoothstep(0.85, 1.0, cob) - smoothstep(1.0, 1.15, cob)) * isCob;
            if (seaWater) {
              // sand in ripples across the swell, a scatter of shell and
              // weed, and rock where the bed is steep
              // (ripples run one way here, the other way there: two ways,
              // each coming round on the world's period, blended)
              float warp = wnoise(wp, 0.6) * 4.0;
              float ripple = mix(sin(wp.x * ${wave(4.2)} + warp), sin(wp.y * ${wave(4.2)} + warp), smoothstep(0.35, 0.65, wnoise(wp, 0.04)));
              vec3 sea = mix(vec3(0.3, 0.27, 0.2), vec3(0.24, 0.22, 0.17), smoothstep(0.3, 0.7, n1));
              sea *= 0.86 + 0.14 * ripple * smoothstep(1.0, 4.0, wd);
              float shells = cellsIn(3.1);
              sea = mix(sea, vec3(0.42, 0.4, 0.36), step(0.985, hash12(wrapCell(floor(wp * (shells / PERIOD)), shells))) * 0.8);
              sea = mix(sea, vec3(0.06, 0.1, 0.05), smoothstep(0.62, 0.8, wnoise(wp, 0.21, vec2(3.0))) * smoothstep(2.0, 6.0, wd) * 0.7);
              float steep = smoothstep(0.25, 0.45, 1.0 - vWorldNormal.y + (n2 - 0.5) * 0.15);
              bed = mix(sea, mix(cobC, vec3(0.12, 0.12, 0.11), 0.5), max(steep, isCob * (1.0 - smoothstep(0.82, 1.0, cob)) * 0.6));
            }
            float caustic = causticAt(wp, uTime);
            bed *= 1.0 + caustic * mix(0.8 * exp(-wd * 1.5), 1.1 * exp(-wd * 0.11), uUnder);
            diffuseColor.rgb = mix(diffuseColor.rgb, bed, smoothstep(0.0, 0.12, wd));
            // (from below the surface, the post-process does this for everything)
            if (uUnder < 0.5) diffuseColor.rgb *= exp(-wd * vec3(1.15, 0.6, 0.48));
          }
        }`,
      );
  };
  mat.customProgramCacheKey = () => 'terrain-v8';
  return mat;
}

// The terrain as the sun sees it, for shadows: with the cuts cut out of it
// too, or the ground that isn't there would still shade the cave mouth.
export function createTerrainDepthMaterial() {
  const mat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, CUTS);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWorldPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vWorldPos;\n${CUT_GLSL}`)
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif (inCut(vWorldPos)) discard;');
  };
  mat.customProgramCacheKey = () => 'terrain-depth-v1';
  return mat;
}

// ── Vegetation (trees, bushes, ferns, rocks, logs) ─────────────────────────
// Vertex coloured, gently swaying in the wind. Foliage uses "spherical"
// normals baked into the geometry so canopies shade as soft volumes.
// Pass { sway: false } for a tree that's been felled (it shouldn't wave about).
export function createVegetationMaterial({ sway = true } = {}) {
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.92,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = SHARED.uTime;
    shader.uniforms.uWind = sway ? SHARED.uWind : { value: 0 };
    shader.uniforms.uOrigin = SHARED.uOrigin;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute float aSway;
        uniform float uTime;
        uniform float uWind;
        ${WORLD_GLSL}`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        {
          // Where the plant stands in the world sets when the wind reaches
          // it. (An instance is placed from its mesh, a chunk's corner; the
          // wavenumbers come round on the period, so nothing jumps when the
          // drawing origin moves.)
          #ifdef USE_INSTANCING
            vec2 iPos = worldXZ(modelMatrix[3].xyz + instanceMatrix[3].xyz);
          #else
            vec2 iPos = vec2(0.0);
          #endif
          vec2 wdir = normalize(vec2(1.0, 0.45));
          float ph = iPos.x * ${wave(0.041)} + iPos.y * ${wave(0.0185)};
          float gust = 0.55 + 0.45 * sin(uTime * 0.37 + iPos.x * ${wave(0.0287)} + iPos.y * ${wave(0.0129)});
          float bend = sin(uTime * 1.25 + ph + iPos.x * ${wave(0.21)}) * 0.65 + sin(uTime * 2.3 + iPos.y * ${wave(0.37)}) * 0.35;
          vec3 wd = vec3(wdir.x, 0.0, wdir.y) * bend * gust * uWind * aSway;
          // leafy flutter
          wd += vec3(
            sin(uTime * 5.1 + position.y * 2.7 + iPos.x * ${wave(1.0)}),
            sin(uTime * 4.3 + position.x * 3.1) * 0.5,
            cos(uTime * 4.7 + position.z * 2.9 + iPos.y * ${wave(1.0)})
          ) * 0.035 * uWind * step(0.001, aSway) * min(aSway * 4.0, 1.0);
          #ifdef USE_INSTANCING
            mat3 im = mat3(instanceMatrix);
            transformed += (transpose(im) * wd) / max(dot(im[0], im[0]), 1e-4);
          #else
            transformed += wd;
          #endif
        }`,
      );
    // Double sided foliage: keep the baked normal on back faces instead of
    // flipping it, otherwise leaf cards turn black from behind.
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <normal_fragment_begin>',
      `#include <normal_fragment_begin>
      normal = normalize(vNormal);`,
    );
  };
  mat.customProgramCacheKey = () => 'vegetation-v2';
  return mat;
}

// ── Grass ──────────────────────────────────────────────────────────────────
// Real blades near the player. They bend in the wind, part around your feet
// and shrink into the ground at the edge of the grass radius, and into
// nothing where the ground is cut away (world/cuts.js).
export function createGrassMaterial() {
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.95,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = SHARED.uTime;
    shader.uniforms.uWind = SHARED.uWind;
    shader.uniforms.uPlayer = SHARED.uPlayer;
    shader.uniforms.uGrassRadius = SHARED.uGrassRadius;
    shader.uniforms.uOrigin = SHARED.uOrigin;
    Object.assign(shader.uniforms, LAND);
    Object.assign(shader.uniforms, CUTS);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute vec4 aBlade; // xyz = root (local), w = height fraction
        attribute vec2 aGround; // x = path (-1 = flower), y = forest
        attribute vec2 aLand; // how far it grows in a real place's own country, and which (see groundColor)
        varying vec2 vGround;
        varying float vLand;
        flat varying float vCountry;
        varying vec2 vRootW; // where the root is in the world (worldXZ)
        uniform float uTime;
        uniform float uWind;
        uniform vec3 uPlayer;
        uniform float uGrassRadius;
        ${WORLD_GLSL}
        ${CUT_GLSL}`,
      )
      .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3(0.0, 1.0, 0.0);')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        {
          vec3 root = aBlade.xyz;
          float hf = aBlade.w;
          vec3 wroot = (modelMatrix * vec4(root, 1.0)).xyz; // as drawn, like uPlayer
          vGround = aGround;
          vLand = aLand.x;
          vCountry = aLand.y;
          vRootW = worldXZ(wroot);
          float dist = distance(wroot.xz, uPlayer.xz);
          float fade = 1.0 - smoothstep(uGrassRadius * 0.6, uGrassRadius, dist);
          if (groundCut(wroot + vec3(0.0, 0.05, 0.0)) < ${(RIM * 0.6).toFixed(3)}) fade = 0.0; // bare rock round a hole
          transformed = root + (transformed - root) * fade;

          vec2 wdir = normalize(vec2(1.0, 0.45));
          float w = sin(uTime * 1.9 + vRootW.x * ${wave(0.33)} + vRootW.y * ${wave(0.21)}) * 0.6
                  + sin(uTime * 0.8 + vRootW.x * ${wave(0.07)} - vRootW.y * ${wave(0.05)}) * 0.4;
          float h2 = hf * hf;
          transformed.xz += wdir * (w * 0.5 + 0.35) * 0.16 * uWind * h2;

          vec2 away = wroot.xz - uPlayer.xz;
          float pd = length(away);
          float push = (1.0 - smoothstep(0.25, 1.1, pd)) * hf;
          transformed.xz += (away / max(pd, 1e-3)) * push * 0.42;
          transformed.y -= push * 0.18;
        }`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec2 vGround;
        varying float vLand;
        flat varying float vCountry;
        varying vec2 vRootW;
        ${NOISE_GLSL}
        ${WORLD_GLSL}
        ${WORLD_NOISE_GLSL}
        ${GROUND_GLSL}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        // blades take the colour of the ground they grow from; vertex colour
        // carries root-to-tip shading. Flowers keep their own colour.
        if (vGround.x > -0.5) diffuseColor.rgb *= groundColor(vRootW, 0.0, 0.0, vGround.y * 0.55, 0.0, vec3(0.0, 0.0, vLand), vCountry);`,
      )
      .replace(
        '#include <normal_fragment_begin>',
        `#include <normal_fragment_begin>
        normal = normalize(vNormal);`,
      );
  };
  mat.customProgramCacheKey = () => 'grass-v5';
  return mat;
}
