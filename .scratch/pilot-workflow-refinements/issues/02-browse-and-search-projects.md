# 02: Browse projects by contractor and search across the register

**What to build:** Open the Projects page at the contractor list. Let users browse a contractor's projects or find a project across the entire register from a search bar that stays visible throughout. Let users optionally capture an obligation request reference on a transaction so its linked project can be found.

**Blocked by:** None (can start immediately).

**Status:** resolved

- [x] Projects opens at the contractor list. Choosing a contractor shows its projects and offers a way back to the contractor list. Older projects with no contractor appear under **No contractor recorded**. Project results open the corresponding project.
- [x] The search bar stays visible at both levels. A trimmed, case-insensitive partial match runs after a short typing pause without pressing Enter. Results span all contractors, including when a contractor is selected. Clearing search restores the browse level the user was on. Show distinct empty-register and no-match states, and prevent older searches from replacing newer results.
- [x] Search matches the project name, the distinct project reference when available, and obligation request references on linked transactions. A project appears once even when several records match. Older projects remain findable by their stored names.
- [x] Administrative staff, auditors, and supervisors can optionally record an obligation request reference when creating a transaction. Store it separately from the transaction's existing reference and validate it on the server. Leaving it blank allows registration. Older transactions have no inferred obligation request reference. An authorized correction records changes using the existing revision and audit-history rules.
- [x] Browsing and search honor existing register permissions. Administrative users can find and open a project summary through an obligation request match. Search results expose project identification and contractor within those permissions.
- [x] Provide the same browsing and search behavior for reuse in the project picker. If ticket 01 lands later, it supplies and connects the distinct project reference. If ticket 01 has already landed, include reference matches in this ticket.
- [x] Update §4.3 with the optional transaction field and FR-01/FR-02 with the entry, browsing, and search behavior. Verify each search input independently, including a cross-contractor match and an obligation request linked to a project with multiple matching transactions.

## Answer

The Projects page groups records by contractor and shares its browse and search component with future project picker work. A migration adds a nullable obligation request reference to transactions, and authorized corrections use the existing revision and audit history.

Verification on PostgreSQL passed all 14 tests, including independent name, project reference and obligation request searches, deduplication, permissions, correction history and legacy records. A headless Chromium run verified contractor navigation, the legacy contractor group, staff entry, cross-contractor search, clearing search, a delayed response and opening the matching project summary.
