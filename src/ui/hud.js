// Minimal overlay: a hint at the start, coordinates (handy for deciding where
// to build things), the mark you're tracking, a help panel, and the building
// HUD: tool bar, materials, what the tool in hand would do, and a progress bar
// for press-and-hold work.

import { markLabel, formatDistance } from '../map/marks.js';

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
    const btn = document.getElementById('help-btn');
    if (btn) btn.addEventListener('click', () => this.toggleHelp());
    this.hotbar = document.getElementById('hotbar');
    this.prompt = document.getElementById('prompt');
    this.inv = document.getElementById('inv');
    this.progress = document.getElementById('progress');
    this.progressBar = this.progress ? this.progress.firstElementChild : null;
    this.slots = [];
    this._prompt = null;
    this._inv = '';
    this.soundBtn = document.getElementById('sound-btn');
    this.onSoundToggle = null;
    this.onStake = null;
    const stake = document.getElementById('act-stake');
    if (stake) {
      stake.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (this.onStake) this.onStake();
      });
    }
    if (this.soundBtn) {
      this.soundBtn.addEventListener('click', () => {
        if (this.onSoundToggle) this.onSoundToggle();
        this.soundBtn.blur();
      });
    }
    this.mapBtn = document.getElementById('map-btn');
    this.onMapToggle = null;
    if (this.mapBtn) {
      this.mapBtn.addEventListener('click', () => {
        if (this.onMapToggle) this.onMapToggle();
        this.mapBtn.blur();
      });
    }
  }

  setSound(on) {
    if (!this.soundBtn) return;
    this.soundBtn.textContent = on ? 'sound on' : 'sound off';
    this.soundBtn.setAttribute('aria-pressed', String(on));
  }

  hideHint() {
    if (this.hint) this.hint.classList.add('gone');
  }

  toggleHelp() {
    this.help.classList.toggle('open');
  }

  flash(msg) {
    this.toast.textContent = msg;
    this.toast.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => this.toast.classList.remove('show'), 1400);
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

  // The tracked mark: name, distance and which way to go from where the
  // camera is looking. mark = null hides it.
  updateTrack(mark, pos, camYaw) {
    if (!this.track) return;
    let txt = '';
    if (mark) {
      const dx = mark.x - pos.x;
      const dz = mark.z - pos.z;
      const d = Math.hypot(dx, dz);
      if (d < ARRIVED) {
        txt = `◆ ${markLabel(mark)} · you're here`;
        if (this._arrivedAt !== mark.id) {
          this._arrivedAt = mark.id;
          this.flash(`arrived · ${markLabel(mark)}`);
        }
      } else {
        if (d > ARRIVED * 2) this._arrivedAt = null;
        const fx = -Math.sin(camYaw);
        const fz = -Math.cos(camYaw);
        const rel = Math.atan2(dx * -fz + dz * fx, dx * fx + dz * fz);
        const arrow = ARROWS[((Math.round(rel / (Math.PI / 4)) % 8) + 8) % 8];
        txt = `◆ ${markLabel(mark)} · ${formatDistance(d)} ${arrow}`;
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

  setPrompt(html, bad = false) {
    if (!this.prompt) return;
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
    if (!this.progress) return;
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
