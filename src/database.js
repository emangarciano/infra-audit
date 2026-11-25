import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import pg from 'pg';

export const maintenanceLock = 459270126;
export const maintenanceFile = resolve(process.env.PACCO_MAINTENANCE_FILE || '.pacco-maintenance');

export class RequestError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function isInMaintenance(path = maintenanceFile) {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

export function connectDatabase(connectionString = process.env.DATABASE_URL, options = {}) {
  if (!connectionString) throw new Error('Set DATABASE_URL to the PostgreSQL database.');
  const pool = new pg.Pool({ connectionString, connectionTimeoutMillis: 5000 });
  pool.on('error', (error) => console.error('PostgreSQL connection failed:', error.message));

  return {
    pool,
    async transaction(work) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await client.query('SELECT pg_try_advisory_xact_lock_shared($1) AS ready', [maintenanceLock]);
        if (!result.rows[0].ready || await isInMaintenance(options.maintenanceFile)) {
          throw new RequestError(503, 'The system is undergoing maintenance. Keep this page open and try again later.');
        }
        const value = await work(client);
        await client.query('COMMIT');
        return value;
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}

export async function applySchema(client) {
  const schema = await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8');
  await client.query('SELECT pg_advisory_xact_lock($1)', [maintenanceLock + 1]);
  await client.query(schema);
}

export async function migrate(database) {
  await database.transaction(applySchema);
}
