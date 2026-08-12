'use client';

import { create } from 'zustand';
import { useEffect } from 'react';

interface ToastState { msg: string; show: (m: string) => void; clear: () => void }
export const useToast = create<ToastState>((set) => ({
  msg: '',
  show: (msg) => set({ msg }),
  clear: () => set({ msg: '' }),
}));

export const toast = (m: string) => useToast.getState().show(m);

export default function Toaster() {
  const { msg, clear } = useToast();
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(clear, 2400);
    return () => clearTimeout(t);
  }, [msg, clear]);

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4 transition-opacity"
      style={{ opacity: msg ? 1 : 0 }}
      role="status"
      aria-live="polite"
    >
      {msg && (
        <span className="max-w-[88vw] rounded-full bg-ink px-5 py-2.5 text-sm text-cream shadow-lg">
          {msg}
        </span>
      )}
    </div>
  );
}
