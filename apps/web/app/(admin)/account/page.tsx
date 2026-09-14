'use client';

import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/layout/page-header';
import { api } from '@/lib/api';

type User = { id: string; email: string; fullName: string; roles: string[]; shopIds: string[] };

export default function AccountPage() {
  const [user, setUser] = useState<User | null>(null);
  useEffect(() => { api<User>('/auth/me').then((result) => setUser(result.data)).catch(() => undefined); }, []);
  return <div className="space-y-6"><PageHeader title="My Account" subtitle="Review your staff profile and assigned shop access." /><section className="rounded-xl bg-white p-6 shadow-sm"><dl className="grid gap-4 sm:grid-cols-2"><div><dt className="text-xs uppercase text-slate-500">Name</dt><dd className="mt-1 font-medium">{user?.fullName ?? 'Loading...'}</dd></div><div><dt className="text-xs uppercase text-slate-500">Email</dt><dd className="mt-1 font-medium">{user?.email ?? 'Loading...'}</dd></div><div><dt className="text-xs uppercase text-slate-500">Role</dt><dd className="mt-1 font-medium">{user?.roles.join(', ') ?? 'Loading...'}</dd></div><div><dt className="text-xs uppercase text-slate-500">Assigned shops</dt><dd className="mt-1 font-medium">{user?.shopIds.length ?? 0}</dd></div></dl></section></div>;
}
