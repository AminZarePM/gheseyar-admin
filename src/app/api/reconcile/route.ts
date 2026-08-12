import { NextResponse } from 'next/server';
import { and, eq, ne } from 'drizzle-orm';
import { db, purchaseRequests } from '@/db';
import { audit, requireAdmin } from '@/lib/admin-auth';
import { gatewayEnabled, unverifiedPayments, verifyPayment } from '@/lib/zarinpal';
import { grantCredits } from '@/lib/credits-server';
import { PACKAGES } from '@/features/credits/packages';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * تطبیق تراکنش‌های «موفق ولی تأییدنشده».
 *
 * چرا لازم است: اگر خریدار پس از پرداخت مرورگر را ببندد یا اینترنتش قطع شود،
 * هرگز به callback برنمی‌گردد. پول از حسابش کم شده ولی اعتباری نگرفته. زرین‌پال
 * چنین تراکنش‌هایی را در unVerified نگه می‌دارد و اگر در مهلت تأیید نشوند،
 * خودکار به خریدار برمی‌گردند — یعنی فروش از دست می‌رود.
 *
 * دو راه صدا زدن:
 *   • از پنل مدیریت با نشست مدیر
 *   • از cron با هدر x-cron-secret برابر CRON_SECRET
 */
async function authorized(req: Request): Promise<boolean> {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get('x-cron-secret') === secret) return true;
  return !!(await requireAdmin('orders.update'));
}

export async function POST(req: Request) {
  if (!(await authorized(req)))
    return NextResponse.json({ error: 'unauthorized' }, { status: 403 });

  if (!gatewayEnabled())
    return NextResponse.json({ error: 'درگاه پرداخت فعال نیست.' }, { status: 503 });

  const list = await unverifiedPayments();
  if (!list.ok) return NextResponse.json({ error: list.message }, { status: 502 });

  const found = list.data.authorities ?? [];
  const report = { found: found.length, settled: 0, skipped: 0, failed: 0, details: [] as string[] };

  for (const item of found) {
    const [order] = await db
      .select()
      .from(purchaseRequests)
      .where(eq(purchaseRequests.authority, item.authority));

    if (!order) {
      report.skipped++;
      report.details.push(`${item.authority}: در سامانهٔ ما نیست`);
      continue;
    }
    if (order.status === 'paid') { report.skipped++; continue; }

    // مبلغ از رکورد خودمان، نه از پاسخ زرین‌پال
    const res = await verifyPayment(item.authority, order.price);
    if (!res.ok) {
      report.failed++;
      report.details.push(`${order.ref ?? item.authority}: ${res.message}`);
      await db
        .update(purchaseRequests)
        .set({ gatewayError: `${res.code}: ${res.message}` })
        .where(eq(purchaseRequests.id, order.id));
      continue;
    }

    const claimed = await db
      .update(purchaseRequests)
      .set({
        status: 'paid',
        handled: true,
        refId: String(res.data.ref_id ?? ''),
        cardPan: res.data.card_pan ?? null,
        fee: typeof res.data.fee === 'number' ? res.data.fee : null,
        feeType: res.data.fee_type ?? null,
        paidAt: new Date(),
        gatewayError: null,
      })
      .where(and(eq(purchaseRequests.id, order.id), ne(purchaseRequests.status, 'paid')))
      .returning();

    if (claimed.length > 0 && order.userId) {
      const months = PACKAGES.find((p) => p.id === order.packageId)?.months ?? 3;
      await grantCredits(order.userId, order.stories, months);
      report.settled++;
      report.details.push(`${order.ref ?? item.authority}: ${order.stories} قصه به ${order.phone} داده شد`);
    } else {
      report.skipped++;
    }
  }

  if (report.settled > 0 || report.failed > 0) {
    console.log('[zarinpal] تطبیق:', JSON.stringify(report));
  }
  return NextResponse.json(report);
}
