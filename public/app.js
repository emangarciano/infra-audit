import { parsePesoAmount } from './peso-amount.js';
import { complianceDescription, complianceReasons } from './checklist-compliance.js';
import { applyChecklistEdits, checklistDraftStore, checklistItemEdit, checklistSaveItems } from './checklist-draft.js';

const screen = document.querySelector('#screen');
const toast = document.querySelector('#toast');
const notice = document.querySelector('#notice');
const toastStatus = document.querySelector('#toast-status');
const navigation = document.querySelector('#navigation');
const account = document.querySelector('#account');
const dialog = document.querySelector('#action-dialog');
const manilaDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Manila' });
const manilaTime = new Intl.DateTimeFormat('en-PH', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila',
});
const pesoCurrency = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' });
const pesoAmountAttributes = 'inputmode="decimal" maxlength="23" data-peso-amount';
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
let noticeTimer;
let checklistNameObserver;
let checklistAutosaveTimer;
const checklistAutosaveInterval = 60 * 1000;

const today = () => manilaDate.format(new Date());
const isAuditRole = () => ['auditor', 'supervisor'].includes(user?.role);
const route = () => location.hash.slice(1) || 'projects';
const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]);

function showNotice(message, isError = false, latestLink) {
  clearTimeout(noticeTimer);
  toast.hidden = !message;
  toast.classList.toggle('error', isError);
  notice.textContent = message;
  toastStatus.textContent = message;
  if (message) noticeTimer = setTimeout(() => showNotice(''), 10_000);
  if (latestLink) {
    const review = document.createElement('a');
    review.href = latestLink;
    review.target = '_blank';
    review.rel = 'noopener';
    review.textContent = 'Open latest record in a new tab';
    notice.append(review);
  }
}

document.querySelector('#close-toast').addEventListener('click', () => showNotice(''));

async function api(path, method = 'GET', body, signal) {
  let response;
  try {
    response = await fetch(`/api${path}`, {
      method, signal,
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

function bindPesoAmounts(form) {
  for (const input of form.querySelectorAll('[data-peso-amount]')) {
    const format = () => {
      const { value } = parsePesoAmount(input.value.trim());
      if (value === undefined) return;
      const [whole, centavos] = value.split('.');
      input.value = `${BigInt(whole).toLocaleString('en-PH')}.${centavos}`;
    };
    format();
    input.addEventListener('focus', () => {
      const value = input.value.trim();
      if (value.includes(',') && !parsePesoAmount(value).error) {
        input.value = value.replaceAll(',', '');
      }
    });
    input.addEventListener('input', () => {
      const value = input.value.trim();
      input.setCustomValidity(value && parsePesoAmount(value).error
        ? 'Enter a peso amount with at most 13 whole digits and two decimal places.' : '');
    });
    input.addEventListener('blur', format);
    form.addEventListener('submit', format);
  }
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

function backLink(path, name) {
  return `<a class="back" href="#${escape(path)}" aria-label="Back to ${escape(name)}"><span aria-hidden="true">←</span> Back</a>`;
}

function badge(status, voided = false) {
  const className = escape(status.toLowerCase().replaceAll(' ', '-'));
  return `<span class="badge ${className}">${escape(status)}</span>${voided ? ' <span class="badge voided">Voided</span>' : ''}`;
}

function mount(markup, focus = true) {
  clearInterval(checklistAutosaveTimer);
  checklistNameObserver?.disconnect();
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
  bindPesoAmounts(form);
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

function projectTransactions(projectId, rows) {
  const active = rows.filter(({ voided }) => !voided);
  const voided = rows.filter((row) => row.voided);
  return `<section class="panel stack" aria-labelledby="project-transactions">
    <h2 id="project-transactions">Transactions</h2>
    <div class="actions"><a class="button primary" href="#new-transaction/${projectId}">New transaction</a></div>
    ${active.length ? transactionTable(active, 'Active transactions')
      : `<p class="empty">${voided.length ? 'No active transactions for this project.' : 'No transactions for this project.'}</p>`}
    ${voided.length ? `<details><summary>Voided transactions (${voided.length})</summary>
      ${transactionTable(voided, 'Voided transactions')}</details>` : ''}
    </section>`;
}

function projectLabel(name, reference) {
  return reference ? `${name} (${reference})` : name;
}

function projectBrowser(inPicker = false) {
  return `<section class="panel stack" aria-label="Project register" data-project-browser>
    ${inPicker ? field('Search projects', 'project_search', '', 'placeholder="Name, project reference or obligation request"', 'search')
      : `<div class="project-browser-toolbar">
        <label class="project-search">Search: <input name="project_search" type="search" placeholder="Project name, project reference, obligation request number"></label>
        <a class="back" href="#projects" aria-label="Back to contractors" data-contractors hidden><span aria-hidden="true">←</span> Back</a>
      </div>`}
    <div data-project-results aria-live="polite"></div>
  </section>`;
}

function bindProjectBrowser(container, projects, chooseProject) {
  const input = container.querySelector('[name="project_search"]');
  const searchLabel = input.closest('label');
  const back = container.querySelector('[data-contractors]');
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
      <thead><tr>${chooseProject
        ? '<th scope="col">Project name</th><th scope="col">Project reference</th><th scope="col">Contractor</th>'
        : '<th scope="col">Ref</th><th scope="col">Name</th><th scope="col" class="project-amount">Amount</th>'}</tr></thead>
      <tbody>${rows.map((project, index) => chooseProject
        ? `<tr><td><button class="link project-choice" type="button" data-project-choice="${index}"
          aria-label="${escape(projectLabel(project.title, project.reference))}, ${escape(project.contractor?.trim() || missingContractor)}">${escape(project.title)}</button></td>
          <td>${escape(project.reference ?? '—')}</td><td>${escape(project.contractor?.trim() || missingContractor)}</td></tr>`
        : `<tr class="project-row"><td>${escape(project.reference ?? '—')}</td>
          <td><a class="project-link" href="#project/${project.id}">${escape(project.title)}</a></td>
          <td class="project-amount">${project.contract_amount == null ? '—' : pesoCurrency.format(project.contract_amount)}</td></tr>`).join('')}</tbody>
    </table></section>`;
  }

  function browse() {
    const browsingContractor = selectedContractor !== undefined;
    if (back) {
      searchLabel.hidden = browsingContractor;
      back.hidden = !browsingContractor;
    }
    if (!projects.length) {
      results.innerHTML = '<p class="empty">No projects registered.</p>';
    } else if (browsingContractor) {
      results.innerHTML = `<div class="project-results-heading">
        <h2 tabindex="-1">${escape(selectedContractor ?? missingContractor)}</h2>
        ${back ? '' : '<button type="button" data-contractors>Back to contractors</button>'}
      </div>${projectRows(grouped.get(selectedContractor))}`;
    } else {
      results.innerHTML = `<h2 tabindex="-1">Contractors</h2><ul class="contractor-list">
        ${contractors.map((contractor, index) => `<li><button type="button" data-contractor="${index}">
          ${escape(contractor ?? missingContractor)}</button></li>`).join('')}
      </ul>`;
    }
  }

  container.addEventListener('click', (event) => {
    const choice = event.target.closest('[data-project-choice]');
    if (choice) {
      chooseProject(displayedProjects[Number(choice.dataset.projectChoice)]);
      return;
    }
    const contractor = event.target.closest('[data-contractor]');
    const returnToContractors = event.target.closest('[data-contractors]');
    if (!contractor && !returnToContractors) return;
    if (returnToContractors?.matches('a')) {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
    }
    selectedContractor = contractor ? contractors[Number(contractor.dataset.contractor)] : undefined;
    browse();
    if (back) (contractor ? back : input).focus();
    else results.querySelector('h2')?.focus();
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
  mount(`<div class="page-heading projects-heading">
      <h1 tabindex="-1">Projects</h1>
      <a class="button primary" href="#new-project">New Project</a>
    </div>
    ${projectBrowser()}`);
  bindProjectBrowser(screen.querySelector('[data-project-browser]'), projects);
}

function contractorPicker(record, creating) {
  return `<div class="project-field">
    <strong>Contractor${creating ? ' (required)' : ''}</strong>
    <p id="selected-contractor" aria-live="polite">${escape(record.contractor ?? (creating ? 'No contractor selected' : 'No contractor recorded'))}</p>
    <input type="hidden" name="contractor_id" value="${escape(record.contractor_id)}">
    <input type="hidden" name="contractor" value="${escape(record.contractor)}">
    <button type="button" id="choose-contractor" aria-haspopup="dialog" aria-controls="contractor-picker"
      aria-describedby="selected-contractor">Choose Contractor</button>
    ${creating ? '<p id="contractor-selection-error" role="alert" hidden>Choose a contractor to create this project.</p>' : ''}
  </div>`;
}

function contractorSearchKey(name) {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

function bindContractorPicker(form) {
  const button = form.querySelector('#choose-contractor');
  const selection = form.querySelector('#selected-contractor');
  const selectionError = form.querySelector('#contractor-selection-error');
  form.insertAdjacentHTML('afterend', `
    <dialog id="contractor-picker" aria-labelledby="contractor-picker-title">
      <div class="stack">
        <h2 id="contractor-picker-title">Choose Contractor</h2>
        <div class="stack" data-saved-contractors>
          <label>Search contractors<input type="search" maxlength="200"></label>
          <div class="actions">
            <button type="button" data-add-contractor>Add new</button>
            ${selectionError ? '' : '<button type="button" data-clear-contractor>No contractor recorded</button>'}
          </div>
          <div>
            <p data-empty-contractors role="status"></p>
            <ul class="contractor-list" aria-label="Saved contractors" hidden></ul>
          </div>
        </div>
        <form class="stack" hidden>
          ${field('New contractor name', 'contractor_name', '', 'required maxlength="200"')}
          <p data-contractor-match role="status" hidden></p>
          <div class="actions">
            <button type="submit" class="primary">Use contractor</button>
            <button type="button" data-back-to-contractors>Back to saved contractors</button>
          </div>
        </form>
        <div class="actions"><button type="button" data-cancel-contractor>Cancel</button></div>
      </div>
    </dialog>`);
  const chooser = form.nextElementSibling;
  const saved = chooser.querySelector('[data-saved-contractors]');
  const list = saved.querySelector('ul');
  const emptyList = saved.querySelector('[data-empty-contractors]');
  const search = saved.querySelector('input');
  const addForm = chooser.querySelector('form');
  const newName = addForm.elements.contractor_name;
  const matchMessage = addForm.querySelector('[data-contractor-match]');
  const useContractor = addForm.querySelector('[type="submit"]');
  let contractors = lookups.contractors;
  let refreshTimer;
  let refreshVersion = 0;

  function showSavedContractors() {
    const query = contractorSearchKey(search.value);
    const matches = contractors.filter(({ name }) => contractorSearchKey(name).includes(query));
    const focusedId = list.contains(document.activeElement) ? document.activeElement.dataset.contractorId : null;
    list.hidden = matches.length === 0;
    emptyList.textContent = matches.length ? ''
      : contractors.length ? 'No contractors match your search.' : 'No contractors saved.';
    list.innerHTML = matches.map(({ id, name }) => `<li><button type="button" data-contractor-id="${escape(id)}"
      ${String(id) === form.elements.contractor_id.value ? 'aria-current="true"' : ''}>${escape(name)}</button></li>`).join('');
    if (focusedId) (list.querySelector(`[data-contractor-id="${focusedId}"]`) ?? search).focus();
  }

  function setAddMode(adding) {
    saved.hidden = adding;
    addForm.hidden = !adding;
    (adding ? newName : search).focus();
  }

  function chooseContractor(id, name) {
    form.elements.contractor_id.value = id ?? '';
    form.elements.contractor.value = name;
    selection.textContent = name || 'No contractor recorded';
    if (selectionError) selectionError.hidden = true;
    button.setAttribute('aria-describedby', 'selected-contractor');
    chooser.close();
  }

  function findMatch() {
    const query = contractorSearchKey(newName.value);
    return contractors.find(({ name }) => contractorSearchKey(name) === query);
  }

  function showMatch() {
    const match = findMatch();
    matchMessage.hidden = !match;
    matchMessage.textContent = match ? `Already saved as ${match.name}.` : '';
    useContractor.textContent = match ? 'Use saved contractor' : 'Use contractor';
  }

  function refreshContractors() {
    const version = ++refreshVersion;
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(async () => {
      if (!chooser.open || !chooser.isConnected) return;
      try {
        const updated = await api('/contractors');
        if (version !== refreshVersion || !chooser.open || !chooser.isConnected) return;
        if (updated.length === contractors.length && updated.every(({ id, name }, index) =>
          id === contractors[index].id && name === contractors[index].name)) return;
        contractors = updated;
        showSavedContractors();
        showMatch();
      } catch {
        // Keep the current list available during a temporary connection failure.
      }
    }, 200);
  }

  button.addEventListener('click', () => {
    search.value = '';
    newName.value = form.elements.contractor_id.value ? '' : form.elements.contractor.value;
    newName.setCustomValidity('');
    showSavedContractors();
    showMatch();
    saved.hidden = false;
    addForm.hidden = true;
    chooser.showModal();
    search.focus();
    refreshContractors();
  });
  chooser.addEventListener('close', () => {
    if (chooser.open) return;
    clearTimeout(refreshTimer);
    refreshVersion++;
    button.focus();
  });
  chooser.querySelector('[data-cancel-contractor]').addEventListener('click', () => chooser.close());
  chooser.querySelector('[data-add-contractor]').addEventListener('click', () => setAddMode(true));
  chooser.querySelector('[data-back-to-contractors]').addEventListener('click', () => setAddMode(false));
  chooser.querySelector('[data-clear-contractor]')?.addEventListener('click', () => chooseContractor(null, ''));
  search.addEventListener('input', () => {
    showSavedContractors();
    refreshContractors();
  });
  search.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !event.isComposing) {
      event.preventDefault();
      chooser.close();
    }
  });
  list.addEventListener('click', (event) => {
    const selected = event.target.closest('[data-contractor-id]');
    const contractor = selected && contractors.find(({ id }) => String(id) === selected.dataset.contractorId);
    if (contractor) chooseContractor(contractor.id, contractor.name);
  });
  newName.addEventListener('input', () => {
    newName.setCustomValidity('');
    showMatch();
    refreshContractors();
  });
  addForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const name = newName.value.trim().replace(/\s+/g, ' ');
    if (!name) {
      newName.setCustomValidity('Enter a contractor name.');
      newName.reportValidity();
      return;
    }
    const match = findMatch();
    chooseContractor(match?.id, match?.name ?? name);
  });
}

function projectFields(record = {}, creating = false) {
  const required = creating ? 'required' : '';
  const name = field('Project name', 'title', record.title, 'required maxlength="200"');
  const reference = field('Project reference', 'reference', record.reference, `maxlength="200" ${required}`);
  return `${(creating ? [name, reference] : [reference, name]).join('')}
    ${contractorPicker(record, creating)}
    ${field('Contract amount (₱)', 'contract_amount', record.contract_amount, `${pesoAmountAttributes} ${required}`)}`;
}

function displayNewProject() {
  mount(`${backLink('projects', 'Projects')}${heading('New project')}
    <form class="panel stack new-project-form">${projectFields({}, true)}
    <div class="actions"><button class="primary" type="submit">Create project</button></div></form>`);
  const form = screen.querySelector('form');
  bindContractorPicker(form);
  submit(form, async (body) => {
    if (!body.contractor_id && !body.contractor) {
      form.querySelector('#contractor-selection-error').hidden = false;
      const button = form.querySelector('#choose-contractor');
      button.setAttribute('aria-describedby', 'selected-contractor contractor-selection-error');
      button.focus();
      return;
    }
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
  const back = selectedProject ? backLink(`project/${selectedProject.id}`, selectedProject.title) : backLink('projects', 'Projects');
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
      ${projectBrowser(true)}<div class="actions"><button type="button" data-cancel-pick>Cancel</button></div></div>`;
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
  if (record.contractor_id && !lookups.contractors.some(({ id }) => id === record.contractor_id)) {
    lookups.contractors.push({ id: record.contractor_id, name: record.contractor });
    lookups.contractors.sort((a, b) => a.name.localeCompare(b.name));
  }
  mount(`${backLink('projects', 'Projects')}${heading(projectLabel(record.title, record.reference))}
    ${isAuditRole() ? `<form id="project-form" class="panel"><h2>Project details</h2>
      <div class="grid project-details-grid"><div class="stack">${projectFields(record)}</div></div>
      <div class="actions form-actions"><button class="primary" type="submit">Save project details</button></div>
      <div class="notice error form-actions" role="alert" tabindex="-1" hidden></div></form>` : ''}
    ${projectTransactions(record.id, record.transactions)}`);
  const form = screen.querySelector('#project-form');
  if (!form) return;
  bindContractorPicker(form);
  submit(form, async (body) => {
    const selectedName = body.contractor;
    if (record.contractor && selectedName && contractorSearchKey(selectedName) !== contractorSearchKey(record.contractor) &&
        !window.confirm(`Change the contractor from ${record.contractor} to ${selectedName}?`)) return;
    const version = navigationVersion;
    const updated = await api(`/projects/${record.id}`, 'PATCH', { ...body, revision: record.revision });
    if (version !== navigationVersion) return;
    displayProject(updated);
    showNotice('Project details saved.');
  }, { localError: form.querySelector('.notice'), conflict: `#project/${record.id}` });
}

const checklistStateLabels = { 'N/A': 'N/A', Checked: 'Complied', Unchecked: 'Not Complied' };
const booleanOptions = [['', 'Not recorded'], ['true', 'Yes'], ['false', 'No']];
const bacGroupLabels = {
  preparation: 'Procurement preparation', evaluation: 'Procurement evaluation', award: 'Award',
  financial: 'Financial proposal', technical: 'Technical proposal', others: 'Others',
};
const shortChecklistNames = new Map([
  ['Construction Safety and Health Program approved by DOLE', 'CSHP received by DOLE'],
  ["List of Contractor's Key Personnel to be assigned to the Contract to be bid", "List of Contractor's Key Personnel"],
]);

function checklistDocumentName(item) {
  if (item.custom || !item.checklist_group) return item.label;
  return shortChecklistNames.get(item.label.replaceAll('’', "'")) ?? item.label;
}

function documentFieldValue(value) {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return value ?? '—';
}

function documentFields(item) {
  return item.field_definitions.map(({ key, label, kind }) => {
    const value = item.document_fields[key];
    if (kind === 'boolean') return select(label, key, booleanOptions, value ?? '');
    let attributes = 'maxlength="240"';
    if (kind === 'amount') attributes = pesoAmountAttributes;
    if (kind === 'date') attributes = 'min="0001-01-01" max="9999-12-31"';
    return field(label, key, value ?? '', attributes, kind === 'date' ? 'date' : 'text');
  }).join('');
}

function documentBadges(item, values) {
  const details = item.field_definitions.map(({ key, label }) => [label, values.document_fields[key]]);
  details.push(['Needing compliance', complianceDescription(values)], ['Remarks', values.remarks]);
  return details.filter(([, value]) => value != null && String(value).trim() !== '').map(([label, value]) =>
    `<span class="badge"><strong>${escape(label)}</strong> ${escape(documentFieldValue(value))}</span>`).join('');
}

function checklistRow(item, editable) {
  const name = `requirement-${item.id}`;
  const notApplicable = item.state === 'N/A';
  const complied = item.state === 'Checked';
  return `<tr class="checklist-row" data-state="${escape(item.state)}">
    <td class="checklist-choice"><input type="checkbox" name="not_applicable_${item.id}" value="N/A" aria-label="N/A"
      aria-describedby="${name}"${notApplicable ? ' checked' : ''}${editable ? '' : ' disabled'}></td>
    <th scope="row"><span id="${name}" class="requirement-name">
      <span>${escape(checklistDocumentName(item))}${item.custom ? ' <span class="muted">(custom)</span>' : ''}</span>
    </span></th>
    <td class="checklist-choice"><input type="checkbox" name="complied_${item.id}" value="Checked" aria-label="OK"
      aria-describedby="${name}"${complied ? ' checked' : ''}${editable ? '' : ' disabled'}></td>
    <td><div class="checklist-item-details">
      ${editable ? `<button type="button" class="checklist-details" data-document="${item.id}" aria-haspopup="dialog"
        aria-label="Add details" aria-describedby="${name}">+</button>` : ''}
      <div class="document-badges">${documentBadges(item, item)}</div>
    </div></td>
  </tr>`;
}

function checklistState(notApplicable, complied) {
  return notApplicable ? 'N/A' : complied ? 'Checked' : 'Unchecked';
}

function syncChecklistRow(row, changed) {
  const notApplicable = row.querySelector('input[value="N/A"]');
  const compliance = row.querySelector('input[value="Checked"]');
  if (changed === notApplicable && notApplicable.checked) compliance.checked = false;
  if (changed === compliance && compliance.checked) notApplicable.checked = false;
  row.dataset.state = checklistState(notApplicable.checked, compliance.checked);
}

function checklistRows(items, editable, type) {
  if (!items.length) return '<p class="muted">No requirements have been recorded.</p>';
  const table = (rows) => `<table class="checklist-table">
    <colgroup><col class="checklist-choice-column"><col class="checklist-name-column"><col class="checklist-choice-column"><col></colgroup>
    <thead><tr><th scope="col" class="checklist-choice">N/A</th><th scope="col">Document</th>
      <th scope="col" class="checklist-choice">OK</th><th scope="col">Details</th></tr></thead>
    <tbody>${rows.map((item) => checklistRow(item, editable)).join('')}</tbody>
  </table>`;
  if (type !== 'bac') return table(items);
  const grouped = new Map(Object.keys(bacGroupLabels).map((group) => [group, []]));
  for (const item of items) {
    const rows = grouped.get(item.checklist_group) ?? grouped.get('others');
    rows.push(item);
  }
  const groups = Object.entries(bacGroupLabels).map(([group, title]) => {
    const rows = grouped.get(group);
    if (!rows.length) return '';
    return `<section class="checklist-group" data-group="${group}" aria-labelledby="checklist-${group}">
      <h3 id="checklist-${group}">${title}</h3>${table(rows)}
    </section>`;
  });
  return `<div class="checklist-groups">${groups.join('')}</div>`;
}

function checklistPanel(items, editable, type, open) {
  const rows = checklistRows(items, editable, type);
  const contents = editable
    ? `<form id="checklist-form">
      ${rows}
      <div class="grid form-actions">
        ${field('Add a transaction-specific requirement', 'new_label', '', 'maxlength="240"')}
        ${field('Action date', 'actual_on', today(), 'required', 'date')}
      </div>
      <p class="muted form-actions" data-draft-status role="status" hidden></p>
      <div class="notice warning form-actions" data-draft-review hidden></div>
      <div class="notice error form-actions" role="alert" tabindex="-1" hidden></div>
      <div class="actions form-actions"><button class="primary" type="submit">Save checklist</button></div>
    </form>
    <dialog id="document-dialog" aria-labelledby="document-dialog-title"></dialog>` : rows;
  return `<details id="requirements-checklist" class="panel"${open ? ' open' : ''}>
    <summary>Requirements checklist</summary><div class="checklist-content">${contents}</div></details>`;
}

function fitChecklistNames(contents) {
  const names = [...contents.querySelectorAll('.requirement-name')];
  let previousWidth;
  checklistNameObserver = new ResizeObserver(([entry]) => {
    const { width } = entry.contentRect;
    if (width === previousWidth) return;
    previousWidth = width;
    if (!width) return;
    requestAnimationFrame(() => {
      if (!contents.isConnected) return;
      names.forEach((name) => name.classList.remove('compact'));
      const wrapped = names.filter((name) => name.firstElementChild.getClientRects().length > 1);
      wrapped.forEach((name) => name.classList.add('compact'));
    });
  });
  checklistNameObserver.observe(contents);
}

function openDocumentDetails(modal, item, draft, trigger, confirm) {
  modal.innerHTML = `<h2 id="document-dialog-title">${escape(checklistDocumentName(item))}</h2>
    <form class="stack">
      <details class="compliance-details"${item.state === 'Checked' ? '' : ' open'}>
        <summary>Needing compliance</summary>
        <div class="stack">
          ${complianceReasons.map((reason) => `<label class="compliance-reason">
            <input type="checkbox" name="compliance_reasons" value="${escape(reason)}"${draft.compliance_reasons?.includes(reason) ? ' checked' : ''}>
            ${escape(reason)}</label>`).join('')}
          ${remarks('Additional details', 'compliance_details', draft.compliance_details)}
        </div>
      </details>
      ${item.field_definitions.length ? `<div class="grid">${documentFields({ ...item, ...draft })}</div>` : ''}
      ${remarks('Remarks (optional)', 'remarks', draft.remarks)}
      <div class="actions"><button type="submit" class="primary">OK</button>
        <button type="button" data-cancel-document>Cancel</button></div>
    </form>`;
  const form = modal.querySelector('form');
  bindPesoAmounts(form);
  const initial = JSON.stringify([...new FormData(form)]);
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
    if (JSON.stringify([...values]) !== initial) confirm({
      remarks: values.get('remarks').trim() || null,
      compliance_reasons: values.getAll('compliance_reasons'),
      compliance_details: values.get('compliance_details').trim() || null,
      document_fields: Object.fromEntries(item.field_definitions.map(({ key, kind }) => {
        const value = values.get(key).trim();
        if (value === '') return [key, null];
        if (kind === 'boolean') return [key, value === 'true'];
        if (kind === 'amount') return [key, parsePesoAmount(value).value ?? value];
        return [key, value];
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

function checklistChangeFields(before, after) {
  const stateLabel = (item) => checklistStateLabels[item.state] ?? item.state;
  const fields = [
    ['State', before && stateLabel(before), after && stateLabel(after)],
    ['Remarks', before?.remarks || '—', after?.remarks || '—'],
  ];
  const beforeReasons = before?.compliance_reasons?.join(', ') || '—';
  const afterReasons = after?.compliance_reasons?.join(', ') || '—';
  if (beforeReasons !== afterReasons) fields.push(['Needing compliance reasons', beforeReasons, afterReasons]);
  const beforeDetails = before?.compliance_details ?? null;
  const afterDetails = after?.compliance_details ?? null;
  if (beforeDetails !== afterDetails) {
    fields.push(['Additional details', beforeDetails ?? '(empty)', afterDetails ?? '(empty)']);
  }
  for (const key of Object.keys({ ...before?.document_fields, ...after?.document_fields })) {
    const previous = before?.document_fields?.[key];
    const next = after?.document_fields?.[key];
    if (previous !== next) fields.push([key.replaceAll('_', ' '), documentFieldValue(previous), documentFieldValue(next)]);
  }
  return fields;
}

function checklistChangeDetails(changes) {
  const rows = changes.map(({ before, after }) => {
    const fields = checklistChangeFields(before, after);
    const valuesFor = (side) => fields.map(([label, previous, next]) =>
      `<div><strong>${escape(label)}:</strong> ${escape(side === 'before' ? previous : next)}</div>`).join('');
    const addition = before ? '' : '<div><strong>Added requirement</strong></div>';
    return `<tr><th scope="row">${escape((after ?? before).label)}</th>
      <td>${before ? valuesFor('before') : '—'}</td>
      <td>${addition}${after ? valuesFor('after') : 'Removed requirement'}</td></tr>`;
  }).join('');
  return `<details><summary>View changes</summary><table class="checklist-changes">
    <thead><tr><th scope="col">Document</th><th scope="col">Previous</th><th scope="col">Change</th></tr></thead>
    <tbody>${rows}</tbody></table></details>`;
}

function changeDetails(changes, kind) {
  if (!changes) return '';
  if (kind === 'checklist' && Array.isArray(changes)) return checklistChangeDetails(changes);
  const lines = Array.isArray(changes)
    ? changes.map(({ before, after }) => [
      `${after.label}.`,
      ...checklistChangeFields(before, after).map(([label, previous, next]) => `${label}: ${previous} → ${next}.`),
    ].join(' '))
    : Object.entries(changes).map(([field, { before, after }]) => {
      const label = field === 'reference' && kind === 'project_correction' ? 'Project reference' : fieldLabels[field] ?? field;
      return `${label}: ${before ?? '—'} → ${after ?? '—'}`;
    });
  return `<details><summary>View changes</summary><ul class="changes">${lines.map((line) => `<li>${escape(line)}</li>`).join('')}</ul></details>`;
}

function historyPanel(history, transactionId, audit = true) {
  const events = audit ? history.slice().reverse() : history;
  return `<section id="transaction-history" class="panel"><h2>${audit ? 'Audit history' : 'Movement history'}</h2>
    ${events.length ? `<ol class="history">${events.map((event) => {
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
        ${changeDetails(details.changes ?? details.checklist_removals, event.kind)}</li>`;
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

function refreshTransaction(record, draftForm, checklistDraft) {
  const draft = draftForm ? new FormData(draftForm) : null;
  const checklistOpen = screen.querySelector('#requirements-checklist')?.open;
  displayTransaction(record, { checklistOpen, checklistDraft });
  if (!draft) return;
  const form = document.getElementById(draftForm.id);
  if (!form) return;
  for (const control of form.elements) {
    if (draft.has(control.name)) control.value = draft.get(control.name);
  }
  form.dispatchEvent(new Event('input', { bubbles: true }));
}

function displayTransaction(record, { checklistOpen = true, checklistDraft, savedChecklist = false } = {}) {
  const audit = isAuditRole();
  const editable = audit && !record.voided && !savedChecklist;
  const accountId = user?.id;
  const store = editable ? checklistDraft?.store ?? checklistDraftStore(accountId, record.id) : null;
  let draft = store ? checklistDraft?.draft ?? null : null;
  let browserStorageFailed = false;
  if (store && !checklistDraft) {
    try {
      draft = store.read();
    } catch {
      browserStorageFailed = true;
    }
  }
  const checklistItems = audit ? applyChecklistEdits(record.checklist, draft?.items) : [];
  const itemsNeedingCompliance = audit
    ? checklistItems.filter(({ state }) => state === 'Unchecked').length : record.items_needing_compliance;
  const transactionType = record.type === 'bac' ? 'BAC Documentation' : lookups.types[record.type];
  const actions = savedChecklist ? '' : transactionActions(record);
  const summary = `<section class="panel transaction-summary">
    <h1 tabindex="-1">${escape(record.project)}</h1>
    ${record.project_reference ? `<p class="project-reference">${escape(record.project_reference)}</p>` : ''}
    <div class="transaction-badges">
      <span class="badge">${escape(transactionType)}</span>
      ${badge(record.status, record.voided)}
    </div>
    <dl class="definition-grid">
      <div class="summary-detail" aria-live="polite" aria-atomic="true"><dt>Needing compliance</dt><dd id="compliance-count">${itemsNeedingCompliance}</dd></div>
      <div class="summary-detail"><dt>Assigned</dt><dd>${escape(record.assigned_auditor)}</dd></div>
      ${record.obligation_request_reference ? `<div><dt>Obligation request reference</dt><dd>${escape(record.obligation_request_reference)}</dd></div>` : ''}
    </dl>${audit && record.voided && record.notes ? `<p class="form-actions">${escape(record.notes)}</p>` : ''}
  </section>`;
  const checklist = audit ? checklistPanel(checklistItems, editable, record.type, checklistOpen) : '';
  mount(`${backLink(`project/${record.project_id}`, record.project)}
    ${savedChecklist ? '<p class="muted">Latest saved checklist</p>' : ''}${summary}
    ${actions ? `<div class="actions transaction-actions">${actions}</div>` : ''}
    ${checklist}
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
  if (audit) fitChecklistNames(screen.querySelector('.checklist-content'));
  if (editable) {
    bindTransactionEditor(record, checklistItems, { draft, store, browserStorageFailed });
  } else {
    screen.querySelectorAll('[data-action]').forEach((button) => button.addEventListener('click', () =>
      openAction(record, button.dataset.action, button.textContent)));
  }
}

function bindTransactionEditor(record, checklistItems, { draft, store, browserStorageFailed }) {
  const accountId = user.id;
  const link = `#transaction/${record.id}`;
  const latestLink = `${link}/latest`;
  const checklistForm = screen.querySelector('#checklist-form');
  const checklistDisclosure = checklistForm.closest('details');
  const detailsForm = screen.querySelector('#transaction-details');
  const checklistError = checklistForm.querySelector('[role="alert"]');
  const documentDialog = screen.querySelector('#document-dialog');
  const actionButtons = screen.querySelectorAll('[data-action]');
  const complianceCount = screen.querySelector('#compliance-count');
  const draftStatus = checklistForm.querySelector('[data-draft-status]');
  const draftReview = checklistForm.querySelector('[data-draft-review]');
  const documentDrafts = new Map(checklistItems.map((item) => [item.id, item]));
  const removedEdits = draft?.items.filter(({ id }) => !documentDrafts.has(id)) ?? [];
  const pageVersion = navigationVersion;
  const currentPage = () => checklistForm.isConnected && pageVersion === navigationVersion && user?.id === accountId;
  let draftRevision = draft?.revision ?? record.revision;
  let detailsDirty = false;
  let saving = false;
  let reviewRequired = false;
  let reviewPending = Boolean(draft?.reviewPending || draftRevision !== record.revision);
  let autosavePaused = false;
  let autosaveDue = false;

  function latestChecklistLink() {
    const review = document.createElement('a');
    review.href = latestLink;
    review.target = '_blank';
    review.rel = 'noopener';
    review.textContent = 'Open latest saved checklist';
    return review;
  }

  function showDraftReview() {
    const applied = applyChecklistEdits(record.checklist, draft.items);
    const differences = record.checklist.flatMap((before, index) => {
      const after = applied[index];
      return before === after ? [] : [{ before, after }];
    });
    draftReview.hidden = false;
    draftReview.textContent = 'The shared checklist changed while this draft was open. Review the saved and draft values before using Save checklist.';
    draftReview.append(latestChecklistLink());
    if (differences.length) {
      draftReview.insertAdjacentHTML('beforeend', changeDetails(differences));
      draftReview.querySelector('details').open = true;
    }
    if (removedEdits.length) {
      const removed = document.createElement('p');
      removed.textContent = `Edits to removed requirements cannot be saved: ${removedEdits.map(({ label }) => label).join(', ')}.`;
      draftReview.append(removed);
    }
  }

  function cacheChecklist() {
    const items = record.checklist.map((item) => {
      const { id } = item;
      const state = checklistState(checklistForm.elements[`not_applicable_${id}`].checked,
        checklistForm.elements[`complied_${id}`].checked);
      return checklistItemEdit(item, state, documentDrafts.get(id));
    }).filter(Boolean);
    items.push(...removedEdits);
    const newLabel = checklistForm.elements.new_label.value.trim();
    const hasEdits = items.length > 0 || Boolean(newLabel);
    draft = hasEdits || reviewPending
      ? { revision: draftRevision, items, newLabel, reviewPending, actualOn: checklistForm.elements.actual_on.value }
      : null;
    if (!draft) draftRevision = record.revision;
    try {
      store.write(draft);
      browserStorageFailed = false;
    } catch {
      browserStorageFailed = true;
    }
    draftStatus.hidden = !hasEdits && !browserStorageFailed;
    const message = browserStorageFailed
      ? 'The browser could not update this local draft. Use Save checklist to keep these edits.'
      : 'Unsaved checklist edits are stored in this browser.';
    if (draftStatus.textContent !== message) draftStatus.textContent = message;
    if (reviewPending && !reviewRequired) showDraftReview();
  }

  if (draft) {
    checklistForm.elements.new_label.value = draft.newLabel ?? '';
    checklistForm.elements.actual_on.value = draft.actualOn ?? today();
  }
  cacheChecklist();
  checklistForm.addEventListener('input', (event) => {
    const row = event.target.closest('.checklist-row');
    if (row) syncChecklistRow(row, event.target);
    const count = String(checklistForm.querySelectorAll('.checklist-row[data-state="Unchecked"]').length);
    if (complianceCount.textContent !== count) complianceCount.textContent = count;
    cacheChecklist();
  });
  detailsForm.addEventListener('input', () => { detailsDirty = true; });
  checklistForm.addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-document]');
    if (!trigger) return;
    const row = trigger.closest('.checklist-row');
    const item = record.checklist.find(({ id }) => id === Number(trigger.dataset.document));
    openDocumentDetails(documentDialog, { ...item, state: row.dataset.state }, documentDrafts.get(item.id), trigger, (details) => {
      documentDrafts.set(item.id, details);
      row.querySelector('.document-badges').innerHTML = documentBadges(item, details);
      cacheChecklist();
    });
  });

  async function saveTransactionForm(path, body, signal) {
    const focused = document.activeElement;
    saving = true;
    checklistForm.inert = detailsForm.inert = true;
    actionButtons.forEach((button) => { button.disabled = true; });
    try {
      return await api(path, 'PATCH', { ...body, revision: record.revision }, signal);
    } finally {
      saving = false;
      checklistForm.inert = detailsForm.inert = false;
      actionButtons.forEach((button) => { button.disabled = false; });
      if (currentPage() && document.activeElement === document.body && focused?.isConnected) {
        focused.focus({ preventScroll: true });
      }
    }
  }

  function showChecklistError(error, automatic) {
    reviewRequired = error.code === 'revision';
    autosavePaused = error.status === 401 || error.status === 403;
    checklistError.hidden = false;
    checklistError.textContent = automatic ? `Autosave failed. ${error.message}` : error.message;
    if (reviewRequired) {
      reviewPending = true;
      cacheChecklist();
      const review = document.createElement('button');
      review.type = 'button';
      review.className = 'link';
      review.textContent = 'Load latest checklist for review';
      review.addEventListener('click', async () => {
        review.disabled = true;
        try {
          const latest = await api(`/transactions/${record.id}?account_id=${accountId}`);
          if (currentPage()) refreshTransaction(latest, detailsDirty ? detailsForm : null, { store, draft });
        } catch (loadError) {
          if (!currentPage()) return;
          if (loadError.code === 'session_account') location.reload();
          else showNotice(loadError.message, true);
        } finally {
          review.disabled = false;
        }
      });
      checklistError.append(' ', review, latestChecklistLink());
    }
    if (automatic) {
      showNotice(`Autosave failed. ${error.message}`, true);
    } else {
      checklistDisclosure.open = true;
      checklistError.focus();
    }
  }

  async function saveChecklist(automatic) {
    if (saving || !currentPage()) return;
    if (reviewRequired) {
      if (!automatic) checklistError.focus();
      return;
    }
    checklistError.hidden = true;
    const items = checklistSaveItems(record.checklist, draft?.items);
    const actualOn = checklistForm.elements.actual_on.value;
    const newLabel = checklistForm.elements.new_label.value;
    let updated;
    try {
      updated = await saveTransactionForm(`/transactions/${record.id}/checklist`, {
        actor_id: accountId, items, new_label: automatic ? undefined : newLabel, actual_on: actualOn,
      }, automatic ? AbortSignal.timeout(15_000) : undefined);
    } catch (error) {
      if (currentPage()) showChecklistError(error, automatic);
      return;
    }
    const remainingDraft = automatic && draft?.newLabel
      ? { ...draft, revision: updated.revision, items: [] } : null;
    try {
      store.write(remainingDraft);
    } catch {
      // Another tab may have updated the stored draft while this request was pending.
    }
    if (!currentPage()) return;
    if (automatic) {
      record = updated;
      draftRevision = updated.revision;
      draft = remainingDraft;
      for (const item of record.checklist) documentDrafts.set(item.id, item);
      cacheChecklist();
      screen.querySelector('#transaction-history').outerHTML = historyPanel(record.history, record.id);
      showNotice('Checklist autosaved.');
    } else {
      refreshTransaction(updated, detailsDirty ? detailsForm : null, { store, draft: null });
      showNotice('Checklist saved.');
    }
  }

  function autosaveChecklist() {
    if (!currentPage() || !checklistDisclosure.open || !draft?.items.length || autosavePaused ||
        reviewPending || !checklistForm.elements.actual_on.validity.valid) return;
    if (documentDialog.open) {
      autosaveDue = true;
    } else {
      autosaveDue = false;
      void saveChecklist(true);
    }
  }

  documentDialog.addEventListener('close', () => {
    if (autosaveDue) autosaveChecklist();
  });
  checklistAutosaveTimer = setInterval(autosaveChecklist, checklistAutosaveInterval);
  submit(checklistForm, () => saveChecklist(false));
  submit(detailsForm, async (body) => {
    if (saving || !currentPage()) return;
    showNotice('');
    const updated = await saveTransactionForm(`/transactions/${record.id}`, body);
    if (!currentPage()) return;
    const nextDraft = draft && draftRevision === record.revision ? { ...draft, revision: updated.revision } : draft;
    refreshTransaction(updated, null, { store, draft: nextDraft });
    showNotice('Transaction details saved.');
  }, { localError: detailsForm.querySelector('.notice'), conflict: link });
  actionButtons.forEach((button) => button.addEventListener('click', () => {
    if (draft || detailsDirty) {
      showNotice('Save your checklist and detail edits before recording an action.', true);
    } else {
      openAction(record, button.dataset.action, button.textContent);
    }
  }));
}

function uncheckedRequirements(record) {
  return record.checklist?.filter((item) => item.state === 'Unchecked') ?? [];
}

function openAction(record, action, label) {
  const unchecked = uncheckedRequirements(record);
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
        <ol class="slip-items">${unchecked.map((item) => {
          const description = complianceDescription(item);
          return `<li><strong>${escape(item.label)}</strong>${description ? `<p>${escape(description)}</p>` : ''}</li>`;
        }).join('')}</ol>` : ''}
      ${certify && unchecked.length ? `<p class="warning">${unchecked.length} applicable ${unchecked.length === 1 ? 'requirement is' : 'requirements are'} unchecked. Enter a justification to certify.</p>
        <label>Justification<textarea name="justification" required maxlength="2500"></textarea></label>` : ''}
      ${certify && record.type !== 'bac' ? `<div class="stack">
        ${field('Certified amount (₱, optional)', 'certified_amount', '', pesoAmountAttributes)}
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
    const result = await api(`/transactions/${record.id}/actions/${action}`, 'POST', request);
    dialog.close();
    refreshTransaction(result.record);
    showNotice(`${actionLabels[action]}.`);
    if (suspend) {
      const link = document.createElement('a');
      link.href = `/api/transactions/${record.id}/slips/${result.event_id}`;
      link.target = '_blank';
      link.rel = 'noopener';
      link.textContent = 'Open printable suspension slip';
      notice.append(link);
      screen.querySelector(`a[href="${link.getAttribute('href')}"]`)?.focus();
    }
  }, { localError, conflict: `#transaction/${record.id}` });
  dialog.showModal();
}

async function displayRoute() {
  clearInterval(checklistAutosaveTimer);
  const version = ++navigationVersion;
  if (!user) {
    displayLogin();
    return;
  }
  const [page, id, view] = route().split('/');
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
      const expectedAccount = page === 'transaction' ? `?account_id=${user.id}` : '';
      const record = await api(`/${page}s/${encodeURIComponent(id ?? '')}${expectedAccount}`);
      if (version === navigationVersion) {
        if (page === 'project') displayProject(record);
        else displayTransaction(record, { savedChecklist: view === 'latest' });
      }
    } else {
      location.hash = 'projects';
    }
  } catch (error) {
    if (version !== navigationVersion) return;
    if (error.code === 'session_account') {
      location.reload();
      return;
    }
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
