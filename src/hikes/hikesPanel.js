// The hikes panel (J, or the hikes button): every hike in the world, what
// it is (the trail, how long, how far up, the lakes on it), and a button to
// go to its trailhead or straight to where its photo was taken.
//
// Handed plain descriptions of the hikes and what to do when one is picked,
// so it knows nothing about the world or the player.
//
//   hikes   [{ id, name, trail, length, climb, lakes }]: length and climb in
//           real metres (a climb below zero is a walk down), lakes a list of
//           names of the water on it
//   onGo    (id, 'trailhead' | 'view') => void
//   here    () => the id of the hike you're on, or null

import './hikes.css';
import { formatDistance } from '../core/format.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export class HikesPanel {
  constructor({ hikes, input, onGo, here = () => null }) {
    this.hikes = hikes;
    this.input = input;
    this.onGo = onGo;
    this.here = here;
    this.isOpen = false;

    const root = document.createElement('div');
    root.id = 'hikes';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', 'Hikes');
    root.setAttribute('aria-hidden', 'true');
    root.innerHTML = `
      <div class="hikes-head">
        <h2>HIKES</h2>
        <button type="button" data-act="close" aria-label="Close (J)">✕</button>
      </div>
      <ol class="hikes-list">${hikes.map((h) => this._row(h)).join('')}</ol>
      <p class="hikes-note">${
        hikes.length
          ? 'Real hikes, grown from photos taken on them. The walk ends where the photo was taken.'
          : 'No hikes yet.'
      } Add one with <code>npm run hike -- photo.heic</code>.</p>`;
    (document.getElementById('hud') || document.body).appendChild(root);
    this.root = root;
    root.addEventListener('click', (e) => this._onClick(e));
    addEventListener('keydown', (e) => this._onKey(e));
  }

  _row(h) {
    // a walk to a cove goes down, not up; a few metres either way is neither
    const climb = Math.round(h.climb);
    const rise = Math.abs(climb) < 5 ? '' : `${Math.abs(climb)} m ${climb > 0 ? 'up' : 'down'}`;
    const facts = [h.trail, h.length ? formatDistance(h.length) : '', rise, ...h.lakes].filter(Boolean);
    return `
      <li data-hike="${esc(h.id)}">
        <div class="hikes-name">${esc(h.name)}<span class="hikes-here">you're here</span></div>
        <div class="hikes-facts">${facts.map(esc).join(' · ')}</div>
        <div class="hikes-go">
          <button type="button" data-act="trailhead">trailhead</button>
          <button type="button" data-act="view">the view</button>
        </div>
      </li>`;
  }

  open() {
    if (this.isOpen) return;
    this.isOpen = true;
    this.input.setBlocked(true);
    if (document.pointerLockElement) document.exitPointerLock?.();
    const here = this.here();
    for (const li of this.root.querySelectorAll('li')) li.classList.toggle('here', li.dataset.hike === here);
    this.root.classList.add('open');
    this.root.setAttribute('aria-hidden', 'false');
    // the hike you're on, or the first: its view if you're on it already
    const li = this.root.querySelector('li.here') || this.root.querySelector('li');
    if (li) li.querySelector(`[data-act="${li.classList.contains('here') ? 'view' : 'trailhead'}"]`).focus({ preventScroll: true });
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
    const act = e.target.closest('[data-act]');
    if (!act) return;
    if (act.dataset.act === 'close') return this.close();
    const li = act.closest('li');
    this.close();
    this.onGo(li.dataset.hike, act.dataset.act);
  }

  // Escape or J closes it; the arrow keys move between the buttons, a row up
  // or down, or across to the other end of the walk.
  _onKey(e) {
    if (!this.isOpen) return;
    if (e.key === 'Escape' || e.code === 'KeyJ') {
      e.preventDefault();
      this.close();
      return;
    }
    const move = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[e.key];
    if (!move) return;
    e.preventDefault();
    const rows = [...this.root.querySelectorAll('li')];
    const at = document.activeElement && document.activeElement.closest ? document.activeElement.closest('li') : null;
    const r = Math.max(0, Math.min(rows.length - 1, (at ? rows.indexOf(at) : 0) + move[0]));
    const c = Math.max(0, Math.min(1, (at ? [...at.querySelectorAll('button')].indexOf(document.activeElement) : 0) + move[1]));
    const target = rows[r] && rows[r].querySelectorAll('button')[c];
    if (target) target.focus({ preventScroll: true });
  }
}
