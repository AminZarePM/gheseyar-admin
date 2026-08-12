/*
 * ⚠️ این فایل آینهٔ نسخهٔ موجود در مخزن gheseyar است.
 *
 * دو مخزن روی یک دیتابیس کار می‌کنند. مالک اسکیما و مهاجرت‌ها مخزن اپ
 * (gheseyar/deploy/sql) است؛ اینجا فقط تعریف تایپی برای خواندن و نوشتن
 * نگه داشته می‌شود. هر تغییری در آن مخزن باید اینجا هم اعمال شود.
 */
/**
 * درگاه پرداخت زرین‌پال — فقط REST مربوط به Payment Gateway.
 *
 * Broker API (GraphQL) برای عملیات پنل است و به client_id از پشتیبانی نیاز
 * دارد؛ برای فروش لازم نیست و پیاده نشده.
 *
 * همهٔ مبالغ در این فایل به تومان‌اند (currency: IRT)، چون بسته‌های محصول
 * هم به تومان تعریف شده‌اند و تبدیل واحد بیشترین جای اشتباه است.
 */

const LIVE = 'https://payment.zarinpal.com/pg/v4/payment/';
const SANDBOX = 'https://sandbox.zarinpal.com/pg/v4/payment/';
const LIVE_START = 'https://payment.zarinpal.com/pg/StartPay/';
const SANDBOX_START = 'https://sandbox.zarinpal.com/pg/StartPay/';

export const isSandbox = () => process.env.ZARINPAL_SANDBOX === '1';
const base = () => (isSandbox() ? SANDBOX : LIVE);
export const startPayUrl = (authority: string) =>
  (isSandbox() ? SANDBOX_START : LIVE_START) + authority;

export const gatewayEnabled = () => !!process.env.ZARINPAL_MERCHANT_ID;

const merchant = () => {
  const id = process.env.ZARINPAL_MERCHANT_ID;
  if (!id) throw new Error('ZARINPAL_MERCHANT_ID تعریف نشده است.');
  return id;
};

/** پیام فارسی برای کدهای خطای زرین‌پال. کد ۱۰۰ موفق و ۱۰۱ «قبلاً تأیید شده» است. */
const MESSAGES: Record<number, string> = {
  [-9]:  'اطلاعات درخواست ناقص یا نامعتبر است.',
  [-10]: 'درگاه معتبر نیست — شناسهٔ پذیرنده یا IP را بررسی کنید.',
  [-11]: 'درگاه فعال نیست — با پشتیبانی زرین‌پال تماس بگیرید.',
  [-12]: 'تلاش بیش از حد. کمی بعد دوباره امتحان کنید.',
  [-13]: 'سقف درگاه پر شده — مدارک احراز هویت را تکمیل کنید.',
  [-14]: 'دامنهٔ آدرس بازگشت با دامنهٔ ثبت‌شدهٔ درگاه یکی نیست.',
  [-15]: 'حساب پذیرنده معلق است.',
  [-16]: 'سطح حساب پذیرنده کافی نیست.',
  [-17]: 'محدودیت سطح حساب پذیرنده.',
  [-18]: 'آدرس ارجاع‌دهنده با دامنهٔ ثبت‌شده یکی نیست.',
  [-19]: 'تراکنش‌های این پذیرنده مسدود شده است.',
  [-40]: 'پارامترهای اضافی نامعتبرند.',
  [-41]: 'حداکثر مبلغ مجاز ۱۰۰٬۰۰۰٬۰۰۰ تومان است.',
  [-50]: 'مبلغ تأیید با مبلغ پرداخت یکی نیست.',
  [-51]: 'این پرداخت ناموفق بوده است.',
  [-52]: 'خطای پیش‌بینی‌نشده در زرین‌پال.',
  [-53]: 'این تراکنش متعلق به این پذیرنده نیست.',
  [-54]: 'شناسهٔ تراکنش نامعتبر است.',
  [-55]: 'درخواست پرداخت دستی پیدا نشد.',
  [-60]: 'این تراکنش قابل برگشت نیست.',
  [-61]: 'تراکنش در وضعیت موفق نیست یا قبلاً برگشت خورده.',
  [-62]: 'برای برگشت وجه، IP درگاه باید در پنل ثبت شود.',
  [-63]: 'مهلت ۳۰ دقیقه‌ای برگشت وجه تمام شده است.',
};

export const zpMessage = (code: number, fallback?: string) =>
  MESSAGES[code] ?? fallback ?? `خطای زرین‌پال (کد ${code})`;

interface ZpEnvelope<T> {
  data: T | [] | null;
  errors: { code?: number; message?: string } | Array<{ code?: number; message?: string }> | [];
}

async function call<T>(path: string, body: Record<string, unknown>): Promise<
  { ok: true; data: T } | { ok: false; code: number; message: string }
> {
  let res: Response;
  try {
    res = await fetch(base() + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ merchant_id: merchant(), ...body }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch (e) {
    console.error('[zarinpal] ارتباط برقرار نشد:', e);
    return { ok: false, code: 0, message: 'ارتباط با درگاه پرداخت برقرار نشد.' };
  }

  const env = (await res.json().catch(() => null)) as ZpEnvelope<T> | null;
  if (!env) {
    console.error('[zarinpal] پاسخ نامفهوم — HTTP', res.status);
    return { ok: false, code: 0, message: 'پاسخ درگاه پرداخت خوانده نشد.' };
  }

  const data = env.data as (T & { code?: number; message?: string }) | [] | null;
  if (data && !Array.isArray(data) && typeof data.code === 'number') {
    // ۱۰۰ موفق، ۱۰۱ یعنی قبلاً تأیید شده — هر دو حالت موفق‌اند
    if (data.code === 100 || data.code === 101) return { ok: true, data: data as T };
    console.error('[zarinpal] خطا — code', data.code, data.message);
    return { ok: false, code: data.code, message: zpMessage(data.code, data.message) };
  }

  const err = Array.isArray(env.errors) ? env.errors[0] : env.errors;
  const code = typeof err?.code === 'number' ? err.code : 0;
  console.error('[zarinpal] خطا —', JSON.stringify(env.errors));
  return { ok: false, code, message: zpMessage(code, err?.message) };
}

/* ── ساخت پرداخت ───────────────────────────────────────── */
export interface CreatePayment {
  /** به تومان */
  amount: number;
  description: string;
  callbackUrl: string;
  /** شمارهٔ خریدار — زرین‌پال کارت‌های قبلی همین شماره را پیشنهاد می‌دهد */
  mobile?: string;
  orderId?: string;
}

export function createPayment(p: CreatePayment) {
  return call<{ code: number; message: string; authority: string; fee_type: string; fee: number }>(
    'request.json',
    {
      amount: p.amount,
      currency: 'IRT',
      description: p.description.slice(0, 500),
      callback_url: p.callbackUrl,
      metadata: {
        ...(p.mobile ? { mobile: p.mobile } : {}),
        ...(p.orderId ? { order_id: p.orderId } : {}),
      },
    }
  );
}

/* ── تأیید پرداخت ──────────────────────────────────────── */
export function verifyPayment(authority: string, amount: number) {
  return call<{
    code: number; message: string; ref_id: number;
    card_pan?: string; card_hash?: string; fee_type?: string; fee?: number;
  }>('verify.json', { amount, currency: 'IRT', authority });
}

/* ── استعلام وضعیت (هرگز جای تأیید را نمی‌گیرد) ────────── */
export function inquirePayment(authority: string) {
  return call<{ status: string; code: number; message: string }>('inquiry.json', { authority });
}

/* ── تراکنش‌های موفقِ تأییدنشده (حداکثر ۱۰۰ مورد آخر) ──── */
export function unverifiedPayments() {
  return call<{
    code: number;
    authorities: Array<{ authority: string; amount: number; callback_url: string; referer: string; date: string }>;
  }>('unVerified.json', {});
}
