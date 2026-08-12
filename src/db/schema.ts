/*
 * ⚠️ این فایل آینهٔ نسخهٔ موجود در مخزن gheseyar است.
 *
 * دو مخزن روی یک دیتابیس کار می‌کنند. مالک اسکیما و مهاجرت‌ها مخزن اپ
 * (gheseyar/deploy/sql) است؛ اینجا فقط تعریف تایپی برای خواندن و نوشتن
 * نگه داشته می‌شود. هر تغییری در آن مخزن باید اینجا هم اعمال شود.
 */
import { pgTable, uuid, text, integer, timestamp, jsonb, boolean, index, unique } from 'drizzle-orm/pg-core';

/** کاربر = والد. شناسایی با شمارهٔ موبایل (فاز ۸: بدون کد یک‌بارمصرف) */
export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    phone: text('phone').notNull().unique(),
    name: text('name'),
    credits: integer('credits').notNull().default(7),
    creditsExpireAt: timestamp('credits_expire_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    /** تعلیق حساب از پنل ادمین — null یعنی فعال */
    suspendedAt: timestamp('suspended_at', { withTimezone: true }),
  },
  (t) => ({ phoneIdx: index('users_phone_idx').on(t.phone) })
);

export const children = pgTable(
  'children',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    gender: text('gender').notNull(),
    age: integer('age').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ userIdx: index('children_user_idx').on(t.userId) })
);

/** مسیر هفت‌شبهٔ یک کودک روی یک موضوع */
export const journeys = pgTable(
  'journeys',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    childId: uuid('child_id').notNull().references(() => children.id, { onDelete: 'cascade' }),
    topicId: text('topic_id').notNull(),
    hero: text('hero').notNull(),
    survey: jsonb('survey').$type<Record<string, string>>().notNull().default({}),
    unlocked: jsonb('unlocked').$type<number[]>().notNull().default([]),
    feedback: jsonb('feedback').$type<Record<string, string>>().notNull().default({}),
    saved: jsonb('saved').$type<number[]>().notNull().default([]),
    weekReview: jsonb('week_review').$type<{ items: string[]; at: string } | null>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    childTopic: unique('journeys_child_topic').on(t.childId, t.topicId),
    userIdx: index('journeys_user_idx').on(t.userId),
  })
);

/**
 * تاریخچهٔ پرسش‌نامه. طبق فاز ۵، با ویرایش پاسخ‌ها قصه‌ها از پروفایل حذف می‌شوند
 * اما نسخهٔ قبلی اینجا برای تحقیق کاربر باقی می‌ماند.
 */
export const surveyHistory = pgTable('survey_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  journeyId: uuid('journey_id').notNull().references(() => journeys.id, { onDelete: 'cascade' }),
  survey: jsonb('survey').$type<Record<string, string>>().notNull(),
  hero: text('hero').notNull(),
  archivedAt: timestamp('archived_at', { withTimezone: true }).notNull().defaultNow(),
});

/** جدول پیگیری خرید — درگاه پرداخت هنوز فعال نیست */
export const purchaseRequests = pgTable('purchase_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  phone: text('phone').notNull(),
  packageId: text('package_id').notNull(),
  stories: integer('stories').notNull(),
  price: integer('price').notNull(),
  /** شمارهٔ پیگیری قابل‌گفتن به کاربر، مثل ۱۴۰۵-۰۸۲ */
  ref: text('ref'),
  /**
   * pending    درخواست دستی، در انتظار تماس پشتیبانی
   * initiated  به درگاه فرستاده شد، منتظر بازگشت خریدار
   * paid       پرداخت تأیید شد و اعتبار داده شد
   * failed     پرداخت ناموفق یا تأیید ناموفق
   * active     دستی فعال شد (پرداخت خارج از درگاه)
   * cancelled  لغو شد
   */
  status: text('status').notNull().default('pending'),

  /** شناسهٔ تراکنش زرین‌پال — یکتاست و کلید تطبیق است */
  authority: text('authority').unique(),
  /** شمارهٔ مرجع بانکی پس از تأیید موفق */
  refId: text('ref_id'),
  /** شمارهٔ کارت ماسک‌شده */
  cardPan: text('card_pan'),
  /** کارمزد و اینکه پذیرنده پرداختش کرده یا خریدار */
  fee: integer('fee'),
  feeType: text('fee_type'),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  /** آخرین خطای درگاه، برای پیگیری */
  gatewayError: text('gateway_error'),
  handled: boolean('handled').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** پیام‌های پشتیبانی و بازخورد */
export const supportMessages = pgTable('support_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  phone: text('phone'),
  message: text('message').notNull(),
  handled: boolean('handled').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * کدهای یک‌بارمصرف ورود.
 * SMS.ir خودش کد را تأیید نمی‌کند؛ تطبیق کاملاً سمت اپ است.
 */
export const otpCodes = pgTable(
  'otp_codes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    phone: text('phone').notNull(),
    code: text('code').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    attempts: integer('attempts').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ phoneIdx: index('otp_phone_idx').on(t.phone) })
);

/**
 * متن آزاد «دغدغه» در آنبوردینگ.
 * هم برای نگاشت به موضوع فعال، هم به‌عنوان دادهٔ پژوهشی نگه داشته می‌شود
 * تا بدانیم والدین واقعاً با چه چیزی روبه‌رو هستند و بعدی را چه بنویسیم.
 */
export const concerns = pgTable(
  'concerns',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    /** شناسهٔ دستگاه — محدودیت نرخ نباید فقط به localStorage تکیه کند */
    deviceId: text('device_id'),
    ip: text('ip'),
    text: text('text').notNull(),
    /** موضوعی که به آن نگاشت شد؛ null یعنی تطبیقی پیدا نشد */
    matchedTopic: text('matched_topic'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ deviceIdx: index('concerns_device_idx').on(t.deviceId) })
);

/**
 * گزارش درخواست‌های ارسال کد.
 *
 * جدا از otp_codes نگه داشته می‌شود چون آن جدول با هر تأیید یا درخواست تازه
 * پاک می‌شود و دیگر نمی‌شود شمرد. محدودیت نرخ هم بر مبنای شماره و هم بر مبنای
 * IP لازم است: بدون سقف IP، یک نفر می‌تواند برای صدها شمارهٔ غریبه کد بفرستد
 * و هم آن‌ها را آزار بدهد هم اعتبار پنل پیامک را بسوزاند.
 */
export const otpSends = pgTable(
  'otp_sends',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    phone: text('phone').notNull(),
    ip: text('ip'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    phoneIdx: index('otp_sends_phone_idx').on(t.phone),
    ipIdx: index('otp_sends_ip_idx').on(t.ip),
  })
);

/* ═══════════════════════════════════════════════════════════
   پنل ادمین  (سند admin-support-panel-spec §۱ و §۲)
   ═══════════════════════════════════════════════════════════ */

/** SUPERADMIN | SUPPORT | FINANCE | CONTENT */
export const adminUsers = pgTable('admin_users', {
  id: uuid('id').primaryKey().defaultRandom(),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  fullName: text('full_name').notNull(),
  /** برای کد دومرحله‌ای */
  mobile: text('mobile').notNull(),
  role: text('role').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  failedAttempts: integer('failed_attempts').notNull().default(0),
  lockedUntil: timestamp('locked_until', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const adminLoginLog = pgTable('admin_login_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  adminUserId: uuid('admin_user_id').references(() => adminUsers.id, { onDelete: 'set null' }),
  username: text('username'),
  ip: text('ip'),
  userAgent: text('user_agent'),
  success: boolean('success').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * ثبت هر اقدام حساس. بدون این، رسیدگی به شکایت مالی ممکن نیست —
 * به همین دلیل `reason` اجباری است و در رابط هم نمی‌شود خالی گذاشتش.
 */
export const adminAuditLog = pgTable(
  'admin_audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    adminUserId: uuid('admin_user_id').notNull().references(() => adminUsers.id),
    action: text('action').notNull(),
    targetType: text('target_type').notNull(),
    targetId: text('target_id'),
    reason: text('reason').notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ actorIdx: index('admin_audit_actor_idx').on(t.adminUserId) })
);

/** کدهای دومرحله‌ای ورود ادمین — جدا از otp_codes کاربران نگه داشته می‌شود */
export const adminOtpCodes = pgTable('admin_otp_codes', {
  id: uuid('id').primaryKey().defaultRandom(),
  adminUserId: uuid('admin_user_id').notNull().references(() => adminUsers.id, { onDelete: 'cascade' }),
  code: text('code').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  attempts: integer('attempts').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** ورودهای والدین — فقط نمایش خام، برای بررسی «چند حساب با یک نفر» */
export const userLoginLog = pgTable(
  'user_login_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    ip: text('ip'),
    device: text('device'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ userIdx: index('user_login_log_user_idx').on(t.userId) })
);

/**
 * دفتر اعتبار.
 *
 * سند در §۲ می‌گوید هر اصلاح اعتبار باید ممیزی شود. صرفِ لاگ کافی نیست:
 * بدون دفتر، نمی‌شود گفت موجودی فعلی از کجا آمده. هر تغییر اعتبار — خرید،
 * اصلاح دستی، مصرف — یک ردیف اینجا می‌سازد.
 */
export const creditLedger = pgTable(
  'credit_ledger',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    /** مثبت یعنی افزوده، منفی یعنی کاسته */
    delta: integer('delta').notNull(),
    balanceAfter: integer('balance_after').notNull(),
    /** purchase | admin_adjust | refund */
    source: text('source').notNull(),
    orderId: uuid('order_id').references(() => purchaseRequests.id, { onDelete: 'set null' }),
    adminUserId: uuid('admin_user_id').references(() => adminUsers.id, { onDelete: 'set null' }),
    reason: text('reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ userIdx: index('credit_ledger_user_idx').on(t.userId) })
);

/** گزارش پیامک‌ها — sms.ir وب‌هوک ندارد، وضعیت باید poll شود (§۴) */
export const smsLog = pgTable(
  'sms_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** شناسهٔ بازگشتی sms.ir */
    messageId: text('message_id').unique(),
    recipientMobile: text('recipient_mobile').notNull(),
    templateId: integer('template_id'),
    /** otp | admin_2fa | payment_receipt | renewal_reminder | promo | win_back */
    purpose: text('purpose').notNull(),
    /** queued | sent | delivered | failed | blacklisted */
    status: text('status').notNull().default('queued'),
    deliveryStateCode: integer('delivery_state_code'),
    cost: integer('cost'),
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ statusIdx: index('sms_log_status_idx').on(t.status) })
);
