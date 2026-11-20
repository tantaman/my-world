-- A world stops being one row.
--
-- What you build is spread over the map, so it is stored that way: one row per
-- 64 m region, which is the same grid the world streams on. Two people
-- building a few hundred metres apart now write different rows and never
-- collide, and a save only carries the squares you actually touched.
--
-- Three scopes, because they are contested differently:
--
--   patches   terrain, felled trees and buildings, per region. Contested, so
--             every write carries the revision it was based on.
--   meta      the marks. Shared, but rarely touched twice at once: also
--             revision-checked, in its own scope so that chopping a tree
--             doesn't collide with somebody naming a place.
--   visitor   materials, the grade stake, where you stood, the hour. Nobody
--             else is competing for these, so the last write wins.
--
-- History is no longer per save. The read endpoint can assemble a world
-- without parsing it, so a full copy is kept every so often instead: coarser,
-- but it restores cleanly, which per-region history would not.

CREATE TABLE worlds_new (
  id          TEXT PRIMARY KEY,
  seed        INTEGER NOT NULL,
  name        TEXT NOT NULL DEFAULT '',
  format      INTEGER NOT NULL DEFAULT 2, -- 1 = one whole-world blob, 2 = split
  gen         INTEGER NOT NULL DEFAULT 1, -- bumped on every save; history is keyed by it

  meta        BLOB,
  meta_codec  TEXT,
  meta_bytes  INTEGER NOT NULL DEFAULT 0,
  meta_rev    INTEGER NOT NULL DEFAULT 0,

  visitor       BLOB,
  visitor_codec TEXT,
  visitor_bytes INTEGER NOT NULL DEFAULT 0,

  -- A format-1 world's single blob, served as-is until its first save in the
  -- new layout rewrites it as meta + patches.
  legacy       BLOB,
  legacy_codec TEXT,

  snapshot_at INTEGER NOT NULL DEFAULT 0, -- when a full copy was last kept
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

INSERT INTO worlds_new (id, seed, name, format, gen, legacy, legacy_codec, created_at, updated_at)
  SELECT id, seed, name, 1, 1, snapshot, codec, created_at, updated_at FROM worlds;

DROP TABLE worlds;
ALTER TABLE worlds_new RENAME TO worlds;

CREATE TABLE patches (
  world_id   TEXT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  rx         INTEGER NOT NULL,
  rz         INTEGER NOT NULL,
  rev        INTEGER NOT NULL,
  codec      TEXT NOT NULL,
  snapshot   BLOB NOT NULL,
  bytes      INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (world_id, rx, rz)
);

-- Whole-world copies, kept now and then, so a flattened cabin is recoverable.
DROP TABLE revisions;
CREATE TABLE revisions (
  world_id   TEXT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  gen        INTEGER NOT NULL,
  snapshot   BLOB NOT NULL, -- a whole assembled world, exactly as the read endpoint serves it
  bytes      INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (world_id, gen)
);

CREATE INDEX revisions_by_world ON revisions (world_id, gen DESC);
