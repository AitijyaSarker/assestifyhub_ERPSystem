'use client';

import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/layout/page-header';
import { api } from '@/lib/api';

type Notification = { id: string; type: string; title: string; message: string; isRead: boolean; createdAt: string };
type Preference = { type: string; inAppEnabled: boolean; emailEnabled: boolean };

const types = ['LOW_STOCK', 'OUT_OF_STOCK', 'RETURN_REQUEST', 'RETURN_APPROVED', 'RETURN_REJECTED', 'NEW_DEVICE_LOGIN', 'SUSPICIOUS_LOGIN', 'STOCK_TRANSFER', 'SECURITY_EVENT'];

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [preferences, setPreferences] = useState<Preference[]>([]);

  async function load() {
    const [notificationResult, preferenceResult] = await Promise.all([
      api<Notification[]>('/notifications'),
      api<Preference[]>('/notifications/preferences'),
    ]);
    setNotifications(notificationResult.data ?? []);
    setPreferences(preferenceResult.data ?? []);
  }

  useEffect(() => { load().catch(() => undefined); }, []);

  async function markRead(id: string) {
    await api(`/notifications/${id}/read`, { method: 'PATCH' });
    setNotifications((current) => current.map((notification) => notification.id === id ? { ...notification, isRead: true } : notification));
  }

  async function markAllRead() {
    await api('/notifications/read-all', { method: 'PATCH' });
    setNotifications((current) => current.map((notification) => ({ ...notification, isRead: true })));
  }

  async function toggle(type: string, field: 'inAppEnabled' | 'emailEnabled') {
    const current = preferences.find((preference) => preference.type === type) ?? { type, inAppEnabled: true, emailEnabled: false };
    const next = { ...current, [field]: !current[field] };
    await api('/notifications/preferences', { method: 'PATCH', body: JSON.stringify(next) });
    setPreferences((all) => [...all.filter((preference) => preference.type !== type), next]);
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Notifications" subtitle="Review operational alerts and choose how each alert type is delivered." actions={<button className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm" onClick={markAllRead}>Mark all read</button>} />
      <section className="space-y-2">
        {notifications.map((notification) => <button key={notification.id} className={`block w-full rounded-xl border p-4 text-left ${notification.isRead ? 'border-[var(--line)] bg-white' : 'border-emerald-200 bg-emerald-50'}`} onClick={() => markRead(notification.id)}><div className="flex justify-between gap-3"><strong>{notification.title}</strong><span className="text-xs text-slate-500">{new Date(notification.createdAt).toLocaleString()}</span></div><p className="mt-1 text-sm text-slate-600">{notification.message}</p></button>)}
        {!notifications.length ? <p className="rounded-xl bg-white p-6 text-sm text-slate-500">No notifications.</p> : null}
      </section>
      <section className="rounded-xl bg-white p-6 shadow-sm"><h2 className="font-semibold">Preferences</h2><div className="mt-4 grid gap-3 sm:grid-cols-2">{types.map((type) => { const preference = preferences.find((item) => item.type === type) ?? { type, inAppEnabled: true, emailEnabled: false }; return <div key={type} className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm"><span>{type.replace(/_/g, ' ')}</span><span className="flex gap-3"><label><input type="checkbox" checked={preference.inAppEnabled} onChange={() => toggle(type, 'inAppEnabled')} /> In-app</label><label><input type="checkbox" checked={preference.emailEnabled} onChange={() => toggle(type, 'emailEnabled')} /> Email</label></span></div>; })}</div></section>
    </div>
  );
}
