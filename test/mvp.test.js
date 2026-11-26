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
const philgepsCertificate = 'PhilGEPS Certificate of Registration and Membership';
const retiredBacRequirement = 'Other Appropriate Licenses and Permits required by law and stated in the PBD';

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
  let duplicateRegistration;
  let generatedReference;
  let firstSlip;
  let firstSlipPath;
  const txPath = () => `/transactions/${record.id}`;
  const act = async (kind, cookie, body = {}) => {
    const result = await success(`${txPath()}/actions/${kind}`, post({ revision: record.revision, ...body }, cookie));
    record = result.record;
    return result.event_id;
  };
  const read = () => success(txPath(), { cookie: auditor });

  await t.test('Project register search finds names, project references, and linked obligation requests', async () => {
    assert.deepEqual(await success('/projects', { cookie: intake }), []);
    const north = await success('/projects', post({
      title: 'North bridge', reference: 'CAP-N100', contractor: 'North Builders', contract_amount: '100',
      barangay: 'San Isidro', municipality: 'Sample municipality',
    }, intake), 201);
    const south = await success('/projects', post({
      title: 'South road', reference: 'CAP-S200', contractor: 'South Builders', contract_amount: '100',
    }, intake), 201);
    const search = (query) => success(`/projects?${new URLSearchParams({ q: query })}`, { cookie: intake });
    assert.deepEqual(await search('  OrTh Bri  '), [{
      id: north.id, title: 'North bridge', reference: 'CAP-N100', contractor: 'North Builders', contract_amount: '100.00',
      barangay: 'San Isidro', municipality: 'Sample municipality',
    }]);
    assert.deepEqual((await search('s200')).map(({ id }) => id), [south.id]);
    assert.deepEqual(await search('South Builders'), []);
    assert.equal((await request('/projects?q=bridge', { cookie: admin })).status, 403);

    const body = { project_id: south.id, type: 'progress', assigned_auditor_id: credentials['auditor-a'] };
    const first = await success('/transactions', post({
      ...body, reference: 'First billing', obligation_request_reference: '  ORS-701  ',
    }, intake), 201);
    const second = await success('/transactions', post({
      ...body, reference: 'Second billing', obligation_request_reference: 'ORS-701 supplemental',
    }, supervisor), 201);
    for (const invalid of [42, 'X'.repeat(201)]) {
      assert.equal((await request('/transactions', post({
        ...body, reference: 'Invalid obligation', obligation_request_reference: invalid,
      }, auditor))).status, 400);
    }
    assert.deepEqual((await search('  ors-701 ')).map(({ id }) => id), [south.id]);
    assert.equal((await success(`/projects/${south.id}`, { cookie: intake })).title, 'South road');
    assert.deepEqual(await search('First billing'), []);

    const path = `/transactions/${first.id}`;
    const before = await success(path, { cookie: intake });
    assert.equal(before.obligation_request_reference, 'ORS-701');
    assert.ok(before.reference);
    assert.notEqual(before.reference, 'First billing');
    const correction = { revision: before.revision, obligation_request_reference: 'ORS-702' };
    assert.equal((await request(path, patch(correction, intake))).status, 403);
    const corrected = await success(path, patch(correction, auditor));
    assert.equal(corrected.revision, before.revision + 1);
    assert.equal((await request(path, patch(correction, auditor))).status, 409);
    const event = corrected.history.at(-1);
    assert.equal(event.actor_name, 'Auditor A');
    assert.deepEqual(event.details.changes.obligation_request_reference, { before: 'ORS-701', after: 'ORS-702' });
    assert.deepEqual((await search('ORS-702')).map(({ id }) => id), [south.id]);

    for (const transaction of [first, second]) {
      const path = `/transactions/${transaction.id}`;
      const current = await success(path, { cookie: supervisor });
      const cleared = await success(path, patch({
        revision: current.revision, obligation_request_reference: '  ',
      }, supervisor));
      assert.equal(cleared.obligation_request_reference, null);
    }
    assert.deepEqual(await search('ors-70'), []);
  });

  await t.test('AC-01 intake assignment, auditor self-assignment, and duplicate warning', async () => {
    const fields = {
      reference: 'PW-101', title: 'Development fixture project',
      contractor: 'Original contractor', contract_amount: '999.99',
    };
    for (const cookie of [intake, auditor, supervisor]) {
      for (const key of Object.keys(fields)) {
        assert.equal((await request('/projects', post({ ...fields, [key]: undefined }, cookie))).status, 400, key);
        assert.equal((await request('/projects', post({ ...fields, [key]: '   ' }, cookie))).status, 400, key);
      }
      assert.equal((await request('/projects', post({ ...fields, contract_amount: '-1.234' }, cookie))).status, 400);
    }
    project = await success('/projects', post(fields, intake), 201);
    const auditProject = await success('/projects', post({ ...fields, reference: 'PW-102' }, otherAuditor), 201);
    const duplicateProject = await request('/projects', post({
      ...fields, reference: ' pw-101 ', title: 'Different name',
    }, intake));
    assert.equal(duplicateProject.status, 409);
    assert.equal(duplicateProject.data.code, 'duplicate');
    await success('/projects', post({ ...fields, allow_duplicate: true }, intake), 201);
    const savedProject = await success(`/projects/${project.id}`, { cookie: auditor });
    for (const [key, value] of Object.entries(fields)) assert.equal(savedProject[key], value);
    assert.equal(savedProject.contract_date, null);
    assert.equal(savedProject.contract_duration, null);
    assert.deepEqual(await success(`/projects/${project.id}`, { cookie: intake }), {
      id: project.id, reference: fields.reference, title: fields.title, transactions: [],
    });
    const body = {
      project_id: project.id, type: 'progress',
      assigned_auditor_id: credentials['auditor-a'], received_on: '2026-11-09',
    };
    for (const assigned_auditor_id of [undefined, credentials.intake]) {
      assert.equal((await request('/transactions', post({ ...body, assigned_auditor_id }, intake))).status, 400);
    }
    record = await success('/transactions', post(body, intake), 201);
    const duplicate = await request('/transactions', post(body, intake));
    assert.equal(duplicate.status, 409);
    assert.equal(duplicate.data.code, 'duplicate');
    const confirmed = await Promise.all([1, 2].map(() =>
      success('/transactions', post({ ...body, allow_duplicate: true }, intake), 201)));
    [duplicateRegistration] = confirmed;
    const registrations = await Promise.all([record, ...confirmed].map(({ id }) =>
      success(`/transactions/${id}`, { cookie: intake })));
    assert.ok(registrations.every(({ reference }) => reference));
    assert.equal(new Set(registrations.map(({ reference }) => reference)).size, 3);
    generatedReference = registrations[0].reference;
    const byReference = await success(`/transactions?q=${encodeURIComponent(generatedReference)}`, { cookie: intake });
    assert.deepEqual(byReference.map(({ id }) => id), [record.id]);
    selfAssigned = await success('/transactions', post({
      ...body, project_id: auditProject.id, type: 'bac',
      assigned_auditor_id: credentials['auditor-a'],
    }, otherAuditor), 201);

    const intakeProject = await success(`/projects/${project.id}`, { cookie: intake });
    const pending = intakeProject.transactions;
    assert.deepEqual(new Set(pending.map(({ id }) => id)), new Set([record.id, ...confirmed.map(({ id }) => id)]));
    assert.ok(pending.every((item) => item.status === 'Pending' && item.assigned_auditor_id === credentials['auditor-a']));
    const viewedAuditProject = await success(`/projects/${auditProject.id}`, { cookie: intake });
    assert.deepEqual(viewedAuditProject.transactions.map(({ id }) => id), [selfAssigned.id]);
    const [underAudit] = viewedAuditProject.transactions;
    assert.equal(underAudit.assigned_auditor_id, credentials['auditor-b']);
    assert.equal(underAudit.status, 'Under Audit');
    const supervisorCreated = await success('/transactions', post({
      ...body, received_on: '2026-11-11',
    }, supervisor), 201);
    const supervisorRecord = await success(`/transactions/${supervisorCreated.id}`, { cookie: intake });
    assert.equal(supervisorRecord.status, 'Under Audit');
    assert.equal(supervisorRecord.assigned_auditor_id, credentials.supervisor);
    assert.equal(supervisorRecord.history[0].new_status, 'Under Audit');
    const refreshedProject = await success(`/projects/${project.id}`, { cookie: intake });
    assert.equal(refreshedProject.transactions[0].id, supervisorCreated.id);
    assert.equal(refreshedProject.transactions[0].status, 'Under Audit');
    const byProjectReference = await success('/transactions?q=pw-101', { cookie: intake });
    assert.deepEqual([...new Set(byProjectReference.map((item) => item.project_id))], [project.id]);
    assert.equal(byProjectReference[0].project_reference, fields.reference);

    const bac = await success(`/transactions/${selfAssigned.id}`, { cookie: otherAuditor });
    assert.equal(bac.checklist.length, 62);
    assert.equal(bac.checklist[0].label, 'APP/SPP');
    assert.equal(bac.checklist.at(-1).label, 'Construction Safety and Health Program approved by DOLE');
    assert.ok(bac.checklist.some((item) => item.label === 'Valid Joint Venture Agreement, if applicable'));
    assert.ok(bac.checklist.every((item) => item.state === 'Unchecked' && !item.custom));
    assert.equal(bac.checklist.find(({ checklist_group }) => checklist_group === 'technical').label, philgepsCertificate);
    assert.ok(bac.checklist.every(({ label }) => label !== retiredBacRequirement));
  });

  await t.test('AC-07 Start Audit records a Pending movement with revision and role checks', async () => {
    const path = `/transactions/${record.id}`;
    const before = await success(path, { cookie: intake });
    assert.equal(before.status, 'Pending');
    assert.equal(before.history[0].new_status, 'Pending');
    const action = { revision: before.revision, actual_on: '2026-11-10' };
    assert.equal((await request(`${path}/actions/start`, post(action, intake))).status, 403);
    for (const kind of ['suspend', 'certify', 'resume']) {
      assert.equal((await request(`${path}/actions/${kind}`, post(action, otherAuditor))).status, 409);
    }
    await success(`${path}/actions/start`, post(action, otherAuditor));
    const { transactions } = await success(`/projects/${before.project_id}`, { cookie: intake });
    assert.equal(transactions[0].id, record.id, 'A newly recorded status change moves the transaction to the top');
    const after = await success(path, { cookie: intake });
    assert.equal(after.status, 'Under Audit');
    assert.equal(after.latest_action_on, action.actual_on);
    assert.equal(after.assigned_auditor_id, before.assigned_auditor_id);
    assert.deepEqual(after.history[0], before.history[0]);
    const movement = after.history[1];
    assert.equal(movement.kind, 'start');
    assert.equal(movement.actor_id, credentials['auditor-b']);
    assert.equal(movement.previous_status, 'Pending');
    assert.equal(movement.new_status, 'Under Audit');
    assert.equal(movement.actual_on, action.actual_on);
    assert.ok(movement.recorded_at);
    const stale = await request(`${path}/actions/start`, post(action, supervisor));
    assert.equal(stale.status, 409);
    assert.equal(stale.data.code, 'revision');
    assert.equal((await request(`${path}/actions/start`, post({ revision: after.revision }, supervisor))).status, 409);

    const duplicatePath = `/transactions/${duplicateRegistration.id}`;
    const detail = await success(duplicatePath, { cookie: supervisor });
    const started = await success(`${duplicatePath}/actions/start`, post({ revision: detail.revision }, supervisor));
    assert.equal(started.record.history.at(-1).actor_id, credentials.supervisor);

    const voidCandidate = await success('/transactions', post({
      project_id: before.project_id, type: 'progress', reference: 'Voided Pending fixture',
      assigned_auditor_id: before.assigned_auditor_id,
    }, intake), 201);
    const voidPath = `/transactions/${voidCandidate.id}`;
    const candidate = await success(voidPath, { cookie: auditor });
    const { record: voided } = await success(`${voidPath}/actions/void`, post({
      revision: candidate.revision, remarks: 'Development fixture duplicate',
    }, auditor));
    assert.equal(voided.status, 'Pending');
    assert.equal((await request(`${voidPath}/actions/start`, post({ revision: voided.revision }, auditor))).status, 409);
  });

  await t.test('Existing projects preserve their IDs and labels across migration', async () => {
    // Use a second schema so current-format projects do not lose their references.
    const legacySchema = `${schema}_legacy`;
    const legacyUrl = new URL(url);
    legacyUrl.searchParams.set('options', `-c search_path=${legacySchema}`);
    const legacyDb = connectDatabase(legacyUrl.toString());
    try {
      await coordinator.pool.query(`CREATE SCHEMA ${legacySchema}`);
      await migrate(legacyDb);
      await legacyDb.pool.query(`
        ALTER TABLE audit_events DROP CONSTRAINT audit_events_kind_check,
          ADD CONSTRAINT audit_events_kind_check CHECK (kind IN (
            'project_correction', 'register', 'checklist', 'correct',
            'suspend', 'resubmit', 'resume', 'certify', 'void'
          ))
      `);
      await legacyDb.pool.query(`
        ALTER TABLE projects DROP COLUMN reference, DROP COLUMN contractor_id, ADD COLUMN contractor text;
        DROP TABLE contractors;
      `);
      await legacyDb.pool.query('ALTER TABLE transactions DROP COLUMN obligation_request_reference');
      const account = await legacyDb.pool.query(`
        INSERT INTO accounts (username, display_name, role, pin_verifier)
        VALUES ('legacy', 'Legacy Auditor', 'auditor', $1) RETURNING id
      `, [await hashPin('0123')]);
      const inserted = await legacyDb.pool.query(`
        INSERT INTO projects (title, created_by, updated_by)
        VALUES ('Old bridge', $1, $1) RETURNING id
      `, [account.rows[0].id]);
      const { id } = inserted.rows[0];
      await legacyDb.pool.query(`
        INSERT INTO projects (title, contractor, created_by, updated_by)
        VALUES ('Legacy station east', ' Old  Builders ', $1, $1),
          ('Legacy station west', 'OLD BUILDERS', $1, $1)
      `, [account.rows[0].id]);
      const existing = await legacyDb.pool.query(`
        INSERT INTO transactions (project_id, type, reference, received_on, assigned_auditor_id)
        VALUES ($1, 'bac', 'Existing BAC', '2026-11-01', $2) RETURNING id
      `, [id, account.rows[0].id]);
      await legacyDb.pool.query(`
        INSERT INTO audit_events
          (project_id, transaction_id, kind, actor_id, actor_name, actual_on, new_status)
        VALUES ($1, $2, 'register', $3, 'Legacy Auditor', '2026-11-01', 'Under Audit')
      `, [id, existing.rows[0].id, account.rows[0].id]);
      await migrate(legacyDb);
      const legacyServer = createApp(legacyDb, references).listen(0, '127.0.0.1');
      try {
        await once(legacyServer, 'listening');
        const api = `http://127.0.0.1:${legacyServer.address().port}/api`;
        const send = (path, body, cookie) => fetch(api + path, {
          method: body ? 'POST' : 'GET',
          headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
          body: JSON.stringify(body),
        });
        const session = await send('/session', { username: 'legacy', pin: '0123' });
        const cookie = session.headers.get('set-cookie').split(';')[0];
        await session.json();
        const project = await (await send(`/projects/${id}`, undefined, cookie)).json();
        assert.equal(project.id, id);
        assert.equal(project.title, 'Old bridge');
        assert.equal(project.reference, null);
        assert.equal(project.contractor, null);
        assert.equal(project.contract_amount, null);
        const existingTransaction = await (await send(
          `/transactions/${existing.rows[0].id}`, undefined, cookie,
        )).json();
        assert.equal(existingTransaction.project_id, id);
        assert.equal(existingTransaction.obligation_request_reference, null);
        const matches = await (await send('/projects?q=old%20bri', undefined, cookie)).json();
        assert.deepEqual(matches, [{
          id, title: 'Old bridge', reference: null, contractor: null, contract_amount: null,
          barangay: null, municipality: null,
        }]);
        const stations = await (await send('/projects?q=Legacy%20station', undefined, cookie)).json();
        assert.deepEqual(stations.map(({ contractor }) => contractor), ['Old Builders', 'Old Builders']);
        const { contractors } = await (await send('/lookups', undefined, cookie)).json();
        assert.deepEqual(contractors.map(({ name }) => name), ['Old Builders']);
        assert.equal(existingTransaction.status, 'Under Audit');
        assert.equal(existingTransaction.history[0].new_status, 'Under Audit');
        assert.equal(existingTransaction.history[0].actor_name, 'Legacy Auditor');
        const fields = { title: 'old bridge', reference: 'PW-OLD', contractor: 'Builder', contract_amount: '100' };
        const warning = await send('/projects', fields, cookie);
        assert.equal(warning.status, 409);
        assert.equal((await warning.json()).code, 'duplicate');
        assert.equal((await send('/projects', { ...fields, allow_duplicate: true }, cookie)).status, 201);
        const transaction = await send('/transactions', { project_id: id, type: 'bac', reference: 'Old bridge BAC' }, cookie);
        assert.equal(transaction.status, 201);
        assert.equal((await transaction.json()).project_id, id);
      } finally {
        await new Promise((resolve) => legacyServer.close(resolve));
      }
    } finally {
      await legacyDb.close();
      await coordinator.pool.query(`DROP SCHEMA IF EXISTS ${legacySchema} CASCADE`);
    }
  });

  await t.test('BAC document fields are scoped, persisted and recorded in history', async () => {
    const path = `/transactions/${selfAssigned.id}`;
    const bac = await success(path, { cookie: otherAuditor });
    const obr = bac.checklist.find(({ label }) => label === 'OBR');
    assert.deepEqual(obr.field_definitions, [
      { key: 'reference_number', label: 'Reference number', kind: 'text' },
      { key: 'amount', label: 'Amount (₱)', kind: 'amount' },
    ]);
    const values = {
      OBR: { reference_number: '0007-2026', amount: '2500.50' },
      'Notice of Award': { issue_date: '2026-11-01', received_date: '2026-11-02', amount: '1234.50' },
      'Performance Security': {
        effectivity_date: '2026-11-02', surety_name: 'Test Surety', reference: 'PS-01',
        includes_after_completion: false,
      },
      'Duly notarized contract': { issue_date: '2026-11-03', amount: '1234.50', duration: '90 calendar days' },
      'Notice to Proceed': { issue_date: '2026-11-04', received_date: '2026-11-05' },
      "Contractor's All Risk Insurance (CARI)": { effectivity_date: '2026-11-05', surety_name: 'Test Insurer' },
    };
    const documents = bac.checklist.filter((item) => item.field_definitions.length);
    assert.equal(documents.length, 6);
    const items = documents.map((item) => {
      assert.deepEqual(item.field_definitions.map(({ key }) => key), Object.keys(values[item.label]));
      return { id: item.id, state: item.state, document_fields: values[item.label] };
    });
    const saved = await success(`${path}/checklist`, patch({ revision: bac.revision, items }, otherAuditor));
    const reloaded = await success(path, { cookie: otherAuditor });
    for (const item of reloaded.checklist.filter((item) => item.field_definitions.length)) {
      assert.deepEqual(item.document_fields, values[item.label]);
    }
    const { changes } = saved.history.at(-1).details;
    assert.equal(changes.length, 6);
    assert.deepEqual(changes.find(({ after }) => after.label === 'OBR').after.document_fields, values.OBR);
    assert.equal(changes.find(({ after }) => after.label === 'Performance Security')
      .after.document_fields.includes_after_completion, false);
    const invalid = await request(`${path}/checklist`, patch({
      revision: saved.revision,
      items: [{ ...items[0], document_fields: { surety_name: 'Wrong document' } }],
    }, otherAuditor));
    assert.equal(invalid.status, 400);
    const unchanged = await success(`${path}/checklist`, patch({ revision: saved.revision, items }, otherAuditor));
    assert.equal(unchanged.revision, saved.revision);
  });

  await t.test('AC-02 project transactions, restricted intake history, and audited project corrections', async () => {
    const { transactions } = await success(`/projects/${project.id}`, { cookie: otherAuditor });
    assert.ok(transactions.some((item) => item.id === record.id && item.type === 'progress'));
    assert.equal((await success(txPath(), { cookie: otherAuditor })).checklist.length, 2);
    const summary = await success(txPath(), { cookie: intake });
    assert.equal(summary.checklist, undefined);
    assert.equal(summary.items_needing_compliance, 2);
    assert.equal(summary.history[0].details, undefined);
    assert.equal((await request(`${txPath()}/checklist`, patch({ revision: summary.revision }, intake))).status, 403);
    const current = await success(`/projects/${project.id}`, { cookie: supervisor });
    const updated = await success(`/projects/${project.id}`, patch({
      revision: current.revision, contractor: 'Development fixture contractor',
    }, supervisor));
    assert.equal(updated.history[0].details.changes.contractor.after, 'Development fixture contractor');
    assert.ok(updated.transactions.some((item) => item.id === record.id));
    const referenceCorrected = await success(`/projects/${project.id}`, patch({
      revision: updated.revision, reference: 'PW-103',
    }, supervisor));
    assert.equal(referenceCorrected.title, current.title);
    const nameCorrected = await success(`/projects/${project.id}`, patch({
      revision: referenceCorrected.revision, title: 'Corrected project name',
    }, auditor));
    assert.equal(nameCorrected.reference, 'PW-103');
    assert.deepEqual(referenceCorrected.history.at(-1).details.changes, {
      reference: { before: 'PW-101', after: 'PW-103' },
    });
    assert.equal(referenceCorrected.history.at(-1).actor_name, 'Supervisor');
    assert.deepEqual(nameCorrected.history.at(-1).details.changes, {
      title: { before: current.title, after: 'Corrected project name' },
    });
    assert.equal(nameCorrected.history.at(-1).actor_name, 'Auditor A');
    assert.equal((await request(`/projects/${project.id}`, patch({
      revision: referenceCorrected.revision, title: 'Stale title',
    }, auditor))).status, 409);

    assert.equal((await success(`/projects/${project.id}`, { cookie: intake })).contractor, undefined);
  });

  await t.test('Browser checklist saves are attributed only to the expected signed-in auditor', async () => {
    const { id } = await success('/transactions', post({
      project_id: project.id, type: 'advance', received_on: '2026-11-20',
    }, auditor), 201);
    const path = `/transactions/${id}`;
    const original = await success(path, { cookie: auditor });
    const body = {
      actor_id: credentials['auditor-a'], revision: original.revision,
      items: [{ id: original.checklist[0].id, state: 'Checked', remarks: 'Browser checklist draft' }],
    };
    const openedAsOther = await request(`${path}?account_id=${body.actor_id}`, { cookie: otherAuditor });
    assert.equal(openedAsOther.status, 403);
    assert.equal(openedAsOther.data.code, 'session_account');
    assert.equal(openedAsOther.data.checklist, undefined);
    const rejected = await request(`${path}/checklist`, patch(body, otherAuditor));
    assert.equal(rejected.status, 403);
    assert.equal((await success(path, { cookie: auditor })).revision, original.revision);

    const saved = await success(`${path}/checklist`, patch(body, auditor));
    assert.equal(saved.checklist[0].state, 'Checked');
    assert.equal(saved.checklist[0].remarks, 'Browser checklist draft');
    assert.equal(saved.history.at(-1).actor_name, 'Auditor A');
  });

  await t.test('AC-03 three checklist states, custom items and exact slip contents', async () => {
    record = await read();
    record = await success(`${txPath()}/checklist`, patch({
      revision: record.revision,
      items: [
        { id: record.checklist[0].id, state: 'Checked', compliance_reasons: ['Has discrepancy'] },
        { id: record.checklist[1].id, state: 'N/A' },
      ],
      new_label: 'Development fixture <custom requirement>',
      actual_on: '2026-11-10',
    }, auditor));
    assert.equal(record.latest_action_on, '2026-11-10');
    const custom = record.checklist.find((item) => item.custom);
    assert.equal(custom.state, 'Unchecked');
    const summary = await success(txPath(), { cookie: intake });
    assert.equal(summary.items_needing_compliance, 1);
    assert.equal(summary.checklist, undefined);
    const complianceDetails = 'Provide the <signed> copy.\nInclude both pages.';
    record = await success(`${txPath()}/checklist`, patch({
      revision: record.revision,
      items: [{
        id: custom.id, state: 'Unchecked', remarks: 'Internal checklist note',
        compliance_reasons: ['Lacking signature/s', 'Not attached'], compliance_details: complianceDetails,
      }],
    }, auditor));
    const compliance = (await read()).checklist.find(({ id }) => id === custom.id);
    assert.deepEqual(compliance.compliance_reasons, ['Not attached', 'Lacking signature/s']);
    assert.equal(compliance.compliance_details, complianceDetails);
    const event = await act('suspend', otherAuditor, { actual_on: '2026-11-08' });
    assert.equal(record.status, 'Suspended');
    assert.equal(record.latest_action_on, '2026-11-08');
    const suspension = record.history.find((entry) => entry.id === event);
    assert.equal(suspension.actor_id, credentials['auditor-b']);
    assert.equal(record.history.at(-2).kind, 'checklist');
    assert.equal(suspension.details.slip.items.length, 1);
    assert.equal(suspension.details.slip.items[0].remarks,
      'Not attached, Lacking signature/s\nProvide the <signed> copy.\nInclude both pages.');
    firstSlipPath = `${txPath()}/slips/${event}`;
    firstSlip = await success(firstSlipPath, { cookie: auditor });
    assert.match(firstSlip, /<dt>Project reference number<\/dt><dd>PW-103<\/dd>/);
    assert.match(firstSlip, /<h2>Needing compliance:<\/h2>/);
    assert.equal(firstSlip.includes(record.reference), false);
    assert.doesNotMatch(firstSlip, /Development fixture · For testing only/);
    assert.match(firstSlip, /&lt;custom requirement&gt;/);
    assert.match(firstSlip, /Not attached, Lacking signature\/s<br>Provide the &lt;signed&gt; copy\.<br>Include both pages\./);
    assert.doesNotMatch(firstSlip, /sample requirement [AB]|Internal checklist note|Has discrepancy/);
    assert.equal((await request(firstSlipPath, { cookie: intake })).status, 403);
    assert.equal((await success(txPath(), { cookie: intake })).history.at(-1).details, undefined);
  });

  await t.test('AC-04 slip is reproduced after checklist edits and a new form is loaded', async () => {
    record = await success(`${txPath()}/checklist`, patch({
      revision: record.revision, items: [
        {
          id: record.checklist.find((item) => item.custom).id, state: 'Checked', remarks: 'Later assessment',
          compliance_reasons: [], compliance_details: null,
        },
      ],
    }, auditor));
    references.layout = references.layout.replace('Suspension slip', 'Different print title');
    assert.equal(await success(firstSlipPath, { cookie: auditor }), firstSlip);
  });

  await t.test('AC-05 resubmission preserves checklist and requires explicit resumption', async () => {
    await act('resubmit', intake);
    assert.equal(record.status, 'Resubmitted');
    for (const kind of ['start', 'certify']) {
      const premature = await request(`${txPath()}/actions/${kind}`, post({ revision: record.revision }, auditor));
      assert.equal(premature.status, 409);
    }
    await act('resume', auditor);
    assert.equal(record.status, 'Under Audit');
    assert.equal(record.checklist.find((item) => item.custom).state, 'Checked');
    const empty = await request(`${txPath()}/actions/suspend`, post({ revision: record.revision }, auditor));
    assert.equal(empty.status, 400);
    record = await success(`${txPath()}/checklist`, patch({
      revision: record.revision, new_label: 'Development fixture second deficiency',
    }, auditor));
    const second = record.checklist.find(({ label }) => label === 'Development fixture second deficiency');
    const secondEvent = await act('suspend', auditor, { item_remarks: { [second.id]: 'Old per-slip override' } });
    const secondSlip = record.history.find(({ id }) => id === secondEvent).details.slip;
    assert.deepEqual(secondSlip.items, [{ label: second.label, remarks: null }]);
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
    assert.equal(record.history.at(-1).details.changes.reference.before, generatedReference);
    assert.equal(record.history.at(-1).details.changes.reference.after, record.reference);
    assert.equal(record.history.find((entry) => entry.kind === 'certify').details.certified_amount, '1234.50');
    assert.equal(record.latest_action_on, '2026-11-11');
    assert.ok(record.history.every((entry) => entry.actor_id && entry.actual_on && entry.recorded_at));
    await assert.rejects(db.pool.query('UPDATE audit_events SET details = details WHERE transaction_id = $1', [record.id]), /immutable/);
    assert.equal((await request(`${txPath()}/actions/void`, post({ revision: record.revision }, auditor))).status, 400);
    await act('void', auditor, { remarks: 'Development fixture duplicate', actual_on: '2026-11-12' });
    assert.equal(record.voided, true);
    assert.equal(record.status, 'Audited');
    const { transactions } = await success(`/projects/${project.id}`, { cookie: intake });
    assert.equal(transactions.find((entry) => entry.id === record.id).voided, true);
    assert.ok((await success('/transactions', { cookie: intake })).every((entry) => entry.id !== record.id));
    const exact = await success(`/transactions?q=${encodeURIComponent(record.reference)}`, { cookie: intake });
    assert.equal(exact.find((entry) => entry.id === record.id).voided, true);
    assert.equal(await success(firstSlipPath, { cookie: auditor }), firstSlip);
  });

  await t.test('AC-08 server permissions, PIN validation, lockout and inactive sessions', async () => {
    assert.equal((await request('/transactions')).status, 401);
    assert.equal((await request('/transactions', { cookie: admin })).status, 403);
    assert.equal((await request(`/projects/${project.id}`, { cookie: admin })).status, 403);
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

  await t.test('BAC groups follow the checklist copied into the transaction', async () => {
    const expected = [
      ['APP/SPP', 'preparation'],
      ['Development fixture — alternate procurement requirement', 'preparation'],
      ['Checklist of Requirements', 'preparation'],
      [philgepsCertificate, 'technical'],
      ['Statement of all ongoing government and private contracts', 'technical'],
      ['Financial Bid Form', 'financial'],
      ['Development fixture — alternate financial requirement', 'financial'],
      ['Cash Flow by the Quarter & Payments Schedule', 'financial'],
      ['Latest Income Tax Return', 'technical'],
      ['PPMP', 'others'],
    ];
    const defaultBac = references.checklists.bac;
    references.checklists.bac = [
      ...expected.map(([label]) => label).filter((label) => label !== philgepsCertificate),
      philgepsCertificate, retiredBacRequirement,
    ];
    let transaction;
    try {
      transaction = await success('/transactions', post({
        project_id: project.id, type: 'bac', reference: 'Development fixture — alternate BAC checklist',
      }, auditor), 201);
    } finally {
      references.checklists.bac = defaultBac;
    }
    const path = `/transactions/${transaction.id}`;
    const initial = await success(path, { cookie: auditor });
    assert.deepEqual(initial.checklist.map(({ label, checklist_group }) => [label, checklist_group]), expected);

    const saved = await success(`${path}/checklist`, patch({ revision: initial.revision, new_label: 'APP/SPP' }, auditor));
    const custom = saved.checklist.find((item) => item.custom);
    assert.equal(custom.checklist_group, 'others');
  });

  await t.test('BAC migration removes the retired standard requirement and preserves saved audit evidence', async () => {
    const { id } = await success('/transactions', post({
      project_id: project.id, type: 'bac', received_on: '2026-11-14',
    }, auditor), 201);
    const path = `/transactions/${id}`;
    const { rows: [retired] } = await db.pool.query(`
      INSERT INTO checklist_items (transaction_id, label) VALUES ($1, $2) RETURNING id
    `, [id, retiredBacRequirement]);
    const initial = await success(path, { cookie: auditor });
    const certificate = initial.checklist.find(({ label }) => label === philgepsCertificate);
    const saved = await success(`${path}/checklist`, patch({
      revision: initial.revision,
      items: [
        { id: certificate.id, state: 'Checked', remarks: 'Verified certificate' },
        { id: retired.id, state: 'Unchecked', remarks: 'Earlier suspension ground' },
      ],
      new_label: 'Development fixture — custom permit',
    }, auditor));
    const { record: suspended, event_id: eventId } = await success(`${path}/actions/suspend`, post({
      revision: saved.revision, actual_on: '2026-11-15',
    }, auditor));
    const slipPath = `${path}/slips/${eventId}`;
    const slip = await success(slipPath, { cookie: auditor });
    assert.ok(slip.includes(retiredBacRequirement));

    await migrate(db);
    await migrate(db);

    const migrated = await success(path, { cookie: auditor });
    assert.equal(migrated.revision, suspended.revision + 1);
    assert.equal(migrated.checklist.find(({ checklist_group }) => checklist_group === 'technical').id, certificate.id);
    assert.deepEqual(migrated.checklist, suspended.checklist.filter((item) => item.id !== retired.id));
    assert.equal(migrated.history.length, suspended.history.length + 1);
    assert.deepEqual(migrated.history.slice(0, -1), suspended.history);
    const migration = migrated.history.at(-1);
    assert.equal(migration.kind, 'checklist');
    assert.equal(migration.actor_id, null);
    assert.equal(migration.actor_name, 'Database migration');
    assert.ok(migration.actual_on && migration.recorded_at);
    assert.deepEqual(migration.details.checklist_removals, [{
      before: {
        id: retired.id, label: retiredBacRequirement, state: 'Unchecked', remarks: 'Earlier suspension ground',
        custom: false, document_fields: {}, compliance_reasons: [], compliance_details: null,
      },
      after: null,
    }]);
    assert.equal(await success(slipPath, { cookie: auditor }), slip);
    assert.equal((await db.pool.query('SELECT id FROM checklist_items WHERE id = $1', [retired.id])).rowCount, 0);
    assert.equal((await request(`${path}/checklist`, patch({
      revision: suspended.revision, items: [{ id: retired.id, state: 'Checked' }],
    }, auditor))).status, 409);
  });

  await t.test('Projects reuse saved contractors and failed creation leaves the list unchanged', async () => {
    const fields = { title: 'Contractor fixture', contract_amount: '100' };
    const [first, second] = await Promise.all([
      success('/projects', post({ ...fields, reference: 'CT-1', contractor: ' Contractor Ñandú ΟΣ ' }, intake), 201),
      success('/projects', post({ ...fields, reference: 'CT-2', contractor: 'CONTRACTOR\t ÑANDÚ\u00a0 ος' }, auditor), 201),
    ]);
    const { contractors } = await success('/lookups', { cookie: intake });
    const matches = contractors.filter(({ name }) => name.toLowerCase() === 'contractor ñandú ος');
    assert.equal(matches.length, 1);
    const [saved] = matches;
    assert.deepEqual(await success('/contractors', { cookie: intake }), contractors);
    assert.equal((await request('/contractors', { cookie: admin })).status, 403);
    const third = await success('/projects', post({
      ...fields, reference: 'CT-3', contractor_id: saved.id,
    }, supervisor), 201);
    const projects = await success('/projects?q=Contractor%20fixture', { cookie: intake });
    assert.equal(projects.length, 3);
    for (const project of [first, second, third]) {
      assert.equal(projects.find(({ id }) => id === project.id).contractor, saved.name);
    }
    assert.equal((await request('/projects', post({
      ...fields, reference: 'CT-1', contractor: 'Uncommitted Contractor',
    }, intake))).status, 409);
    assert.equal((await request('/projects', post({
      ...fields, reference: 'CT-4', contractor_id: 2147483647,
    }, intake))).status, 400);
    assert.deepEqual((await success('/lookups', { cookie: intake })).contractors, contractors);
  });

  await t.test('Authorized project corrections can reassign a verified contractor variant', async () => {
    const { contractors } = await success('/lookups', { cookie: auditor });
    const saved = contractors.find(({ name }) => name === 'North Builders');
    const { id: projectId } = await success('/projects', post({
      title: 'Contractor variant fixture', reference: 'CT-5', contractor: 'North Builders Inc.', contract_amount: '100',
    }, auditor), 201);
    const transaction = await success('/transactions', post({ project_id: projectId, type: 'bac' }, auditor), 201);
    const path = `/projects/${projectId}`;
    const before = await success(path, { cookie: auditor });
    const correction = { revision: before.revision, contractor_id: saved.id };
    assert.equal((await request(path, patch(correction, intake))).status, 403);
    const updated = await success(path, patch(correction, supervisor));
    assert.equal(updated.id, projectId);
    assert.equal(updated.contractor, 'North Builders');
    assert.deepEqual(updated.transactions.map(({ id }) => id), [transaction.id]);
    const [event] = updated.history;
    assert.equal(event.actor_name, 'Supervisor');
    assert.deepEqual(event.details.changes.contractor, { before: 'North Builders Inc.', after: 'North Builders' });
    assert.equal((await request(path, patch(correction, supervisor))).status, 409);
    const equivalent = await success(path, patch({
      revision: updated.revision, contractor: ' NORTH  BUILDERS ',
    }, auditor));
    assert.equal(equivalent.revision, updated.revision);
    assert.equal(equivalent.contractor_id, saved.id);
    assert.equal((await request(path, patch({
      revision: updated.revision, contractor: 'Uncommitted Correction', actual_on: 'invalid',
    }, auditor))).status, 400);
    const lookups = await success('/lookups', { cookie: auditor });
    assert.equal(lookups.projects.find(({ id }) => id === projectId).contractor, 'North Builders');
    assert.ok(!lookups.contractors.some(({ name }) => name === 'Uncommitted Correction'));
  });
});
