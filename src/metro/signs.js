// The Metro's signs, painted in code onto a canvas: the brown pylon at an
// entrance, with its white M and a band of colour for each line that stops
// there; a station's name on the pylons along its platforms, with a dot for
// each line; the sign on a train's front and the ones along its sides, its
// line's colour and where it's going; and the boards hung over a platform
// that say when the next trains come, as Metro's do:
//
//   LN  CAR  DEST       MIN
//   RD   6   Glenmont     3
//
// Most are painted once and kept. An arrival board is a canvas of its own
// for each level, painted again whenever what it says changes. (Only where
// there's a page to paint on: in Node there are none, and nothing that
// wants one draws it.)

import * as THREE from 'three';

export const BRONZE = '#4a3426';
const FONT = 'Helvetica, Arial, sans-serif';
const cache = new Map();

function canvasOf(w, h) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return canvas;
}

function paint(key, w, h, draw) {
  let tex = cache.get(key);
  if (tex) return tex;
  const canvas = canvasOf(w, h);
  if (!canvas) return null;
  draw(canvas.getContext('2d'), w, h);
  tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  cache.set(key, tex);
  return tex;
}

// The text as large as it fits in `room` px, from `size` down.
function fit(g, text, room, size, weight = 'bold') {
  let s = size;
  g.font = `${weight} ${s}px ${FONT}`;
  while (g.measureText(text).width > room && s > 10) {
    s -= 2;
    g.font = `${weight} ${s}px ${FONT}`;
  }
  return s;
}

// The top of an entrance's pylon: the M, and under it a band for each line.
export function pylonTop(colours) {
  return paint(`pylon:${colours.join()}`, 128, 256, (g, w, h) => {
    g.fillStyle = BRONZE;
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#f4f1ea';
    g.font = `bold 118px ${FONT}`;
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

// A station's name, as it is on the pylons along its platforms: white on
// bronze, on one line or two, and under it a stripe of each line's colour.
export function nameBoard(name, colours) {
  return paint(`name:${name}:${colours.join()}`, 512, 192, (g, w, h) => {
    g.fillStyle = BRONZE;
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#f4f1ea';
    g.textBaseline = 'middle';
    g.textAlign = 'left';
    // on two lines where it's long: broken at a word near its middle
    const words = name.split(/\s+/);
    let lines = [name];
    if (name.length > 18 && words.length > 1) {
      let best = 1;
      for (let k = 1; k < words.length; k++) if (Math.abs(words.slice(0, k).join(' ').length - name.length / 2) < Math.abs(words.slice(0, best).join(' ').length - name.length / 2)) best = k;
      lines = [words.slice(0, best).join(' '), words.slice(best).join(' ')];
    }
    const size = Math.min(...lines.map((l) => fit(g, l, w - 44, lines.length > 1 ? 58 : 72)));
    g.font = `bold ${size}px ${FONT}`;
    const top = lines.length > 1 ? 54 : 76;
    lines.forEach((l, k) => g.fillText(l, 22, top + k * (size + 6)));
    const band = (w - 44) / Math.max(1, colours.length);
    colours.forEach((c, k) => {
      g.fillStyle = c;
      g.fillRect(22 + k * band, h - 30, band - 4, 12);
    });
  });
}

// The sign over a train's windscreen, and along its sides: its line's
// colour and name, and where it's going, in amber lights.
export function destination(colour, line, to) {
  return paint(`dest:${line}:${to}`, 512, 64, (g, w, h) => {
    g.fillStyle = '#0b0b0b';
    g.fillRect(0, 0, w, h);
    g.fillStyle = colour;
    g.fillRect(8, 8, 150, h - 16);
    g.fillStyle = '#111';
    g.font = `bold 30px ${FONT}`;
    g.textBaseline = 'middle';
    g.textAlign = 'center';
    g.fillText(line.toUpperCase(), 83, h / 2 + 1);
    g.fillStyle = '#ffb347';
    g.textAlign = 'left';
    fit(g, to, w - 186, 34);
    g.fillText(to, 172, h / 2 + 1);
  });
}

// What a board calls where a train's going, short, as Metro's boards do.
const SHORT = {
  'Shady Grove': 'Shady Grv',
  'New Carrollton': 'NewCrltn',
  'Vienna/Fairfax–GMU': 'Vienna',
  'Downtown Largo': 'Largo',
  'Franconia–Springfield': 'Franconia',
  'Branch Avenue': 'Branch Av',
  'Mount Vernon Square': 'Mt Vernon',
  Huntington: 'Huntingtn',
};
export const shortName = (to) => SHORT[to] || (to.length > 10 ? to.slice(0, 9) : to);
// what a line is on a board
const CODE = { red: 'RD', orange: 'OR', blue: 'BL', silver: 'SV', green: 'GR', yellow: 'YL' };

// A level's arrival board: { texture, show(rows) }, rows the next few trains,
// soonest first: { line (its id), colour, cars, to, min ('ARR', 'BRD' or a
// number) }. Painted again only when what it says changes. (null in Node.)
export function arrivalBoard() {
  const W = 512;
  const H = 128;
  const canvas = canvasOf(W, H);
  if (!canvas) return null;
  const g = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  let said = '';
  const AMBER = '#ff9a1f';
  const col = [14, 70, 140, 498]; // LN, CAR, DEST, MIN (right-aligned)
  return {
    texture,
    show(rows) {
      const key = rows.map((r) => `${r.line}${r.cars}${r.to}${r.min}`).join('|');
      if (key === said) return;
      said = key;
      g.fillStyle = '#050505';
      g.fillRect(0, 0, W, H);
      g.textBaseline = 'middle';
      g.font = `bold 20px ${FONT}`;
      g.fillStyle = AMBER;
      const head = 16;
      g.textAlign = 'left';
      g.fillText('LN', col[0], head);
      g.fillText('CAR', col[1], head);
      g.fillText('DEST', col[2], head);
      g.textAlign = 'right';
      g.fillText('MIN', col[3], head);
      rows.slice(0, 3).forEach((r, k) => {
        const y = 50 + k * 30;
        g.font = `bold 26px ${FONT}`;
        g.textAlign = 'left';
        g.fillStyle = r.colour;
        g.fillText(CODE[r.line] || r.line.slice(0, 2).toUpperCase(), col[0], y);
        g.fillStyle = AMBER;
        g.fillText(String(r.cars), col[1] + 10, y);
        g.fillText(shortName(r.to), col[2], y);
        g.textAlign = 'right';
        g.fillText(String(r.min), col[3], y);
      });
      // the lights' grain: a dark grid between them
      g.fillStyle = 'rgba(0,0,0,0.35)';
      for (let x = 0; x < W; x += 4) g.fillRect(x, 0, 1, H);
      for (let y = 0; y < H; y += 4) g.fillRect(0, y, W, 1);
      texture.needsUpdate = true;
    },
    dispose() {
      texture.dispose();
    },
  };
}
