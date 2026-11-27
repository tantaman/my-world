// Fits the camera for one still from the points marked by hand in it
// (tools/marks.mjs), against the set as src/set/layout.js has it: prints the
// camera position, yaw, pitch and roll that put them there through our lens
// (src/post/pipeline.js), and how far each mark lands from where it was
// marked. For checking one key of src/camera/path.js, or a layout change,
// against one still. tools/survey.mjs solves the layout and every marked
// camera together.
//
//   node abduction/tools/fit.mjs 01-establishing
//   node abduction/tools/fit.mjs 13 --free-fov       the field of view free too (checks FOV_TAN)
import { FRAMES } from './marks.mjs';
import { drawnFov } from '../src/post/pipeline.js';
import { survey, settle, project, overlayAt } from './survey.mjs';

const args = process.argv.slice(2);
const name = args.find((a) => !a.startsWith('--')) ?? '01-establishing';
const freeFov = args.includes('--free-fov');
const f = FRAMES.find((g) => g.name.startsWith(name));
if (!f) { console.log('no marks for', name, '; have', FRAMES.map((g) => g.name).join(', ')); process.exit(1); }

const [{ frame }] = settle([f]);
const res = survey([frame], { hold: true, freeFov });
const c = res.cams.get(frame);
let e = 0;
for (const [i, m] of frame.marks.entries()) {
  const q = project(c, m[0](res.L, res.us.get(`0:${i}`))) ?? [NaN, NaN];
  const d = Math.hypot(m[1][0] == null ? 0 : q[0] - m[1][0], m[1][1] == null ? 0 : q[1] - m[1][1]);
  e += d * d;
  console.log(`   ${String(m[4]).padEnd(18)} wanted ${m[1].join(',').padEnd(9)} got ${q.map((v) => v.toFixed(0)).join(',').padEnd(9)} ${d > 12 ? `off ${d.toFixed(0)}` : ''}`);
}
const fov = freeFov ? ` (overlay ${overlayAt(f.t).toFixed(1)} -> drawn ${drawnFov(overlayAt(f.t)).toFixed(1)})` : '';
console.log(`${f.name}  t ${f.t}  x ${c.x.toFixed(2)} z ${c.z.toFixed(2)} yaw ${c.yaw.toFixed(1)} pitch ${c.pitch.toFixed(1)} roll ${c.roll.toFixed(1)} fov ${c.fov.toFixed(1)}${fov}  rms ${Math.sqrt(e / frame.marks.length).toFixed(1)} px`);
