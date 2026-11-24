// The keys, read into what the skater (skater.js) is told each frame, and
// what to say they do. On the board:
//
//   W       push              in the air: kickflip
//   S       brake, slide it   in the air: heelflip
//   A D     carve             in the air: spin, you and the board
//   shift   crouch            in the air: shove-it, the board turned under you
//   space   ollie
//
// On a touch screen the stick does what W A S D do (pushed all the way, it's
// shift), holding the use button is shift, and a tap is space.

// input: the hiker's controls (player/input.js); c: the skater's, filled in -> c
export function readControls(input, c) {
  // with the map open (or anything else that has the keys), you drag a foot to a stop
  if (input.blocked) return Object.assign(c, { push: false, brake: 1, steer: 0, crouch: false, pop: false, flip: 0, shove: false });
  const ax = input.moveAxes();
  const low = input.running() || input.holding('use');
  c.push = ax.y > 0.3;
  c.brake = Math.max(0, -ax.y);
  c.steer = ax.x;
  c.crouch = low;
  c.pop = input.jumped();
  c.flip = Math.abs(ax.y) > 0.3 ? Math.sign(ax.y) : 0;
  c.shove = low;
  return c;
}

// What the keys do now, for the HUD's cue. off: how the act key is named (F).
export function cueFor(input, sk, off) {
  const touch = input.isTouch;
  if (sk.down >= 0) return 'bailed…';
  if (!sk.grounded) return touch ? 'stick: spin, flip · hold <b>use</b>: shove-it' : '<b>A D</b> spin · <b>W</b> kickflip · <b>S</b> heelflip · <b>shift</b> shove-it';
  return touch ? 'stick: push, carve, brake · hold <b>use</b>: crouch · tap: ollie' : `<b>W</b> push · <b>A D</b> carve · <b>S</b> brake · <b>shift</b> crouch · <b>space</b> ollie · <b>${off}</b> off`;
}
