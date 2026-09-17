'use client';

import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/layout/page-header';
import { api } from '@/lib/api';
import { useActiveShop } from '@/app/providers';

type SaleRow = {
  id: string;
  receiptNumber: string;
  grandTotal: string;
  currency: string;
  status: string;
  createdAt: string;
  shop?: { id: string; name: string; code: string };
  cashier?: { id: string; fullName: string; email: string };
};

export default function SalesPage() {
  const { shops, activeShopId, isSuperAdmin } = useActiveShop();
  const [rows, setRows] = useState<SaleRow[]>([]);
  const [selectedShopId, setSelectedShopId] = useState<string>('');
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (activeShopId) {
      setSelectedShopId(activeShopId);
    } else {
      setSelectedShopId('');
    }
  }, [activeShopId]);

  useEffect(() => {
    setLoading(true);
    const query = new URLSearchParams({
      ...(selectedShopId ? { shopId: selectedShopId } : {}),
      ...(search ? { search: search.trim() } : {}),
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
    });

    api<SaleRow[]>(`/sales?${query.toString()}`)
      .then((r) => setRows(r.data ?? []))
      .catch((err) => {
        console.error('Failed to load sales', err);
        setRows([]);
      })
      .finally(() => setLoading(false));
  }, [selectedShopId, search, from, to]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Sales Transactions"
        subtitle="Auditable record of all completed point-of-sale transactions scoped per shop."
      />

      <div className="flex flex-wrap items-center gap-3 rounded-xl bg-white p-4 shadow-sm">
        <div className="min-w-[180px]">
          <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">Filter by Shop</label>
          <select
            className="w-full rounded-lg border px-3 py-2 text-sm"
            value={selectedShopId}
            onChange={(e) => setSelectedShopId(e.target.value)}
          >
            {isSuperAdmin && <option value="">🌐 All Shops (Global Network)</option>}
            {shops.map((s) => (
              <option key={s.id} value={s.id}>
                🏬 {s.name} ({s.code})
              </option>
            ))}
          </select>
        </div>

        <div className="flex-1 min-w-[200px]">
          <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">Search</label>
          <input
            className="w-full rounded-lg border px-3 py-2 text-sm"
            placeholder="Receipt # or customer name"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">From Date</label>
          <input
            type="date"
            className="rounded-lg border px-3 py-2 text-sm"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">To Date</label>
          <input
            type="date"
            className="rounded-lg border px-3 py-2 text-sm"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>

        {(search || from || to) && (
          <div className="self-end">
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setFrom('');
                setTo('');
              }}
              className="rounded-lg border border-slate-300 bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200 transition"
            >
              Clear Filters
            </button>
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-xl bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-slate-50 text-xs font-semibold uppercase text-slate-600">
            <tr>
              <th className="p-3.5">Receipt #</th>
              <th className="p-3.5">Shop</th>
              <th className="p-3.5">Cashier</th>
              <th className="p-3.5">Total Amount</th>
              <th className="p-3.5">Status</th>
              <th className="p-3.5">Date & Time</th>
            </tr>
          </thead>
          <tbody className="divide-y text-slate-700">
            {loading ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-sm text-slate-400">
                  Loading sales records...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-sm text-slate-400">
                  No sales found for the selected shop and date range.
                </td>
              </tr>
            ) : (
              rows.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="p-3.5 font-semibold text-slate-900">{s.receiptNumber}</td>
                  <td className="p-3.5">
                    {s.shop ? (
                      <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-800">
                        🏬 {s.shop.name}
                        <span className="text-[10px] text-slate-500">({s.shop.code})</span>
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                  <td className="p-3.5 text-xs text-slate-600">{s.cashier?.fullName ?? 'Cashier'}</td>
                  <td className="p-3.5 font-semibold text-slate-900">
                    {s.currency} {Number(s.grandTotal).toFixed(2)}
                  </td>
                  <td className="p-3.5">
                    <span
                      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        s.status === 'COMPLETED'
                          ? 'bg-emerald-100 text-emerald-800'
                          : s.status === 'VOIDED'
                          ? 'bg-rose-100 text-rose-800'
                          : 'bg-slate-100 text-slate-800'
                      }`}
                    >
                      {s.status}
                    </span>
                  </td>
                  <td className="p-3.5 text-xs text-slate-500">
                    {s.createdAt ? new Date(s.createdAt).toLocaleString() : '—'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
