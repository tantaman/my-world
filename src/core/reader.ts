// The voice that reads a book aloud: the poem's own lines said as you come
// to each place, a line of verse at a time, in one slow voice. Hell and the
// mountain of Purgatory above it are laid out in Dante's words, and this is
// those words spoken: the card shows them (core/card.js) and the reader
// says them, so the poem is heard as well as read.
//
// It is the browser's own speech (core/speech.ts): nothing recorded, nothing
// fetched. Where the browser has no voice for it, nothing is heard and the
// words are only on the card; `available` says which.
//
//   const reader = new Reader({ can: () => sound.enabled && sound.running })
//   reader.read({ title, who, lines })   -> ms the reading should take, 0 for none
//   reader.say('And fell, even as a dead body falls.')
//   reader.stop()                        what is being read, and what waits
//   reader.on = false                    the setting: the poem read aloud
//   reader.saying                        whether it is reading now
//   reader.lines                         what it was last asked to read
//
// Whoever owns the reader turns the rest of the sound down while it speaks
// (`saying`, and audio/soundscape.js: sound.under), since the browser's
// voice doesn't come through the game's mixer and can't be placed in it.

import { Voices } from './speech.ts';
import type { Speaker } from './speech.ts';

// How it reads: lower and slower than the browser's own pace, with a rest at
// the end of each line of verse and a longer one after the name of a place.
const RATE = 0.84; // of the voice's own pace
const PITCH = 0.9;
const REST = 360; // ms between one line and the next
const HEADING = 620; // ms after the name of a place, before its lines
// Words a minute at that pace, for how long a reading will take. It is only
// an estimate: the browser won't say how long it will be, and its voices
// differ widely. It errs long, since the card it holds up is better left up
// a moment too long than taken down while the voice is still reading.
const WPM = 130;
// Voices that read verse well, where the browser has one of them: the
// British ones first, the names being all there is to go on.
const LIKE = /google uk english male|\bdaniel\b|\barthur\b|\boliver\b|\bryan\b|\bgeorge\b|\balex\b|\bfred\b|\bguy\b/i;

// The one voice the poem is read in.
const NARRATOR: Speaker = { id: 'narrator', voice: { pitch: PITCH, rate: RATE, like: LIKE } };

// How many words there are to say in a line, for how long it takes.
const wordsIn = (text: string) => text.split(/\s+/).filter((w) => /[a-z0-9]/i.test(w)).length;

// A line as it is said rather than as it is written: the dot a place's name
// is written with ('The First Circle · Limbo') is a pause when it is spoken,
// and some voices stumble over it. The poem's own quotes and dashes they
// take in their stride.
const speakable = (text: string) => text.replace(/\s+·\s+/g, ', ');

// A place's words, as the card takes them (core/card.js). The canto isn't
// read: it is a reference, not a line of the poem.
export interface Lines {
  title?: string;
  who?: string;
  lines?: readonly string[];
}

export interface ReaderOpts {
  // the browser's voices, or a stand-in while the rules are checked
  speech?: Voices;
  // whether it may speak at all now (the sound being on, and running)
  can?: () => boolean;
}

// One line to say, and how long to rest after it.
interface Spoken {
  text: string;
  rest: number;
}

export class Reader {
  speech: Voices;
  can: () => boolean;
  // the setting: whether the poem is read aloud at all
  on = true;
  // what it was last asked to read, line by line, whether or not it could be
  // said aloud
  lines: string[] = [];
  private queue: Spoken[] = [];
  private turn = 0; // which reading this is, so a stopped one doesn't go on
  private timer: ReturnType<typeof setTimeout> | 0 = 0;
  private reading = false;

  constructor({ speech = new Voices(), can = () => true }: ReaderOpts = {}) {
    this.speech = speech;
    this.can = can;
  }

  // Whether there is a voice to read in at all.
  get available() {
    return this.speech.available;
  }

  // Whether it would read something now, were it given something to read.
  get wanted() {
    return this.on && this.speech.available && this.can();
  }

  // Whether it is reading now (a line being said, or the rest between two).
  get saying() {
    return this.reading;
  }

  // Read a place's words: its name, who is there, and the poem's lines for
  // it, each said on its own so the verse breaks where the poem breaks it.
  // -> how long the reading should take (ms), 0 if nothing will be said.
  read(words: Lines | null | undefined): number {
    this.stop();
    this.lines = [];
    if (!words || !this.on) return 0;
    const head = [words.title, words.who].filter((s): s is string => !!s);
    const verse = (words.lines || []).filter((s) => !!s);
    this.lines = [...head, ...verse];
    if (!this.lines.length || !this.wanted) return 0;
    this.queue = [...head.map((text) => ({ text, rest: HEADING })), ...verse.map((text) => ({ text, rest: REST }))];
    const ms = this.queue.reduce((t, s) => t + wordsIn(s.text) * (60000 / WPM) + s.rest, 0) - REST;
    this.reading = true;
    this.next(0);
    return Math.round(ms);
  }

  // One line, with nothing shown: said at a moment the poem has a line for.
  say(line: string): number {
    return this.read({ lines: [line] });
  }

  // Stop what is being read, and whatever was waiting its turn.
  stop() {
    this.turn++;
    if (this.timer) clearTimeout(this.timer);
    this.timer = 0;
    this.queue = [];
    this.reading = false;
    this.speech.stop();
  }

  // Say the kth line, and the next when it has been said: one at a time, so
  // that stopping part way through stops the rest, and the rests between
  // lines are the reader's and not the voice's.
  private next(k: number) {
    const mine = this.turn;
    const line = this.queue[k];
    if (!line) {
      this.reading = false;
      return;
    }
    const said = this.speech.say(speakable(line.text), NARRATOR, 1, {
      end: () => {
        if (mine !== this.turn) return;
        this.timer = setTimeout(() => {
          if (mine === this.turn) this.next(k + 1);
        }, line.rest);
      },
    });
    if (!said) this.reading = false;
  }
}
