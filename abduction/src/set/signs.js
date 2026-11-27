// Lettering and signs: drawn to a canvas (2D text and shapes), used as a
// texture on a thin board, and put through the same weathering as
// everything else (PLAN.md 5.8). The words themselves are in src/words.js.
import { CanvasTexture, SRGBColorSpace, Mesh, PlaneGeometry, BoxGeometry, Group } from 'three/webgpu';
import { texture, uv } from 'three/tsl';
import { weathered } from '../materials/weathered.js';
import { pbr } from '../materials/textures.js';
import { rand } from '../noise1.js';
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

// A board's rounded outline, as a path.
function rounded(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Screw heads in the four corners, inset by `inset` pixels.
function screws(ctx, w, h, inset, r) {
  for (const [x, y] of [[inset, inset], [w - inset, inset], [inset, h - inset], [w - inset, h - inset]]) {
    ctx.fillStyle = '#3a3630';
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#8a8478';
    ctx.beginPath(); ctx.arc(x - r * 0.25, y - r * 0.25, r * 0.45, 0, Math.PI * 2); ctx.fill();
  }
}

// Wear over a painted sign: chips where the paint has gone, grime gathered
// along the bottom, rust bleeding down from the top edge. Drawn the same
// every time (seeded).
function wear(ctx, w, h, seed, { chips = 60, grime = 0.35, bleed = 8 } = {}) {
  ctx.save();
  for (let i = 0; i < chips; i++) {
    const x = rand(seed + i, 1) * w;
    const y = rand(seed + i, 2) * h;
    const r = (0.002 + rand(seed + i, 3) ** 4 * 0.025) * Math.max(w, h);
    ctx.globalAlpha = 0.25 + rand(seed + i, 4) * 0.45;
    ctx.fillStyle = rand(seed + i, 5) < 0.6 ? '#4a3a2a' : '#8a7a62';
    // A chip: a ragged polygon, not a dot.
    ctx.beginPath();
    const sides = 7;
    for (let k = 0; k < sides; k++) {
      const a = (k / sides) * Math.PI * 2;
      const rr = r * (0.35 + rand(seed + i * 13 + k, 8) * 0.9);
      ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr * (0.5 + rand(seed + i, 6)));
    }
    ctx.closePath();
    ctx.fill();
  }
  const g = ctx.createLinearGradient(0, h * 0.55, 0, h);
  g.addColorStop(0, 'rgba(40,32,22,0)');
  g.addColorStop(1, `rgba(40,32,22,${grime})`);
  ctx.globalAlpha = 1;
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < bleed; i++) {
    const x = rand(seed + i, 11) * w;
    const len = (0.15 + rand(seed + i, 12) * 0.5) * h;
    const s = ctx.createLinearGradient(0, 0, 0, len);
    s.addColorStop(0, 'rgba(90,45,20,0.5)');
    s.addColorStop(1, 'rgba(90,45,20,0)');
    ctx.fillStyle = s;
    ctx.fillRect(x, 0, (0.004 + rand(seed + i, 13) * 0.012) * w, len);
  }
  ctx.restore();
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
    ctx.fillStyle = '#e9e2d2'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#ab2118'; rounded(ctx, w * 0.06, h * 0.07, w * 0.88, h * 0.63, w * 0.05); ctx.fill();
    ctx.strokeStyle = '#efe7d8'; ctx.lineWidth = w * 0.015; rounded(ctx, w * 0.1, h * 0.1, w * 0.8, h * 0.57, w * 0.04); ctx.stroke();
    centred(ctx, WORDS.brand, w / 2, h * 0.39, Math.min(h * 0.2, w * 0.21), FONT, '#f4efe4');
    centred(ctx, WORDS.brandSub, w / 2, h * 0.84, h * 0.11, FONT, '#7a1712');
    wear(ctx, w, h, 100);
  },
  oil(ctx, w, h) {
    ctx.fillStyle = '#e6dcc2'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#8a1a12'; ctx.lineWidth = w * 0.035; ctx.strokeRect(w * 0.04, h * 0.03, w * 0.92, h * 0.94);
    ctx.lineWidth = w * 0.01; ctx.strokeRect(w * 0.08, h * 0.055, w * 0.84, h * 0.89);
    centred(ctx, WORDS.oil[0], w / 2, h * 0.11, h * 0.07, FONT, '#8a1a12');
    centred(ctx, WORDS.oil[1], w / 2, h * 0.2, h * 0.08, FONT, '#8a1a12');
    // The can: a red tin with a cream band, its lid and spout.
    ctx.fillStyle = '#9a8a70'; ctx.fillRect(w * 0.3, h * 0.29, w * 0.4, h * 0.025);
    ctx.fillStyle = '#b4231c'; rounded(ctx, w * 0.28, h * 0.31, w * 0.44, h * 0.37, w * 0.02); ctx.fill();
    ctx.fillStyle = '#efe9dc'; ctx.fillRect(w * 0.28, h * 0.43, w * 0.44, h * 0.12);
    ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(w * 0.31, h * 0.32, w * 0.05, h * 0.35);
    centred(ctx, WORDS.brand, w / 2, h * 0.49, h * 0.07, FONT, '#b4231c');
    centred(ctx, WORDS.oil[2], w / 2, h * 0.79, h * 0.06, FONT, '#8a1a12');
    centred(ctx, WORDS.oil[3], w / 2, h * 0.87, h * 0.06, FONT, '#8a1a12');
    wear(ctx, w, h, 200, { chips: 40, grime: 0.45 });
  },
  tires(ctx, w, h) {
    // A cream enamel plate, rounded, a dark border, screws in the corners.
    ctx.fillStyle = '#2a2a28'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#dcd6c6'; rounded(ctx, h * 0.03, h * 0.03, w - h * 0.06, h * 0.94, h * 0.09); ctx.fill();
    ctx.strokeStyle = '#26282a'; ctx.lineWidth = h * 0.035; rounded(ctx, h * 0.09, h * 0.09, w - h * 0.18, h * 0.82, h * 0.06); ctx.stroke();
    screws(ctx, w, h, h * 0.09, h * 0.028);
    centred(ctx, WORDS.tires[0], w / 2, h * 0.41, h * 0.38, FONT, '#16202a');
    ctx.fillStyle = '#16202a'; ctx.fillRect(w * 0.14, h * 0.62, w * 0.72, h * 0.018);
    centred(ctx, WORDS.tires[1], w / 2, h * 0.76, h * 0.17, FONT, '#16202a');
    wear(ctx, w, h, 300, { chips: 50, grime: 0.3, bleed: 4 });
  },
  ice(ctx, w, h) {
    ctx.fillStyle = '#e6e2d6'; ctx.fillRect(0, 0, w, h);
    ctx.font = `${h * 0.56}px ${FONT}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const letters = WORDS.ice.split('');
    letters.forEach((c, i) => {
      const x = w * (0.5 + (i - (letters.length - 1) / 2) * 0.27);
      ctx.lineWidth = h * 0.025; ctx.strokeStyle = '#5a1410'; ctx.strokeText(c, x, h * 0.55);
      ctx.fillStyle = '#b0261c'; ctx.fillText(c, x, h * 0.55);
    });
    wear(ctx, w, h, 400, { chips: 70, grime: 0.5, bleed: 14 });
  },
  fascia(ctx, w, h) {
    ctx.fillStyle = '#4a4a44'; ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 0.42;
    centred(ctx, WORDS.brand, w * 0.18, h * 0.52, h * 0.7, FONT, '#d9d2c0');
    ctx.globalAlpha = 1;
    wear(ctx, w, h, 500, { chips: 120, grime: 0.2, bleed: 30 });
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
    // White on a dark green board in a thin white frame.
    ctx.fillStyle = '#18261f'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#d8d4c8'; ctx.lineWidth = h * 0.05; ctx.strokeRect(h * 0.08, h * 0.08, w - h * 0.16, h * 0.84);
    centred(ctx, WORDS.door, w / 2, h * 0.54, h * 0.46, FONT, '#e6e2d6');
  },
  staff(ctx, w, h) {
    ctx.fillStyle = '#d8d2c4'; ctx.fillRect(0, 0, w, h);
    centred(ctx, WORDS.westDoor, w / 2, h * 0.55, h * 0.45, FONT, '#2a2a2a');
  },
  dial(ctx, w, h) {
    // The pump's face: a cream plate, the three number windows (sale, gallons,
    // price) at the top, two columns of small print under them.
    ctx.fillStyle = '#e4ddca'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#2a2a28'; ctx.lineWidth = w * 0.03; ctx.strokeRect(w * 0.04, h * 0.03, w * 0.92, h * 0.94);
    ctx.font = `${h * 0.075}px monospace`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let r = 0; r < 3; r++) {
      const y = h * (0.08 + r * 0.12);
      ctx.fillStyle = '#1c1d1c'; ctx.fillRect(w * 0.18, y, w * 0.64, h * 0.09);
      ctx.fillStyle = '#d8d2c0'; ctx.fillText(['0 8 4 1', '0 0 0 0', '1 . 2 9'][r], w / 2, y + h * 0.047);
    }
    ctx.fillStyle = '#7a1712'; ctx.fillRect(w * 0.1, h * 0.46, w * 0.8, h * 0.035);
    ctx.fillStyle = '#3a3830';
    for (let c = 0; c < 2; c++) {
      for (let r = 0; r < 9; r++) {
        const len = 0.22 + rand(r * 2 + c, 21) * 0.14;
        ctx.fillRect(w * (0.12 + c * 0.42), h * (0.54 + r * 0.045), w * len, h * 0.014);
      }
    }
    wear(ctx, w, h, 600, { chips: 25, grime: 0.3, bleed: 3 });
  },

};

// A thin board carrying a sign, weathered. size: [w, h] metres.
export function signBoard(name, [w, h], { px = 256, depth = 0.03, ...look } = {}) {
  const tex = canvasTexture(Math.round(px * (w / h)), px, DRAW[name]);
  const front = weathered({ colour: '#ffffff', scale: 0.6, vary: 0.12, streaks: 0.35, dirt: 0.2, rough: 0.6, wet: 0.2,
    map: texture(tex, uv()), photo: pbr('rusty_metal_02'), photoScale: 0.8, photoSat: 0.5, photoAmount: 0.6, ...look });
  EDGE ??= weathered({ colour: '#3a3530', rust: 0.4, rough: 0.7, photo: pbr('rust_coarse_01'), photoScale: 0.5 });
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
