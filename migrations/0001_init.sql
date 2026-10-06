-- CampusLend schema. Timestamps are stored as ISO-8601 UTC TEXT
-- (e.g. 2026-10-20T09:00:00.000Z). Fixed-width UTC strings sort
-- chronologically, so SQL "<" / ">" comparisons are correct.

CREATE TABLE equipment (
  id       TEXT PRIMARY KEY NOT NULL, -- SQLite allows NULL in a non-INTEGER PK unless NOT NULL is explicit
  name     TEXT NOT NULL UNIQUE CHECK (length(trim(name)) > 0),
  location TEXT NOT NULL        CHECK (length(trim(location)) > 0)
);

CREATE TABLE bookings (
  id            TEXT PRIMARY KEY NOT NULL,
  equipment_id  TEXT NOT NULL REFERENCES equipment(id) ON DELETE RESTRICT,
  borrower_name TEXT NOT NULL CHECK (length(trim(borrower_name)) BETWEEN 1 AND 100),
  start_at      TEXT NOT NULL,
  end_at        TEXT NOT NULL,
  purpose       TEXT NOT NULL CHECK (length(trim(purpose)) BETWEEN 1 AND 500),
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK (end_at > start_at)
);

-- FK lookups + the overlap query (equipment_id, then time range)
CREATE INDEX idx_bookings_equipment_time ON bookings (equipment_id, start_at, end_at);
