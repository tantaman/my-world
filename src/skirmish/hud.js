// What's on the screen in the town, in place of the forest's HUD.
//
//   the middle    a crosshair that opens as your aim loosens (running,
//                 firing, in the air), or the long rifle's sight; the name
//                 of whoever you're looking at; big words when a round
//                 turns
//   the top       the clock (the fuse, once the charge is set), the score,
//                 and a pip for each fighter still standing
//   top left      the radar: the town from above, your side as dots, the
//                 other side while one of you can see them, the charge
//   top right     who got whom, and with what
//   the bottom    your health and vest, your money, what's in your hands
//                 and the rounds left in it, what else you carry
//   on a key      the shop (B, at home, while a round is young) and the
//                 scores (Tab)
//
// It reads the match (match.js) and draws; it changes nothing.
//
//   const hud = new SkirmishHud();
//   hud.show(on) · hud.say(html, ms, kind) · hud.feed(html) · hud.ouch()
//   hud.update(match, { watch, seen, blind, smoke, cue }) each frame in the town
//   hud.shop(match | null) · hud.scores(match | null, footer)
//
// Emits:
//   'buy'    (item)   something in the shop was clicked, or pressed

import { Emitter } from '../core/events.js';
import { BOXES, SITES, BOUNDS } from './town.js';
import { GUNS, GRENADES, SHOP, itemName, quote, spreadOf } from './arms.js';
import { SIDES } from './rounds.js';
import { SIDE_COLOURS } from './figures.js';
import { kindOf } from './look.js';
import './skirmish.css';

const FEED_FOR = 6000; // ms a line of the feed stays up
const FEED_MOST = 6;
const RADAR = 176; // px
const VIEW = 1.22; // rad the view takes in, top to bottom: for how far apart the crosshair opens
export const SHOP_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-'];

export const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const clock = (s) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, '0')}`;
// A fighter's name in their side's colour.
export const named = (match, f) => `<b style="color:${SIDE_COLOURS[match.sideOf(f)].css}">${esc(f.name)}</b>`;
const HOW = { knife: 'knife', frag: 'grenade', charge: 'the charge' };
export const howName = (how) => HOW[how] || (GUNS[how] ? GUNS[how].name.split(' ')[0] : esc(how));

export class SkirmishHud extends Emitter {
  constructor() {
    super();
    const el = (this.el = document.createElement('div'));
    el.id = 'skirmish';
    el.hidden = true;
    el.innerHTML = `
      <div class="veil"></div><div class="blind"></div><div class="hurt"></div>
      <div class="scope" hidden><i></i></div>
      <div class="cross"><i></i><i></i><i></i><i></i><u></u></div>
      <canvas class="radar" width="${RADAR}" height="${RADAR}"></canvas>
      <div class="top">
        <div class="pips attack"></div><b class="score attack">0</b>
        <span class="mid"><b class="clock">0:00</b><small class="round"></small></span>
        <b class="score defend">0</b><div class="pips defend"></div>
      </div>
      <div class="feed"></div>
      <div class="aimed"></div>
      <div class="watching"></div>
      <div class="cue"></div>
      <div class="bar" hidden><i></i></div>
      <div class="cash"></div>
      <div class="stat health"><span class="icon">+</span><b>100</b></div>
      <div class="stat armor"><span class="icon">◈</span><b>0</b></div>
      <div class="stat ammo"><b></b><small></small></div>
      <div class="gun"></div>
      <div class="belt"></div>
      <div class="big"></div>
      <div class="shop" hidden role="dialog" aria-label="Buy"></div>
      <div class="scores" hidden></div>`;
    document.body.appendChild(el);
    const q = (s) => el.querySelector(s);
    this.q = q;
    this.cross = q('.cross');
    this.scope = q('.scope');
    this.radar = q('.radar').getContext('2d');
    this.bigEl = q('.big');
    this.feedEl = q('.feed');
    this.shopEl = q('.shop');
    this.scoresEl = q('.scores');
    this.shopEl.addEventListener('click', (e) => {
      const b = e.target.closest('[data-item]');
      if (b) this.emit('buy', b.dataset.item);
    });
    this.hurt = q('.hurt');
    this.plan = radarPlan();
    this._last = {};
    this._bigTimer = 0;
    this.shopOpen = false;
  }

  show(on) {
    this.el.hidden = !on;
    if (!on) {
      this.feedEl.textContent = '';
      this.shop(null);
      this.scores(null);
      this.quiet();
    }
  }

  // A big word in the middle of the screen, for ms (0: until the next).
  say(html, ms = 2200, kind = '') {
    this.bigEl.innerHTML = html;
    this.bigEl.className = `big show ${kind}`;
    clearTimeout(this._bigTimer);
    if (ms > 0) this._bigTimer = setTimeout(() => this.bigEl.classList.remove('show'), ms);
  }

  quiet() {
    clearTimeout(this._bigTimer);
    this.bigEl.classList.remove('show');
  }

  // A line in the feed at the top right.
  feed(html) {
    const line = document.createElement('div');
    line.innerHTML = html;
    this.feedEl.appendChild(line);
    while (this.feedEl.children.length > FEED_MOST) this.feedEl.firstChild.remove();
    setTimeout(() => line.remove(), FEED_FOR);
  }

  // The red at the edges of being hit.
  ouch() {
    this.hurt.classList.remove('on');
    void this.hurt.offsetWidth;
    this.hurt.classList.add('on');
  }

  _set(key, el, text, html = false) {
    if (this._last[key] === text) return;
    this._last[key] = text;
    if (html) el.innerHTML = text;
    else el.textContent = text;
  }

  // view: { watch: who you're watching once down (or null), seen: Map of the
  // other side's ids -> when one of you last saw them (match.time), blind and
  // smoke: 0..1, cue: what a key would do here (html), aimed: who's under
  // the crosshair (a fighter or null) }
  update(match, view) {
    const q = this.q;
    const R = match.rounds;
    const me = match.mine;
    const who = me && me.alive ? me : view.watch; // whose numbers are shown
    const set = (key, sel, text, html) => this._set(key, q(sel), text, html);

    // ── The top ──
    const attackers = R.attackers;
    set('clock', '.clock', R.phase === 'ended' ? '' : clock(Math.ceil(R.left)));
    q('.clock').classList.toggle('fuse', R.phase === 'planted');
    set('round', '.round', R.phase === 'freeze' ? `round ${R.round} · buy` : R.phase === 'planted' ? 'the charge is set' : `round ${R.round}`);
    set('sa', '.score.attack', String(R.score[attackers]));
    set('sd', '.score.defend', String(R.score[1 - attackers]));
    for (const side of ['attack', 'defend']) {
      const team = match.fighters.filter((f) => match.sideOf(f) === side);
      set(`pips-${side}`, `.pips.${side}`, team.map((f) => `<i class="${f.alive ? '' : 'down'}${f === me ? ' me' : ''}"></i>`).join(''), true);
    }

    // ── The bottom: whoever's numbers these are ──
    const mineSide = me ? match.sideOf(me) : 'attack';
    this.el.dataset.side = mineSide;
    if (who) {
      const gun = match.gunOf(who);
      const a = gun && who.ammo[gun.id];
      set('hp', '.health b', String(Math.max(0, who.hp)));
      q('.health').classList.toggle('low', who.hp <= 25);
      set('armor', '.armor b', `${who.kit.armor}${who.kit.helmet ? ' ⛑' : ''}`);
      q('.armor').hidden = who.kit.armor <= 0;
      set('ammo', '.ammo b', a ? String(a.mag) : '');
      set('spare', '.ammo small', a ? `/ ${a.spare}` : '');
      q('.ammo').classList.toggle('low', !!a && a.mag <= gun.mag * 0.25);
      const kind = kindOf(who);
      set('gun', '.gun', who.reloading > 0 && who === me ? 'reloading…' : GUNS[kind] ? GUNS[kind].name : GRENADES[kind] ? GRENADES[kind].name : 'the charge');
      set('cash', '.cash', who === me || (me && who.team === me.team) ? `$${who.cash}` : '');
      const belt = [];
      const slot = (key, label, held) => belt.push(`<span class="${held ? 'held' : ''}"><kbd>${key}</kbd>${esc(label)}</span>`);
      if (who.kit.main) slot(1, GUNS[who.kit.main].name, who.held === 'main');
      if (who.kit.side) slot(2, GUNS[who.kit.side].name, who.held === 'side');
      slot(3, 'knife', who.held === 'knife');
      for (const n of ['frag', 'flash', 'smoke']) if (who.kit[n] > 0) slot(4, GRENADES[n].name, who.held === n);
      if (who.charge) slot(5, 'the charge', who.held === 'charge');
      if (who.kit.kit) belt.push('<span>fuse kit</span>');
      set('belt', '.belt', belt.join(''), true);
    }
    q('.stat.health').hidden = q('.stat.ammo').hidden = q('.gun').hidden = q('.belt').hidden = q('.cash').hidden = !who;
    if (!who) q('.armor').hidden = true;

    // ── The middle ──
    const first = !!me && me.alive;
    const gun = first ? match.gunOf(me) : null;
    const sighted = first && me.sighted && gun && gun.zoom;
    this.scope.hidden = !sighted;
    this.cross.hidden = !first || !!sighted || this.shopOpen;
    if (first && gun && !sighted) {
      const b = me.body;
      const stray = gun.slot === 'knife' ? 0.004 : spreadOf(gun, { pace: Math.hypot(b.vel.x, b.vel.z) / gun.pace, air: !b.grounded, ducked: b.crouch > 0.5, bloom: me.bloom });
      const gap = Math.round(Math.min(60, 3 + (stray * innerHeight) / VIEW));
      if (this._last.gap !== gap) {
        this._last.gap = gap;
        this.cross.style.setProperty('--gap', `${gap}px`);
      }
    }
    set('aimed', '.aimed', view.aimed ? named(match, view.aimed) + (view.aimed.team === (me && me.team) ? ` <small>${view.aimed.hp}</small>` : '') : '', true);
    set('watching', '.watching', !first && view.watch ? `watching ${named(match, view.watch)} <small>click for the next</small>` : '', true);
    set('cue', '.cue', view.cue || '', true);
    // setting the charge, or pulling it
    const doing = who && who.planting > 0 ? who.planting / R.rules.plant : who && who.defusing > 0 ? who.defusing / (who.kit.kit ? R.rules.kitDefuse : R.rules.defuse) : -1;
    q('.bar').hidden = doing < 0;
    if (doing >= 0) q('.bar i').style.width = `${Math.min(100, doing * 100).toFixed(1)}%`;
    q('.blind').style.opacity = view.blind > 0.01 ? Math.min(1, view.blind).toFixed(2) : '0';
    q('.veil').style.opacity = view.smoke > 0.01 ? view.smoke.toFixed(2) : '0';

    this._radar(match, me, view);
    if (this.shopOpen) this._shop(match);
  }

  // The town from above, north up: your side, the other side where seen,
  // the charge.
  _radar(match, me, view) {
    const g = this.radar;
    g.clearRect(0, 0, RADAR, RADAR);
    g.drawImage(this.plan, 0, 0);
    const side = me ? match.sideOf(me) : 'attack';
    const c = match.charge;
    const blink = Math.floor(match.time * 3) % 2 === 0;
    if (c.state === 'planted' || (c.state === 'dropped' && side === 'attack')) {
      g.fillStyle = c.state === 'planted' ? (blink ? '#ff4030' : '#7a1a10') : '#ffd040';
      const [x, y] = toRadar(c.x, c.z);
      g.fillRect(x - 3, y - 3, 6, 6);
    }
    for (const f of match.fighters) {
      if (!f.alive) continue;
      const friend = me ? f.team === me.team : match.sideOf(f) === side;
      if (!friend) {
        const at = view.seen && view.seen.get(f.id);
        if (at === undefined || match.time - at > 1.6) continue;
      }
      const [x, y] = toRadar(f.body.pos.x, f.body.pos.z);
      g.fillStyle = friend ? SIDE_COLOURS[match.sideOf(f)].css : '#ff5040';
      if (f === me || (!me && f === view.watch) || (me && !me.alive && f === view.watch)) {
        // an arrow, the way they face
        g.save();
        g.translate(x, y);
        g.rotate(-f.yaw);
        g.fillStyle = '#fff';
        g.beginPath();
        g.moveTo(0, -6);
        g.lineTo(4, 4);
        g.lineTo(0, 2);
        g.lineTo(-4, 4);
        g.closePath();
        g.fill();
        g.restore();
        continue;
      }
      g.beginPath();
      g.arc(x, y, f.charge && friend ? 4 : 3, 0, Math.PI * 2);
      g.fill();
      if (f.charge && friend) {
        g.fillStyle = '#ffd040';
        g.fillRect(x - 1.5, y - 1.5, 3, 3);
      }
    }
  }

  // ── The shop ──────────────────────────────────────────────────────────────

  // Open it on what `match` has you able to buy, or put it away (null).
  shop(match) {
    this.shopOpen = !!match;
    this.shopEl.hidden = !match;
    this._last.shop = '';
    if (match) this._shop(match);
  }

  _shop(match) {
    const me = match.mine;
    if (!me) return;
    const side = match.sideOf(me);
    const rows = SHOP.map((item, i) => {
      const q = quote(me.kit, me.cash, side, item);
      const price = q.price ?? (GUNS[item] || GRENADES[item] || { price: 0 }).price ?? '';
      return `<button type="button" data-item="${item}" class="${q.no ? 'no' : ''}" ${q.no ? 'aria-disabled="true"' : ''}><kbd>${SHOP_KEYS[i]}</kbd><span>${esc(itemName(item))}</span><small>${q.no && q.no !== 'not enough money' ? esc(q.no) : ''}</small><b>${price ? `$${price}` : ''}</b></button>`;
    }).join('');
    const html = `<h2>buy <small>$${me.cash}</small></h2>${rows}<p>press its number · <b>B</b> to put this away</p>`;
    if (html === this._last.shop) return;
    this._last.shop = html;
    this.shopEl.innerHTML = html;
  }

  // ── The scores ────────────────────────────────────────────────────────────

  // Both sides, best first (or null to put them away).
  scores(match, footer = '') {
    if (!match) {
      this.scoresEl.hidden = true;
      this._last.scores = '';
      return;
    }
    const R = match.rounds;
    const me = match.mine;
    const table = (side) => {
      const team = match.fighters.filter((f) => match.sideOf(f) === side).sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
      const rows = team
        .map((f) => `<tr class="${f === me ? 'me' : ''}${f.alive ? '' : ' down'}"><td>${named(match, f)}${f.owner ? '' : ' <small>bot</small>'}</td><td>${f.kills}</td><td>${f.deaths}</td><td>${f.assists}</td><td>${me && f.team === me.team ? `$${f.cash}` : ''}</td></tr>`)
        .join('');
      return `<table class="${side}"><tr><th>${SIDES[side]} · ${R.score[R.teamOf(side)]}</th><th>kills</th><th>deaths</th><th>assists</th><th></th></tr>${rows}</table>`;
    };
    let head = `round ${R.round} · first to ${R.rules.win}`;
    if (R.phase === 'ended') head = R.winner === null ? 'all square' : `${SIDES[R.sideOf(R.winner)]} take the match`;
    const html = `<h2>${head}</h2>${table('attack')}${table('defend')}<p>${footer}</p>`;
    if (html !== this._last.scores) {
      this._last.scores = html;
      this.scoresEl.innerHTML = html;
    }
    this.scoresEl.hidden = false;
  }

  dispose() {
    this.el.remove();
  }
}

// Where a place in the town is on the radar (px), north up.
function toRadar(x, z) {
  const k = RADAR / (BOUNDS.x1 - BOUNDS.x0 + 4);
  return [RADAR / 2 + x * k, RADAR / 2 + z * k];
}

// The town from above, drawn once: what's too tall to see over, darker;
// what's low, fainter; a letter at each site.
function radarPlan() {
  const c = document.createElement('canvas');
  c.width = c.height = RADAR;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(214, 192, 150, 0.62)';
  g.fillRect(0, 0, RADAR, RADAR);
  for (const b of BOXES) {
    if (b.look === 'ground' || b.look === 'roof' || b.look === 'palm') continue;
    const tall = b.y1 > 2.2;
    g.fillStyle = tall ? 'rgba(52, 44, 34, 0.85)' : b.y1 > 0.6 ? 'rgba(92, 78, 58, 0.7)' : 'rgba(150, 130, 100, 0.6)';
    const [x0, y0] = toRadar(b.x0, b.z0);
    const [x1, y1] = toRadar(b.x1, b.z1);
    g.fillRect(x0, y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0));
  }
  g.font = 'bold 15px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = 'rgba(170, 40, 26, 0.9)';
  for (const s of SITES) {
    const [x, y] = toRadar((s.zone[0] + s.zone[2]) / 2, (s.zone[1] + s.zone[3]) / 2);
    g.fillText(s.id, x, y);
  }
  return c;
}
