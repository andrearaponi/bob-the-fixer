#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_DIR="$(git -C "$ROOT_DIR" rev-parse --show-toplevel 2>/dev/null || true)"
BOB_ENV_FILE="${REPO_DIR}/.env"

# Load token from Bob's main .env if not already set
if [ -z "${SONAR_E2E_TOKEN:-}" ] && [ -f "$BOB_ENV_FILE" ]; then
  echo "Loading SONAR_TOKEN from $BOB_ENV_FILE"
  # shellcheck disable=SC1090
  source "$BOB_ENV_FILE"
  SONAR_E2E_TOKEN="${SONAR_TOKEN:-}"
fi

SONAR_URL="${SONAR_E2E_URL:-http://localhost:9000}"
SONAR_TOKEN="${SONAR_E2E_TOKEN:-}"

if [ -z "$SONAR_TOKEN" ]; then
  echo "ERROR: SONAR_E2E_TOKEN not set and could not load from $BOB_ENV_FILE" >&2
  echo "Either set SONAR_E2E_TOKEN or ensure Bob is installed (run install.sh)" >&2
  exit 1
fi

PROJECT_KEY="${SONAR_E2E_PROJECT_KEY:-demo-bob-e2e}"
PROJECT_NAME="${SONAR_E2E_PROJECT_NAME:-Demo Bob E2E}"

TEMPLATE_DIR="$ROOT_DIR/fixture-java-template"
WORK_DIR="$ROOT_DIR/.work/demo-bob-java"
ENV_FILE="$ROOT_DIR/.work/.env"
PATCH_FILE="$ROOT_DIR/patches/fix-deletePerson.patch"

wait_for_ce_task() {
  local work_dir="$1"
  local sonar_url="$2"
  local sonar_token="$3"

  local report_file="$work_dir/.scannerwork/report-task.txt"
  if [ ! -f "$report_file" ]; then
    echo "WARN: $report_file not found; skipping CE wait." >&2
    return 0
  fi

  local ce_task_url
  ce_task_url="$(grep -E '^ceTaskUrl=' "$report_file" | cut -d= -f2- || true)"
  if [ -z "$ce_task_url" ]; then
    local ce_task_id
    ce_task_id="$(grep -E '^ceTaskId=' "$report_file" | cut -d= -f2- || true)"
    if [ -n "$ce_task_id" ]; then
      ce_task_url="$sonar_url/api/ce/task?id=$ce_task_id"
    fi
  fi

  if [ -z "$ce_task_url" ]; then
    echo "WARN: could not read ceTaskUrl/ceTaskId from $report_file; skipping CE wait." >&2
    return 0
  fi

  echo "Waiting for SonarQube compute engine task..."
  for i in {1..120}; do
    local status
    status="$(curl -sS -u "$sonar_token:" "$ce_task_url" | node -e '
const fs = require("fs");
const data = JSON.parse(fs.readFileSync(0, "utf8"));
process.stdout.write(String(data.task && data.task.status ? data.task.status : ""));
')"

    if [ "$status" = "SUCCESS" ]; then
      echo "Compute engine task: SUCCESS"
      return 0
    fi

    if [ "$status" = "FAILED" ] || [ "$status" = "CANCELED" ]; then
      echo "Compute engine task: $status" >&2
      echo "CE task URL: $ce_task_url" >&2
      exit 1
    fi

    sleep 2
  done

  echo "Timeout waiting for compute engine task. CE task URL: $ce_task_url" >&2
  exit 1
}

mkdir -p "$ROOT_DIR/.work"
rm -rf "$WORK_DIR"
cp -R "$TEMPLATE_DIR" "$WORK_DIR"

echo "Waiting for SonarQube at $SONAR_URL ..."
for i in {1..60}; do
  if curl -fsS "$SONAR_URL/api/system/status" | grep -q '"status":"UP"'; then
    break
  fi
  sleep 2
done

if ! curl -fsS "$SONAR_URL/api/system/status" | grep -q '"status":"UP"'; then
  echo "SonarQube is not UP after waiting. Check docker logs." >&2
  exit 1
fi

echo "Ensuring project exists: $PROJECT_KEY"
project_create_body="$ROOT_DIR/.work/project-create.json"
project_create_code="$(
  curl -sS -u "$SONAR_TOKEN:" -X POST \
    "$SONAR_URL/api/projects/create" \
    -d "project=$PROJECT_KEY" \
    --data-urlencode "name=$PROJECT_NAME" \
    -o "$project_create_body" \
    -w "%{http_code}"
)"

if [ "$project_create_code" = "200" ]; then
  echo "Project created."
elif [ "$project_create_code" = "400" ]; then
  if grep -qi "already exists" "$project_create_body" 2>/dev/null; then
    echo "Project already exists, continuing."
  else
    echo "Failed to create project (HTTP 400). Response:" >&2
    cat "$project_create_body" >&2 || true
    exit 1
  fi
else
  echo "Failed to create project (HTTP $project_create_code). Response:" >&2
  cat "$project_create_body" >&2 || true
  exit 1
fi

cat > "$ENV_FILE" <<EOF
export SONAR_E2E=1
export SONAR_E2E_URL="$SONAR_URL"
export SONAR_E2E_PROJECT_KEY="$PROJECT_KEY"
export SONAR_E2E_TOKEN="$SONAR_TOKEN"
export SONAR_E2E_FIXTURE_DIR="$WORK_DIR"
EOF

echo "Running first analysis (expects OPEN issues)..."
(cd "$WORK_DIR" && mvn -B -q clean test sonar:sonar \
  -Dsonar.projectKey="$PROJECT_KEY" \
  -Dsonar.host.url="$SONAR_URL" \
  -Dsonar.token="$SONAR_TOKEN" \
  -Dsonar.coverage.jacoco.xmlReportPaths=target/site/jacoco/jacoco.xml \
  -Dsonar.scm.disabled=true \
)
wait_for_ce_task "$WORK_DIR" "$SONAR_URL" "$SONAR_TOKEN"

echo "Applying patch to create a FIXED issue on next scan..."
(cd "$ROOT_DIR" && git apply --unsafe-paths --directory=".work/demo-bob-java" patches/fix-deletePerson.patch)

echo "Running second analysis (expects 1 FIXED + 1 OPEN for java:S1854)..."
(cd "$WORK_DIR" && mvn -B -q clean test sonar:sonar \
  -Dsonar.projectKey="$PROJECT_KEY" \
  -Dsonar.host.url="$SONAR_URL" \
  -Dsonar.token="$SONAR_TOKEN" \
  -Dsonar.coverage.jacoco.xmlReportPaths=target/site/jacoco/jacoco.xml \
  -Dsonar.scm.disabled=true \
)
wait_for_ce_task "$WORK_DIR" "$SONAR_URL" "$SONAR_TOKEN"

echo "Bootstrap complete."
if [ -n "$REPO_DIR" ]; then
  echo "Run: source \"$ENV_FILE\" && cd \"$REPO_DIR/packages/core\" && npm test -- tests/e2e/sonar-contract/sonar-contract.test.ts"
else
  echo "Run: source \"$ENV_FILE\" && cd <repo-root>/packages/core && npm test -- tests/e2e/sonar-contract/sonar-contract.test.ts"
fi
