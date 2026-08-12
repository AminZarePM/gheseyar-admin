import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

type Db = ReturnType<typeof drizzle<typeof schema>>;

let _db: Db | null = null;

/**
 * اتصال تنبل ساخته می‌شود، نه هنگام import.
 *
 * Next موقع بیلد همهٔ route handlerها را import می‌کند تا page data جمع کند؛
 * اگر همان‌جا به DATABASE_URL نیاز داشته باشیم، بیلد داخل Docker شکست می‌خورد،
 * چون در مرحلهٔ بیلد هنوز متغیرهای محیطی زمانِ اجرا در دسترس نیستند.
 */
function getDb(): Db {
  if (_db) return _db;

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL تعریف نشده است.');

  // در توسعه اتصال روی global نگه داشته می‌شود تا hot-reload اتصال‌ها را زیاد نکند
  const g = globalThis as unknown as { __pg?: ReturnType<typeof postgres> };
  const client = g.__pg ?? postgres(url, { max: 5 });
  if (process.env.NODE_ENV !== 'production') g.__pg = client;

  _db = drizzle(client, { schema });
  return _db;
}

export const db = new Proxy({} as Db, {
  get: (_target, prop, receiver) => Reflect.get(getDb() as object, prop, receiver),
});

export * from './schema';
