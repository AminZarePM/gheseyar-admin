'use client';
import { useEffect, useState } from 'react';

/**
 * store‌های persist شده در اولین رندرِ سرور خالی‌اند و در کلاینت پر می‌شوند.
 * تا زمانی که این هوک true نشده، محتوای وابسته به آن‌ها رندر نمی‌شود
 * تا خطای hydration mismatch رخ ندهد.
 */
export function useHydrated() {
  const [h, setH] = useState(false);
  useEffect(() => setH(true), []);
  return h;
}
