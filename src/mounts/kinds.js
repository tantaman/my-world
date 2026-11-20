// The three mounts: what they're called, how they take to being walked up
// to, how they carry you (Player.carrier), and what the forest says of them
// before you've found them.
//
//   horse   fast over open ground and quick to jump; swims, but slowly
//   turtle  slow as anything on land, and fast through any water
//   eagle   flies: space to climb, shift to stoop
//
// Speeds are m/s, distances m, times s.

export const MOUNTS = {
  horse: {
    name: 'horse',
    wild: 'a wild horse',
    // How it takes to you while it's wild:
    //   notice  it looks up and watches you from this far off
    //   wary    come closer than this at more than `spook` m/s and it bolts
    //   reach   how close to be to calm it (m from its middle)
    //   calm    seconds of standing quietly with it to win it over
    taming: { notice: 45, wary: 16, spook: 3.4, reach: 4.2, calm: 4 },
    carrier: {
      walk: 4.2, // a trot
      run: 11.5, // a gallop
      swim: 1.6,
      depth: 1.35,
      jump: 7.4,
      radius: 0.5,
      height: 2.6,
      eye: 2.45,
      back: 2.4,
      agility: 3,
      turn: 5,
      push: 0.5,
      fly: null,
    },
    // what you hear of it, and what is said
    call: 'whinny',
    heard: 'a horse whinnies',
    rumour: 'a wild horse has been seen grazing in a big meadow',
    signs: 'fresh hoofprints in the grass: the horse is close',
    seen: 'there it is: a wild horse',
    howTo: 'walk up to it slowly (no running), then hold',
    keys: '<b>shift</b> gallop · <b>space</b> jump',
    colour: '#e0a86a',
  },
  turtle: {
    name: 'turtle',
    wild: 'a great snapping turtle',
    taming: { notice: 30, wary: 10, spook: 3.0, reach: 3.6, calm: 5 },
    carrier: {
      walk: 0.55,
      run: 1.0,
      swim: 5.2,
      swimRun: 8.5,
      depth: 0.42,
      jump: 0,
      radius: 0.75,
      height: 1.9,
      eye: 1.7,
      back: 1.8,
      agility: 2.2,
      turn: 3,
      push: 0.15,
      fly: null,
    },
    call: 'plunge',
    heard: 'something big slides into the water',
    rumour: 'an old snapping turtle, as big as a rowing boat, lives in a lake',
    signs: 'a broad track through the mud, down to the water: the turtle is close',
    seen: 'there it is: a great snapping turtle',
    howTo: 'wade out to it quietly, then hold',
    keys: '<b>shift</b> swim hard',
    colour: '#7cc49a',
  },
  eagle: {
    name: 'eagle',
    wild: 'a great golden eagle',
    taming: { notice: 50, wary: 18, spook: 3.0, reach: 4.6, calm: 6 },
    carrier: {
      walk: 1.3,
      run: 2.6,
      swim: 0.8,
      depth: 0.6,
      jump: 0,
      radius: 0.7,
      height: 2.4,
      eye: 2.3,
      back: 5,
      agility: 4,
      turn: 4,
      push: 0.3,
      fly: { cruise: 13, fast: 20, climb: 6, glide: -0.7, dive: -11, ceiling: 90, agility: 1.6 },
    },
    call: 'eagle',
    heard: 'an eagle screams, high up',
    rumour: 'a golden eagle big enough to carry a person nests on a high summit',
    signs: 'a feather longer than your arm, caught in the grass: the eagle is close',
    seen: 'there it is: a great golden eagle',
    howTo: 'climb up to it slowly, then hold',
    keys: '<b>space</b> take off / climb · <b>shift</b> stoop',
    colour: '#e6c454',
  },
};

// Your own mount, and how it gets on:
//   REACH   close enough to climb on (m, from its middle)
//   NEAR    a tame one left here stays drawn while you're this close (m)
//   COME    called from further than this, it turns up out of sight and comes the rest of the way
export const REACH = 3.4;
export const NEAR = 300;
export const COME = 140;
