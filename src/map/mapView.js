// The map overlay (M): a top-down pixel map of the world you can pan and
// zoom, with your position, the structures, the places other features put on
// it (places.js: an old cabin, a dock), and marks you leave on it.
//
//  click / tap         add a mark there (or select one, or a place)
//  drag                pan · drag a pin to move it
//  scroll / pinch      zoom
//  + −  arrows  C      zoom, pan, back to where you are
//  M / Esc             close
//
// Other features can draw on it too, over the land and under you and the
// marks: map.addLayer((pen) => ...), where pen is
//   ctx              the canvas (device pixels)
//   toScreen(x, z)   -> { sx, sy } where a spot in the world is on it
//   scale            device pixels per metre
//   dpr, unit        device pixels per CSS pixel; per map pixel at this zoom
//   t                seconds the map has been open, for things that pulse
//   W, H             the canvas size
//   label(text, x, y, colour, align)   a word with a dark outline

import './map.css';
import { TILE, MIN_LEVEL, MAX_LEVEL } from './mapRender.js';
import { MapTiles, tileKey } from './tiles.js';
import { ICONS, COLORS, PIN, iconById, iconSvg, glyphSvg, markLabel } from './marks.js';
import { Places } from './places.js';
import { formatDistance } from '../core/format.js';

// Each level halves the meters per map pixel; within a level a map pixel is
// drawn 3, 4 or 5 device pixels wide (times the DPR unit) so pixels stay
// crisp at every zoom stop.
const STOPS = [];
for (let level = MAX_LEVEL; level >= MIN_LEVEL; level--) for (const r of [3, 4, 5]) STOPS.push({ level, r });
const DEFAULT_STOP = STOPS.findIndex((s) => s.level === 1 && s.r === 4);
const INK = '#15140f';
const SCALE_STEPS = [5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000];
// A place's badge: 11×11 pixels, its glyph at (2, 2). Paler once you've been.
const BADGE = 11;
const BADGE_FILL = { fresh: '#e9dfc0', visited: '#a99a76' };
const SHAPE_FILL = 'rgba(74, 56, 36, 0.92)';
const GROUND_FILL = 'rgba(176, 150, 108, 0.85)'; // a place's open ground: a town's street
const SHAPES_FROM = 2.6; // device px per metre (per DPR) from which a place's shape is drawn
const NEARBY = { r: 1500, n: 8 }; // places listed beside the map: within r m, at most n

const TEMPLATE = /* html */ `
  <div class="map-frame" role="dialog" aria-label="Map" aria-modal="true" tabindex="-1">
    <div class="map-top">
      <h2>MAP</h2>
      <div id="map-cursor" aria-live="off"></div>
      <div class="map-tools">
        <button type="button" data-act="zoom-in" aria-label="Zoom in">+</button>
        <button type="button" data-act="zoom-out" aria-label="Zoom out">−</button>
        <button type="button" data-act="center" title="Back to where you are (C)">me</button>
        <button type="button" data-act="side" class="map-marks-toggle" aria-pressed="false">marks</button>
        <button type="button" data-act="close" aria-label="Close map (M)">✕</button>
      </div>
    </div>
    <div class="map-view">
      <canvas id="map-canvas" aria-label="Map of the forest. Click to add a mark."></canvas>
      <div id="mark-editor" hidden>
        <input id="mark-name" type="text" maxlength="48" placeholder="name this place" autocomplete="off" spellcheck="false" />
        <div class="row" id="mark-icons" role="group" aria-label="Icon"></div>
        <div class="row" id="mark-colors" role="group" aria-label="Colour"></div>
        <textarea id="mark-note" rows="2" maxlength="400" placeholder="a note (optional)"></textarea>
        <div class="where" id="mark-where"></div>
        <div class="actions">
          <button type="button" data-act="track" aria-pressed="false">track</button>
          <button type="button" data-act="delete">delete</button>
          <button type="button" data-act="done" class="done">done</button>
        </div>
      </div>
      <div id="place-card" hidden>
        <div class="kind" id="place-kind"></div>
        <div class="name" id="place-name"></div>
        <p class="note" id="place-note"></p>
        <div class="where" id="place-where"></div>
        <div class="actions">
          <button type="button" data-act="place-track" aria-pressed="false">track</button>
          <button type="button" data-act="place-done" class="done">done</button>
        </div>
      </div>
    </div>
    <aside id="map-side" aria-label="Marks and places">
      <div class="side-head"><h3>MARKS</h3><button type="button" data-act="mark-here">+ mark where I am</button></div>
      <ul id="mark-list"></ul>
      <div class="side-head"><h3>NEARBY</h3></div>
      <ul id="place-list"></ul>
    </aside>
    <div class="map-foot"><b>click</b> to mark · <b>drag</b> to pan · <b>scroll</b> to zoom · <b>C</b> find me · <b>M</b> close</div>
  </div>`;

export class MapView {
  constructor({ seed, land = 1, structures = [], hikes = [], ready, marks, player, input, places = new Places() }) {
    this.marks = marks;
    this.places = places;
    this.placeSel = null; // the place whose card is open
    this._placesShown = []; // [{ place, r }] drawn last frame, for hits and labels
    this._boxes = []; // labels placed this frame
    this.player = player;
    this.input = input;
    this.structures = structures;
    this.tiles = new MapTiles(seed, structures, land, hikes, ready);
    this.isOpen = false;

    this.stop = DEFAULT_STOP;
    this.scale = 0; // device px per meter (animated toward the stop's scale)
    this.cx = 0;
    this.cz = 0;
    this.anchor = null; // { wx, wz, sx, sy } kept fixed while zooming
    this.fly = null; // { x, z } eased toward
    this.selected = null; // mark id in the editor
    this.isNew = false;
    this.pointers = new Map();
    this.gesture = null;
    this.wheelAcc = 0;
    this.sprites = new Map();
    this.viewKey = '';
    this.t = 0;
    this.layers = [];
    const view = this;
    this.pen = {
      get ctx() {
        return view.ctx;
      },
      get scale() {
        return view.scale;
      },
      get dpr() {
        return view.dpr;
      },
      get unit() {
        return view.unit;
      },
      get t() {
        return view.t;
      },
      get W() {
        return view.W;
      },
      get H() {
        return view.H;
      },
      toScreen: (x, z) => view.toScreen(x, z),
      label: (text, x, y, color, align) => view._label(text, x, y, color, align),
    };

    const root = document.createElement('div');
    root.id = 'map';
    root.setAttribute('aria-hidden', 'true');
    root.innerHTML = TEMPLATE;
    document.body.appendChild(root);
    this.root = root;
    this.frame = root.querySelector('.map-frame');
    this.view = root.querySelector('.map-view');
    this.canvas = root.querySelector('#map-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.cursorEl = root.querySelector('#map-cursor');
    this.listEl = root.querySelector('#mark-list');
    this.placeListEl = root.querySelector('#place-list');
    this.card = root.querySelector('#place-card');
    this.editor = root.querySelector('#mark-editor');
    this.nameEl = root.querySelector('#mark-name');
    this.noteEl = root.querySelector('#mark-note');
    this.whereEl = root.querySelector('#mark-where');
    this.iconsEl = root.querySelector('#mark-icons');
    this.colorsEl = root.querySelector('#mark-colors');

    for (const ic of ICONS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.icon = ic.id;
      b.title = ic.label;
      b.setAttribute('aria-label', ic.label);
      b.innerHTML = iconSvg(ic.id);
      this.iconsEl.appendChild(b);
    }
    for (const c of COLORS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.color = c;
      b.setAttribute('aria-label', `colour ${c}`);
      b.innerHTML = `<span class="swatch" style="background:${c}"></span>`;
      this.colorsEl.appendChild(b);
    }

    root.addEventListener('click', (e) => this._onClick(e));
    root.addEventListener('pointerdown', (e) => {
      if (e.target === root) this.close(); // the dim backdrop
    });
    this.nameEl.addEventListener('input', () => this._edit({ name: this.nameEl.value }));
    this.noteEl.addEventListener('input', () => this._edit({ note: this.noteEl.value }));
    this.nameEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.closeEditor();
      }
    });
    addEventListener('keydown', (e) => this._onKey(e));

    const cv = this.canvas;
    cv.addEventListener('pointerdown', (e) => this._down(e));
    cv.addEventListener('pointermove', (e) => this._move(e));
    cv.addEventListener('pointerup', (e) => this._up(e));
    cv.addEventListener('pointercancel', (e) => this._up(e, true));
    cv.addEventListener('pointerleave', () => {
      if (!this.pointers.size) this.cursorEl.textContent = '';
    });
    cv.addEventListener('wheel', (e) => this._wheel(e), { passive: false });
    cv.addEventListener('contextmenu', (e) => e.preventDefault());

    new ResizeObserver(() => this._resize()).observe(this.view);
    marks.subscribe(() => {
      if (this.isOpen) this._renderList();
    });
  }

  // ── open / close ──────────────────────────────────────────────────────────
  open() {
    if (this.isOpen) return;
    this.isOpen = true;
    this.input.setBlocked(true);
    if (document.pointerLockElement) document.exitPointerLock?.();
    this.root.classList.add('open');
    this.root.setAttribute('aria-hidden', 'false');
    this.cx = this.player.pos.x;
    this.cz = this.player.pos.z;
    this.anchor = null;
    this.fly = null;
    this.viewKey = '';
    this._resize();
    this.scale = this._stopScale(this.stop);
    this._renderList();
    this.frame.focus({ preventScroll: true });
  }

  close() {
    if (!this.isOpen) return;
    this.closeEditor();
    this.closePlace();
    this.isOpen = false;
    this.pointers.clear();
    this.gesture = null;
    this._setSide(false);
    this.root.classList.remove('open');
    this.root.setAttribute('aria-hidden', 'true');
    this.input.setBlocked(false);
    if (document.activeElement && this.root.contains(document.activeElement)) document.activeElement.blur();
  }

  toggle() {
    if (this.isOpen) this.close();
    else this.open();
  }

  // Something more to draw on the map: draw(pen), every frame it is open.
  addLayer(draw) {
    this.layers.push(draw);
  }

  // ── view math ─────────────────────────────────────────────────────────────
  get unit() {
    return Math.max(1, Math.round(this.dpr));
  }

  _stopScale(i) {
    const s = STOPS[i];
    return (s.r * this.unit) / 2 ** s.level;
  }

  _resize() {
    this.dpr = window.devicePixelRatio || 1;
    const w = this.view.clientWidth;
    const h = this.view.clientHeight;
    this.W = Math.max(1, Math.round(w * this.dpr));
    this.H = Math.max(1, Math.round(h * this.dpr));
    if (this.canvas.width !== this.W || this.canvas.height !== this.H) {
      this.canvas.width = this.W;
      this.canvas.height = this.H;
    }
    this.sprites.clear();
    if (this.isOpen && !this.scale) this.scale = this._stopScale(this.stop);
  }

  _origin() {
    const target = this._stopScale(this.stop);
    const settled = Math.abs(this.scale - target) < 1e-6 && !this.fly;
    let ox = this.W / 2 - this.cx * this.scale;
    let oz = this.H / 2 - this.cz * this.scale;
    if (settled) {
      ox = Math.round(ox);
      oz = Math.round(oz);
    }
    return { ox, oz };
  }

  toScreen(x, z) {
    const { ox, oz } = this._origin();
    return { sx: ox + x * this.scale, sy: oz + z * this.scale };
  }

  toWorld(sx, sy) {
    const { ox, oz } = this._origin();
    return { x: (sx - ox) / this.scale, z: (sy - oz) / this.scale };
  }

  _evtXY(e) {
    const r = this.canvas.getBoundingClientRect();
    return { sx: (e.clientX - r.left) * this.dpr, sy: (e.clientY - r.top) * this.dpr };
  }

  zoomBy(steps, sx = this.W / 2, sy = this.H / 2) {
    const next = Math.max(0, Math.min(STOPS.length - 1, this.stop + steps));
    if (next === this.stop) return;
    const w = this.toWorld(sx, sy);
    this.anchor = { wx: w.x, wz: w.z, sx, sy };
    this.stop = next;
    this.fly = null;
  }

  centerOn(x, z) {
    this.anchor = null;
    this.fly = { x, z };
  }

  panBy(dsx, dsy) {
    this.cx -= dsx / this.scale;
    this.cz -= dsy / this.scale;
    if (this.anchor) {
      this.anchor.wx -= dsx / this.scale;
      this.anchor.wz -= dsy / this.scale;
    }
    this.fly = null;
  }

  // ── per frame ─────────────────────────────────────────────────────────────
  update(dt) {
    if (!this.isOpen) return;
    this.t += dt;
    const target = this._stopScale(this.stop);
    if (this.scale !== target) {
      const k = 1 - Math.exp(-dt * 18);
      this.scale *= Math.pow(target / this.scale, k);
      if (Math.abs(Math.log(this.scale / target)) < 0.004) this.scale = target;
      if (this.anchor) {
        this.cx = this.anchor.wx - (this.anchor.sx - this.W / 2) / this.scale;
        this.cz = this.anchor.wz - (this.anchor.sy - this.H / 2) / this.scale;
      }
      if (this.scale === target) this.anchor = null;
    }
    if (this.fly) {
      const k = 1 - Math.exp(-dt * 9);
      this.cx += (this.fly.x - this.cx) * k;
      this.cz += (this.fly.z - this.cz) * k;
      if (Math.hypot(this.fly.x - this.cx, this.fly.z - this.cz) * this.scale < 0.5) {
        this.cx = this.fly.x;
        this.cz = this.fly.z;
        this.fly = null;
      }
    }
    this._requestTiles();
    this._draw();
  }

  _requestTiles() {
    // tiles for where the zoom is heading, around the eventual view
    const scale = this._stopScale(this.stop);
    let cx = this.cx;
    let cz = this.cz;
    if (this.anchor) {
      cx = this.anchor.wx - (this.anchor.sx - this.W / 2) / scale;
      cz = this.anchor.wz - (this.anchor.sy - this.H / 2) / scale;
    }
    if (this.fly) {
      cx = this.fly.x;
      cz = this.fly.z;
    }
    const { key, list } = this._tileList(this.stop, cx, cz, this.W, this.H);
    if (key === this.viewKey && !this.tiles.wanted.length) return;
    this.viewKey = key;
    this.tiles.want(list);
  }

  // Tiles covering a W×H device-pixel view centred on (cx, cz), plus a margin.
  _tileList(stop, cx, cz, W, H) {
    const level = STOPS[stop].level;
    const T = TILE * 2 ** level;
    const scale = this._stopScale(stop);
    const hw = W / 2 / scale + T * 0.5;
    const hh = H / 2 / scale + T * 0.5;
    const tx0 = Math.floor((cx - hw) / T);
    const tx1 = Math.floor((cx + hw) / T);
    const tz0 = Math.floor((cz - hh) / T);
    const tz1 = Math.floor((cz + hh) / T);
    const list = [];
    for (let tz = tz0; tz <= tz1; tz++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const pri = Math.hypot((tx + 0.5) * T - cx, (tz + 0.5) * T - cz);
        list.push({ key: tileKey(level, tx, tz), level, tx, tz, pri });
      }
    }
    return { key: `${this.tiles.epoch}:${level}:${tx0}:${tx1}:${tz0}:${tz1}`, list };
  }

  // Renders the tiles around (x, z) in the background, so the map opens
  // already drawn. Only uses the map workers, which are idle otherwise.
  prefetch(x, z) {
    if (this.isOpen) return;
    this.dpr = window.devicePixelRatio || 1;
    this.tiles.want(this._tileList(this.stop, x, z, innerWidth * this.dpr, innerHeight * this.dpr).list, false);
  }

  // ── drawing ───────────────────────────────────────────────────────────────
  _draw() {
    const ctx = this.ctx;
    const { W, H } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#1b2215';
    ctx.fillRect(0, 0, W, H);

    const level = STOPS[this.stop].level;
    const mpp = 2 ** level;
    const T = TILE * mpp;
    const { ox, oz } = this._origin();
    const s = this.scale;
    const tx0 = Math.floor(-ox / s / T);
    const tx1 = Math.floor((W - ox) / s / T);
    const tz0 = Math.floor(-oz / s / T);
    const tz1 = Math.floor((H - oz) / s / T);
    for (let tz = tz0; tz <= tz1; tz++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const dx0 = Math.round(ox + tx * T * s);
        const dx1 = Math.round(ox + (tx + 1) * T * s);
        const dy0 = Math.round(oz + tz * T * s);
        const dy1 = Math.round(oz + (tz + 1) * T * s);
        const img = this.tiles.get(level, tx, tz);
        if (img) {
          ctx.drawImage(img, dx0, dy0, dx1 - dx0, dy1 - dy0);
          continue;
        }
        if (this._drawFromChildren(level, tx, tz, dx0, dy0, dx1, dy1)) continue;
        this._drawFromAncestor(level, tx, tz, dx0, dy0, dx1, dy1);
      }
    }

    this._boxes = [];
    this._drawStructures();
    for (const layer of this.layers) {
      this.ctx.save();
      layer(this.pen);
      this.ctx.restore();
    }
    this._drawPlaces();
    this._drawTrackLine();
    this._drawPlayer();
    this._drawMarks();
    this._drawPlaceLabels();
    this._drawScaleBar();
    this._placeEditor();
    this._placeCard();
  }

  // A coarser tile stretched over the gap while the right one renders.
  _drawFromAncestor(level, tx, tz, dx0, dy0, dx1, dy1) {
    for (let L = level + 1; L <= MAX_LEVEL; L++) {
      const f = 2 ** (L - level);
      const atx = Math.floor(tx / f);
      const atz = Math.floor(tz / f);
      const img = this.tiles.get(L, atx, atz);
      if (!img) continue;
      const sw = TILE / f;
      this.ctx.drawImage(img, (tx - atx * f) * sw, (tz - atz * f) * sw, sw, sw, dx0, dy0, dx1 - dx0, dy1 - dy0);
      return true;
    }
    return false;
  }

  // Finer tiles squeezed in, when zooming out over places already seen.
  _drawFromChildren(level, tx, tz, dx0, dy0, dx1, dy1) {
    if (level <= MIN_LEVEL) return false;
    const kids = [];
    for (let j = 0; j < 2; j++) {
      for (let i = 0; i < 2; i++) {
        const img = this.tiles.get(level - 1, tx * 2 + i, tz * 2 + j);
        if (!img) return false;
        kids.push(img);
      }
    }
    const mx = Math.round((dx0 + dx1) / 2);
    const my = Math.round((dy0 + dy1) / 2);
    this.ctx.drawImage(kids[0], dx0, dy0, mx - dx0, my - dy0);
    this.ctx.drawImage(kids[1], mx, dy0, dx1 - mx, my - dy0);
    this.ctx.drawImage(kids[2], dx0, my, mx - dx0, dy1 - my);
    this.ctx.drawImage(kids[3], mx, my, dx1 - mx, dy1 - my);
    return true;
  }

  _drawStructures() {
    if (!this.structures.length) return;
    const ctx = this.ctx;
    const d = this.dpr;
    ctx.font = `${10.5 * d}px ui-monospace, 'SF Mono', Menlo, Consolas, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (const st of this.structures) {
      const { sx, sy } = this.toScreen(st.x, st.z);
      const r = Math.max(4 * d, (st.radius ?? 8) * this.scale);
      if (sx < -r || sy < -r || sx > this.W + r || sy > this.H + r) continue;
      ctx.setLineDash([3 * d, 3 * d]);
      ctx.strokeStyle = 'rgba(238, 240, 226, 0.7)';
      ctx.lineWidth = 1.5 * d;
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      if (st.name) this._label(st.name, sx, sy + r + 3 * d, 'rgba(238, 240, 226, 0.85)');
    }
  }

  // A hike's land has arrived: draw with it, and ask again for the tiles
  // that were waiting for it.
  addHike(def) {
    this.tiles.addHike(def);
    this.viewKey = '';
  }

  // ── places ────────────────────────────────────────────────────────────────
  _badge(place, selected) {
    const key = `${place.glyph.join('')}|${place.visited ? 1 : 0}|${selected ? 1 : 0}`;
    let c = this.sprites.get(key);
    if (c) return c;
    const p = this._pinUnit();
    const n = BADGE;
    c = document.createElement('canvas');
    c.width = (n + 1) * p;
    c.height = (n + 1) * p;
    const g = c.getContext('2d');
    const corner = (x, y) => (x === 0 || x === n - 1) && (y === 0 || y === n - 1);
    g.fillStyle = 'rgba(10, 12, 8, 0.45)';
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (!corner(x, y)) g.fillRect((x + 1) * p, (y + 1) * p, p, p);
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        if (corner(x, y)) continue;
        const edge = x === 0 || y === 0 || x === n - 1 || y === n - 1;
        g.fillStyle = edge ? (selected ? '#fff6dc' : INK) : place.visited ? BADGE_FILL.visited : BADGE_FILL.fresh;
        g.fillRect(x * p, y * p, p, p);
      }
    }
    g.fillStyle = INK;
    for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) if (place.glyph[y][x] === '#') g.fillRect((x + 2) * p, (y + 2) * p, p, p);
    this.sprites.set(key, c);
    return c;
  }

  // Where a place's badge goes: on the spot, or, close enough in that its
  // shape is drawn and would be hidden by it, just above the shape.
  _badgeRect(place) {
    const p = this._pinUnit();
    let { sx, sy } = this.toScreen(place.x, place.z);
    const size = BADGE * p;
    if (place.shape && place.shape.length && this.scale >= SHAPES_FROM * this.dpr) {
      let top = Infinity;
      let bottom = -Infinity;
      for (const poly of place.shape) {
        for (const [x, z] of poly) {
          const q = this.toScreen(x, z);
          top = Math.min(top, q.sy);
          bottom = Math.max(bottom, q.sy);
        }
      }
      if (bottom - top > size * 0.6) sy = top - size / 2 - 3 * this.dpr;
    }
    const lifted = sy !== this.toScreen(place.x, place.z).sy;
    return { x: Math.round(sx - size / 2), y: Math.round(sy - size / 2), w: size, h: size, sx, sy, lifted };
  }

  _drawPlaces() {
    const { W, H } = this;
    const pad = 40 * this.dpr;
    const a = this.toWorld(-pad, -pad);
    const b = this.toWorld(W + pad, H + pad);
    const list = this.places.within(a.x, a.z, b.x, b.z);
    const ctx = this.ctx;
    // its open ground, a town's street, at every zoom
    ctx.save();
    ctx.fillStyle = GROUND_FILL;
    for (const place of list) {
      for (const poly of place.ground || []) {
        ctx.beginPath();
        poly.forEach(([x, z], i) => {
          const q = this.toScreen(x, z);
          if (i) ctx.lineTo(q.sx, q.sy);
          else ctx.moveTo(q.sx, q.sy);
        });
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.restore();
    // close up, what stands there: a roof, a tent, a deck
    if (this.scale >= SHAPES_FROM * this.dpr) {
      ctx.save();
      ctx.lineJoin = 'round';
      ctx.lineWidth = Math.max(1, this.dpr);
      ctx.strokeStyle = INK;
      ctx.fillStyle = SHAPE_FILL;
      for (const place of list) {
        for (const poly of place.shape || []) {
          ctx.beginPath();
          poly.forEach(([x, z], i) => {
            const q = this.toScreen(x, z);
            if (i) ctx.lineTo(q.sx, q.sy);
            else ctx.moveTo(q.sx, q.sy);
          });
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
      }
      ctx.restore();
    }
    const shown = [];
    for (const place of list.sort((u, v) => u.z - v.z)) {
      const r = this._badgeRect(place);
      if (r.x > W || r.y > H || r.x + r.w < 0 || r.y + r.h < 0) continue;
      const sel = place.id === this.placeSel;
      if (place.id === this.marks.tracked) {
        const ph = (this.t * 0.9) % 1;
        ctx.strokeStyle = place.color;
        ctx.globalAlpha = 0.9 * (1 - ph);
        ctx.lineWidth = 2 * this.dpr;
        ctx.beginPath();
        ctx.arc(r.sx, r.sy, (8 + ph * 12) * this.dpr, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      ctx.drawImage(this._badge(place, sel), r.x, r.y);
      shown.push({ place, r });
    }
    this._placesShown = shown;
  }

  // Names under the badges, after the marks' (which win any overlap): the
  // selected and tracked first, then nearest the middle of the view.
  _drawPlaceLabels() {
    const ctx = this.ctx;
    const d = this.dpr;
    ctx.font = `${10.5 * d}px ui-monospace, 'SF Mono', Menlo, Consolas, monospace`;
    ctx.textBaseline = 'top';
    const rank = ({ place, r }) =>
      place.id === this.placeSel ? -2 : place.id === this.marks.tracked ? -1 : Math.hypot(r.sx - this.W / 2, r.sy - this.H / 2);
    const list = [...this._placesShown].sort((a, b) => rank(a) - rank(b));
    for (const { place, r } of list) {
      const text = place.name + (place.id === this.marks.tracked ? ' ◆' : '');
      const w = ctx.measureText(text).width;
      // under the badge, or over it when it's lifted over what stands there
      const y = r.lifted ? r.y - 15 * d : r.y + r.h + 2 * d;
      const box = { x0: r.sx - w / 2 - 2 * d, x1: r.sx + w / 2 + 2 * d, y0: y, y1: y + 13 * d };
      if (this._boxes.some((q) => q.x0 < box.x1 && box.x0 < q.x1 && q.y0 < box.y1 && box.y0 < q.y1)) continue;
      this._boxes.push(box);
      this._label(text, r.sx, y, place.id === this.placeSel ? '#d9b45a' : place.visited ? '#c9bea0' : '#f2ead2', 'center');
    }
  }

  _hitPlace(sx, sy) {
    const slop = 3 * this.dpr;
    for (let i = this._placesShown.length - 1; i >= 0; i--) {
      const { place, r } = this._placesShown[i];
      if (sx >= r.x - slop && sx <= r.x + r.w + slop && sy >= r.y - slop && sy <= r.y + r.h + slop) return place;
    }
    return null;
  }

  selectPlace(id) {
    const place = this.places.get(id);
    if (!place) return;
    this.closeEditor();
    this.placeSel = id;
    this.card.hidden = false;
    this._fillCard(place);
    this._renderList();
  }

  closePlace() {
    if (!this.placeSel) return;
    this.placeSel = null;
    this.card.hidden = true;
    if (this.root.contains(document.activeElement)) this.frame.focus({ preventScroll: true });
    this._renderList();
  }

  _fillCard(place = this.places.get(this.placeSel)) {
    if (!place) return;
    this.card.querySelector('#place-kind').textContent = place.kind + (place.visited ? ' · been here' : '');
    this.card.querySelector('#place-name').textContent = place.name;
    this.card.querySelector('#place-note').textContent = place.note || '';
    const dist = Math.hypot(place.x - this.player.pos.x, place.z - this.player.pos.z);
    this.card.querySelector('#place-where').textContent = `${Math.round(place.x)}, ${Math.round(place.z)} · ${formatDistance(dist)} from you`;
    const tr = this.card.querySelector('[data-act="place-track"]');
    const on = this.marks.tracked === place.id;
    tr.setAttribute('aria-pressed', String(on));
    tr.textContent = on ? 'tracking' : 'track';
  }

  _placeCard() {
    if (!this.placeSel || this.card.hidden) return;
    const place = this.places.get(this.placeSel);
    if (!place) return this.closePlace();
    const r = this._badgeRect(place);
    const d = this.dpr;
    const vw = this.W / d;
    const vh = this.H / d;
    const ew = this.card.offsetWidth;
    const eh = this.card.offsetHeight;
    let left = (r.x + r.w) / d + 12;
    if (left + ew > vw - 8) left = r.x / d - ew - 12;
    left = Math.max(8, Math.min(vw - ew - 8, left));
    const top = Math.max(8, Math.min(vh - eh - 8, r.y / d - 10));
    this.card.style.left = `${Math.round(left)}px`;
    this.card.style.top = `${Math.round(top)}px`;
  }

  _drawTrackLine() {
    const m = this.marks.trackedMark();
    if (!m) return;
    const p = this.toScreen(this.player.pos.x, this.player.pos.z);
    const q = this.toScreen(m.x, m.z);
    const ctx = this.ctx;
    const d = this.dpr;
    ctx.save();
    ctx.setLineDash([2 * this.unit * 2, 3 * this.unit * 2]);
    ctx.lineDashOffset = -this.t * 20 * d;
    ctx.lineWidth = 2 * this.unit;
    ctx.strokeStyle = 'rgba(21, 20, 15, 0.55)';
    ctx.beginPath();
    ctx.moveTo(p.sx + d, p.sy + d);
    ctx.lineTo(q.sx + d, q.sy + d);
    ctx.stroke();
    ctx.strokeStyle = m.color;
    ctx.beginPath();
    ctx.moveTo(p.sx, p.sy);
    ctx.lineTo(q.sx, q.sy);
    ctx.stroke();
    ctx.restore();
  }

  _drawPlayer() {
    const ctx = this.ctx;
    const d = this.dpr;
    const pl = this.player;
    const { sx, sy } = this.toScreen(pl.pos.x, pl.pos.z);
    // what the camera sees (movement is camera-relative, so this helps)
    const look = Math.atan2(-Math.cos(pl.camYaw), -Math.sin(pl.camYaw));
    ctx.save();
    ctx.fillStyle = 'rgba(238, 240, 226, 0.14)';
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.arc(sx, sy, 46 * d, look - 0.5, look + 0.5);
    ctx.closePath();
    ctx.fill();
    // a slow pulse so you can find yourself
    const ph = (this.t * 0.8) % 1;
    ctx.strokeStyle = `rgba(217, 180, 90, ${0.7 * (1 - ph)})`;
    ctx.lineWidth = 2 * d;
    ctx.beginPath();
    ctx.arc(sx, sy, (9 + ph * 14) * d, 0, Math.PI * 2);
    ctx.stroke();
    // facing arrow
    ctx.translate(sx, sy);
    ctx.rotate(Math.atan2(Math.cos(pl.yaw), Math.sin(pl.yaw)));
    const a = 1.15 * d;
    ctx.beginPath();
    ctx.moveTo(9 * a, 0);
    ctx.lineTo(-6 * a, -6.5 * a);
    ctx.lineTo(-2.5 * a, 0);
    ctx.lineTo(-6 * a, 6.5 * a);
    ctx.closePath();
    ctx.lineJoin = 'round';
    ctx.lineWidth = 3 * d;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.fillStyle = '#fff6dc';
    ctx.fill();
    ctx.restore();
  }

  _pinUnit() {
    return this.unit * 2;
  }

  _sprite(m, selected) {
    const key = `${m.color}|${m.icon}|${selected ? 1 : 0}`;
    let c = this.sprites.get(key);
    if (c) return c;
    const p = this._pinUnit();
    const w = PIN[0].length;
    const h = PIN.length;
    c = document.createElement('canvas');
    c.width = (w + 1) * p;
    c.height = (h + 1) * p;
    const g = c.getContext('2d');
    const icon = iconById(m.icon).rows;
    const outline = selected ? '#fff6dc' : INK;
    // drop shadow
    g.fillStyle = 'rgba(10, 12, 8, 0.45)';
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (PIN[y][x] !== '.') g.fillRect((x + 1) * p, (y + 1) * p, p, p);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const ch = PIN[y][x];
        if (ch === '.') continue;
        g.fillStyle = ch === '#' ? outline : m.color;
        g.fillRect(x * p, y * p, p, p);
      }
    }
    g.fillStyle = INK;
    for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) if (icon[y][x] === '#') g.fillRect((x + 2) * p, (y + 2) * p, p, p);
    this.sprites.set(key, c);
    return c;
  }

  _pinRect(m) {
    const p = this._pinUnit();
    const { sx, sy } = this.toScreen(m.x, m.z);
    // the tip pixel (5, 13) sits on the marked spot
    const x = Math.round(sx - 5.5 * p);
    const y = Math.round(sy - 14 * p);
    return { x, y, w: 11 * p, h: 14 * p, sx, sy };
  }

  _drawMarks() {
    const ctx = this.ctx;
    const d = this.dpr;
    const p = this._pinUnit();
    const list = [...this.marks.list()].sort((a, b) => a.z - b.z);
    const tracked = this.marks.tracked;
    ctx.font = `${11 * d}px ui-monospace, 'SF Mono', Menlo, Consolas, monospace`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const shown = [];
    for (const m of list) {
      const r = this._pinRect(m);
      if (r.x > this.W || r.y > this.H || r.x + r.w < -200 * d || r.y + r.h < 0) continue;
      shown.push({ m, r });
      const sel = m.id === this.selected;
      if (m.id === tracked) {
        const ph = (this.t * 0.9) % 1;
        ctx.strokeStyle = m.color;
        ctx.globalAlpha = 0.9 * (1 - ph);
        ctx.lineWidth = 2 * d;
        ctx.beginPath();
        ctx.ellipse(r.sx, r.sy, (5 + ph * 12) * d, (2.5 + ph * 6) * d, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      ctx.drawImage(this._sprite(m, sel), r.x, r.y);
    }
    // Labels: the selected and tracked marks first, then nearest the centre;
    // any that would overlap one already placed are left out.
    const rank = ({ m, r }) =>
      m.id === this.selected ? -2 : m.id === tracked ? -1 : Math.hypot(r.sx - this.W / 2, r.sy - this.H / 2);
    shown.sort((a, b) => rank(a) - rank(b));
    const boxes = this._boxes;
    for (const { m, r } of shown) {
      const text = markLabel(m) + (m.id === tracked ? ' ◆' : '');
      const x = r.x + r.w + 3 * d;
      const y = r.y + 5.5 * p;
      const box = { x0: x - 2 * d, x1: x + ctx.measureText(text).width + 2 * d, y0: y - 8 * d, y1: y + 8 * d };
      if (boxes.some((b) => b.x0 < box.x1 && box.x0 < b.x1 && b.y0 < box.y1 && box.y0 < b.y1)) continue;
      boxes.push(box);
      this._label(text, x, y, m.id === this.selected ? '#d9b45a' : '#eef0e2', 'left');
    }
  }

  _label(text, x, y, color, align = 'center') {
    const ctx = this.ctx;
    ctx.textAlign = align;
    ctx.lineJoin = 'round';
    ctx.lineWidth = 3.5 * this.dpr;
    ctx.strokeStyle = 'rgba(12, 16, 11, 0.9)';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }

  _drawScaleBar() {
    const ctx = this.ctx;
    const d = this.dpr;
    const maxPx = 130 * d;
    let meters = SCALE_STEPS[0];
    for (const m of SCALE_STEPS) if (m * this.scale <= maxPx) meters = m;
    const len = Math.round(meters * this.scale);
    const x = Math.round(14 * d);
    const y = Math.round(this.H - 16 * d);
    const t = Math.max(2, Math.round(2 * d));
    ctx.fillStyle = 'rgba(12, 16, 11, 0.8)';
    ctx.fillRect(x - t, y - 6 * d - t, len + 2 * t, 6 * d + 2 * t);
    ctx.fillStyle = '#eef0e2';
    ctx.fillRect(x, y - t, len, t);
    ctx.fillRect(x, y - 6 * d, t, 6 * d);
    ctx.fillRect(x + len - t, y - 6 * d, t, 6 * d);
    ctx.font = `${10.5 * d}px ui-monospace, 'SF Mono', Menlo, Consolas, monospace`;
    ctx.textBaseline = 'bottom';
    this._label(formatDistance(meters), x + len + 8 * d, y + 2 * d, '#eef0e2', 'left');
    // north
    const nx = this.W - 18 * d;
    const ny = 16 * d;
    ctx.beginPath();
    ctx.moveTo(nx, ny);
    ctx.lineTo(nx + 5 * d, ny + 10 * d);
    ctx.lineTo(nx - 5 * d, ny + 10 * d);
    ctx.closePath();
    ctx.fillStyle = '#eef0e2';
    ctx.strokeStyle = 'rgba(12, 16, 11, 0.9)';
    ctx.lineWidth = 3 * d;
    ctx.stroke();
    ctx.fill();
    ctx.textBaseline = 'top';
    this._label('N', nx, ny + 13 * d, '#eef0e2', 'center');
  }

  // ── pointer input ─────────────────────────────────────────────────────────
  _hitMark(sx, sy) {
    const list = [...this.marks.list()].sort((a, b) => b.z - a.z);
    const slop = 3 * this.dpr;
    for (const m of list) {
      const r = this._pinRect(m);
      if (sx >= r.x - slop && sx <= r.x + r.w + slop && sy >= r.y - slop && sy <= r.y + r.h + slop) return m;
    }
    return null;
  }

  _down(e) {
    this.canvas.setPointerCapture?.(e.pointerId);
    const pt = this._evtXY(e);
    this.pointers.set(e.pointerId, pt);
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.gesture = { kind: 'pinch', d0: Math.hypot(a.sx - b.sx, a.sy - b.sy), stop0: this.stop, mid: { sx: (a.sx + b.sx) / 2, sy: (a.sy + b.sy) / 2 } };
      return;
    }
    if (this.pointers.size > 2) return;
    const hit = this._hitMark(pt.sx, pt.sy);
    const place = hit ? null : this._hitPlace(pt.sx, pt.sy);
    this.gesture = { kind: 'press', start: pt, last: pt, moved: false, mark: hit ? hit.id : null, place: place ? place.id : null };
  }

  _move(e) {
    const pt = this._evtXY(e);
    const w = this.toWorld(pt.sx, pt.sy);
    this.cursorEl.textContent = `${Math.round(w.x)}, ${Math.round(w.z)}`;
    if (!this.pointers.has(e.pointerId)) {
      this.canvas.classList.toggle('on-pin', !!(this._hitMark(pt.sx, pt.sy) || this._hitPlace(pt.sx, pt.sy)));
      return;
    }
    this.pointers.set(e.pointerId, pt);
    const g = this.gesture;
    if (!g) return;
    if (g.kind === 'pinch' && this.pointers.size >= 2) {
      const [a, b] = [...this.pointers.values()];
      const dd = Math.hypot(a.sx - b.sx, a.sy - b.sy);
      const mid = { sx: (a.sx + b.sx) / 2, sy: (a.sy + b.sy) / 2 };
      this.panBy(mid.sx - g.mid.sx, mid.sy - g.mid.sy);
      g.mid = mid;
      // ~1.25× per zoom stop
      const steps = Math.round(Math.log(dd / Math.max(1, g.d0)) / Math.log(1.25));
      const want = Math.max(0, Math.min(STOPS.length - 1, g.stop0 + steps));
      if (want !== this.stop) this.zoomBy(want - this.stop, mid.sx, mid.sy);
      return;
    }
    if (g.kind !== 'press') return;
    const dx = pt.sx - g.last.sx;
    const dy = pt.sy - g.last.sy;
    if (!g.moved && Math.hypot(pt.sx - g.start.sx, pt.sy - g.start.sy) > 5 * this.dpr) {
      g.moved = true;
      if (!g.mark) this.canvas.classList.add('panning');
    }
    if (g.moved) {
      if (g.mark) {
        const m = this.marks.get(g.mark);
        if (m) {
          m.x = w.x;
          m.z = w.z;
        }
      } else this.panBy(dx, dy);
    }
    g.last = pt;
  }

  _up(e, cancelled = false) {
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.delete(e.pointerId);
    this.canvas.classList.remove('panning');
    const g = this.gesture;
    if (g && g.kind === 'pinch') {
      if (this.pointers.size === 0) this.gesture = null;
      else {
        // one finger left: carry on as a pan, never as a tap
        const pt = [...this.pointers.values()][0];
        this.gesture = { kind: 'press', start: pt, last: pt, moved: true, mark: null };
      }
      return;
    }
    this.gesture = null;
    if (!g || cancelled) return;
    if (g.mark && g.moved) {
      const m = this.marks.get(g.mark);
      if (m) this.marks.update(m.id, { x: m.x, z: m.z });
      if (this.selected === g.mark) this._fillEditor();
      return;
    }
    if (g.moved) return;
    if (g.mark) {
      this.select(g.mark);
      return;
    }
    if (g.place) {
      this.selectPlace(g.place);
      return;
    }
    if (this.selected) {
      this.closeEditor();
      return;
    }
    if (this.placeSel) {
      this.closePlace();
      return;
    }
    const w = this.toWorld(g.start.sx, g.start.sy);
    this.addMark(w.x, w.z);
  }

  _wheel(e) {
    e.preventDefault();
    let dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1);
    if (e.ctrlKey) dy *= 6; // trackpad pinch
    this.wheelAcc += dy;
    const pt = this._evtXY(e);
    while (Math.abs(this.wheelAcc) >= 60) {
      this.zoomBy(this.wheelAcc > 0 ? -1 : 1, pt.sx, pt.sy);
      this.wheelAcc -= Math.sign(this.wheelAcc) * 60;
    }
  }

  // ── keys and buttons ──────────────────────────────────────────────────────
  _onKey(e) {
    if (!this.isOpen) return;
    const typing = e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA');
    if (e.key === 'Escape') {
      e.preventDefault();
      if (this.selected) this.closeEditor(true);
      else if (this.placeSel) this.closePlace();
      else this.close();
      return;
    }
    if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
    const step = 80 * this.dpr;
    switch (e.code) {
      case 'KeyM':
        this.close();
        break;
      case 'Equal':
      case 'NumpadAdd':
        this.zoomBy(1);
        break;
      case 'Minus':
      case 'NumpadSubtract':
        this.zoomBy(-1);
        break;
      case 'ArrowLeft':
      case 'KeyA':
        this.panBy(step, 0);
        break;
      case 'ArrowRight':
      case 'KeyD':
        this.panBy(-step, 0);
        break;
      case 'ArrowUp':
      case 'KeyW':
        this.panBy(0, step);
        break;
      case 'ArrowDown':
      case 'KeyS':
        this.panBy(0, -step);
        break;
      case 'KeyC':
        this.centerOn(this.player.pos.x, this.player.pos.z);
        break;
      default:
        return;
    }
    e.preventDefault();
  }

  _onClick(e) {
    const b = e.target.closest('button');
    if (!b || !this.root.contains(b)) return;
    if (b.dataset.icon) return this._edit({ icon: b.dataset.icon }, true);
    if (b.dataset.color) return this._edit({ color: b.dataset.color }, true);
    if (b.dataset.place) {
      const place = this.places.get(b.dataset.place);
      if (!place) return;
      this.centerOn(place.x, place.z);
      this.selectPlace(place.id);
      if (matchMedia('(max-width: 760px)').matches) this._setSide(false);
      return;
    }
    if (b.dataset.mark) {
      const m = this.marks.get(b.dataset.mark);
      if (!m) return;
      this.centerOn(m.x, m.z);
      this.select(m.id);
      if (matchMedia('(max-width: 760px)').matches) this._setSide(false);
      return;
    }
    switch (b.dataset.act) {
      case 'zoom-in':
        return this.zoomBy(1);
      case 'zoom-out':
        return this.zoomBy(-1);
      case 'center':
        return this.centerOn(this.player.pos.x, this.player.pos.z);
      case 'close':
        return this.close();
      case 'side':
        return this._setSide(!this.root.classList.contains('side-open'));
      case 'mark-here': {
        this._setSide(false);
        this.centerOn(this.player.pos.x, this.player.pos.z);
        this.addMark(this.player.pos.x, this.player.pos.z);
        return;
      }
      case 'track': {
        const id = this.selected;
        this.marks.setTracked(this.marks.tracked === id ? null : id);
        this.isNew = false;
        return this._fillEditor();
      }
      case 'delete': {
        const id = this.selected;
        this.closeEditor();
        this.marks.remove(id);
        return;
      }
      case 'done':
        return this.closeEditor();
      case 'place-track': {
        const id = this.placeSel;
        this.marks.setTracked(this.marks.tracked === id ? null : id);
        return this._fillCard();
      }
      case 'place-done':
        return this.closePlace();
    }
  }

  _setSide(open) {
    this.root.classList.toggle('side-open', open);
    const t = this.root.querySelector('[data-act="side"]');
    if (t) t.setAttribute('aria-pressed', String(open));
  }

  // ── marks ─────────────────────────────────────────────────────────────────
  addMark(x, z) {
    const m = this.marks.add({ x, z });
    this.select(m.id, true);
  }

  select(id, isNew = false) {
    this.closePlace();
    this.selected = id;
    this.isNew = isNew;
    this.editor.hidden = false;
    this._fillEditor();
    this._renderList();
    if (!matchMedia('(hover: none)').matches) this.nameEl.focus({ preventScroll: true });
  }

  // cancel = Esc: a brand-new mark you didn't touch is thrown away
  closeEditor(cancel = false) {
    if (!this.selected) return;
    const id = this.selected;
    const m = this.marks.get(id);
    this.selected = null;
    this.editor.hidden = true;
    if (cancel && this.isNew && m && !m.name.trim() && !m.note.trim()) this.marks.remove(id);
    this.isNew = false;
    if (this.root.contains(document.activeElement)) this.frame.focus({ preventScroll: true });
    this._renderList();
  }

  _edit(patch, touched = false) {
    if (!this.selected) return;
    this.marks.update(this.selected, patch);
    if (touched) this.isNew = false;
    this._fillEditor(false);
  }

  _fillEditor(fields = true) {
    const m = this.marks.get(this.selected);
    if (!m) return;
    if (fields) {
      this.nameEl.value = m.name;
      this.noteEl.value = m.note || '';
    }
    for (const b of this.iconsEl.children) b.setAttribute('aria-pressed', String(b.dataset.icon === m.icon));
    for (const b of this.colorsEl.children) b.setAttribute('aria-pressed', String(b.dataset.color === m.color));
    const dist = Math.hypot(m.x - this.player.pos.x, m.z - this.player.pos.z);
    this.whereEl.textContent = `${Math.round(m.x)}, ${Math.round(m.z)} · ${formatDistance(dist)} from you`;
    const tr = this.editor.querySelector('[data-act="track"]');
    const on = this.marks.tracked === m.id;
    tr.setAttribute('aria-pressed', String(on));
    tr.textContent = on ? 'tracking' : 'track';
  }

  _placeEditor() {
    if (!this.selected || this.editor.hidden) return;
    const m = this.marks.get(this.selected);
    if (!m) return;
    const r = this._pinRect(m);
    const d = this.dpr;
    const vw = this.W / d;
    const vh = this.H / d;
    const ew = this.editor.offsetWidth;
    const eh = this.editor.offsetHeight;
    let left = (r.x + r.w) / d + 14;
    if (left + ew > vw - 8) left = r.x / d - ew - 14;
    left = Math.max(8, Math.min(vw - ew - 8, left));
    const top = Math.max(8, Math.min(vh - eh - 8, r.y / d - 10));
    this.editor.style.left = `${Math.round(left)}px`;
    this.editor.style.top = `${Math.round(top)}px`;
  }

  _renderList() {
    this._renderPlaces();
    const pl = this.player.pos;
    const items = this.marks
      .list()
      .map((m) => ({ m, d: Math.hypot(m.x - pl.x, m.z - pl.z) }))
      .sort((a, b) => a.d - b.d);
    this.listEl.textContent = '';
    if (!items.length) {
      const p = document.createElement('p');
      p.className = 'empty';
      p.textContent = 'No marks yet. Click anywhere on the map to tag a place.';
      this.listEl.appendChild(p);
      return;
    }
    for (const { m, d } of items) {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.mark = m.id;
      if (m.id === this.selected) b.classList.add('selected');
      b.innerHTML = `${iconSvg(m.icon, m.color)}<span class="name"></span><span class="dist"></span>`;
      b.querySelector('.name').textContent = markLabel(m);
      const dist = b.querySelector('.dist');
      dist.textContent = formatDistance(d);
      if (m.id === this.marks.tracked) {
        dist.classList.add('tracked');
        dist.textContent = `◆ ${dist.textContent}`;
      }
      li.appendChild(b);
      this.listEl.appendChild(li);
    }
  }

  // The places nearest you, as far as they're known yet.
  _renderPlaces() {
    const pl = this.player.pos;
    const items = this.places.nearest(pl.x, pl.z, NEARBY.r, NEARBY.n);
    this.placeListEl.textContent = '';
    if (!items.length) {
      const p = document.createElement('p');
      p.className = 'empty';
      p.textContent = 'Nothing out here that anyone left behind, as far as the map knows.';
      this.placeListEl.appendChild(p);
      return;
    }
    for (const { place, d } of items) {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.place = place.id;
      if (place.id === this.placeSel) b.classList.add('selected');
      if (place.visited) b.classList.add('visited');
      b.innerHTML = `${glyphSvg(place.glyph)}<span class="name"></span><span class="dist"></span>`;
      b.querySelector('.name').textContent = place.name;
      b.title = place.kind;
      const dist = b.querySelector('.dist');
      dist.textContent = formatDistance(d);
      if (place.id === this.marks.tracked) {
        dist.classList.add('tracked');
        dist.textContent = `◆ ${dist.textContent}`;
      }
      li.appendChild(b);
      this.placeListEl.appendChild(li);
    }
  }
}
