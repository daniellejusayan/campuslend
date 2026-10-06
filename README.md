# CampusLend — Equipment Loan Platform API

Backend REST API for borrowing shared campus equipment (laptops, cameras, projectors, microcontroller kits).
1305308 Platform Development — Midterm Practical Lab.

## Stack
Hono (TypeScript) · Cloudflare D1 (SQLite) · Zod (validation) · Wrangler (local runtime & migrations)

## Setup
```bash
npm install
npx wrangler d1 migrations apply campuslend-db --local   # creates tables, seed data, overlap triggers
npx wrangler dev                                          # starts http://localhost:8787
```
Shortcuts: `npm run migrate`, `npm run dev`, `npm run typecheck`.

**Base URL:** `http://localhost:8787/api`

## Endpoints
| Method | Path | Success | Notes |
|---|---|---|---|
| GET | `/api/equipment` | 200 | list equipment |
| GET | `/api/bookings` | 200 | list bookings |
| GET | `/api/bookings/:id` | 200 | 404 if missing |
| POST | `/api/bookings` | 201 | all fields required |
| PATCH | `/api/bookings/:id` | 200 | genuine partial update |
| DELETE | `/api/bookings/:id` | 204 | empty body |

Full detail, payloads and error codes: [API_CONTRACT.md](API_CONTRACT.md).

## Database (ERD)
```
┌──────────────────────┐           ┌─────────────────────────────────┐
│      equipment       │           │            bookings             │
├──────────────────────┤           ├─────────────────────────────────┤
│ id        TEXT PK    │ 1       * │ id            TEXT PK           │
│ name      TEXT NN UQ │───────────│ equipment_id  TEXT NN FK ───────┼─► equipment.id (RESTRICT)
│ location  TEXT NN    │           │ borrower_name TEXT NN (1..100)  │
└──────────────────────┘           │ start_at      TEXT NN (UTC ISO) │
                                   │ end_at        TEXT NN           │
 CHECK(end_at > start_at)          │ purpose       TEXT NN (1..500)  │
 INDEX(equipment_id,start_at,end_at)│ created_at / updated_at TEXT NN │
 TRIGGERS: no overlap on INSERT/UPDATE└─────────────────────────────────┘
```
One equipment has many bookings. **Timestamps** are stored as fixed-width UTC ISO-8601 `TEXT` (SQLite has no date type);
because they are normalised to the same 24-character format, text comparison equals time comparison.

## Validation (Zod, before any DB write)
`equipmentId` 1–64 chars · `borrowerName` 1–100 (trimmed, non-empty) · `purpose` 1–500 · `startAt`/`endAt` strict ISO-8601
**with timezone** (offsets are converted to UTC; impossible dates like Feb 31 rejected) · `endAt` must be after `startAt`
(checked on the *merged* result for PATCH) · invalid JSON → 400. Unknown extra fields are ignored, never stored.

## Booking conflict rule
Two time ranges overlap when `existing.start < new.end AND existing.end > new.start`. Strict `<`/`>` means
**back-to-back is allowed** (11:00–13:00 after 09:00–11:00). The same function (`assertBookable`) runs for POST **and** PATCH;
on PATCH the booking being edited is excluded (`id <> :self`). Two DB triggers repeat the rule as a second line of defence.

## Security
- **Parameter binding:** every SQL value uses `?` + `.bind()`; no request data is concatenated into SQL (audited, see QUALITY_GATE_REVIEW.md).
- **Validation** at the API *and* constraints in the DB (NOT NULL, UNIQUE, CHECK, FK, triggers).
- **Errors** are JSON; stack traces are logged server-side only, never returned.
- **CORS:** only origins in `ALLOWED_ORIGINS` (wrangler.jsonc) get CORS headers. This is a browser rule, **not** authentication.
- **Authentication / authorization / ownership: NOT implemented.** The contract has no user concept (`borrowerName` is free text) and
  the brief marks these as conditional. Anyone who can reach the API can read/modify any booking. Adding it would need an identity
  source + `user_id` column; see EXAM_EXPLANATION.md Q12–Q13. Brief tests 13–15 are therefore N/A.
- **Secrets:** none required. `.dev.vars` is git-ignored.

## Testing
```bash
npx wrangler dev                 # terminal 1
npm test                         # terminal 2 (needs curl + jq) -> writes tests/evidence.txt
```
The suite resets the bookings table, runs 50 checks (curl for HTTP, `wrangler d1 execute` for DB constraints) and records
Test / Request / Expected / Actual / Result. Recorded runs: `docs/evidence-v1-snapshot.txt` (first version, 34/46 pass) and
`docs/evidence-v2-final.txt` (final, 50/50 pass).

## Repository map
`src/index.ts` app, CORS, global errors · `src/routes/*` endpoints · `src/bookings-db.ts` business rules & queries ·
`src/validation.ts` Zod schemas · `src/http.ts` response helpers · `migrations/` schema, seed, triggers · `tests/` suite ·
git tags `v1-snapshot` (first version) and `v2-final`.
