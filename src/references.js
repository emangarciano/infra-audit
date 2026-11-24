import { readFile } from 'node:fs/promises';
import { types, text } from './domain.js';

const draftLayout = `<!doctype html>
<html lang="en"><meta charset="utf-8"><title>Suspension slip</title>
<style>
body { color: #1d2422; font: 16px system-ui, sans-serif; margin: 2rem; }
main { max-width: 46rem; margin: auto; }
dt { font-weight: 650; margin-top: .5rem; }
dd { margin-left: 0; }
li { margin-bottom: .6rem; break-inside: avoid; }
@media print { body { margin: 0; } .print-help { display: none; } }
</style>
<main>
<p class="print-help">Use your browser’s Print command to print this slip.</p>
<p><strong>Development fixture · For testing only</strong></p>
<h1>Suspension slip</h1>
<dl>
<dt>Project</dt><dd>{{project}}</dd>
<dt>Transaction</dt><dd>{{transaction}} · {{type}}</dd>
<dt>Action date</dt><dd>{{date}}</dd>
<dt>Issued by</dt><dd>{{issuer}}</dd>
</dl>
<h2>Unchecked requirements</h2>
{{requirements}}
{{remarks}}
</main></html>`;

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

export async function loadReferences(env = process.env) {
  const checklists = {};
  if (env.PACCO_CHECKLIST_FILE) {
    const source = JSON.parse(await readFile(env.PACCO_CHECKLIST_FILE, 'utf8'));
    if (!source || typeof source !== 'object' || Array.isArray(source)) {
      throw new Error('The checklist file must map transaction types to requirement labels.');
    }
    if (Object.keys(source).some((key) => !Object.hasOwn(types, key))) {
      throw new Error('The checklist file contains an unknown transaction type.');
    }
    for (const [type, labels] of Object.entries(source)) {
      if (!Array.isArray(labels)) throw new Error(`Supply an array of checklist labels for ${type}.`);
      checklists[type] = labels.map((label) => text(label, 'Checklist label', 240, true));
    }
  } else if (env.PACCO_DEVELOPMENT_FIXTURES === '1') {
    for (const type of Object.keys(types)) {
      checklists[type] = ['Development fixture — sample requirement A', 'Development fixture — sample requirement B'];
    }
  }
  const layout = env.PACCO_SLIP_TEMPLATE_FILE
    ? await readFile(env.PACCO_SLIP_TEMPLATE_FILE, 'utf8')
    : draftLayout;
  if (!layout.includes('{{requirements}}')) throw new Error('The suspension slip template needs {{requirements}}.');
  return { checklists, layout };
}

export function renderSlip(layout, snapshot) {
  const values = {
    project: escapeHtml(snapshot.project),
    transaction: escapeHtml(snapshot.reference),
    type: escapeHtml(types[snapshot.type]),
    date: escapeHtml(snapshot.actualOn),
    issuer: escapeHtml(snapshot.issuer),
    requirements: '<ol>' + snapshot.items.map((item) =>
      `<li><strong>${escapeHtml(item.label)}</strong>` +
      (item.remarks ? `<p>${escapeHtml(item.remarks)}</p>` : '') + '</li>',
    ).join('') + '</ol>',
    remarks: snapshot.remarks ? `<p>${escapeHtml(snapshot.remarks)}</p>` : '',
  };
  return layout.replace(/\{\{([a-z]+)\}\}/g, (match, field) =>
    Object.hasOwn(values, field) ? values[field] : match);
}
