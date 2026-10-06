# EXAM_EXPLANATION — "Explain your work"

## 1. Architecture
`HTTP request → Hono route (src/routes) → Zod validation (src/validation.ts) → business rules assertBookable() (src/bookings-db.ts) → D1 prepared query → toApi() → JSON response`.
Errors anywhere are thrown as `ApiError` and turned into the JSON error envelope by one `app.onError` in `src/index.ts`.

## 2. Database
- `equipment(id PK, name UNIQUE NOT NULL, location NOT NULL)`; `bookings(id PK, equipment_id FK→equipment RESTRICT, borrower_name, start_at, end_at, purpose, created_at, updated_at)`.
- Constraints: NOT NULL everywhere; CHECK `end_at > start_at`; CHECK lengths on name/purpose; UNIQUE equipment name; FK (D1 enforces FKs); two triggers forbid overlapping rows.
- Index `(equipment_id, start_at, end_at)` serves the FK and the overlap query. Relationship: 1 equipment → many bookings.
- Times are fixed-width UTC ISO text because SQLite has no date type; same-width text sorts chronologically.

## 3. REST
Nouns in URLs, the HTTP method is the verb: GET reads (safe, no change), POST creates (→201), PATCH changes part of a resource, DELETE removes (→204).

## 4. PATCH vs PUT
PUT replaces the whole resource (client must send everything). PATCH changes only the fields sent. Editing `purpose` should not force resending times, so PATCH. We merge the patch onto the stored row and validate the *merged* result.

## 5. Status codes
200 OK (GET/PATCH) · 201 Created (POST) · 204 No Content (DELETE, no body) · 400 request invalid · 401 not authenticated (not used) · 403 authenticated but not allowed (not used) · 404 not found · 409 conflict with current state (overlap) · 500 our bug.

## 6. Conflict detection
Overlap ⇔ `existing.start < new.end AND existing.end > new.start`. Two intervals fail to overlap only if one ends before/when the other starts; the formula is the negation of that. Because both comparisons are strict, `end == start` touches but does not overlap → back-to-back allowed (T11a 201) while 10:59 start is a clash (T11b 409). On PATCH we add `id <> :self`.

## 7. SQL injection
With `.bind(value)` the SQL text and the data travel separately; the database never parses the data as SQL, so `' OR 1=1 --` is just a string (T12a stored literally, T12d table intact). String concatenation would let the input become part of the query.

## 8. Authentication vs authorization
Authentication = who are you? Authorization = what may you do? This project implements neither (see Q12).

## 9. IDOR/BOLA
Changing an ID in the URL must not give access to someone else's object. The server must take identity from a verified credential, never from a `userId` in the body, and scope queries (`WHERE id=? AND user_id=?`). Not applicable here because there is no owner column — a stated limitation.

## 10. CORS
Controls whether a *browser* lets a page from another origin read the response. curl ignores it. It is not authentication. We allow only listed origins.

## 11. Validation vs DB constraints
Validation gives clear 4xx messages before touching the DB. Constraints are the last line of defence against bugs, other writers and races. Finding 2 shows why: relying on the DB alone produced 500s.

## 12. Quality Gate
See QUALITY_GATE_REVIEW.md: PATCH had no conflict check (200→409); client errors came back as 500 (→400/404); date parsing lenient (→strict); CORS `*` (→allowlist); text 404 (→JSON); no DB overlap guard (→triggers). Each verified by a named test.

# Oral exam questions
**Q1. Why PATCH, not PUT?** Short: PATCH is a partial update. Why: client sends only `purpose`; PUT would require all fields. Code: `bookings.patch` merge block.
**Q2. When 400 vs 404 vs 409?** 400 = malformed/invalid input; 404 = referenced thing doesn't exist; 409 = valid request that clashes with current data. Code: `assertBookable`.
**Q3. Why is nonexistent `equipmentId` a 404 not a 400?** It's a reference to a resource that doesn't exist; chosen and documented consistently for POST and PATCH. (400 is also defensible; consistency matters.)
**Q4. Explain the overlap formula.** `existing.start < new.end AND existing.end > new.start`. Why: negation of "one ends before the other starts". Code: SQL in `assertBookable`.
**Q5. Why are back-to-back bookings allowed?** Strict `<`/`>`; 09–11 then 11–13 share only an instant. Test T11a vs T11b.
**Q6. How do you avoid a booking conflicting with itself on PATCH?** `AND (?4 IS NULL OR id <> ?4)`; T10c proves patching to its own slot gives 200.
**Q7. Why validate the merged result on PATCH?** Sent fields may be valid alone but invalid with stored ones (new `endAt` before old `startAt`). Code: `next` object.
**Q8. How does parameter binding stop SQL injection?** Query and data are sent separately, so data can't change the query. T12a–d.
**Q9. What are prepared statements `?`/`.bind()` doing in D1?** Placeholders filled by the driver; no string building. Audit: 8/8 statements.
**Q10. Foreign key — what does it do and how did you prove it?** Forbids a booking whose `equipment_id` isn't in `equipment`; T16a shows `FOREIGN KEY constraint failed`.
**Q11. Why both Zod validation and DB constraints?** Friendly 4xx early vs last-line integrity; T16 proves the DB rejects what bypasses the API.
**Q12. What about authentication/authorization?** Not implemented: the contract has no users, and the brief made it conditional. Anyone can read/edit any booking — a stated limitation. To add: verified identity, `user_id` column, scoped queries, 401 vs 403.
**Q13. What is IDOR/BOLA and would this API be vulnerable?** Accessing others' objects by guessing IDs. Yes in principle, since there's no ownership model at all; documented, not hidden.
**Q14. What is CORS and is it security for the API?** Browser rule on cross-origin reads; not authentication. T15a/b: allowed origin echoed, evil origin gets no header; curl is unaffected.
**Q15. Why return JSON 404/500 instead of HTML, and why hide stack traces?** Consistent machine-readable contract; stack traces leak internals. Code: `notFound`, `onError`.
**Q16. Why is DELETE 204 with no body?** Success with nothing to return; a body would contradict the status. T05a asserts the body is empty.
**Q17. Why store timestamps as UTC ISO text?** SQLite has no date type; fixed-width UTC strings compare correctly; we reject timezone-less input because it is ambiguous.
**Q18. How did you verify AI-generated code?** Ran 46→50 real tests; v1 failed 12 which exposed real bugs; grep SQL audit; marked unverified items.
**Q19. What did your Quality Gate find in Reliability/Accuracy?** PATCH skipped the conflict check (200 instead of 409); fixed via shared `assertBookable`; T10a.
**Q20. What is NOT verified?** `tester.html` compatibility (not provided), the trigger→409 fallback in `onError`, real-browser CORS, remote (deployed) D1, concurrency under real load.

# Final rubric audit
| Rubric Area | Requirement | Evidence | Status |
|---|---|---|---|
| API contract | Endpoints, payloads, status codes, 400/404/409 reasoning, assumptions | API_CONTRACT.md; T01–T14 all match it | PASS |
| API contract | Compatibility with provided `tester.html` | No tester provided | NOT VERIFIED (open tester, check CORS/shape) |
| Data design | Relational schema, types, FK, constraints, overlap on create **and** update | migrations/0001–0003; T09, T10a/d, T16a–e | PASS |
| Implementation/security | CRUD, validation, JSON errors, binding, no concatenation | T01–T13; SQL audit 8/8 | PASS |
| Implementation/security | Authentication / authorization / ownership | Not implemented (no users in contract) | FAIL (by design; N/A if rubric doesn't require) |
| Testing/evidence | ≥5 tests incl. success, validation, 404, 409, curl output | docs/evidence-v2-final.txt, 50/50 | PASS |
| Quality Gate | Snapshot, ≥3 findings, Reliability + Reasoning findings, fix+verify | tag v1-snapshot, QUALITY_GATE_REVIEW.md (6 findings) | PASS (redo snapshot on your own clock) |
| AI responsibility | Transparent log, verification, you can explain it | AI_LOG.md; "My understanding" blank | NOT VERIFIED until you complete it and can answer Q1–Q20 |
