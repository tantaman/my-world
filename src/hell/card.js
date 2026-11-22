// What Hell puts on the screen over the picture: the dark you pass through
// at the door, and the name of each place as you come into it, with the
// poem's lines for it.
//
// Both are elements of its own, made here: the HUD's toast is one line for a
// moment, and a place's name wants reading.

const FADE = 0.9; // s: how long the dark takes to come and to go

const STYLE = `
#hell-dark { position: fixed; inset: 0; background: #000; opacity: 0; pointer-events: none; z-index: 5; transition: opacity ${FADE}s ease; }
#hell-dark.on { opacity: 1; }
#hell-card { position: absolute; left: 50%; top: 22%; transform: translateX(-50%); width: min(560px, calc(100vw - 48px)); text-align: center;
  opacity: 0; transition: opacity 1.4s ease; color: #e9dfc0; text-shadow: 0 1px 6px #000, 0 0 18px #000; font-family: Georgia, 'Times New Roman', serif; }
#hell-card.on { opacity: 1; }
#hell-card .title { font-size: 21px; letter-spacing: 0.14em; text-transform: uppercase; }
#hell-card .who { font-size: 13px; margin-top: 6px; opacity: 0.8; font-style: italic; }
#hell-card .lines { font-size: 14.5px; line-height: 1.55; margin-top: 14px; }
#hell-card .canto { font-size: 10.5px; letter-spacing: 0.2em; margin-top: 10px; opacity: 0.6; text-transform: uppercase; }
@media (prefers-reduced-motion: reduce) { #hell-dark, #hell-card { transition: none; } }
`;

export class Card {
  // doc: the document, or nothing where there isn't one (the rules are
  // checked without a page)
  constructor(doc = typeof document !== 'undefined' ? document : null) {
    this.fade = FADE;
    this._timer = 0;
    if (!doc) return;
    const style = doc.createElement('style');
    style.textContent = STYLE;
    doc.head.appendChild(style);
    this.dark = doc.createElement('div');
    this.dark.id = 'hell-dark';
    doc.body.appendChild(this.dark);
    this.card = doc.createElement('div');
    this.card.id = 'hell-card';
    (doc.getElementById('hud') || doc.body).appendChild(this.card);
  }

  // Go dark, or come back out of it. -> a promise for when it has.
  darken(on) {
    if (!this.dark) return Promise.resolve();
    this.dark.classList.toggle('on', on);
    return new Promise((done) => setTimeout(done, FADE * 1000));
  }

  // A place's words (words.js: title, who, lines, canto), for `ms`.
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
    if (words.canto) this.card.appendChild(div('canto', `Inferno ${words.canto}`));
    this.card.classList.add('on');
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this.card.classList.remove('on'), ms);
  }

  // What is being shown, if anything (for the play-through).
  get showing() {
    return this.card && this.card.classList.contains('on') ? this.card.querySelector('.title')?.textContent || '' : '';
  }
}
