'use client';

import Script from 'next/script';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, Lock, ShieldCheck } from 'lucide-react';
import { fa, en } from '@/lib/fa';

/**
 * ورود پنل ادمین (سند §۱).
 *
 * دو مرحله: نام کاربری و رمز، سپس کد شش‌رقمی به موبایل ثبت‌شده.
 * پیام خطا همیشه یکسان است و هرگز نمی‌گوید کدام‌یک اشتباه بوده.
 * بعد از دو تلاش ناموفق، ARCaptcha ظاهر می‌شود.
 */
declare global {
  interface Window {
    arcaptcha?: { render: (el: HTMLElement, opts: Record<string, unknown>) => void };
  }
}

export default function AdminLoginPage() {
  const router = useRouter();
  const [siteKey, setSiteKey] = useState('');

  const [stage, setStage] = useState<'password' | 'otp'>('password');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [mobile, setMobile] = useState('');
  const [needCaptcha, setNeedCaptcha] = useState(false);
  const [captcha, setCaptcha] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/auth/config')
      .then((r) => r.json())
      .then((b) => setSiteKey(b?.siteKey ?? ''))
      .catch(() => {});
  }, []);

  // ویجت کپچا فقط وقتی لازم شد رندر می‌شود
  useEffect(() => {
    if (!needCaptcha || !siteKey || !boxRef.current || !window.arcaptcha) return;
    window.arcaptcha.render(boxRef.current, {
      site_key: siteKey,
      callback: (token: string) => setCaptcha(token),
    });
  }, [needCaptcha, siteKey]);

  const submitPassword = async () => {
    if (busy) return;
    setBusy(true);
    setErr(null);
    const r = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username, password, captcha }),
    });
    const b = await r.json().catch(() => null);
    setBusy(false);

    if (r.ok && b?.stage === 'otp') {
      setMobile(b.mobile ?? '');
      setStage('otp');
      if (b.devCode) setErr(`کد آزمایشی: ${b.devCode}`);
      return;
    }
    if (b?.captcha) setNeedCaptcha(true);
    setCaptcha('');
    setErr(b?.error ?? 'ورود انجام نشد.');
  };

  const submitOtp = async (value: string) => {
    if (busy) return;
    setBusy(true);
    setErr(null);
    const r = await fetch('/api/auth/otp', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username, code: value }),
    });
    const b = await r.json().catch(() => null);
    setBusy(false);
    if (r.ok) return router.replace('/');
    setCode('');
    setErr(b?.error ?? 'کد درست نیست.');
  };

  return (
    <>
      {siteKey && <Script src="https://widget.arcaptcha.ir/1/api.js" strategy="afterInteractive" />}

      <main className="gy-page gy-admin mx-auto grid min-h-[100dvh] max-w-[420px] place-items-center px-4">
        <div className="w-full">
          <div className="mb-5 text-center">
            <span className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-[var(--tint-teal)] text-[var(--on-teal)]">
              <Lock size={22} strokeWidth={1.9} />
            </span>
            <h1 className="text-xl">پنل قصه‌یار</h1>
            <p className="mt-1 text-xs text-[var(--fg-soft)]">ورود فقط برای اعضای تیم</p>
          </div>

          <div className="gy-card is-static">
            {stage === 'password' ? (
              <>
                <label className="block text-sm font-bold" htmlFor="u">نام کاربری</label>
                <input
                  id="u"
                  className="gy-input mt-1.5"
                  dir="ltr"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />

                <label className="mt-3 block text-sm font-bold" htmlFor="p">رمز عبور</label>
                <input
                  id="p"
                  type="password"
                  className="gy-input mt-1.5"
                  dir="ltr"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && submitPassword()}
                />

                {needCaptcha && (
                  <div className="mt-3">
                    <p className="mb-2 text-xs text-[var(--fg-soft)]">برای ادامه، کپچا را کامل کنید.</p>
                    <div ref={boxRef} />
                  </div>
                )}

                <button
                  type="button"
                  className="gy-btn mt-4"
                  disabled={busy || !username || !password || (needCaptcha && !captcha)}
                  onClick={submitPassword}
                >
                  {busy ? 'در حال بررسی…' : 'ادامه'}
                </button>
              </>
            ) : (
              <>
                <p className="flex flex-wrap items-center gap-1.5 text-sm text-[var(--fg-soft)]">
                  <ShieldCheck size={16} strokeWidth={1.9} />
                  کد شش‌رقمی به {mobile ? <span dir="ltr">{fa(mobile)}</span> : 'موبایل شما'} پیامک شد.
                </p>
                <input
                  className="gy-input mt-3 text-center text-2xl tracking-[0.5em]"
                  dir="ltr"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={code}
                  onChange={(e) => {
                    const v = en(e.target.value).replace(/\D/g, '').slice(0, 6);
                    setCode(v);
                    setErr(null);
                    if (v.length === 6) submitOtp(v);
                  }}
                />
                <button
                  type="button"
                  className="gy-btn mt-4"
                  disabled={busy || code.length !== 6}
                  onClick={() => submitOtp(code)}
                >
                  {busy ? 'در حال بررسی…' : 'ورود'}
                </button>
                <button
                  type="button"
                  className="gy-btn gy-btn--ghost mt-2"
                  onClick={() => {
                    setStage('password');
                    setPassword('');
                    setCode('');
                    setErr(null);
                  }}
                >
                  بازگشت
                </button>
              </>
            )}

            {err && (
              <div className="mt-3 flex items-start gap-2 rounded-xl bg-[var(--tint-coral)] p-3 text-[13px] leading-7 text-[var(--on-coral)]">
                <AlertCircle size={16} strokeWidth={2} className="mt-1 shrink-0" />
                <span>{err}</span>
              </div>
            )}
          </div>

          <p className="mt-4 text-center text-[11px] leading-6 text-[var(--fg-soft)]">
            پس از ۲۰ دقیقه بی‌کاری، نشست به‌صورت خودکار بسته می‌شود.
          </p>
        </div>
      </main>
    </>
  );
}
