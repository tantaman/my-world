// Minimal overlay: a hint at the start, coordinates (handy for deciding where
// to build things), the mark you're tracking, a help panel, and the building
// HUD: tool bar, materials, what the tool in hand would do, and a progress bar
// for press-and-hold work.

import { formatDistance } from '../core/format.js';

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
// relative to where the camera looks: ahead, ahead-right, right, ...
const ARROWS = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'];
const ARRIVED = 8; // meters

export class Hud {
  constructor() {
    this.el = document.getElementById('hud');
    this.coords = document.getElementById('coords');
    this.hint = document.getElementById('hint');
    this.help = document.getElementById('help');
    this.toast = document.getElementById('toast');
    this.debug = document.getElementById('debug');
    this.track = document.getElementById('track');
    this._toastTimer = 0;
    this._last = '';
    this._lastTrack = '';
    this._arrivedAt = null;
    this.hotbar = document.getElementById('hotbar');
    this.prompt = document.getElementById('prompt');
    this.inv = document.getElementById('inv');
    this.progress = document.getElementById('progress');
    this.progressBar = this.progress ? this.progress.firstElementChild : null;
    this.slots = [];
    this._prompt = null;
    // What the tool in hand has to say, and something at hand that a key
    // would do (cue), which is said in its place while there is one.
    this._tool = { html: '', bad: false, progress: null };
    this._cue = null;
    this._inv = '';
    this.soundBtn = document.getElementById('sound-btn');
    this.saveBtn = document.getElementById('save-btn');
    this.helpSource = null; // () => what renderHelp shows
    this.guides = []; // see guide()
    this.button('help-btn', () => this.toggleHelp());
  }

  // Somewhere to head for, shown under the coordinates. More than one feature
  // may have one (the map mark you're tracking, the view at the end of the
  // hike you're on), so each adds a source: () => { id, label, color, x, z }
  // or null. The first, in the order they were added, that has one is shown.
  guide(source) {
    this.guides.push(source);
  }

  updateGuide(pos, camYaw) {
    let to = null;
    for (const g of this.guides) if ((to = g())) break;
    this.updateTrack(to, pos, camYaw);
  }

  // Say what one of the HUD's buttons does (the ones in index.html: save-btn,
  // map-btn, sound-btn, help-btn, and act-stake on a touch screen).
  button(id, fn) {
    const el = document.getElementById(id);
    if (!el) return;
    // The touch buttons sit over the look pad: act on the press itself and
    // don't let it through. The corner buttons are ordinary clicks.
    const touch = el.closest('#touch-act');
    el.addEventListener(touch ? 'pointerdown' : 'click', (e) => {
      if (touch) {
        e.preventDefault();
        e.stopPropagation();
      }
      fn();
      if (!touch) el.blur();
    });
  }

  // Show the on-screen use / alt buttons: someone is playing by touch.
  showTouchActions() {
    const el = document.getElementById('touch-act');
    if (el) el.hidden = false;
  }

  // The help panel (H), written from the keys that are actually bound.
  // groups: [{ group, rows: [{ help, label }] }], see Commands.help().
  renderHelp(groups) {
    if (!this.help) return;
    this.help.textContent = '';
    groups.forEach((g, i) => {
      if (i) this.help.appendChild(document.createElement('hr'));
      const h = document.createElement('h2');
      h.textContent = g.group;
      this.help.appendChild(h);
      for (const r of g.rows) {
        const row = document.createElement('div');
        row.className = 'row';
        const k = document.createElement('kbd');
        k.textContent = r.help;
        const what = document.createElement('span');
        what.textContent = r.label;
        row.append(k, what);
        this.help.appendChild(row);
      }
    });
  }

  // The save button says where the world stands: save / saving… / saved /
  // offline / clash. `state` tints it (see #corner in index.html).
  setSave(label, state) {
    if (!this.saveBtn) return;
    if (this.saveBtn.textContent !== label) this.saveBtn.textContent = label;
    if (this.saveBtn.dataset.state !== state) this.saveBtn.dataset.state = state;
  }

  setSound(on) {
    if (!this.soundBtn) return;
    this.soundBtn.textContent = on ? 'sound on' : 'sound off';
    this.soundBtn.setAttribute('aria-pressed', String(on));
  }

  hideHint() {
    if (this.hint) this.hint.classList.add('gone');
  }

  // Written afresh each time it opens, from whatever is bound by then.
  toggleHelp() {
    if (this.helpSource && !this.help.classList.contains('open')) this.renderHelp(this.helpSource());
    this.help.classList.toggle('open');
  }

  // Is a word on the screen right now?
  get showing() {
    return this.toast.classList.contains('show');
  }

  // A word on the screen for a moment. ms: how long it stays (longer for a
  // sentence worth reading).
  flash(msg, ms = 1400) {
    this.toast.textContent = msg;
    this.toast.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => this.toast.classList.remove('show'), ms);
  }

  update(pos, camYaw, hours) {
    // camera looks along -sin/-cos(camYaw); north = -z
    const fx = -Math.sin(camYaw);
    const fz = -Math.cos(camYaw);
    const ang = (Math.atan2(fx, -fz) * 180) / Math.PI;
    const heading = COMPASS[Math.round((((ang % 360) + 360) % 360) / 45) % 8];
    const h = Math.floor(hours);
    const m = Math.floor((hours - h) * 60);
    const txt = `${Math.round(pos.x)}, ${Math.round(pos.z)}  ·  ${heading}  ·  ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    if (txt !== this._last) {
      this.coords.textContent = txt;
      this._last = txt;
    }
  }

  // Somewhere you're heading for: its name, how far it is and which way to go
  // from where the camera is looking. mark: { id, label, color, x, z }, or
  // null to show nothing.
  updateTrack(mark, pos, camYaw) {
    if (!this.track) return;
    let txt = '';
    if (mark) {
      const dx = mark.x - pos.x;
      const dz = mark.z - pos.z;
      const d = Math.hypot(dx, dz);
      if (d < ARRIVED) {
        txt = `◆ ${mark.label} · you're here`;
        if (this._arrivedAt !== mark.id) {
          this._arrivedAt = mark.id;
          this.flash(`arrived · ${mark.label}`);
        }
      } else {
        if (d > ARRIVED * 2) this._arrivedAt = null;
        const fx = -Math.sin(camYaw);
        const fz = -Math.cos(camYaw);
        const rel = Math.atan2(dx * -fz + dz * fx, dx * fx + dz * fz);
        const arrow = ARROWS[((Math.round(rel / (Math.PI / 4)) % 8) + 8) % 8];
        txt = `◆ ${mark.label} · ${formatDistance(d)} ${arrow}`;
      }
    } else this._arrivedAt = null;
    if (txt !== this._lastTrack) {
      this.track.textContent = txt;
      this.track.style.color = mark ? mark.color : '';
      this._lastTrack = txt;
    }
  }

  // ── Building ─────────────────────────────────────────────────────────────
  buildTools(tools, onPick) {
    if (!this.hotbar) return;
    const range = document.getElementById('hint-tools');
    if (range) range.textContent = `1–${tools.length}`;
    this.hotbar.textContent = '';
    this.slots = tools.map((t, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'slot';
      b.innerHTML = `<kbd>${i + 1}</kbd><span class="long">${t.label}</span><span class="short">${t.short || t.label}</span>`;
      b.setAttribute('aria-label', `${t.label} (key ${i + 1})`);
      b.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        onPick(i);
        b.blur();
      });
      this.hotbar.appendChild(b);
      return b;
    });
  }

  showStake(on) {
    const el = document.getElementById('act-stake');
    if (el) el.hidden = !on;
  }

  selectTool(i) {
    this.slots.forEach((b, j) => b.setAttribute('aria-pressed', String(i === j)));
  }

  // What the tool in hand would do (the builder says this every frame).
  setPrompt(html, bad = false) {
    this._tool.html = html;
    this._tool.bad = !!bad;
    this._showPrompt();
  }

  // Something at hand that a key would do, whatever tool is in hand: calm an
  // animal, climb on. Said in place of the tool's prompt while it is set.
  //   { html, bad?, progress? (0..1, for press-and-hold) }, or null
  cue(c) {
    this._cue = c && c.html ? c : null;
    this._showPrompt();
    this._showProgress();
  }

  _showPrompt() {
    if (!this.prompt) return;
    const { html, bad } = this._cue ? { html: this._cue.html, bad: !!this._cue.bad } : this._tool;
    const key = `${bad ? 1 : 0}${html}`;
    if (key === this._prompt) return;
    this._prompt = key;
    this.prompt.innerHTML = html;
    this.prompt.classList.toggle('bad', !!bad);
    this.prompt.classList.toggle('gone', !html);
  }

  nudgePrompt() {
    if (!this.prompt) return;
    this.prompt.classList.remove('nudge');
    void this.prompt.offsetWidth;
    this.prompt.classList.add('nudge');
  }

  setProgress(p) {
    this._tool.progress = p;
    this._showProgress();
  }

  _showProgress() {
    if (!this.progress) return;
    const p = this._cue ? (this._cue.progress ?? null) : this._tool.progress;
    const on = p !== null && p > 0;
    this.progress.classList.toggle('show', on);
    if (on) this.progressBar.style.width = `${Math.round(Math.min(1, p) * 100)}%`;
  }

  setInventory(text) {
    if (!this.inv || text === this._inv) return;
    this._inv = text;
    this.inv.textContent = text;
  }

  setDebug(text) {
    if (this.debug) this.debug.textContent = text;
  }
}
