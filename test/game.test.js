// The frame: phases in order, features installing themselves, keys as
// commands, and one bad system not taking the game down with it.

import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, PHASES } from '../src/game/game.js';
import { Commands } from '../src/game/commands.js';
import { Settings } from '../src/game/settings.js';
import { Emitter } from '../src/core/events.js';
import { memoryStorage } from '../src/core/storage.js';

// Keys as the game sees them, for a frame.
function keys() {
  const pressed = new Set();
  const held = new Set();
  return {
    press: (...codes) => codes.forEach((c) => pressed.add(c)),
    hold: (...codes) => codes.forEach((c) => held.add(c)),
    wasPressed: (c) => pressed.has(c),
    down: (...codes) => codes.some((c) => held.has(c)),
    endFrame: () => pressed.clear(),
  };
}

test('systems run phase by phase, and in the order they were added within one', () => {
  const game = new Game();
  const ran = [];
  const sys = (name, phase) => game.addSystem({ name, phase, update: () => ran.push(name) });
  sys('hud', 'late');
  sys('draw', 'render');
  sys('player', 'update');
  sys('clock', 'input');
  sys('tools', 'update');
  sys('forest', 'world');
  sys('sound', 'audio');
  game.tick(1000);
  assert.deepEqual(ran, ['clock', 'player', 'tools', 'forest', 'sound', 'draw', 'hud']);
  assert.deepEqual(PHASES, ['input', 'update', 'world', 'audio', 'render', 'late']);
  assert.throws(() => game.addSystem({ name: 'x', phase: 'sometime', update() {} }), /no such phase/);
});

test('a frame knows how long it has been, and never takes too big a step', () => {
  const game = new Game();
  const steps = [];
  game.addSystem({ name: 'watch', phase: 'update', update: (f) => steps.push(Math.round(f.dt * 1000)) });
  game._last = 1000;
  game.tick(1016);
  game.tick(1032);
  game.tick(6000); // the tab was in the background
  assert.deepEqual(steps, [16, 16, 50]);
  assert.equal(game.frame.n, 3);
});

test('features install in order and find what earlier ones provided', () => {
  const game = new Game();
  game.use((g) => g.provide('ground', { height: () => 3 }));
  game.use((g) => g.provide('walker', { y: g.ground.height() }));
  assert.equal(game.walker.y, 3);
  assert.equal(game.api.walker, game.walker, 'and the console can see it');
  assert.throws(() => game.provide('ground', {}), /already provided/);
});

test('commands run before the systems, and a press lasts one frame', () => {
  const game = new Game();
  const input = keys();
  game.provide('input', input);
  let open = false;
  let seenBySystem = null;
  game.commands.add({ id: 'map', keys: ['KeyM'], run: () => void (open = !open) });
  game.addSystem({ name: 'look', phase: 'input', update: () => void (seenBySystem = open) });
  input.press('KeyM');
  game.tick(16);
  assert.equal(seenBySystem, true, 'the system saw what the command did this frame');
  game.tick(32);
  assert.equal(open, true, 'the press was over by the next frame');
});

test('held keys are told how long, and which', () => {
  const commands = new Commands();
  const input = keys();
  let hour = 12;
  commands.add({ id: 'scrub', keys: ['Comma', 'Period'], hold: (dt, key) => void (hour += (key === 'Period' ? 1 : -1) * dt * 2) });
  input.hold('Period');
  commands.update(input, 0.5);
  assert.equal(hour, 13);
});

test('the help panel is written from what is bound', () => {
  const commands = new Commands();
  let tools = 7;
  commands.add({ id: 'pixels', keys: ['KeyP'], group: 'LOOK', label: 'pixel art on / off', run() {} });
  commands.describe({ group: 'WANDER', help: 'W A S D', label: 'walk' });
  commands.add({ id: 'size', keys: ['BracketLeft', 'BracketRight'], group: 'LOOK', label: 'pixel size', run() {} });
  commands.describe({ group: 'BUILD', help: () => `1 – ${tools}`, label: 'pick a tool' });
  commands.add({ id: 'map', keys: ['KeyM'], group: 'WANDER', label: 'map', run() {} });
  commands.add({ id: 'secret', keys: ['KeyZ'], run() {} }); // no label: not listed
  tools = 8; // a feature added a tool after the row was described
  assert.deepEqual(commands.help(), [
    { group: 'WANDER', rows: [{ help: 'W A S D', label: 'walk' }, { help: 'M', label: 'map' }] },
    { group: 'BUILD', rows: [{ help: '1 – 8', label: 'pick a tool' }] },
    { group: 'LOOK', rows: [{ help: 'P', label: 'pixel art on / off' }, { help: '[ ]', label: 'pixel size' }] },
  ]);
});

test('two features wanting the same key are told', (t) => {
  const warned = [];
  t.mock.method(console, 'warn', (msg) => warned.push(msg));
  const commands = new Commands();
  commands.add({ id: 'map', keys: ['KeyM'], run() {} });
  commands.add({ id: 'music', keys: ['KeyM'], run() {} });
  assert.match(warned[0], /KeyM.*"map".*"music"/);
});

test('a system that keeps failing is stopped; the rest carry on', (t) => {
  t.mock.method(console, 'error', () => {});
  const game = new Game();
  let drawn = 0;
  let faulted = null;
  game.addSystem({ name: 'fox', phase: 'world', update: () => { throw new Error('lost in the bracken'); } });
  game.addSystem({ name: 'draw', phase: 'render', update: () => drawn++ });
  game.on('fault', (s) => void (faulted = s.name));
  for (let i = 1; i <= 8; i++) game.tick(i * 16);
  assert.equal(drawn, 8, 'the picture never stopped');
  assert.equal(faulted, 'fox');
  assert.equal(game.systems.world[0].off, true);
});

test('something can cover the view', () => {
  const game = new Game();
  let mapOpen = false;
  game.coverWhen(() => mapOpen);
  assert.equal(game.covered, false);
  mapOpen = true;
  assert.equal(game.covered, true);
});

test('an emitter tells everyone, in order, and lets them leave', () => {
  const e = new Emitter();
  const heard = [];
  const off = e.on('crash', (what) => heard.push(`a:${what}`));
  e.on('crash', (what) => heard.push(`b:${what}`));
  e.once('crash', (what) => heard.push(`once:${what}`));
  assert.equal(e.hears('crash'), true);
  e.emit('crash', 'pine');
  off();
  e.emit('crash', 'oak');
  assert.deepEqual(heard, ['a:pine', 'b:pine', 'once:pine', 'b:oak']);
  assert.equal(e.hears('thud'), false);
});

test('settings are remembered, unless you ask to start fresh', () => {
  const storage = memoryStorage({ 'my-world:settings': { softness: 0.3, sound: false, pixelSize: 'big' } });
  const settings = new Settings(storage, 'my-world:settings');
  assert.equal(settings.get('softness', 'number'), 0.3);
  assert.equal(settings.get('sound', 'boolean'), false);
  assert.equal(settings.get('pixelSize', 'number'), undefined, 'the wrong kind of value is not believed');
  settings.set('outline', 0);
  assert.deepEqual(storage.get('my-world:settings'), { softness: 0.3, sound: false, pixelSize: 'big', outline: 0 });
  const fresh = new Settings(storage, 'my-world:settings', { fresh: true });
  assert.equal(fresh.get('softness', 'number'), undefined);
});
