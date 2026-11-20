-- A saved world is a seed plus the diff you made to it. The forest itself is
-- procedural, so nothing about terrain, trees or rocks is stored here: only
-- what you changed, as one compressed snapshot per world.

CREATE TABLE worlds (
  id         TEXT PRIMARY KEY,          -- short slug; this is the ?w= in the URL
  seed       INTEGER NOT NULL,          -- which forest this world grew from
  name       TEXT NOT NULL DEFAULT '',
  codec      TEXT NOT NULL,             -- how `snapshot` is encoded: 'gzip' or 'json'
  rev        INTEGER NOT NULL,          -- bumped on every save; used to spot clobbering
  snapshot   BLOB NOT NULL,
  bytes      INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- The last few saves of each world, so a bulldozed cabin is recoverable.
CREATE TABLE revisions (
  world_id   TEXT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  rev        INTEGER NOT NULL,
  codec      TEXT NOT NULL,
  snapshot   BLOB NOT NULL,
  bytes      INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (world_id, rev)
);

CREATE INDEX revisions_by_world ON revisions (world_id, rev DESC);
