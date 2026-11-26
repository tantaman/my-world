// The browser's own speech (speechSynthesis): words said aloud over the
// game, in a voice for whoever says them — a comic on the bill at the
// Improv, the voice that reads the poem out in Hell (core/reader.ts).
//
// Speech doesn't go through the game's sound (it can't: the browser says it
// itself), so whoever asks for it turns it down and stops it instead:
// nothing is said while the sound is off, and what's being said stops when
// you walk out of the room. Where the browser has no voices to say it with
// (or none in English), nothing is heard and the words are only on the
// screen. Nothing is fetched and nothing is recorded: it is the voice the
// browser already has.
//
//   const v = new Voices()
//   v.say(text, who, volume, { end })   end(): when it's been said
//   v.stop()                            stop what's being said, and what's waiting
//   v.available                         whether there's a voice to say it in
//   v.voiceOf(who)                      which of the browser's voices is theirs

// Whoever is speaking: an id, so the same voice is theirs every time, and
// how they sound.
//   pitch, rate   how high and how quick they talk (1 is the voice's own)
//   like          names of the browser's voices to lean towards before
//                 anything else (a slow reading voice)
//   her           which of its voices to lean towards where it has both
export interface Speaker {
  id: string;
  voice?: { her?: boolean; pitch?: number; rate?: number; like?: RegExp };
}

// What a reading is told when it has been said (Voices.say).
export interface Said {
  end?: () => void;
}

// Names the browsers give their voices that say whose they sound like.
const HERS = /female|woman|samantha|victoria|karen|moira|tessa|fiona|zira|susan|serena|allison|ava|kate|joanna|salli|kimberly|ivy|emma|amy|libby|sonia|aria|jenny|michelle|catherine|hazel|heera|veena/i;
const HIS = /male|man\b|daniel|alex|fred|david|mark|aaron|rishi|tom|oliver|arthur|guy|ryan|eric|christopher|george|james|matthew|joey|justin|brian/i;

const hash = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};

export class Voices {
  synth: SpeechSynthesis | null;
  Utterance: typeof SpeechSynthesisUtterance | null;
  list: SpeechSynthesisVoice[];
  chosen: Map<string, SpeechSynthesisVoice>;

  constructor(synth: SpeechSynthesis | null = globalThis.speechSynthesis || null, Utterance: typeof SpeechSynthesisUtterance | null = globalThis.SpeechSynthesisUtterance || null) {
    this.synth = synth && Utterance ? synth : null;
    this.Utterance = Utterance;
    this.list = [];
    this.chosen = new Map();
    if (!this.synth) return;
    const load = () => {
      const all = this.synth?.getVoices() || [];
      const en = all.filter((v) => /^en/i.test(v.lang));
      // the voices most browsers have, first
      this.list = [...en.filter((v) => /en[-_]US/i.test(v.lang)), ...en.filter((v) => !/en[-_]US/i.test(v.lang))];
      this.chosen.clear();
    };
    load();
    this.synth.addEventListener?.('voiceschanged', load);
  }

  get available() {
    return !!this.synth && this.list.length > 0;
  }

  // Their voice: one of the browser's that sounds like them where it can
  // tell, the same one every time.
  voiceOf(person: Speaker): SpeechSynthesisVoice | null {
    if (!this.list.length) return null;
    const had = this.chosen.get(person.id);
    if (had) return had;
    const her = person.voice?.her;
    const like = person.voice?.like;
    // one they asked for by name, else one that sounds like them
    const named = like ? this.list.filter((x) => like.test(x.name)) : [];
    const sounds = her ? this.list.filter((x) => HERS.test(x.name) && !/\bmale\b/i.test(x.name)) : this.list.filter((x) => HIS.test(x.name) && !/female/i.test(x.name));
    const from = named.length ? named : sounds.length ? sounds : this.list;
    const v = from[hash(person.id) % from.length] ?? null;
    if (v) this.chosen.set(person.id, v);
    return v;
  }

  say(text: string, person: Speaker, volume = 1, { end }: Said = {}): boolean {
    if (!this.synth || !this.Utterance) return false;
    // (anything still waiting is late: let it go, and say this)
    if (this.synth.pending) this.synth.cancel();
    const u = new this.Utterance(text);
    const v = this.voiceOf(person);
    if (v) {
      u.voice = v;
      u.lang = v.lang;
    } else u.lang = 'en-US';
    u.pitch = person.voice?.pitch ?? 1;
    u.rate = person.voice?.rate ?? 1;
    u.volume = Math.max(0, Math.min(1, volume));
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      if (ok) end?.();
    };
    u.onend = () => finish(true);
    u.onerror = () => finish(false);
    this.synth.speak(u);
    return true;
  }

  stop() {
    if (this.synth && (this.synth.speaking || this.synth.pending)) this.synth.cancel();
  }

  get speaking() {
    return !!this.synth && this.synth.speaking;
  }
}
