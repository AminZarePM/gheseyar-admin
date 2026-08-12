import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="gy-page mx-auto grid min-h-[80dvh] max-w-[420px] place-items-center px-4">
      <div className="text-center">
        <h1 className="text-xl">این صفحه در پنل وجود ندارد</h1>
        <Link href="/" className="gy-btn mt-5 block no-underline">بازگشت به پنل</Link>
      </div>
    </main>
  );
}
