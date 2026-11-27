// The sky as light (src/render/skyLight.ts): the light from all round, as
// spherical harmonics, worked out from the sky as the shader draws it.

import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { skyHarmonics } from '../src/render/skyLight.ts';
import { photo, fitMetres } from '../src/render/photos.ts';
import { PERIOD } from '../src/render/glsl.js';

type RGB = [number, number, number];

// An afternoon's sky (world/sky.js's colours at about 20°), the sun low in +x.
const afternoon = {
  zen: [0.08, 0.21, 0.6] as RGB,
  hor: [0.62, 0.64, 0.64] as RGB,
  sunColor: [1.2, 0.95, 0.7] as RGB,
  sunDir: new THREE.Vector3(1, 0.35, 0).normalize(),
};
// what the hemisphere light gives from up and from down (its colour times its intensity)
const UP: RGB = [0.67, 0.77, 0.96];
const DOWN: RGB = [0.18, 0.18, 0.11];

const facing = (sh: THREE.SphericalHarmonics3, x: number, y: number, z: number): RGB => {
  const e = sh.getIrradianceAt(new THREE.Vector3(x, y, z).normalize(), new THREE.Vector3());
  return [e.x, e.y, e.z];
};
const near = (got: RGB, want: RGB, tol: number, what: string) =>
  got.forEach((g, k) => assert.ok(Math.abs(g - want[k]) <= tol * Math.max(want[k], 0.01), `${what}: ${got.map((v) => v.toFixed(3))} not ${want}`));
const luma = (c: RGB) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

test('the light from straight up, straight down and the side is the hemisphere light’s, as it was set', () => {
  const { sh } = skyHarmonics(afternoon, UP, DOWN);
  near(facing(sh, 0, 1, 0), UP, 0.01, 'from above');
  near(facing(sh, 0, -1, 0), DOWN, 0.01, 'from below');
  const round: RGB = [0, 0, 0];
  for (let j = 0; j < 16; j++) facing(sh, Math.cos((j * Math.PI) / 8), 0, Math.sin((j * Math.PI) / 8)).forEach((v, k) => (round[k] += v / 16));
  near(round, UP.map((u, k) => (u + DOWN[k]) / 2) as RGB, 0.01, 'from the side, on average');
});

test('but the sky gives it its direction: more from the sun’s side, and the horizon', () => {
  const { sh } = skyHarmonics(afternoon, UP, DOWN);
  const toSun = facing(sh, 1, 0, 0);
  const away = facing(sh, -1, 0, 0);
  assert.ok(luma(toSun) > luma(away) * 1.15, `a wall facing the low sun's sky is lit more than one facing away (${luma(toSun).toFixed(3)}, ${luma(away).toFixed(3)})`);
  assert.ok(toSun[0] / toSun[2] > away[0] / away[2], 'and warmer');
});

test('under cloud the sky goes flat, and so does its light', () => {
  const clear = skyHarmonics(afternoon, UP, DOWN).sh;
  const cloud = skyHarmonics(afternoon, UP, DOWN, { flat: 1 }).sh;
  const spread = (sh: THREE.SphericalHarmonics3) => luma(facing(sh, 1, 0, 0)) / luma(facing(sh, -1, 0, 0));
  assert.ok(spread(cloud) < 1.02, `the same from every side under cloud (${spread(cloud).toFixed(3)})`);
  assert.ok(spread(clear) > spread(cloud));
  near(facing(cloud, 0, 1, 0), UP, 0.01, 'and as bright from above');
});

test('with the sky’s own colour, as bright from above, but bluer', () => {
  const { sh } = skyHarmonics(afternoon, UP, DOWN, { own: 1 });
  const up = facing(sh, 0, 1, 0);
  assert.ok(Math.abs(luma(up) - luma(UP)) < 0.01 * luma(UP), 'as bright');
  assert.ok(up[2] / up[0] > UP[2] / UP[0], 'bluer');
});

test('a photograph repeats a whole number of times in the world’s period, so nothing jumps when the origin moves', () => {
  for (const m of [2, 3, 0.7, 5]) {
    const fitted = fitMetres(m);
    const repeats = PERIOD / fitted;
    assert.ok(Math.abs(repeats - Math.round(repeats)) < 1e-9, `${m} m: ${repeats} repeats`);
    assert.ok(Math.abs(fitted - m) / m < 0.01, `${m} m is still about ${m} m (${fitted})`);
  }
  // without a page to load into, a photo is a stand-in a pixel across
  const p = photo('forrest_ground_03', 2);
  assert.equal(p.metres, fitMetres(2));
  assert.ok(p.map && p.normal && p.arm);
});
