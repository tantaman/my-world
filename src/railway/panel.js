// The railway's stations, as a tab beside the map (M, then "stations"; or Y
// away from a train): the stations you could go to, nearest first, with
// which line each is on, how far it is and which way, and when the next train
// is due there. Pick one and you're on its platform.
//
//   const panel = new StationPanel({ onPick: (id) => ..., showing, onClose });
//   panel.el           the list, for the map to show
//   panel.show(rows)   rows: [{ id, name, line, far, way, due }], every
//                      half second or so while it's showing (the times count)
//
// While it's showing (showing() is true) it has the number keys, 1–9 to
// pick, and Y closes the map again (onClose), as Y opened it.

import './railway.css';

const TEMPLATE = /* html */ `
  <p class="rail-note">Go to a station, wait for a train, and <b>Y</b> beside it to get on.</p>
  <ol class="rail-list" aria-label="Stations"></ol>
  <p class="rail-more" hidden>surveying further…</p>
`;

export class StationPanel {
  constructor({ onPick, showing = () => false, onClose = () => {} }) {
    this.onPick = onPick;
    const el = document.createElement('div');
    el.id = 'rail-panel';
    el.innerHTML = TEMPLATE;
    this.el = el;
    this.list = el.querySelector('.rail-list');
    this.more = el.querySelector('.rail-more');
    this._shown = '';
    el.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-station]');
      if (b) this.onPick(b.dataset.station);
    });
    addEventListener('keydown', (e) => {
      if (!showing() || (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA'))) return;
      if (e.code === 'KeyY') {
        e.preventDefault();
        onClose();
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
