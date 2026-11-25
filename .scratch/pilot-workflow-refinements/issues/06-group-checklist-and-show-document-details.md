# 06: Group the requirements checklist and show document details beside each item

**Follow-up to:** [05 — Compact the requirements checklist and move details into a dialog](05-compact-checklist-and-document-details.md), resolved.

**What to build:** Give auditors and supervisors two checkboxes per editable requirement and a two-column layout that shows each document’s details beside its name and controls. Organize the BAC Documentation checklist into six labeled groups so auditors can find documents by procurement stage or proposal type.

**Blocked by:** None (can start immediately).

**Status:** resolved

- [x] Each editable requirement has an **N/A** checkbox and a compliance checkbox. For applicable items, the compliance checkbox reads **Complied** when checked and **Not Complied** when unchecked. Selecting **N/A** clears and disables the compliance checkbox. Clearing **N/A** makes the item applicable and **Not Complied**. Previously saved `N/A`, `Checked`, and `Unchecked` values load into the corresponding controls. Both controls are keyboard accessible and associated with the document name.
- [x] Each editable requirement has a left column for the full document name, both checkboxes, and the **+** button with its accessible **Add details** label. The right column shows compact, readable badges for populated document fields and remarks, with labels and values. Badges wrap as needed and reflect saved values on load and confirmed draft edits immediately. Cancelling the dialog preserves the previous badges.
- [x] Render the BAC groups in the order below. The endpoints are inclusive and use the configured BAC checklist labels. Keep the configured document order within each group. Each requirement appears once.

  | Group | Configured documents |
  | --- | --- |
  | Procurement preparation | **APP/SPP** through **Checklist of Requirements** |
  | Procurement evaluation | **Abstract of Bids as Read** through **Notice of Post-Qualification** |
  | Award | **BAC Resolution** through **Certificate of PhilGEPS Award Notice Abstract**, the configured label for the requested PhilGEPS Award Notice Posting endpoint |
  | Financial proposal | **Financial Bid Form** through **Cash Flow by the Quarter & Payments Schedule** |
  | Technical proposal | **Statement of all ongoing government and private contracts** through **Latest Income Tax Return**, excluding the Financial proposal range |
  | Others | All remaining requirements, including custom requirements and any configured items outside the ranges above |

- [x] Give each BAC group a visible heading and a bordered container. Use a distinct, muted accent for each within a coordinated professional palette. The headings and borders identify the groups without relying on color alone. Other transaction types use the shared row controls and layout in a flat list.
- [x] Keep the details dialog’s validation, Enter and OK confirmation, Escape cancellation, and focus restoration. **Save checklist** persists the state, confirmed fields and remarks together with attribution and revision protection. Revision conflicts retain the draft. Preserve role permissions, suspension and certification treatment of **Not Complied**, and issued slip snapshots.
- [x] Verify the configured BAC list and a 68-requirement development fixture at 1440 × 900 CSS pixels and 100% zoom. The two-column layout may scroll vertically. At smaller viewports or higher zoom, keep names, badges and controls reachable by keyboard, with no horizontal scrolling required. Check the group boundaries and confirm that custom requirements appear in **Others**.

## MVP specification alignment

FR-03, §4.5, and AC-03 describe the checkbox behavior, two-column rows, and viewport verification above.

## Answer

Chromium verified the 63 configured BAC requirements and a 68-requirement fixture at 1440 × 900 CSS pixels. The six groups contained every configured requirement once in the expected order. A custom requirement appeared in Others. The last row’s controls were reachable by keyboard at 960, 720, and 360 CSS pixels, and the layout fit at 200% layout zoom. A progress billing checklist used the same controls in a flat list. Intake had no checklist access.

Browser checks verified keyboard state changes, existing saved selections, populated badges including zero and false values, dialog validation, Enter and OK confirmation, Escape cancellation, and focus restoration. Confirmed badges and checkbox edits survived a separate transaction details save and a checklist revision conflict. The saved checklist retained attribution, and only applicable unchecked requirements appeared in the suspension review and certification warning.

All 15 PostgreSQL-backed tests passed, including exact suspension-slip reprints.
