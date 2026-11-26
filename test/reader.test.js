// The poem read aloud: the voice that says what the card shows, as you come
// to each place in Hell and on the mountain above it. The browser's own
// speech stands in here, so what is read, in what order, in what voice, and
// what stops it can all be checked without a browser — and so can what
// happens where the browser has no voice to read in, which is nothing heard
// and the words only on the card.

import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { Reader } from '../src/core/reader.ts';
import { Voices } from '../src/core/speech.ts';
import { Card } from '../src/core/card.js';
import { WORDS, SAID } from '../src/hell/words.js';
import { WORDS as MOUNT } from '../src/purgatory/words.js';

class Utterance {
  constructor(text) {
    this.text = text;
  }
}

// The browser's speech, stood in for: it keeps what it was asked to say and
// says nothing until it is told the last of it has been said (done()).
function speech(voices = [{ name: 'Samantha', lang: 'en-US' }, { name: 'Daniel', lang: 'en-GB' }, { name: 'Google Deutsch', lang: 'de-DE' }]) {
  const said = [];
  const it = {
    pending: false,
    speaking: false,
    cancelled: 0,
    getVoices: () => voices,
    speak(u) {
      said.push(u);
      it.speaking = true;
    },
    cancel() {
      it.cancelled++;
      it.speaking = false;
    },
  };
  return {
    said,
    voices: new Voices(it, Utterance),
    get cancelled() {
      return it.cancelled;
    },
    // what it was asked to say, in the order it was asked
    get texts() {
      return said.map((u) => u.text);
    },
    // the last line has been said; the rest after it goes by
    done(rest = 1000) {
      it.speaking = false;
      said.at(-1).onend();
      mock.timers.tick(rest);
    },
  };
}

test('a place is read a line at a time: its name, who is there, then the poem, one line of verse at a time', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const s = speech();
    const reader = new Reader({ speech: s.voices });
    const place = WORDS.gluttons;
    const ms = reader.read(place);
    assert.ok(ms > 4000, `a reading takes a while (${ms} ms)`);
    assert.deepEqual(reader.lines, [place.title, place.who, ...place.lines], 'what it was asked to read');
    // its name first, and nothing else until that has been said
    assert.deepEqual(s.texts, [place.title]);
    assert.ok(reader.saying, 'it is reading');
    s.done(0);
    assert.deepEqual(s.texts, [place.title], 'it rests at the end of a line before the next');
    mock.timers.tick(1000);
    assert.deepEqual(s.texts, [place.title, place.who]);
    for (const line of place.lines) {
      s.done();
      assert.equal(s.texts.at(-1), line, `“${line}”`);
    }
    s.done();
    assert.equal(s.texts.length, 2 + place.lines.length, 'all of it, and no more');
    assert.ok(!reader.saying, 'and it has finished');
  } finally {
    mock.timers.reset();
  }
});

test('it reads in one slow voice: the browser’s, leaning to a name that reads verse', () => {
  const s = speech();
  const reader = new Reader({ speech: s.voices });
  reader.read(WORDS.limbo);
  const u = s.said[0];
  assert.equal(u.voice.name, 'Daniel', 'a reading voice before any other');
  assert.ok(u.rate < 1 && u.pitch < 1, 'lower and slower than the voice’s own pace');
  reader.stop();
  // the same voice for every line, and for the next place
  reader.read(WORDS.lustful);
  assert.equal(s.said.at(-1).voice, u.voice, 'one narrator throughout');
});

test('the canto is a reference, not a line: it is shown and not read', () => {
  const s = speech();
  const reader = new Reader({ speech: s.voices });
  reader.read({ title: 'The Third Circle', canto: 'VI', lines: ['In the third circle am I of the rain'] });
  assert.deepEqual(reader.lines, ['The Third Circle', 'In the third circle am I of the rain']);
  assert.ok(!s.texts.some((t) => /\bVI\b|Inferno/.test(t)));
});

test('a place’s name is said as it is spoken, not as it is written', () => {
  const s = speech();
  const reader = new Reader({ speech: s.voices });
  reader.read(WORDS.limbo);
  assert.equal(reader.lines[0], 'The First Circle · Limbo', 'written with a dot');
  assert.equal(s.texts[0], 'The First Circle, Limbo', 'and said with a pause in its place');
});

test('a moment the poem has one line for is read on its own', () => {
  const s = speech();
  const reader = new Reader({ speech: s.voices });
  assert.ok(reader.say(SAID.fall) > 0);
  assert.deepEqual(s.texts, [SAID.fall]);
});

test('stopping stops what is being read and what was waiting its turn', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const s = speech();
    const reader = new Reader({ speech: s.voices });
    reader.read(WORDS.wood);
    const was = s.texts.length;
    reader.stop();
    assert.ok(!reader.saying);
    assert.equal(s.cancelled, 1, 'the voice is cut off');
    // what was being said ends late, after the stop: the rest doesn't follow
    s.said.at(-1).onend();
    mock.timers.tick(5000);
    assert.equal(s.texts.length, was, 'nothing more is said');
  } finally {
    mock.timers.reset();
  }
});

test('nothing is said with it turned off, or while the sound is off', () => {
  const s = speech();
  const off = new Reader({ speech: s.voices });
  off.on = false;
  assert.equal(off.read(WORDS.styx), 0);
  assert.deepEqual(off.lines, [], 'turned off, there is nothing to read');
  assert.deepEqual(s.texts, []);

  let on = false;
  const quiet = new Reader({ speech: s.voices, can: () => on });
  assert.equal(quiet.read(WORDS.styx), 0, 'the sound is off');
  assert.deepEqual(quiet.lines, [WORDS.styx.title, WORDS.styx.who, ...WORDS.styx.lines], 'what it would read');
  assert.deepEqual(s.texts, [], 'but says nothing');
  on = true;
  assert.ok(quiet.read(WORDS.styx) > 0);
  assert.equal(s.texts.length, 1);
});

test('where the browser has no voice for it, nothing is heard and the words are only on the card', () => {
  const s = speech([{ name: 'Google Deutsch', lang: 'de-DE' }]);
  const reader = new Reader({ speech: s.voices });
  assert.ok(!reader.available, 'no English voice to read in');
  assert.equal(reader.read(WORDS.cocytus), 0);
  assert.deepEqual(s.texts, []);
  const card = new Card({ id: 'hell', book: 'Inferno', reader, doc: null });
  assert.equal(card.show(WORDS.cocytus, 6000), 6000, 'the card is up for just as long as before');
});

test('the card keeps a place’s words up until they have been read out', () => {
  const s = speech();
  const reader = new Reader({ speech: s.voices });
  const card = new Card({ id: 'hell', book: 'Inferno', reader, doc: null });
  const up = card.show(WORDS.malebolge, 6000);
  assert.ok(up > 6000, `longer than the while they take to read off the screen (${up} ms)`);
  assert.equal(reader.lines[0], WORDS.malebolge.title, 'and reads them');
  // taking them down, and going into the dark, both stop the voice
  card.hide();
  assert.ok(!reader.saying);
  card.show(WORDS.well, 6000);
  assert.ok(reader.saying);
  card.darken(true);
  assert.ok(!reader.saying, 'what was being read where you were is not read on over the next place');
  // a card with no voice is as it was
  assert.equal(new Card({ id: 'bare', doc: null }).show(WORDS.well, 6000), 6000);
});

test('every place in both books is read: its name first, then the poem’s own lines in order', () => {
  const s = speech();
  const reader = new Reader({ speech: s.voices });
  for (const [id, words] of [...Object.entries(WORDS), ...Object.entries(MOUNT)]) {
    const ms = reader.read(words);
    assert.ok(ms > 2000, `${id}: a reading of its own (${ms} ms)`);
    assert.equal(reader.lines[0], words.title, `${id}: its name first`);
    assert.deepEqual(reader.lines.slice(-words.lines.length), [...words.lines], `${id}: the poem's lines, in the poem's order`);
    reader.stop();
  }
});
