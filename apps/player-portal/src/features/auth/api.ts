import { ApiRequestError } from '@/features/characters/api';

async function authFetch(path: string, init?: RequestInit): Promise<void> {
  const res = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    throw new ApiRequestError(res.status, await res.text());
  }
}

export async function login(password: string): Promise<void> {
  await authFetch('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ password }),
  });
}

export async function logout(): Promise<void> {
  await authFetch('/api/auth/logout', { method: 'POST' });
}

export async function getMe(): Promise<void> {
  await authFetch('/api/auth/me');
}
