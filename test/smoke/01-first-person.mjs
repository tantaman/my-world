// Looking out of your own eyes: the mouse wheel turned in past the nearest
// the camera comes, and back out.
//
// Needs nothing from earlier parts, and leaves the camera behind you, as far
// back as it found it.

import assert from 'node:assert/strict';

export default async function ({ page, step, frames, shot }) {
  await step('from your own eyes', async () => {
    const view = () =>
      page.evaluate(() => {
        const p = world.player;
        const c = world.camera.position;
        return {
          first: p.firstPerson,
          dist: p.camDist,
          // how far the camera is from your eyes (m)
          off: Math.hypot(c.x - p.pos.x, c.y - (p.pos.y + p.eye), c.z - p.pos.z),
          drawn: p.character.hips.visible,
        };
      });
    const was = await view();
    const box = await page.locator('canvas').first().boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    let notches = 0;
    while (!(await view()).first && notches < 40) {
      await page.mouse.wheel(0, -100);
      await frames(2);
      notches++;
    }
    await frames(4);
    const inside = await view();
    assert.ok(inside.first, `the wheel turned in, in the end (${notches} notches)`);
    assert.ok(inside.off < 1e-6 && !inside.drawn, 'from your eyes, and you not in the way');
    const help = await page.evaluate(() => [...document.querySelectorAll('#help .row')].map((r) => r.textContent));
    assert.ok(help.some((r) => /look out of your own eyes/.test(r)), 'the help panel says how');
    await shot('first-person');
    let out = 0;
    while (((await view()).first || (await view()).dist < was.dist - 1e-6) && out < 40) {
      await page.mouse.wheel(0, 100);
      await frames(2);
      out++;
    }
    await frames(20);
    const back = await view();
    assert.ok(!back.first && back.drawn && back.off > 1, 'out again, behind you');
    return { notches, out, dist: Math.round(back.dist * 100) / 100 };
  });
}
