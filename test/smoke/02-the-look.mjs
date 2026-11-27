// The look: the sky as light (render/skyLight.ts), and the forest floor's
// photographs (render/photos.ts).
//
// Leaves: the hour as it found it.

import assert from 'node:assert/strict';

export default async function ({ page, step, frames }) {
  await step('the sky lights the forest, from the sun’s side more', async () => {
    const was = await page.evaluate(() => world.sky.hours);
    // what the light all round gives from above and from either side, and
    // what the hemisphere light (which everyone else reads) says
    const light = (hours) =>
      page.evaluate(async (h) => {
        world.sky.hours = h;
        await T.frames(3);
        const { skyLight, sky } = world;
        // (SphericalHarmonics3.getIrradianceAt's first two bands, by hand:
        // enough to say which side is lit more)
        const c = skyLight.probe.sh.coefficients;
        const at = (x, y, z) => [0, 1, 2].map((k) => c[0].getComponent(k) * 0.886227 + 1.023328 * (c[1].getComponent(k) * y + c[2].getComponent(k) * z + c[3].getComponent(k) * x));
        const s = sky.sunDir;
        const flat = Math.hypot(s.x, s.z) || 1;
        return {
          finite: c.every((v) => Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z)),
          mirrored: !!world.game.scene.environment,
          hemiShown: sky.hemi.visible,
          up: at(0, 1, 0),
          toSun: at(s.x / flat, 0, s.z / flat),
          away: at(-s.x / flat, 0, -s.z / flat),
        };
      }, hours);
    const noon = await light(13);
    const evening = await light(17.4); // (the sun low in the west: it sets at 18)
    await page.evaluate((h) => (world.sky.hours = h), was);
    await frames(2);
    for (const l of [noon, evening]) {
      assert.ok(l.finite, 'the light all round is a number everywhere');
      assert.ok(l.mirrored, 'and there is a sky to mirror');
      assert.ok(l.hemiShown, 'the hemisphere light still stands for the rest of the game, between pictures');
    }
    const sum = (c) => c[0] + c[1] + c[2];
    assert.ok(sum(evening.toSun) > sum(evening.away) * 1.05, `in the evening, the sun's side of things is lit more by the sky (${sum(evening.toSun).toFixed(2)}, ${sum(evening.away).toFixed(2)})`);
    assert.ok(sum(noon.up) !== sum(evening.up), 'and the light changes with the hour');
    return { noon: noon.up.map((v) => +v.toFixed(3)), evening: evening.up.map((v) => +v.toFixed(3)) };
  });

  await step('the forest floor is photographed', async () => {
    const fetched = await page.evaluate(() =>
      performance
        .getEntriesByType('resource')
        .filter((r) => /photos\/[a-z0-9_]+\/(diff|nor_gl|arm)\.jpg/.test(r.name))
        .map((r) => ({ name: r.name.replace(/^.*photos\//, ''), status: r.responseStatus })),
    );
    for (const map of ['diff', 'nor_gl', 'arm']) {
      assert.ok(
        fetched.some((f) => f.name === `forrest_ground_03/${map}.jpg` && (!f.status || f.status === 200)),
        `the floor's ${map} was fetched (${fetched.map((f) => f.name).join(', ') || 'nothing'})`,
      );
    }
    return { fetched: fetched.length };
  });
}
