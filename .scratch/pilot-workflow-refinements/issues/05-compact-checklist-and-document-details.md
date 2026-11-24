# 05: Compact the requirements checklist and move details into a dialog

**What to build:** Give auditors a compact checklist with one radio group and a details button per requirement. The configured BAC Documentation items fit together on a desktop screen, with room for a 68-requirement checklist.

**Blocked by:** None (can start immediately).

**Status:** resolved

- [x] Each editable requirement shows the document name, radio options in the order **N/A**, **Complied**, **Not Complied**, and a **+** button with an accessible **Add details** label. The document-name background updates to gray, light green, or light red, respectively. Radio labels and selection make the state readable independently of color.
- [x] Display the BAC Documentation checklist in three columns. At **1440 × 900 CSS pixels at 100% zoom**, the seeded BAC rows, their complete labels, radio choices, and details buttons fit simultaneously without page or checklist scrolling while the checklist is in view. Verify this in a browser with the supplied BAC list and a 68-requirement seed. At smaller viewports or increased zoom, keep all rows and controls reachable.
- [x] The **+** button opens a dialog for that document. Show its existing defined fields with their current types, validation, and values, plus optional remarks. For items without defined fields, including custom requirements, show remarks. The dialog does not expand the document field catalog.
- [x] **Escape** cancels changes from the current dialog opening. **Enter** confirms valid changes into the checklist draft, equivalent to the **OK** button. Invalid values keep the dialog open with feedback. Closing returns focus to the row's details button. Reopening shows the most recently confirmed draft values.
- [x] The existing **Save checklist** action persists confirmed details, remarks, and radio selections together with attribution and revision checks. Previously saved values remain available. Cancelled edits never reach the saved record, and revision conflicts keep draft edits available for review.
- [x] Preserve existing permissions, support for custom requirements, and the stored state meanings. **Not Complied** remains the unchecked applicable state for suspension and certification warnings. **N/A** and **Complied** stay out of suspension grounds, and issued slips remain reproducible from their snapshots.
- [x] Update FR-03, §4.5 usability, and AC-03 with the display labels, dialog behavior, and BAC viewport check. Clarify in §4.1 that the existing defined fields can be used in the dialog while expansion of document-specific catalogs remains deferred.

## Answer

Implemented the compact checklist and keyboard-accessible details dialogs. Confirmed dialog changes stay in the checklist draft until Save checklist succeeds. The same saved states continue to determine suspension grounds and certification warnings.

Chromium at 1440 × 900 CSS pixels and 100% zoom showed all rows, full names, radio choices, and details buttons in three columns on initial load. The supplied BAC CSV contains 63 requirements and five blank lines. A second run used the same 63 requirements plus five labeled development fixtures to verify the 68-row layout. Keyboard focus reached the last details button at viewport widths of 960, 720, and 360 CSS pixels.

Browser checks verified invalid amount and date feedback, typed field persistence, Enter and OK confirmation, Escape cancellation, focus restoration, custom remarks, draft and selection retention after transaction details save and revision conflict, restricted intake access, and unchanged suspension reprints with multiline remarks. All 15 tests in the PostgreSQL-backed suite passed.
