import { NextResponse } from 'next/server';
import { and, gt, inArray, isNotNull } from 'drizzle-orm';
import { db, smsLog } from '@/db';
import { requireAdmin } from '@/lib/admin-auth';
import { updateSmsDelivery } from '@/lib/sms-log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * همگام‌سازی وضعیت تحویل پیامک.
 *
 * sms.ir در REST عمومی وب‌هوک push ندارد؛ وضعیت باید poll شود. این مسیر
 * رکوردهای queued/sent تازه‌تر از ۲۴ ساعت را می‌گیرد و از
 * GET /v1/send/{messageId} وضعیتشان را می‌پرسد.
 *
 * از cron با x-cron-secret هم قابل صدا زدن است.
 */
async function authorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get('x-cron-secret') === secret) return true;
  return !!(await requireAdmin('sms.view'));
}

export async function POST(req: Request) {
  if (!(await authorized(req)))
    return NextResponse.json({ error: 'unauthorized' }, { status: 403 });

  const key = process.env.SMSIR_API_KEY;
  if (!key) return NextResponse.json({ error: 'کلید پیامک تنظیم نشده.' }, { status: 503 });

  const rows = await db
    .select()
    .from(smsLog)
    .where(
      and(
        inArray(smsLog.status, ['queued', 'sent']),
        isNotNull(smsLog.messageId),
        gt(smsLog.createdAt, new Date(Date.now() - 86_400_000))
      )
    )
    .limit(100);

  let updated = 0;
  for (const row of rows) {
    if (!row.messageId) continue;
    try {
      const r = await fetch(`https://api.sms.ir/v1/send/${row.messageId}`, {
        headers: { 'x-api-key': key, Accept: 'application/json' },
        signal: AbortSignal.timeout(10_000),
      });
      const b = (await r.json().catch(() => null)) as
        | { status?: number; data?: { deliveryState?: number | null } }
        | null;
      const state = b?.data?.deliveryState;
      if (b?.status === 1 && typeof state === 'number') {
        await updateSmsDelivery(row.messageId, state);
        updated++;
      }
    } catch {
      // یک پیام ناموفق نباید کل job را متوقف کند
    }
  }

  return NextResponse.json({ checked: rows.length, updated });
}
