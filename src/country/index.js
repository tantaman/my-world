// The country you're in.
//
// A real place set into the forest says what kind of country it is
// (world/country.js): what its ground is made of, what its sky is doing. The
// world generator places all that (which vertex is bare, where the palms
// stand); this is the part that follows you about. It finds the real place
// you are on or nearest, and hands its colours to the shaders, which use
// them only as far as the ground says it is that country's (see groundColor
// in render/glsl.js); and it sets its weather over you as you come onto it:
// its layer of cloud (DECK in render/uniforms.js), how thick its air is, how
// much sun gets through. In the forest, far from any, it has nothing to do.
//
// From the console: world.country.name, world.country.here

import { LAND, DECK } from '../render/uniforms.js';
import { COUNTRY } from '../world/country.js';
import { nearestLand, deckHeight, weatherAt } from './here.js';

const EASE = 1.6; // 1/s: how quickly the weather comes over you

// The features this uses, so it is installed after them (game/features.js).
export const after = ['render', 'world'];
export function installCountry(game) {
  const { gen, pipeline, sky, camera } = game;
  const names = new Map(Object.entries(COUNTRY).map(([name, c]) => [c, name]));
  const state = { here: COUNTRY.forest, land: null, name: 'forest' };
  game.provide('country', state);

  const paint = (c) => {
    const g = c.ground;
    LAND.uTint.value.setRGB(...g.tint);
    LAND.uDirt.value.setRGB(...g.dirt);
    LAND.uRock.value.setRGB(...g.rock);
    LAND.uBareA.value.setRGB(...g.bare[0]);
    LAND.uBareB.value.setRGB(...g.bare[1]);
    LAND.uSand.value.setRGB(...g.sand);
  };

  game.addSystem({
    name: 'country',
    phase: 'world',
    update({ dt }) {
      const at = game.focus;
      const land = nearestLand(gen.lands, at.x, at.z);
      if (land !== state.land) {
        // (Lands lie far apart, so the one that is nearest changes while both
        // are out of sight: nothing on screen is repainted.)
        state.land = land;
        state.here = land ? land.country : COUNTRY.forest;
        state.name = names.get(state.here) || 'forest';
        paint(state.here);
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
