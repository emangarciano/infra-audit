import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { RequestError } from './database.js';

const deriveKey = promisify(scrypt);
const sessionCookie = 'pacco_session';
const pinPattern = /^[0-9]{4}$/;
const usernamePattern = /^[a-z0-9._-]{1,64}$/;
const dummyPin = hashPin('0000');

function digest(token) {
  return createHash('sha256').update(token).digest('hex');
}

export function username(value) {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!usernamePattern.test(normalized)) throw new RequestError(400, 'Enter a valid username.');
  return normalized;
}

export async function hashPin(pin) {
  if (typeof pin !== 'string' || !pinPattern.test(pin)) {
    throw new RequestError(400, 'Enter a four-digit PIN.');
  }
  const salt = randomBytes(16).toString('hex');
  const key = await deriveKey(pin, salt, 64);
  return `${salt}:${key.toString('hex')}`;
}

async function verifyPin(pin, verifier) {
  const [salt, value] = verifier.split(':');
  const expected = Buffer.from(value, 'hex');
  const candidate = await deriveKey(pin, salt, 64);
  return expected.length === candidate.length && timingSafeEqual(expected, candidate);
}

function sessionToken(req) {
  const cookie = req.headers.cookie?.split(';').map((value) => value.trim())
    .find((value) => value.startsWith(`${sessionCookie}=`));
  const token = cookie?.slice(sessionCookie.length + 1);
  return token && /^[a-f0-9]{64}$/.test(token) ? token : null;
}

function publicAccount(account) {
  return { id: account.id, displayName: account.display_name, role: account.role };
}

export async function logIn(client, body) {
  const name = username(body.username);
  if (typeof body.pin !== 'string' || !pinPattern.test(body.pin)) {
    throw new RequestError(400, 'Enter a four-digit PIN.');
  }
  const lookup = await client.query(
    'SELECT *, locked_until > clock_timestamp() AS locked FROM accounts WHERE username = $1 FOR UPDATE',
    [name],
  );
  const account = lookup.rows[0];
  const valid = await verifyPin(body.pin, account?.pin_verifier ?? await dummyPin);
  if (!account?.active) return { status: 401, error: 'The username or PIN is incorrect.' };
  if (account.locked) return { status: 423, error: 'This account is locked for 15 minutes after five failed attempts.' };
  if (!valid) {
    const attempts = (account.locked_until ? 0 : account.failed_attempts) + 1;
    await client.query(`
      UPDATE accounts SET failed_attempts = $2,
        locked_until = CASE WHEN $2 >= 5 THEN clock_timestamp() + INTERVAL '15 minutes' ELSE NULL END
      WHERE id = $1
    `, [account.id, attempts]);
    return attempts >= 5
      ? { status: 423, error: 'This account is locked for 15 minutes after five failed attempts.' }
      : { status: 401, error: 'The username or PIN is incorrect.' };
  }

  await client.query('UPDATE accounts SET failed_attempts = 0, locked_until = NULL WHERE id = $1', [account.id]);
  await client.query(`
    DELETE FROM sessions WHERE account_id = $1 AND last_seen_at <= clock_timestamp() - INTERVAL '60 minutes'
  `, [account.id]);
  const token = randomBytes(32).toString('hex');
  await client.query('INSERT INTO sessions (token_hash, account_id) VALUES ($1, $2)', [digest(token), account.id]);
  return { status: 200, token, user: publicAccount(account) };
}

export async function authenticate(client, req) {
  const token = sessionToken(req);
  if (!token) throw new RequestError(401, 'Sign in to continue.');
  const result = await client.query(`
    UPDATE sessions AS s SET last_seen_at = clock_timestamp()
    FROM accounts AS a
    WHERE s.token_hash = $1 AND a.id = s.account_id AND a.active
      AND s.last_seen_at > clock_timestamp() - INTERVAL '60 minutes'
    RETURNING a.id, a.display_name, a.role
  `, [digest(token)]);
  if (!result.rowCount) throw new RequestError(401, 'Your session ended. Sign in again.');
  return publicAccount(result.rows[0]);
}

export async function logOut(client, req) {
  const token = sessionToken(req);
  if (token) await client.query('DELETE FROM sessions WHERE token_hash = $1', [digest(token)]);
}

export function setSessionCookie(req, res, token) {
  const options = { httpOnly: true, sameSite: 'strict', path: '/', secure: req.secure };
  if (token) res.cookie(sessionCookie, token, options);
  else res.clearCookie(sessionCookie, options);
}
