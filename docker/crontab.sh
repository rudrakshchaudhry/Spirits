#!/bin/sh
# Replaces Vercel Cron when self-hosting with docker compose (same schedules as vercel.json, UTC).
set -eu
: "${CRON_SECRET:?CRON_SECRET must be set}"
APP="${APP_URL:-http://app:3000}"
hit() { echo "curl -fsS -m 300 -H 'Authorization: Bearer ${CRON_SECRET}' ${APP}$1 >/proc/1/fd/1 2>&1"; }
{
  echo "0 * * * * $(hit /api/cron/refresh-311)"
  echo "30 13 * * * $(hit /api/cron/new-business)"
  echo "5 13 * * * $(hit /api/cron/featured)"
  echo "5 14 * * * $(hit /api/cron/featured)"
} > /etc/crontabs/root
echo "cron: scheduled refresh-311 (hourly), new-business, featured → ${APP}"
exec crond -f -l 8
