// ?free: fly the camera yourself. Drag to look, WASD to move, Q/E down/up,
// shift to go faster. Starts where the take is at ?t.
const SPEED = 4;   // metres a second

export function createFree(canvas, view) {
  const keys = new Set();
  let started = false;
  let last = performance.now();
  addEventListener('keydown', (e) => keys.add(e.code));
  addEventListener('keyup', (e) => keys.delete(e.code));
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointerup', () => { drag = null; });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    view.yaw += (e.clientX - drag.x) * 0.15;
    view.pitch = Math.max(-85, Math.min(85, view.pitch - (e.clientY - drag.y) * 0.15));
    drag = { x: e.clientX, y: e.clientY };
  });
  return {
    // Called each frame; the first call keeps where the path put the camera.
    update(v) {
      const now = performance.now();
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (!started) { started = true; return; }
      const s = SPEED * dt * (keys.has('ShiftLeft') ? 4 : 1);
      const yaw = (v.yaw * Math.PI) / 180;
      const fx = Math.cos(yaw);
      const fz = Math.sin(yaw);
      if (keys.has('KeyW')) { v.x += fx * s; v.z += fz * s; }
      if (keys.has('KeyS')) { v.x -= fx * s; v.z -= fz * s; }
      if (keys.has('KeyA')) { v.x += fz * s; v.z -= fx * s; }
      if (keys.has('KeyD')) { v.x -= fz * s; v.z += fx * s; }
      if (keys.has('KeyE')) v.y += s;
      if (keys.has('KeyQ')) v.y -= s;
    },
  };
}
