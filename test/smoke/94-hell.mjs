// Hell: find the gate on the map, walk in through it and down the passage to
// the door, and through the door into Hell; cross Acheron in Charon's boat;
// walk down the first way into the second circle; cross Styx in Phlegyas's
// and go in at the gate of Dis; go down the great cliff on Geryon's back, over
// a bridge of Malebolge and into the well in Antaeus's hand; walk a circle's turn and find
// yourself somewhere new; leave and come back to where you were; and go out
// by the bottom, to the stars.
//
// Needs nothing. Leaves: you on the hillside in front of the gate.

import assert from 'node:assert/strict';

export default async function ({ page, step, open, shot }) {
  await step('through the gate', async () => {
    const gate = await page.evaluate(async () => {
      const { hell, map } = world;
      const g = hell.gate;
      const place = map.places.get(g.id);
      const yaw = Math.atan2(g.ux, g.uz);
      await world.teleport(g.x - g.ux * 9, g.z - g.uz * 9, yaw);
      world.look(yaw + Math.PI, 0.1, 5);
      await T.until(() => !!hell.way.built, 30000);
      return { place, built: !!hell.way.built, inside: hell.inside, card: hell.card.showing, forest: world.gen.forest(g.x, g.z) };
    });
    assert.ok(gate.place && gate.place.name === 'The Gate', 'it is on the map');
    assert.ok(gate.built, 'and stands by the time you get there');
    assert.equal(gate.card, 'The Dark Wood', 'the poem begins as you come on it');
    assert.ok(!gate.inside, 'out in the forest still');
    await shot('hell-gate');
    // Hold W: in under the lintel, down the passage, and into the door.
    await page.keyboard.down('KeyW');
    const went = await page.evaluate(() => T.until(() => world.hell.inside && !world.hell.passing, 60000));
    await page.keyboard.up('KeyW');
    assert.ok(went, 'walked through the door');
    const below = await page.evaluate(async () => {
      await T.frames(20);
      const { hell, player, sky } = world;
      const out = {};
      const space = player.spaces.at(player.pos.x, player.pos.z, player.pos.y + 0.05, out);
      return { region: hell.region, here: hell.here, y: player.pos.y, top: hell.land.top, floor: out.floor, space: space && space.id, covered: world.game.covered, been: hell.been, card: hell.card.showing, open: sky.open, inScene: player.character.root.parent === hell.scene };
    });
    assert.equal(below.space, 'hell', 'in Hell');
    assert.equal(below.region, 'vestibule');
    assert.ok(Math.abs(below.y - below.floor) < 0.1 && Math.abs(below.y - below.top) < 2, `on the vestibule's floor (${(below.y - below.top).toFixed(2)} m)`);
    assert.ok(below.covered && below.inScene, 'the forest is not drawn, and the hiker is');
    assert.ok(below.been, 'and it is remembered');
    assert.equal(below.card, 'The Vestibule');
    await shot('hell-vestibule');
    return below;
  });

  await step('over Acheron', async () => {
    const over = await page.evaluate(async () => {
      const { hell, player } = world;
      hell.rides.pace = 5;
      // down to the shore where Charon lands, and out to the boat
      const ride = hell.rides.nearest('charon', 0);
      const a = ride.ends[0];
      hell.go(4590, 0);
      player.steer = { x: a.x, z: a.z };
      const aboard = await T.until(() => !!player.aboard, 60000);
      player.steer = null;
      const cued = document.getElementById('prompt').textContent;
      const landed = await T.until(() => !player.aboard, 60000);
      await T.frames(10);
      return { aboard, landed, r: hell.here.r, region: hell.region, cued, depth: hell.space.depth(player.pos.x, player.pos.z), end: ride.end };
    });
    assert.ok(over.aboard, 'stood in the boat until it took you');
    assert.ok(over.landed && over.end === 1, 'and it set you down on the far side');
    assert.ok(over.r < 4440 + 12 && over.depth === 0, `on the bank of Limbo (${over.r.toFixed(0)} m)`);
    return over;
  });

  await step('down a circle', async () => {
    const down = await page.evaluate(async () => {
      const { hell, player } = world;
      const L = hell.land;
      const th = L.sector(0).pass[0];
      // from the edge of Limbo, down the way to the second circle
      hell.go(4040 + 55, th);
      const top = player.pos.y;
      const foot = L.place(4040 - 100, th);
      player.steer = { x: foot.x, z: foot.z, run: true };
      const got = await T.until(() => Math.hypot(player.pos.x - foot.x, player.pos.z - foot.z) < 1, 90000);
      const at = { y: player.pos.y - top, region: hell.region, card: hell.card.showing };
      // ...and back up it
      const back = L.place(4040 + 55, th);
      player.steer = { x: back.x, z: back.z, run: true };
      const up = await T.until(() => Math.hypot(player.pos.x - back.x, player.pos.z - back.z) < 1, 90000);
      const y = player.pos.y - top;
      // but not up the cliff beside it
      const beside = th + 90 / 4040;
      hell.go(4040 - 60, beside);
      const low = player.pos.y;
      const over = L.place(4040 + 40, beside);
      player.steer = { x: over.x, z: over.z, run: true };
      await T.frames(240);
      player.steer = null;
      return { got, up, down: at, y, climbed: player.pos.y - low, r: hell.here.r };
    });
    assert.ok(down.got && down.down.y < -52, `walked down ${(-down.down.y).toFixed(0)} m`);
    assert.equal(down.down.region, 'lustful');
    assert.ok(down.up && Math.abs(down.y) < 3, 'and back up');
    assert.ok(down.climbed < 12 && down.r < 4040 + 12, `the cliff beside it can't be climbed (${down.climbed.toFixed(1)} m up)`);
    return down;
  });

  await step('over Styx, into Dis', async () => {
    const dis = await page.evaluate(async () => {
      const { hell, player } = world;
      const L = hell.land;
      const th = L.sector(0).quay;
      hell.rides.pace = 6;
      // out along the spit the way down ends in, to where the boat waits
      hell.go(3200 - 60, th);
      const ride = hell.rides.nearest('phlegyas', th);
      const a = ride.ends[0];
      player.steer = { x: a.x, z: a.z };
      const aboard = await T.until(() => !!player.aboard, 60000);
      const landed = await T.until(() => !player.aboard, 60000);
      // and on in through the gate
      const within = L.place(2720 - 30, th);
      player.steer = { x: within.x, z: within.z, run: true };
      const through = await T.until(() => hell.here.r < 2720 - 20, 60000);
      player.steer = null;
      await T.frames(5);
      // the wall beside the gate stops you coming back out
      const beside = th + 40 / 2720;
      hell.go(2720 - 25, beside);
      const out = L.place(2720 + 20, beside);
      player.steer = { x: out.x, z: out.z, run: true };
      await T.frames(200);
      player.steer = null;
      return { aboard, landed, through, region: hell.region, r: hell.here.r, things: hell.furniture.count };
    });
    assert.ok(dis.aboard && dis.landed, "Phlegyas's boat took you over");
    assert.ok(dis.through, 'in through the gate of Dis');
    assert.equal(dis.region, 'heretics');
    assert.ok(dis.r < 2722, `the wall stands (${dis.r.toFixed(1)} m)`);
    assert.ok(dis.things > 200, `among the tombs (${dis.things} things about)`);
    await shot('hell-dis');
    return dis;
  });

  await step('down the great cliff', async () => {
    const flown = await page.evaluate(async () => {
      const { hell, player } = world;
      const L = hell.land;
      hell.rides.pace = 8;
      const th = L.sector(0).brook + 15 / 1467;
      hell.go(1467 + 9, th);
      const ride = hell.rides.nearest('geryon', th);
      const a = ride.ends[0];
      const top = player.pos.y;
      player.steer = { x: a.x, z: a.z };
      const aboard = await T.until(() => !!player.aboard, 60000);
      player.steer = null;
      let lowest = 0;
      const landed = await T.until(() => {
        lowest = Math.min(lowest, player.pos.y - top);
        return !player.aboard;
      }, 90000);
      await T.frames(20);
      const foot = { fell: player.pos.y - top, region: hell.region, r: hell.here.r, grounded: player.grounded };
      // over the first bridge of Malebolge
      const spoke = L.spokes[0];
      hell.go(1350 - 8, spoke);
      const far = L.place(1350 - 80 - 8, spoke);
      player.steer = { x: far.x, z: far.z, run: true };
      let highest = -Infinity;
      let deepest = Infinity;
      const base = player.pos.y;
      const crossed = await T.until(() => {
        highest = Math.max(highest, player.pos.y - base);
        deepest = Math.min(deepest, player.pos.y - base);
        return Math.hypot(player.pos.x - far.x, player.pos.z - far.z) < 1;
      }, 90000);
      player.steer = null;
      const bridge = { crossed, arch: highest, deepest, drop: player.pos.y - base };
      // and down into the well in Antaeus's hand
      const at = L.spokes[0] + 14 / 520;
      hell.go(520 + 9, at);
      const hand = hell.rides.nearest('antaeus');
      const lip = player.pos.y;
      player.steer = { x: hand.ends[0].x, z: hand.ends[0].z };
      const taken = await T.until(() => !!player.aboard, 60000);
      player.steer = null;
      const set = await T.until(() => !player.aboard, 60000);
      await T.frames(10);
      return { aboard, landed, foot, ...bridge, well: { taken, set, down: player.pos.y - lip, r: hell.here.r, region: hell.region } };
    });
    assert.ok(flown.aboard && flown.landed, 'Geryon took you and set you down');
    assert.ok(flown.foot.fell < -370 && flown.foot.grounded, `${(-flown.foot.fell).toFixed(0)} m lower`);
    assert.equal(flown.foot.region, 'malebolge');
    assert.ok(flown.crossed && flown.arch > 0.8 && flown.deepest > -9, `over the bridge's arch, not through the ditch (${flown.arch.toFixed(1)} m up, ${flown.deepest.toFixed(1)} down)`);
    assert.ok(Math.abs(flown.drop + 7) < 2, 'to the next bank, a little lower');
    assert.ok(flown.well.taken && flown.well.set, 'Antaeus took you in his hand');
    assert.ok(flown.well.down < -12 && flown.well.r < 520, `and set you down in the well (${(-flown.well.down).toFixed(0)} m lower)`);
    await shot('hell-malebolge');
    return flown;
  });

  await step('a circle does not close', async () => {
    const turn = await page.evaluate(async () => {
      const { hell, player } = world;
      const L = hell.land;
      // somewhere on the fourth circle, and the same spot a turn on
      hell.go(3350, 0.3);
      const a = { x: player.pos.x, z: player.pos.z, turn: hell.here.turn, way: L.sector(L.sectorOf(hell.here.th)).pass[3] };
      hell.go(3350, 0.3 + Math.PI * 2);
      await T.frames(10);
      const b = { x: player.pos.x, z: player.pos.z, turn: hell.here.turn, way: L.sector(L.sectorOf(hell.here.th)).pass[3] - Math.PI * 2 };
      return { a, b };
    });
    assert.ok(Math.hypot(turn.a.x - turn.b.x, turn.a.z - turn.b.z) < 0.01, 'the same spot under you');
    assert.deepEqual([turn.a.turn, turn.b.turn], [0, 1], 'a turn on');
    assert.ok(Math.abs(turn.a.way - turn.b.way) > 1e-4, 'and the way down from it is somewhere else');
    // leave, and come back: still down there, on the turn you were on
    await page.evaluate(() => new Promise((r) => setTimeout(r, 2500))); // where you stand is noted every 2 s
    await open();
    const back = await page.evaluate(async () => {
      await T.frames(20);
      const { hell, player } = world;
      return { inside: hell.inside, here: hell.here, region: hell.region, space: player.space && player.space.id, inScene: player.character.root.parent === hell.scene };
    });
    assert.ok(back.inside && back.space === 'hell' && back.inScene, 'still in Hell');
    assert.equal(back.here.turn, 1, 'on the same turn');
    assert.ok(Math.abs(back.here.r - 3350) < 1 && back.region === 'avaricious', 'where you were');
    return { turn, back };
  });

  await step('out to the stars', async () => {
    const out = await page.evaluate(async () => {
      const { hell, player } = world;
      // from the ice, on to the middle
      hell.go(120, 0.4);
      await T.frames(5);
      const zone = hell.card.showing;
      const mid = { x: hell.land.cx, z: hell.land.cz };
      player.steer = { x: mid.x, z: mid.z, run: true };
      const left = await T.until(() => !hell.inside && !hell.passing, 90000);
      player.steer = null;
      await T.frames(20);
      const g = hell.gate;
      return { zone, left, out: hell.out, far: Math.hypot(player.pos.x - g.x, player.pos.z - g.z), ground: player.pos.y - world.chunks.heightAt(player.pos.x, player.pos.z), covered: world.game.covered, inScene: player.character.root.parent === world.scene, card: document.getElementById('hell-card').textContent };
    });
    assert.match(out.zone, /Cocytus/);
    assert.ok(out.left && out.out, 'came out by the bottom');
    assert.ok(out.far < 20 && Math.abs(out.ground) < 0.3, `on the hillside by the gate (${out.far.toFixed(0)} m from it)`);
    assert.ok(!out.covered && out.inScene, 'in the forest again');
    assert.match(out.card, /rebehold the stars/);
    await shot('hell-out');
    return out;
  });
}
