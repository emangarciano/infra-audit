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
  register: 'Registered', checklist: 'Checklist updated', correct: 'Transaction corrected',
  project_correction: 'Project corrected', suspend: 'Suspended', resubmit: 'Resubmitted',
  resume: 'Audit resumed', certify: 'Marked Audited', void: 'Duplicate voided',
};
const fieldLabels = {
  title: 'Project title or reference', contractor: 'Contractor', contract_amount: 'Contract amount',
  contract_date: 'Contract date', contract_duration: 'Contract duration',
  reference: 'Reference or title', received_on: 'Received or created date', notes: 'Transaction notes',
};
const filters = {};
let user;
let lookups;
let navigationVersion = 0;

const today = () => manilaDate.format(new Date());
const isAuditRole = () => ['auditor', 'supervisor'].includes(user?.role);
const route = () => location.hash.slice(1) || 'queue';
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

function updateHeader(active = '') {
  navigation.innerHTML = user && user.role !== 'system-admin' ? [
    ['queue', 'Transactions'], ['projects', 'Projects'],
  ].map(([key, title]) =>
    `<a href="#${key}"${active === key ? ' aria-current="page"' : ''}>${title}</a>`,
  ).join('') : '';
  account.innerHTML = user
    ? `<span>${escape(user.displayName)} · ${roleNames[user.role]}</span><button id="sign-out" type="button">Sign out</button>`
    : '';
  account.querySelector('button')?.addEventListener('click', async () => {
    try {
      await api('/session', 'DELETE', {});
      navigationVersion++;
      user = null;
      lookups = null;
      Object.keys(filters).forEach((key) => delete filters[key]);
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

function displayQueue(rows) {
  const projectOptions = lookups.projects.map(({ id, title }) => [id, title]);
  const auditorOptions = lookups.auditors.map(({ id, display_name }) => [id, display_name]);
  mount(`${heading('Transaction queue', '<a class="button primary" href="#new-transaction">New transaction</a>')}
    <form id="filters" class="panel">
      <div class="grid filter-grid">
        ${field('Search', 'q', filters.q, 'placeholder="Project or transaction reference" maxlength="200"', 'search')}
        ${select('Status', 'status', [['', 'All statuses'], ...lookups.statuses.map((value) => [value, value])], filters.status)}
        ${select('Type', 'type', [['', 'All types'], ...Object.entries(lookups.types)], filters.type)}
        ${select('Project', 'project_id', [['', 'All projects'], ...projectOptions], filters.project_id)}
        ${select('Assigned auditor', 'assigned_auditor_id', [['', 'All auditors'], ...auditorOptions], filters.assigned_auditor_id)}
      </div>
      <div class="actions form-actions"><button type="submit" class="primary">Search</button>
      <button type="button" id="clear-filters">Clear filters</button></div>
    </form>
    <section class="panel table-panel" aria-label="Transaction results">
      ${rows.length ? `<table><thead><tr>
        <th scope="col">Reference</th><th scope="col">Project</th><th scope="col">Type</th>
        <th scope="col">Assigned auditor</th><th scope="col">Status</th><th scope="col">Latest action date</th>
      </tr></thead><tbody>${rows.map((row) => `<tr>
        <td><a href="#transaction/${row.id}">${escape(row.reference)}</a></td><td>${escape(row.project)}</td>
        <td>${escape(lookups.types[row.type])}</td><td>${escape(row.assigned_auditor)}</td>
        <td>${badge(row.status, row.voided)}</td><td>${escape(row.latest_action_on)}</td>
      </tr>`).join('')}</tbody></table>` : '<p class="empty">No matching transactions.</p>'}
    </section>`);
  submit(screen.querySelector('#filters'), async (body) => {
    Object.assign(filters, body);
    await displayRoute();
  });
  screen.querySelector('#clear-filters').addEventListener('click', () => {
    Object.keys(filters).forEach((key) => delete filters[key]);
    void displayRoute();
  });
}

function displayProjects() {
  mount(`${heading('Projects', '<a class="button primary" href="#new-project">New project</a>')}
    <section class="panel table-panel" aria-label="Projects">
      ${lookups.projects.length ? `<table><thead><tr><th scope="col">Project title or reference</th></tr></thead><tbody>
      ${lookups.projects.map((project) => `<tr><td><a href="#project/${project.id}">${escape(project.title)}</a></td></tr>`).join('')}
      </tbody></table>` : '<p class="empty">No projects registered.</p>'}
    </section>`);
}

function projectFields(record = {}) {
  return `${field('Project title or reference', 'title', record.title, 'required maxlength="200"')}
    ${isAuditRole() ? `${field('Contractor', 'contractor', record.contractor, 'maxlength="200"')}
    ${field('Contract amount (₱)', 'contract_amount', record.contract_amount, 'inputmode="decimal" maxlength="23"')}
    ${field('Contract date', 'contract_date', record.contract_date, '', 'date')}
    ${field('Contract duration', 'contract_duration', record.contract_duration, 'maxlength="100"')}` : ''}`;
}

function displayNewProject() {
  mount(`<a class="back" href="#projects">Projects</a>${heading('New project')}
    <form class="panel"><div class="grid">${projectFields()}</div>
    <div class="actions form-actions"><button class="primary" type="submit">Create project</button></div></form>`);
  submit(screen.querySelector('form'), async (body) => {
    const record = await saveNew('/projects', body);
    if (record) location.hash = `project/${record.id}`;
  });
}

function displayNewTransaction(selectedProject) {
  const assigned = lookups.auditors.filter(({ assignable }) => assignable).map(({ id, display_name }) => [id, display_name]);
  const projectOptions = lookups.projects.map(({ id, title }) => [id, title]);
  const canRegister = projectOptions.length && (user.role !== 'intake' || assigned.length);
  const precondition = projectOptions.length
    ? '<p>An active auditor account is required for assignment.</p>'
    : '<p><a href="#new-project">Create a project</a> to register its first transaction.</p>';
  mount(`<a class="back" href="#queue">Transaction queue</a>${heading('New transaction', '', 'New transactions start Under Audit.')}
    ${canRegister ? `<form class="panel stack"><div class="grid">
      ${select('Project', 'project_id', [['', 'Select a project'], ...projectOptions], selectedProject, 'required')}
      ${select('Type', 'type', [['', 'Select a type'], ...Object.entries(lookups.types)], '', 'required')}
      ${field('Reference or title', 'reference', '', 'required maxlength="200"')}
      ${field('Received or created date', 'received_on', today(), 'required', 'date')}
      ${user.role === 'intake'
        ? select('Assigned auditor', 'assigned_auditor_id', [['', 'Select an auditor'], ...assigned], '', 'required')
        : field('Assigned auditor', 'assigned_display', user.displayName, 'readonly')}
    </div>${isAuditRole() ? remarks('Notes', 'notes', '', 2500) : ''}
    <div class="actions"><button class="primary" type="submit">Register transaction</button></div></form>`
      : `<section class="panel">${precondition}</section>`}`);
  const form = screen.querySelector('form');
  if (form) submit(form, async (body) => {
    const record = await saveNew('/transactions', body);
    if (record) location.hash = `transaction/${record.id}`;
  });
}

function displayProject(record) {
  mount(`<a class="back" href="#projects">Projects</a>${heading(record.title,
    `<a class="button primary" href="#new-transaction/${record.id}">New transaction</a>
    <button id="project-transactions" type="button">View transactions</button>`)}
    ${isAuditRole() ? `<form id="project-form" class="panel"><h2>Project details</h2>
      <div class="grid">${projectFields(record)}${field('Action date', 'actual_on', today(), 'required', 'date')}</div>
      <div class="actions form-actions"><button class="primary" type="submit">Save project details</button></div></form>`
      + historyPanel(record.history) : ''}`);
  screen.querySelector('#project-transactions').addEventListener('click', () => {
    Object.keys(filters).forEach((key) => delete filters[key]);
    filters.project_id = String(record.id);
    location.hash = 'queue';
  });
  const form = screen.querySelector('#project-form');
  if (form) submit(form, async (body) => {
    const updated = await api(`/projects/${record.id}`, 'PATCH', { ...body, revision: record.revision });
    displayProject(updated);
    showNotice('Project details saved.');
  }, { conflict: `#project/${record.id}` });
}

function checklistStateLabel(state, type) {
  const bacLabels = { Unchecked: 'Not complied', Checked: 'Complied' };
  return type === 'bac' && Object.hasOwn(bacLabels, state) ? bacLabels[state] : state;
}

function checklistRow(item, editable, states) {
  const name = escape(item.label);
  return `<tr data-checklist-id="${item.id}"><td>${name}${item.custom ? ' <span class="muted">(custom)</span>' : ''}</td>
    <td>${editable
      ? `<select name="state_${item.id}" aria-label="State for ${name}">${options(states, item.state)}</select>`
      : escape(states.find(([value]) => value === item.state)?.[1] ?? item.state)}</td>
    <td>${editable
      ? `<input name="remarks_${item.id}" value="${escape(item.remarks)}" maxlength="1000" aria-label="Remarks for ${name}">`
      : escape(item.remarks || '—')}</td></tr>`;
}

function checklistPanel(items, editable, type) {
  const states = ['Unchecked', 'Checked', 'N/A'].map((state) => [state, checklistStateLabel(state, type)]);
  return `<section class="panel"><h2>Requirement checklist</h2>
    <form id="checklist-form">
    ${items.length ? `<div class="table-panel"><table class="checklist">
    <thead><tr><th scope="col">Requirement</th><th scope="col">State</th><th scope="col">Reason or remarks</th></tr></thead>
    <tbody>${items.map((item) => checklistRow(item, editable, states)).join('')}</tbody></table></div>`
      : '<p class="muted">No requirements have been recorded.</p>'}
    ${editable ? `<div class="grid form-actions">
      ${field('Add a transaction-specific requirement', 'new_label', '', 'maxlength="240"')}
      ${field('Action date', 'actual_on', today(), 'required', 'date')}
    </div><div class="actions form-actions"><button class="primary" type="submit">Save checklist</button></div>` : ''}
    </form></section>`;
}

function copyField(label, value) {
  return `<div class="copy-field">${field(label, 'copy_value', value, 'readonly')}
    <button type="button" data-copy aria-label="Copy ${escape(label)}">Copy</button></div>`;
}

function changeDetails(changes, type) {
  if (!changes) return '';
  const stateLabel = (item) => checklistStateLabel(item.state, type);
  const lines = Array.isArray(changes)
    ? changes.map(({ before, after }) => before
      ? `${after.label}. State: ${stateLabel(before)} → ${stateLabel(after)}. Remarks: ${before.remarks || '—'} → ${after.remarks || '—'}.`
      : `Added requirement ${after.label} (${stateLabel(after)}).`)
    : Object.entries(changes).map(([field, { before, after }]) =>
      `${fieldLabels[field] ?? field}: ${before ?? '—'} → ${after ?? '—'}`);
  return `<details><summary>View changes</summary><ul class="changes">${lines.map((line) => `<li>${escape(line)}</li>`).join('')}</ul></details>`;
}

function historyPanel(history, transactionId, audit = true, type) {
  return `<section class="panel"><h2>${audit ? 'Audit history' : 'Movement history'}</h2>
    ${history.length ? `<ol class="history">${history.map((event) => {
      const details = event.details ?? {};
      const status = event.new_status
        ? event.previous_status && event.previous_status !== event.new_status
          ? `${event.previous_status} → ${event.new_status}` : event.new_status
        : '';
      return `<li><strong>${escape(actionLabels[event.kind])}</strong>
        <div class="history-context"><span>${escape(event.actor_name)}</span>
        <span>Action date ${escape(event.actual_on)}</span>
        <span>Recorded ${escape(manilaTime.format(new Date(event.recorded_at)))} PHT</span>
        ${status ? `<span>${escape(status)}</span>` : ''}</div>
        ${details.remarks ? `<p>${escape(details.remarks)}</p>` : ''}
        ${details.justification ? `<p><strong>Justification</strong> ${escape(details.justification)}</p>` : ''}
        ${details.figures ? copyField('Certified amount in figures', details.figures) + copyField('Certified amount in words', details.words) : ''}
        ${event.has_slip ? `<p><a href="/api/transactions/${transactionId}/slips/${event.id}" target="_blank" rel="noopener">Open printable suspension slip</a></p>` : ''}
        ${changeDetails(details.changes, type)}</li>`;
    }).join('')}</ol>` : '<p class="muted">No history recorded.</p>'}
  </section>`;
}

function transactionActions(record) {
  if (record.voided) return '';
  const actions = [];
  if (record.status === 'Suspended') actions.push(['resubmit', 'Record resubmission']);
  if (isAuditRole()) {
    if (record.status === 'Under Audit') actions.push(['suspend', 'Suspend'], ['certify', 'Mark Audited']);
    if (record.status === 'Resubmitted') actions.push(['resume', 'Resume Audit']);
    actions.push(['void', 'Void duplicate']);
  }
  return actions.map(([value, label]) => `<button class="${value === 'void' ? 'danger' : 'primary'}" data-action="${value}" type="button">${label}</button>`).join('');
}

function refreshTransaction(record, draftForm) {
  const draft = draftForm ? new FormData(draftForm) : null;
  displayTransaction(record);
  if (!draft) return;
  const form = document.getElementById(draftForm.id);
  for (const [name, value] of draft) {
    const control = form.elements.namedItem(name);
    if (control) control.value = value;
  }
  form.dispatchEvent(new Event('input', { bubbles: true }));
}

function displayTransaction(record) {
  const audit = isAuditRole();
  const editable = audit && !record.voided;
  const link = `#transaction/${record.id}`;
  let checklistDirty = false;
  mount(`<a class="back" href="#queue">Transaction queue</a>${heading(record.reference, transactionActions(record), lookups.types[record.type])}
    <section class="panel"><h2>Transaction summary</h2><dl class="definition-grid">
      <div><dt>Project</dt><dd><a href="#project/${record.project_id}">${escape(record.project)}</a></dd></div>
      <div><dt>Assigned auditor</dt><dd>${escape(record.assigned_auditor)}</dd></div>
      <div><dt>Status</dt><dd>${badge(record.status, record.voided)}</dd></div>
      <div><dt>Received or created</dt><dd>${escape(record.received_on)}</dd></div>
      <div><dt>Latest action date</dt><dd>${escape(record.latest_action_on)}</dd></div>
    </dl>${audit && record.voided && record.notes ? `<p class="form-actions">${escape(record.notes)}</p>` : ''}</section>
    ${audit ? checklistPanel(record.checklist, editable, record.type) : ''}
    ${editable ? `<section class="panel"><h2>Transaction details</h2><form id="transaction-details" class="stack">
      <div class="grid">
        ${field('Reference or title', 'reference', record.reference, 'required maxlength="200"')}
        ${field('Received or created date', 'received_on', record.received_on, 'required', 'date')}
        ${field('Action date', 'actual_on', today(), 'required', 'date')}
      </div>${remarks('Notes', 'notes', record.notes, 2500)}
      <div class="actions"><button class="primary" type="submit">Save transaction details</button></div></form></section>` : ''}
    ${historyPanel(record.history, record.id, audit, record.type)}`);
  if (editable) {
    const checklistForm = screen.querySelector('#checklist-form');
    const detailsForm = screen.querySelector('#transaction-details');
    let detailsDirty = false;
    checklistForm.addEventListener('input', () => { checklistDirty = true; });
    detailsForm.addEventListener('input', () => { detailsDirty = true; });
    submit(checklistForm, async (body) => {
      const items = record.checklist.map(({ id }) => ({ id, state: body[`state_${id}`], remarks: body[`remarks_${id}`] }));
      const updated = await api(`/transactions/${record.id}/checklist`, 'PATCH',
        { revision: record.revision, items, new_label: body.new_label, actual_on: body.actual_on });
      refreshTransaction(updated, detailsDirty ? detailsForm : null);
      showNotice('Checklist saved.');
    }, { conflict: link });
    submit(detailsForm, async (body) => {
      const updated = await api(`/transactions/${record.id}`, 'PATCH', { ...body, revision: record.revision });
      refreshTransaction(updated, checklistDirty ? checklistForm : null);
      showNotice('Transaction details saved.');
    }, { conflict: link });
    screen.querySelectorAll('[data-action]').forEach((button) => button.addEventListener('click', () => {
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
        ${field('Reason or remarks', `item_${item.id}`, item.remarks, 'maxlength="1000"')}</li>`).join('')}</ol>` : ''}
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
  updateHeader(['projects', 'project', 'new-project'].includes(page) ? 'projects' : 'queue');
  if (user.role === 'system-admin') {
    mount(`${heading('System administration')}<section class="panel"><p>Manage user accounts and database recovery using the local administrator commands.</p></section>`);
    return;
  }
  try {
    const referenceData = await api('/lookups');
    if (version !== navigationVersion) return;
    lookups = referenceData;
    if (page === 'queue') {
      const rows = await api(`/transactions?${new URLSearchParams(filters)}`);
      if (version === navigationVersion) displayQueue(rows);
    } else if (page === 'projects') displayProjects();
    else if (page === 'new-project') displayNewProject();
    else if (page === 'new-transaction') displayNewTransaction(id);
    else if (page === 'project' || page === 'transaction') {
      const record = await api(`/${page}s/${encodeURIComponent(id ?? '')}`);
      if (version === navigationVersion) {
        if (page === 'project') displayProject(record);
        else displayTransaction(record);
      }
    } else {
      location.hash = 'queue';
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
