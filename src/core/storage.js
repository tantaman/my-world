// This browser's memory (localStorage), as JSON, and never throwing: private
// windows, full disks and blocked storage all just mean "nothing remembered".
//
// Every key the game keeps is listed here, so there is one place to see what
// is on a visitor's machine. Changing the spelling of a key forgets whatever
// was under the old one.

export const KEYS = {
  settings: 'my-world:settings', // look and sound settings
  state: 'my-world:state', // where you stood and the hour, for a world that is only local
  build: (seed) => `my-world:build:${seed}`, // what you changed in a local world
  marks: (seed) => `my-world:marks:${seed}`, // your map marks in a local world
  world: (id) => `my-world:world:${id}`, // this browser's copy of a world on the save server
};

export const storage = {
  get(key) {
    try {
      return JSON.parse(localStorage.getItem(key) || 'null');
    } catch {
      return null;
    }
  },

  // -> whether it was written
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  },

  remove(key) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* nothing to forget */
    }
  },
};

// The same thing, kept in memory: for tests, and for running with no browser.
export function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial).map(([k, v]) => [k, JSON.stringify(v)]));
  return {
    data,
    get: (key) => (data.has(key) ? JSON.parse(data.get(key)) : null),
    set: (key, value) => (data.set(key, JSON.stringify(value)), true),
    remove: (key) => void data.delete(key),
  };
}
