#!/bin/bash
# تطبیق دوره‌ای پرداخت‌های «موفق ولی تأییدنشده».
#
# اگر خریداری پس از پرداخت مرورگر را ببندد یا اینترنتش قطع شود، هرگز به
# callback برنمی‌گردد: پول از حسابش کم شده ولی اعتباری نگرفته. زرین‌پال چنین
# تراکنش‌هایی را اگر در مهلت تأیید نشوند به خریدار برمی‌گرداند — یعنی هم فروش
# از دست می‌رود هم اعتماد. این اسکریپت آن‌ها را می‌گیرد و تسویه می‌کند.
#
# در crontab:
#   */30 * * * * /opt/gheseyar-admin/deploy/reconcile-payments.sh >> /var/log/gy-reconcile.log 2>&1
set -euo pipefail
set -a; . /opt/gheseyar-admin/.env; set +a
: "${CRON_SECRET:?CRON_SECRET در فایل .env تعریف نشده است}"

echo "── $(date '+%F %T') ──"

# از داخل خود کانتینر صدا زده می‌شود تا هیچ پورتی به بیرون باز نشود
docker compose -f /opt/gheseyar-admin/docker-compose.yml exec -T \
  -e CRON_SECRET="$CRON_SECRET" admin node -e '
    fetch("http://127.0.0.1:3000/api/reconcile", {
      method: "POST",
      headers: {
        "x-cron-secret": process.env.CRON_SECRET,
        "content-type": "application/json",
      },
    })
      .then((r) => r.text())
      .then((t) => console.log(t))
      .catch((e) => { console.error(String(e)); process.exit(1); });
  '
