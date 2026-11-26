import { RequestError } from './database.js';
import { amount, date, oneOf, text } from './domain.js';

const fields = {
  issue_date: { label: 'Issue date', kind: 'date' },
  received_date: { label: 'Received date', kind: 'date' },
  effectivity_date: { label: 'Effectivity date', kind: 'date' },
  amount: { label: 'Amount (₱)', kind: 'amount' },
  surety_name: { label: 'Surety name', kind: 'text' },
  reference: { label: 'Reference', kind: 'text' },
  reference_number: { label: 'Reference number', kind: 'text' },
  includes_after_completion: { label: 'Includes after completion', kind: 'boolean' },
  duration: { label: 'Duration', kind: 'text' },
};

const documents = new Map([
  ['obr', ['reference_number', 'amount']],
  ['notice of award', ['issue_date', 'received_date', 'amount']],
  ['performance security', ['effectivity_date', 'surety_name', 'reference', 'includes_after_completion']],
  ['duly notarized contract', ['issue_date', 'amount', 'duration']],
  ['contract', ['issue_date', 'amount', 'duration']],
  ['notice to proceed', ['issue_date', 'received_date']],
  ["contractor's all risk insurance (cari)", ['effectivity_date', 'surety_name']],
  ['cari', ['effectivity_date', 'surety_name']],
]);

export function bacFields(type, item) {
  const keys = type === 'bac' && !item.custom ? documents.get(item.label.toLowerCase()) : null;
  return (keys ?? []).map((key) => ({ key, ...fields[key] }));
}

const validate = {
  date,
  amount,
  text: (value, label) => text(value, label, 240),
  boolean: (value, label) => value === null ? null : oneOf(value, [true, false], label),
};

export function updateDocumentFields(current, input, definitions) {
  if (input === undefined) return current;
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new RequestError(400, 'Document fields must be an object.');
  }
  const updated = { ...current };
  for (const [key, value] of Object.entries(input)) {
    const definition = definitions.find((field) => field.key === key);
    if (!definition) throw new RequestError(400, 'Unexpected field for this checklist item.');
    const normalized = validate[definition.kind](value, definition.label);
    if (normalized === null) delete updated[key];
    else updated[key] = normalized;
  }
  return updated;
}
