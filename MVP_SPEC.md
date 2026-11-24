# PACCO Infrastructure Audit Documentation System — Lean MVP
**Version:** 0.1 · 23 November 2026  
**Purpose:** A narrow pilot build, extracted from the full PACCO specification. This is a separate scope, not a replacement for the full specification.

## 1. Problem

PACCO auditors maintain infrastructure-audit records in individual Excel files. Administrative staff receive transactions, but the status of work, reasons for suspension, and resubmission history are not consistently visible to everyone. Supervisors cannot reliably see what is pending or why. The first useful outcome is **one shared, trustworthy view of all current audit transactions**, without requiring auditors to reconstruct old records or complete extensive forms.

The MVP succeeds if a real transaction can be registered, reviewed against a simple checklist, suspended and resubmitted as needed, marked **Audited**, and found by another authorized user with its complete action history. Excel remains the official working record during the pilot.

## 2. Guiding Policy

**Build a shared transaction register and event history first; defer audit automation.** Prioritize daily status visibility, minimal data entry, and faithful suspension records. Do not make financial calculations, full document capture, offline synchronization, or management analysis prerequisites for using the system.

Operating principles:

1. **Few mandatory fields.** Create projects and transactions with minimal identifying data; allow details to be added later.
2. **Actions determine status.** Status is derived from recorded audit events, not a freely editable field.
3. **Preserve evidence.** Record the actor, actual action date, system timestamp, and prior state; never silently overwrite an issued suspension slip or certification record.
4. **Keep the legal decision with the auditor.** The application records—not performs—the physical audit certification. Incomplete checklist items trigger a warning, not a hard block.
5. **Run entirely on the office LAN.** No cloud, document upload repository, mobile app, or offline-first client in MVP.

## 3. Coherent Actions

**CA-1 — Establish a common register.** Replace scattered status views with one project register and transaction queue spanning the five agreed audit types. Permit administrative intake and auditor-created transactions, with one assigned auditor per transaction but shared auditor access.

**CA-2 — Capture the actual audit lifecycle.** Provide a simple transaction work page with a requirement checklist and explicit Suspend, Resubmit, Resume Audit, and Mark Audited actions. Each action creates permanent, attributable history. Generate suspension slips from unchecked applicable items.

**CA-3 — Prove usefulness without replacing Excel yet.** Pilot with a small group of auditors, using real transactions while retaining Excel as the official record. Validate that users can find pending work, distinguish suspension from resubmission, and reproduce suspension information accurately.

**CA-4 — Protect the one shared database.** Provide role-based access, conflict detection for concurrent edits, scheduled backups to storage outside the server, and a tested full-restore procedure. These are minimum safeguards, not optional post-MVP enhancements.

**Sequence:** CA-1 → CA-2 → CA-4 → CA-3. Do not expand into financial automation until the pilot demonstrates that shared status tracking is useful and reliable.

## 4. Implementation Specification

### 4.1 Product and strict scope

A browser-based application hosted on one dedicated office LAN computer/server, using **ExpressJS and PostgreSQL**. Users access it through their browsers on the LAN. No Internet connectivity is required for application operation.

**Supported transaction types:** BAC documentation, advance payment, progress billing, final billing, and retention claim. BAC documentation is one audit package, through the PhilGEPS Certificate of Posting.

**In scope:** Basic project/transaction records; assigned auditor; shared status queue; simple checklists; suspension with immutable printable slip; resubmission; explicit audit resumption; audit completion; searchable history; minimal role control; concurrent-edit protection; backup and restore.

**Explicitly deferred:** Full offline/PWA caching and synchronization; financial formulas and automatic certified amounts; project-level variations, extensions and construction suspension/resumption calculations; historical billing summaries; retention-balance computations; document-specific field catalogs; sophisticated checklist-version editing; BAC transmittal generation; filtered raw-data export and pseudonyms; archiving and project-level voiding; automatic propagation of project financial changes; PDF/image document attachments; dashboards; and integration with other government systems. These are **deferred, not rejected**.

### 4.2 Actors and permissions

| Role | MVP permissions |
|---|---|
| Administrative staff | Create minimal projects and transactions; assign an auditor; record resubmission; view project/transaction summaries, statuses and movement history only |
| Auditor | View all projects and detailed transactions; create transactions (self-assigned by default); edit any transaction's checklist/details; suspend, resume and mark Audited; record resubmission; print suspension slips |
| Supervisor | Same audit permissions as auditor; view all records |
| System administrator | Create, deactivate and assign user roles; maintain backups and run restoration; no application-level access to audit contents |

Use **username + fixed four-digit PIN**; lock an account for 15 minutes after five failed attempts; end sessions after 60 minutes of inactivity. PIN verifiers must be securely hashed. Account provisioning may use a simple local administrator command or script rather than a dedicated management screen in the MVP. Enforce authorization on the server.

### 4.3 Minimum data

- **Project:** generated ID, project name, distinct project reference, contractor, contract amount, optional contract date/duration, and created/updated metadata. The name, reference, contractor and amount are required for new projects. Existing projects retain their IDs and names and remain usable with any missing reference, contractor or amount left unset.
- **Transaction:** generated ID, project ID, one of five types, short reference/title, optional obligation request reference, date received or created, assigned auditor, current derived status, optional notes, record revision.
- **Checklist item:** transaction ID, requirement label, state (**Unchecked**, **Checked**, **N/A**), optional reason/remarks, optional custom-item marker.
- **Audit event:** transaction ID, action type, actor, actual action date, system timestamp, previous/new status, optional remarks, recorded snapshot where relevant.
- **Suspension slip:** immutable snapshot of the suspension event, unchecked applicable requirements, optional per-item reasons/remarks, and the issuing identity/date.
- **Audit completion:** logged-in auditor or supervisor, actual certification date, timestamp, optional manually entered certified amount, any justification for unchecked items.

A transaction can be created without complete BAC documentation or previous billing transactions. No historical financial reconstruction is required. Do not invent absent amounts or claim calculations were performed.

### 4.4 Core workflows

**FR-01 — Create project and transaction.** Administrative staff, auditors and supervisors create a project with a project reference, project name, contract amount and contractor. Contract date and duration are optional. Warn on matching project references and on matching names when the existing project has no reference. Allow creation after explicit confirmation. Auditors and supervisors can correct the reference and name independently with revision checks and attributed before/after history. They create a transaction within it by selecting type and minimal identifiers. Administrative staff, auditors and supervisors can enter an optional obligation request reference separately from the transaction reference/title. Auditors and supervisors can correct it using the transaction revision and attributed before/after history. Administrative staff choose an assigned auditor; an auditor creating one is assigned automatically. A transaction starts **Under Audit** immediately. Warn on likely duplicates, but do not block creation.

**FR-02 — Shared queue and search.** Show project, type, reference, assigned auditor, status and latest action date. Filter by status, transaction type, project and assigned auditor. Search by project title/reference or transaction reference. The Projects page opens at the contractor list and lets users open a contractor’s projects or return to the list. Projects without a contractor appear under **No contractor recorded**. At either level, a persistent search field runs a trimmed, case-insensitive partial search across all contractors after a short typing pause. It matches the project name, distinct project reference, or an obligation request reference on any linked transaction, and shows each project once with its contractor. Clearing the search restores the previous browse level. The same browser can be used in a project picker. Auditors/supervisors can open any record; administrative staff see only the restricted summary/history view.

**FR-03 — Simple checklists.** At transaction creation, copy the applicable standard checklist into the transaction if PACCO's current list has been supplied. Seed this list as local configuration; do **not** invent legally required documents. Until lists are supplied, authorized auditors can add requirements manually for controlled testing. Auditors can add transaction-specific items, mark items Checked or N/A, and leave all others Unchecked. A defective submitted document stays Unchecked; a reason or free-text remark is optional. Checklist changes are saved with attribution. No master-checklist editor is necessary in MVP.

**FR-04 — Suspend.** From Under Audit, selecting **Suspend** opens a review dialog containing **every Unchecked item except N/A**. Each item may have an optional reason/remark. Confirming creates an immutable suspension event, changes status to **Suspended**, and produces a print-ready suspension slip. Use the PACCO-approved slip layout when supplied. Reprinting the slip must use its saved snapshot, not today's checklist. If no unchecked applicable items exist, explain that there are no document-based suspension grounds recorded; do not issue an empty slip.

**FR-05 — Resubmit and resume.** Administrative staff, auditors or supervisors can record **Resubmitted**, changing Suspended → Resubmitted without resetting the checklist. An auditor or supervisor must explicitly select **Resume Audit** to change Resubmitted → Under Audit. Repeated suspension cycles remain in history.

**FR-06 — Mark Audited.** An auditor or supervisor may mark an Under Audit transaction **Audited**. If applicable items are still Unchecked, warn and require a justification but allow completion. Show an optional manual certified-amount field for non-BAC transactions and convert any entered amount to copyable figures and words; **no automatic calculation** is claimed. Attribute certification to the logged-in actor. Preserve its original value and timestamp. **Audited is the final workflow status**; no payment or outward-routing tracking.

**FR-07 — History and corrections.** Show a chronological audit event feed, including status changes, checklist edits and corrections. Store both user-declared actual action date and server-recorded timestamp. Backdated entries do not silently change current status. Permit authorized corrections to non-final data, recording before/after values. Preserve past suspension snapshots and certification records. Do not implement permanent deletion. Duplicate records can be marked **Voided** by an auditor or supervisor, with a reason, and removed from the active queue; their history remains readable. No project-level void/archive flow in MVP.

**FR-08 — Concurrent edits.** Use record revision checks; if two people modify the same field from an old version, show a conflict and require refresh/review rather than silently overwriting. Keep unsaved form contents visible so the user can copy or reapply changes. No offline conflict reconciliation engine.

### 4.5 Output and operating constraints

- **Suspension slip:** Browser-printable document using existing PACCO wording/layout once supplied; otherwise a clearly marked development-only draft is acceptable, not an officially approved form. A suspension produces exactly one immutable slip snapshot per confirmed event; reprints are allowed.
- **BAC audited transmittal:** Not generated by MVP; staff continue the existing manual procedure during the pilot.
- **Usability:** Desktop-browser first; all primary operations, including checklist edits, dialog confirmation and printing, must be usable by keyboard. Avoid file-folder navigation and Excel-template duplication.
- **Availability:** Online LAN connection required. During server/network outages, auditors continue their established physical/Excel procedure and back-enter actions afterward. They can enter the real action date, separately preserving the later encoding timestamp.
- **Data privacy:** LAN-only access, role checks, no public Internet exposure. Personal-device offline cache and 30-day offline login choices from the full design do **not** apply to this MVP because offline operation is deferred.

### 4.6 Backup and recovery

Run PostgreSQL-consistent backups to a **separate external/network storage device at 12:00 PM and 4:30 PM Asia/Manila every day**, retaining each for **30 days**. Record success/failure in an administrator-accessible log; failed backups must be visible to the administrator. A designated system administrator can restore the entire database without supervisor approval. Before restoration, take a safety copy of the current database, prevent writes during restoration, and verify restoration before reopening the app. Selective recovery is excluded.

### 4.7 Acceptance criteria (MVP release gate)

| ID | Pass condition |
|---|---|
| AC-01 | Administrative staff and an audit user each create a project with just the four required fields. Omitting any required field is rejected, and an older project with missing fields remains usable for new transactions. Administrative staff assign a new transaction, an auditor creates another and is self-assigned, and both appear Under Audit in the shared queue. |
| AC-02 | Any auditor finds and opens another auditor's transaction, while administrative staff cannot access its detailed checklist. |
| AC-03 | Checklists support Checked, Unchecked, N/A and custom items. Suspending includes all and only unchecked applicable items, with optional remarks. |
| AC-04 | A suspension slip can be printed and later reproduced unchanged after checklist edits. Its layout is compared with the supplied PACCO form before official pilot use. |
| AC-05 | A suspended transaction is resubmitted and remains Resubmitted until an explicit Resume Audit; repeat suspension cycles preserve history. |
| AC-06 | Audit completion records the logged-in certifier; unresolved items require a warning and justification but do not block certification; no further workflow status exists. |
| AC-07 | Status/event history preserves user identity, actual event date and recording timestamp; concurrent changes cannot silently overwrite each other. |
| AC-08 | User permissions, four-digit PIN lockouts and inactivity expiration behave as specified. |
| AC-09 | Two daily external backups run successfully; a full restore into a test instance reproduces projects, transactions, slips and audit history, with a safety-copy step. |
| AC-10 | In a limited parallel pilot, auditors can use the system to identify pending/suspended/resubmitted transactions and trace why they are in that state; Excel remains the official working record. |

### 4.8 Implementation order and delegated decisions

1. Implement LAN server, database, authentication and role checks.
2. Implement project/transaction creation, shared queue and search.
3. Implement checklists, status events, suspension slips, audit completion and event history.
4. Add concurrent-edit protection, backup/restore scripts and acceptance tests.
5. Configure the actual PACCO checklists/slip sample and run the **parallel pilot**.

The implementing agent may choose the client UI framework, ORM, migration/test tools and print renderer. Do not add a PWA, sync engine, financial calculation subsystem, reporting platform or document repository “for future flexibility.” Database entities may be designed to support later expansion, but **do not build deferred functionality now**.

**Pilot prerequisites:** The approved PACCO document checklists and suspension-slip specimen must be supplied to test against actual office practice. Their contents must not be fabricated. Development can begin using clearly labeled test fixtures.

**MVP is complete only when AC-01 through AC-10 pass.** The full specification remains the reference for later phases, not a mandate to expand this MVP.

---
**Source:** Full PACCO Infrastructure Audit Documentation System Specification, version 1.0; [PACCO Infra Audit Documentation Procedure](https://app.notion.com/p/421e7f788d568064aba0da5622db71eb).
