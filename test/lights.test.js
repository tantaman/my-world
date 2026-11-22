// Light given off by things (render/lights.js): the pool is always the same
// size, whatever there is to light, so that no shader is ever compiled
// again for it; it goes to those that matter most from the eye; the shadow
// goes to the one that may have it; and a light going out fades as another
// comes to deserve it, rather than blinking off.

import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Lights } from '../src/render/lights.js';

const EYE = new THREE.Vector3(0, 1.6, 0);
const src = (x, power, more = {}) => ({ x, y: 1, z: 0, color: [1, 0.5, 0.2], power, range: 15, ...more });
const lit = (lights) => lights.pool.filter((l) => l.intensity > 0);

test('the pool is always the same size, and in the scene being drawn', () => {
  const lights = new Lights({ count: 4, shadows: 1 });
  const a = new THREE.Scene();
  const b = new THREE.Scene();
  assert.equal(lights.pool.length, 4);
  assert.equal(lights.pool.filter((l) => l.castShadow).length, 1);
  lights.assign(a, EYE);
  assert.equal(lights.group.parent, a);
  assert.equal(lit(lights).length, 0, 'nothing to light: all dark');
  for (let i = 0; i < 9; i++) lights.add(b, src(i * 3, 10));
  lights.assign(b, EYE);
  assert.equal(lights.group.parent, b, 'moved to the scene being drawn');
  assert.equal(lights.pool.length, 4, 'still four, with nine to give');
  assert.ok(lit(lights).length >= 3);
});

test('the nearest and brightest get the lights; the shadow goes to one that may have it', () => {
  const lights = new Lights({ count: 2, shadows: 1 });
  const scene = new THREE.Scene();
  const glare = lights.add(scene, src(2, 20, { shadow: false })); // a glow everywhere at once
  const fire = lights.add(scene, src(4, 10));
  lights.add(scene, src(60, 10)); // far off
  lights.assign(scene, EYE);
  const at = (s) => lights.pool.find((l) => l.intensity > 0 && Math.abs(l.position.x - s.x) < 0.2);
  assert.ok(at(glare) && at(fire), 'the two near ones are lit');
  assert.equal(at(fire).castShadow, true, 'the fire casts the shadows');
  assert.equal(at(glare).castShadow, false, 'not the glow');
  assert.equal(at(fire).shadow.camera.far, fire.range, "the shadow's reach is the light's");
});

test('a light going out fades as the next comes to deserve it', () => {
  const lights = new Lights({ count: 1, shadows: 0 });
  const scene = new THREE.Scene();
  lights.add(scene, src(5, 10));
  const rival = lights.add(scene, src(5.5, 0));
  const powers = [];
  for (let p = 0; p <= 20; p += 0.5) {
    rival.power = p;
    lights.assign(scene, EYE);
    powers.push(lights.pool[0].intensity);
  }
  // as the rival's claim comes up to the first's, the light dims smoothly to
  // nothing, then is the rival's
  for (let i = 1; i < powers.length; i++) assert.ok(Math.abs(powers[i] - powers[i - 1]) < 4, `no jump: ${powers.map((v) => v.toFixed(1))}`);
  assert.ok(powers.some((v) => v < 0.5), 'it goes out on the way');
});

test('sources can be handed over by a function, those near the eye', () => {
  const lights = new Lights({ count: 3, shadows: 0 });
  const scene = new THREE.Scene();
  const many = Array.from({ length: 200 }, (_, i) => src(i * 2, 8));
  lights.addSource(scene, (eye, out) => {
    for (const s of many) if (Math.abs(s.x - eye.x) < 20) out.push(s);
  });
  lights.assign(scene, EYE);
  assert.equal(lit(lights).length, 3);
  assert.ok(lit(lights).every((l) => l.position.x < 20));
  assert.ok(lights.glow.filter((g) => g.on).length >= 3, 'and the air glows round the brightest');
});
