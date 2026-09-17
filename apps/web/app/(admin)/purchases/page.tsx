'use client';

import { FormEvent, useEffect, useState } from 'react';
import { PageHeader } from '@/components/layout/page-header';
import { api } from '@/lib/api';

type ShopOption = { id: string; name: string };
type SupplierOption = { id: string; name: string };
type ProductWithVariants = { id: string; name: string; variants: { id: string; sku: string; variantName: string }[] };
type PurchaseRow = { id: string; referenceNo: string; totalAmount: string; shop?: { name: string }; supplier?: { name: string } };

export default function PurchasesPage() {
  const [shops, setShops] = useState<ShopOption[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [products, setProducts] = useState<ProductWithVariants[]>([]);
  const [shopId, setShopId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [variantId, setVariantId] = useState('');
  const [qty, setQty] = useState('100');
  const [price, setPrice] = useState('10.00');
  const [ref, setRef] = useState('');
  const [rows, setRows] = useState<PurchaseRow[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function loadPurchases() {
    const list = await api<PurchaseRow[]>('/purchases');
    setRows(list.data ?? []);
  }

  useEffect(() => {
    api<ShopOption[]>('/shops').then((r) => {
      setShops(r.data ?? []);
      if (r.data?.[0]) setShopId((curr) => curr || r.data[0].id);
    }).catch(console.error);

    api<SupplierOption[]>('/suppliers').then((r) => {
      setSuppliers(r.data ?? []);
      if (r.data?.[0]) setSupplierId((curr) => curr || r.data[0].id);
    }).catch(console.error);

    api<ProductWithVariants[]>('/products').then((r) => {
      setProducts(r.data ?? []);
      const firstVariant = r.data?.[0]?.variants?.[0];
      if (firstVariant) setVariantId((curr) => curr || firstVariant.id);
    }).catch(console.error);

    loadPurchases().catch(console.error);
  }, []);

  async function create(e: FormEvent) {
    e.preventDefault();
    setMessage(null);
    setError(null);

    const activeShopId = shopId || shops[0]?.id;
    const activeSupplierId = supplierId || suppliers[0]?.id;
    const activeVariantId = variantId || products.flatMap((p) => p.variants)[0]?.id;

    if (!activeShopId) {
      setError('Please select a shop.');
      return;
    }
    if (!activeSupplierId) {
      setError('Please select a supplier.');
      return;
    }
    if (!activeVariantId) {
      setError('Please select a product variant.');
      return;
    }

    const numQty = parseFloat(qty);
    if (isNaN(numQty) || numQty <= 0) {
      setError('Please enter a valid positive quantity.');
      return;
    }

    const numPrice = parseFloat(price);
    if (isNaN(numPrice) || numPrice < 0) {
      setError('Please enter a valid price.');
      return;
    }

    const formattedQty = numQty.toFixed(3);
    const formattedPrice = numPrice.toFixed(2);
    const referenceNumber = ref.trim() || `PO-${Date.now().toString(36).toUpperCase()}`;

    setSaving(true);
    try {
      const created = await api<{ id: string }>('/purchases', {
        method: 'POST',
        body: JSON.stringify({
          shopId: activeShopId,
          supplierId: activeSupplierId,
          referenceNo: referenceNumber,
          items: [{ productVariantId: activeVariantId, quantity: formattedQty, unitPrice: formattedPrice }],
        }),
      });

      await api(`/purchases/${created.data.id}/receive`, {
        method: 'POST',
        body: JSON.stringify({ items: [{ productVariantId: activeVariantId, quantity: formattedQty, unitPrice: formattedPrice }] }),
      });

      setMessage(`Stock of ${numQty} units received successfully into inventory! Check the Inventory tab to view stock.`);
      setRef('');
      await loadPurchases();
    } catch (err) {
      setError((err as Error).message || 'Failed to create and receive purchase.');
    } finally {
      setSaving(false);
    }
  }

  const allVariants = products.flatMap((p) =>
    p.variants.map((v) => ({ ...v, displayName: `${p.name} — ${v.sku} (${v.variantName})` }))
  );

  return (
    <div>
      <PageHeader title="Purchasing" subtitle="Create Purchase Order and receive stock directly into inventory" />

      {message && (
        <div className="mb-4 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {message}
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      )}

      <form onSubmit={create} className="mb-6 grid grid-cols-1 gap-3 rounded-xl bg-white p-5 shadow-sm sm:grid-cols-3">
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-500 uppercase">Shop / Location</label>
          <select className="w-full rounded border px-3 py-2 text-sm" value={shopId || shops[0]?.id || ''} onChange={(e) => setShopId(e.target.value)}>
            {shops.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-500 uppercase">Supplier</label>
          <select className="w-full rounded border px-3 py-2 text-sm" value={supplierId || suppliers[0]?.id || ''} onChange={(e) => setSupplierId(e.target.value)}>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-500 uppercase">Reference # (Optional)</label>
          <input
            className="w-full rounded border px-3 py-2 text-sm"
            placeholder="e.g. PO-1001"
            value={ref}
            onChange={(e) => setRef(e.target.value)}
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-500 uppercase">Product Variant</label>
          <select
            className="w-full rounded border px-3 py-2 text-sm"
            value={variantId || allVariants[0]?.id || ''}
            onChange={(e) => setVariantId(e.target.value)}
          >
            {allVariants.map((v) => (
              <option key={v.id} value={v.id}>
                {v.displayName}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-500 uppercase">Quantity</label>
          <input
            type="number"
            step="any"
            min="0.001"
            className="w-full rounded border px-3 py-2 text-sm"
            placeholder="Quantity (e.g. 50)"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            required
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-500 uppercase">Unit Cost Price</label>
          <input
            type="number"
            step="0.01"
            min="0"
            className="w-full rounded border px-3 py-2 text-sm"
            placeholder="Unit Price"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            required
          />
        </div>

        <button
          type="submit"
          disabled={saving}
          className="col-span-1 rounded bg-accent py-2.5 font-medium text-white transition hover:opacity-90 disabled:opacity-50 sm:col-span-3"
        >
          {saving ? 'Creating & Receiving Stock...' : 'Create & Receive Stock'}
        </button>
      </form>

      <div className="rounded-xl bg-white p-5 shadow-sm">
        <h3 className="mb-3 font-semibold text-slate-700">Recent Purchases</h3>
        {rows.length === 0 ? (
          <p className="text-sm text-slate-400">No purchases recorded yet.</p>
        ) : (
          <ul className="divide-y text-sm">
            {rows.map((r) => (
              <li key={r.id} className="flex items-center justify-between py-2.5">
                <div>
                  <span className="font-medium text-slate-800">{r.referenceNo}</span>
                  {r.supplier && <span className="ml-2 text-xs text-slate-400">({r.supplier.name})</span>}
                </div>
                <div className="font-semibold text-slate-700">{r.totalAmount}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
