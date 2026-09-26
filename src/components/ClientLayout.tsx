'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { Navigation } from '@/components/Navigation';

export function ClientLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuthPage =
    pathname === '/login' ||
    pathname === '/verify-email' ||
    pathname.startsWith('/auth/') ||
    pathname === '/reset-password';

  if (isAuthPage) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-slate-100">
        {children}
      </div>
    );
  }

  return (
    <>
      <Navigation />
      <main className="flex-1 max-w-[1440px] w-full mx-auto p-4 sm:p-6 lg:p-8">
        {children}
      </main>
    </>
  );
}
