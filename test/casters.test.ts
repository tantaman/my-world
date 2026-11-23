// Shadows drawn from what each light can reach (src/render/casters.ts): a
// light's copy of a mesh holds just the instances within its reach, it is
// drawn only into that light's shadow, and it is picked again only when it
// has to be.

import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Casters } from '../src/render/casters.ts';

const CHUNK = [6400, -3200]; // where the mesh is: its instances are measured from here

// A row of small boxes 10 m apart along x, from the mesh's corner, at
// x = 0, 10, 20, … in the mesh's own space.
function row(n: number) {
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial(), n);
  for (let i = 0; i < n; i++) mesh.setMatrixAt(i, new THREE.Matrix4().makeTranslation(i * 10, 0.5, 0));
  mesh.computeBoundingSphere();
  mesh.castShadow = true;
  mesh.position.set(CHUNK[0], 0, CHUNK[1]);
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  return mesh;
}

// Where (in the mesh's own space, along x) the instances in a copy are.
const xs = (copy: THREE.InstancedMesh | undefined) => {
  if (!copy || !copy.visible) return [];
  const a = copy.instanceMatrix.array;
  return Array.from({ length: copy.count }, (_, k) => a[k * 16 + 12]);
};

function sunOver(scene: THREE.Scene, x: number, z: number, half: number) {
  const sun = new THREE.DirectionalLight(0xffffff, 3);
  sun.castShadow = true;
  Object.assign(sun.shadow.camera, { left: -half, right: half, top: half, bottom: -half, near: 1, far: 400 });
  sun.target.position.set(x, 0, z);
  sun.position.set(x, 200, z); // straight down
  scene.add(sun, sun.target);
  return sun;
}

test('each light gets a copy of just what it reaches, drawn only into its own shadow', () => {
  const scene = new THREE.Scene();
  const casters = new Casters();
  const mesh = row(20);
  scene.add(mesh);
  // the sun's shadow: 30 m either way of x = 100 (in the mesh); boxes go to 190
  const sun = sunOver(scene, CHUNK[0] + 100, CHUNK[1], 30);
  // a fire's light, 16 m round x = 20
  const fire = new THREE.PointLight(0xffaa66, 5, 16);
  fire.castShadow = true;
  fire.position.set(CHUNK[0] + 20, 1, CHUNK[1]);
  scene.add(fire);
  casters.light(sun);
  casters.light(fire);
  const cast = casters.add(mesh);
  assert.equal(mesh.castShadow, false, 'the mesh itself is drawn only for the picture');
  assert.equal(cast.on, true, 'what it said of its shadow is kept');
  casters.update();

  const [toSun, toFire] = cast.copies;
  // the sun reaches 70..130, and 8 m more either way before it is picked
  // again, and each box (and the wind in it) a little further
  const sunX = xs(toSun);
  assert.ok(sunX.includes(70) && sunX.includes(130), `in the sun's shadow: ${sunX}`);
  assert.ok(!sunX.includes(40) && !sunX.includes(160), `and nothing well outside it: ${sunX}`);
  // the fire reaches 16 m, 2 m more before it is picked again, and the box
  // at 40 (20 m off) has the wind in it, 2 m either way
  assert.deepEqual(xs(toFire), [0, 10, 20, 30, 40], 'the fire reaches 16 m and a little');
  // each on its light's layer, which its shadow camera sees and nothing else does
  assert.ok(toSun && toFire && toSun.layers.mask !== toFire.layers.mask);
  assert.ok(sun.shadow.camera.layers.test(toSun!.layers) && !sun.shadow.camera.layers.test(toFire!.layers));
  assert.ok(fire.shadow.camera.layers.test(toFire!.layers) && !fire.shadow.camera.layers.test(toSun!.layers));
  assert.ok(sun.shadow.camera.layers.isEnabled(0), 'and everything else still casts a shadow');
  assert.ok(!new THREE.Camera().layers.test(toSun!.layers), 'and the picture never draws a copy');
  assert.ok(toSun!.castShadow && toSun!.parent === mesh, 'where the mesh is, shown while it is');
  // the copies keep to small numbers too: the mesh's own (render/origin.js)
  assert.ok(Math.max(...Array.from(toSun!.instanceMatrix.array).map(Math.abs)) < 1000);
});

test('a copy is picked again only when the light has gone far enough, or the mesh has changed', () => {
  const scene = new THREE.Scene();
  const casters = new Casters();
  const mesh = row(30);
  scene.add(mesh);
  const sun = sunOver(scene, CHUNK[0] + 100, CHUNK[1], 30);
  casters.light(sun);
  const cast = casters.add(mesh);
  casters.update();
  const copy = cast.copies[0]!;
  const first = copy.instanceMatrix.version;

  // a few metres along: what was picked still takes it in
  sun.position.x += 3;
  sun.target.position.x += 3;
  casters.update();
  assert.equal(copy.instanceMatrix.version, first, 'nothing written');

  // much further: picked again, round where it is now
  sun.position.x += 60;
  sun.target.position.x += 60;
  casters.update();
  assert.ok(copy.instanceMatrix.version > first, 'written again');
  assert.ok(xs(copy).includes(190) && !xs(copy).includes(100), `${xs(copy)}`);

  // a box felled (shrunk to nothing): it goes from the shadow
  const was = copy.instanceMatrix.version;
  mesh.setMatrixAt(18, new THREE.Matrix4().makeScale(0, 0, 0));
  mesh.instanceMatrix.needsUpdate = true;
  casters.update();
  assert.ok(copy.instanceMatrix.version > was && !xs(copy).includes(180), `${xs(copy)}`);

  // casting no shadow: no copy drawn
  cast.on = false;
  casters.update();
  assert.equal(copy.visible, false);
  cast.on = true;
  casters.update();
  assert.equal(copy.visible, true);

  // the sun gone in (a cave): nothing picked while its shadow can't be seen
  sun.intensity = 0;
  sun.position.x += 500;
  sun.target.position.x += 500;
  const out = copy.instanceMatrix.version;
  casters.update();
  assert.equal(copy.instanceMatrix.version, out);

  // the mesh disposed of: its copies with it
  mesh.dispose();
  assert.equal(mesh.children.length, 0);
});

test('a light far from a mesh asks nothing of it', () => {
  const scene = new THREE.Scene();
  const casters = new Casters();
  const mesh = row(10);
  scene.add(mesh);
  const fire = new THREE.PointLight(0xffaa66, 5, 16);
  fire.castShadow = true;
  fire.position.set(CHUNK[0] - 500, 1, CHUNK[1]);
  scene.add(fire);
  casters.light(fire);
  const cast = casters.add(mesh);
  casters.update();
  assert.equal(cast.copies[0]!.visible, false);
  // and a fire put out is not picked for at all
  fire.intensity = 0;
  fire.shadow.autoUpdate = false;
  fire.position.set(CHUNK[0], 1, CHUNK[1]);
  casters.update();
  assert.equal(cast.copies[0]!.visible, false);
});
