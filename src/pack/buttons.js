// On a touch screen there are no keys, so whatever is at hand has a button:
// one for each thing that says what it would do here ("float", "get in",
// "get off"), named by that word and there only while it has one. They sit
// over the use and alt buttons, where a thumb already is.
//
// Handed where to put them and what a press is, so it knows nothing about
// the world:
//
//   root      the element they go in (#touch-act)
//   press     (id) => void   a finger went down on one
//   release   (id) => void   ...and came up, or slid off
//
//   show(offers, on)   offers: [{ id, word }], everything there is to do, in
//                      a steady order: word '' for nothing here, null for
//                      what never says (it gets no button); on: whether to
//                      show any
//
// A button is made the first time its thing is offered and kept, so they
// stay in the order they were first offered in, the first lowest.

export class HandButtons {
  constructor({ root, press, release }) {
    this.root = root;
    this.press = press;
    this.release = release;
    this.made = new Map(); // id -> { el, word, down }
  }

  show(offers, on) {
    if (!this.root) return;
    for (const o of offers) {
      if (o.word === null) continue;
      const b = this.made.get(o.id) || this._make(o.id);
      const word = on ? o.word || '' : '';
      if (word === b.word) continue;
      b.word = word;
      b.el.hidden = !word;
      if (word) b.el.textContent = word;
      else this._up(o.id, b); // gone from under the finger: let go of it
    }
  }

  _make(id) {
    const el = document.createElement('button');
    el.type = 'button';
    el.dataset.do = id;
    el.hidden = true;
    const b = { el, word: '', down: false };
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
