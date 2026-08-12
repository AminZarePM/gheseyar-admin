import type { Metadata, Viewport } from 'next';
import Toaster from '@/components/toast';
import './globals.css';

export const metadata: Metadata = {
  title: 'پنل قصه‌یار',
  description: 'پنل عملیات پشتیبانی، مالی و محتوا',
  robots: { index: false, follow: false, nocache: true },
};

export const viewport: Viewport = {
  themeColor: '#fdfbf7',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fa" dir="rtl">
      <body>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
