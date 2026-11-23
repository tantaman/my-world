// What a town looks like, and who lives in it: all that is only needed once
// you come near one, so it's fetched then and not before (core/lazy.ts).
// index.js asks for it as it's about to stand a town up.

export { buildLot, buildStreet, makeTumbleweed } from './buildings.js';
export { Townsfolk } from './people.js';
