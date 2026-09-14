'use client';

import { FormEvent, useEffect, useState } from 'react';
import { PageHeader } from '@/components/layout/page-header';
import { api } from '@/lib/api';

export default function PurchasesPage() {
  const [shops, setShops] = useState<{ id: string; name: string }[]>([]);
  const [suppliers, setSuppliers] = useState<{ id: string; name: string }[]>([]);
  const [products, setProducts] = useState<{ variants: { id: string; sku: string }[] }[]>([]);
  const [shopId, setShopId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [variantId, setVariantId] = useState('');
  const [qty, setQty] = useState('1.000');
  const [price, setPrice] = useState('0.00');
  const [ref, setRef] = useState('');
  const [rows, setRows] = useState<{ id: string; referenceNo: string; totalAmount: string }[]>([]);

  useEffect(() => {
    api<{ id: string; name: string }[]>('/shops').then((r) => {
      setShops(r.data);
      if (r.data[0]) setShopId(r.data[0].id);
    });
    api<{ id: string; name: string }[]>('/suppliers').then((r) => setSuppliers(r.data));
    api<{ variants: { id: string; sku: string }[] }[]>('/products').then((r) => {
      setProducts(r.data);
      const v = r.data[0]?.variants[0];
      if (v) setVariantId(v.id);
    });
    api<{ id: string; referenceNo: string; totalAmount: string }[]>('/purchases').then((r) => setRows(r.data));
  }, []);

  async function create(e: FormEvent) {
    e.preventDefault();
    const created = await api<{ id: string }>('/purchases', {
      method: 'POST',
      body: JSON.stringify({
        shopId,
        supplierId,
        referenceNo: ref,
        items: [{ productVariantId: variantId, quantity: qty, unitPrice: price }],
      }),
    });
    await api(`/purchases/${created.data.id}/receive`, {
      method: 'POST',
      body: JSON.stringify({ items: [{ productVariantId: variantId, quantity: qty, unitPrice: price }] }),
    });
    const list = await api<{ id: string; referenceNo: string; totalAmount: string }[]>('/purchases');
    setRows(list.data);
  }

  return (
    <div>
      <PageHeader title="Purchasing" subtitle="Create PO then receive into the inventory ledger" />
      <form onSubmit={create} className="mb-6 grid grid-cols-3 gap-2 rounded-xl bg-white p-4 shadow-sm">
        <select className="rounded border px-2 py-2" value={shopId} onChange={(e) => setShopId(e.target.value)}>
          {shops.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <select className="rounded border px-2 py-2" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
          <option value="">Supplier</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <input className="rounded border px-2 py-2" placeholder="Reference" value={ref} onChange={(e) => setRef(e.target.value)} />
        <select className="rounded border px-2 py-2" value={variantId} onChange={(e) => setVariantId(e.target.value)}>
          {products.flatMap((p) => p.variants).map((v) => (
            <option key={v.id} value={v.id}>
              {v.sku}
            </option>
          ))}
        </select>
        <input className="rounded border px-2 py-2" value={qty} onChange={(e) => setQty(e.target.value)} />
        <input className="rounded border px-2 py-2" value={price} onChange={(e) => setPrice(e.target.value)} />
        <button className="col-span-3 rounded bg-accent py-2 text-white">Create & receive</button>
      </form>
      <ul className="rounded-xl bg-white p-4 shadow-sm">
        {rows.map((r) => (
          <li key={r.id}>
            {r.referenceNo} — {r.totalAmount}
          </li>
        ))}
      </ul>
    </div>
  );
}
