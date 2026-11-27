# Reference photographs

Real photographs to set the look against (`npm run look`, tools/look.mjs).

- `hikes/<hike>.jpg`: the photo a hike was imported from (`npm run hike`),
  as a JPEG with its EXIF: where it was taken, which way, at what hour, how
  wide the lens saw, and how it was exposed. A phone's own JPEG export keeps
  all of that.
- `hikes/<hike>/photo-<k>.jpg`: another photo taken on the walk, numbered as
  in the hike's `photos`.

They're yours. Their EXIF says where and when you were; the hikes in
src/world/hikes.js already say where. Commit them if you're happy for that to
be in the repository's history, or keep them out of it and only on the
machines you run the tool on.
