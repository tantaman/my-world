// Real hikes, set into the forest (see landform.js). Each was imported from a
// photo by `npm run hike`, which writes this file. To take one out, delete
// its entry here and its file in hikes/.
//
// Each is here as a card: what it is and where, a few hundred bytes. Its land
// (the heights, the lakes, the trails: about 200 kB) is in hikes/<id>.js,
// fetched the first time it's needed, not when the game starts (landforms.js).
//
// Where a hike sits is part of the world description, like the hills: a
// world someone has built in near one remembers it there. Re-importing keeps
// it where it is.

const hike = (card, load) => ({ ...card, load });

export const HIKES = [
  hike({"id":"mount-storm-king","name":"Mount Storm King","at":[0,-3200],"scale":0.2,"radius":800,"fade":200,"photo":{"lat":48.055397,"lon":-123.7734},"view":{"x":0,"z":0,"bearing":280.5,"hour":16.35},"trailhead":{"x":-249.5,"z":38.9,"yaw":2.763},"trail":{"name":"Mt. Storm King Trail","length":496,"climb":122},"trees":{"cover":0.9,"species":0.7},"lakes":[{"name":"Lake Crescent"}]}, () => import('./hikes/mount-storm-king.js')),
];
