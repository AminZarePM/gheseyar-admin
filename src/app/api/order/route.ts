import { NextResponse } from 'next/server';
import { eq, sql } from 'drizzle-orm';
import { db, creditLedger, purchaseRequests, supportMessages, users } from '@/db';
import { audit, requireAdmin } from '@/lib/admin-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * فعال کردن یا لغو یک سفارش.
 *
 * «فعال شد» علاوه بر تغییر وضعیت، اعتبار را هم به حساب همان شماره اضافه
 * می‌کند و یک ردیف در دفتر اعتبار و یک ردیف ممیزی می‌سازد. طبق §۲ سند،
 * `reason` اجباری است — بدون آن رسیدگی به شکایت مالی ممکن نیست.
 */
export async function PATCH(req: Request) {
  const admin = await requireAdmin('orders.update');
  if (!admin) return NextResponse.json({ error: 'unauthorized' }, { status: 403 });

  const { id, status, months, reason } = await req.json().catch(() => ({}));
  const why = String(reason ?? '').trim();

  if (!id || !['pending', 'active', 'cancelled'].includes(status))
    return NextResponse.json({ error: 'ورودی نامعتبر است.' }, { status: 400 });
  if (why.length < 3)
    return NextResponse.json({ error: 'نوشتن دلیل الزامی است.' }, { status: 400 });

  const [order] = await db.select().from(purchaseRequests).where(eq(purchaseRequests.id, id));
  if (!order) return NextResponse.json({ error: 'سفارش پیدا نشد.' }, { status: 404 });

  // اعتبار فقط یک بار داده می‌شود، حتی اگر دکمه دوباره زده شود
  if (status === 'active' && order.status !== 'active' && order.status !== 'paid') {
    const m = Number(months) > 0 ? Number(months) : 3;
    const [u] = await db.select().from(users).where(eq(users.phone, order.phone));
    if (!u) {
      return NextResponse.json(
        { error: 'کاربری با این شماره ثبت نشده. اول باید در اپ شماره‌اش را تأیید کند.' },
        { status: 409 }
      );
    }
    const [after] = await db
      .update(users)
      .set({
        credits: sql`${users.credits} + ${order.stories}`,
        creditsExpireAt: sql`greatest(coalesce(${users.creditsExpireAt}, now()), now() + (${m} || ' months')::interval)`,
      })
      .where(eq(users.id, u.id))
      .returning({ credits: users.credits });

    await db.insert(creditLedger).values({
      userId: u.id,
      delta: order.stories,
      balanceAfter: after?.credits ?? 0,
      source: 'admin_adjust',
      orderId: order.id,
      adminUserId: admin.aid,
      reason: why,
    });
  }

  const [row] = await db
    .update(purchaseRequests)
    .set({ status, handled: status !== 'pending' })
    .where(eq(purchaseRequests.id, id))
    .returning();

  await audit(admin.aid, `order_${status}`, 'order', id, why, {
    phone: order.phone,
    stories: order.stories,
    price: order.price,
  });

  return NextResponse.json({ order: row });
}

/** بستن یک پیام پشتیبانی */
export async function POST(req: Request) {
  const admin = await requireAdmin('tickets.update');
  if (!admin) return NextResponse.json({ error: 'unauthorized' }, { status: 403 });

  const { supportId } = await req.json().catch(() => ({}));
  if (!supportId) return NextResponse.json({ error: 'ورودی نامعتبر است.' }, { status: 400 });

  await db.update(supportMessages).set({ handled: true }).where(eq(supportMessages.id, supportId));
  await audit(admin.aid, 'ticket_close', 'ticket', String(supportId), 'رسیدگی شد');
  return NextResponse.json({ ok: true });
}
