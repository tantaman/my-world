// Where the listener is and what is round them, against t: read from the
// same functions that place the picture (the camera's path, the car's lane,
// the saucer's flight), so the sound can be scheduled for the whole take
// when it starts, and an offline render (tools/sound.mjs) hears exactly what
// the page plays. The hand's sway is left out: centimetres, inaudible.
import { cameraAt } from '../camera/path.js';
import { carX, CAR } from '../props/sedan.js';
import { flightAt, createFlightState } from '../ufo/flight.js';
import { CANOPY } from '../set/layout.js';

const SPEED_OF_SOUND = 343;            // m/s
const CAR_HEIGHT = 0.4;                // m, where its tyres and engine are heard from
const CANOPY_EDGE = 2.5;               // m inside the canopy's edge before the sky is quite shut out

const _view = {};
const _flight = createFlightState();

// The thing at (x, y, z) from the camera at t: { distance, azimuth (radians,
// + to the right of where the camera looks), x right, z ahead }.
function relative(t, x, y, z, out) {
  cameraAt(t, _view);
  const yaw = (_view.yaw * Math.PI) / 180;
  const fx = Math.cos(yaw);
  const fz = Math.sin(yaw);
  const rx = x - _view.x;
  const ry = y - _view.y;
  const rz = z - _view.z;
  out.ahead = rx * fx + rz * fz;
  out.right = -rx * fz + rz * fx;
  out.distance = Math.hypot(rx, ry, rz);
  out.ground = Math.hypot(rx, rz);
  out.azimuth = Math.atan2(out.right, out.ahead);
  out.height = _view.y;
  return out;
}

// The car at t (its lane, from props/sedan.js).
export function carFrom(t, out = {}) {
  return relative(t, carX(t), CAR_HEIGHT, CAR.lane, out);
}

// Doppler factor of the car at t: c / (c + the rate its distance grows).
export function carDoppler(t) {
  const dt = 0.02;
  const a = carFrom(t - dt, {}).distance;
  const b = carFrom(t + dt, {}).distance;
  return SPEED_OF_SOUND / (SPEED_OF_SOUND + (b - a) / (2 * dt));
}

// The saucer at t: { visible, distance, azimuth, speed, height above the camera }.
export function saucerFrom(t, out = {}) {
  flightAt(t, _flight);
  relative(t, _flight.position.x, _flight.position.y, _flight.position.z, out);
  out.visible = _flight.visible;
  out.speed = _flight.speed;
  out.above = _flight.position.y - out.height;
  return out;
}

// How far under the canopy the camera is at t: 0 in the open, 1 once
// CANOPY_EDGE metres inside its edge.
export function shelter(t) {
  cameraAt(t, _view);
  const inside = Math.min(_view.x - CANOPY.x0, CANOPY.x1 - _view.x, _view.z - CANOPY.z0, CANOPY.z1 - _view.z);
  return Math.max(0, Math.min(1, inside / CANOPY_EDGE));
}

// Seconds sound takes to come `metres`.
export const delayOf = (metres) => metres / SPEED_OF_SOUND;
