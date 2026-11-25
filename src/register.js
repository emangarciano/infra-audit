import { randomUUID } from 'node:crypto';
import { bacFields, updateDocumentFields } from './bac-fields.js';
import { RequestError } from './database.js';
import {
  amount, amountForCopy, auditRoles, checklistStates, date, id, movementKinds,
  oneOf, statusNames, text, today, types,
} from './domain.js';
import { groupBacChecklist, renderSlip } from './references.js';

const txColumns = `
  t.id, t.project_id, p.title AS project, p.reference AS project_reference, t.type, t.reference,
  t.obligation_request_reference, t.received_on::text,
  t.assigned_auditor_id, a.display_name AS assigned_auditor, t.revision, t.notes,
  movement.new_status AS status, movement.actual_on::text AS latest_action_on,
  movement.kind = 'void' AS voided
`;
const txTables = `
  transactions t JOIN projects p ON p.id = t.project_id
  JOIN accounts a ON a.id = t.assigned_auditor_id
  JOIN LATERAL (
    SELECT kind, new_status, actual_on, id
    FROM audit_events WHERE transaction_id = t.id AND kind = ANY($1::text[])
    ORDER BY id DESC LIMIT 1
  ) movement ON true
`;
const projectSummaryColumns = `id, title, reference`;
const projectColumns = `
  p.id, title, reference, contractor_id, c.name AS contractor, contract_amount, contract_date::text,
  contract_duration, revision, created_by, updated_by, created_at, updated_at
`;
const projectTables = 'projects p LEFT JOIN contractors c ON c.id = p.contractor_id';
const eventColumns = `id, kind, actor_id, actor_name, actual_on::text, recorded_at,
  previous_status, new_status, details`;

function projectFields(body, previous) {
  const required = !previous;
  previous ??= {};
  const contractAmount = Object.hasOwn(body, 'contract_amount')
    ? amount(body.contract_amount, 'Contract amount') : previous.contract_amount ?? null;
  if (required && contractAmount === null) throw new RequestError(400, 'Contract amount is required.');
  return {
    title: text(Object.hasOwn(body, 'title') ? body.title : previous.title, 'Project name', 200, true),
    reference: Object.hasOwn(body, 'reference') || required
      ? text(body.reference, 'Project reference', 200, required) : previous.reference,
    contract_amount: contractAmount,
    contract_date: Object.hasOwn(body, 'contract_date')
      ? date(body.contract_date, 'Contract date') : previous.contract_date ?? null,
    contract_duration: Object.hasOwn(body, 'contract_duration')
      ? text(body.contract_duration, 'Contract duration', 100) : previous.contract_duration ?? null,
  };
}

async function projectContractor(client, body, previous) {
  if (body.contractor_id != null && body.contractor_id !== '') {
    const { rows: [contractor] } = await client.query(
      'SELECT id, name FROM contractors WHERE id = $1', [id(body.contractor_id, 'Contractor')],
    );
    if (!contractor) throw new RequestError(400, 'Choose a saved contractor.');
    return contractor;
  }
  if (previous && !Object.hasOwn(body, 'contractor') && !Object.hasOwn(body, 'contractor_id')) {
    return { id: previous.contractor_id, name: previous.contractor };
  }
  const name = text(body.contractor, 'Contractor', 200, !previous);
  if (!name) return { id: null, name: null };
  const { rows: [created] } = await client.query(`
    INSERT INTO contractors (name) VALUES (clean_contractor_name($1))
    ON CONFLICT (name_key) DO NOTHING RETURNING id, name
  `, [name]);
  if (created) return created;
  // A separate statement sees the winning row if another transaction added the name.
  const { rows: [saved] } = await client.query(
    'SELECT id, name FROM contractors WHERE name_key = contractor_name_key($1)', [name],
  );
  return saved;
}

function diff(before, after) {
  return Object.fromEntries(Object.entries(after)
    .filter(([field, value]) => before[field] !== value)
    .map(([field, value]) => [field, { before: before[field], after: value }]));
}

function obligationRequestReference(value) {
  return text(value, 'Obligation request reference', 200);
}

function requireRevision(current, submitted) {
  if (current !== id(submitted, 'Record revision')) {
    throw new RequestError(409, 'This record changed while you were editing. Review the current record before reapplying your changes.', 'revision');
  }
}

async function event(client, user, record, kind, options = {}) {
  const result = await client.query(`
    INSERT INTO audit_events
      (project_id, transaction_id, kind, actor_id, actor_name, actual_on, previous_status, new_status, details)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id
  `, [
    record.project_id, record.id, kind, user.id, user.displayName,
    options.actualOn ?? today(), options.previous ?? null, options.next ?? null,
    JSON.stringify(options.details ?? {}),
  ]);
  return result.rows[0].id;
}

function visibleEvent(row, includeDetails) {
  const { details, ...metadata } = row;
  if (!includeDetails) return metadata;
  const { slip_html: slipHtml, ...visible } = details;
  return { ...metadata, details: visible, has_slip: Boolean(slipHtml) };
}

export async function listContractors(client) {
  const { rows } = await client.query('SELECT id, name FROM contractors ORDER BY name_key, id');
  return rows;
}

export async function lookups(client) {
  const projects = await listProjects(client);
  const contractors = await listContractors(client);
  const auditors = await client.query(`
    SELECT id, display_name, active, role FROM accounts
    WHERE role = ANY($1::text[]) OR EXISTS (
      SELECT 1 FROM transactions WHERE assigned_auditor_id = accounts.id
    )
    ORDER BY lower(display_name), id
  `, [auditRoles]);
  return {
    projects,
    contractors,
    auditors: auditors.rows.map(({ id, display_name, active, role }) => ({
      id, display_name, assignable: active && auditRoles.includes(role),
    })),
    types,
    statuses: statusNames,
  };
}

export async function listProjects(client, query) {
  const search = text(query, 'Search', 200);
  const result = await client.query(`
    SELECT p.id, p.title, p.reference, c.name AS contractor, p.contract_amount
    FROM ${projectTables}
    WHERE $1::text IS NULL
      OR strpos(lower(p.title), lower($1)) > 0
      OR strpos(lower(p.reference), lower($1)) > 0
      OR EXISTS (
        SELECT 1 FROM transactions t WHERE t.project_id = p.id
          AND strpos(lower(t.obligation_request_reference), lower($1)) > 0
      )
    ORDER BY lower(p.title), p.id
  `, [search]);
  return result.rows;
}

export async function createProject(client, user, body) {
  const { title, reference, contract_amount } = body;
  const values = projectFields(auditRoles.includes(user.role) ? body : { title, reference, contract_amount });
  await client.query('SELECT pg_advisory_xact_lock(712, hashtext(lower($1)))', [values.reference]);
  const contractor = await projectContractor(client, body);
  if (body.allow_duplicate !== true) {
    const duplicate = await client.query(`
      SELECT id FROM projects WHERE lower(reference) = lower($1)
        OR (reference IS NULL AND lower(title) = lower($2)) LIMIT 1
    `, [values.reference, values.title]);
    if (duplicate.rowCount) {
      throw new RequestError(409, 'A project already uses this reference or has this name with no reference. Create another anyway?', 'duplicate');
    }
  }
  const result = await client.query(`
    INSERT INTO projects (title, reference, contract_amount, contract_date, contract_duration, contractor_id, created_by, updated_by)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $7) RETURNING ${projectSummaryColumns}
  `, [...Object.values(values), contractor.id, user.id]);
  return result.rows[0];
}

export async function readProject(client, user, projectId) {
  const intake = user.role === 'intake';
  const query = intake
    ? `SELECT ${projectSummaryColumns} FROM projects WHERE id = $1`
    : `SELECT ${projectColumns} FROM ${projectTables} WHERE p.id = $1 FOR SHARE OF p`;
  const { rows: [project] } = await client.query(query, [projectId]);
  if (!project) throw new RequestError(404, 'Project not found.');
  const { rows } = await client.query(`
    SELECT ${txColumns} FROM ${txTables}
    WHERE t.project_id = $2 ORDER BY movement.id DESC
  `, [movementKinds, projectId]);
  const transactions = rows.map(summary);
  if (intake) return { ...project, transactions };
  const history = await client.query(`
    SELECT ${eventColumns} FROM audit_events
    WHERE project_id = $1 AND transaction_id IS NULL ORDER BY id
  `, [projectId]);
  return { ...project, transactions, history: history.rows };
}

export async function correctProject(client, user, projectId, body) {
  const result = await client.query(`SELECT ${projectColumns} FROM ${projectTables} WHERE p.id = $1 FOR UPDATE OF p`, [projectId]);
  const current = result.rows[0];
  if (!current) throw new RequestError(404, 'Project not found.');
  requireRevision(current.revision, body.revision);
  const values = projectFields(body, current);
  const contractor = await projectContractor(client, body, current);
  const changes = diff(current, { ...values, contractor: contractor.name });
  if (Object.keys(changes).length) {
    await client.query(`
      UPDATE projects SET title = $2, reference = $3, contract_amount = $4, contract_date = $5,
        contract_duration = $6, contractor_id = $7, revision = revision + 1, updated_by = $8, updated_at = clock_timestamp()
      WHERE id = $1
    `, [projectId, ...Object.values(values), contractor.id, user.id]);
    await event(client, user, { project_id: projectId, id: null }, 'project_correction', {
      actualOn: date(body.actual_on, 'Action date', today()),
      details: { changes },
    });
  }
  return readProject(client, user, projectId);
}

export async function createTransaction(client, user, body, references) {
  const projectId = id(body.project_id, 'Project');
  const type = oneOf(body.type, Object.keys(types), 'Transaction type');
  const obligationReference = obligationRequestReference(body.obligation_request_reference);
  const receivedOn = date(body.received_on, 'Received date', today());
  const auditorId = user.role === 'intake' ? id(body.assigned_auditor_id, 'Assigned auditor') : user.id;
  const notes = user.role === 'intake' ? null : text(body.notes, 'Notes', 2500);
  const project = await client.query('SELECT id FROM projects WHERE id = $1', [projectId]);
  if (!project.rowCount) throw new RequestError(400, 'Select an existing project.');
  const auditor = await client.query(
    'SELECT id FROM accounts WHERE id = $1 AND active AND role = ANY($2::text[]) FOR SHARE',
    [auditorId, auditRoles],
  );
  if (!auditor.rowCount) throw new RequestError(400, 'Select an active auditor.');
  await client.query('SELECT pg_advisory_xact_lock(713, hashtext($1))', [`${projectId}:${type}:${receivedOn}`]);
  if (body.allow_duplicate !== true) {
    const existing = await client.query(`
      SELECT t.id FROM transactions t
      WHERE t.project_id = $1 AND t.type = $2 AND t.received_on = $3
        AND lower(t.obligation_request_reference) IS NOT DISTINCT FROM lower($4::text)
        AND NOT EXISTS (SELECT 1 FROM audit_events e WHERE e.transaction_id = t.id AND e.kind = 'void')
      LIMIT 1
    `, [projectId, type, receivedOn, obligationReference]);
    if (existing.rowCount) {
      throw new RequestError(409, 'This project already has a transaction with the same type, received date, and obligation request reference. Create another anyway?', 'duplicate');
    }
  }
  const reference = `TX-${randomUUID()}`;
  const saved = await client.query(`
    INSERT INTO transactions (project_id, type, reference, received_on, assigned_auditor_id, notes,
      obligation_request_reference)
    VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, project_id
  `, [projectId, type, reference, receivedOn, auditorId, notes, obligationReference]);
  const record = saved.rows[0];
  const labels = (references.checklists[type] ?? []).filter((label) => type !== 'bac' ||
    label.toLowerCase() !== 'other appropriate licenses and permits required by law and stated in the pbd');
  if (labels.length) {
    await client.query(`
      INSERT INTO checklist_items (transaction_id, label) SELECT $1, label FROM unnest($2::text[]) AS label
    `, [record.id, labels]);
  }
  const initialStatus = user.role === 'intake' ? 'Pending' : 'Under Audit';
  await event(client, user, record, 'register', { actualOn: receivedOn, next: initialStatus });
  return record;
}

function summary(record) {
  const { notes, revision, ...visible } = record;
  return visible;
}

export async function listTransactions(client, filters) {
  const values = [movementKinds];
  const conditions = [];
  const query = text(filters.q, 'Search', 200);
  if (query) {
    const n = values.push(query);
    conditions.push(`(movement.kind <> 'void' OR lower(t.reference) = lower($${n}))`);
    conditions.push(`(strpos(lower(t.reference), lower($${n})) > 0 OR strpos(lower(p.title), lower($${n})) > 0
      OR strpos(lower(p.reference), lower($${n})) > 0)`);
  } else {
    conditions.push("movement.kind <> 'void'");
  }
  if (filters.project_id) conditions.push(`t.project_id = $${values.push(id(filters.project_id, 'Project'))}`);
  if (filters.assigned_auditor_id) {
    conditions.push(`t.assigned_auditor_id = $${values.push(id(filters.assigned_auditor_id, 'Assigned auditor'))}`);
  }
  if (filters.type) conditions.push(`t.type = $${values.push(oneOf(filters.type, Object.keys(types), 'Transaction type'))}`);
  if (filters.status) conditions.push(`movement.new_status = $${values.push(oneOf(filters.status, statusNames, 'Status'))}`);
  const result = await client.query(`
    SELECT ${txColumns} FROM ${txTables}
    WHERE ${conditions.join(' AND ')} ORDER BY movement.id DESC
  `, values);
  return result.rows.map(summary);
}

async function findTransaction(client, transactionId) {
  const result = await client.query(`SELECT ${txColumns} FROM ${txTables} WHERE t.id = $2`, [
    movementKinds, transactionId,
  ]);
  if (!result.rowCount) throw new RequestError(404, 'Transaction not found.');
  return result.rows[0];
}

async function checklist(client, transactionId) {
  const result = await client.query(`
    SELECT id, label, state, remarks, custom, document_fields FROM checklist_items WHERE transaction_id = $1 ORDER BY id
  `, [transactionId]);
  return result.rows;
}

export async function readTransaction(client, user, transactionId) {
  await client.query('SELECT id FROM transactions WHERE id = $1 FOR SHARE', [transactionId]);
  const record = await findTransaction(client, transactionId);
  const audit = auditRoles.includes(user.role);
  const result = await client.query(`
    SELECT ${eventColumns} FROM audit_events WHERE transaction_id = $1
      AND ($2 OR kind = ANY($3::text[])) ORDER BY id
  `, [transactionId, audit, movementKinds]);
  const history = result.rows.map((row) => visibleEvent(row, audit));
  if (!audit) {
    const { rows: [counts] } = await client.query(`
      SELECT count(*)::int AS items_needing_compliance FROM checklist_items
      WHERE transaction_id = $1 AND state = 'Unchecked'
    `, [transactionId]);
    return { ...summary(record), revision: record.revision, history, ...counts };
  }
  const items = await checklist(client, transactionId);
  const orderedItems = record.type === 'bac' ? groupBacChecklist(items) : items;
  return { ...record, history, checklist: orderedItems.map((item) => ({
    ...item, field_definitions: bacFields(record.type, item),
  })) };
}

async function openForChange(client, transactionId, revision) {
  const result = await client.query('SELECT revision FROM transactions WHERE id = $1 FOR UPDATE', [transactionId]);
  if (!result.rowCount) throw new RequestError(404, 'Transaction not found.');
  requireRevision(result.rows[0].revision, revision);
  const record = await findTransaction(client, transactionId);
  if (record.voided) throw new RequestError(409, 'This duplicate is voided. Its history is available for review.');
  return record;
}

async function incrementRevision(client, transactionId) {
  await client.query('UPDATE transactions SET revision = revision + 1 WHERE id = $1', [transactionId]);
}

export async function correctTransaction(client, user, transactionId, body) {
  const record = await openForChange(client, transactionId, body.revision);
  const values = {
    reference: text(body.reference ?? record.reference, 'Transaction reference or title', 200, true),
    received_on: date(body.received_on, 'Received date', record.received_on),
    notes: Object.hasOwn(body, 'notes') ? text(body.notes, 'Notes', 2500) : record.notes,
    obligation_request_reference: Object.hasOwn(body, 'obligation_request_reference')
      ? obligationRequestReference(body.obligation_request_reference) : record.obligation_request_reference,
  };
  const changes = diff(record, values);
  if (Object.keys(changes).length) {
    await client.query(`
      UPDATE transactions SET reference = $2, received_on = $3, notes = $4, obligation_request_reference = $5
      WHERE id = $1
    `, [transactionId, ...Object.values(values)]);
    await event(client, user, record, 'correct', {
      actualOn: date(body.actual_on, 'Action date', today()), details: { changes },
    });
    await incrementRevision(client, transactionId);
  }
  return readTransaction(client, user, transactionId);
}

export async function saveChecklist(client, user, transactionId, body) {
  const record = await openForChange(client, transactionId, body.revision);
  const stored = new Map((await checklist(client, transactionId)).map((item) => [item.id, item]));
  const items = body.items ?? [];
  if (!Array.isArray(items)) throw new RequestError(400, 'Checklist items must be a list.');
  const changes = [];
  for (const entry of items) {
    if (entry == null || typeof entry !== 'object') throw new RequestError(400, 'Checklist item is invalid.');
    const item = stored.get(id(entry.id, 'Checklist item'));
    if (!item) throw new RequestError(400, 'Select each checklist item once from this transaction.');
    stored.delete(item.id);
    const state = oneOf(entry.state, checklistStates, 'Checklist state');
    const remarks = text(entry.remarks, 'Checklist remarks');
    const documentFields = updateDocumentFields(item.document_fields, entry.document_fields, bacFields(record.type, item));
    if (item.state !== state || item.remarks !== remarks ||
        JSON.stringify(item.document_fields) !== JSON.stringify(documentFields)) {
      await client.query('UPDATE checklist_items SET state = $2, remarks = $3, document_fields = $4 WHERE id = $1',
        [item.id, state, remarks, documentFields]);
      changes.push({ before: item, after: { ...item, state, remarks, document_fields: documentFields } });
    }
  }
  const label = text(body.new_label, 'Requirement label', 240);
  if (label) {
    const saved = await client.query(`
      INSERT INTO checklist_items (transaction_id, label, custom) VALUES ($1, $2, true)
      RETURNING id, label, state, remarks, custom
    `, [transactionId, label]);
    changes.push({ before: null, after: saved.rows[0] });
  }
  if (changes.length) {
    await event(client, user, record, 'checklist', {
      actualOn: date(body.actual_on, 'Action date', today()), details: { changes },
    });
    await incrementRevision(client, transactionId);
  }
  return readTransaction(client, user, transactionId);
}

const transitions = {
  start: { from: 'Pending', to: 'Under Audit' },
  suspend: { from: 'Under Audit', to: 'Suspended' },
  resubmit: { from: 'Suspended', to: 'Resubmitted' },
  resume: { from: 'Resubmitted', to: 'Under Audit' },
  certify: { from: 'Under Audit', to: 'Audited' },
};

export async function actOnTransaction(client, user, transactionId, kind, body, references) {
  const record = await openForChange(client, transactionId, body.revision);
  const transition = transitions[kind];
  if (transition && record.status !== transition.from) {
    throw new RequestError(409, `This action requires a transaction marked ${transition.from}.`);
  }
  const actualOn = date(body.actual_on, 'Action date', today());
  const remarks = text(body.remarks, kind === 'void' ? 'Duplicate reason' : 'Action remarks', 1000, kind === 'void');
  const details = { remarks };
  if (kind === 'suspend' || kind === 'certify') {
    const unchecked = (await checklist(client, transactionId)).filter((item) => item.state === 'Unchecked');
    if (kind === 'suspend') {
      if (!unchecked.length) {
        throw new RequestError(400, 'There are no unchecked applicable requirements to include on a suspension slip.');
      }
      const itemRemarks = body.item_remarks ?? {};
      if (!itemRemarks || typeof itemRemarks !== 'object' || Array.isArray(itemRemarks)) {
        throw new RequestError(400, 'Review the suspension items and remarks.');
      }
      const snapshot = {
        project: record.project, type: record.type, reference: record.reference,
        issuer: user.displayName, actualOn, remarks,
        items: unchecked.map((item) => ({
          label: item.label,
          remarks: Object.hasOwn(itemRemarks, item.id) ? text(itemRemarks[item.id], 'Item remarks') : item.remarks,
        })),
      };
      details.slip_html = renderSlip(references.layout, snapshot);
      details.slip = snapshot;
    } else {
      details.justification = text(body.justification, 'Justification for unchecked requirements', 2500, unchecked.length > 0);
      details.certified_amount = amount(body.certified_amount, 'Certified amount');
      if (record.type === 'bac' && details.certified_amount !== null) {
        throw new RequestError(400, 'Certified amounts apply to payment, billing, and retention transactions.');
      }
      if (details.certified_amount !== null) Object.assign(details, amountForCopy(details.certified_amount));
    }
  }
  const eventId = await event(client, user, record, kind, {
    actualOn, previous: record.status, next: transition?.to ?? record.status, details,
  });
  await incrementRevision(client, transactionId);
  return { record: await readTransaction(client, user, transactionId), event_id: eventId };
}

export async function readSlip(client, transactionId, eventId) {
  if (typeof eventId !== 'string' || !/^[1-9][0-9]{0,18}$/.test(eventId) || BigInt(eventId) > 9223372036854775807n) {
    throw new RequestError(404, 'Suspension slip not found.');
  }
  const result = await client.query(`
    SELECT details ->> 'slip_html' AS html FROM audit_events
    WHERE transaction_id = $1 AND id = $2 AND kind = 'suspend'
  `, [transactionId, eventId]);
  if (!result.rows[0]?.html) throw new RequestError(404, 'Suspension slip not found.');
  return result.rows[0].html;
}
