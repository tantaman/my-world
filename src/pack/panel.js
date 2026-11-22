// Your pack, on the screen: everything there is to do, each a button that
// does it, and what's yours. What is at hand comes first, named for what it
// would do here; then what you have; then the rest of what there is to do,
// under the headings the help panel uses.
//
// Handed what to list and what to do when one is picked, so it knows nothing
// about the world:
//
//   book     () => { hand, rest }   the rows (book.js)
//   yours    () => [{ label, note }]   what you have (things.js)
//   keyOf    (row) => how its key is written for whoever is playing ('' for none)
//   onDo     (id) => void           a row was picked (the panel has closed)
//   input    the controls, blocked while the panel is up
//   key      the key that opens it, which closes it too ('Tab')
//
// Emits nothing: `shutByKey` is true from when its own key closed it until
// someone sets it false again (the key coming up), so that the same press,
// still held, isn't taken for a new one.

const HAND = 'AT HAND';
const YOURS = 'YOURS';

export class PackPanel {
  constructor({ book, yours = () => [], keyOf, onDo, input, key = 'Tab' }) {
    this.book = book;
    this.yours = yours;
    this.keyOf = keyOf;
    this.onDo = onDo;
    this.input = input;
    this.key = key;
    this.isOpen = false;
    this.shutByKey = false;

    const root = document.createElement('div');
    root.id = 'pack';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', 'Your pack');
    root.setAttribute('aria-hidden', 'true');
    root.innerHTML = `
      <div class="pack-head">
        <h2>YOUR PACK</h2>
        <button type="button" data-act="close" aria-label="Close">✕</button>
      </div>
      <div class="pack-body"><div></div><div class="pack-yours"></div><div></div></div>`;
    (document.getElementById('hud') || document.body).appendChild(root);
    this.root = root;
    this.body = root.querySelector('.pack-body');
    [this.handEl, this.yoursEl, this.restEl] = this.body.children;
    root.addEventListener('click', (e) => this._onClick(e));
    addEventListener('keydown', (e) => this._onKey(e));
  }

  // Write what there is to do afresh, keeping the row the focus was on if
  // it's still there.
  render() {
    const at = document.activeElement && this.root.contains(document.activeElement) ? document.activeElement.dataset.do : null;
    const { hand, rest } = this.book();
    this.handEl.replaceChildren();
    this.restEl.replaceChildren();
    if (hand.length) this._section(this.handEl, HAND, hand, true);
    for (const g of rest) this._section(this.restEl, g.group, g.rows, false);
    if (at) this._row(at)?.focus({ preventScroll: true });
  }

  // ...and what's yours: each thing, and how much of it or how it stands.
  renderYours() {
    const things = this.yours();
    this.yoursEl.replaceChildren();
    if (!things.length) return;
    const h = document.createElement('h3');
    h.textContent = YOURS;
    const list = document.createElement('ul');
    for (const t of things) {
      const li = list.appendChild(document.createElement('li'));
      li.appendChild(document.createElement('span')).textContent = t.label;
      if (t.note) li.appendChild(document.createElement('i')).textContent = t.note;
    }
    this.yoursEl.append(h, list);
  }

  _section(into, title, rows, hand) {
    const h = document.createElement('h3');
    h.textContent = title;
    const list = document.createElement('ol');
    if (hand) list.className = 'pack-hand';
    for (const r of rows) {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.do = r.id;
      if (r.word) {
        const word = document.createElement('b');
        word.textContent = r.word;
        b.appendChild(word);
      }
      const label = document.createElement('span');
      label.textContent = r.label;
      b.appendChild(label);
      const keys = this.keyOf(r);
      if (keys) {
        const k = document.createElement('kbd');
        k.textContent = keys;
        b.appendChild(k);
      }
      list.appendChild(document.createElement('li')).appendChild(b);
    }
    into.append(h, list);
  }

  _row(id) {
    return [...this.root.querySelectorAll('[data-do]')].find((b) => b.dataset.do === id) || null;
  }

  open() {
    if (this.isOpen) return;
    this.isOpen = true;
    this.render();
    this.renderYours();
    this.input.setBlocked(true);
    if (document.pointerLockElement) document.exitPointerLock?.();
    this.root.classList.add('open');
    this.root.setAttribute('aria-hidden', 'false');
    this.body.scrollTop = 0;
    // whatever is most at hand, ready to be done
    const first = this.root.querySelector('[data-do]');
    if (first) first.focus({ preventScroll: true });
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.root.classList.remove('open');
    this.root.setAttribute('aria-hidden', 'true');
    this.input.setBlocked(false);
    if (document.activeElement && this.root.contains(document.activeElement)) document.activeElement.blur();
  }

  toggle() {
    if (this.isOpen) this.close();
    else this.open();
  }

  _onClick(e) {
    const row = e.target.closest('[data-do]');
    if (row) {
      // closed first: what it does may open a panel of its own, or want the keys
      this.close();
      this.onDo(row.dataset.do);
    } else if (e.target.closest('[data-act="close"]')) this.close();
  }

  // Escape closes it, and so does the key that opened it (the panel has the
  // keyboard, so that key cannot come through the commands); up and down go
  // from row to row.
  _onKey(e) {
    if (!this.isOpen) return;
    if (e.code === this.key) {
      e.preventDefault();
      if (e.repeat) return; // still held from opening it
      this.shutByKey = true;
      this.close();
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      this.close();
      return;
    }
    const move = { ArrowUp: -1, ArrowDown: 1 }[e.key];
    if (!move) return;
    e.preventDefault();
    const rows = [...this.root.querySelectorAll('[data-do]')];
    const i = rows.indexOf(document.activeElement);
    const next = rows[Math.max(0, Math.min(rows.length - 1, i + move))];
    if (next) next.focus();
  }
}
