// The adventure board (I, or the adventure button): every adventure there
// is, a line on what it is, how you've done at it, and a button to set off.
// While you're on one, it says which and offers to give it up.
//
// Handed plain descriptions and what to do when one is picked, so it knows
// nothing about the world:
//
//   kinds     [{ id, title, blurb }]
//   record    () => { id: { tries, won, best } }
//   now       () => the title of the one you're on, or null
//   onGo      (id) => void
//   onQuit    () => void
//   input     the controls, blocked while the board is up

import { clock } from './banner.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// How you've done at one, in a few words.
export function tally(r) {
  if (!r || !r.tries) return 'not yet tried';
  if (!r.won) return `tried ${r.tries === 1 ? 'once' : `${r.tries} times`}`;
  const times = r.won === 1 ? 'once' : `${r.won} times`;
  return `made it ${times}${r.best ? ` · best ${clock(r.best)}` : ''}`;
}

export class AdventureBoard {
  constructor({ kinds, record, now, onGo, onQuit, input }) {
    this.kinds = kinds;
    this.record = record;
    this.now = now;
    this.onGo = onGo;
    this.onQuit = onQuit;
    this.input = input;
    this.isOpen = false;

    const root = document.createElement('div');
    root.id = 'adventures';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', 'Adventures');
    root.setAttribute('aria-hidden', 'true');
    root.innerHTML = `
      <div class="adv-board-head">
        <h2>ADVENTURES</h2>
        <button type="button" data-act="close" aria-label="Close (I)">✕</button>
      </div>
      <p class="adv-board-note">The forest is quiet until you ask it not to be. Nothing an adventure does stays in your world, and if it goes badly you're back where it began.</p>
      <div class="adv-board-now" hidden><span></span><button type="button" data-act="quit">give it up</button></div>
      <ol class="adv-board-list"></ol>`;
    (document.getElementById('hud') || document.body).appendChild(root);
    this.root = root;
    this.list = root.querySelector('.adv-board-list');
    this.nowEl = root.querySelector('.adv-board-now');
    root.addEventListener('click', (e) => this._onClick(e));
    addEventListener('keydown', (e) => this._onKey(e));
  }

  _render() {
    const rec = this.record();
    const now = this.now();
    this.list.innerHTML = this.kinds
      .map(
        (k) => `
      <li><button type="button" data-act="go" data-kind="${esc(k.id)}"${now ? ' disabled' : ''}>
        <span class="adv-board-name">${esc(k.title)}</span><span class="adv-board-rec">${esc(tally(rec[k.id]))}</span>
        <span class="adv-board-blurb">${esc(k.blurb || '')}</span>
      </button></li>`,
      )
      .join('');
    this.nowEl.hidden = !now;
    if (now) this.nowEl.firstElementChild.textContent = `on now: ${now}`;
  }

  open() {
    if (this.isOpen) return;
    this.isOpen = true;
    this._render();
    this.input.setBlocked(true);
    if (document.pointerLockElement) document.exitPointerLock?.();
    this.root.classList.add('open');
    this.root.setAttribute('aria-hidden', 'false');
    // the one you're on, to give it up; or the first to start
    const first = this.nowEl.hidden ? this.root.querySelector('[data-act="go"]') : this.nowEl.querySelector('button');
    if (first) first.focus({ preventScroll: true });
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
    this.close();
    if (act.dataset.act === 'quit') this.onQuit();
    else if (act.dataset.act === 'go') this.onGo(act.dataset.kind);
  }

  // Escape or N closes it (the board has the keyboard, so the key that
  // opened it cannot come through the commands); up and down move between them.
  _onKey(e) {
    if (!this.isOpen) return;
    if (e.key === 'Escape' || e.code === 'KeyN') {
      e.preventDefault();
      this.close();
      return;
    }
    const move = { ArrowUp: -1, ArrowDown: 1 }[e.key];
    if (!move) return;
    e.preventDefault();
    const buttons = [...this.root.querySelectorAll('button:not([disabled])')].filter((b) => b.dataset.act !== 'close' && !b.closest('[hidden]'));
    const i = buttons.indexOf(document.activeElement);
    const next = buttons[Math.max(0, Math.min(buttons.length - 1, i + move))];
    if (next) next.focus({ preventScroll: true });
  }
}
