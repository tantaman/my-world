// The only place that reads the URL. Everything else asks this module.
//
//   ?t=53                stop at that second
//   ?still=13-ufo-hover  stop at that still's time; window.__ready once drawn
//   ?ref=13-ufo-hover    lay the original's still over the canvas, half see-through
//   ?raw                 no lens, grain, interference or overlay
//   ?scale=0.5           draw smaller (software rendering is slow)
//   ?stats               frame time, draw calls, triangles
//   ?free                fly the camera yourself
//   ?mute                no sound (also: no title card when stopped at a time)
//   ?capture             draw only when tools/capture.mjs asks (window.__drawAt)
//   ?blockout            milestone 0's grey boxes instead of the set
//   ?webgl               WebGPURenderer's WebGL 2 backend (headless Chromium here
//                        loses its WebGPU device as soon as it draws to a canvas)
import { stillTime } from './stills.js';

const q = new URLSearchParams(location.search);
const num = (k, d) => (q.has(k) && q.get(k) !== '' && Number.isFinite(+q.get(k)) ? +q.get(k) : d);

const still = q.has('still') ? stillTime(q.get('still')) : null;
const refName = q.get('ref');
const ref = refName ? (stillTime(refName)?.name ?? refName) : null;

export const params = {
  // A fixed time, or null to play.
  t: still ? still.t : q.has('t') ? num('t', 0) : ref ? stillTime(ref)?.t ?? null : null,
  still: still?.name ?? null,
  ref,
  raw: q.has('raw'),
  scale: Math.min(2, Math.max(0.1, num('scale', 1))),
  stats: q.has('stats'),
  free: q.has('free'),
  mute: q.has('mute'),
  webgl: q.has('webgl'),
  blockout: q.has('blockout'),
  capture: q.has('capture'),
  // Turn single parts off to see what each costs: ?no=mirror,rain,scatter,bloom,shadows,trees
  no: new Set((q.get('no') ?? '').split(',').filter(Boolean)),
};

export const has = (part) => !params.no.has(part);
