// Keyboard + mouse (pointer lock or drag) + touch (virtual stick / look pad)
// + game controllers (gamepad.js).
//
// This is the raw state of the controls. Walking reads it directly (BINDINGS
// below); everything else that happens on a key press is a command, bound by
// the feature that owns it (src/game/commands.js).
//
// A pad's buttons are keys here, spelled PadA, PadLB, PadUp… (gamepad.js): held
// ones are in `keys` and new presses in `pressed`, beside the keyboard's, so a
// command binds one by listing it among its keys. The pads are read at the end
// of each frame, for the next to see as it sees keys pressed in between. Its
// sticks are not keys: the left one walks (moveAxes), the right one looks
// (lookRate), and the triggers are the tool buttons (holding, tapped).

import { Emitter } from '../core/events.js';
import { Pads, PadTyping, PAD_BUTTONS, KEY_OF, FOCUS_NEXT, FOCUS_BACK } from './gamepad.js';

// Held controls: KeyboardEvent.code values, or a pad's buttons, any of which
// will do.
export const BINDINGS = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  right: ['KeyD', 'ArrowRight'],
  left: ['KeyA', 'ArrowLeft'],
  run: ['ShiftLeft', 'ShiftRight', 'PadB'],
  jump: ['Space', 'PadA'],
  turnLeft: ['KeyQ'],
  turnRight: ['KeyE'],
  zoomIn: ['PadUp'],
  zoomOut: ['PadDown'],
};
// On a pad the triggers are the tool buttons: right uses, left is the second action.
const PAD_TOOL = { use: 'PadRT', alt: 'PadLT' };
const NO_STICK = Object.freeze({ x: 0, y: 0 });
// A pad is picked up when a button on it goes down, or a stick is pushed this
// far (0..1): further than a worn stick drifts on its own.
const PICKED_UP = 0.5;
// Set while the pad types into an overlay, so those keys aren't taken for the player's.
let typing = false;
// What the d-pad goes between in an overlay, as Tab would.
const PRESSABLE = 'button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

// Emits:
//   'touch'  ()          the first touch: this visitor is playing on a touch screen
//   'pad'    (on)        a pad was picked up (true), or put down for the keyboard
//                        or mouse (false): what to call the controls changes
export class Input extends Emitter {
  constructor(dom) {
    super();
    this.dom = dom;
    this.keys = new Set();
    this.pressed = new Set(); // keys pressed this frame
    this.lookX = 0;
    this.lookY = 0;
    this.zoom = 0;
    this.locked = false;
    this.dragging = false;
    this.touchMove = { x: 0, y: 0, active: false, id: null, ox: 0, oy: 0 };
    this.touchLook = { id: null, x: 0, y: 0 };
    this.touchJump = false;
    this.isTouch = false;
    this.onFirstInteract = null;
    this.blocked = false; // while an overlay (the map) has the keyboard
    // Tool buttons: 'use' (left mouse / touch button) and 'alt' (right mouse);
    // and on a touch screen, 'dive'.
    this.held = { use: false, alt: false, dive: false };
    this.hit = new Set(); // 'use' | 'alt' pressed this frame
    // Game controllers: what they say (gamepad.js), whether one is what's in
    // the player's hands, and the button that opened an overlay, which closes
    // it again.
    this.pads = new Pads();
    this.padTyping = new PadTyping();
    this.padInUse = false;
    this._opener = null;
    this._typed = [];
    this._move = NO_STICK;
    this._look = NO_STICK;

    addEventListener('keydown', (e) => {
      if (typing) return;
      this._usePad(false);
      if (this.blocked) return;
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      this._interact();
    });
    addEventListener('keyup', (e) => {
      if (!typing) this.keys.delete(e.code);
    });
    addEventListener('blur', () => {
      this.keys.clear();
      this.held.use = this.held.alt = this.held.dive = false;
    });

    dom.addEventListener('mousedown', (e) => {
      this._interact();
      this._usePad(false);
      if (this.blocked) return;
      // While the pointer is locked the left button uses the tool in hand.
      // The right button always does the tool's second action.
      if ((e.button === 0 && this.locked) || e.button === 2) {
        const b = e.button === 0 ? 'use' : 'alt';
        if (!this.held[b]) this.hit.add(b);
        this.held[b] = true;
        if (e.button === 2) return;
      }
      if (e.button === 0 && !this.locked && dom.requestPointerLock) {
        try {
          const p = dom.requestPointerLock();
          if (p && p.catch) p.catch(() => {});
        } catch {
          /* fall back to dragging */
        }
      }
      this.dragging = true;
    });
    addEventListener('mouseup', (e) => {
      if (e.button === 0) {
        this.dragging = false;
        this.held.use = false;
      } else if (e.button === 2) this.held.alt = false;
    });
    addEventListener('mousemove', (e) => {
      if (this.blocked) return;
      if (this.locked || this.dragging) {
        this.lookX += e.movementX || 0;
        this.lookY += e.movementY || 0;
      }
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === dom;
      if (!this.locked) this.held.use = false;
    });
    dom.addEventListener(
      'wheel',
      (e) => {
        this.zoom += Math.sign(e.deltaY);
        this._usePad(false);
        e.preventDefault();
      },
      { passive: false },
    );
    dom.addEventListener('contextmenu', (e) => e.preventDefault());

    // Touch: left half = movement stick, right half = look. Tap right = jump.
    dom.addEventListener(
      'touchstart',
      (e) => {
        if (!this.isTouch) {
          this.isTouch = true;
          this.emit('touch');
        }
        this._interact();
        this._usePad(false);
        for (const t of e.changedTouches) {
          if (t.clientX < innerWidth * 0.45 && this.touchMove.id === null) {
            Object.assign(this.touchMove, { id: t.identifier, ox: t.clientX, oy: t.clientY, x: 0, y: 0, active: true });
          } else if (this.touchLook.id === null) {
            Object.assign(this.touchLook, { id: t.identifier, x: t.clientX, y: t.clientY, sx: t.clientX, sy: t.clientY, t0: performance.now() });
          }
        }
        e.preventDefault();
      },
      { passive: false },
    );
    dom.addEventListener(
      'touchmove',
      (e) => {
        for (const t of e.changedTouches) {
          if (t.identifier === this.touchMove.id) {
            const dx = t.clientX - this.touchMove.ox;
            const dy = t.clientY - this.touchMove.oy;
            const r = 55;
            const l = Math.hypot(dx, dy);
            const k = l > r ? r / l : 1;
            this.touchMove.x = (dx * k) / r;
            this.touchMove.y = (dy * k) / r;
          } else if (t.identifier === this.touchLook.id) {
            this.lookX += (t.clientX - this.touchLook.x) * 1.6;
            this.lookY += (t.clientY - this.touchLook.y) * 1.6;
            this.touchLook.x = t.clientX;
            this.touchLook.y = t.clientY;
          }
        }
        e.preventDefault();
      },
      { passive: false },
    );
    const end = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this.touchMove.id) {
          Object.assign(this.touchMove, { id: null, x: 0, y: 0, active: false });
        } else if (t.identifier === this.touchLook.id) {
          const moved = Math.hypot(t.clientX - this.touchLook.sx, t.clientY - this.touchLook.sy);
          if (moved < 10 && performance.now() - this.touchLook.t0 < 250) this.touchJump = true;
          this.touchLook.id = null;
        }
      }
    };
    dom.addEventListener('touchend', end);
    dom.addEventListener('touchcancel', end);
  }

  setBlocked(on) {
    // A pad button that opened the overlay closes it too (PadTyping).
    this._opener = on ? PAD_BUTTONS.find((c) => this.pressed.has(c)) || null : null;
    this.blocked = on;
    this._move = this._look = NO_STICK;
    this.keys.clear();
    this.pressed.clear();
    this.lookX = 0;
    this.lookY = 0;
    this.zoom = 0;
    this.dragging = false;
    this.touchJump = false;
    Object.assign(this.touchMove, { id: null, x: 0, y: 0, active: false });
    this.touchLook.id = null;
    this.held.use = this.held.alt = this.held.dive = false;
    this.hit.clear();
  }

  _interact() {
    if (this.onFirstInteract) {
      const f = this.onFirstInteract;
      this.onFirstInteract = null;
      f();
    }
  }

  // On-screen buttons (touch) for the two tool actions.
  bindButton(el, which) {
    if (!el) return;
    const on = (e) => {
      this._interact();
      if (!this.held[which]) this.hit.add(which);
      this.held[which] = true;
      e.preventDefault();
      e.stopPropagation();
    };
    const off = (e) => {
      this.held[which] = false;
      e.preventDefault();
    };
    el.addEventListener('pointerdown', on);
    el.addEventListener('pointerup', off);
    el.addEventListener('pointercancel', off);
    el.addEventListener('pointerleave', off);
  }

  // Is a tool button held / was it pressed this frame?
  holding(which) {
    return this.held[which] || this.keys.has(PAD_TOOL[which]);
  }

  tapped(which) {
    return this.hit.has(which) || this.pressed.has(PAD_TOOL[which]);
  }

  down(...codes) {
    return codes.some((c) => this.keys.has(c));
  }

  // Is a held control (see BINDINGS) down?
  isDown(action) {
    return BINDINGS[action].some((c) => this.keys.has(c));
  }

  // Movement axes in [-1, 1]: x = strafe right, y = forward
  moveAxes() {
    let x = 0;
    let y = 0;
    if (this.isDown('forward')) y += 1;
    if (this.isDown('back')) y -= 1;
    if (this.isDown('right')) x += 1;
    if (this.isDown('left')) x -= 1;
    if (this.touchMove.active) {
      x += this.touchMove.x;
      y -= this.touchMove.y;
    }
    x += this._move.x;
    y -= this._move.y;
    const l = Math.hypot(x, y);
    if (l > 1) {
      x /= l;
      y /= l;
    }
    return { x, y };
  }

  // Diving, out of your depth: shift (as something that flies stoops), or
  // the button on a touch screen.
  diving() {
    return this.isDown('run') || this.held.dive;
  }

  running() {
    if (this.touchMove.active) return Math.hypot(this.touchMove.x, this.touchMove.y) > 0.92;
    return this.isDown('run');
  }

  jumped() {
    const j = BINDINGS.jump.some((c) => this.pressed.has(c)) || this.touchJump;
    this.touchJump = false;
    return j;
  }

  // How hard the right stick is pushed, (x right, y down) in [-1, 1]: a rate
  // to turn the camera at, where the mouse gives a distance (consumeLook).
  lookRate() {
    return this._look;
  }

  consumeLook() {
    const l = { x: this.lookX, y: this.lookY };
    this.lookX = 0;
    this.lookY = 0;
    return l;
  }

  consumeZoom() {
    const z = this.zoom;
    this.zoom = 0;
    return z;
  }

  wasPressed(code) {
    return this.pressed.has(code);
  }

  endFrame() {
    this.pressed.clear();
    this.hit.clear();
    this.poll();
  }

  // Read the pads (at the end of a frame, for the next one). Their buttons go
  // into keys and pressed, or while an overlay has the keyboard, type the
  // keys it listens for instead.
  poll(t = performance.now() / 1000) {
    const pads = this.pads.read();
    if (pads.went.size || Math.hypot(pads.move.x, pads.move.y) > PICKED_UP || Math.hypot(pads.look.x, pads.look.y) > PICKED_UP) this._usePad(true);
    if (pads.went.size) this._interact();
    const typed = this.padTyping.keys(pads, t, this.blocked, this._opener, this._typed);
    if (this.blocked) {
      this._move = this._look = NO_STICK;
    } else {
      this._move = pads.move;
      this._look = pads.look;
      for (const code of PAD_BUTTONS) {
        if (pads.down.has(code)) this.keys.add(code);
        else this.keys.delete(code);
      }
      for (const code of pads.went) this.pressed.add(code);
    }
    // Last: a key typed may close the overlay, and with it change all of the above.
    for (const code of typed) this._type(code);
  }

  // A key typed by the pad into whatever has the focus (an overlay listens
  // for it on the window). Enter that nothing took presses the button in focus.
  _type(code) {
    if (typeof document === 'undefined') return;
    if (code === FOCUS_NEXT || code === FOCUS_BACK) return this._step(code === FOCUS_NEXT ? 1 : -1);
    const at = document.activeElement || document.body;
    const init = { key: KEY_OF[code], code, bubbles: true, cancelable: true };
    const down = new KeyboardEvent('keydown', init);
    typing = true;
    try {
      at.dispatchEvent(down);
      at.dispatchEvent(new KeyboardEvent('keyup', init));
    } finally {
      typing = false;
    }
    if (code === 'Enter' && !down.defaultPrevented && at !== document.body && typeof at.click === 'function') at.click();
  }

  // Move the focus to the next (by 1) or the one before (-1) of what can be
  // pressed in the overlay that has it, round from the ends. The overlays
  // are the elements that say aria-hidden="false" while they're open.
  _step(by) {
    const at = document.activeElement;
    const root = (at && at.closest && at.closest('[aria-hidden="false"]')) || [...document.querySelectorAll('[aria-hidden="false"]')].pop();
    if (!root) return;
    const all = [...root.querySelectorAll(PRESSABLE)].filter((el) => !el.disabled && el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden');
    if (!all.length) return;
    const i = all.indexOf(at);
    all[i < 0 ? (by > 0 ? 0 : all.length - 1) : (i + by + all.length) % all.length].focus();
  }

  _usePad(on) {
    if (this.padInUse === on) return;
    this.padInUse = on;
    this.emit('pad', on);
  }
}
