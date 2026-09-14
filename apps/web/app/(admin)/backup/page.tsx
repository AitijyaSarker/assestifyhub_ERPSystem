'use client';

import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/layout/page-header';
import { api } from '@/lib/api';

type Backup = { id: string; fileUrl: string; sizeBytes: string | number; status: string; checksum?: string; createdAt: string };

export default function BackupPage() {
  const [records, setRecords] = useState<Backup[]>([]);
  const [reason, setReason] = useState('manual-admin-snapshot');
  const [message, setMessage] = useState('');

  async function load() {
    const result = await api<Backup[]>('/backup/records');
    setRecords(result.data ?? []);
  }

  useEffect(() => { load().catch(() => undefined); }, []);

  async function createSnapshot() {
    await api('/backup/snapshot', { method: 'POST', body: JSON.stringify({ reason }) });
    setMessage('Logical safety snapshot created. Physical pg_dump restore remains a runbook operation.');
    await load();
  }

  async function createDatabaseBackup() {
    await api('/backup/database', { method: 'POST', body: JSON.stringify({ reason }) });
    setMessage('Physical database backup completed and checksum recorded.');
    await load();
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Backups" subtitle="Create and review safety snapshots before destructive operations." />
      {message ? <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{message}</div> : null}
      <section className="flex flex-wrap gap-2 rounded-xl bg-white p-6 shadow-sm">
        <input className="rounded-lg border px-3 py-2 text-sm" value={reason} onChange={(event) => setReason(event.target.value)} />
        <button className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium" onClick={createSnapshot}>Create snapshot</button>
        <button className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white" onClick={createDatabaseBackup}>Create database backup</button>
      </section>
      <section className="rounded-xl bg-white shadow-sm">
        {records.map((record) => <div key={record.id} className="flex flex-wrap justify-between gap-3 border-b p-4 text-sm last:border-0"><span><strong>{record.status}</strong><br /><span className="text-slate-500">{record.fileUrl}</span></span><span className="text-slate-500">{new Date(record.createdAt).toLocaleString()}</span></div>)}
        {!records.length ? <p className="p-6 text-sm text-slate-500">No backup records found.</p> : null}
      </section>
    </div>
  );
}
