// A split screen (src/splitscreen/): how the screen is shared out between two,
// three or four, who each hiker on it is, and a pad as the whole of
// someone's controls, walking a hiker of their own while yours stands still.

import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { layout, cast, next, MOST } from '../src/splitscreen/layout.js';
import { PadControls } from '../src/splitscreen/pad.js';
import { Pads, PAD_BUTTONS } from '../src/player/gamepad.js';
import { Player } from '../src/player/player.js';
import { HIKERS, hiker } from '../src/player/hikers.js';

// A pad as navigator.getGamepads() gives one.
function fakePad(index) {
  const pad = {
    id: `Stand-in ${index} (STANDARD GAMEPAD Vendor: 045e Product: 0b13)`,
    index,
    mapping: 'standard',
    connected: true,
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
    press(code, down = true) {
      Object.assign(pad.buttons[PAD_BUTTONS.indexOf(code)], { pressed: down, value: down ? 1 : 0 });
      return pad;
    },
  };
  return pad;
}

// The area of the screen two rects share (fractions of it).
const overlap = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

test('the screen is shared out whole, with no part over another', () => {
  for (const aspect of [16 / 9, 4 / 3, 9 / 16]) {
    for (let n = 1; n <= MOST; n++) {
      const parts = layout(n, aspect);
      assert.equal(parts.length, n, `${n} parts`);
      const area = parts.reduce((sum, r) => sum + r.w * r.h, 0);
      assert.ok(Math.abs(area - 1) < 1e-9, `${n} parts on a ${aspect.toFixed(2)} screen cover it (${area})`);
      for (let i = 0; i < n; i++) {
        const r = parts[i];
        assert.ok(r.x >= 0 && r.y >= 0 && r.x + r.w <= 1 + 1e-9 && r.y + r.h <= 1 + 1e-9, 'each on the screen');
        for (let j = i + 1; j < n; j++) assert.equal(overlap(r, parts[j]), 0, `parts ${i} and ${j} don't overlap`);
      }
    }
  }
});

test('two are side by side on a wide screen and one over the other on a tall one; of three, the first has half', () => {
  const [a, b] = layout(2, 16 / 9);
  assert.ok(a.h === 1 && b.h === 1 && a.x < b.x, 'side by side');
  const [c, d] = layout(2, 9 / 16);
  assert.ok(c.w === 1 && d.w === 1 && c.y < d.y, 'one over the other');
  const three = layout(3, 16 / 9);
  assert.equal(three[0].w * three[0].h, 0.5, "the first pad's part is half the screen");
  assert.ok(three.slice(1).every((r) => r.w * r.h === 0.25), 'and the others a quarter each');
  const pictures = three.map((r) => (r.w * 16) / (r.h * 9));
  assert.ok(pictures.every((p) => p > 0.8 && p < 1.9), `none of them a sliver (${pictures.map((p) => p.toFixed(2))})`);
});

test('each hiker on the screen is somebody different, while there is somebody left to be', () => {
  const ids = ['hiker', 'oliver', 'elliott'];
  assert.equal(cast(ids, ['hiker']), 'oliver', 'the first nobody is');
  assert.equal(cast(ids, ['hiker', 'oliver']), 'elliott');
  assert.equal(cast(ids, ['hiker'], 'elliott'), 'elliott', 'or whoever was on that part last time');
  assert.equal(cast(ids, ['elliott'], 'elliott'), 'hiker', 'unless somebody else is them now');
  assert.equal(cast(ids, ids, 'oliver'), 'oliver', 'and once everybody is somebody, two can be the same');
  assert.equal(cast(ids, ids), 'hiker');
  assert.equal(cast(ids, ['hiker'], 'someone-from-a-newer-build'), 'oliver', 'someone this build has never heard of is nobody');
  // and whoever is added after: just another line in HIKERS
  assert.equal(cast([...ids, 'fifth'], ids), 'fifth');

  assert.equal(next(ids, 'oliver', ['hiker']), 'elliott', 'select: the next one nobody is');
  assert.equal(next(ids, 'elliott', ['oliver']), 'hiker', 'round from the end');
  assert.equal(next(ids, 'oliver', ['hiker', 'elliott']), 'oliver', 'and nobody, if everyone else is taken');
  assert.ok(HIKERS.length >= 4, 'there are hikers enough for four different people');
});

test('pads shared out: each read only as its own, and every one of them counted', () => {
  const a = fakePad(0);
  const b = fakePad(1);
  const yours = new Pads(() => [a, b]);
  yours.read();
  assert.deepEqual(yours.present, [0, 1]);
  yours.only = new Set([0]);
  b.press('PadA');
  b.axes = [0, -1, 0, 0];
  yours.read();
  assert.equal(yours.down.size, 0, "another's button isn't yours");
  assert.deepEqual(yours.move, { x: 0, y: 0 }, "nor their stick");
  assert.deepEqual(yours.present, [0, 1], 'though their pad is still there');
  a.press('PadB');
  yours.read();
  assert.deepEqual([...yours.down], ['PadB'], 'yours still is');
});

test('a pad of their own walks someone else, and leaves you be', () => {
  const a = fakePad(0);
  const b = fakePad(1);
  const list = () => [a, b];
  const world = { heightAt: () => 0, waterAt: () => false, forEachCollider() {} };
  const scene = new THREE.Scene();
  const controls = new PadControls(1, list);
  const them = new Player({ scene, camera: new THREE.PerspectiveCamera(), world, input: controls, who: hiker('oliver') });
  them.spawn(0, 0, 0);
  const yours = new Pads(list);
  yours.only = new Set([0]);

  b.axes = [0, -1, 0, 0]; // their left stick, all the way forward
  for (let i = 0; i < 60; i++) {
    yours.read();
    controls.read();
    them.update(1 / 60);
  }
  assert.ok(Math.hypot(them.pos.x, them.pos.z) > 1, `they walked (${Math.hypot(them.pos.x, them.pos.z).toFixed(2)} m)`);
  assert.deepEqual(yours.move, { x: 0, y: 0 }, "and your stick didn't move");
  b.axes = [0, 0, 0, 0];

  // A jumps, once a press; a button nothing else uses is theirs to ask after
  b.press('PadA');
  controls.read();
  assert.equal(controls.jumped(), true);
  assert.equal(controls.jumped(), false, 'once');
  controls.read();
  assert.equal(controls.jumped(), false, 'held is not pressed again');
  b.press('PadA', false).press('PadSelect');
  controls.read();
  assert.equal(controls.pressed('PadSelect'), true);
  assert.equal(controls.isDown('jump'), false);
  b.press('PadB');
  controls.read();
  assert.equal(controls.running(), true, 'B runs');
  assert.equal(controls.isDown('run'), true);
  assert.equal(controls.consumeZoom(), 0, 'and there is no mouse wheel');
  a.press('PadA');
  controls.read();
  assert.equal(controls.jumped(), false, "your A isn't theirs");
});

test("each part draws only the grass round its own hiker, which is all it could show", async () => {
  const { Grass } = await import('../src/world/grass.js');
  const { CONFIG } = await import('../src/config.js');
  const grass = new Grass(new THREE.Scene(), {}, null, 1);
  const T = CONFIG.grassTile;
  const R = CONFIG.grassRadius;
  // a tile round each of two hikers, 300 m apart, and one at the edge of the first's grass
  const tile = (tx, tz) => ({ tx, tz, mesh: { visible: true } });
  const mine = tile(0, 0);
  const theirs = tile(Math.floor(300 / T), 0);
  const edge = tile(Math.floor((R + T * 0.5) / T), 0);
  for (const t of [mine, theirs, edge]) grass.tiles.set(`${t.tx},${t.tz}`, t);
  grass.only(T / 2, T / 2);
  assert.equal(mine.mesh.visible, true);
  assert.equal(theirs.mesh.visible, false, 'not the grass round someone 300 m off');
  assert.equal(edge.mesh.visible, true, 'but a tile any corner of which is near enough to show');
  grass.only(null);
  assert.ok([mine, theirs, edge].every((t) => t.mesh.visible), 'and all of it again after');
});
