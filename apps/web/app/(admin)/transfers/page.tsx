'use client';

import { FormEvent, useEffect, useState } from 'react';
import { PageHeader } from '@/components/layout/page-header';
import { api } from '@/lib/api';

type Shop = { id: string; name: string };
type Product = { name: string; variants: { id: string; sku: string; variantName: string }[] };
type Transfer = { id: string; transferNumber: string; sourceShopId: string; destShopId: string; status: string; items: { productVariantId: string; quantity: string }[] };

export default function TransfersPage() {
  const [shops, setShops] = useState<Shop[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [form, setForm] = useState({ sourceShopId: '', destShopId: '', productVariantId: '', quantity: '1.000' });
  const [message, setMessage] = useState('');

  async function load() {
    const [shopResult, productResult, transferResult] = await Promise.all([api<Shop[]>('/shops'), api<Product[]>('/products'), api<Transfer[]>('/transfers')]);
    setShops(shopResult.data ?? []);
    setProducts(productResult.data ?? []);
    setTransfers(transferResult.data ?? []);
    if (!form.sourceShopId && shopResult.data?.[0]) setForm((current) => ({ ...current, sourceShopId: shopResult.data[0].id, destShopId: shopResult.data[1]?.id ?? '' }));
  }

  useEffect(() => { load().catch(() => setMessage('Unable to load transfers')); }, []);

  async function request(event: FormEvent) {
    event.preventDefault();
    try {
      await api('/transfers', { method: 'POST', body: JSON.stringify({ sourceShopId: form.sourceShopId, destShopId: form.destShopId, items: [{ productVariantId: form.productVariantId, quantity: form.quantity }] }) });
      setMessage('Transfer requested');
      await load();
    } catch (error) { setMessage((error as Error).message); }
  }

  async function transition(id: string, action: 'approve' | 'dispatch' | 'receive') {
    try { await api(`/transfers/${id}/${action}`, { method: 'POST' }); await load(); } catch (error) { setMessage((error as Error).message); }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Stock transfers" subtitle="Move inventory between shops through an auditable request, approval, dispatch, and receipt workflow." />
      <form onSubmit={request} className="grid gap-2 rounded-xl bg-white p-5 shadow-sm md:grid-cols-4">
        <select required className="rounded-lg border px-3 py-2 text-sm" value={form.sourceShopId} onChange={(e) => setForm({ ...form, sourceShopId: e.target.value })}><option value="">Source shop</option>{shops.map((shop) => <option key={shop.id} value={shop.id}>{shop.name}</option>)}</select>
        <select required className="rounded-lg border px-3 py-2 text-sm" value={form.destShopId} onChange={(e) => setForm({ ...form, destShopId: e.target.value })}><option value="">Destination shop</option>{shops.map((shop) => <option key={shop.id} value={shop.id}>{shop.name}</option>)}</select>
        <select required className="rounded-lg border px-3 py-2 text-sm" value={form.productVariantId} onChange={(e) => setForm({ ...form, productVariantId: e.target.value })}><option value="">Product variant</option>{products.flatMap((product) => product.variants.map((variant) => <option key={variant.id} value={variant.id}>{product.name} · {variant.variantName} · {variant.sku}</option>))}</select>
        <input required className="rounded-lg border px-3 py-2 text-sm" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} placeholder="Quantity" />
        <button className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white md:col-span-4">Request transfer</button>
      </form>
      <section className="rounded-xl bg-white p-5 shadow-sm">
        {transfers.map((transfer) => <div key={transfer.id} className="flex flex-wrap items-center justify-between gap-3 border-b py-4 last:border-0"><div><strong>{transfer.transferNumber}</strong><p className="text-sm text-slate-500">{shops.find((shop) => shop.id === transfer.sourceShopId)?.name} → {shops.find((shop) => shop.id === transfer.destShopId)?.name} · {transfer.status}</p></div><div className="flex gap-2">{transfer.status === 'REQUESTED' ? <button className="rounded border px-3 py-1 text-sm" onClick={() => transition(transfer.id, 'approve')}>Approve</button> : null}{transfer.status === 'APPROVED' ? <button className="rounded border px-3 py-1 text-sm" onClick={() => transition(transfer.id, 'dispatch')}>Dispatch</button> : null}{transfer.status === 'DISPATCHED' ? <button className="rounded border px-3 py-1 text-sm" onClick={() => transition(transfer.id, 'receive')}>Receive</button> : null}</div></div>)}
        {!transfers.length ? <p className="text-sm text-slate-500">No transfers found.</p> : null}
        {message ? <p className="mt-3 text-sm text-slate-500">{message}</p> : null}
      </section>
    </div>
  );
}
