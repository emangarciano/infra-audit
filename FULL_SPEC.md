# PACCO Infrastructure Audit Documentation System
**Strategic kernel and implementation handoff · 23 November 2026 · Version 1.0**

**Status:** Product decisions closed for a first implementation. Existing PACCO checklists, Excel calculation templates, and approved printed forms must be supplied before their exact contents can be configured and validated. This document does not claim independent legal or regulatory verification.

## 1. Problem

### Present reality
PACCO infrastructure audit records are maintained in individual auditors' Excel workbooks. Administrative staff usually receive transactions, but subsequent recording responsibilities vary. Project and transaction status information is dispersed; suspensions, resubmissions, certification, and their reasons are not consistently captured. Supervisors cannot reliably monitor pending work or extract comparable operational data, and record recovery currently lacks a dependable backup regime.

### Users and outcomes
Auditors need to find and review any project or transaction quickly, encode document-level details, record suspensions and completion, and prepare the existing paper forms. Administrative staff need to register incoming work, assign an auditor, record resubmissions, and see top-level progress. Supervisors need the same audit access as auditors plus standardized-checklist management and configurable raw data extraction. A technical administrator needs account and recovery controls without application-level audit-record access.

The desired outcome is a single local system of record for the covered **document-audit work**, not for procurement execution, project management, payment, or document custody after audit completion. Physical stamps and signatures remain the actual audit certification; the application records the event and supplies amounts for copying.

### Critical challenge
Make status and supporting information reliably shared and structured **without slowing auditors or imposing complete data entry as a condition of professional judgment**. The design must also handle real-life entry gaps (such as starting with a third billing), project contract changes, overlapping users, and periods when the local server cannot be reached.

## 2. Guiding Policy

Establish a **shared, event-tracked audit register** centered on projects, transactions, and document checklists. The application should make essential actions easier than the current Excel workflow while protecting the history of what auditors actually recorded or certified.

1. **Record the minimum needed, enrich when available.** Only identifying information necessary to create a record is mandatory. Document-specific structured information remains optional unless needed for a particular calculation; incomplete calculations are marked, never invented.
2. **Derive status from explicit audit events.** Do not depend on manually edited status cells. Record suspension, resubmission, resumption, and certification as attributable actions.
3. **Separate facts, suggestions, and certifications.** Project documents determine dated contract inputs; formulas produce suggested amounts; auditors can adjust certified amounts with a recorded reason. Once certified, preserve the original amount and event.
4. **Protect historical evidence.** Snapshots, prior suspension-slip contents, historical billing summaries, action timestamps, and change histories are not silently rewritten.
5. **Keep the audit boundary narrow.** Five specified transaction types only; no scanned attachment repository, payment tracking, general construction operations, dashboards, management reports, or cloud dependence. Supervisors export raw filtered data for external analysis.
6. **Optimize for simple deployment and use.** One office LAN server, browser clients, offline-first caching on previously authenticated devices, and a small set of user roles. Explicitly acknowledge that full offline activity and permissive personal-device access increase security and reconciliation risks.

**Accepted tradeoffs:** Fixed four-digit PINs, automatic offline authorization of personal devices, up to 30 days of offline authentication, and no verification of disk encryption offer convenience but do **not** provide strong protection against local data compromise. Offline actions may remain unresolved after reconnection, and a browser cache is not a guaranteed backup.

## 3. Coherent Actions

### CA-1 — Standardize the record without overstandardizing auditor judgment
Establish one project register, a single transaction identity, five transaction checklists derived from PACCO forms, and optional structured fields attached to individual document requirements. Permit small, transaction-specific additions, Not Applicable determinations, incomplete records, and auditor adjustments. This makes status and evidence comparable while retaining professional discretion.

### CA-2 — Turn audit movement into shared, attributable history
Provide a shared audit queue; record explicit suspension, resubmission, resume, and Audited events; and retain original suspension slips and certification amounts. Make records visible across auditors, with one assigned auditor for accountability but editing available to other auditors and supervisors. This directly addresses fragmented monitoring.

### CA-3 — Reuse project facts and calculate conservatively
Maintain versioned, effective-dated project documents for contract value, variation orders, duration extensions, work suspension and resumption. Seed new transaction snapshots from project records. Support inline historical billing summaries when earlier transactions do not exist. Calculate only where inputs support the result, and distinguish suggested amounts from what was physically certified.

### CA-4 — Make local resilience practical and visible
Run a single server and database with twice-daily external backups. Cache the application and accessed records for offline work, permit full offline actions under the selected access policy, and resolve consequential synchronization conflicts explicitly rather than silently overwriting audit outcomes. Show the user whether actions are local, synchronized, or in conflict.

### CA-5 — Prove correctness before replacing Excel
Pilot real transactions with selected auditors while Excel remains the official record. Compare calculations against PACCO's existing workbooks, printed forms against approved specimens, event and permission behaviors against defined tests, and backup restoration against a controlled recovery exercise. Expand only after acceptance tests pass.

**Order:** CA-1 establishes the record model; CA-2 makes it operational; CA-3 makes amounts useful; CA-4 makes the selected operating model viable; CA-5 validates all four together. These are strategic workstreams, not a technical feature backlog.

## 4. Implementation Specification

### 4.1 Product, environment, and scope

**Product:** PACCO Infrastructure Audit Documentation System — a locally hosted browser application with an ExpressJS server and PostgreSQL database on a dedicated office server accessible over the local area network. No cloud service or required internet connection. A progressive-web-app (PWA) client provides cached and offline use.

**Covered transactions (exactly five):**
- BAC documentation (one package per audit transaction, including award, contract, Notice to Proceed, and the PhilGEPS Certificate of Posting);
- Advance payment;
- Progress billing;
- Final billing;
- Retention claim.

**Excluded:** Actual payment or release tracking, financial disbursement processing, construction progress monitoring outside supporting audit data, full electronic document storage/scanning, procurement or project execution, any post-Audited routing, management dashboards, analytics or built-in reporting, and integrations requiring external internet services. Project-level approved orders are recorded only for their relevance to audit facts and calculations.

**Source materials:** Actual PACCO-approved Excel formulas, audit checklists, suspension slips, and BAC transmittal specimens are configuration inputs; exact field catalogs and layouts may not be guessed. Use a versioned local configuration seeded from these materials. Changes to PACCO source forms require deliberate version updates.

### 4.2 Access and responsibility

| Capability | Administrative staff | Auditor | Supervisor | System administrator |
|---|---|---|---|---|
| Create minimal project; see top-level project and transaction data | Yes | Yes | Yes | No |
| Register transaction, choose assigned auditor | Yes | Yes (self-assigned by default) | Yes | No |
| Record transaction resubmission | Yes | Yes | Yes | No |
| Read detailed checklists, documents, financials and history | No | Yes, all projects | Yes, all projects | No |
| Edit audit records, project orders, checklist responses | No | Yes | Yes | No |
| Suspend, resume, certify as Audited; print audit outputs | No | Yes | Yes | No |
| Add transaction-specific checklist requirements | No | Yes | Yes | No |
| Manage standard checklist versions | No | No | Yes | No |
| Void/archive/reactivate valid archives; resolve sync conflicts | No | Yes | Yes | No |
| Filter and export raw data; select real names or codenames | No | No | Yes | No |
| Create/deactivate accounts and roles; administer backups/restores | No | No | No | Yes |

One auditor is recorded as **assigned** to each transaction. Administrative staff may assign at intake; an auditor creating a transaction is assigned automatically. Reassignment is permitted to authorized operational users and recorded as an action; **assignment never restricts another auditor or supervisor from editing**. A supervisor may certify using their own identity. The certifying actor is always the logged-in auditor or supervisor who performs the Audited action, never a user selected on someone else's behalf.

System-administrator restrictions are enforced by the application. An administrator with direct operating-system/database privileges may still technically access raw data; application permissions cannot eliminate that infrastructure-level capability.

### 4.3 Records and sources of truth

Use immutable unique identifiers, explicit created/updated timestamps, actor IDs, and revision numbers. Necessary logical records:

| Record | Required meaning |
|---|---|
| Project | Minimal identity/title on creation; contractor and procurement/contract facts as available; active, archived or voided lifecycle |
| Project document | Typed document and optional structured fields; issue/effectivity date; recorded source and versions; e.g., contract, variation order, extension, work suspension, resumption |
| Transaction | Project reference; one of five types; assigned auditor; work/billing dates where relevant; current status derived from events; lifecycle flags |
| Document checklist | Snapshot of the applicable standard template version plus any transaction-specific requirements; document-level data |
| Checklist item response | Checked / Unchecked / N/A; optional standardized deficiency reason or free-text Other and remarks; modification history |
| Audit event | Creation, suspension, resubmission, resume, certification, correction, reassignment, void, archive/reactivation, and conflict resolution; actor; actual action date and system recording timestamp |
| Historical billing summary | Previous billing details entered *inside a current transaction* for calculation continuity, not an independent auditable transaction |
| Financial calculation snapshot | Inputs, data-source versions, formula version, suggested figures, missing-input indicators, auditor override and reason, certified amount where applicable |
| Issued form snapshot | Immutable contents, template version, form identity, action/issue timestamp and actor for each suspension slip or BAC transmittal |
| Sync operation/conflict | Client-generated stable operation ID, originating device/user, source revision, queued time, sync result, conflict decision and preserved competing actions |
| Pseudonym mapping | Stable contractor and auditor codenames stored in a separate access-restricted server file, not published in ordinary data exports |

**System-of-record rules:** The server's PostgreSQL database is canonical once synchronized. A client offline queue is local and *provisional* until server acceptance. An accepted audit certification retains its original certified amount and document snapshot even when later facts change. Changes are append-audited; no hard deletion from normal operational UI. Timestamp history keeps both the declared real-world date and the actual recording time. Late/backdated entries do not retroactively reorder status transitions; conflicting dates are flagged.

**Lifecycle controls:** An invalid record may be Voided; its financial effect is removed from future calculations, but its content and history stay available. An Archived valid project or transaction is omitted from ordinary active lists and can be reactivated. Archiving a project with unfinished audits produces a warning; its pending transactions **remain in the active audit queue and editable**. Voiding a project leaves related transactions readable as historical evidence, but no longer editable. Void events are preserved and are not automatically reversed. Voided items do not contribute to later computations.

### 4.4 Transaction workflow and status contract

**Creation:** Administrative intake can create a minimal project, register a transaction, and assign an auditor. Alternatively an auditor chooses **New → Transaction type**, supplies minimal project/transaction identifiers, and is assigned automatically. Creating a project alone does not create an audit status. **Every new transaction starts Under Audit**, including one registered by administrative staff. On entry, show possible duplicates and links to inspect them, but permit explicit continuation.

**Statuses and permitted transitions:**

| Current | Action | New |
|---|---|---|
| Newly created | Create transaction | Under Audit |
| Under Audit | Suspend and confirm | Suspended |
| Suspended | Record resubmission | Resubmitted |
| Resubmitted | Auditor/supervisor clicks **Resume Audit** | Under Audit |
| Under Audit | Auditor/supervisor clicks **Mark Audited** and confirms | Audited |

Repeat suspension/resubmission cycles may occur. **Audited is the final audit status**, with no later dispatch/payment transition. Post-audit data corrections do not rewrite the certification event or change Audited; they can produce discrepancy flags. Void and archive are *separate record lifecycle flags*, not extra audit statuses. Backdated entries retain the established state sequence.

**Checklists:** Each transaction starts with a versioned standard checklist; auditors may add transaction-specific legally relevant requirements. Each item is initially Unchecked, may be Checked or N/A, and holds optional typed detail fields. A present-but-defective document remains **Unchecked**; the auditor can choose an optional standardized deficiency reason or Other with text, plus optional remarks. Items marked N/A are excluded from noncompliance and suspension-slip items. Supervisors alone edit the *master* checklist; their new versions apply to **new** transactions only. Earlier transaction snapshots never change silently.

**Suspend:** Display all unchecked applicable requirements in a confirmation dialog. Every such item is included in the suspension; per-item reasons and remarks are optional. Confirming appends a suspension event, sets Suspended, saves an immutable slip snapshot and opens a printable slip matching the PACCO form. On resubmission, preserve the checklist and all prior slip contents; any authorized intake recorder can log Resubmitted. Explicit Resume Audit is needed to resume, after which prior assessments can be updated.

**Mark Audited:** Show the calculated certified amount in figures and words with keyboard-accessible copy actions for advance, progress, final and retention transactions; BAC has no amount-copy requirement. The auditor may adjust the figure, entering a reason. When required financial inputs are missing, show an Incomplete Calculation indication and the missing fields, and allow manual amount entry. If applicable checklist items remain unchecked, show a warning and **require a justification but do not block certification**. On confirmation, preserve certifying logged-in user, real-world certification date, system timestamp, certified amount snapshot and any exception explanation. If a subsequent correction changes a suggested figure, display **Original certified amount / Current corrected calculation / Difference**, without altering the certification.

**Outputs:** Suspension of any of the five transaction types produces a **suspension slip only**. BAC documentation **Audited** produces a **transmittal**. No transmittals for the other four transaction types and no BAC transmittal upon suspension. Use existing PACCO templates. Snapshots preserve the content as issued, including the requirement list, reasons, calculated amounts when present, issuer and template version; reprints never silently substitute the latest checklist. Use print-ready HTML/PDF generation from the immutable snapshot; no scanned or uploaded document repository is introduced.

### 4.5 Projects and contract events

A BAC transaction normally begins the project's record; later transactions may nevertheless start a project directly, including a third billing with no earlier transactions encoded. Do not require completion of a BAC transaction before creating billings.

Relevant contract and order information belongs to **project-level documents**, not to a billing transaction: original contract, variation order, extension order, project work suspension, and resumption order. Encoding a document makes its data available to project calculations according to its issue/effectivity date. It is not conditioned on the audit status of another transaction. Edits to such records preserve versions and actors. The project keeps an event register derived from those documents; users should not have to type the same change into a second register.

A new billing captures a **transaction-specific snapshot** of the project values used. Later project corrections may recalculate its *current suggested amount if unaudited*; an audited transaction retains its original calculation/certification and receives a discrepancy flag. An order issued during a billing period applies to that billing under the selected rule: include it when its issue/effectivity date is no later than the billing period end. A billing ending before issue is unaffected. Prior billings are not silently repriced.

Compute the project's revised completion date from contract commencement/duration and approved time adjustments, displaying contributing event dates and any auditor override with a reason. Track work suspensions and resumptions, but **do not automatically treat suspended days as a contract extension** unless the PACCO source calculation rules or an approved document authorize the adjustment. Where the official day-count basis is unavailable, show the calculation as incomplete and retain the entered approved date.

### 4.6 Financial rules

Use Philippine peso with decimal-safe arithmetic, storing amounts to centavo precision and percentages at sufficient precision for the source PACCO formulas. Avoid binary floating-point money calculations. Identify the source document, time basis, formula version, overrides and missing inputs.

**Progress/final billing gross suggestion:**

`Applicable revised contract amount = original contract amount + applicable signed variation amounts, each effective on/before the billing period end`

`Cumulative accomplishment = sum of earlier billings' incremental accomplishment percentages + current billing's incremental percentage`

`Suggested current gross = round(cumulative accomplishment × applicable revised contract amount, 2) − sum of earlier billings' recorded gross amounts`

Use prior amounts **as actually recorded for previous billings**, not recomputed using today's revised contract amount. Historic summaries carry incremental percentages, period/date, prior gross, deductions when available, and net amount when deductions are unavailable. They live *inside the current transaction*; they are not displayed as separate active transactions or assumed to have been audited in this app. Prefer a real recorded prior transaction where present; otherwise use the supplied summary. Avoid counting the same prior billing twice. If a later full transaction disagrees with a snapshot, preserve the snapshot and flag the discrepancy rather than silently switching sources.

Contract terms and encoded advance-payment documents supply the available parameters for retention, advance-payment recoupment and other deductions, using the **actual approved PACCO formulas** when supplied. Auditor adjustments to calculated deductions or final certified amounts require a reason and history entry. If only prior net figures are known, do **not** infer unknown gross or deduction breakdowns; identify incomplete calculations and permit manual certified entry.

**Retention claim:** Suggested available retention = sum of recorded retention withheld from prior billings − sum of **previously audited** retention claims (excluding voided items). Pending retention claims trigger a warning but are not deducted; actual payment is not tracked. Historical summaries can contribute **only known retention amounts**. A missing withholding breakdown is an incomplete-input warning, not a zero. Allow auditor adjustment with a logged reason and preserve the original certified claim upon Audited.

**Changes/voiding:** Project document edits and voiding of a prior financial transaction automatically recalculate affected *unaudited* transactions. Preserve original values for audited transactions and flag differences. Calculations from unsynchronized offline data must show the age/source of the local snapshot and be reconciled before server acceptance.

### 4.7 Search, exports, and operator experience

Provide a **shared audit queue** showing project, transaction type, assigned auditor, status, dates, elapsed time from recorded events, and relevant warnings, filterable by project, auditor, type, status and date. Pending transactions of archived projects remain in the queue. Provide search for all projects/transactions, a project summary and event history, and a focused transaction work page with checklist, optional document fields, financial calculation panel, action history, and large Suspend / Resume Audit / Mark Audited actions as appropriate.

An administrative user sees only project/transaction summaries, statuses and movement history, not detailed checklists, audit assessments, financial working fields, slips, or transmittals. Display *offline/sync state* prominently: Online, Offline, Pending sync (count), Syncing, Conflict, and storage failure. Do not visually represent an offline action as already accepted by the server.

Auditors and supervisors must be able to complete principal flows entirely via keyboard: tab/shift-tab navigation, labeled inputs, predictable focus, dialog confirmation/cancellation, checklist operation, copying certified amounts and printing. Default UI should require fewer file-navigation and duplication steps than individual Excel workbooks. Support modern desktop Chromium browsers initially; graceful narrow-screen behavior is useful but not a separate mobile app requirement.

Supervisors may select fields, filters and real-name/codename output before exporting raw records. Support nested information (documents, checklist responses and event histories) through separate worksheets or appropriately flattened rows rather than dropping data. Deliver a spreadsheet-compatible local file; do not generate dashboards or analytic reports. Codenames must be stable across exports. Keep the contractor/auditor mapping in a separate access-restricted server file, with continuity included in backup/recovery procedures. Protect against spreadsheet-formula injection in exported user text. Log who exported what scope and whether actual names were included.

### 4.8 Offline and synchronization contract

**Client model:** Service worker caches versioned application assets; IndexedDB caches previously accessed records and queues actions. An optional **Make Available Offline** action prefetches a chosen project and its related transactions/documents. Cache only permitted records for the authenticated user. Request persistent browser storage where supported and show a warning if unavailable. Neither browser storage nor a user's personal device is a substitute for server backup.

**Connectivity prerequisite:** The LAN application must use a browser-trusted **HTTPS origin** for PWA/service-worker behavior; plain HTTP on another computer's LAN address is not enough. Arrange local TLS/certificate trust without using a cloud service. Personal devices must complete online authentication and an initial cache/install while on the LAN before they can work offline. These are browser platform constraints, not optional product choices.

**Authentication:** Username plus fixed **four-digit PIN**; store server PIN verifiers using a modern salted password hash, not plaintext. After five failed PIN attempts, block login for 15 minutes. Expire online and offline sessions after 60 minutes of inactivity. A previously authenticated device may authenticate offline for **up to 30 days** after its last successful online authentication. An online login authorizes that device for offline access automatically, including personal laptops. No second passphrase, administrative device approval or disk-encryption verification. The selected policy relies on OS/device security and accepts that a compromised or unlocked device can expose browser-stored records; offline-revoked users may remain able to access cached data during their remaining offline-validity period. Never imply the four-digit PIN provides encryption-strength protection.

**Offline scope:** Permit cached viewing, creation/edits, checklist actions, suspension/slip generation, resubmission, resumption, audit certification/transmittal generation, archiving and voiding. Save actions locally with durable unique operation IDs, original server record revision, device ID, actor identity, local occurrence date/time, and the immutable local form/certification snapshot. Offline completion is **local pending sync** until server acceptance. Reject or hold locally incomplete financial calculations using the same warnings and manual-entry alternatives as online.

**Synchronization:** On reconnection, authenticate online, fetch authoritative revisions, and transmit pending operations **idempotently** in their original local action order. Server validates role, business rule, snapshot dependencies and version before applying each operation. Nonconflicting operations merge in record history. Conflicting changes (especially simultaneous suspension, certification, voiding, project-value changes, or access revocation) are **not last-write-wins** and do not silently overwrite accepted events. Any auditor or supervisor may review the competing actions and choose an explicit resolution; preserve both proposed actions and resolution history. Server state remains unchanged for the disputed operation until resolved. Flag any previously printed offline forms whose data or status was not accepted by the server; physical documents may require manual correction outside the application.

**Offline limits/failure:** Data cached on a device may be missing or stale. The application must not fabricate inaccessible project data, pretend unvisited records are present, or imply sync has completed. If browser storage fails or is cleared, show an error; unsynchronized local actions may be irrecoverable. A server backup cannot restore actions that never synchronized. When device time is inaccurate, preserve both the claimed action time and server receipt time and flag discrepancies. Unsupported private/incognito browsing or missing service-worker/IndexedDB capability disables offline mode cleanly.

### 4.9 Security, audit history, backup, and recovery

Enforce all online authorization on the server, including account deactivation, exports and administrator separation. Treat cached permissions as provisional and revalidate at synchronization. Record every state-changing action with actor, both relevant times, record revision, before/after changes where appropriate, and stated override/void/resolution reason. Audit-history edits through ordinary application functions are forbidden. Use LAN-only exposure, standard session protections and role checks. The operational security policy should explicitly disclose the accepted PIN/personal-device risks before pilot use with actual confidential data.

On the server, automatically create a consistent PostgreSQL database backup **every day at 12:00 and 4:30 PM Asia/Manila** to a dedicated external drive or network storage separate from the server. Keep backups **30 days**, verify completion/integrity, retain failure logs, and surface failed backup status to the system administrator. Include restoration-critical assets/configuration and stable pseudonym mapping under the same recovery procedure. Protect storage access from ordinary users.

System administrator alone may initiate **full** restoration, without supervisor approval. Before replacing the active database, create a safety copy of its current state; stop or gate writes, verify backup integrity, restore the full data set and configuration as a consistent unit, then validate project counts, histories and access before reopening. Do not offer partial project/transaction restore in v1. Clearly note that client-offline pending actions are outside the server backup and must be reconciled separately after restoration.

### 4.10 Error handling and invariants

- **No silent data loss:** Rejected or conflicting saves retain user-entered data and show a concrete recovery path. Online concurrent edits use revision checks and return a conflict rather than overwriting.
- **No false certification:** An audit action is never attributed to a different user, and physical signature/stamp is not electronically created. An offline Audited event is visibly pending until synchronized.
- **No silent history mutation:** Suspension slips, past certification figures, and original historical billing summaries remain as originally recorded. Corrections and differences are additional records.
- **No invented arithmetic:** Missing financial inputs produce explicit incomplete flags; zero is not substituted for an unknown value. Money uses decimal rounding consistent with the source PACCO templates.
- **No hidden work:** Pending transactions under archived projects remain searchable and in the audit queue; transactions under voided projects remain readable but not editable.
- **No duplicate applications:** Replayed sync operations and retried requests have the same result as a single accepted operation. Duplicate record detection warns but allows a deliberate duplicate.
- **No false availability:** Unavailable LAN, expired offline authorization, unsupported storage, and storage exhaustion have distinct visible errors.

### 4.11 Acceptance criteria and verification

| ID | Verifiable condition | Action(s) |
|---|---|---|
| AC-01 | Administrative user can create a minimal project and transaction; auditor can directly create a self-assigned transaction; both begin Under Audit; duplicate warning does not hard-block | CA-1/2 |
| AC-02 | All five transaction types load correct versioned PACCO checklists; Checked, Unchecked and N/A work; optional fields never block certification | CA-1 |
| AC-03 | Suspend includes every unchecked non-N/A item; reasons remain optional; slip matches the approved form; reprinting after checklist changes preserves originally issued contents | CA-1/2 |
| AC-04 | Suspended → Resubmitted → Under Audit requires an explicit Resume Audit; repeated cycles preserve prior checklist assessments and action history | CA-2 |
| AC-05 | Mark Audited warns on unchecked applicable items and records justification; manual certified amount allowed when inputs are missing; original amount and certifier remain immutable after later corrections | CA-2/3 |
| AC-06 | BAC Audited produces only its approved transmittal; BAC Suspended produces only a slip; other transactions never produce a transmittal | CA-2 |
| AC-07 | A third billing can be encoded using minimal contract data and two embedded historical summaries; percentage and gross calculations avoid double counting | CA-1/3 |
| AC-08 | A variation order issued during a billing period affects that billing's suggestion, not earlier-ending billings; original audited amounts do not change | CA-3 |
| AC-09 | Advance, progress, final and retention calculation fixtures match PACCO's supplied validated spreadsheets to the centavo; any unsupported source inputs show incomplete warnings | CA-3/5 |
| AC-10 | Previously audited retention claims reduce available retention; pending claims warn but do not reduce it; voided amounts are excluded | CA-3 |
| AC-11 | All auditors can edit any active audit record; admin staff cannot see details; only supervisors manage standard checklists and export; administrator cannot access audit UI | CA-2/5 |
| AC-12 | Supervisor filtered export includes requested record fields and stable codenames; real-name option works; pseudonym mapping not leaked with pseudonymized data | CA-2/5 |
| AC-13 | While offline, a cached project can be edited, suspended, printed, certified and queued; reconnecting synchronizes exactly once, or clearly exposes a conflicting operation | CA-4 |
| AC-14 | Two contradictory offline/online audit actions are retained as distinct proposals; an authorized auditor or supervisor resolves them without silent overwrite | CA-4 |
| AC-15 | Login enforces a fixed four-digit PIN, five-attempt/15-minute lockout, 60-minute inactivity expiry and 30-day offline validity; account revocation is enforced upon reconnection | CA-4 |
| AC-16 | Automated 12:00/16:30 backups are independently restorable; 30-day retention is applied; full restore creates a safety copy and passes data-integrity checks | CA-4/5 |
| AC-17 | Pilot reproduces all critical workflow cases with real work while Excel stays official; signed-off calculation fixtures, print comparisons, conflict tests and restore tests all pass before office-wide activation | CA-5 |

**Testing approach:** Unit tests for status transitions, dates, decimal computations, retention and historical-source precedence; integration tests for permissions, concurrent edits, replay/idempotency and database restoration; offline browser tests for airplane/disconnected scenarios, storage denial, expired login and contradictory certifications; printed-form visual comparisons using actual PACCO specimens; and task-based usability tests demonstrating complete keyboard-only operation and fewer manual file-handling steps than Excel. Do not use only happy-path tests.

### 4.12 Implementation sequencing and delegation

1. **Collect source fixtures:** PACCO checklists, actual sample Excel formulas/transactions (with sensitive data removed), suspension-slip template, BAC transmittal specimen, and agreed work-day/calendar-day basis. Record versions. Do not invent unprovided fields/formula variants.
2. **Build core local system:** authentication/roles, project and transaction registers, audit event log, status queue, search and optimistic concurrency; implement lifecycle flags.
3. **Add audit work pages:** document checklists and snapshots, optional document data, suspension/resubmission/resume/Audited flows, and immutable form contents/printing.
4. **Add project/financial rules:** project document events, effective dates and contract snapshots, billing histories, calculation engine, adjustments and discrepancies, retention claims, and reference-template fixtures.
5. **Add export and recovery:** supervisor field/filter export, stable codename mapping, scheduled external backups, administrator restoration and verification.
6. **Add offline PWA and sync:** LAN HTTPS certificate setup, caching, offline PIN policy, queued actions, idempotent sync and conflict resolution. Test on at least one office computer and one personal laptop.
7. **Pilot and accept:** parallel real-case testing against Excel and PACCO forms, repair defects, run recovery exercise, then enable office-wide use after all critical acceptance criteria pass.

The implementation agent may choose UI framework, database tables, migration tooling, form-rendering library, queue mechanism, caching library and test frameworks, subject to the stated behavioral contracts and the selected **ExpressJS + PostgreSQL + LAN + browser/PWA** environment. Do not introduce external cloud services, a separate distributed backend, generic workflow engines, document uploads or management dashboards.

### 4.13 Explicit assumptions, material risks, and handoff status

**Assumptions/defaults closed without further interview:** Use Philippine locale and peso; desktop-first browser UX; default real action date is today's local date but can be adjusted; automated server backup failures alert the system administrator; only accepted synced actions become canonical server history; any auditor/supervisor can reassign a transaction with attribution; no bulk import of historical Excel data in v1 (lightweight inline summaries provide continuity); archived records can be reactivated, voided records remain invalid; no hard physical-document chain-of-custody tracking after Audited.

**Material risks accepted by user:** Four-digit PINs and 30-day offline login on automatically authorized personal devices without encryption checks provide weak confidentiality and difficult revocation when disconnected; browser data can be removed or accessed outside app controls; offline contradictory printed certifications may require real-world reconciliation. LAN HTTPS certificate trust is mandatory to support service workers on client laptops. These constraints should be acknowledged before using actual confidential transactions during the pilot. Technical mitigations must not be represented as eliminating the risks.

**Reference-dependent work not yet verifiable:** Exact PACCO document names and conditional applicability, document-specific fields, deduction formulas, day-count methodology, certificate amount wording style, and approved printed-layout fidelity require the source materials. If those artifacts disagree or are internally inconsistent, record the discrepancy for PACCO resolution rather than silently choosing a rule.

**Handoff:** Architecture, scope, roles, workflows, status/event semantics, offline behavior, preservation rules, and quality targets are ready for implementation. Reference-derived checklist definitions, arithmetic rules beyond those expressly specified here, and final form layouts remain **blocked on actual PACCO source fixtures**. The project is suitable for immediate foundational development and template-configuration work once materials are available.

---
**Reference:** [PACCO Infra Audit Documentation Procedure (Notion)](https://app.notion.com/p/421e7f788d568064aba0da5622db71eb)

**Technical platform notes:** [MDN — secure contexts](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Secure_Contexts); [MDN — service workers](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers); [MDN — storage quotas and eviction](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria).
