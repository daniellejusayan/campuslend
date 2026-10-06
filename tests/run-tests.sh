#!/usr/bin/env bash
# CampusLend regression suite. Requires: server running on $BASE (npx wrangler dev), curl, jq.
# Resets bookings before running so results are repeatable. Writes tests/evidence.txt.
BASE="${BASE:-http://localhost:8787}"
API="$BASE/api"
OUT="tests/evidence.txt"
PASS=0; FAIL=0; N=0
: > "$OUT"

npx wrangler d1 execute campuslend-db --local --command "DELETE FROM bookings" >/dev/null 2>&1

STATUS=""; BODY=""
call() { # method path [json-body] [extra curl args...]
  local method="$1" path="$2" data="${3:-}"; shift 3 2>/dev/null || shift $#
  local args=(-s -o /tmp/cl_body -w "%{http_code}" -X "$method" "$API$path")
  [ -n "$data" ] && args+=(-H "Content-Type: application/json" --data "$data")
  STATUS=$(curl "${args[@]}" "$@"); BODY=$(cat /tmp/cl_body)
}
check() { # name expected-status request-desc [jq-assertion]
  local name="$1" exp="$2" req="$3" jqx="${4:-}" ok=1 note=""
  [ "$STATUS" = "$exp" ] || ok=0
  if [ -n "$jqx" ] && [ "$ok" = 1 ]; then
    echo "$BODY" | jq -e "$jqx" >/dev/null 2>&1 || { ok=0; note=" (body assertion failed: $jqx)"; }
  fi
  N=$((N+1))
  local res="PASS"; [ "$ok" = 1 ] && PASS=$((PASS+1)) || { res="FAIL"; FAIL=$((FAIL+1)); }
  printf '%s\nTest:     %s\nRequest:  %s\nExpected: %s\nActual:   %s %s%s\nResult:   %s\n\n' \
    "----" "$name" "$req" "$exp" "$STATUS" "$(echo "$BODY" | head -c 300)" "$note" "$res" | tee -a "$OUT"
}
id_of() { echo "$BODY" | jq -r '.data.id'; }

EQ=eq-1
A='{"equipmentId":"eq-1","borrowerName":"Somchai Jaidee","startAt":"2026-10-20T09:00:00.000Z","endAt":"2026-10-20T11:00:00.000Z","purpose":"Class presentation"}'

call POST /bookings "$A"
check "T01 Create booking" 201 "POST /bookings (eq-1 09:00-11:00)" '.success==true and .data.equipmentId=="eq-1" and (.data.id|length)>0'
A_ID=$(id_of)

call GET /bookings ""
check "T02 List bookings" 200 "GET /bookings" '.success==true and (.data|type=="array") and (.data|length)==1'

call GET "/bookings/$A_ID" ""
check "T03 Get one booking" 200 "GET /bookings/$A_ID" '.data.id=="'"$A_ID"'"'

call PATCH "/bookings/$A_ID" '{"purpose":"Updated class presentation"}'
check "T04 PATCH partial (purpose only)" 200 "PATCH /bookings/$A_ID {purpose}" '.data.purpose=="Updated class presentation" and .data.startAt=="2026-10-20T09:00:00.000Z" and .data.borrowerName=="Somchai Jaidee"'

call POST /bookings '{"equipmentId":"eq-1","borrowerName":"Tmp","startAt":"2026-11-01T09:00:00.000Z","endAt":"2026-11-01T10:00:00.000Z","purpose":"to delete"}'
D_ID=$(id_of)
call DELETE "/bookings/$D_ID" ""
check "T05a Delete booking" 204 "DELETE /bookings/$D_ID" ""
[ -z "$BODY" ] && echo "(204 body is empty: OK)" | tee -a "$OUT" || echo "(204 body NOT empty: FAIL)" | tee -a "$OUT"
call GET "/bookings/$D_ID" ""
check "T05b Deleted booking is gone" 404 "GET /bookings/$D_ID" '.error.code=="NOT_FOUND"'

call POST /bookings '{"equipmentId":"eq-1","borrowerName":"X","startAt":"2026-10-21T11:00:00.000Z","endAt":"2026-10-21T09:00:00.000Z","purpose":"bad range"}'
check "T06a Invalid range endAt<startAt" 400 "POST endAt before startAt" '.success==false and .error.code=="VALIDATION_ERROR"'
call POST /bookings '{"equipmentId":"eq-1","borrowerName":"X","startAt":"2026-10-21T09:00:00.000Z","endAt":"2026-10-21T09:00:00.000Z","purpose":"zero length"}'
check "T06b Invalid range endAt==startAt" 400 "POST endAt equals startAt" '.error.code=="VALIDATION_ERROR"'
call POST /bookings '{"equipmentId":"eq-1","borrowerName":"X","startAt":"not-a-date","endAt":"2026-10-21T09:00:00.000Z","purpose":"p"}'
check "T06c Invalid date string" 400 "POST startAt=not-a-date" '.error.code=="VALIDATION_ERROR"'
call POST /bookings '{"equipmentId":"eq-1","startAt":"2026-10-21T09:00:00.000Z","endAt":"2026-10-21T10:00:00.000Z","purpose":"p"}'
check "T06d Missing borrowerName" 400 "POST without borrowerName" '.error.code=="VALIDATION_ERROR"'
call POST /bookings '{"equipmentId":"eq-1","borrowerName":"   ","startAt":"2026-10-21T09:00:00.000Z","endAt":"2026-10-21T10:00:00.000Z","purpose":"p"}'
check "T06e Whitespace-only borrowerName" 400 "POST borrowerName=3 spaces" '.error.code=="VALIDATION_ERROR"'
call POST /bookings '{"equipmentId":"eq-1","borrowerName":123,"startAt":"2026-10-21T09:00:00.000Z","endAt":"2026-10-21T10:00:00.000Z","purpose":"p"}'
check "T06f Non-string borrowerName" 400 "POST borrowerName=123" '.error.code=="VALIDATION_ERROR"'
LONG=$(printf 'a%.0s' $(seq 1 101))
call POST /bookings '{"equipmentId":"eq-1","borrowerName":"'"$LONG"'","startAt":"2026-10-21T09:00:00.000Z","endAt":"2026-10-21T10:00:00.000Z","purpose":"p"}'
check "T06g Over-long borrowerName (101)" 400 "POST borrowerName length 101" '.error.code=="VALIDATION_ERROR"'
call POST /bookings '{"equipmentId":"eq-1","borrowerName":"X","startAt":"2026-10-21T09:00:00","endAt":"2026-10-21T10:00:00Z","purpose":"p"}'
check "T06h Timestamp without timezone rejected" 400 "POST startAt=2026-10-21T09:00:00 (no Z)" '.error.code=="VALIDATION_ERROR"'
call POST /bookings '{"equipmentId":"eq-1","borrowerName":"X","startAt":"Oct 20 2026 9:00","endAt":"2026-10-21T10:00:00Z","purpose":"p"}'
check "T06i Non-ISO date format rejected" 400 "POST startAt='Oct 20 2026 9:00'" '.error.code=="VALIDATION_ERROR"'
call POST /bookings '{"equipmentId":"eq-1","borrowerName":"X","startAt":"2026-02-31T09:00:00Z","endAt":"2026-03-01T10:00:00Z","purpose":"p"}'
check "T06j Impossible calendar date (Feb 31) rejected" 400 "POST startAt=2026-02-31T09:00:00Z" '.error.code=="VALIDATION_ERROR"'
call POST /bookings '{"equipmentId":"eq-3","borrowerName":"Tz","startAt":"2026-09-10T16:00:00+07:00","endAt":"2026-09-10T18:00:00+07:00","purpose":"offset normalised"}'
check "T06k Offset timestamp normalised to UTC" 201 "POST startAt=2026-09-10T16:00:00+07:00" '.data.startAt=="2026-09-10T09:00:00.000Z"'

call GET /bookings/bk-does-not-exist ""
check "T07 Booking not found" 404 "GET /bookings/bk-does-not-exist" '.success==false and .error.code=="NOT_FOUND"'

call POST /bookings '{"equipmentId":"eq-999","borrowerName":"X","startAt":"2026-10-22T09:00:00.000Z","endAt":"2026-10-22T10:00:00.000Z","purpose":"p"}'
check "T08 Equipment not found" 404 "POST equipmentId=eq-999" '.error.code=="EQUIPMENT_NOT_FOUND"'

call POST /bookings '{"equipmentId":"eq-1","borrowerName":"Overlap","startAt":"2026-10-20T10:00:00.000Z","endAt":"2026-10-20T12:00:00.000Z","purpose":"overlaps A"}'
check "T09a Overlap at the end of A" 409 "POST eq-1 10:00-12:00 vs A 09:00-11:00" '.error.code=="BOOKING_CONFLICT"'
call POST /bookings '{"equipmentId":"eq-1","borrowerName":"Inside","startAt":"2026-10-20T09:30:00.000Z","endAt":"2026-10-20T10:00:00.000Z","purpose":"inside A"}'
check "T09b New fully inside A" 409 "POST eq-1 09:30-10:00" '.error.code=="BOOKING_CONFLICT"'
call POST /bookings '{"equipmentId":"eq-1","borrowerName":"Wrap","startAt":"2026-10-20T08:00:00.000Z","endAt":"2026-10-20T12:00:00.000Z","purpose":"wraps A"}'
check "T09c New fully wraps A" 409 "POST eq-1 08:00-12:00" '.error.code=="BOOKING_CONFLICT"'
call POST /bookings '{"equipmentId":"eq-2","borrowerName":"Other","startAt":"2026-10-20T09:00:00.000Z","endAt":"2026-10-20T11:00:00.000Z","purpose":"different equipment"}'
check "T09d Same time, different equipment allowed" 201 "POST eq-2 09:00-11:00" ""

call POST /bookings '{"equipmentId":"eq-1","borrowerName":"B2B","startAt":"2026-10-20T11:00:00.000Z","endAt":"2026-10-20T13:00:00.000Z","purpose":"back to back"}'
check "T11a Back-to-back (11:00-13:00 after 09:00-11:00)" 201 "POST eq-1 11:00-13:00" ""
B_ID=$(id_of)
call POST /bookings '{"equipmentId":"eq-1","borrowerName":"Off by a minute","startAt":"2026-10-20T13:00:00.000Z","endAt":"2026-10-20T14:00:00.000Z","purpose":"x"}'
call POST /bookings '{"equipmentId":"eq-1","borrowerName":"One minute early","startAt":"2026-10-20T10:59:00.000Z","endAt":"2026-10-20T13:00:00.000Z","purpose":"x"}'
check "T11b 10:59 start overlaps A by one minute" 409 "POST eq-1 10:59-13:00" '.error.code=="BOOKING_CONFLICT"'

# Update conflict: B (11:00-13:00) -> A's time
call PATCH "/bookings/$B_ID" '{"startAt":"2026-10-20T09:00:00.000Z","endAt":"2026-10-20T11:00:00.000Z"}'
check "T10a PATCH B into A's slot" 409 "PATCH /bookings/$B_ID into 09:00-11:00" '.error.code=="BOOKING_CONFLICT"'
call PATCH "/bookings/$B_ID" '{"endAt":"2026-10-20T10:00:00.000Z"}'
check "T10a2 PATCH only endAt (merged range)" 400 "PATCH B endAt=10:00 (start stays 11:00)" '.error.code=="VALIDATION_ERROR"'
call PATCH "/bookings/$B_ID" '{"startAt":"2026-10-20T10:00:00.000Z"}'
check "T10a3 PATCH only startAt into overlap" 409 "PATCH B startAt=10:00 (end stays 13:00)" '.error.code=="BOOKING_CONFLICT"'
call PATCH "/bookings/$B_ID" '{"startAt":"2026-10-20T14:00:00.000Z","endAt":"2026-10-20T15:00:00.000Z"}'
check "T10b PATCH B to free slot" 200 "PATCH B to 14:00-15:00" '.data.startAt=="2026-10-20T14:00:00.000Z"'
call PATCH "/bookings/$B_ID" '{"startAt":"2026-10-20T14:00:00.000Z","endAt":"2026-10-20T15:00:00.000Z"}'
check "T10c PATCH to own current slot (no self-conflict)" 200 "PATCH B to the same 14:00-15:00" ""
call PATCH "/bookings/$B_ID" '{"equipmentId":"eq-2","startAt":"2026-10-20T09:30:00.000Z","endAt":"2026-10-20T10:30:00.000Z"}'
check "T10d PATCH moving equipment into a clash" 409 "PATCH B to eq-2 09:30-10:30 (eq-2 booked 09:00-11:00)" '.error.code=="BOOKING_CONFLICT"'
call PATCH "/bookings/$B_ID" '{"equipmentId":"eq-999"}'
check "T10e PATCH to nonexistent equipment" 404 "PATCH B equipmentId=eq-999" '.error.code=="EQUIPMENT_NOT_FOUND"'
call PATCH "/bookings/bk-nope" '{"purpose":"x"}'
check "T10f PATCH nonexistent booking" 404 "PATCH /bookings/bk-nope" '.error.code=="NOT_FOUND"'
call PATCH "/bookings/$B_ID" '{}'
check "T10g PATCH empty body" 400 "PATCH B {}" '.error.code=="VALIDATION_ERROR"'
call PATCH "/bookings/$B_ID" '{"borrowerName":""}'
check "T10h PATCH invalid field" 400 "PATCH B borrowerName=''" '.error.code=="VALIDATION_ERROR"'

# SQL injection (safe payloads, no destructive SQL)
BEFORE=$(curl -s "$API/bookings" | jq '.data|length')
call POST /bookings '{"equipmentId":"eq-1","borrowerName":"'"'"' OR 1=1 --","startAt":"2026-12-01T09:00:00.000Z","endAt":"2026-12-01T10:00:00.000Z","purpose":"x'"'"'; DROP TABLE bookings; --"}'
check "T12a SQLi payload stored as plain text" 201 "POST borrowerName=\"' OR 1=1 --\", purpose contains DROP TABLE" '.data.borrowerName=="'"'"' OR 1=1 --"'
call GET "/bookings/%27%20OR%201%3D1%20--" ""
check "T12b SQLi in path id returns nothing" 404 "GET /bookings/' OR 1=1 --" '.error.code=="NOT_FOUND"'
call POST /bookings '{"equipmentId":"eq-1'"'"' OR '"'"'1'"'"'='"'"'1","borrowerName":"x","startAt":"2026-12-02T09:00:00.000Z","endAt":"2026-12-02T10:00:00.000Z","purpose":"x"}'
check "T12c SQLi in equipmentId is just an unknown id" 404 "POST equipmentId=\"eq-1' OR '1'='1\"" '.error.code=="EQUIPMENT_NOT_FOUND"'
AFTER=$(curl -s "$API/bookings" | jq '.data|length')
N=$((N+1)); if [ "$AFTER" = "$((BEFORE+1))" ]; then PASS=$((PASS+1)); R=PASS; else FAIL=$((FAIL+1)); R=FAIL; fi
printf -- '----\nTest:     T12d Table intact, exactly one row added by T12a\nRequest:  GET /bookings count before/after\nExpected: %s -> %s\nActual:   %s -> %s\nResult:   %s\n\n' "$BEFORE" "$((BEFORE+1))" "$BEFORE" "$AFTER" "$R" | tee -a "$OUT"

# Malformed input / routing
call POST /bookings '{"equipmentId": ' 
check "T13a Malformed JSON" 400 "POST truncated JSON" '.success==false and .error.code=="INVALID_JSON"'
call GET /nonexistent ""
check "T13b Unknown route returns JSON 404" 404 "GET /api/nonexistent" '.error.code=="NOT_FOUND"'

# Equipment
call GET /equipment ""
check "T14 List equipment" 200 "GET /equipment" '.success==true and (.data|length)>=2 and (.data[0]|has("id","name","location"))'

# CORS
H=$(curl -s -i -X OPTIONS "$API/bookings" -H "Origin: http://localhost:3000" -H "Access-Control-Request-Method: PATCH" -H "Access-Control-Request-Headers: content-type")
CODE=$(echo "$H" | head -1 | awk '{print $2}')
N=$((N+1)); if [[ "$CODE" =~ ^(200|204)$ ]] && echo "$H" | grep -qi '^access-control-allow-origin: http://localhost:3000' && echo "$H" | grep -qi '^access-control-allow-methods:.*PATCH'; then PASS=$((PASS+1)); R=PASS; else FAIL=$((FAIL+1)); R=FAIL; fi
printf -- '----\nTest:     T15a CORS preflight, allowed origin\nRequest:  OPTIONS /bookings Origin: http://localhost:3000 (PATCH)\nExpected: 2xx + allow-origin echoes origin + allow-methods has PATCH\nActual:   %s\n%s\nResult:   %s\n\n' "$CODE" "$(echo "$H" | grep -i '^access-control' )" "$R" | tee -a "$OUT"
H=$(curl -s -i -X OPTIONS "$API/bookings" -H "Origin: null" -H "Access-Control-Request-Method: POST")
N=$((N+1)); if echo "$H" | grep -qi '^access-control-allow-origin: null'; then PASS=$((PASS+1)); R=PASS; else FAIL=$((FAIL+1)); R=FAIL; fi
printf -- '----\nTest:     T15c CORS preflight, file:// tester (Origin: null) is allowed in dev\nRequest:  OPTIONS /bookings Origin: null\nExpected: Access-Control-Allow-Origin: null\nActual:   %s\nResult:   %s\n\n' "$(echo "$H" | grep -i '^access-control-allow-origin' || echo '(header absent)')" "$R" | tee -a "$OUT"
H=$(curl -s -i -X OPTIONS "$API/bookings" -H "Origin: https://evil.example" -H "Access-Control-Request-Method: POST")
N=$((N+1)); if echo "$H" | grep -qi '^access-control-allow-origin:'; then FAIL=$((FAIL+1)); R=FAIL; else PASS=$((PASS+1)); R=PASS; fi
printf -- '----\nTest:     T15b CORS preflight, disallowed origin gets no allow-origin header\nRequest:  OPTIONS /bookings Origin: https://evil.example\nExpected: no Access-Control-Allow-Origin header\nActual:   %s\nResult:   %s\n\n' "$(echo "$H" | grep -i '^access-control-allow-origin' || echo '(header absent)')" "$R" | tee -a "$OUT"

# Database constraints (bypass the API, talk to D1 directly)
dbfail() { # name sql expected-substring
  local out; out=$(npx wrangler d1 execute campuslend-db --local --command "$2" 2>&1)
  N=$((N+1)); local R=FAIL
  if echo "$out" | grep -qi "$3"; then R=PASS; PASS=$((PASS+1)); else FAIL=$((FAIL+1)); fi
  printf -- '----\nTest:     %s\nRequest:  wrangler d1 execute: %s\nExpected: rejected, error mentions "%s"\nActual:   %s\nResult:   %s\n\n' "$1" "$2" "$3" "$(echo "$out" | sed -r "s/\x1B\[[0-9;]*[mK]//g" | grep -iE "error|constraint" | head -2 | tr "\n" " ")" "$R" | tee -a "$OUT"
}
dbfail "T16a FOREIGN KEY rejects unknown equipment" "INSERT INTO bookings (id,equipment_id,borrower_name,start_at,end_at,purpose) VALUES ('x1','eq-NOPE','n','2026-01-01T09:00:00.000Z','2026-01-01T10:00:00.000Z','p')" "FOREIGN KEY"
dbfail "T16b CHECK rejects end_at <= start_at" "INSERT INTO bookings (id,equipment_id,borrower_name,start_at,end_at,purpose) VALUES ('x2','eq-1','n','2026-01-01T10:00:00.000Z','2026-01-01T09:00:00.000Z','p')" "CHECK"
dbfail "T16c NOT NULL rejects NULL purpose" "INSERT INTO bookings (id,equipment_id,borrower_name,start_at,end_at,purpose) VALUES ('x3','eq-1','n','2026-01-01T09:00:00.000Z','2026-01-01T10:00:00.000Z',NULL)" "NOT NULL"
dbfail "T16d UNIQUE rejects duplicate equipment name" "INSERT INTO equipment (id,name,location) VALUES ('eq-9','Projector A','Somewhere')" "UNIQUE"
dbfail "T16e DB-level overlap guard rejects clash" "INSERT INTO bookings (id,equipment_id,borrower_name,start_at,end_at,purpose) VALUES ('x4','eq-1','n','2026-10-20T10:00:00.000Z','2026-10-20T10:30:00.000Z','p')" "overlap"

echo "================ SUMMARY: $PASS passed, $FAIL failed, $N total ================" | tee -a "$OUT"
[ "$FAIL" = 0 ]
