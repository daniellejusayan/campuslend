// CampusLend test runner. Pure Node.js (18+): no bash, curl or jq needed.
//
//   node tests/run-tests.mjs                                   local server, local D1
//   node tests/run-tests.mjs --remote --base https://<worker>  deployed Worker, remote D1
//   options: --out <file>   evidence file (default docs/evidence-local.md / docs/evidence-cloudflare.md)
//            --guide-only   only the exam's 9-step cURL Quick Test sequence
//
// Empties the bookings table before and after the run (so the server's own D1 must be targeted: --local or --remote).
// Writes a Markdown evidence file: Base API URL, every request, expected vs actual status, PASS/FAIL.
import { spawnSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const REMOTE = args.includes("--remote");
const GUIDE_ONLY = args.includes("--guide-only");
const BASE = (opt("--base") ?? process.env.BASE ?? "http://localhost:8787").replace(/\/+$/, "");
const API = `${BASE}/api`;
const OUT = opt("--out") ?? (REMOTE ? "docs/evidence-cloudflare.md" : "docs/evidence-local.md");
const WRANGLER = fileURLToPath(new URL("../node_modules/wrangler/bin/wrangler.js", import.meta.url));

// ---------- helpers ----------
const rows = []; // { section, name, request, expected, actual, result, note }
let section = "";
let pass = 0, fail = 0;

/** Sends one request. Returns { status, body (parsed JSON or null), text, headers }. */
async function call(method, path, body, headers = {}) {
  const init = { method, headers: { ...headers } };
  if (body !== undefined) {
    init.headers["Content-Type"] = "application/json";
    init.body = typeof body === "string" ? body : JSON.stringify(body);
  }
  const res = await fetch(API + path, init);
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not JSON (e.g. 204) */ }
  return { status: res.status, body: json, text, headers: res.headers };
}

/** Records a check. Every expected 4xx/5xx must also have the required error body {"error": string, "code": string}. */
function check(name, request, expected, res, assertion, assertionText = "") {
  let ok = res.status === expected;
  let note = "";
  if (ok && expected >= 400) {
    const b = res.body;
    if (!(b && typeof b.error === "string" && b.error.length > 0 && typeof b.code === "string")) {
      ok = false; note = 'error body is not {"error": string, "code": string}';
    }
  }
  if (ok && assertion) {
    let held = false;
    try { held = Boolean(assertion(res.body, res)); } catch { held = false; }
    if (!held) { ok = false; note = `assertion failed: ${assertionText}`; }
  }
  record(name, request, String(expected), `${res.status} ${res.text.slice(0, 150)}`, ok, note);
}

function record(name, request, expected, actual, ok, note = "") {
  ok ? pass++ : fail++;
  rows.push({ section, name, request, expected, actual, result: ok ? "PASS" : "FAIL", note });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${note ? `  (${note})` : ""}`);
}

/** Runs SQL directly against D1 (bypassing the API) through wrangler's own JS entry point: no shell quoting issues. */
function d1(sql) {
  const r = spawnSync(process.execPath, [WRANGLER, "d1", "execute", "campuslend-db", REMOTE ? "--remote" : "--local", "--command", sql], {
    encoding: "utf8",
    env: { ...process.env, CI: "1", NO_COLOR: "1", FORCE_COLOR: "0" },
  });
  return { status: r.status, output: `${r.stdout ?? ""}\n${r.stderr ?? ""}` };
}

function dbMustReject(name, sql, expectedText) {
  const r = d1(sql);
  const ok = r.status !== 0 && r.output.toLowerCase().includes(expectedText.toLowerCase());
  const line = r.output.split("\n").find((l) => /error|constraint/i.test(l))?.trim() ?? `(exit ${r.status}, no error line)`;
  record(name, `wrangler d1 execute: ${sql}`, `rejected, error mentions "${expectedText}"`, line.slice(0, 160), ok);
}

function resetBookings() {
  const r = d1("DELETE FROM bookings");
  if (r.status !== 0) {
    console.error(`Could not reset bookings via wrangler (${REMOTE ? "remote" : "local"} D1):\n${r.output}`);
    process.exit(2);
  }
}

const booking = (o = {}) => ({
  equipmentId: "eq-1", borrowerName: "X", purpose: "p",
  startAt: "2026-10-21T09:00:00.000Z", endAt: "2026-10-21T10:00:00.000Z", ...o,
});

// ---------- preflight: is the server there and migrated? ----------
try {
  const r = await call("GET", "/equipment");
  if (r.status === 500) {
    console.error(`GET ${API}/equipment returned 500: the database probably has no tables.\nRun: npm run migrate${REMOTE ? ":remote" : ""}`);
    process.exit(2);
  }
} catch {
  console.error(`Cannot reach ${API}. Start the server first (npm run dev) or pass --base <url>.`);
  process.exit(2);
}
console.log(`Base API URL: ${API}   (D1: ${REMOTE ? "remote" : "local"})\n`);

// ---------- A. the exam's 9-step cURL Quick Test sequence ----------
section = "A. Exam cURL Quick Test sequence";
resetBookings();
{
  const A = booking({ borrowerName: "Somchai Jaidee", startAt: "2026-10-20T09:00:00.000Z", endAt: "2026-10-20T11:00:00.000Z", purpose: "Class presentation" });
  check("1 List equipment", "GET /equipment", 200, await call("GET", "/equipment"));
  check("2 List bookings", "GET /bookings", 200, await call("GET", "/bookings"));
  const created = await call("POST", "/bookings", A);
  check("3 Create booking", "POST /bookings (eq-1 09:00-11:00)", 201, created);
  const id = created.body?.data?.id;
  check("4 Get booking", `GET /bookings/${id}`, 200, await call("GET", `/bookings/${id}`));
  check("5 Update booking", `PATCH /bookings/${id} {purpose}`, 200, await call("PATCH", `/bookings/${id}`, { purpose: "Updated class presentation" }));
  check("6 Invalid time range", "POST endAt before startAt", 400,
    await call("POST", "/bookings", booking({ startAt: "2026-10-21T11:00:00.000Z", endAt: "2026-10-21T09:00:00.000Z" })));
  check("7 Overlapping booking", "POST eq-1 10:00-12:00 (overlaps 09:00-11:00)", 409,
    await call("POST", "/bookings", booking({ startAt: "2026-10-20T10:00:00.000Z", endAt: "2026-10-20T12:00:00.000Z" })));
  check("8 Missing booking", "GET /bookings/bk-does-not-exist", 404, await call("GET", "/bookings/bk-does-not-exist"));
  check("9 Delete booking", `DELETE /bookings/${id}`, 204, await call("DELETE", `/bookings/${id}`), (_, r) => r.text === "", "body is empty");
  check("9b Get after delete", `GET /bookings/${id}`, 404, await call("GET", `/bookings/${id}`));
}

// ---------- B. full regression suite ----------
if (!GUIDE_ONLY) {
  section = "B. Full regression suite";
  resetBookings();
  const A = booking({ borrowerName: "Somchai Jaidee", startAt: "2026-10-20T09:00:00.000Z", endAt: "2026-10-20T11:00:00.000Z", purpose: "Class presentation" });

  // CRUD
  let r = await call("POST", "/bookings", A);
  check("T01 Create booking", "POST /bookings (eq-1 09:00-11:00)", 201, r, (b) => b.success === true && b.data.equipmentId === "eq-1" && b.data.id.length > 0, "success, equipmentId, id");
  const aId = r.body?.data?.id;
  check("T02 List bookings", "GET /bookings", 200, await call("GET", "/bookings"), (b) => Array.isArray(b.data) && b.data.length === 1, "array of 1");
  check("T03 Get one booking", `GET /bookings/${aId}`, 200, await call("GET", `/bookings/${aId}`), (b) => b.data.id === aId, "same id");
  check("T04 PATCH partial (purpose only)", `PATCH /bookings/${aId} {purpose}`, 200,
    await call("PATCH", `/bookings/${aId}`, { purpose: "Updated class presentation" }),
    (b) => b.data.purpose === "Updated class presentation" && b.data.startAt === "2026-10-20T09:00:00.000Z" && b.data.borrowerName === "Somchai Jaidee",
    "purpose changed, other fields kept");
  check("T04b GET after PATCH shows the persisted change", `GET /bookings/${aId}`, 200, await call("GET", `/bookings/${aId}`),
    (b) => b.data.purpose === "Updated class presentation" && b.data.endAt === "2026-10-20T11:00:00.000Z" && b.data.updatedAt >= b.data.createdAt,
    "persisted");
  r = await call("POST", "/bookings", booking({ borrowerName: "Tmp", startAt: "2026-11-01T09:00:00.000Z", endAt: "2026-11-01T10:00:00.000Z", purpose: "to delete" }));
  const dId = r.body?.data?.id;
  check("T05a Delete booking", `DELETE /bookings/${dId}`, 204, await call("DELETE", `/bookings/${dId}`), (_, res) => res.text === "", "body is empty");
  check("T05b Deleted booking is gone", `GET /bookings/${dId}`, 404, await call("GET", `/bookings/${dId}`), (b) => b.code === "NOT_FOUND", "code NOT_FOUND");

  // Validation (400)
  const v = async (name, req, body, expected = 400, assertion, text) =>
    check(name, req, expected, await call("POST", "/bookings", body), assertion ?? ((b) => b.code === "VALIDATION_ERROR"), text ?? "code VALIDATION_ERROR");
  await v("T06a Invalid range endAt<startAt", "POST endAt before startAt", booking({ startAt: "2026-10-21T11:00:00.000Z", endAt: "2026-10-21T09:00:00.000Z" }));
  await v("T06b Invalid range endAt==startAt", "POST endAt equals startAt", booking({ endAt: "2026-10-21T09:00:00.000Z" }));
  await v("T06c Invalid date string", "POST startAt=not-a-date", booking({ startAt: "not-a-date" }));
  const { borrowerName: _omit, ...noName } = booking();
  await v("T06d Missing borrowerName", "POST without borrowerName", noName);
  await v("T06e Whitespace-only borrowerName", "POST borrowerName='   '", booking({ borrowerName: "   " }));
  await v("T06f Non-string borrowerName", "POST borrowerName=123", booking({ borrowerName: 123 }));
  await v("T06g Over-long borrowerName (101)", "POST borrowerName length 101", booking({ borrowerName: "a".repeat(101) }));
  await v("T06h Timestamp without timezone rejected", "POST startAt=2026-10-21T09:00:00 (no Z)", booking({ startAt: "2026-10-21T09:00:00", endAt: "2026-10-21T10:00:00Z" }));
  await v("T06i Non-ISO date format rejected", "POST startAt='Oct 20 2026 9:00'", booking({ startAt: "Oct 20 2026 9:00", endAt: "2026-10-21T10:00:00Z" }));
  await v("T06j Impossible calendar date (Feb 31) rejected", "POST startAt=2026-02-31T09:00:00Z", booking({ startAt: "2026-02-31T09:00:00Z", endAt: "2026-03-01T10:00:00Z" }));
  await v("T06k Offset timestamp normalised to UTC", "POST startAt=2026-09-10T16:00:00+07:00",
    booking({ equipmentId: "eq-3", borrowerName: "Tz", startAt: "2026-09-10T16:00:00+07:00", endAt: "2026-09-10T18:00:00+07:00", purpose: "offset normalised" }),
    201, (b) => b.data.startAt === "2026-09-10T09:00:00.000Z", "stored as 09:00:00.000Z");

  // Not found (404)
  check("T07 Booking not found", "GET /bookings/bk-does-not-exist", 404, await call("GET", "/bookings/bk-does-not-exist"), (b) => b.code === "NOT_FOUND", "code NOT_FOUND");
  check("T08 Equipment not found", "POST equipmentId=eq-999", 404,
    await call("POST", "/bookings", booking({ equipmentId: "eq-999", startAt: "2026-10-22T09:00:00.000Z", endAt: "2026-10-22T10:00:00.000Z" })),
    (b) => b.code === "EQUIPMENT_NOT_FOUND", "code EQUIPMENT_NOT_FOUND");

  // Overlap rule on POST (A = eq-1 09:00-11:00)
  const conflict = (b) => b.code === "BOOKING_CONFLICT";
  const post = (o) => call("POST", "/bookings", booking(o));
  check("T09a Overlap at the end of A", "POST eq-1 10:00-12:00", 409, await post({ startAt: "2026-10-20T10:00:00.000Z", endAt: "2026-10-20T12:00:00.000Z" }), conflict, "BOOKING_CONFLICT");
  check("T09b New fully inside A", "POST eq-1 09:30-10:00", 409, await post({ startAt: "2026-10-20T09:30:00.000Z", endAt: "2026-10-20T10:00:00.000Z" }), conflict, "BOOKING_CONFLICT");
  check("T09c New fully wraps A", "POST eq-1 08:00-12:00", 409, await post({ startAt: "2026-10-20T08:00:00.000Z", endAt: "2026-10-20T12:00:00.000Z" }), conflict, "BOOKING_CONFLICT");
  check("T09d Same time, different equipment allowed", "POST eq-2 09:00-11:00", 201, await post({ equipmentId: "eq-2", startAt: "2026-10-20T09:00:00.000Z", endAt: "2026-10-20T11:00:00.000Z" }));
  check("T09e Exact same time as A", "POST eq-1 09:00-11:00", 409, await post({ startAt: "2026-10-20T09:00:00.000Z", endAt: "2026-10-20T11:00:00.000Z" }), conflict, "BOOKING_CONFLICT");
  check("T09f Overlap at the start of A", "POST eq-1 08:00-10:00", 409, await post({ startAt: "2026-10-20T08:00:00.000Z", endAt: "2026-10-20T10:00:00.000Z" }), conflict, "BOOKING_CONFLICT");

  // Back-to-back
  r = await post({ borrowerName: "B2B", startAt: "2026-10-20T11:00:00.000Z", endAt: "2026-10-20T13:00:00.000Z", purpose: "back to back" });
  check("T11a Back-to-back AFTER A (11:00-13:00)", "POST eq-1 11:00-13:00", 201, r);
  const bId = r.body?.data?.id;
  await post({ borrowerName: "C", startAt: "2026-10-20T13:00:00.000Z", endAt: "2026-10-20T14:00:00.000Z", purpose: "setup: C 13:00-14:00" }); // setup, not a check
  check("T11b 10:59 start overlaps A by one minute", "POST eq-1 10:59-13:00", 409, await post({ startAt: "2026-10-20T10:59:00.000Z", endAt: "2026-10-20T13:00:00.000Z" }), conflict, "BOOKING_CONFLICT");
  check("T11c Back-to-back BEFORE A (07:00-09:00)", "POST eq-1 07:00-09:00", 201, await post({ startAt: "2026-10-20T07:00:00.000Z", endAt: "2026-10-20T09:00:00.000Z" }),
    (b) => b.data.endAt === "2026-10-20T09:00:00.000Z", "endAt 09:00");

  // Overlap rule on PATCH (B = eq-1 11:00-13:00)
  const patchB = (o) => call("PATCH", `/bookings/${bId}`, o);
  check("T10a PATCH B into A's slot", "PATCH B -> 09:00-11:00", 409, await patchB({ startAt: "2026-10-20T09:00:00.000Z", endAt: "2026-10-20T11:00:00.000Z" }), conflict, "BOOKING_CONFLICT");
  check("T10a2 PATCH only endAt (merged range invalid)", "PATCH B endAt=10:00 (start stays 11:00)", 400, await patchB({ endAt: "2026-10-20T10:00:00.000Z" }), (b) => b.code === "VALIDATION_ERROR", "VALIDATION_ERROR");
  check("T10a3 PATCH only startAt into overlap", "PATCH B startAt=10:00 (end stays 13:00)", 409, await patchB({ startAt: "2026-10-20T10:00:00.000Z" }), conflict, "BOOKING_CONFLICT");
  check("T10b PATCH B to free slot", "PATCH B -> 14:00-15:00", 200, await patchB({ startAt: "2026-10-20T14:00:00.000Z", endAt: "2026-10-20T15:00:00.000Z" }),
    (b) => b.data.startAt === "2026-10-20T14:00:00.000Z", "moved");
  check("T10c PATCH to own current slot (no self-conflict)", "PATCH B -> same 14:00-15:00", 200, await patchB({ startAt: "2026-10-20T14:00:00.000Z", endAt: "2026-10-20T15:00:00.000Z" }));
  check("T10d PATCH moving equipment into a clash", "PATCH B -> eq-2 09:30-10:30", 409, await patchB({ equipmentId: "eq-2", startAt: "2026-10-20T09:30:00.000Z", endAt: "2026-10-20T10:30:00.000Z" }), conflict, "BOOKING_CONFLICT");
  check("T10e PATCH to nonexistent equipment", "PATCH B equipmentId=eq-999", 404, await patchB({ equipmentId: "eq-999" }), (b) => b.code === "EQUIPMENT_NOT_FOUND", "EQUIPMENT_NOT_FOUND");
  check("T10f PATCH nonexistent booking", "PATCH /bookings/bk-nope", 404, await call("PATCH", "/bookings/bk-nope", { purpose: "x" }), (b) => b.code === "NOT_FOUND", "NOT_FOUND");
  check("T10g PATCH empty body", "PATCH B {}", 400, await patchB({}), (b) => b.code === "VALIDATION_ERROR", "VALIDATION_ERROR");
  check("T10h PATCH invalid field", "PATCH B borrowerName=''", 400, await patchB({ borrowerName: "" }), (b) => b.code === "VALIDATION_ERROR", "VALIDATION_ERROR");
  check("T10i PATCH to same time as A but different equipment", "PATCH B -> eq-3 09:00-11:00", 200,
    await patchB({ equipmentId: "eq-3", startAt: "2026-10-20T09:00:00.000Z", endAt: "2026-10-20T11:00:00.000Z" }),
    (b) => b.data.equipmentId === "eq-3" && b.data.startAt === "2026-10-20T09:00:00.000Z", "moved to eq-3");

  // SQL injection (harmless payloads)
  const before = (await call("GET", "/bookings")).body.data.length;
  check("T12a SQLi payload stored as plain text", `POST borrowerName="' OR 1=1 --", purpose contains DROP TABLE`, 201,
    await post({ borrowerName: "' OR 1=1 --", startAt: "2026-12-01T09:00:00.000Z", endAt: "2026-12-01T10:00:00.000Z", purpose: "x'; DROP TABLE bookings; --" }),
    (b) => b.data.borrowerName === "' OR 1=1 --", "stored literally");
  check("T12b SQLi in path id returns nothing", "GET /bookings/' OR 1=1 --", 404, await call("GET", `/bookings/${encodeURIComponent("' OR 1=1 --")}`), (b) => b.code === "NOT_FOUND", "NOT_FOUND");
  check("T12c SQLi in equipmentId is just an unknown id", `POST equipmentId="eq-1' OR '1'='1"`, 404,
    await post({ equipmentId: "eq-1' OR '1'='1", startAt: "2026-12-02T09:00:00.000Z", endAt: "2026-12-02T10:00:00.000Z" }),
    (b) => b.code === "EQUIPMENT_NOT_FOUND", "EQUIPMENT_NOT_FOUND");
  const after = (await call("GET", "/bookings")).body.data.length;
  record("T12d Table intact, exactly one row added by T12a", "GET /bookings count before/after", `${before} -> ${before + 1}`, `${before} -> ${after}`, after === before + 1);

  // Malformed input / routing
  check("T13a Malformed JSON", `POST body '{"equipmentId": '`, 400, await call("POST", "/bookings", '{"equipmentId": '), (b) => b.code === "INVALID_JSON", "INVALID_JSON");
  check("T13b Unknown route returns JSON 404", "GET /api/nonexistent", 404, await call("GET", "/nonexistent"), (b) => b.code === "NOT_FOUND", "NOT_FOUND");

  // Equipment
  check("T14 List equipment", "GET /equipment", 200, await call("GET", "/equipment"),
    (b) => b.success === true && b.data.length >= 2 && ["id", "name", "location"].every((k) => k in b.data[0]), "id, name, location");

  // CORS (fetch in Node may set Origin, unlike a browser)
  r = await call("OPTIONS", "/bookings", undefined, { Origin: "http://localhost:3000", "Access-Control-Request-Method": "PATCH", "Access-Control-Request-Headers": "content-type" });
  const acao = r.headers.get("access-control-allow-origin");
  record("T15a CORS preflight, allowed origin", "OPTIONS /bookings Origin: http://localhost:3000 (PATCH)",
    "2xx + allow-origin echoes origin + allow-methods has PATCH", `${r.status} allow-origin=${acao} allow-methods=${r.headers.get("access-control-allow-methods")}`,
    r.status >= 200 && r.status < 300 && acao === "http://localhost:3000" && /PATCH/.test(r.headers.get("access-control-allow-methods") ?? ""));
  r = await call("OPTIONS", "/bookings", undefined, { Origin: "null", "Access-Control-Request-Method": "POST" });
  record("T15c CORS preflight, file:// tester (Origin: null) allowed", "OPTIONS /bookings Origin: null", "allow-origin: null",
    `allow-origin=${r.headers.get("access-control-allow-origin") ?? "(absent)"}`, r.headers.get("access-control-allow-origin") === "null");
  r = await call("OPTIONS", "/bookings", undefined, { Origin: "https://evil.example", "Access-Control-Request-Method": "POST" });
  record("T15b CORS preflight, disallowed origin gets no allow-origin", "OPTIONS /bookings Origin: https://evil.example", "no allow-origin header",
    `allow-origin=${r.headers.get("access-control-allow-origin") ?? "(absent)"}`, r.headers.get("access-control-allow-origin") === null);

  // Database constraints (bypass the API, talk to D1 directly)
  const ins = (id, eq, start, end, purpose = "'p'") =>
    `INSERT INTO bookings (id,equipment_id,borrower_name,start_at,end_at,purpose) VALUES (${id},'${eq}','n','${start}','${end}',${purpose})`;
  dbMustReject("T16a FOREIGN KEY rejects unknown equipment", ins("'x1'", "eq-NOPE", "2026-01-01T09:00:00.000Z", "2026-01-01T10:00:00.000Z"), "FOREIGN KEY");
  dbMustReject("T16b CHECK rejects end_at <= start_at", ins("'x2'", "eq-1", "2026-01-01T10:00:00.000Z", "2026-01-01T09:00:00.000Z"), "CHECK");
  dbMustReject("T16c NOT NULL rejects NULL purpose", ins("'x3'", "eq-1", "2026-01-01T09:00:00.000Z", "2026-01-01T10:00:00.000Z", "NULL"), "NOT NULL");
  dbMustReject("T16d UNIQUE rejects duplicate equipment name", "INSERT INTO equipment (id,name,location) VALUES ('eq-9','Projector A','Somewhere')", "UNIQUE");
  dbMustReject("T16e DB-level overlap trigger rejects clash", ins("'x4'", "eq-1", "2026-10-20T10:00:00.000Z", "2026-10-20T10:30:00.000Z"), "overlap");
  dbMustReject("T16f NOT NULL rejects NULL bookings.id", ins("NULL", "eq-4", "2030-01-01T09:00:00.000Z", "2030-01-01T10:00:00.000Z"), "NOT NULL");
  dbMustReject("T16g NOT NULL rejects NULL equipment.id", "INSERT INTO equipment (id,name,location) VALUES (NULL,'Null PK probe','Nowhere')", "NOT NULL");
}

// Leave no test bookings behind: the exam's cURL guide books eq-1 2026-10-20 09:00-11:00 and would otherwise get 409.
resetBookings();

// ---------- write evidence ----------
const esc = (s) => String(s).replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
let md = `# Test evidence — ${REMOTE ? "Cloudflare (deployed)" : "local"}\n\n`;
md += `- **Base API URL:** \`${API}\`\n- **Database:** ${REMOTE ? "remote D1 (Cloudflare)" : "local D1 (wrangler dev)"}\n`;
md += `- **Run at:** ${new Date().toISOString()}\n- **Command:** \`node tests/run-tests.mjs ${args.join(" ")}\`\n`;
md += `- **Result:** ${pass} passed, ${fail} failed, ${pass + fail} total\n`;
for (const s of [...new Set(rows.map((r) => r.section))]) {
  md += `\n## ${s}\n\n| # | Test | Request | Expected | Actual (status + start of body) | Result |\n|---|---|---|---|---|---|\n`;
  rows.filter((r) => r.section === s).forEach((r, i) => {
    md += `| ${i + 1} | ${esc(r.name)} | ${esc(r.request)} | ${esc(r.expected)} | ${esc(r.actual)}${r.note ? ` — **${esc(r.note)}**` : ""} | ${r.result} |\n`;
  });
}
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, md);
console.log(`\n${pass} passed, ${fail} failed, ${pass + fail} total  ->  evidence written to ${OUT}`);
process.exit(fail === 0 ? 0 : 1);
