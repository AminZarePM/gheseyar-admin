/*
 * ⚠️ این فایل آینهٔ نسخهٔ موجود در مخزن gheseyar است.
 *
 * دو مخزن روی یک دیتابیس کار می‌کنند. مالک اسکیما و مهاجرت‌ها مخزن اپ
 * (gheseyar/deploy/sql) است؛ اینجا فقط تعریف تایپی برای خواندن و نوشتن
 * نگه داشته می‌شود. هر تغییری در آن مخزن باید اینجا هم اعمال شود.
 */
const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

/** عدد لاتین به فارسی */
export const fa = (n: number | string) => String(n).replace(/\d/g, (d) => FA_DIGITS[+d]);

/** عدد فارسی به لاتین */
export const en = (s: string) => s.replace(/[۰-۹]/g, (d) => String(FA_DIGITS.indexOf(d)));

/**
 * اعتبارسنجی و یکسان‌سازی شمارهٔ موبایل ایران.
 *
 * ورودی‌های پذیرفته‌شده: ۰۹۱۲…، ۹۱۲…، ۹۸۹۱۲…، +۹۸۹۱۲…، با یا بدون فاصله و خط تیره،
 * و با ارقام فارسی. خروجی همیشه یازده رقم با پیشوند ۰۹ است.
 *
 * پیش‌شمارهٔ ۰۹۵ تا ۰۹۸ به هیچ اپراتوری تخصیص نیافته و سامانهٔ پیامک با کد ۱۰۴
 * ردش می‌کند. همان‌جا در فرم رد می‌شود تا یک درخواست بی‌هوده خرج نشود.
 */
export function normalizePhone(input: string): string | null {
  let raw = en(input).replace(/\D/g, '');

  if (raw.startsWith('0098')) raw = raw.slice(4);
  else if (raw.startsWith('98') && raw.length === 12) raw = raw.slice(2);

  if (/^9\d{9}$/.test(raw)) raw = '0' + raw;
  if (!/^09\d{9}$/.test(raw)) return null;

  // ۰۹۰ تا ۰۹۴ و ۰۹۹ تخصیص یافته‌اند؛ ۰۹۵ تا ۰۹۸ نه.
  if (/^09[5-8]/.test(raw)) return null;

  return raw;
}
