// A split screen (src/splitscreen/): how the screen is shared out between two,
// three or four, who each hiker on it is, a pad as the whole of someone's
// controls, walking a hiker of their own while yours stands still, and the
// panel each of them has to themselves.

import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { layout, cast, next, MOST } from '../src/splitscreen/layout.js';
import { PadControls } from '../src/splitscreen/pad.js';
import { Menu } from '../src/splitscreen/partHud.ts';
import { formatWhere, formatTrack, formatHeading, formatClock } from '../src/core/format.js';
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

test('someone new is a hiker nobody is yet; after that, who anyone is is theirs to choose', () => {
  const ids = ['hiker', 'oliver', 'elliott'];
  assert.equal(cast(ids, ['hiker']), 'oliver', 'the first nobody is');
  assert.equal(cast(ids, ['hiker', 'oliver']), 'elliott');
  assert.equal(cast(ids, ids), 'hiker', 'and once everybody is somebody, the first');
  assert.equal(cast(ids, ['hiker'], 'elliott'), 'elliott', 'or whoever they chose to be on that part last time');
  assert.equal(cast(ids, ['hiker'], 'hiker'), 'hiker', 'whether or not somebody else is them now: two can be the same');
  assert.equal(cast(ids, ['hiker'], 'someone-from-a-newer-build'), 'oliver', 'someone this build has never heard of is nobody');
  // and whoever is added after: just another line in HIKERS
  assert.equal(cast([...ids, 'fifth'], ids), 'fifth');

  assert.equal(next(ids, 'hiker'), 'oliver', 'select: the next of them');
  assert.equal(next(ids, 'elliott'), 'hiker', 'round from the end');
  assert.equal(next(ids, 'hiker', -1), 'elliott', 'and the one before, round from the start');
  // round the whole list, nobody is left out, whoever the others are
  const round = [];
  for (let id = 'oliver', k = 0; k < ids.length; k++) round.push((id = next(ids, id)));
  assert.deepEqual(round.sort(), [...ids].sort(), 'anyone can be any of them');
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

test("while their panel has their pad, it doesn't walk them", () => {
  const b = fakePad(1);
  const controls = new PadControls(1, () => [null, b]);
  const world = { heightAt: () => 0, waterAt: () => false, forEachCollider() {} };
  const them = new Player({ scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), world, input: controls, who: hiker('oliver') });
  them.spawn(0, 0, 0);

  controls.blocked = true;
  b.axes = [1, -1, 1, 0]; // both sticks pushed
  b.press('PadA').press('PadB').press('PadUp');
  const yaw = them.camYaw;
  for (let i = 0; i < 30; i++) {
    controls.read();
    them.update(1 / 60);
  }
  assert.ok(Math.hypot(them.pos.x, them.pos.z) < 0.01, 'they stand where they were');
  assert.equal(them.camYaw, yaw, 'looking where they looked');
  assert.equal(controls.jumped(), false, 'A is the panel\'s');
  assert.equal(controls.isDown('run') || controls.isDown('zoomIn'), false, 'and so are B and the d-pad');
  assert.equal(controls.pressed('PadA'), false, 'held, not pressed again');
  b.press('PadA', false);
  controls.read();
  b.press('PadA');
  controls.read();
  assert.equal(controls.pressed('PadA'), true, 'the panel is still told what is pressed');

  // put away with A still down: it was the panel's press, not a jump
  controls.blocked = false;
  assert.equal(controls.jumped(), false);
  for (let i = 0; i < 30; i++) {
    controls.read();
    them.update(1 / 60);
  }
  assert.ok(Math.hypot(them.pos.x, them.pos.z) > 0.3, 'and the stick walks them again');
});

test('a panel of their own: the d-pad goes round its rows, changes the one they are on, and A does it', () => {
  let who = 1;
  let behind = true;
  let back = 0;
  const menu = new Menu([
    { id: 'who', label: () => 'who is hiking', value: () => String(who), step: (by) => void (who += by) },
    { id: 'behind', label: () => 'camera locked behind you', value: () => (behind ? 'on' : 'off'), step: () => void (behind = !behind) },
    { id: 'back', label: () => 'back beside the hiker', press: () => void back++, closes: true },
  ]);
  menu.step(1);
  menu.press();
  assert.deepEqual([who, behind, back], [1, true, 0], 'shut, it does nothing');

  menu.open();
  assert.equal(menu.at, 0, 'opened on its first row');
  menu.step(1);
  menu.step(1);
  menu.step(-1);
  assert.equal(who, 2, 'left and right: the one before, the next');
  menu.press();
  assert.equal(who, 3, 'A is the next too');
  menu.move(1);
  menu.step(-1);
  assert.equal(behind, false, 'a switch flips either way');
  menu.press();
  assert.equal(behind, true, 'and with A');
  assert.equal(menu.isOpen, true, 'and the panel stays up to be set');
  menu.move(-2);
  assert.equal(menu.at, 2, 'up from the top is the bottom');
  menu.step(1);
  assert.equal(back, 0, 'something to do is not done by left and right');
  menu.press();
  assert.deepEqual([back, menu.isOpen], [1, false], 'A does it, and the panel is put away');
  menu.open();
  assert.equal(menu.at, 0, 'and it opens on its first row again');
});

test('what a HUD says of where someone is, whoever they are', () => {
  assert.equal(formatClock(7.09), '07:05');
  assert.equal(formatHeading(0), 'N', 'a camera that has not turned looks north (-z)');
  assert.equal(formatHeading(-Math.PI / 2), 'E');
  assert.equal(formatHeading(Math.PI), 'S');
  assert.equal(formatHeading(Math.PI / 4), 'NW');
  assert.equal(formatWhere({ x: 119.6, z: -45.2 }, -Math.PI / 2, 13.5), '120, -45  ·  E  ·  13:30');
  // one mark, two people looking the same way from either side of it: each is pointed their own way
  const mark = { label: 'the falls', x: 0, z: -100 };
  assert.equal(formatTrack(mark, { x: 0, z: 0 }, 0), '◆ the falls · 100 m ↑');
  assert.equal(formatTrack(mark, { x: 0, z: -200 }, 0), '◆ the falls · 100 m ↓');
  assert.equal(formatTrack(mark, { x: -1500, z: -100 }, 0), '◆ the falls · 1.5 km →');
  assert.equal(formatTrack(mark, { x: 3, z: -98 }, 0), "◆ the falls · you're here");
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
