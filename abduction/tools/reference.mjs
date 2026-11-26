// Fetches the piece this folder studies and cuts the pictures PLAN.md points at.
//
//   node abduction/tools/reference.mjs          # the 1440x1080 video (27 MB)
//   node abduction/tools/reference.mjs --full   # the 2048x1536 original (66 MB)
//
// Everything lands in abduction/reference/, which is not committed: the video
// is someone else's work, and we only look at it. Needs curl and ffmpeg on the
// path (curl rather than fetch, so a proxy set in the environment is used).
//
//   reference/video.mp4            the piece, 72.5 s, 60 frames a second
//   reference/stills/NN-name.jpg   one frame per row of STILLS below
//   reference/sheets/*.jpg         the whole piece at a frame a second, and
//                                  each event of SEQUENCES frame by frame
//   reference/audio.wav            its sound, to compare spectrograms with
//   reference/spectrogram.png      20 Hz to 16 kHz, log scale

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const POST = 'javpixel_art/status/2125403467942654008';
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'reference');
const FULL = process.argv.includes('--full');

// The frames PLAN.md names, as seconds into the video: one table, shared
// with the page and tools/shoot.mjs, which draw ours at the same times.
import { STILLS } from '../src/stills.js';
export { STILLS };

// Events worth seeing frame by frame: [name, start s, length s, frames a second].
export const SEQUENCES = [
  ['lightning-1', 5.2, 2.4, 10],
  ['light-in-sky', 9.0, 6.0, 4],
  ['car', 16.0, 6.0, 4],
  ['lightning-2', 41.6, 2.4, 10],
  ['arrival', 45.0, 12.0, 2],
  ['departure', 57.0, 12.0, 2],
  ['glitch', 70.2, 2.4, 10],
];

function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'inherit'], maxBuffer: 1 << 28, ...opts });
}

function need(cmd) {
  try {
    run(cmd, ['-version'], { stdio: 'ignore' });
  } catch {
    try { run(cmd, ['--version'], { stdio: 'ignore' }); } catch {
      console.error(`${cmd} is needed and was not found on the path.`);
      process.exit(1);
    }
  }
}

// Where the video is: the post's media list, through a public mirror of X's
// API. The files are named by size, so the one wanted is picked by its height.
function videoUrl() {
  const json = run('curl', ['-fsS', '-m', '30', '-A', 'reference-fetch', `https://api.fxtwitter.com/${POST}`]);
  const formats = JSON.parse(json.toString()).tweet.media.videos[0].formats.filter((f) => f.container === 'mp4');
  const want = FULL ? '2048x1536' : '1440x1080';
  const hit = formats.find((f) => f.url.includes(`/${want}/`)) ?? formats.sort((a, b) => b.bitrate - a.bitrate)[0];
  return hit.url;
}

function ffmpeg(...args) {
  run('ffmpeg', ['-v', 'error', '-y', ...args]);
}

need('curl');
need('ffmpeg');
for (const d of ['', 'stills', 'sheets']) mkdirSync(join(OUT, d), { recursive: true });

const video = join(OUT, FULL ? 'video-full.mp4' : 'video.mp4');
if (!existsSync(video) || statSync(video).size < 1e6) {
  const url = videoUrl();
  console.log('fetching', url);
  run('curl', ['-fsS', '-m', '600', '-o', video, url]);
}

for (const [name, t] of STILLS) {
  ffmpeg('-ss', String(t), '-i', video, '-frames:v', '1', '-q:v', '2', join(OUT, 'stills', `${name}.jpg`));
}

// The whole piece, a frame a second, 24 to a sheet.
ffmpeg('-i', video, '-vf', 'fps=1,scale=480:-1,tile=6x4', '-q:v', '3', join(OUT, 'sheets', 'overview-%02d.jpg'));
for (const [name, start, length, fps] of SEQUENCES) {
  ffmpeg('-ss', String(start), '-t', String(length), '-i', video,
    '-vf', `fps=${fps},scale=480:-1,tile=6x4`, '-frames:v', '1', '-q:v', '3', join(OUT, 'sheets', `${name}.jpg`));
}

ffmpeg('-i', video, '-vn', '-ac', '2', '-ar', '48000', join(OUT, 'audio.wav'));
ffmpeg('-i', video, '-lavfi', 'showspectrumpic=s=1800x700:legend=1:scale=log:fscale=log:start=20:stop=16000',
  join(OUT, 'spectrogram.png'));

console.log(`reference in ${OUT}: ${STILLS.length} stills, ${SEQUENCES.length + 4} sheets, audio and its spectrogram`);
