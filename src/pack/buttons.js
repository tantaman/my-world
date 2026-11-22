// On a touch screen there are no keys, so whatever is at hand has a button:
// one for each thing that says what it would do here ("float", "get in",
// "get off"), named by that word, with its picture over it, and there only
// while it has one. They sit over the use and alt buttons, where a thumb
// already is.
//
// Handed where to put them and what a press is, so it knows nothing about
// the world:
//
//   root      the element they go in (#touch-act)
//   press     (id) => void   a finger went down on one
//   release   (id) => void   ...and came up, or slid off
//
//   show(offers, on)   offers: [{ id, word, icon? }], everything there is to
//                      do, in a steady order: word '' for nothing here, null
//                      for what never says (it gets no button); icon its
//                      picture (picture.js); on: whether to show any
//
// A button is made the first time its thing is offered and kept, so they
// stay in the order they were first offered in, the first lowest.

import { url } from './picture.js';

export class HandButtons {
  constructor({ root, press, release }) {
    this.root = root;
    this.press = press;
    this.release = release;
    this.made = new Map(); // id -> { el, pic, says, word, icon, down, round }
    this.round = 0; // how many times show() has been asked: a button knows the last it was offered in
  }

  show(offers, on) {
    if (!this.root) return;
    this.round++;
    for (const o of offers) {
      if (o.word === null) continue;
      const b = this.made.get(o.id) || this._make(o.id);
      b.round = this.round;
      const word = on ? o.word || '' : '';
      this._say(o.id, b, word, (word && o.icon) || null);
    }
    // what is no longer on offer at all (the keys are somewhere else's now:
    // commands.js, `mode`) has nothing to say either
    for (const [id, b] of this.made) if (b.round !== this.round) this._say(id, b, '', null);
  }

  // What a button says, and its picture: '' for nothing, and then it's gone.
  _say(id, b, word, icon) {
    if (word === b.word && icon === b.icon) return;
    if (word !== b.word && !word) this._up(id, b); // gone from under the finger: let go of it
    b.word = word;
    b.icon = icon;
    b.el.hidden = !word;
    b.says.textContent = word;
    b.pic.hidden = !icon;
    if (icon) b.pic.src = url(icon);
  }

  _make(id) {
    const el = document.createElement('button');
    el.type = 'button';
    el.dataset.do = id;
    el.hidden = true;
    const pic = el.appendChild(document.createElement('img'));
    pic.className = 'pic';
    pic.alt = '';
    pic.draggable = false;
    const says = el.appendChild(document.createElement('span'));
    const b = { el, pic, says, word: '', icon: null, down: false, round: 0 };
    // The buttons sit over the look pad: act on the press itself, and don't
    // let it through to turn the camera.
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      b.down = true;
      this.press(id);
    });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) el.addEventListener(ev, () => this._up(id, b));
    this.root.prepend(el);
    this.made.set(id, b);
    return b;
  }

  _up(id, b) {
    if (!b.down) return;
    b.down = false;
    this.release(id);
  }
}
