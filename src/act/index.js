// Acting on what's at hand: one key for it, whatever it is. F on a keyboard,
// Y on a game controller, a button on a touch screen: into a car, a boat or a
// train and out again, onto your horse and off, out of your tube, the jetpack
// off its rack, aboard the rocket, a movie rented at the counter, a shotgun
// from the steward, a car off a dealer's lot. Whatever is at hand says so in
// the prompt with the same key, so it's always the one to try.
//
//   offers.js   what could be done, and which of it the key does: the nearest
//
// A feature offers what it would do, and the key does the nearest of them.
// It keeps its own key as well, if it has one, for the other things it does
// (Z whistles for your mount, Y lists the stations).
//
//   game.act.offer({ id, at })   at() -> null, or { d (m from you; 0 if you're
//                                in or on it), word ('get in'), run() }
//   game.act.key(word)    how a prompt names the key: <b>F</b>, or on a touch
//                         screen the word on its button
//   game.act.here()       what the key would do now, or null
//
// From the console:
//   world.act.here()      what F would do
//   world.act.press()     do it

import { Offers } from './offers.js';

// The features this uses, so it is installed after them (game/features.js):
// the keys are read and the touch buttons kept by the player and the HUD.
export const after = ['ui', 'player'];
export function installAct(game) {
  const { input, commands } = game;
  const offers = new Offers();

  commands.add({ id: 'act', keys: ['KeyF', 'PadY'], group: 'WANDER', help: 'F', label: 'act on what’s at hand: get in or out, on or off · ride · buy, rent, ask', run: () => offers.press() });

  // On a touch screen, one button for it, named for what it would do.
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.id = 'act-do';
  btn.hidden = true;
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    offers.press();
  });
  document.getElementById('touch-act')?.prepend(btn);
  game.addSystem({
    name: 'act',
    phase: 'late',
    update() {
      const a = input.isTouch ? offers.here() : null;
      btn.hidden = !a || !a.word;
      if (a && a.word && btn.textContent !== a.word) btn.textContent = a.word;
    },
  });

  game.provide('act', {
    offers,
    offer: (o) => offers.offer(o),
    here: () => offers.here(),
    press: () => offers.press(),
    key: (word) => (input.isTouch ? word : 'F'),
  });
}
