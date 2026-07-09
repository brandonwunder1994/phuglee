#!/bin/sh
set -eu

cd /app

export NODE_ENV="${NODE_ENV:-production}"
# Default: login required. Override with PHUGLEE_AUTH_DISABLED=1 only for open staging/dev.
export PHUGLEE_AUTH_DISABLED="${PHUGLEE_AUTH_DISABLED:-0}"
export FORM_FORGE_HOST="${FORM_FORGE_HOST:-0.0.0.0}"
export FORM_FORGE_PORT="${FORM_FORGE_PORT:-8787}"
export PROPERTY_ANALYZER_HOST="${PROPERTY_ANALYZER_HOST:-0.0.0.0}"
export PROPERTY_ANALYZER_PORT="${PROPERTY_ANALYZER_PORT:-3456}"
export FORGE_BOOT_LOG="${FORGE_BOOT_LOG:-/tmp/forge-boot.log}"
export FORGE_EXTERNAL_BOOT=1
export PYTHONUNBUFFERED=1
export PDA_DATA_ROOT="${PDA_DATA_ROOT:-/app/pda-data}"
mkdir -p "${PDA_DATA_ROOT}"

SEED_SESSION="/app/scripts/seed-data/distressAnalyzerSession_LATEST.json"
LIVE_SESSION="${PDA_DATA_ROOT}/distressAnalyzerSession_LATEST.json"
if [ -f "${SEED_SESSION}" ]; then
  SEED_BYTES="$(wc -c < "${SEED_SESSION}")"
  LIVE_BYTES=0
  if [ -f "${LIVE_SESSION}" ]; then
    LIVE_BYTES="$(wc -c < "${LIVE_SESSION}")"
  fi
  # Seed when volume is empty or only has a stub session from a prior boot.
  if [ ! -f "${LIVE_SESSION}" ] || [ "${LIVE_BYTES}" -lt "${SEED_BYTES}" ]; then
    echo "[entrypoint] Seeding Property Analyzer session (${SEED_BYTES} bytes; live=${LIVE_BYTES})"
    cp "${SEED_SESSION}" "${LIVE_SESSION}"
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