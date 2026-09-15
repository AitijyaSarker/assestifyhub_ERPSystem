'use client';

import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/layout/page-header';
import { api } from '@/lib/api';

type Backup = { id: string; fileUrl: string; sizeBytes: string | number; status: string; checksum?: string; createdAt: string };

export default function BackupPage() {
  const [records, setRecords] = useState<Backup[]>([]);
  const [reason, setReason] = useState('manual-admin-snapshot');
  const [message, setMessage] = useState('');
  const [restoreFile, setRestoreFile] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [retentionDays, setRetentionDays] = useState('30');

  async function load() {
    const result = await api<Backup[]>('/backup/records');
    setRecords(result.data ?? []);
  }

  useEffect(() => { load().catch(() => undefined); }, []);
  useEffect(() => { api<{ days: number }>('/backup/retention').then((result) => setRetentionDays(String(result.data.days))).catch(() => undefined); }, []);

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

  async function download(filename: string) {
    const token = localStorage.getItem('accessToken');
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1'}/backup/download?filename=${encodeURIComponent(filename)}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!response.ok) throw new Error('Backup download failed');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(await response.blob());
    link.download = filename;
    link.click();
  }

  async function restore() {
    await api('/backup/restore', { method: 'POST', body: JSON.stringify({ filename: restoreFile, confirmation }) });
    setMessage('Restore completed');
  }

  async function saveRetention() {
    await api('/backup/retention', { method: 'POST', body: JSON.stringify({ days: Number(retentionDays) }) });
    setMessage(`Backup retention set to ${retentionDays} days`);
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
        {records.map((record) => <div key={record.id} className="flex flex-wrap justify-between gap-3 border-b p-4 text-sm last:border-0"><span><strong>{record.status}</strong><br /><span className="text-slate-500">{record.fileUrl}</span></span><span className="flex items-center gap-3 text-slate-500">{new Date(record.createdAt).toLocaleString()}{record.fileUrl.startsWith('snapshot:') ? null : <button className="rounded border px-2 py-1" onClick={() => download(record.fileUrl.split(/[\\/]/).pop() ?? '')}>Download</button>}</span></div>)}
        {!records.length ? <p className="p-6 text-sm text-slate-500">No backup records found.</p> : null}
      </section>
      <section className="rounded-xl border border-red-200 bg-red-50 p-5 shadow-sm"><h2 className="font-semibold text-red-900">Restore database</h2><p className="mt-1 text-sm text-red-800">Deployment must explicitly enable restore with ENABLE_RESTORE=true.</p><div className="mt-3 grid gap-2 md:grid-cols-3"><input className="rounded-lg border px-3 py-2 text-sm" placeholder="Backup filename" value={restoreFile} onChange={(e) => setRestoreFile(e.target.value)} /><input className="rounded-lg border px-3 py-2 text-sm" placeholder="Type RESTORE DATABASE" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} /><button className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white" onClick={() => restore().catch((error) => setMessage((error as Error).message))}>Restore</button></div></section>
      <section className="rounded-xl bg-white p-5 shadow-sm"><h2 className="font-semibold">Retention</h2><div className="mt-3 flex gap-2"><input type="number" min="1" className="rounded-lg border px-3 py-2 text-sm" value={retentionDays} onChange={(e) => setRetentionDays(e.target.value)} /><button className="rounded-lg border px-4 py-2 text-sm" onClick={() => saveRetention().catch((error) => setMessage((error as Error).message))}>Save retention</button></div></section>
    </div>
  );
}
