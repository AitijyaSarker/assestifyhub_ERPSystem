'use client';

import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { api } from '@/lib/api';

export type Shop = {
  id: string;
  name: string;
  code: string;
  invoicePrefix?: string;
  email?: string;
};

export type ShopContextValue = {
  shops: Shop[];
  activeShopId: string | null;
  activeShop: Shop | null;
  isAllShops: boolean;
  isSuperAdmin: boolean;
  isLoading: boolean;
  setActiveShopId: (id: string | null) => void;
  refreshShops: () => Promise<void>;
};

const ShopContext = createContext<ShopContextValue | null>(null);

export function ShopProvider({ children }: { children: React.ReactNode }) {
  const [shops, setShops] = useState<Shop[]>([]);
  const [activeShopId, setActiveShopIdState] = useState<string | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const refreshShops = useCallback(async () => {
    if (typeof window === 'undefined') return;
    const token = localStorage.getItem('accessToken');
    if (!token) {
      setShops([]);
      setIsLoading(false);
      return;
    }

    try {
      const roles = JSON.parse(localStorage.getItem('roles') ?? '[]') as string[];
      const superAdmin = roles.includes('SUPER_ADMIN');
      setIsSuperAdmin(superAdmin);

      const res = await api<Shop[]>('/shops');
      const loaded = res.data ?? [];
      setShops(loaded);

      const userShopIds = JSON.parse(localStorage.getItem('shopIds') ?? '[]') as string[];
      const saved = localStorage.getItem('erp-active-shop');

      if (!superAdmin && userShopIds.length > 0) {
        const assignedShop = loaded.find((s) => userShopIds.includes(s.id)) ?? loaded[0];
        if (assignedShop) {
          setActiveShopIdState(assignedShop.id);
          localStorage.setItem('erp-active-shop', assignedShop.id);
          return;
        }
      }

      if (saved === 'ALL' && superAdmin) {
        setActiveShopIdState(null);
      } else if (saved && loaded.some((s) => s.id === saved)) {
        setActiveShopIdState(saved);
      } else if (loaded.length > 0) {
        const defaultShop = loaded[0].id;
        setActiveShopIdState(defaultShop);
        localStorage.setItem('erp-active-shop', defaultShop);
      }
    } catch {
      // Ignored if unauthenticated or on login page
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshShops();
  }, [refreshShops]);

  const setActiveShopId = useCallback((id: string | null) => {
    setActiveShopIdState(id);
    if (id === null || id === 'ALL') {
      localStorage.setItem('erp-active-shop', 'ALL');
    } else {
      localStorage.setItem('erp-active-shop', id);
    }
  }, []);

  const activeShop = useMemo(() => {
    if (!activeShopId) return null;
    return shops.find((s) => s.id === activeShopId) ?? null;
  }, [shops, activeShopId]);

  const isAllShops = useMemo(() => {
    return isSuperAdmin && (activeShopId === null || activeShopId === 'ALL');
  }, [isSuperAdmin, activeShopId]);

  const value = useMemo<ShopContextValue>(
    () => ({
      shops,
      activeShopId,
      activeShop,
      isAllShops,
      isSuperAdmin,
      isLoading,
      setActiveShopId,
      refreshShops,
    }),
    [shops, activeShopId, activeShop, isAllShops, isSuperAdmin, isLoading, setActiveShopId, refreshShops]
  );

  return <ShopContext.Provider value={value}>{children}</ShopContext.Provider>;
}

export function useActiveShop() {
  const context = useContext(ShopContext);
  if (!context) {
    throw new Error('useActiveShop must be used within a ShopProvider');
  }
  return context;
}
