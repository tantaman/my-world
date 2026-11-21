// Game controllers, through the browser's Gamepad API.
//
// A pad is asked, not heard: Pads.read() looks at every controller the
// browser knows of and says which buttons are down, which went down since it
// last looked, and where the sticks are. Its buttons are spelled like keys
// (PadA, PadLB, PadUp…: PAD_BUTTONS) so that they are bound and held the way
// keys are: a command lists them among its keys (game/commands.js), and the
// held controls in input.js name them beside the keyboard's.
//
// The names are for where a button sits in the browser's standard layout,
// which is an Xbox pad's: A at the bottom of the four, B on the right, X on
// the left, Y at the top. What the player sees a button called depends on the
// pad in their hands (padName): ✕ ○ □ △ on a PlayStation one.
//
// The browser shows a page no pad at all until one of its buttons is pressed.

// The standard layout's buttons, by index. (16, the home button, is the
// system's.)
export const PAD_BUTTONS = [
  'PadA', 'PadB', 'PadX', 'PadY',
  'PadLB', 'PadRB', 'PadLT', 'PadRT',
  'PadSelect', 'PadStart', 'PadL3', 'PadR3',
  'PadUp', 'PadDown', 'PadLeft', 'PadRight',
];
const TRIGGERS = new Set([6, 7]);

// A stick nearer the middle than `dead` (0..1 of its travel) is let go of:
// they rarely come to rest at exactly nothing. Past `full` it's all the way over.
export const STICK = { dead: 0.18, full: 0.95 };
// Looking round wants fine control near the middle and speed at the edge:
// how far over the right stick is, to this power.
export const LOOK_CURVE = 1.7;
// A trigger counts as pressed past this much of its travel (0..1).
export const TRIGGER_DOWN = 0.35;

// Where a stick is, (x, y) as the pad gives it (y is down), rescaled so the
// dead zone is nothing and `full` is 1, and bent by `curve`. Written into out.
export function stick(x, y, curve = 1, out = { x: 0, y: 0 }) {
  const m = Math.hypot(x || 0, y || 0);
  const k = Math.min(1, (m - STICK.dead) / (STICK.full - STICK.dead));
  if (!(k > 0)) {
    out.x = 0;
    out.y = 0;
    return out;
  }
  const s = Math.pow(k, curve) / m;
  out.x = x * s;
  out.y = y * s;
  return out;
}

// Which family of pad, from the name the browser gives it, for what to call
// its buttons. (Vendor ids: 054c is Sony, 057e Nintendo.)
export function padKind(id = '') {
  if (/054c|playstation|dualshock|dualsense|wireless controller/i.test(id)) return 'playstation';
  if (/057e|nintendo|pro controller|joy-?con/i.test(id)) return 'nintendo';
  return 'xbox';
}

const NAMES = {
  xbox: { PadA: 'A', PadB: 'B', PadX: 'X', PadY: 'Y', PadLB: 'LB', PadRB: 'RB', PadLT: 'LT', PadRT: 'RT', PadSelect: 'select', PadStart: 'start' },
  playstation: { PadA: '✕', PadB: '○', PadX: '□', PadY: '△', PadLB: 'L1', PadRB: 'R1', PadLT: 'L2', PadRT: 'R2', PadSelect: 'create', PadStart: 'options' },
  // a Nintendo pad has its letters the other way round from where they sit
  nintendo: { PadA: 'B', PadB: 'A', PadX: 'Y', PadY: 'X', PadLB: 'L', PadRB: 'R', PadLT: 'ZL', PadRT: 'ZR', PadSelect: '−', PadStart: '+' },
};
const EVERY_PAD = {
  PadL3: 'L3',
  PadR3: 'R3',
  PadUp: 'd-pad ↑',
  PadDown: 'd-pad ↓',
  PadLeft: 'd-pad ←',
  PadRight: 'd-pad →',
  // not buttons, but the help panel names them too
  PadLS: 'left stick',
  PadRS: 'right stick',
};

// What a button is called on a pad of this kind.
export function padName(code, kind = 'xbox') {
  return (NAMES[kind] || NAMES.xbox)[code] || EVERY_PAD[code] || code.replace(/^Pad/, '');
}

// Several, as the help panel writes them: 'LB · RB', 'd-pad ↑ ↓'.
export function padNames(codes, kind = 'xbox') {
  let out = '';
  let dpad = false;
  for (const code of codes) {
    let n = padName(code, kind);
    const d = n.startsWith('d-pad ');
    const more = d && dpad;
    if (more) n = n.slice('d-pad '.length);
    dpad = d;
    out += (out ? (more ? ' ' : ' · ') : '') + n;
  }
  return out;
}

// Which of the first four axes are away from the middle, as a bit each. On a
// pad without the standard layout they are not reliably the two sticks: a
// trigger is often among them, and a trigger sits at -1 until it is pulled (a
// DualShock in Firefox says left x, left y, right x, L2, R2, right y). Taken
// for a stick it would turn the camera for ever, so an axis resting over isn't
// one. Read once, when the pad is first counted, so a pad is only ever read
// against how it was then; a stick held at that moment is given up on, which
// is the lesser of the two.
export function restingAxes(axes = []) {
  let mask = 0;
  for (let i = 0; i < 4; i++) if (Math.abs(axes[i] || 0) > STICK.dead) mask |= 1 << i;
  return mask;
}

// Axis i of a pad, or nothing if restingAxes said it isn't a stick.
const axis = (axes, resting, i) => (((resting >> i) & 1) ? 0 : axes[i]);

const browserPads = () => (typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : []);

// Every pad plugged in, read as one: a button is down if it is down on any of
// them, and each stick is wherever it is pushed furthest.
export class Pads {
  // list: () => the pads, as navigator.getGamepads() gives them
  constructor(list = browserPads) {
    this.list = list;
    this.down = new Set(); // buttons held now
    this.went = new Set(); // ...and the ones that went down since the last read
    this.move = { x: 0, y: 0 }; // left stick: x right, y down
    this.look = { x: 0, y: 0 }; // right stick, bent by LOOK_CURVE
    this.kind = 'xbox'; // of the pad touched last (padKind)
    this.connected = false;
    // A pad that doesn't say it has the standard layout may be anything
    // (some keyboards and wheels say they are pads), so it counts only once
    // one of its buttons has been pressed. Each pad it knows, by index and
    // id, against which of its first four axes aren't sticks (restingAxes).
    this._woken = new Map();
    this._spare = new Set();
    this._s = { x: 0, y: 0 };
  }

  read() {
    let pads;
    try {
      pads = this.list() || [];
    } catch {
      pads = []; // not allowed here (an insecure page, a permissions policy)
    }
    const now = this._spare;
    now.clear();
    const { move, look, _s: s } = this;
    move.x = move.y = look.x = look.y = 0;
    let moveM = 0;
    let lookM = 0;
    this.connected = false;
    for (const p of pads) {
      if (!p || !p.connected || !p.buttons) continue;
      let pressed = false;
      for (let i = 0; i < PAD_BUTTONS.length && i < p.buttons.length; i++) {
        const b = p.buttons[i];
        const v = typeof b === 'number' ? b : b.value;
        if (TRIGGERS.has(i) ? v > TRIGGER_DOWN : typeof b === 'number' ? b > 0.5 : b.pressed) {
          now.add(PAD_BUTTONS[i]);
          pressed = true;
        }
      }
      const key = `${p.index}:${p.id}`;
      let skip = this._woken.get(key);
      if (skip === undefined) {
        if (p.mapping !== 'standard') {
          if (!pressed) continue;
          skip = restingAxes(p.axes); // where they sit now is where they rest
        } else skip = 0;
        this._woken.set(key, skip);
      }
      this.connected = true;
      const a = p.axes || [];
      let touched = pressed;
      stick(axis(a, skip, 0), axis(a, skip, 1), 1, s);
      let m = Math.hypot(s.x, s.y);
      if (m > moveM) {
        moveM = m;
        move.x = s.x;
        move.y = s.y;
      }
      touched ||= m > 0;
      stick(axis(a, skip, 2), axis(a, skip, 3), LOOK_CURVE, s);
      m = Math.hypot(s.x, s.y);
      if (m > lookM) {
        lookM = m;
        look.x = s.x;
        look.y = s.y;
      }
      touched ||= m > 0;
      if (touched) this.kind = padKind(p.id);
    }
    this.went.clear();
    for (const code of now) if (!this.down.has(code)) this.went.add(code);
    this._spare = this.down;
    this.down = now;
    return this;
  }

  // What a button is called on the pad in hand.
  name(code) {
    return padName(code, this.kind);
  }
}

// While an overlay (the map, a panel) has the keyboard, the pad types into
// it: B is Escape, and so is the button that opened it; A is Enter (input.js
// presses the button in focus with it); the d-pad goes from one button to the
// next, as Tab and shift-Tab do (FOCUS_NEXT, FOCUS_BACK: input.js moves the
// focus itself); the left stick is the arrow keys (the map pans with them);
// and the shoulder buttons are - and = (the map's zoom). Held, the d-pad and
// the stick type again and again, as a held key does.
export const FOCUS_NEXT = 'FocusNext';
export const FOCUS_BACK = 'FocusBack';
export const OVERLAY_KEYS = {
  PadB: 'Escape',
  PadA: 'Enter',
  PadLB: 'Minus',
  PadRB: 'Equal',
  PadUp: FOCUS_BACK,
  PadLeft: FOCUS_BACK,
  PadDown: FOCUS_NEXT,
  PadRight: FOCUS_NEXT,
  StickUp: 'ArrowUp',
  StickDown: 'ArrowDown',
  StickLeft: 'ArrowLeft',
  StickRight: 'ArrowRight',
};
// KeyboardEvent.key for each key code typed
export const KEY_OF = { Escape: 'Escape', Enter: 'Enter', Minus: '-', Equal: '=', ArrowUp: 'ArrowUp', ArrowDown: 'ArrowDown', ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight' };
// A held direction types again after this long (s), and then this often (s).
export const REPEAT = { after: 0.4, every: 0.09 };
const REPEATS = new Set(['PadUp', 'PadDown', 'PadLeft', 'PadRight', 'StickUp', 'StickDown', 'StickLeft', 'StickRight']);
// The left stick counts as pushed one way this far over (0..1).
const STICK_PUSHED = 0.6;

export class PadTyping {
  constructor() {
    this._held = new Map(); // what is held -> when it types again (s), Infinity for never
  }

  // The key codes to type now. Asked every read, whether an overlay is open
  // or not (live), so that a button already held when one opens isn't taken
  // for a press: only what goes down while it's open types, and repeats.
  // t: seconds · opener: a pad button that is Escape too, or null.
  keys(pads, t, live, opener = null, out = []) {
    out.length = 0;
    for (const code in OVERLAY_KEYS) {
      if (!this._holding(pads, code)) {
        this._held.delete(code);
        continue;
      }
      const next = this._held.get(code);
      if (next === undefined) {
        this._held.set(code, live && REPEATS.has(code) ? t + REPEAT.after : Infinity);
        if (live) out.push(OVERLAY_KEYS[code]);
      } else if (live && t >= next) {
        this._held.set(code, t + REPEAT.every);
        out.push(OVERLAY_KEYS[code]);
      }
    }
    if (live && opener && opener !== 'PadB' && pads.went.has(opener) && !out.includes('Escape')) out.push('Escape');
    return out;
  }

  _holding(pads, code) {
    const m = pads.move;
    if (code === 'StickUp') return m.y < -STICK_PUSHED;
    if (code === 'StickDown') return m.y > STICK_PUSHED;
    if (code === 'StickLeft') return m.x < -STICK_PUSHED;
    if (code === 'StickRight') return m.x > STICK_PUSHED;
    return pads.down.has(code);
  }
}
