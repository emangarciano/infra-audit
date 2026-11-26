export const complianceReasons = ['Not attached', 'Has discrepancy', 'Lacking signature/s'];

export function complianceDescription(item) {
  return [item.compliance_reasons?.join(', '), item.compliance_details].filter(Boolean).join('\n');
}

function complianceSnapshot(item) {
  return {
    state: item?.state ?? null,
    compliance_reasons: item?.compliance_reasons ?? [],
    compliance_details: item?.compliance_details ?? null,
  };
}

export function documentComplianceHistory(history, documentId) {
  const entries = [];
  for (const event of history) {
    if (event.kind !== 'checklist' || !Array.isArray(event.details?.changes)) continue;
    const change = event.details.changes.find(({ after }) => after?.id === documentId);
    if (!change) continue;
    const before = complianceSnapshot(change.before);
    const after = complianceSnapshot(change.after);
    if (!complianceDescription(before) && !complianceDescription(after)) continue;
    if (before.state === after.state && before.compliance_details === after.compliance_details &&
        before.compliance_reasons.join(',') === after.compliance_reasons.join(',')) continue;
    entries.push({
      event_id: event.id, actor_id: event.actor_id, actor_name: event.actor_name,
      actual_on: event.actual_on, recorded_at: event.recorded_at, before, after,
    });
  }
  return entries;
}
