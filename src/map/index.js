// The map (M), and the marks you leave on it: listed beside the map, tracked
// on the HUD, and standing in the world as pennants. Other features put
// places on it too, through map.places (places.js), lists of where to go
// beside it, through map.addTab, and options under those lists, through
// map.addAction (mapView.js): it's where you go from.
//
// `go here`, on the card of the mark or the place you picked, is that taken
// at its word: you are set down there once the ground has grown (travel()
// below), as the stations and the hikes set you down at theirs.

import { MarkStore, marksSave } from './marks.js';
import { MapView } from './mapView.js';
import { Markers } from './markers.js';
import { Places } from './places.js';
import { SHARED } from '../render/uniforms.js';

const PREFETCH_EVERY = 2000; // ms between checks
const PREFETCH_AFTER = 120; // metres walked before the map is drawn afresh around you

// The features this uses, so it is installed after them (game/features.js).
export const after = ['render', 'ui', 'world', 'player'];
export function installMap(game) {
  const { scene, chunks, player, input, hud, commands, save, structures, gen, landforms } = game;

  const marks = new MarkStore();
  const markers = new Markers(scene, (x, z) => chunks.heightAt(x, z));
  marks.subscribe(() => markers.sync(marks.list()));
  // Places other features put on the map (an old cabin, a dock): see places.js.
  const places = new Places();
  marks.findPlace = (id) => places.get(id);
  // One panel at a time: opening the map, on whichever tab, closes whatever
  // else is up.
  const onOpen = () => game.emit('panel', 'map');
  const map = new MapView({ seed: gen.seed, land: gen.land, structures, hikes: gen.hikes, ready: (x0, z0, x1, z1, ask) => landforms.ready(x0, z0, x1, z1, ask), marks, player, input, places, onOpen, travel });
  landforms.on('land', (def) => map.addHike(def));
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
  save.register({
    id: 'routeGuidance',
    scope: 'yours',
    local: 'marks',
    collect: () => marks.routing,
    restore: (on) => marks.setTracked(marks.tracked, on === true),
  });
  marks.subscribe(() => save.touch());

  // Off to somewhere picked on the map. You are put down there as soon as it
  // is asked for, facing the way the place says (yaw: its way in, say) or
  // else the way you were, the camera behind you; the wait is only
  // for the ground to grow round you, and for a hike's land to arrive if the
  // spot is on one (the chunks send for it as they ask whether they may grow).
  // Not while something is carrying you or moving you: get off it first, or
  // it would be left behind with you still sitting on it.
  async function travel(x, z, label, yaw) {
    if (!player.rides.free) {
      hud.flash(player.rides.why());
      return false;
    }
    map.close();
    await game.api.teleport(x, z, yaw);
    if (label) hud.flash(label);
    return true;
  }

  game.on('panel', (which) => which !== 'map' && map.close());
  commands.add({ id: 'map', keys: ['KeyM', 'PadSelect'], group: 'WANDER', label: 'map · mark places · where to go', run: () => map.open() });
  hud.button('map-btn', () => map.toggle());

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
  hud.guide(() => map.routes.guide());
}
