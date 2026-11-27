// The original's own sound, played in place of ours on the private page:
// reference/audio.wav, cut from the video by tools/reference.mjs (the file
// tools/sound.py measures ours against). It is someone else's work, so it is
// not committed and goes nowhere else: the page built to be shown (Vite's
// mode "publish") leaves this module out and plays ours (mix.js), as it
// carries our own words (words.js).
//
// The file's first sample is t = 0: in the video, sound and picture both
// start at 0 (ffprobe gives start_time 0.000000 for each stream), and the
// stills we are set against are cut at the same seconds.
const FILE = './reference/audio.wav';
const RATE = 48000;            // Hz, the file's (reference.mjs asks ffmpeg for it)

// Fetched and decoded as the page loads, so the title card's Play need not
// wait for it. An AudioBuffer, or null where the file is not there: a build
// (reference/ is not in it), or reference.mjs not run yet.
export async function loadOriginal() {
  try {
    const res = await fetch(FILE);
    // A dev server answers a missing file with the page itself.
    if (!res.ok || (res.headers.get('content-type') ?? '').includes('text/html')) return null;
    const bytes = await res.arrayBuffer();
    // Decoded in a context of its own, which needs no click to exist; the
    // page's context resamples it if it runs at another rate.
    return await new OfflineAudioContext(2, 1, RATE).decodeAudioData(bytes);
  } catch (err) {
    console.warn('the original\'s sound could not be read:', err);
    return null;
  }
}
