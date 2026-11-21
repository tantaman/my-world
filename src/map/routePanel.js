// The routes tab lists destinations even when they're well outside the map
// window. Place and mark cards can also open a route directly.
import { formatDistance } from '../core/format.js';
import { glyphSvg, markLabel } from './marks.js';
import { planRoute, drawRoute } from './routes.js';

export class RoutePanel {
  constructor(map) {
    this.map = map;
    this.flights = () => ({});
    this.id = null;
    this.el = document.createElement('div');
    this.el.className = 'route-panel';
    this.el.innerHTML = `
      <section class="route-directory"><h3>Destinations</h3><div class="route-options"></div></section>
      <section class="route-detail" hidden>
        <button type="button" data-route="back">‹ Destinations</button>
        <h3>From your position</h3><h4></h4><p class="route-note"></p>
        <ol aria-label="Route directions"></ol>
        <button type="button" data-route="follow"></button>
        <button type="button" data-route="locate">Show on map</button>
      </section>`;
    this.directory = this.el.querySelector('.route-directory');
    this.detail = this.el.querySelector('.route-detail');
    this.list = this.detail.querySelector('ol');
    this.el.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.destination) return this.pick(b.dataset.destination);
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
    const options = this.el.querySelector('.route-options');
    options.replaceChildren();
    const { x, z } = this.map.player.pos;
    const places = this.map.places.destinations().sort((a, b) =>
      Number(a.kind === 'view') - Number(b.kind === 'view') ||
      Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z));
    const tracked = this.map.marks.trackedMark();
    if (tracked && !places.some((p) => p.id === tracked.id)) places.unshift(tracked);
    for (const place of places) {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.destination = place.id;
      b.innerHTML = (place.glyph ? glyphSvg(place.glyph) : '') + '<span><strong></strong><small></small></span>';
      b.querySelector('strong').textContent = markLabel(place);
      b.querySelector('small').textContent = [place.kind || 'mark', place.id === tracked?.id && 'tracking'].filter(Boolean).join(' · ');
      options.appendChild(b);
    }
    if (!places.length) options.textContent = 'Pick a place or mark on the map for directions.';
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
      this.list.replaceChildren(...legs.map(({ to }, i) => {
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
