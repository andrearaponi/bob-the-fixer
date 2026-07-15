#!/usr/bin/env bash
#
# Live operational proof for the issue-mutation tools
# (Walden spec: issue-mutation-tools, task 3.2 — Verification Plan → Operational evidence).
#
# Scans a throwaway fixture to create a REAL issue + security hotspot on a running
# SonarQube, drives the three mutation tools through Bob's COMPILED handlers, and
# asserts via the web API that the state actually changed. This proves the feature
# end-to-end against a live server; it is local-only and intentionally NOT run in CI.
#
# Requirements:
#   - SonarQube reachable at $SONAR_URL (default http://localhost:9000) with admin:admin
#   - sonar-scanner on PATH
#   - packages/core built (npm run build)
#
set -euo pipefail

SONAR_URL="${SONAR_URL:-http://localhost:9000}"
ADMIN_AUTH="admin:admin"
PROJECT_KEY="bob-mutation-verify"
TOKEN_NAME="bob-mutation-verify"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST="$REPO_ROOT/packages/core/dist"
WORK="$(mktemp -d)"

log()  { printf '  %s\n' "$*"; }
fail() { printf 'FAIL: %s\n' "$*" >&2; exit 1; }

cleanup() {
  curl -s -u "$ADMIN_AUTH" -X POST "$SONAR_URL/api/projects/delete?project=$PROJECT_KEY" >/dev/null 2>&1 || true
  curl -s -u "$ADMIN_AUTH" -X POST "$SONAR_URL/api/user_tokens/revoke?name=$TOKEN_NAME"  >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT

# --- guards -----------------------------------------------------------------
[ -f "$DIST/mcp/handlers/transition-issue.handler.js" ] || fail "dist not built — run: npm run build"
command -v sonar-scanner >/dev/null 2>&1 || fail "sonar-scanner not on PATH"
curl -sf -u "$ADMIN_AUTH" "$SONAR_URL/api/system/status" >/dev/null || fail "SonarQube not reachable at $SONAR_URL with admin:admin"

# --- 1. token (idempotent) --------------------------------------------------
echo "== 1. token =="
curl -s -u "$ADMIN_AUTH" -X POST "$SONAR_URL/api/projects/delete?project=$PROJECT_KEY" >/dev/null 2>&1 || true
curl -s -u "$ADMIN_AUTH" -X POST "$SONAR_URL/api/user_tokens/revoke?name=$TOKEN_NAME"  >/dev/null 2>&1 || true
TOKEN="$(curl -s -u "$ADMIN_AUTH" -X POST "$SONAR_URL/api/user_tokens/generate?name=$TOKEN_NAME&type=USER_TOKEN" \
  | python3 -c 'import sys,json; print(json.load(sys.stdin)["token"])')"
[ -n "$TOKEN" ] || fail "could not generate a token"
log "token generated"

# --- 2. fixture (reliably raises S1481 issue + S2245 hotspot) ---------------
echo "== 2. fixture =="
cat > "$WORK/fixture.js" <<'EOF'
// Throwaway fixture: intentionally flagged code for mutation verification.
function insecureId() {
  return Math.random().toString(36); // S2245 hotspot: pseudorandom for security-sensitive use
}
function withUnused() {
  var neverUsed = 42; // S1481 code smell: unused local variable
  return insecureId();
}
module.exports = { withUnused };
EOF
cat > "$WORK/sonar-project.properties" <<EOF
sonar.projectKey=$PROJECT_KEY
sonar.projectName=Bob Mutation Verify
sonar.sources=.
sonar.sourceEncoding=UTF-8
EOF

# --- 3. scan ----------------------------------------------------------------
echo "== 3. scan =="
( cd "$WORK" && sonar-scanner -Dsonar.host.url="$SONAR_URL" -Dsonar.login="$TOKEN" >/dev/null 2>&1 ) \
  || fail "sonar-scanner run failed"
CE_ID="$(grep '^ceTaskId=' "$WORK/.scannerwork/report-task.txt" | cut -d= -f2-)"
[ -n "$CE_ID" ] || fail "no ceTaskId from the scanner"
log "ce task $CE_ID"

# --- 4. wait for analysis ---------------------------------------------------
echo "== 4. wait for analysis =="
ST="PENDING"
for _ in $(seq 1 60); do
  ST="$(curl -s -u "$ADMIN_AUTH" "$SONAR_URL/api/ce/task?id=$CE_ID" \
    | python3 -c 'import sys,json; print(json.load(sys.stdin)["task"]["status"])' 2>/dev/null || echo PENDING)"
  [ "$ST" = "SUCCESS" ] && break
  [ "$ST" = "FAILED" ] && fail "analysis failed"
  sleep 2
done
[ "$ST" = "SUCCESS" ] || fail "analysis did not complete in time"
log "analysis done"

# --- 5. get the real issue + hotspot keys -----------------------------------
echo "== 5. real keys =="
ISSUE="$(curl -s -u "$ADMIN_AUTH" "$SONAR_URL/api/issues/search?componentKeys=$PROJECT_KEY&ps=1" \
  | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d["issues"][0]["key"] if d.get("issues") else "")')"
HOTSPOT="$(curl -s -u "$ADMIN_AUTH" "$SONAR_URL/api/hotspots/search?projectKey=$PROJECT_KEY&ps=1" \
  | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d["hotspots"][0]["key"] if d.get("hotspots") else "")')"
[ -n "$ISSUE" ]   || fail "the scan produced no issue"
[ -n "$HOTSPOT" ] || fail "the scan produced no hotspot"
log "issue=$ISSUE hotspot=$HOTSPOT"

# --- 6. mutate through Bob's compiled handlers ------------------------------
echo "== 6. mutate through Bob's compiled handlers =="
cat > "$WORK/run.cjs" <<EOF
const { handleTransitionIssue }   = require('$DIST/mcp/handlers/transition-issue.handler.js');
const { handleCommentIssue }      = require('$DIST/mcp/handlers/comment-issue.handler.js');
const { handleChangeHotspotStatus } = require('$DIST/mcp/handlers/change-hotspot-status.handler.js');
const [issue, hotspot] = process.argv.slice(2);
(async () => {
  const steps = [
    ['transition', await handleTransitionIssue({ issue, transition: 'falsepositive', comment: 'verify: not exploitable (throwaway fixture)', confirm: true })],
    ['comment',    await handleCommentIssue({ issue, text: 'verify: second rationale line' })],
    ['hotspot',    await handleChangeHotspotStatus({ hotspot, status: 'REVIEWED', resolution: 'SAFE', comment: 'verify: safe by construction', confirm: true })],
  ];
  for (const [name, res] of steps) {
    const head = res.content[0].text.split(String.fromCharCode(10))[0];
    console.log('  [' + name + '] ' + head + (res.isError ? '  <ERROR>' : ''));
    if (res.isError) { console.error(res.content[0].text); process.exit(1); }
  }
})().catch((e) => { console.error('THREW:', e && e.message); process.exit(1); });
EOF
SONAR_URL="$SONAR_URL" SONAR_TOKEN="$TOKEN" node "$WORK/run.cjs" "$ISSUE" "$HOTSPOT" \
  || fail "a mutation handler returned an error"

# --- 7. verify the state actually changed -----------------------------------
echo "== 7. verify persisted state =="
curl -s -u "$ADMIN_AUTH" "$SONAR_URL/api/issues/search?issues=$ISSUE&additionalFields=comments&ps=1" \
  | python3 -c '
import sys, json
i = json.load(sys.stdin)["issues"][0]
comments = len(i.get("comments", []))
print("  issue:", i.get("resolution"), i.get("status"), "comments=" + str(comments))
ok = i.get("resolution") == "FALSE-POSITIVE" and i.get("status") == "RESOLVED" and comments >= 1
sys.exit(0 if ok else 1)
' || fail "issue verdict/comment did not persist"

curl -s -u "$ADMIN_AUTH" "$SONAR_URL/api/hotspots/search?projectKey=$PROJECT_KEY&status=REVIEWED&ps=1" \
  | python3 -c '
import sys, json
h = (json.load(sys.stdin).get("hotspots") or [{}])[0]
print("  hotspot:", h.get("status"), h.get("resolution"))
sys.exit(0 if h.get("status") == "REVIEWED" and h.get("resolution") == "SAFE" else 1)
' || fail "hotspot status did not persist"

echo "PASS: all three mutations persisted in SonarQube ($SONAR_URL)."
