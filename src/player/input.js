// Keyboard + mouse (pointer lock or drag) + touch (virtual stick / look pad).

export class Input {
  constructor(dom) {
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

    addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      this._interact();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());

    dom.addEventListener('mousedown', (e) => {
      this._interact();
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
    addEventListener('mouseup', () => (this.dragging = false));
    addEventListener('mousemove', (e) => {
      if (this.locked || this.dragging) {
        this.lookX += e.movementX || 0;
        this.lookY += e.movementY || 0;
      }
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === dom;
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
        this.isTouch = true;
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

  _interact() {
    if (this.onFirstInteract) {
      const f = this.onFirstInteract;
      this.onFirstInteract = null;
      f();
    }
  }

  down(...codes) {
    return codes.some((c) => this.keys.has(c));
  }

  // Movement axes in [-1, 1]: x = strafe right, y = forward
  moveAxes() {
    let x = 0;
    let y = 0;
    if (this.down('KeyW', 'ArrowUp')) y += 1;
    if (this.down('KeyS', 'ArrowDown')) y -= 1;
    if (this.down('KeyD', 'ArrowRight')) x += 1;
    if (this.down('KeyA', 'ArrowLeft')) x -= 1;
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

  running() {
    if (this.touchMove.active) return Math.hypot(this.touchMove.x, this.touchMove.y) > 0.92;
    return this.down('ShiftLeft', 'ShiftRight');
  }

  jumped() {
    const j = this.pressed.has('Space') || this.touchJump;
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
  }
}
