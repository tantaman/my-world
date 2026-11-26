// Lettering and signs: drawn to a canvas (2D text and shapes), used as a
// texture on a thin board, and put through the same weathering as
// everything else (PLAN.md 5.8). The words themselves are in src/words.js.
import { CanvasTexture, SRGBColorSpace, Mesh, PlaneGeometry, BoxGeometry, Group } from 'three/webgpu';
import { texture, uv, vec3 } from 'three/tsl';
import { weathered } from '../materials/weathered.js';
import { WORDS } from '../words.js';

export { WORDS };

let EDGE = null;   // the boards' edges and backs, one material for every sign

const FONT = '"Arial Black", "Helvetica Neue", Arial, sans-serif';
const SCRIPT = '"Brush Script MT", "Segoe Script", cursive';

// A canvas of w x h pixels drawn by draw(ctx, w, h), as a texture.
export function canvasTexture(w, h, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  draw(ctx, w, h);
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function centred(ctx, text, x, y, size, font = FONT, colour = '#fff') {
  ctx.fillStyle = colour;
  ctx.font = `${size}px ${font}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
}

export const DRAW = {
  south(ctx, w, h) {
    ctx.fillStyle = '#efe9dc'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#b4231c'; ctx.fillRect(w * 0.06, h * 0.08, w * 0.88, h * 0.62);
    centred(ctx, WORDS.brand, w / 2, h * 0.39, Math.min(h * 0.2, w * 0.21), FONT, '#f4efe4');
    centred(ctx, WORDS.brandSub, w / 2, h * 0.84, h * 0.13, FONT, '#7a1712');
  },
  oil(ctx, w, h) {
    ctx.fillStyle = '#e8dfc8'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#7a1712'; ctx.lineWidth = w * 0.03; ctx.strokeRect(w * 0.04, h * 0.03, w * 0.92, h * 0.94);
    centred(ctx, WORDS.oil[0], w / 2, h * 0.1, h * 0.07, FONT, '#7a1712');
    centred(ctx, WORDS.oil[1], w / 2, h * 0.19, h * 0.08, FONT, '#7a1712');
    // The can.
    ctx.fillStyle = '#b4231c'; ctx.fillRect(w * 0.28, h * 0.3, w * 0.44, h * 0.38);
    ctx.fillStyle = '#efe9dc'; ctx.fillRect(w * 0.28, h * 0.42, w * 0.44, h * 0.12);
    centred(ctx, WORDS.brand, w / 2, h * 0.48, h * 0.07, FONT, '#b4231c');
    centred(ctx, WORDS.oil[2], w / 2, h * 0.79, h * 0.06, FONT, '#7a1712');
    centred(ctx, WORDS.oil[3], w / 2, h * 0.87, h * 0.06, FONT, '#7a1712');
  },
  tires(ctx, w, h) {
    ctx.fillStyle = '#d9d4c7'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#333'; ctx.lineWidth = h * 0.05; ctx.strokeRect(w * 0.04, h * 0.06, w * 0.92, h * 0.88);
    centred(ctx, WORDS.tires[0], w / 2, h * 0.4, h * 0.36, FONT, '#2a2a2a');
    centred(ctx, WORDS.tires[1], w / 2, h * 0.75, h * 0.16, FONT, '#2a2a2a');
  },
  ice(ctx, w, h) {
    ctx.fillStyle = '#e9e5da'; ctx.fillRect(0, 0, w, h);
    centred(ctx, WORDS.ice.split('').join(' '), w / 2, h * 0.55, h * 0.62, FONT, '#a3221a');
  },
  fascia(ctx, w, h) {
    ctx.fillStyle = '#4a4a44'; ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 0.5;
    centred(ctx, WORDS.brand, w * 0.18, h * 0.52, h * 0.7, FONT, '#d9d2c0');
    ctx.globalAlpha = 1;
  },
  welcome(ctx, w, h) {
    // An arrow of rusty sheet pointing left, cream face, red-brown script.
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h);
    ctx.beginPath();
    ctx.moveTo(0, h * 0.5); ctx.lineTo(w * 0.14, h * 0.04); ctx.lineTo(w * 0.14, h * 0.17); ctx.lineTo(w, h * 0.17);
    ctx.lineTo(w, h * 0.83); ctx.lineTo(w * 0.14, h * 0.83); ctx.lineTo(w * 0.14, h * 0.96); ctx.closePath();
    ctx.fillStyle = '#d8ccb0'; ctx.fill();
    ctx.lineWidth = h * 0.035; ctx.strokeStyle = '#5c2e1a'; ctx.stroke();
    centred(ctx, WORDS.welcome[0], w * 0.6, h * 0.27, h * 0.13, SCRIPT, '#6b2a18');
    centred(ctx, WORDS.welcome[1], w * 0.58, h * 0.5, h * 0.3, SCRIPT, '#6b2a18');
    centred(ctx, WORDS.welcome[2], w * 0.58, h * 0.72, h * 0.085, FONT, '#3b2a20');
    // A little saucer.
    ctx.fillStyle = '#3b2a20';
    ctx.beginPath(); ctx.ellipse(w * 0.24, h * 0.3, w * 0.05, h * 0.035, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(w * 0.24, h * 0.27, w * 0.02, h * 0.035, 0, Math.PI, 0); ctx.fill();
  },
  van(ctx, w, h) {
    ctx.fillStyle = '#ece6d8'; ctx.fillRect(0, 0, w, h);
    // Orange and red stripes sweeping back, the name in them.
    ctx.fillStyle = '#d0601e'; ctx.beginPath();
    ctx.ellipse(w * 0.38, h * 0.5, w * 0.36, h * 0.2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ece6d8'; ctx.beginPath();
    ctx.ellipse(w * 0.4, h * 0.5, w * 0.33, h * 0.15, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#b02a1a'; ctx.fillRect(w * 0.08, h * 0.44, w * 0.7, h * 0.13);
    centred(ctx, WORDS.van, w * 0.43, h * 0.505, h * 0.1, FONT, '#f6efe0');
  },
  close(ctx, w, h) {
    ctx.fillStyle = '#e8e2d2'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#222'; ctx.lineWidth = h * 0.06; ctx.strokeRect(0, 0, w, h);
    centred(ctx, WORDS.door, w / 2, h * 0.54, h * 0.5, FONT, '#1e1e1e');
  },
  staff(ctx, w, h) {
    ctx.fillStyle = '#d8d2c4'; ctx.fillRect(0, 0, w, h);
    centred(ctx, WORDS.westDoor, w / 2, h * 0.55, h * 0.45, FONT, '#2a2a2a');
  },
  dial(ctx, w, h) {
    ctx.fillStyle = '#e6e0d0'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#222';
    for (let r = 0; r < 3; r++) {
      ctx.fillRect(w * 0.12, h * (0.12 + r * 0.29), w * 0.76, h * 0.18);
      ctx.fillStyle = '#ddd';
      ctx.font = `${h * 0.12}px monospace`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(['0 8 4 1', '0 0 0 0', '1 . 2 9'][r], w / 2, h * (0.21 + r * 0.29));
      ctx.fillStyle = '#222';
    }
  },
};

// A thin board carrying a sign, weathered. size: [w, h] metres.
export function signBoard(name, [w, h], { px = 256, depth = 0.03, ...look } = {}) {
  const tex = canvasTexture(Math.round(px * (w / h)), px, DRAW[name]);
  const front = weathered({ colour: '#ffffff', scale: 0.6, vary: 0.12, streaks: 0.35, dirt: 0.2, rough: 0.6, wet: 0.2,
    map: texture(tex, uv()), ...look });
  EDGE ??= weathered({ colour: '#3a3530', rust: 0.4, rough: 0.7 });
  // The board, and the lettering on a plane just in front of it.
  const group = new Group();
  const board = new Mesh(new BoxGeometry(w, h, depth), EDGE);
  board.castShadow = true;
  board.receiveShadow = true;
  const face = new Mesh(new PlaneGeometry(w, h), front);
  face.position.z = depth / 2 + 0.002;
  face.receiveShadow = true;
  group.add(board, face);
  return group;
}

// The lettered texture alone, for things that put it on their own faces.
export function signTexture(name, w, h) {
  return canvasTexture(w, h, DRAW[name]);
}
