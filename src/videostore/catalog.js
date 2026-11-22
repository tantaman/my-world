// The films: every tape on every shelf of the video store, grown from the
// world's seed like everything else, so everyone in a world browses the same
// shop, with the same tapes in the same places.
//
// New Releases and Staff Picks draw from a fixed lineup of real films.
// Each genre also has a grammar for its generated titles (an
// action film is a hard word and a harder one; a horror film is a night, a
// place and something in it), and for the back of the box: a tagline, a few
// lines of what it's about, who's in it, who made it, its rating and running
// time, and a quote from a critic. What its cover looks like is a few choices
// (a motif, colours, where the title goes) that covers.js draws.
//
//   const cat = new Catalog(seed)
//   cat.films              every film: { id, title, genre, section, year,
//                          rating, mins, tagline, blurb, cast, director,
//                          quote, stars, cover, copies, staff?, note?, lang? }
//   cat.at(faceId, col, row) -> the film in that slot, or null (empty)
//   cat.slotsOf(id)        -> [{ face, col, row }] where its copies stand
//   cat.section(id)        -> its films, in the order they're on the shelf
//   sortKey(title)         how the shop alphabetises: "The" and "A" don't count
//
// No three.js in here: the tests read it.

import { mulberry32 } from '../noise.js';
import { FACES, SECTIONS, fillOrder } from './floorplan.js';
import { LINEUP } from './lineup.js';

export const STORE = { name: 'Rewind Video', year: 2004, motto: 'Make it a Rewind night!' };
const SALT = 0x5ee7a9e;
const LEGACY_NEW_YEAR = 1997;

// The people who work there, and what each puts on their end of an aisle.
export const STAFF = [
  { name: 'Jen', likes: ['horror', 'cult', 'scifi'], says: ['Watch it with the lights OFF.', 'I’ve seen this one eleven times.', 'Do NOT watch alone!!', 'Way better than the sequel.', 'The ending got me. Every time.', 'Gross in the best way.'] },
  { name: 'Marco', likes: ['action', 'western', 'thriller'], says: ['Best car chase ever filmed. Period.', 'Turn it UP.', 'Trust me on this one.', 'Rewind the warehouse scene!', 'Pure adrenaline.', 'They don’t make ’em like this anymore.'] },
  { name: 'Dev', likes: ['foreign', 'drama', 'classics'], says: ['Criminally underrated.', 'Bring tissues.', 'Changed my life, honestly.', 'Worth reading the subtitles for.', 'The last shot. Wow.', 'A real one. Give it a chance.'] },
  { name: 'Sam', likes: ['comedy', 'family', 'romance'], says: ['I laughed so hard I cried!', 'Perfect for a rainy night.', 'Make popcorn first.', 'Quote it with your friends.', 'My mom’s favorite!', 'Feel-good pick of the week.'] },
];

const pick = (list, rnd) => list[Math.floor(rnd() * list.length)];
const between = (a, b, rnd) => a + Math.floor(rnd() * (b - a + 1));
const weighted = (table, rnd) => {
  let total = 0;
  for (const [, w] of table) total += w;
  let k = rnd() * total;
  for (const [v, w] of table) if ((k -= w) <= 0) return v;
  return table[table.length - 1][0];
};

// "The Long Summer" goes under L, "A Kiss in Paris" under K.
export const sortKey = (title) =>
  title
    .replace(/^(The|A|An) /, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, '');

// ── Names ───────────────────────────────────────────────────────────────────

const FIRST = 'Dana Rick Lorna Vince Carla Dean Tess Mitch Rhea Grant Lena Hal Joelle Ray Celia Brock Nina Wes Maura Clint Ingrid Luis Odette Burt Sylvie Roy Paula Gene Tamsin Rex Marguerite Ned Corinne Duke Alma Theo Bianca Jack Delia Kurt Vera Sonny Hedy Floyd Nadia Chet Imogen Max Rosa Lyle Greta Abe Lucille Boyd Ines Cliff Yvonne Otto June Reggie Pia Dashiell Mae Arturo Kiki Desmond Lou'.split(' ');
const LAST = 'Hartley Vance Moreau Kessler Dalton Brandt Okafor Lindqvist Castellano Whitlock Ferro Ashby Novak Prentiss Calloway Duquesne Sorensen Mercer Takeda Ramsey Holloway Valdez Kincaid Birch Sterling Delacroix Haverford Quist Marchetti Coyle Lombard Petrakis Wilde Garroway Fenn Szabo Barlow Ostrowski Nakamura Pruitt Bellamy Doucet Hargrove Ingram Lacroix Mendez Ruskin Trask Varga Winslow Yates Abernathy Blythe Corrigan Dufresne Esposito Fairbanks Gallo Hendrix Iverson Juarez Kowalski Lark Mancini Neville Oakes Pemberton Rourke Sato Tolliver Underhill Voss Wainwright'.split(' ');
const name = (rnd) => `${pick(FIRST, rnd)} ${pick(LAST, rnd)}`;

const OUTLETS = ['The Morning Ledger', 'Reel Talk Weekly', 'Channel 7 at the Movies', 'Cinema Monthly', 'The Valley Courier', 'KXRT Radio', 'Screen Scene', 'The Sunday Herald', 'Flicks Magazine', 'Movie Night with Bev Lorde', 'The Tri-County Gazette', 'Premiere Picks', 'The Daily Bugle-Star', 'Popcorn Quarterly'];

// ── The genres ──────────────────────────────────────────────────────────────
// For each: its titles (patterns over its own words), what the back of the
// box says, how long it runs, what it's rated, when it was made, and what
// its covers look like.
//   words     { key: [...] } for {key} in a pattern
//   titles    patterns, picked evenly
//   sequel    how often a title gets a number after it
//   heroes    [who, they, their]: who it's about
//   plots     what happens to them: {hero} {they} {their} {place} {villain}
//   taglines  the line over the title
//   quotes    what the critics said
//   cover     { motifs, bgs, inks }: see covers.js

const COMMON_PLACES = ['a small town', 'Los Angeles', 'a sleepy lake town', 'the big city', 'a dusty border town', 'Chicago', 'a seaside resort', 'New Orleans', 'a mountain town', 'Miami'];

export const GENRES = {
  action: {
    label: 'Action',
    words: {
      A: 'Lethal Maximum Deadly Final Blind Steel Iron Rogue Silent Savage Burning Broken Total Extreme Raw Cold Red Black Double High Danger Urban Midnight Terminal Zero Ultimate Brutal Sudden Rapid Crimson Shadow Desert Jungle Thunder Hard'.split(' '),
      N: 'Force Justice Impact Fury Vengeance Strike Velocity Pursuit Payback Code Zone Run Assault Countdown Contract Weapon Ricochet Overdrive Showdown Siege Blast Lockdown Ransom Takedown Crossfire Breakout Collision Retribution Command Squadron Hazard Edge Getaway Inferno Recoil Warhead Hostage Manhunt Detonator'.split(' '),
      City: 'Miami Hong-Kong Detroit Bangkok Manila Vegas Harbor-City Bay-City Saigon Marseille'.split(' '),
      Op: 'Thunderbolt Nightfall Cobra Firestorm Hammerhead Snowblind Sidewinder Stingray Long-Shadow Red-Horizon Black-Viper Ironclad Wildfire Steel-Rain'.split(' '),
    },
    titles: ['{A} {N}', '{A} {N}', '{N}', '{City} {N}', 'Operation {Op}', 'Code Name: {Op}', '{A} {N}', 'No {N}', '{N} Point', 'The {A} {N}'],
    sequel: 0.22,
    heroes: [['an ex-Marine', 'he', 'his'], ['a burned-out cop', 'he', 'his'], ['a rookie FBI agent', 'she', 'her'], ['a retired hitman', 'he', 'his'], ['a kickboxing champion', 'she', 'her'], ['two mismatched detectives', 'they', 'their'], ['a disgraced Navy SEAL', 'he', 'his'], ['a getaway driver', 'she', 'her'], ['a bodyguard', 'he', 'his'], ['a bomb-squad veteran', 'she', 'her']],
    plots: [
      'When terrorists seize {place}, nobody stands in their way but {hero}. Now {they} must fight floor by floor before the clock runs out.',
      '{Hero} wanted out of the game. But when {their} partner is gunned down, {they} must take the law into {their} own hands.',
      'Framed for a crime {they} didn’t commit, {hero} {have} 48 hours to clear {their} name, with the whole city on {their} tail.',
      'Deep in {place}, {hero} uncovers a smuggling ring run by {villain}. There are no rules left now.',
      '{Hero} {have} one last job: get a witness across {place} alive. Everybody else wants the witness dead.',
    ],
    villains: ['a ruthless arms dealer', 'a crooked police chief', 'a cartel boss', 'a rogue general', 'a mercenary with nothing to lose', 'a billionaire madman'],
    taglines: ['This time, it’s personal.', 'No rules. No mercy. No way out.', 'One man. One chance.', 'Justice has a new name.', 'The countdown has begun.', 'Hit hard. Hit first.', 'They picked the wrong town.', 'Some debts are paid in blood.', 'He’s back. And he’s angry.', 'Get out of the way.'],
    quotes: ['A white-knuckle thrill ride!', 'Explosive!', 'Non-stop action from start to finish!', 'The action film of the year!', 'Pulse-pounding!', 'Leaves you breathless!', 'A knockout!'],
    rating: [['R', 7], ['PG-13', 3]],
    mins: [88, 124],
    years: [1979, 1996],
    cover: { motifs: ['hero', 'explosion', 'city', 'hero'], bgs: [0x1b1b22, 0x8a1d12, 0x2a3446, 0xc8581a, 0x0f2a3a, 0x3a1010], inks: [0xf2c230, 0xe8e8e8, 0xe23b2a, 0xf28c1a] },
  },
  thriller: {
    label: 'Thriller',
    words: {
      A: 'Fatal Silent Hidden Perfect Dangerous Sleeping Final Dead Cold Secret Twisted Innocent Midnight Scarlet Broken Still Hollow Unseen Paper Glass Bitter Quiet'.split(' '),
      N: 'Witness Reflection Obsession Instinct Alibi Deception Stranger Motive Suspicion Exposure Evidence Silence Mirror Proof Lies Window Confession Verdict Affair Guest Tenant Pulse Doubt Intent Attraction'.split(' '),
      P: 'Neighbor Babysitter Tenant Roommate Patient Nanny Stranger Caller Passenger Lodger'.split(' '),
      Num: 'Twelve Forty-Eight Seventy-Two Six Nine'.split(' '),
      When: 'Tuesday at-Midnight in-Reno Alive Wearing-Red at-the-Pier'.split(' '),
    },
    titles: ['{A} {N}', '{A} {N}', 'The {N}', 'The {N} Within', '{Num} Hours', 'The {P} Next Door', 'The {P}', '{A} {N}', 'Last Seen {When}'],
    sequel: 0.04,
    heroes: [['a defence lawyer', 'she', 'her'], ['a suburban father', 'he', 'his'], ['a young widow', 'she', 'her'], ['a crime reporter', 'he', 'his'], ['a psychiatrist', 'she', 'her'], ['a newlywed couple', 'they', 'their'], ['a night-shift nurse', 'she', 'her'], ['an insurance investigator', 'he', 'his']],
    plots: [
      'The perfect stranger moved in next door. Now {hero} can’t shake the feeling that {they} {are} being watched, and that nobody will believe {them}.',
      '{Hero} took the case nobody wanted. The deeper {they} dig{s}, the closer the killer gets to {their} own front door.',
      'One night. One mistake. And {hero} will do anything to keep {their} secret buried.',
      'A wrong number on a rainy night pulls {hero} into a web of murder and lies that reaches all the way to {villain}.',
    ],
    villains: ['the mayor’s office', 'a respected surgeon', 'a charming millionaire', 'someone close to home', 'the police themselves'],
    taglines: ['Trust no one.', 'Some secrets should stay buried.', 'Every family has a secret.', 'Close your eyes and count to ten.', 'The truth can kill you.', 'Who is watching who?', 'She knows what you did.', 'Desire. Deception. Murder.'],
    quotes: ['A nail-biter!', 'Hitchcock would be proud!', 'Twist after twist!', 'You won’t see it coming!', 'Sexy, smart and scary!', 'Edge-of-your-seat suspense!'],
    rating: [['R', 8], ['PG-13', 2]],
    mins: [94, 128],
    years: [1981, 1996],
    cover: { motifs: ['eyes', 'face', 'city', 'eyes'], bgs: [0x101418, 0x2a1c28, 0x0e1f2e, 0x3a3a3a, 0x401018], inks: [0xe8e8e8, 0xd8343a, 0x9ad0e8, 0xe8d8a0] },
  },
  comedy: {
    label: 'Comedy',
    words: {
      R: 'Uncle Aunt Cousin Dad Mom Brother Sister Grandpa Grandma Roommate Boss Stepdad Landlord'.split(' '),
      J: 'Alien Spy Robot Plumber Ghost Wrestler Babysitter Caveman Ninja Mailman Lifeguard Dentist Weatherman Substitute Bodyguard Genie Pizza-Guy Bowling-Champ Lounge-Singer'.split(' '),
      A: 'Awesome Radical Bogus Clueless Excellent Tubular Gnarly Mixed-Up Bodacious Wacky Outrageous Hopeless Unstoppable Lucky Totally-Rad'.split(' '),
      T: 'Break Score Weekend Adventure Mistake Night-Out Idea Deal Gig Splash Getaway Vacation'.split(' '),
      Animal: 'Llama Moose Penguin Chimp Goose Raccoon Pig Poodle Walrus Beaver Bulldog Camel'.split(' '),
      Place: 'Lake-House Ski-Lodge Bowling-Alley Mall Beach-Club Country-Club Car-Wash Drive-In Motel Arcade Video-Store Trailer-Park'.split(' '),
      Name: 'Benny Lou Marty Stan Ricky Lenny Wally Barry Gus Maxine Dolores Bev Rhonda Earl Vinnie Dot Phyllis Tito Sal Herb'.split(' '),
      City: 'Vegas Tijuana Cleveland Branson Reno Fort-Lauderdale Toledo Niagara'.split(' '),
    },
    titles: ['My {R} the {J}', '{J} School', '{Name}’s Big {T}', 'Totally {A}', 'Weekend at the {Place}', 'The {A} {J}s', '{Animal} Business', 'Camp {Name}', 'Mr. {Name} Goes to {City}', 'Party at {Name}’s', 'Road Trip to {City}', 'Uncle {Name}', 'Big Trouble at the {Place}', 'How to Lose Your {R}', 'Two {J}s and a {Animal}', 'The {Name} Brothers', 'Meet the {J}s'],
    sequel: 0.15,
    heroes: [['a slacker pizza guy', 'he', 'his'], ['two best friends', 'they', 'their'], ['an uptight accountant', 'he', 'his'], ['a bride-to-be', 'she', 'her'], ['a washed-up lounge singer', 'he', 'his'], ['a family of five', 'they', 'their'], ['three college roommates', 'they', 'their'], ['a mall security guard', 'she', 'her']],
    plots: [
      'When {hero} accidentally {wins}, it’s one wild weekend in {place}, and nothing will ever be the same again.',
      '{Hero} {have} one week to save the old {spot} from {villain}. What could possibly go wrong? Everything.',
      'A mix-up at the airport leaves {hero} stuck with a talking {animal} and the worst road trip in history.',
      '{Hero} just wanted a quiet vacation. Then the in-laws showed up.',
    ],
    wins: ['win{s} the lottery', 'inherit{s} a haunted bowling alley', 'get{s} mistaken for a famous spy', 'trade{s} places with {their} boss', 'get{s} elected mayor'],
    spots: ['rec center', 'summer camp', 'drive-in', 'roller rink', 'diner'],
    animals: ['parrot', 'chimp', 'llama', 'goldfish', 'pug'],
    villains: ['a greedy developer', 'the snobs from across the lake', 'a slimy TV producer', 'the school principal'],
    taglines: ['Party on!', 'They’re back, and they’re dumber than ever.', 'This summer, get ready to laugh.', 'Some guys have all the luck. These aren’t those guys.', 'One weekend. Zero brain cells.', 'It’s going to be a bumpy ride!', 'The comedy event of the year!', 'Warning: may cause uncontrollable laughter.'],
    quotes: ['Hilarious!', 'I laughed until it hurt!', 'A riot from start to finish!', 'The funniest movie of the year!', 'Pure popcorn fun!', 'Side-splitting!', 'Bring your friends!'],
    rating: [['PG-13', 6], ['R', 2], ['PG', 3]],
    mins: [84, 108],
    years: [1978, 1996],
    cover: { motifs: ['grin', 'group', 'grin'], bgs: [0xf2d330, 0xffffff, 0x2ab0d8, 0xe8462a, 0x58c84a, 0xf28cb8], inks: [0xd8243a, 0x1a1a1a, 0x1a3aa8, 0xffffff] },
  },
  horror: {
    label: 'Horror',
    words: {
      M: 'Ghoul Creeper Hag Mutant Witch Shape Stalker Wendigo Leech Crawler Scarecrow Slasher Puppet Demon Mummy Werewolf Banshee Doll Brood Hollow-Man Gravedigger Burrower'.split(' '),
      Place: 'Camp Island House Valley Lake Swamp Town Asylum Crypt Woods Farm Mill'.split(' '),
      Hol: 'Arbor-Day Labor-Day Leap-Year Midsummer Harvest Solstice Homecoming Graduation Bonfire New-Year’s Spring-Break'.split(' '),
      Room: 'Basement Attic Cellar Barn Old-Mill Crawlspace Boathouse Root-Cellar Woods Water'.split(' '),
      A: 'Dark Hollow Black Red Crooked Rotten Silent Hungry Blind Weeping'.split(' '),
      Sub: 'The-Return The-Awakening Resurrection The-Final-Chapter Bloodlines The-Reckoning Hell-Week Back-from-the-Grave The-Harvest Revenge New-Blood'.split(' '),
      Num: '13th 7th 4th 9th'.split(' '),
    },
    titles: ['{Place} of the {M}s', 'Night of the {M}', 'The {M}', '{Hol} Night', 'Don’t Go in the {Room}', 'It Came from the {Room}', 'The {A} {Place}', 'Return of the {M}', 'Blood {Place}', 'The {Num} Floor', 'Something in the {Room}', 'Bride of the {M}', '{A} {Hol}', 'The {M}: {Sub}'],
    sequel: 0.3,
    sequelSubs: true,
    heroes: [['a group of camp counsellors', 'they', 'their'], ['a babysitter', 'she', 'her'], ['five college friends', 'they', 'their'], ['a young family', 'they', 'their'], ['a small-town sheriff', 'he', 'his'], ['a paranormal investigator', 'she', 'her'], ['a lighthouse keeper', 'he', 'his']],
    plots: [
      'Twenty years ago, something terrible happened at the old {spot}. Now {hero} {have} come back, and something has been waiting for {them}.',
      'It was supposed to be a weekend at the lake. But {hero} soon discover{s} that the locals have good reason to stay inside after dark.',
      '{Hero} move{s} into the house on the hill. The previous owners never moved out.',
      'One by one, they’re disappearing. And {hero} {are} next.',
    ],
    spots: ['summer camp', 'sanatorium', 'mill', 'farmhouse', 'cemetery', 'drive-in'],
    villains: ['a masked killer', 'an ancient evil', 'the thing in the lake'],
    taglines: ['Be afraid. Be very afraid.', 'Sleep is for the dead.', 'Don’t look behind you.', 'The terror never ends.', 'Some doors should never be opened.', 'Nobody leaves the camp alive.', 'In the woods, no one can hear you scream.', 'It’s alive. And it’s hungry.', 'Pray for daylight.'],
    quotes: ['Terrifying!', 'I slept with the lights on for a week!', 'Gruesome fun!', 'Scary as hell!', 'Not for the faint of heart!', 'A modern horror classic!'],
    rating: [['R', 9], ['PG-13', 1]],
    mins: [79, 104],
    years: [1974, 1996],
    cover: { motifs: ['moon', 'hand', 'skull', 'moon'], bgs: [0x0a0a0c, 0x2a0606, 0x14201a, 0x1c1030, 0x6a0a0a], inks: [0xd8201a, 0xe8e8d0, 0x8ad84a, 0xf28c1a] },
  },
  scifi: {
    label: 'Sci-Fi',
    words: {
      N: 'Odyssey Horizon Colony Vector Drift Signal Quest Rift Paradox Station Frontier Eclipse Nexus Orbit Exodus Dominion Pulse Circuit Genesis Protocol Equinox Singularity'.split(' '),
      Planet: 'Mars Titan Europa Zantar Kepler Orion Vega Nebulon Ganymede Xylos Proxima Callisto Krell Arcturus'.split(' '),
      W: 'Cyborg Android Omega Delta Zeta Nova Laser Mecha Robo Unit Hyper'.split(' '),
      Num: '2099 3000 7 9 12 X 5 2150 Prime'.split(' '),
      Mach: 'Clone Machine Probe Visitor Swarm Monolith Synthetic Signal'.split(' '),
      A: 'Dark Final Lost Outer Cold Far Last Silent'.split(' '),
    },
    titles: ['{Planet} {N}', 'Star {N}', 'Beyond the {N}', 'The {Num} Protocol', '{W}-{Num}', 'Escape from {Planet}', 'The {A} {N}', 'Project {Planet}', 'Neon {N}', 'Time {N}', 'Cyber {N}', 'Last Light on {Planet}', 'Return to {Planet}', 'Colony {Num}', 'The {Mach}', '{W} {N}'],
    sequel: 0.18,
    heroes: [['a starship mechanic', 'she', 'her'], ['a bounty hunter', 'he', 'his'], ['a team of astronauts', 'they', 'their'], ['a teenage hacker', 'he', 'his'], ['a scientist', 'she', 'her'], ['the last cyborg cop', 'he', 'his'], ['a smuggler', 'she', 'her']],
    plots: [
      'In the year {year}, Earth is a wasteland. {Hero} {are} humanity’s last hope, if {they} can reach {planet} in time.',
      'A distress signal from the far side of {planet}. A crew of eight. Only one will come back.',
      '{Hero} wake{s} up with no memory and a barcode on {their} wrist. Somebody has been rewriting reality, and {theyre} next.',
      'They came in peace. They lied. Now {hero} must lead the resistance against {villain}.',
    ],
    villains: ['the Overmind', 'an alien armada', 'a rogue AI', 'the Corporation'],
    taglines: ['The future is now.', 'In space, there’s nowhere to run.', 'Man vs. machine. Only one survives.', 'The final frontier just got deadlier.', 'Tomorrow is cancelled.', 'They’re already here.', 'Reality is a lie.'],
    quotes: ['Mind-blowing!', 'Dazzling special effects!', 'A sci-fi masterpiece!', 'Out of this world!', 'Visionary!', 'Like nothing you’ve ever seen!'],
    rating: [['PG-13', 5], ['R', 4], ['PG', 2]],
    mins: [90, 136],
    years: [1977, 1996],
    cover: { motifs: ['planet', 'ship', 'planet', 'hero'], bgs: [0x06081a, 0x0a1a3a, 0x1a0a2a, 0x0a2a2a, 0x2a1a0a], inks: [0x5ae8f2, 0xf2e85a, 0xe8e8ff, 0xf25aa8] },
  },
  drama: {
    label: 'Drama',
    words: {
      A: 'Long Quiet Bitter Lost Lonely Golden Distant Gentle Broken Last Second Simple Ordinary Hard Fading Little Late Open Wide Narrow'.split(' '),
      S: 'Summer Winter Autumn Spring Harvest Season Year Goodbye'.split(' '),
      T: 'Dance Song Letter Promise Mile Train Ballad Bridge Orchard House Field Lighthouse Kitchen Waltz Shore Garden Station'.split(' '),
      Ab: 'Grace Glory Silence Mercy Memory Honor Courage Fortune Hope Regret Sorrow'.split(' '),
      Town: 'Millbrook Hadley Port-Agnes Cedar-Falls Marlow Winslow Ashford Bellmont Larkspur Tillman'.split(' '),
      Name: 'Eleanor Walter June Frank Rosalind Henry Clara Joe Ada Sam Lila Arthur'.split(' '),
      Ev: 'Storm Flood Fire Funeral Harvest War Wedding Fall'.split(' '),
      C: 'Blue Yellow Amber Grey Violet Scarlet Silver Green'.split(' '),
    },
    titles: ['The {A} {S}', 'A {T} for {Name}', '{Name} and {Name}', 'Rivers of {Ab}', 'The Last {T}', '{Town} Road', 'All the {A} {T}s', 'Sundays in {Town}', 'A {A} Life', 'After the {Ev}', 'Letters to {Name}', 'The {C} {T}', 'Long Way to {Town}', '{S} of {Ab}', 'The {T} at {Town}'],
    sequel: 0,
    heroes: [['a single mother', 'she', 'her'], ['a steelworker', 'he', 'his'], ['two estranged sisters', 'they', 'their'], ['a dying piano teacher', 'he', 'his'], ['a young lawyer', 'she', 'her'], ['a farming family', 'they', 'their'], ['a high-school football coach', 'he', 'his'], ['a war widow', 'she', 'her']],
    plots: [
      'In {place}, {hero} {have} one summer to make peace with the past, before the past makes its own peace.',
      'When the mill closes, {hero} must hold {their} family together through the hardest winter of {their} life.',
      '{Hero} return{s} home for a funeral and find{s} a box of letters that changes everything {they} thought {they} knew.',
      'Based on a true story. {Hero} took on {villain}, and refused to back down.',
    ],
    villains: ['the company that poisoned the river', 'the whole town', 'the state', 'a powerful senator'],
    taglines: ['Some journeys take a lifetime.', 'Based on a true story.', 'Love. Loss. And everything in between.', 'Home is where the heart breaks.', 'One family. One summer. One secret.', 'Never give up.'],
    quotes: ['Powerful and moving!', 'A triumph!', 'Bring a box of tissues!', 'Unforgettable!', 'The best film of the year!', 'Heartbreaking and beautiful!', 'Oscar-worthy!'],
    rating: [['PG-13', 4], ['R', 4], ['PG', 3]],
    mins: [102, 156],
    years: [1970, 1996],
    cover: { motifs: ['face', 'landscape', 'face'], bgs: [0xe8dcc0, 0x3a4a5a, 0x5a3a2a, 0xd0c8b0, 0x1a2a3a, 0x8a9aa8], inks: [0x1a1a1a, 0xf2e8d0, 0x8a2a1a, 0x2a3a5a] },
  },
  foreign: {
    label: 'Foreign',
    // titles in five languages, each with what it means
    langs: {
      French: { heads: [['La Nuit', 'The Night'], ['Le Jardin', 'The Garden'], ['La Fenêtre', 'The Window'], ['Le Silence', 'The Silence'], ['La Plage', 'The Beach'], ['Le Voyage', 'The Journey'], ['La Lumière', 'The Light'], ['Le Train', 'The Train'], ['La Chambre', 'The Room'], ['Le Secret', 'The Secret']], join: ['de', 'of'], places: 'Marseille Lyon Nantes Brest Arles Saint-Malo Lille Avignon Toulon Dieppe'.split(' ') },
      Italian: { heads: [['La Notte', 'The Night'], ['Il Treno', 'The Train'], ['La Piazza', 'The Square'], ['Il Silenzio', 'The Silence'], ['La Finestra', 'The Window'], ['Il Giardino', 'The Garden'], ['La Luna', 'The Moon'], ['Il Ritorno', 'The Return'], ['La Spiaggia', 'The Beach'], ['Il Segreto', 'The Secret']], join: ['di', 'of'], places: 'Napoli Torino Genova Bari Palermo Trieste Verona Siena Parma Rimini'.split(' ') },
      Spanish: { heads: [['La Noche', 'The Night'], ['El Tren', 'The Train'], ['La Ventana', 'The Window'], ['El Silencio', 'The Silence'], ['La Playa', 'The Beach'], ['El Jardín', 'The Garden'], ['La Luna', 'The Moon'], ['El Regreso', 'The Return'], ['La Casa', 'The House'], ['El Secreto', 'The Secret']], join: ['de', 'of'], places: 'Sevilla Valencia Cádiz Bilbao Málaga Oaxaca Toledo Granada Rosario Valparaíso'.split(' ') },
      German: { heads: [['Der Zug', 'The Train'], ['Die Nacht', 'The Night'], ['Das Fenster', 'The Window'], ['Der Winter', 'The Winter'], ['Die Brücke', 'The Bridge'], ['Das Schweigen', 'The Silence'], ['Der Bäcker', 'The Baker'], ['Die Schwestern', 'The Sisters'], ['Der Fährmann', 'The Ferryman'], ['Das Haus', 'The House']], join: ['von', 'of'], places: 'Kassel Bremen Lübeck Kiel Ulm Graz Linz Rostock Trier Bonn'.split(' ') },
      Japanese: { heads: [['Natsu no', 'Summer'], ['Fuyu no', 'Winter'], ['Aki no', 'Autumn'], ['Haru no', 'Spring'], ['Yoru no', 'Night']], tails: [['Kaze', 'Wind'], ['Umi', 'Sea'], ['Hana', 'Flowers'], ['Tsuki', 'Moon'], ['Ame', 'Rain'], ['Yume', 'Dream'], ['Kawa', 'River'], ['Sora', 'Sky'], ['Hoshi', 'Stars'], ['Michi', 'Road']] },
    },
    heroes: [['a lonely ferry captain', 'he', 'his'], ['a young schoolteacher', 'she', 'her'], ['two brothers', 'they', 'their'], ['an ageing film star', 'she', 'her'], ['a widowed baker', 'he', 'his'], ['a runaway girl', 'she', 'her']],
    plots: [
      'Over one long summer in {city}, {hero} learn{s} that the heart keeps its own time.',
      '{Hero} return{s} to the village of {their} childhood, where nobody has forgotten what happened.',
      'A quiet, luminous story of {hero}, a stranger, and the sea.',
      'Winner of the top prize at three festivals: the story of {hero} and the night that changed {their} life.',
    ],
    taglines: ['Winner: Best Foreign Language Film.', 'The art-house sensation.', 'A love story without borders.', 'Life is a long, strange dream.', 'From the acclaimed director.'],
    quotes: ['Luminous!', 'A masterpiece of world cinema!', 'Exquisite!', 'Haunting and beautiful!', 'Achingly romantic!', 'Pure poetry!'],
    rating: [['NR', 4], ['R', 3], ['PG-13', 2]],
    mins: [88, 142],
    years: [1958, 1996],
    cover: { motifs: ['art', 'face', 'landscape'], bgs: [0xf2ecd8, 0x1a1a1a, 0xc83a2a, 0x2a5a8a, 0xe8c840, 0x5a7a4a], inks: [0x1a1a1a, 0xf2ecd8, 0xc83a2a, 0xffffff] },
  },
  romance: {
    label: 'Romance',
    words: {
      S: 'Summer Winter Autumn Spring April Christmas'.split(' '),
      City: 'Paris Venice Vienna Seville Savannah Lisbon Prague Monterey Nantucket Santorini Charleston Kyoto'.split(' '),
      N: 'Matters Secrets Whispers Promises Echoes'.split(' '),
      Name: 'Sophie Jake Annie Luke Gracie Nick Molly Ben Kate Danny Lucy Rafe'.split(' '),
      J: 'Baker Florist Lighthouse-Keeper Matchmaker Bookseller Vintner Pilot Architect'.split(' '),
      Fl: 'Rose Orchid Lilac Peony Daisy Violet'.split(' '),
      A: 'Perfect Accidental Unexpected Reluctant Summer Secret'.split(' '),
      Num: 'Seven Thirty Ten Two'.split(' '),
    },
    titles: ['{S} in {City}', 'Heart {N}', 'Kissing {Name}', 'Falling for {Name}', 'The {J}’s Daughter', 'Always {Name}', 'Moonlight over {City}', 'Second Chances', 'A Kiss in {City}', 'Wild {Fl}s', 'Letters from {City}', 'The {A} Proposal', '{Num} Days in {City}', 'Waiting for {Name}', 'The {A} Bride'],
    sequel: 0,
    heroes: [['a big-city lawyer', 'she', 'her'], ['a widowed carpenter', 'he', 'his'], ['a struggling artist', 'she', 'her'], ['two strangers', 'they', 'their'], ['a wedding planner', 'she', 'her'], ['a ski instructor', 'he', 'his']],
    plots: [
      '{Hero} came to {city} to forget. Then {they} met someone {they} couldn’t.',
      'Engaged to the wrong man, {hero} {have} one week to follow {their} heart.',
      '{Hero} and a stranger met on a train, and agreed to meet again in a year. A lot can happen in a year.',
      'Opposites attract. Then they move in.',
    ],
    taglines: ['Love is worth the wait.', 'Some loves last forever.', 'Follow your heart.', 'One kiss changed everything.', 'Sometimes the one you want is the one you never expected.', 'Fall in love all over again.'],
    quotes: ['Swoon-worthy!', 'The date movie of the year!', 'Charming and irresistible!', 'Romantic and witty!', 'You’ll fall in love!'],
    rating: [['PG-13', 6], ['PG', 3], ['R', 2]],
    mins: [92, 124],
    years: [1980, 1996],
    cover: { motifs: ['couple', 'face', 'couple'], bgs: [0xf2c8c8, 0xf2a85a, 0x8a2a4a, 0xf8f0e0, 0x5a7ab8, 0xd85a7a], inks: [0x8a1a3a, 0xffffff, 0x2a2a5a, 0xf2d8a0] },
  },
  classics: {
    label: 'Classics',
    words: {
      A: 'Glass Velvet Crimson Silver Paper Gilded Thin Golden Scarlet Copper Lonely Fallen Painted Midnight'.split(' '),
      N: 'Key Heart Mask Affair Dagger Lady Gentleman Sparrow Ballroom Lantern Pistol Telegram Waltz Crossing Ticket Portrait Chauffeur Heiress'.split(' '),
      P: 'the-Riviera Midnight Sea the-Ritz Dawn Monte-Carlo the-Pier Grand-Central the-Opera the-Savoy'.split(' '),
      Name: 'Vivian Charles Margo Clifford Lillian Rex Constance Gregory Bette Humphrey'.split(' '),
    },
    titles: ['The {A} {N}', 'The {A} {N}', '{N} at {P}', 'Murder at {P}', 'Sweet {Name}', 'The {N} of {Name} Ashby', 'A {N} for {Name}', 'Gentlemen of {P}', 'Shadow of a {N}', 'The {N}'],
    sequel: 0,
    heroes: [['a down-on-his-luck reporter', 'he', 'his'], ['a society heiress', 'she', 'her'], ['a private eye', 'he', 'his'], ['a chorus girl', 'she', 'her'], ['a small-town senator', 'he', 'his']],
    plots: [
      '{Hero} is caught up in a whirlwind of jewels, champagne and murder aboard the overnight express.',
      'A sparkling comedy of manners: {hero} pretends to be engaged, and the lie takes on a life of its own.',
      'In the rain-slicked streets, {hero} follows a missing woman into a nest of blackmailers.',
      'The beloved story of {hero}, who stood up for what was right when nobody else would.',
    ],
    taglines: ['The screen’s most glamorous pair!', 'A picture you will never forget!', 'Thrills! Romance! Laughter!', 'The motion picture event of the year!'],
    quotes: ['A timeless masterpiece.', 'They don’t make them like this any more.', 'Sparkling!', 'One of the greatest films ever made.', 'An enduring classic.'],
    rating: [['NR', 6], ['G', 2], ['PG', 1]],
    mins: [74, 122],
    years: [1934, 1966],
    bw: 0.6, // how many are in black and white
    cover: { motifs: ['portrait', 'couple', 'portrait'], bgs: [0x2a2a2a, 0xe8e0c8, 0x6a1a1a, 0x1a2a4a, 0xc8a85a], inks: [0xf2e8c8, 0x1a1a1a, 0xe8c85a, 0xffffff] },
  },
  western: {
    label: 'Western',
    words: {
      Name: 'Cody Jesse Wyatt Clay Hank Luke Ezra Abe Buck Cole'.split(' '),
      T: 'Revenge Badge Spur Saddle Bounty Trail Wind Thunder Law Rifle Noose Gold Debt Brand'.split(' '),
      Place: 'Copper-Gulch Dry-Creek Silver-Mesa Rattlesnake-Ridge Red-Rock Black-Canyon Dead-Man’s-Bend Coyote-Wells Sundown-Flats Laramie Abilene Ashby’s-Camp'.split(' '),
      A: 'Lone Long Silver Fast Crooked Last Lonesome Painted Broken Dusty'.split(' '),
      Land: 'Plains Range Desert Sage Canyon Frontier'.split(' '),
      Num: 'Three Five Seven Four'.split(' '),
    },
    titles: ['{Name}’s {T}', 'Ride the {T}', 'Showdown at {Place}', 'The {A} Gun', 'Gunfight at {Place}', 'Last Train to {Place}', 'Riders of the {A} {Land}', 'The {Num} Who Rode', 'Dust and {T}', '{Place} Pass', 'Ballad of {Name} Kincaid', 'The {A} Rider', 'Hang the Sheriff'],
    sequel: 0.05,
    heroes: [['a drifter with no name', 'he', 'his'], ['a frontier widow', 'she', 'her'], ['an ageing marshal', 'he', 'his'], ['a bounty hunter', 'he', 'his'], ['two brothers', 'they', 'their'], ['a sharpshooter', 'she', 'her']],
    plots: [
      '{Hero} rode into {town} looking for the men who burned {their} ranch. {They} found the whole town in their pocket.',
      'The railroad is coming, and {villain} wants the land. Only {hero} stands in the way.',
      '{Hero} {have} hung up {their} guns. But when outlaws take {town}, there’s one more fight left.',
    ],
    towns: ['Copper Gulch', 'Dry Creek', 'Silver Mesa', 'Red Rock'],
    villains: ['a cattle baron', 'a railroad man', 'the Dalby gang'],
    taglines: ['The West was never this wild.', 'Justice rides alone.', 'One town. One gun. One chance.', 'Some men are born to ride.', 'At high noon, somebody dies.'],
    quotes: ['A rip-roaring western!', 'The best western in years!', 'Rugged and thrilling!', 'Saddle up!'],
    rating: [['PG', 4], ['PG-13', 2], ['R', 3], ['NR', 2]],
    mins: [86, 138],
    years: [1952, 1994],
    cover: { motifs: ['desert', 'desert', 'hero'], bgs: [0xe8882a, 0xc8582a, 0xe8c87a, 0x5a3a1a, 0x8a2a1a], inks: [0x2a1a0a, 0xf2e8c8, 0x8a1a0a, 0xf2c85a] },
  },
  cult: {
    label: 'Cult',
    words: {
      Food: 'Giant-Turnips Mutant-Meatloaf Killer-Kumquats Atomic-Pancakes Radioactive-Jello Fifty-Foot-Burrito Space-Pickles Hungry-Lasagna'.split(' '),
      M: 'Zombie Vampire Werewolf Mummy Robot Alien Lizard-Man Swamp-Thing Cave-Girl'.split(' '),
      Planet: 'Venus Pluto Mars Neptune Saturn'.split(' '),
      J: 'Cheerleader Lunch-Lady Mailman Plumber Disco-Queen Biker Librarian Lifeguard Accountant'.split(' '),
      Animal: 'Gerbil Shark Beaver Lobster Chicken Iguana Poodle'.split(' '),
      Ev: 'Prom Beach-Party Bake-Sale Car-Wash Bowling-Night'.split(' '),
      Thing: 'Toaster Lawnmower Jukebox Sofa Accordion Hairdryer'.split(' '),
      Place: 'Planet-X Cleveland the-Moon Hell Outer-Space Beyond'.split(' '),
    },
    titles: ['Attack of the {Food}', 'Surf {M}s', '{Planet} Bowling Massacre', 'Teenage {M} from {Place}', 'Mutant {Animal} Beach Party', 'Space {J}s', '{M} {Ev}', 'Night of the Killer {Thing}', 'Revenge of the {J}s', 'Disco {M}', 'Kung Fu {J}', 'Laser {Animal}', 'I Married a {M}', 'The {Thing} That Ate {Place}'],
    sequel: 0.12,
    heroes: [['a nerdy fry cook', 'he', 'his'], ['a gang of roller-skating nuns', 'they', 'their'], ['a disgraced weathergirl', 'she', 'her'], ['a punk band', 'they', 'their'], ['a mad scientist’s assistant', 'he', 'his']],
    plots: [
      'When a meteor lands on prom night, {hero} must save {their} town from an army of {villain}. Bring a bucket.',
      'It was the worst movie ever made. That’s why everybody loves it. {Hero} versus {villain}, in glorious Psycho-Vision!',
      '{Hero} {are} the only thing standing between Earth and {villain}. Earth is in trouble.',
    ],
    villains: ['killer vegetables', 'bikini-clad space vampires', 'a giant mutant beaver', 'evil disco robots', 'lizard people from Cleveland'],
    taglines: ['So bad it’s good!', 'You won’t believe your eyes!', 'Filmed in glorious SHOCK-O-RAMA!', 'The movie they tried to ban!', 'Not since the dawn of time...', 'Don’t eat the salad!'],
    quotes: ['Gloriously awful!', 'A midnight-movie must!', 'I can’t stop watching it!', 'The worst film ever made. I loved it.', 'Utterly deranged!'],
    rating: [['R', 5], ['NR', 3], ['PG-13', 2]],
    mins: [72, 96],
    years: [1958, 1993],
    cover: { motifs: ['title', 'hand', 'planet', 'title'], bgs: [0xf2e82a, 0xe82a8a, 0x2ae84a, 0xe8582a, 0x8a2ae8], inks: [0x1a1a1a, 0xffffff, 0xe82a2a, 0x2a2ae8] },
  },
  family: {
    label: 'Family',
    words: {
      Name: 'Max Buddy Lucy Biscuit Daisy Pip Sparky Rosie Tucker Peanut Molly Scout Pickles Bandit'.split(' '),
      Animal: 'Dog Puppy Pony Bear Dolphin Kitten Otter Duckling Hamster Panda Moose Owl Dragon Beagle'.split(' '),
      Cr: 'Dragon Robot Giant Troll Unicorn Ghost Martian Snowman Sasquatch Dinosaur'.split(' '),
      Verb: 'Saved-Christmas Could-Fly Played-Shortstop Went-to-School Wanted-a-Home Learned-to-Dance Ran-for-Mayor Found-the-Treasure'.split(' '),
      Place: 'the-Big-City Camp Washington the-North-Pole the-Moon Hollywood the-Ballpark Grandma’s the-Zoo Paris'.split(' '),
      A: 'Amazing Incredible Magical Secret Great Fantastic Wonderful'.split(' '),
      T: 'Treehouse Kite Snow-Globe Map Wishing-Well Carousel Lighthouse'.split(' '),
    },
    titles: ['{Name} the {Animal}', 'The {A} Adventures of {Name}', '{Name} Goes to {Place}', 'My Friend the {Cr}', 'The {Animal} Who {Verb}', 'A {Animal} Named {Name}', 'The Magic {T}', '{Name} and the {A} {T}', 'Snow Day at {Place}', 'The {A} {Cr}', 'Little {Cr}'],
    sequel: 0.2,
    heroes: [['a lonely ten-year-old', 'he', 'his'], ['a brave little girl', 'she', 'her'], ['three kids and their grandpa', 'they', 'their'], ['a scruffy stray', 'he', 'his'], ['the new kid in town', 'she', 'her']],
    plots: [
      'When {hero} find{s} a {animal} in the barn, {they} {have} no idea {theyre} about to go on the adventure of a lifetime.',
      '{Hero} must save the town fair from {villain}, with a little help from {their} new best friend.',
      'Lost on the way home, {hero} must find {their} way back across the mountains in time for Christmas.',
    ],
    animals: ['talking dog', 'baby dragon', 'runaway pony', 'friendly ghost', 'robot puppy'],
    villains: ['the grumpy mayor', 'a greedy circus owner', 'two bumbling burglars'],
    taglines: ['Fun for the whole family!', 'Friendship is the greatest adventure.', 'Get ready for a howling good time!', 'Believe in magic.', 'The best friends come in all sizes.'],
    quotes: ['A delight for all ages!', 'Kids will love it!', 'Heartwarming fun!', 'Magical!', 'The family film of the year!'],
    rating: [['G', 4], ['PG', 6]],
    mins: [76, 98],
    years: [1970, 1996],
    cover: { motifs: ['animal', 'castle', 'animal'], bgs: [0x5ab8f2, 0xf2d84a, 0x7ad85a, 0xf28c5a, 0xb88af2, 0xffffff], inks: [0xe82a2a, 0x2a4ab8, 0xffffff, 0xf2a82a] },
  },
};

// Genres for the generated stock.
const NEW_GENRES = [['action', 4], ['comedy', 4], ['thriller', 3], ['drama', 3], ['horror', 2], ['scifi', 3], ['romance', 2], ['family', 2]];

// ── A film ──────────────────────────────────────────────────────────────────

// {K} is one of the genre's K words, and {K}s more than one of it.
function fill(pattern, words, rnd) {
  return pattern.replace(/\{(\w+)\}(s\b)?/g, (m, k, more) => {
    const list = words[k];
    if (!list) return m;
    const w = pick(list, rnd).replace(/-/g, ' ');
    return more ? plural(w) : w;
  });
}

export function plural(w) {
  if (/man$/i.test(w)) return w.replace(/man$/i, (x) => (x === 'Man' ? 'Men' : 'men'));
  if (/wolf$/.test(w)) return w.replace(/wolf$/, 'wolves');
  if (/[^aeiou]y$/.test(w)) return `${w.slice(0, -1)}ies`;
  if (/(s|sh|ch|x|z)$/.test(w)) return `${w}es`;
  return `${w}s`;
}

const ROMAN = ['2', 'II', '3', 'III', 'Part 2', 'IV'];

function titleOf(G, rnd) {
  if (G.langs) {
    const [lang, L] = pick(Object.entries(G.langs), rnd);
    if (L.tails) {
      const [h, he] = pick(L.heads, rnd);
      const [t, te] = pick(L.tails, rnd);
      return { title: `${h} ${t}`, lang, means: `${he} ${te}` };
    }
    const [h, he] = pick(L.heads, rnd);
    const place = pick(L.places, rnd);
    return rnd() < 0.3 ? { title: h, lang, means: he } : { title: `${h} ${L.join[0]} ${place}`, lang, means: `${he} ${L.join[1]} ${place}` };
  }
  let title = fill(pick(G.titles, rnd), G.words, rnd);
  if (rnd() < G.sequel) {
    if (G.sequelSubs && G.words.Sub) title = `${title} ${pick(['2', 'III', '4', 'V'], rnd)}: ${pick(G.words.Sub, rnd).replace(/-/g, ' ')}`;
    else title = `${title} ${pick(ROMAN, rnd)}`;
  }
  return { title };
}

// The few lines on the back of the box, with its hero put in: {hero} and
// {Hero}, {they} {their} {them} {theyre}, and the verbs that go with them
// ({are}, {have}, and {s} on the end of one: "find{s}"), so that two brothers
// "have" what a drifter "has".
function blurbOf(G, rnd, year) {
  const [who, they, their] = pick(G.heroes, rnd);
  const plural = they === 'they';
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const swaps = {
    hero: who,
    Hero: cap(who),
    they,
    They: cap(they),
    their,
    them: { he: 'him', she: 'her', they: 'them' }[they],
    are: plural ? 'are' : 'is',
    have: plural ? 'have' : 'has',
    theyre: { he: 'he’s', she: 'she’s', they: 'they’re' }[they],
    s: plural ? '' : 's',
    place: pick(COMMON_PLACES, rnd),
    villain: G.villains ? pick(G.villains, rnd) : 'a dangerous stranger',
    wins: G.wins ? pick(G.wins, rnd) : '',
    spot: G.spots ? pick(G.spots, rnd) : 'old place',
    animal: G.animals ? pick(G.animals, rnd) : 'dog',
    planet: G.words && G.words.Planet ? pick(G.words.Planet, rnd) : 'Mars',
    year: String(year + 100 + Math.floor(rnd() * 400)),
    city: G.langs ? pick(['Marseille', 'Naples', 'Seville', 'Kyoto', 'Lisbon', 'Bremen'], rnd) : 'the city',
    town: G.towns ? pick(G.towns, rnd) : 'town',
  };
  // twice over, since a win or a villain can have a {their} or an {s} of its own
  let text = pick(G.plots, rnd);
  for (let i = 0; i < 2; i++) text = text.replace(/\{(\w+)\}/g, (m, k) => (k in swaps ? swaps[k] : m));
  return text;
}

function makeFilm(id, genre, rnd, { year = null, section } = {}) {
  const G = GENRES[genre];
  const { title, lang, means } = titleOf(G, rnd);
  const y = year ?? between(G.years[0], G.years[1], rnd);
  const bw = !!G.bw && rnd() < G.bw && y < 1962;
  const C = G.cover;
  const film = {
    id,
    title,
    genre,
    section,
    format: 'VHS',
    year: y,
    rating: weighted(G.rating, rnd),
    mins: between(G.mins[0], G.mins[1], rnd),
    tagline: pick(G.taglines, rnd),
    blurb: blurbOf(G, rnd, y),
    cast: [name(rnd), name(rnd), name(rnd)],
    director: name(rnd),
    quote: { text: pick(G.quotes, rnd), by: pick(OUTLETS, rnd) },
    stars: Math.min(5, 2 + Math.floor(rnd() * 7) / 2),
    cover: {
      motif: pick(C.motifs, rnd),
      bg: pick(C.bgs, rnd),
      ink: pick(C.inks, rnd),
      layout: Math.floor(rnd() * 4),
      bw,
      seed: Math.floor(rnd() * 2 ** 30),
    },
    copies: 1,
  };
  if (lang) {
    film.lang = lang;
    film.means = means;
  }
  return film;
}

const byTitle = (a, b) => {
  const ka = sortKey(a.title);
  const kb = sortKey(b.title);
  return ka < kb ? -1 : ka > kb ? 1 : 0;
};

function realFilm([tmdbId, title, year, genre], section, format) {
  const rnd = mulberry32(tmdbId);
  const C = GENRES[genre].cover;
  return {
    // The old generated IDs are small dense integers. Leave their range
    // available for old saves and key real rentals by title edition.
    id: 10000 + tmdbId * 2 + Number(format === 'DVD'),
    tmdbId, title, year, genre, section, format, copies: 1,
    cover: {
      motif: pick(C.motifs, rnd),
      bg: pick(C.bgs, rnd),
      ink: pick(C.inks, rnd),
      layout: Math.floor(rnd() * 4),
      bw: genre === 'classics' && year < 1958,
      seed: tmdbId,
    },
  };
}

// ── The shop's stock ─────────────────────────────────────────────────────────

export class Catalog {
  constructor(seed) {
    const rnd = mulberry32((seed ^ SALT) >>> 0);
    this.films = [];
    this.slots = new Map(); // 'face:col:row' -> film
    this.where = new Map(); // id -> [{ face, col, row }]
    this.bySection = new Map(); // section -> [film], on the shelf in order
    const titles = new Set();
    const fresh = (genre, opts) => {
      for (let tries = 0; tries < 40; tries++) {
        const f = makeFilm(this.films.length, genre, rnd, opts);
        if (titles.has(f.title)) continue;
        titles.add(f.title);
        this.films.push(f);
        return f;
      }
      // a grammar that has run out: a sequel nobody asked for
      const f = makeFilm(this.films.length, genre, rnd, opts);
      f.title = `${f.title} ${titles.size}`;
      titles.add(f.title);
      this.films.push(f);
      return f;
    };

    // how many slots each section has, on which faces
    const faces = new Map();
    for (const face of FACES) {
      if (!faces.has(face.section)) faces.set(face.section, []);
      faces.get(face.section).push(face);
    }

    for (const [section, list] of faces) {
      const S = SECTIONS[section];
      if (section === 'new') this._stockNew(list, fresh, rnd);
      else if (section === 'picks') this._stockPicks(list, fresh, rnd);
      else if (section === 'sale') {
        const films = [];
        for (const face of list) {
          for (let i = 0; i < face.cols * face.rows; i++) films.push(fresh(pick(NEW_GENRES, rnd)[0], { year: STORE.year - 1 - Math.floor(rnd() * 2), section }));
        }
        this._shelve(section, list, films);
      } else {
        const room = list.reduce((n, f) => n + f.cols * f.rows, 0);
        const films = [];
        let used = 0;
        while (used < room) {
          const f = fresh(S.genre, { section });
          const [most, some, often] = S.copies;
          f.copies = Math.min(room - used, rnd() < often ? some : most);
          used += f.copies;
          films.push(f);
        }
        this._shelve(section, list, films);
      }
    }
    this.ids = new Map(this.films.map((film) => [film.id, film]));
  }

  // Alphabetical, across a section's faces in turn, bay by bay.
  _shelve(section, faces, films) {
    films.sort((a, b) => (sortKey(a.title) < sortKey(b.title) ? -1 : 1));
    this.bySection.set(section, films);
    const order = [];
    for (const face of faces) for (const [col, row] of fillOrder(face)) order.push({ face: face.id, col, row });
    let k = 0;
    for (const f of films) for (let c = 0; c < f.copies && k < order.length; c++) this._put(order[k++], f);
  }

  _put({ face, col, row }, film) {
    this.slots.set(`${face}:${col}:${row}`, film);
    if (!this.where.has(film.id)) this.where.set(film.id, []);
    this.where.get(film.id).push({ face, col, row });
  }

  // The new release wall: alphabetical along each shelf of a bay, each
  // title's copies side by side, none split between two shelves.
  _stockNew(faces, fresh, rnd) {
    const runs = []; // [{ face, col, row, n }]
    for (const face of faces) {
      for (let b0 = 0; b0 < face.cols; b0 += face.bay) {
        const width = Math.min(face.bay, face.cols - b0);
        for (let row = 0; row < face.rows; row++) {
          let left = width;
          let col = b0;
          while (left > 0) {
            let n = between(4, 8, rnd);
            if (left - n < 3) n = left;
            runs.push({ face: face.id, col, row, n });
            col += n;
            left -= n;
          }
        }
      }
    }
    const films = runs.map((_, i) => {
      // Consume the same draws as the original shop so the other aisles
      // keep the same generated titles and IDs for existing worlds.
      const former = fresh(weighted(NEW_GENRES, rnd), { year: LEGACY_NEW_YEAR, section: 'new' });
      const entry = LINEUP.new[Math.floor(i / 2)];
      if (!entry) return former;
      const film = realFilm(entry, 'new', i % 2 === 0 ? 'DVD' : 'VHS');
      this.films[former.id] = film;
      return film;
    });
    films.sort(byTitle);
    this.bySection.set('new', films);
    runs.forEach((run, i) => {
      const f = films[i];
      f.copies = run.n;
      for (let c = 0; c < run.n; c++) this._put({ face: run.face, col: run.col + c, row: run.row }, f);
    });
  }

  // Each island's end facing the door is somebody's picks: one of each,
  // from what they like, with a card saying why.
  _stockPicks(faces, fresh, rnd) {
    const all = [];
    for (const face of faces) {
      const who = STAFF[face.staff % STAFF.length];
      const films = [];
      for (let i = 0; i < face.cols * face.rows; i++) {
        const former = fresh(pick(who.likes, rnd), { section: 'picks' });
        const note = pick(who.says, rnd);
        const entry = LINEUP[who.name][i];
        const film = entry ? realFilm(entry, 'picks', i % 3 === 0 ? 'DVD' : 'VHS') : former;
        film.staff = who.name;
        film.note = entry ? pick(['I always come back to this one.', 'A favorite from my shelf at home.', 'Worth a second watch.'], mulberry32(film.tmdbId)) : note;
        this.films[former.id] = film;
        films.push(film);
      }
      films.sort(byTitle);
      fillOrder(face).forEach(([col, row], k) => this._put({ face: face.id, col, row }, films[k]));
      all.push(...films);
    }
    this.bySection.set('picks', all);
  }

  at(face, col, row) {
    return this.slots.get(`${face}:${col}:${row}`) || null;
  }

  byId(id) {
    return this.ids.get(id) || null;
  }

  slotsOf(id) {
    return this.where.get(id) || [];
  }

  section(id) {
    return this.bySection.get(id) || [];
  }

  // The new releases nobody can have today: every copy out. Which ones
  // changes from day to day (day: days since 1970), the same for everyone.
  allOut(day, n = 2) {
    const list = this.section('new');
    if (!list.length) return new Set();
    const rnd = mulberry32((day * 7919 + list.length) >>> 0);
    const out = new Set();
    while (out.size < Math.min(n, list.length)) out.add(list[Math.floor(rnd() * list.length)].id);
    return out;
  }
}
