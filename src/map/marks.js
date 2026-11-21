// Places of interest you've tagged on the map. They are part of the world:
// saved with it (src/save/), and shared with whoever else is in it. Which one
// you're tracking is yours alone.

import { LOOSE } from '../save/regions.js';

// 7×7 pixel glyphs drawn inside a mark's pin.
export const ICONS = [
  { id: 'flag', label: 'flag', rows: ['##.....', '####...', '######.', '####...', '##.....', '#......', '#......'] },
  { id: 'star', label: 'star', rows: ['...#...', '...#...', '#######', '.#####.', '..###..', '.##.##.', '.#...#.'] },
  { id: 'heart', label: 'heart', rows: ['.......', '.##.##.', '#######', '#######', '.#####.', '..###..', '...#...'] },
  { id: 'hut', label: 'hut', rows: ['...#...', '..###..', '.#####.', '#######', '.#####.', '.##.##.', '.##.##.'] },
  { id: 'tree', label: 'tree', rows: ['...#...', '..###..', '.#####.', '..###..', '.#####.', '#######', '...#...'] },
  { id: 'view', label: 'viewpoint', rows: ['.......', '..###..', '.#...#.', '#..#..#', '.#...#.', '..###..', '.......'] },
  { id: 'idea', label: 'idea', rows: ['..###..', '.#####.', '.#####.', '.#####.', '..###..', '.......', '..###..'] },
  { id: 'question', label: 'mystery', rows: ['..###..', '.#...#.', '.....#.', '...##..', '...#...', '.......', '...#...'] },
];

export const COLORS = ['#d9b45a', '#d0563f', '#4f8fd6', '#3fb5a0', '#a46fd1', '#eceade'];

export const iconById = (id) => ICONS.find((i) => i.id === id) || ICONS[0];

// A pin is an 11×14 pixel sprite: '#' outline, 'o' fill. The icon goes at
// (2, 2) and the tip, at the bottom, is the exact spot that was marked.
export const PIN = [
  '.#########.',
  '#ooooooooo#',
  '#ooooooooo#',
  '#ooooooooo#',
  '#ooooooooo#',
  '#ooooooooo#',
  '#ooooooooo#',
  '#ooooooooo#',
  '#ooooooooo#',
  '#ooooooooo#',
  '.###ooo###.',
  '...#ooo#...',
  '....#o#....',
  '.....#.....',
];

// Small inline SVG of an icon, for buttons and lists.
export function iconSvg(id, color = 'currentColor') {
  return glyphSvg(iconById(id).rows, color);
}

// ...or of any 7×7 glyph (a place's).
export function glyphSvg(rows, color = 'currentColor') {
  let rects = '';
  for (let y = 0; y < rows.length; y++) {
    for (let x = 0; x < rows[y].length; x++) if (rows[y][x] === '#') rects += `<rect x="${x}" y="${y}" width="1" height="1"/>`;
  }
  return `<svg viewBox="0 0 7 7" width="14" height="14" fill="${color}" shape-rendering="crispEdges" aria-hidden="true">${rects}</svg>`;
}

const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

const usable = (list) => (Array.isArray(list) ? list : []).filter((m) => m && Number.isFinite(m.x) && Number.isFinite(m.z));

export class MarkStore {
  constructor() {
    this.marks = [];
    this.tracked = null;
    this.routing = false; // follow the itinerary to the tracked pin
    this.listeners = new Set();
    // Somewhere that isn't a mark can be tracked too: a place another feature
    // put on the map (places.js). id -> something shaped like a mark, or null.
    this.findPlace = () => null;
  }

  list() {
    return this.marks;
  }

  get(id) {
    return this.marks.find((m) => m.id === id) || null;
  }

  add({ x, z, name = '', icon = 'flag', color, note = '' }) {
    const m = {
      id: newId(),
      x: Math.round(x * 10) / 10,
      z: Math.round(z * 10) / 10,
      name,
      icon,
      color: color || COLORS[this.marks.length % COLORS.length],
      note,
      created: Date.now(),
    };
    this.marks.push(m);
    this._changed();
    return m;
  }

  update(id, patch) {
    const m = this.get(id);
    if (!m) return;
    Object.assign(m, patch);
    if ('x' in patch) m.x = Math.round(m.x * 10) / 10;
    if ('z' in patch) m.z = Math.round(m.z * 10) / 10;
    this._changed();
  }

  remove(id) {
    this.marks = this.marks.filter((m) => m.id !== id);
    if (this.tracked === id) return this.setTracked(null);
    this._changed();
  }

  setTracked(id, routing = false) {
    this.tracked = id && (this.get(id) || this.findPlace(id)) ? id : null;
    this.routing = !!this.tracked && routing;
    this._changed();
  }

  // The mark, or the place, you're heading for.
  trackedMark() {
    return this.tracked ? this.get(this.tracked) || this.findPlace(this.tracked) : null;
  }

  // Replace the marks with a saved list: yours when a world opens, or someone
  // else's version of them while you're both in it. What you're tracking is
  // kept if it's still there.
  load(list) {
    this.marks = usable(list);
    if (this.tracked && !this.get(this.tracked) && !this.findPlace(this.tracked)) return this.setTracked(null);
    this._changed();
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  _changed() {
    for (const fn of this.listeners) fn(this);
  }
}

// How marks are spelled in a save (see src/save/domains.js): one element per
// mark, `m:<id>` -> the mark, among the things that have no place of their
// own in the region grid.
export const marksSave = {
  id: 'marks',
  scope: 'world',
  local: 'marks',
  kinds: ['m'],
  encode(list, put) {
    for (const m of Array.isArray(list) ? list : []) put(LOOSE, `m:${m.id}`, m);
  },
  decode() {
    const marks = [];
    return { take: (region, kind, rest, v) => void marks.push(v), done: () => marks };
  },
  validate: (raw) => (Array.isArray(raw) ? raw : []),
};

export const markLabel = (m) => m.name.trim() || 'unnamed place';
