import { cookies, headers } from 'next/headers';
import { eq } from 'drizzle-orm';
import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';
import { db, adminAuditLog, adminUsers } from '@/db';

/* ── نقش‌ها و دسترسی‌ها (سند §۲) ───────────────────────────
   کلید دسترسی در کد نگه داشته می‌شود، نه در جدول — برای فاز MVP
   سریع‌تر است و اگر بعداً override هر کاربر لازم شد، یک جدول
   اضافه می‌شود بدون آنکه این‌ها عوض شوند.                    */
export type AdminRole = 'SUPERADMIN' | 'SUPPORT' | 'FINANCE' | 'CONTENT';

export const PERMISSIONS: Record<AdminRole, string[]> = {
  SUPERADMIN: ['*'],
  SUPPORT: ['users.view', 'children.view', 'orders.view', 'tickets.*', 'sms.view'],
  FINANCE: ['orders.*', 'credit.adjust', 'refund.*', 'reverse.*', 'users.view', 'children.view', 'sms.view'],
  CONTENT: ['moderation.*', 'stories.view', 'feedback.*', 'children.view'],
};

export function can(role: AdminRole, key: string): boolean {
  const list = PERMISSIONS[role] ?? [];
  return list.some(
    (p) => p === '*' || p === key || (p.endsWith('.*') && key.startsWith(p.slice(0, -1)))
  );
}

/* ── رمز عبور ─────────────────────────────────────────────
   هش کردن رمز «رمزنگاری PII» نیست؛ حداقل امنیت اعتبارنامه است
   و طبق سند قابل حذف نیست.                                   */
export const hashPassword = (plain: string) => bcrypt.hash(plain, 12);
export const checkPassword = (plain: string, hash: string) => bcrypt.compare(plain, hash);

/* ── نشست ادمین ───────────────────────────────────────────
   کوکی و رمز امضا هر دو از نشست کاربران جدا هستند تا سرقت یکی
   به دیگری راه نداشته باشد. ۲۰ دقیقه بی‌کاری → خروج خودکار.  */
const COOKIE = 'gy_admin';
export const IDLE_SECONDS = 20 * 60;

const secret = () =>
  new TextEncoder().encode(
    process.env.ADMIN_SESSION_SECRET || process.env.SESSION_SECRET || 'gheseyar-admin-dev-secret'
  );

export interface AdminSession {
  aid: string;
  role: AdminRole;
  name: string;
}

export async function createAdminSession(s: AdminSession) {
  const token = await new SignJWT({ ...s })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${IDLE_SECONDS}s`)
    .sign(secret());

  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: IDLE_SECONDS,
  });
}

export async function clearAdminSession() {
  (await cookies()).delete(COOKIE);
}

/**
 * نشست جاری. چون عمر توکن ۲۰ دقیقه است و هر درخواست موفق آن را
 * تمدید می‌کند، بی‌کاری بیش از ۲۰ دقیقه یعنی خروج خودکار.
 */
export async function adminSession(): Promise<AdminSession | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    const s = { aid: payload.aid as string, role: payload.role as AdminRole, name: payload.name as string };
    if (!s.aid || !PERMISSIONS[s.role]) return null;

    const [row] = await db.select().from(adminUsers).where(eq(adminUsers.id, s.aid));
    if (!row || !row.isActive) return null;

    await createAdminSession(s); // تمدید پنجرهٔ بی‌کاری
    return s;
  } catch {
    return null;
  }
}

/** نشست با بررسی دسترسی. اگر مجاز نبود null برمی‌گرداند. */
export async function requireAdmin(permission?: string): Promise<AdminSession | null> {
  const s = await adminSession();
  if (!s) return null;
  if (permission && !can(s.role, permission)) return null;
  return s;
}

/* ── ممیزی ────────────────────────────────────────────────
   هر اقدام حساس یک ردیف می‌سازد و `reason` اجباری است.       */
export async function audit(
  adminUserId: string,
  action: string,
  targetType: string,
  targetId: string | null,
  reason: string,
  metadata: Record<string, unknown> = {}
) {
  await db.insert(adminAuditLog).values({ adminUserId, action, targetType, targetId, reason, metadata });
}

/** IP و مرورگر درخواست، برای لاگ ورود */
export async function requestMeta() {
  const h = await headers();
  return {
    ip: h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? h.get('x-real-ip') ?? null,
    userAgent: h.get('user-agent')?.slice(0, 300) ?? null,
  };
}
