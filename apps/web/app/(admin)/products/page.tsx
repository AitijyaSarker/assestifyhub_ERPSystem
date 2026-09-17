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
type Option = { id: string; name: string };
type VariantDraft = { sku: string; variantName: string; barcode: string; attributeValues: string };

export default function ProductsPage() {
  const { formatCurrency } = useCurrencyPreferences();
  const [rows, setRows] = useState<Product[]>([]);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [variants, setVariants] = useState<VariantDraft[]>([{ sku: '', variantName: 'Default', barcode: '', attributeValues: '' }]);
  const [categories, setCategories] = useState<Option[]>([]);
  const [brands, setBrands] = useState<Option[]>([]);
  const [categoryId, setCategoryId] = useState('');
  const [brandId, setBrandId] = useState('');
  const [categoryName, setCategoryName] = useState('');
  const [brandName, setBrandName] = useState('');
  const [price, setPrice] = useState('');
  const [cost, setCost] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [attributeName, setAttributeName] = useState('');
  const [attributeValues, setAttributeValues] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    const res = await api<Product[]>('/products');
    setRows(res.data);
  }
  useEffect(() => {
    load().catch(console.error);
    api<Option[]>('/categories').then((r) => setCategories(r.data ?? [])).catch(() => undefined);
    api<Option[]>('/brands').then((r) => setBrands(r.data ?? [])).catch(() => undefined);
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      let uploadedImageUrl = imageUrl;
      if (imageFile) {
        const body = new FormData();
        body.append('file', imageFile);
        const upload = await api<{ url: string }>('/products/images', { method: 'POST', body });
        uploadedImageUrl = upload.data.url;
      }
      await api('/products', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          productCode: code.trim(),
          categoryId: categoryId || undefined,
          brandId: brandId || undefined,
          purchasePrice: cost,
          sellingPrice: price,
          images: uploadedImageUrl ? [{ url: uploadedImageUrl, isPrimary: true }] : undefined,
          attributes: attributeName ? [{ name: attributeName.trim(), values: attributeValues.split(',').map((value) => ({ value: value.trim() })).filter((value) => value.value) }] : undefined,
          variants: variants.map((variant) => ({ sku: variant.sku.trim(), variantName: variant.variantName.trim(), attributeValues: variant.attributeValues.split(',').map((value) => value.trim()).filter(Boolean), barcodes: variant.barcode ? [{ value: variant.barcode.trim(), format: 'CODE128' }] : [] })),
        }),
      });
      setName('');
      setCode('');
      setCost('');
      setPrice('');
      setVariants([{ sku: '', variantName: 'Default', barcode: '', attributeValues: '' }]);
      setImageFile(null);
      await load();
      setMessage('Product created successfully. Add stock from Inventory before selling.');
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setSaving(false);
    }
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

  async function removeProduct(product: Product) {
    if (!window.confirm(`Delete product "${product.name}"? It will be archived and removed from the active catalog.`)) return;
    setMessage(null);
    try {
      await api(`/products/${product.id}/archive`, { method: 'POST' });
      await load();
      setMessage(`Product "${product.name}" deleted.`);
    } catch (error) {
      setMessage((error as Error).message);
    }
  }

  async function createCategory() {
    if (!categoryName.trim()) return;
    setMessage(null);
    try {
      const result = await api<Option>('/categories', { method: 'POST', body: JSON.stringify({ name: categoryName.trim() }) });
      setCategories((current) => [...current, result.data]);
      setCategoryId(result.data.id);
      setCategoryName('');
      setMessage(`Category "${result.data.name}" added`);
    } catch (error) {
      setMessage((error as Error).message);
    }
  }

  async function createBrand() {
    if (!brandName.trim()) return;
    setMessage(null);
    try {
      const result = await api<Option>('/brands', { method: 'POST', body: JSON.stringify({ name: brandName.trim() }) });
      setBrands((current) => [...current, result.data]);
      setBrandId(result.data.id);
      setBrandName('');
      setMessage(`Brand "${result.data.name}" added`);
    } catch (error) {
      setMessage((error as Error).message);
    }
  }

  return (
    <div>
      <PageHeader title="Products" subtitle="Catalog, variants, barcodes" />
      <div className="mb-4 grid gap-2 rounded-xl bg-white p-4 shadow-sm sm:grid-cols-2"><div className="flex gap-2"><input className="flex-1 rounded border px-2 py-1" placeholder="New category" value={categoryName} onChange={(e) => setCategoryName(e.target.value)} /><button type="button" className="rounded border px-3" onClick={() => void createCategory()}>Add category</button></div><div className="flex gap-2"><input className="flex-1 rounded border px-2 py-1" placeholder="New brand" value={brandName} onChange={(e) => setBrandName(e.target.value)} /><button type="button" className="rounded border px-3" onClick={() => void createBrand()}>Add brand</button></div></div>
      {message ? <p className="mb-4 rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-sm text-[var(--navy)]">{message}</p> : null}
      <form onSubmit={onCreate} className="mb-6 grid grid-cols-6 gap-2 rounded-xl bg-white p-4 shadow-sm">
        <input className="rounded border px-2 py-1" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <input className="rounded border px-2 py-1" placeholder="Code" value={code} onChange={(e) => setCode(e.target.value)} />
        <select className="rounded border px-2 py-1" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}><option value="">Category</option>{categories.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select>
        <select className="rounded border px-2 py-1" value={brandId} onChange={(e) => setBrandId(e.target.value)}><option value="">Brand</option>{brands.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select>
        <input required min="0.01" step="0.01" type="number" className="rounded border px-2 py-1" placeholder="Cost" value={cost} onChange={(e) => setCost(e.target.value)} />
        <input required min="0.01" step="0.01" type="number" className="rounded border px-2 py-1" placeholder="Price" value={price} onChange={(e) => setPrice(e.target.value)} />
        <input className="rounded border px-2 py-1" placeholder="Image URL" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} />
        <input className="rounded border px-2 py-1" type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setImageFile(e.target.files?.[0] ?? null)} />
        <input className="rounded border px-2 py-1" placeholder="Attribute name e.g. Colour" value={attributeName} onChange={(e) => setAttributeName(e.target.value)} />
        <input className="rounded border px-2 py-1" placeholder="Values comma-separated" value={attributeValues} onChange={(e) => setAttributeValues(e.target.value)} />
        <div className="col-span-6 space-y-2 rounded border p-2"><div className="flex items-center justify-between text-sm font-semibold"><span>Variants</span><button type="button" className="rounded border px-2 py-1" onClick={() => setVariants((current) => [...current, { sku: '', variantName: '', barcode: '', attributeValues: '' }])}>Add variant</button></div>{variants.map((variant, index) => <div key={index} className="grid gap-2 sm:grid-cols-4"><input required className="rounded border px-2 py-1" placeholder="SKU" value={variant.sku} onChange={(e) => setVariants((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, sku: e.target.value } : item))} /><input required className="rounded border px-2 py-1" placeholder="Variant e.g. Medium / Black" value={variant.variantName} onChange={(e) => setVariants((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, variantName: e.target.value } : item))} /><input className="rounded border px-2 py-1" placeholder="Barcode" value={variant.barcode} onChange={(e) => setVariants((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, barcode: e.target.value } : item))} /><input className="rounded border px-2 py-1" placeholder="Attribute values" value={variant.attributeValues} onChange={(e) => setVariants((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, attributeValues: e.target.value } : item))} /></div>)}</div>
        <button disabled={saving} className="col-span-6 rounded bg-accent py-2 text-white disabled:opacity-50">{saving ? 'Saving...' : 'Create product'}</button>
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
              <td className="p-3">
                <div className="flex items-center gap-3">
                  <button type="button" className="text-accent" onClick={() => void labels(p.id)}>
                    Labels PDF
                  </button>
                  <button type="button" className="text-red-600" onClick={() => void removeProduct(p)}>
                    Delete
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
