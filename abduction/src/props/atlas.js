// A model's painted texture: two canvases with the same layout, one for
// colour and one for the surface (height in red, roughness in green,
// clearcoat in blue), divided into named regions. Each region is a
// rectangle of the model in metres (a side seen square on, the roof from
// above), so windows, seams, lettering and dirt are painted in metres and
// uv(name, a, b) says where a point of the geometry falls: the two agree by
// construction.
//
//   const at = createAtlas(2048, 2048, { side: { px: [0, 0, 2048, 640], a: [-2.7, 2.7], b: [2.3, 0] } });
//   at.paint('side', (c, s) => { c.fillRect(...metres...) });
//   at.pixels('side', 64, (a, b, px) => { px.c = [r, g, b, alpha]; px.s = [h, rough, coat, alpha]; });
//   at.uv('side', x, y) -> [u, v]
//
// a runs left to right across the region as it is seen, b top to bottom,
// so the -Z side's a is -x, and lettering reads right from either side.
import { CanvasTexture, SRGBColorSpace, NoColorSpace, LinearMipmapLinearFilter } from 'three/webgpu';

const GUTTER = 6;       // px: each region's paint runs this far past its edge, for mipmaps
const ANISOTROPY = 8;

export function createAtlas(width, height, regions) {
  const make = () => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  };
  const colour = make();
  const surface = make();
  const cc = colour.getContext('2d');
  const sc = surface.getContext('2d');

  const frame = (name) => {
    const r = regions[name];
    const [X, Y, W, H] = r.px;
    const sx = W / (r.a[1] - r.a[0]);
    const sy = H / (r.b[1] - r.b[0]);
    return { X, Y, W, H, sx, sy, ox: X - r.a[0] * sx, oy: Y - r.b[0] * sy, r };
  };

  const at = {
    width, height, colour, surface,
    uv(name, a, b) {
      const f = frame(name);
      return [(f.ox + a * f.sx) / width, 1 - (f.oy + b * f.sy) / height];
    },
    // Paint in metres on both canvases at once, clipped to the region (and its gutter).
    paint(name, draw) {
      const f = frame(name);
      for (const ctx of [cc, sc]) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(f.X - GUTTER, f.Y - GUTTER, f.W + 2 * GUTTER, f.H + 2 * GUTTER);
        ctx.clip();
        ctx.setTransform(f.sx, 0, 0, f.sy, f.ox, f.oy);
      }
      draw(cc, sc, f);
      cc.restore();
      sc.restore();
    },
    // Per pixel, at `ppm` pixels a metre (coarser than the canvas, then
    // drawn up smoothly): fn(a, b, px) sets px.c and px.s to [r, g, b, alpha]
    // (0..1) or leaves them null.
    // rect: [a0, a1, b0, b1] limits it to part of the region (same order as the region's own).
    pixels(name, ppm, fn, rect = null) {
      const f = frame(name);
      const ra = rect ? [rect[0], rect[1]] : f.r.a;
      const rb = rect ? [rect[2], rect[3]] : f.r.b;
      const w = Math.max(2, Math.round(Math.abs(ra[1] - ra[0]) * ppm));
      const h = Math.max(2, Math.round(Math.abs(rb[1] - rb[0]) * ppm));
      const tc = new OffscreenCanvas(w, h);
      const ts = new OffscreenCanvas(w, h);
      const ic = new ImageData(w, h);
      const is = new ImageData(w, h);
      const px = { c: null, s: null };
      for (let j = 0; j < h; j++) {
        const b = rb[0] + ((j + 0.5) / h) * (rb[1] - rb[0]);
        for (let i = 0; i < w; i++) {
          const a = ra[0] + ((i + 0.5) / w) * (ra[1] - ra[0]);
          px.c = null;
          px.s = null;
          fn(a, b, px);
          const k = (j * w + i) * 4;
          if (px.c) for (let q = 0; q < 4; q++) ic.data[k + q] = px.c[q] * 255;
          if (px.s) for (let q = 0; q < 4; q++) is.data[k + q] = px.s[q] * 255;
        }
      }
      tc.getContext('2d').putImageData(ic, 0, 0);
      ts.getContext('2d').putImageData(is, 0, 0);
      for (const [ctx, img] of [[cc, tc], [sc, ts]]) {
        ctx.save();
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        const x0 = f.ox + ra[0] * f.sx, x1 = f.ox + ra[1] * f.sx;
        const y0 = f.oy + rb[0] * f.sy, y1 = f.oy + rb[1] * f.sy;
        ctx.drawImage(img, x0, y0, x1 - x0, y1 - y0);
        ctx.restore();
      }
    },
    textures() {
      const t = (canvas, srgb) => {
        const tex = new CanvasTexture(canvas);
        tex.colorSpace = srgb ? SRGBColorSpace : NoColorSpace;
        tex.anisotropy = ANISOTROPY;
        tex.minFilter = LinearMipmapLinearFilter;
        return tex;
      };
      return { colour: t(colour, true), surface: t(surface, false) };
    },
  };
  return at;
}

// Lettering at (a, b) metres, `size` metres tall, upright and unmirrored on
// the canvas whatever the region's transform, keeping metre proportions.
export function letter(ctx, text, a, b, size, { font = 'Arial', weight = '900', align = 'left', skew = 0, colour = '#000', stretch = 1 } = {}) {
  const m = ctx.getTransform();
  const px = m.a * a + m.c * b + m.e;
  const py = m.b * a + m.d * b + m.f;
  const ky = Math.abs(m.d);
  const kx = Math.abs(m.a);
  ctx.save();
  ctx.setTransform((kx / ky) * stretch, 0, -skew, 1, px, py);
  ctx.font = `${weight} ${Math.max(1, size * ky)}px ${font}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = colour;
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

// Surface values as a CSS colour for the surface canvas: height (0..1, 0.5
// flat), roughness, clearcoat.
export const surf = (h, rough, coat, alpha = 1) =>
  `rgba(${Math.round(h * 255)},${Math.round(rough * 255)},${Math.round(coat * 255)},${alpha})`;

// Gradient noise in 2D, -1..1, and its sum over octaves. Deterministic.
const PERM = new Uint8Array(512);
{
  let s = 1234567;
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    s = (s * 1103515245 + 12345) >>> 0;
    const j = s % (i + 1);
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) PERM[i] = p[i & 255];
}
const GRAD = [[1, 1], [-1, 1], [1, -1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]];
const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);

export function noise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const X = xi & 255, Y = yi & 255;
  const g = (i, j, dx, dy) => { const v = GRAD[PERM[PERM[X + i] + Y + j] & 7]; return v[0] * dx + v[1] * dy; };
  const u = fade(xf), v = fade(yf);
  const a = g(0, 0, xf, yf) + u * (g(1, 0, xf - 1, yf) - g(0, 0, xf, yf));
  const b = g(0, 1, xf, yf - 1) + u * (g(1, 1, xf - 1, yf - 1) - g(0, 1, xf, yf - 1));
  return (a + v * (b - a)) * 1.4;
}

export function fbm(x, y, octaves = 4) {
  let sum = 0, amp = 0.5, f = 1;
  for (let o = 0; o < octaves; o++) { sum += amp * noise(x * f + o * 17.3, y * f - o * 9.1); f *= 2; amp *= 0.5; }
  return sum;
}

export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const smooth = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };
