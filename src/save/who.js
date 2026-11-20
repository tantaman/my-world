// Who someone is in a world on the save server.
//
// Anyone with a world's link can walk in, but nobody walks in as nobody: the
// first time, each person picks a name and a password, and what is theirs in
// that world (where they stood, what they carried, the hour they set) is kept
// under that name. These are the rules for a name and a password, and how the
// server says it doesn't know you. Shared by the game, to say so before
// sending, and the Worker, to hold to them, so there is one definition.

export const NAME_MAX = 24; // characters
export const PASSWORD_MIN = 6; // characters
export const PASSWORD_MAX = 200; // characters

// A socket closed with this code was not, or is no longer, signed in. A
// socket can't be refused with a 401 the page could read, so it is opened and
// closed again with this instead. (4000–4999 are free for applications.)
export const NOT_SIGNED_IN = 4401;

// Names are shown to everyone in the world, so control characters, invisible
// ones and runs of spaces go.
export function cleanName(raw) {
  if (typeof raw !== 'string') return '';
  return raw
    .normalize('NFC')
    .replace(/\s/g, ' ') // a tab or a line break is a space
    .replace(/[\u0000-\u001f\u007f-\u009f\u00ad\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/g, '')
    .replace(/ {2,}/g, ' ')
    .trim();
}

// Two names that look the same are the same person: "Sam" and "sam", or a
// name typed with a full-width letter.
export const nameKey = (name) => cleanName(name).normalize('NFKC').toLowerCase();

// -> what is wrong with a name (already cleaned), or ''.
export function nameProblem(name) {
  if (!name) return 'pick a name';
  if ([...name].length > NAME_MAX) return `a name can be at most ${NAME_MAX} characters`;
  return '';
}

// -> what is wrong with a password, or ''.
export function passwordProblem(password) {
  if (typeof password !== 'string' || password.length < PASSWORD_MIN) return `a password needs at least ${PASSWORD_MIN} characters`;
  if (password.length > PASSWORD_MAX) return `a password can be at most ${PASSWORD_MAX} characters`;
  return '';
}
