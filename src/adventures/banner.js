// What an adventure puts on the screen: a banner at the top while it's on
// (what it is, what to do, the clock, which way, how you're holding up), a
// red pulse at the edges when you're hurt, the word on how it ended, and the
// blackout you're set down again under after a loss.
//
//   const banner = new Banner(hudElement)
//   banner.update(view, { x, z, camYaw })   every frame; view is Adventures.view()
//   banner.hurt(amount)                      the red pulse, by how bad
//   banner.card(title, line, won)            the word on how it ended
//   banner.blackout()                        down to black and back up

import { formatDistance } from '../core/format.js';

// relative to where the camera looks: ahead, ahead-right, right, ...
const ARROWS = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'];
const LOW = 0.3; // health under this much shows as low
const CARD_MS = 4600; // how long the word on how it ended stays up

// Which way (dx, dz) is from where the camera looks along camYaw, as an arrow.
export function arrowTo(dx, dz, camYaw) {
  const fx = -Math.sin(camYaw);
  const fz = -Math.cos(camYaw);
  const rel = Math.atan2(dx * -fz + dz * fx, dx * fx + dz * fz);
  return ARROWS[((Math.round(rel / (Math.PI / 4)) % 8) + 8) % 8];
}

export const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export class Banner {
  constructor(parent = document.body) {
    const el = document.createElement('div');
    el.id = 'adventure';
    el.hidden = true;
    el.setAttribute('aria-live', 'polite');
    el.innerHTML = `
      <div class="adv-head"><span class="adv-title"></span><span class="adv-left"></span></div>
      <div class="adv-objective"></div>
      <div class="adv-way"></div>
      <div class="adv-note"></div>
      <div class="adv-health" role="meter" aria-label="how you're holding up" aria-valuemin="0" aria-valuemax="100"><i></i></div>`;
    parent.appendChild(el);
    this.el = el;
    this.parts = {
      title: el.querySelector('.adv-title'),
      left: el.querySelector('.adv-left'),
      objective: el.querySelector('.adv-objective'),
      way: el.querySelector('.adv-way'),
      note: el.querySelector('.adv-note'),
      health: el.querySelector('.adv-health'),
      bar: el.querySelector('.adv-health i'),
    };
    this.shown = {};

    this.pulse = document.createElement('div');
    this.pulse.id = 'adv-hurt';
    parent.appendChild(this.pulse);

    this.cardEl = document.createElement('div');
    this.cardEl.id = 'adv-card';
    this.cardEl.innerHTML = '<h2></h2><p></p>';
    parent.appendChild(this.cardEl);

    this.black = document.createElement('div');
    this.black.id = 'adv-black';
    parent.appendChild(this.black);
    this._cardTimer = 0;
    this._blackTimer = 0;
  }

  // Write a part only when what it says changes.
  _put(key, text) {
    if (this.shown[key] === text) return;
    this.shown[key] = text;
    this.parts[key].textContent = text;
    this.parts[key].hidden = !text;
  }

  update(view, at) {
    const on = !!view && view.state !== 'over';
    if (this.el.hidden === on) this.el.hidden = !on;
    if (!on) return;
    this._put('title', view.title.toUpperCase());
    this._put('left', view.left === null || view.left === undefined ? '' : clock(Math.max(0, view.left)));
    this._put('objective', view.objective);
    let way = '';
    if (view.guide) {
      const dx = view.guide.x - at.x;
      const dz = view.guide.z - at.z;
      const d = Math.hypot(dx, dz);
      way = d < 4 ? `◆ ${view.guide.label} · here` : `◆ ${view.guide.label} · ${formatDistance(d)} ${arrowTo(dx, dz, at.camYaw)}`;
    }
    this._put('way', way);
    this._put('note', view.note);
    const travel = view.state === 'travel';
    this.parts.health.hidden = travel;
    if (!travel) {
      const pct = Math.round(view.health * 100);
      if (this.shown.pct !== pct) {
        this.shown.pct = pct;
        this.parts.bar.style.width = `${pct}%`;
        this.parts.health.setAttribute('aria-valuenow', String(pct));
        this.parts.health.classList.toggle('low', view.health < LOW);
      }
    }
  }

  hurt(amount) {
    const p = this.pulse;
    p.style.setProperty('--hurt', String(Math.min(1, 0.35 + amount / 30)));
    p.classList.remove('on');
    void p.offsetWidth;
    p.classList.add('on');
  }

  card(title, line, won) {
    const c = this.cardEl;
    c.querySelector('h2').textContent = title;
    c.querySelector('p').textContent = line;
    c.classList.toggle('won', !!won);
    c.classList.add('show');
    clearTimeout(this._cardTimer);
    this._cardTimer = setTimeout(() => c.classList.remove('show'), CARD_MS);
  }

  blackout(ms = 2200) {
    this.black.classList.add('on');
    clearTimeout(this._blackTimer);
    this._blackTimer = setTimeout(() => this.black.classList.remove('on'), ms);
  }
}
