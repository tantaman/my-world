// Your pack: Tab opens the list of everything there is to do, a row does
// what its key would, something at hand heads the list and (on a touch
// screen) has a button of its own, what's yours is listed in it, everything
// in it has its picture, and a pad opens it with L3.
//
// Needs nothing of the parts before it, and takes whatever else they have
// left at hand (something to eat, say) as it finds it. Uses the stand-in pad
// that 43-gamepad puts in the page (T.pad). Leaves the panels shut, the pad
// unplugged and the screen not a touch screen; and in the pack's list a
// "wave" that this part added, which is never at hand again, and a flag that
// is never yours again.

import assert from 'node:assert/strict';

export default async function ({ page, step, key, frames, shot }) {
  const pack = () =>
    page.evaluate(() => ({
      open: document.getElementById('pack').getAttribute('aria-hidden') === 'false',
      heads: [...document.querySelectorAll('#pack h3')].map((h) => h.textContent),
      rows: [...document.querySelectorAll('#pack [data-do]')].map((b) => b.dataset.do),
      focus: document.activeElement?.dataset?.do ?? null,
    }));
  // A row: its word (if at hand), what it is and the rest of what it says, its key, and its heading.
  const row = (id) =>
    page.evaluate((i) => {
      const b = [...document.querySelectorAll('#pack [data-do]')].find((el) => el.dataset.do === i);
      const text = (sel) => b.querySelector(sel)?.textContent ?? '';
      return b ? { word: text('b'), name: text('.name'), more: text('small'), key: text('kbd'), under: b.closest('ol').previousElementSibling.textContent } : null;
    }, id);
  // Pictures in the pack as drawn: [what it is of, whether it stands in for one it hasn't, drawn at what size].
  const pictures = (within) =>
    page.evaluate((sel) => [...document.querySelectorAll(`${sel} .pic`)].map((img) => [img.closest('[data-do]')?.dataset.do ?? img.closest('li')?.querySelector('span')?.textContent ?? 'pack', img.classList.contains('stand-in'), img.complete && img.naturalWidth > 0 ? img.width : 0]), within);
  const mapOpen = () => page.evaluate(() => document.getElementById('map').getAttribute('aria-hidden') === 'false');
  // What is at hand: as the pack lists it on the screen, and as the game says.
  const hand = () => page.evaluate(() => [...document.querySelectorAll('#pack .pack-hand [data-do]')].map((b) => b.dataset.do));
  const atHand = () => page.evaluate(() => world.pack.list().hand.map((r) => ({ id: r.id, word: r.word, pad: !!r.pad })));
  // Go down the list to a row, as a visitor would, with `press`.
  const downTo = async (id, press) => {
    for (let i = 0; i < 40 && (await pack()).focus !== id; i++) await press();
    assert.equal((await pack()).focus, id, `down the list to ${id}`);
  };

  await step('the pack', async () => {
    await key('Tab');
    const p = await pack();
    assert.ok(p.open, 'Tab opens the pack');
    assert.ok(p.rows.length > 10, `everything there is to do is in it (${p.rows.length})`);
    assert.ok(!p.rows.includes('pack'), 'but not the pack itself');
    assert.equal(new Set(p.rows).size, p.rows.length, 'each once');
    assert.equal(p.focus, p.rows[0], 'the first is ready to be done');
    const map = await row('map');
    assert.deepEqual({ under: map.under, key: map.key, name: map.name, more: map.more }, { under: 'WANDER', key: 'M', name: 'map', more: 'mark places · where to go' }, 'a row says what it is, the rest of what it does and its key, under its heading');
    // everything there is to do in its picture, drawn by the feature it's from
    const drawn = await pictures('#pack .pack-body [data-do]');
    assert.equal(drawn.length, p.rows.length, 'each row has a picture');
    assert.deepEqual(drawn.filter(([, , size]) => size !== 32 && size !== 48), [], 'each is drawn, at twice its size or (at hand) three times');
    assert.deepEqual(drawn.filter(([, standIn]) => standIn).map(([id]) => id), [], 'and each is its own: a command with none wants an `icon` (src/pack/picture.js)');
    assert.equal((await pictures('#pack .pack-head'))[0][2], 32, 'the pack has its own');
    assert.ok(await page.evaluate(() => getComputedStyle(document.getElementById('inv'), '::before').backgroundImage.startsWith('url("data:image/svg')), 'and so does its handle on the line at the top');
    await shot('pack');
    // the pack has the keyboard: the arrows go from row to row, and walk nobody anywhere
    const at = () => page.evaluate(() => [world.player.pos.x, world.player.pos.z]);
    const stood = await at();
    await page.keyboard.down('ArrowDown');
    await frames(12);
    await page.keyboard.up('ArrowDown');
    assert.equal((await pack()).focus, p.rows[1], 'down goes to the next');
    assert.deepEqual(await at(), stood, 'and you stay where you are');
    await key('Tab');
    assert.ok(!(await pack()).open, 'Tab closes it');
    await key('Tab');
    await key('Escape');
    assert.ok(!(await pack()).open, 'and so does Escape');

    // a row does what its key would: the map's opens the map, and the pack is out of the way
    await page.click('#inv');
    assert.ok((await pack()).open, 'the line that says what you carry opens it too');
    await page.click('#pack [data-do="map"]');
    await frames(5);
    assert.ok(await mapOpen(), 'picking the map opens the map');
    assert.ok(!(await pack()).open, 'and the pack has closed');
    await key('Escape');

    await key('KeyH');
    const help = await page.evaluate(() => [...document.querySelectorAll('#help .row')].map((r) => r.textContent));
    assert.ok(help.some((r) => /^tabyour pack/.test(r)), 'it is on the help panel');
    // one panel at a time: opening the pack closes the help
    await key('Tab');
    assert.ok((await pack()).open, 'Tab opens it over the help panel');
    assert.ok(!(await page.evaluate(() => document.getElementById('help').classList.contains('open'))), 'which closes');
    await key('Escape');
    return { rows: p.rows.length, heads: p.heads };
  });

  await step('something at hand', async () => {
    // What a feature does from its install function, done here by hand: a
    // command with no key at all, which says when it has something to do.
    await page.evaluate(() => {
      window.wave = { near: false, waved: 0, held: 0 };
      world.game.commands.add({
        id: 'wave',
        group: 'WANDER',
        label: 'wave to whoever is about',
        now: () => (window.wave.near ? 'wave' : ''),
        run: () => window.wave.waved++,
        hold: () => window.wave.held++,
      });
    });
    await key('KeyH');
    const help = await page.evaluate(() => document.getElementById('help').textContent);
    await key('KeyH');
    assert.doesNotMatch(help, /wave to whoever/, 'with no key, it has no line on the help panel');

    await key('Tab');
    let wave = await row('wave');
    assert.deepEqual(wave, { word: '', name: 'wave to whoever is about', more: '', key: '', under: 'WANDER' }, 'but it is in the pack, under its heading');
    assert.deepEqual((await pictures('#pack .pack-body [data-do]')).filter(([, standIn]) => standIn).map(([id]) => id), ['wave'], 'with something standing in for the picture it has none of');
    // somebody comes by while the pack is open
    await page.evaluate(() => (window.wave.near = true));
    await frames(3);
    wave = await row('wave');
    assert.deepEqual({ word: wave.word, under: wave.under }, { word: 'wave', under: 'AT HAND' }, 'at hand, it is named for what it would do');
    assert.deepEqual((await pictures('#pack .pack-hand')).find(([id]) => id === 'wave'), ['wave', true, 48], 'and drawn big');
    const listed = await hand();
    const p = await pack();
    assert.deepEqual(p.rows.slice(0, listed.length), listed, 'what is at hand heads the list');
    assert.equal(p.rows.filter((id) => id === 'wave').length, 1, 'and is not listed again below');
    assert.deepEqual((await atHand()).map((r) => r.id), listed, 'the console sees the same list');
    await key('Tab');
    await key('Tab');
    assert.equal((await pack()).focus, listed[0], 'opened again, the first thing at hand is ready to be done');
    await shot('at-hand');
    await downTo('wave', () => key('ArrowDown'));
    await key('Enter');
    await frames(3);
    assert.equal(await page.evaluate(() => window.wave.waved), 1, 'Enter does it');
    assert.ok(!(await pack()).open, 'and the pack closes');
    return wave;
  });

  await step('what is yours', async () => {
    const yours = () =>
      page.evaluate(() => ({
        head: document.querySelector('#pack .pack-yours h3')?.textContent ?? null,
        rows: [...document.querySelectorAll('#pack .pack-yours li')].map((li) => [li.querySelector('span').textContent, li.querySelector('i')?.textContent ?? '']),
      }));
    await key('Tab');
    const had = await yours();
    assert.equal(had.head, 'YOURS');
    // what you carry, as the line at the top of the screen has it (or, building without gathering, nothing to count)
    const carried = await page.evaluate(() => ({ creative: world.builder.creative, line: document.getElementById('inv').textContent }));
    if (carried.creative) assert.deepEqual(had.rows[0], ['materials', 'unlimited']);
    else assert.equal(had.rows.map(([label, note]) => `${label} ${note}`).join(' · ').slice(0, carried.line.length), carried.line, 'the materials you carry come first');
    assert.deepEqual((await pictures('#pack .pack-yours')).filter(([, standIn, size]) => standIn || size !== 32), [], 'each in its picture');
    assert.deepEqual(await page.evaluate(() => world.pack.list().yours.map((t) => [t.label, t.note])), had.rows, 'the console sees the same list');
    const order = await page.evaluate(() => [...document.querySelectorAll('#pack h3')].map((h) => h.textContent));
    assert.ok(order.indexOf('YOURS') < order.indexOf('WANDER'), 'above the rest of what there is to do');
    // the rows are to look at: the arrows go past them, from one thing to do to the next
    assert.equal(await page.evaluate(() => document.querySelectorAll('#pack .pack-yours button, #pack .pack-yours [data-do]').length), 0);

    // What a feature does from its install function, done here by hand:
    // something to have, which it says is yours while it is.
    await page.evaluate(() => {
      window.flag = { planted: false };
      world.pack.have(() => (window.flag.planted ? [{ label: 'a flag', note: 'planted by the path' }] : null));
    });
    await frames(3);
    assert.deepEqual((await yours()).rows, had.rows, 'not yours yet, it is not listed');
    await page.evaluate(() => (window.flag.planted = true));
    await frames(3);
    assert.deepEqual((await yours()).rows, [...had.rows, ['a flag', 'planted by the path']], 'come by while the pack is open, it is listed with how it stands');
    assert.deepEqual((await pictures('#pack .pack-yours')).at(-1), ['a flag', true, 32], 'and something stands in for the picture it has none of');
    await shot('yours');
    await page.evaluate(() => (window.flag.planted = false));
    await frames(3);
    assert.deepEqual((await yours()).rows, had.rows, 'and gone when it is');
    await key('Escape');
    return had;
  });

  await step('a button on a touch screen', async () => {
    const button = () =>
      page.evaluate(() => {
        const b = document.querySelector('#touch-act [data-do="wave"]');
        return b ? { shown: !b.hidden && !b.closest('[hidden]'), text: b.textContent } : null;
      });
    assert.equal(await button(), null, 'with keys to press there are no buttons');
    // a finger on the screen
    await page.evaluate(() => {
      world.input.isTouch = true;
      world.input.emit('touch');
    });
    await frames(3);
    assert.deepEqual(await button(), { shown: true, text: 'wave' }, 'what is at hand has a button, named for what it would do');
    const buttons = await page.evaluate(() => [...document.querySelectorAll('#touch-act [data-do]')].filter((b) => !b.hidden).map((b) => `${b.dataset.do}: ${b.textContent}`));
    assert.deepEqual(buttons.sort(), (await atHand()).map((r) => `${r.id}: ${r.word}`).sort(), 'there is one for each thing at hand, and for nothing else');
    const held = await page.evaluate(async () => {
      const b = document.querySelector('#touch-act [data-do="wave"]');
      const had = { ...window.wave };
      b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
      await T.frames(6);
      const down = { ...window.wave };
      b.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true }));
      await T.frames(2);
      const up = window.wave.held;
      await T.frames(6);
      return { waved: down.waved - had.waved, held: down.held - had.held, after: window.wave.held - up };
    });
    assert.equal(held.waved, 1, 'a press does it, once');
    assert.ok(held.held >= 4, `and holds it while the finger is down (${held.held} frames)`);
    assert.equal(held.after, 0, 'and no longer');
    // nobody about: the button goes
    await page.evaluate(() => (window.wave.near = false));
    await frames(3);
    assert.equal((await button()).shown, false, 'with nothing here to do, it goes');
    await page.evaluate(() => {
      world.input.isTouch = false;
      document.getElementById('touch-act').hidden = true;
    });
    await frames(3);
    return held;
  });

  await step('the pack on a pad', async () => {
    const pad = (fn, ...args) => page.evaluate(fn, ...args);
    await pad(() => T.pad.plug(true));
    // somebody about, and no button on the pad for waving: it says where that is done
    const said = () => pad(() => (document.getElementById('pack-hand').hidden ? '' : document.getElementById('pack-hand').textContent));
    // (whatever at hand the pad has no button for, as the line would put it)
    const unbuttoned = async () => (await atHand()).filter((r) => !r.pad).map((r) => ` · ${r.word}`).join('');
    await pad(() => T.pad.stick('right', 1, 0));
    await frames(5);
    await pad(() => T.pad.stick('right', 0, 0));
    const before = await unbuttoned();
    assert.equal(await said(), before ? `L3${before}` : '', 'it says nothing of waving while there is nobody to wave to');
    assert.doesNotMatch(before, /wave/);
    await pad(() => (window.wave.near = true));
    await frames(3);
    assert.equal(await said(), `L3${await unbuttoned()}`, 'what is at hand with no button of its own is said beside the pack’s');
    assert.match(await said(), /^L3 · (.+ · )?wave/);
    await pad(() => T.pad.tap('PadL3'));
    await frames(5);
    const p = await pack();
    assert.ok(p.open, 'L3 opens the pack');
    assert.equal(await said(), '', 'which says it instead while it is open');
    assert.equal(p.focus, p.rows[0], 'with the first thing at hand ready to be done');
    await downTo('wave', () => pad(() => T.pad.tap('PadDown')));
    await pad(() => T.pad.tap('PadA'));
    await frames(5);
    assert.equal(await pad(() => window.wave.waved), 3, 'A does it');
    await pad(() => (window.wave.near = false));
    await frames(3);
    await pad(() => T.pad.tap('PadL3'));
    await frames(5);
    assert.equal((await row('map')).key, 'select', 'rows name the pad’s buttons');
    assert.equal((await row('save')).key, '', 'and nothing where it has none: the pack is how those are done');
    const rows = (await pack()).rows;
    await pad(() => T.pad.tap('PadDown'));
    assert.equal((await pack()).focus, rows[1], 'the d-pad goes from row to row');
    await pad(() => T.pad.tap('PadUp'));
    assert.equal((await pack()).focus, rows[0]);
    // A does the one in focus: go to the map's row, and it opens the map
    await pad((id) => [...document.querySelectorAll('#pack [data-do]')].find((b) => b.dataset.do === id).focus(), 'map');
    await pad(() => T.pad.tap('PadA'));
    await frames(5);
    assert.ok(await mapOpen(), 'A does the row in focus');
    await pad(() => T.pad.tap('PadB'));
    assert.ok(!(await mapOpen()));
    await pad(() => T.pad.tap('PadL3'));
    await frames(5);
    assert.ok((await pack()).open);
    await pad(() => T.pad.tap('PadL3'));
    await frames(5);
    assert.ok(!(await pack()).open, 'L3 closes it again');
    await pad(() => T.pad.plug(false));
    await key('KeyQ'); // a key puts the pad down
    return { rows: p.rows.length };
  });
}
