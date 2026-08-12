'use client';

import { useEffect } from 'react';

/**
 * شیت پایینی — پایهٔ همهٔ گفت‌وگوهای اپ.
 *
 * جایگزین confirm() بومی مرورگر می‌شود که پنجرهٔ سفید انگلیسی‌چین وسط یک اپ
 * کاملاً فارسی نشان می‌دهد و در برخی مرورگرهای درون‌برنامه‌ای اصلاً باز نمی‌شود.
 */
export default function Sheet({
  open,
  onClose,
  title,
  children,
  dismissable = true,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  dismissable?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && dismissable && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose, dismissable]);

  if (!open) return null;

  return (
    <div
      className="gy-sheet-scrim"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={() => dismissable && onClose()}
    >
      <div className="gy-sheet" onClick={(e) => e.stopPropagation()}>
        <span className="gy-sheet-grip" aria-hidden />
        {title && <h2 className="mb-2 text-xl">{title}</h2>}
        {children}
      </div>
    </div>
  );
}
