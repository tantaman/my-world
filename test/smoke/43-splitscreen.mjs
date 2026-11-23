// A split screen: a second pad plugged in splits the screen in two, with
// somebody else (another of the hikers) set down beside you; four, in
// quarters. Each other pad walks and jumps its own hiker and leaves yours be,
// select makes them someone else, and they come along when you're set down
// somewhere new. Unplugged, they go, and the screen is whole again.
//
// Needs nothing of the parts before it. Leaves you where it found you, every
// pad unplugged, the screen whole and the picture off. (Where you are is
// where the next part starts: somewhere new, its searches would start
// afresh.)

import assert from 'node:assert/strict';

// T.split: plug(n), the first n of four stand-in pads (0 for none);
// press(i, code, down) and stick(i, x, y) on pad i (its left stick); and
// drawn(on), whether the others' parts of the screen are drawn. The
// play-through draws nothing, to keep its pace (T.picture), and this does
// the same for the other parts until it's asked.
export function inPage() {
  const ORDER = ['PadA', 'PadB', 'PadX', 'PadY', 'PadLB', 'PadRB', 'PadLT', 'PadRT', 'PadSelect', 'PadStart', 'PadL3', 'PadR3', 'PadUp', 'PadDown', 'PadLeft', 'PadRight'];
  const make = (index) => ({
    id: `Stand-in pad ${index + 1} (STANDARD GAMEPAD Vendor: 045e Product: 0b13)`,
    index,
    mapping: 'standard',
    connected: true,
    timestamp: 0,
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
  });
  const pads = [0, 1, 2, 3].map(make);
  let plugged = 0;
  // (on top of whatever stood in for the browser's pads before: the gamepad part's)
  const before = navigator.getGamepads ? navigator.getGamepads.bind(navigator) : () => [];
  Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => (plugged ? pads.map((p, i) => (i < plugged ? p : null)) : before()) });
  let drawn = false;
  const views = window.world.views;
  const draw = views.draw.bind(views);
  views.draw = (each) => draw((pipeline, camera) => (drawn || pipeline === window.world.pipeline ? each(pipeline, camera) : undefined));
  window.T.split = {
    plug: (n) => void (plugged = n),
    press: (i, code, down) => Object.assign(pads[i].buttons[ORDER.indexOf(code)], { pressed: down, touched: down, value: down ? 1 : 0 }),
    stick(i, x, y) {
      pads[i].axes[0] = x;
      pads[i].axes[1] = y;
    },
    drawn: (on) => void (drawn = on),
  };
}

export default async function ({ page, step, frames, shot }) {
  const run = (fn, ...args) => page.evaluate(fn, ...args);
  const state = () =>
    run(() => {
      const s = world.splitscreen;
      return {
        count: s.count,
        parts: world.views.parts.length,
        you: { id: world.player.character.who.id, x: world.player.pos.x, z: world.player.pos.z },
        others: s.others.map((o) => ({ pad: o.pad, who: o.who, x: o.hiker.pos.x, z: o.hiker.pos.z, vy: o.hiker.vel.y })),
        only: world.pads.only ? [...world.pads.only] : null,
        followed: world.followed.size,
        hud: document.getElementById('hud').style.inset,
        names: [...document.querySelectorAll('#split .who b')].map((b) => b.textContent),
      };
    });
  const apart = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  // where you were when the part began, to be put back at the end
  const home = await run(() => ({ x: world.player.pos.x, z: world.player.pos.z, yaw: world.player.yaw }));

  await step('a second pad splits the screen', async () => {
    await run(() => T.split.plug(2));
    assert.ok(await run(() => T.until(() => world.splitscreen.count === 2, 10000)), 'two share the screen');
    const s = await state();
    assert.equal(s.parts, 2, 'in two parts');
    assert.notEqual(s.others[0].who, s.you.id, `and the other is somebody else (${s.others[0].who})`);
    assert.ok(apart(s.others[0], s.you) < 4, 'set down beside you');
    assert.deepEqual(s.only, [0], 'the first pad alone is yours');
    assert.equal(s.followed, 1, 'and the world grows round them too');
    assert.ok(s.hud, 'your HUD keeps to your part');
    assert.equal(s.names.length, 1, 'their part says who they are');
    return { you: s.you.id, them: s.others[0].who };
  });

  await step('their pad walks them, and leaves you be', async () => {
    const was = await state();
    await run(() => T.split.stick(1, 0, -1));
    await frames(40);
    await run(() => T.split.stick(1, 0, 0));
    const now = await state();
    const walked = apart(now.others[0], was.others[0]);
    assert.ok(walked > 0.5, `they walked (${walked.toFixed(2)} m)`);
    assert.ok(apart(now.you, was.you) < 0.05, 'and you stood still');
    const jumped = await run(async () => {
      T.split.press(1, 'PadA', true);
      const up = await T.until(() => world.splitscreen.others[0].hiker.vel.y > 0.5, 3000);
      T.split.press(1, 'PadA', false);
      return up;
    });
    assert.ok(jumped, 'their A jumps them');
    assert.equal(await run(() => world.player.vel.y > 0.5), false, 'and not you');
    return { walked: Math.round(walked * 100) / 100 };
  });

  await step('select makes them someone else, and nobody you are', async () => {
    const was = await state();
    await run(async () => {
      T.split.press(1, 'PadSelect', true);
      await T.frames(3);
      T.split.press(1, 'PadSelect', false);
      await T.frames(3);
    });
    const now = await state();
    assert.notEqual(now.others[0].who, was.others[0].who, `they changed (${was.others[0].who} → ${now.others[0].who})`);
    assert.notEqual(now.others[0].who, now.you.id, 'to someone you are not');
    assert.equal(await run(() => document.getElementById('map').getAttribute('aria-hidden')), 'true', "and their select didn't open your map");
    return { now: now.others[0].who };
  });

  await step('each part is drawn', async () => {
    const calls = (split) =>
      run(async (split) => {
        if (!split) {
          T.split.plug(1);
          await T.until(() => world.splitscreen.count === 1, 10000);
        }
        T.picture(true);
        T.split.drawn(true);
        await T.frames(3);
        const n = world.renderer.info.render.calls;
        T.split.drawn(false);
        T.picture(false);
        T.split.plug(2);
        await T.until(() => world.splitscreen.count === 2, 10000);
        return n;
      }, split);
    const two = await calls(true);
    await shot('split screen, two');
    const one = await calls(false);
    assert.ok(two > one * 1.4, `two parts draw the scene twice (${two} draws, against ${one} for one)`);
    return { two, one };
  });

  await step('four pads, four parts, and they come with you', async () => {
    await run(() => T.split.plug(4));
    assert.ok(await run(() => T.until(() => world.splitscreen.count === 4, 10000)), 'four share the screen');
    let s = await state();
    assert.equal(s.parts, 4);
    const who = [s.you.id, ...s.others.map((o) => o.who)];
    assert.ok(new Set(who).size >= Math.min(3, who.length), `different hikers (${who.join(', ')})`);
    assert.equal(s.names.length, 3);
    await run(async () => {
      T.picture(true);
      T.split.drawn(true);
      await T.frames(3);
    });
    await shot('split screen, four');
    await run(() => {
      T.split.drawn(false);
      T.picture(false);
    });
    // set down somewhere new (further than anyone walks in a frame): they come along
    await run(async () => {
      const p = world.player.pos;
      await world.teleport(p.x + 100, p.z + 20, 0);
      await T.frames(5);
    });
    s = await state();
    for (const o of s.others) assert.ok(apart(o, s.you) < 6, `${o.who} came along (${apart(o, s.you).toFixed(1)} m off)`);
    return { who };
  });

  await step('unplugged, they go, and the screen is whole again', async () => {
    await run(() => T.split.plug(0));
    assert.ok(await run(() => T.until(() => world.splitscreen.count === 1, 10000)), 'the screen is whole');
    const s = await state();
    assert.equal(s.parts, 0);
    assert.equal(s.only, null, 'whatever pad is plugged in next is yours');
    assert.equal(s.followed, 0, 'and the world grows round you alone');
    assert.equal(s.hud, '', 'your HUD has the whole screen');
    assert.equal(await run(() => document.getElementById('split').hidden), true);
    // and back where the part found you
    await run((h) => world.teleport(h.x, h.z, h.yaw), home);
    assert.ok(apart(await run(() => ({ x: world.player.pos.x, z: world.player.pos.z })), home) < 0.5, 'back where you were');
  });
}
