import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { appendFile, readFile, readdir, realpath, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { connectDatabase, isInMaintenance, maintenanceFile, maintenanceLock } from '../src/database.js';

const run = promisify(execFile);
const tables = ['accounts', 'projects', 'transactions', 'checklist_items', 'audit_events'];
const retention = 30 * 24 * 60 * 60 * 1000;
const logFile = resolve(process.env.PACCO_BACKUP_LOG || '.pacco-backup.log');

async function log(message) {
  const line = `${new Date().toISOString()} ${message}\n`;
  await appendFile(logFile, line, { mode: 0o600 });
  process.stdout.write(line);
}

async function backupDirectory() {
  if (!process.env.PACCO_BACKUP_DIR) throw new Error('Set PACCO_BACKUP_DIR to the mounted external backup directory.');
  const directory = await realpath(process.env.PACCO_BACKUP_DIR);
  const target = await stat(directory);
  if (!target.isDirectory()) throw new Error('The backup destination must be a directory.');
  const host = await stat('/');
  const working = await stat(process.cwd());
  if (target.dev === host.dev || target.dev === working.dev) {
    throw new Error('The backup directory must be on a separate mounted filesystem.');
  }
  return directory;
}

function pgArguments() {
  const url = new URL(process.env.DATABASE_URL);
  const password = url.searchParams.get('password') ?? decodeURIComponent(url.password);
  url.password = '';
  url.searchParams.delete('password');
  return { db: url.toString(), env: { ...process.env, ...(password ? { PGPASSWORD: password } : {}) } };
}

async function postgresTool(command, args, env) {
  try {
    await run(command, args, { env, maxBuffer: 4 * 1024 * 1024 });
  } catch (error) {
    const detail = error.stderr?.trim() || error.code;
    throw new Error(`${command} failed (${detail})`);
  }
}

async function checksum(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

async function fingerprint(client, allowEmpty = false) {
  const fingerprints = {};
  for (const table of tables) {
    const exists = await client.query('SELECT to_regclass($1) IS NOT NULL AS present', [`public.${table}`]);
    if (!exists.rows[0].present && allowEmpty) {
      fingerprints[table] = null;
      continue;
    }
    const result = await client.query(`
      SELECT count(*)::text AS rows,
        md5(COALESCE(string_agg(md5(to_jsonb(record)::text), '' ORDER BY record.id), '')) AS contents
      FROM public.${table} AS record
    `);
    fingerprints[table] = result.rows[0];
  }
  return fingerprints;
}

async function dump(client, directory, options, { safety = false } = {}) {
  const stamp = new Date().toISOString().replaceAll(':', '-');
  const name = `${safety ? 'safety' : 'backup'}-${stamp}-${randomUUID()}.dump`;
  const archive = join(directory, name);
  const staging = `${archive}.partial`;
  const metadata = `${archive}.json`;
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  try {
    if (!safety) {
      const available = await client.query('SELECT pg_try_advisory_xact_lock_shared($1) AS ready', [maintenanceLock]);
      if (!available.rows[0].ready || await isInMaintenance()) throw new Error('The database is undergoing maintenance.');
    }
    const { rows } = await client.query('SELECT pg_export_snapshot() AS snapshot');
    const contents = await fingerprint(client, safety);
    await postgresTool('pg_dump', [
      '--no-password', '--format=custom', '--no-owner', '--no-privileges',
      '--snapshot', rows[0].snapshot, '--file', staging, '--dbname', options.db,
    ], options.env);
    await postgresTool('pg_restore', ['--list', staging], options.env);
    await client.query('COMMIT');
    const manifest = { version: 1, createdAt: new Date().toISOString(), sha256: await checksum(staging), contents };
    await writeFile(`${metadata}.partial`, JSON.stringify(manifest, null, 2), { flag: 'wx', mode: 0o600 });
    await rename(staging, archive);
    await rename(`${metadata}.partial`, metadata);
    return name;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    for (const file of [staging, archive, `${metadata}.partial`]) {
      await unlink(file).catch((failure) => { if (failure.code !== 'ENOENT') console.error(failure.message); });
    }
    throw error;
  }
}

async function expireBackups(directory) {
  const now = Date.now();
  for (const name of await readdir(directory)) {
    if (!/^backup-\d{4}-\d{2}-\d{2}T[\d.Z-]+-[0-9a-f-]{36}\.dump$/.test(name)) continue;
    const archive = join(directory, name);
    if (now - (await stat(archive)).mtimeMs < retention) continue;
    await unlink(archive);
    await unlink(`${archive}.json`).catch((error) => { if (error.code !== 'ENOENT') throw error; });
  }
}

async function restore(client, directory, archive, options) {
  const metadata = JSON.parse(await readFile(`${archive}.json`, 'utf8'));
  if (metadata.version !== 1 || await checksum(archive) !== metadata.sha256) {
    throw new Error('The selected archive fails its integrity check.');
  }
  await postgresTool('pg_restore', ['--list', archive], options.env);
  const available = await client.query('SELECT pg_try_advisory_lock($1) AS ready', [maintenanceLock]);
  if (!available.rows[0].ready) {
    throw new Error('The database is busy. Stop the application and rerun the restore.');
  }
  try {
    await writeFile(maintenanceFile, new Date().toISOString(), { mode: 0o600 });
    const safety = await dump(client, directory, options, { safety: true });
    await log(`RESTORE safety copy ${safety}`);
    await postgresTool('pg_restore', [
      '--no-password', '--clean', '--if-exists', '--single-transaction',
      '--no-owner', '--no-privileges', '--dbname', options.db, archive,
    ], options.env);
    const actual = await fingerprint(client, true);
    for (const table of tables) {
      const expected = metadata.contents[table];
      if (actual[table]?.rows !== expected?.rows || actual[table]?.contents !== expected?.contents) {
        throw new Error(`Restoration verification failed for ${table}. Maintenance mode remains active.`);
      }
    }
    await client.query('DELETE FROM sessions');
    await log('RESTORE verified accounts, projects, transactions, checklists, slips, and audit history.');
    await unlink(maintenanceFile);
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [maintenanceLock]);
  }
}

process.umask(0o077);
const [operation, input] = process.argv.slice(2);
let database;
try {
  if (operation !== 'backup' && (operation !== 'restore' || !input)) {
    throw new Error('Use backup or restore <archive.dump>.');
  }
  const directory = await backupDirectory();
  database = connectDatabase();
  const options = pgArguments();
  const client = await database.pool.connect();
  try {
    await client.query("SET TIME ZONE 'UTC'");
    if (operation === 'backup') {
      const name = await dump(client, directory, options);
      await expireBackups(directory);
      await log(`BACKUP success ${name}`);
    } else {
      await restore(client, directory, resolve(input), options);
    }
  } finally {
    client.release();
  }
} catch (error) {
  const message = `${(operation || 'database').toUpperCase()} failed: ${error.message}`;
  try {
    await log(message);
  } catch (failure) {
    console.error(message, `(log unavailable: ${failure.message})`);
  }
  process.exitCode = 1;
} finally {
  await database?.close();
}
