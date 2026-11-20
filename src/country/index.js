// The country you're in.
//
// A real place set into the forest says what kind of country it is
// (world/country.js): what its ground is made of, what its sky is doing. The
// world generator places all that (which vertex is bare and whose it is,
// where the palms stand). This hands the shaders every country's colours,
// once, for the ground to pick its own from (see groundColor in
// render/glsl.js); and it is the part that follows you about: it finds the
// real place you are on or nearest, and sets its weather over you as you
// come onto it:
// its layer of cloud (DECK in render/uniforms.js), how thick its air is, how
// much sun gets through. And it adds the sound of its sea (surf.js). In the
// forest, far from any, it has nothing to do.
//
// From the console: world.country.name, world.country.here

import { LAND, DECK, MAX_COUNTRIES } from '../render/uniforms.js';
import { COUNTRY, COUNTRIES } from '../world/country.js';
import { nearestLand, deckHeight, weatherAt } from './here.js';
import { surf } from './surf.js';

const EASE = 1.6; // 1/s: how quickly the weather comes over you

// The features this uses, so it is installed after them (game/features.js).
export const after = ['render', 'world', 'audio'];
export function installCountry(game) {
  const { gen, pipeline, sky, camera, sound } = game;
  const names = new Map(Object.entries(COUNTRY).map(([name, c]) => [c, name]));
  const state = { here: COUNTRY.forest, land: null, name: 'forest' };
  game.provide('country', state);
  // the sea, where a real place has one, is heard breaking on its shore
  sound.addLayer(surf());

  // every country's colours, by its id, for the ground to pick from
  if (COUNTRIES.length > MAX_COUNTRIES) throw new Error(`there is room in the shaders for ${MAX_COUNTRIES} countries (render/uniforms.js), and ${COUNTRIES.length} in the table`);
  for (const c of COUNTRIES) {
    const g = c.ground;
    LAND.uTint.value[c.id].setRGB(...g.tint);
    LAND.uDirt.value[c.id].setRGB(...g.dirt);
    LAND.uRock.value[c.id].setRGB(...g.rock);
    LAND.uBareA.value[c.id].setRGB(...g.bare[0]);
    LAND.uBareB.value[c.id].setRGB(...g.bare[1]);
    LAND.uSand.value[c.id].setRGB(...g.sand);
  }

  game.addSystem({
    name: 'country',
    phase: 'world',
    update({ dt }) {
      const at = game.focus;
      const land = nearestLand(gen.lands, at.x, at.z);
      if (land !== state.land) {
        state.land = land;
        state.here = land ? land.country : COUNTRY.forest;
        state.name = names.get(state.here) || 'forest';
        DECK.uDeckCover.value = 0;
        if (land) {
          DECK.uDeck.value = deckHeight(land);
          DECK.uDeckMid.value.set(land.cx, land.cz);
        }
      }
      // its weather, as far as you are onto it
      const w = weatherAt(land, at.x, at.z, camera.position.y);
      const k = 1 - Math.exp(-dt * EASE);
      DECK.uDeckCover.value += (w.cover - DECK.uDeckCover.value) * k;
      pipeline.haze += (w.haze - pipeline.haze) * k;
      sky.overcast += (w.overcast - sky.overcast) * k;
    },
  });
}
