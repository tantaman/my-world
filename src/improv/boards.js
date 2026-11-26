// What's painted at the club, in code onto a canvas: the neon over the
// stage and the doors, the board in the lobby with the week's shows on it,
// and the posters by the door out on the street. (Only where there's a page
// to paint on: in Node there are none, and these give null.)
//
//   neon(text, { color, size, w, h, font })   glowing letters on nothing
//   board(title, rows)                         white on black, a line a show
//   poster(head, big, lines, accent)           a show's poster
//   paint(tex, ...) the same again onto a texture already made (the board
//                   and the posters change as the week goes on)

import * as THREE from 'three';

const canvasOf = (w, h) => {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
};
const textureOf = (canvas) => {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
};

// Glowing letters: a tube of near-white in the middle, the colour round it.
export function neon(text, { color = '#ff2a3a', size = 120, w = 1024, h = 256, font = 'italic 900' } = {}) {
  const c = canvasOf(w, h);
  if (!c) return null;
  const g = c.getContext('2d');
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `${font} ${size}px "Arial Black", Impact, Helvetica, sans-serif`;
  for (const [blur, alpha] of [[40, 0.9], [18, 1]]) {
    g.shadowColor = color;
    g.shadowBlur = blur;
    g.globalAlpha = alpha;
    g.strokeStyle = color;
    g.lineWidth = size * 0.09;
    g.strokeText(text, w / 2, h / 2);
  }
  g.shadowBlur = 6;
  g.globalAlpha = 1;
  g.fillStyle = '#fff4f0';
  g.fillText(text, w / 2, h / 2);
  return textureOf(c);
}

// The board in the lobby: a title, and a line for each show.
// rows: [{ day, time, what, who }]
export function board(title, rows, tex = null) {
  const c = tex ? tex.image : canvasOf(768, 512);
  if (!c) return null;
  const g = c.getContext('2d');
  const { width: w, height: h } = c;
  g.fillStyle = '#121014';
  g.fillRect(0, 0, w, h);
  g.strokeStyle = '#c8a040';
  g.lineWidth = 6;
  g.strokeRect(10, 10, w - 20, h - 20);
  g.fillStyle = '#ff4a50';
  g.font = 'italic 900 40px "Arial Black", Helvetica, sans-serif';
  g.textAlign = 'center';
  g.fillText(title, w / 2, 62);
  g.textAlign = 'left';
  const line = Math.min(42, (h - 110) / Math.max(1, rows.length));
  rows.forEach((r, k) => {
    const y = 112 + k * line;
    g.fillStyle = r.now ? '#ffe070' : '#f2ece0';
    g.font = `bold ${Math.round(line * 0.5)}px Helvetica, Arial, sans-serif`;
    g.fillText(`${r.day}  ${r.time}`, 36, y);
    g.fillStyle = r.now ? '#ffe070' : '#c8d0e0';
    g.font = `${Math.round(line * 0.46)}px Helvetica, Arial, sans-serif`;
    g.fillText(`${r.what}${r.who ? ` · ${r.who}` : ''}`.slice(0, 64), 250, y);
  });
  if (tex) tex.needsUpdate = true;
  return tex || textureOf(c);
}

// A poster: what it is at the top, a name big, and lines under it.
export function poster(head, big, lines, accent = '#e83040', tex = null) {
  const c = tex ? tex.image : canvasOf(384, 512);
  if (!c) return null;
  const g = c.getContext('2d');
  const { width: w, height: h } = c;
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#1a1418');
  grad.addColorStop(1, '#3a1a22');
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  // a spotlight, and a mic in it
  const spot = g.createRadialGradient(w / 2, h * 0.45, 10, w / 2, h * 0.45, w * 0.5);
  spot.addColorStop(0, 'rgba(255,240,200,0.55)');
  spot.addColorStop(1, 'rgba(255,240,200,0)');
  g.fillStyle = spot;
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#0c0c0e';
  g.fillRect(w / 2 - 4, h * 0.36, 8, h * 0.22);
  g.beginPath();
  g.ellipse(w / 2, h * 0.34, 16, 22, 0, 0, Math.PI * 2);
  g.fill();
  g.textAlign = 'center';
  g.fillStyle = accent;
  g.font = 'italic 900 34px "Arial Black", Helvetica, sans-serif';
  g.fillText(head, w / 2, 56);
  g.fillStyle = '#fff6ea';
  let size = 44;
  g.font = `bold ${size}px Helvetica, Arial, sans-serif`;
  while (g.measureText(big).width > w - 30 && size > 18) g.font = `bold ${(size -= 2)}px Helvetica, Arial, sans-serif`;
  g.fillText(big, w / 2, h * 0.7);
  g.fillStyle = '#e8dcc8';
  g.font = '22px Helvetica, Arial, sans-serif';
  lines.slice(0, 4).forEach((l, k) => g.fillText(l.slice(0, 30), w / 2, h * 0.7 + 40 + k * 28));
  if (tex) tex.needsUpdate = true;
  return tex || textureOf(c);
}
