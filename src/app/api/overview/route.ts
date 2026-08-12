import { NextResponse } from 'next/server';
import { desc, sql } from 'drizzle-orm';
import { db, concerns, purchaseRequests, smsLog, supportMessages } from '@/db';
import { audit, requireAdmin } from '@/lib/admin-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LIMIT = 50;

/** یک فراخوان، همهٔ چیزی که پنل لازم دارد. */
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'unauthorized' }, { status: 403 });

  const [stats] = await db.execute<{
    users: number; children: number; journeys: number;
    nights: number; orders_pending: number; support_open: number;
    concerns: number; orders_paid: number; revenue: number; db_size: string;
  }>(sql`
    select
      (select count(*)::int from users)                                    as users,
      (select count(*)::int from children)                                 as children,
      (select count(*)::int from journeys)                                 as journeys,
      (select coalesce(sum(jsonb_array_length(unlocked)),0)::int from journeys) as nights,
      (select count(*)::int from purchase_requests where status = 'pending') as orders_pending,
      (select count(*)::int from support_messages where handled = false)   as support_open,
      (select count(*)::int from concerns)                                 as concerns,
      (select count(*)::int from purchase_requests where status = 'paid')  as orders_paid,
      (select coalesce(sum(price),0)::int from purchase_requests where status = 'paid') as revenue,
      pg_size_pretty(pg_database_size(current_database()))                 as db_size
  `);

  const [orders, support, recentConcerns, sms] = await Promise.all([
    db.select().from(purchaseRequests).orderBy(desc(purchaseRequests.createdAt)).limit(LIMIT),
    db.select().from(supportMessages).orderBy(desc(supportMessages.createdAt)).limit(LIMIT),
    db.select().from(concerns).orderBy(desc(concerns.createdAt)).limit(LIMIT),
    db.select().from(smsLog).orderBy(desc(smsLog.createdAt)).limit(LIMIT),
  ]);

  const mem = process.memoryUsage();
  return NextResponse.json({
    admin,
    stats,
    orders,
    support,
    sms,
    concerns: recentConcerns,
    app: {
      uptimeSeconds: Math.round(process.uptime()),
      heapMb: Math.round(mem.heapUsed / 1048576),
      rssMb: Math.round(mem.rss / 1048576),
      node: process.version,
    },
  });
}
