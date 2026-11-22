// The skeet card: at the top of the screen while you shoot a round, a box
// for each of the 25 targets (orange for one broken, a ring for one lost),
// your score so far, and what's thrown next, from which station. When the
// round is over it says how you did, and your best, for a while.

import './huntclub.css';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export class Scorecard {
  // parent: where it goes (#hud)
  constructor(parent) {
    const el = document.createElement('div');
    el.id = 'skeet';
    el.hidden = true;
    el.setAttribute('aria-live', 'polite');
    el.innerHTML = '<div class="head"><span class="title"></span><span class="score"></span></div><div class="boxes"></div><div class="next"></div>';
    parent.appendChild(el);
    this.el = el;
    this.title = el.querySelector('.title');
    this.score = el.querySelector('.score');
    this.boxes = el.querySelector('.boxes');
    this.nextEl = el.querySelector('.next');
    this._key = '';
  }

  // card: Range.card() (null hides it); club: the club's name; best: your best round, or null
  show(card, club, best) {
    if (!card) return this.hide();
    const key = JSON.stringify([card, club, best]);
    if (key === this._key) return;
    this._key = key;
    this.el.hidden = false;
    this.title.textContent = `${club} · skeet`;
    this.score.textContent = card.done ? `${card.score} of ${card.of}` : `${card.score} / ${card.shot}`;
    let html = '';
    for (let i = 0; i < card.of; i++) {
      const r = card.results[i];
      html += `<span class="${r === true ? 'dead' : r === false ? 'lost' : 'due'}"></span>`;
    }
    this.boxes.innerHTML = html;
    if (card.done) {
      const was = best !== null && best !== undefined ? ` · your best: ${best}` : '';
      this.nextEl.innerHTML = `round over${card.score === card.of ? ' · <b>a straight!</b>' : ''}${esc(was)}`;
    } else this.nextEl.innerHTML = `next: <b>station ${card.next.station}</b> · ${esc(card.next.what)}`;
  }

  hide() {
    if (this.el.hidden) return;
    this.el.hidden = true;
    this._key = '';
  }
}
