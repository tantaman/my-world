// Your pack (src/pack/): the list of what there is to do, laid out with what
// is at hand first, the buttons a touch screen has for what is at hand, and
// the list of what's yours.
// What the commands themselves say (now, offers, press) is in game.test.js.

import test from 'node:test';
import assert from 'node:assert/strict';
import { Commands } from '../src/game/commands.js';
import { pages, shown } from '../src/pack/book.js';
import { HandButtons } from '../src/pack/buttons.js';
import { Things, told, materials } from '../src/pack/things.js';
import { Inventory } from '../src/build/inventory.js';

// The commands a few features might bind, and the state they read.
function someCommands() {
  const at = { boat: false, afloat: false, roast: 0 };
  const done = [];
  const commands = new Commands();
  const add = (c) => commands.add({ run: () => done.push(c.id), ...c });
  add({ id: 'pack', keys: ['Tab', 'PadL3'], group: 'WANDER', label: 'your pack' });
  add({ id: 'map', keys: ['KeyM', 'PadSelect'], group: 'WANDER', label: 'map · mark places' });
  add({ id: 'boat', keys: ['KeyF'], group: 'BOATS', help: 'F', label: 'get into the boat beside you · get out of it', now: () => (at.afloat ? 'get out' : at.boat ? 'get in' : '') });
  add({ id: 'eat', keys: ['KeyU'], group: 'HUNT', label: "eat something you've roasted", now: () => (at.roast > 0 ? 'eat' : '') });
  add({ id: 'settings', keys: ['KeyO'], group: 'LOOK', label: 'settings' });
  add({ id: 'wave', group: 'WANDER', label: 'wave to whoever is about' });
  return { commands, at, done };
}

test('the pack lists everything there is to do, under the help panel\'s headings', () => {
  const { commands } = someCommands();
  assert.deepEqual(pages(commands.offers(), 'pack'), {
    hand: [],
    rest: [
      {
        group: 'WANDER',
        rows: [
          { id: 'map', word: '', label: 'map · mark places', help: 'M', pad: ['PadSelect'] },
          { id: 'wave', word: '', label: 'wave to whoever is about', help: '' },
        ],
      },
      { group: 'LOOK', rows: [{ id: 'settings', word: '', label: 'settings', help: 'O' }] },
      { group: 'BOATS', rows: [{ id: 'boat', word: '', label: 'get into the boat beside you · get out of it', help: 'F' }] },
      { group: 'HUNT', rows: [{ id: 'eat', word: '', label: "eat something you've roasted", help: 'U' }] },
    ],
  });
  // the pack itself is in the list unless it's left out
  assert.equal(pages(commands.offers()).rest[0].rows[0].id, 'pack');
});

test('what is at hand comes first, named for what it would do', () => {
  const { commands, at } = someCommands();
  at.boat = true;
  at.roast = 2;
  const book = pages(commands.offers(), 'pack');
  assert.deepEqual(book.hand, [
    { id: 'boat', word: 'get in', label: 'get into the boat beside you · get out of it', help: 'F' },
    { id: 'eat', word: 'eat', label: "eat something you've roasted", help: 'U' },
  ]);
  assert.deepEqual(book.rest.map((g) => [g.group, g.rows.map((r) => r.id)]), [['WANDER', ['map', 'wave']], ['LOOK', ['settings']]], 'and is not listed twice');
  at.afloat = true;
  assert.equal(pages(commands.offers(), 'pack').hand[0].word, 'get out');
});

test('the rows are copies: the list doesn\'t change under whoever is reading it', () => {
  const { commands, at } = someCommands();
  at.boat = true;
  const book = pages(commands.offers(), 'pack');
  at.boat = false;
  commands.offers();
  assert.equal(book.hand[0].word, 'get in');
});

test('the list is written again only when what it shows changes', () => {
  const { commands, at } = someCommands();
  const was = shown(commands.offers());
  assert.equal(shown(commands.offers()), was, 'nothing changed');
  at.boat = true;
  const beside = shown(commands.offers());
  assert.notEqual(beside, was, 'something came to hand');
  at.afloat = true;
  assert.notEqual(shown(commands.offers()), beside, 'or it would do something else now');
});

// ── On a touch screen ───────────────────────────────────────────────────────
// A page with just enough to it: elements that can be made, hidden, put
// first in another, and pressed.
function page(t) {
  const element = () => {
    const heard = {};
    return {
      hidden: false,
      textContent: '',
      dataset: {},
      children: [],
      addEventListener: (type, fn) => void (heard[type] = fn),
      prepend(el) {
        this.children.unshift(el);
      },
      fire: (type) => heard[type]({ preventDefault() {}, stopPropagation() {} }),
    };
  };
  const had = globalThis.document;
  globalThis.document = { createElement: element };
  t.after(() => void (globalThis.document = had));
  return element();
}

test('on a touch screen, what is at hand has a button, named for what it would do', (t) => {
  const root = page(t);
  const { commands, at, done } = someCommands();
  const buttons = new HandButtons({ root, press: (id) => commands.press(id), release: (id) => commands.release(id) });
  const seen = () => root.children.filter((b) => !b.hidden).map((b) => [b.dataset.do, b.textContent]);

  buttons.show(commands.offers(), true);
  assert.deepEqual(seen(), [], 'nothing at hand, no buttons');
  assert.deepEqual(root.children.map((b) => b.dataset.do), ['eat', 'boat'], 'one is ready for each thing that says what it would do, and none for what never does');

  at.boat = true;
  buttons.show(commands.offers(), true);
  assert.deepEqual(seen(), [['boat', 'get in']]);
  at.afloat = true;
  at.roast = 1;
  buttons.show(commands.offers(), true);
  assert.deepEqual(seen(), [['eat', 'eat'], ['boat', 'get out']], 'the word is as things are now, and the buttons keep their places');

  root.children[1].fire('pointerdown');
  assert.deepEqual(done, ['boat'], 'a press does it');
  root.children[1].fire('pointerup');

  buttons.show(commands.offers(), false);
  assert.deepEqual(seen(), [], 'and there are none while something has the screen (the pack, open)');
});

test('a button held is the key held, until the finger comes up or what it was for has gone', (t) => {
  const root = page(t);
  let wild = true;
  let held = 0;
  const commands = new Commands();
  commands.add({ id: 'mount', keys: ['KeyZ'], group: 'WANDER', label: 'ride', run() {}, hold: () => held++, now: () => (wild ? 'calm' : '') });
  const buttons = new HandButtons({ root, press: (id) => commands.press(id), release: (id) => commands.release(id) });
  const frame = () => {
    commands.update({ wasPressed: () => false, down: () => false }, 0.016);
    buttons.show(commands.offers(), true);
  };
  frame();
  const [button] = root.children;
  button.fire('pointerdown');
  frame();
  frame();
  assert.equal(held, 2, 'held each frame the finger is down');
  button.fire('pointerup');
  frame();
  assert.equal(held, 2, 'and let go when it comes up');

  // the horse bolts with a finger still on the button
  button.fire('pointerdown');
  frame();
  wild = false;
  frame();
  assert.equal(button.hidden, true);
  frame();
  frame();
  assert.equal(held, 4, 'the button going lets go of it too');
});

// ── What's yours ────────────────────────────────────────────────────────────

test('what is yours is whatever the features say you have, asked when it is looked into', () => {
  const things = new Things();
  const jets = { worn: false };
  const tame = [];
  things.add(() => (jets.worn ? [{ label: 'a jetpack', note: 'on your back' }] : null));
  things.add(() => tame.map((kind) => ({ label: `your ${kind}` })));
  assert.deepEqual(things.list(), [], 'nothing yet');
  jets.worn = true;
  tame.push('horse', 'eagle');
  assert.deepEqual(things.list(), [
    { label: 'a jetpack', note: 'on your back' },
    { label: 'your horse', note: '' },
    { label: 'your eagle', note: '' },
  ], 'in the order their sources were added');
  jets.worn = false;
  assert.deepEqual(things.list().map((t) => t.label), ['your horse', 'your eagle'], 'and nothing is kept of what was');
});

test('a source that says nothing, or something that is not a thing, adds nothing', () => {
  const things = new Things();
  things.add(() => undefined);
  things.add(() => [null, { note: 'no name to it' }, { label: 'stone', note: 3 }]);
  assert.deepEqual(things.list(), [{ label: 'stone', note: '3' }], 'what is listed is words');
  assert.throws(() => things.add([{ label: 'a flag' }]), /is a function/);
});

test('what is yours is written again only when it changes', () => {
  const things = new Things();
  let far = 240;
  things.add(() => [{ label: 'your horse', note: `about ${far} m to the north` }]);
  const was = told(things.list());
  assert.equal(told(things.list()), was);
  far = 250;
  assert.notEqual(told(things.list()), was);
});

test('the materials you carry are yours, as the line on the HUD has them', () => {
  const stock = new Inventory();
  stock.define({ id: 'fish', label: 'fish', optional: true });
  stock.gain('log', 4.25);
  stock.gain('stone', 3);
  assert.deepEqual(materials(stock), [
    { label: 'logs', note: '4.3 m' },
    { label: 'timber', note: '0 m' },
    { label: 'stone', note: '3' },
    { label: 'soil', note: '0.0 m³' },
  ], 'what most people never carry is left out until there is some');
  assert.equal(materials(stock).map((t) => `${t.label} ${t.note}`).join(' · '), stock.line(), 'the same things, in the same words');
  stock.gain('fish', 2);
  assert.deepEqual(materials(stock).at(-1), { label: 'fish', note: '2' });
  assert.deepEqual(materials(new Inventory({ creative: true })), [{ label: 'materials', note: 'unlimited' }], 'building without gathering, there is nothing to count');
});
