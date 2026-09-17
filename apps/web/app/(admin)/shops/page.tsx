'use client';

import { FormEvent, useEffect, useState } from 'react';
import { PageHeader } from '@/components/layout/page-header';
import { api } from '@/lib/api';
import { useActiveShop } from '@/app/providers';

export default function ShopsPage() {
  const { isSuperAdmin } = useActiveShop();
  const [rows, setRows] = useState<{ id: string; name: string; code: string }[]>([]);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [prefix, setPrefix] = useState('');
  useEffect(() => {
    api<typeof rows>('/shops').then((r) => setRows(r.data));
  }, []);
  async function create(e: FormEvent) {
    e.preventDefault();
    await api('/shops', { method: 'POST', body: JSON.stringify({ name, code, invoicePrefix: prefix }) });
    setRows((await api<typeof rows>('/shops')).data);
  }
  return (
    <div className="space-y-6">
      <PageHeader title="Shops" subtitle="Manage retail locations and warehouse hubs." />
      {!isSuperAdmin && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center text-red-800">
          <h3 className="mb-2 text-lg font-bold">Access Restricted</h3>
          <p>Only Super Admin can manage shops and locations.</p>
        </div>
      )}
      {isSuperAdmin && (
        <>
          <form onSubmit={create} className="mb-4 flex gap-2">
        <input className="rounded border px-2 py-1" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <input className="rounded border px-2 py-1" placeholder="Code" value={code} onChange={(e) => setCode(e.target.value)} />
        <input className="rounded border px-2 py-1" placeholder="Invoice prefix" value={prefix} onChange={(e) => setPrefix(e.target.value)} />
        <button className="rounded bg-accent px-3 text-white">Add</button>
      </form>
      <ul className="rounded-xl bg-white p-4 shadow-sm">
        {rows.map((s) => (
          <li key={s.id}>
            {s.name} ({s.code})
          </li>
        ))}
      </ul>
        </>
      )}
    </div>
  );
}
