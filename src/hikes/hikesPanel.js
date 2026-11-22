// The hikes, as a tab beside the map (M, then "hikes"): every hike in the
// world, what it is (the trail, how long, how far up, the lakes on it), and a
// button to go to its trailhead or straight to where its photo was taken.
//
// Handed plain descriptions of the hikes and what to do when one is picked,
// so it knows nothing about the world, the player or the map. It makes its
// list (el), and the map shows it.
//
//   hikes   [{ id, name, trail, length, climb, lakes, end, photos }]: length
//           and climb in real metres (a climb below zero is a walk down),
//           lakes a list of names of the water on it (its falls too), end
//           whether the walk goes on past the view to an end of its own,
//           photos the names of more photos taken on the walk
//   onGo    (id, 'trailhead' | 'view' | 'end' | 'photo-k') => void
//   here    () => the id of the hike you're on, or null

import './hikes.css';
import { formatDistance } from '../core/format.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export class HikesPanel {
  constructor({ hikes, onGo, here = () => null }) {
    this.hikes = hikes;
    this.onGo = onGo;
    this.here = here;

    const el = document.createElement('div');
    el.id = 'hikes';
    el.innerHTML = `
      <ol class="hikes-list">${hikes.map((h) => this._row(h)).join('')}</ol>
      <p class="hikes-note">${
        hikes.length ? 'Real hikes, grown from photos taken on them. The walk ends where the photo was taken, or goes on past it to an end of its own.' : 'No hikes yet.'
      } Add one with <code>npm run hike -- photo.heic</code>.</p>`;
    el.addEventListener('click', (e) => this._onClick(e));
    this.el = el;
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
          <button type="button" data-act="view">the view</button>${(h.photos || []).map((p, k) => `\n          <button type="button" data-act="photo-${k}">${esc(p)}</button>`).join('')}${h.end ? '\n          <button type="button" data-act="end">the end</button>' : ''}
        </div>
      </li>`;
  }

  // It has come into view: say which hike you're on.
  shown() {
    const here = this.here();
    for (const li of this.el.querySelectorAll('li')) li.classList.toggle('here', li.dataset.hike === here);
  }

  _onClick(e) {
    const act = e.target.closest('[data-act]');
    if (!act) return;
    this.onGo(act.closest('li').dataset.hike, act.dataset.act);
  }
}
