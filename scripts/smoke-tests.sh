#!/usr/bin/env bash
set -euo pipefail

APP_URL="${APP_URL:-https://adamaitiss.github.io/2026-tracker/app/}"

check_url() {
  local url="$1"
  local label="$2"
  local status
  status=$(curl -s -o /dev/null -w "%{http_code}" "$url")
  if [[ "$status" != "200" ]]; then
    echo "FAIL: $label ($url) -> HTTP $status"
    exit 1
  fi
  echo "OK: $label"
}

check_contains() {
  local url="$1"
  local needle="$2"
  local label="$3"
  if ! curl -s "$url" | tr -d '\r' | grep -q "$needle"; then
    echo "FAIL: $label (missing '$needle')"
    exit 1
  fi
  echo "OK: $label"
}

check_url "$APP_URL" "PWA index"
check_contains "$APP_URL" "<title>2026 Tracker</title>" "Index title"
check_url "${APP_URL}app.js" "app.js"
check_url "${APP_URL}styles.css" "styles.css"
check_url "${APP_URL}manifest.json" "manifest.json"
check_url "${APP_URL}sw.js" "service worker"
check_url "${APP_URL}icon.svg" "icon"

if [[ -n "${BACKEND_URL:-}" && -n "${API_TOKEN:-}" ]]; then
  CONFIG_URL="${BACKEND_URL%/}/v1/config?token=${API_TOKEN}"
  response=$(curl -s -H "Authorization: Bearer ${API_TOKEN}" "$CONFIG_URL")
  if echo "$response" | tr -d '\r' | grep -q '"status":"ok"'; then
    echo "OK: backend /v1/config"
  else
    echo "FAIL: backend /v1/config"
    echo "$response"
    exit 1
  fi
else
  echo "SKIP: backend /v1/config (set BACKEND_URL and API_TOKEN to enable)"
fi

echo "All smoke tests passed."
