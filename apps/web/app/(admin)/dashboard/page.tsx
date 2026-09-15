'use client';

import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/layout/page-header';
import { api } from '@/lib/api';

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
  const [metrics, setMetrics] = useState<Dashboard | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => { setIsAdmin((JSON.parse(localStorage.getItem('roles') ?? '[]') as string[]).includes('SUPER_ADMIN')); }, []);
  useEffect(() => { api<Dashboard>('/reports/dashboard').then((result) => setMetrics(result.data)).catch(() => undefined); }, []);
  const maxRevenue = Math.max(...(metrics?.trend ?? []).map((point) => Number(point.revenue)), 1);
  return (
    <div className="space-y-5">
      <PageHeader title="Good morning, admin" subtitle="A live view of sales, inventory, returns, and profit across your retail network." actions={<a href="/pos" className="rounded-xl bg-[var(--mint)] px-4 py-2.5 text-sm font-semibold text-white">Open POS</a>} />
      <section className="rounded-3xl bg-[var(--navy)] p-6 text-white shadow-sm sm:p-8">
        <p className="text-xs uppercase tracking-[0.2em] text-white/50">Live workspace</p>
        <h2 className="mt-3 max-w-2xl font-display text-3xl font-semibold tracking-tight">A clear view of every sale, shelf, and shop.</h2>
        <div className="mt-8 grid grid-cols-2 gap-5 border-t border-white/10 pt-5 sm:grid-cols-4">
          <Metric label="Today's sales" value={metrics ? `${metrics.today.currency} ${metrics.today.sales}` : '...'} />
          <Metric label="Transactions" value={String(metrics?.today.transactions ?? '...')} />
          <Metric label="Low stock" value={String(metrics?.lowStock ?? '...')} />
          <Metric label="Open returns" value={String(metrics?.pendingReturns ?? '...')} />
        </div>
      </section>
      <section className="rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-6 shadow-sm">
        <div className="flex items-center justify-between"><div><h3 className="font-display text-lg font-semibold text-[var(--navy)]">Revenue and profit</h3><p className="mt-1 text-xs text-[var(--muted)]">Last seven completed sales days</p></div><div className="flex gap-3 text-xs text-[var(--muted)]"><span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-[var(--mint)]" />Revenue</span><span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-[var(--navy)]" />Profit</span></div></div>
        <div className="mt-8 flex h-52 items-end gap-2 border-b border-[var(--line)] sm:gap-5">{(metrics?.trend ?? []).map((point) => <div key={point.date} className="flex h-full flex-1 items-end gap-1" title={`${point.date}: revenue ${point.revenue}, profit ${point.profit}`}><div className="w-1/2 rounded-t bg-[var(--mint)]" style={{ height: `${Math.max(4, Number(point.revenue) / maxRevenue * 100)}%` }} /><div className="w-1/2 rounded-t bg-[var(--navy)]" style={{ height: `${Math.max(4, Number(point.profit) / maxRevenue * 100)}%` }} /></div>)}</div>
        <div className="mt-3 flex justify-between text-[10px] uppercase tracking-wider text-[var(--muted)]">{(metrics?.trend ?? []).map((point) => <span key={point.date}>{point.date.slice(5)}</span>)}</div>
      </section>
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Summary label="Monthly sales" value={metrics?.month.sales ?? '...'} detail={`${metrics?.month.transactions ?? '...'} transactions`} /><Summary label="Current stock" value={String(metrics?.products ?? '...')} detail="Catalog items" /><Summary label="Out of stock" value={String(metrics?.outOfStock ?? '...')} detail="Needs replenishment" /><Summary label={isAdmin ? 'Active users' : 'Assigned shops'} value={String(isAdmin ? metrics?.activeUsers ?? '...' : metrics?.shops ?? '...')} detail={isAdmin ? `${metrics?.shops ?? '...'} active shops` : 'Your accessible workspace'} /></section>
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><a href="/pos" className="rounded-2xl border border-[var(--line)] bg-white p-4 text-sm font-semibold">Start a sale <span className="float-right">→</span></a><a href="/inventory" className="rounded-2xl border border-[var(--line)] bg-white p-4 text-sm font-semibold">Review stock <span className="float-right">→</span></a><a href="/returns" className="rounded-2xl border border-[var(--line)] bg-white p-4 text-sm font-semibold">Review returns <span className="float-right">→</span></a></section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) { return <div><p className="text-2xl font-semibold">{value}</p><p className="mt-1 text-xs text-white/45">{label}</p></div>; }
function Summary({ label, value, detail }: { label: string; value: string; detail: string }) { return <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5"><p className="text-xs text-[var(--muted)]">{label}</p><strong className="mt-2 block text-2xl text-[var(--navy)]">{value}</strong><p className="mt-1 text-xs text-[var(--muted)]">{detail}</p></div>; }
