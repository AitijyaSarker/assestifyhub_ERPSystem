'use client';

import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/layout/page-header';
import { api } from '@/lib/api';

import { useActiveShop } from '@/app/providers';

type Dashboard = {
  today: { sales: string; transactions: number; currency: string };
  month: { sales: string; transactions: number };
  products: number;
  lowStock: number;
  outOfStock: number;
  pendingReturns: number;
  shops: number;
  activeUsers: number;
  trend: { date: string; revenue: string; profit: string }[];
};

export default function DashboardPage() {
  const { activeShopId, activeShop, isAllShops, isSuperAdmin, shops, setActiveShopId } = useActiveShop();
  const [metrics, setMetrics] = useState<Dashboard | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    setIsAdmin((JSON.parse(localStorage.getItem('roles') ?? '[]') as string[]).includes('SUPER_ADMIN'));
  }, []);

  useEffect(() => {
    const query = activeShopId ? `?shopId=${encodeURIComponent(activeShopId)}` : '';
    api<Dashboard>(`/reports/dashboard${query}`)
      .then((result) => setMetrics(result.data))
      .catch(() => undefined);
  }, [activeShopId]);

  const maxRevenue = Math.max(...(metrics?.trend ?? []).map((point) => Number(point.revenue)), 1);

  return (
    <div className="space-y-5">
      <PageHeader
        title={activeShop ? `Good morning · ${activeShop.name}` : 'Good morning, operations'}
        subtitle={
          activeShop
            ? `Live view of sales, inventory, and transactions scoped to ${activeShop.name} (${activeShop.code}).`
            : 'A live network view of sales, inventory, and transactions across all accessible shops.'
        }
        actions={
          <div className="flex items-center gap-2">
            {isSuperAdmin && (
              <select
                className="rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-xs font-semibold text-slate-800 shadow-sm outline-none"
                value={isAllShops ? 'ALL' : (activeShopId ?? '')}
                onChange={(e) => setActiveShopId(e.target.value === 'ALL' ? null : e.target.value)}
              >
                <option value="ALL">🌐 All Shops (Network)</option>
                {shops.map((s) => (
                  <option key={s.id} value={s.id}>
                    🏬 {s.name} ({s.code})
                  </option>
                ))}
              </select>
            )}
            <a href="/pos" className="rounded-xl bg-[var(--mint)] px-4 py-2.5 text-sm font-semibold text-white shadow-sm">
              Open POS
            </a>
          </div>
        }
      />
      <section className="rounded-3xl bg-[var(--navy)] p-6 text-white shadow-sm sm:p-8">
        <div className="flex items-center justify-between">
          <p className="text-xs uppercase tracking-[0.2em] text-white/50">
            {activeShop ? `Live Workspace — ${activeShop.name}` : 'Live Network Overview'}
          </p>
          <span className="rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-300">
            {activeShop ? `Shop ${activeShop.code}` : 'All Shops'}
          </span>
        </div>
        <h2 className="mt-3 max-w-2xl font-display text-3xl font-semibold tracking-tight">
          {activeShop
            ? `Live performance for ${activeShop.name}.`
            : 'A clear view of every sale, shelf, and shop.'}
        </h2>
        <div className="mt-8 grid grid-cols-2 gap-5 border-t border-white/10 pt-5 sm:grid-cols-4">
          <Metric label="Today's sales" value={metrics ? `${metrics.today.currency} ${metrics.today.sales}` : '...'} />
          <Metric label="Transactions" value={String(metrics?.today.transactions ?? '...')} />
          <Metric label="Low stock" value={String(metrics?.lowStock ?? '...')} />
          <Metric label="Open returns" value={String(metrics?.pendingReturns ?? '...')} />
        </div>
      </section>
      <section className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-display text-lg font-semibold text-[var(--navy)]">Revenue and profit</h3>
            <p className="mt-1 text-xs text-[var(--muted)]">
              {activeShop ? `Last seven sales days for ${activeShop.name}` : 'Last seven completed sales days'}
            </p>
          </div>
          <div className="flex gap-3 text-xs text-[var(--muted)]">
            <span>
              <i className="mr-1 inline-block h-2 w-2 rounded-full bg-[var(--mint)]" />Revenue
            </span>
            <span>
              <i className="mr-1 inline-block h-2 w-2 rounded-full bg-[var(--navy)]" />Profit
            </span>
          </div>
        </div>
        <div className="mt-8 flex h-52 items-end gap-2 border-b border-[var(--line)] sm:gap-5">
          {(metrics?.trend ?? []).map((point) => (
            <div
              key={point.date}
              className="flex h-full flex-1 items-end gap-1"
              title={`${point.date}: revenue ${point.revenue}, profit ${point.profit}`}
            >
              <div
                className="w-1/2 rounded-t bg-[var(--mint)]"
                style={{ height: `${Math.max(4, (Number(point.revenue) / maxRevenue) * 100)}%` }}
              />
              <div
                className="w-1/2 rounded-t bg-[var(--navy)]"
                style={{ height: `${Math.max(4, (Number(point.profit) / maxRevenue) * 100)}%` }}
              />
            </div>
          ))}
        </div>
        <div className="mt-3 flex justify-between text-[10px] uppercase tracking-wider text-[var(--muted)]">
          {(metrics?.trend ?? []).map((point) => (
            <span key={point.date}>{point.date.slice(5)}</span>
          ))}
        </div>
      </section>
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Summary
          label="Monthly sales"
          value={metrics?.month.sales ?? '...'}
          detail={`${metrics?.month.transactions ?? '...'} transactions`}
        />
        <Summary label="Current stock" value={String(metrics?.products ?? '...')} detail="Catalog items" />
        <Summary label="Out of stock" value={String(metrics?.outOfStock ?? '...')} detail="Needs replenishment" />
        <Summary
          label={isAdmin ? 'Active users' : 'Assigned shop'}
          value={String(isAdmin ? metrics?.activeUsers ?? '...' : activeShop?.name ?? metrics?.shops ?? '...')}
          detail={isAdmin ? `${metrics?.shops ?? '...'} active shops` : 'Your accessible workspace'}
        />
      </section>
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <a href="/pos" className="rounded-2xl border border-[var(--line)] bg-white p-4 text-sm font-semibold hover:border-slate-400 transition">
          Start a sale <span className="float-right">→</span>
        </a>
        <a href="/inventory" className="rounded-2xl border border-[var(--line)] bg-white p-4 text-sm font-semibold hover:border-slate-400 transition">
          Review stock <span className="float-right">→</span>
        </a>
        <a href="/transfers" className="rounded-2xl border border-[var(--line)] bg-white p-4 text-sm font-semibold hover:border-slate-400 transition">
          Stock transfers <span className="float-right">→</span>
        </a>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) { return <div><p className="text-2xl font-semibold">{value}</p><p className="mt-1 text-xs text-white/45">{label}</p></div>; }
function Summary({ label, value, detail }: { label: string; value: string; detail: string }) { return <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5"><p className="text-xs text-[var(--muted)]">{label}</p><strong className="mt-2 block text-2xl text-[var(--navy)]">{value}</strong><p className="mt-1 text-xs text-[var(--muted)]">{detail}</p></div>; }
