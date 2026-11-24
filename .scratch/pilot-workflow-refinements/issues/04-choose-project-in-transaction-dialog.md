# 04: Choose a project from a dialog when creating a transaction

**What to build:** Replace the project dropdown in the New Transaction form with a dialog that uses the same contractor browse and live project search as the Projects page.

**Blocked by:** 02 — Browse projects by contractor and search across the register.

**Status:** resolved

- [x] **Choose project** opens a dialog starting at the contractor list. Users can browse contractor → project, or search across contractors by the same references and name as on the Projects page.
- [x] Selecting a project closes the dialog and displays the selected project's identity in the form. The form submits the chosen project ID and requires a valid project, with server validation of the selection.
- [x] Changing or cancelling a selection preserves the rest of the transaction form. Cancel or Escape restores focus to the picker and keeps the previous selection. The dialog supports keyboard navigation and selection.
- [x] Starting New Transaction from an existing project preselects that project. Staff and audit roles can open the dialog, choose a different project, and complete registration through their existing role-specific workflow.
- [x] Update FR-01 with the project selection flow. Verify registration from contractor browsing, live search, and the preselected project entry point, including cancelling a change after entering other values.

## Answer

New Transaction uses the Projects page’s contractor browser and live search. A project overview preselects its project. The form submits the chosen project ID, and the existing server validation checks that the project exists.

Headless Chromium with an isolated PostgreSQL database verified keyboard-only contractor browsing, live search by name, project reference and obligation request reference, registration with a preselected project, and replacing a preselected project through search. Cancel and Escape restored picker focus and preserved the selection and form entries. Staff, auditors and supervisors each registered a transaction after replacing a preselected project. Staff registration created Pending transactions. Auditor and supervisor registrations created Under Audit transactions. The API rejected a nonexistent project ID.
