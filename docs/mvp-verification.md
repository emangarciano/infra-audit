# Lean MVP verification

Development checks ran on 24 November 2026 with Node.js 24, PostgreSQL 16, and clearly labeled fixture data. The approved materials and office pilot evidence are tracked in [the Wayfinder map](../.scratch/pacco-audit-mvp/map.md).

| Criterion | Development evidence | Office evidence pending |
| --- | --- | --- |
| AC-01 | Intake assigned a transaction and an auditor created a self-assigned transaction. Both started Under Audit. Duplicate creation required a deliberate confirmation. | |
| AC-02 | A second auditor opened another auditor's transaction. Intake received movement metadata and was denied checklist and slip access. | |
| AC-03 | Checked, Unchecked, N/A, and custom items worked. The suspension snapshot contained only unchecked applicable items and their remarks. | Validate the configured requirements against PACCO's approved checklists. |
| AC-04 | Reprinting returned the same saved HTML after checklist changes and a layout change. | Compare print wording and layout with the PACCO specimen before official pilot use. |
| AC-05 | Resubmission preserved the checklist, explicit resumption returned the transaction to Under Audit, and repeated suspensions retained both slips. | |
| AC-06 | The logged-in supervisor was recorded as certifier. Unchecked items required justification. The manual amount was preserved with figures and words, and the workflow ended at Audited. | |
| AC-07 | Backdated action and recording times were preserved. Two simultaneous corrections produced one save and one revision conflict. Earlier certification and slips survived correction and duplicate voiding. | |
| AC-08 | Four-digit PIN validation, five-attempt lockout, 15-minute lock duration, 60-minute inactivity expiry, deactivation, and role permissions passed. | |
| AC-09 | Two manually invoked backups succeeded on a separate test filesystem. Full restore into an isolated PostgreSQL instance created a safety dump and verified accounts, projects, transactions, checklists, slips, and audit history. Both timer expressions were checked in Asia/Manila. | Observe the two scheduled runs and confirm recovery on the designated office setup. |
| AC-10 | The fixture workflow produced a traceable status and history. | Run the real parallel office pilot with Excel as the official record. |

## Reproduce the API checks

Set `PACCO_TEST_DATABASE_URL` and run `npm test`. The [integration suite](../test/mvp.test.js) reported 10 passes and zero failures against the disposable PostgreSQL instance. The suite creates its own schema for the run.

## Browser and recovery checks

A Chromium fixture run used keyboard activation for registration, checklist saving, suspension review, resubmission, explicit resumption, and certification. A second auditor found the transaction, the print view produced a PDF, and the slip retained its original content after a checklist edit. A stale save displayed a revision conflict and kept the unsaved notes visible. The certification dialog displayed a justification warning and copyable amount figures and words.

The [backup and restore procedure](../README.md#backup-and-restore) uses PostgreSQL's native client tools. For the rehearsal, the test archive contained a registered project and transaction, checklist items, and a recorded suspension with a saved slip. The replacement database contained a fixture account before restore. A safety archive was created and the restored event table contained the slip. Restored sessions were cleared.

The retention check removed a 31-day-old fixture archive and its manifest. A backup directed to the application filesystem failed and recorded the reason in the administrator log.
