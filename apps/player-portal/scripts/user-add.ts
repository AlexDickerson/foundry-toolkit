// Add a new user to data/users.json.
// Usage: npm run user:add -w @foundry-toolkit/player-portal -- --username alice --password "s3cr3t" --actor-id "abc123"
//
// Usernames are case-sensitive. Duplicate usernames are rejected.

import './load-env.js';
import { randomUUID } from 'node:crypto';
import { parseArgs } from 'node:util';
import { DEFAULT_USERS_FILE, hashPassword, loadUsersFile, saveUsersFile, type User } from '../server/auth/users.js';

const { values } = parseArgs({
  options: {
    username: { type: 'string' },
    password: { type: 'string' },
    'actor-id': { type: 'string' },
  },
});

const username = values['username'];
const password = values['password'];
const actorId = values['actor-id'] ?? '';

if (!username || !password) {
  console.error('Usage: user:add --username <u> --password <p> [--actor-id <id>]');
  process.exit(1);
}

const users = loadUsersFile(DEFAULT_USERS_FILE);
if (users.some((u) => u.username === username)) {
  console.error(`User "${username}" already exists.`);
  process.exit(1);
}

const passwordHash = await hashPassword(password);
const user: User = {
  id: randomUUID(),
  username,
  passwordHash,
  actorId,
  createdAt: new Date().toISOString(),
};

saveUsersFile([...users, user], DEFAULT_USERS_FILE);
console.log(`Added user "${username}" (id: ${user.id})`);
