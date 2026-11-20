// Real hikes, set into the forest (see landform.js). Each was imported from a
// photo by `npm run hike`, which also lists it here. To take one out, delete
// its line here and its file in hikes/.
//
// Where a hike sits is part of the world description, like the hills: a
// world someone has built in near one remembers it there. Re-importing keeps
// it where it is.

import mountStormKing from './hikes/mount-storm-king.js';

export const HIKES = [mountStormKing];
