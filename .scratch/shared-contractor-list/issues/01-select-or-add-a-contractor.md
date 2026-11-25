# 01: Select or add a contractor when creating a project

**What to build:** Let administrative staff, auditors, and supervisors choose a contractor from a searchable shared list or use **Add new** on the New Project form. Seed the list from contractor names already recorded on projects.

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] The New Project form requires a contractor. Users can search saved names and select one without losing other form entries. Multiple projects can use the same saved contractor.
- [x] **Add new** checks for a matching saved name while the user types and lets them select the match. A genuinely new name is saved with the project and is available for future projects. Cancelling or failing to save the project leaves no new contractor record.
- [x] Contractor names that differ only in capitalization or leading, trailing, or repeated whitespace resolve to one saved record with one display name. Names that differ in spelling, punctuation, or suffixes remain distinct.
- [x] The server applies the same uniqueness rule to project creation and authorized corrections. A database constraint prevents duplicate contractor records, including when two users save the same name concurrently.
- [x] Existing projects with matching contractor names appear under one contractor in the Projects page and the New Transaction project picker. Projects without a contractor remain under **No contractor recorded**.
- [x] Existing project IDs, linked transactions, and audit history remain intact. Project creation and correction retain their existing permissions, and corrections retain revision checks and attributed before-and-after history.

## Answer

The shared list uses one contractor record per normalized name. During migration, the earliest project ID supplies the display spelling for matching names. The PostgreSQL 16 suite passed all 18 tests, including concurrent saves, Unicode case and spacing, rejected saves, migration, and role checks. Chromium verified saved search, Add new, selecting a matching name, discovering contractors added while the form was open, cancelling, preserving other entries, and both project browsers. A disposable backup rehearsal verified restores from before and after this feature.
