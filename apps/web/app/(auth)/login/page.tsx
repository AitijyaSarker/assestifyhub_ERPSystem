'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { startAuthentication, type PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/browser';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('admin@erp.local');
  const [password, setPassword] = useState('ChangeMeNow!123');
  const [error, setError] = useState<string | null>(null);
  const [otpCode, setOtpCode] = useState('');
  const [backupCode, setBackupCode] = useState('');
  const [captchaReady, setCaptchaReady] = useState(false);

  useEffect(() => {
    const siteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;
    if (!siteKey || document.querySelector('script[data-recaptcha]')) return;
    const script = document.createElement('script');
    script.src = `https://www.google.com/recaptcha/api.js?render=${siteKey}`;
    script.async = true;
    script.dataset.recaptcha = 'true';
    script.onload = () => setCaptchaReady(true);
    document.head.appendChild(script);
  }, []);

  function deviceFingerprint() {
    return `${navigator.userAgent}|${navigator.language}|${screen.width}x${screen.height}|${Intl.DateTimeFormat().resolvedOptions().timeZone}`;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const siteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;
      const captcha = (window as unknown as { grecaptcha?: { ready: (cb: () => void) => void; execute: (key: string, options: { action: string }) => Promise<string> } }).grecaptcha;
      const captchaToken = siteKey && captchaReady && captcha
        ? await new Promise<string | undefined>((resolve) => captcha.ready(() => captcha.execute(siteKey, { action: 'login' }).then(resolve)))
        : undefined;
      const res = await api<{ accessToken: string; user: { roles: string[] } }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password, otpCode: otpCode || undefined, backupCode: backupCode || undefined, captchaToken, deviceFingerprint: deviceFingerprint() }),
      });
      localStorage.setItem('accessToken', res.data.accessToken);
      localStorage.setItem('roles', JSON.stringify(res.data.user.roles));
      router.push(res.data.user.roles.includes('SUPER_ADMIN') ? '/dashboard' : '/pos');
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function passkeyLogin() {
    setError(null);
    try {
      const options = await api<PublicKeyCredentialRequestOptionsJSON>('/auth/passkey/options', { method: 'POST', body: JSON.stringify({ email: email || undefined }) });
      const response = await startAuthentication({ optionsJSON: options.data });
      const result = await api<{ accessToken: string; user: { roles: string[] } }>('/auth/passkey/verify', { method: 'POST', body: JSON.stringify({ response, deviceFingerprint: deviceFingerprint() }) });
      localStorage.setItem('accessToken', result.data.accessToken);
      localStorage.setItem('roles', JSON.stringify(result.data.user.roles));
      router.push(result.data.user.roles.includes('SUPER_ADMIN') ? '/dashboard' : '/pos');
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="grid min-h-screen bg-[var(--canvas)] lg:grid-cols-[1.05fr_0.95fr]">
      <div className="hidden flex-col justify-between bg-[var(--navy)] p-10 text-white lg:flex xl:p-16">
        <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#dff2ec] font-bold text-[var(--navy)]">R</span><span><span className="block font-display text-lg font-semibold">RetailOS</span><span className="block text-[10px] uppercase tracking-[0.2em] text-white/40">Operations</span></span></div>
        <div className="max-w-lg"><p className="mb-5 text-xs font-semibold uppercase tracking-[0.22em] text-[#a9d9ce]">A calmer way to run retail</p><h1 className="font-display text-5xl font-semibold leading-[1.08] tracking-tight">Every shop, one clear picture.</h1><p className="mt-6 max-w-md text-sm leading-6 text-white/50">Manage products, inventory, sales, and returns from one focused workspace built for the pace of the floor.</p></div>
        <p className="text-xs text-white/35">Secure operations workspace · 2026</p>
      </div>
      <div className="flex items-center justify-center px-5 py-10 sm:px-10">
      <form onSubmit={onSubmit} className="w-full max-w-md rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-7 shadow-[0_20px_50px_rgba(22,45,53,0.08)] sm:p-10">
        <div className="mb-10 lg:hidden"><span className="font-display text-xl font-semibold text-[var(--navy)]">RetailOS</span><span className="ml-2 text-[10px] uppercase tracking-[0.2em] text-[var(--muted)]">Operations</span></div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--mint)]">Welcome back</p>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-[var(--navy)]">Sign in to your workspace</h1>
        <p className="mt-2 mb-8 text-sm text-[var(--muted)]">Use your staff account to continue.</p>
        <label className="mb-4 block text-sm font-medium text-[var(--navy)]">
          Email address
          <input className="mt-2 w-full rounded-xl border border-[var(--line)] bg-white px-3.5 py-3 outline-none transition focus:border-[var(--mint)] focus:ring-4 focus:ring-[var(--mint-soft)]" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="mb-5 block text-sm font-medium text-[var(--navy)]">
          Password
          <input
            type="password"
            className="mt-2 w-full rounded-xl border border-[var(--line)] bg-white px-3.5 py-3 outline-none transition focus:border-[var(--mint)] focus:ring-4 focus:ring-[var(--mint-soft)]"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <div className="mb-5 grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium text-[var(--navy)]">Authenticator code<input className="mt-2 w-full rounded-xl border border-[var(--line)] bg-white px-3.5 py-3" inputMode="numeric" maxLength={6} value={otpCode} onChange={(e) => setOtpCode(e.target.value)} placeholder="Optional" /></label>
          <label className="text-sm font-medium text-[var(--navy)]">Backup code<input className="mt-2 w-full rounded-xl border border-[var(--line)] bg-white px-3.5 py-3" value={backupCode} onChange={(e) => setBackupCode(e.target.value)} placeholder="Optional" /></label>
        </div>
        {error ? <p className="mb-4 rounded-xl bg-[#fff0ec] px-3 py-2.5 text-sm text-[#b34e3c]">{error}</p> : null}
        <button className="w-full rounded-xl bg-[var(--mint)] py-3.5 text-sm font-semibold text-white transition hover:bg-[#176d63]">Continue to RetailOS</button>
        <button type="button" onClick={passkeyLogin} className="mt-3 w-full rounded-xl border border-[var(--line)] py-3.5 text-sm font-semibold text-[var(--navy)] transition hover:border-[var(--mint)]">Use a passkey</button>
        <p className="mt-6 text-center text-xs text-[var(--muted)]">Protected access for authorized staff</p>
      </form>
      </div>
    </div>
  );
}
