// (fetched the first time the Metro is near: core/lazy.ts) What builds the
// Metro: the materials its pieces are drawn with, and everything that makes
// them (track.js, stations.js, trains.js), handed on from here so that the
// feature asks for one module.
//
// Under the street there's no daylight: what lights it is its own. So the
// materials down there give off the light the station's lamps would put on
// them, as much of their own colour as `lit` says: a station's vault (much:
// the cove lights along its foot light it all), a train's inside (much), a
// tunnel (a little). Their faces look one way (inwards), where they're made
// to; what's built of boxes (platforms, escalators) looks both.

import * as THREE from 'three';
import { createBuildingMaterial } from '../build/surfaces.js';

export { buildPiece, piecesOf, PIECE } from './track.js';
export { buildLevel, buildVault, buildEntrance, ENTRANCE } from './stations.js';
export { MetroTrain, TrainKit, SEATS, CAR } from './trains.js';

const LIT = { vault: 0.62, solid: 0.55, tube: 0.16, car: 0.6 };

// The building material (build/surfaces.js), giving off `strength` of its
// own colour as light.
function litMaterial(strength, side) {
  const mat = createBuildingMaterial({ side });
  const inner = mat.onBeforeCompile;
  const lit = { value: strength };
  mat.onBeforeCompile = (shader, renderer) => {
    inner.call(mat, shader, renderer);
    shader.uniforms.uLit = lit;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uLit;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * uLit;');
  };
  mat.customProgramCacheKey = () => 'metro-lit-v1';
  mat.userData.lit = lit;
  return mat;
}

export function makeMaterials(lines) {
  const colours = new Map(lines.map((l) => [l.id, l.colour]));
  const signs = new Map();
  return {
    solid: createBuildingMaterial(),
    vault: litMaterial(LIT.vault, THREE.FrontSide),
    vaultSolid: litMaterial(LIT.solid, THREE.DoubleSide),
    tube: litMaterial(LIT.tube, THREE.FrontSide),
    carInside: litMaterial(LIT.car, THREE.DoubleSide),
    glow: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, side: THREE.DoubleSide }),
    signPlane: new THREE.PlaneGeometry(1, 1),
    colour: (id) => colours.get(id) || '#888888',
    // a sign's material, one for each texture
    sign(tex) {
      let m = signs.get(tex);
      if (!m) signs.set(tex, (m = new THREE.MeshBasicMaterial({ map: tex, color: 0xd8d8d8 })));
      return m;
    },
  };
}
