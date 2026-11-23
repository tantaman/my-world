// The seven P's the angel at the gate cuts on your brow with the point of
// his sword (Canto IX), one for each of the seven sins purged on the seven
// terraces; an angel wipes one away at the foot of each terrace's stair.
// Shown at the top of the screen while you're on the mountain and have any;
// the one just wiped fades as it goes.
//
// And the fire of the seventh terrace's wall, which you see through when
// you're in it: the screen goes the colour of molten glass.
//
// Elements of its own, made here (the HUD has nothing for either).

const STYLE = `
#purgatory-brow { position: absolute; left: 50%; top: 14px; transform: translateX(-50%); display: flex; gap: 10px; pointer-events: none;
  font-family: Georgia, 'Times New Roman', serif; font-size: 22px; color: #b33a2a; text-shadow: 0 1px 4px #000, 0 0 10px rgba(0,0,0,0.6); opacity: 0; transition: opacity 1.2s ease; }
#purgatory-brow.on { opacity: 1; }
#purgatory-brow span { transition: opacity 2.4s ease, transform 2.4s ease; }
#purgatory-brow span.gone { opacity: 0; transform: translateY(-8px); }
#purgatory-fire { position: fixed; inset: 0; pointer-events: none; z-index: 4; opacity: 0; mix-blend-mode: screen; }
@media (prefers-reduced-motion: reduce) { #purgatory-brow, #purgatory-brow span { transition: none; } }
`;

export class Brow {
  // doc: the document, or nothing where there isn't one
  constructor(doc = typeof document !== 'undefined' ? document : null) {
    this.left = 0;
    this.on = false;
    if (!doc) return;
    const css = doc.createElement('style');
    css.textContent = STYLE;
    doc.head.appendChild(css);
    this.el = doc.createElement('div');
    this.el.id = 'purgatory-brow';
    this.el.setAttribute('aria-label', 'the P’s on your brow');
    this.marks = [];
    for (let i = 0; i < 7; i++) {
      const p = doc.createElement('span');
      p.textContent = 'P';
      p.className = 'gone';
      this.el.appendChild(p);
      this.marks.push(p);
    }
    (doc.getElementById('hud') || doc.body).appendChild(this.el);
    this.fire = doc.createElement('div');
    this.fire.id = 'purgatory-fire';
    doc.body.appendChild(this.fire);
  }

  // `left` P's still on your brow (shown if `on`, or if any are left and it
  // was on already: show(n, true) to bring it up, show(0) to put it away).
  show(left, on = this.on) {
    this.left = left;
    this.on = left > 0 && on;
    if (!this.el) return;
    this.el.classList.toggle('on', this.on);
    this.marks.forEach((p, i) => p.classList.toggle('gone', i >= left));
  }

  // How far into the fire you are (0..1), and its colour.
  burn(k, color) {
    if (!this.fire) return;
    this.fire.style.background = color;
    this.fire.style.opacity = k < 0.01 ? '0' : String(Math.min(1, k)).slice(0, 5);
  }
}
