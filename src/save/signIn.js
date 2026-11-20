// The door into a world on the save server: who are you?
//
// Shown before a shared world opens, when the server doesn't know this
// browser yet. Someone new picks a name and a password; someone coming back
// from another browser, or after signing out, gives theirs. It only asks:
// WorldSave does the talking to the server, and asks again, with what went
// wrong, until it works.
//
// It stands over the loading screen before there is a game, so it has the
// keyboard to itself.

import './save.css';
import { NAME_MAX, PASSWORD_MIN, PASSWORD_MAX, cleanName, nameProblem, passwordProblem } from './who.js';

const TEMPLATE = /* html */ `
  <form class="door-card" novalidate aria-labelledby="door-world">
    <h1>my-world</h1>
    <h2 id="door-world" data-el="world"></h2>
    <p data-el="lede"></p>
    <label class="door-field">
      <span>name</span>
      <input data-el="name" name="username" type="text" maxlength="${NAME_MAX}" autocomplete="username" autocapitalize="off" spellcheck="false" />
    </label>
    <label class="door-field">
      <span>password</span>
      <span class="door-secret">
        <input data-el="password" name="password" type="password" maxlength="${PASSWORD_MAX}" />
        <button type="button" data-act="show" data-el="show" aria-pressed="false">show</button>
      </span>
    </label>
    <p class="door-problem" data-el="problem" role="alert" hidden></p>
    <button type="submit" class="door-go" data-el="go"></button>
    <p class="door-note" data-el="note"></p>
    <p class="door-switch"><span data-el="switch-lede"></span> <button type="button" data-act="switch" data-el="switch"></button></p>
  </form>`;

const MODES = {
  new: {
    lede: "Pick a name and a password to come in. They're how you come back as yourself, from any browser, and find things as you left them.",
    note: `Everyone here sees your name. A password needs ${PASSWORD_MIN} or more characters, and can't be reset, so pick one you'll remember.`,
    go: 'enter the world',
    switchLede: 'been here before?',
    switch: 'sign in',
    autocomplete: 'new-password',
  },
  back: {
    lede: 'Welcome back. Sign in with the name and password you picked here.',
    note: '',
    go: 'sign in',
    switchLede: 'new here?',
    switch: 'pick a name',
    autocomplete: 'current-password',
  },
};

export class SignIn {
  constructor() {
    this.root = null;
    this.el = null;
    this.back = false;
    this.answer = null; // resolves the ask() in hand, until the form is sent
  }

  // -> a promise of { name, password, back } once the form is sent.
  //   world    the world's name
  //   problem  what went wrong last time, if anything
  //   name, back   what to start from: a name to fill in, and whether this
  //                is someone coming back rather than someone new
  ask({ world = '', problem = '', name = '', back = false } = {}) {
    this.#build();
    this.el.world.textContent = world || 'a shared world';
    this.#mode(back);
    if (name) this.el.name.value = name;
    this.#say(problem);
    this.#busy(false);
    this.root.hidden = false;
    const first = this.el.name.value ? this.el.password : this.el.name;
    first.focus({ preventScroll: true });
    if (problem) first.select();
    return new Promise((resolve) => (this.answer = resolve));
  }

  close() {
    if (!this.root) return;
    this.root.hidden = true;
    this.el.password.value = ''; // not left lying about in the page
    this.answer = null;
  }

  #build() {
    if (this.root) return;
    const root = document.createElement('div');
    root.id = 'door';
    root.hidden = true;
    root.innerHTML = TEMPLATE;
    document.body.appendChild(root);
    this.root = root;
    this.el = {};
    for (const node of root.querySelectorAll('[data-el]')) this.el[node.dataset.el] = node;
    root.querySelector('form').addEventListener('submit', (e) => this.#send(e));
    root.addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]');
      if (!act) return;
      if (act.dataset.act === 'switch') {
        this.#mode(!this.back);
        this.#say('');
        (this.el.name.value ? this.el.password : this.el.name).focus({ preventScroll: true });
      }
      if (act.dataset.act === 'show') {
        const shown = this.el.password.type === 'password';
        this.el.password.type = shown ? 'text' : 'password';
        this.el.show.textContent = shown ? 'hide' : 'show';
        this.el.show.setAttribute('aria-pressed', String(shown));
        this.el.password.focus({ preventScroll: true });
      }
    });
  }

  #mode(back) {
    this.back = back;
    const m = MODES[back ? 'back' : 'new'];
    this.el.lede.textContent = m.lede;
    this.el.note.textContent = m.note;
    this.el.note.hidden = !m.note;
    this.el.go.textContent = m.go;
    this.el['switch-lede'].textContent = m.switchLede;
    this.el.switch.textContent = m.switch;
    this.el.password.autocomplete = m.autocomplete;
  }

  #send(e) {
    e.preventDefault();
    if (!this.answer) return; // sent already: waiting to hear
    const name = cleanName(this.el.name.value);
    const password = this.el.password.value;
    // Someone new is held to the rules here; someone coming back has a
    // password that already passed them, and the server says if it's wrong.
    const problem = nameProblem(name) || (this.back ? (password ? '' : 'type your password') : passwordProblem(password));
    if (problem) {
      this.#say(problem);
      (nameProblem(name) ? this.el.name : this.el.password).focus({ preventScroll: true });
      return;
    }
    this.#busy(true);
    const answer = this.answer;
    this.answer = null;
    answer({ name, password, back: this.back });
  }

  #say(problem) {
    this.el.problem.textContent = problem || '';
    this.el.problem.hidden = !problem;
  }

  #busy(busy) {
    this.el.go.disabled = busy;
    this.el.switch.disabled = busy;
    this.el.name.readOnly = busy;
    this.el.password.readOnly = busy;
    if (busy) this.el.go.textContent = '…';
    else this.el.go.textContent = MODES[this.back ? 'back' : 'new'].go;
  }
}
