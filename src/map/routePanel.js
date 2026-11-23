// The routes tab: where you could go, nearest first, as far down as you
// scroll. A row of chips picks one list (launch sites, video stores, ski...)
// or all of them; each is a stream (places.js around()) pulled a page at a
// time, a little each frame, as the end of the list comes into view. Place
// and mark cards can also open a route directly.
//
// Words in the search box over the chips narrow it to what they find
// (search.js), among your marks too and the places that are in no list.
// Something that isn't there would be looked for without end, so a search
// looks only so far round you, and further when you ask it to. Within that
// it lists all it finds, each source looked over at its own pace and each
// place put in its place by distance as it's found, so one that's slow to
// work out (the car dealerships) doesn't keep the rest from turning up.
import { formatDistance } from '../core/format.js';
import { ListNearest, FilterNearest } from '../core/nearest.js';
import { glyphSvg, markLabel, iconById } from './marks.js';
import { planRoute, drawRoute, bearing } from './routes.js';
import { matcher } from './search.js';

const PAGE = 24; // rows more each time the end of the list comes into view
const PULL_MS = 5; // ms a frame the list may spend looking further while it's open
const FIRST_MS = 30; // ...and when it's first shown, so it opens already filled in
const EVERYWHERE = ''; // the chip for every list at once
const SEARCH_REACH = 3000; // m round you a search looks at first...
const FURTHER = 2; // ...and how many times further each 'look further'

export class RoutePanel {
  constructor(map) {
    this.map = map;
    this.flights = () => ({});
    this.id = null;
    this.list = EVERYWHERE; // the chip picked
    this.query = ''; // what's in the search box
    this.reach = SEARCH_REACH; // how far round you it looks (m)
    this.stream = null; // what's in it, nearest first, still to list
    this.sought = []; // a search's streams, one a source...
    this.seeking = []; // ...and those still looking
    this.el = document.createElement('div');
    this.el.className = 'route-panel';
    this.el.innerHTML = `
      <section class="route-directory">
        <h3>Destinations</h3>
        <input class="route-search" type="search" placeholder="search: a name, a kind of place…" aria-label="Search destinations" autocomplete="off" spellcheck="false" />
        <div class="route-lists" role="group" aria-label="Kinds of place"></div>
        <div class="route-options"></div>
        <p class="route-more" aria-live="polite"></p>
        <button type="button" data-route="further" hidden>look further</button>
      </section>
      <section class="route-detail" hidden>
        <button type="button" data-route="back">‹ Destinations</button>
        <h3>From your position</h3><h4></h4><p class="route-note"></p>
        <ol aria-label="Route directions"></ol>
        <button type="button" data-route="follow"></button>
        <button type="button" data-route="locate">Show on map</button>
      </section>`;
    this.directory = this.el.querySelector('.route-directory');
    this.search = this.el.querySelector('.route-search');
    this.further = this.el.querySelector('[data-route="further"]');
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
    this.search.addEventListener('input', () => {
      this.query = this.search.value;
      this.reach = SEARCH_REACH;
      this.show();
    });
    // Enter goes to the first found; Escape clears the box before it closes
    // the map.
    this.search.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const first = this.options.querySelector('button');
        if (first) this.pick(first.dataset.destination);
      } else if (e.key === 'Escape' && this.search.value) {
        e.preventDefault();
        e.stopPropagation();
        this.search.value = '';
        this.search.dispatchEvent(new Event('input'));
      }
    });
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
        case 'further':
          this.reach *= FURTHER;
          this.show();
          this.search.focus({ preventScroll: true });
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
    const key = [this.list, this.query, this.reach, this.map.marks.tracked, Math.round(x), Math.round(z)].join(' ');
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
  // first, then the nearest. A search lists only what it finds, your marks
  // among it, nearest first, whatever you're tracking.
  restart() {
    const { x, z } = this.map.player.pos;
    this.from = { x, z };
    this.listed = new Set();
    this.count = 0;
    this.want = PAGE;
    this.options.replaceChildren();
    this.further.hidden = true;
    const match = matcher(this.query);
    this.searching = !!match;
    if (match) {
      this.stream = null;
      const marks = this.list ? [] : this.map.marks.list();
      const isMark = (m) => match(m, 'mark', iconById(m.icon).label);
      this.sought = [...this.map.places.search(x, z, match, this.list || null, this.reach), new FilterNearest(new ListNearest(x, z, marks), isMark)];
      this.seeking = this.sought.slice();
      return this.seek(FIRST_MS);
    }
    this.stream = this.map.places.around(x, z, this.list || null);
    const tracked = this.map.marks.trackedMark();
    if (tracked) this.addRow(tracked, Math.hypot(tracked.x - x, tracked.z - z), true);
    this.pull(FIRST_MS);
  }

  addRow(place, d, pinned = false) {
    if (this.listed.has(place.id)) return;
    this.listed.add(place.id);
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.destination = place.id;
    b.innerHTML = (place.glyph ? glyphSvg(place.glyph) : '') + '<span><strong></strong><small></small></span>';
    b.querySelector('strong').textContent = markLabel(place);
    const far = d < 8 ? 'here' : `${formatDistance(d)} ${bearing(this.from, place)}`;
    const tracking = place.id === this.map.marks.tracked && 'tracking';
    b.querySelector('small').textContent = [place.kind || 'mark', far, tracking].filter(Boolean).join(' · ');
    // a search's finds come out of order: each goes in by its distance
    b.dataset.d = d;
    let after = this.options.lastElementChild;
    if (this.searching) while (after && Number(after.dataset.d) > d) after = after.previousElementSibling;
    this.options.insertBefore(b, after ? after.nextSibling : this.options.firstChild);
    if (!pinned) this.count++;
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

  // Search on, for as long as `ms`: each source in turn as far as it can go
  // without waiting, what it finds listed straight away.
  seek(ms) {
    const t0 = performance.now();
    for (let going = true; going && this.seeking.length && performance.now() - t0 < ms; ) {
      going = false; // ...until all are waiting on their owners, or done
      for (const s of this.seeking.slice()) {
        while (s.ready) {
          const { place, d } = s.take();
          this.addRow(place, d);
        }
        const state = s.work();
        if (state === 'done' && !s.ready) this.seeking.splice(this.seeking.indexOf(s), 1);
        else if (state === 'more' || s.ready) going = true;
      }
    }
    this.saySought();
  }

  // How far a search has got, under what it's found so far.
  saySought() {
    if (this.seeking.length) {
      this.more.textContent = `still looking, within ${formatDistance(this.reach)}…`;
      return;
    }
    const cut = this.sought.some((s) => s.cut);
    this.further.hidden = !cut;
    const what = `“${this.query.trim()}”` + (this.list ? ` in ${this.list}` : '');
    const within = cut ? ` within ${formatDistance(this.reach)}` : '';
    this.more.textContent = this.count ? (cut ? `Nothing more${within}.` : '') : `Nothing matching ${what}${within}.`;
  }

  // Each frame the routes tab is showing.
  update() {
    if (!this.detail.hidden) return;
    if (this.searching) {
      if (this.seeking.length) this.seek(PULL_MS);
      return;
    }
    if (!this.stream) return;
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
