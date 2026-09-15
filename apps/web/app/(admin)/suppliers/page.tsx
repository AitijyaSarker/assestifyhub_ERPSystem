'use client';

import { FormEvent, useEffect, useState } from 'react';
import { PageHeader } from '@/components/layout/page-header';
import { api } from '@/lib/api';

type Supplier = { id: string; name: string; company?: string; phone?: string; email?: string; address?: string; outstandingAmount: string };

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [form, setForm] = useState({ name: '', company: '', phone: '', email: '', address: '', notes: '' });
  const [message, setMessage] = useState('');

  async function load() {
    const result = await api<Supplier[]>('/suppliers');
    setSuppliers(result.data ?? []);
  }

  useEffect(() => { load().catch(() => setMessage('Unable to load suppliers')); }, []);

  async function create(event: FormEvent) {
    event.preventDefault();
    try {
      await api('/suppliers', { method: 'POST', body: JSON.stringify(form) });
      setForm({ name: '', company: '', phone: '', email: '', address: '', notes: '' });
      setMessage('Supplier created');
      await load();
    } catch (error) {
      setMessage((error as Error).message);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Suppliers" subtitle="Manage suppliers used by purchasing and stock receiving." />
      <form onSubmit={create} className="grid gap-2 rounded-xl bg-white p-5 shadow-sm md:grid-cols-3">
        <input required className="rounded-lg border px-3 py-2 text-sm" placeholder="Supplier name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input className="rounded-lg border px-3 py-2 text-sm" placeholder="Company" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
        <input className="rounded-lg border px-3 py-2 text-sm" placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        <input type="email" className="rounded-lg border px-3 py-2 text-sm" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <input className="rounded-lg border px-3 py-2 text-sm" placeholder="Address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
        <input className="rounded-lg border px-3 py-2 text-sm" placeholder="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        <button className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white md:col-span-3">Add supplier</button>
      </form>
      <section className="rounded-xl bg-white p-5 shadow-sm">
        {suppliers.map((supplier) => <div key={supplier.id} className="flex flex-wrap justify-between gap-3 border-b py-3 last:border-0"><div><strong>{supplier.name}</strong><p className="text-sm text-slate-500">{supplier.company || 'Independent supplier'}{supplier.phone ? ` · ${supplier.phone}` : ''}</p></div><div className="text-right text-sm"><div>{supplier.email || 'No email'}</div><div className="text-slate-500">Outstanding: {supplier.outstandingAmount}</div></div></div>)}
        {!suppliers.length ? <p className="text-sm text-slate-500">No suppliers found.</p> : null}
        {message ? <p className="mt-3 text-sm text-slate-500">{message}</p> : null}
      </section>
    </div>
  );
}
