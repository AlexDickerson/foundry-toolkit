// List all users in data/users.json (no password hashes).
// Usage: npm run user:list -w @foundry-toolkit/player-portal

import './load-env.js';
import { DEFAULT_USERS_FILE, loadUsersFile } from '../server/auth/users.js';

const users = loadUsersFile(DEFAULT_USERS_FILE);
if (users.length === 0) {
  console.log('No users found.');
  process.exit(0);
}

console.log(`${'ID'.padEnd(38)}  ${'Username'.padEnd(24)}  ActorId`);
console.log('-'.repeat(80));
for (const u of users) {
  console.log(`${u.id.padEnd(38)}  ${u.username.padEnd(24)}  ${u.actorId}`);
}
