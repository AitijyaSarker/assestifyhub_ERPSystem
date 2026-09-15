'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useCurrencyPreferences } from '@/app/providers';

const adminLinks = [
  ['/dashboard', 'Dashboard'],
  ['/products', 'Products'],
  ['/customers', 'Customers'],
  ['/suppliers', 'Suppliers'],
  ['/inventory', 'Inventory'],
  ['/transfers', 'Transfers'],
  ['/purchases', 'Purchases'],
  ['/pos', 'POS'],
  ['/sales', 'Sales'],
  ['/returns', 'Returns'],
  ['/shops', 'Shops'],
  ['/users', 'Users'],
  ['/reports', 'Reports'],
  ['/security', 'Security'],
  ['/audit', 'Audit'],
  ['/backup', 'Backups'],
  ['/settings', 'Settings'],
] as const;

const shopLinks = [
  ['/dashboard', 'Dashboard'],
  ['/pos', 'POS'],
  ['/sales', 'Sales'],
  ['/returns', 'Returns'],
  ['/notifications', 'Notifications'],
  ['/account', 'My Account'],
  ['/security', 'Security'],
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const { activeCurrency } = useCurrencyPreferences();
  const [links, setLinks] = useState<readonly (readonly [string, string])[]>(adminLinks);

  useEffect(() => {
    const roles = JSON.parse(localStorage.getItem('roles') ?? '[]') as string[];
    setLinks(roles.includes('SUPER_ADMIN') ? adminLinks : shopLinks);
  }, []);

  async function logout() {
    try {
      await api('/auth/logout', { method: 'POST' });
    } catch {
      /* ignore */
    }
    localStorage.removeItem('accessToken');
    localStorage.removeItem('roles');
    router.push('/login');
  }
  return (
    <div className="min-h-screen bg-[var(--canvas)] lg:grid lg:grid-cols-[248px_1fr]">
      <aside className="bg-[var(--navy)] px-5 py-6 text-white lg:min-h-screen">
        <div className="flex items-center justify-between lg:mb-12">
          <Link href="/dashboard" className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#dff2ec] text-sm font-bold text-[var(--navy)]">R</span>
            <span>
              <span className="block font-display text-base font-semibold tracking-tight">RetailOS</span>
              <span className="block text-[10px] uppercase tracking-[0.18em] text-white/45">Operations</span>
            </span>
          </Link>
          <span className="rounded-full border border-white/10 px-2 py-1 text-[10px] text-white/45 lg:hidden">HQ01</span>
        </div>
        <div className="mb-3 hidden text-[10px] font-semibold uppercase tracking-[0.2em] text-white/35 lg:block">Workspace</div>
        <nav className="flex gap-1 overflow-x-auto pb-1 text-sm lg:flex-col lg:overflow-visible">
          {links.map(([href, label]) => (
            <Link
              key={href}
              href={href}
              className={`whitespace-nowrap rounded-xl px-3 py-2.5 transition-colors ${path === href ? 'bg-[#dff2ec] font-semibold text-[var(--navy)]' : 'text-white/65 hover:bg-white/10 hover:text-white'}`}
            >
              {label}
            </Link>
          ))}
        </nav>
        <div className="mt-10 hidden rounded-2xl border border-white/10 bg-white/5 p-4 lg:block">
          <div className="mb-3 flex items-center justify-between"><span className="text-xs font-semibold">Headquarters</span><span className="h-2 w-2 rounded-full bg-[#7ed7a5]" /></div>
          <p className="text-xs leading-5 text-white/45">All systems operational. Your inventory is synced.</p>
        </div>
        <div className="mt-6 flex flex-col gap-3">
          <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[11px] uppercase tracking-[0.2em] text-white/60">
            {activeCurrency}
          </div>
          <button className="text-left text-xs text-white/45 transition-colors hover:text-white" onClick={logout}>
            Sign out
          </button>
        </div>
      </aside>
      <main className="min-w-0 px-4 py-5 sm:px-6 lg:px-10 lg:py-8"><div className="mx-auto max-w-[1440px]">{children}</div></main>
    </div>
  );
}
