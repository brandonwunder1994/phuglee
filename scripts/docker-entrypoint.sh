#!/bin/sh
set -eu

cd /app

export NODE_ENV="${NODE_ENV:-production}"
export FORM_FORGE_HOST="${FORM_FORGE_HOST:-0.0.0.0}"
export FORM_FORGE_PORT="${FORM_FORGE_PORT:-8787}"
export PROPERTY_ANALYZER_HOST="${PROPERTY_ANALYZER_HOST:-0.0.0.0}"
export PROPERTY_ANALYZER_PORT="${PROPERTY_ANALYZER_PORT:-3456}"
export FORGE_BOOT_LOG="${FORGE_BOOT_LOG:-/tmp/forge-boot.log}"
export FORGE_EXTERNAL_BOOT=1
export PYTHONUNBUFFERED=1

# Drop Railway public PORT so child modules never inherit it.
unset PORT || true

echo "[entrypoint] Starting Form Forge on ${FORM_FORGE_HOST}:${FORM_FORGE_PORT}"
/usr/bin/python3 -u scripts/start-form-forge.py >>"${FORGE_BOOT_LOG}" 2>&1 &
FORGE_PID=$!
echo "[entrypoint] Form Forge pid=${FORGE_PID}"

echo "[entrypoint] Starting Property Analyzer on ${PROPERTY_ANALYZER_HOST}:${PROPERTY_ANALYZER_PORT}"
cd modules/property-analyzer
node server.js >>/tmp/analyzer-boot.log 2>&1 &
ANALYZER_PID=$!
cd /app
echo "[entrypoint] Property Analyzer pid=${ANALYZER_PID}"

# Give modules a moment to bind before the shell proxy accepts traffic.
sleep 2

echo "[entrypoint] Starting Distress OS on ${DISTRESS_OS_HOST:-0.0.0.0}:${DISTRESS_OS_PORT:-3000}"
exec node server.js