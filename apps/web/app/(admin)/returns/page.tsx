'use client';

import { FormEvent, useEffect, useState } from 'react';
import { PageHeader } from '@/components/layout/page-header';
import { api } from '@/lib/api';
import { useCurrencyPreferences } from '@/app/providers';

interface ReturnItem {
  id: string;
  saleItemId: string;
  quantity: string;
  condition?: string;
  saleItem?: {
    productNameSnapshot: string;
    skuSnapshot: string;
    unitPrice: string;
    quantity: string;
  };
}

interface Return {
  id: string;
  returnNumber: string;
  status: string;
  reason: string;
  resolution?: string;
  createdAt: string;
  items: ReturnItem[];
  evidence: { imageUrl: string }[];
  decisions: { decision: string; notes?: string; createdAt: string }[];
  refund?: { id: string; amount: string; createdAt: string };
  exchange?: { id: string; originalValue: string; replacementValue: string };
  sale?: { receiptNumber: string };
  customer?: { name: string; phone?: string; email?: string };
}

type Sale = { id: string; shopId: string; receiptNumber: string; items: { id: string; productNameSnapshot: string; skuSnapshot: string; quantity: string }[] };

const STATUS_BADGES: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-800',
  PENDING: 'bg-yellow-100 text-yellow-800',
  APPROVED: 'bg-green-100 text-green-800',
  REJECTED: 'bg-red-100 text-red-800',
  REFUND_PROCESSING: 'bg-blue-100 text-blue-800',
  EXCHANGE_PROCESSING: 'bg-purple-100 text-purple-800',
  COMPLETED: 'bg-emerald-100 text-emerald-800',
};

export default function ReturnsPage() {
  const { formatCurrency } = useCurrencyPreferences();
  const [returns, setReturns] = useState<Return[]>([]);
  const [selectedReturn, setSelectedReturn] = useState<Return | null>(null);
  const [filterStatus, setFilterStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [sales, setSales] = useState<Sale[]>([]);
  const [returnForm, setReturnForm] = useState({ saleId: '', saleItemId: '', quantity: '1.000', reason: '', resolution: 'REFUND' });
  const [evidence, setEvidence] = useState<File[]>([]);

  useEffect(() => {
    const admin = (JSON.parse(localStorage.getItem('roles') ?? '[]') as string[]).includes('SUPER_ADMIN');
    setIsAdmin(admin);
    loadReturns();
    if (!admin) api<Sale[]>('/sales').then((result) => setSales(result.data ?? [])).catch(() => undefined);
  }, [filterStatus]);

  async function submitReturn(event: FormEvent) {
    event.preventDefault();
    const sale = sales.find((item) => item.id === returnForm.saleId);
    if (!sale) return;
    try {
      const result = await api<{ id: string }>('/returns', {
        method: 'POST',
        body: JSON.stringify({
          shopId: sale.shopId,
          saleId: sale.id,
          reason: returnForm.reason,
          resolution: returnForm.resolution,
          items: [{ saleItemId: returnForm.saleItemId, quantity: returnForm.quantity }],
        }),
      });
      for (const file of evidence) {
        const body = new FormData();
        body.append('file', file);
        await api(`/returns/${result.data.id}/evidence`, { method: 'POST', body });
      }
      setReturnForm({ saleId: '', saleItemId: '', quantity: '1.000', reason: '', resolution: 'REFUND' });
      setEvidence([]);
      setError('Return request submitted for Super Admin review.');
      await loadReturns();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function loadReturns() {
    try {
      setLoading(true);
      const query = filterStatus ? `?status=${filterStatus}` : '';
      const result = await api<Return[]>(`/returns${query}`);
      setReturns(result.data || []);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function approveReturn(returnId: string, asRefund = true) {
    try {
      await api(`/returns/${returnId}/decide`, {
        method: 'POST',
        body: JSON.stringify({
          decision: asRefund ? 'APPROVED_REFUND' : 'APPROVED_EXCHANGE',
          itemConditions: returns
            .find((r) => r.id === returnId)
            ?.items.map((i) => ({ returnItemId: i.id, condition: 'SELLABLE' })) || [],
        }),
      });
      await loadReturns();
      setSelectedReturn(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function rejectReturn(returnId: string, notes: string) {
    try {
      await api(`/returns/${returnId}/decide`, {
        method: 'POST',
        body: JSON.stringify({ decision: 'REJECTED', notes }),
      });
      await loadReturns();
      setSelectedReturn(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Product Returns"
        subtitle="Review and approve customer return requests. Upload images as evidence. Process refunds or exchanges."
      />

      {!isAdmin ? <form onSubmit={submitReturn} className="space-y-3 rounded-xl bg-white p-5 shadow-sm">
        <h2 className="font-semibold">Create return request</h2>
        <div className="grid gap-2 md:grid-cols-2">
          <select required className="rounded-lg border px-3 py-2 text-sm" value={returnForm.saleId} onChange={(event) => setReturnForm({ ...returnForm, saleId: event.target.value, saleItemId: '' })}>
            <option value="">Select original receipt</option>
            {sales.map((sale) => <option key={sale.id} value={sale.id}>{sale.receiptNumber}</option>)}
          </select>
          <select required className="rounded-lg border px-3 py-2 text-sm" value={returnForm.saleItemId} onChange={(event) => setReturnForm({ ...returnForm, saleItemId: event.target.value })}>
            <option value="">Select product</option>
            {(sales.find((sale) => sale.id === returnForm.saleId)?.items ?? []).map((item) => <option key={item.id} value={item.id}>{item.productNameSnapshot} · {item.skuSnapshot}</option>)}
          </select>
          <input required className="rounded-lg border px-3 py-2 text-sm" value={returnForm.quantity} onChange={(event) => setReturnForm({ ...returnForm, quantity: event.target.value })} placeholder="Quantity" />
          <select className="rounded-lg border px-3 py-2 text-sm" value={returnForm.resolution} onChange={(event) => setReturnForm({ ...returnForm, resolution: event.target.value })}><option value="REFUND">Refund</option><option value="EXCHANGE">Exchange</option></select>
        </div>
        <textarea required className="min-h-20 w-full rounded-lg border px-3 py-2 text-sm" value={returnForm.reason} onChange={(event) => setReturnForm({ ...returnForm, reason: event.target.value })} placeholder="Describe the product problem" />
        <input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => setEvidence(Array.from(event.target.files ?? []))} />
        {evidence.length ? <p className="text-xs text-slate-500">{evidence.length} evidence image(s) selected</p> : null}
        <button className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Submit return request</button>
      </form> : null}

      {/* Status Filter */}
      <div className="flex gap-2">
        <button
          onClick={() => setFilterStatus('')}
          className={`px-4 py-2 rounded-lg font-medium transition ${
            !filterStatus
              ? 'bg-blue-600 text-white'
              : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          All
        </button>
        {['PENDING', 'APPROVED', 'REJECTED', 'REFUND_PROCESSING', 'EXCHANGE_PROCESSING'].map((status) => (
          <button
            key={status}
            onClick={() => setFilterStatus(status)}
            className={`px-4 py-2 rounded-lg font-medium transition ${
              filterStatus === status
                ? 'bg-blue-600 text-white'
                : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            {status.replace(/_/g, ' ')}
          </button>
        ))}
      </div>

      {error && <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">{error}</div>}

      {loading ? (
        <div className="text-center py-8">Loading returns...</div>
      ) : (
        <div className="grid gap-4">
          {returns.map((ret) => (
            <div
              key={ret.id}
              className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden hover:shadow-md transition cursor-pointer"
              onClick={() => setSelectedReturn(ret)}
            >
              <div className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="font-semibold text-lg">{ret.returnNumber}</div>
                    <div className="text-sm text-slate-500">
                      Receipt: {ret.sale?.receiptNumber} | {new Date(ret.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                  <div className={`px-3 py-1 rounded-full text-sm font-medium ${STATUS_BADGES[ret.status]}`}>
                    {ret.status.replace(/_/g, ' ')}
                  </div>
                </div>

                <div className="mb-3">
                  <div className="text-sm font-medium text-slate-700 mb-1">Reason: {ret.reason}</div>
                  <div className="text-sm text-slate-600">
                    {ret.items.length} item(s) | Customer: {ret.customer?.name || 'Walk-in'}
                  </div>
                </div>

                {ret.refund && (
                  <div className="bg-green-50 border border-green-200 rounded p-2 text-sm text-green-800">
                    ✓ Refund Processed: {formatCurrency(ret.refund.amount)}
                  </div>
                )}
                {ret.exchange && (
                  <div className="bg-purple-50 border border-purple-200 rounded p-2 text-sm text-purple-800">
                    ↔️ Exchange: {formatCurrency(ret.exchange.originalValue)} → {formatCurrency(ret.exchange.replacementValue)}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Detail Modal */}
      {selectedReturn && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b p-4 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold">{selectedReturn.returnNumber}</h2>
                <p className="text-sm text-slate-500">{selectedReturn.sale?.receiptNumber}</p>
              </div>
              <button
                onClick={() => setSelectedReturn(null)}
                className="text-2xl text-slate-400 hover:text-slate-600"
              >
                ×
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Return Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm text-slate-500">Status</div>
                  <div className={`px-3 py-1 rounded-full text-sm font-medium w-fit ${STATUS_BADGES[selectedReturn.status]}`}>
                    {selectedReturn.status}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-slate-500">Resolution</div>
                  <div className="font-medium">{selectedReturn.resolution || 'Pending'}</div>
                </div>
                <div>
                  <div className="text-sm text-slate-500">Customer</div>
                  <div className="font-medium">{selectedReturn.customer?.name || 'Walk-in'}</div>
                </div>
                <div>
                  <div className="text-sm text-slate-500">Date</div>
                  <div className="font-medium">{new Date(selectedReturn.createdAt).toLocaleDateString()}</div>
                </div>
              </div>

              {/* Reason */}
              <div>
                <div className="text-sm font-medium text-slate-700 mb-1">Reason</div>
                <div className="p-3 bg-slate-50 rounded">{selectedReturn.reason}</div>
              </div>

              {/* Items */}
              <div>
                <div className="text-sm font-medium text-slate-700 mb-2">Returned Items</div>
                <div className="space-y-2">
                  {selectedReturn.items.map((item) => (
                    <div key={item.id} className="p-3 bg-slate-50 rounded flex justify-between items-start">
                      <div>
                        <div className="font-medium">{item.saleItem?.productNameSnapshot}</div>
                        <div className="text-sm text-slate-500">SKU: {item.saleItem?.skuSnapshot}</div>
                        <div className="text-sm text-slate-500">
                          Quantity: {item.quantity} @ {formatCurrency(item.saleItem?.unitPrice || '0')}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-medium">
                          {item.condition ? `Condition: ${item.condition}` : 'Not assessed'}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Evidence */}
              {selectedReturn.evidence.length > 0 && (
                <div>
                  <div className="text-sm font-medium text-slate-700 mb-2">Evidence Images</div>
                  <div className="grid grid-cols-3 gap-2">
                    {selectedReturn.evidence.map((e, i) => (
                      <img
                        key={i}
                        src={e.imageUrl}
                        alt="Return evidence"
                        className="w-full h-24 object-cover rounded border border-slate-200"
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Decision */}
              {selectedReturn.decisions.length > 0 && (
                <div>
                  <div className="text-sm font-medium text-slate-700 mb-2">Decision</div>
                  {selectedReturn.decisions.map((d, i) => (
                    <div key={i} className="p-3 bg-slate-50 rounded">
                      <div className="font-medium">{d.decision}</div>
                      {d.notes && <div className="text-sm text-slate-600 mt-1">{d.notes}</div>}
                      <div className="text-xs text-slate-500 mt-1">
                        {new Date(d.createdAt).toLocaleString()}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Action Buttons */}
              {isAdmin && selectedReturn.status === 'PENDING' && (
                <div className="flex gap-2 pt-4 border-t">
                  <button
                    onClick={() => approveReturn(selectedReturn.id, true)}
                    className="flex-1 bg-green-600 text-white py-2 rounded-lg font-medium hover:bg-green-700"
                  >
                    ✓ Approve & Refund
                  </button>
                  <button
                    onClick={() => approveReturn(selectedReturn.id, false)}
                    className="flex-1 bg-purple-600 text-white py-2 rounded-lg font-medium hover:bg-purple-700"
                  >
                    ↔️ Approve & Exchange
                  </button>
                  <button
                    onClick={() => {
                      const reason = window.prompt('Rejection reason:');
                      if (reason) rejectReturn(selectedReturn.id, reason);
                    }}
                    className="flex-1 bg-red-600 text-white py-2 rounded-lg font-medium hover:bg-red-700"
                  >
                    ✗ Reject
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
