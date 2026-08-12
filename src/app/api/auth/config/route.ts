import { NextResponse } from 'next/server';
import { arcaptchaSiteKey } from '@/lib/arcaptcha';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * تنظیمات عمومی صفحهٔ ورود.
 *
 * کلید عمومی کپچا از سرور خوانده می‌شود، نه از NEXT_PUBLIC — وگرنه هنگام
 * بیلد داخل Docker باید build-arg می‌دادیم و هر تغییر کلید یعنی بیلد دوباره.
 */
export async function GET() {
  return NextResponse.json({ siteKey: arcaptchaSiteKey() });
}
