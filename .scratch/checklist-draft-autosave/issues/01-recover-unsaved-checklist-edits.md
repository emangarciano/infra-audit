# 01: Recover unsaved checklist edits in the same browser

**What to build:** Keep an auditor or supervisor's unsaved checklist edits in the browser as they work. Restore those edits when the same user opens the same transaction again.

**Blocked by:** None (can start immediately).

**Status:** resolved

- [x] Restore Complied, Not Complied, and N/A selections and confirmed document details and remarks after a refresh or reopening. Edits cancelled in Add details stay out of the draft.
- [x] Show the draft only after authenticating the same user and opening the same editable transaction. Clearly distinguish the local draft from the shared record.
- [x] Clear saved edits from the draft after **Save checklist** succeeds. A rejected save leaves the edits available.
- [x] When the shared revision has advanced, retain the draft and let the auditor compare it with the saved checklist before manually saving against the latest revision.

Chromium checks verified draft recovery, dialog cancellation, isolation by account and transaction, same-browser account switching, and comparison with the latest saved checklist. The PostgreSQL suite also verified the account check on opening and saving the checklist.
