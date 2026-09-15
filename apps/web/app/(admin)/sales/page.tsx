'use client';

import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/layout/page-header';
import { api } from '@/lib/api';

export default function SalesPage() {
  const [rows, setRows] = useState<{ id: string; receiptNumber: string; grandTotal: string; currency: string; status: string }[]>([]);
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  useEffect(() => { const query = new URLSearchParams({ ...(search ? { search } : {}), ...(from ? { from } : {}), ...(to ? { to } : {}) }); api<typeof rows>(`/sales?${query}`).then((r) => setRows(r.data)).catch(console.error); }, [search, from, to]);
  return (
    <div>
      <PageHeader title="Sales" />
      <div className="mb-4 flex flex-wrap gap-2 rounded-xl bg-white p-4 shadow-sm"><input className="rounded border px-3 py-2 text-sm" placeholder="Receipt or customer" value={search} onChange={(e) => setSearch(e.target.value)} /><input type="date" className="rounded border px-3 py-2 text-sm" value={from} onChange={(e) => setFrom(e.target.value)} /><input type="date" className="rounded border px-3 py-2 text-sm" value={to} onChange={(e) => setTo(e.target.value)} /></div>
      <table className="w-full rounded-xl bg-white text-sm shadow-sm">
        <thead className="bg-slate-100">
          <tr>
            <th className="p-3 text-left">Receipt</th>
            <th>Total</th>
            <th>Currency</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.id} className="border-t">
              <td className="p-3">{s.receiptNumber}</td>
              <td>{s.grandTotal}</td>
              <td>{s.currency}</td>
              <td>{s.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
