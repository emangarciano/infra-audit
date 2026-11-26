import { readFile } from 'node:fs/promises';
import { types, text } from './domain.js';

const bacGroupRanges = [
  ['preparation', 'APP/SPP', 'Checklist of Requirements'],
  ['evaluation', 'Abstract of Bids as Read', 'Notice of Post-Qualification'],
  ['award', 'BAC Resolution', 'Certificate of PhilGEPS Award Notice Abstract'],
  ['financial', 'Financial Bid Form', 'Cash Flow by the Quarter & Payments Schedule'],
  ['technical', 'Statement of all ongoing government and private contracts', 'Latest Income Tax Return'],
];

export function groupBacChecklist(items) {
  const standardItems = items.filter((item) => !item.custom);
  const labels = standardItems.map((item) => item.label.toLowerCase());
  const groups = new Map();
  for (const [group, first, last] of bacGroupRanges) {
    const start = labels.indexOf(first.toLowerCase());
    const end = labels.indexOf(last.toLowerCase(), start + 1);
    if (start < 0 || end < 0) continue;
    for (const { id } of standardItems.slice(start, end + 1)) {
      // The financial range is assigned before the enclosing technical range.
      if (!groups.has(id)) groups.set(id, group);
    }
  }
  const grouped = items.map((item) => ({ ...item, checklist_group: groups.get(item.id) ?? 'others' }));
  const certificateIndex = grouped.findIndex(({ custom, label }) =>
    !custom && label.toLowerCase() === 'philgeps certificate of registration and membership');
  if (certificateIndex < 0) return grouped;

  const certificate = grouped[certificateIndex];
  certificate.checklist_group = 'technical';
  const firstTechnicalIndex = grouped.findIndex(({ checklist_group }) => checklist_group === 'technical');
  if (certificateIndex > firstTechnicalIndex) {
    grouped.splice(certificateIndex, 1);
    grouped.splice(firstTechnicalIndex, 0, certificate);
  }
  return grouped;
}

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
<h1>Suspension slip</h1>
<dl>
<dt>Project</dt><dd>{{project}}</dd>
<dt>Project reference number</dt><dd>{{projectreference}}</dd>
<dt>Transaction type</dt><dd>{{type}}</dd>
<dt>Action date</dt><dd>{{date}}</dd>
<dt>Issued by</dt><dd>{{issuer}}</dd>
</dl>
<h2>Needing compliance:</h2>
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
    for (const type of Object.keys(types).filter((key) => key !== 'bac')) {
      checklists[type] = ['Development fixture — sample requirement A', 'Development fixture — sample requirement B'];
    }
  }
  if (!Object.hasOwn(checklists, 'bac')) {
    const source = await readFile(new URL('../docs/BAC Documentation.csv', import.meta.url), 'utf8');
    checklists.bac = source.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((row) => {
      const cell = /^(?:"((?:[^"]|"")*)"|([^",]+))$/.exec(row);
      if (!cell) throw new Error('Each BAC checklist row must contain one requirement label.');
      const label = cell[1] === undefined ? cell[2] : cell[1].replaceAll('""', '"');
      return text(label, 'Checklist label', 240, true);
    });
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
    projectreference: escapeHtml(snapshot.projectReference),
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
