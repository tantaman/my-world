// Acting on what's at hand: one key for it, whatever it is. F on a keyboard,
// Y on a game controller, at hand in the pack (and so a button on a touch
// screen, named for what it would do): into a car, a boat or a
// train and out again, onto your horse and off, out of your tube, the jetpack
// off its rack, aboard the rocket, a movie rented at the counter, a shotgun
// from the steward, a car off a dealer's lot. Whatever is at hand says so in
// the prompt with the same key, so it's always the one to try.
//
//   offers.js   what could be done, and which of it the key does: the nearest
//
// A feature offers what it would do, and the key does the nearest of them.
// Nothing else does these things: a feature's own key, if it has one, is for
// the other things it does (Z whistles for your mount, Y lists the stations).
//
//   game.act.offer({ id, at })   at() -> null, or { d (m from you; 0 if you're
//                                in or on it), word ('get in'), run(),
//                                hold(dt) if it's done by holding the key, and
//                                icon, a picture of what it's done to }
//   game.act.key(word)    how a prompt names the key: <b>F</b>, or on a touch
//                         screen the word on its button
//   game.act.here()       what the key would do now, or null
//
// From the console:
//   world.act.here()      what F would do
//   world.act.press()     do it

import { Offers } from './offers.js';
import * as pictures from './pictures.js';

const NOTHING_MS = 2200; // ms "nothing at hand" stays on the screen

// The features this uses, so it is installed after them (game/features.js):
// the keys are read by the player, and the HUD says when there's nothing to do.
export const after = ['ui', 'player'];
export function installAct(game) {
  const { input, commands, hud } = game;
  const offers = new Offers();

  // What it would do here, in a word, is what the pack lists it by while
  // there's something at hand, and what its button on a touch screen says
  // (src/pack/: held down there as the key would be, to calm a wild horse).
  // Its picture is of what that would be done to, as its offer drew it: the
  // pack asks for the picture just after the word, so it's the same one.
  let at = null;
  commands.add({
    id: 'act',
    keys: ['KeyF', 'PadY'],
    group: 'WANDER',
    help: 'F',
    label: 'act on what’s at hand: get in or out, on or off · ride, calm (hold) · buy, rent, ask · in orbit: fly home',
    run: () => offers.press() || hud.flash('nothing at hand here to get into, or onto, or act on', NOTHING_MS),
    hold: (dt) => offers.hold(dt),
    now: () => (at = offers.here())?.word || '',
    icon: () => at?.icon || pictures.HAND,
  });

  game.provide('act', {
    offers,
    offer: (o) => offers.offer(o),
    here: () => offers.here(),
    press: () => offers.press(),
    key: (word) => (input.isTouch ? word : 'F'),
  });
}
