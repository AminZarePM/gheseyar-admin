/**
 * ارسال کد یک‌بارمصرف با سامانهٔ پیامک SMS.ir.
 *
 * کلید و شناسهٔ قالب فقط از متغیرهای محیطی خوانده می‌شوند و هرگز هاردکد نمی‌شوند.
 * اگر کلید تنظیم نشده باشد، پیامکی ارسال نمی‌شود و کد فقط در لاگ سرور چاپ می‌گردد
 * تا تست پیش از آماده شدن قالب ممکن بماند.
 */

/**
 * جدول کدهای وضعیت SMS.ir.
 * `kind` تعیین می‌کند رابط چه بگوید:
 *   config  → اشکال از پیکربندی ماست؛ کاربر کاری نمی‌تواند بکند
 *   input   → شماره‌ای که کاربر داد ایراد دارد
 *   busy    → موقتی است؛ کمی بعد دوباره
 */
const STATUS: Record<number, { kind: 'config' | 'input' | 'busy'; fa: string }> = {
  0:   { kind: 'busy',   fa: 'سامانهٔ پیامک خطا داد.' },
  10:  { kind: 'config', fa: 'کلید وب‌سرویس نامعتبر است.' },
  11:  { kind: 'config', fa: 'کلید وب‌سرویس غیرفعال است.' },
  12:  { kind: 'config', fa: 'کلید فقط برای IPهای تعریف‌شده مجاز است — IP سرور را در پنل اضافه کنید.' },
  13:  { kind: 'config', fa: 'حساب کاربری پنل غیرفعال است.' },
  14:  { kind: 'config', fa: 'حساب کاربری پنل در حالت تعلیق است.' },
  20:  { kind: 'busy',   fa: 'تعداد درخواست به سامانهٔ پیامک بیش از حد مجاز شد.' },
  101: { kind: 'config', fa: 'شماره خط ارسالی نامعتبر است.' },
  102: { kind: 'config', fa: 'اعتبار پنل پیامک کافی نیست.' },
  104: { kind: 'input',  fa: 'این شمارهٔ موبایل از نظر سامانهٔ پیامک نادرست است.' },
  113: { kind: 'config', fa: 'قالب پیامک یافت نشد — شناسهٔ قالب یا تأیید آن را بررسی کنید.' },
};

export type SmsResult =
  | { ok: true; simulated: boolean; messageId?: string; cost?: number }
  | { ok: false; kind: 'config' | 'input' | 'busy' | 'network'; detail: string; status?: number };

/** هدف پیامک — در sms_log ثبت می‌شود (سند پنل ادمین §۴) */
export type SmsPurpose =
  | 'otp' | 'admin_2fa' | 'payment_receipt'
  | 'renewal_reminder' | 'promo' | 'win_back' | 'admin_alert';

export interface SendOptions {
  /** اگر داده نشود، قالب پیش‌فرض ورود کاربر استفاده می‌شود */
  templateId?: number;
  purpose?: SmsPurpose;
  /** نام پارامتر داخل قالب، بدون # ابتدا و انتها */
  paramName?: string;
}

export async function sendOtp(
  mobile: string,
  code: string,
  opts: SendOptions = {}
): Promise<SmsResult> {
  const key = process.env.SMSIR_API_KEY;
  const templateId = opts.templateId ?? Number(process.env.SMSIR_TEMPLATE_ID);
  const paramName = opts.paramName ?? 'Code';

  if (!key || !templateId) {
    console.warn(`[sms] کلید یا قالب تنظیم نشده — کد ${code} برای ${mobile} ارسال نشد.`);
    return { ok: true, simulated: true };
  }

  let r: Response;
  try {
    r = await fetch('https://api.sms.ir/v1/send/verify', {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        mobile,
        templateId,
        parameters: [{ name: paramName, value: code }],
      }),
      // اگر سامانه کند بود، درخواست کاربر نباید تا ابد معلق بماند
      signal: AbortSignal.timeout(12_000),
    });
  } catch (e) {
    console.error('[sms] ارتباط با api.sms.ir برقرار نشد:', e);
    return { ok: false, kind: 'network', detail: 'ارتباط با سرویس پیامک برقرار نشد.' };
  }

  const body = (await r.json().catch(() => null)) as
    | { status?: number; message?: string; data?: { messageId?: number; cost?: number } }
    | null;

  if (body?.status === 1) {
    return {
      ok: true,
      simulated: false,
      messageId: body.data?.messageId != null ? String(body.data.messageId) : undefined,
      cost: body.data?.cost,
    };
  }

  const status = body?.status;
  const known = typeof status === 'number' ? STATUS[status] : undefined;

  // HTTP 401 یعنی احراز هویت، 429 یعنی محدودیت نرخ سمت سامانه
  const kind = known?.kind ?? (r.status === 401 ? 'config' : r.status === 429 ? 'busy' : 'busy');
  const detail = known?.fa ?? body?.message ?? `پاسخ ناشناخته (HTTP ${r.status})`;

  console.error(`[sms] ناموفق — HTTP ${r.status} · status ${status} · ${detail}`);
  return { ok: false, kind, detail, status };
}
