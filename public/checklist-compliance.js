export const complianceReasons = ['Not attached', 'Has discrepancy', 'Lacking signature/s'];

export function complianceDescription(item) {
  return [item.compliance_reasons?.join(', '), item.compliance_details].filter(Boolean).join('\n');
}
