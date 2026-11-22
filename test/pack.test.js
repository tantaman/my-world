// Your pack (src/pack/): the list of what there is to do, laid out with what
// is at hand first, the buttons a touch screen has for what is at hand, the
// list of what's yours, and the pictures everything in it is drawn in.
// What the commands themselves say (now, offers, press) is in game.test.js.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, existsSync } from 'node:fs';
import { Commands } from '../src/game/commands.js';
import { pages, shown, parts } from '../src/pack/book.js';
import { HandButtons } from '../src/pack/buttons.js';
import { Things, told, materials } from '../src/pack/things.js';
import { parse, svg, url, tag, PALETTE } from '../src/pack/picture.js';
import { Inventory } from '../src/build/inventory.js';

// Two pictures, as a feature would draw them.
const BOAT = `
  ......
  .w..w.
  .wwww.
  ......
`;
const PIE = `
  ......
  .yyyy.
  .oooo.
  ......
`;

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
    let text = '';
    return {
      hidden: false,
      dataset: {},
      children: [],
      get textContent() {
        return text + this.children.map((c) => c.textContent).join('');
      },
      set textContent(v) {
        text = v;
        this.children = [];
      },
      addEventListener: (type, fn) => void (heard[type] = fn),
      prepend(el) {
        this.children.unshift(el);
      },
      appendChild(el) {
        this.children.push(el);
        return el;
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

test('a button on a touch screen has the picture of what it would do', (t) => {
  const root = page(t);
  const commands = new Commands();
  let at = BOAT;
  commands.add({ id: 'act', keys: ['KeyF'], group: 'WANDER', label: 'act', run() {}, now: () => (at ? 'get in' : ''), icon: () => at });
  commands.add({ id: 'eat', keys: ['KeyU'], group: 'HUNT', label: 'eat', run() {}, now: () => 'eat' });
  const buttons = new HandButtons({ root, press() {}, release() {} });
  const pictures = () => root.children.map((b) => [b.dataset.do, b.children[0].hidden ? null : b.children[0].src]);
  buttons.show(commands.offers(), true);
  assert.deepEqual(pictures(), [['eat', null], ['act', url(BOAT)]], 'one with none has only its word');
  at = PIE;
  buttons.show(commands.offers(), true);
  assert.equal(pictures()[1][1], url(PIE), 'and it changes with what is at hand');
});

test('somewhere with keys of its own, its things are what is at hand, and the forest\'s aren\'t', (t) => {
  const root = page(t);
  const { commands, at, done } = someCommands();
  let low = true;
  commands.add({ id: 'reload', keys: ['KeyR'], mode: 'arena', group: 'ARENA', label: 'reload', run: () => done.push('reload'), now: () => (low ? 'reload' : '') });
  const buttons = new HandButtons({ root, press: (id) => commands.press(id), release: (id) => commands.release(id) });
  const seen = () => root.children.filter((b) => !b.hidden).map((b) => [b.dataset.do, b.textContent]);
  const ids = () => pages(commands.offers(), 'pack').rest.flatMap((g) => g.rows.map((r) => r.id));
  at.boat = true;
  buttons.show(commands.offers(), true);
  assert.deepEqual(seen(), [['boat', 'get in']], 'in the forest, the forest\'s');
  assert.ok(!ids().includes('reload'), 'and the arena\'s aren\'t in the pack');
  commands.mode = 'arena';
  buttons.show(commands.offers(), true);
  assert.deepEqual(seen(), [['reload', 'reload']], 'in the arena, the arena\'s: the boat\'s button has gone, though the boat is still there');
  assert.deepEqual(pages(commands.offers(), 'pack').hand.map((r) => r.id), ['reload']);
  assert.ok(!ids().includes('map'));
  low = false;
  buttons.show(commands.offers(), true);
  assert.deepEqual(seen(), []);
  commands.mode = null;
  buttons.show(commands.offers(), true);
  assert.deepEqual(seen(), [['boat', 'get in']], 'and back out, as it was');
  assert.ok(ids().includes('map') && !ids().includes('reload'));
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
  assert.deepEqual(things.list().map((t) => [t.label, t.note]), [
    ['a jetpack', 'on your back'],
    ['your horse', ''],
    ['your eagle', ''],
  ], 'in the order their sources were added');
  jets.worn = false;
  assert.deepEqual(things.list().map((t) => t.label), ['your horse', 'your eagle'], 'and nothing is kept of what was');
});

test('a source that says nothing, or something that is not a thing, adds nothing', () => {
  const things = new Things();
  things.add(() => undefined);
  things.add(() => [null, { note: 'no name to it' }, { label: 'stone', note: 3 }]);
  assert.deepEqual(things.list(), [{ label: 'stone', note: '3', icon: null, empty: false }], 'what is listed is words');
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
  const said = () => materials(stock).map((t) => [t.label, t.note]);
  assert.deepEqual(said(), [
    ['logs', '4.3 m'],
    ['timber', '0 m'],
    ['stone', '3'],
    ['soil', '0.0 m³'],
  ], 'what most people never carry is left out until there is some');
  assert.equal(materials(stock).map((t) => `${t.label} ${t.note}`).join(' · '), stock.line(), 'the same things, in the same words');
  stock.gain('fish', 2);
  assert.deepEqual(said().at(-1), ['fish', '2']);
  assert.deepEqual(materials(new Inventory({ creative: true })).map((t) => [t.label, t.note]), [['materials', 'unlimited']], 'building without gathering, there is nothing to count');
});

test('each material is in the picture it was defined with, greyed while you have none', () => {
  const stock = new Inventory();
  stock.define({ id: 'pie', label: 'pie', optional: true, icon: PIE });
  stock.gain('log', 2);
  stock.gain('pie', 1);
  const things = materials(stock);
  assert.ok(things.every((t) => t.icon), 'the four everyone has are drawn (build/pictures.js)');
  assert.equal(things.find((t) => t.label === 'pie').icon, PIE, 'and one a feature adds, as it drew it');
  assert.deepEqual(things.filter((t) => t.empty).map((t) => t.label), ['timber', 'stone', 'soil'], 'what you have none of is listed, greyed');
  assert.ok(materials(new Inventory({ creative: true }))[0].icon, 'building without gathering has a picture too');
});

test('what is yours comes in its picture, and is written again when that changes', () => {
  const things = new Things();
  let mine = BOAT;
  things.add(() => [{ label: 'your boat', icon: mine }, { label: 'a pie' }]);
  assert.deepEqual(things.list().map((t) => t.icon), [BOAT, null], 'and nothing where it has none: the pack draws something in its place');
  const was = told(things.list());
  mine = PIE;
  assert.notEqual(told(things.list()), was);
});

// ── Pictures ────────────────────────────────────────────────────────────────

test('a picture is rows of letters, each a colour of the pack’s, with the outline drawn round it', () => {
  const p = parse(BOAT);
  assert.deepEqual({ w: p.w, h: p.h }, { w: 6, h: 4 });
  assert.deepEqual(p.rows, ['.#..#.', '#w##w#', '#wwww#', '.####.'], 'every clear pixel beside the picture is outline, but not those only corner to corner');
  assert.equal(parse(BOAT), p, 'read once');
  assert.throws(() => parse('..\n...'), /row 2 of a picture is 3 long, not 2/);
  assert.throws(() => parse('.z.'), /"z" in row 1 of a picture is not a colour/);
  assert.throws(() => parse('\n  \n'), /no rows/);
  assert.throws(() => parse(['.w.']), /a string/);
  for (const ch of Object.keys(PALETTE)) assert.match(PALETTE[ch], /^#[0-9a-f]{6}$/, `${ch} is a colour`);
});

test('a picture is drawn a run of a colour at a time, and its URL made once', () => {
  const drawn = svg(PIE);
  assert.match(drawn, /^<svg [^>]*viewBox="0 0 6 4"/);
  assert.equal((drawn.match(/<rect /g) || []).length, 1 + 3 + 3 + 1, 'one rect for each run of a colour along a row (the outline, yellow, the outline …), and none for nothing');
  assert.ok(drawn.includes(`<rect x="1" y="1" width="4" height="1" fill="${PALETTE.y}"/>`));
  assert.equal(url(PIE), url(PIE));
  assert.ok(url(PIE).startsWith('data:image/svg+xml,'));
  assert.equal(tag(PIE), tag(`${PIE}`), 'the same picture has the same tag');
  assert.notEqual(tag(PIE), tag(BOAT));
});

test('every picture a feature draws is in the pack’s colours, and the size the pack lays out', async () => {
  const src = new URL('../src/', import.meta.url);
  let drawn = 0;
  for (const feature of readdirSync(src)) {
    const file = new URL(`${feature}/pictures.js`, src);
    if (!existsSync(file)) continue;
    for (const [name, art] of Object.entries(await import(file))) {
      const p = parse(art);
      assert.deepEqual([p.w, p.h], [16, 16], `${feature}/pictures.js: ${name} is 16 × 16`);
      drawn++;
    }
  }
  assert.ok(drawn > 30, `(${drawn} of them)`);
});

// ── What a row says ─────────────────────────────────────────────────────────

test('a row says what it is, then the rest of its label', () => {
  assert.deepEqual(parts('map · mark places · where to go'), ['map', 'mark places · where to go']);
  assert.deepEqual(parts('railway: the stations to go to'), ['railway', 'the stations to go to']);
  assert.deepEqual(parts('whistle for your mount · with none yet: where to look for one'), ['whistle for your mount', 'with none yet: where to look for one'], 'from whichever comes first');
  assert.deepEqual(parts('back to the start'), ['back to the start', '']);
  assert.deepEqual(parts('headlamp on / off'), ['headlamp on / off', '']);
});

test('a command’s picture goes with its row, and one of what is at hand changes with it', () => {
  const commands = new Commands();
  let at = null;
  commands.add({ id: 'boat', group: 'WANDER', label: 'a boat', icon: BOAT, run() {} });
  commands.add({ id: 'act', group: 'WANDER', label: 'act on it', run() {}, now: () => (at ? 'get in' : ''), icon: () => at });
  commands.add({ id: 'wave', group: 'WANDER', label: 'wave', run() {} });
  let book = pages(commands.offers());
  assert.deepEqual(book.rest[0].rows.map((r) => [r.id, r.icon ?? 'none']), [['boat', BOAT], ['act', 'none'], ['wave', 'none']]);
  at = BOAT;
  const beside = shown(commands.offers());
  book = pages(commands.offers());
  assert.deepEqual(book.hand.map((r) => [r.id, r.word, r.icon]), [['act', 'get in', BOAT]]);
  at = PIE;
  assert.notEqual(shown(commands.offers()), beside, 'the same word, said of something else: written again');
});
