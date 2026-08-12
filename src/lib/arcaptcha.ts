/**
 * ARCaptcha — کپچای ایرانی (سند §۵).
 *
 * reCAPTCHA گوگل برای کاربران ایرانی قابل اتکا نیست، پس در فرم ورود ادمین
 * از این استفاده می‌شود. طبق سند فقط بعد از دو تلاش ناموفق نمایش داده می‌شود.
 */
export const arcaptchaSiteKey = () => process.env.ARCAPTCHA_SITE_KEY ?? '';
export const arcaptchaEnabled = () =>
  !!process.env.ARCAPTCHA_SITE_KEY && !!process.env.ARCAPTCHA_SECRET_KEY;

export async function verifyCaptcha(challengeId: string): Promise<boolean> {
  if (!arcaptchaEnabled()) return true; // پیکربندی نشده — جلوی ورود را نمی‌گیریم
  if (!challengeId) return false;

  try {
    const r = await fetch('https://api.arcaptcha.co/arcaptcha/api/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        challenge_id: challengeId,
        site_key: process.env.ARCAPTCHA_SITE_KEY,
        secret_key: process.env.ARCAPTCHA_SECRET_KEY,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const b = (await r.json().catch(() => null)) as { success?: boolean } | null;
    return b?.success === true;
  } catch (e) {
    console.error('[arcaptcha] بررسی انجام نشد:', e);
    return false;
  }
}
