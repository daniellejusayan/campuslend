# Test evidence — local

- **Base API URL:** `http://localhost:8787/api`
- **Database:** local D1 (wrangler dev)
- **Run at:** 2026-10-06T08:03:52.785Z
- **Command:** `node tests/run-tests.mjs --guide-only --out docs/guide-results.md`
- **Result:** 10 passed, 0 failed, 10 total

## A. Exam cURL Quick Test sequence

| # | Test | Request | Expected | Actual (status + start of body) | Result |
|---|---|---|---|---|---|
| 1 | 1 List equipment | GET /equipment | 200 | 200 {"success":true,"data":[{"id":"eq-1","name":"Projector A","location":"Building 1"},{"id":"eq-2","name":"Canon EOS R50 Camera","location":"Media Lab, B | PASS |
| 2 | 2 List bookings | GET /bookings | 200 | 200 {"success":true,"data":[]} | PASS |
| 3 | 3 Create booking | POST /bookings (eq-1 09:00-11:00) | 201 | 201 {"success":true,"data":{"id":"bk-f899880e-9394-4323-ae76-78cc8e1a738b","equipmentId":"eq-1","borrowerName":"Somchai Jaidee","startAt":"2026-10-20T09:0 | PASS |
| 4 | 4 Get booking | GET /bookings/bk-f899880e-9394-4323-ae76-78cc8e1a738b | 200 | 200 {"success":true,"data":{"id":"bk-f899880e-9394-4323-ae76-78cc8e1a738b","equipmentId":"eq-1","borrowerName":"Somchai Jaidee","startAt":"2026-10-20T09:0 | PASS |
| 5 | 5 Update booking | PATCH /bookings/bk-f899880e-9394-4323-ae76-78cc8e1a738b {purpose} | 200 | 200 {"success":true,"data":{"id":"bk-f899880e-9394-4323-ae76-78cc8e1a738b","equipmentId":"eq-1","borrowerName":"Somchai Jaidee","startAt":"2026-10-20T09:0 | PASS |
| 6 | 6 Invalid time range | POST endAt before startAt | 400 | 400 {"error":"endAt: must be after startAt","code":"VALIDATION_ERROR"} | PASS |
| 7 | 7 Overlapping booking | POST eq-1 10:00-12:00 (overlaps 09:00-11:00) | 409 | 409 {"error":"That equipment is already booked for an overlapping time","code":"BOOKING_CONFLICT"} | PASS |
| 8 | 8 Missing booking | GET /bookings/bk-does-not-exist | 404 | 404 {"error":"Booking not found","code":"NOT_FOUND"} | PASS |
| 9 | 9 Delete booking | DELETE /bookings/bk-f899880e-9394-4323-ae76-78cc8e1a738b | 204 | 204  | PASS |
| 10 | 9b Get after delete | GET /bookings/bk-f899880e-9394-4323-ae76-78cc8e1a738b | 404 | 404 {"error":"Booking not found","code":"NOT_FOUND"} | PASS |
