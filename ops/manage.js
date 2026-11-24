import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { hashPin, username } from '../src/auth.js';
import { connectDatabase, migrate } from '../src/database.js';
import { oneOf, roles, text } from '../src/domain.js';

async function readPin() {
  if (!process.stdin.isTTY) {
    let input = '';
    for await (const chunk of process.stdin) input += chunk;
    return input.trim();
  }
  const hiddenOutput = new Writable({ write(_chunk, _encoding, done) { done(); } });
  const line = createInterface({ input: process.stdin, output: hiddenOutput, terminal: true });
  try {
    process.stderr.write('Four-digit PIN: ');
    return await line.question('');
  } finally {
    line.close();
    process.stderr.write('\n');
  }
}

const [operation, requestedName, requestedRole, requestedDisplayName] = process.argv.slice(2);
const database = connectDatabase();
try {
  if (operation === 'migrate') {
    await migrate(database);
    console.log('Database schema ready.');
  } else if (operation === 'create') {
    const name = username(requestedName);
    const role = oneOf(requestedRole, roles, 'Role');
    const displayName = text(requestedDisplayName, 'Display name', 120, true);
    const verifier = await hashPin(await readPin());
    const saved = await database.transaction((client) => client.query(`
      INSERT INTO accounts (username, role, display_name, pin_verifier)
      VALUES ($1, $2, $3, $4) ON CONFLICT (username) DO NOTHING
    `, [name, role, displayName, verifier]));
    if (!saved.rowCount) throw new Error('This username is already in use.');
    console.log(`Created ${name} with role ${role}.`);
  } else if (operation === 'deactivate' || operation === 'set-role') {
    const name = username(requestedName);
    const role = operation === 'set-role' ? oneOf(requestedRole, roles, 'Role') : null;
    await database.transaction(async (client) => {
      const result = role
        ? await client.query('UPDATE accounts SET role = $2 WHERE username = $1 RETURNING id', [name, role])
        : await client.query('UPDATE accounts SET active = false WHERE username = $1 RETURNING id', [name]);
      if (!result.rowCount) throw new Error('Account not found.');
      await client.query('DELETE FROM sessions WHERE account_id = $1', [result.rows[0].id]);
    });
    console.log(role ? `Updated ${name} to ${role}.` : `Deactivated ${name}.`);
  } else {
    throw new Error('Use migrate, create <username> <role> <display name>, set-role <username> <role>, or deactivate <username>.');
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await database.close();
}
