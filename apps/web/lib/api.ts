const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

export type Envelope<T> = { success: boolean; message: string; data: T; error?: { code: string } };

export async function api<T>(path: string, init: RequestInit = {}): Promise<Envelope<T>> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
  const headers = new Headers(init.headers);
  if (!(init.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const csrf = typeof document !== 'undefined' ? document.cookie.split('; ').find((item) => item.startsWith('csrf_token='))?.split('=')[1] : undefined;
  if (csrf) headers.set('x-csrf-token', csrf);
  const res = await fetch(`${API}${path}`, { ...init, headers, credentials: 'include' });
  const json = (await res.json()) as Envelope<T>;
  if (!res.ok || json.success === false) {
    throw Object.assign(new Error(json.message ?? 'Request failed'), { code: json.error?.code, status: res.status });
  }
  return json;
}
