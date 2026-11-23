// Your pack: everything there is to do, and what's yours, in one place, each
// in its picture.
//
// Every feature binds its own keys, and there are more things to do than
// keys to do them with: the letters are all taken, a pad's buttons too, and a
// touch screen has none. So the commands say what they would do here and now
// (`now`, in src/game/commands.js), and this feature offers them without
// their keys, two ways:
//
//   the pack (Tab)   a list of all of them, each a button that does it, what
//                    is at hand first. L3 on a pad; with a mouse or a finger,
//                    the line that says what you carry opens it
//   a touch screen   a button for each thing at hand, named for what it
//                    would do, while it would do it
//   a pad            a line saying what is at hand that the pad has no
//                    button for, beside the button that opens the pack
//
// So a new feature's command needs no key at all, and nothing here knows
// which features there are: it reads the commands.
//
// The pack also lists what's yours: what you carry of each material, and
// whatever else you have come by (a jetpack, a horse, a rented tape). The
// materials are read off the builder's stock; a feature with something else
// to have says so:
//
//   game.pack.have(() => (worn ? [{ label: 'a jetpack', note: 'on your back', icon: JETPACK }] : null));
//
// It is a list to look at, not a store: each feature keeps and saves what it
// gave you, as before (things.js).
//
// Everything in it is drawn in pixel art, in the pack's colours (picture.js):
// each feature draws what is its own, in a pictures.js of its own, and hands
// it over with what it is (a command's `icon`, a thing's, a material's, an
// act offer's).
//
//   book.js      the list, laid out: at hand, then the rest under their headings
//   things.js    what's yours: who says so, and the materials
//   picture.js   pixel art in the pack's colours
//   pictures.js  the pack's own: itself, and what stands in for a picture
//   panel.js     the pack on the screen
//   buttons.js   the buttons on a touch screen
//
// From the console:
//   world.pack.open() / close()
//   world.pack.list()     -> { hand: [{ id, word, label, help }], yours: [{ label, note }], rest: [{ group, rows }] }
//                         in words: the pictures are on the screen
//   world.pack.do(id)     as picking its row would

import { pages, shown } from './book.js';
import { Things, told, materials } from './things.js';
import { PackPanel } from './panel.js';
import { HandButtons } from './buttons.js';
import { url } from './picture.js';
import { BACKPACK } from './pictures.js';
import './pack.css';

const KEY = 'Tab';
const PAD = 'PadL3'; // ...and on a pad

// The features this uses, so it is installed after them (game/features.js).
export const after = ['ui', 'player', 'build'];
export function installPack(game) {
  const { hud, input, commands, builder } = game;

  // Everything on offer but the pack itself: it is what they are listed in.
  const book = () => pages(commands.offers(), 'pack');

  // What's yours: the materials first, then what other features say you have.
  const things = new Things();
  things.add(() => materials(builder.stock));

  // ── The pack ──────────────────────────────────────────────────────────────
  // A row's key, as whoever is playing would press it: a pad's button, a
  // key, or on a touch screen nothing.
  const keyOf = (row) => {
    if (input.padInUse) return row.pad ? row.pad.map((code) => input.pads.name(code)).join(' · ') : '';
    return input.isTouch ? '' : row.help;
  };
  const panel = new PackPanel({ book, yours: () => things.list(), keyOf, onDo: (id) => commands.run(id), input, key: KEY });

  // One panel at a time: opening this one closes whatever else is up.
  const toggle = () => {
    if (!panel.isOpen) {
      if (panel.shutByKey) return; // the press that shut it, still held
      game.emit('panel', 'pack');
    }
    panel.toggle();
  };
  game.on('panel', (which) => which !== 'pack' && panel.close());
  commands.add({ id: 'pack', keys: [KEY, PAD], group: 'WANDER', label: 'your pack · everything there is to do, and what’s yours', icon: BACKPACK, run: toggle });

  // Tab is the browser's key for going from button to button. While the game
  // has the keyboard it is the pack's instead (an open panel keeps its own).
  addEventListener('keydown', (e) => {
    if (e.code !== KEY || input.blocked) return;
    const typing = e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA');
    if (!typing) e.preventDefault();
  });
  addEventListener('keyup', (e) => {
    if (e.code === KEY) panel.shutByKey = false;
  });
  addEventListener('blur', () => (panel.shutByKey = false));

  // For a mouse or a finger, the line at the top that says what you carry is
  // the pack's handle (pack.css marks it as one, with the pack's picture).
  // Not a button in the corner with the others: along the bottom the tool
  // bar has left no room for one.
  const line = document.getElementById('inv');
  if (line) {
    line.style.setProperty('--pack-pic', `url("${url(BACKPACK)}")`);
    line.setAttribute('role', 'button');
    line.setAttribute('aria-label', 'Your pack: everything there is to do, and what’s yours');
    hud.button('inv', toggle);
  }

  // ── On a touch screen ─────────────────────────────────────────────────────
  const buttons = new HandButtons({
    root: document.getElementById('touch-act'),
    press: (id) => commands.press(id),
    release: (id) => commands.release(id),
  });

  // ── With a pad in hand ────────────────────────────────────────────────────
  // A pad has a button for only some of what there is to do. Whatever is at
  // hand that it has none for is said beside the pack's own button, which is
  // how it is done: "L3 · get in · eat".
  const hand = document.createElement('div');
  hand.id = 'pack-hand';
  hand.hidden = true;
  const handKey = hand.appendChild(document.createElement('b'));
  const handWords = hand.appendChild(document.createElement('span'));
  (document.getElementById('hud') || document.body).appendChild(hand);
  let handSaid = '';
  function sayHand(all) {
    let words = '';
    if (input.padInUse && !panel.isOpen) for (const o of all) if (o.word && !o.pad) words += ` · ${o.word}`;
    if (words === handSaid) return;
    handSaid = words;
    hand.hidden = !words;
    handKey.textContent = input.pads.name(PAD);
    handWords.textContent = words;
  }

  game.provide('pack', {
    open: () => void (panel.isOpen || toggle()),
    close: () => panel.close(),
    get isOpen() {
      return panel.isOpen;
    },
    list: () => {
      const { hand, rest } = book();
      const words = ({ icon, ...row }) => row;
      return { hand: hand.map(words), rest: rest.map((g) => ({ group: g.group, rows: g.rows.map(words) })), yours: things.list().map(({ label, note }) => ({ label, note })) };
    },
    do: (id) => commands.run(id),
    // something you have, listed under what's yours: () => [{ label, note, icon }] (things.js)
    have: (source) => things.add(source),
  });

  // Late, once everything has said what it would do this frame.
  let wrote = '';
  let wroteYours = '';
  game.addSystem({
    name: 'pack',
    phase: 'late',
    update() {
      if (!input.isTouch && !input.padInUse && !panel.isOpen && !handSaid) return;
      const all = commands.offers();
      if (input.isTouch) buttons.show(all, !panel.isOpen);
      sayHand(all);
      if (!panel.isOpen) return;
      // what is at hand changes as the world goes on behind the panel
      const now = shown(all);
      if (now !== wrote) panel.render();
      wrote = now;
      const yours = told(things.list());
      if (yours !== wroteYours) panel.renderYours();
      wroteYours = yours;
    },
  });
}
