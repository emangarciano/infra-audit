export function checklistDraftStore(accountId, transactionId) {
  const key = `pacco:checklist-draft:${accountId}:${transactionId}`;
  let stored;

  return {
    read() {
      stored = localStorage.getItem(key);
      if (stored === null) return null;
      const draft = JSON.parse(stored);
      if (!Number.isInteger(draft?.revision) || !Array.isArray(draft.items) ||
          draft.items.some((item) => !Number.isInteger(item?.id))) {
        throw new Error('Invalid checklist draft.');
      }
      return draft;
    },

    write(draft) {
      const next = draft ? JSON.stringify(draft) : null;
      if (localStorage.getItem(key) !== stored) {
        throw new Error('The checklist draft changed in another tab.');
      }
      if (next === stored) return;
      if (next === null) localStorage.removeItem(key);
      else localStorage.setItem(key, next);
      stored = next;
    },
  };
}

export function applyChecklistEdits(items, edits = []) {
  const byId = new Map(edits.map((edit) => [edit.id, edit]));
  return items.map((item) => {
    const edit = byId.get(item.id);
    return edit ? { ...item, ...edit, document_fields: { ...item.document_fields, ...edit.document_fields } } : item;
  });
}

export function checklistItemEdit(item, state, details) {
  const edit = {};
  if (state !== item.state) edit.state = state;
  if ((details.remarks ?? null) !== (item.remarks ?? null)) edit.remarks = details.remarks;
  if ((details.compliance_reasons ?? []).join() !== (item.compliance_reasons ?? []).join()) {
    edit.compliance_reasons = details.compliance_reasons;
  }
  if ((details.compliance_details ?? null) !== (item.compliance_details ?? null)) {
    edit.compliance_details = details.compliance_details;
  }
  const fields = item.field_definitions.flatMap(({ key }) => {
    const value = details.document_fields[key] ?? null;
    const saved = item.document_fields[key] ?? null;
    return value === saved ? [] : [[key, value]];
  });
  if (fields.length) edit.document_fields = Object.fromEntries(fields);
  return Object.keys(edit).length ? { id: item.id, label: item.label, ...edit } : null;
}

export function checklistSaveItems(items, edits = []) {
  const byId = new Map(edits.map((edit) => [edit.id, edit]));
  return items.flatMap((item) => {
    const edit = byId.get(item.id);
    if (!edit) return [];
    const { state = item.state, remarks = item.remarks, document_fields, compliance_reasons, compliance_details } = edit;
    return [{ id: item.id, state, remarks, document_fields, compliance_reasons, compliance_details }];
  });
}
