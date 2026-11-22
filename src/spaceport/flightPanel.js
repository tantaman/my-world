// The manifest at the launch pad. Native dialog focus keeps keyboard, touch
// and controller selection on the route buttons until one is chosen.
import { DESTINATIONS } from './flight.js';

function chart(canvas, station) {
  const pen = canvas.getContext('2d');
  pen.scale(2, 2);
  pen.translate(48, 31);
  pen.strokeStyle = station ? '#efbd83' : '#a4c4d2';
  pen.fillStyle = '#20262e';
  pen.lineWidth = 1.25;
  const line = (points, close = false) => {
    pen.beginPath();
    points.forEach(([x, y], i) => i ? pen.lineTo(x, y) : pen.moveTo(x, y));
    if (close) { pen.closePath(); pen.fill(); }
    pen.stroke();
  };
  if (station) {
    for (const r of [34, 31, 18, 6]) {
      pen.beginPath();
      pen.ellipse(0, 0, r, r * 0.35, -0.07, 0, Math.PI * 2);
      pen.stroke();
    }
    for (const a of [1.25, 3.35, 5.44]) {
      const x = Math.cos(a) * 33, y = Math.sin(a) * 11 - x * 0.07;
      line([[0, 0], [x, y]]);
      for (const s of [-1, 1]) line([[x, y], [x * 1.06, y + 6 * s], [x * 0.98, y + 12 * s], [x * 0.73, y + 18 * s], [x * 0.91, y + 10 * s], [x, y]], true);
    }
  } else {
    const tile = (x, y, size) => line([[x, y - size * 0.38], [x + size, y], [x, y + size * 0.38], [x - size, y]], true);
    for (const [x, y] of [[-26, -4], [4, -15], [27, 4], [-4, 16]]) {
      line([[0, 0], [x, y]]);
      tile(x, y, 11);
    }
    tile(0, 0, 16);
  }
}

export class FlightPanel {
  constructor(input, pick) {
    this.input = input;
    const dialog = this.el = document.createElement('dialog');
    dialog.id = 'flight-manifest';
    dialog.setAttribute('aria-labelledby', 'manifest-title');
    dialog.innerHTML = '<header><div><small>Skyhook launch site</small><h2 id="manifest-title">Choose a destination</h2></div><button type="button" aria-label="Stay on the pad">×</button></header>';
    for (const [id, { name, trip }] of Object.entries(DESTINATIONS)) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.destination = id;
      button.innerHTML = '<canvas width="192" height="124" aria-hidden="true"></canvas><span><strong></strong><small></small></span><i aria-hidden="true">↗</i>';
      chart(button.querySelector('canvas'), id === 'ds9');
      button.querySelector('strong').textContent = name;
      button.querySelector('small').textContent = trip;
      dialog.appendChild(button);
    }
    dialog.addEventListener('click', (e) => {
      const button = e.target.closest('button');
      if (!button) return;
      this.close();
      if (button.dataset.destination) pick(button.dataset.destination);
    });
    dialog.addEventListener('cancel', (e) => { e.preventDefault(); this.close(); });
    // Controller B sends a synthetic Escape, which has no native default.
    dialog.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); this.close(); }
    });
    document.body.appendChild(dialog);
  }

  open() {
    if (this.el.open) return;
    if (document.pointerLockElement) document.exitPointerLock();
    this.input.setBlocked(true);
    this.el.showModal();
    this.el.setAttribute('aria-hidden', 'false');
    this.el.querySelector('[data-destination]').focus();
  }

  close() {
    if (!this.el.open) return;
    this.el.close();
    this.el.removeAttribute('aria-hidden');
    this.input.setBlocked(false);
  }
}
