// The Metro's signs, painted once each in code onto a canvas: the brown pylon
// at an entrance, with its white M and a band of colour for each line that
// stops there; a station's name on its platform pylons, with a dot for each
// line; and the sign on a train's front, its line's colour and where it's
// going. (Only where there's a page to paint on: in Node, there are none,
// and nothing that wants one draws it.)

import * as THREE from 'three';

export const BRONZE = '#4a3426';
const cache = new Map();

function paint(key, w, h, draw) {
  if (typeof document === 'undefined') return null;
  let tex = cache.get(key);
  if (tex) return tex;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  draw(canvas.getContext('2d'), w, h);
  tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  cache.set(key, tex);
  return tex;
}

// The top of an entrance's pylon: the M, and under it a band for each line.
export function pylonTop(colours) {
  return paint(`pylon:${colours.join()}`, 128, 256, (g, w, h) => {
    g.fillStyle = BRONZE;
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#f4f1ea';
    g.font = 'bold 118px Helvetica, Arial, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('M', w / 2, 74);
    const band = Math.min(26, 110 / Math.max(1, colours.length));
    colours.forEach((c, k) => {
      g.fillStyle = c;
      g.fillRect(14, 150 + k * band, w - 28, band - 5);
    });
  });
}

// A station's name, as it is on the pylons along its platforms.
export function nameBoard(name, colours) {
  return paint(`name:${name}`, 1024, 160, (g, w, h) => {
    g.fillStyle = BRONZE;
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#f4f1ea';
    let size = 76;
    g.font = `bold ${size}px Helvetica, Arial, sans-serif`;
    const room = w - 60 - colours.length * 52;
    while (g.measureText(name).width > room && size > 30) {
      size -= 4;
      g.font = `bold ${size}px Helvetica, Arial, sans-serif`;
    }
    g.textBaseline = 'middle';
    g.fillText(name, 30, h / 2 + 2);
    colours.forEach((c, k) => {
      g.fillStyle = c;
      g.beginPath();
      g.arc(w - 40 - k * 52, h / 2, 20, 0, Math.PI * 2);
      g.fill();
    });
  });
}

// The sign over a train's windscreen: its line, and where it's going.
export function destination(colour, line, to) {
  return paint(`dest:${line}:${to}`, 512, 64, (g, w, h) => {
    g.fillStyle = '#0b0b0b';
    g.fillRect(0, 0, w, h);
    g.fillStyle = colour;
    g.fillRect(8, 8, 150, h - 16);
    g.fillStyle = '#111';
    g.font = 'bold 30px Helvetica, Arial, sans-serif';
    g.textBaseline = 'middle';
    g.textAlign = 'center';
    g.fillText(line.toUpperCase(), 83, h / 2 + 1);
    g.fillStyle = '#ffb347';
    g.textAlign = 'left';
    let size = 34;
    g.font = `bold ${size}px Helvetica, Arial, sans-serif`;
    while (g.measureText(to).width > w - 186 && size > 16) {
      size -= 2;
      g.font = `bold ${size}px Helvetica, Arial, sans-serif`;
    }
    g.fillText(to, 172, h / 2 + 1);
  });
}
