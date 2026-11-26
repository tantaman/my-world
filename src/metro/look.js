// (fetched the first time the Metro is near: core/lazy.ts) What builds the
// Metro: the materials its pieces are drawn with, and everything that makes
// them (track.js, stations.js, trains.js), handed on from here so that the
// feature asks for one module.
//
// Under the street there's no daylight (space.js): what lights it is its
// own. A station's vault is lit by the lamps in the coves along its foot,
// washing light up it, and nothing else; so its materials take none of the
// scene's light, and the light the coves put on each face is worked out as
// it's built and carried in its colour (stations.js), the material giving
// that off as `own` says. A train's inside is lit by its own lamps the same
// way. A tunnel gives off a little of its own and takes the scene's too,
// for the light that spills from a train's windows onto its walls
// (index.ts: the light sources). Faces look one way (inwards), where
// they're made to; what's built of boxes (platforms, escalators) looks both.
//
// A platform's floor is the Metro's red-brown hexagonal tile, and its edge
// pale granite: patterns drawn on the building material (build/surfaces.js)
// from where each pixel is on its face.

import * as THREE from 'three';
import { createBuildingMaterial } from '../build/surfaces.js';

export { buildPiece, piecesOf, PIECE } from './track.js';
export { buildLevel, buildVault, buildEntrance, ENTRANCE } from './stations.js';
export { MetroTrain, TrainKit, SEATS, CAR } from './trains.js';

// how much of its colour each gives off as light of its own, and how much
// of the scene's light it takes as well (1: all of it, as anything does)
const LIT = {
  vault: { own: 1.1, take: 0 }, // (its colour carries the coves' light)
  solid: { own: 1.0, take: 0 }, // what stands under the vault (likewise)
  tube: { own: 0.07, take: 1 },
  car: { own: 0.4, take: 0 }, // (its colour carries how lit each face is: trains.js)
};

// a sign's colour under the street (its texture taken by it)
const SIGN_UNDER = 0x8a8a8a;
// m: a hexagonal tile of the platforms, across its flats
const HEX = 0.2;
// m: the grout between them
const GROUT = 0.01;

// The building material (build/surfaces.js), giving off `own` of its own
// colour as light and taking `take` of the scene's. `pattern`: GLSL run
// after the building material has worked out the surface's colour (`col`,
// in the face's own metres `uv`, a pixel `fw` across), to draw over it.
function litMaterial({ own, take }, side, pattern = '', key = '') {
  const mat = createBuildingMaterial({ side });
  const inner = mat.onBeforeCompile;
  const lit = { value: own };
  const takes = { value: take };
  mat.onBeforeCompile = (shader, renderer) => {
    inner.call(mat, shader, renderer);
    shader.uniforms.uLit = lit;
    shader.uniforms.uTake = takes;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uLit;\nuniform float uTake;')
      .replace('#include <roughnessmap_fragment>', `${pattern}\n#include <roughnessmap_fragment>`)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * uLit;')
      .replace(
        '#include <aomap_fragment>',
        `#include <aomap_fragment>
        reflectedLight.directDiffuse *= uTake;
        reflectedLight.indirectDiffuse *= uTake;
        reflectedLight.directSpecular *= uTake;
        reflectedLight.indirectSpecular *= uTake;`,
      );
  };
  mat.customProgramCacheKey = () => `metro-lit-v2${key}`;
  mat.userData.lit = lit;
  mat.userData.take = takes;
  return mat;
}

// Hexagonal tiles, the flats across x: (the tile's middle, how far in from
// its edge, in tiles). The grid's rows are kept a whole number to the metre
// apart so the pattern is the same wherever a face starts from.
const HEX_GLSL = /* glsl */ `
vec3 hexTile(vec2 p) {
  const vec2 r = vec2(1.0, 1.7320508);
  vec2 h = r * 0.5;
  vec2 a = mod(p, r) - h;
  vec2 b = mod(p - h, r) - h;
  vec2 g = dot(a, a) < dot(b, b) ? a : b;
  vec2 q = abs(g);
  float d = max(q.x, dot(q, vec2(0.5, 0.8660254)));
  return vec3(p - g, 0.5 - d);
}`;

const TILE_GLSL = /* glsl */ `
{
  vec3 hx = hexTile(uv / ${HEX.toFixed(3)});
  float one = hash12(hx.xy * 0.37 + 11.0);
  float show = shows(${HEX.toFixed(3)}, fw);
  // each tile a little its own colour, a few darker, fired harder
  col *= mix(1.0, (0.8 + 0.34 * one) * (one > 0.9 ? 0.78 : 1.0), show);
  // the grout, dark and a little sunk
  float grout = (1.0 - smoothstep(${(GROUT / HEX / 2).toFixed(4)}, ${(GROUT / HEX).toFixed(4)}, hx.z)) * shows(${(GROUT * 1.5).toFixed(4)}, fw);
  col = mix(col, col * 0.25, grout * 0.85);
  // worn smooth and a little glossy where feet go
  rough = mix(0.55, 0.95, grout);
  diffuseColor.rgb = col;
}`;

const GRANITE_GLSL = /* glsl */ `
{
  // a fine speckle of dark and light grains in the pale stone, honed
  float g = hash12(floor(uv * 260.0)) * shows(0.004, fw);
  float m = vnoise(uv * 9.0) * shows(0.1, fw);
  col *= 0.9 + 0.12 * m + (step(0.9, g) * 0.25 - step(g, 0.12) * 0.3) * shows(0.004, fw);
  rough = 0.6;
  diffuseColor.rgb = col;
}`;

export function makeMaterials(lines) {
  const colours = new Map(lines.map((l) => [l.id, l.colour]));
  const signs = new Map();
  return {
    solid: createBuildingMaterial(),
    vault: litMaterial(LIT.vault, THREE.FrontSide, '', '-vault'),
    vaultSolid: litMaterial(LIT.solid, THREE.DoubleSide, '', '-solid'),
    tube: litMaterial(LIT.tube, THREE.FrontSide, '', '-tube'),
    carInside: litMaterial(LIT.car, THREE.DoubleSide, '', '-car'),
    // a platform's floor and its edge, under the street and over it
    tile: hexMaterial(LIT.solid, '-tile'),
    tileOpen: hexMaterial({ own: 0, take: 1 }, '-tile-open'),
    granite: litMaterial(LIT.solid, THREE.DoubleSide, GRANITE_GLSL, '-granite'),
    graniteOpen: litMaterial({ own: 0, take: 1 }, THREE.DoubleSide, GRANITE_GLSL, '-granite-open'),
    glow: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, side: THREE.DoubleSide }),
    signPlane: new THREE.PlaneGeometry(1, 1),
    colour: (id) => colours.get(id) || '#888888',
    // a sign's material, one for each texture (under the street, where the
    // eye is used to the dark, a little dimmer, as it would be lit there)
    sign(tex, under = false) {
      const key = under ? `${tex.uuid}:under` : tex.uuid;
      let m = signs.get(key);
      if (!m) signs.set(key, (m = new THREE.MeshBasicMaterial({ map: tex, color: under ? SIGN_UNDER : 0xd8d8d8 })));
      return m;
    },
  };
}

// The hexagonal tile: the hex grid's GLSL put in with the building
// material's, and the tile drawn over its colour.
function hexMaterial(lit, key) {
  const mat = litMaterial(lit, THREE.DoubleSide, TILE_GLSL, key);
  const inner = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, renderer) => {
    inner.call(mat, shader, renderer);
    shader.fragmentShader = shader.fragmentShader.replace('void main() {', `${HEX_GLSL}\nvoid main() {`);
  };
  return mat;
}
