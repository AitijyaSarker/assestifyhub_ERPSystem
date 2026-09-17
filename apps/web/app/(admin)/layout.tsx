'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { usePathname } from 'next/navigation';
import { AppShell } from '@/components/layout/app-shell';

const shopPaths = new Set(['/dashboard', '/pos', '/sales', '/inventory', '/transfers', '/returns', '/notifications', '/account', '/security']);

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const token = localStorage.getItem('accessToken');
    if (!token) {
      router.replace('/login');
      return;
    }

    const roles = JSON.parse(localStorage.getItem('roles') ?? '[]') as string[];
    if (!roles.includes('SUPER_ADMIN') && !shopPaths.has(pathname)) {
      router.replace('/dashboard');
    }
  }, [pathname, router]);

  return <AppShell>{children}</AppShell>;
}
