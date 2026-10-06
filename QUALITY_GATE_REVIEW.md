# Quality Gate Review

**Snapshot:** git tag `v1-snapshot` (first version, before any fixes). **Fixed version:** tag `v2-final`.
**Method:** ran the full suite against v1 (`docs/evidence-v1-snapshot.txt`: **34 passed / 12 failed of 46**), read the code,
and ran two extra probes (`docs/probe-v1.txt`). Every finding below was observed, not assumed. Final run: **50/50**
(`docs/evidence-v2-final.txt`).

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
