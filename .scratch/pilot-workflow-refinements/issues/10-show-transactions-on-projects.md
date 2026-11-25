# 10: Show transactions on the Projects page

**What to build:** Make Projects the entry point for browsing transactions. Selecting a project opens its details with the linked transactions immediately below the Project details panel, in the space currently used by Audit history. Use the selected project to scope the list and remove the standalone Transactions page and its filter panel.

**Blocked by:** None (can start immediately).

**Status:** resolved

- [x] Selecting a project through contractor browsing or project search shows only transactions linked to that project. If the project has no transactions, show “No transactions for this project.”
- [x] Show transaction type first, followed by reference, assigned auditor, status, and latest action date. Selecting the reference opens the transaction and offers a way back to its project.
- [x] Remove the standalone Transactions navigation item, the transaction search and filter controls, and the View transactions button. Keep contractor browsing and project search available on Projects, including search by obligation request reference.
- [x] Keep New transaction on the selected project with that project preselected. Verify that newly registered Pending and Under Audit transactions appear under their project and that saving project details keeps the transaction list visible.
- [x] Auditors and supervisors can open another auditor’s transaction. Administrative staff can see the project’s transactions and open their restricted summaries and Movement history. Verify that transaction Audit history remains available to audit roles and that voided transactions remain accessible for history without appearing as active work. Continue recording project corrections in history.

## Answer

Projects now shows linked transactions below Project details for audit roles and below the project heading for administrative staff. The standalone Transactions page and its controls were removed. Opening a transaction provides a way back to its project. Voided transactions are available in a collapsed section on their project. Project corrections are still recorded. Audit roles can inspect transaction history on each transaction.

The Lean MVP specification now describes project-scoped transactions in FR-02, FR-07 and AC-01. PostgreSQL integration and Chromium workflow verification passed.
