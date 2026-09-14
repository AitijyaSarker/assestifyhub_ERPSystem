'use client';

import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/layout/page-header';
import { api } from '@/lib/api';

type Row = {
  id: string;
  shopId: string;
  quantityOnHand: string;
  quantityReserved: string;
  quantityDamaged: string;
  variant: { sku: string; product: { name: string } };
  shop: { name: string };
};

export default function InventoryPage() {
  const [rows, setRows] = useState<Row[]>([]);
  useEffect(() => {
    api<Row[]>('/inventory').then((r) => setRows(r.data)).catch(console.error);
  }, []);
  return (
    <div>
      <PageHeader title="Inventory" subtitle="quantity_available = on_hand − reserved" />
      <table className="w-full rounded-xl bg-white text-left text-sm shadow-sm">
        <thead className="bg-slate-100">
          <tr>
            <th className="p-3">Shop</th>
            <th>Product</th>
            <th>On hand</th>
            <th>Reserved</th>
            <th>Available</th>
            <th>Damaged</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t">
              <td className="p-3">{r.shop.name}</td>
              <td>
                {r.variant.product.name} ({r.variant.sku})
              </td>
              <td>{r.quantityOnHand}</td>
              <td>{r.quantityReserved}</td>
              <td>{(Number(r.quantityOnHand) - Number(r.quantityReserved)).toFixed(3)}</td>
              <td>{r.quantityDamaged}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
