// Reset a user's password in data/users.json.
// Usage: npm run user:reset-password -w @foundry-toolkit/player-portal -- --username alice --password "newpass"

import './load-env.js';
import { parseArgs } from 'node:util';
import { DEFAULT_USERS_FILE, hashPassword, loadUsersFile, saveUsersFile } from '../server/auth/users.js';

const { values } = parseArgs({
  options: {
    username: { type: 'string' },
    password: { type: 'string' },
  },
});

const username = values['username'];
const password = values['password'];

if (!username || !password) {
  console.error('Usage: user:reset-password --username <u> --password <new>');
  process.exit(1);
}

const users = loadUsersFile(DEFAULT_USERS_FILE);
const idx = users.findIndex((u) => u.username === username);
if (idx === -1) {
  console.error(`User "${username}" not found.`);
  process.exit(1);
}

const newHash = await hashPassword(password);
const updated = users.map((u, i) => (i === idx ? { ...u, passwordHash: newHash } : u));

saveUsersFile(updated, DEFAULT_USERS_FILE);
console.log(`Password updated for "${username}".`);
