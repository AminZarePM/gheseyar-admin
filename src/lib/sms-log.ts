import { eq } from 'drizzle-orm';
import { db, smsLog } from '@/db';
import type { SmsPurpose, SmsResult } from '@/lib/sms';

/**
 * ثبت هر پیامک در sms_log.
 *
 * sms.ir در REST عمومی وب‌هوک وضعیت تحویل ندارد؛ وضعیت باید poll شود.
 * پس اینجا فقط لحظهٔ ارسال ثبت می‌شود و job همگام‌سازی بعداً
 * delivery_state_code را پر می‌کند.
 */
export async function logSms(
  mobile: string,
  purpose: SmsPurpose,
  templateId: number | undefined,
  res: SmsResult
) {
  try {
    await db.insert(smsLog).values({
      messageId: res.ok ? res.messageId ?? null : null,
      recipientMobile: mobile,
      templateId: templateId ?? null,
      purpose,
      status: res.ok ? (res.simulated ? 'queued' : 'sent') : 'failed',
      cost: res.ok && typeof res.cost === 'number' ? Math.round(res.cost) : null,
      error: res.ok ? null : res.detail,
    });
  } catch (e) {
    // ثبت لاگ هرگز نباید جلوی ارسال پیامک را بگیرد
    console.error('[sms-log] ثبت نشد:', e);
  }
}

/** به‌روزرسانی وضعیت تحویل از پاسخ sms.ir */
export async function updateSmsDelivery(messageId: string, state: number) {
  const map: Record<number, string> = {
    1: 'delivered', 2: 'failed', 3: 'sent', 4: 'failed',
    5: 'sent', 6: 'failed', 7: 'blacklisted',
  };
  await db
    .update(smsLog)
    .set({ deliveryStateCode: state, status: map[state] ?? 'sent', updatedAt: new Date() })
    .where(eq(smsLog.messageId, messageId));
}
