// The list in your pack: what there is to do, laid out for reading.
//
// Handed the commands as the game offers them (Commands.offers(), in
// src/game/commands.js: group by group, each with the word for what it would
// do now) and knows nothing else.
//
//   pages(offers, but) -> { hand: [row], rest: [{ group, rows: [row] }] }
//   row                   { id, word, label, help, pad? }
//
//   hand   what is at hand: the ones with a word for here and now, as offered
//   rest   everything else, under the headings the help panel uses
//   but    the id of one to leave out (the pack itself: they are listed in it)
//
// The rows are copies: the game hands out the same offers every time.

export function pages(offers, but = null) {
  const hand = [];
  const rest = [];
  for (const o of offers) {
    if (o.id === but) continue;
    const row = { id: o.id, word: o.word || '', label: o.label, help: o.help || '', ...(o.pad ? { pad: o.pad } : {}) };
    if (row.word) {
      hand.push(row);
      continue;
    }
    let under = rest[rest.length - 1];
    if (!under || under.group !== o.group) rest.push((under = { group: o.group, rows: [] }));
    under.rows.push(row);
  }
  return { hand, rest };
}

// What a list of offers would show, as one string: while it stays the same
// there is nothing to write again.
export function shown(offers) {
  let s = '';
  for (const o of offers) s += `${o.id}:${o.word || ''}|`;
  return s;
}
