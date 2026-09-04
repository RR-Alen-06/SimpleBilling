import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { ClientLayout } from '@/components/ClientLayout';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'PrintPro ERP - Billing & Shop Management',
  description: 'Fast, simple billing software for Xerox and stationery shops',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="light">
      <head>
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap" />
      </head>
      <body className={`${inter.className} bg-background text-on-surface min-h-screen flex flex-col antialiased selection:bg-secondary-fixed-dim`}>
        <ClientLayout>{children}</ClientLayout>
      </body>
    </html>
  );
}
