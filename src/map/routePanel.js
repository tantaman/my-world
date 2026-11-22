// The routes tab: where you could go, nearest first, as far down as you
// scroll. A row of chips picks one list (launch sites, video stores, ski...)
// or all of them; each is a stream (places.js around()) pulled a page at a
// time, a little each frame, as the end of the list comes into view. Place
// and mark cards can also open a route directly.
import { formatDistance } from '../core/format.js';
import { glyphSvg, markLabel } from './marks.js';
import { planRoute, drawRoute, bearing } from './routes.js';

const PAGE = 24; // rows more each time the end of the list comes into view
const PULL_MS = 5; // ms a frame the list may spend looking further while it's open
const FIRST_MS = 30; // ...and when it's first shown, so it opens already filled in
const EVERYWHERE = ''; // the chip for every list at once

export class RoutePanel {
  constructor(map) {
    this.map = map;
    this.flights = () => ({});
    this.id = null;
    this.list = EVERYWHERE; // the chip picked
    this.stream = null; // what's in it, nearest first, still to list
    this.el = document.createElement('div');
    this.el.className = 'route-panel';
    this.el.innerHTML = `
      <section class="route-directory">
        <h3>Destinations</h3>
        <div class="route-lists" role="group" aria-label="Kinds of place"></div>
        <div class="route-options"></div>
        <p class="route-more" aria-live="polite"></p>
      </section>
      <section class="route-detail" hidden>
        <button type="button" data-route="back">‹ Destinations</button>
        <h3>From your position</h3><h4></h4><p class="route-note"></p>
        <ol aria-label="Route directions"></ol>
        <button type="button" data-route="follow"></button>
        <button type="button" data-route="locate">Show on map</button>
      </section>`;
    this.directory = this.el.querySelector('.route-directory');
    this.chips = this.el.querySelector('.route-lists');
    this.options = this.el.querySelector('.route-options');
    this.more = this.el.querySelector('.route-more');
    this.detail = this.el.querySelector('.route-detail');
    this.steps = this.detail.querySelector('ol');
    // Scrolled (or tabbed) to the end of the list: a page more, and more
    // again for as long as the end is still in view (update()).
    this.atEnd = false;
    if (typeof IntersectionObserver === 'function') {
      new IntersectionObserver((seen) => {
        for (const e of seen) this.atEnd = e.isIntersecting;
      }).observe(this.more);
    }
    this.el.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.destination) return this.pick(b.dataset.destination);
      if (b.dataset.list !== undefined) {
        this.list = b.dataset.list;
        return this.show();
      }
      if (b.dataset.airfield) {
        const field = map.places.get(b.dataset.airfield);
        if (field) map.showOnMap(field, true);
        return;
      }
      const p = this.destination();
      switch (b.dataset.route) {
        case 'back': {
          const previous = this.id;
          this.id = null;
          this.show();
          const choices = this.directory.querySelectorAll('button');
          const button = [...choices].find((b) => b.dataset.destination === previous) || choices[0];
          button?.focus({ preventScroll: true });
          return;
        }
        case 'locate':
          if (p) map.showOnMap(p, true);
          return;
        case 'follow':
          if (!p) return;
          if (map.marks.routing && map.marks.tracked === p.id) {
            map.marks.setTracked(null);
            return this.refresh();
          }
          map.marks.setTracked(p.id, true);
          return map.close();
      }
    });
    map.addTab({ id: 'routes', label: 'routes', el: this.el, shown: () => this.show() });
  }

  destination() {
    return this.id && (this.map.marks.get(this.id) || this.map.places.get(this.id));
  }

  pick(id) {
    this.id = id;
    this.map.closePlace();
    this.map.closeEditor();
    this.map.open('routes');
    const p = this.destination();
    if (p) {
      this.map.previewRoute(p);
      this.detail.querySelector('[data-route="follow"]').focus({ preventScroll: true });
    }
  }

  show() {
    const p = this.destination();
    this.directory.hidden = !!p;
    this.detail.hidden = !p;
    if (p) return this.refresh();
    this.id = null;
    this.showChips();
    // Back from a route to the same list, from the same spot, keeps it
    // where it was scrolled to.
    const { x, z } = this.map.player.pos;
    const key = [this.list, this.map.marks.tracked, Math.round(x), Math.round(z)].join(' ');
    if (key !== this.listedFor) this.restart();
    this.listedFor = key;
  }

  showChips() {
    const lists = this.map.places.lists();
    if (this.list !== EVERYWHERE && !lists.includes(this.list)) this.list = EVERYWHERE;
    this.chips.replaceChildren(...[EVERYWHERE, ...lists].map((list) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.list = list;
      b.textContent = list || 'everywhere';
      b.setAttribute('aria-pressed', String(list === this.list));
      return b;
    }));
  }

  // The list from the top, from where you are now: what you're tracking
  // first, then the nearest.
  restart() {
    const { x, z } = this.map.player.pos;
    this.from = { x, z };
    this.stream = this.map.places.around(x, z, this.list || null);
    this.listed = new Set();
    this.count = 0;
    this.want = PAGE;
    this.options.replaceChildren();
    const tracked = this.map.marks.trackedMark();
    if (tracked) this.addRow(tracked, Math.hypot(tracked.x - x, tracked.z - z), true);
    this.pull(FIRST_MS);
  }

  addRow(place, d, tracked = false) {
    if (this.listed.has(place.id)) return;
    this.listed.add(place.id);
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.destination = place.id;
    b.innerHTML = (place.glyph ? glyphSvg(place.glyph) : '') + '<span><strong></strong><small></small></span>';
    b.querySelector('strong').textContent = markLabel(place);
    const far = d < 8 ? 'here' : `${formatDistance(d)} ${bearing(this.from, place)}`;
    b.querySelector('small').textContent = [place.kind || 'mark', far, tracked && 'tracking'].filter(Boolean).join(' · ');
    this.options.appendChild(b);
    if (!tracked) this.count++;
  }

  // List more, for as long as `ms`, until a page is filled or it has to
  // wait for something to be worked out.
  pull(ms) {
    const s = this.stream;
    if (!s) return;
    const t0 = performance.now();
    let state = 'more';
    while (this.count < this.want) {
      if (s.ready) {
        const { place, d } = s.take();
        this.addRow(place, d);
        continue;
      }
      state = s.work();
      if (state === 'done' && !s.ready) break;
      if (state === 'wait' || performance.now() - t0 > ms) break;
    }
    const finished = state === 'done' && !s.ready;
    if (finished) this.stream = null;
    this.more.textContent = finished
      ? this.count ? '' : this.list ? `No ${this.list} anywhere near.` : 'Pick a place or mark on the map for directions.'
      : this.count < this.want ? 'looking further…' : '';
  }

  // Each frame the routes tab is showing.
  update() {
    if (!this.detail.hidden || !this.stream) return;
    if (this.atEnd && this.count >= this.want) this.want = this.count + PAGE;
    if (this.count < this.want) this.pull(PULL_MS);
  }

  // A plain tracked pin keeps its direct bearing. Only route previews and
  // explicitly followed itineraries use the transport network.
  legs(p, route) {
    return planRoute(this.map.player.pos, p, route ? this.flights() : undefined);
  }

  refresh() {
    const p = this.destination();
    if (!p) {
      if (this.id) this.show();
      return;
    }
    this.detail.querySelector('h4').textContent = markLabel(p);
    this.detail.querySelector('.route-note').textContent = p.note || '';
    const flights = this.flights();
    const legs = planRoute(this.map.player.pos, p, flights);
    const steps = legs.map(({ mode, to, distance, bearing }) => {
      const name = markLabel(to);
      if (mode === 'survey') return 'Checking airfields for this trip…';
      if (mode === 'flight' && to.id === flights.landing?.id) return `Stay aboard to ${name}.`;
      if (mode === 'flight') return `Fly to ${name} · ${formatDistance(distance)}. Choose this airfield in Flights.`;
      if (distance < 8) return `You're at ${name}.`;
      return `Head ${bearing} to ${name} · ${formatDistance(distance)} direct.`;
    });
    // Keep the waypoint buttons (and keyboard focus) while the route holds.
    const key = JSON.stringify(legs.map(({ to }, i) => [to.id, steps[i]]));
    if (this.stepsKey !== key) {
      this.stepsKey = key;
      this.steps.replaceChildren(...legs.map(({ to }, i) => {
        const li = document.createElement('li');
        li.append(steps[i]);
        if (to.id !== p.id) {
          const b = document.createElement('button');
          b.type = 'button';
          b.dataset.airfield = to.id;
          b.textContent = 'Locate airfield';
          b.setAttribute('aria-label', `Show ${to.name} on map`);
          li.appendChild(b);
        }
        return li;
      }));
    }
    this.detail.querySelector('[data-route="follow"]').textContent = this.map.marks.routing && this.map.marks.tracked === p.id ? 'Stop guidance' : 'Follow route';
  }

  guide() {
    const p = this.map.marks.trackedMark();
    if (!p) return null;
    const { mode, to } = this.legs(p, this.map.marks.routing)[0];
    const label = mode === 'flight' ? `Flights · ${to.name}` : markLabel(to);
    return { id: to.id, x: to.x, z: to.z, color: p.color, label };
  }

  draw() {
    const preview = this.map.tab === 'routes' && this.destination();
    const p = preview || this.map.marks.trackedMark();
    if (p) drawRoute(this.map.pen, this.legs(p, preview || this.map.marks.routing), p.color);
  }
}
