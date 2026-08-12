#!/bin/bash
# همگام‌سازی وضعیت تحویل پیامک (سند پنل ادمین §۴).
# sms.ir وب‌هوک ندارد؛ وضعیت باید هر چند دقیقه پرسیده شود.
#
# در crontab:
#   */10 * * * * /opt/gheseyar-admin/deploy/sms-sync.sh >> /var/log/gy-sms.log 2>&1
set -euo pipefail
set -a; . /opt/gheseyar-admin/.env; set +a
: "${CRON_SECRET:?CRON_SECRET در فایل .env تعریف نشده است}"

echo "── $(date '+%F %T') ──"
docker compose -f /opt/gheseyar-admin/docker-compose.yml exec -T \
  -e CRON_SECRET="$CRON_SECRET" admin node -e '
    fetch("http://127.0.0.1:3000/api/sms-sync", {
      method: "POST",
      headers: { "x-cron-secret": process.env.CRON_SECRET, "content-type": "application/json" },
    })
      .then((r) => r.text())
      .then((t) => console.log(t))
      .catch((e) => { console.error(String(e)); process.exit(1); });
  '
