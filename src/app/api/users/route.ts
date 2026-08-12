import { NextResponse } from 'next/server';
import { and, desc, eq, ilike, isNotNull, isNull, or, sql } from 'drizzle-orm';
import { db, children, creditLedger, journeys, purchaseRequests, userLoginLog, users } from '@/db';
import { audit, requireAdmin } from '@/lib/admin-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * فهرست والدین با جست‌وجو و سگمنت‌های آماده (§۳.۱ و §۳.۶).
 *
 * سگمنت‌ها عمداً در کد تعریف شده‌اند، نه در جدول `saved_segments` با ستون
 * `filter_sql`. ذخیرهٔ SQL خام و اجرای آن یعنی باز گذاشتن راه تزریق —
 * چهار سگمنت سند هم ثابت‌اند و به ساختن جدول نیاز ندارند.
 */
export async function GET(req: Request) {
  if (!(await requireAdmin('users.view')))
    return NextResponse.json({ error: 'unauthorized' }, { status: 403 });

  const url = new URL(req.url);
  const q = (url.searchParams.get('q') ?? '').trim();
  const segment = url.searchParams.get('segment') ?? '';
  const id = url.searchParams.get('id');

  /* ── جزئیات یک والد ── */
  if (id) {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    if (!user) return NextResponse.json({ error: 'پیدا نشد.' }, { status: 404 });

    const [kids, orders, logins, ledger, paths] = await Promise.all([
      db.select().from(children).where(eq(children.userId, id)),
      db.select().from(purchaseRequests).where(eq(purchaseRequests.userId, id)).orderBy(desc(purchaseRequests.createdAt)),
      db.select().from(userLoginLog).where(eq(userLoginLog.userId, id)).orderBy(desc(userLoginLog.createdAt)).limit(20),
      db.select().from(creditLedger).where(eq(creditLedger.userId, id)).orderBy(desc(creditLedger.createdAt)).limit(30),
      db.select().from(journeys).where(eq(journeys.userId, id)),
    ]);

    return NextResponse.json({ user, children: kids, orders, logins, ledger, journeys: paths });
  }

  /* ── فهرست ── */
  const filters = [];
  if (q) {
    filters.push(or(ilike(users.name, `%${q}%`), ilike(users.phone, `%${q}%`)));
  }
  if (segment === 'suspended') filters.push(isNotNull(users.suspendedAt));
  if (segment === 'no_credit') filters.push(sql`${users.credits} <= 0`);
  if (segment === 'expired') filters.push(
    and(isNotNull(users.creditsExpireAt), sql`${users.creditsExpireAt} < now()`)
  );
  if (segment === 'active') filters.push(and(isNull(users.suspendedAt), sql`${users.credits} > 0`));

  const rows = await db
    .select({
      id: users.id, phone: users.phone, name: users.name,
      credits: users.credits, creditsExpireAt: users.creditsExpireAt,
      createdAt: users.createdAt, lastSeenAt: users.lastSeenAt, suspendedAt: users.suspendedAt,
      childCount: sql<number>`(select count(*)::int from children c where c.user_id = ${users.id})`,
      orderCount: sql<number>`(select count(*)::int from purchase_requests o where o.user_id = ${users.id} and o.status in ('paid','active'))`,
    })
    .from(users)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(users.lastSeenAt))
    .limit(100);

  return NextResponse.json({ users: rows });
}

/** تعلیق یا فعال‌سازی حساب والد — اقدام حساس، دلیل اجباری */
export async function PATCH(req: Request) {
  const admin = await requireAdmin('users.suspend');
  if (!admin) return NextResponse.json({ error: 'unauthorized' }, { status: 403 });

  const { id, suspend, reason } = await req.json().catch(() => ({}));
  const why = String(reason ?? '').trim();
  if (!id) return NextResponse.json({ error: 'ورودی نامعتبر است.' }, { status: 400 });
  if (why.length < 3) return NextResponse.json({ error: 'نوشتن دلیل الزامی است.' }, { status: 400 });

  await db
    .update(users)
    .set({ suspendedAt: suspend ? new Date() : null })
    .where(eq(users.id, id));

  await audit(admin.aid, suspend ? 'user_suspend' : 'user_activate', 'user', String(id), why);
  return NextResponse.json({ ok: true });
}
