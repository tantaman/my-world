// Keyboard + mouse (pointer lock or drag) + touch (virtual stick / look pad).
//
// This is the raw state of the controls. Walking reads it directly (BINDINGS
// below); everything else that happens on a key press is a command, bound by
// the feature that owns it (src/game/commands.js).

import { Emitter } from '../core/events.js';

// Held controls: KeyboardEvent.code values, any of which will do.
export const BINDINGS = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  right: ['KeyD', 'ArrowRight'],
  left: ['KeyA', 'ArrowLeft'],
  run: ['ShiftLeft', 'ShiftRight'],
  jump: ['Space'],
  turnLeft: ['KeyQ'],
  turnRight: ['KeyE'],
};

// Emits:
//   'touch'  ()   the first touch: this visitor is playing on a touch screen
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

    addEventListener('keydown', (e) => {
      if (this.blocked) return;
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      this._interact();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => {
      this.keys.clear();
      this.held.use = this.held.alt = this.held.dive = false;
    });

    dom.addEventListener('mousedown', (e) => {
      this._interact();
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
    this.blocked = on;
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
    return this.held[which];
  }

  tapped(which) {
    return this.hit.has(which);
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
  }
}
