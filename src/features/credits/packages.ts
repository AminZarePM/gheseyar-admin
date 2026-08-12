/*
 * ⚠️ این فایل آینهٔ نسخهٔ موجود در مخزن gheseyar است.
 *
 * دو مخزن روی یک دیتابیس کار می‌کنند. مالک اسکیما و مهاجرت‌ها مخزن اپ
 * (gheseyar/deploy/sql) است؛ اینجا فقط تعریف تایپی برای خواندن و نوشتن
 * نگه داشته می‌شود. هر تغییری در آن مخزن باید اینجا هم اعمال شود.
 */
/** فاز ۹ — بسته‌های اعتبار قصه. اشتراک فروخته نمی‌شود. */
export interface CreditPackage {
  id: string;
  label: string;
  stories: number;
  price: number;
  months: number;
  /** پرفروش‌ترین بسته؛ در رابط برچسب می‌گیرد */
  recommended?: boolean;
}

export const PACKAGES: CreditPackage[] = [
  { id: 'p1', label: 'بستهٔ یک', stories: 14, price: 200_000, months: 2 },
  { id: 'p2', label: 'بستهٔ دو', stories: 35, price: 500_000, months: 3, recommended: true },
  { id: 'p3', label: 'بستهٔ سه', stories: 70, price: 900_000, months: 4 },
];

export const perStory = (p: CreditPackage) => Math.round(p.price / p.stories);

/**
 * واحد ذهنی محصول «هفتهٔ هفت‌شبه» است، نه تعداد خام قصه.
 * ۱۴ قصه یعنی دو هفتهٔ کامل — این را والد می‌فهمد.
 */
export const weeks = (p: CreditPackage) => Math.floor(p.stories / 7);
