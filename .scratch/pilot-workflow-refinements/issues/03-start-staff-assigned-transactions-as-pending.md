# 03: Start staff-assigned transactions as Pending

**What to build:** Administrative staff can register and assign a transaction that waits in Pending until an auditor or supervisor starts the audit. Transactions created by an auditor or supervisor are self-assigned and immediately Under Audit.

**Blocked by:** None (can start immediately).

**Status:** resolved

- [x] The server derives initial status from the creator's role. Registration by administrative staff requires an active assigned auditor and records **Pending**. Registration by an auditor or supervisor uses the logged-in actor as the assignee and records **Under Audit**.
- [x] Newly registered records show the correct status in the queue, transaction summary, and registration movement. **Pending** is available in the queue status filter. The creation form communicates the initial status for the logged-in role.
- [x] Auditors and supervisors can select **Start Audit** on an active Pending transaction, including one assigned to another auditor. The server validates role, current state, and revision. The transition retains the assignment and records an immutable movement from Pending to Under Audit with the actor, actual action date, and recording timestamp.
- [x] Administrative staff can see the movement and cannot trigger it. Pending transactions require Start Audit before Suspend or Mark Audited is available. Resubmitted transactions still use **Resume Audit**. Earlier registration events and existing recorded statuses are preserved.
- [x] Update FR-01, FR-02 and FR-07 to specify registration, transition, and history. Align AC-01 with both creation paths and include the Start Audit transition in verification of AC-07. Verify the permitted and rejected actions, existing-record compatibility, and stale-revision handling.

## Answer

Implemented Pending registration and Start Audit. The PostgreSQL integration suite passed all 15 tests, including role, state and revision checks and legacy registration compatibility.
