// Minimal overlay: a hint at the start, coordinates (handy for deciding where
// to build things), the mark you're tracking, a help panel, the settings
// panel, and the building HUD: tool bar, materials, what the tool in hand
// would do, and a progress bar for press-and-hold work.

import { formatWhere, formatTrack, ARRIVED } from '../core/format.js';

const FAN_SHOWS = 2200; // ms a kit's fan stays open after it's picked

// A prompt with the keys in it in bold (<b>Z</b> ride, <b>hold click</b> dig),
// with those that `words` has another name for called that instead:
// Map { 'Z' => 'X', 'click' => 'RT' }.
export function renameKeys(html, words) {
  if (!words || !words.size || !html) return html;
  return html.replace(/<b>(hold )?([^<]+)<\/b>/g, (all, hold, key) => (words.has(key) ? `<b>${hold || ''}${words.get(key)}</b>` : all));
}

export class Hud {
  // settings: the settings panel (settingsPanel.js), which hud.setting() adds to
  constructor({ settings = null } = {}) {
    this.el = document.getElementById('hud');
    this.coords = document.getElementById('coords');
    this.hint = document.getElementById('hint');
    this.help = document.getElementById('help');
    this.helpControls = document.getElementById('help-controls');
    this.toast = document.getElementById('toast');
    this.debug = document.getElementById('debug');
    this.track = document.getElementById('track');
    this._toastTimer = 0;
    this._last = '';
    this._lastTrack = '';
    this._arrivedAt = null;
    this.hotbar = document.getElementById('hotbar');
    this.prompt = document.getElementById('prompt');
    this.inv = document.getElementById('inv');
    this.progress = document.getElementById('progress');
    this.progressBar = this.progress ? this.progress.firstElementChild : null;
    this.slots = []; // the tool bar: [{ kit, button, fan }]
    this._held = null; // the id of the tool in hand
    this._fan = null; // the kit fan that's open
    this._fanTimer = 0;
    this._prompt = null;
    // What the tool in hand has to say, and something at hand that a key
    // would do (cue), which is said in its place while there is one.
    this._tool = { html: '', bad: false, progress: null };
    this._cues = new Map(); // whose -> { html, bad?, progress?, n }: every cue that is up
    this._cueN = 0; // counts them as they're put up: the last one up is the one said
    this._inv = '';
    this.settings = settings;
    this.saveBtn = document.getElementById('save-btn');
    this.helpSource = null; // () => what renderHelp shows
    // With a pad in hand (namePad): what its buttons are called, and the
    // names of keys in prompts that it has buttons for.
    this._padNames = null;
    this._words = null;
    this.guides = []; // see guide()
    // Where it's pointing now, as of the last frame, or null: for whoever
    // else is to be pointed there from where they are (the others on a
    // split screen).
    /** @type {{ id: string, label: string, color: string, x: number, z: number } | null} */
    this.guided = null;
  }

  // Somewhere to head for, shown under the coordinates. More than one feature
  // may have one (the map mark you're tracking, the view at the end of the
  // hike you're on), so each adds a source: () => { id, label, color, x, z }
  // or null. The first, in the order they were added, that has one is shown.
  guide(source) {
    this.guides.push(source);
  }

  updateGuide(pos, camYaw) {
    let to = null;
    for (const g of this.guides) if ((to = g())) break;
    this.guided = to;
    this.updateTrack(to, pos, camYaw);
  }

  // Say what one of the HUD's buttons does (the ones in index.html: save-btn,
  // map-btn, settings-btn, help-btn, and act-stake on a touch screen).
  button(id, fn) {
    const el = document.getElementById(id);
    if (!el) return;
    // The touch buttons sit over the look pad: act on the press itself and
    // don't let it through. The corner buttons are ordinary clicks.
    const touch = el.closest('#touch-act');
    el.addEventListener(touch ? 'pointerdown' : 'click', (e) => {
      if (touch) {
        e.preventDefault();
        e.stopPropagation();
      }
      fn();
      if (!touch) el.blur();
    });
  }

  // Show the on-screen use / alt buttons: someone is playing by touch.
  showTouchActions() {
    const el = document.getElementById('touch-act');
    if (el) el.hidden = false;
  }

  // Someone has picked up a pad (names: [codes] -> what they're called on it),
  // or put it down (null). The help panel and the prompts name its buttons
  // where it has some for what they say, and keys where it hasn't.
  namePad(names) {
    this._padNames = names;
    this._words = null;
    if (names && this.helpSource) {
      this._words = new Map();
      for (const g of this.helpSource()) for (const r of g.rows) if (r.pad && typeof r.help === 'string') this._words.set(r.help, names(r.pad));
    }
    this._prompt = null;
    this._showPrompt();
    if (this.help && this.help.classList.contains('open') && this.helpSource) this.renderHelp(this.helpSource());
  }

  // The help panel (H), written from the keys that are actually bound.
  // groups: [{ group, rows: [{ help, label, pad? }] }], see Commands.help().
  renderHelp(groups) {
    const controls = this.helpControls;
    if (!controls) return;
    controls.replaceChildren();
    groups.forEach((g, i) => {
      if (i) controls.appendChild(document.createElement('hr'));
      const h = document.createElement('h2');
      h.textContent = g.group;
      controls.appendChild(h);
      for (const r of g.rows) {
        const row = document.createElement('div');
        row.className = 'row';
        const k = document.createElement('kbd');
        const pad = this._padNames && r.pad;
        k.textContent = pad ? this._padNames(r.pad) : r.help;
        if (pad) k.className = 'pad';
        const what = document.createElement('span');
        what.textContent = r.label;
        row.append(k, what);
        controls.appendChild(row);
      }
    });
  }

  // The save button says where the world stands: save / saving… / saved /
  // offline / clash. `state` tints it (see #corner in index.html).
  setSave(label, state) {
    if (!this.saveBtn) return;
    if (this.saveBtn.textContent !== label) this.saveBtn.textContent = label;
    if (this.saveBtn.dataset.state !== state) this.saveBtn.dataset.state = state;
  }

  // A control on the settings panel (O): a switch or a slider. What one is,
  // is at the top of settingsPanel.js.
  setting(control) {
    this.settings.add(control);
  }

  hideHint() {
    if (this.hint) this.hint.classList.add('gone');
  }

  // Written afresh each time it opens, from whatever is bound by then.
  toggleHelp() {
    if (this.helpSource && !this.helpOpen) this.renderHelp(this.helpSource());
    this.help.classList.toggle('open');
  }

  get helpOpen() {
    return this.help.classList.contains('open');
  }

  closeHelp() {
    this.help.classList.remove('open');
  }

  // Is a word on the screen right now?
  get showing() {
    return this.toast.classList.contains('show');
  }

  // A word on the screen for a moment. ms: how long it stays (longer for a
  // sentence worth reading).
  flash(msg, ms = 1400) {
    this.toast.textContent = msg;
    this.toast.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => this.toast.classList.remove('show'), ms);
  }

  update(pos, camYaw, hours) {
    const txt = formatWhere(pos, camYaw, hours);
    if (txt !== this._last) {
      this.coords.textContent = txt;
      this._last = txt;
    }
  }

  // Somewhere you're heading for: its name, how far it is and which way to go
  // from where the camera is looking. mark: { id, label, color, x, z }, or
  // null to show nothing.
  updateTrack(mark, pos, camYaw) {
    if (!this.track) return;
    let txt = '';
    if (mark) {
      const d = Math.hypot(mark.x - pos.x, mark.z - pos.z);
      if (d < ARRIVED) {
        if (this._arrivedAt !== mark.id) {
          this._arrivedAt = mark.id;
          this.flash(`arrived · ${mark.label}`);
        }
      } else if (d > ARRIVED * 2) this._arrivedAt = null;
      txt = formatTrack(mark, pos, camYaw);
    } else this._arrivedAt = null;
    if (txt !== this._lastTrack) {
      this.track.textContent = txt;
      this.track.style.color = mark ? mark.color : '';
      this._lastTrack = txt;
    }
  }

  // ── Building ─────────────────────────────────────────────────────────────
  // The tool bar: a slot for each kit of tools (see Kits in build/builder.js),
  // numbered for its key, showing the tool it would give you. A kit of more
  // than one has a pip for each, and a fan of them over its slot that opens
  // for a moment whenever it's picked, to choose from directly.
  //   kits        [{ label, tools: [{ id, label, short }], last }]
  //   pick(i)     the slot for kit i was pressed, as its number key would be
  //   choose(id)  a tool in a fan was
  buildTools(kits, { pick, choose }) {
    if (!this.hotbar) return;
    const range = document.getElementById('hint-tools');
    if (range) range.textContent = `1–${kits.length}`;
    this._closeFan();
    this.hotbar.textContent = '';
    this.slots = kits.map((kit, i) => {
      const el = document.createElement('div');
      el.className = 'kit';
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'slot';
      button.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        pick(i);
        this.showKit(i);
        button.blur();
      });
      el.appendChild(button);
      let fan = null;
      if (kit.tools.length > 1) {
        fan = document.createElement('div');
        fan.className = 'fan';
        fan.hidden = true;
        fan.setAttribute('role', 'group');
        fan.setAttribute('aria-label', kit.label);
        const h = document.createElement('h3');
        h.textContent = kit.label;
        fan.appendChild(h);
        for (const t of kit.tools) {
          const b = document.createElement('button');
          b.type = 'button';
          b.dataset.tool = t.id;
          b.textContent = t.label;
          b.addEventListener('pointerdown', (e) => {
            e.stopPropagation();
            choose(t.id);
            this._closeFan();
            b.blur();
          });
          fan.appendChild(b);
        }
        el.appendChild(fan);
      }
      this.hotbar.appendChild(el);
      return { kit, button, fan };
    });
    // the bar is made again as tools are added: keep showing what's in hand
    this.slots.forEach((s, i) => this._showSlot(s, i, s.kit.tools.find((t) => t.id === this._held) || s.kit.last));
  }

  // The slot for kit i, showing `tool` from it.
  _showSlot(s, i, tool) {
    const { kit, button, fan } = s;
    const held = kit.tools.some((t) => t.id === this._held);
    // the number keys pick the first ten (0 for the tenth); past that, the bar
    const key = i < 10 ? String((i + 1) % 10) : '';
    button.innerHTML = `${key ? `<kbd>${key}</kbd>` : ''}<span class="long"></span><span class="short"></span>`;
    button.querySelector('.long').textContent = tool.label;
    button.querySelector('.short').textContent = tool.short || tool.label;
    if (fan) {
      const pips = document.createElement('i');
      pips.className = 'pips';
      for (const t of kit.tools) pips.appendChild(document.createElement('b')).classList.toggle('on', t.id === tool.id);
      button.appendChild(pips);
      for (const b of fan.querySelectorAll('button')) b.setAttribute('aria-pressed', String(held && b.dataset.tool === this._held));
    }
    button.setAttribute('aria-label', `${fan ? `${kit.label}: ` : ''}${tool.label}${key ? ` (key ${key})` : ''}`);
    button.setAttribute('aria-pressed', String(held));
  }

  showStake(on) {
    const el = document.getElementById('act-stake');
    if (el) el.hidden = !on;
  }

  // The tool in hand: `tool`, from kit i.
  selectTool(i, tool) {
    this._held = tool.id;
    this.slots.forEach((s, j) => this._showSlot(s, j, j === i ? tool : s.kit.last));
  }

  // Open kit i's fan for a moment (closing any other); a kit of one has none.
  showKit(i) {
    this._closeFan();
    const s = this.slots[i];
    if (!s || !s.fan) return;
    s.fan.hidden = false;
    this._fan = s.fan;
    this._fanTimer = setTimeout(() => this._closeFan(), FAN_SHOWS);
  }

  _closeFan() {
    clearTimeout(this._fanTimer);
    if (this._fan) this._fan.hidden = true;
    this._fan = null;
  }

  // What the tool in hand would do (the builder says this every frame).
  setPrompt(html, bad = false) {
    this._tool.html = html;
    this._tool.bad = !!bad;
    this._showPrompt();
  }

  // Something at hand that a key would do, whatever tool is in hand: calm an
  // animal, climb on. Said in place of the tool's prompt while it is set.
  //   { html, bad?, progress? (0..1, for press-and-hold) }, or null
  // `by` says whose it is ('boats'). Each feature has a cue of its own to
  // put up and take down, so taking yours down never takes down someone
  // else's, and nobody has to remember whether the one showing is theirs.
  // When more than one is up, the one put up last is the one said.
  cue(c, by = '') {
    if (c && c.html) this._cues.set(by, { ...c, n: ++this._cueN });
    else if (!this._cues.delete(by)) return; // (it wasn't up: nothing to redraw)
    this._showPrompt();
    this._showProgress();
  }

  // The cue being said: the last one put up of those still up.
  get _cue() {
    let top = null;
    for (const c of this._cues.values()) if (!top || c.n > top.n) top = c;
    return top;
  }

  _showPrompt() {
    if (!this.prompt) return;
    const { html, bad } = this._cue ? { html: this._cue.html, bad: !!this._cue.bad } : this._tool;
    const key = `${bad ? 1 : 0}${html}`;
    if (key === this._prompt) return;
    this._prompt = key;
    this.prompt.innerHTML = renameKeys(html, this._words);
    this.prompt.classList.toggle('bad', !!bad);
    this.prompt.classList.toggle('gone', !html);
  }

  nudgePrompt() {
    if (!this.prompt) return;
    this.prompt.classList.remove('nudge');
    void this.prompt.offsetWidth;
    this.prompt.classList.add('nudge');
  }

  setProgress(p) {
    this._tool.progress = p;
    this._showProgress();
  }

  _showProgress() {
    if (!this.progress) return;
    const p = this._cue ? (this._cue.progress ?? null) : this._tool.progress;
    const on = p !== null && p > 0;
    this.progress.classList.toggle('show', on);
    if (on) this.progressBar.style.width = `${Math.round(Math.min(1, p) * 100)}%`;
  }

  setInventory(text) {
    if (!this.inv || text === this._inv) return;
    this._inv = text;
    this.inv.textContent = text;
  }

  setDebug(text) {
    if (this.debug) this.debug.textContent = text;
  }
}
