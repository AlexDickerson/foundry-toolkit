import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  findById,
  findByUsername,
  hashPassword,
  initUsers,
  loadUsersFile,
  persistUsers,
  saveUsersFile,
  toPublic,
  verifyPassword,
  type User,
} from './users.js';

let testDir: string;
let testFile: string;

beforeEach(() => {
  testDir = join(tmpdir(), `portal-users-test-${randomUUID()}`);
  mkdirSync(testDir, { recursive: true });
  testFile = join(testDir, 'users.json');
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

// ---- hashPassword / verifyPassword -------------------------------------

describe('hashPassword / verifyPassword', () => {
  it('produces a verifiable bcrypt hash', async () => {
    const hash = await hashPassword('hunter2');
    expect(hash).toMatch(/^\$2[ab]\$/);
    expect(hash.length).toBe(60);
    await expect(verifyPassword('hunter2', hash)).resolves.toBe(true);
  });

  it('rejects wrong password', async () => {
    const hash = await hashPassword('correct');
    await expect(verifyPassword('wrong', hash)).resolves.toBe(false);
  });

  it('is case-sensitive for passwords', async () => {
    const hash = await hashPassword('Secret');
    await expect(verifyPassword('secret', hash)).resolves.toBe(false);
    await expect(verifyPassword('Secret', hash)).resolves.toBe(true);
  });
});

// ---- loadUsersFile / saveUsersFile -------------------------------------

describe('loadUsersFile', () => {
  it('returns empty array when file does not exist', () => {
    expect(loadUsersFile(join(testDir, 'nonexistent.json'))).toEqual([]);
  });

  it('round-trips a user list', () => {
    const users: User[] = [
      { id: '1', username: 'alice', passwordHash: '$2b$12$fake', actorId: 'a1', createdAt: '2024-01-01T00:00:00.000Z' },
    ];
    saveUsersFile(users, testFile);
    expect(existsSync(testFile)).toBe(true);
    expect(loadUsersFile(testFile)).toEqual(users);
  });

  it('creates parent directories when saving', () => {
    const deep = join(testDir, 'a', 'b', 'users.json');
    saveUsersFile([], deep);
    expect(existsSync(deep)).toBe(true);
  });
});

// ---- In-memory cache ---------------------------------------------------

describe('in-memory cache (initUsers / findByUsername / findById)', () => {
  it('finds a user by username (case-sensitive)', () => {
    const users: User[] = [
      { id: 'u1', username: 'Alice', passwordHash: 'h', actorId: '', createdAt: '' },
    ];
    saveUsersFile(users, testFile);
    initUsers(testFile);

    expect(findByUsername('Alice')).toBeDefined();
    expect(findByUsername('alice')).toBeUndefined(); // case-sensitive
    expect(findByUsername('ALICE')).toBeUndefined();
  });

  it('finds a user by id', () => {
    const users: User[] = [
      { id: 'abc-123', username: 'bob', passwordHash: 'h', actorId: '', createdAt: '' },
    ];
    saveUsersFile(users, testFile);
    initUsers(testFile);

    expect(findById('abc-123')).toEqual(users[0]);
    expect(findById('wrong')).toBeUndefined();
  });

  it('persistUsers writes and updates the cache', () => {
    initUsers(testFile); // start empty
    const users: User[] = [
      { id: 'x1', username: 'carol', passwordHash: 'h', actorId: '', createdAt: '' },
    ];
    persistUsers(users, testFile);
    expect(findByUsername('carol')).toBeDefined();
    expect(loadUsersFile(testFile)).toEqual(users);
  });
});

// ---- toPublic ----------------------------------------------------------

describe('toPublic', () => {
  it('strips passwordHash from the user record', () => {
    const user: User = { id: '1', username: 'alice', passwordHash: '$2b$12$secret', actorId: 'a1', createdAt: '' };
    const pub = toPublic(user);
    expect('passwordHash' in pub).toBe(false);
    expect(pub.username).toBe('alice');
  });
});
