# پنل قصه‌یار — پنل عملیات پشتیبانی، مالی و محتوا

پروژهٔ مستقل. کدبیس جدا، کانتینر جدا، چرخهٔ انتشار جدا — طبق §۱ سند
`admin-support-panel-spec`: «تا آسیب‌پذیری اپ عمومی مستقیماً به پنل ادمین
راه پیدا نکند».

آدرس: `admin.gheseyar.ir`

## معماری

```
edge (nginx، در استک لندینگ، پورت ۸۰ و ۴۴۳)
  ├── gheseyar.ir        → landing
  ├── app.gheseyar.ir    → web      (استک gheseyar)
  └── admin.gheseyar.ir  → admin    (همین پروژه)

admin ──┐
web   ──┴── db (Postgres، در استک gheseyar)
```

سه استک مستقل روی یک سرور. خاموش شدن هرکدام، دو تای دیگر را نمی‌خواباند.

## دیتابیس

پنل روی **همان دیتابیس اپ** کار می‌کند ولی مالک اسکیما نیست.
همهٔ مهاجرت‌ها در مخزن `gheseyar` زندگی می‌کنند (`deploy/sql/*.sql`).
`src/db/schema.ts` اینجا فقط آینهٔ تایپی است و باید با آن مخزن هم‌گام بماند —
بالای فایل‌های آینه‌ای یادداشت هشدار گذاشته شده.

## توسعهٔ محلی

```bash
npm install
cp .env.example .env.local     # DATABASE_URL را به دیتابیس محلی وصل کنید
npm run dev                    # http://localhost:3200
```

## استقرار

مسیر روی سرور: `/opt/gheseyar-admin`

```bash
# فقط بار اول — شبکهٔ مشترک دسترسی به دیتابیس
docker network create gheseyar-db

cd /opt/gheseyar-admin
docker compose up -d --build
```

انتشار نسخهٔ تازه:

```bash
cd /opt/gheseyar-admin && git pull && docker compose up -d --build
```

نه اپ والدین قطع می‌شود، نه سایت اصلی.

## ساخت کاربر پنل

```bash
 gy admin-add --username armin --name "آرمین زارع" \
   --mobile 09195345339 --role SUPERADMIN --password 'رمز-قوی'
```

با یک فاصله در ابتدای خط شروع کنید تا رمز در تاریخچهٔ شل نماند.

نقش‌ها: `SUPERADMIN` · `SUPPORT` · `FINANCE` · `CONTENT`

## نکته‌های امنیتی

- رمز با bcrypt (۱۲ round) هش می‌شود
- ورود دومرحله‌ای با کد پیامکی به موبایل ثبت‌شدهٔ ادمین
- پنج تلاش ناموفق → قفل پانزده‌دقیقه‌ای + پیامک به سوپرادمین
- بعد از دو تلاش ناموفق، ARCaptcha
- پیام خطای ورود همیشه یکسان است
- نشست بیست‌دقیقه‌ای، کوکی و رمز امضای جدا از اپ والدین
- هر اقدام حساس، ردیف ممیزی با دلیل اجباری در `admin_audit_log`
- `noindex` در هدر Next و در nginx
