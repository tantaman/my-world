// What grows (and lies about) in the forest, in one table. No three.js in
// here: the chunk workers and the map read it too.
//
// The order is the order plants are placed in, which is part of what a seed
// means: append new kinds, never reorder. A new kind also needs a model
// (models.js) and a rule for where it grows (chunkGen.js).

export const FLORA = {
  //        a tree?      drawn out to this chunk LOD   casts a shadow
  pine: { tree: true, maxLod: 2, shadow: true },
  broad: { tree: true, maxLod: 2, shadow: true },
  birch: { tree: true, maxLod: 2, shadow: true },
  bush: { tree: false, maxLod: 1, shadow: true },
  fern: { tree: false, maxLod: 0, shadow: false },
  rock: { tree: false, maxLod: 2, shadow: true },
  log: { tree: false, maxLod: 1, shadow: true },
};

export const VEG_KINDS = Object.keys(FLORA);
export const TREE_KINDS = VEG_KINDS.filter((k) => FLORA[k].tree);

// Numbers per plant in a chunk's placement lists: x, y, z, yaw, scale, tint, extra.
export const VEG_STRIDE = 7;
