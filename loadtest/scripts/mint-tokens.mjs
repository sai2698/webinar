import { readFile, writeFile } from 'node:fs/promises';

const api = process.env.SOCKET_URL;
const usersPath = process.env.USERS_FILE || './users.json';
const output = process.env.TOKENS_FILE || './tokens.json';
if (!api) throw new Error('Set SOCKET_URL to your staging API origin.');
const users = JSON.parse(await readFile(usersPath, 'utf8'));
const tokens = [];
for (const user of users) {
  const response = await fetch(new URL('/api/auth/login', api), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: user.email, password: user.password }),
  });
  if (!response.ok) throw new Error(`Login failed for ${user.email}: HTTP ${response.status}`);
  const body = await response.json();
  if (!body.token) throw new Error(`No JWT returned for ${user.email}`);
  tokens.push({ token: body.token, name: body.user?.name || user.email });
}
await writeFile(output, JSON.stringify(tokens, null, 2), { mode: 0o600 });
console.log(`Wrote ${tokens.length} JWTs to ${output}. Keep this file secret and out of git.`);
