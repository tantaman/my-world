// Who you can be: the hikers, in the order they are offered. Each is a file
// in hikers/, and what one is (id, name, size, dress) is at the top of
// Character in character.js.
//
// A hiker's id is how others in the world are told who you are, so once
// someone is in, it stays as it is; a name can change.

import { HIKER } from './hikers/hiker.js';
import { LAUREN } from './hikers/lauren.js';
import { OLIVER } from './hikers/oliver.js';
import { ELLIOTT } from './hikers/elliott.js';

export const HIKERS = [HIKER, LAUREN, OLIVER, ELLIOTT];

// The hiker with this id, or the first if there's none (someone newer than
// this build, or nobody said).
export function hiker(id) {
  return HIKERS.find((h) => h.id === id) || HIKERS[0];
}
