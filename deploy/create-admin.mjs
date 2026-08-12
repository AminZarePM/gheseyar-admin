/**
 * ساخت یا به‌روزرسانی یک کاربر پنل.
 *
 * اجرا از داخل کانتینر، چون فقط آنجا به دیتابیس و متغیرهای محیطی دسترسی هست:
 *   docker compose exec -T web node /app/deploy/create-admin.mjs \
 *     --username armin --name "آرمین زارع" --mobile 09195345339 \
 *     --role SUPERADMIN --password 'رمز-قوی'
 *
 * رمز هرگز در تاریخچهٔ شل نماند: با فاصله شروعش کنید یا از --password-stdin استفاده کنید.
 */
import bcrypt from 'bcryptjs';
import postgres from 'postgres';

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > -1 ? process.argv[i + 1] : d;
};

const username = (arg('username') ?? '').trim().toLowerCase();
const fullName = arg('name');
const mobile = (arg('mobile') ?? '').replace(/\D/g, '');
const role = (arg('role') ?? 'SUPERADMIN').toUpperCase();
let password = arg('password');

if (process.argv.includes('--password-stdin')) {
  password = (await new Promise((res) => {
    let d = '';
    process.stdin.on('data', (c) => (d += c));
    process.stdin.on('end', () => res(d));
  })).trim();
}

const ROLES = ['SUPERADMIN', 'SUPPORT', 'FINANCE', 'CONTENT'];
if (!username || !fullName || !mobile || !password) {
  console.error('استفاده: --username --name --mobile --role --password');
  process.exit(1);
}
if (!ROLES.includes(role)) {
  console.error(`نقش باید یکی از این‌ها باشد: ${ROLES.join(', ')}`);
  process.exit(1);
}
if (password.length < 10) {
  console.error('رمز باید دست‌کم ۱۰ کاراکتر باشد.');
  process.exit(1);
}
if (!/^09\d{9}$/.test(mobile)) {
  console.error('شمارهٔ موبایل باید ۱۱ رقم و با ۰۹ شروع شود.');
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL, { max: 1 });
const hash = await bcrypt.hash(password, 12);

const [row] = await sql`
  insert into admin_users (username, password_hash, full_name, mobile, role)
  values (${username}, ${hash}, ${fullName}, ${mobile}, ${role})
  on conflict (username) do update
    set password_hash = excluded.password_hash,
        full_name     = excluded.full_name,
        mobile        = excluded.mobile,
        role          = excluded.role,
        is_active     = true,
        failed_attempts = 0,
        locked_until  = null
  returning id, username, role
`;

console.log(`ادمین ساخته/به‌روز شد: ${row.username} · ${row.role} · ${row.id}`);
await sql.end();
