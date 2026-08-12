import { NextResponse } from 'next/server';
import { eq, sql } from 'drizzle-orm';
import { db, creditLedger, users } from '@/db';
import { audit, requireAdmin } from '@/lib/admin-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * اصلاح دستی اعتبار (§۲ — دسترسی FINANCE).
 *
 * هر تغییر یک ردیف در دفتر اعتبار و یک ردیف ممیزی می‌سازد. موجودی هرگز
 * منفی نمی‌شود، وگرنه یک اشتباه تایپی می‌تواند حساب والد را خراب کند.
 */
export async function POST(req: Request) {
  const admin = await requireAdmin('credit.adjust');
  if (!admin) return NextResponse.json({ error: 'unauthorized' }, { status: 403 });

  const { userId, delta, reason } = await req.json().catch(() => ({}));
  const n = Number(delta);
  const why = String(reason ?? '').trim();

  if (!userId || !Number.isInteger(n) || n === 0 || Math.abs(n) > 500)
    return NextResponse.json({ error: 'مقدار اصلاح باید عددی بین ۱ تا ۵۰۰ باشد.' }, { status: 400 });
  if (why.length < 3)
    return NextResponse.json({ error: 'نوشتن دلیل الزامی است.' }, { status: 400 });

  const [after] = await db
    .update(users)
    .set({ credits: sql`greatest(0, ${users.credits} + ${n})` })
    .where(eq(users.id, userId))
    .returning({ credits: users.credits });

  if (!after) return NextResponse.json({ error: 'کاربر پیدا نشد.' }, { status: 404 });

  await db.insert(creditLedger).values({
    userId, delta: n, balanceAfter: after.credits,
    source: 'admin_adjust', adminUserId: admin.aid, reason: why,
  });
  await audit(admin.aid, 'credit_adjust', 'user', String(userId), why, { delta: n, balanceAfter: after.credits });

  return NextResponse.json({ credits: after.credits });
}
