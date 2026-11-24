import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { test } from 'node:test';
import { createApp } from '../src/app.js';
import { hashPin } from '../src/auth.js';
import { connectDatabase, migrate } from '../src/database.js';
import { amount, amountForCopy, date } from '../src/domain.js';
import { loadReferences } from '../src/references.js';

test('Dates and manually entered amounts preserve exact input', () => {
  assert.equal(date('2024-02-29', 'Date'), '2024-02-29');
  assert.throws(() => date('2023-02-29', 'Date'));
  assert.equal(amount('1,234.5', 'Amount'), '1234.50');
  assert.deepEqual(amountForCopy('1234.50'), {
    figures: '₱1,234.50', words: 'one thousand two hundred thirty-four pesos and fifty centavos',
  });
  assert.equal(amountForCopy('1.01').words, 'one peso and one centavo');
  assert.equal(amountForCopy('9999999999999.99').figures, '₱9,999,999,999,999.99');
  assert.throws(() => amount('1,23.45', 'Amount'));
  assert.throws(() => amount('1.234', 'Amount'));
});

const url = process.env.PACCO_TEST_DATABASE_URL;
test('Lean MVP API against PostgreSQL', { skip: !url && 'Set PACCO_TEST_DATABASE_URL for database tests.' }, async (t) => {
  const coordinator = connectDatabase(url);
  const schema = `pacco_test_${randomBytes(8).toString('hex')}`;
  let db;
  let server;
  t.after(async () => {
    try {
      if (server?.listening) {
        await new Promise((resolve) => {
          server.close(resolve);
          server.closeAllConnections();
        });
      }
      await db?.close();
      await coordinator.pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    } finally {
      await coordinator.close();
    }
  });
  await coordinator.pool.query(`CREATE SCHEMA ${schema}`);
  const isolated = new URL(url);
  isolated.searchParams.set('options', `-c search_path=${schema}`);
  db = connectDatabase(isolated.toString());
  await migrate(db);
  const users = [
    ['intake', 'Intake Staff', 'intake'],
    ['auditor-a', 'Auditor A', 'auditor'],
    ['auditor-b', 'Auditor B', 'auditor'],
    ['supervisor', 'Supervisor', 'supervisor'],
    ['system-admin', 'System Administrator', 'system-admin'],
    ['lockout', 'Lockout Fixture', 'auditor'],
  ];
  const credentials = {};
  for (const [name, displayName, role] of users) {
    const result = await db.pool.query(`
      INSERT INTO accounts (username, display_name, role, pin_verifier) VALUES ($1, $2, $3, $4) RETURNING id
    `, [name, displayName, role, await hashPin('0123')]);
    credentials[name] = result.rows[0].id;
  }
  const references = await loadReferences({ PACCO_DEVELOPMENT_FIXTURES: '1' });
  server = createApp(db, references).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}/api`;

  async function request(path, { method = 'GET', body, cookie } = {}) {
    const headers = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (cookie) headers.Cookie = cookie;
    const response = await fetch(base + path, { method, headers, body: JSON.stringify(body) });
    const data = response.status === 204 ? null
      : response.headers.get('content-type')?.includes('application/json') ? await response.json() : await response.text();
    return { status: response.status, data, cookie: response.headers.get('set-cookie')?.split(';')[0] };
  }
  async function login(name, pin = '0123') {
    return request('/session', { method: 'POST', body: { username: name, pin } });
  }
  async function success(path, options, status = 200) {
    const response = await request(path, options);
    assert.equal(response.status, status, JSON.stringify(response.data));
    return response.data;
  }
  function post(body, cookie) { return { method: 'POST', body, cookie }; }
  function patch(body, cookie) { return { method: 'PATCH', body, cookie }; }

  const intake = (await login('intake')).cookie;
  const auditor = (await login('auditor-a')).cookie;
  const otherAuditor = (await login('auditor-b')).cookie;
  const supervisor = (await login('supervisor')).cookie;
  const admin = (await login('system-admin')).cookie;
  assert.ok(intake && auditor && otherAuditor && supervisor && admin);

  await t.test('HTTPS reverse proxy accepts the configured browser origin and sets a secure session', async (proxyTest) => {
    const origin = 'https://audit.example.test';
    const proxyApp = createApp(db, references, { origin }).listen(0, '127.0.0.1');
    proxyTest.after(() => new Promise((resolve) => proxyApp.close(resolve)));
    await once(proxyApp, 'listening');
    const endpoint = `http://127.0.0.1:${proxyApp.address().port}/api/session`;
    const browserLogin = (browserOrigin, fetchSite = 'same-origin') => fetch(endpoint, {
      method: 'POST',
      headers: {
        Origin: browserOrigin, 'Sec-Fetch-Site': fetchSite, 'Content-Type': 'application/json',
      },
      body: JSON.stringify({ username: 'auditor-a', pin: '0123' }),
    });

    const session = await browserLogin(origin);
    assert.equal(session.status, 200, await session.text());
    const cookie = session.headers.get('set-cookie');
    assert.match(cookie, /; Secure(?:;|$)/);
    const otherOrigin = await browserLogin('https://elsewhere.example.test');
    assert.equal(otherOrigin.status, 403);
    await otherOrigin.text();
    const crossSite = await browserLogin(origin, 'cross-site');
    assert.equal(crossSite.status, 403);
    await crossSite.text();
  });

  let project;
  let record;
  let selfAssigned;
  let firstSlip;
  let firstSlipPath;
  const txPath = () => `/transactions/${record.id}`;
  const act = async (kind, cookie, body = {}) => {
    const result = await success(`${txPath()}/actions/${kind}`, post({ revision: record.revision, ...body }, cookie));
    record = result.record;
    return result.event_id;
  };
  const read = () => success(txPath(), { cookie: auditor });

  await t.test('AC-01 intake assignment, auditor self-assignment, and duplicate warning', async () => {
    project = await success('/projects', post({ title: 'Development fixture project', contract_amount: '999.99' }, intake), 201);
    const body = {
      project_id: project.id, type: 'progress', reference: 'Fixture progress 01',
      assigned_auditor_id: credentials['auditor-a'], received_on: '2026-11-09',
    };
    record = await success('/transactions', post(body, intake), 201);
    const duplicate = await request('/transactions', post(body, intake));
    assert.equal(duplicate.status, 409);
    assert.equal(duplicate.data.code, 'duplicate');
    await success('/transactions', post({ ...body, allow_duplicate: true }, intake), 201);
    selfAssigned = await success('/transactions', post({
      ...body, reference: 'Fixture auditor 02', type: 'bac',
      assigned_auditor_id: credentials['auditor-a'],
    }, otherAuditor), 201);

    const queue = await success('/transactions', { cookie: intake });
    assert.equal(queue.find((item) => item.id === record.id).assigned_auditor_id, credentials['auditor-a']);
    assert.equal(queue.find((item) => item.id === selfAssigned.id).assigned_auditor_id, credentials['auditor-b']);
    assert.ok(queue.every((item) => item.status === 'Under Audit'));
    assert.equal((await success(`/projects/${project.id}`, { cookie: auditor })).contract_amount, null);

    const bac = await success(`/transactions/${selfAssigned.id}`, { cookie: otherAuditor });
    assert.equal(bac.checklist.length, 63);
    assert.equal(bac.checklist[0].label, 'APP/SPP');
    assert.equal(bac.checklist.at(-1).label, 'Construction Safety and Health Program approved by DOLE');
    assert.ok(bac.checklist.some((item) => item.label === 'Valid Joint Venture Agreement, if applicable'));
    assert.ok(bac.checklist.every((item) => item.state === 'Unchecked' && !item.custom));
  });

  await t.test('AC-02 shared search, restricted intake history, and audited project corrections', async () => {
    const queue = await success('/transactions?q=Fixture%20progress&status=Under%20Audit&type=progress', { cookie: otherAuditor });
    assert.ok(queue.some((item) => item.id === record.id));
    assert.ok(queue.every((item) => item.type === 'progress'));
    assert.equal((await success(txPath(), { cookie: otherAuditor })).checklist.length, 2);
    const summary = await success(txPath(), { cookie: intake });
    assert.equal(summary.checklist, undefined);
    assert.equal(summary.history[0].details, undefined);
    assert.equal((await request(`${txPath()}/checklist`, patch({ revision: summary.revision }, intake))).status, 403);
    const current = await success(`/projects/${project.id}`, { cookie: supervisor });
    const updated = await success(`/projects/${project.id}`, patch({
      revision: current.revision, contractor: 'Development fixture contractor',
    }, supervisor));
    assert.equal(updated.history[0].details.changes.contractor.after, 'Development fixture contractor');
    assert.equal((await success(`/projects/${project.id}`, { cookie: intake })).contractor, undefined);
  });

  await t.test('AC-03 three checklist states, custom items and exact slip contents', async () => {
    record = await read();
    record = await success(`${txPath()}/checklist`, patch({
      revision: record.revision,
      items: [
        { id: record.checklist[0].id, state: 'Checked' },
        { id: record.checklist[1].id, state: 'N/A' },
      ],
      new_label: 'Development fixture <custom requirement>',
      actual_on: '2026-11-10',
    }, auditor));
    assert.equal(record.latest_action_on, '2026-11-09');
    const custom = record.checklist.find((item) => item.custom);
    assert.equal(custom.state, 'Unchecked');
    const event = await act('suspend', otherAuditor, {
      actual_on: '2026-11-08', item_remarks: { [custom.id]: 'Development fixture reason' },
    });
    assert.equal(record.status, 'Suspended');
    assert.equal(record.latest_action_on, '2026-11-08');
    const suspension = record.history.find((entry) => entry.id === event);
    assert.equal(suspension.actor_id, credentials['auditor-b']);
    assert.equal(record.history.at(-2).kind, 'checklist');
    assert.equal(suspension.details.slip.items.length, 1);
    assert.equal(suspension.details.slip.items[0].remarks, 'Development fixture reason');
    firstSlipPath = `${txPath()}/slips/${event}`;
    firstSlip = await success(firstSlipPath, { cookie: auditor });
    assert.match(firstSlip, /Development fixture · For testing only/);
    assert.match(firstSlip, /&lt;custom requirement&gt;/);
    assert.doesNotMatch(firstSlip, /sample requirement [AB]/);
    assert.equal((await request(firstSlipPath, { cookie: intake })).status, 403);
    assert.equal((await success(txPath(), { cookie: intake })).history.at(-1).details, undefined);
  });

  await t.test('AC-04 slip is reproduced after checklist edits and a new form is loaded', async () => {
    record = await success(`${txPath()}/checklist`, patch({
      revision: record.revision, items: [
        { id: record.checklist.find((item) => item.custom).id, state: 'Checked', remarks: 'Later assessment' },
      ],
    }, auditor));
    references.layout = references.layout.replace('Suspension slip', 'Different print title');
    assert.equal(await success(firstSlipPath, { cookie: auditor }), firstSlip);
  });

  await t.test('AC-05 resubmission preserves checklist and requires explicit resumption', async () => {
    await act('resubmit', intake);
    assert.equal(record.status, 'Resubmitted');
    const premature = await request(`${txPath()}/actions/certify`, post({ revision: record.revision }, auditor));
    assert.equal(premature.status, 409);
    await act('resume', auditor);
    assert.equal(record.status, 'Under Audit');
    assert.equal(record.checklist.find((item) => item.custom).state, 'Checked');
    const empty = await request(`${txPath()}/actions/suspend`, post({ revision: record.revision }, auditor));
    assert.equal(empty.status, 400);
    record = await success(`${txPath()}/checklist`, patch({
      revision: record.revision, new_label: 'Development fixture second deficiency',
    }, auditor));
    await act('suspend', auditor);
    await act('resubmit', auditor);
    await act('resume', supervisor);
    assert.equal(record.history.filter((entry) => entry.has_slip).length, 2);
  });

  await t.test('AC-06 certification warns by requiring justification, captures identity and ends audit flow', async () => {
    const missing = await request(`${txPath()}/actions/certify`, post({ revision: record.revision }, supervisor));
    assert.equal(missing.status, 400);
    await act('certify', supervisor, {
      certified_amount: '1,234.5', justification: 'Development fixture justification', actual_on: '2026-11-11',
      actor_id: credentials['auditor-a'],
    });
    assert.equal(record.status, 'Audited');
    const certification = record.history.at(-1);
    assert.equal(certification.actor_id, credentials.supervisor);
    assert.equal(certification.details.certified_amount, '1234.50');
    assert.equal(certification.details.figures, '₱1,234.50');
    assert.match(certification.details.words, /fifty centavos/);
    assert.equal((await request(`${txPath()}/actions/resume`, post({ revision: record.revision }, auditor))).status, 409);
    const intakeRecord = await success(txPath(), { cookie: intake });
    assert.equal(intakeRecord.history.at(-1).details, undefined);
  });

  await t.test('AC-07 ordered history, concurrent corrections, immutable certification and duplicate void', async () => {
    const results = await Promise.all([
      request(txPath(), patch({ revision: record.revision, reference: 'Fixture corrected A' }, auditor)),
      request(txPath(), patch({ revision: record.revision, reference: 'Fixture corrected B' }, otherAuditor)),
    ]);
    assert.deepEqual(results.map(({ status }) => status).sort(), [200, 409]);
    assert.equal(results.find(({ status }) => status === 409).data.code, 'revision');
    record = await read();
    assert.equal(record.history.at(-1).details.changes.reference.before, 'Fixture progress 01');
    assert.equal(record.history.at(-1).details.changes.reference.after, record.reference);
    assert.equal(record.history.find((entry) => entry.kind === 'certify').details.certified_amount, '1234.50');
    assert.equal(record.latest_action_on, '2026-11-11');
    assert.ok(record.history.every((entry) => entry.actor_id && entry.actual_on && entry.recorded_at));
    await assert.rejects(db.pool.query('UPDATE audit_events SET details = details WHERE transaction_id = $1', [record.id]), /immutable/);
    assert.equal((await request(`${txPath()}/actions/void`, post({ revision: record.revision }, auditor))).status, 400);
    await act('void', auditor, { remarks: 'Development fixture duplicate', actual_on: '2026-11-12' });
    assert.equal(record.voided, true);
    assert.equal(record.status, 'Audited');
    assert.ok((await success('/transactions', { cookie: intake })).every((entry) => entry.id !== record.id));
    const exact = await success(`/transactions?q=${encodeURIComponent(record.reference)}`, { cookie: intake });
    assert.equal(exact.find((entry) => entry.id === record.id).voided, true);
    assert.equal(await success(firstSlipPath, { cookie: auditor }), firstSlip);
  });

  await t.test('AC-08 server permissions, PIN validation, lockout and inactive sessions', async () => {
    assert.equal((await request('/transactions')).status, 401);
    assert.equal((await request('/transactions', { cookie: admin })).status, 403);
    assert.equal((await request(txPath(), { cookie: admin })).status, 403);
    assert.equal((await login('lockout', '123')).status, 400);
    for (let i = 1; i <= 5; i++) {
      assert.equal((await login('lockout', '4444')).status, i === 5 ? 423 : 401);
    }
    assert.equal((await login('lockout')).status, 423);
    const lock = await db.pool.query(`
      SELECT EXTRACT(EPOCH FROM (locked_until - clock_timestamp()))::integer AS seconds
      FROM accounts WHERE username = 'lockout'
    `);
    assert.ok(lock.rows[0].seconds >= 895 && lock.rows[0].seconds <= 900);
    await db.pool.query("UPDATE accounts SET locked_until = clock_timestamp() - INTERVAL '1 second' WHERE username = 'lockout'");
    const unlocked = await login('lockout');
    assert.equal(unlocked.status, 200);
    await db.pool.query(`
      UPDATE sessions SET last_seen_at = clock_timestamp() - INTERVAL '60 minutes' WHERE account_id = $1
    `, [credentials.lockout]);
    assert.equal((await request('/session', { cookie: unlocked.cookie })).status, 401);
    const active = await login('lockout');
    await db.pool.query('UPDATE accounts SET active = false WHERE id = $1', [credentials.lockout]);
    assert.equal((await request('/session', { cookie: active.cookie })).status, 401);
  });
});
