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
# Bind children to loopback only — shell proxy is the public surface.
export FORM_FORGE_HOST="${FORM_FORGE_HOST:-127.0.0.1}"
export FORM_FORGE_PORT="${FORM_FORGE_PORT:-8787}"
export PROPERTY_ANALYZER_HOST="${PROPERTY_ANALYZER_HOST:-127.0.0.1}"
export PROPERTY_ANALYZER_PORT="${PROPERTY_ANALYZER_PORT:-3456}"
export FORGE_BOOT_LOG="${FORGE_BOOT_LOG:-/tmp/forge-boot.log}"
export FORGE_EXTERNAL_BOOT=1
export PYTHONUNBUFFERED=1
export PDA_DATA_ROOT="${PDA_DATA_ROOT:-/app/pda-data}"
# Filter saved lists live on the same durable volume as Analyze session data.
# Never store user lists only inside the container filesystem — redeploys wipe that.
export FILTER_LISTS_ROOT="${FILTER_LISTS_ROOT:-${PDA_DATA_ROOT}/filter-lists}"
export LEADS_CATALOG_ROOT="${LEADS_CATALOG_ROOT:-${PDA_DATA_ROOT}/leads-catalog}"
export FORM_FORGE_DATA_ROOT="${FORM_FORGE_DATA_ROOT:-${PDA_DATA_ROOT}/form-forge}"
export FORM_FORGE_USER_FILLED_ROOT="${FORM_FORGE_USER_FILLED_ROOT:-${PDA_DATA_ROOT}/form-forge-user-filled}"
mkdir -p "${PDA_DATA_ROOT}" "${FILTER_LISTS_ROOT}" "${LEADS_CATALOG_ROOT}/contracts" \
  "${FORM_FORGE_DATA_ROOT}" "${FORM_FORGE_USER_FILLED_ROOT}"
echo "[entrypoint] Filter lists root: ${FILTER_LISTS_ROOT}"
echo "[entrypoint] Leads catalog root: ${LEADS_CATALOG_ROOT}"
echo "[entrypoint] Form Forge data root: ${FORM_FORGE_DATA_ROOT}"

# Persist Form Forge runtime data on the Railway volume via symlink.
# Seed from the image copy only when the volume side is empty.
FORGE_PKG_DATA="/app/modules/form-forge/data"
FORGE_PKG_FILLED="/app/modules/form-forge/forms/user-filled"
if [ -d "${FORGE_PKG_DATA}" ] && [ ! -L "${FORGE_PKG_DATA}" ]; then
  if [ -z "$(ls -A "${FORM_FORGE_DATA_ROOT}" 2>/dev/null || true)" ]; then
    echo "[entrypoint] Seeding Form Forge data onto volume"
    cp -a "${FORGE_PKG_DATA}/." "${FORM_FORGE_DATA_ROOT}/"
  fi
  rm -rf "${FORGE_PKG_DATA}"
  ln -sfn "${FORM_FORGE_DATA_ROOT}" "${FORGE_PKG_DATA}"
  echo "[entrypoint] Linked ${FORGE_PKG_DATA} -> ${FORM_FORGE_DATA_ROOT}"
fi
mkdir -p "/app/modules/form-forge/forms"
if [ -d "${FORGE_PKG_FILLED}" ] && [ ! -L "${FORGE_PKG_FILLED}" ]; then
  if [ -z "$(ls -A "${FORM_FORGE_USER_FILLED_ROOT}" 2>/dev/null || true)" ]; then
    echo "[entrypoint] Seeding Form Forge user-filled onto volume"
    cp -a "${FORGE_PKG_FILLED}/." "${FORM_FORGE_USER_FILLED_ROOT}/" 2>/dev/null || true
  fi
  rm -rf "${FORGE_PKG_FILLED}"
  ln -sfn "${FORM_FORGE_USER_FILLED_ROOT}" "${FORGE_PKG_FILLED}"
  echo "[entrypoint] Linked ${FORGE_PKG_FILLED} -> ${FORM_FORGE_USER_FILLED_ROOT}"
elif [ ! -e "${FORGE_PKG_FILLED}" ]; then
  ln -sfn "${FORM_FORGE_USER_FILLED_ROOT}" "${FORGE_PKG_FILLED}"
  echo "[entrypoint] Linked ${FORGE_PKG_FILLED} -> ${FORM_FORGE_USER_FILLED_ROOT}"
fi

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
export PHUGLEE_PORT="${PUBLIC_PORT}"
# Legacy alias — config still accepts DISTRESS_OS_PORT during rename transition.
export DISTRESS_OS_PORT="${PUBLIC_PORT}"
echo "[entrypoint] Starting Phuglee on ${PHUGLEE_HOST:-${DISTRESS_OS_HOST:-0.0.0.0}}:${PUBLIC_PORT}"
exec node server.js