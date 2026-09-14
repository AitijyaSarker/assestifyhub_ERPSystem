'use client';

import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/layout/page-header';
import { api } from '@/lib/api';

export default function SalesPage() {
  const [rows, setRows] = useState<{ id: string; receiptNumber: string; grandTotal: string; currency: string; status: string }[]>([]);
  useEffect(() => {
    api<typeof rows>('/sales').then((r) => setRows(r.data)).catch(console.error);
  }, []);
  return (
    <div>
      <PageHeader title="Sales" />
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
