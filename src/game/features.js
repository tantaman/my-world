// Which features the game is made of, and the order they install in.
//
// A feature is a folder under src/ whose index.js exports its install
// function and, if it uses what other features provide, their folders:
//
//   // src/fires/index.js
//   export const after = ['render', 'world', 'audio', 'build'];
//   export function installFires(game) { ... }
//
// main.js finds every one of them, so there is no list to add a new feature
// to. They install in an order that puts each after the ones it names, and
// where that leaves a choice, by name. Adding a feature therefore never
// changes the order of the others among themselves.
//
// The order is more than who can use what. It is also where tools sit on the
// tool bar, the order keys are listed on the help panel, and the order
// systems run within a phase of the frame. To come after a feature for one of
// those reasons, name it in `after` all the same, and say why beside it.

// The features among the modules main.js found, as import.meta.glob gives
// them: { './fires/index.js': { after, installFires } }
//   -> [{ name: 'fires', after: [...], install }]
// A folder whose index.js exports no install function isn't a feature.
export function featuresIn(modules) {
  const found = [];
  for (const [path, module] of Object.entries(modules)) {
    const installs = Object.keys(module).filter((key) => /^install[A-Z]/.test(key) && typeof module[key] === 'function');
    if (!installs.length) continue;
    if (installs.length > 1) throw new Error(`${path} exports more than one install function (${installs.join(', ')})`);
    found.push({ name: path.split('/').at(-2), after: module.after || [], install: module[installs[0]] });
  }
  return found;
}

// Those, in the order to install them: each after everything it names, and
// otherwise by name.
export function inOrder(features) {
  const names = new Set();
  for (const f of features) {
    if (names.has(f.name)) throw new Error(`two features are called "${f.name}"`);
    names.add(f.name);
  }
  for (const f of features) {
    for (const a of f.after) {
      if (!names.has(a)) throw new Error(`"${f.name}" comes after "${a}", and there is no such feature (there are: ${[...names].sort().join(', ')})`);
    }
  }
  // Plain comparison, not localeCompare: the order must not depend on whose machine it is.
  const waiting = [...features].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const done = new Set();
  const order = [];
  while (waiting.length) {
    const i = waiting.findIndex((f) => f.after.every((a) => done.has(a)));
    if (i < 0) throw new Error(`these features each come after another of them, so none can go first: ${waiting.map((f) => f.name).join(', ')}`);
    const [next] = waiting.splice(i, 1);
    done.add(next.name);
    order.push(next);
  }
  return order;
}
