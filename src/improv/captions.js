// What's being said on the stage, on the screen: the speaker's name and
// their line, at the bottom of it, as subtitles are. They're up whether or
// not the browser can say the words aloud (core/speech.ts), and whether or not
// the sound is on.
//
//   const c = new Captions()
//   c.show(who, text, { tone })   tone: 'line' | 'room' (applause, the room
//                                 shouting: in italics, no name)
//   c.hide()
//   c.text                        what's up now ('' when nothing is)

export class Captions {
  constructor() {
    this.text = '';
    this.el = null;
    if (typeof document === 'undefined') return;
    const el = (this.el = document.createElement('div'));
    el.id = 'improv-captions';
    Object.assign(el.style, {
      position: 'fixed',
      left: '50%',
      bottom: '18%',
      transform: 'translateX(-50%)',
      maxWidth: 'min(760px, 86vw)',
      padding: '8px 14px',
      borderRadius: '6px',
      background: 'rgba(10, 8, 12, 0.72)',
      color: '#f4efe6',
      font: '600 17px/1.35 Helvetica, Arial, sans-serif',
      textAlign: 'center',
      pointerEvents: 'none',
      zIndex: 20,
      display: 'none',
      textShadow: '0 1px 2px #000',
    });
    this.who = document.createElement('div');
    Object.assign(this.who.style, { color: '#ffb0a0', font: '700 12px/1.4 Helvetica, Arial, sans-serif', letterSpacing: '0.06em', textTransform: 'uppercase' });
    this.line = document.createElement('div');
    el.append(this.who, this.line);
    document.body.appendChild(el);
  }

  show(who, text, { tone = 'line' } = {}) {
    const key = `${who}|${text}|${tone}`;
    if (key === this._key) return;
    this._key = key;
    this.text = text;
    if (!this.el) return;
    this.who.textContent = who || '';
    this.who.style.display = who ? 'block' : 'none';
    this.line.textContent = text;
    this.line.style.fontStyle = tone === 'room' ? 'italic' : 'normal';
    this.el.style.display = 'block';
  }

  hide() {
    if (this._key === '') return;
    this._key = '';
    this.text = '';
    if (this.el) this.el.style.display = 'none';
  }
}
