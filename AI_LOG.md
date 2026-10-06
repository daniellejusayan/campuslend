# AI Log

AI assistance is permitted by the exam. This log records what was actually done in the build session. Fields marked
**[STUDENT TO COMPLETE]** are deliberately blank: they must be written in *your* words after you understand the code.
No earlier AI conversations were available to me, so none are claimed.

## Entry 1 — Whole-project build (Claude, single session)
### Task
Build the CampusLend API from the master prompt (Hono + D1), with tests, Quality Gate, documentation and exam prep.
No starter repository and no `tester.html` were provided.
### AI suggestion
Greenfield Hono + D1 project; Zod validation; shared `assertBookable()` for POST/PATCH; `{success,data}` envelope; no auth (contract has no user concept).
### Accepted
Everything in the repository at tag `v2-final`.
### Rejected
- Adding auth/ownership (no user model in the contract; would risk breaking an unseen tester). Documented as a limitation.
- A `?equipmentId=` list filter (not required; test removed).
- Claiming a race condition was a bug (could not reproduce; recorded as hardening only).
### Verification
Real curl/wrangler runs: v1 34/46, v2 50/50 (`docs/`). SQL audit by grep + script. See QUALITY_GATE_REVIEW.md.
### Disclosure about v1
v1 was deliberately written as a quick first pass (single file, naive PATCH, default CORS) so a Quality Gate could be
performed. The findings were then observed from real test failures, not invented.
### My understanding
**[STUDENT TO COMPLETE — explain in your own words: the overlap formula, why PATCH excludes itself, why 404 vs 409 vs 400, why `.bind()` stops SQL injection.]**

## Entry 2 — Tooling problems during the session
### Task
Get the tests running in the sandbox.
### What happened
`jq` was not installed (fetched the official release binary); the dev server was killed between tool calls (restarted detached); an over-broad `pkill` killed my own shell (switched to killing by process group). None affected the API code.
### My understanding
**[STUDENT TO COMPLETE or delete this entry if not relevant to your submission.]**

## Entry 3 — Final Quality Gate verification (Claude Code, local machine)
### Task
Verify the finished API against the exam instructions (9-step cURL sequence, error format `{"error":"..."}`, booking rules,
validation, SQL safety, schema, CRUD, contract), fix real issues, retest, update docs.
### Context
`tester.html` and the cURL guide file were not available; the instructions' description of them was used. An earlier
AI-generated update bundle (`campuslend-update.zip`, from a separate session) existed outside the repo but had **not** been
applied; it was not copied and none of its results were used as evidence. Everything below was run on this machine.
### What Claude did
Ran the 9-step sequence against the unchanged v2 code (4 rows failed on error shape); probed uncovered booking cases (all
already correct); found NULL primary keys accepted. Changed `errorBody()` (`src/http.ts`), added `NOT NULL` to both ids in
`migrations/0001_init.sql` and rebuilt the local DB, added `tests/guide-tests.sh` and 7 suite checks, forced a real 500 on an
empty DB, and tested the trigger→409 fallback with a temporary, reverted code change. Details: QUALITY_GATE_REVIEW.md
"Final verification round".
### Accepted
The changes made after `v2-final` (listed above); not yet committed at the time of writing.
### Rejected / limits
Did not change the success envelope `{success,data}`: the requirements available don't specify it, so changing it would be a
guess. Did not add authentication (not in the requirements). `jq` was not installed; the official jq 1.7.1 binary was put in a
temporary folder for the test run only.
### Verification
`docs/guide-before-fix.txt` (4 FAIL) → `docs/guide-after-fix.txt` (0 FAIL); `docs/evidence-v3-final.txt` 57/57;
`docs/error-500-check.txt`; `docs/trigger-fallback-check.txt`; `npm run typecheck` clean.
### My understanding
**[STUDENT TO COMPLETE — in your own words: why the error body must be `{"error": "..."}`, why `TEXT PRIMARY KEY` needed
`NOT NULL` in SQLite, and why passing tests did not prove the booking rule until the missing cases were added.]**

## Entry 4 — Make tests run on Windows without jq; submission and deployment prep (Claude Code)
### Task
The student's machine has no `jq`, and on Windows `npm test` runs through cmd.exe, where the bash + curl + jq suite is fragile.
Prepare the submission (README run instructions, ERD, evidence with Base API URL) and deploy to Cloudflare.
### What Claude did
Rewrote the test suite as `tests/run-tests.mjs` (Node built-in `fetch`; DB checks call wrangler's own JS entry point, so no
shell quoting). It contains the 9-step cURL sequence (section A) plus all 57 earlier checks (section B) and writes Markdown
evidence with the Base API URL. Removed `tests/run-tests.sh`, `tests/with-server.sh` and Entry 3's `tests/guide-tests.sh`
(still in git history). Rewrote the README (run steps, troubleshooting, Mermaid ERD, evidence table, deploy steps) and
added `migrate:remote`, `deploy` and `test:guide` npm scripts.
### Verification
`npm test` run from **PowerShell** with no jq/bash: 67 passed, 0 failed (`docs/evidence-local.md`). Negative control: with
the old error shape temporarily restored in `src/http.ts`, the runner reported the same 4 FAILs as the original baseline;
file restored afterwards.
### Deployment
The student ran `npx wrangler login` themselves. Claude then created D1 `campuslend-db` (APAC, id in `wrangler.jsonc`),
applied the 3 migrations remotely (checked: 2 tables, 2 triggers, 4 seed rows, `bookings.id` NOT NULL), ran `wrangler deploy`
→ `https://campuslend.mykanbanboard.workers.dev`, and ran the suite against it: **67 passed, 0 failed**
(`docs/evidence-cloudflare.md`). Found in that run: the suite left test bookings behind, including eq-1 2026-10-20 09:00–11:00,
the exact slot the exam's cURL guide creates, so a later guide run would get 409 instead of 201. Fixed by emptying bookings
after the run too; re-run: 67/67 with 0 bookings left. Local DB re-migrated (local D1 storage is keyed by `database_id`) and
re-tested: 67/67.
### My understanding
**[STUDENT TO COMPLETE — in your own words: what `npm test` does, why it resets bookings first, and how you would show the
examiner one passing and one failing (409) request.]**

## Entry template (copy for further AI use)
### Task / AI suggestion / Accepted / Rejected / Verification / My understanding
