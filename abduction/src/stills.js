// The frames PLAN.md names, as seconds into the piece. tools/reference.mjs
// cuts the original's at these times, and the page (?still=name) and
// tools/shoot.mjs draw ours at the same times under the same names.
export const STILLS = [
  ['01-establishing', 0.5],
  ['02-lightning-sign', 5.8],
  ['03-light-in-sky', 11.0],
  ['04-station', 17.0],
  ['05-car', 20.0],
  ['06-canopy-pan', 24.5],
  ['07-shopfront', 27.0],
  ['08-interior', 30.0],
  ['09-under-canopy', 36.0],
  ['10-pasture', 42.0],
  ['11-lightning-pasture', 42.3],
  ['12-ufo-arrives', 48.0],
  ['13-ufo-hover', 53.0],
  ['14-beam', 55.0],
  ['15-cow-rising', 57.0],
  ['16-ufo-empty', 61.0],
  ['17-ufo-leaves', 63.0],
  ['18-return', 71.0],
  ['19-glitch', 71.5],
];

export function stillTime(name) {
  const row = STILLS.find(([n]) => n === name || n.slice(3) === name || n.slice(0, 2) === name);
  return row ? { name: row[0], t: row[1] } : null;
}
