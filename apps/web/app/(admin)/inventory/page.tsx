'use client';

import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/layout/page-header';
import { api } from '@/lib/api';
import { useActiveShop } from '@/app/providers';

type InventoryRow = {
  id: string;
  shopId: string;
  quantityOnHand: string;
  quantityReserved: string;
  quantityDamaged: string;
  variant: { sku: string; variantName: string; product: { name: string } };
  shop: { id: string; name: string; code: string };
};

type MovementRow = {
  id: string;
  shopId: string;
  movementType: string;
  quantityChange: string;
  quantityBefore: string;
  quantityAfter: string;
  referenceType?: string;
  referenceId?: string;
  createdAt: string;
  variant: { sku: string; variantName: string; product: { name: string } };
  shop: { name: string; code: string };
};

export default function InventoryPage() {
  const { shops, accessibleShops, activeShopId, isSuperAdmin } = useActiveShop();
  const [selectedShopId, setSelectedShopId] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'balances' | 'movements'>('balances');
  const [rows, setRows] = useState<InventoryRow[]>([]);
  const [movements, setMovements] = useState<MovementRow[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (activeShopId) {
      setSelectedShopId(activeShopId);
    } else {
      setSelectedShopId('');
    }
  }, [activeShopId]);

  function loadData() {
    setLoading(true);
    const query = selectedShopId ? `?shopId=${encodeURIComponent(selectedShopId)}` : '';

    if (activeTab === 'balances') {
      api<InventoryRow[]>(`/inventory${query}`)
        .then((r) => setRows(r.data ?? []))
        .catch((err) => {
          console.error(err);
          setRows([]);
        })
        .finally(() => setLoading(false));
    } else {
      api<MovementRow[]>(`/inventory/movements${query}`)
        .then((r) => setMovements(r.data ?? []))
        .catch((err) => {
          console.error(err);
          setMovements([]);
        })
        .finally(() => setLoading(false));
    }
  }

  useEffect(() => {
    loadData();
  }, [selectedShopId, activeTab]);

  const filteredRows = rows.filter((r) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      r.variant.product.name.toLowerCase().includes(q) ||
      r.variant.sku.toLowerCase().includes(q) ||
      r.shop.name.toLowerCase().includes(q)
    );
  });

  const filteredMovements = movements.filter((m) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      m.variant?.product?.name?.toLowerCase().includes(q) ||
      m.variant?.sku?.toLowerCase().includes(q) ||
      m.movementType.toLowerCase().includes(q)
    );
  });

  const movementBadges: Record<string, string> = {
    TRANSFER_IN: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    TRANSFER_OUT: 'bg-purple-100 text-purple-800 border-purple-200',
    SALE: 'bg-blue-100 text-blue-800 border-blue-200',
    SALE_REVERSAL: 'bg-amber-100 text-amber-800 border-amber-200',
    PURCHASE_RECEIPT: 'bg-teal-100 text-teal-800 border-teal-200',
    ADJUSTMENT_IN: 'bg-green-100 text-green-800 border-green-200',
    ADJUSTMENT_OUT: 'bg-orange-100 text-orange-800 border-orange-200',
    DAMAGE: 'bg-rose-100 text-rose-800 border-rose-200',
    LOSS: 'bg-red-100 text-red-800 border-red-200',
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Inventory & Stock Movements"
        subtitle="Manage on-hand stock and audit cross-shop transfer and sales movements in real time."
        actions={
          <div className="flex gap-2">
            <a
              href="/transfers"
              className="rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white shadow hover:bg-slate-800 transition"
            >
              Inter-Shop Transfers →
            </a>
            <button
              onClick={loadData}
              disabled={loading}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition"
            >
              ↻ Refresh
            </button>
          </div>
        }
      />

      {/* Filter and Tab Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white p-4 shadow-sm">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('balances')}
            className={`rounded-lg px-4 py-2 text-xs font-semibold transition ${
              activeTab === 'balances'
                ? 'bg-[var(--navy)] text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Live Stock Balances
          </button>
          <button
            onClick={() => setActiveTab('movements')}
            className={`rounded-lg px-4 py-2 text-xs font-semibold transition ${
              activeTab === 'movements'
                ? 'bg-[var(--navy)] text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Transaction Movement Audit
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-[180px]">
            <select
              className="w-full rounded-lg border px-3 py-2 text-xs font-medium"
              value={selectedShopId}
              onChange={(e) => setSelectedShopId(e.target.value)}
            >
              {isSuperAdmin && <option value="">🌐 All Shops (Network)</option>}
              {(isSuperAdmin ? shops : accessibleShops).map((s) => (
                <option key={s.id} value={s.id}>
                  🏬 {s.name} ({s.code})
                </option>
              ))}
            </select>
          </div>

          <div className="min-w-[200px]">
            <input
              className="w-full rounded-lg border px-3 py-2 text-xs"
              placeholder="Filter by product or SKU..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Tab 1: Balances Table */}
      {activeTab === 'balances' && (
        <div className="overflow-hidden rounded-xl bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-slate-50 text-xs font-semibold uppercase text-slate-600">
              <tr>
                <th className="p-3.5">Shop</th>
                <th className="p-3.5">Product & SKU</th>
                <th className="p-3.5 text-right">On Hand</th>
                <th className="p-3.5 text-right">Reserved</th>
                <th className="p-3.5 text-right">Available</th>
                <th className="p-3.5 text-right">Damaged</th>
              </tr>
            </thead>
            <tbody className="divide-y text-slate-700">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-sm text-slate-400">
                    Loading inventory balances...
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-sm text-slate-400">
                    No inventory records found for this shop.
                  </td>
                </tr>
              ) : (
                filteredRows.map((r) => {
                  const onHand = Number(r.quantityOnHand);
                  const reserved = Number(r.quantityReserved);
                  const available = Math.max(0, onHand - reserved);
                  return (
                    <tr key={r.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-3.5">
                        <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-800">
                          🏬 {r.shop.name}
                          <span className="text-[10px] text-slate-500">({r.shop.code})</span>
                        </span>
                      </td>
                      <td className="p-3.5">
                        <div className="font-semibold text-slate-900">{r.variant.product.name}</div>
                        <div className="text-xs text-slate-500">
                          {r.variant.sku} {r.variant.variantName ? `· ${r.variant.variantName}` : ''}
                        </div>
                      </td>
                      <td className="p-3.5 text-right font-medium text-slate-900">{onHand.toFixed(3)}</td>
                      <td className="p-3.5 text-right text-slate-500">{reserved.toFixed(3)}</td>
                      <td className="p-3.5 text-right font-bold text-emerald-600">{available.toFixed(3)}</td>
                      <td className="p-3.5 text-right text-rose-500">{Number(r.quantityDamaged).toFixed(3)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab 2: Stock Movements Audit Feed */}
      {activeTab === 'movements' && (
        <div className="overflow-hidden rounded-xl bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-slate-50 text-xs font-semibold uppercase text-slate-600">
              <tr>
                <th className="p-3.5">Shop</th>
                <th className="p-3.5">Movement Type</th>
                <th className="p-3.5">Product & SKU</th>
                <th className="p-3.5 text-right">Change</th>
                <th className="p-3.5 text-right">Balance (Before → After)</th>
                <th className="p-3.5">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y text-slate-700">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-sm text-slate-400">
                    Loading stock transactions...
                  </td>
                </tr>
              ) : filteredMovements.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-sm text-slate-400">
                    No stock transaction movements recorded for this shop.
                  </td>
                </tr>
              ) : (
                filteredMovements.map((m) => {
                  const change = Number(m.quantityChange);
                  const isPositive = change > 0;
                  return (
                    <tr key={m.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-3.5">
                        <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-800">
                          🏬 {m.shop?.name} ({m.shop?.code})
                        </span>
                      </td>
                      <td className="p-3.5">
                        <span
                          className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                            movementBadges[m.movementType] ?? 'bg-slate-100 text-slate-700 border-slate-200'
                          }`}
                        >
                          {m.movementType}
                        </span>
                      </td>
                      <td className="p-3.5">
                        <div className="font-semibold text-slate-900">{m.variant?.product?.name ?? 'Item'}</div>
                        <div className="text-xs text-slate-500">{m.variant?.sku}</div>
                      </td>
                      <td
                        className={`p-3.5 text-right font-bold ${
                          isPositive ? 'text-emerald-600' : 'text-rose-600'
                        }`}
                      >
                        {isPositive ? `+${change.toFixed(3)}` : change.toFixed(3)}
                      </td>
                      <td className="p-3.5 text-right text-xs text-slate-600">
                        {Number(m.quantityBefore).toFixed(3)} →{' '}
                        <span className="font-semibold text-slate-900">{Number(m.quantityAfter).toFixed(3)}</span>
                      </td>
                      <td className="p-3.5 text-xs text-slate-500">
                        {m.createdAt ? new Date(m.createdAt).toLocaleString() : '—'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
