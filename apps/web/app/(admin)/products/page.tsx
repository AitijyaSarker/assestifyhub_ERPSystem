'use client';

import { FormEvent, useEffect, useState } from 'react';
import { PageHeader } from '@/components/layout/page-header';
import { api } from '@/lib/api';
import { useCurrencyPreferences } from '@/app/providers';

type Product = {
  id: string;
  name: string;
  productCode: string;
  sellingPrice: string;
  currency: string;
  variants: { id: string; sku: string; variantName: string; barcodes: { value: string }[] }[];
};

export default function ProductsPage() {
  const { formatCurrency } = useCurrencyPreferences();
  const [rows, setRows] = useState<Product[]>([]);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [sku, setSku] = useState('');
  const [barcode, setBarcode] = useState('');
  const [price, setPrice] = useState('0.00');
  const [cost, setCost] = useState('0.00');
  const [imageUrl, setImageUrl] = useState('');
  const [attributeName, setAttributeName] = useState('');
  const [attributeValues, setAttributeValues] = useState('');

  async function load() {
    const res = await api<Product[]>('/products');
    setRows(res.data);
  }
  useEffect(() => {
    load().catch(console.error);
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    await api('/products', {
      method: 'POST',
      body: JSON.stringify({
        name,
        productCode: code,
        purchasePrice: cost,
        sellingPrice: price,
        images: imageUrl ? [{ url: imageUrl, isPrimary: true }] : undefined,
        attributes: attributeName ? [{ name: attributeName, values: attributeValues.split(',').map((value) => ({ value: value.trim() })).filter((value) => value.value) }] : undefined,
        variants: [{ sku, variantName: 'Default', attributeValues: attributeValues.split(',').map((value) => value.trim()).filter(Boolean), barcodes: barcode ? [{ value: barcode, format: 'CODE128' }] : [] }],
      }),
    });
    setName('');
    await load();
  }

  async function labels(id: string) {
    const product = rows.find((p) => p.id === id);
    if (!product?.variants[0]) return;
    const res = await api<{ pdfBase64: string }>('/products/labels', {
      method: 'POST',
      body: JSON.stringify({ variantIds: [product.variants[0].id], layout: 'a4' }),
    });
    const blob = new Blob([Uint8Array.from(atob(res.data.pdfBase64), (c) => c.charCodeAt(0))], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    window.open(url);
  }

  return (
    <div>
      <PageHeader title="Products" subtitle="Catalog, variants, barcodes" />
      <form onSubmit={onCreate} className="mb-6 grid grid-cols-6 gap-2 rounded-xl bg-white p-4 shadow-sm">
        <input className="rounded border px-2 py-1" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <input className="rounded border px-2 py-1" placeholder="Code" value={code} onChange={(e) => setCode(e.target.value)} />
        <input className="rounded border px-2 py-1" placeholder="SKU" value={sku} onChange={(e) => setSku(e.target.value)} />
        <input className="rounded border px-2 py-1" placeholder="Barcode" value={barcode} onChange={(e) => setBarcode(e.target.value)} />
        <input className="rounded border px-2 py-1" placeholder="Cost" value={cost} onChange={(e) => setCost(e.target.value)} />
        <input className="rounded border px-2 py-1" placeholder="Price" value={price} onChange={(e) => setPrice(e.target.value)} />
        <input className="rounded border px-2 py-1" placeholder="Image URL" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} />
        <input className="rounded border px-2 py-1" placeholder="Attribute name e.g. Colour" value={attributeName} onChange={(e) => setAttributeName(e.target.value)} />
        <input className="rounded border px-2 py-1" placeholder="Values comma-separated" value={attributeValues} onChange={(e) => setAttributeValues(e.target.value)} />
        <button className="col-span-6 rounded bg-accent py-2 text-white">Create product</button>
      </form>
      <table className="w-full overflow-hidden rounded-xl bg-white text-left text-sm shadow-sm">
        <thead className="bg-slate-100">
          <tr>
            <th className="p-3">Name</th>
            <th>Code</th>
            <th>SKU</th>
            <th>Price</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id} className="border-t">
              <td className="p-3">{p.name}</td>
              <td>{p.productCode}</td>
              <td>{p.variants[0]?.sku}</td>
              <td>{formatCurrency(p.sellingPrice)}</td>
              <td>
                <button className="text-accent" onClick={() => labels(p.id)}>
                  Labels PDF
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
