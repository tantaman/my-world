// The railway panel (the "rail" button, or Y away from a train): the
// stations you could go to, nearest first, with which line each is on, how
// far it is and which way, and when the next train is due there. Pick one
// and you're on its platform.
//
//   const panel = new StationPanel({ input, onPick: (id) => ... });
//   panel.show(rows)   rows: [{ id, name, line, far, way, due }], every
//                      half second or so while it's open (the times count)
//   panel.open() / close() / toggle(), panel.isOpen
//
// While it's open it has the keyboard: Esc or Y closes it, 1–9 picks.

import './railway.css';

const TEMPLATE = /* html */ `
  <div class="rail-head">
    <h2>RAILWAY</h2>
    <button type="button" data-act="close" aria-label="Close (Esc)">✕</button>
  </div>
  <p class="rail-note">Go to a station, wait for a train, and <b>Y</b> beside it to get on.</p>
  <ol class="rail-list" aria-label="Stations"></ol>
  <p class="rail-more" hidden>surveying further…</p>
`;

export class StationPanel {
  constructor({ input, onPick, parent = document.getElementById('hud') }) {
    this.input = input;
    this.onPick = onPick;
    this.isOpen = false;
    const root = document.createElement('div');
    root.id = 'rail-panel';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', 'Railway stations');
    root.setAttribute('aria-hidden', 'true');
    root.innerHTML = TEMPLATE;
    parent.appendChild(root);
    this.root = root;
    this.list = root.querySelector('.rail-list');
    this.more = root.querySelector('.rail-more');
    this._shown = '';
    root.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.act === 'close') this.close();
      else if (b.dataset.station) this.onPick(b.dataset.station);
    });
    addEventListener('keydown', (e) => {
      if (!this.isOpen) return;
      if (e.code === 'Escape' || e.code === 'KeyY') {
        e.preventDefault();
        this.close();
        return;
      }
      const m = /^(Digit|Numpad)([1-9])$/.exec(e.code);
      if (!m) return;
      const b = this.list.querySelectorAll('button[data-station]')[Number(m[2]) - 1];
      if (b) {
        e.preventDefault();
        this.onPick(b.dataset.station);
      }
    });
  }

  open() {
    if (this.isOpen) return;
    this.isOpen = true;
    this.input.setBlocked(true);
    if (document.pointerLockElement) document.exitPointerLock?.();
    this.root.classList.add('open');
    this.root.setAttribute('aria-hidden', 'false');
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

  // rows: [{ id, name, line, far, way, due, here }]; looking: whether there
  // are lines further off still being surveyed.
  show(rows, looking) {
    const key = JSON.stringify([rows, looking]);
    if (key === this._shown) return;
    this._shown = key;
    this.more.hidden = !looking;
    this.list.textContent = '';
    if (!rows.length) {
      const li = document.createElement('li');
      li.className = 'rail-none';
      li.textContent = looking ? 'looking for the nearest line…' : 'no railway within reach of here';
      this.list.appendChild(li);
      return;
    }
    rows.forEach((r, i) => {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.station = r.id;
      if (r.here) b.classList.add('here');
      b.innerHTML = `<kbd>${i < 9 ? i + 1 : ''}</kbd><span class="name"></span><span class="far"></span><span class="line"></span><span class="due"></span>`;
      b.querySelector('.name').textContent = r.name;
      b.querySelector('.far').textContent = r.far ? `${r.far} ${r.way}` : 'here';
      b.querySelector('.line').textContent = r.line;
      b.querySelector('.due').textContent = r.due;
      li.appendChild(b);
      this.list.appendChild(li);
    });
  }
}
