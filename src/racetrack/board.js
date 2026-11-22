// The race on the screen.
//
// The card, at the top while you race: the five lights while they come on
// (and go out), then the lap you're on, where you're running, the race's
// time and your best lap; and at the end, where everyone came, with their
// times. The gauge, bottom left: how fast, and in which gear. A little map
// of the circuit, top right, with a dot for each car.

import './racetrack.css';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const ORDINAL = (n) => `${n}${n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'}`;

// 83.456 -> '1:23.4'
export function clock(s) {
  if (s === null || s === undefined || !Number.isFinite(s)) return '–';
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return `${m}:${r < 10 ? '0' : ''}${r.toFixed(1)}`;
}
export const ordinal = ORDINAL;

const MAP = 132; // px, the little map's size

export class Board {
  // parent: where it goes (#hud)
  constructor(parent) {
    const el = document.createElement('div');
    el.id = 'race';
    el.hidden = true;
    el.setAttribute('aria-live', 'polite');
    el.innerHTML = '<div class="head"><span class="title"></span><span class="pos"></span></div><div class="lights"></div><div class="line"></div><ol class="results"></ol>';
    parent.appendChild(el);
    this.el = el;
    this.title = el.querySelector('.title');
    this.pos = el.querySelector('.pos');
    this.lights = el.querySelector('.lights');
    this.line = el.querySelector('.line');
    this.results = el.querySelector('.results');
    this.lights.innerHTML = '<span></span>'.repeat(5);
    this.lamps = [...this.lights.children];

    const gauge = document.createElement('div');
    gauge.id = 'race-gauge';
    gauge.hidden = true;
    gauge.innerHTML = '<b class="kmh"></b><span class="unit">km/h</span><span class="gear"></span>';
    parent.appendChild(gauge);
    this.gauge = gauge;
    this.kmh = gauge.querySelector('.kmh');
    this.gearEl = gauge.querySelector('.gear');

    const map = document.createElement('canvas');
    map.id = 'race-map';
    map.hidden = true;
    map.width = map.height = MAP * 2;
    parent.appendChild(map);
    this.map = map;
    this._key = '';
    this._speed = '';
    this._outline = null;
  }

  // What the card says. race: the Race (null hides everything); name: the
  // track's; best: your best lap here, or null.
  show(race, name, best) {
    if (!race) return this.hide();
    this.el.hidden = false;
    const y = race.you;
    const lights = race.state === 'lights';
    const done = y.finished !== null;
    const key = JSON.stringify([race.state, race.lit, y.laps, race.position, Math.floor(race.time * 10), best, done]);
    if (key === this._key) return;
    this._key = key;
    this.title.textContent = name;
    this.el.classList.toggle('done', done);
    this.lights.hidden = !lights;
    this.lamps.forEach((l, i) => l.classList.toggle('on', lights && i < race.lit));
    const n = race.cars.length;
    if (lights) {
      this.pos.textContent = `${ORDINAL(race.position)} of ${n} on the grid`;
      this.line.innerHTML = race.lit < 5 ? 'wait for the lights to go out' : '<b>…</b>';
      this.results.hidden = true;
      return;
    }
    if (!done) {
      this.pos.innerHTML = `<b>${ORDINAL(race.position)}</b> of ${n}`;
      const lap = Math.min(race.laps, y.laps + 1);
      this.line.innerHTML = `lap <b>${lap}</b> of ${race.laps} · ${clock(race.time)}${y.last !== null ? ` · last ${clock(y.last)}` : ''}${best !== null ? ` · best here ${clock(best)}` : ''}`;
      this.results.hidden = true;
      return;
    }
    // over: where everyone came
    this.pos.innerHTML = `<b>${ORDINAL(y.place)}</b> of ${n}`;
    this.line.innerHTML = `${y.place === 1 ? '<b>you won!</b> · ' : ''}${clock(y.finished)} · your best lap ${clock(y.best)}${best !== null && y.best !== null && y.best <= best ? ' · <b>the best here yet</b>' : ''}`;
    this.results.hidden = false;
    this.results.innerHTML = race
      .standings()
      .map((car) => `<li class="${car.you ? 'you' : ''}"><span class="who"><span class="num" style="--c:#${(car.colour ?? 0xd8302a).toString(16).padStart(6, '0')}">${car.number}</span>${esc(car.name)}</span><span class="t">${car.finished !== null ? clock(car.finished) : `${race.laps - car.laps} to go`}</span></li>`)
      .join('');
  }

  // How fast you're going, and in which gear.
  speed(kmh, gear) {
    const text = `${Math.round(kmh)}|${gear}`;
    this.gauge.hidden = false;
    if (text === this._speed) return;
    this._speed = text;
    this.kmh.textContent = String(Math.round(kmh));
    this.gearEl.textContent = gear;
  }

  // The little map: the circuit's line (pts: [[x, z]...] in the track's
  // frame) and the cars on it ([{ x, z, you, colour }], yours first), turned so the way
  // you're heading (yaw, in the track's frame) is up and your right is right.
  drawMap(pts, cars, yaw) {
    const cv = this.map;
    cv.hidden = false;
    const ctx = cv.getContext('2d');
    const W = cv.width;
    if (!this._outline || this._outline.pts !== pts) {
      let r = 0;
      for (const [x, z] of pts) r = Math.max(r, Math.hypot(x, z));
      this._outline = { pts, scale: (W * 0.44) / r };
    }
    const k = this._outline.scale;
    const c = Math.cos(yaw);
    const n = Math.sin(yaw);
    // along your right (-cos, sin) across, and down the screen against the way you're going
    const sx = (x, z) => W / 2 + (-x * c + z * n) * k;
    const sy = (x, z) => W / 2 - (x * n + z * c) * k;
    ctx.clearRect(0, 0, W, W);
    ctx.lineJoin = 'round';
    const trace = () => {
      ctx.beginPath();
      pts.forEach(([x, z], i) => (i ? ctx.lineTo(sx(x, z), sy(x, z)) : ctx.moveTo(sx(x, z), sy(x, z))));
      ctx.closePath();
    };
    ctx.strokeStyle = 'rgba(12, 18, 13, 0.7)';
    ctx.lineWidth = 12;
    trace();
    ctx.stroke();
    ctx.strokeStyle = 'rgba(238, 240, 226, 0.75)';
    ctx.lineWidth = 5;
    trace();
    ctx.stroke();
    // (yours last, over theirs)
    for (let i = cars.length - 1; i >= 0; i--) {
      const car = cars[i];
      ctx.fillStyle = car.you ? '#ffffff' : `#${car.colour.toString(16).padStart(6, '0')}`;
      ctx.strokeStyle = car.you ? '#d8302a' : 'rgba(0,0,0,0.6)';
      ctx.lineWidth = car.you ? 4 : 2;
      ctx.beginPath();
      ctx.arc(sx(car.x, car.z), sy(car.x, car.z), car.you ? 8 : 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }

  hide() {
    if (!this.el.hidden) this.el.hidden = true;
    this.gauge.hidden = true;
    this.map.hidden = true;
    this._key = '';
    this._speed = '';
  }
}
