// Every word in the picture: the signs, the van, the overlay.
//
// Two sets. The original's, for a like-for-like picture while this stays a
// private study, and our own, for anything shown to anyone else (PLAN.md
// section 10, decision 3): `npm run abduction:publish` builds with ours
// (Vite's mode "publish"), and the other set is left out of that build.
const ORIGINAL = {
  brand: 'SOUTH',
  brandSub: 'GASOLINE · OIL',
  oil: ['PREMIUM', 'MOTOR OIL', 'KEEPS', 'ENGINES CLEAN'],
  tires: ['TIRES', 'BATTERIES'],
  ice: 'ICE',
  welcome: ['Welcome to', 'Signal Ridge', 'KEEP AN EYE ON THE SKY'],
  van: 'NIGHT FREQUENCY',
  door: 'CLOSE',
  westDoor: 'STAFF ONLY',
  hud: { device: 'BODYCAM  V3.2.1', unit: 'UNIT 4417', camera: 'CAM 02 / SIGNAL RIDGE', date: '2026-11-24' },
};

const OWN = {
  brand: 'ATLAS',
  brandSub: 'GAS · OIL · SERVICE',
  oil: ['QUALITY', 'MOTOR OIL', 'RUNS', 'COOL & CLEAN'],
  tires: ['TIRES', 'BATTERIES'],
  ice: 'ICE',
  welcome: ['Welcome to', 'Hollow Creek', 'MIND THE NIGHT SKY'],
  van: 'LATE SHIFT RADIO',
  door: 'CLOSED',
  westDoor: 'STAFF ONLY',
  hud: { device: 'BODYCAM  V2.7', unit: 'UNIT 0715', camera: 'CAM 01 / HOLLOW CREEK', date: '2026-11-26' },
};

export const PUBLIC = import.meta.env.MODE === 'publish';
export const WORDS = PUBLIC ? OWN : ORIGINAL;
