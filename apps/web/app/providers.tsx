'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { ShopProvider, useActiveShop } from './shop-context';

export { useActiveShop };

export type CurrencyCode = 'BDT' | 'GBP';

type CurrencyContextValue = {
  activeCurrency: CurrencyCode;
  setActiveCurrency: (value: CurrencyCode) => void;
  formatCurrency: (value: number | string) => string;
};

const currencyMap: Record<CurrencyCode, { locale: string; display: string }> = {
  BDT: { locale: 'en-BD', display: 'BDT' },
  GBP: { locale: 'en-GB', display: 'GBP' },
};

const CurrencyContext = createContext<CurrencyContextValue | null>(null);

function getInitialCurrency(): CurrencyCode {
  if (typeof window === 'undefined') return 'BDT';
  const saved = localStorage.getItem('erp-currency');
  return saved === 'GBP' ? 'GBP' : 'BDT';
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient());
  const [activeCurrency, setActiveCurrency] = useState<CurrencyCode>('BDT');

  useEffect(() => {
    const initialCurrency = getInitialCurrency();
    setActiveCurrency(initialCurrency);

    void api<{ activeCurrency: string }>('/settings/currency')
      .then((res) => {
        const nextCurrency = res.data.activeCurrency === 'GBP' ? 'GBP' : 'BDT';
        setActiveCurrency(nextCurrency);
        localStorage.setItem('erp-currency', nextCurrency);
      })
      .catch(() => {
        localStorage.setItem('erp-currency', initialCurrency);
      });
  }, []);

  useEffect(() => {
    localStorage.setItem('erp-currency', activeCurrency);
  }, [activeCurrency]);

  const value = useMemo<CurrencyContextValue>(() => ({
    activeCurrency,
    setActiveCurrency,
    formatCurrency: (value: number | string) => {
      const numericValue = Number(value ?? 0);
      const currencyMeta = currencyMap[activeCurrency] ?? currencyMap.BDT;
      return new Intl.NumberFormat(currencyMeta.locale, {
        style: 'currency',
        currency: currencyMeta.display,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(Number.isFinite(numericValue) ? numericValue : 0);
    },
  }), [activeCurrency]);

  return (
    <QueryClientProvider client={client}>
      <CurrencyContext.Provider value={value}>
        <ShopProvider>{children}</ShopProvider>
      </CurrencyContext.Provider>
    </QueryClientProvider>
  );
}

export function useCurrencyPreferences() {
  const context = useContext(CurrencyContext);
  if (!context) throw new Error('useCurrencyPreferences must be used within Providers');
  return context;
}
