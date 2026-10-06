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

## Entry template (copy for further AI use)
### Task / AI suggestion / Accepted / Rejected / Verification / My understanding
