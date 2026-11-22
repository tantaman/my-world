// Keys, and what they do.
//
// A feature binds its own keys here rather than adding a line to a big key
// handler somewhere else, and the help panel (H) is written from the same
// list, so the two can't drift apart.
//
//   commands.add({
//     id: 'map', keys: ['KeyM'], group: 'WANDER', label: 'map · mark places',
//     run: () => map.open(),
//   });
//
//   keys    KeyboardEvent.code values; any of them triggers the command. A
//           game controller's buttons go here too, spelled PadA, PadSelect,
//           PadUp… (src/player/gamepad.js): keys: ['KeyM', 'PadSelect']
//   run     called once when a key goes down
//   hold    called every frame a key is down, with dt (for scrubbing)
//   group   which heading of the help panel it is listed under; leave `label`
//   label   out to keep a command off the panel
//   help    how the keys are written on the panel, if not as they come ('M')
//   now     () => what pressing it would do here, right now, in a word or
//           two ('get in', 'float', 'get out'), or '' while nothing here
//           calls for it. A command that says so is *at hand* while it has a
//           word: it heads the list in your pack and, on a touch screen, has
//           a button of its own, named by the word (src/pack/). Leave it out
//           for what is done as well anywhere (the map).
//
// A command needs no key. One with a label is done from the pack whether it
// has one or not (offers(), below), so a new feature doesn't have to find a
// free letter: there are none. With no key it has no line on the help panel.
//
// Controls that aren't commands (walking, the mouse) still belong on the help
// panel: commands.describe({ group, help: 'W A S D', pad: ['PadLS'], label: 'walk' }).
//
// The help panel says the keys, or to someone playing with a pad, its buttons
// where there are any: each row has `pad`, the pad buttons, if it has some.

const GROUP_ORDER = ['WANDER', 'BUILD', 'LOOK'];

const KEY_NAMES = {
  BracketLeft: '[',
  BracketRight: ']',
  Minus: '-',
  Equal: '=',
  Comma: ',',
  Period: '.',
  Slash: '/',
  Space: 'space',
  Escape: 'esc',
  Tab: 'tab',
};
const keyName = (code) => KEY_NAMES[code] || code.replace(/^Key|^Digit/, '');
const isPad = (code) => code.startsWith('Pad');
// How a command's keys are written, and which of them are a pad's buttons.
const written = (c) => ({ help: c.help || c.keys.filter((k) => !isPad(k)).map(keyName).join(' '), pad: c.keys.filter(isPad) });

export class Commands {
  constructor() {
    this.list = [];
    this.rows = []; // what the help panel shows, in the order it was said
    this.bound = new Map(); // key code -> command id
    this.pressed = new Set(); // ids held down from somewhere other than their keys (press())
    this._offers = []; // what offers() hands out, made again when a command is added
    this._offering = []; // ...and the command behind each
    this._offered = -1;
  }

  add(cmd) {
    const c = { keys: [], ...cmd };
    for (const code of c.keys) {
      const taken = this.bound.get(code);
      if (taken && taken !== c.id) console.warn(`key ${code} is bound to both "${taken}" and "${c.id}"`);
      this.bound.set(code, c.id);
    }
    this.list.push(c);
    if (c.label) {
      const { help, pad } = written(c);
      // (with nothing to press there is nothing for the help panel to say)
      if (help || pad.length) this.rows.push({ group: c.group || 'OTHER', help, label: c.label, ...(pad.length ? { pad } : {}) });
    }
    return c;
  }

  // A row of the help panel with no command behind it. `help` and `label` may
  // be functions, for rows that depend on what else is installed. `pad`: the
  // pad buttons (or sticks: PadLS, PadRS) that do it, if any.
  describe(row) {
    this.rows.push({ group: 'OTHER', ...row });
  }

  run(id) {
    const c = this.list.find((k) => k.id === id);
    if (c && c.run) c.run();
  }

  // Press a command from somewhere other than its keys (a button on the
  // screen): it runs now and, if it is one that can be held, is held every
  // frame from the next until release(id), with no key to name.
  press(id) {
    this.run(id);
    this.pressed.add(id);
  }

  release(id) {
    this.pressed.delete(id);
  }

  // input: { wasPressed(code), down(...codes) }
  update(input, dt) {
    for (const c of this.list) {
      if (c.run && c.keys.some((k) => input.wasPressed(k))) c.run();
      if (!c.hold) continue;
      for (const k of c.keys) if (input.down(k)) c.hold(dt, k);
      if (this.pressed.has(c.id)) c.hold(dt, null);
    }
  }

  // Everything there is to do by pressing something, for whoever offers it
  // without its key (the pack, src/pack/): each command with a label, and
  // what it would do now.
  //   -> [{ id, group, label, help, pad?, word }], group by group as the help
  //      panel has them, and within a group in the order they were added
  //   help   its keys as the help panel writes them ('' if it has none)
  //   word   what its `now` says ('' for nothing here), or null if it has none
  // A command that is held rather than pressed (it has `hold`) and doesn't
  // say what a press would do now is left out: a list can't hold a key down.
  // The same array and rows are handed out each time, with the words as they
  // are now: copy what you keep.
  offers() {
    if (this._offered !== this.list.length) {
      this._offered = this.list.length;
      const groups = [];
      const all = [];
      for (const c of this.list) {
        if (!c.label || !c.run || (c.hold && !c.now)) continue;
        const group = c.group || 'OTHER';
        if (!groups.includes(group)) groups.push(group);
        const { help, pad } = written(c);
        all.push({ c, row: { id: c.id, group, label: c.label, help, ...(pad.length ? { pad } : {}), word: null } });
      }
      const rank = (g) => (GROUP_ORDER.includes(g) ? GROUP_ORDER.indexOf(g) : GROUP_ORDER.length + groups.indexOf(g));
      all.sort((a, b) => rank(a.row.group) - rank(b.row.group));
      this._offering = all.map((o) => o.c);
      this._offers = all.map((o) => o.row);
    }
    for (let i = 0; i < this._offers.length; i++) {
      const c = this._offering[i];
      this._offers[i].word = c.now ? c.now() || '' : null;
    }
    return this._offers;
  }

  // -> [{ group, rows: [{ help, label, pad? }] }] for the help panel
  help() {
    const groups = new Map();
    for (const r of this.rows) {
      if (!groups.has(r.group)) groups.set(r.group, []);
      const text = (v) => (typeof v === 'function' ? v() : v);
      groups.get(r.group).push({ help: text(r.help), label: text(r.label), ...(r.pad ? { pad: r.pad } : {}) });
    }
    const rank = (g) => (GROUP_ORDER.includes(g) ? GROUP_ORDER.indexOf(g) : GROUP_ORDER.length);
    return [...groups.keys()].sort((a, b) => rank(a) - rank(b)).map((group) => ({ group, rows: groups.get(group) }));
  }
}
