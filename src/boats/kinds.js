// The boats you can build: what each costs, how long it takes, how big it is,
// and how it carries you (Player.carrier).
//
//   canoe   hollowed out of one big log: slow to make, quick and nimble on
//           the water
//   raft    logs lashed side by side: soon made, but it takes a lot of wood,
//           and it's slow, broad and goes where the current takes it
//
// Speeds are m/s, distances m, times s.

export const BOATS = {
  canoe: {
    name: 'canoe',
    a: 'a dugout canoe',
    // what it takes to make: metres of log, and seconds of holding the button
    log: 5,
    work: 16,
    // what you get back breaking it up
    back: 3,
    how: 'hollow out a dugout canoe',
    verb: 'hollowing it out',
    // its size: overall length and beam, how high the gunwale stands over the
    // keel, and how deep it sits in the water when it's floating empty
    len: 4.4,
    beam: 0.8,
    rim: 0.42,
    draft: 0.1,
    // where you sit: how far back of the middle, and how high over the keel
    seat: { z: -0.7, y: 0.14 },
    // sitting down in it: legs out in front of you, knees up
    pose: { spread: 0.13, hang: 0.1, fwd: 0.55, lean: 0.06, reins: 0 },
    carrier: {
      walk: 0.7, // pushing off the bottom, aground
      run: 1.0,
      swim: 2.6, // paddling
      swimRun: 4.4, // ...hard (shift)
      depth: 0.1,
      keel: 0.22,
      bow: 1.9,
      jump: 0,
      radius: 0.42,
      height: 1.5,
      eye: 1.15,
      back: 1.6,
      agility: 1.3,
      turn: 2.2,
      push: 0.8,
      fly: null,
    },
  },
  raft: {
    name: 'raft',
    a: 'a raft',
    log: 12,
    work: 9,
    back: 8,
    how: 'lash a raft',
    verb: 'lashing it',
    len: 3.4,
    beam: 2.1,
    rim: 0.36,
    draft: 0.1,
    seat: { z: -0.35, y: 0.34 },
    pose: { spread: 0.13, hang: 0.08, fwd: 0.5, lean: 0.08, reins: 0 },
    carrier: {
      walk: 0.5,
      run: 0.8,
      swim: 1.3,
      swimRun: 2.1,
      depth: 0.1,
      keel: 0.24,
      bow: 1.5,
      jump: 0,
      radius: 0.9,
      height: 1.5,
      eye: 1.3,
      back: 2.2,
      agility: 0.8,
      turn: 1.3,
      push: 0.95,
      fly: null,
    },
  },
};

export const KINDS = Object.keys(BOATS);

// With something in your hands other than the paddle (a fishing rod), you
// can only scull yourself along one-handed: this much of the paddling speed.
export const SCULL = 0.3;
