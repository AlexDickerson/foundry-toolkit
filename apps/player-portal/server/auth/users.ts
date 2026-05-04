import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import bcryptjs from 'bcryptjs';

const SALT_ROUNDS = 12;

export interface User {
  id: string;
  username: string;
  passwordHash: string;
  actorId: string;
  createdAt: string;
}

interface PublicUser {
  id: string;
  username: string;
  actorId: string;
  createdAt: string;
}

// Default path — overridable via env var for tests
const _defaultFile = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'data',
  'users.json',
);
export const DEFAULT_USERS_FILE: string = process.env['PORTAL_USERS_FILE'] ?? _defaultFile;

// ---- File I/O (exported for testing) ------------------------------------

export function loadUsersFile(filePath: string): User[] {
  if (!existsSync(filePath)) return [];
  try {
    return JSON.parse(readFileSync(filePath, 'utf8')) as User[];
  } catch {
    return [];
  }
}

export function saveUsersFile(list: User[], filePath: string): void {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(list, null, 2) + '\n', 'utf8');
}

// ---- In-memory cache (server) -------------------------------------------

let _users: User[] = [];

/** Load the users file into the in-memory cache. Call once at server boot. */
export function initUsers(filePath: string = DEFAULT_USERS_FILE): void {
  _users = loadUsersFile(filePath);
  console.info(`[auth] loaded ${_users.length.toString()} user(s) from ${filePath}`);
}

export function findByUsername(username: string): User | undefined {
  return _users.find((u) => u.username === username);
}

export function findById(id: string): User | undefined {
  return _users.find((u) => u.id === id);
}

/** Overwrite the in-memory list and persist to disk. Used by CLI scripts. */
export function persistUsers(list: User[], filePath: string = DEFAULT_USERS_FILE): void {
  _users = list;
  saveUsersFile(list, filePath);
}

// ---- Password helpers ---------------------------------------------------

export async function hashPassword(password: string): Promise<string> {
  return bcryptjs.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcryptjs.compare(password, hash);
}

// ---- Shape helpers ------------------------------------------------------

export function toPublic(user: User): PublicUser {
  const { passwordHash: _h, ...pub } = user;
  return pub;
}
