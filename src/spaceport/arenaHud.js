// What's on the screen in the arena, in place of the forest's HUD: a
// crosshair with a ring that fills as the railgun charges, the clock, your
// place, your frags and the leader's, who fragged whom, and the scores when
// it's over. And two things for the trip itself, in the arena or not: a big
// word in the middle of the screen (the countdown, "fight!", "you fragged
// Vex") and the white glare at the top of the climb.
//
//   const hud = new ArenaHud();
//   hud.show(on) · hud.glare(0..1) · hud.say(text, ms) · hud.feed(html)
//   hud.update(arena) each frame in the arena · hud.scores(arena | null)

import { RELOAD } from './arena.js';
import { ordinal } from './match.js';
import { NAME } from './orrery.js';
import './spaceport.css';

const FEED_FOR = 5000; // ms a line of the feed stays up
const FEED_MOST = 5;
const RING = 2 * Math.PI * 13; // the charge ring's circumference, in its SVG's units

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const hex = (c) => `#${c.toString(16).padStart(6, '0')}`;
export const named = (f) => `<b style="color:${hex(f.color)}">${esc(f.name)}</b>`;

export class ArenaHud {
  constructor() {
    const el = (this.el = document.createElement('div'));
    el.id = 'space';
    el.innerHTML = `
      <div class="glare"></div>
      <div class="arena" hidden>
        <div class="cross"><svg viewBox="0 0 32 32"><circle class="charge" cx="16" cy="16" r="13"/></svg><i></i></div>
        <div class="feed"></div>
        <div class="clock"></div>
        <div class="place"></div>
        <div class="stat health"><span class="icon">+</span><b>100</b></div>
        <div class="stat ammo"><span class="icon">⟋</span><b>∞</b></div>
        <div class="stat frags"><span class="label">frags</span><b>0</b></div>
        <div class="hurt"></div>
        <div class="scores" hidden></div>
      </div>
      <button type="button" class="launch-touch" hidden>Choose destination</button>
      <div class="station" hidden>
        <div class="station-place"><small></small><strong></strong></div>
        <div class="station-actions">
          <button type="button" data-deck><kbd>Enter</kbd> <span></span></button>
          <button type="button" data-home><kbd>F</kbd> Fly home</button>
        </div>
      </div>
      <div class="big"></div>`;
    document.body.appendChild(el);
    const q = (s) => el.querySelector(s);
    this.arena = q('.arena');
    this.station = q('.station');
    this.launchTouch = q('.launch-touch');
    this.deckButton = q('[data-deck]');
    this.homeButton = q('[data-home]');
    this.glareEl = q('.glare');
    this.bigEl = q('.big');
    this.feedEl = q('.feed');
    this.clock = q('.clock');
    this.place = q('.place');
    this.health = q('.health b');
    this.frags = q('.frags b');
    this.charge = q('.charge');
    this.hurt = q('.hurt');
    this.scoresEl = q('.scores');
    this._bigTimer = 0;
    this._last = {};
  }

  show(on) {
    this.arena.hidden = !on;
    if (!on) {
      this.feedEl.textContent = '';
      this.scores(null);
    }
  }

  stationDeck(inside) {
    this.station.querySelector('small').textContent = inside ? 'Deep Space 9' : 'Bajoran system';
    this.station.querySelector('strong').textContent = inside ? 'Promenade' : 'Deep Space 9';
    this.deckButton.querySelector('span').textContent = inside ? 'View exterior' : 'Return to Promenade';
  }

  glare(v) {
    this.glareEl.style.opacity = v > 0.001 ? v.toFixed(3) : '0';
  }

  // A big word in the middle of the screen, for ms (0: until the next).
  say(html, ms = 1600, kind = '') {
    this.bigEl.innerHTML = html;
    this.bigEl.className = `big show ${kind}`;
    clearTimeout(this._bigTimer);
    if (ms > 0) this._bigTimer = setTimeout(() => this.bigEl.classList.remove('show'), ms);
  }

  quiet() {
    clearTimeout(this._bigTimer);
    this.bigEl.classList.remove('show');
  }

  // A line in the feed at the top left.
  feed(html) {
    const line = document.createElement('div');
    line.innerHTML = html;
    this.feedEl.appendChild(line);
    while (this.feedEl.children.length > FEED_MOST) this.feedEl.firstChild.remove();
    setTimeout(() => line.remove(), FEED_FOR);
  }

  // The red flash of being fragged.
  ouch() {
    this.hurt.classList.remove('on');
    void this.hurt.offsetWidth;
    this.hurt.classList.add('on');
  }

  update(arena) {
    const me = arena.me;
    const m = arena.match;
    const set = (key, el, text, html = false) => {
      if (this._last[key] === text) return;
      this._last[key] = text;
      if (html) el.innerHTML = text;
      else el.textContent = text;
    };
    const left = Math.ceil(m.left);
    set('clock', this.clock, `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')} · ${NAME.toLowerCase()} · to ${m.rules.frags}`);
    const mine = m.byId.get(me.id);
    const at = m.placeOf(me.id);
    const top = m.standings()[0];
    const lead = top === mine ? m.standings()[1] : top;
    set('place', this.place, `${at.tied ? 'tied ' : ''}${ordinal(at.place)} · ${mine.frags}${lead ? ` <span>${top === mine ? 'next' : 'leader'} ${esc(lead.name)} ${lead.frags}</span>` : ''}`, true);
    set('frags', this.frags, String(mine.frags));
    set('health', this.health, me.alive ? '100' : '0');
    const charge = 1 - Math.min(1, me.reload / RELOAD);
    const dash = (RING * (1 - charge)).toFixed(1);
    if (this._last.dash !== dash) {
      this._last.dash = dash;
      this.charge.style.strokeDasharray = `${RING.toFixed(1)}`;
      this.charge.style.strokeDashoffset = dash;
      this.charge.classList.toggle('ready', charge >= 1);
    }
  }

  // The scores, best first (or null to put them away).
  scores(arena, footer = '') {
    if (!arena) {
      this.scoresEl.hidden = true;
      this._scores = '';
      return;
    }
    const m = arena.match;
    const rows = m
      .standings()
      .map((f, i) => {
        const fighter = arena.fighters.find((g) => g.id === f.id);
        return `<tr class="${f.me ? 'me' : ''}"><td>${ordinal(i + 1)}</td><td>${named(fighter)}</td><td>${f.frags}</td><td>${f.deaths}</td></tr>`;
      })
      .join('');
    const head = m.over ? `${m.winner.me ? 'you win!' : `${esc(m.winner.name)} wins`}` : NAME.toLowerCase();
    const html = `<h2>${head}</h2><table><tr><th></th><th></th><th>frags</th><th>deaths</th></tr>${rows}</table><p>${footer}</p>`;
    if (html !== this._scores) {
      this._scores = html;
      this.scoresEl.innerHTML = html;
    }
    this.scoresEl.hidden = false;
  }

  dispose() {
    this.el.remove();
  }
}
