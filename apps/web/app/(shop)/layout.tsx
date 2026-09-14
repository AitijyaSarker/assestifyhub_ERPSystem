'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/layout/app-shell';

export default function ShopLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const token = localStorage.getItem('accessToken');
    const roles = JSON.parse(localStorage.getItem('roles') ?? '[]') as string[];

    if (!token) {
      router.replace('/login');
      return;
    }

    if (roles.includes('SUPER_ADMIN')) {
      router.replace('/dashboard');
    }
  }, [router]);

  return <AppShell>{children}</AppShell>;
}
