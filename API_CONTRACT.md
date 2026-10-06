# CampusLend API Contract

**Base URL** `http://localhost:8787/api` · **Format** JSON (`Content-Type: application/json`)

## Envelopes
Success: `{ "success": true, "data": <object|array> }` (except 204: no body)
Error (required format): `{ "error": "<human-readable message>", "code": "<MACHINE_CODE>" }`
`error` is always a non-empty string. `code` is an extra field so clients can tell e.g. `NOT_FOUND` from
`EQUIPMENT_NOT_FOUND` (both 404) without parsing text. Built in one place: `errorBody()` in `src/http.ts`.

## Resources
**Equipment** `{ id, name, location }`
**Booking** `{ id, equipmentId, borrowerName, startAt, endAt, purpose, createdAt, updatedAt }`
Timestamps are ISO-8601 UTC strings, e.g. `2026-10-20T09:00:00.000Z`.

## Endpoints
| Method | Path | Request body | Success |
|---|---|---|---|
| GET | /equipment | – | 200 `data: Equipment[]` |
| GET | /bookings | – | 200 `data: Booking[]` (ordered by startAt) |
| GET | /bookings/:id | – | 200 `data: Booking` |
| POST | /bookings | `equipmentId, borrowerName, startAt, endAt, purpose` (all required) | 201 `data: Booking` |
| PATCH | /bookings/:id | any subset of the five fields (≥ 1) | 200 `data: Booking` |
| DELETE | /bookings/:id | – | 204, empty body |

Example POST:
```json
{"equipmentId":"eq-1","borrowerName":"Somchai Jaidee","startAt":"2026-10-20T09:00:00.000Z","endAt":"2026-10-20T11:00:00.000Z","purpose":"Class presentation"}
```
Example PATCH (only this field is required): `{"purpose":"Updated class presentation"}`

## Status codes and error codes
| Status | `code` | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | missing/wrong-type/empty/too-long field; bad timestamp; `endAt` ≤ `startAt` (also for the merged PATCH result); empty PATCH |
| 400 | `INVALID_JSON` | body is not parseable JSON |
| 404 | `NOT_FOUND` | booking id (or route) does not exist |
| 404 | `EQUIPMENT_NOT_FOUND` | `equipmentId` references no equipment |
| 409 | `BOOKING_CONFLICT` | same equipment already booked for an overlapping time (POST and PATCH) |
| 500 | `INTERNAL_ERROR` | unexpected failure; details are logged, not returned |

**Why these:** 400 = the request itself is malformed/invalid. 404 = the thing the URL or reference points at does not exist.
`equipmentId` in the body is a reference to a resource, so a missing one is 404 (documented choice, applied consistently on POST and PATCH).
409 = the request is well-formed but clashes with the current state of the data. 422 is not used.

## Rules and assumptions
- **Overlap:** `existing.startAt < new.endAt AND existing.endAt > new.startAt` ⇒ 409. Back-to-back (end == start) is allowed.
- Conflicts are per-equipment; the same time on different equipment is fine. On PATCH the booking itself is excluded.
- Timestamps **must** carry a timezone (`Z` or `±hh:mm`); offsets are normalised to UTC in responses.
- `borrowerName`/`purpose` are trimmed; stored without surrounding whitespace.
- Unknown request fields are ignored. PATCH cannot change `id`/`createdAt`.
- Past dates are allowed (not restricted by the brief).
- No authentication: all endpoints are open (see README → Security).
- CORS: allowed methods GET, POST, PATCH, DELETE, OPTIONS; header Content-Type; origins from `ALLOWED_ORIGINS`.
- `tester.html` was **not provided**, so frontend compatibility is NOT VERIFIED. The error format `{"error":"..."}` and the
  status codes of the 9-step cURL guide are verified (`npm run test:guide`, section A of `tests/run-tests.mjs`). The success envelope `{success,data}` was
  not specified by the requirements available; if the tester expects bare objects/arrays, change `ok()` in `src/http.ts`.
