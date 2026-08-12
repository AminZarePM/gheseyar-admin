import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, adminLoginLog, adminOtpCodes, adminUsers } from '@/db';
import { createAdminSession, requestMeta, type AdminRole } from '@/lib/admin-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_ATTEMPTS = 5;

/** مرحلهٔ دوم ورود ادمین — تأیید کد پیامکی */
export async function POST(req: Request) {
  const { username, code } = await req.json().catch(() => ({}));
  const u = String(username ?? '').trim().toLowerCase();
  const c = String(code ?? '').trim();
  if (!u || !/^\d{6}$/.test(c))
    return NextResponse.json({ error: 'کد باید شش رقم باشد.' }, { status: 400 });

  const [admin] = await db.select().from(adminUsers).where(eq(adminUsers.username, u));
  if (!admin || !admin.isActive)
    return NextResponse.json({ error: 'کد معتبر نیست.' }, { status: 401 });

  const [row] = await db.select().from(adminOtpCodes).where(eq(adminOtpCodes.adminUserId, admin.id));
  if (!row) return NextResponse.json({ error: 'کدی ثبت نشده. دوباره وارد شوید.' }, { status: 400 });

  if (new Date(row.expiresAt) < new Date()) {
    await db.delete(adminOtpCodes).where(eq(adminOtpCodes.adminUserId, admin.id));
    return NextResponse.json({ error: 'مهلت کد تمام شد. دوباره وارد شوید.' }, { status: 400 });
  }

  if (row.attempts >= MAX_ATTEMPTS || row.code !== c) {
    const attempts = row.attempts + 1;
    if (attempts >= MAX_ATTEMPTS) {
      await db.delete(adminOtpCodes).where(eq(adminOtpCodes.adminUserId, admin.id));
    } else {
      await db.update(adminOtpCodes).set({ attempts }).where(eq(adminOtpCodes.adminUserId, admin.id));
    }
    await db.insert(adminLoginLog).values({
      adminUserId: admin.id, username: u, success: false, ...(await requestMeta()),
    });
    return NextResponse.json(
      { error: 'کد درست نیست.', left: Math.max(MAX_ATTEMPTS - attempts, 0) },
      { status: 401 }
    );
  }

  await db.delete(adminOtpCodes).where(eq(adminOtpCodes.adminUserId, admin.id));
  await db.insert(adminLoginLog).values({
    adminUserId: admin.id, username: u, success: true, ...(await requestMeta()),
  });

  await createAdminSession({ aid: admin.id, role: admin.role as AdminRole, name: admin.fullName });
  return NextResponse.json({ ok: true, role: admin.role, name: admin.fullName });
}
