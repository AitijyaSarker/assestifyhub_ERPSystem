'use client';

import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/layout/page-header';
import { api } from '@/lib/api';
import { startRegistration, type PublicKeyCredentialCreationOptionsJSON } from '@simplewebauthn/browser';

type Session = { id: string; ipAddress?: string; userAgent?: string; lastActiveAt: string; expiresAt: string; isRevoked: boolean };
type Passkey = { id: string; credentialId: string; label?: string; deviceInfo?: string; createdAt: string };
type DeviceRequest = { id: string; status: string; ipAddress?: string; createdAt: string; device: { browser?: string; os?: string }; user: { email: string; fullName: string } };
type TrustedDevice = { id: string; deviceName?: string; browser?: string; os?: string; firstSeenAt: string };
type LoginAttempt = { id: string; success: boolean; ipAddress?: string; userAgent?: string; createdAt: string };

export default function SecurityPage() {
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [setupUri, setSetupUri] = useState('');
  const [code, setCode] = useState('');
  const [sessions, setSessions] = useState<Session[]>([]);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [backupCodesRemaining, setBackupCodesRemaining] = useState(0);
  const [passkeys, setPasskeys] = useState<Passkey[]>([]);
  const [deviceRequests, setDeviceRequests] = useState<DeviceRequest[]>([]);
  const [trustedDevices, setTrustedDevices] = useState<TrustedDevice[]>([]);
  const [loginAttempts, setLoginAttempts] = useState<LoginAttempt[]>([]);
  const [message, setMessage] = useState('');

  useEffect(() => {
    api<{ enabled: boolean; backupCodesRemaining: number }>('/security/2fa/status').then((result) => { setTwoFactorEnabled(result.data.enabled); setBackupCodesRemaining(result.data.backupCodesRemaining); }).catch(() => undefined);
    api<Session[]>('/security/sessions').then((result) => setSessions(result.data ?? [])).catch(() => undefined);
    api<Passkey[]>('/security/passkeys').then((result) => setPasskeys(result.data ?? [])).catch(() => undefined);
    api<DeviceRequest[]>('/security/device-requests').then((result) => setDeviceRequests(result.data ?? [])).catch(() => undefined);
    api<TrustedDevice[]>('/security/trusted-devices').then((result) => setTrustedDevices(result.data ?? [])).catch(() => undefined);
    api<LoginAttempt[]>('/security/login-attempts').then((result) => setLoginAttempts(result.data ?? [])).catch(() => undefined);
  }, []);

  async function beginSetup() {
    const result = await api<{ uri: string }>('/security/2fa/setup', { method: 'POST' });
    setSetupUri(result.data.uri);
    setMessage('Scan the URI with your authenticator, then enter the six-digit code to confirm.');
  }

  async function confirmSetup() {
    await api('/security/2fa/confirm', { method: 'POST', body: JSON.stringify({ code }) });
    setTwoFactorEnabled(true);
    setSetupUri('');
    setCode('');
    setMessage('Two-factor authentication is enabled.');
  }

  async function regenerateCodes() {
    const result = await api<{ codes: string[] }>('/security/backup-codes/regenerate', { method: 'POST' });
    setBackupCodes(result.data.codes);
    setBackupCodesRemaining(result.data.codes.length);
    setMessage('Store these backup codes securely. They are shown only once.');
  }

  async function revokeSession(sessionId: string) {
    await api(`/security/sessions/${sessionId}/revoke`, { method: 'POST' });
    setSessions((current) => current.filter((session) => session.id !== sessionId));
  }

  async function revokeOtherSessions() {
    await api('/security/sessions/revoke-others', { method: 'POST' });
    setSessions((current) => current.filter((session, index) => index === 0));
    setMessage('Other sessions revoked.');
  }

  async function resolveDeviceRequest(id: string, decision: 'approve' | 'reject') {
    await api(`/security/device-requests/${id}/${decision}`, { method: 'POST' });
    setDeviceRequests((current) => current.filter((request) => request.id !== id));
  }

  async function revokePasskey(id: string) {
    await api(`/security/passkeys/${id}/revoke`, { method: 'POST' });
    setPasskeys((current) => current.filter((passkey) => passkey.id !== id));
  }

  async function renamePasskey(id: string, currentLabel?: string) {
    const label = window.prompt('Passkey name', currentLabel ?? 'Passkey');
    if (!label) return;
    const result = await api<Passkey>(`/security/passkeys/${id}/rename`, { method: 'POST', body: JSON.stringify({ label }) });
    setPasskeys((current) => current.map((passkey) => passkey.id === id ? result.data : passkey));
  }

  async function registerPasskey() {
    const options = await api<PublicKeyCredentialCreationOptionsJSON>('/security/passkeys/registration/options', { method: 'POST' });
    const response = await startRegistration({ optionsJSON: options.data });
    const result = await api<Passkey>('/security/passkeys/registration/verify', { method: 'POST', body: JSON.stringify({ response, label: 'This device', deviceInfo: navigator.userAgent }) });
    setPasskeys((current) => [result.data, ...current]);
    setMessage('Passkey registered successfully.');
  }

  async function revokeTrustedDevice(id: string) {
    await api(`/security/trusted-devices/${id}/revoke`, { method: 'POST' });
    setTrustedDevices((current) => current.filter((device) => device.id !== id));
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Security Center" subtitle="Protect your account and review active sessions." />
      {message ? <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">{message}</div> : null}
      <section className="rounded-xl bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="font-semibold">Two-factor authentication</h2>
            <p className="mt-1 text-sm text-slate-500">{twoFactorEnabled ? 'Enabled' : 'Not enabled'}</p>
          </div>
          {!twoFactorEnabled ? <button className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white" onClick={beginSetup}>Set up 2FA</button> : null}
        </div>
        {setupUri ? (
          <div className="mt-4 space-y-3">
            <p className="break-all rounded bg-slate-50 p-3 text-xs text-slate-600">{setupUri}</p>
            <div className="flex gap-2">
              <input className="rounded-lg border px-3 py-2" inputMode="numeric" maxLength={6} value={code} onChange={(event) => setCode(event.target.value)} placeholder="6-digit code" />
              <button className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white" onClick={confirmSetup}>Confirm</button>
            </div>
          </div>
        ) : null}
      </section>

      <section className="rounded-xl bg-white p-6 shadow-sm"><h2 className="font-semibold">Trusted devices</h2><div className="mt-4 space-y-2">{trustedDevices.map((device) => <div key={device.id} className="flex items-center justify-between rounded-lg border p-3 text-sm"><span>{device.deviceName || device.browser || 'Unknown device'}<br /><span className="text-slate-500">{device.os || 'Unknown OS'} · {new Date(device.firstSeenAt).toLocaleDateString()}</span></span><button className="text-red-600" onClick={() => revokeTrustedDevice(device.id)}>Revoke</button></div>)}{!trustedDevices.length ? <p className="text-sm text-slate-500">No trusted devices.</p> : null}</div></section>

      <section className="rounded-xl bg-white p-6 shadow-sm"><h2 className="font-semibold">Recent login attempts</h2><div className="mt-4 space-y-2">{loginAttempts.slice(0, 10).map((attempt) => <div key={attempt.id} className="flex justify-between rounded-lg border p-3 text-sm"><span className={attempt.success ? 'text-emerald-700' : 'text-red-700'}>{attempt.success ? 'Successful login' : 'Failed login'}<br /><span className="text-slate-500">{attempt.ipAddress || 'Unknown IP'} · {attempt.userAgent || 'Unknown device'}</span></span><span className="text-slate-500">{new Date(attempt.createdAt).toLocaleString()}</span></div>)}{!loginAttempts.length ? <p className="text-sm text-slate-500">No login attempts.</p> : null}</div></section>

      <section className="rounded-xl bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div><h2 className="font-semibold">Backup codes</h2><p className="mt-1 text-sm text-slate-500">{backupCodesRemaining} unused · regenerating revokes previously issued codes.</p></div>
          <button className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium" onClick={regenerateCodes}>Regenerate</button>
        </div>
        {backupCodes.length ? <pre className="mt-4 rounded bg-slate-50 p-4 text-sm tracking-widest">{backupCodes.join('\n')}</pre> : null}
      </section>

      <section className="rounded-xl bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between gap-4"><h2 className="font-semibold">Active sessions</h2><button className="rounded-lg border border-red-200 px-3 py-2 text-sm text-red-700" onClick={revokeOtherSessions}>Log out others</button></div>
        <div className="mt-4 space-y-2">
          {sessions.map((session) => <div key={session.id} className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm"><span>{session.userAgent || 'Unknown device'}<br /><span className="text-slate-500">{session.ipAddress || 'Unknown IP'}</span></span><span className="flex items-center gap-3 text-slate-500">{new Date(session.lastActiveAt).toLocaleString()}<button className="text-red-600" onClick={() => revokeSession(session.id)}>Revoke</button></span></div>)}
          {!sessions.length ? <p className="text-sm text-slate-500">No sessions found.</p> : null}
        </div>
      </section>

      <section className="rounded-xl bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between gap-4"><h2 className="font-semibold">Passkeys</h2><button className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium" onClick={registerPasskey}>Register passkey</button></div>
        <p className="mt-1 text-sm text-slate-500">Registered biometric and security-key credentials.</p>
        <div className="mt-4 space-y-2">
          {passkeys.map((passkey) => <div key={passkey.id} className="flex items-center justify-between rounded-lg border p-3 text-sm"><span>{passkey.label || 'Unnamed passkey'}<br /><span className="text-slate-500">{passkey.deviceInfo || 'Unknown device'}</span></span><span className="flex gap-3"><button className="text-slate-600" onClick={() => renamePasskey(passkey.id, passkey.label)}>Rename</button><button className="text-red-600" onClick={() => revokePasskey(passkey.id)}>Revoke</button></span></div>)}
          {!passkeys.length ? <p className="text-sm text-slate-500">No passkeys registered.</p> : null}
        </div>
      </section>

      <section className="rounded-xl bg-white p-6 shadow-sm">
        <h2 className="font-semibold">Pending device approvals</h2>
        <div className="mt-4 space-y-2">
          {deviceRequests.filter((request) => request.status === 'PENDING').map((request) => <div key={request.id} className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm"><span>{request.user.fullName} · {request.device.browser || 'Unknown browser'}<br /><span className="text-slate-500">{request.ipAddress || 'Unknown IP'}</span></span><span className="flex gap-3"><button className="text-emerald-700" onClick={() => resolveDeviceRequest(request.id, 'approve')}>Approve</button><button className="text-red-600" onClick={() => resolveDeviceRequest(request.id, 'reject')}>Reject</button></span></div>)}
          {!deviceRequests.some((request) => request.status === 'PENDING') ? <p className="text-sm text-slate-500">No pending requests.</p> : null}
        </div>
      </section>
    </div>
  );
}