// The map (M), and the marks you leave on it: listed beside the map, tracked
// on the HUD, and standing in the world as pennants. Other features put
// places on it too, through map.places (places.js).

import { MarkStore, marksSave, markLabel } from './marks.js';
import { MapView } from './mapView.js';
import { Markers } from './markers.js';
import { Places } from './places.js';
import { SHARED } from '../render/uniforms.js';

const PREFETCH_EVERY = 2000; // ms between checks
const PREFETCH_AFTER = 120; // metres walked before the map is drawn afresh around you

// The features this uses, so it is installed after them (game/features.js).
export const after = ['render', 'ui', 'world', 'player'];
export function installMap(game) {
  const { scene, chunks, player, input, hud, commands, save, structures, gen } = game;

  const marks = new MarkStore();
  const markers = new Markers(scene, (x, z) => chunks.heightAt(x, z));
  marks.subscribe(() => markers.sync(marks.list()));
  // Places other features put on the map (an old cabin, a dock): see places.js.
  const places = new Places();
  marks.findPlace = (id) => places.get(id);
  const map = new MapView({ seed: gen.seed, land: gen.land, structures, hikes: gen.hikes, marks, player, input, places });
  game.provide('marks', marks);
  game.provide('map', map);

  // Marks are part of the world; which one you're following is yours.
  save.register({ ...marksSave, collect: () => marks.list(), restore: (list) => marks.load(list) });
  save.register({
    id: 'tracked',
    scope: 'yours',
    local: 'marks',
    collect: () => marks.tracked,
    restore: (id) => marks.setTracked(typeof id === 'string' ? id : null),
  });
  marks.subscribe(() => save.touch());

  // One panel at a time: opening the map closes whatever else is up.
  const open = () => {
    game.emit('panel', 'map');
    map.open();
  };
  game.on('panel', (which) => which !== 'map' && map.close());
  commands.add({ id: 'map', keys: ['KeyM'], group: 'WANDER', label: 'map · mark places', run: open });
  hud.button('map-btn', () => (map.isOpen ? map.close() : open()));

  // The map covers the view, so the world isn't drawn under it.
  game.coverWhen(() => map.isOpen);

  game.addSystem({
    name: 'markers',
    phase: 'world',
    update: ({ now }) => markers.update(now / 1000, SHARED.uWind.value, player.pos),
  });
  game.addSystem({
    name: 'map',
    phase: 'render',
    update({ dt }) {
      if (map.isOpen) map.update(dt);
    },
  });

  // Tiles are drawn ahead of time around you while you walk, so the map opens
  // already drawn.
  let drawnAt = null;
  let check = Infinity;
  game.on('ready', () => {
    check = performance.now() + 3000; // let the forest settle first
  });
  game.addSystem({
    name: 'map-prefetch',
    phase: 'late',
    update({ now }) {
      if (now > check && !map.isOpen) {
        check = now + PREFETCH_EVERY;
        if (!drawnAt || Math.hypot(player.pos.x - drawnAt.x, player.pos.z - drawnAt.z) > PREFETCH_AFTER) {
          drawnAt = { x: player.pos.x, z: player.pos.z };
          map.prefetch(drawnAt.x, drawnAt.z);
        }
      }
    },
  });

  // The mark or the place you're tracking: shown on the HUD ahead of anything else.
  hud.guide(() => {
    const m = marks.trackedMark();
    return m && { id: m.id, label: markLabel(m), color: m.color, x: m.x, z: m.z };
  });
}
