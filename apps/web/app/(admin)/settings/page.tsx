'use client';

import { FormEvent, useEffect, useState } from 'react';
import { PageHeader } from '@/components/layout/page-header';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { api } from '@/lib/api';
import { useCurrencyPreferences } from '@/app/providers';

export default function SettingsPage() {
  const { activeCurrency, setActiveCurrency } = useCurrencyPreferences();
  const [selected, setSelected] = useState<'BDT' | 'GBP'>(activeCurrency);
  const [rate, setRate] = useState('0.007200');
  const [confirm, setConfirm] = useState('');
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    api<{ activeCurrency: string }>('/settings/currency').then((r) => {
      const nextCurrency = r.data.activeCurrency === 'GBP' ? 'GBP' : 'BDT';
      setSelected(nextCurrency);
      setActiveCurrency(nextCurrency);
    });
  }, [setActiveCurrency]);

  async function saveRate(e: FormEvent) {
    e.preventDefault();
    const target = selected === 'BDT' ? 'GBP' : 'BDT';
    await api('/settings/currency/rates', {
      method: 'POST',
      body: JSON.stringify({ baseCurrency: selected, targetCurrency: target, rate }),
    });
    setMsg(`Rate set ${selected} → ${target} = ${rate}`);
  }

  async function doSwitch() {
    const target = confirm as 'BDT' | 'GBP';
    try {
      const res = await api<{ activeCurrency: 'BDT' | 'GBP'; converted: number }>('/settings/currency/switch', {
        method: 'POST',
        body: JSON.stringify({ targetCurrency: target, confirmation: confirm }),
      });
      const nextCurrency = res.data.activeCurrency === 'GBP' ? 'GBP' : 'BDT';
      setSelected(nextCurrency);
      setActiveCurrency(nextCurrency);
      setMsg(`Switched. ${res.data.converted} products converted. Historical sales untouched.`);
    } catch (e) {
      setMsg((e as Error).message);
    }
    setOpen(false);
  }

  return (
    <div>
      <PageHeader title="Settings" subtitle="System-wide currency. Choose the default operating currency for the app, then confirm the switch." />
      <div className="mb-6 rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-5 shadow-sm">
        <label className="mb-2 block text-sm font-medium text-[var(--ink)]">App currency</label>
        <div className="flex flex-col gap-3 sm:flex-row">
          <select
            className="rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5 text-sm text-[var(--ink)] outline-none ring-0"
            value={selected}
            onChange={(e) => setSelected(e.target.value as 'BDT' | 'GBP')}
          >
            <option value="BDT">BDT</option>
            <option value="GBP">GBP</option>
          </select>
          <button
            className="rounded-xl bg-[var(--mint)] px-4 py-2.5 text-sm font-semibold text-white"
            onClick={() => setOpen(true)}
          >
            Apply currency
          </button>
        </div>
        <p className="mt-3 text-sm text-[var(--muted)]">Current app setting: <strong>{selected}</strong></p>
      </div>
      <form onSubmit={saveRate} className="mb-6 flex flex-col gap-2 sm:flex-row">
        <input className="rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5 text-sm outline-none" value={rate} onChange={(e) => setRate(e.target.value)} />
        <button className="rounded-xl bg-slate-800 px-4 py-2.5 text-sm font-semibold text-white">Save latest rate</button>
      </form>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          className="rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5 text-sm outline-none"
          placeholder="Type BDT or GBP"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value.toUpperCase())}
        />
        <button className="rounded-xl bg-[var(--mint)] px-4 py-2.5 text-sm font-semibold text-white" onClick={() => setOpen(true)}>
          Switch currency
        </button>
      </div>
      {msg ? <p className="mt-4 text-sm text-[var(--muted)]">{msg}</p> : null}
      <ConfirmDialog
        open={open}
        title={`This converts current product prices only. Sales, purchases, refunds, and payments keep their original currency. Type-to-confirm is "${confirm || selected}". Continue?`}
        confirmLabel="Switch"
        onCancel={() => setOpen(false)}
        onConfirm={() => void doSwitch()}
      />
    </div>
  );
}
