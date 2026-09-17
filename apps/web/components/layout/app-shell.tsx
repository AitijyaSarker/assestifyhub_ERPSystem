'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useCurrencyPreferences, useActiveShop } from '@/app/providers';

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
  ['/inventory', 'Inventory'],
  ['/transfers', 'Transfers'],
  ['/returns', 'Returns'],
  ['/notifications', 'Notifications'],
  ['/account', 'My Account'],
  ['/security', 'Security'],
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const { activeCurrency } = useCurrencyPreferences();
  const { shops, activeShopId, activeShop, isAllShops, isSuperAdmin, setActiveShopId } = useActiveShop();
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
          <span className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] font-semibold text-white/70 lg:hidden">
            {activeShop ? activeShop.code : isAllShops ? 'ALL' : 'SHOP'}
          </span>
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

        {/* Dynamic Shop Selector & Status */}
        <div className="mt-8 hidden rounded-2xl border border-white/10 bg-white/5 p-3.5 lg:block">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-white/50">Current Shop</span>
            <span className="flex items-center gap-1.5 text-[10px] text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Live
            </span>
          </div>
          <select
            className="w-full rounded-lg border border-white/20 bg-slate-800/80 px-2.5 py-1.5 text-xs font-medium text-white outline-none transition focus:border-white/50"
            value={isAllShops ? 'ALL' : (activeShopId ?? '')}
            onChange={(e) => setActiveShopId(e.target.value === 'ALL' ? null : e.target.value)}
          >
            {isSuperAdmin && (
              <option value="ALL">All Shops (Combined)</option>
            )}
            {shops.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.code})
              </option>
            ))}
          </select>
          <p className="mt-2 text-[11px] leading-4 text-white/45">
            {activeShop
              ? `Operating in ${activeShop.name} (${activeShop.code}).`
              : isAllShops
              ? 'Viewing cross-network aggregated transactions.'
              : 'Select a shop to begin transactions.'}
          </p>
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
