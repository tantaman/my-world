// The flights, as a tab beside the map (M, then "flights"; or P): at an
// airfield, the other airfields to fly to, each with the hikes it's for,
// how far it is and which way, and how long the trip takes; pick one and
// you board the plane on the apron. Anywhere else, the airfield for this
// part of the world, to go to, and where you could fly from it.
//
//   const panel = new FlightsPanel({ onPick: (id, action) => ..., showing, onClose });
//   panel.el                the list, for the map to show
//   panel.show(view)        view: { note, rows: [{ id, name, sub, far, when,
//                           action ('fly', 'go' or null), here }], looking }
//
// While it's showing (showing() is true) it has the number keys, 1–9 to
// pick, and P closes the map again (onClose), as P opened it.

import './airports.css';

const TEMPLATE = /* html */ `
  <p class="fly-note"></p>
  <ol class="fly-list" aria-label="Flights"></ol>
  <p class="fly-more" hidden>looking for airfields…</p>
`;

export class FlightsPanel {
  constructor({ onPick, showing = () => false, onClose = () => {} }) {
    this.onPick = onPick;
    const el = document.createElement('div');
    el.id = 'fly-panel';
    el.innerHTML = TEMPLATE;
    this.el = el;
    this.note = el.querySelector('.fly-note');
    this.list = el.querySelector('.fly-list');
    this.more = el.querySelector('.fly-more');
    this._shown = '';
    el.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-field]');
      if (b && b.dataset.action) this.onPick(b.dataset.field, b.dataset.action);
    });
    addEventListener('keydown', (e) => {
      if (!showing() || (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA'))) return;
      if (e.code === 'KeyP') {
        e.preventDefault();
        onClose();
        return;
      }
      const m = /^(Digit|Numpad)([1-9])$/.exec(e.code);
      if (!m) return;
      const b = this.list.querySelectorAll('button[data-action]')[Number(m[2]) - 1];
      if (b) {
        e.preventDefault();
        this.onPick(b.dataset.field, b.dataset.action);
      }
    });
  }

  show({ note, rows, looking }) {
    const key = JSON.stringify([note, rows, looking]);
    if (key === this._shown) return;
    this._shown = key;
    this.note.innerHTML = note;
    this.more.hidden = !looking;
    this.list.textContent = '';
    if (!rows.length) {
      const li = document.createElement('li');
      li.className = 'fly-none';
      li.textContent = looking ? 'looking for the nearest airfield…' : 'no airfield within reach of here';
      this.list.appendChild(li);
      return;
    }
    let n = 0;
    for (const r of rows) {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.field = r.id;
      if (r.action) b.dataset.action = r.action;
      else b.disabled = true;
      if (r.here) b.classList.add('here');
      const k = r.action && n < 9 ? String(++n) : '';
      b.innerHTML = `<kbd>${k}</kbd><span class="name"></span><span class="far"></span><span class="sub"></span><span class="when"></span>`;
      b.querySelector('.name').textContent = r.name;
      b.querySelector('.far').textContent = r.far;
      b.querySelector('.sub').textContent = r.sub;
      b.querySelector('.when').textContent = r.when;
      li.appendChild(b);
      this.list.appendChild(li);
    }
  }
}
