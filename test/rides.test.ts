// Who has you: one ride at a time, and whose it is (src/player/rides.ts).

import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { Rides, type Aboard, type Carrier, type LostWhy } from '../src/player/rides.ts';

// As much of the hiker as the rides need: where they are, and the two things
// that can have them.
function hiker() {
  const player = { pos: { x: 0, y: 0, z: 0 }, carrier: null as Carrier | null, aboard: null as Aboard | null };
  // (a Rides is handed the Player; this stands in for it)
  const rides = new Rides(player as never);
  // what the player does each frame: ask the rides, then be put where what moves it says
  const frame = () => {
    rides.check();
    if (!player.aboard) return;
    const at = { x: 0, y: 0, z: 0, yaw: 0, grounded: true, behind: 0, back: 0, wade: 0, flowX: 0, flowZ: 0 };
    player.aboard.place(at, 1 / 60);
    Object.assign(player.pos, { x: at.x, y: at.y, z: at.z });
    rides.placed(at.x, at.y, at.z);
  };
  return { player, rides, frame };
}
const horse = (): Carrier => ({ walk: 2, run: 9, swim: 1, depth: 1.4, radius: 0.6, height: 2.4, eye: 2.3, back: 2, agility: 4, turn: 3, push: 0.5 });
// something that carries you along x at `speed` m a frame
const tube = (speed = 1, slack?: number): Aboard & { x: number } => ({
  x: 0,
  slack,
  place(out) {
    this.x += speed;
    out.x = this.x;
  },
});

test('a ride takes you, and you are its until it lets go', () => {
  const { player, rides } = hiker();
  assert.ok(rides.free);
  assert.equal(rides.by, null);
  const carrier = horse();
  const hold = rides.take({ by: 'mounts', what: 'your horse', carrier });
  assert.ok(hold && hold.held);
  assert.equal(player.carrier, carrier);
  assert.equal(player.aboard, null);
  assert.ok(!rides.free);
  assert.equal(rides.by, 'mounts');
  hold.release();
  assert.ok(rides.free && !hold.held);
  assert.equal(player.carrier, null);
  hold.release(); // (twice does nothing)
  assert.ok(rides.free);
});

test('while one has you no other can, and it can say what you would have to get off', () => {
  const { player, rides } = hiker();
  const canoe = horse();
  const first = rides.take({ by: 'boats', what: 'the canoe', carrier: canoe });
  let lost = 0;
  const second = rides.take({ by: 'mounts', what: 'your turtle', carrier: horse(), lost: () => void lost++ });
  assert.equal(second, null, 'the turtle does not get you out of the canoe');
  assert.equal(player.carrier, canoe, 'which still has you');
  assert.equal(rides.why(), 'get off the canoe first');
  assert.equal(lost, 0);
  first!.release();
  assert.equal(rides.why(), '');
  const name = { kind: 'horse' };
  const third = rides.take({ by: 'mounts', what: () => `your ${name.kind}`, carrier: horse() });
  assert.ok(third);
  name.kind = 'eagle';
  assert.equal(rides.what, 'your eagle', 'named as it is now');
});

test('a ride can change what it has you by, and only while it has you', () => {
  const { player, rides } = hiker();
  const afloat = horse();
  const slide = tube();
  const hold = rides.take({ by: 'boats', what: 'the canoe', carrier: afloat })!;
  hold.set({ aboard: slide }); // slid down the bank
  assert.equal(player.aboard, slide);
  assert.equal(player.carrier, afloat, 'what was not named stays');
  hold.set({ aboard: null }); // and floats
  assert.equal(player.aboard, null);
  hold.release();
  hold.set({ carrier: afloat });
  assert.equal(player.carrier, null, 'let go of, it sets nothing');
});

test('put somewhere else, further than its slack, what moves you has lost you', () => {
  const { player, rides, frame } = hiker();
  const said: LostWhy[] = [];
  const mover = tube(1, 4);
  rides.take({ by: 'tubing', what: 'your tube', aboard: mover, lost: (why) => void said.push(why) });
  for (let i = 0; i < 5; i++) frame();
  assert.equal(player.pos.x, 5, 'carried along');
  assert.deepEqual(said, []);
  player.pos.x += 3; // nudged, within the slack
  frame();
  assert.deepEqual(said, []);
  player.pos.x = 500; // a teleport
  frame();
  assert.deepEqual(said, ['moved']);
  assert.ok(rides.free, 'and you are on your own feet when it is told');
  assert.equal(player.pos.x, 500, 'left where you were put');
});

test('up or down counts as far as along', () => {
  const { player, rides, frame } = hiker();
  let lost = false;
  rides.take({ by: 'gliding', what: 'your hang glider', aboard: tube(0, 4), lost: () => void (lost = true) });
  frame();
  player.pos.y = -30; // set down on the ground from high up
  frame();
  assert.ok(lost);
});

test('without a slack, being moved is the ride’s own business', () => {
  const { player, rides, frame } = hiker();
  let lost = false;
  const seat = tube(0);
  rides.take({ by: 'railway', what: 'the train', aboard: seat, lost: () => void (lost = true) });
  frame();
  player.pos.x = 500;
  frame();
  assert.ok(!lost && !rides.free);
  assert.equal(player.pos.x, 0, 'a train puts you back in your seat');
});

test('the first frame after it takes you is not a move, wherever you were', () => {
  const { player, rides, frame } = hiker();
  let lost = false;
  rides.take({ by: 'tubing', what: 'your tube', aboard: tube(1, 4) });
  frame();
  rides.drop();
  player.pos.x = 900; // somewhere else altogether, and into another
  const far = tube(1, 4);
  far.x = 880; // which takes you to where it is, a long hop
  rides.take({ by: 'racetrack', what: 'your car', aboard: far, lost: () => void (lost = true) });
  frame();
  frame();
  assert.ok(!lost);
});

test('something that sets what carries you over a ride’s head has you, and the ride is told', () => {
  const { player, rides } = hiker();
  const said: LostWhy[] = [];
  const hold = rides.take({ by: 'jetpack', what: 'your jetpack', carrier: horse(), lost: (why) => void said.push(why) })!;
  const other = horse();
  player.carrier = other; // (nothing in the game does this; the console might)
  rides.check();
  assert.deepEqual(said, ['taken']);
  assert.ok(!hold.held);
  assert.equal(player.carrier, other, 'what was set is left alone');
  assert.equal(rides.by, null);
  assert.equal(rides.why(), 'get off what you’re on first');
  hold.release();
  assert.equal(player.carrier, other, 'and letting go late does not take it away');
});

test('drop takes you from whatever has you', () => {
  const { player, rides } = hiker();
  const said: LostWhy[] = [];
  rides.take({ by: 'mounts', what: 'your horse', carrier: horse(), lost: (why) => void said.push(why) });
  rides.drop();
  assert.deepEqual(said, ['taken']);
  assert.ok(rides.free);
  player.carrier = horse(); // had by something that did not ask
  rides.drop();
  assert.ok(rides.free);
});

// ── The real ones ───────────────────────────────────────────────────────────

test('nothing but the player sets what carries or moves you: rides ask', () => {
  // Setting player.carrier or player.aboard from a feature is how two rides
  // came to have you at once. Read as text, like the rules in features.test.js.
  const SRC = new URL('../src/', import.meta.url).pathname;
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) {
        if (!path.endsWith('world/hikes') && !path.endsWith('src/player')) walk(path);
      } else if (/\.(js|ts)$/.test(name)) files.push(path);
    }
  };
  walk(SRC);
  assert.ok(files.length > 100, 'they were found');
  for (const file of files) {
    const text = readFileSync(file, 'utf8').replace(/\/\/.*$/gm, '');
    const set = text.match(/\bplayer\.(carrier|aboard) = /);
    assert.ok(!set, `${file.slice(SRC.length)} sets ${set?.[0]}…: ask for the hiker with player.rides.take() instead (src/player/rides.ts)`);
  }
});
