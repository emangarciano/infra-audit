# 02: Autosave changed checklists every minute

**What to build:** While the checklist is open, check every minute for changed checklist selections, confirmed document details, or remarks and save those changes to the shared transaction record.

**Blocked by:** 01 Recover unsaved checklist edits in the same browser.

**Status:** resolved

- [x] Skip the save when the checklist matches the last successful manual save or autosave, including when the auditor has reverted the edits.
- [x] Use the existing server validation, role permissions, attribution, and transaction revision checks. Keep **Save checklist** available and prevent overlapping saves in the same view.
- [x] On a save failure, keep the browser draft and report the failure. On a revision conflict, wait for manual review and save before resuming autosave.
- [x] A successful autosave updates the visible audit history and clears the saved draft without losing other work in the transaction.

Chromium exercised the 60-second timer, closed checklists, unchanged and reverted edits, a connection failure, and revision conflicts including when another auditor saved the same edit. It also verified audit history attribution and preservation of unsaved transaction notes. The full PostgreSQL-backed suite passed all 20 tests.
