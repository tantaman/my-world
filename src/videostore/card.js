// The box in your hands, on the screen: its cover, big, with the title
// written across it, and beside it the back of the box, everything a back
// of a box says: the tagline, what it's about, who's in it and who made it,
// the year, the rating and how long it runs, a critic's stars, a staff
// pick's card, and what it costs. Under it, the other boxes you're holding.
// And after the till rings, the receipt.
//
// It's only something to read: it never takes a click (the use and alt
// buttons are the game's).
//
//   const card = new Card()
//   card.show(film | null, others, line)   the box on top, the rest, a hint
//   card.receipt(lines, ms)                a till receipt, for a while
//   card.hide()

import { paintCover, titleBand } from './covers.js';
import { termsOf, money } from './browse.js';
import { STORE } from './catalog.js';
import './videostore.css';

const BIG = { w: 72, h: 108 }; // the cover on the card, in its own pixels
const SMALL = { w: 24, h: 36 };

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const css = (c) => `rgb(${c.map((v) => Math.round(v)).join(',')})`;
const STARS = (n) => '★'.repeat(Math.floor(n)) + (n % 1 ? '½' : '');

export class Card {
  constructor() {
    const el = (this.el = document.createElement('div'));
    el.id = 'vhs';
    el.hidden = true;
    el.innerHTML = `
      <div class="box">
        <div class="front"><canvas width="${BIG.w}" height="${BIG.h}"></canvas><div class="title"></div><div class="sticker"></div></div>
        <div class="back"></div>
      </div>
      <div class="hands"></div>
      <div class="hint"></div>`;
    document.body.appendChild(el);
    this.canvas = el.querySelector('.front canvas');
    this.titleEl = el.querySelector('.front .title');
    this.sticker = el.querySelector('.front .sticker');
    this.back = el.querySelector('.back');
    this.handsEl = el.querySelector('.hands');
    this.hintEl = el.querySelector('.hint');
    this.slip = document.createElement('div');
    this.slip.id = 'vhs-receipt';
    this.slip.hidden = true;
    document.body.appendChild(this.slip);
    this._shown = null;
    this._others = '';
    this._slipTimer = 0;
  }

  show(film, others = [], hint = '') {
    if (!film) return this.hide();
    this.el.hidden = false;
    if (this._shown !== film.id) {
      this._shown = film.id;
      this._front(film);
      this._back(film);
    }
    const key = others.map((f) => f.id).join(',');
    if (key !== this._others) {
      this._others = key;
      this.handsEl.innerHTML = others.length ? `<span>also in your hands</span>${others.map((f) => `<i title="${esc(f.title)}">${miniCover(f)}<b>${esc(f.title)}</b></i>`).join('')}` : '';
    }
    if (this.hintEl.innerHTML !== hint) this.hintEl.innerHTML = hint;
  }

  hide() {
    this.el.hidden = true;
    this._shown = null;
  }

  receipt(html, ms = 7000) {
    this.slip.innerHTML = html;
    this.slip.hidden = false;
    clearTimeout(this._slipTimer);
    this._slipTimer = setTimeout(() => (this.slip.hidden = true), ms);
  }

  _front(film) {
    const ctx = this.canvas.getContext('2d');
    const img = ctx.createImageData(BIG.w, BIG.h);
    paintCover(film, img, 0, 0, BIG.w, BIG.h, { letters: false });
    ctx.putImageData(img, 0, 0);
    const T = titleBand(film);
    this.titleEl.textContent = film.title;
    this.titleEl.style.color = css(T.text);
    this.titleEl.style.top = T.at === 'top' ? '0' : '';
    this.titleEl.style.bottom = T.at === 'top' ? '' : `${T.foot * 100}%`;
    this.titleEl.style.height = `${T.h * 100}%`;
    this.titleEl.classList.toggle('long', film.title.length > 22);
    const sticker = film.section === 'new' ? 'NEW!' : film.section === 'sale' ? '$9.99' : film.staff ? 'STAFF PICK' : '';
    this.sticker.textContent = sticker;
    this.sticker.hidden = !sticker;
  }

  _back(film) {
    const T = termsOf(film);
    const price = T.buy ? `${money(T.price)} · yours to keep` : `${money(T.price)} · ${T.nights} ${T.nights === 1 ? 'night' : 'nights'}`;
    const lang = film.lang ? `<div class="lang">In ${film.lang} with English subtitles · <i>${esc(film.means)}</i></div>` : '';
    const note = film.note ? `<div class="note">${esc(film.staff)} says: “${esc(film.note)}”</div>` : '';
    this.back.innerHTML = `
      <div class="tagline">${esc(film.tagline)}</div>
      <p class="blurb">${esc(film.blurb)}</p>
      ${lang}
      <div class="credits">Starring <b>${film.cast.map(esc).join(', ')}</b><br>Directed by <b>${esc(film.director)}</b></div>
      <div class="facts"><span class="rating">${film.rating}</span>${film.year} · ${film.mins} min · ${film.cover.bw ? 'black &amp; white' : 'color'}</div>
      <div class="quote"><span class="stars">${STARS(film.stars)}</span> “${esc(film.quote.text)}”<small>— ${esc(film.quote.by)}</small></div>
      ${note}
      <div class="price">${price}</div>`;
  }
}

// A small cover as a data URL image, for the row of what else you hold.
const minis = new Map();
function miniCover(film) {
  let url = minis.get(film.id);
  if (!url) {
    const c = document.createElement('canvas');
    c.width = SMALL.w;
    c.height = SMALL.h;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(SMALL.w, SMALL.h);
    paintCover(film, img, 0, 0, SMALL.w, SMALL.h);
    ctx.putImageData(img, 0, 0);
    url = c.toDataURL();
    minis.set(film.id, url);
  }
  return `<img src="${url}" alt="">`;
}

// A till receipt: what was rung up, when it's due back, the total.
//   r       the checkout (browse.js)
//   number  your membership number
export function receiptHtml(r, number, when = (t) => new Date(t).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })) {
  const rows = r.items
    .map((i) => `<div class="row"><span>${esc(i.title)}</span><b>${money(i.price)}</b></div><div class="sub">${i.buy ? 'previously viewed · yours to keep' : `due back ${when(i.due)} by midnight`}</div>`)
    .join('');
  return `
    <div class="head">${esc(STORE.name.toUpperCase())}</div>
    <div class="sub">member no. ${esc(number)}</div>
    <hr>${rows}<hr>
    <div class="row total"><span>TOTAL</span><b>${money(r.total)}</b></div>
    <div class="foot">${r.buy ? 'Enjoy!' : 'Be kind, please rewind!'}</div>`;
}
