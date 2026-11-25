# 02: Resolve confirmed contractor name variants

**What to build:** Let auditors and supervisors use the existing project correction flow to reassign a project from a confirmed alias or typo to the correct saved contractor.

**Blocked by:** 01 — Select or add a contractor when creating a project

**Status:** resolved

- [x] An authorized user can search for and select the correct saved contractor when correcting an existing project.
- [x] The user confirms the correct contractor. For example, the user can reassign a project from `North Builders Inc.` to `North Builders` after confirming that they refer to the same company.
- [x] A successful correction moves the project into the selected contractor's group in the Projects page and the New Transaction project picker while preserving the project ID and linked transactions.
- [x] The correction checks the project revision and records the actor and the previous and selected contractor names in the project's correction history.

## Answer

Chromium verified that cancelling a typed reassignment keeps the saved contractor, and that confirming a selected reassignment moves the project in both browsers. PostgreSQL verified the revision check, actor and before-and-after names in history, and preservation of the project ID and linked transactions.
