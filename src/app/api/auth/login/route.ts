import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, adminLoginLog, adminOtpCodes, adminUsers } from '@/db';
import { checkPassword, requestMeta } from '@/lib/admin-auth';
import { arcaptchaEnabled, verifyCaptcha } from '@/lib/arcaptcha';
import { sendOtp } from '@/lib/sms';
import { logSms } from '@/lib/sms-log';
import { normalizePhone } from '@/lib/fa';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;
const CAPTCHA_AFTER = 2;
const OTP_TTL_SECONDS = 120;

/** سند §۱: پیام خطا همیشه یکسان، هرگز مشخص نکن کدام‌یک اشتباه است. */
const SAME_ERROR = 'نام کاربری یا رمز عبور نادرست است.';

const adminTemplate = () =>
  Number(process.env.SMSIR_ADMIN_TEMPLATE_ID) || Number(process.env.SMSIR_TEMPLATE_ID) || undefined;

/** اطلاع به سوپرادمین وقتی حسابی قفل می‌شود — یک پیامک ساده کافی است. */
async function notifyLock(username: string) {
  const to = normalizePhone(process.env.SUPERADMIN_MOBILE ?? '');
  if (!to) return;
  const res = await sendOtp(to, username.slice(0, 10), {
    templateId: adminTemplate(),
    purpose: 'admin_alert',
  });
  await logSms(to, 'admin_alert', adminTemplate(), res);
}

export async function POST(req: Request) {
  const { username, password, captcha } = await req.json().catch(() => ({}));
  const u = String(username ?? '').trim().toLowerCase();
  const p = String(password ?? '');
  const meta = await requestMeta();

  const deny = (extra: Record<string, unknown> = {}) =>
    NextResponse.json({ error: SAME_ERROR, ...extra }, { status: 401 });

  if (!u || !p) return deny();

  const [admin] = await db.select().from(adminUsers).where(eq(adminUsers.username, u));

  // بعد از دو تلاش ناموفق، کپچا لازم می‌شود (سند §۱ و §۵)
  const needCaptcha = arcaptchaEnabled() && (admin?.failedAttempts ?? 0) >= CAPTCHA_AFTER;
  if (needCaptcha && !(await verifyCaptcha(String(captcha ?? '')))) {
    return NextResponse.json({ error: 'کپچا تأیید نشد.', captcha: true }, { status: 401 });
  }

  const fail = async () => {
    await db.insert(adminLoginLog).values({
      adminUserId: admin?.id ?? null, username: u,
      ip: meta.ip, userAgent: meta.userAgent, success: false,
    });
    if (admin) {
      const n = admin.failedAttempts + 1;
      const locked = n >= MAX_ATTEMPTS;
      await db
        .update(adminUsers)
        .set({
          failedAttempts: locked ? 0 : n,
          lockedUntil: locked ? new Date(Date.now() + LOCK_MINUTES * 60_000) : admin.lockedUntil,
        })
        .where(eq(adminUsers.id, admin.id));
      if (locked) await notifyLock(admin.username);
    }
    // وضعیت کپچا برای دفعهٔ بعد اعلام می‌شود، ولی دلیل خطا هرگز
    const next = (admin?.failedAttempts ?? 0) + 1;
    return deny({ captcha: arcaptchaEnabled() && next >= CAPTCHA_AFTER });
  };

  if (!admin || !admin.isActive) return fail();

  if (admin.lockedUntil && new Date(admin.lockedUntil) > new Date()) {
    const mins = Math.ceil((new Date(admin.lockedUntil).getTime() - Date.now()) / 60_000);
    return NextResponse.json(
      { error: `حساب موقتاً قفل است. ${mins} دقیقهٔ دیگر دوباره تلاش کنید.`, locked: true },
      { status: 423 }
    );
  }

  if (!(await checkPassword(p, admin.passwordHash))) return fail();

  /* مرحلهٔ دوم: کد پیامکی به موبایل ثبت‌شدهٔ ادمین */
  const code = String(Math.floor(100000 + Math.random() * 900000));
  await db.delete(adminOtpCodes).where(eq(adminOtpCodes.adminUserId, admin.id));
  await db.insert(adminOtpCodes).values({
    adminUserId: admin.id,
    code,
    expiresAt: new Date(Date.now() + OTP_TTL_SECONDS * 1000),
  });

  const res = await sendOtp(admin.mobile, code, {
    templateId: adminTemplate(),
    purpose: 'admin_2fa',
  });
  await logSms(admin.mobile, 'admin_2fa', adminTemplate(), res);

  if (!res.ok) {
    return NextResponse.json(
      { error: 'ارسال کد دومرحله‌ای انجام نشد. با سوپرادمین تماس بگیرید.' },
      { status: 503 }
    );
  }

  await db.update(adminUsers).set({ failedAttempts: 0 }).where(eq(adminUsers.id, admin.id));

  const masked = admin.mobile.replace(/^(\d{4})\d{4}(\d{3})$/, '$1••••$2');
  const devCode = res.simulated && process.env.NODE_ENV !== 'production' ? code : undefined;
  return NextResponse.json({ stage: 'otp', username: u, mobile: masked, devCode });
}
