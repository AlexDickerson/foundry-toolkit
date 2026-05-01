// Remove a user from data/users.json.
// Usage: npm run user:remove -w @foundry-toolkit/player-portal -- --username alice

import './load-env.js';
import { parseArgs } from 'node:util';
import { DEFAULT_USERS_FILE, loadUsersFile, saveUsersFile } from '../server/auth/users.js';

const { values } = parseArgs({
  options: {
    username: { type: 'string' },
  },
});

const username = values['username'];
if (!username) {
  console.error('Usage: user:remove --username <u>');
  process.exit(1);
}

const users = loadUsersFile(DEFAULT_USERS_FILE);
const filtered = users.filter((u) => u.username !== username);
if (filtered.length === users.length) {
  console.error(`User "${username}" not found.`);
  process.exit(1);
}

saveUsersFile(filtered, DEFAULT_USERS_FILE);
console.log(`Removed user "${username}".`);
