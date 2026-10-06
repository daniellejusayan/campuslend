# Quality Gate Review

**Snapshot:** git tag `v1-snapshot` (first version, before any fixes). **Fixed version:** tag `v2-final`.
**Method:** ran the full suite against v1 (`docs/evidence-v1-snapshot.txt`: **34 passed / 12 failed of 46**), read the code,
and ran two extra probes (`docs/probe-v1.txt`). Every finding below was observed, not assumed. v2 run: **50/50**
(`docs/evidence-v2-final.txt`). That run is superseded by the **Final verification round** at the end of this file (57/57).

> Note for the student: the timestamps in git come from this build session, not your exam clock. For the real minute-30
> requirement, tag *your own* first working version at minute 30 (`git tag v1-snapshot`) and re-run this review on it.

## Findings

### 1. Reliability / Accuracy — PATCH never checked for booking conflicts
- **Finding:** v1's PATCH updated times/equipment with no overlap check. Test T10a (move B into A's slot) returned **200**, and T10d (move a booking onto another equipment's occupied slot) returned **200**. This silently created double-bookings, the exact thing the app must prevent.
- **Fix:** one shared function `assertBookable()` (`src/bookings-db.ts`) now runs for both POST and PATCH; PATCH passes its own id so it is excluded from the conflict query.
- **Verification:** T10a → 409, T10a3 → 409, T10d → 409; T10c (patch to its *own* current slot) → 200, proving no self-conflict; T10b (free slot) → 200.

### 2. Reasoning / You Own It — client mistakes were reported as server errors (500), and PATCH didn't validate the merged result
- **Finding:** PATCH validated only the fields the client sent. A change that made `startAt == endAt` reached the DB `CHECK` and came back as **500** (T10a3 in v1); a nonexistent `equipmentId` hit the foreign key and also returned **500** (T10e); `PATCH {}` returned **200** and did nothing (T10g); malformed JSON returned **500** (T13a). A 500 says "the server is broken" when the *client* is wrong, and it hid the real problem behind a database error. The DB constraints worked, but the API was leaning on them instead of validating first.
- **Fix:** PATCH merges the stored booking with the patch and validates the *result* through `assertBookable()` (400 range / 404 equipment / 409 conflict); an empty patch is a 400; JSON parsing failures throw `INVALID_JSON` (400).
- **Verification:** T10a3 → 409, T10e → 404, T10g → 400, T13a → 400 `INVALID_JSON`.
- *Side note (not a separate finding):* v1's T10a2 also "failed", but only as a knock-on of finding 1 (the wrongly-moved booking made the test input valid), so it is not counted.

### 3. Lenient timestamp parsing accepted ambiguous input
- **Finding:** v1 used `Date.parse()`. Probe result: `"Oct 20 2026 9:00"`, `"2026-10-20 09:00"`, `"2026-10-20T09:00:00"` (no timezone) and `"2026-10-20"` were all accepted (201) and silently interpreted as UTC. A string with no timezone means different instants in different places, which is dangerous for a booking system.
- **Fix:** strict ISO-8601 regex *requiring* `Z`/`±hh:mm`, calendar sanity check (rejects Feb 31), then normalise to UTC (`src/validation.ts`).
- **Verification:** T06h (no timezone) → 400, T06i (`Oct 20 2026 9:00`) → 400, T06j (Feb 31) → 400, T06k (`+07:00` offset) → 201 stored as `09:00:00.000Z`.

### 4. CORS allowed every origin
- **Finding:** v1 used `cors()` with defaults → `Access-Control-Allow-Origin: *` (T15b), and T15a failed because it did not echo the specific origin.
- **Fix:** allowlist from `ALLOWED_ORIGINS`; explicit methods and headers.
- **Verification:** T15a (allowed origin echoed, PATCH listed), T15b (evil origin → header absent), T15c (`Origin: null` for a file:// tester).
- **Caveat:** `null` is in the dev allowlist so a tester opened from disk works. Remove it if the tester is served over http.

### 5. Unknown routes returned plain text, not JSON
- **Finding:** `GET /api/nonexistent` returned the text `404 Not Found` (T13b), breaking the JSON error contract.
- **Fix:** `app.notFound()` and `app.onError()` return the standard envelope; 500s log details server-side but return a generic message.
- **Verification:** T13b → 404 `NOT_FOUND` JSON.

### 6. No database-level overlap protection (hardening)
- **Finding:** the overlap rule existed only in application code (T16e failed on v1). The check-then-insert is two round trips.
- **Honest status:** I tried to demonstrate a race with 12 parallel POSTs; the result was 1×201 and 11×409, so the race was **NOT reproduced** locally. This is hardening, not a confirmed bug.
- **Fix:** migration `0003_overlap_guard.sql` adds INSERT/UPDATE triggers using the same formula.
- **Verification:** T16e (direct SQL insert of an overlapping row is rejected: `booking overlap … SQLITE_CONSTRAINT_TRIGGER`).
- **NOT VERIFIED:** the `app.onError` branch that maps the trigger error to a 409 was not exercised through the API (the API check normally answers first). To check manually, temporarily comment out the `clash` check in `assertBookable` and POST an overlapping booking: expect 409.

## Also reviewed (no change needed)
- **SQL concatenation audit:** all 8 `prepare()` calls are constant strings with `?` placeholders; none contains `${}` or `+`. The one `${slot.equipmentId}` in the code is inside a JSON error *message*, not SQL.
- **Removed a test, not a bug:** T14b tested a `?equipmentId=` filter v1 never had; the brief does not require it, so it was deleted rather than building an unrequested feature.

---

# Final verification round (after `v2-final`)
**Source of truth:** the exam instructions: the 9-step cURL Quick Test sequence, the error format `{"error":"..."}`, and the
booking rules. `tester.html` and the cURL guide file itself were not available, so only what the instructions state was checked.
**Method:** started `wrangler dev` locally, ran the 9-step sequence against the **unchanged** v2 code, probed cases the suite did
not cover, fixed, rebuilt the local DB from migrations, re-ran everything.
**Results:** guide `docs/guide-before-fix.txt` (4 FAIL) → `docs/guide-after-fix.txt` (0 FAIL); full suite `docs/evidence-v3-final.txt` (57/57).

### F1. Reliability / Accuracy — error responses did not match the required format
- **Finding:** every status code was already right, but errors were `{"success":false,"error":{"code":…,"message":…}}`, so `error`
  was an object, not the required string. Guide rows 6, 7, 8 and 9b failed on shape. The v2 suite passed 50/50 only because it
  asserted the code's own (wrong) shape.
- **Action taken:** `errorBody()` in `src/http.ts` (the single place every error is built) now returns
  `{"error":"<message>","code":"<CODE>"}`. `code` is kept as an extra field. Contract and README updated.
- **Evidence:** before: `| 6 Invalid time range | 400 | 400 | FAIL | ... [error is not a string]`; after: 10/10 PASS.

### F2. Reasoning / You Own It — "50/50" overstated what the tests proved
- **Finding:** reviewing the suite against the required booking rules showed it never tested **exact same time**, overlap at the
  **start** of a booking, back-to-back **before** a booking, a PATCH to the **same time on different equipment**, or that a PATCH is
  actually **persisted** (only the PATCH response was checked). I probed each case by hand first: the code was already correct
  (409 / 409 / 201 / 200 / persisted), so this was a gap in evidence, not a bug. "All tests pass" had been read as
  "the rules are proven".
- **Action taken:** added T09e, T09f, T11c, T10i, T04b, and made `check()` assert `{"error": string, "code": string}` on
  **every** non-2xx response automatically, so the F1 class of mistake cannot pass silently again.
- **Evidence:** all new tests PASS in `docs/evidence-v3-final.txt` (57/57).

### F3. Data design / Reliability — `TEXT PRIMARY KEY` accepted NULL ids
- **Finding:** live schema showed `notnull=0` for `bookings.id` and `equipment.id`. `INSERT … VALUES (NULL, …)` **succeeded** on
  both tables (SQLite only implies NOT NULL for `INTEGER PRIMARY KEY`). The API then listed a booking with `"id": null`, which no
  GET/PATCH/DELETE can ever reach.
- **Action taken:** `id TEXT PRIMARY KEY NOT NULL` in `migrations/0001_init.sql`. Edited in place because it was only ever applied
  to the local dev DB (`database_id` in `wrangler.jsonc` is the all-zero placeholder); local DB rebuilt from migrations. On a
  deployed DB this would need a new table-rebuild migration instead. Tests T16f/T16g added.
- **Evidence:** before: both inserts `executed successfully`; after: `NOT NULL constraint failed: bookings.id` / `equipment.id`.

### F4. Two claims that were previously only read from code are now tested
- **500s do not leak internals:** a second server on an empty DB forced real `no such table` errors. Body:
  `{"error":"Something went wrong on the server","code":"INTERNAL_ERROR"}`, 0 leak words, detail only in the server log
  (`docs/error-500-check.txt`).
- **Trigger → 409 fallback** (listed as NOT VERIFIED in finding 6 above): temporarily disabled the API's `clash` check; an overlapping
  POST and PATCH were still refused with 409 `BOOKING_CONFLICT` by the DB trigger, and a purpose-only PATCH still returned 200
  (no self-conflict). File restored, `git diff` empty (`docs/trigger-fallback-check.txt`).

### Also re-checked (no change needed)
- **Overlap formula** `start_at < :newEnd AND end_at > :newStart` (= `newStart < existingEnd AND newEnd > existingStart`), shared by
  POST and PATCH via `assertBookable()`, self-excluded with `(?4 IS NULL OR id <> ?4)`.
- **SQL audit:** 8/8 `prepare()` calls are constant strings with `?`/`?N` placeholders; the three `${}` in `src` are an error
  message, the UUID id and a validation message, none of them SQL. `' OR 1=1 --` is stored literally (T12a) and matches no id (T12b/c).
