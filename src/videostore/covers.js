// What a tape's cover looks like: a little painting in pixels, from the few
// choices the catalog made for it (catalog.js: a motif, a background, an
// ink, where the title goes, black and white or not). The same painting is
// drawn small for the boxes on the shelves, all of them into one atlas
// (store.js makes a texture of it), and large for the box in your hands
// (card.js), where the title is written over it in letters you can read.
//
// The motifs, by genre: a hero with a gun, an explosion, a city at night
// (action); eyes in the dark, a face (thrillers); a big grin, a line-up of
// fools (comedy); a moon over a dead tree, a hand out of the ground, a skull
// (horror); a ringed planet, a ship among the stars (sci-fi); a face, a
// landscape (drama); two people against a sunset (romance); a portrait in an
// oval (classics); mesas at sundown (westerns); shapes like a gallery poster
// (foreign); big lurid words (cult); a friendly animal, a castle under a
// rainbow (family).
//
// No three.js and no DOM in here: pixels into an array, so the tests can
// look at them.
//
//   paintCover(film, img, x0, y0, w, h, { letters })
//     img        { data (RGBA bytes), width }: where to paint
//     letters    write the title in the band, in the 3 × 5 font (on the
//                shelves); the card writes its own
//   COVER        { w, h }: a cover's size on the shelves, in pixels
//   Atlas        all of them in one image, for the shelves (below)

import { mulberry32 } from '../noise.js';
import { layout } from './font.js';

export const COVER = { w: 24, h: 36 };

const SKIN = [0xf0c8a8, 0xd8a888, 0xb07850, 0x8a5838, 0x5a3820];
const HAIR = [0x1a1210, 0x3a2418, 0x6a4020, 0xb88a48, 0x9a2a10];

const rgb = (hex) => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const shade = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
const BLACK = [16, 14, 14];
const WHITE = [240, 236, 226];

// A painter for one cover: shapes in the picture's own 0..1 square (u
// across, v down), clipped to it.
class Pen {
  constructor(img, x0, y0, w, h) {
    Object.assign(this, { img, x0, y0, w, h });
  }

  dot(px, py, c) {
    if (px < 0 || py < 0 || px >= this.w || py >= this.h) return;
    const o = ((this.y0 + py) * this.img.width + this.x0 + px) * 4;
    const d = this.img.data;
    d[o] = c[0];
    d[o + 1] = c[1];
    d[o + 2] = c[2];
    d[o + 3] = 255;
  }

  // every pixel whose middle is in [u0, u1] × [v0, v1]
  span(u0, v0, u1, v1, fn) {
    const px0 = Math.max(0, Math.floor(u0 * this.w));
    const px1 = Math.min(this.w - 1, Math.ceil(u1 * this.w));
    const py0 = Math.max(0, Math.floor(v0 * this.h));
    const py1 = Math.min(this.h - 1, Math.ceil(v1 * this.h));
    for (let py = py0; py <= py1; py++) {
      const v = (py + 0.5) / this.h;
      for (let px = px0; px <= px1; px++) {
        const u = (px + 0.5) / this.w;
        const c = fn(u, v);
        if (c) this.dot(px, py, c);
      }
    }
  }

  rect(u0, v0, u1, v1, c) {
    this.span(u0, v0, u1, v1, (u, v) => (u >= u0 && u <= u1 && v >= v0 && v <= v1 ? c : null));
  }

  // top to bottom, from one colour to the other
  fade(u0, v0, u1, v1, a, b) {
    this.span(u0, v0, u1, v1, (u, v) => (u >= u0 && u <= u1 && v >= v0 && v <= v1 ? mix(a, b, (v - v0) / Math.max(1e-6, v1 - v0)) : null));
  }

  // an ellipse, ru across and rv down (in the picture's units; the picture
  // is taller than it is wide, so a circle has rv = ru * w / h)
  disc(cu, cv, ru, rv, c) {
    this.span(cu - ru, cv - rv, cu + ru, cv + rv, (u, v) => (((u - cu) / ru) ** 2 + ((v - cv) / rv) ** 2 <= 1 ? c : null));
  }

  circle(cu, cv, r, c) {
    this.disc(cu, cv, r, (r * this.w) / this.h, c);
  }

  tri(a, b, d, c) {
    const u0 = Math.min(a[0], b[0], d[0]);
    const u1 = Math.max(a[0], b[0], d[0]);
    const v0 = Math.min(a[1], b[1], d[1]);
    const v1 = Math.max(a[1], b[1], d[1]);
    const side = (p, q, u, v) => (q[0] - p[0]) * (v - p[1]) - (q[1] - p[1]) * (u - p[0]);
    this.span(u0, v0, u1, v1, (u, v) => {
      const s1 = side(a, b, u, v);
      const s2 = side(b, d, u, v);
      const s3 = side(d, a, u, v);
      return (s1 >= 0 && s2 >= 0 && s3 >= 0) || (s1 <= 0 && s2 <= 0 && s3 <= 0) ? c : null;
    });
  }

  // somebody, from the waist up or whole, its head at (cu, cv), s tall
  figure(cu, cv, s, c, { legs = true, arm = 0 } = {}) {
    const hr = s * 0.09;
    this.circle(cu, cv, hr * 1.2, c);
    this.rect(cu - s * 0.13, cv + s * 0.08, cu + s * 0.13, cv + s * 0.5, c);
    this.rect(cu - s * 0.035, cv + s * 0.04, cu + s * 0.035, cv + s * 0.1, c);
    if (legs) {
      this.rect(cu - s * 0.12, cv + s * 0.5, cu - s * 0.02, cv + s * 0.95, c);
      this.rect(cu + s * 0.02, cv + s * 0.5, cu + s * 0.12, cv + s * 0.95, c);
    }
    // an arm out to one side (a gun, a wave)
    if (arm) this.rect(Math.min(cu, cu + arm * s * 0.5), cv + s * 0.12, Math.max(cu, cu + arm * s * 0.5), cv + s * 0.18, c);
  }

  stars(n, rnd, c, v1 = 1) {
    for (let i = 0; i < n; i++) this.dot(Math.floor(rnd() * this.w), Math.floor(rnd() * this.h * v1), c);
  }
}

// ── The motifs ──────────────────────────────────────────────────────────────
// Each paints the picture (the whole cover; the title band goes on after)
// from k: { bg, ink, dark, light, rnd, skin, hair, band }, where band is
// which end the title is at ('top' or 'bottom'), so the picture's subject
// can keep out of its way.

const MOTIFS = {
  hero(p, k) {
    p.fade(0, 0, 1, 1, shade(k.bg, 0.5), k.bg);
    if (k.rnd() < 0.5) p.circle(0.5, 0.55, 0.45, mix(k.ink, k.bg, 0.4));
    const v = k.band === 'top' ? 0.42 : 0.2;
    p.figure(0.5 + (k.rnd() - 0.5) * 0.2, v, 0.62, BLACK, { arm: k.rnd() < 0.5 ? 1 : -1 });
    p.rect(0, 0.9, 1, 1, shade(k.bg, 0.3));
  },
  explosion(p, k) {
    p.fade(0, 0, 1, 1, [40, 20, 16], shade(k.bg, 0.8));
    const cv = k.band === 'top' ? 0.6 : 0.42;
    p.circle(0.5, cv, 0.62, [200, 60, 20]);
    p.circle(0.5, cv, 0.44, [240, 140, 30]);
    p.circle(0.5, cv, 0.26, [255, 230, 140]);
    for (let i = 0; i < 14; i++) p.dot(Math.floor(k.rnd() * p.w), Math.floor(k.rnd() * p.h), [40, 30, 24]);
    p.figure(0.3 + k.rnd() * 0.4, cv + 0.18, 0.28, BLACK);
  },
  city(p, k) {
    p.fade(0, 0, 1, 1, shade(k.bg, 0.3), mix(k.bg, k.ink, 0.35));
    p.circle(0.7, k.band === 'top' ? 0.42 : 0.18, 0.13, mix(WHITE, k.ink, 0.3));
    let u = 0;
    while (u < 1) {
      const w = 0.1 + k.rnd() * 0.14;
      const top = 0.45 + k.rnd() * 0.35;
      p.rect(u, top, u + w - 0.015, 1, BLACK);
      for (let y = top + 0.04; y < 0.97; y += 0.06) for (let x = u + 0.02; x < u + w - 0.03; x += 0.06) if (k.rnd() < 0.35) p.rect(x, y, x + 0.025, y + 0.02, [250, 210, 110]);
      u += w;
    }
  },
  eyes(p, k) {
    p.rect(0, 0, 1, 1, shade(k.bg, 0.6));
    const v = k.band === 'top' ? 0.55 : 0.36;
    p.rect(0, v - 0.08, 1, v + 0.08, mix(k.skin, k.bg, 0.5));
    for (const u of [0.3, 0.7]) {
      p.disc(u, v, 0.14, 0.035, WHITE);
      p.circle(u, v, 0.055, k.ink);
      p.circle(u, v, 0.025, BLACK);
    }
    if (k.rnd() < 0.5) p.rect(0.47, v + 0.2, 0.53, 0.9, k.ink);
  },
  face(p, k) {
    p.fade(0, 0, 1, 1, k.bg, shade(k.bg, 0.6));
    const cv = k.band === 'top' ? 0.6 : 0.42;
    p.disc(0.5, cv - 0.04, 0.36, 0.3, k.hair);
    p.disc(0.5, cv, 0.27, 0.24, k.skin);
    p.disc(0.6, cv + 0.02, 0.17, 0.2, shade(k.skin, 0.8));
    for (const u of [0.4, 0.6]) p.rect(u - 0.05, cv - 0.04, u + 0.05, cv - 0.01, BLACK);
    p.rect(0.43, cv + 0.11, 0.57, cv + 0.13, shade(k.skin, 0.55));
    p.rect(0.3, cv + 0.25, 0.7, 1, shade(k.ink, 0.6));
  },
  grin(p, k) {
    p.rect(0, 0, 1, 1, k.bg);
    const cv = k.band === 'top' ? 0.6 : 0.42;
    p.circle(0.5, cv, 0.38, k.skin);
    p.disc(0.5, cv - 0.22, 0.4, 0.08, k.hair);
    for (const u of [0.36, 0.64]) {
      p.circle(u, cv - 0.05, 0.08, WHITE);
      p.circle(u + 0.02, cv - 0.04, 0.035, BLACK);
    }
    p.disc(0.5, cv + 0.1, 0.22, 0.07, [120, 20, 30]);
    p.rect(0.32, cv + 0.06, 0.68, cv + 0.09, WHITE);
    if (k.rnd() < 0.6) p.circle(0.15 + k.rnd() * 0.7, cv + 0.32, 0.08, k.ink);
  },
  group(p, k) {
    p.rect(0, 0, 1, 1, k.bg);
    const n = 3 + Math.floor(k.rnd() * 2);
    const v = k.band === 'top' ? 0.42 : 0.22;
    for (let i = 0; i < n; i++) {
      const u = (i + 0.5) / n;
      const c = [k.ink, shade(k.ink, 0.6), mix(k.ink, WHITE, 0.4), [60, 90, 200], [230, 120, 40]][i % 5];
      p.figure(u, v + (i % 2) * 0.05, 0.6, c, { legs: true });
      p.circle(u, v + (i % 2) * 0.05, 0.065, rgb(SKIN[Math.floor(k.rnd() * SKIN.length)]));
    }
  },
  moon(p, k) {
    p.fade(0, 0, 1, 1, shade(k.bg, 0.4), mix(k.bg, k.ink, 0.25));
    p.circle(0.66, k.band === 'top' ? 0.42 : 0.22, 0.22, [232, 228, 196]);
    p.rect(0, 0.82, 1, 1, BLACK);
    p.rect(0.12, 0.45, 0.17, 0.85, BLACK);
    p.tri([0.14, 0.5], [0.0, 0.35], [0.16, 0.55], BLACK);
    p.tri([0.15, 0.6], [0.36, 0.42], [0.15, 0.66], BLACK);
    p.rect(0.5, 0.66, 0.9, 0.84, BLACK);
    p.tri([0.46, 0.67], [0.7, 0.55], [0.94, 0.67], BLACK);
    p.rect(0.66, 0.72, 0.72, 0.77, [240, 200, 90]);
  },
  hand(p, k) {
    p.fade(0, 0, 1, 1, BLACK, shade(k.bg, 1.2));
    const c = k.rnd() < 0.5 ? [120, 150, 90] : mix(k.skin, [90, 110, 90], 0.5);
    const base = k.band === 'top' ? 1 : 0.86;
    p.rect(0.36, base - 0.42, 0.64, base, c);
    for (let i = 0; i < 4; i++) {
      const u = 0.38 + i * 0.075;
      p.rect(u, base - 0.62 + Math.abs(i - 1.5) * 0.05, u + 0.05, base - 0.4, c);
    }
    p.rect(0.62, base - 0.42, 0.72, base - 0.3, c);
    p.rect(0, base - 0.06, 1, base, shade(k.bg, 0.4));
  },
  skull(p, k) {
    p.rect(0, 0, 1, 1, shade(k.bg, 0.8));
    const cv = k.band === 'top' ? 0.6 : 0.42;
    p.circle(0.5, cv, 0.3, WHITE);
    p.rect(0.36, cv + 0.08, 0.64, cv + 0.24, WHITE);
    for (const u of [0.39, 0.61]) p.circle(u, cv, 0.08, BLACK);
    p.tri([0.47, cv + 0.1], [0.53, cv + 0.1], [0.5, cv + 0.05], BLACK);
    for (let i = 0; i < 4; i++) p.rect(0.4 + i * 0.06, cv + 0.18, 0.42 + i * 0.06, cv + 0.24, BLACK);
    p.rect(0, 0, 1, 0.04, k.ink);
  },
  planet(p, k) {
    p.rect(0, 0, 1, 1, shade(k.bg, 0.6));
    p.stars(40, k.rnd, WHITE);
    const cv = k.band === 'top' ? 0.6 : 0.42;
    p.circle(0.5, cv, 0.34, mix(k.ink, k.bg, 0.4));
    p.disc(0.42, cv - 0.04, 0.22, 0.12, mix(k.ink, WHITE, 0.3));
    p.disc(0.5, cv, 0.62, 0.04, mix(k.ink, WHITE, 0.6));
    p.circle(0.18, cv - 0.3, 0.07, [180, 180, 190]);
  },
  ship(p, k) {
    p.rect(0, 0, 1, 1, shade(k.bg, 0.5));
    p.stars(45, k.rnd, WHITE);
    const cv = k.band === 'top' ? 0.6 : 0.4;
    p.tri([0.1, cv + 0.1], [0.92, cv - 0.06], [0.1, cv - 0.12], [190, 196, 210]);
    p.rect(0.08, cv - 0.08, 0.2, cv + 0.06, [120, 126, 140]);
    p.circle(0.06, cv - 0.01, 0.06, k.ink);
    p.circle(0.86, cv + 0.32, 0.18, mix(k.ink, k.bg, 0.5));
  },
  landscape(p, k) {
    p.fade(0, 0, 1, 0.6, mix(k.bg, WHITE, 0.3), mix(k.bg, k.ink, 0.25));
    p.circle(0.3, 0.35, 0.12, mix([250, 220, 160], k.bg, 0.3));
    p.fade(0, 0.55, 1, 1, [90, 110, 70], [50, 60, 40]);
    p.disc(0.25, 0.62, 0.5, 0.1, [70, 90, 60]);
    p.figure(0.66, 0.6, 0.18, BLACK);
  },
  couple(p, k) {
    p.fade(0, 0, 1, 1, mix(k.bg, [250, 200, 120], 0.4), shade(k.bg, 0.6));
    p.circle(0.5, 0.62, 0.3, mix([250, 160, 90], k.bg, 0.3));
    const v = k.band === 'top' ? 0.48 : 0.3;
    p.figure(0.38, v, 0.62, shade(k.ink, 0.3), { legs: true });
    p.figure(0.6, v + 0.04, 0.58, shade(k.ink, 0.45), { legs: true });
  },
  portrait(p, k) {
    p.rect(0, 0, 1, 1, k.bg);
    const cv = k.band === 'top' ? 0.6 : 0.44;
    p.disc(0.5, cv, 0.38, 0.34, mix(k.ink, k.bg, 0.5));
    p.disc(0.5, cv, 0.32, 0.29, shade(k.bg, 0.6));
    p.disc(0.5, cv - 0.06, 0.15, 0.12, k.skin);
    p.disc(0.5, cv - 0.12, 0.17, 0.07, k.hair);
    p.rect(0.32, cv + 0.08, 0.68, cv + 0.28, shade(k.ink, 0.4));
  },
  desert(p, k) {
    p.fade(0, 0, 1, 0.7, [250, 200, 90], k.bg);
    p.circle(0.5, 0.62, 0.22, [255, 230, 150]);
    p.rect(0, 0.66, 1, 1, shade(k.bg, 0.45));
    p.rect(0.05, 0.5, 0.35, 0.7, shade(k.bg, 0.3));
    p.rect(0.68, 0.55, 1, 0.7, shade(k.bg, 0.3));
    p.rect(0.8, 0.62, 0.84, 0.84, [40, 70, 40]);
    p.rect(0.76, 0.68, 0.8, 0.71, [40, 70, 40]);
    p.figure(0.42, 0.66, 0.2, BLACK);
  },
  art(p, k) {
    p.rect(0, 0, 1, 1, k.bg);
    const cols = [k.ink, [200, 50, 40], [40, 80, 150], [230, 190, 50], BLACK];
    for (let i = 0; i < 4; i++) {
      const c = cols[Math.floor(k.rnd() * cols.length)];
      const u = k.rnd();
      const v = 0.15 + k.rnd() * 0.7;
      if (k.rnd() < 0.5) p.circle(u, v, 0.1 + k.rnd() * 0.25, c);
      else p.rect(u - 0.2, v - 0.1, u + 0.1 + k.rnd() * 0.3, v + 0.1 + k.rnd() * 0.2, c);
    }
  },
  title(p, k) {
    p.fade(0, 0, 1, 1, k.bg, shade(k.bg, 0.5));
    for (let i = 0; i < 6; i++) p.tri([0.5, 0.5], [k.rnd(), 0], [k.rnd(), 0], mix(k.bg, WHITE, 0.25));
    const v = k.band === 'top' ? 0.5 : 0.3;
    p.figure(0.5, v, 0.5, [60, 150, 60], { arm: 1 });
    p.circle(0.45, v - 0.01, 0.02, [255, 40, 40]);
    p.circle(0.55, v - 0.01, 0.02, [255, 40, 40]);
  },
  animal(p, k) {
    p.fade(0, 0, 1, 0.75, mix(k.bg, WHITE, 0.4), k.bg);
    p.rect(0, 0.75, 1, 1, [90, 170, 70]);
    const fur = [[150, 100, 60], [220, 200, 170], [90, 60, 40], [240, 240, 240], [200, 140, 60]][Math.floor(k.rnd() * 5)];
    const cv = k.band === 'top' ? 0.62 : 0.46;
    p.disc(0.5, cv + 0.18, 0.3, 0.16, fur);
    p.circle(0.5, cv - 0.04, 0.24, fur);
    for (const u of [0.32, 0.68]) p.circle(u, cv - 0.18, 0.08, shade(fur, 0.7));
    for (const u of [0.42, 0.58]) p.circle(u, cv - 0.06, 0.04, BLACK);
    p.circle(0.5, cv + 0.02, 0.05, BLACK);
  },
  castle(p, k) {
    p.fade(0, 0, 1, 1, mix(k.bg, [40, 40, 120], 0.4), mix(k.bg, WHITE, 0.3));
    p.stars(12, k.rnd, WHITE, 0.4);
    const bow = [[230, 60, 60], [240, 160, 40], [240, 230, 60], [80, 190, 80], [70, 120, 220]];
    bow.forEach((c, i) => p.disc(0.5, 0.75, 0.75 - i * 0.07, 0.45 - i * 0.045, c));
    p.disc(0.5, 0.75, 0.4, 0.23, mix(k.bg, WHITE, 0.3));
    p.rect(0.3, 0.55, 0.7, 0.9, [220, 220, 235]);
    for (const u of [0.26, 0.5, 0.74]) {
      p.rect(u - 0.06, 0.42 + (u === 0.5 ? -0.08 : 0), u + 0.06, 0.9, [235, 235, 245]);
      p.tri([u - 0.08, 0.43 + (u === 0.5 ? -0.08 : 0)], [u + 0.08, 0.43 + (u === 0.5 ? -0.08 : 0)], [u, 0.3 + (u === 0.5 ? -0.08 : 0)], [200, 60, 120]);
    }
    p.rect(0, 0.88, 1, 1, [90, 170, 70]);
  },
};

const grey = (c) => {
  const l = c[0] * 0.3 + c[1] * 0.55 + c[2] * 0.15;
  return [l, l, l * 0.96];
};

export function paintCover(film, img, x0, y0, w, h, { letters = true } = {}) {
  const C = film.cover;
  const rnd = mulberry32(C.seed >>> 0);
  const p = new Pen(img, x0, y0, w, h);
  const band = C.layout % 2 === 0 ? 'top' : 'bottom';
  const k = {
    bg: rgb(C.bg),
    ink: rgb(C.ink),
    rnd,
    skin: rgb(SKIN[Math.floor(rnd() * SKIN.length)]),
    hair: rgb(HAIR[Math.floor(rnd() * HAIR.length)]),
    band,
  };
  (MOTIFS[C.motif] || MOTIFS.face)(p, k);
  // the title: a band across one end, in ink, with the title on it
  const T = titleBand(film);
  const bh = Math.max(7, Math.round(h * T.h));
  const by = T.at === 'top' ? 0 : h - bh - Math.round(h * T.foot);
  for (let y = by; y < by + bh; y++) for (let x = 0; x < w; x++) p.dot(x, y, T.band);
  if (letters) writeTitle(p, film.title, by, bh, T.text);
  // DVD cases have a blue band along the foot.
  const sy = h - Math.max(1, Math.round(h * 0.04));
  const trim = film.format === 'DVD' ? [80, 165, 224] : BLACK;
  for (let y = sy; y < h; y++) for (let x = 0; x < w; x++) p.dot(x, y, trim);
  // black and white, for the old ones
  if (C.bw) {
    const d = img.data;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const o = ((y0 + y) * img.width + x0 + x) * 4;
        const g = grey([d[o], d[o + 1], d[o + 2]]);
        d[o] = g[0];
        d[o + 1] = g[1];
        d[o + 2] = g[2];
      }
    }
  }
}

// Where a cover's title goes and in what colours: { at: 'top' | 'bottom',
// h, foot (its height, and how far it is from the foot, as shares of the
// cover's), band, text: [r, g, b] }. The card writes the title over the
// band in letters you can read.
export function titleBand(film) {
  const C = film.cover;
  const bg = rgb(C.bg);
  const ink = rgb(C.ink);
  const band = C.layout >= 2 ? shade(bg, 0.35) : mix(ink, BLACK, 0.15);
  let text = C.layout >= 2 ? ink : contrast(ink);
  if (Math.abs(luma(text) - luma(band)) < 80) text = contrast(band);
  if (C.bw) return { at: C.layout % 2 === 0 ? 'top' : 'bottom', h: 0.24, foot: 0.05, band: grey(band), text: grey(text) };
  return { at: C.layout % 2 === 0 ? 'top' : 'bottom', h: 0.24, foot: 0.05, band, text };
}

const luma = (c) => c[0] * 0.3 + c[1] * 0.55 + c[2] * 0.15;
const contrast = (c) => (luma(c) > 140 ? BLACK : WHITE);

// As much of the title as fits, a line or two of the little font, middled.
function writeTitle(p, title, by, bh, color) {
  const words = title
    .replace(/^(The|A|An) /, '')
    .toUpperCase()
    .split(/\s+/);
  const most = Math.floor((p.w + 1) / 4);
  const lines = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length <= most) line = next;
    else {
      if (line) lines.push(line);
      line = word.slice(0, most);
    }
    if (lines.length >= 2) break;
  }
  if (line && lines.length < 2) lines.push(line);
  const fit = Math.max(1, Math.min(lines.length, Math.floor((bh + 1) / 6)));
  const top = by + Math.floor((bh - (fit * 6 - 1)) / 2);
  lines.slice(0, fit).forEach((text, i) => {
    const L = layout(text, true);
    const left = Math.floor((p.w - L.width) / 2);
    for (const [x, y] of L.dots) p.dot(left + x, top + i * 6 + y, color);
  });
}

// Every film's cover, small, in one image: film id → a cell, ATLAS_COLS to a
// row, the first film's at the top left. Painted a slice at a time
// (paint(films, from, to)), so standing the shop up needn't stall a frame.
// rect(id) -> { u0, v0, u1, v1 }, v0 at the cover's top: the image's rows
// run top first, and a texture made of it reads them that way unflipped.
export const ATLAS_COLS = 64;
export class Atlas {
  constructor(count) {
    const rows = Math.max(1, Math.ceil(count / ATLAS_COLS));
    this.width = ATLAS_COLS * COVER.w;
    this.height = rows * COVER.h;
    this.data = new Uint8Array(this.width * this.height * 4);
    this.cells = new Map();
  }

  paint(films, from = 0, to = films.length) {
    const img = { width: this.width, data: this.data };
    for (let i = from; i < Math.min(to, films.length); i++) {
      const f = films[i];
      this.cells.set(f.id, i);
      paintCover(f, img, (i % ATLAS_COLS) * COVER.w, Math.floor(i / ATLAS_COLS) * COVER.h, COVER.w, COVER.h);
    }
  }

  rect(id, out = {}) {
    const i = this.cells.get(id);
    const x = (i % ATLAS_COLS) * COVER.w;
    const y = Math.floor(i / ATLAS_COLS) * COVER.h;
    out.u0 = x / this.width;
    out.u1 = (x + COVER.w) / this.width;
    out.v0 = y / this.height;
    out.v1 = (y + COVER.h) / this.height;
    return out;
  }
}
