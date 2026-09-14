'use client';

import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/layout/page-header';
import { api } from '@/lib/api';

export default function ReportsPage() {
  const [data, setData] = useState<{ byCurrency: Record<string, { count: number; grandTotal: string }>; note: string } | null>(null);
  const [dimensions, setDimensions] = useState<{ byShop: Record<string, { count: number; total: string }>; byCashier: Record<string, { count: number; total: string }>; byPaymentMethod: Record<string, { count: number; total: string }>; byProduct: Record<string, { quantity: string; total: string }>; byCategory: Record<string, { quantity: string; total: string }> } | null>(null);
  const [inventory, setInventory] = useState<{ valuation: string; damaged: string; lowStock: number; outOfStock: number } | null>(null);
  useEffect(() => {
    api<NonNullable<typeof data>>('/reports/sales').then((r) => setData(r.data)).catch(console.error);
    api<NonNullable<typeof dimensions>>('/reports/sales/dimensions').then((r) => setDimensions(r.data)).catch(() => undefined);
    api<NonNullable<typeof inventory>>('/reports/inventory/summary').then((r) => setInventory(r.data)).catch(() => undefined);
  }, []);

  async function download(format: 'csv' | 'pdf' | 'xlsx') {
    const result = await api<{ filename: string; mimeType: string; contentBase64: string }>(`/reports/sales/export?format=${format}`);
    const bytes = Uint8Array.from(atob(result.data.contentBase64), (character) => character.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: result.data.mimeType }));
    const link = document.createElement('a');
    link.href = url;
    link.download = result.data.filename;
    link.click();
    URL.revokeObjectURL(url);
  }
  return (
    <div>
      <PageHeader title="Reports" subtitle="Historical totals are grouped by currency snapshot. Mismatched currencies are never summed." actions={<div className="flex gap-2"><button className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm" onClick={() => download('csv')}>CSV</button><button className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm" onClick={() => download('xlsx')}>Excel</button><button className="rounded-lg bg-[var(--mint)] px-3 py-2 text-sm font-semibold text-white" onClick={() => download('pdf')}>PDF</button></div>} />
      {data ? (
        <div className="grid gap-4 md:grid-cols-2">
          {Object.entries(data.byCurrency).map(([cur, v]) => (
            <div key={cur} className="rounded-xl bg-white p-6 shadow-sm">
              <div className="text-sm text-slate-500">{cur}</div>
              <div className="text-2xl font-semibold">{v.grandTotal}</div>
              <div className="text-sm">{v.count} sales</div>
            </div>
          ))}
          <p className="text-sm text-slate-500">{data.note}</p>
        </div>
      ) : null}
      {inventory ? <section className="mt-6 grid gap-4 sm:grid-cols-4"><div className="rounded-xl bg-white p-4 shadow-sm"><span className="text-xs text-slate-500">Stock valuation</span><strong className="mt-1 block text-xl">{inventory.valuation}</strong></div><div className="rounded-xl bg-white p-4 shadow-sm"><span className="text-xs text-slate-500">Damaged quantity</span><strong className="mt-1 block text-xl">{inventory.damaged}</strong></div><div className="rounded-xl bg-white p-4 shadow-sm"><span className="text-xs text-slate-500">Low stock</span><strong className="mt-1 block text-xl">{inventory.lowStock}</strong></div><div className="rounded-xl bg-white p-4 shadow-sm"><span className="text-xs text-slate-500">Out of stock</span><strong className="mt-1 block text-xl">{inventory.outOfStock}</strong></div></section> : null}
      {dimensions ? <section className="mt-6 grid gap-4 lg:grid-cols-3"><div className="rounded-xl bg-white p-5 shadow-sm"><h2 className="font-semibold">By shop</h2>{Object.entries(dimensions.byShop).map(([name, value]) => <p key={name} className="mt-2 flex justify-between text-sm"><span>{name}</span><span>{value.total} · {value.count}</span></p>)}</div><div className="rounded-xl bg-white p-5 shadow-sm"><h2 className="font-semibold">By cashier</h2>{Object.entries(dimensions.byCashier).map(([name, value]) => <p key={name} className="mt-2 flex justify-between text-sm"><span>{name}</span><span>{value.total}</span></p>)}</div><div className="rounded-xl bg-white p-5 shadow-sm"><h2 className="font-semibold">Top products</h2>{Object.entries(dimensions.byProduct).sort((a, b) => Number(b[1].quantity) - Number(a[1].quantity)).slice(0, 5).map(([name, value]) => <p key={name} className="mt-2 flex justify-between text-sm"><span>{name}</span><span>{value.quantity}</span></p>)}</div></section> : null}
    </div>
  );
}
