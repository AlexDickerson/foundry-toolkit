import { ApiRequestError } from './client';

export interface AuthUser {
  id: string;
  username: string;
  actorId: string;
  createdAt: string;
}

async function authFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    throw new ApiRequestError(res.status, await res.text());
  }
  return res.json() as Promise<T>;
}

export async function login(username: string, password: string): Promise<AuthUser> {
  const data = await authFetch<{ user: AuthUser }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
  return data.user;
}

export async function logout(): Promise<void> {
  await authFetch('/api/auth/logout', { method: 'POST' });
}

export async function getMe(): Promise<AuthUser> {
  const data = await authFetch<{ user: AuthUser }>('/api/auth/me');
  return data.user;
}
