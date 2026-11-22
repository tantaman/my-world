// The settings panel (O, or the settings button): how the picture looks,
// the sound, the hour. Things you set once and leave, so they don't each take
// a key; whichever feature owns a setting puts it here, and the panel is
// written from what they put.
//
//   hud.setting({
//     id: 'outlines', group: 'PICTURE', label: 'outlines',
//     get: () => pipeline.outline > 0,         // a switch: true or false
//     set: (on) => { ... },
//   });
//   hud.setting({
//     id: 'softness', group: 'PICTURE', label: 'pixel softness',
//     min: 0, max: 1, step: 0.05,              // a slider: a number
//     get: () => pipeline.softness, set: (v) => { ... },
//     show: (v) => v.toFixed(2),               // how its value is written
//   });
//   hud.setting({
//     id: 'hiker', group: 'YOU', label: 'who is hiking',
//     options: [{ value: 'hiker', label: 'the hiker' }, ...],  // one of a few
//     get: () => id, set: (value) => { ... },
//   });
//
//   can     () => false leaves it off the panel for now (fullscreen where
//           the browser has none)
//
// Groups are listed in the order their first settings were added, which is
// the order features install. While it's open the panel has the keyboard
// (block(true)), and reads every value again each frame (refresh), since
// some change by themselves: the hour, when time flows.

import './settings.css';

const TEMPLATE = /* html */ `
  <div class="settings-head">
    <h2>SETTINGS</h2>
    <button type="button" data-act="close" aria-label="Close (O)">✕</button>
  </div>
  <div class="settings-body"></div>
`;

// The groups, in the order they were first named, and their settings.
// controls: [{ group, ... }] -> [{ group, list: [...] }]
export function settingGroups(controls) {
  const groups = new Map();
  for (const c of controls) {
    if (!groups.has(c.group)) groups.set(c.group, []);
    groups.get(c.group).push(c);
  }
  return [...groups].map(([group, list]) => ({ group, list }));
}

export class SettingsPanel {
  // block(on): give the keyboard to the panel, or back
  constructor({ block = () => {}, parent = document.getElementById('hud') } = {}) {
    this.block = block;
    this.controls = [];
    this.rows = new Map(); // id -> { control, input, value }
    this.isOpen = false;
    this._drawn = false;
    const root = document.createElement('div');
    root.id = 'settings';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', 'Settings');
    root.setAttribute('aria-hidden', 'true');
    root.innerHTML = TEMPLATE;
    parent.appendChild(root);
    this.root = root;
    this.body = root.querySelector('.settings-body');
    root.addEventListener('click', (e) => {
      if (e.target.closest('[data-act="close"]')) this.close();
    });
    // This panel is made before the game's own keyboard listener, so it
    // keeps the keys that close it from reaching the game as well: Esc
    // would put down the tool in hand, and O would open it again.
    addEventListener('keydown', (e) => {
      if (!this.isOpen) return;
      if (e.code === 'Escape' || e.code === 'KeyO') {
        e.preventDefault();
        e.stopImmediatePropagation();
        this.close();
      }
    });
  }

  add(control) {
    if (this.controls.some((c) => c.id === control.id)) throw new Error(`setting "${control.id}" is already on the panel`);
    if (typeof control.get !== 'function' || typeof control.set !== 'function') throw new Error(`setting "${control.id}" needs a get() and a set(v)`);
    this.controls.push({ group: 'OTHER', ...control });
    this._drawn = false;
    if (this.isOpen) this._draw();
  }

  open() {
    if (this.isOpen) return;
    this.isOpen = true;
    this.block(true);
    if (document.pointerLockElement) document.exitPointerLock?.();
    this._draw();
    this.root.classList.add('open');
    this.root.setAttribute('aria-hidden', 'false');
    const first = this.body.querySelector('button, input');
    if (first) first.focus({ preventScroll: true });
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.root.classList.remove('open');
    this.root.setAttribute('aria-hidden', 'true');
    this.block(false);
    if (document.activeElement && this.root.contains(document.activeElement)) document.activeElement.blur();
  }

  toggle() {
    if (this.isOpen) this.close();
    else this.open();
  }

  // Show what each setting is now.
  refresh() {
    if (!this.isOpen) return;
    for (const { control, input, value } of this.rows.values()) {
      const v = control.get();
      if (control.options) {
        for (const b of input.children) b.setAttribute('aria-checked', String(b.dataset.value === String(v)));
      } else if (input.type === 'range') {
        if (!input.matches(':active')) input.value = String(v); // not while it's being dragged
        const text = control.show ? control.show(v) : String(v);
        if (value.textContent !== text) value.textContent = text;
      } else {
        input.setAttribute('aria-checked', String(!!v));
        input.textContent = v ? 'on' : 'off';
      }
    }
  }

  _draw() {
    if (this._drawn) return this.refresh();
    this._drawn = true;
    this.body.textContent = '';
    this.rows.clear();
    for (const { group, list } of settingGroups(this.controls.filter((c) => !c.can || c.can()))) {
      const h = document.createElement('h3');
      h.textContent = group;
      this.body.appendChild(h);
      for (const c of list) this.body.appendChild(this._row(c));
    }
    this.refresh();
  }

  _row(c) {
    const row = document.createElement('div');
    row.className = 'settings-row';
    const label = document.createElement('label');
    label.textContent = c.label;
    label.htmlFor = `setting-${c.id}`;
    row.appendChild(label);
    let input;
    let value = null;
    if (c.options) {
      // one of a few: a button for each, the one it is ringed
      row.classList.add('choice');
      input = document.createElement('div');
      input.setAttribute('role', 'radiogroup');
      input.setAttribute('aria-label', c.label);
      for (const o of c.options) {
        const b = document.createElement('button');
        b.type = 'button';
        b.setAttribute('role', 'radio');
        b.dataset.value = String(o.value);
        b.textContent = o.label;
        b.addEventListener('click', () => {
          c.set(o.value);
          this.refresh();
        });
        input.appendChild(b);
      }
      row.appendChild(input);
    } else if (c.min !== undefined && c.max !== undefined) {
      row.classList.add('slider');
      value = document.createElement('output');
      value.htmlFor = `setting-${c.id}`;
      input = document.createElement('input');
      input.type = 'range';
      input.min = String(c.min);
      input.max = String(c.max);
      input.step = String(c.step ?? 'any');
      input.addEventListener('input', () => {
        c.set(Number(input.value));
        this.refresh();
      });
      row.append(value, input);
    } else {
      input = document.createElement('button');
      input.type = 'button';
      input.setAttribute('role', 'switch');
      input.addEventListener('click', () => {
        c.set(!c.get());
        this.refresh();
      });
      row.appendChild(input);
    }
    input.id = `setting-${c.id}`;
    input.dataset.setting = c.id;
    this.rows.set(c.id, { control: c, input, value });
    return row;
  }
}
