// The station's dark metals, made once and shared by the shop, the canopy
// and the props, so set/batch.js merges every frame, bracket, plinth, cable
// and pipe of a kind into one draw in each pass rather than one per file.
import { weathered } from './weathered.js';
import { pbr } from './textures.js';

let made = null;

function make() {
  const rust = pbr('rust_coarse_01');
  const sheet = pbr('rusty_metal_02');
  return {
    // Black painted steel, rust coming through: window frames, brackets,
    // plinths, the bench's frame, holsters.
    black: weathered({ colour: '#161816', rust: 0.22, rough: 0.5, metal: 0.4, wet: 0.2, bump: 0, streaks: 0.2,
      photo: rust, photoScale: 0.6, photoSat: 0.5, photoAmount: 0.6 }),
    // Grey galvanised pipe and strip, rusting.
    pipe: weathered({ colour: '#4a4c47', rust: 0.35, rough: 0.55, metal: 0.4, bump: 0, streaks: 0.3,
      photo: sheet, photoScale: 0.5, photoSat: 0.6 }),
    // Black rubber cable and hose.
    cable: weathered({ colour: '#121312', rough: 0.5, bump: 0, streaks: 0, dirt: 0.4, dirtHeight: 0.3 }),
    // Chrome, dulled.
    chrome: weathered({ colour: '#8d8b84', rust: 0.15, rough: 0.3, metal: 0.85, bump: 0, streaks: 0 }),
  };
}

export function metals() {
  made ??= make();
  return made;
}
