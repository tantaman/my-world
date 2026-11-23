// What a place out of a book puts on the screen over the picture (Hell, and
// Purgatory above it): the dark you pass through on the way in or out, and
// the name of each place as you come into it, with the book's lines for it.
//
// Both are elements of its own, made here: the HUD's toast is one line for a
// moment, and a place's name wants reading. Each place has its own pair,
// named for it (#hell-card, #hell-dark), and says which book its cantos are
// from.
//
//   const card = new Card({ id: 'hell', book: 'Inferno' });
//   card.show({ title, who, lines: ['…', '…'], canto: 'III' }, ms);
//   await card.darken(true);  …  await card.darken(false);

const FADE = 0.9; // s: how long the dark takes to come and to go

const style = (id) => `
#${id}-dark { position: fixed; inset: 0; background: #000; opacity: 0; pointer-events: none; z-index: 5; transition: opacity ${FADE}s ease, background-color ${FADE}s ease; }
#${id}-dark.on { opacity: 1; }
#${id}-card { position: absolute; left: 50%; top: 22%; transform: translateX(-50%); width: min(560px, calc(100vw - 48px)); text-align: center;
  opacity: 0; transition: opacity 1.4s ease; color: #e9dfc0; text-shadow: 0 1px 6px #000, 0 0 18px #000; font-family: Georgia, 'Times New Roman', serif; }
#${id}-card.on { opacity: 1; }
#${id}-card .title { font-size: 21px; letter-spacing: 0.14em; text-transform: uppercase; }
#${id}-card .who { font-size: 13px; margin-top: 6px; opacity: 0.8; font-style: italic; }
#${id}-card .lines { font-size: 14.5px; line-height: 1.55; margin-top: 14px; }
#${id}-card .canto { font-size: 10.5px; letter-spacing: 0.2em; margin-top: 10px; opacity: 0.6; text-transform: uppercase; }
@media (prefers-reduced-motion: reduce) { #${id}-dark, #${id}-card { transition: none; } }
`;

export class Card {
  // id: what its elements are named for · book: what a canto is of
  // ('Inferno') · doc: the document, or nothing where there isn't one (the
  // rules are checked without a page)
  constructor({ id, book, doc = typeof document !== 'undefined' ? document : null }) {
    this.book = book;
    this.fade = FADE;
    this._timer = 0;
    if (!doc) return;
    const css = doc.createElement('style');
    css.textContent = style(id);
    doc.head.appendChild(css);
    this.dark = doc.createElement('div');
    this.dark.id = `${id}-dark`;
    doc.body.appendChild(this.dark);
    this.card = doc.createElement('div');
    this.card.id = `${id}-card`;
    (doc.getElementById('hud') || doc.body).appendChild(this.card);
  }

  // Go dark, or come back out of it; in `color` (a CSS colour: black, unless
  // it is light you go into). -> a promise for when it has.
  darken(on, color = '#000') {
    if (!this.dark) return Promise.resolve();
    if (on) this.dark.style.backgroundColor = color;
    this.dark.classList.toggle('on', on);
    return new Promise((done) => setTimeout(done, FADE * 1000));
  }

  // A place's words (title, who, lines, canto), for `ms`.
  show(words, ms = 9000) {
    if (!this.card || !words) return;
    const div = (cls, text) => {
      const el = this.card.ownerDocument.createElement('div');
      el.className = cls;
      el.textContent = text;
      return el;
    };
    this.card.replaceChildren();
    if (words.title) this.card.appendChild(div('title', words.title));
    if (words.who) this.card.appendChild(div('who', words.who));
    if (words.lines) {
      const lines = div('lines', '');
      for (const l of words.lines) lines.appendChild(div('line', l));
      this.card.appendChild(lines);
    }
    if (words.canto) this.card.appendChild(div('canto', `${words.book || this.book} ${words.canto}`));
    this.card.classList.add('on');
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this.card.classList.remove('on'), ms);
  }

  // Take down whatever is shown, now.
  hide() {
    if (!this.card) return;
    clearTimeout(this._timer);
    this.card.classList.remove('on');
  }

  // What is being shown, if anything (for the play-through).
  get showing() {
    return this.card && this.card.classList.contains('on') ? this.card.querySelector('.title')?.textContent || '' : '';
  }
}
