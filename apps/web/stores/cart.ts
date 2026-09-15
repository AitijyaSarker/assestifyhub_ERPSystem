import { create } from 'zustand';

export type CartLine = {
  productVariantId: string;
  name: string;
  sku: string;
  quantity: string;
  unitPrice: string;
  discount: string;
  taxRate: string;
  availableStock?: string;
  barcode?: string;
};

type CartState = {
  shopId: string | null;
  lines: CartLine[];
  setShopId: (id: string) => void;
  add: (line: CartLine) => void;
  increment: (variantId: string) => void;
  decrement: (variantId: string) => void;
  remove: (variantId: string) => void;
  clear: () => void;
};

export const useCart = create<CartState>((set) => ({
  shopId: null,
  lines: [],
  setShopId: (shopId) => set({ shopId }),
  add: (line) =>
    set((s) => {
      const existing = s.lines.find((l) => l.productVariantId === line.productVariantId);
      if (!existing) return { lines: [...s.lines, line] };
      const qty = (Number(existing.quantity) + Number(line.quantity)).toFixed(3);
      return {
        lines: s.lines.map((l) => (l.productVariantId === line.productVariantId ? { ...l, quantity: qty } : l)),
      };
    }),
  increment: (productVariantId) => set((s) => ({ lines: s.lines.map((line) => line.productVariantId === productVariantId ? { ...line, quantity: (Number(line.quantity) + 1).toFixed(3) } : line) })),
  decrement: (productVariantId) => set((s) => ({ lines: s.lines.flatMap((line) => line.productVariantId !== productVariantId ? [line] : Number(line.quantity) <= 1 ? [] : [{ ...line, quantity: (Number(line.quantity) - 1).toFixed(3) }]) })),
  remove: (productVariantId) => set((s) => ({ lines: s.lines.filter((line) => line.productVariantId !== productVariantId) })),
  clear: () => set({ lines: [] }),
}));
