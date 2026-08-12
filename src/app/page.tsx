'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, LogOut, RefreshCw, Search, X } from 'lucide-react';
import Sheet from '@/components/sheet';
import { toast } from '@/components/toast';
import { useHydrated } from '@/lib/use-hydrated';
import { fa } from '@/lib/fa';

/**
 * پنل عملیات (سند admin-support-panel-spec §۳).
 *
 * فقط سه پرسش را جواب می‌دهد: این کاربر چه وضعی دارد، این سفارش چه شد،
 * و چه چیزی روی میز پشتیبانی مانده. نمودار و روند عمداً اینجا نیست.
 */
type Role = 'SUPERADMIN' | 'SUPPORT' | 'FINANCE' | 'CONTENT';

const PERMISSIONS: Record<Role, string[]> = {
  SUPERADMIN: ['*'],
  SUPPORT: ['users.view', 'children.view', 'orders.view', 'tickets.*', 'sms.view'],
  FINANCE: ['orders.*', 'credit.adjust', 'refund.*', 'reverse.*', 'users.view', 'children.view', 'sms.view'],
  CONTENT: ['moderation.*', 'stories.view', 'feedback.*', 'children.view'],
};
const can = (role: Role | undefined, key: string) =>
  !!role &&
  (PERMISSIONS[role] ?? []).some(
    (p) => p === '*' || p === key || (p.endsWith('.*') && key.startsWith(p.slice(0, -1)))
  );

interface Order {
  id: string; ref: string | null; name: string; phone: string;
  packageId: string; stories: number; price: number; status: string; createdAt: string;
  refId: string | null; cardPan: string | null; gatewayError: string | null;
}
interface Support { id: string; phone: string | null; message: string; handled: boolean; createdAt: string }
interface Concern { id: string; text: string; matchedTopic: string | null; createdAt: string }
interface Sms { id: string; recipientMobile: string; purpose: string; status: string; deliveryStateCode: number | null; error: string | null; createdAt: string }
interface UserRow {
  id: string; phone: string; name: string | null; credits: number;
  creditsExpireAt: string | null; lastSeenAt: string; suspendedAt: string | null;
  childCount: number; orderCount: number;
}
interface Detail {
  user: UserRow;
  children: Array<{ id: string; name: string; gender: string; age: number }>;
  orders: Order[];
  logins: Array<{ id: string; ip: string | null; device: string | null; createdAt: string }>;
  ledger: Array<{ id: string; delta: number; balanceAfter: number; source: string; reason: string | null; createdAt: string }>;
  journeys: Array<{ id: string; topicId: string; unlocked: number[]; survey: Record<string, string> }>;
}
interface Payload {
  admin: { name: string; role: Role };
  stats: Record<string, number | string>;
  orders: Order[]; support: Support[]; concerns: Concern[]; sms: Sms[];
}

const ORDER_STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: 'در انتظار تماس', cls: 'b-gold' },
  initiated: { label: 'رفته به درگاه', cls: 'b-teal' },
  paid: { label: 'پرداخت شد', cls: 'b-ok' },
  failed: { label: 'ناموفق', cls: 'b-coral' },
  active: { label: 'دستی فعال شد', cls: 'b-ok' },
  cancelled: { label: 'لغو شد', cls: 'b-coral' },
};

const SMS_STATUS: Record<string, string> = {
  queued: 'در صف', sent: 'ارسال شد', delivered: 'رسید',
  failed: 'نرسید', blacklisted: 'لیست سیاه',
};

const SEGMENTS = [
  { key: '', label: 'همه' },
  { key: 'active', label: 'دارای اعتبار' },
  { key: 'no_credit', label: 'اعتبار تمام‌شده' },
  { key: 'expired', label: 'اعتبار منقضی' },
  { key: 'suspended', label: 'معلق' },
];

const when = (iso: string) =>
  new Date(iso).toLocaleString('fa-IR', { dateStyle: 'short', timeStyle: 'short' });

/** هر اقدام حساس دلیل اجباری دارد (§۲) */
function useReason() {
  const [ask, setAsk] = useState<null | { title: string; body?: string; run: (why: string) => Promise<void> }>(null);
  const [why, setWhy] = useState('');
  const [busy, setBusy] = useState(false);

  const node = ask ? (
    <Sheet open onClose={() => { setAsk(null); setWhy(''); }} title={ask.title}>
      {ask.body && <p className="text-sm leading-8 text-[var(--fg-soft)]">{ask.body}</p>}
      <label className="mt-3 block text-sm font-bold" htmlFor="why">دلیل (ثبت می‌شود)</label>
      <input
        id="why" className="gy-input mt-1.5" value={why}
        placeholder="مثلاً: پرداخت کارت‌به‌کارت تأیید شد"
        onChange={(e) => setWhy(e.target.value)}
      />
      <button
        type="button" className="gy-btn mt-4" disabled={busy || why.trim().length < 3}
        onClick={async () => {
          setBusy(true);
          await ask.run(why.trim());
          setBusy(false); setAsk(null); setWhy('');
        }}
      >
        {busy ? 'در حال ثبت…' : 'ثبت'}
      </button>
      <button type="button" className="gy-btn gy-btn--ghost mt-2" onClick={() => { setAsk(null); setWhy(''); }}>
        انصراف
      </button>
    </Sheet>
  ) : null;

  return { node, request: setAsk };
}

export default function AdminPage() {
  const router = useRouter();
  const hydrated = useHydrated();
  const [data, setData] = useState<Payload | null>(null);
  const [tab, setTab] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const reason = useReason();

  const [q, setQ] = useState('');
  const [segment, setSegment] = useState('');
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);

  const fetchAll = useCallback(async () => {
    const res = await fetch('/api/overview');
    if (res.status === 403) return router.replace('/login');
    if (!res.ok) return toast('خواندن اطلاعات ناموفق بود.');
    setData((await res.json()) as Payload);
  }, [router]);

  const fetchUsers = useCallback(async () => {
    const res = await fetch(`/api/users?q=${encodeURIComponent(q)}&segment=${segment}`);
    if (!res.ok) return;
    setUsers(((await res.json()) as { users: UserRow[] }).users);
  }, [q, segment]);

  useEffect(() => { if (hydrated) fetchAll(); }, [hydrated, fetchAll]);
  useEffect(() => { if (hydrated && tab === 0) fetchUsers(); }, [hydrated, tab, fetchUsers]);

  const role = data?.admin.role;

  const openUser = async (id: string) => {
    const res = await fetch(`/api/users?id=${id}`);
    if (!res.ok) return toast('پروندهٔ کاربر باز نشد.');
    setDetail((await res.json()) as Detail);
  };

  const post = async (url: string, body: unknown, ok: string) => {
    const res = await fetch(url, {
      method: url.includes('/credit') ? 'POST' : 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const b = await res.json().catch(() => null);
    if (!res.ok) return toast(b?.error ?? 'انجام نشد.');
    toast(ok);
    fetchAll();
    if (detail) openUser(detail.user.id);
    if (tab === 0) fetchUsers();
  };

  if (!hydrated || !data) {
    return (
      <main className="gy-page gy-admin mx-auto max-w-[860px] px-4 pt-6">
        <div className="gy-card is-static"><div className="gy-skel h-20" /></div>
      </main>
    );
  }

  const s = data.stats;
  const tabs = [
    { key: 'users', label: 'کاربران', show: can(role, 'users.view') },
    { key: 'orders', label: 'سفارش‌ها', show: can(role, 'orders.view') },
    { key: 'support', label: 'پشتیبانی', show: can(role, 'tickets.view') || can(role, 'tickets.update') },
    { key: 'concerns', label: 'دغدغه‌ها', show: true },
    { key: 'sms', label: 'پیامک', show: can(role, 'sms.view') },
  ].filter((t) => t.show);

  return (
    <>
      {/* ── نوار پنل ── */}
      <header className="sticky top-0 z-20 border-b border-[var(--line)] bg-[var(--bg)]">
        <div className="mx-auto flex max-w-[860px] items-center gap-2 px-4 py-2.5">
          <b className="text-lg">پنل قصه‌یار</b>
          <span className="gy-badge b-teal">{data.admin.role}</span>
          <span className="flex-1" />
          <span className="text-sm text-[var(--fg-soft)]">{data.admin.name}</span>
          <button type="button" onClick={fetchAll} aria-label="تازه‌سازی" className="gy-hit rounded-full text-[var(--fg-soft)]">
            <RefreshCw size={17} strokeWidth={1.9} />
          </button>
          <button
            type="button"
            aria-label="خروج"
            className="gy-hit rounded-full text-[var(--fg-soft)]"
            onClick={async () => {
              await fetch('/api/auth/logout', { method: 'POST' });
              router.replace('/login');
            }}
          >
            <LogOut size={17} strokeWidth={1.9} />
          </button>
        </div>
      </header>

      <main className="gy-page gy-admin mx-auto max-w-[860px] px-4 pb-24 pt-4">
        {/* ── آمار عملیاتی ── */}
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {[
            ['والدین', s.users], ['فرزندان', s.children],
            ['سفارش در انتظار', s.orders_pending], ['پیام باز', s.support_open],
            ['پرداخت موفق', s.orders_paid],
            ['درآمد (تومان)', typeof s.revenue === 'number' ? s.revenue.toLocaleString('en-US') : s.revenue],
            ['شب‌های باز شده', s.nights], ['دغدغه', s.concerns],
          ].map(([k, v]) => (
            <div key={String(k)} className="gy-card is-static !p-3 text-center">
              <b className="block text-lg">{typeof v === 'number' ? fa(v) : (v ?? '—')}</b>
              <small className="text-[11px] text-[var(--fg-soft)]">{k}</small>
            </div>
          ))}
        </div>

        <div className="gy-seg mt-5 mb-4">
          {tabs.map((t, i) => (
            <button key={t.key} type="button" aria-pressed={tab === i} onClick={() => setTab(i)}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── کاربران ── */}
        {tabs[tab]?.key === 'users' && (
          <>
            <div className="gy-card is-static">
              <div className="flex items-center gap-2">
                <Search size={17} strokeWidth={1.9} className="text-[var(--fg-soft)]" />
                <input
                  className="gy-input !mt-0 flex-1"
                  placeholder="نام یا شمارهٔ موبایل"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && fetchUsers()}
                />
              </div>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {SEGMENTS.map((sg) => (
                  <button
                    key={sg.key}
                    type="button"
                    onClick={() => setSegment(sg.key)}
                    className={
                      'rounded-full border px-3 py-1.5 text-xs ' +
                      (segment === sg.key
                        ? 'border-teal bg-[var(--tint-teal)] font-bold text-[var(--on-teal)]'
                        : 'border-[var(--line)] bg-[var(--surface)] text-[var(--fg-soft)]')
                    }
                  >
                    {sg.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="gy-stagger mt-3">
              {users?.length === 0 && (
                <div className="gy-card is-static text-center text-sm text-[var(--fg-soft)]">چیزی پیدا نشد.</div>
              )}
              {users?.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => openUser(u.id)}
                  className="gy-card mb-2.5 flex w-full items-center gap-3 text-right"
                >
                  <span className="min-w-0 flex-1">
                    <b className="block text-[15px]">{u.name || 'بی‌نام'}</b>
                    <small className="text-xs text-[var(--fg-soft)]" dir="ltr">{fa(u.phone)}</small>
                  </span>
                  <span className="shrink-0 text-left text-xs text-[var(--fg-soft)]">
                    <span className="block">{fa(u.credits)} اعتبار</span>
                    <span className="block">{fa(u.childCount)} فرزند</span>
                  </span>
                  {u.suspendedAt && <span className="gy-badge b-coral">معلق</span>}
                </button>
              ))}
            </div>
          </>
        )}

        {/* ── سفارش‌ها ── */}
        {tabs[tab]?.key === 'orders' && (
          <div className="gy-stagger">
            {can(role, 'orders.update') && (
              <div className="gy-card is-static tint-soft mb-3">
                <b className="text-sm">تطبیق پرداخت‌های نیمه‌کاره</b>
                <p className="mt-1 text-xs leading-7 text-[var(--fg-soft)]">
                  اگر خریداری پس از پرداخت مرورگر را بسته باشد، پولش کم شده ولی اعتباری نگرفته.
                </p>
                <button
                  type="button"
                  className="gy-btn gy-btn--ghost mt-2 !py-2 !text-sm"
                  disabled={busy === 'rec'}
                  onClick={async () => {
                    setBusy('rec');
                    const res = await fetch('/api/reconcile', { method: 'POST' });
                    const b = await res.json().catch(() => null);
                    setBusy(null);
                    if (!res.ok) return toast(b?.error ?? 'تطبیق انجام نشد.');
                    toast(`${fa(b.found)} بررسی شد · ${fa(b.settled)} تسویه شد`);
                    fetchAll();
                  }}
                >
                  {busy === 'rec' ? 'در حال بررسی…' : 'بررسی و تسویه'}
                </button>
              </div>
            )}

            {data.orders.map((o) => (
              <div key={o.id} className="gy-card is-static mb-2.5">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <b className="text-[15px]">{o.name || 'بی‌نام'}</b>
                    <div className="text-xs text-[var(--fg-soft)]">
                      <a href={`tel:${o.phone}`} dir="ltr" className="font-bold text-teal">{fa(o.phone)}</a>
                      {o.ref && <> · پیگیری {fa(o.ref)}</>} · {when(o.createdAt)}
                    </div>
                    <div className="mt-1 text-sm">
                      {fa(o.stories)} قصه — {fa(o.price.toLocaleString('en-US'))} تومان
                    </div>
                    {o.refId && (
                      <div className="mt-0.5 text-xs text-[var(--fg-soft)]">
                        مرجع بانکی <span dir="ltr">{fa(o.refId)}</span>
                        {o.cardPan && <> · کارت <span dir="ltr">{o.cardPan}</span></>}
                      </div>
                    )}
                    {o.gatewayError && <div className="mt-0.5 text-xs text-[var(--on-coral)]">{o.gatewayError}</div>}
                  </div>
                  <span className={'gy-badge ' + (ORDER_STATUS[o.status]?.cls ?? 'b-teal')}>
                    {ORDER_STATUS[o.status]?.label ?? o.status}
                  </span>
                </div>

                {can(role, 'orders.update') && (o.status === 'pending' || o.status === 'failed') && (
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      className="gy-btn !py-2.5 !text-sm"
                      onClick={() =>
                        reason.request({
                          title: `${fa(o.stories)} قصه به ${o.name || o.phone} داده شود؟`,
                          body: 'اعتبار به حساب همین شماره اضافه می‌شود و در دفتر اعتبار ثبت می‌گردد.',
                          run: (why) => post('/api/order', { id: o.id, status: 'active', reason: why }, 'اعتبار اضافه شد.'),
                        })
                      }
                    >
                      <span className="inline-flex items-center gap-1.5"><Check size={15} strokeWidth={2.4} /> فعال کن</span>
                    </button>
                    <button
                      type="button"
                      className="gy-btn gy-btn--ghost !py-2.5 !text-sm"
                      onClick={() =>
                        reason.request({
                          title: 'این سفارش لغو شود؟',
                          run: (why) => post('/api/order', { id: o.id, status: 'cancelled', reason: why }, 'سفارش لغو شد.'),
                        })
                      }
                    >
                      <span className="inline-flex items-center gap-1.5"><X size={15} strokeWidth={2.4} /> لغو</span>
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ── پشتیبانی ── */}
        {tabs[tab]?.key === 'support' && (
          <div className="gy-stagger">
            {data.support.length === 0 && (
              <div className="gy-card is-static text-center text-sm text-[var(--fg-soft)]">پیامی نیامده است.</div>
            )}
            {data.support.map((m) => (
              <div key={m.id} className={'gy-card is-static mb-2.5' + (m.handled ? ' opacity-60' : '')}>
                <div className="flex items-center gap-2 text-xs text-[var(--fg-soft)]">
                  {m.phone ? <a href={`tel:${m.phone}`} dir="ltr" className="font-bold text-teal">{fa(m.phone)}</a> : <span>بدون شماره</span>}
                  <span className="flex-1" />
                  <span>{when(m.createdAt)}</span>
                </div>
                <p className="mt-2 text-sm leading-8">{m.message}</p>
                {!m.handled && can(role, 'tickets.update') && (
                  <button
                    type="button"
                    className="gy-btn gy-btn--ghost mt-2 !py-2 !text-sm"
                    onClick={() => post('/api/order', { supportId: m.id }, 'بسته شد.')}
                  >
                    رسیدگی شد
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ── دغدغه‌ها ── */}
        {tabs[tab]?.key === 'concerns' && (
          <div className="gy-stagger">
            <p className="mb-3 text-xs leading-7 text-[var(--fg-soft)]">
              متن آزادی که والدین در آنبوردینگ نوشته‌اند — مستقیم‌ترین ورودی برای انتخاب موضوع بعدی.
            </p>
            {data.concerns.map((c) => (
              <div key={c.id} className="gy-card is-static mb-2.5">
                <div className="flex items-center gap-2 text-xs text-[var(--fg-soft)]">
                  <span className={'gy-badge ' + (c.matchedTopic ? 'b-teal' : 'b-coral')}>
                    {c.matchedTopic ?? 'بدون تطبیق'}
                  </span>
                  <span className="flex-1" />
                  <span>{when(c.createdAt)}</span>
                </div>
                <p className="mt-2 text-sm leading-8">{c.text}</p>
              </div>
            ))}
          </div>
        )}

        {/* ── پیامک ── */}
        {tabs[tab]?.key === 'sms' && (
          <div className="gy-stagger">
            <div className="gy-card is-static tint-soft mb-3">
              <b className="text-sm">وضعیت تحویل</b>
              <p className="mt-1 text-xs leading-7 text-[var(--fg-soft)]">
                سامانهٔ پیامک وب‌هوک ندارد؛ وضعیت باید پرسیده شود. cron هر ده دقیقه
                این کار را می‌کند، ولی می‌توانید همین حالا هم بگیرید.
              </p>
              <button
                type="button"
                className="gy-btn gy-btn--ghost mt-2 !py-2 !text-sm"
                disabled={busy === 'sms'}
                onClick={async () => {
                  setBusy('sms');
                  const res = await fetch('/api/sms-sync', { method: 'POST' });
                  const b = await res.json().catch(() => null);
                  setBusy(null);
                  if (!res.ok) return toast(b?.error ?? 'انجام نشد.');
                  toast(`${fa(b.checked)} بررسی شد · ${fa(b.updated)} به‌روز شد`);
                  fetchAll();
                }}
              >
                {busy === 'sms' ? 'در حال بررسی…' : 'به‌روزرسانی وضعیت'}
              </button>
            </div>

            {data.sms.map((m) => (
              <div key={m.id} className="gy-card is-static mb-2 !py-3">
                <div className="flex items-center gap-2 text-sm">
                  <span dir="ltr" className="font-bold">{fa(m.recipientMobile)}</span>
                  <span className="text-xs text-[var(--fg-soft)]">{m.purpose}</span>
                  <span className="flex-1" />
                  <span className={'gy-badge ' + (m.status === 'delivered' ? 'b-ok' : m.status === 'failed' || m.status === 'blacklisted' ? 'b-coral' : 'b-gold')}>
                    {SMS_STATUS[m.status] ?? m.status}
                  </span>
                </div>
                <div className="mt-1 text-xs text-[var(--fg-soft)]">
                  {when(m.createdAt)}
                  {m.error && <> · {m.error}</>}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* ── پروندهٔ کاربر ── */}
      <Sheet open={!!detail} onClose={() => setDetail(null)} title={detail?.user.name || 'پروندهٔ والد'}>
        {detail && (
          <>
            <div className="gy-card is-static tint-soft">
              <div className="flex items-center gap-2 text-sm">
                <a href={`tel:${detail.user.phone}`} dir="ltr" className="font-bold text-teal">{fa(detail.user.phone)}</a>
                <span className="flex-1" />
                <b>{fa(detail.user.credits)} اعتبار</b>
              </div>
              <div className="mt-1 text-xs text-[var(--fg-soft)]">
                آخرین بازدید {when(detail.user.lastSeenAt)}
                {detail.user.creditsExpireAt && <> · انقضا {new Date(detail.user.creditsExpireAt).toLocaleDateString('fa-IR')}</>}
                {detail.user.suspendedAt && <> · <span className="text-[var(--on-coral)]">معلق</span></>}
              </div>
            </div>

            {(can(role, 'credit.adjust') || can(role, 'users.suspend')) && (
              <div className="mt-2.5 flex flex-wrap gap-2">
                {can(role, 'credit.adjust') && ([5, -5] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    className="gy-btn gy-btn--ghost !w-auto !px-4 !py-2 !text-sm"
                    onClick={() =>
                      reason.request({
                        title: `${d > 0 ? 'افزودن' : 'کاستن'} ${fa(Math.abs(d))} اعتبار`,
                        body: 'در دفتر اعتبار و ثبت ممیزی ذخیره می‌شود.',
                        run: (why) => post('/api/credit', { userId: detail.user.id, delta: d, reason: why }, 'اعتبار اصلاح شد.'),
                      })
                    }
                  >
                    {d > 0 ? `+${fa(d)} اعتبار` : `${fa(d)} اعتبار`}
                  </button>
                ))}
                {can(role, 'users.suspend') && (
                  <button
                    type="button"
                    className="gy-btn gy-btn--ghost !w-auto !px-4 !py-2 !text-sm !text-coral"
                    onClick={() =>
                      reason.request({
                        title: detail.user.suspendedAt ? 'رفع تعلیق حساب؟' : 'تعلیق حساب؟',
                        run: (why) =>
                          post('/api/users', { id: detail.user.id, suspend: !detail.user.suspendedAt, reason: why }, 'انجام شد.'),
                      })
                    }
                  >
                    {detail.user.suspendedAt ? 'رفع تعلیق' : 'تعلیق حساب'}
                  </button>
                )}
              </div>
            )}

            <h3 className="mt-5 text-base">فرزندان</h3>
            {detail.children.length === 0 && <p className="text-sm text-[var(--fg-soft)]">فرزندی ثبت نشده.</p>}
            {detail.children.map((c) => {
              const j = detail.journeys.filter((x) => x.topicId && x);
              return (
                <div key={c.id} className="gy-card is-static mb-2 !py-3">
                  <b className="text-sm">{c.name}</b>
                  <div className="text-xs text-[var(--fg-soft)]">
                    {c.gender === 'f' ? 'دختر' : 'پسر'} · {fa(c.age)} سال
                    {j.length > 0 && <> · {fa(j.length)} مسیر</>}
                  </div>
                </div>
              );
            })}

            {detail.journeys.length > 0 && (
              <>
                <h3 className="mt-5 text-base">مسیرها و پاسخ پرسش‌نامه</h3>
                {detail.journeys.map((j) => (
                  <div key={j.id} className="gy-card is-static mb-2 !py-3">
                    <div className="flex items-center gap-2 text-sm">
                      <b>{j.topicId}</b>
                      <span className="flex-1" />
                      <span className="text-xs text-[var(--fg-soft)]">{fa(j.unlocked?.length ?? 0)} شب از ۷</span>
                    </div>
                    {j.survey && Object.keys(j.survey).length > 0 && (
                      <div className="mt-1.5 text-xs leading-6 text-[var(--fg-soft)]">
                        {Object.entries(j.survey).map(([k, v]) => (
                          <div key={k}>پرسش {fa(k)}: {v}</div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </>
            )}

            <h3 className="mt-5 text-base">دفتر اعتبار</h3>
            {detail.ledger.length === 0 && <p className="text-sm text-[var(--fg-soft)]">تغییری ثبت نشده.</p>}
            {detail.ledger.map((l) => (
              <div key={l.id} className="flex items-center gap-2 border-b border-dashed border-[var(--line)] py-2 text-xs last:border-0">
                <b className={l.delta > 0 ? 'text-[var(--on-ok)]' : 'text-[var(--on-coral)]'}>
                  {l.delta > 0 ? '+' : ''}{fa(l.delta)}
                </b>
                <span className="text-[var(--fg-soft)]">→ {fa(l.balanceAfter)}</span>
                <span className="min-w-0 flex-1 truncate text-[var(--fg-soft)]">{l.reason ?? l.source}</span>
                <span className="shrink-0 text-[var(--fg-soft)]">{when(l.createdAt)}</span>
              </div>
            ))}

            <h3 className="mt-5 text-base">آخرین ورودها</h3>
            {detail.logins.length === 0 && <p className="text-sm text-[var(--fg-soft)]">ورودی ثبت نشده.</p>}
            {detail.logins.map((l) => (
              <div key={l.id} className="flex items-center gap-2 border-b border-dashed border-[var(--line)] py-2 text-xs last:border-0">
                <span dir="ltr">{l.ip ?? '—'}</span>
                <span className="min-w-0 flex-1 truncate text-[var(--fg-soft)]">{l.device ?? ''}</span>
                <span className="shrink-0 text-[var(--fg-soft)]">{when(l.createdAt)}</span>
              </div>
            ))}

            <button type="button" className="gy-btn gy-btn--ghost mt-5" onClick={() => setDetail(null)}>
              بستن
            </button>
          </>
        )}
      </Sheet>

      {reason.node}
    </>
  );
}
