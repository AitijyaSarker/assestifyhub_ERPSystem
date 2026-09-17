'use client';

import { FormEvent, useEffect, useState } from 'react';
import { PageHeader } from '@/components/layout/page-header';
import { api } from '@/lib/api';
import { useActiveShop } from '@/app/providers';

type Shop = { id: string; name: string; code: string };
type ProductVariant = {
  id: string;
  sku: string;
  variantName: string;
  product?: { name: string };
};
type TransferItem = {
  id: string;
  productVariantId: string;
  quantity: string;
  variant?: ProductVariant;
};
type Transfer = {
  id: string;
  transferNumber: string;
  sourceShopId: string;
  destShopId: string;
  status: 'REQUESTED' | 'APPROVED' | 'DISPATCHED' | 'RECEIVED';
  createdAt: string;
  sourceShop?: Shop;
  destShop?: Shop;
  items: TransferItem[];
};

type ProductOption = {
  id: string;
  name: string;
  variants: { id: string; sku: string; variantName: string }[];
};

export default function TransfersPage() {
  const { activeShopId, activeShop } = useActiveShop();
  const [shops, setShops] = useState<Shop[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [filterShopId, setFilterShopId] = useState('');
  const [form, setForm] = useState({
    sourceShopId: '',
    destShopId: '',
    productVariantId: '',
    quantity: '10.000',
  });
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (activeShopId) {
      setFilterShopId(activeShopId);
    }
  }, [activeShopId]);

  function getShopLabel(shop?: Shop) {
    if (!shop) return 'Unknown Shop';
    const isMain = shop.code === 'HQ01' || shop.name.toLowerCase().includes('headquarter') || shop.name.toLowerCase().includes('main');
    return `${shop.name} (${shop.code})${isMain ? ' — Main Warehouse' : ''}`;
  }

  async function load() {
    try {
      const [shopResult, productResult, transferResult] = await Promise.all([
        api<Shop[]>('/shops'),
        api<ProductOption[]>('/products'),
        api<Transfer[]>('/transfers'),
      ]);
      const loadedShops = shopResult.data ?? [];
      setShops(loadedShops);
      setProducts(productResult.data ?? []);
      setTransfers(transferResult.data ?? []);

      setForm((current) => {
        const hqShop = loadedShops.find((s) => s.code === 'HQ01' || s.name.toLowerCase().includes('headquarter')) || loadedShops[0];
        const isCurrentBranch = activeShopId && activeShopId !== hqShop?.id;

        // If currently viewing a branch/destination shop, default destination to active shop, source to HQ
        const defaultSource = isCurrentBranch ? (hqShop?.id || '') : (current.sourceShopId || hqShop?.id || loadedShops[0]?.id || '');
        const defaultDest = isCurrentBranch ? activeShopId : (current.destShopId || loadedShops.find((s) => s.id !== defaultSource)?.id || '');
        const firstVariant = productResult.data?.[0]?.variants?.[0]?.id || '';

        return {
          ...current,
          sourceShopId: defaultSource,
          destShopId: defaultDest,
          productVariantId: current.productVariantId || firstVariant,
        };
      });
    } catch (err) {
      setError((err as Error).message || 'Unable to load transfers');
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function request(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    setError(null);

    if (form.sourceShopId === form.destShopId) {
      setError('Source shop and Destination shop must be different.');
      return;
    }

    const numQty = parseFloat(form.quantity);
    if (isNaN(numQty) || numQty <= 0) {
      setError('Please enter a valid positive quantity.');
      return;
    }

    setLoading(true);
    try {
      await api('/transfers', {
        method: 'POST',
        body: JSON.stringify({
          sourceShopId: form.sourceShopId,
          destShopId: form.destShopId,
          items: [{ productVariantId: form.productVariantId, quantity: numQty.toFixed(3) }],
        }),
      });
      setMessage('Transfer requested successfully! Proceed to Approve and Dispatch to move inventory.');
      await load();
    } catch (err) {
      setError((err as Error).message || 'Failed to request transfer');
    } finally {
      setLoading(false);
    }
  }

  async function transition(id: string, action: 'approve' | 'dispatch' | 'receive') {
    setMessage(null);
    setError(null);
    setLoading(true);
    try {
      await api(`/transfers/${id}/${action}`, { method: 'POST' });
      const actionLabels = {
        approve: 'Transfer approved!',
        dispatch: 'Stock dispatched! Deducted from Source Shop and in transit.',
        receive: 'Stock received! Added directly to Destination Shop inventory.',
      };
      setMessage(actionLabels[action]);
      await load();
    } catch (err) {
      setError((err as Error).message || `Failed to ${action} transfer`);
    } finally {
      setLoading(false);
    }
  }

  const allVariants = products.flatMap((p) =>
    p.variants.map((v) => ({
      id: v.id,
      label: `${p.name} — ${v.sku} (${v.variantName})`,
    }))
  );

  const filteredTransfers = transfers.filter((t) => {
    if (!filterShopId) return true;
    return t.sourceShopId === filterShopId || t.destShopId === filterShopId;
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Stock Transfers"
        subtitle="Manage inventory movement between Main Warehouse and branch shops through an auditable workflow."
      />

      {message && (
        <div className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          ✓ {message}
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          ✕ {error}
        </div>
      )}

      {/* Transfer Request Form */}
      <form onSubmit={request} className="grid gap-4 rounded-xl bg-white p-5 shadow-sm md:grid-cols-4">
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">Source Shop (Sending)</label>
          <select
            required
            className="w-full rounded-lg border px-3 py-2 text-sm"
            value={form.sourceShopId}
            onChange={(e) => setForm({ ...form, sourceShopId: e.target.value })}
          >
            {shops.map((shop) => (
              <option key={shop.id} value={shop.id}>
                {getShopLabel(shop)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">Destination Shop (Receiving)</label>
          <select
            required
            className="w-full rounded-lg border px-3 py-2 text-sm"
            value={form.destShopId}
            onChange={(e) => setForm({ ...form, destShopId: e.target.value })}
          >
            {shops.map((shop) => (
              <option key={shop.id} value={shop.id}>
                {getShopLabel(shop)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">Product Variant</label>
          <select
            required
            className="w-full rounded-lg border px-3 py-2 text-sm"
            value={form.productVariantId}
            onChange={(e) => setForm({ ...form, productVariantId: e.target.value })}
          >
            {allVariants.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">Transfer Quantity</label>
          <input
            required
            type="number"
            step="any"
            min="0.001"
            className="w-full rounded-lg border px-3 py-2 text-sm"
            value={form.quantity}
            onChange={(e) => setForm({ ...form, quantity: e.target.value })}
            placeholder="Quantity (e.g. 10)"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow transition hover:bg-slate-800 disabled:opacity-50 md:col-span-4"
        >
          {loading ? 'Processing...' : 'Request Stock Transfer'}
        </button>
      </form>

      {/* Filter and Transfers List */}
      <section className="rounded-xl bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b pb-3">
          <h2 className="font-semibold text-slate-800">Transfer History & Live Status</h2>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">Filter by Shop:</span>
            <select
              className="rounded-lg border px-2.5 py-1 text-xs"
              value={filterShopId}
              onChange={(e) => setFilterShopId(e.target.value)}
            >
              <option value="">All Shops (Both Source & Destination)</option>
              {shops.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.code})
                </option>
              ))}
            </select>
          </div>
        </div>

        {filteredTransfers.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">No transfer records found.</p>
        ) : (
          <div className="divide-y">
            {filteredTransfers.map((transfer) => {
              const srcShop = shops.find((s) => s.id === transfer.sourceShopId) || transfer.sourceShop;
              const dstShop = shops.find((s) => s.id === transfer.destShopId) || transfer.destShop;
              const firstItem = transfer.items?.[0];
              const variantName = firstItem?.variant?.product?.name
                ? `${firstItem.variant.product.name} (${firstItem.variant.sku})`
                : 'Stock Item';
              const quantity = firstItem?.quantity ? parseFloat(firstItem.quantity).toFixed(0) : '—';

              const statusBadges = {
                REQUESTED: 'bg-amber-100 text-amber-800 border-amber-200',
                APPROVED: 'bg-blue-100 text-blue-800 border-blue-200',
                DISPATCHED: 'bg-purple-100 text-purple-800 border-purple-200',
                RECEIVED: 'bg-emerald-100 text-emerald-800 border-emerald-200',
              };

              return (
                <div key={transfer.id} className="flex flex-wrap items-center justify-between gap-4 py-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <strong className="text-sm text-slate-900">{transfer.transferNumber}</strong>
                      <span className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-semibold ${statusBadges[transfer.status]}`}>
                        {transfer.status}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-600">
                      <span className="font-semibold text-slate-700">{getShopLabel(srcShop)}</span>
                      <span className="text-slate-400">➔</span>
                      <span className="font-semibold text-emerald-700">{getShopLabel(dstShop)}</span>
                    </div>

                    <p className="text-xs text-slate-500">
                      Transferred Item: <span className="font-medium text-slate-800">{variantName}</span> —{' '}
                      <span className="font-bold text-slate-900">{quantity} units</span>
                    </p>
                  </div>

                  {/* Workflow Action Buttons */}
                  <div className="flex items-center gap-2">
                    {transfer.status === 'REQUESTED' && (
                      <button
                        type="button"
                        disabled={loading}
                        className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50"
                        onClick={() => transition(transfer.id, 'approve')}
                      >
                        1. Approve Transfer
                      </button>
                    )}

                    {transfer.status === 'APPROVED' && (
                      <button
                        type="button"
                        disabled={loading}
                        className="rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-purple-700 disabled:opacity-50"
                        onClick={() => transition(transfer.id, 'dispatch')}
                      >
                        2. Dispatch from Source
                      </button>
                    )}

                    {transfer.status === 'DISPATCHED' && (
                      <button
                        type="button"
                        disabled={loading}
                        className="rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white shadow transition hover:bg-emerald-700 disabled:opacity-50"
                        onClick={() => transition(transfer.id, 'receive')}
                      >
                        3. Receive into Destination Shop
                      </button>
                    )}

                    {transfer.status === 'RECEIVED' && (
                      <div className="flex items-center gap-1 text-xs font-semibold text-emerald-700">
                        <span>✓ Received in {dstShop?.name || 'Destination'}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
