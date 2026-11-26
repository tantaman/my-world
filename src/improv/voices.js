// The comics' voices: the browser's own speech (speechSynthesis), saying
// each line in a voice of its own for each person on the bill, as high or
// low and as quick as sets.js says they talk.
//
// Speech doesn't go through the game's sound (it can't: the browser says it
// itself), so it's turned down and stopped here instead: nothing is said
// while the sound is off, and what's being said stops when you walk out of
// the room. Where the browser has no voices to say it with (or none in
// English), nothing is heard and the words are only on the screen.
//
//   const v = new Voices()
//   v.say(text, person, volume, { end })   end(): when it's been said
//   v.stop()                               stop what's being said, and what's waiting
//   v.available                            whether there's a voice to say it in
//   v.voiceOf(person)                      which of the browser's voices is theirs

// Names the browsers give their voices that say whose they sound like.
const HERS = /female|woman|samantha|victoria|karen|moira|tessa|fiona|zira|susan|serena|allison|ava|kate|joanna|salli|kimberly|ivy|emma|amy|libby|sonia|aria|jenny|michelle|catherine|hazel|heera|veena/i;
const HIS = /male|man\b|daniel|alex|fred|david|mark|aaron|rishi|tom|oliver|arthur|guy|ryan|eric|christopher|george|james|matthew|joey|justin|brian/i;

const hash = (s) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};

export class Voices {
  constructor(synth = globalThis.speechSynthesis || null, Utterance = globalThis.SpeechSynthesisUtterance || null) {
    this.synth = synth && Utterance ? synth : null;
    this.Utterance = Utterance;
    this.list = [];
    this.chosen = new Map();
    if (!this.synth) return;
    const load = () => {
      const all = this.synth.getVoices() || [];
      const en = all.filter((v) => /^en/i.test(v.lang));
      // American voices first: it's Washington
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
  voiceOf(person) {
    if (!this.list.length) return null;
    let v = this.chosen.get(person.id);
    if (v) return v;
    const her = person.voice?.her;
    const like = this.list.filter((x) => (her ? HERS.test(x.name) && !/\bmale\b/i.test(x.name) : HIS.test(x.name) && !/female/i.test(x.name)));
    const from = like.length ? like : this.list;
    v = from[hash(person.id) % from.length];
    this.chosen.set(person.id, v);
    return v;
  }

  say(text, person, volume = 1, { end } = {}) {
    if (!this.synth) return false;
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
    const finish = (ok) => {
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
