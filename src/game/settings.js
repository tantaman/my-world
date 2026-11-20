// The handful of preferences that are about this visitor rather than any
// world: how the picture looks, whether sound is on. Kept in this browser.
//
//   settings.get('softness', 'number')   -> the remembered value, or undefined
//   settings.set('softness', 0.4)
//
// A feature keeps its own settings here under its own names; nothing needs
// declaring up front.

export class Settings {
  // fresh: start from nothing (?reset), though changes are still remembered
  constructor(storage, key, { fresh = false } = {}) {
    this.storage = storage;
    this.key = key;
    const kept = fresh ? null : storage.get(key);
    this.values = kept && typeof kept === 'object' ? kept : {};
  }

  // type: what the value must be to be believed ('number', 'boolean', ...)
  get(name, type) {
    const v = this.values[name];
    return type === undefined || typeof v === type ? v : undefined;
  }

  set(name, value) {
    this.values[name] = value;
    this.storage.set(this.key, this.values);
  }
}
