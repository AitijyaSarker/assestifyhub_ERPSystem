const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

export type Envelope<T> = { success: boolean; message: string; data: T; error?: { code: string } };

async function refreshAccessToken(): Promise<string | null> {
  const res = await fetch(`${API}/auth/refresh`, { method: 'POST', credentials: 'include' });
  if (!res.ok) return null;
  const json = (await res.json()) as Envelope<{ accessToken: string }>;
  if (!json.success || !json.data?.accessToken) return null;
  localStorage.setItem('accessToken', json.data.accessToken);
  return json.data.accessToken;
}

export async function api<T>(path: string, init: RequestInit = {}, allowRefresh = true): Promise<Envelope<T>> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
  const headers = new Headers(init.headers);
  if (!(init.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const csrf = typeof document !== 'undefined' ? document.cookie.split('; ').find((item) => item.startsWith('csrf_token='))?.split('=')[1] : undefined;
  if (csrf) headers.set('x-csrf-token', csrf);
  const res = await fetch(`${API}${path}`, { ...init, headers, credentials: 'include' });
  const json = (await res.json()) as Envelope<T>;
  if (res.status === 401 && allowRefresh && typeof window !== 'undefined' && path !== '/auth/refresh' && path !== '/auth/login') {
    const refreshed = await refreshAccessToken();
    if (refreshed) return api<T>(path, init, false);
    localStorage.removeItem('accessToken');
    localStorage.removeItem('roles');
  }
  if (!res.ok || json.success === false) {
    throw Object.assign(new Error(json.message ?? 'Request failed'), { code: json.error?.code, status: res.status });
  }
  return json;
}
