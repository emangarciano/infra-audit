import { parsePesoAmount } from './peso-amount.js';

const screen = document.querySelector('#screen');
const notice = document.querySelector('#notice');
const navigation = document.querySelector('#navigation');
const account = document.querySelector('#account');
const dialog = document.querySelector('#action-dialog');
const manilaDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Manila' });
const manilaTime = new Intl.DateTimeFormat('en-PH', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila',
});
const roleNames = {
  intake: 'Administrative staff', auditor: 'Auditor', supervisor: 'Supervisor', 'system-admin': 'System administrator',
};
const actionLabels = {
  register: 'Registered', start: 'Audit started', checklist: 'Checklist updated', correct: 'Transaction corrected',
  project_correction: 'Project corrected', suspend: 'Suspended', resubmit: 'Resubmitted',
  resume: 'Audit resumed', certify: 'Marked Audited', void: 'Duplicate voided',
};
const fieldLabels = {
  title: 'Project name', contractor: 'Contractor', contract_amount: 'Contract amount',
  contract_date: 'Contract date', contract_duration: 'Contract duration',
  obligation_request_reference: 'Obligation request reference',
  reference: 'Reference or title', received_on: 'Received or created date', notes: 'Transaction notes',
};
let user;
let lookups;
let navigationVersion = 0;

const today = () => manilaDate.format(new Date());
const isAuditRole = () => ['auditor', 'supervisor'].includes(user?.role);
const route = () => location.hash.slice(1) || 'projects';
const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]);

function showNotice(message, isError = false, latestLink) {
  notice.textContent = message;
  notice.classList.toggle('error', isError);
  notice.hidden = !message;
  if (latestLink) {
    const review = document.createElement('a');
    review.href = latestLink;
    review.target = '_blank';
    review.rel = 'noopener';
    review.textContent = 'Open latest record in a new tab';
    notice.append(review);
  }
}

async function api(path, method = 'GET', body) {
  let response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      ...(body === undefined ? {} : {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    });
  } catch {
    throw new Error('Cannot reach the office server. Your form is still open.');
  }
  if (response.status === 204) return null;
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error(data.error), { status: response.status, code: data.code });
  return data;
}

function field(label, name, value = '', attributes = '', kind = 'text') {
  return `<label>${escape(label)}<input name="${name}" type="${kind}" value="${escape(value)}" ${attributes}></label>`;
}

function remarks(label, name, value = '', max = 1000) {
  return `<label>${escape(label)}<textarea name="${name}" maxlength="${max}">${escape(value)}</textarea></label>`;
}

function options(values, selected) {
  return values.map(([value, label]) => `<option value="${escape(value)}"${String(value) === String(selected) ? ' selected' : ''}>${escape(label)}</option>`).join('');
}

function select(label, name, values, selected, attributes = '') {
  return `<label>${escape(label)}<select name="${name}" ${attributes}>${options(values, selected)}</select></label>`;
}

function heading(title, actions = '', subtitle = '') {
  return `<div class="page-heading"><div><h1 tabindex="-1">${escape(title)}</h1>${subtitle ? `<p class="muted">${escape(subtitle)}</p>` : ''}</div><div class="actions">${actions}</div></div>`;
}

function badge(status, voided = false) {
  const className = escape(status.toLowerCase().replaceAll(' ', '-'));
  return `<span class="badge ${className}">${escape(status)}</span>${voided ? ' <span class="badge voided">Voided</span>' : ''}`;
}

function mount(markup, focus = true) {
  screen.innerHTML = markup;
  if (focus) screen.querySelector('h1')?.focus();
}

function updateHeader(onProjectList = false) {
  navigation.innerHTML = user && user.role !== 'system-admin'
    ? `<a href="#projects"${onProjectList ? ' aria-current="page"' : ''}>Projects</a>` : '';
  account.innerHTML = user
    ? `<span>${escape(user.displayName)} · ${roleNames[user.role]}</span><button id="sign-out" type="button">Sign out</button>`
    : '';
  account.querySelector('button')?.addEventListener('click', async () => {
    try {
      await api('/session', 'DELETE', {});
      navigationVersion++;
      user = null;
      lookups = null;
      if (dialog.open) dialog.close();
      showNotice('');
      displayLogin();
    } catch (error) {
      showNotice(error.message, true);
    }
  });
}

function submit(form, work, { localError, conflict } = {}) {
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const buttons = [...form.querySelectorAll('[type="submit"]')];
    if (buttons.some((button) => button.disabled)) return;
    buttons.forEach((button) => { button.disabled = true; });
    if (localError) localError.hidden = true;
    else showNotice('');
    try {
      await work(Object.fromEntries(new FormData(form)));
    } catch (error) {
      if (localError) {
        localError.textContent = error.message;
        localError.hidden = false;
        if (error.code === 'revision' && conflict) {
          const review = document.createElement('a');
          review.href = conflict;
          review.target = '_blank';
          review.rel = 'noopener';
          review.textContent = 'Open latest record in a new tab';
          localError.append(review);
        }
        localError.focus();
      } else {
        showNotice(error.message, true, error.code === 'revision' ? conflict : undefined);
      }
    } finally {
      buttons.forEach((button) => { button.disabled = false; });
    }
  });
}

function displayLogin() {
  updateHeader();
  mount(`<section class="panel login"><h1 tabindex="-1">Sign in</h1><p class="muted">PACCO office audit register</p>
    <form id="login-form" class="stack">
      ${field('Username', 'username', '', 'autocomplete="username" required maxlength="64"')}
      ${field('Four-digit PIN', 'pin', '', 'autocomplete="current-password" required inputmode="numeric" pattern="[0-9]{4}" maxlength="4"', 'password')}
      <button class="primary" type="submit">Sign in</button>
    </form></section>`);
  submit(screen.querySelector('form'), async (body) => {
    user = await api('/session', 'POST', body);
    await displayRoute();
  });
}

async function saveNew(path, body) {
  try {
    return await api(path, 'POST', body);
  } catch (error) {
    if (error.code !== 'duplicate') throw error;
    if (window.confirm(error.message)) return api(path, 'POST', { ...body, allow_duplicate: true });
    return null;
  }
}

function transactionTable(rows, label) {
  return `<div class="table-panel" role="region" aria-label="${label}" tabindex="0"><table><thead><tr>
        <th scope="col">Type</th><th scope="col">Reference</th>
        <th scope="col">Assigned auditor</th><th scope="col">Status</th><th scope="col">Latest action date</th>
      </tr></thead><tbody>${rows.map((row) => `<tr class="transaction-row">
        <td>${escape(lookups.types[row.type])}</td>
        <td><a class="transaction-link" href="#transaction/${row.id}">${escape(row.reference)}</a></td><td>${escape(row.assigned_auditor)}</td>
        <td>${badge(row.status, row.voided)}</td><td>${escape(row.latest_action_on)}</td>
      </tr>`).join('')}</tbody></table></div>`;
}

function projectTransactions(rows) {
  const active = rows.filter(({ voided }) => !voided);
  const voided = rows.filter((row) => row.voided);
  return `<section class="panel stack" aria-labelledby="project-transactions">
    <h2 id="project-transactions">Transactions</h2>
    ${active.length ? transactionTable(active, 'Active transactions')
      : `<p class="empty">${voided.length ? 'No active transactions for this project.' : 'No transactions for this project.'}</p>`}
    ${voided.length ? `<details><summary>Voided transactions (${voided.length})</summary>
      ${transactionTable(voided, 'Voided transactions')}</details>` : ''}
    </section>`;
}

function projectLabel(name, reference) {
  return reference ? `${name} (${reference})` : name;
}

function projectBrowser() {
  return `<section class="panel stack" aria-label="Project register" data-project-browser>
    ${field('Search projects', 'project_search', '', 'placeholder="Name, project reference or obligation request"', 'search')}
    <div data-project-results aria-live="polite"></div>
  </section>`;
}

function bindProjectBrowser(container, projects, chooseProject) {
  const input = container.querySelector('[name="project_search"]');
  const results = container.querySelector('[data-project-results]');
  const missingContractor = 'No contractor recorded';
  const grouped = new Map();
  for (const project of projects) {
    const contractor = project.contractor?.trim() || null;
    if (!grouped.has(contractor)) grouped.set(contractor, []);
    grouped.get(contractor).push(project);
  }
  const contractors = [...grouped.keys()].sort((a, b) => {
    if (a === null) return 1;
    if (b === null) return -1;
    return a.localeCompare(b);
  });
  // Undefined shows the contractor list. Null selects projects with no contractor.
  let selectedContractor;
  let searchVersion = 0;
  let timer;
  let displayedProjects;

  function projectRows(rows) {
    displayedProjects = rows;
    return `<section class="table-panel project-table" aria-label="Project results" tabindex="0"><table>
      <thead><tr><th scope="col">Project name</th><th scope="col">Project reference</th><th scope="col">Contractor</th></tr></thead>
      <tbody>${rows.map((project, index) => `<tr><td>${chooseProject
        ? `<button class="link project-choice" type="button" data-project-choice="${index}"
          aria-label="${escape(projectLabel(project.title, project.reference))}, ${escape(project.contractor?.trim() || missingContractor)}">${escape(project.title)}</button>`
        : `<a href="#project/${project.id}">${escape(project.title)}</a>`}</td>
        <td>${escape(project.reference ?? '—')}</td>
        <td>${escape(project.contractor?.trim() || missingContractor)}</td></tr>`).join('')}</tbody>
    </table></section>`;
  }

  function browse() {
    if (!projects.length) {
      results.innerHTML = '<p class="empty">No projects registered.</p>';
    } else if (selectedContractor !== undefined) {
      results.innerHTML = `<div class="project-results-heading">
        <h2 tabindex="-1">${escape(selectedContractor ?? missingContractor)}</h2>
        <button type="button" data-contractors>Back to contractors</button>
      </div>${projectRows(grouped.get(selectedContractor))}`;
    } else {
      results.innerHTML = `<h2 tabindex="-1">Contractors</h2><ul class="contractor-list">
        ${contractors.map((contractor, index) => `<li><button type="button" data-contractor="${index}">
          ${escape(contractor ?? missingContractor)}</button></li>`).join('')}
      </ul>`;
    }
  }

  results.addEventListener('click', (event) => {
    const choice = event.target.closest('[data-project-choice]');
    if (choice) {
      chooseProject(displayedProjects[Number(choice.dataset.projectChoice)]);
      return;
    }
    const contractor = event.target.closest('[data-contractor]');
    if (!contractor && !event.target.closest('[data-contractors]')) return;
    selectedContractor = contractor ? contractors[Number(contractor.dataset.contractor)] : undefined;
    browse();
    results.querySelector('h2')?.focus();
  });
  input.addEventListener('input', () => {
    const version = ++searchVersion;
    const routeVersion = navigationVersion;
    const query = input.value.trim();
    clearTimeout(timer);
    if (!query) {
      browse();
      return;
    }
    results.innerHTML = '<p class="empty">Searching projects…</p>';
    timer = setTimeout(async () => {
      const isCurrent = () => version === searchVersion && routeVersion === navigationVersion && container.isConnected;
      if (!isCurrent()) return;
      try {
        const matches = await api(`/projects?${new URLSearchParams({ q: query })}`);
        if (isCurrent()) results.innerHTML = matches.length ? projectRows(matches)
          : '<p class="empty">No projects match your search.</p>';
      } catch (error) {
        if (isCurrent()) results.innerHTML = `<p class="empty">${escape(error.message)}</p>`;
      }
    }, 250);
  });
  browse();
}

function displayProjects(projects) {
  mount(`${heading('Projects', '<a class="button primary" href="#new-project">New project</a>')}
    ${projectBrowser()}`);
  bindProjectBrowser(screen.querySelector('[data-project-browser]'), projects);
}

function projectFields(record = {}, creating = false) {
  const required = creating ? 'required' : '';
  return `${field('Project name', 'title', record.title, 'required maxlength="200"')}
    ${field('Project reference', 'reference', record.reference, `maxlength="200" ${required}`)}
    ${field('Contractor', 'contractor', record.contractor, `maxlength="200" ${required}`)}
    ${field('Contract amount (₱)', 'contract_amount', record.contract_amount, `inputmode="decimal" maxlength="23" ${required}`)}
    ${!creating && isAuditRole() ? `${field('Contract date', 'contract_date', record.contract_date, '', 'date')}
    ${field('Contract duration', 'contract_duration', record.contract_duration, 'maxlength="100"')}` : ''}`;
}

function displayNewProject() {
  mount(`<a class="back" href="#projects">Projects</a>${heading('New project')}
    <form class="panel"><div class="grid">${projectFields({}, true)}</div>
    <div class="actions form-actions"><button class="primary" type="submit">Create project</button></div></form>`);
  submit(screen.querySelector('form'), async (body) => {
    const record = await saveNew('/projects', body);
    if (record) location.hash = `project/${record.id}`;
  });
}

function displayNewTransaction(projectId) {
  const assigned = lookups.auditors.filter(({ assignable }) => assignable).map(({ id, display_name }) => [id, display_name]);
  const projects = lookups.projects;
  const selectedProject = projects.find(({ id }) => String(id) === projectId);
  const canRegister = projects.length && (user.role !== 'intake' || assigned.length);
  const precondition = projects.length
    ? '<p>An active auditor account is required for assignment.</p>'
    : '<p><a href="#new-project">Create a project</a> to register its first transaction.</p>';
  const back = selectedProject ? `<a class="back" href="#project/${selectedProject.id}">Back to project</a>`
    : '<a class="back" href="#projects">Projects</a>';
  mount(`${back}${heading('New transaction', '', user.role === 'intake' ? 'New transactions start Pending.' : 'New transactions start Under Audit.')}
    ${canRegister ? `<form class="panel stack"><div class="grid">
      <div class="project-field">
        <strong>Project (required)</strong>
        <p id="selected-project" aria-live="polite">${selectedProject
          ? escape(projectLabel(selectedProject.title, selectedProject.reference)) : 'No project selected'}</p>
        <input type="hidden" name="project_id" value="${selectedProject?.id ?? ''}">
        <button type="button" id="choose-project" aria-haspopup="dialog"
          aria-describedby="selected-project">Choose project</button>
        <p id="project-selection-error" role="alert" hidden>Choose a project to register this transaction.</p>
      </div>
      ${select('Type', 'type', [['', 'Select a type'], ...Object.entries(lookups.types)], '', 'required')}
      ${field('Obligation request reference (optional)', 'obligation_request_reference', '', 'maxlength="200"')}
      ${field('Received or created date', 'received_on', today(), 'required', 'date')}
      ${user.role === 'intake'
        ? select('Assigned auditor', 'assigned_auditor_id', [['', 'Select an auditor'], ...assigned], '', 'required')
        : field('Assigned auditor', 'assigned_display', user.displayName, 'readonly')}
    </div>${isAuditRole() ? remarks('Notes', 'notes', '', 2500) : ''}
    <div class="actions"><button class="primary" type="submit">Register transaction</button></div></form>
    <dialog id="project-picker" aria-labelledby="project-picker-title"></dialog>`
      : `<section class="panel">${precondition}</section>`}`);
  const form = screen.querySelector('form');
  if (!form) return;

  const picker = form.querySelector('#choose-project');
  const selection = form.querySelector('#selected-project');
  const selectionError = form.querySelector('#project-selection-error');
  const pickerDialog = screen.querySelector('#project-picker');
  picker.addEventListener('click', () => {
    pickerDialog.innerHTML = `<div class="stack"><h2 id="project-picker-title">Choose project</h2>
      ${projectBrowser()}<div class="actions"><button type="button" data-cancel-pick>Cancel</button></div></div>`;
    bindProjectBrowser(pickerDialog.querySelector('[data-project-browser]'), projects, (project) => {
      form.elements.project_id.value = project.id;
      selection.textContent = projectLabel(project.title, project.reference);
      selectionError.hidden = true;
      picker.setAttribute('aria-describedby', 'selected-project');
      pickerDialog.close();
    });
    pickerDialog.querySelector('[data-cancel-pick]').addEventListener('click', () => pickerDialog.close());
    pickerDialog.showModal();
    pickerDialog.querySelector('[name="project_search"]').focus();
  });
  pickerDialog.addEventListener('close', () => {
    if (pickerDialog.open) return;
    pickerDialog.replaceChildren();
    picker.focus();
  });
  submit(form, async (body) => {
    if (!body.project_id) {
      selectionError.hidden = false;
      picker.setAttribute('aria-describedby', 'selected-project project-selection-error');
      picker.focus();
      return;
    }
    const record = await saveNew('/transactions', body);
    if (record) location.hash = `transaction/${record.id}`;
  });
}

function displayProject(record) {
  mount(`<a class="back" href="#projects">Projects</a>${heading(projectLabel(record.title, record.reference),
    `<a class="button primary" href="#new-transaction/${record.id}">New transaction</a>`)}
    ${isAuditRole() ? `<form id="project-form" class="panel"><h2>Project details</h2>
      <div class="grid">${projectFields(record)}${field('Action date', 'actual_on', today(), 'required', 'date')}</div>
      <div class="actions form-actions"><button class="primary" type="submit">Save project details</button></div></form>` : ''}
    ${projectTransactions(record.transactions)}`);
  const form = screen.querySelector('#project-form');
  if (form) submit(form, async (body) => {
    const version = navigationVersion;
    const updated = await api(`/projects/${record.id}`, 'PATCH', { ...body, revision: record.revision });
    if (version !== navigationVersion) return;
    displayProject(updated);
    showNotice('Project details saved.');
  }, { conflict: `#project/${record.id}` });
}

const checklistStateLabels = { 'N/A': 'N/A', Checked: 'Complied', Unchecked: 'Not Complied' };
const booleanOptions = [['', 'Not recorded'], ['true', 'Yes'], ['false', 'No']];
const bacGroupLabels = {
  preparation: 'Procurement preparation', evaluation: 'Procurement evaluation', award: 'Award',
  financial: 'Financial proposal', technical: 'Technical proposal', others: 'Others',
};

function documentFieldValue(value) {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return value ?? '—';
}

function documentFields(item) {
  return item.field_definitions.map(({ key, label, kind }) => {
    const value = item.document_fields[key];
    if (kind === 'boolean') return select(label, key, booleanOptions, value ?? '');
    let attributes = 'maxlength="240"';
    if (kind === 'amount') attributes = 'inputmode="decimal" maxlength="23" data-peso-amount';
    if (kind === 'date') attributes = 'min="0001-01-01" max="9999-12-31"';
    return field(label, key, value ?? '', attributes, kind === 'date' ? 'date' : 'text');
  }).join('');
}

function documentBadges(item, values) {
  const details = item.field_definitions.map(({ key, label }) => [label, values.document_fields[key]]);
  details.push(['Remarks', values.remarks]);
  return details.filter(([, value]) => value != null && String(value).trim() !== '').map(([label, value]) =>
    `<span class="badge"><strong>${escape(label)}</strong> ${escape(documentFieldValue(value))}</span>`).join('');
}

function checklistRow(item, editable, draft) {
  const name = `requirement-${item.id}`;
  const notApplicable = item.state === 'N/A';
  const complied = item.state === 'Checked';
  const controls = editable ? `<div class="checklist-choices">
      <label><input type="checkbox" name="not_applicable_${item.id}" value="N/A" aria-describedby="${name}"${notApplicable ? ' checked' : ''}> N/A</label>
      <label><input type="checkbox" name="complied_${item.id}" value="Checked" aria-describedby="${name}"${complied ? ' checked' : ''}${notApplicable ? ' disabled' : ''}>
        <span class="compliance-label">${complianceLabel(notApplicable, complied)}</span></label>
      <button type="button" class="checklist-details" data-document="${item.id}" aria-haspopup="dialog"
        aria-label="Add details" aria-describedby="${name}">+</button>
    </div>` : `<span class="checklist-choices">${checklistStateLabels[item.state]}</span>`;
  return `<li class="checklist-row" data-state="${escape(item.state)}">
    <div class="requirement-controls">
      <span id="${name}" class="requirement-name">${escape(item.label)}${item.custom ? ' <span class="muted">(custom)</span>' : ''}</span>
      ${controls}
    </div>
    <div class="document-badges">${documentBadges(item, draft ?? item)}</div>
  </li>`;
}

function checklistState(notApplicable, complied) {
  return notApplicable ? 'N/A' : complied ? 'Checked' : 'Unchecked';
}

function complianceLabel(notApplicable, complied) {
  return checklistStateLabels[notApplicable || complied ? 'Checked' : 'Unchecked'];
}

function syncChecklistRow(row) {
  const notApplicable = row.querySelector('input[value="N/A"]').checked;
  const compliance = row.querySelector('input[value="Checked"]');
  compliance.disabled = notApplicable;
  if (notApplicable) compliance.checked = false;
  row.dataset.state = checklistState(notApplicable, compliance.checked);
  row.querySelector('.compliance-label').textContent = complianceLabel(notApplicable, compliance.checked);
}

function checklistRows(items, editable, type, documentDrafts) {
  if (!items.length) return '<p class="muted">No requirements have been recorded.</p>';
  const list = (rows) => `<ul class="checklist-rows" role="list">${rows.map((item) =>
    checklistRow(item, editable, documentDrafts.get(item.id))).join('')}</ul>`;
  if (type !== 'bac') return list(items);
  const grouped = new Map(Object.keys(bacGroupLabels).map((group) => [group, []]));
  for (const item of items) {
    const rows = grouped.get(item.checklist_group) ?? grouped.get('others');
    rows.push(item);
  }
  const groups = Object.entries(bacGroupLabels).map(([group, title]) => {
    const rows = grouped.get(group);
    if (!rows.length) return '';
    return `<section class="checklist-group" data-group="${group}" aria-labelledby="checklist-${group}">
      <h3 id="checklist-${group}">${title}</h3>${list(rows)}
    </section>`;
  });
  return `<div class="checklist-groups">${groups.join('')}</div>`;
}

function checklistPanel(items, editable, type, documentDrafts) {
  const rows = checklistRows(items, editable, type, documentDrafts);
  const contents = editable
    ? `<form id="checklist-form">
      ${rows}
      <div class="grid form-actions">
        ${field('Add a transaction-specific requirement', 'new_label', '', 'maxlength="240"')}
        ${field('Action date', 'actual_on', today(), 'required', 'date')}
      </div>
      <div class="notice error form-actions" role="alert" tabindex="-1" hidden></div>
      <div class="actions form-actions"><button class="primary" type="submit">Save checklist</button></div>
    </form>
    <dialog id="document-dialog" aria-labelledby="document-dialog-title"></dialog>` : rows;
  return `<section class="panel" aria-labelledby="checklist-title">
    <h2 id="checklist-title">Requirement checklist</h2>${contents}</section>`;
}

function openDocumentDetails(modal, item, draft, trigger, confirm) {
  modal.innerHTML = `<h2 id="document-dialog-title">${escape(item.label)}</h2>
    <form class="stack">
      ${item.field_definitions.length ? `<div class="grid">${documentFields({ ...item, ...draft })}</div>` : ''}
      ${remarks('Remarks (optional)', 'remarks', draft.remarks)}
      <div class="actions"><button type="submit" class="primary">OK</button>
        <button type="button" data-cancel-document>Cancel</button></div>
    </form>`;
  const form = modal.querySelector('form');
  const initial = new FormData(form);
  form.querySelectorAll('[data-peso-amount]').forEach((input) => {
    input.addEventListener('input', () => {
      const value = input.value.trim();
      input.setCustomValidity(value && parsePesoAmount(value).error
        ? 'Enter a peso amount with at most 13 whole digits and two decimal places.' : '');
    });
  });
  form.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.isComposing && !event.shiftKey &&
        (event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement)) {
      event.preventDefault();
      form.requestSubmit();
    }
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const values = new FormData(form);
    if ([...values].some(([key, value]) => value !== initial.get(key))) confirm({
      remarks: values.get('remarks'),
      document_fields: Object.fromEntries(item.field_definitions.map(({ key, kind }) => {
        const value = values.get(key);
        return [key, value === '' ? null : kind === 'boolean' ? value === 'true' : value];
      })),
    });
    modal.close();
  });
  modal.querySelector('[data-cancel-document]').addEventListener('click', () => modal.close());
  trigger.focus();
  modal.showModal();
}

function copyField(label, value) {
  return `<div class="copy-field">${field(label, 'copy_value', value, 'readonly')}
    <button type="button" data-copy aria-label="Copy ${escape(label)}">Copy</button></div>`;
}

function changeDetails(changes, kind) {
  if (!changes) return '';
  const stateLabel = (item) => checklistStateLabels[item.state] ?? item.state;
  const lines = Array.isArray(changes)
    ? changes.map(({ before, after }) => before
      ? [
        `${after.label}. State: ${stateLabel(before)} → ${stateLabel(after)}. Remarks: ${before.remarks || '—'} → ${after.remarks || '—'}.`,
        ...Object.keys({ ...before.document_fields, ...after.document_fields })
          .filter((key) => before.document_fields?.[key] !== after.document_fields?.[key])
          .map((key) => `${key.replaceAll('_', ' ')}: ${documentFieldValue(before.document_fields?.[key])} → ${documentFieldValue(after.document_fields?.[key])}.`),
      ].join(' ')
      : `Added requirement ${after.label} (${stateLabel(after)}).`)
    : Object.entries(changes).map(([field, { before, after }]) => {
      const label = field === 'reference' && kind === 'project_correction' ? 'Project reference' : fieldLabels[field] ?? field;
      return `${label}: ${before ?? '—'} → ${after ?? '—'}`;
    });
  return `<details><summary>View changes</summary><ul class="changes">${lines.map((line) => `<li>${escape(line)}</li>`).join('')}</ul></details>`;
}

function historyPanel(history, transactionId, audit = true) {
  return `<section class="panel"><h2>${audit ? 'Audit history' : 'Movement history'}</h2>
    ${history.length ? `<ol class="history">${history.map((event) => {
      const details = event.details ?? {};
      const status = event.new_status
        ? event.previous_status && event.previous_status !== event.new_status
          ? `${event.previous_status} → ${event.new_status}` : event.new_status
        : '';
      return `<li><div class="history-entry">
        <strong>${escape(actionLabels[event.kind])}</strong>
        <div class="history-context"><span>${escape(event.actor_name)}</span>
          <span>Action date ${escape(event.actual_on)}</span>
          <span>Recorded ${escape(manilaTime.format(new Date(event.recorded_at)))} PHT</span>
          ${status ? `<span>${escape(status)}</span>` : ''}</div>
        </div>
        ${details.remarks ? `<p>${escape(details.remarks)}</p>` : ''}
        ${details.justification ? `<p><strong>Justification</strong> ${escape(details.justification)}</p>` : ''}
        ${details.figures ? copyField('Certified amount in figures', details.figures) + copyField('Certified amount in words', details.words) : ''}
        ${event.has_slip ? `<p><a href="/api/transactions/${transactionId}/slips/${event.id}" target="_blank" rel="noopener">Open printable suspension slip</a></p>` : ''}
        ${changeDetails(details.changes, event.kind)}</li>`;
    }).join('')}</ol>` : '<p class="muted">No history recorded.</p>'}
  </section>`;
}

function transactionActions(record) {
  if (record.voided) return '';
  const actions = [];
  if (record.status === 'Suspended') actions.push(['resubmit', 'Record resubmission']);
  if (isAuditRole()) {
    if (record.status === 'Pending') actions.push(['start', 'Start Audit']);
    if (record.status === 'Under Audit') actions.push(['suspend', 'Suspend'], ['certify', 'Mark Audited']);
    if (record.status === 'Resubmitted') actions.push(['resume', 'Resume Audit']);
    actions.push(['void', 'Void duplicate']);
  }
  return actions.map(([value, label]) => `<button class="${value === 'void' ? 'danger' : 'primary'}" data-action="${value}" type="button">${label}</button>`).join('');
}

function refreshTransaction(record, draftForm, documentDrafts) {
  const draft = draftForm ? new FormData(draftForm) : null;
  displayTransaction(record, documentDrafts);
  if (!draft) return;
  const form = document.getElementById(draftForm.id);
  for (const control of form.elements) {
    if (control.type === 'checkbox') control.checked = draft.has(control.name);
    else if (draft.has(control.name)) control.value = draft.get(control.name);
  }
  form.querySelectorAll('.checklist-row').forEach(syncChecklistRow);
  form.dispatchEvent(new Event('input', { bubbles: true }));
}

function displayTransaction(record, documentDrafts = new Map()) {
  const audit = isAuditRole();
  const editable = audit && !record.voided;
  const link = `#transaction/${record.id}`;
  let checklistDirty = false;
  const summary = `<section class="panel"><h2>Transaction summary</h2><dl class="definition-grid">
      <div><dt>Project</dt><dd><a href="#project/${record.project_id}">${escape(projectLabel(record.project, record.project_reference))}</a></dd></div>
      ${record.obligation_request_reference ? `<div><dt>Obligation request reference</dt><dd>${escape(record.obligation_request_reference)}</dd></div>` : ''}
      <div><dt>Assigned auditor</dt><dd>${escape(record.assigned_auditor)}</dd></div>
      <div><dt>Status</dt><dd>${badge(record.status, record.voided)}</dd></div>
      <div><dt>Received or created</dt><dd>${escape(record.received_on)}</dd></div>
      <div><dt>Latest action date</dt><dd>${escape(record.latest_action_on)}</dd></div>
    </dl>${audit && record.voided && record.notes ? `<p class="form-actions">${escape(record.notes)}</p>` : ''}</section>`;
  const checklist = audit ? checklistPanel(record.checklist, editable, record.type, documentDrafts) : '';
  mount(`<a class="back" href="#project/${record.project_id}">Back to project</a>${heading(record.reference, transactionActions(record), lookups.types[record.type])}
    ${summary}${checklist}
    ${editable ? `<section class="panel"><h2>Transaction details</h2><form id="transaction-details" class="stack">
      <div class="grid">
        ${field('Reference or title', 'reference', record.reference, 'required maxlength="200"')}
        ${field('Obligation request reference (optional)', 'obligation_request_reference', record.obligation_request_reference, 'maxlength="200"')}
        ${field('Received or created date', 'received_on', record.received_on, 'required', 'date')}
        ${field('Action date', 'actual_on', today(), 'required', 'date')}
      </div>${remarks('Notes', 'notes', record.notes, 2500)}
      <div class="notice error" role="alert" tabindex="-1" hidden></div>
      <div class="actions"><button class="primary" type="submit">Save transaction details</button></div></form></section>` : ''}
    ${historyPanel(record.history, record.id, audit)}`);
  if (editable) {
    const checklistForm = screen.querySelector('#checklist-form');
    const detailsForm = screen.querySelector('#transaction-details');
    const checklistError = checklistForm.querySelector('.notice');
    const documentDialog = screen.querySelector('#document-dialog');
    const actionButtons = screen.querySelectorAll('[data-action]');
    let detailsDirty = false;
    checklistForm.addEventListener('input', (event) => {
      checklistDirty = true;
      const row = event.target.closest('.checklist-row');
      if (row) syncChecklistRow(row);
    });
    detailsForm.addEventListener('input', () => { detailsDirty = true; });
    checklistForm.addEventListener('click', (event) => {
      const trigger = event.target.closest('[data-document]');
      if (!trigger) return;
      const item = record.checklist.find(({ id }) => id === Number(trigger.dataset.document));
      openDocumentDetails(documentDialog, item, documentDrafts.get(item.id) ?? item, trigger, (draft) => {
        documentDrafts.set(item.id, draft);
        checklistDirty = true;
        trigger.closest('.checklist-row').querySelector('.document-badges').innerHTML = documentBadges(item, draft);
      });
    });

    async function saveTransactionForm(path, body) {
      checklistForm.inert = detailsForm.inert = true;
      actionButtons.forEach((button) => { button.disabled = true; });
      try {
        return await api(path, 'PATCH', { ...body, revision: record.revision });
      } finally {
        checklistForm.inert = detailsForm.inert = false;
        actionButtons.forEach((button) => { button.disabled = false; });
      }
    }

    submit(checklistForm, async (body) => {
      showNotice('');
      const items = record.checklist.map((item) => ({
        id: item.id,
        state: checklistState(body[`not_applicable_${item.id}`], body[`complied_${item.id}`]),
        remarks: item.remarks,
        ...documentDrafts.get(item.id),
      }));
      const updated = await saveTransactionForm(`/transactions/${record.id}/checklist`,
        { items, new_label: body.new_label, actual_on: body.actual_on });
      if (!checklistForm.isConnected) return;
      refreshTransaction(updated, detailsDirty ? detailsForm : null);
      showNotice('Checklist saved.');
    }, { localError: checklistError, conflict: link });
    submit(detailsForm, async (body) => {
      showNotice('');
      const updated = await saveTransactionForm(`/transactions/${record.id}`, body);
      if (!detailsForm.isConnected) return;
      refreshTransaction(updated, checklistDirty ? checklistForm : null, documentDrafts);
      showNotice('Transaction details saved.');
    }, { localError: detailsForm.querySelector('.notice'), conflict: link });
    actionButtons.forEach((button) => button.addEventListener('click', () => {
      if (checklistDirty || detailsDirty) {
        showNotice('Save your checklist and detail edits before recording an action.', true);
      } else {
        openAction(record, button.dataset.action, button.textContent);
      }
    }));
  } else {
    screen.querySelectorAll('[data-action]').forEach((button) => button.addEventListener('click', () =>
      openAction(record, button.dataset.action, button.textContent)));
  }
}

function openAction(record, action, label) {
  const unchecked = record.checklist?.filter((item) => item.state === 'Unchecked') ?? [];
  const suspend = action === 'suspend';
  const certify = action === 'certify';
  if (suspend && !unchecked.length) {
    showNotice('There are no unchecked applicable requirements to include on a suspension slip.', true);
    return;
  }
  dialog.innerHTML = `<h2 id="dialog-title">${escape(label)}</h2>
    <form class="stack">
      <div class="notice error" role="alert" tabindex="-1" hidden></div>
      ${field('Actual action date', 'actual_on', today(), 'required', 'date')}
      ${suspend ? `<h3>Unchecked applicable requirements</h3>
        <ol class="slip-items">${unchecked.map((item) => `<li><strong>${escape(item.label)}</strong>
        ${remarks('Reason or remarks', `item_${item.id}`, item.remarks)}</li>`).join('')}</ol>` : ''}
      ${certify && unchecked.length ? `<p class="warning">${unchecked.length} applicable ${unchecked.length === 1 ? 'requirement is' : 'requirements are'} unchecked. Enter a justification to certify.</p>
        <label>Justification<textarea name="justification" required maxlength="2500"></textarea></label>` : ''}
      ${certify && record.type !== 'bac' ? `<div class="stack">
        ${field('Certified amount (₱, optional)', 'certified_amount', '', 'inputmode="decimal" maxlength="23"')}
        <div class="actions"><button type="button" id="preview-amount">Show figures and words</button></div>
        <div id="amount-preview" aria-live="polite"></div></div>` : ''}
      ${action === 'void'
        ? '<label>Reason for voiding duplicate<textarea name="remarks" required maxlength="1000"></textarea></label>'
        : isAuditRole() ? remarks('Action remarks (optional)', 'remarks') : ''}
      <div class="actions"><button class="${action === 'void' ? 'danger' : 'primary'}" type="submit">${escape(label)}</button>
        <button id="cancel-action" type="button">Cancel</button></div>
    </form>`;
  const form = dialog.querySelector('form');
  const localError = dialog.querySelector('.notice');
  dialog.querySelector('#cancel-action').addEventListener('click', () => dialog.close());
  const amountPreview = dialog.querySelector('#amount-preview');
  const amountInput = form.elements.certified_amount;
  amountInput?.addEventListener('input', () => { amountPreview.textContent = ''; });
  dialog.querySelector('#preview-amount')?.addEventListener('click', async () => {
    const enteredAmount = amountInput.value;
    localError.hidden = true;
    try {
      const preview = await api('/amount-in-words', 'POST', { amount: enteredAmount });
      if (dialog.open && amountInput.value === enteredAmount) {
        amountPreview.innerHTML = preview.figures
          ? copyField('Amount in figures', preview.figures) + copyField('Amount in words', preview.words)
          : '<p>Enter an amount to preview.</p>';
      }
    } catch (error) {
      localError.textContent = error.message;
      localError.hidden = false;
    }
  });
  submit(form, async (body) => {
    const request = {
      revision: record.revision, actual_on: body.actual_on, remarks: body.remarks,
      certified_amount: body.certified_amount, justification: body.justification,
    };
    if (suspend) request.item_remarks = Object.fromEntries(unchecked.map(({ id }) => [id, body[`item_${id}`]]));
    const result = await api(`/transactions/${record.id}/actions/${action}`, 'POST', request);
    dialog.close();
    displayTransaction(result.record);
    showNotice(`${actionLabels[action]}.`);
    if (suspend) {
      const link = document.createElement('a');
      link.href = `/api/transactions/${record.id}/slips/${result.event_id}`;
      link.target = '_blank';
      link.rel = 'noopener';
      link.textContent = 'Open printable suspension slip';
      notice.append(link);
      link.focus();
    }
  }, { localError, conflict: `#transaction/${record.id}` });
  dialog.showModal();
}

async function displayRoute() {
  const version = ++navigationVersion;
  if (!user) {
    displayLogin();
    return;
  }
  const [page, id] = route().split('/');
  updateHeader(page === 'projects');
  if (user.role === 'system-admin') {
    mount(`${heading('System administration')}<section class="panel"><p>Manage user accounts and database recovery using the local administrator commands.</p></section>`);
    return;
  }
  try {
    if (page === 'projects') {
      const projects = await api('/projects');
      if (version === navigationVersion) displayProjects(projects);
      return;
    }
    const referenceData = await api('/lookups');
    if (version !== navigationVersion) return;
    lookups = referenceData;
    if (page === 'new-project') displayNewProject();
    else if (page === 'new-transaction') displayNewTransaction(id);
    else if (page === 'project' || page === 'transaction') {
      const record = await api(`/${page}s/${encodeURIComponent(id ?? '')}`);
      if (version === navigationVersion) {
        if (page === 'project') displayProject(record);
        else displayTransaction(record);
      }
    } else {
      location.hash = 'projects';
    }
  } catch (error) {
    if (version !== navigationVersion) return;
    if (error.status === 401) {
      user = null;
      displayLogin();
    }
    showNotice(error.message, true);
  }
}

document.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-copy]');
  if (!button) return;
  const input = button.closest('.copy-field').querySelector('input');
  input.select();
  try {
    if (navigator.clipboard) await navigator.clipboard.writeText(input.value);
    else if (!document.execCommand('copy')) throw new Error();
    button.textContent = 'Copied';
  } catch {
    button.textContent = 'Press Ctrl+C';
    input.focus();
    input.select();
  }
});
document.querySelector('.skip').addEventListener('click', (event) => {
  event.preventDefault();
  document.querySelector('#main').focus();
});
window.addEventListener('hashchange', () => {
  if (dialog.open) dialog.close();
  showNotice('');
  void displayRoute();
});

try {
  user = await api('/session');
  await displayRoute();
} catch (error) {
  displayLogin();
  if (error.status !== 401) showNotice(error.message, true);
}
