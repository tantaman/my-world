// Who is talking, on the screen: a short list in the corner of whoever is on
// the radio and whoever is talking near enough to hear, each with how loud
// they are, and you, while you are. And on a touch screen, in a shared world,
// a button to hold for each way of talking.

import './voice.css';

export class VoiceScreen {
  // hold(which, down): which = 'aloud' | 'radio', pressed or let go
  constructor({ parent = document.getElementById('hud'), hold }) {
    this.list = document.createElement('div');
    this.list.id = 'voice';
    this.list.setAttribute('aria-live', 'polite');
    parent.appendChild(this.list);
    this.rows = new Map(); // key -> { el, level, how }

    this.buttons = document.createElement('div');
    this.buttons.id = 'voice-act';
    this.buttons.hidden = true;
    for (const [which, label] of [
      ['radio', 'radio'],
      ['aloud', 'talk'],
    ]) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.dataset.voice = which;
      const on = (e) => {
        e.preventDefault();
        e.stopPropagation();
        b.classList.add('on');
        hold(which, true);
      };
      const off = (e) => {
        e.preventDefault();
        b.classList.remove('on');
        hold(which, false);
      };
      b.addEventListener('pointerdown', on);
      b.addEventListener('pointerup', off);
      b.addEventListener('pointercancel', off);
      b.addEventListener('pointerleave', off);
      this.buttons.appendChild(b);
    }
    parent.appendChild(this.buttons);
  }

  showButtons(on) {
    if (this.buttons.hidden === !on) return;
    this.buttons.hidden = !on;
  }

  // rows: [{ key, name, how, level, radio, you }], in the order to show them
  show(rows) {
    const keep = new Set();
    for (const r of rows) {
      keep.add(r.key);
      let row = this.rows.get(r.key);
      if (!row) {
        const el = document.createElement('div');
        el.className = 'talker';
        el.innerHTML = '<i><b></b></i><span class="who"></span><span class="how"></span>';
        row = { el, bar: el.querySelector('b'), who: el.querySelector('.who'), how: el.querySelector('.how'), name: '', said: '' };
        this.rows.set(r.key, row);
      }
      if (row.name !== r.name) row.who.textContent = row.name = r.name;
      if (row.said !== r.how) row.how.textContent = row.said = r.how;
      row.el.classList.toggle('radio', !!r.radio);
      row.el.classList.toggle('you', !!r.you);
      row.bar.style.transform = `scaleX(${Math.max(0.06, Math.min(1, r.level)).toFixed(2)})`;
      this.list.appendChild(row.el); // in order
    }
    for (const [key, row] of this.rows) {
      if (keep.has(key)) continue;
      row.el.remove();
      this.rows.delete(key);
    }
  }
}
