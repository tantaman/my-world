// Game controllers: reading pads (dead zones, which buttons went down, which
// pads count), what their buttons are called, typing into an overlay, and the
// help panel and prompts naming a pad's buttons in place of keys.

import test from 'node:test';
import assert from 'node:assert/strict';
import { Pads, PadTyping, PAD_BUTTONS, STICK, REPEAT, FOCUS_NEXT, FOCUS_BACK, stick, restingAxes, padKind, padName, padNames } from '../src/player/gamepad.js';
import { Commands } from '../src/game/commands.js';
import { renameKeys } from '../src/ui/hud.js';

// A pad as navigator.getGamepads() gives one.
function fakePad({ id = 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)', index = 0, mapping = 'standard' } = {}) {
  const pad = {
    id,
    index,
    mapping,
    connected: true,
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
    press(code, down = true) {
      const b = pad.buttons[PAD_BUTTONS.indexOf(code)];
      b.pressed = down;
      b.value = down ? 1 : 0;
      return pad;
    },
  };
  return pad;
}

test('a stick at rest is let go of, and all the way over is one', () => {
  assert.deepEqual(stick(0.1, -0.1), { x: 0, y: 0 }, 'inside the dead zone');
  const full = stick(0, -1);
  assert.equal(full.x, 0);
  assert.equal(full.y, -1);
  const half = stick((STICK.dead + STICK.full) / 2, 0);
  assert.ok(Math.abs(half.x - 0.5) < 1e-9, 'halfway between dead and full is a half');
  assert.ok(stick(0.6, 0, 2).x < stick(0.6, 0).x, 'a curve makes the middle finer');
  assert.deepEqual(stick(undefined, undefined), { x: 0, y: 0 }, 'a pad with no sticks');
});

test('a pad says which buttons are down, and which went down since last time', () => {
  const pad = fakePad();
  const pads = new Pads(() => [pad]);
  pads.read();
  assert.equal(pads.connected, true);
  assert.equal(pads.down.size, 0);
  pad.press('PadA');
  pads.read();
  assert.deepEqual([...pads.went], ['PadA']);
  pads.read();
  assert.deepEqual([...pads.down], ['PadA'], 'still held');
  assert.equal(pads.went.size, 0, 'but it went down only once');
  pad.press('PadA', false);
  pads.read();
  assert.equal(pads.down.size, 0);
});

test('a trigger is pressed past a third of its travel', () => {
  const pad = fakePad();
  const pads = new Pads(() => [pad]);
  const rt = pad.buttons[PAD_BUTTONS.indexOf('PadRT')];
  Object.assign(rt, { pressed: true, value: 0.2 }); // some browsers call any touch pressed
  pads.read();
  assert.equal(pads.down.has('PadRT'), false);
  rt.value = 0.6;
  pads.read();
  assert.equal(pads.down.has('PadRT'), true);
});

test('the sticks walk and look, from whichever pad pushes furthest', () => {
  const a = fakePad();
  const b = fakePad({ index: 1 });
  a.axes = [0.5, 0, 0, 0];
  b.axes = [0, -1, 0, 0.9];
  const pads = new Pads(() => [a, null, b]);
  pads.read();
  assert.deepEqual(pads.move, { x: 0, y: -1 });
  assert.equal(pads.look.x, 0);
  assert.ok(pads.look.y > 0.8 && pads.look.y < 0.9, 'looking is bent to be finer near the middle');
});

test('a pad that might be anything counts only once a button on it is pressed', () => {
  const odd = fakePad({ id: 'Some Keyboard', mapping: '' });
  odd.axes = [-1, -1, -1, -1]; // what such things often say
  const pads = new Pads(() => [odd]);
  pads.read();
  assert.equal(pads.connected, false);
  assert.deepEqual(pads.move, { x: 0, y: 0 });
  odd.press('PadB');
  pads.read();
  assert.equal(pads.connected, true);
  odd.press('PadB', false);
  pads.read();
  assert.equal(pads.connected, true, 'and goes on counting');
  assert.deepEqual(pads.move, { x: 0, y: 0 }, 'and its axes are still not sticks');
  assert.deepEqual(pads.look, { x: 0, y: 0 });
});

test('an axis resting away from the middle is a trigger, not a stick', () => {
  assert.equal(restingAxes([0, 0, 0, 0]), 0, 'sticks at rest are sticks');
  assert.equal(restingAxes([0, 0, 0, -1]), 0b1000);
  assert.equal(restingAxes([0, 0, 0, STICK.dead / 2]), 0, 'inside the dead zone is at rest');
  assert.equal(restingAxes([]), 0, 'a pad with no axes');

  // A DualShock as a browser without the standard layout gives it: the
  // triggers sit between the sticks, at -1 until they are pulled.
  const ds = fakePad({ id: 'Wireless Controller (Vendor: 054c Product: 09cc)', mapping: '' });
  ds.axes = [0, 0, 0, -1, -1, 0];
  const pads = new Pads(() => [ds]);
  pads.read();
  ds.press('PadA'); // picked up, which is when its axes are read for where they rest
  pads.read();
  assert.deepEqual(pads.look, { x: 0, y: 0 }, 'a resting trigger does not turn the camera');
  ds.axes[2] = -1; // the right stick still looks
  pads.read();
  assert.ok(pads.look.x < -0.9 && pads.look.y === 0);
  ds.axes[3] = 1; // and pulling the trigger still does not
  pads.read();
  assert.equal(pads.look.y, 0);
});

test('no pads, or not allowed to ask, is no pads', () => {
  const none = new Pads(() => {
    throw new Error('blocked by permissions policy');
  });
  none.read();
  assert.equal(none.connected, false);
  assert.equal(new Pads(() => null).read().down.size, 0);
});

test('buttons are called what the pad in hand calls them', () => {
  assert.equal(padKind('DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)'), 'playstation');
  assert.equal(padKind('Pro Controller (STANDARD GAMEPAD Vendor: 057e Product: 2009)'), 'nintendo');
  assert.equal(padKind('Xbox 360 Controller (XInput STANDARD GAMEPAD)'), 'xbox');
  assert.equal(padName('PadA'), 'A');
  assert.equal(padName('PadA', 'playstation'), '✕');
  assert.equal(padName('PadA', 'nintendo'), 'B', 'the bottom button on a Nintendo pad is B');
  assert.equal(padName('PadRS', 'playstation'), 'right stick');
  assert.equal(padNames(['PadLB', 'PadRB']), 'LB · RB');
  assert.equal(padNames(['PadUp', 'PadDown']), 'd-pad ↑ ↓');
  const pads = new Pads(() => [fakePad({ id: 'Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)' }).press('PadX')]);
  pads.read();
  assert.equal(pads.name('PadX'), '□', 'the pad last touched says what its buttons are called');
});

test('into an overlay the pad types keys, only for what goes down while it is open', () => {
  const pad = fakePad();
  const pads = new Pads(() => [pad]);
  const typing = new PadTyping();
  const type = (t, live, opener) => typing.keys(pads.read(), t, live, opener).slice();
  pad.press('PadB'); // running when the map opens
  assert.deepEqual(type(0, false), [], 'nothing types while nothing is open');
  assert.deepEqual(type(0.1, true), [], 'a button held from before is not a press');
  pad.press('PadB', false);
  type(0.2, true);
  pad.press('PadB');
  assert.deepEqual(type(0.3, true), ['Escape'], 'B is Escape');
  pad.press('PadB', false);
  pad.press('PadA');
  assert.deepEqual(type(0.4, true), ['Enter']);
  pad.press('PadA', false);
  type(0.5, true);
  pad.press('PadSelect');
  assert.deepEqual(type(0.6, true, 'PadSelect'), ['Escape'], 'the button that opened it closes it');
});

test('in an overlay the d-pad goes from button to button and the stick is the arrows, both repeating', () => {
  const pad = fakePad();
  const pads = new Pads(() => [pad]);
  const typing = new PadTyping();
  const type = (t) => typing.keys(pads.read(), t, true).slice();
  pad.press('PadDown');
  assert.deepEqual(type(0), [FOCUS_NEXT]);
  assert.deepEqual(type(REPEAT.after / 2), [], 'not again straight away');
  assert.deepEqual(type(REPEAT.after + 0.01), [FOCUS_NEXT], 'but after a moment');
  assert.deepEqual(type(REPEAT.after + 0.01 + REPEAT.every + 0.001), [FOCUS_NEXT], 'and then often');
  pad.press('PadDown', false);
  pad.press('PadLeft');
  assert.deepEqual(type(2), [FOCUS_BACK]);
  pad.press('PadLeft', false);
  type(2.05);
  pad.axes = [-1, 0, 0, 0];
  assert.deepEqual(type(2.1), ['ArrowLeft'], 'the stick pans the map');
  pad.axes = [-0.4, 0, 0, 0];
  assert.deepEqual(type(3), [], 'only pushed well over');
});

test('the help panel keeps a pad\'s buttons apart from the keys', () => {
  const commands = new Commands();
  commands.add({ id: 'map', keys: ['KeyM', 'PadSelect'], group: 'WANDER', label: 'map', run() {} });
  commands.add({ id: 'ride', keys: ['KeyZ', 'PadX'], group: 'WANDER', help: 'Z', label: 'ride', run() {} });
  commands.describe({ group: 'WANDER', help: 'W A S D', pad: ['PadLS'], label: 'walk' });
  commands.add({ id: 'home', keys: ['KeyR'], group: 'WANDER', label: 'back to the start', run() {} });
  assert.deepEqual(commands.help(), [
    {
      group: 'WANDER',
      rows: [
        { help: 'M', label: 'map', pad: ['PadSelect'] },
        { help: 'Z', label: 'ride', pad: ['PadX'] },
        { help: 'W A S D', label: 'walk', pad: ['PadLS'] },
        { help: 'R', label: 'back to the start' },
      ],
    },
  ]);
  let opened = 0;
  commands.add({ id: 'help', keys: ['KeyH', 'PadStart'], run: () => opened++ });
  commands.update({ wasPressed: (c) => c === 'PadStart', down: () => false }, 0.016);
  assert.equal(opened, 1, 'a pad button runs a command as a key does');
});

test('prompts call keys by the pad\'s buttons where it has some', () => {
  const words = new Map([
    ['click', 'RT'],
    ['right-click', 'LT'],
    ['Z', 'X'],
  ]);
  assert.equal(renameKeys('<b>hold click</b> dig · <b>right-click</b> fill · <b>G</b> set a grade stake', words), '<b>hold RT</b> dig · <b>LT</b> fill · <b>G</b> set a grade stake');
  assert.equal(renameKeys('<b>hold Z</b> calm the horse', words), '<b>hold X</b> calm the horse');
  assert.equal(renameKeys('<b>ride</b> your horse', words), '<b>ride</b> your horse', 'words that are not keys stay');
  assert.equal(renameKeys('<b>Z</b> ride', null), '<b>Z</b> ride');
});
