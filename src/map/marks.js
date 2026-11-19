// Places of interest you've tagged on the map. Stored per world seed in
// localStorage, so a different ?seed has its own set of marks.

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
  const rows = iconById(id).rows;
  let rects = '';
  for (let y = 0; y < rows.length; y++) {
    for (let x = 0; x < rows[y].length; x++) if (rows[y][x] === '#') rects += `<rect x="${x}" y="${y}" width="1" height="1"/>`;
  }
  return `<svg viewBox="0 0 7 7" width="14" height="14" fill="${color}" shape-rendering="crispEdges" aria-hidden="true">${rects}</svg>`;
}

const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export class MarkStore {
  constructor(seed) {
    this.key = `my-world:marks:${seed}`;
    this.marks = [];
    this.tracked = null;
    this.listeners = new Set();
    try {
      const raw = JSON.parse(localStorage.getItem(this.key) || 'null');
      if (raw && Array.isArray(raw.marks)) {
        this.marks = raw.marks.filter((m) => m && Number.isFinite(m.x) && Number.isFinite(m.z));
        this.tracked = this.marks.some((m) => m.id === raw.tracked) ? raw.tracked : null;
      }
    } catch {
      /* unreadable or blocked storage: start empty */
    }
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
    if (this.tracked === id) this.tracked = null;
    this._changed();
  }

  setTracked(id) {
    this.tracked = id && this.get(id) ? id : null;
    this._changed();
  }

  trackedMark() {
    return this.tracked ? this.get(this.tracked) : null;
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  _changed() {
    try {
      localStorage.setItem(this.key, JSON.stringify({ v: 1, marks: this.marks, tracked: this.tracked }));
    } catch {
      /* private mode etc. */
    }
    for (const fn of this.listeners) fn(this);
  }
}

export const markLabel = (m) => m.name.trim() || 'unnamed place';

export function formatDistance(d) {
  if (d < 1000) return `${Math.round(d)} m`;
  return `${(d / 1000).toFixed(d < 10000 ? 1 : 0)} km`;
}
