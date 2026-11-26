// Who plays the DC Improv, and what they say: the comics and their sets,
// the house's host and announcer, and the improv troupe in the Lounge with
// the scenes they make up from the room's suggestions.
//
// The people are made up and so is every word they say, written for the
// game. The club is real (1140 Connecticut Avenue NW); its comics are not
// these. Nobody here is anyone, and nothing here is anyone's act.
//
// A line is [text, laugh]: laugh is how the room takes it, 0 (nothing:
// a setup) .. 3 (a big laugh, an applause break). A bit is a list of lines
// that go together, setup to tag. In a scene a line is [who, text, laugh],
// who being 'A' or 'B', the two improvisers in it.
//
// What each person looks like and sounds like is said beside them:
//   look    for people/body.js: her, skin (0..5, dark to light is 5..0),
//           hair (0..6), shirt and legs (hex), height (about 1), build
//   voice   for the browser's speech: pitch (0.5..1.5), rate (about 1), and
//           her, which of its voices to lean towards where it has both
//
// No three.js, no browser: the tests read it.

// ── The house ────────────────────────────────────────────────────────────────
// The voice from the booth before the show, and the host who opens it and
// brings each comic up.
export const ANNOUNCER = {
  name: 'the booth',
  voice: { pitch: 0.82, rate: 0.96, her: false },
  before: [
    ['Ladies and gentlemen, welcome to the DC Improv.', 0],
    ['Please silence your phones. No filming, no talking during the show, and absolutely no heckling. The comics bite.', 1],
    ['Your show starts now. Please welcome your host!', 0],
  ],
  lounge: [
    ['Ladies and gentlemen, welcome to the Lounge at the DC Improv. Phones off, minds open. Here we go.', 0],
  ],
};

// The host of the stand-up shows: opens, keeps it going between comics,
// and sends everyone home.
export const HOST = {
  id: 'dana',
  name: 'Dana Okafor',
  from: 'Silver Spring',
  voice: { pitch: 1.18, rate: 1.06, her: true },
  look: { her: true, skin: 4, hair: 0, shirt: 0xd8a032, legs: 0x23262e, height: 0.97, build: 0.98 },
  open: [
    ['How we doing, DC Improv!', 2],
    ['Welcome, welcome. Quick show of hands, who here actually lives in the District?', 0],
    ['Okay. And who drove in from Virginia?', 0],
    ['That’s fine. We have a parking garage and a grief counselor.', 2],
    ['And Maryland! I love you, Maryland. You’re the friend who lives forty minutes away and calls it right outside the city.', 2],
    ['I live in Silver Spring. It is not silver, and there is no spring. It’s a Whole Foods and a parking ticket.', 2],
  ],
  // between comics: one of these, then the next one brought up
  between: [
    [['Give it up one more time! How good was that?', 2]],
    [['My mom still thinks I work for the government. She tells people I’m a contractor.', 1], ['Technically I contract a cold every time I ride the Red Line.', 2]],
    [['Somebody up front just told me they’re an intern. Welcome! You’re going to love it here. For eleven weeks.', 2]],
    [['Make some noise if this is your first time at the Improv!', 1], ['Great. Don’t tell the comics. They can smell fear.', 2]],
    [['Are you all having a good time? Your servers are working hard, so tip them like you’re on an expense account.', 2]],
  ],
  // how a comic is brought up: {name}, {credit}
  intro: [
    'Okay! Your next comic is one of my favorites. {credit}. Please welcome {name}!',
    'Alright, keep that energy up for this next one. {credit}, here’s {name}!',
    'This next comic is the real deal. {credit}. Put your hands together for {name}!',
  ],
  headliner: 'And now it’s time for your headliner. {credit}. Ladies and gentlemen, {name}!',
  close: [
    ['That’s our show! Tip your servers, they’re the real heroes.', 1],
    ['Get home safe, and remember: stand on the right, walk on the left. Good night!', 2],
  ],
};

// ── The comics ───────────────────────────────────────────────────────────────
// Who's on the stand-up bill, and their material. `headliner`: closes a show.
// `credit` is how the host brings them up.
export const COMICS = [
  {
    id: 'marcus',
    name: 'Marcus Bell',
    from: 'Brookland',
    credit: 'born and raised right here in the District',
    voice: { pitch: 0.92, rate: 1.04, her: false },
    look: { her: false, skin: 5, hair: 6, shirt: 0x2e4c7a, legs: 0x1c1d22, height: 1.02, build: 1.04 },
    bits: [
      [
        ['I’m from DC. Born here. Which in this town makes me a rare animal.', 1],
        ['People find out I’m from here and look at me like I’m a panda at the zoo.', 2],
        ['Oh my God, a native! Can I take a picture? Do you eat bamboo?', 2],
        ['No. I eat half-smokes. With chili. Like God intended.', 2],
      ],
      [
        ['Let’s talk about the Metro escalators.', 0],
        ['Wheaton has the longest escalator in the Western Hemisphere. Two hundred and thirty feet.', 1],
        ['That is not a commute. That is a pilgrimage.', 2],
        ['You get on at the bottom single, you get off at the top married with two kids.', 3],
        ['And it’s broken half the time, so really it’s the longest stairs in the Western Hemisphere.', 2],
      ],
      [
        ['Tourists, I love you. But please. Stand on the right, walk on the left.', 1],
        ['It is the only rule this whole city agrees on.', 2],
        ['Congress can’t agree on lunch. But you stand on the left of that escalator, they will pass a bill against you by three o’clock.', 3],
      ],
      [
        ['People from out of town always ask me, what is mumbo sauce?', 0],
        ['It’s like if ketchup and barbecue sauce had a baby, and the baby moved to Northeast and got a little attitude.', 2],
        ['You can’t buy it in a store. You have to know a guy, who knows a carryout, that’s been open since 1987 and has never once had a sign.', 2],
      ],
      [
        ['My old neighborhood changed so much.', 0],
        ['The corner store where I used to buy chips is now a place that sells one candle. For sixty dollars.', 2],
        ['The candle is called Georgetown at Dusk. I’ve been to Georgetown at dusk. It smells like a parking garage and regret.', 3],
      ],
      [
        ['We don’t have senators here. We pay taxes like everybody else, and what we got was a license plate.', 1],
        ['Taxation without representation. That’s not a license plate. That’s a cry for help you can put on a Honda.', 3],
      ],
    ],
  },
  {
    id: 'priya',
    name: 'Priya Raman',
    from: 'Fairfax',
    credit: 'a former Hill staffer who escaped',
    voice: { pitch: 1.12, rate: 1.1, her: true },
    look: { her: true, skin: 3, hair: 0, shirt: 0x7a2a4a, legs: 0x2a2a30, height: 0.95, build: 0.94 },
    bits: [
      [
        ['In DC nobody asks your name. They ask what you do.', 1],
        ['I met a guy at a party, he said, what do you do? I said, I’m a comedian. He said, no, but what do you do?', 2],
        ['So I said, I work at a think tank. He said, oh, which one? I said, the one in my head. It’s full of anxiety and there’s no dental.', 3],
      ],
      [
        ['I used to work on the Hill. Everything was an acronym.', 0],
        ['We had an acronym for the acronyms. The O A A. The Office of Acronym Acronyms.', 2],
        ['My boss would say, get the N D A A language to O M B, C C the R S C, and loop in D O D by C O B.', 1],
        ['And I’d say, absolutely. And then I’d go to the bathroom and Google every single letter.', 3],
      ],
      [
        ['We had a meeting to plan the meeting about the meeting.', 1],
        ['And at the end of it, someone always says, let’s take this offline.', 1],
        ['Offline! We are in a basement. With no windows. We have never been more offline.', 2],
        ['We could die down there, and the only record would be a calendar invite that says, sync.', 3],
      ],
      [
        ['Everybody in this city wears their work badge out to dinner.', 1],
        ['You see somebody at a bar at eleven p.m. still wearing a lanyard, you know they’re having a great life.', 2],
        ['That is not a badge. That’s a leash with a photo on it.', 3],
      ],
      [
        ['DC summers. It’s not hot. It’s moist. It’s like living inside a dog’s mouth.', 2],
        ['People say they built this city on a swamp like it’s a metaphor. It’s not a metaphor. It’s a weather report.', 3],
      ],
      [
        ['My parents are so proud of me. But only in a very specific way.', 1],
        ['My mom tells her friends, Priya works in government. I quit three years ago.', 1],
        ['She will not say comedy. She’d rather tell people I’m in prison. At least prison is a federal job.', 3],
      ],
    ],
  },
  {
    id: 'gus',
    name: 'Gus Hallorann',
    from: 'Arlington',
    credit: 'a father of three from Arlington, Virginia, who has not slept since 2011',
    voice: { pitch: 0.84, rate: 0.98, her: false },
    look: { her: false, skin: 0, hair: 5, shirt: 0x5a6e4a, legs: 0x4a4038, height: 1.0, build: 1.12 },
    bits: [
      [
        ['I live in Arlington. I commute on the Beltway. Which is a circle.', 1],
        ['Think about that. Every day I spend two hours driving in a circle, and I end up exactly where I started.', 2],
        ['Which is also how my therapist describes my career.', 2],
      ],
      [
        ['I took my kids to the Air and Space Museum.', 0],
        ['The actual Wright Flyer. The Spirit of St. Louis. A real lunar module.', 1],
        ['My son’s favorite thing? The escalator.', 2],
        ['We drove two hours to look at an escalator. We have an escalator at the mall. It’s next to a Cinnabon. He does not care.', 2],
        ['My daughter just wanted the astronaut ice cream. Which, if you’ve never had it, tastes like a styrofoam cooler that’s proud of itself.', 3],
      ],
      [
        ['I’m at the age where my favorite place on earth is Costco.', 1],
        ['My wife and I used to go on dates to restaurants. Now we go to Costco and eat the samples like it’s a wedding buffet.', 2],
        ['I take a little paper cup of chicken, look her in the eye, and say, you look beautiful tonight.', 2],
        ['Then we buy forty rolls of paper towels, and that’s the most romantic thing I do all year.', 2],
      ],
      [
        ['My son is fifteen. He speaks to me exclusively in words I don’t understand.', 1],
        ['I asked him how school was. He said, it’s giving.', 1],
        ['Giving what? What is it giving? We pay a lot in property taxes. It better be giving.', 3],
      ],
      [
        ['Remember the cicadas? Every seventeen years a billion bugs crawl out of the ground, scream for a month, and die.', 1],
        ['Honestly? Relatable. That’s my retirement plan.', 2],
      ],
    ],
  },
  {
    id: 'tess',
    name: 'Tess Moreno',
    from: 'Columbia Heights',
    credit: 'one of the funniest people paying too much rent in Columbia Heights',
    voice: { pitch: 1.24, rate: 1.12, her: true },
    look: { her: true, skin: 2, hair: 2, shirt: 0x3a8a8a, legs: 0x30384a, height: 0.94, build: 0.93 },
    bits: [
      [
        ['I live in a studio in Columbia Heights. The listing called it cozy.', 1],
        ['Cozy means I can make toast and brush my teeth at the same time. Not that I want to.', 2],
        ['My landlord calls it efficiency living. Efficient for who? He’s charging me twenty-four hundred dollars to live in a hallway.', 3],
      ],
      [
        ['Dating in DC is hard, because every man on the apps is either in policy or between things.', 2],
        ['And every single guy’s first picture is at the Lincoln Memorial.', 1],
        ['Like, look, I’m next to a big man in a chair. I, too, am a big man in a chair.', 3],
      ],
      [
        ['DC loves brunch. Bottomless mimosas. Bottomless!', 1],
        ['Nothing says healthy coping mechanism like a city full of lawyers getting loaded at eleven a.m. on a Sunday.', 2],
        ['And then on Monday they all go back to work and write the laws. Explains a lot.', 3],
      ],
      [
        ['Have you seen the scooters? Grown adults in suits on electric scooters.', 1],
        ['Every morning on K Street there’s a man in a three-piece suit going twelve miles an hour, looking like the Monopoly guy escaped from the board.', 3],
      ],
      [
        ['Cherry blossom season. Two million people come to look at trees.', 1],
        ['And they bloom for, like, four days. It’s the shortest, most stressful holiday in America.', 2],
        ['The Park Service puts out a peak bloom forecast and people plan around it like a hurricane. Diane, we have to go now, the petals are making landfall!', 3],
      ],
    ],
  },
  {
    id: 'leon',
    name: 'Leon Park',
    from: 'Rockville',
    credit: 'the most relaxed man in Montgomery County',
    voice: { pitch: 0.9, rate: 0.9, her: false },
    look: { her: false, skin: 1, hair: 0, shirt: 0x1e1e22, legs: 0x1e1e22, height: 0.98, build: 0.95 },
    bits: [
      [
        ['I tried to walk to the Washington Monument.', 0],
        ['It’s one of those things that looks close the whole time. Like retirement.', 2],
      ],
      [
        ['My apartment has a view of the Capitol. If I stand on the toilet.', 1],
        ['Which I do. Patriotically.', 2],
      ],
      [
        ['I don’t have a lot of friends. I have a lot of people who accidentally replied all.', 2],
      ],
      [
        ['I named my wifi FBI Surveillance Van.', 1],
        ['Anywhere else, the neighbors get nervous. Here, two of them asked if we’re hiring.', 3],
      ],
      [
        ['I’m trying to be more spontaneous. So I put be spontaneous in my calendar as a recurring event.', 1],
        ['Thursdays at four. It’s going great.', 2],
      ],
      [
        ['I’m a minimalist. That’s what I call it. My landlord calls it not having furniture.', 2],
      ],
      [
        ['I went on a ghost tour of Georgetown.', 0],
        ['The most haunted thing I saw was the price of a cupcake.', 2],
      ],
      [
        ['My parents wanted me to be a doctor. I’m a comedian. So technically I still see a lot of people who think they’re dying.', 2],
      ],
    ],
  },
  {
    id: 'nora',
    name: 'Nora Feld',
    from: 'Takoma Park',
    credit: 'a former tour guide on the National Mall',
    voice: { pitch: 1.06, rate: 1.04, her: true },
    look: { her: true, skin: 1, hair: 4, shirt: 0xc85a3a, legs: 0x3a3a48, height: 0.96, build: 1.0 },
    bits: [
      [
        ['I used to be a tour guide on the Mall. You learn things.', 0],
        ['The most asked question at the Lincoln Memorial is not about Lincoln. It’s, where’s the bathroom.', 2],
        ['The second most asked question is, is he real? Ma’am. He is nineteen feet tall and made of marble. If he’s real, we have bigger problems.', 3],
      ],
      [
        ['People ask, why is the Washington Monument two colors?', 0],
        ['Because they ran out of money halfway up, and finished it twenty years later with different rock.', 1],
        ['It is the most American building in the city. It is literally a project that stalled and came back over budget.', 3],
      ],
      [
        ['Every single day, somebody would point at the Capitol and say, is that the White House?', 1],
        ['No. But I respect your confidence. You should run for something.', 2],
      ],
      [
        ['People get so emotional about the pandas.', 0],
        ['We sent them back to China and this whole city went into mourning. Like a breakup. Who gets custody of the bamboo?', 2],
        ['Then China sent us two new pandas, and we all acted like nothing happened. That is the healthiest relationship in Washington.', 3],
      ],
    ],
  },
  {
    id: 'earl',
    name: 'Earl Simmons',
    from: 'Waldorf, Maryland',
    credit: 'you know him, you love him, all the way from Waldorf, Maryland',
    headliner: true,
    voice: { pitch: 0.74, rate: 0.94, her: false },
    look: { her: false, skin: 5, hair: 5, shirt: 0x6a2a2a, legs: 0x2a2620, height: 1.03, build: 1.18 },
    bits: [
      [
        ['I’m from Waldorf, Maryland. We take crabs very seriously.', 1],
        ['Picking a crab is the only thing on earth where you work forty-five minutes for one teaspoon of food.', 2],
        ['My uncle can pick a crab in eleven seconds. He can’t read a map. Can’t work a phone. But put a crab in front of that man, he’s a surgeon.', 3],
        ['And people say you can’t put Old Bay on everything. That’s what a coward would say.', 3],
      ],
      [
        ['I’m getting older. I went to the doctor. He said, Earl, you need to cut back on salt, sugar, and fried food.', 1],
        ['I said, doc, that’s not a diet. That’s a list of my friends.', 3],
      ],
      [
        ['My wife doesn’t trust the GPS.', 0],
        ['The GPS says turn left. She says, don’t listen to her.', 2],
        ['Thirty-one years married, and she’s jealous of a robot lady who lives in the dashboard.', 2],
        ['And honestly? That GPS lady has never once asked me where I’m going in that tone.', 3],
      ],
      [
        ['My grandson set up my phone so I can talk to it.', 0],
        ['Now I say, call my wife, and it says, calling wife. And she picks up and says, why are you calling me, I’m in the kitchen.', 2],
        ['And I say, I know, baby. The phone wanted something to do.', 2],
      ],
      [
        ['Every time I drive into DC, I end up in a circle.', 1],
        ['Dupont Circle. Logan Circle. Thomas Circle. Somebody told me they built it like that so the British would get lost.', 1],
        ['And it worked! My cousin went into Scott Circle in 1998. We still get postcards.', 3],
      ],
      [
        ['But I love y’all. I love this city.', 1],
        ['Where else can you get yelled at by a man on a Segway who is also giving you a history lesson?', 2],
        ['You’ve been beautiful. I’m Earl Simmons, good night!', 3],
      ],
    ],
  },
];

// ── The Lounge: improv ───────────────────────────────────────────────────────
// Point of Order, the house troupe: a host who asks the room for
// suggestions, and four players, two to a scene.
export const TROUPE = {
  name: 'Point of Order',
  host: {
    id: 'shauna',
    name: 'Shauna Pike',
    voice: { pitch: 1.1, rate: 1.08, her: true },
    look: { her: true, skin: 5, hair: 6, shirt: 0xe8c040, legs: 0x1c1c24, height: 0.98, build: 1.0 },
  },
  players: [
    { id: 'kim', name: 'Kim Alvarez', voice: { pitch: 1.2, rate: 1.1, her: true }, look: { her: true, skin: 2, hair: 1, shirt: 0x8a3a8a, legs: 0x22222a, height: 0.95, build: 0.95 } },
    { id: 'raffi', name: 'Raffi Dunn', voice: { pitch: 0.95, rate: 1.08, her: false }, look: { her: false, skin: 1, hair: 3, shirt: 0x3a6a3a, legs: 0x3a3a44, height: 1.01, build: 1.0 } },
    { id: 'jo', name: 'Jo Whitaker', voice: { pitch: 1.04, rate: 1.04, her: true }, look: { her: true, skin: 0, hair: 4, shirt: 0x2a5a9a, legs: 0x2a2a2a, height: 0.97, build: 0.97 } },
    { id: 'dev', name: 'Dev Kapoor', voice: { pitch: 0.86, rate: 1.0, her: false }, look: { her: false, skin: 3, hair: 0, shirt: 0xb84a2a, legs: 0x26262c, height: 1.0, build: 1.06 } },
  ],
  open: [
    ['Hello, hello! Welcome to the Lounge! We are Point of Order, and everything you see tonight is made up on the spot.', 1],
    ['Which means if it’s bad, it’s your fault. You gave us the suggestions.', 2],
  ],
  close: [
    ['That’s our show! We’ve been Point of Order. Thank you for your suggestions, they were all terrible and we loved them. Good night!', 2],
  ],
  // between games
  between: [
    [['Give it up for them!', 1]],
    [['Wow. I have never been prouder, or more confused.', 2]],
    [['Okay! That happened. Let’s keep going.', 1]],
  ],
};

// The games: the host asks for a suggestion, the room shouts some out, the
// host takes one, and two players make up a scene from it. Each scene is
// what they made of that suggestion.
export const GAMES = [
  {
    id: 'scene',
    title: 'a scene from a place',
    ask: 'For our first scene, can I get a suggestion of a place? Anywhere at all.',
    took: 'I heard {s}! A scene, in {s}.',
    scenes: {
      'a laundromat': [
        ['A', 'Excuse me, is this dryer taken?', 0],
        ['B', 'That dryer has been running since 2009. Nobody knows whose clothes are in there.', 2],
        ['A', 'Somebody should open it.', 0],
        ['B', 'Oh, people have tried. Gary opened it once. Gary’s in there now.', 2],
        ['A', 'I came in here with forty socks. I have one left.', 1],
        ['B', 'That’s the toll. The machines take one sock a visit. It’s in the lease.', 2],
        ['A', 'What lease?', 0],
        ['B', 'You signed it when you put the quarter in. Didn’t you read the tiny writing on the quarter?', 2],
        ['A', 'I thought that said in God we trust.', 1],
        ['B', 'And now you know why.', 3],
      ],
      'the DMV': [
        ['A', 'Number four hundred and twelve?', 0],
        ['B', 'That’s me! I’ve been waiting since I was a child.', 2],
        ['A', 'What brings you in today?', 0],
        ['B', 'I’d like to renew my license.', 0],
        ['A', 'Wonderful. Do you have proof of address, proof of identity, and proof that you have been sad for at least three hours?', 2],
        ['B', 'I’ve got four hours of sad. I can show you the receipts.', 1],
        ['A', 'Perfect. Now look into the camera, and do not smile.', 0],
        ['B', 'I wasn’t going to.', 2],
        ['A', 'Hm. The computer says you’re dead.', 1],
        ['B', 'I’m standing right here!', 0],
        ['A', 'That’s what all the dead people say. Take a number.', 3],
      ],
      'a submarine': [
        ['A', 'Captain, we are at a depth of eight hundred feet.', 0],
        ['B', 'Excellent. And how is morale?', 0],
        ['A', 'Low, sir. Somebody microwaved fish.', 2],
        ['B', 'On a submarine? There are no windows! That smell lives here now!', 2],
        ['A', 'It’s the cook, sir. He says it’s his grandmother’s recipe.', 0],
        ['B', 'Was his grandmother at war with us?', 3],
        ['A', 'Sir, sonar is picking up another submarine off the port side. They’re asking if we have any ketchup.', 2],
        ['B', 'Tell them we are at war.', 1],
        ['A', 'With who, sir?', 0],
        ['B', 'With whoever made the fish.', 3],
      ],
      'a bakery': [
        ['A', 'Welcome to Crumbs, how can I help you?', 0],
        ['B', 'I need a cake for my boss’s retirement party.', 0],
        ['A', 'Of course. What would you like it to say?', 0],
        ['B', 'Congratulations, Dennis. And then underneath, in smaller letters, finally.', 2],
        ['A', 'Ooh. We can do finally in red.', 1],
        ['B', 'Can you put a little fondant Dennis on top? He’s always standing right behind you, reading your screen.', 2],
        ['A', 'So, a little fondant man, but sort of looming.', 2],
        ['B', 'Exactly. And if you look away, he’s slightly closer.', 2],
        ['A', 'Ma’am, that is a haunted cake.', 2],
        ['B', 'That’s what Dennis was. A haunted cake.', 3],
      ],
    },
  },
  {
    id: 'expert',
    title: 'the expert',
    ask: 'Next, we need an expert. What should our expert be an expert in? Shout it out!',
    took: 'I heard {s}! Our expert, on {s}.',
    scenes: {
      pigeons: [
        ['A', 'Welcome back to Ask an Expert. My guest is the world’s leading authority on pigeons. Doctor, thanks for coming.', 0],
        ['B', 'Coo.', 2],
        ['A', 'I’m sorry?', 0],
        ['B', 'Forgive me. I’ve been in the field a long time.', 2],
        ['A', 'What do people get wrong about pigeons?', 0],
        ['B', 'They think pigeons are dumb. Pigeons are brilliant. They live in every city on earth and not one of them pays rent.', 2],
        ['A', 'Where do they go at night?', 0],
        ['B', 'Meetings. Every pigeon you see is on its way to a meeting about you.', 2],
        ['A', 'About me?', 0],
        ['B', 'You dropped half a pretzel outside Union Station in 2017. They have not forgotten.', 3],
      ],
      'the moon': [
        ['A', 'Joining us tonight, a leading expert on the moon. What don’t people know about the moon?', 0],
        ['B', 'It’s not that far. It’s about the same distance as Bethesda in rush hour.', 3],
        ['A', 'Is it true there was once a man in the moon?', 0],
        ['B', 'There was. He moved out. Nothing to do on a Friday.', 2],
        ['A', 'Why does the moon follow us when we drive?', 0],
        ['B', 'Loneliness.', 2],
        ['A', 'And can you see the moon in the daytime?', 0],
        ['B', 'You can. She’s just not wearing any makeup, so please, no pictures.', 3],
      ],
      bagels: [
        ['A', 'Today our guest is a bagel scientist.', 0],
        ['B', 'Technically, I’m a carbohydrate engineer.', 1],
        ['A', 'What makes the perfect bagel?', 0],
        ['B', 'You boil it before you bake it. Which is also what happens to everybody in this city every August.', 2],
        ['A', 'Why is there a hole in the middle?', 0],
        ['B', 'So the bagel has somewhere to put its feelings.', 2],
        ['A', 'What’s the strangest bagel you’ve ever seen?', 0],
        ['B', 'Blueberry. A blueberry bagel is a muffin in witness protection.', 3],
      ],
      'tax season': [
        ['A', 'Our expert tonight knows everything about tax season. Welcome.', 0],
        ['B', 'Thank you. Please don’t make any sudden movements. I’ve been awake since January.', 2],
        ['A', 'What’s the most common mistake people make?', 0],
        ['B', 'Opening the envelope.', 2],
        ['A', 'Is it true you can deduct your home office?', 0],
        ['B', 'Only if it’s an office. If it’s your bed and a laptop, that’s not an office, that’s a cry for help.', 2],
        ['A', 'Any final advice?', 0],
        ['B', 'Keep every receipt. Put them in a shoebox. Then put the shoebox in the ocean.', 3],
      ],
    },
  },
  {
    id: 'date',
    title: 'a first date',
    ask: 'Last one tonight. A first date, and one of them has a job. Can I get an occupation?',
    took: 'I heard {s}! A first date, with {s}.',
    scenes: {
      'a magician': [
        ['A', 'So. What do you do?', 1],
        ['B', 'I’m a magician.', 0],
        ['A', 'Oh, fun! Like birthday parties?', 0],
        ['B', 'Mostly divorces. I make half of everything disappear.', 3],
        ['A', 'Can you do a trick for me?', 0],
        ['B', 'Pick a card. Any card.', 0],
        ['A', 'Okay. I’ve got one.', 0],
        ['B', 'Is it the check? Because I have to go to the bathroom.', 3],
        ['A', 'Wait. Are you leaving?', 0],
        ['B', 'I’m a magician. I’m vanishing.', 2],
      ],
      'an astronaut': [
        ['A', 'So. What do you do?', 1],
        ['B', 'I’m an astronaut.', 0],
        ['A', 'Wow. What’s the hardest part?', 0],
        ['B', 'Dating. Every relationship I have is long distance. Two hundred and fifty miles straight up.', 2],
        ['A', 'Do you get lonely up there?', 0],
        ['B', 'No. Seven people in a can. We’ve all seen each other floss.', 2],
        ['A', 'That’s very intimate.', 0],
        ['B', 'Commander Diaz chews with her mouth open. In zero gravity. I have seen it go by.', 3],
        ['A', 'This is a great first date.', 0],
        ['B', 'Sorry. I’m used to talking to people who can’t leave.', 3],
      ],
      'a lifeguard': [
        ['A', 'So. What do you do?', 1],
        ['B', 'I’m a lifeguard.', 0],
        ['A', 'Oh, nice. At the beach?', 0],
        ['B', 'At a hotel pool in Crystal City. Four feet deep. Nobody has ever needed me.', 2],
        ['A', 'That sounds relaxing.', 0],
        ['B', 'It is not. I am always ready. I haven’t blinked since 2019.', 2],
        ['A', 'Would you save me if I was drowning?', 0],
        ['B', 'If you were drowning in four feet of water, at a Marriott, between ten and six? Absolutely.', 3],
        ['A', 'What if it was five past six?', 0],
        ['B', 'Then I would be very sad for you. Off the clock.', 2],
      ],
      'a dentist': [
        ['A', 'So. What do you do?', 1],
        ['B', 'I’m a dentist.', 0],
        ['A', 'Oh, I love that. I should probably come in. It’s been a while.', 0],
        ['B', 'How long is a while?', 0],
        ['A', 'Do you count the time I chipped a tooth on a lobster?', 2],
        ['B', 'Open up. Just a little. I can’t help it.', 1],
        ['A', 'On a first date?', 0],
        ['B', 'Oh, no. No, no, no. Have you been flossing?', 1],
        ['A', 'Yes.', 0],
        ['B', 'Lies on the first date. This is going so well.', 3],
      ],
    },
  },
];

// What the room shouts when the host asks for a suggestion, besides the
// one that's taken: anyone can call out anything.
export const HECKLES = ['a zoo!', 'Costco!', 'the Pentagon!', 'a hot tub!', 'Ohio!', 'jazz!', 'the Metro!', 'soup!'];
