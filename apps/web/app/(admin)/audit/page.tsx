'use client';

import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/layout/page-header';
import { api } from '@/lib/api';

type AuditLog = { id: string; action: string; resourceType: string; resourceId?: string; actorRole?: string; ipAddress?: string; createdAt: string };

export default function AuditPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [resourceType, setResourceType] = useState('');

  useEffect(() => {
    const query = resourceType ? `?resourceType=${encodeURIComponent(resourceType)}` : '';
    api<AuditLog[]>(`/audit-logs${query}`).then((result) => setLogs(result.data ?? [])).catch(() => undefined);
  }, [resourceType]);

  return (
    <div className="space-y-6">
      <PageHeader title="Audit Log" subtitle="Immutable activity history for operational and security review." />
      <div className="flex gap-2">
        <input className="rounded-lg border px-3 py-2 text-sm" value={resourceType} onChange={(event) => setResourceType(event.target.value)} placeholder="Filter resource type" />
        <button className="rounded-lg border px-4 py-2 text-sm" onClick={() => setResourceType('')}>Clear</button>
      </div>
      <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b text-xs uppercase text-slate-500"><tr><th className="p-4">Time</th><th className="p-4">Action</th><th className="p-4">Resource</th><th className="p-4">Actor</th><th className="p-4">IP</th></tr></thead>
          <tbody>{logs.map((log) => <tr key={log.id} className="border-b last:border-0"><td className="p-4 text-slate-500">{new Date(log.createdAt).toLocaleString()}</td><td className="p-4 font-medium">{log.action}</td><td className="p-4">{log.resourceType} {log.resourceId ? `· ${log.resourceId}` : ''}</td><td className="p-4">{log.actorRole || 'System'}</td><td className="p-4 text-slate-500">{log.ipAddress || '—'}</td></tr>)}</tbody>
        </table>
        {!logs.length ? <p className="p-6 text-sm text-slate-500">No audit entries found.</p> : null}
      </div>
    </div>
  );
}
