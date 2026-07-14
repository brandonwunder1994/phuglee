#!/bin/sh
set -eu

cd /app

export NODE_ENV="${NODE_ENV:-production}"
# Production requires login unless PHUGLEE_AUTH_OPEN=1 (explicit temporary open access).
if [ "${NODE_ENV}" = "production" ] && [ "${PHUGLEE_AUTH_OPEN:-0}" != "1" ] && [ "${PHUGLEE_AUTH_OPEN:-0}" != "true" ]; then
  export PHUGLEE_AUTH_DISABLED=0
  echo "[entrypoint] Auth required (login enabled). Set PHUGLEE_AUTH_OPEN=1 only for open staging."
else
  export PHUGLEE_AUTH_DISABLED="${PHUGLEE_AUTH_DISABLED:-0}"
fi
export FORM_FORGE_HOST="${FORM_FORGE_HOST:-0.0.0.0}"
export FORM_FORGE_PORT="${FORM_FORGE_PORT:-8787}"
export PROPERTY_ANALYZER_HOST="${PROPERTY_ANALYZER_HOST:-0.0.0.0}"
export PROPERTY_ANALYZER_PORT="${PROPERTY_ANALYZER_PORT:-3456}"
export FORGE_BOOT_LOG="${FORGE_BOOT_LOG:-/tmp/forge-boot.log}"
export FORGE_EXTERNAL_BOOT=1
export PYTHONUNBUFFERED=1
export PDA_DATA_ROOT="${PDA_DATA_ROOT:-/app/pda-data}"
# Filter saved lists live on the same durable volume as Analyze session data.
# Never store user lists only inside the container filesystem — redeploys wipe that.
export FILTER_LISTS_ROOT="${FILTER_LISTS_ROOT:-${PDA_DATA_ROOT}/filter-lists}"
export LEADS_CATALOG_ROOT="${LEADS_CATALOG_ROOT:-${PDA_DATA_ROOT}/leads-catalog}"
mkdir -p "${PDA_DATA_ROOT}" "${FILTER_LISTS_ROOT}" "${LEADS_CATALOG_ROOT}/contracts"
echo "[entrypoint] Filter lists root: ${FILTER_LISTS_ROOT}"
echo "[entrypoint] Leads catalog root: ${LEADS_CATALOG_ROOT}"

SEED_SESSION="/app/scripts/seed-data/distressAnalyzerSession_LATEST.json"
LIVE_SESSION="${PDA_DATA_ROOT}/distressAnalyzerSession_LATEST.json"
# Only seed empty/stub volumes. NEVER overwrite a real session just because the
# seed dump is larger (city purges intentionally shrink the live file).
STUB_MAX_BYTES=4096
if [ -f "${SEED_SESSION}" ]; then
  LIVE_BYTES=0
  if [ -f "${LIVE_SESSION}" ]; then
    LIVE_BYTES="$(wc -c < "${LIVE_SESSION}")"
  fi
  if [ ! -f "${LIVE_SESSION}" ] || [ "${LIVE_BYTES}" -lt "${STUB_MAX_BYTES}" ]; then
    SEED_BYTES="$(wc -c < "${SEED_SESSION}")"
    echo "[entrypoint] Seeding Property Analyzer session (seed=${SEED_BYTES} bytes; live=${LIVE_BYTES})"
    cp "${SEED_SESSION}" "${LIVE_SESSION}"
  else
    echo "[entrypoint] Keeping live Analyze session (${LIVE_BYTES} bytes) — not overwriting with seed"
  fi
fi

# Save Railway's public port for the shell proxy; child modules use their own ports.
PUBLIC_PORT="${PORT:-3000}"

echo "[entrypoint] Starting Form Forge on ${FORM_FORGE_HOST}:${FORM_FORGE_PORT}"
env -u PORT /usr/bin/python3 -u scripts/start-form-forge.py >>"${FORGE_BOOT_LOG}" 2>&1 &
FORGE_PID=$!
echo "[entrypoint] Form Forge pid=${FORGE_PID}"

echo "[entrypoint] Starting Property Analyzer on ${PROPERTY_ANALYZER_HOST}:${PROPERTY_ANALYZER_PORT}"
cd modules/property-analyzer
env -u PORT node server.js >>/tmp/analyzer-boot.log 2>&1 &
ANALYZER_PID=$!
cd /app
echo "[entrypoint] Property Analyzer pid=${ANALYZER_PID}"

# Give modules a moment to bind before the shell proxy accepts traffic.
sleep 2

export PORT="${PUBLIC_PORT}"
export DISTRESS_OS_PORT="${PUBLIC_PORT}"
echo "[entrypoint] Starting Distress OS on ${DISTRESS_OS_HOST:-0.0.0.0}:${PUBLIC_PORT}"
exec node server.js