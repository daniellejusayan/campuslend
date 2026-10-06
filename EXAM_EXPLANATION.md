# EXAM_EXPLANATION — "Explain your work"

## 1. Project structure
```
HTTP request
 → src/index.ts            Hono app, CORS allowlist, routes mounted at /api/equipment and /api/bookings
 → src/routes/*.ts         one handler per endpoint
 → src/validation.ts       Zod schemas: shape, types, lengths, strict timestamps
 → src/bookings-db.ts      assertBookable(): the business rules (range 400 → equipment 404 → overlap 409)
 → D1 (SQLite)             prepared statements with .bind()
 → JSON response           success: {success:true,data}; error: {"error":"...","code":"..."} built by errorBody() in src/http.ts
```
Any handler can `throw new ApiError(status, code, message)`; the single `app.onError` in `src/index.ts` turns it into JSON.

## 2. Database and relationship
- `equipment(id PK NOT NULL, name UNIQUE NOT NULL, location NOT NULL)` — seeded with eq-1 … eq-4 (`migrations/0002_seed.sql`).
- `bookings(id PK NOT NULL, equipment_id NOT NULL FK → equipment(id) ON DELETE RESTRICT, borrower_name, start_at, end_at, purpose, created_at, updated_at)`.
- **One equipment has many bookings**; a booking belongs to exactly one equipment. The FK rejects a booking for unknown equipment.
- `CHECK (end_at > start_at)`, length CHECKs, and two triggers (`0003_overlap_guard.sql`) that refuse overlapping rows.
- Times are stored as fixed-width UTC ISO text (`2026-10-20T09:00:00.000Z`). SQLite has no date type; same-format UTC strings
  sort in time order, so SQL `<` / `>` compare times correctly.

## 3. POST /api/bookings flow (`src/routes/bookings.ts:26`)
1. `readJson()` — unparseable body → **400 INVALID_JSON**.
2. `CreateBooking.safeParse()` — all 5 fields required, trimmed, lengths, timestamps must have a timezone → else **400 VALIDATION_ERROR**.
3. `assertBookable(db, b, null)` — `null` because there is no existing booking to exclude:
   `endAt <= startAt` → **400**; equipment not found → **404**; overlap → **409**.
4. `INSERT … VALUES (?, ?, ?, ?, ?, ?)` with a server-generated id `bk-<uuid>`.
5. Re-read the row and return **201** with the stored booking.

## 4. PATCH /api/bookings/:id flow (`src/routes/bookings.ts:45`)
1. Load the booking → missing → **404 NOT_FOUND**.
2. `PatchBooking` — every field optional, at least one required → `{}` is **400**.
3. **Merge**: `next = patch field ?? stored field`. Validate the **merged** booking, not just the sent fields
   (e.g. a new `endAt` alone can be earlier than the stored `startAt` → 400).
4. `assertBookable(db, next, id)` — passes its **own id**, so the overlap query skips it (`(?4 IS NULL OR id <> ?4)`).
   Without this, patching only `purpose` would conflict with itself.
5. `UPDATE … WHERE id = ?`, set `updated_at`, return **200** with the re-read row.

## 5. Overlap detection (`src/bookings-db.ts:49-60`)
```sql
SELECT id FROM bookings
WHERE equipment_id = ?1          -- same equipment only
  AND start_at < ?2              -- existing.start < new.end
  AND end_at   > ?3              -- existing.end   > new.start
  AND (?4 IS NULL OR id <> ?4)   -- skip myself on PATCH
```
Two ranges do **not** overlap only if one ends before (or exactly when) the other starts. The formula is the negation of that.
Strict `<`/`>` means **back-to-back is allowed**: 09–11 then 11–13 share only the instant 11:00.
| Case (existing A = eq-1 09:00–11:00) | Result | Test |
|---|---|---|
| 10:00–12:00 (end overlap) / 08:00–10:00 (start overlap) | 409 | T09a / T09f |
| 09:30–10:00 inside / 08:00–12:00 wraps | 409 | T09b / T09c |
| 09:00–11:00 exact same time | 409 | T09e |
| 11:00–13:00 after / 07:00–09:00 before (back-to-back) | 201 | T11a / T11c |
| eq-2 09:00–11:00 (different equipment) | 201 | T09d |
| PATCH B into A's slot / PATCH B to its own slot | 409 / 200 | T10a / T10c |

## 6. Validation
Zod checks types, required fields, trimmed non-empty strings, max lengths, and **strict ISO-8601 with timezone**
(`2026-10-20T09:00:00` without `Z` is ambiguous → 400; Feb 31 → 400; `+07:00` is converted to UTC). Unknown fields are
dropped, so a client cannot set `id` or `createdAt`. DB constraints repeat the critical rules as a last line of defence.

## 7. 400 vs 404 vs 409
- **400** — the request itself is wrong: bad JSON, missing/invalid field, bad timestamp, `startAt >= endAt`.
- **404** — the thing referred to does not exist: booking id in the URL, or `equipmentId` in the body (documented choice).
- **409** — the request is valid, but clashes with the current data: the equipment is already booked then.
Order in `assertBookable`: 400 range → 404 equipment → 409 overlap (cheapest and most basic check first).

## 8. Parameter binding
Every query is a constant SQL string with `?` placeholders; values go through `.bind(...)`. The SQL text and the data are sent
separately, so data is never parsed as SQL. Proof: `' OR 1=1 --` is stored literally as a name (T12a), matches no id (T12b/c),
and the table is intact (T12d). Audit: 8/8 `prepare()` calls, no `${}` or `+` in SQL.

## 9. CRUD
| Operation | Endpoint | Success | Verified by |
|---|---|---|---|
| Create | POST /api/bookings | 201 + booking | T01 |
| Read | GET /api/bookings, GET /api/bookings/:id | 200 | T02, T03 |
| Update | PATCH /api/bookings/:id | 200 + updated booking, persisted | T04, T04b |
| Delete | DELETE /api/bookings/:id | 204, empty body; then GET → 404 | T05a, T05b |

## 10. Error handling
- All errors: `{"error": "<message>", "code": "<CODE>"}` from one function, `errorBody()`.
- `app.notFound` → JSON 404 for unknown routes. `app.onError` → `ApiError` mapped to its status; DB trigger "booking overlap"
  mapped to 409; anything else → generic **500** with the detail only in the server log (proved: `docs/error-500-check.txt`).

## 11. Quality Gate changes
- **v1 → v2:** PATCH had no conflict check (200 → 409); client mistakes returned 500 (→ 400/404); lenient dates (→ strict);
  CORS `*` (→ allowlist); text 404 (→ JSON); DB overlap triggers added.
- **Final round:** (F1) error body was an object, required format is `{"error":"..."}` → fixed in `errorBody()`;
  (F2) the 50/50 suite skipped exact-same-time, start overlap, back-to-back-before → tests added, error shape asserted on every error;
  (F3) `TEXT PRIMARY KEY` accepted NULL ids → `NOT NULL` added. Details and evidence: `QUALITY_GATE_REVIEW.md`.

# Oral exam quick answers
**Why PATCH, not PUT?** PATCH changes only the fields sent; PUT would force the client to resend everything.
**Why validate the merged result on PATCH?** Sent fields can be valid alone but invalid with the stored ones.
**How does PATCH avoid conflicting with itself?** It passes its own id; the query adds `id <> ?4`. T10c proves it.
**Why is a nonexistent `equipmentId` 404, not 400?** It's a reference to a resource that doesn't exist; applied consistently on POST and PATCH.
**Why both Zod and DB constraints?** Zod gives clear 4xx messages first; constraints protect against bugs, other writers and races.
**Why did `TEXT PRIMARY KEY` need `NOT NULL`?** SQLite only implies NOT NULL for `INTEGER PRIMARY KEY`; a NULL-id row would be unreachable by the API.
**Why are the overlap triggers there if the API already checks?** Check-then-insert is two steps; the trigger enforces the rule inside the write itself. Tested by disabling the API check: still 409.
**Why hide stack traces?** They reveal file paths, SQL and table names to attackers; the log keeps them for us.
**What is CORS?** A browser rule about which origins may read responses. Not authentication; curl ignores it.
**What is NOT implemented / verified?** No authentication (not required); `tester.html` compatibility; the `{success,data}` success shape against the real guide.
