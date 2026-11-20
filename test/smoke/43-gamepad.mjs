// A game controller: plugged in (a stand-in one: the browser is headless),
// its sticks walk and look, A jumps, the shoulder buttons go along the tool
// bar, select opens the map, the d-pad goes from button to button in it, and
// B or select closes it; start shows the help panel with the pad's buttons
// on it. A key puts the pad down again.
//
// Needs nothing of the parts before it. Leaves the tool in hand as it found
// it, the map and the help panel shut, and the pad unplugged.

import assert from 'node:assert/strict';

// T.pad: plug(on), press(code, down), stick('left' | 'right', x, y), and
// tap(code): press, a few frames, let go. Buttons in the standard order.
export function inPage() {
  const ORDER = ['PadA', 'PadB', 'PadX', 'PadY', 'PadLB', 'PadRB', 'PadLT', 'PadRT', 'PadSelect', 'PadStart', 'PadL3', 'PadR3', 'PadUp', 'PadDown', 'PadLeft', 'PadRight'];
  const pad = {
    id: 'Stand-in pad (STANDARD GAMEPAD Vendor: 045e Product: 0b13)',
    index: 0,
    mapping: 'standard',
    connected: true,
    timestamp: 0,
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
  };
  let plugged = false;
  const real = navigator.getGamepads ? navigator.getGamepads.bind(navigator) : () => [];
  Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => (plugged ? [pad] : real()) });
  const press = (code, down) => Object.assign(pad.buttons[ORDER.indexOf(code)], { pressed: down, touched: down, value: down ? 1 : 0 });
  window.T.pad = {
    plug: (on) => void (plugged = on),
    press,
    stick(which, x, y) {
      const i = which === 'left' ? 0 : 2;
      pad.axes[i] = x;
      pad.axes[i + 1] = y;
    },
    async tap(code) {
      press(code, true);
      await window.T.frames(3);
      press(code, false);
      await window.T.frames(3);
    },
  };
}

export default async function ({ page, step, key, frames }) {
  await step('a game controller', async () => {
    const pad = (fn, ...args) => page.evaluate(fn, ...args);
    const at = () => pad(() => ({ x: world.player.pos.x, z: world.player.pos.z, camYaw: world.player.camYaw, camDist: world.player.camDist, tool: world.builder.tool }));
    await pad(() => T.pad.plug(true));
    const before = await at();

    // the left stick walks, the way the camera looks
    await pad(() => T.pad.stick('left', 0, -1));
    await frames(40);
    await pad(() => T.pad.stick('left', 0, 0));
    const walked = await at();
    const far = Math.hypot(walked.x - before.x, walked.z - before.z);
    assert.ok(far > 0.5, `the left stick walks (${far.toFixed(2)} m)`);
    assert.equal(await pad(() => world.input.padInUse), true, 'and the pad is in hand');

    // the right stick turns the camera; the d-pad zooms
    await pad(() => T.pad.stick('right', 1, 0));
    await frames(20);
    await pad(() => T.pad.stick('right', 0, 0));
    await pad(() => T.pad.press('PadDown', true));
    await frames(20);
    await pad(() => T.pad.press('PadDown', false));
    const looked = await at();
    assert.ok(looked.camYaw < walked.camYaw - 0.1, 'the right stick turns the camera');
    assert.ok(looked.camDist > walked.camDist, 'd-pad down draws it back');

    // A jumps
    const jumped = await pad(async () => {
      T.pad.press('PadA', true);
      const up = await T.until(() => world.player.vel.y > 0.5, 3000);
      T.pad.press('PadA', false);
      await T.until(() => world.player.grounded, 5000);
      return up;
    });
    assert.ok(jumped, 'A jumps');

    // the shoulder buttons go along the tool bar
    await pad(() => T.pad.tap('PadRB'));
    const next = await at();
    assert.notEqual(next.tool, before.tool, 'RB takes the next tool');
    await pad(() => T.pad.tap('PadLB'));
    assert.equal((await at()).tool, before.tool, 'LB the one before');

    // with a spade over the ground, what it would do names the triggers
    const prompt = await pad(async (had) => {
      const p = world.player.pos;
      await T.aimGround(p.x + 2, p.z + 2);
      world.builder.select('shovel', true);
      await T.frames(5);
      const said = T.prompt();
      world.builder.select(had, true);
      await T.frames(3);
      return said;
    }, before.tool);
    assert.match(prompt, /hold RT/, `the prompt names the triggers (${prompt})`);
    assert.doesNotMatch(prompt, /click/, 'not the mouse');

    // select opens the map; B closes it, and so does select
    const map = () => pad(() => document.getElementById('map').getAttribute('aria-hidden'));
    await pad(() => T.pad.tap('PadSelect'));
    await frames(10);
    assert.equal(await map(), 'false', 'select opens the map');
    const focus = () => pad(() => {
      const at = document.activeElement;
      return at && at.tagName === 'BUTTON' && document.getElementById('map').contains(at) ? at.textContent.trim() || at.getAttribute('aria-label') : null;
    });
    await pad(() => T.pad.tap('PadDown'));
    const first = await focus();
    assert.ok(first, 'the d-pad goes to a button beside the map');
    await pad(() => T.pad.tap('PadDown'));
    const second = await focus();
    assert.ok(second && second !== first, `and on to the next (${first}, then ${second})`);
    await pad(() => T.pad.tap('PadB'));
    assert.equal(await map(), 'true', 'B closes it');
    await pad(() => T.pad.tap('PadSelect'));
    await frames(10);
    assert.equal(await map(), 'false', 'select opens it again');
    await pad(() => T.pad.tap('PadSelect'));
    assert.equal(await map(), 'true', 'and select closes it');
    await frames(10);
    assert.equal(await map(), 'true', "and it doesn't open again for the button being held");

    // start shows the help panel, naming the pad's buttons
    await pad(() => T.pad.tap('PadStart'));
    const help = await pad(() => ({
      open: document.getElementById('help').classList.contains('open'),
      pad: [...document.querySelectorAll('#help kbd.pad')].map((k) => k.textContent),
    }));
    assert.ok(help.open, 'start opens the help panel');
    assert.ok(help.pad.includes('left stick') && help.pad.includes('select'), `it names the pad's buttons (${help.pad.join(', ')})`);
    await pad(() => T.pad.tap('PadStart'));
    assert.equal(await pad(() => document.getElementById('help').classList.contains('open')), false, 'start shuts it');

    // a key puts the pad down: the controls are called by their keys again
    await key('KeyQ');
    assert.equal(await pad(() => world.input.padInUse), false, 'a key puts the pad down');
    await pad(() => T.pad.plug(false));
    await frames(3);
    return { walked: Math.round(far * 10) / 10, tool: next.tool, prompt, help: help.pad.length };
  });
}
