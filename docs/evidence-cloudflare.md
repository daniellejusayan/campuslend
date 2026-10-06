# Test evidence — Cloudflare (deployed)

- **Base API URL:** `https://campuslend.mykanbanboard.workers.dev/api`
- **Database:** remote D1 (Cloudflare)
- **Run at:** 2026-10-06T08:13:03.670Z
- **Command:** `node tests/run-tests.mjs --remote --base https://campuslend.mykanbanboard.workers.dev`
- **Result:** 70 passed, 0 failed, 70 total

## A. Exam cURL Quick Test sequence

| # | Test | Request | Expected | Actual (status + start of body) | Result |
|---|---|---|---|---|---|
| 1 | 1 List equipment | GET /equipment | 200 | 200 {"success":true,"data":[{"id":"eq-1","name":"Projector A","location":"Building 1"},{"id":"eq-2","name":"Canon EOS R50 Camera","location":"Media Lab, B | PASS |
| 2 | 2 List bookings | GET /bookings | 200 | 200 {"success":true,"data":[]} | PASS |
| 3 | 3 Create booking | POST /bookings (eq-1 09:00-11:00) | 201 | 201 {"success":true,"data":{"id":"bk-fca51006-eeb5-4a96-a4a1-86cfa4f47647","equipmentId":"eq-1","borrowerName":"Somchai Jaidee","startAt":"2026-10-20T09:0 | PASS |
| 4 | 4 Get booking | GET /bookings/bk-fca51006-eeb5-4a96-a4a1-86cfa4f47647 | 200 | 200 {"success":true,"data":{"id":"bk-fca51006-eeb5-4a96-a4a1-86cfa4f47647","equipmentId":"eq-1","borrowerName":"Somchai Jaidee","startAt":"2026-10-20T09:0 | PASS |
| 5 | 5 Update booking | PATCH /bookings/bk-fca51006-eeb5-4a96-a4a1-86cfa4f47647 {purpose} | 200 | 200 {"success":true,"data":{"id":"bk-fca51006-eeb5-4a96-a4a1-86cfa4f47647","equipmentId":"eq-1","borrowerName":"Somchai Jaidee","startAt":"2026-10-20T09:0 | PASS |
| 6 | 6 Invalid time range | POST endAt before startAt | 400 | 400 {"error":"endAt: must be after startAt","code":"VALIDATION_ERROR"} | PASS |
| 7 | 7 Overlapping booking | POST eq-1 10:00-12:00 (overlaps 09:00-11:00) | 409 | 409 {"error":"That equipment is already booked for an overlapping time","code":"BOOKING_CONFLICT"} | PASS |
| 8 | 8 Missing booking | GET /bookings/bk-does-not-exist | 404 | 404 {"error":"Booking not found","code":"NOT_FOUND"} | PASS |
| 9 | 9 Delete booking | DELETE /bookings/bk-fca51006-eeb5-4a96-a4a1-86cfa4f47647 | 204 | 204  | PASS |
| 10 | 9b Get after delete | GET /bookings/bk-fca51006-eeb5-4a96-a4a1-86cfa4f47647 | 404 | 404 {"error":"Booking not found","code":"NOT_FOUND"} | PASS |

## B. Full regression suite

| # | Test | Request | Expected | Actual (status + start of body) | Result |
|---|---|---|---|---|---|
| 1 | T01 Create booking | POST /bookings (eq-1 09:00-11:00) | 201 | 201 {"success":true,"data":{"id":"bk-ae10e4a2-9ae0-40ae-bc45-8937cb28fc85","equipmentId":"eq-1","borrowerName":"Somchai Jaidee","startAt":"2026-10-20T09:0 | PASS |
| 2 | T02 List bookings | GET /bookings | 200 | 200 {"success":true,"data":[{"id":"bk-ae10e4a2-9ae0-40ae-bc45-8937cb28fc85","equipmentId":"eq-1","borrowerName":"Somchai Jaidee","startAt":"2026-10-20T09: | PASS |
| 3 | T03 Get one booking | GET /bookings/bk-ae10e4a2-9ae0-40ae-bc45-8937cb28fc85 | 200 | 200 {"success":true,"data":{"id":"bk-ae10e4a2-9ae0-40ae-bc45-8937cb28fc85","equipmentId":"eq-1","borrowerName":"Somchai Jaidee","startAt":"2026-10-20T09:0 | PASS |
| 4 | T04 PATCH partial (purpose only) | PATCH /bookings/bk-ae10e4a2-9ae0-40ae-bc45-8937cb28fc85 {purpose} | 200 | 200 {"success":true,"data":{"id":"bk-ae10e4a2-9ae0-40ae-bc45-8937cb28fc85","equipmentId":"eq-1","borrowerName":"Somchai Jaidee","startAt":"2026-10-20T09:0 | PASS |
| 5 | T04b GET after PATCH shows the persisted change | GET /bookings/bk-ae10e4a2-9ae0-40ae-bc45-8937cb28fc85 | 200 | 200 {"success":true,"data":{"id":"bk-ae10e4a2-9ae0-40ae-bc45-8937cb28fc85","equipmentId":"eq-1","borrowerName":"Somchai Jaidee","startAt":"2026-10-20T09:0 | PASS |
| 6 | T05a Delete booking | DELETE /bookings/bk-fad80806-70e1-4f97-b19c-542c1d320f1c | 204 | 204  | PASS |
| 7 | T05b Deleted booking is gone | GET /bookings/bk-fad80806-70e1-4f97-b19c-542c1d320f1c | 404 | 404 {"error":"Booking not found","code":"NOT_FOUND"} | PASS |
| 8 | T06a Invalid range endAt<startAt | POST endAt before startAt | 400 | 400 {"error":"endAt: must be after startAt","code":"VALIDATION_ERROR"} | PASS |
| 9 | T06b Invalid range endAt==startAt | POST endAt equals startAt | 400 | 400 {"error":"endAt: must be after startAt","code":"VALIDATION_ERROR"} | PASS |
| 10 | T06c Invalid date string | POST startAt=not-a-date | 400 | 400 {"error":"startAt: must be an ISO-8601 timestamp with timezone, e.g. 2026-10-20T09:00:00.000Z","code":"VALIDATION_ERROR"} | PASS |
| 11 | T06d Missing borrowerName | POST without borrowerName | 400 | 400 {"error":"borrowerName: Invalid input: expected string, received undefined","code":"VALIDATION_ERROR"} | PASS |
| 12 | T06e Whitespace-only borrowerName | POST borrowerName='   ' | 400 | 400 {"error":"borrowerName: Too small: expected string to have >=1 characters","code":"VALIDATION_ERROR"} | PASS |
| 13 | T06f Non-string borrowerName | POST borrowerName=123 | 400 | 400 {"error":"borrowerName: Invalid input: expected string, received number","code":"VALIDATION_ERROR"} | PASS |
| 14 | T06g Over-long borrowerName (101) | POST borrowerName length 101 | 400 | 400 {"error":"borrowerName: Too big: expected string to have <=100 characters","code":"VALIDATION_ERROR"} | PASS |
| 15 | T06h Timestamp without timezone rejected | POST startAt=2026-10-21T09:00:00 (no Z) | 400 | 400 {"error":"startAt: must be an ISO-8601 timestamp with timezone, e.g. 2026-10-20T09:00:00.000Z","code":"VALIDATION_ERROR"} | PASS |
| 16 | T06i Non-ISO date format rejected | POST startAt='Oct 20 2026 9:00' | 400 | 400 {"error":"startAt: must be an ISO-8601 timestamp with timezone, e.g. 2026-10-20T09:00:00.000Z","code":"VALIDATION_ERROR"} | PASS |
| 17 | T06j Impossible calendar date (Feb 31) rejected | POST startAt=2026-02-31T09:00:00Z | 400 | 400 {"error":"startAt: is not a real calendar date/time","code":"VALIDATION_ERROR"} | PASS |
| 18 | T06k Offset timestamp normalised to UTC | POST startAt=2026-09-10T16:00:00+07:00 | 201 | 201 {"success":true,"data":{"id":"bk-ba6de3d4-0167-4df8-8ea3-439a401b3e42","equipmentId":"eq-3","borrowerName":"Tz","startAt":"2026-09-10T09:00:00.000Z"," | PASS |
| 19 | T07 Booking not found | GET /bookings/bk-does-not-exist | 404 | 404 {"error":"Booking not found","code":"NOT_FOUND"} | PASS |
| 20 | T08 Equipment not found | POST equipmentId=eq-999 | 404 | 404 {"error":"Equipment 'eq-999' does not exist","code":"EQUIPMENT_NOT_FOUND"} | PASS |
| 21 | T09a Overlap at the end of A | POST eq-1 10:00-12:00 | 409 | 409 {"error":"That equipment is already booked for an overlapping time","code":"BOOKING_CONFLICT"} | PASS |
| 22 | T09b New fully inside A | POST eq-1 09:30-10:00 | 409 | 409 {"error":"That equipment is already booked for an overlapping time","code":"BOOKING_CONFLICT"} | PASS |
| 23 | T09c New fully wraps A | POST eq-1 08:00-12:00 | 409 | 409 {"error":"That equipment is already booked for an overlapping time","code":"BOOKING_CONFLICT"} | PASS |
| 24 | T09d Same time, different equipment allowed | POST eq-2 09:00-11:00 | 201 | 201 {"success":true,"data":{"id":"bk-3b201539-2fa4-42be-96cd-af6fb2edc689","equipmentId":"eq-2","borrowerName":"X","startAt":"2026-10-20T09:00:00.000Z","e | PASS |
| 25 | T09e Exact same time as A | POST eq-1 09:00-11:00 | 409 | 409 {"error":"That equipment is already booked for an overlapping time","code":"BOOKING_CONFLICT"} | PASS |
| 26 | T09f Overlap at the start of A | POST eq-1 08:00-10:00 | 409 | 409 {"error":"That equipment is already booked for an overlapping time","code":"BOOKING_CONFLICT"} | PASS |
| 27 | T11a Back-to-back AFTER A (11:00-13:00) | POST eq-1 11:00-13:00 | 201 | 201 {"success":true,"data":{"id":"bk-363d00aa-729f-4b1b-a094-96b18c028271","equipmentId":"eq-1","borrowerName":"B2B","startAt":"2026-10-20T11:00:00.000Z", | PASS |
| 28 | T11b 10:59 start overlaps A by one minute | POST eq-1 10:59-13:00 | 409 | 409 {"error":"That equipment is already booked for an overlapping time","code":"BOOKING_CONFLICT"} | PASS |
| 29 | T11c Back-to-back BEFORE A (07:00-09:00) | POST eq-1 07:00-09:00 | 201 | 201 {"success":true,"data":{"id":"bk-18ab572b-394c-4411-9395-cbb948815c3a","equipmentId":"eq-1","borrowerName":"X","startAt":"2026-10-20T07:00:00.000Z","e | PASS |
| 30 | T10a PATCH B into A's slot | PATCH B -> 09:00-11:00 | 409 | 409 {"error":"That equipment is already booked for an overlapping time","code":"BOOKING_CONFLICT"} | PASS |
| 31 | T10a2 PATCH only endAt (merged range invalid) | PATCH B endAt=10:00 (start stays 11:00) | 400 | 400 {"error":"endAt: must be after startAt","code":"VALIDATION_ERROR"} | PASS |
| 32 | T10a3 PATCH only startAt into overlap | PATCH B startAt=10:00 (end stays 13:00) | 409 | 409 {"error":"That equipment is already booked for an overlapping time","code":"BOOKING_CONFLICT"} | PASS |
| 33 | T10b PATCH B to free slot | PATCH B -> 14:00-15:00 | 200 | 200 {"success":true,"data":{"id":"bk-363d00aa-729f-4b1b-a094-96b18c028271","equipmentId":"eq-1","borrowerName":"B2B","startAt":"2026-10-20T14:00:00.000Z", | PASS |
| 34 | T10c PATCH to own current slot (no self-conflict) | PATCH B -> same 14:00-15:00 | 200 | 200 {"success":true,"data":{"id":"bk-363d00aa-729f-4b1b-a094-96b18c028271","equipmentId":"eq-1","borrowerName":"B2B","startAt":"2026-10-20T14:00:00.000Z", | PASS |
| 35 | T10d PATCH moving equipment into a clash | PATCH B -> eq-2 09:30-10:30 | 409 | 409 {"error":"That equipment is already booked for an overlapping time","code":"BOOKING_CONFLICT"} | PASS |
| 36 | T10e PATCH to nonexistent equipment | PATCH B equipmentId=eq-999 | 404 | 404 {"error":"Equipment 'eq-999' does not exist","code":"EQUIPMENT_NOT_FOUND"} | PASS |
| 37 | T10f PATCH nonexistent booking | PATCH /bookings/bk-nope | 404 | 404 {"error":"Booking not found","code":"NOT_FOUND"} | PASS |
| 38 | T10g PATCH empty body | PATCH B {} | 400 | 400 {"error":"provide at least one field to update","code":"VALIDATION_ERROR"} | PASS |
| 39 | T10h PATCH invalid field | PATCH B borrowerName='' | 400 | 400 {"error":"borrowerName: Too small: expected string to have >=1 characters","code":"VALIDATION_ERROR"} | PASS |
| 40 | T10i PATCH to same time as A but different equipment | PATCH B -> eq-3 09:00-11:00 | 200 | 200 {"success":true,"data":{"id":"bk-363d00aa-729f-4b1b-a094-96b18c028271","equipmentId":"eq-3","borrowerName":"B2B","startAt":"2026-10-20T09:00:00.000Z", | PASS |
| 41 | T12a SQLi payload stored as plain text | POST borrowerName="' OR 1=1 --", purpose contains DROP TABLE | 201 | 201 {"success":true,"data":{"id":"bk-edc79869-18cf-443f-870a-454f7581f95f","equipmentId":"eq-1","borrowerName":"' OR 1=1 --","startAt":"2026-12-01T09:00:0 | PASS |
| 42 | T12b SQLi in path id returns nothing | GET /bookings/' OR 1=1 -- | 404 | 404 {"error":"Booking not found","code":"NOT_FOUND"} | PASS |
| 43 | T12c SQLi in equipmentId is just an unknown id | POST equipmentId="eq-1' OR '1'='1" | 404 | 404 {"error":"Equipment 'eq-1' OR '1'='1' does not exist","code":"EQUIPMENT_NOT_FOUND"} | PASS |
| 44 | T12d Table intact, exactly one row added by T12a | GET /bookings count before/after | 6 -> 7 | 6 -> 7 | PASS |
| 45 | T13a Malformed JSON | POST body '{"equipmentId": ' | 400 | 400 {"error":"Request body must be valid JSON","code":"INVALID_JSON"} | PASS |
| 46 | T13b Unknown route returns JSON 404 | GET /api/nonexistent | 404 | 404 {"error":"Route not found","code":"NOT_FOUND"} | PASS |
| 47 | T13c Base API URL /api shows the endpoint index | GET /api | 200 | 200 {"success":true,"data":{"name":"CampusLend API","endpoints":["GET /api/equipment","GET /api/bookings","GET /api/bookings/:id","POST /api/bookings","PA | PASS |
| 48 | T13d Base API URL with trailing slash /api/ | GET /api/ | 200 | 200 {"success":true,"data":{"name":"CampusLend API","endpoints":["GET /api/equipment","GET /api/bookings","GET /api/bookings/:id","POST /api/bookings","PA | PASS |
| 49 | T13e Site root / shows the endpoint index | GET / | 200 + endpoint list | 200 {"success":true,"data":{"name":"CampusLend API","endpoints":["GET /api/equipment","GET /api/bookings","GET /api/bookings/:id","POST /api/bookings","PA | PASS |
| 50 | T14 List equipment | GET /equipment | 200 | 200 {"success":true,"data":[{"id":"eq-1","name":"Projector A","location":"Building 1"},{"id":"eq-2","name":"Canon EOS R50 Camera","location":"Media Lab, B | PASS |
| 51 | T15a CORS preflight, allowed origin | OPTIONS /bookings Origin: http://localhost:3000 (PATCH) | 2xx + allow-origin echoes origin + allow-methods has PATCH | 204 allow-origin=http://localhost:3000 allow-methods=GET,POST,PATCH,DELETE,OPTIONS | PASS |
| 52 | T15c CORS preflight, file:// tester (Origin: null) allowed | OPTIONS /bookings Origin: null | allow-origin: null | allow-origin=null | PASS |
| 53 | T15b CORS preflight, disallowed origin gets no allow-origin | OPTIONS /bookings Origin: https://evil.example | no allow-origin header | allow-origin=(absent) | PASS |
| 54 | T16a FOREIGN KEY rejects unknown equipment | wrangler d1 execute: INSERT INTO bookings (id,equipment_id,borrower_name,start_at,end_at,purpose) VALUES ('x1','eq-NOPE','n','2026-01-01T09:00:00.000Z','2026-01-01T10:00:00.000Z','p') | rejected, error mentions "FOREIGN KEY" | [31mX [41;31m[[41;97mERROR[41;31m][0m [1mA request to the Cloudflare API (/accounts/79b12663ac5948e7cdeaf5613f62a005/d1/database/f40fee3b-dc57-4fdd-9ebb-d | PASS |
| 55 | T16b CHECK rejects end_at <= start_at | wrangler d1 execute: INSERT INTO bookings (id,equipment_id,borrower_name,start_at,end_at,purpose) VALUES ('x2','eq-1','n','2026-01-01T10:00:00.000Z','2026-01-01T09:00:00.000Z','p') | rejected, error mentions "CHECK" | [31mX [41;31m[[41;97mERROR[41;31m][0m [1mA request to the Cloudflare API (/accounts/79b12663ac5948e7cdeaf5613f62a005/d1/database/f40fee3b-dc57-4fdd-9ebb-d | PASS |
| 56 | T16c NOT NULL rejects NULL purpose | wrangler d1 execute: INSERT INTO bookings (id,equipment_id,borrower_name,start_at,end_at,purpose) VALUES ('x3','eq-1','n','2026-01-01T09:00:00.000Z','2026-01-01T10:00:00.000Z',NULL) | rejected, error mentions "NOT NULL" | [31mX [41;31m[[41;97mERROR[41;31m][0m [1mA request to the Cloudflare API (/accounts/79b12663ac5948e7cdeaf5613f62a005/d1/database/f40fee3b-dc57-4fdd-9ebb-d | PASS |
| 57 | T16d UNIQUE rejects duplicate equipment name | wrangler d1 execute: INSERT INTO equipment (id,name,location) VALUES ('eq-9','Projector A','Somewhere') | rejected, error mentions "UNIQUE" | [31mX [41;31m[[41;97mERROR[41;31m][0m [1mA request to the Cloudflare API (/accounts/79b12663ac5948e7cdeaf5613f62a005/d1/database/f40fee3b-dc57-4fdd-9ebb-d | PASS |
| 58 | T16e DB-level overlap trigger rejects clash | wrangler d1 execute: INSERT INTO bookings (id,equipment_id,borrower_name,start_at,end_at,purpose) VALUES ('x4','eq-1','n','2026-10-20T10:00:00.000Z','2026-10-20T10:30:00.000Z','p') | rejected, error mentions "overlap" | [31mX [41;31m[[41;97mERROR[41;31m][0m [1mA request to the Cloudflare API (/accounts/79b12663ac5948e7cdeaf5613f62a005/d1/database/f40fee3b-dc57-4fdd-9ebb-d | PASS |
| 59 | T16f NOT NULL rejects NULL bookings.id | wrangler d1 execute: INSERT INTO bookings (id,equipment_id,borrower_name,start_at,end_at,purpose) VALUES (NULL,'eq-4','n','2030-01-01T09:00:00.000Z','2030-01-01T10:00:00.000Z','p') | rejected, error mentions "NOT NULL" | [31mX [41;31m[[41;97mERROR[41;31m][0m [1mA request to the Cloudflare API (/accounts/79b12663ac5948e7cdeaf5613f62a005/d1/database/f40fee3b-dc57-4fdd-9ebb-d | PASS |
| 60 | T16g NOT NULL rejects NULL equipment.id | wrangler d1 execute: INSERT INTO equipment (id,name,location) VALUES (NULL,'Null PK probe','Nowhere') | rejected, error mentions "NOT NULL" | [31mX [41;31m[[41;97mERROR[41;31m][0m [1mA request to the Cloudflare API (/accounts/79b12663ac5948e7cdeaf5613f62a005/d1/database/f40fee3b-dc57-4fdd-9ebb-d | PASS |
