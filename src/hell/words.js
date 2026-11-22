// What is written over the gate, and what the poem says of each place:
// lines from Longfellow's translation of the Inferno (1867), as they stand
// in it. test/hell.test.js keeps their spelling.
//
// A place's words:
//   title   what the place is
//   who     who is punished there
//   canto   where the poem comes to it
//   lines   the poem's own words for it, a line to a string

// Over the gate (Canto III, 1–9).
export const INSCRIPTION = [
  'Through me the way is to the city dolent;',
  'Through me the way is to eternal dole;',
  'Through me the way among the people lost.',
  'Justice incited my sublime Creator;',
  'Created me divine Omnipotence,',
  'The highest Wisdom and the primal Love.',
  'Before me there were no created things,',
  'Only eterne, and I eternal last.',
  'All hope abandon, ye who enter in!',
];

// By a region's id (plan.REGIONS).
export const WORDS = {
  darkwood: {
    title: 'The Dark Wood',
    canto: 'I',
    lines: ['Midway upon the journey of our life', 'I found myself within a forest dark,', 'For the straightforward pathway had been lost.'],
  },
  vestibule: {
    title: 'The Vestibule',
    who: 'those who lived without infamy or praise',
    canto: 'III',
    lines: ['There sighs, complaints, and ululations loud', 'Resounded through the air without a star,'],
  },
  acheron: {
    title: 'Acheron',
    who: 'the dead, waiting to cross',
    canto: 'III',
    lines: ['“Woe unto you, ye souls depraved!', 'Hope nevermore to look upon the heavens;'],
  },
  limbo: {
    title: 'The First Circle · Limbo',
    who: 'the unbaptized, and the great of the old world',
    canto: 'IV',
    lines: ['Lost are we and are only so far punished,', 'That without hope we live on in desire.”'],
  },
  lustful: {
    title: 'The Second Circle',
    who: 'the lustful, driven on the wind',
    canto: 'V',
    lines: ['I came into a place mute of all light,', 'Which bellows as the sea does in a tempest,'],
  },
  gluttons: {
    title: 'The Third Circle',
    who: 'the gluttons, under the rain',
    canto: 'VI',
    lines: ['In the third circle am I of the rain', 'Eternal, maledict, and cold, and heavy;'],
  },
  avaricious: {
    title: 'The Fourth Circle',
    who: 'the avaricious and the prodigal',
    canto: 'VII',
    lines: ['Crying, “Why keepest?” and, “Why squanderest thou?”'],
  },
  styx: {
    title: 'The Fifth Circle · Styx',
    who: 'the wrathful, and under the water the sullen',
    canto: 'VII',
    lines: ['A marsh it makes, which has the name of Styx,', 'This tristful brooklet, when it has descended'],
  },
  heretics: {
    title: 'The Sixth Circle · the City of Dis',
    who: 'the heretics, in burning tombs',
    canto: 'IX',
    lines: ['For flames between the sepulchres were scattered,', 'By which they so intensely heated were,'],
  },
  blood: {
    title: 'The Seventh Circle · Phlegethon',
    who: 'the violent against their neighbours',
    canto: 'XII',
    lines: ['The river of blood, within which boiling is', 'Whoe’er by violence doth injure others.”'],
  },
  wood: {
    title: 'The Seventh Circle · the Wood',
    who: 'the violent against themselves',
    canto: 'XIII',
    lines: ['Not foliage green, but of a dusky colour,', 'Not branches smooth, but gnarled and intertangled,', 'Not apple-trees were there, but thorns with poison.'],
  },
  sand: {
    title: 'The Seventh Circle · the Burning Sand',
    who: 'the violent against God, nature and art',
    canto: 'XIV',
    lines: ['O’er all the sand-waste, with a gradual fall,', 'Were raining down dilated flakes of fire,', 'As of the snow on Alp without a wind.'],
  },
  brink: {
    title: 'The Great Cliff',
    canto: 'XVI',
    lines: ['Thus downward from a bank precipitate,', 'We found resounding that dark-tinted water,'],
  },
  malebolge: {
    title: 'The Eighth Circle · Malebolge',
    who: 'the fraudulent, in ten ditches',
    canto: 'XVIII',
    lines: ['There is a place in Hell called Malebolge,', 'Wholly of stone and of an iron colour,'],
  },
  well: {
    title: 'The Well of the Giants',
    canto: 'XXXI',
    lines: ['“Raphael mai amech izabi almi,”', 'Began to clamour the ferocious mouth,'],
  },
  cocytus: {
    title: 'The Ninth Circle · Cocytus',
    who: 'the traitors, in the ice',
    canto: 'XXXII',
    lines: ['And underfoot a lake, that from the frost', 'The semblance had of glass, and not of water.'],
  },
};

// The ten ditches of Malebolge, outermost first.
export const DITCHES = [
  { who: 'panders and seducers, scourged by demons', canto: 'XVIII' },
  { who: 'flatterers, sunk in filth', canto: 'XVIII' },
  { who: 'simoniacs, head down in the rock, their soles alight', canto: 'XIX' },
  { who: 'diviners, their heads turned backward', canto: 'XX' },
  { who: 'barrators, under the boiling pitch', canto: 'XXI' },
  { who: 'hypocrites, in cloaks of gilded lead', canto: 'XXIII' },
  { who: 'thieves, among the serpents', canto: 'XXIV' },
  { who: 'false counsellors, each wrapped in a flame', canto: 'XXVI' },
  { who: 'sowers of discord, cloven', canto: 'XXVIII' },
  { who: 'falsifiers, heaped in their sickness', canto: 'XXIX' },
];

// The four zones of the ice (plan.ZONES).
export const ZONE_WORDS = [
  { title: 'Caina', who: 'traitors to their kindred' },
  { title: 'Antenora', who: 'traitors to their country' },
  { title: 'Ptolomea', who: 'traitors to their guests' },
  { title: 'Judecca', who: 'traitors to their lords' },
];

// Said at other moments.
export const SAID = {
  fall: 'And fell, even as a dead body falls.', // V, the last line
  round: ['“Thou knowest the place is round,', 'Thou hast not yet through all the circle turned.'], // XIV
  charon: ['“By other ways, by other ports', 'Thou to the shore shalt come, not here, for passage;'], // III
  plutus: '“Pape Satan, Pape Satan, Aleppe!”', // VII
  dis: ['The city draweth near whose name is Dis,', 'With the grave citizens, with the great throng.”'], // VIII
  geryon: '“Behold the monster with the pointed tail,', // XVII
  lucifer: ['“‘Vexilla Regis prodeunt Inferni’', 'The Emperor of the kingdom dolorous'], // XXXIV
  stars: 'Thence we came forth to rebehold the stars.', // XXXIV, the last line
};
