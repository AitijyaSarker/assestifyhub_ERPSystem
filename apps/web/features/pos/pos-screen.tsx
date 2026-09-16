'use client';

import { KeyboardEvent, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { useCart } from '@/stores/cart';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useCurrencyPreferences } from '@/app/providers';

type Method = { id: string; name: string };
type Shop = { id: string; name: string };
type Customer = { id: string; name: string; phone?: string };
type InventoryRow = { productVariantId: string; quantityOnHand: string; quantityReserved: string };
type Product = { name: string; sellingPrice: string; discount: string; taxRate: string; variants: { id: string; sku: string; variantName: string; priceOverride?: string | null; barcodes: { value: string }[] }[] };

export function PosScreen() {
  const searchRef = useRef<HTMLInputElement>(null);
  const { formatCurrency } = useCurrencyPreferences();
  const [q, setQ] = useState('');
  const [methods, setMethods] = useState<Method[]>([]);
  const [shops, setShops] = useState<Shop[]>([]);
  const [methodId, setMethodId] = useState('');
  const [tendered, setTendered] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [lastReceipt, setLastReceipt] = useState('');
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [showReceipt, setShowReceipt] = useState(false);
  const [receiptFormat, setReceiptFormat] = useState<'thermal' | 'a4'>('thermal');
  const [inventory, setInventory] = useState<Record<string, string>>({});
  const cart = useCart();

  useEffect(() => {
    searchRef.current?.focus();
    api<Shop[]>('/shops').then((r) => {
      setShops(r.data);
      if (r.data[0] && !cart.shopId) cart.setShopId(r.data[0].id);
    });
    api<Method[]>('/payments/methods').then((r) => {
      setMethods(r.data);
      if (r.data[0]) setMethodId(r.data[0].id);
    });
    api<Customer[]>('/customers').then((r) => setCustomers(r.data ?? [])).catch(() => undefined);
  }, []);

  useEffect(() => () => {
    if (receiptUrl) URL.revokeObjectURL(receiptUrl);
  }, [receiptUrl]);

  useEffect(() => {
    if (!cart.shopId) return;
    api<InventoryRow[]>(`/inventory?shopId=${encodeURIComponent(cart.shopId)}`).then((result) => {
      setInventory(Object.fromEntries((result.data ?? []).map((row) => [row.productVariantId, (Number(row.quantityOnHand) - Number(row.quantityReserved)).toFixed(3)])));
    }).catch(() => undefined);
  }, [cart.shopId]);

  const totals = cart.lines.reduce((result, line) => {
    const quantity = Number(line.quantity);
    const gross = Number(line.unitPrice) * quantity;
    const discount = Number(line.discount) * quantity;
    result.subtotal += gross;
    result.discount += discount;
    result.tax += (gross - discount) * Number(line.taxRate) / 100;
    return result;
  }, { subtotal: 0, discount: 0, tax: 0 });
  const grandTotal = totals.subtotal - totals.discount + totals.tax;
  const change = Math.max(0, Number(tendered || 0) - grandTotal);

  function addLine(line: Parameters<typeof cart.add>[0]) {
    const available = line.availableStock == null ? 0 : Number(line.availableStock);
    const existing = cart.lines.find((item) => item.productVariantId === line.productVariantId);
    const nextQuantity = Number(existing?.quantity ?? 0) + Number(line.quantity);
    if (nextQuantity > available) {
      setMessage(`Only ${available.toFixed(3)} units of ${line.name} are available`);
      return;
    }
    cart.add(line);
    setMessage(null);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (q.trim().length < 2) { setProducts([]); return; }
      api<Product[]>(`/products?search=${encodeURIComponent(q.trim())}`).then((r) => setProducts(r.data ?? [])).catch(() => setProducts([]));
    }, 180);
    return () => window.clearTimeout(timer);
  }, [q]);

  useEffect(() => {
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key === '/' && document.activeElement !== searchRef.current) {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === 'F2') {
        e.preventDefault();
        void checkout();
      }
      if (e.key === 'Delete' && cart.lines.length) {
        e.preventDefault();
        cart.remove(cart.lines[cart.lines.length - 1].productVariantId);
      }
      if (e.key === 'Escape') setConfirmClear(true);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  async function scan(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return;
    const value = q.trim();
    if (!value) return;
    try {
      const res = await api<{
        id: string;
        sku: string;
        variantName: string;
        priceOverride: string | null;
        product: { name: string; sellingPrice: string };
      }>(`/products/barcode/${encodeURIComponent(value)}`);
      const v = res.data;
      addLine({
        productVariantId: v.id,
        name: `${v.product.name} ${v.variantName}`,
        sku: v.sku,
        quantity: '1.000',
        unitPrice: v.priceOverride ?? v.product.sellingPrice,
        discount: '0',
        taxRate: '0',
        availableStock: inventory[v.id],
        barcode: value,
      });
      setQ('');
      searchRef.current?.focus();
    } catch (err) {
      setMessage((err as Error).message);
    }
  }

  async function checkout() {
    if (!cart.shopId || !cart.lines.length || !methodId) return;
    try {
      const res = await api<{ receiptNumber: string; receiptPdfBase64?: string }>('/sales/checkout', {
        method: 'POST',
        body: JSON.stringify({
          shopId: cart.shopId,
          customerId: customerId || undefined,
          receiptFormat,
          items: cart.lines.map((l) => ({ productVariantId: l.productVariantId, quantity: l.quantity })),
          payments: [
            {
              methodId,
              amount: grandTotal.toFixed(2),
              ...(tendered ? { amountTendered: tendered } : {}),
            },
          ],
        }),
      });
      setMessage(`Sale ${res.data.receiptNumber} completed`);
      setLastReceipt(res.data.receiptPdfBase64 ?? '');
      if (res.data.receiptPdfBase64) {
        const blob = new Blob([Uint8Array.from(atob(res.data.receiptPdfBase64), (c) => c.charCodeAt(0))], {
          type: 'application/pdf',
        });
        if (receiptUrl) URL.revokeObjectURL(receiptUrl);
        setReceiptUrl(URL.createObjectURL(blob));
        setShowReceipt(true);
      }
      cart.clear();
      setTendered('');
      setCustomerId('');
      searchRef.current?.focus();
    } catch (err) {
      setMessage((err as Error).message);
    }
  }

  return (
    <div className="grid grid-cols-[1fr_360px] gap-4">
      <div>
        <div className="mb-3 flex gap-2">
          <select
            className="rounded border px-2 py-2"
            value={cart.shopId ?? ''}
            onChange={(e) => cart.setShopId(e.target.value)}
          >
            {shops.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <input
            ref={searchRef}
            className="flex-1 rounded border px-3 py-2 text-lg"
            placeholder="Scan barcode or search — Enter to add"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={scan}
          />
        </div>
        {products.length ? <div className="mb-3 grid gap-2 rounded-xl bg-white p-3 shadow-sm sm:grid-cols-2">{products.flatMap((product) => product.variants.map((variant) => { const stock = Number(inventory[variant.id] ?? 0); const price = Number(variant.priceOverride ?? product.sellingPrice); const unavailable = stock <= 0 || price <= 0; return <button key={variant.id} disabled={unavailable} className="rounded-lg border p-3 text-left hover:border-accent disabled:cursor-not-allowed disabled:opacity-50" onClick={() => { addLine({ productVariantId: variant.id, name: `${product.name} ${variant.variantName}`, sku: variant.sku, quantity: '1.000', unitPrice: variant.priceOverride ?? product.sellingPrice, discount: product.discount, taxRate: product.taxRate, availableStock: inventory[variant.id], barcode: variant.barcodes[0]?.value }); setQ(''); setProducts([]); searchRef.current?.focus(); }}><strong>{product.name}</strong><span className="block text-xs text-slate-500">{variant.variantName} · {variant.sku} · {price > 0 ? formatCurrency(String(price)) : 'Price not set'} · {stock > 0 ? `stock ${stock.toFixed(3)}` : 'Out of stock'}</span></button>; }))}</div> : null}
        <table className="w-full rounded-xl bg-white text-sm shadow-sm">
          <thead className="bg-slate-100">
            <tr>
              <th className="p-2 text-left">Item</th>
              <th>Qty</th>
              <th>Price</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {cart.lines.map((l) => (
              <tr key={l.productVariantId} className="border-t">
                <td className="p-2">
                  {l.name}
                  <div className="text-xs text-slate-500">{l.sku}</div>
                </td>
                <td className="text-center"><button onClick={() => cart.decrement(l.productVariantId)}>-</button><span className="px-2">{l.quantity}</span><button disabled={l.availableStock != null && Number(l.quantity) >= Number(l.availableStock)} className="disabled:cursor-not-allowed disabled:opacity-40" onClick={() => cart.increment(l.productVariantId)}>+</button></td>
                <td className="text-center">{formatCurrency(l.unitPrice)}</td>
                <td>
                  <button onClick={() => cart.remove(l.productVariantId)}>Remove</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <aside className="rounded-xl bg-white p-4 shadow-sm">
        <p className="text-sm text-slate-500">Server recalculates totals. F2 checkout · F9 new · Esc clear</p>
        <select className="mt-3 w-full rounded border px-2 py-2" value={methodId} onChange={(e) => setMethodId(e.target.value)}>
          {methods.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        <select className="mt-2 w-full rounded border px-2 py-2" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
          <option value="">Walk-in customer</option>
          {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}{customer.phone ? ` · ${customer.phone}` : ''}</option>)}
        </select>
        <select className="mt-2 w-full rounded border px-2 py-2" value={receiptFormat} onChange={(e) => setReceiptFormat(e.target.value as 'thermal' | 'a4')}><option value="thermal">Thermal receipt</option><option value="a4">A4 receipt</option></select>
        <input
          className="mt-2 w-full rounded border px-2 py-2"
          placeholder="Amount tendered"
          value={tendered}
          onChange={(e) => setTendered(e.target.value)}
        />
        <div className="mt-4 space-y-1 border-t pt-3 text-sm"><div className="flex justify-between"><span>Subtotal</span><strong>{formatCurrency(totals.subtotal.toFixed(2))}</strong></div><div className="flex justify-between"><span>Discount</span><strong>-{formatCurrency(totals.discount.toFixed(2))}</strong></div><div className="flex justify-between"><span>Tax</span><strong>{formatCurrency(totals.tax.toFixed(2))}</strong></div><div className="flex justify-between text-lg"><span>Total</span><strong>{formatCurrency(grandTotal.toFixed(2))}</strong></div><div className="flex justify-between text-emerald-700"><span>Change</span><strong>{formatCurrency(change.toFixed(2))}</strong></div></div>
        <button disabled={!cart.lines.length || cart.lines.some((line) => Number(line.unitPrice) <= 0 || (line.availableStock != null && Number(line.quantity) > Number(line.availableStock)))} className="mt-4 w-full rounded-md bg-accent py-3 text-white disabled:cursor-not-allowed disabled:opacity-50" onClick={() => void checkout()}>
          Complete sale (F2)
        </button>
        {lastReceipt ? <button className="mt-2 w-full rounded-md border py-2" onClick={() => setShowReceipt(true)}>View / print last receipt</button> : null}
        {message ? <p className="mt-3 text-sm">{message}</p> : null}
      </aside>
      {showReceipt && receiptUrl ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="flex h-[90vh] w-full max-w-4xl flex-col rounded-xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b p-4">
              <strong>Receipt ready</strong>
              <div className="flex gap-2">
                <button className="rounded-md bg-accent px-3 py-2 text-sm text-white" onClick={() => { const frame = document.getElementById('receipt-preview') as HTMLIFrameElement | null; frame?.contentWindow?.print(); }}>Print receipt</button>
                <a className="rounded-md border px-3 py-2 text-sm" href={receiptUrl} download="receipt.pdf">Download PDF</a>
                <button className="rounded-md border px-3 py-2 text-sm" onClick={() => setShowReceipt(false)}>Close</button>
              </div>
            </div>
            <iframe id="receipt-preview" title="Printable receipt" src={receiptUrl} className="min-h-0 flex-1" />
          </div>
        </div>
      ) : null}
      <ConfirmDialog
        open={confirmClear}
        title="Clear the cart?"
        onCancel={() => setConfirmClear(false)}
        onConfirm={() => {
          cart.clear();
          setConfirmClear(false);
          searchRef.current?.focus();
        }}
      />
    </div>
  );
}
