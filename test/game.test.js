// The frame: phases in order, features installing themselves, keys as
// commands, and one bad system not taking the game down with it.

import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, PHASES } from '../src/game/game.ts';
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

test('a mode has the keys to itself: its own commands run, the forest\'s don\'t, and some run whatever', () => {
  const commands = new Commands();
  const input = keys();
  const ran = [];
  commands.add({ id: 'home', keys: ['KeyR'], run: () => ran.push('home') });
  commands.add({ id: 'reload', keys: ['KeyR'], mode: 'arena', run: () => ran.push('reload') });
  commands.add({ id: 'help', keys: ['KeyH'], mode: 'any', run: () => ran.push('help') });
  commands.add({ id: 'crouch', keys: ['KeyC'], mode: 'arena', hold: () => ran.push('crouch') });
  const press = (code) => {
    input.press(code);
    commands.update(input, 0.016);
    input.endFrame();
  };
  press('KeyR');
  press('KeyH');
  assert.deepEqual(ran, ['home', 'help'], 'in the forest, the forest\'s');
  ran.length = 0;
  commands.mode = 'arena';
  press('KeyR');
  press('KeyH');
  input.hold('KeyC');
  commands.update(input, 0.016);
  assert.deepEqual(ran, ['reload', 'help', 'crouch'], 'in the arena, the arena\'s');
  ran.length = 0;
  commands.mode = null;
  commands.update(input, 0.016);
  assert.deepEqual(ran, [], 'and its held keys do nothing outside it');
  // two commands on one key is a mistake only if they could both run
  const warned = [];
  const warn = console.warn;
  console.warn = (msg) => warned.push(msg);
  try {
    commands.add({ id: 'map', keys: ['KeyM'], run() {} });
    commands.add({ id: 'mark', keys: ['KeyM'], mode: 'arena', run() {} });
    assert.deepEqual(warned, [], 'the same key in two modes is fine');
    commands.add({ id: 'mute', keys: ['KeyM'], mode: 'any', run() {} });
    commands.add({ id: 'again', keys: ['KeyR'], run() {} });
    commands.add({ id: 'hint', keys: ['KeyH'], mode: 'arena', run() {} });
  } finally {
    console.warn = warn;
  }
  assert.equal(warned.length, 3, 'with one that runs in any mode, or another of its own, it isn\'t');
  assert.match(warned[1], /key KeyR is bound to both "home" and "again"/);
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

test('what there is to do is on offer without its key, with what it would do now', () => {
  const commands = new Commands();
  let afloat = false;
  let beside = false;
  commands.add({ id: 'tube', keys: ['KeyV', 'PadR3'], group: 'RIVER', label: 'inner tube', run() {}, now: () => (afloat ? 'get out' : beside ? 'float' : '') });
  commands.add({ id: 'pixels', keys: ['KeyP'], group: 'LOOK', label: 'pixel art on / off', run() {} });
  commands.add({ id: 'map', keys: ['KeyM'], group: 'WANDER', help: 'M', label: 'map', run() {} });
  commands.add({ id: 'secret', keys: ['KeyZ'], run() {} }); // no label: not on offer
  commands.add({ id: 'talk', keys: ['KeyC'], group: 'TALK', label: 'talk', run() {}, hold() {} }); // held, and doesn't say what a press does
  commands.add({ id: 'calm', keys: ['KeyX'], group: 'RIVER', label: 'calm it', run() {}, hold() {}, now: () => 'calm' }); // held, but says
  const offers = () => commands.offers().map((o) => ({ ...o }));
  // group by group as the help panel has them: the ones it knows first, then as they came
  assert.deepEqual(offers(), [
    { id: 'map', group: 'WANDER', label: 'map', help: 'M', word: null },
    { id: 'pixels', group: 'LOOK', label: 'pixel art on / off', help: 'P', word: null },
    { id: 'tube', group: 'RIVER', label: 'inner tube', help: 'V', pad: ['PadR3'], word: '' },
    { id: 'calm', group: 'RIVER', label: 'calm it', help: 'X', word: 'calm' },
  ]);
  beside = true;
  assert.equal(offers().find((o) => o.id === 'tube').word, 'float', 'the word is as things are now');
  afloat = true;
  assert.equal(offers().find((o) => o.id === 'tube').word, 'get out');
  // and what is added later is on offer too
  commands.add({ id: 'home', keys: ['KeyR'], group: 'WANDER', label: 'back to the start', run() {} });
  assert.deepEqual(offers().map((o) => o.id), ['map', 'home', 'pixels', 'tube', 'calm']);
});

test('a command needs no key: it is on offer, and has no line on the help panel', () => {
  const commands = new Commands();
  let waved = 0;
  commands.add({ id: 'map', keys: ['KeyM'], group: 'WANDER', label: 'map', run() {} });
  commands.add({ id: 'wave', group: 'WANDER', label: 'wave to whoever is about', run: () => waved++, now: () => 'wave' });
  assert.deepEqual(commands.help(), [{ group: 'WANDER', rows: [{ help: 'M', label: 'map' }] }]);
  assert.deepEqual({ ...commands.offers()[1] }, { id: 'wave', group: 'WANDER', label: 'wave to whoever is about', help: '', word: 'wave' });
  commands.update(keys(), 0.016);
  assert.equal(waved, 0, 'no key runs it');
  commands.run('wave');
  assert.equal(waved, 1, 'whoever offers it does');
});

test('a press from a button on the screen runs it once, and holds it until it is let go', () => {
  const commands = new Commands();
  const input = keys();
  let ran = 0;
  const held = [];
  commands.add({ id: 'calm', keys: ['KeyZ'], run: () => ran++, hold: (dt, key) => held.push(key) });
  commands.add({ id: 'map', keys: ['KeyM'], run() {} }); // nothing to hold: pressing it is only running it
  commands.press('calm');
  commands.press('map');
  assert.equal(ran, 1, 'it runs on the press');
  commands.update(input, 0.016);
  commands.update(input, 0.016);
  assert.deepEqual(held, [null, null], 'and is held each frame after, with no key to name');
  assert.equal(ran, 1, 'without running again');
  input.hold('KeyZ');
  commands.update(input, 0.016);
  assert.deepEqual(held.slice(2), ['KeyZ', null], 'beside its key, if that is down too');
  commands.release('calm');
  commands.release('map');
  input.endFrame();
  commands.update(keys(), 0.016);
  assert.equal(held.length, 4, 'let go, it is held no longer');
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
