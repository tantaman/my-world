// Shared architecture, private encounters: check what has to be repeatable
// and what a visitor can actually reach and experience on foot.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { findBuildings, overlaps } from '../src/abandoned/sites.js';
import { buildInstitution } from '../src/abandoned/building.js';
import { Visit } from '../src/abandoned/visit.js';
import { Solids } from '../src/world/solids.js';
import { segDist } from '../src/core/geom.js';
import { toWorld } from '../src/landmarks/sites.js';

const land = { seed: 758, height: () => 2, water: { edge: 50 }, padClearance: () => 100 };
const start = { x: 0, z: 0 };
const sites = findBuildings(land, start, () => false);

test('each institution has a reproducible site on dry, unoccupied ground', () => {
  assert.equal(sites.length, 2);
  assert.deepEqual(
    findBuildings(land, start, () => false),
    sites,
  );
  assert.equal(overlaps(sites[0].box, sites[1].box), false);
  assert.deepEqual(
    findBuildings({ ...land, water: { edge: 0 } }, start, () => false),
    [],
  );
  assert.deepEqual(
    findBuildings(land, start, () => true),
    [],
  );
});

test('walk from the entrance through every doorway and round to every visitor trace', () => {
  for (const s of sites) {
    const built = buildInstitution(s, land.height, new THREE.MeshBasicMaterial(), new THREE.MeshBasicMaterial());
    const solids = new Solids();
    solids.set(s, built.solids);
    const walked = new Set(),
      queue = [[0, s.d - 1]];
    const key = (x, z) => x + ',' + z;
    const canStand = (x, z) => {
      const p = toWorld(s, x, z);
      let floor = false,
        blocked = false;
      solids.forEachNear(p.x, p.z, 1, (wall) => {
        const hit = {};
        segDist(p.x, p.z, wall.ax, wall.az, wall.bx, wall.bz, hit);
        if (hit.d < wall.r + 0.08 && Math.abs(wall.topA - s.top) < 0.01) floor = true;
        if (hit.d < wall.r + 0.29 && wall.bottom < s.top + 1.7 && wall.topA > s.top + 0.28) blocked = true;
      });
      return floor && !blocked;
    };
    for (let i = 0; i < queue.length; i++) {
      const [x, z] = queue[i];
      for (const [dx, dz] of [
        [0, 1],
        [0, -1],
        [1, 0],
        [-1, 0],
      ]) {
        const u = x + dx,
          v = z + dz,
          id = key(u, v);
        if (Math.abs(u) >= s.w || Math.abs(v) >= s.d || walked.has(id) || !canStand(u, v)) continue;
        walked.add(id);
        queue.push([u, v]);
      }
    }
    for (const p of built.crossings) assert.ok(walked.has(key(Math.round(p.x + p.side * 1.2), Math.round(p.z))), 'inside each side room');
    for (const p of built.traces)
      assert.ok(
        queue.some(([x, z]) => Math.hypot(x - p.x, z - p.z) < 2),
        p.text,
      );
  }
});

test('a stopped walker hears a heel at an earlier footfall, and one last sound at a walked exit', () => {
  const site = { ...sites[0], x: 0, z: 0, yaw: 0, door: { x: 0, z: sites[0].d + 9 } };
  const fold = new THREE.Object3D();
  const built = { fold, traces: [], crossings: [{ x: 3, z: -5, side: 1 }] };
  const visit = new Visit(site, built, () => 0);
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(0, site.top + 1, 0);
  const heard = [];
  const play = (...args) => heard.push(args);
  const tick = (dt) => visit.update(dt, start, camera, play, () => {});
  for (let i = 0; i < 41; i++) tick(0.05);
  assert.ok(fold.visible, 'movement at the edge of sight');
  camera.lookAt(fold.position.x, site.top + fold.position.y, fold.position.z);
  tick(0.02);
  assert.equal(fold.visible, false, 'gone when looked at');
  tick(4);
  for (let x = 1; x <= 4; x++) visit.footstep(x, 2);
  tick(0.2);
  assert.equal(
    heard.some((a) => a[0] === 'stray-heel'),
    false,
  );
  tick(0.9);
  assert.deepEqual(heard.at(-1), ['stray-heel', 1, site.top + 0.12, 2]);
  visit.leave({ x: 42, z: 0 }, site.top);
  assert.equal(visit.exitDelay, 0, 'no sound follows a teleport');
  visit.leave({ x: 0, z: site.d + 0.2 }, site.top);
  const pos = { x: 0, z: site.d + 4, y: site.top };
  assert.ok(visit.outside(1, pos, play));
  assert.equal(visit.outside(2, pos, play), false);
  assert.deepEqual(heard.at(-1), ['stray-heel', 0, site.top + 0.2, site.d + 1]);
  const count = heard.length;
  visit.outside(10, pos, play);
  assert.equal(heard.length, count, 'it happens once');
});
