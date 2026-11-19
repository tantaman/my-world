// Minimal overlay: a hint at the start, coordinates (handy for deciding where
// to build things), and a help panel.

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

export class Hud {
  constructor() {
    this.el = document.getElementById('hud');
    this.coords = document.getElementById('coords');
    this.hint = document.getElementById('hint');
    this.help = document.getElementById('help');
    this.toast = document.getElementById('toast');
    this.debug = document.getElementById('debug');
    this._toastTimer = 0;
    this._last = '';
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

  setDebug(text) {
    if (this.debug) this.debug.textContent = text;
  }
}
