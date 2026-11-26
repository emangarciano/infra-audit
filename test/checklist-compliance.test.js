import assert from 'node:assert/strict';
import { test } from 'node:test';
import { documentComplianceHistory } from '../public/checklist-compliance.js';

test('Compliance history traces saved values and status changes for one document', () => {
  const empty = { id: 5, state: 'Unchecked' };
  const first = {
    ...empty, compliance_reasons: ['Not attached'], compliance_details: 'Request both pages.',
  };
  const second = {
    ...first, compliance_reasons: ['Lacking signature/s'], compliance_details: 'Sign page 2.\nInclude the date.',
  };
  const checked = { ...second, state: 'Checked' };
  const other = { ...first, id: 6 };
  const event = (id, before, after) => ({
    id, kind: 'checklist', actor_id: 2, actor_name: 'Auditor B',
    actual_on: '2026-11-10', recorded_at: '2026-11-12T03:00:00Z',
    details: { changes: [{ before, after }] },
  });
  const history = documentComplianceHistory([
    event(1, null, empty),
    event(2, empty, first),
    event(3, null, other),
    event(4, first, { ...first, remarks: 'Separate internal note' }),
    event(5, first, second),
    event(6, second, checked),
    event(7, checked, { ...empty, compliance_reasons: [], compliance_details: null }),
  ], 5);

  assert.deepEqual(history.map(({ event_id }) => event_id), [2, 5, 6, 7]);
  assert.deepEqual(history[1], {
    event_id: 5, actor_id: 2, actor_name: 'Auditor B',
    actual_on: '2026-11-10', recorded_at: '2026-11-12T03:00:00Z',
    before: {
      state: 'Unchecked', compliance_reasons: ['Not attached'], compliance_details: 'Request both pages.',
    },
    after: {
      state: 'Unchecked', compliance_reasons: ['Lacking signature/s'], compliance_details: 'Sign page 2.\nInclude the date.',
    },
  });
  assert.equal(history[2].after.state, 'Checked');
  assert.deepEqual(history[2].after.compliance_reasons, ['Lacking signature/s']);
  assert.deepEqual(history[3].after, { state: 'Unchecked', compliance_reasons: [], compliance_details: null });
});
