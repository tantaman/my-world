// The save panel (L, or the save button): put this world on the server, read
// back its address, see who else is here, and say who you are.

import './save.css';
import { NAME_MAX, PASSWORD_MIN, PASSWORD_MAX, cleanName, nameProblem, passwordProblem } from './who.js';

const TEMPLATE = /* html */ `
  <div class="share-head">
    <h2>THIS WORLD</h2>
    <button type="button" data-act="close" aria-label="Close (L)">✕</button>
  </div>

  <form data-when="new" data-el="new-form" novalidate>
    <p>It only exists in this browser. Put it on the save server and it gets an
    address of its own, so you can walk back in later — from any browser, on
    any machine.</p>
    <label class="share-field">
      <span>name</span>
      <input data-el="new-name" type="text" maxlength="80" placeholder="name it (optional)" autocomplete="off" spellcheck="false" />
    </label>
    <p>And you, in it — a name and a password to come back as yourself:</p>
    <label class="share-field">
      <span>you</span>
      <input data-el="you" name="username" type="text" maxlength="${NAME_MAX}" placeholder="your name" autocomplete="username" autocapitalize="off" spellcheck="false" />
    </label>
    <label class="share-field">
      <span>pass</span>
      <input data-el="pass" name="password" type="password" maxlength="${PASSWORD_MAX}" placeholder="${PASSWORD_MIN} or more characters" autocomplete="new-password" />
    </label>
    <button type="submit" data-act="publish" class="share-go">save this world</button>
    <p class="share-note">The forest is grown from a number, so a save only has
    to hold what you changed: the ground you moved, the trees you felled, what
    you built and where you marked. Anyone you give the link to picks a name
    and a password of their own.</p>
  </form>

  <div data-when="saved" hidden>
    <div class="share-you">
      <span data-el="you-line"></span>
      <button type="button" data-act="signout" data-el="signout">sign out</button>
    </div>
    <label class="share-field">
      <span>name</span>
      <input data-el="name" type="text" maxlength="80" placeholder="name this world" autocomplete="off" spellcheck="false" />
    </label>
    <label class="share-field">
      <span>link</span>
      <input data-el="url" type="text" readonly spellcheck="false" aria-label="This world's address" />
    </label>
    <div class="share-actions">
      <button type="button" data-act="copy">copy link</button>
      <button type="button" data-act="now">save now</button>
    </div>
    <div class="share-status" data-el="status" aria-live="polite"></div>
    <p class="share-note">Anyone with this link can walk in, once they've
    picked a name and a password — and build, alongside you. You'll see each
    other, and what either of you changes shows up in the other's world within
    a moment. A whole copy is kept now and then — the last 20 — so a flattened
    cabin isn't gone for good.</p>
  </div>`;

// What the corner button says, and what the panel reports underneath.
const STATES = {
  local: { button: 'save', line: 'Not saved yet.', tone: '' },
  saving: { button: 'saving…', line: 'Saving…', tone: '' },
  live: { button: 'live', line: 'Live.', tone: 'good' },
  saved: { button: 'saved', line: 'Saved.', tone: 'good' },
  offline: { button: 'offline', line: "Can't reach the save server — still trying.", tone: 'bad' },
  full: { button: 'too big', line: 'This world is too big to save.', tone: 'bad' },
  gone: { button: 'gone', line: 'This world is no longer on the server.', tone: 'bad' },
  out: { button: 'signed out', line: 'Signed out — nothing more is saved until you sign in again.', tone: 'bad' },
};

export class SharePanel {
  // peers: everyone else here (src/player/peers.js), to say who they are
  constructor({ save, peers = null, input, hud }) {
    this.save = save;
    this.peers = peers;
    this.input = input;
    this.hud = hud;
    this.isOpen = false;

    const root = document.createElement('div');
    root.id = 'share';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', 'Save this world');
    root.setAttribute('aria-hidden', 'true');
    root.innerHTML = TEMPLATE;
    (document.getElementById('hud') || document.body).appendChild(root);
    this.root = root;
    this.el = {};
    for (const node of root.querySelectorAll('[data-el]')) this.el[node.dataset.el] = node;
    this.panes = {};
    for (const node of root.querySelectorAll('[data-when]')) this.panes[node.dataset.when] = node;

    root.addEventListener('click', (e) => this._onClick(e));
    this.el['new-form'].addEventListener('submit', (e) => {
      e.preventDefault();
      this._publish(root.querySelector('[data-act="publish"]'));
    });
    this.el.name.addEventListener('input', () => this.save.rename(this.el.name.value));
    this.el.url.addEventListener('focus', () => this.el.url.select());
    addEventListener('keydown', (e) => this._onKey(e));
    save.on('status', () => this.refresh());
    this.refresh();
  }

  open() {
    if (this.isOpen) return;
    this.isOpen = true;
    this.input.setBlocked(true);
    if (document.pointerLockElement) document.exitPointerLock?.();
    this.root.classList.add('open');
    this.root.setAttribute('aria-hidden', 'false');
    this.refresh();
    const first = this.save.online ? this.el.url : this.el['new-name'];
    first.focus({ preventScroll: true });
    if (this.save.online) first.select();
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

  // Mirror the save state into the panel and the corner button.
  refresh() {
    const save = this.save;
    const state = STATES[save.status] || STATES.local;
    const online = save.online;
    const here = save.here;
    this.hud.setSave(online ? `${state.button}${here ? ` · ${here}` : ''}` : 'save', save.status);

    this.panes.new.hidden = online;
    this.panes.saved.hidden = !online;
    if (!online) return;

    if (document.activeElement !== this.el.name && this.el.name.value !== save.name) this.el.name.value = save.name;
    const url = save.url();
    if (this.el.url.value !== url) this.el.url.value = url;

    const out = save.status === 'out';
    this.el['you-line'].innerHTML = save.you && !out ? `you're <b>${escapeHtml(save.you)}</b> here` : 'signed out';
    this.el.signout.textContent = out ? 'sign in' : 'sign out';
    this.el.signout.dataset.act = out ? 'signin' : 'signout';

    const waiting = save.dirty || (save.pending && save.pending.size);
    const line = waiting && (save.status === 'saved' || save.status === 'local') ? 'Not saved yet.' : state.line;
    // by name; the same person in two browsers once
    const names = this.peers ? [...new Set(this.peers.list().map((p) => p.name || 'someone'))] : [];
    const who = names.length ? ` ${listOf(names.map(escapeHtml))} ${names.length === 1 ? 'is' : 'are'} here.` : here ? ` ${here} other${here === 1 ? '' : 's'} here.` : '';
    this.el.status.className = `share-status ${state.tone}`;
    this.el.status.innerHTML = `<b>${line}</b>${who}${save.detail ? ` ${escapeHtml(save.detail)}` : ''}`;
  }

  async _onClick(e) {
    const act = e.target.closest('[data-act]');
    if (!act) return;
    const which = act.dataset.act;
    if (which === 'close') return this.close();
    if (which === 'copy') return this._copy();
    if (which === 'now') {
      this.save.touch();
      return this._guard(act, () => this.save.flush(), 'saved');
    }
    if (which === 'signout') {
      // the next person to open the world here is asked who they are
      return this._guard(
        act,
        async () => {
          await this.save.signOut();
          location.reload();
        },
        'signed out',
      );
    }
    if (which === 'signin') location.reload();
    // 'publish' is the form's submit button: see the constructor
  }

  _publish(button) {
    const name = cleanName(this.el.you.value);
    const password = this.el.pass.value;
    const problem = nameProblem(name) || passwordProblem(password);
    if (problem) {
      this.hud.flash(problem);
      (nameProblem(name) ? this.el.you : this.el.pass).focus({ preventScroll: true });
      return;
    }
    return this._guard(
      button,
      async () => {
        await this.save.publish(this.el['new-name'].value.trim(), { name, password });
        this.el.pass.value = '';
        this.refresh();
        this.el.url.focus({ preventScroll: true });
        this.el.url.select();
      },
      'this world has an address now',
    );
  }

  // Run a save-ish action with the button held down, and say what happened.
  async _guard(button, run, done) {
    button.disabled = true;
    try {
      await run();
      if (this.save.status !== 'offline') this.hud.flash(done);
      else if (this.save.detail) this.hud.flash(this.save.detail);
    } catch (err) {
      this.hud.flash(err && err.message ? err.message : 'that did not save');
    } finally {
      button.disabled = false;
      this.refresh();
    }
  }

  async _copy() {
    const url = this.save.url();
    try {
      await navigator.clipboard.writeText(url);
      this.hud.flash('link copied');
    } catch {
      // No clipboard permission (or no clipboard): leave it selected to copy by hand.
      this.el.url.focus({ preventScroll: true });
      this.el.url.select();
      this.hud.flash('press ctrl/cmd + C to copy');
    }
  }

  _onKey(e) {
    if (!this.isOpen) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      this.close();
      return;
    }
    if (e.key === 'Enter' && e.target === this.el.name) {
      e.preventDefault();
      this.el.name.blur();
    }
  }
}

const escapeHtml = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// "ana", "ana and ben", "ana, ben and cal"
const listOf = (items) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`);
