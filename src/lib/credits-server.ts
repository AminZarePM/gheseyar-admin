/*
 * ⚠️ این فایل آینهٔ نسخهٔ موجود در مخزن gheseyar است.
 *
 * دو مخزن روی یک دیتابیس کار می‌کنند. مالک اسکیما و مهاجرت‌ها مخزن اپ
 * (gheseyar/deploy/sql) است؛ اینجا فقط تعریف تایپی برای خواندن و نوشتن
 * نگه داشته می‌شود. هر تغییری در آن مخزن باید اینجا هم اعمال شود.
 */
import { eq, sql } from 'drizzle-orm';
import { db, users } from '@/db';

/**
 * افزودن اعتبار به حساب کاربر.
 *
 * تاریخ انقضا از امروز به‌اضافهٔ ماه‌های بسته حساب می‌شود. اگر کاربر اعتبار
 * دارای انقضای دورتری داشته باشد، همان دورتر می‌ماند — وگرنه خرید تازه
 * می‌توانست مهلت خرید قبلی را کوتاه کند.
 */
export async function grantCredits(userId: string, stories: number, months: number) {
  await db
    .update(users)
    .set({
      credits: sql`${users.credits} + ${stories}`,
      creditsExpireAt: sql`greatest(
        coalesce(${users.creditsExpireAt}, now()),
        now() + (${months} || ' months')::interval
      )`,
    })
    .where(eq(users.id, userId));
}
