'use client';

import { FormEvent, useEffect, useState } from 'react';
import { PageHeader } from '@/components/layout/page-header';
import { api } from '@/lib/api';

type Customer = { id: string; name: string; phone?: string; email?: string; address?: string; createdAt: string };

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({ name: '', phone: '', email: '', address: '' });
  const [message, setMessage] = useState('');

  async function load(value = search) {
    const result = await api<Customer[]>(`/customers${value ? `?search=${encodeURIComponent(value)}` : ''}`);
    setCustomers(result.data ?? []);
  }

  useEffect(() => { load().catch(() => setMessage('Unable to load customers')); }, []);

  async function create(event: FormEvent) {
    event.preventDefault();
    try {
      await api('/customers', { method: 'POST', body: JSON.stringify(form) });
      setForm({ name: '', phone: '', email: '', address: '' });
      setMessage('Customer created');
      await load();
    } catch (error) {
      setMessage((error as Error).message);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Customers" subtitle="Manage customer records and make them available at the POS." />
      <form onSubmit={create} className="grid gap-2 rounded-xl bg-white p-5 shadow-sm md:grid-cols-4">
        <input required className="rounded-lg border px-3 py-2 text-sm" placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input className="rounded-lg border px-3 py-2 text-sm" placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        <input type="email" className="rounded-lg border px-3 py-2 text-sm" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <input className="rounded-lg border px-3 py-2 text-sm" placeholder="Address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
        <button className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white md:col-span-4">Add customer</button>
      </form>
      <section className="space-y-3 rounded-xl bg-white p-5 shadow-sm">
        <div className="flex gap-2"><input className="flex-1 rounded-lg border px-3 py-2 text-sm" placeholder="Search name or phone" value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); load().catch(() => setMessage('Unable to search customers')); } }} /><button className="rounded-lg border px-4 py-2 text-sm" onClick={() => load().catch(() => setMessage('Unable to search customers'))}>Search</button></div>
        {customers.map((customer) => <div key={customer.id} className="flex flex-wrap justify-between gap-3 border-b py-3 last:border-0"><div><strong>{customer.name}</strong><p className="text-sm text-slate-500">{customer.phone || 'No phone'}{customer.email ? ` · ${customer.email}` : ''}</p></div><span className="text-sm text-slate-500">{customer.address || 'No address'}</span></div>)}
        {!customers.length ? <p className="text-sm text-slate-500">No customers found.</p> : null}
        {message ? <p className="text-sm text-slate-500">{message}</p> : null}
      </section>
    </div>
  );
}
