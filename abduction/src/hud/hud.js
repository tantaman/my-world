// The overlay: the corners of a bodycam's picture, with live values.
// The clock is the take's time added to when it started; 1536P is the
// canvas's real height; FOV is the camera's; the meters follow the left and
// right loudness of our own sound.
import './hud.css';
import { CLOCK_START } from '../timeline.js';
import { WORDS } from '../words.js';

const BLOCKS = 10;

function meterHtml(label) {
  return `<span>${label}</span><span>${'<i></i>'.repeat(BLOCKS)}</span>`;
}

export function createHud(root, stage) {
  root.innerHTML = `
    <div class="c tl">${WORDS.hud.device}\n${WORDS.hud.unit}</div>
    <div class="c tr"><span class="rec">REC</span>\n<span class="clock"></span>\n${WORDS.hud.camera}</div>
    <div class="c bl"><span class="bat"></span>92%\n<span class="res"></span>\n<span class="fov"></span>\nISO 800</div>
    <div class="c br"><div class="meter">${meterHtml('L')}</div><div class="meter">${meterHtml('R')}</div></div>`;
  const clock = root.querySelector('.clock');
  const res = root.querySelector('.res');
  const fov = root.querySelector('.fov');
  const meters = [...root.querySelectorAll('.meter')].map((m) => [...m.querySelectorAll('i')]);
  const last = { clock: '', res: '', fov: '', l: -1, r: -1, o: -1 };

  const pad = (n) => String(n).padStart(2, '0');

  function setMeter(blocks, level) {
    const lit = Math.round(level * BLOCKS);
    for (let i = 0; i < BLOCKS; i++) blocks[i].className = i < lit ? 'on' : i === lit ? 'half' : '';
  }

  return {
    // t: seconds into the take; height: the canvas's pixels; fovDeg; levels 0..1; opacity 0..1
    update(t, height, fovDeg, levelL, levelR, opacity) {
      stage.style.setProperty('--h', `${stage.clientHeight}px`);
      const total = Math.floor(CLOCK_START.h * 3600 + CLOCK_START.m * 60 + CLOCK_START.s + t);
      const c = `${WORDS.hud.date} ${pad(Math.floor(total / 3600) % 24)}:${pad(Math.floor(total / 60) % 60)}:${pad(total % 60)}`;
      if (c !== last.clock) clock.textContent = last.clock = c;
      const r = `${height}P`;
      if (r !== last.res) res.textContent = last.res = r;
      const f = `FOV ${Math.round(fovDeg)}°`;
      if (f !== last.fov) fov.textContent = last.fov = f;
      const l = Math.round(levelL * BLOCKS);
      const rr = Math.round(levelR * BLOCKS);
      if (l !== last.l) { setMeter(meters[0], levelL); last.l = l; }
      if (rr !== last.r) { setMeter(meters[1], levelR); last.r = rr; }
      if (opacity !== last.o) { root.style.opacity = String(opacity); last.o = opacity; }
    },
  };
}
