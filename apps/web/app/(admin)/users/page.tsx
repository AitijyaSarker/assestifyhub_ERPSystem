'use client';

import { FormEvent, useEffect, useState } from 'react';
import { PageHeader } from '@/components/layout/page-header';
import { api } from '@/lib/api';

export default function UsersPage() {
  const [rows, setRows] = useState<{ id: string; email: string; fullName: string }[]>([]);
  const [shops, setShops] = useState<{ id: string; name: string }[]>([]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('Password123!');
  const [fullName, setFullName] = useState('');
  const [shopId, setShopId] = useState('');
  useEffect(() => {
    api<typeof rows>('/users').then((r) => setRows(r.data)).catch(console.error);
    api<{ id: string; name: string }[]>('/shops').then((r) => {
      setShops(r.data);
      if (r.data[0]) setShopId(r.data[0].id);
    });
  }, []);
  async function create(e: FormEvent) {
    e.preventDefault();
    await api('/users', {
      method: 'POST',
      body: JSON.stringify({ email, password, fullName, roleName: 'SHOP_USER', shopIds: [shopId] }),
    });
    setRows((await api<typeof rows>('/users')).data);
  }
  return (
    <div>
      <PageHeader title="Users" />
      <form onSubmit={create} className="mb-4 grid grid-cols-4 gap-2">
        <input className="rounded border px-2 py-1" placeholder="Name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
        <input className="rounded border px-2 py-1" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input className="rounded border px-2 py-1" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <select className="rounded border px-2 py-1" value={shopId} onChange={(e) => setShopId(e.target.value)}>
          {shops.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <button className="col-span-4 rounded bg-accent py-2 text-white">Create shop user</button>
      </form>
      <ul className="rounded-xl bg-white p-4 shadow-sm">
        {rows.map((u) => (
          <li key={u.id}>
            {u.fullName} — {u.email}
          </li>
        ))}
      </ul>
    </div>
  );
}
