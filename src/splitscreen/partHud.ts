// Somebody else's HUD: what is written over a part of a split screen that is
// one of the other pads'. Each of them has one of their own, as the first
// hiker has the game's (ui/hud.js), saying what goes for them:
//
//   who they are, and which button opens their panel
//   where they are, which way they're looking and the hour
//   where the game's HUD is pointing (a mark being tracked), from where
//   they are
//   a word for a moment
//   a panel of their own, as the first hiker has the settings panel: what
//   is theirs to set (who is hiking, whether the camera is locked behind
//   them), and under it what their pad does
//
// It has no tool bar and no prompt: the tools are the first hiker's. And
// nothing on it is clicked. The panel is worked with their own pad, which
// index.ts reads; what its rows are is index.ts's to say too (Panel).

import { formatWhere, formatTrack } from '../core/format.js';

// One row of a panel: something to set, or something to do.
export interface Row {
  id: string; // (what the play-through finds it by)
  label: () => string;
  value?: () => string; // what it is now, for something set: 'on', 'Lauren'
  step?: (by: number) => void; // ← →: the one before (-1) or the next (1); a switch flips either way
  press?: () => void; // A, for something to do. (On something set, A is →.)
  closes?: boolean; // done, the panel is put away
}

// Which row of a panel someone is on, and whether it's open: all there is to
// working one with a pad, apart from drawing it.
export class Menu {
  rows: Row[];
  at = 0;
  isOpen = false;

  constructor(rows: Row[] = []) {
    this.rows = rows;
  }

  // Opened on its first row.
  open(): void {
    this.at = 0;
    this.isOpen = true;
  }

  close(): void {
    this.isOpen = false;
  }

  // To the next row (1) or the one before (-1), round from the ends.
  move(by: number): void {
    const n = this.rows.length;
    if (this.isOpen && n) this.at = (((this.at + by) % n) + n) % n;
  }

  // ← (-1) or → (1) on the row they're on.
  step(by: number): void {
    if (this.isOpen) this.rows[this.at]?.step?.(by);
  }

  // A on the row they're on.
  press(): void {
    const row = this.isOpen ? this.rows[this.at] : undefined;
    if (!row) return;
    if (row.press) row.press();
    else row.step?.(1);
    if (row.closes) this.close();
  }
}

// What someone's panel says, asked again each frame it's open.
export interface Panel {
  title: () => string;
  rows: Row[];
  keys: () => Array<{ keys: string; does: string }>; // what their pad does (pad.js), listed under the rows
  foot: () => string; // how the panel itself is worked
}

// Somewhere the HUD points to (hud.guide), or nowhere.
type Mark = { label: string; color: string; x: number; z: number } | null;

const make = (tag: string, cls: string, text = ''): HTMLElement => {
  const el = document.createElement(tag);
  el.className = cls;
  if (text) el.textContent = text;
  return el;
};

// How long a word stays (ms), unless it says.
const WORD_SHOWS = 1800;

export class PartHud {
  readonly el: HTMLElement; // the part itself: index.ts puts it where the part is
  readonly menu = new Menu();
  private panel: Panel | null = null;
  private who = make('div', 'who');
  private word = make('div', 'word');
  private track = make('div', 'track');
  private where = make('div', 'where');
  private board = make('div', 'panel');
  private wordTimer: ReturnType<typeof setTimeout> | undefined;
  // What each of those says, as last written, so that nothing is written twice.
  private said = { who: '', track: '', where: '', board: '' };

  constructor() {
    this.el = make('div', 'part');
    this.board.hidden = true;
    this.el.append(this.who, this.word, this.track, this.where, this.board);
  }

  // What their panel says, and its rows.
  offer(panel: Panel): void {
    this.panel = panel;
    this.menu.rows = panel.rows;
  }

  // Who they are, and under it, what to press.
  label(name: string, hint: string): void {
    const said = `${name}|${hint}`;
    if (said === this.said.who) return;
    this.said.who = said;
    this.who.replaceChildren(make('b', '', name), make('i', '', hint));
  }

  // A word on their part for a moment.
  flash(msg: string, ms = WORD_SHOWS): void {
    this.word.textContent = msg;
    this.word.classList.add('show');
    clearTimeout(this.wordTimer);
    this.wordTimer = setTimeout(() => this.word.classList.remove('show'), ms);
  }

  // Each frame: where they are and which way they're looking, the hour,
  // where the game's HUD is pointing (if anywhere), and their panel as it
  // now stands.
  update(pos: { x: number; z: number }, camYaw: number, hours: number, mark: Mark): void {
    const where = formatWhere(pos, camYaw, hours);
    if (where !== this.said.where) this.where.textContent = this.said.where = where;
    const track = mark ? formatTrack(mark, pos, camYaw) : '';
    if (track !== this.said.track) {
      this.track.textContent = this.said.track = track;
      this.track.style.color = mark ? mark.color : '';
    }
    this.draw();
  }

  // The panel: its rows, the one they're on marked, then what their pad
  // does. Written again only when what it says has changed.
  private draw(): void {
    const { menu, panel, board } = this;
    const open = menu.isOpen && !!panel;
    if (board.hidden === open) board.hidden = !open;
    if (!open) return;
    const rows = menu.rows.map((r) => ({ id: r.id, label: r.label(), value: r.value ? r.value() : '', set: !!r.step }));
    const keys = panel.keys();
    const title = panel.title();
    const foot = panel.foot();
    const said = JSON.stringify([title, menu.at, rows, keys, foot]);
    if (said === this.said.board) return;
    this.said.board = said;
    const list = rows.map((r, i) => {
      const row = make('div', i === menu.at ? 'row at' : 'row');
      row.dataset.row = r.id;
      // something set says what it is, between the arrows that change it
      row.append(make('span', '', r.label), make('b', '', r.set ? `‹ ${r.value} ›` : r.value));
      return row;
    });
    const does = keys.map((k) => {
      const row = make('div', 'key');
      row.append(make('kbd', '', k.keys), make('span', '', k.does));
      return row;
    });
    board.replaceChildren(make('h2', '', title), ...list, make('hr', ''), ...does, make('p', 'foot', foot));
  }

  // Their pad is gone, and so is this.
  dispose(): void {
    clearTimeout(this.wordTimer);
    this.el.remove();
  }
}
