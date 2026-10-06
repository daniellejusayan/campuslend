-- Second line of defence for the overlap rule. The API checks for conflicts first
-- (to return a clean 409), but check-then-insert is two round trips. These triggers
-- make the database itself refuse an overlapping row, whatever code path wrote it.
-- Same formula as the API:  existing.start_at < new.end_at AND existing.end_at > new.start_at
-- Back-to-back (end == start) is NOT an overlap because the comparisons are strict.

CREATE TRIGGER trg_bookings_no_overlap_insert
BEFORE INSERT ON bookings
WHEN EXISTS (
  SELECT 1 FROM bookings
  WHERE equipment_id = NEW.equipment_id
    AND start_at < NEW.end_at
    AND end_at   > NEW.start_at
)
BEGIN
  SELECT RAISE(ABORT, 'booking overlap');
END;

-- On UPDATE the row must not be compared against itself, hence id <> NEW.id.
CREATE TRIGGER trg_bookings_no_overlap_update
BEFORE UPDATE OF equipment_id, start_at, end_at ON bookings
WHEN EXISTS (
  SELECT 1 FROM bookings
  WHERE id <> NEW.id
    AND equipment_id = NEW.equipment_id
    AND start_at < NEW.end_at
    AND end_at   > NEW.start_at
)
BEGIN
  SELECT RAISE(ABORT, 'booking overlap');
END;
