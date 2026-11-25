# 09: Compact the site layout for daily audit work

**What to build:** Give the PACCO site a compact, desktop-first ERP layout. Staff should be able to scan more records, compare fields, and reach the actions they use throughout the day with less scrolling. Use the available workspace for records and controls, with restrained headings, spacing, and section borders.

**Blocked by:** None (can start immediately).

**Status:** resolved

- [x] Apply consistent compact spacing, type sizes, and control heights across navigation, sign-in, system administration, the Transaction queue, Projects, project and transaction registration and detail pages, and their dialogs. Keep the active section, record identity, status, and available actions easy to find.
- [x] Place search, filters, and their actions close to the records they affect. Use dense, readable rows with aligned columns for the Transaction queue, project lists, and history entries. On the same populated records at 1440 × 900 CSS pixels and 100% zoom, the queue and project results each show more complete rows before scrolling than the current layout.
- [x] Align related fields and use columns where space permits. Keep labels, validation feedback, and save and cancel actions easy to find. Preserve the BAC checklist's six groups, full requirement names, state controls, and document details behavior. Keep the other transaction types' flat checklist layout.
- [x] At narrower widths and higher zoom, let controls wrap or stack and contain any necessary table scrolling within the table region. Long names and references remain readable. Verify keyboard navigation, visible focus, and dialog focus restoration on the main workflows.
- [x] Verify in a browser that administrative staff, auditors, and supervisors can still complete their existing tasks with their assigned permissions, including registration, queue filtering, checklist editing, and the permitted audit actions. Confirm that the suspension slip still prints and reprints in its existing layout. Keep the work within the existing MVP screens and workflows.

## Answer

Chromium used the same 40 development records at 1440 × 900 CSS pixels and 100% zoom on the ticket 09 build. The Transaction queue showed 22 complete rows before scrolling, up from 10. The contractor project results showed 21, up from 10.

Browser checks covered sign-in and system administration, administrative project and transaction registration, queue filters, project selection and focus restoration, and the permitted audit actions through certification. The flat billing checklist and all six groups of a 68-requirement BAC fixture remained usable. At 360 and 720 CSS pixels, long names and references fit the page, and the last BAC details button was reachable by keyboard. The development suspension slip printed to PDF and its saved HTML was reproduced exactly after a checklist edit.

The BAC checklist also fit at 200% Chromium browser zoom. A stale save on the BAC transaction focused the visible error beside the Transaction details form and retained the user's unsaved notes.

The full PostgreSQL-backed suite passed all 16 tests.
