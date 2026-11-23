// Finding a destination by what it's called or what it is: the search box
// over Routes. A query is a few words, and a place matches when each of them
// starts one of the words it's known by: its name, its kind, its note, the
// list it's in, and any words its owner gives it besides (place.words, what
// it's about). Case and accents don't count. So 'cab' finds 'Hollis cabin',
// 'old pl' the old places, 'video' the video stores, and 'hell' the gate.

const fold = (s) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

// The words in a piece of text, folded: 'Charon’s Boat' -> ['charon', 's', 'boat']
export const wordsOf = (text) => (text ? fold(String(text)).split(/[^\p{L}\p{N}]+/u).filter(Boolean) : []);

// A query -> null when there's nothing to look for, or a test for a place:
// match(place, ...more) -> whether it's wanted, `more` being other text it's
// known by (the list it's in).
export function matcher(query) {
  const want = wordsOf(query);
  if (!want.length) return null;
  return (place, ...more) => {
    const have = [place.name, place.kind, place.note, place.words, ...more].flatMap(wordsOf);
    return want.every((w) => have.some((h) => h.startsWith(w)));
  };
}
