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
};
const keyName = (code) => KEY_NAMES[code] || code.replace(/^Key|^Digit/, '');
const isPad = (code) => code.startsWith('Pad');

export class Commands {
  constructor() {
    this.list = [];
    this.rows = []; // what the help panel shows, in the order it was said
    this.bound = new Map(); // key code -> command id
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
      const pad = c.keys.filter(isPad);
      const help = c.help || c.keys.filter((k) => !isPad(k)).map(keyName).join(' ');
      this.rows.push({ group: c.group || 'OTHER', help, label: c.label, ...(pad.length ? { pad } : {}) });
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

  // input: { wasPressed(code), down(...codes) }
  update(input, dt) {
    for (const c of this.list) {
      if (c.run && c.keys.some((k) => input.wasPressed(k))) c.run();
      if (c.hold) for (const k of c.keys) if (input.down(k)) c.hold(dt, k);
    }
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
