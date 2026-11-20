// Your microphone.
//
// Not asked for until the first time you talk, so nobody is greeted by a
// permission prompt for walking into a forest. Once you have it, it stays
// open while you are talking and for REST after, then is let go of, so the
// browser isn't showing it in use all afternoon; the next time you talk it is
// opened again (quickly, once the browser has said yes).
//
// Between words the track is turned off (enabled = false), which sends
// silence: nothing you say leaves the room unless you are holding a key.

import { Emitter } from '../core/events.js';

const REST = 60_000; // ms of not talking before the microphone is let go of
// What a voice wants: the browser's echo cancelling (so what you hear from
// others isn't sent back to them), noise suppression, and an even level.
const ASK = { audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } };

// Emits:
//   'track'   (track | null)   a microphone track to send, or none any more
//   'denied'  (why)            no microphone: 'blocked' | 'none' | 'insecure'
export class Mic extends Emitter {
  // media: the browser's navigator.mediaDevices (or a stand-in)
  constructor({ media = globalThis.navigator?.mediaDevices, rest = REST } = {}) {
    super();
    this.media = media;
    this.rest = rest;
    this.track = null;
    this.stream = null;
    this.asking = null; // the request in flight
    this.talking = false; // are you talking?
    this.quietSince = 0;
  }

  // Talking or not. The first time on, this asks for the microphone.
  set live(on) {
    this.talking = on;
    if (this.track) this.track.enabled = on;
    if (on) this.open();
    else this.quietSince = performance.now();
  }

  get live() {
    return this.talking;
  }

  // -> the track, or null if there is no microphone to be had.
  open() {
    if (this.track) return Promise.resolve(this.track);
    if (this.asking) return this.asking;
    if (!this.media || !this.media.getUserMedia) {
      // http:// on anything but localhost has no microphone at all
      this.emit('denied', globalThis.isSecureContext === false ? 'insecure' : 'none');
      return Promise.resolve(null);
    }
    this.asking = this.media.getUserMedia(ASK).then(
      (stream) => {
        this.asking = null;
        const track = stream.getAudioTracks()[0] || null;
        if (!track) {
          this.emit('denied', 'none');
          return null;
        }
        this.stream = stream;
        this.track = track;
        track.enabled = this.talking;
        // unplugged, or taken away in the browser's settings
        track.addEventListener?.('ended', () => this.track === track && this.close());
        this.emit('track', track);
        return track;
      },
      (err) => {
        this.asking = null;
        this.emit('denied', err && err.name === 'NotFoundError' ? 'none' : 'blocked');
        return null;
      },
    );
    return this.asking;
  }

  close() {
    if (!this.track) return;
    for (const t of this.stream.getTracks()) t.stop();
    this.track = null;
    this.stream = null;
    this.emit('track', null);
  }

  // Let go of it once you have been quiet long enough.
  update(now = performance.now()) {
    if (this.track && !this.talking && now - this.quietSince > this.rest) this.close();
  }
}
