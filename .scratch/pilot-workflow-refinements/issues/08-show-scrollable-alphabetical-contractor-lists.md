# 08: Show contractors in scrollable alphabetical lists

**What to build:** Show contractors as selectable rows in a scrollable list on the Projects page and in the project selection dialog opened from New Transaction. Choosing a contractor shows its projects.

**Blocked by:** None (can start immediately).

**Status:** resolved

- [x] Both views display contractor names as full-width list rows in ascending alphabetical order. **No contractor recorded**, when present, follows the named contractors.
- [x] With enough contractors to overflow, the list scrolls within its own area in both views. The project search field remains visible while scrolling, and the last row is reachable.
- [x] Users can activate contractor rows with a pointer or keyboard, see the contractor's projects, and return to the contractor list.
- [x] Live project search still matches across contractors in both views. Opening a project from Projects and selecting a project for New Transaction still work.

## Answer

The shared project browser displays full-width contractor rows in a scrollable list. FR-02 records the same layout for Projects and the New Transaction project picker.

Headless Chromium with fixture API responses verified both views at a 380 × 600 viewport with 30 named contractors and a legacy project. The checks covered alphabetical order, independent scrolling, keyboard selection of the last row, pointer selection, returning to the list, cross-contractor search, and opening or choosing a project.
