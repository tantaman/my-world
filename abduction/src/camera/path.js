// Where the camera is, where it looks, and its lens, against time: three
// tracks, keyed from PLAN.md sections 3 and 4 and fitted against the stills.
//
// Yaw is measured from +X toward +Z, in degrees: 0 looks east along the shop
// front, 90 looks north across the road at the field. Turning right makes
// yaw grow. Pitch is up from level.
import { createTrack } from './track.js';
import { EYE } from '../set/layout.js';

// [t, x, z]
export const WHERE = createTrack([
  [0.0, -17.0, 7.5],
  [6.4, -16.8, 7.6],
  [9.5, -16.0, 7.4],
  [12.5, -14.0, 7.0],
  [17.0, -8.5, 5.2],
  [20.0, -6.5, 5.6],
  [21.5, -6.0, 5.8],
  [24.5, -5.0, 5.4],
  [27.0, -2.6, 2.6],
  [30.0, -0.6, 1.9],
  [31.5, -0.8, 2.6],
  [36.0, -1.0, 4.5],
  [39.5, 0.2, 7.6],
  [42.0, 1.2, 9.6],
  [44.0, 0.4, 11.0],
  [46.0, -1.6, 12.6],
  [48.0, -2.2, 13.4],
  [51.0, -2.5, 14.1],
  [72.5, -2.5, 14.1],
]);

// [t, yaw, pitch]
export const LOOK = createTrack([
  [0.0, -9, 3],
  [3.5, -6, 3],
  [5.5, 38, 1],
  [6.4, 38, 1],
  [9.0, -8, 6],
  [11.0, -12, 19],
  [12.5, -10, 18],
  [16.0, -10, 2],
  [17.0, -12, 1],
  [18.5, 10, 0],
  [20.0, 40, -1],
  [21.0, 50, -1],
  [24.5, 6, 2],
  [27.0, -98, -4],
  [30.0, -92, -6],
  [31.0, -86, -4],
  [33.5, -40, -2],
  [36.0, 4, 0],
  [38.5, 40, 1],
  [41.0, 86, 4],
  [42.0, 88, 4],
  [46.0, 88, 6],
  [48.0, 84, 14],
  [50.5, 80, 24],
  [53.0, 79, 28],
  [55.0, 79, 22],
  [57.0, 79, 24],
  [59.5, 80, 26],
  [61.0, 80, 28],
  [61.8, 82, 29],
  [63.0, 98, 33],
  [64.8, 110, 34],
  [68.3, 108, 24],
  [70.3, -26, 4],
  [72.5, -28, 4],
]);

// [t, fov in degrees], as the overlay reads it (PLAN.md section 11).
export const FOV = createTrack([
  [0, 95], [5, 95], [6, 98], [7, 103], [8, 108], [9, 110], [10, 97], [11, 95],
  [12, 99], [13, 110], [16, 110], [31, 110], [32, 111], [33, 113], [34, 114],
  [45, 114], [47, 113], [48, 110], [49, 107], [50, 105], [51, 105], [52, 109],
  [53, 113], [54, 114], [72.5, 114],
]);

const _p = [0, 0];
const _l = [0, 0];
const _f = [0];

// Fills out = { x, y, z, yaw, pitch, fov } (degrees) for time t.
export function cameraAt(t, out) {
  WHERE.sample(t, _p);
  LOOK.sample(t, _l);
  FOV.sample(t, _f);
  out.x = _p[0];
  out.y = EYE;
  out.z = _p[1];
  out.yaw = _l[0];
  out.pitch = _l[1];
  out.fov = _f[0];
  return out;
}
