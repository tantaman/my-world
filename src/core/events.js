// A tiny event emitter. Things that others need to hear about extend it (or
// hold one) instead of exposing a single `onSomething` slot, so a second
// listener never has to elbow the first one out.
//
//   chunks.on('vegetation', (chunk) => ...)   -> a function that stops listening
//   chunks.emit('vegetation', chunk)
//
// Listeners run synchronously, in the order they were added. Some events rely
// on that: 'terrain' on the chunk manager is heard *before* the mesh is built,
// so a listener can still patch the buffers.

export class Emitter {
  #listeners = new Map();

  on(type, fn) {
    let set = this.#listeners.get(type);
    if (!set) this.#listeners.set(type, (set = new Set()));
    set.add(fn);
    return () => set.delete(fn);
  }

  once(type, fn) {
    const off = this.on(type, (...args) => {
      off();
      fn(...args);
    });
    return off;
  }

  off(type, fn) {
    const set = this.#listeners.get(type);
    if (set) set.delete(fn);
  }

  emit(type, ...args) {
    const set = this.#listeners.get(type);
    if (!set || !set.size) return;
    // a copy, so a listener may stop listening while it is being told
    for (const fn of [...set]) fn(...args);
  }

  // Is anyone listening? Lets an emitter skip building an expensive payload.
  hears(type) {
    const set = this.#listeners.get(type);
    return !!set && set.size > 0;
  }
}
