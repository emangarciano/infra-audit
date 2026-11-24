# AGENTS.md — PACCO Infrastructure Audit Documentation System

## Current phase

**MVP_STATUS: NOT_DONE**

The **Lean MVP Specification** is the sole source of implementation scope until the MVP is explicitly marked done. The **Full System Specification** is reference material only during this phase.

## Documents and precedence

1. `PACCO_Infrastructure_Audit_Lean_MVP_Specification.md` — **authoritative requirements and acceptance criteria for the current build**.
2. `PACCO_Infrastructure_Audit_System_Specification.md` — **future-state reference only**. Read for background and context; do not implement any feature merely because it appears here.
3. Existing code, tests, and PACCO-approved samples — implementation context. They do not silently expand the MVP.

If the two specifications conflict, **follow the Lean MVP Specification**. If the full specification describes additional behavior not explicitly included in the MVP, treat it as **out of scope**. Do not merge the two specifications into a larger backlog.

## Agent operating rules while MVP_STATUS is NOT_DONE

- Implement **only** capabilities required by the MVP specification, especially FR-01 through FR-08 and supporting requirements in its sections 4.5–4.8.
- Treat MVP's **Explicitly deferred** section as an exclusion list. In particular, do not build offline/PWA synchronization, automated financial calculations, advanced exports, contract-change calculations, document uploads, or other full-system features.
- Use the MVP's stated workflow, permissions, states, constraints, and acceptance criteria even when the full specification offers a more elaborate design.
- Keep implementation simple. Choose routine libraries, schema structure, UI patterns, and engineering tasks autonomously when the MVP delegates them. Do not add speculative extensibility or infrastructure.
- Do not invent PACCO-approved checklists, financial formulas, or form layouts. Use clearly labeled development fixtures until actual approved references are supplied.
- Maintain the pilot boundary: the application runs on the office LAN; Excel remains the official record during the pilot.
- When a request appears to require a deferred feature, **identify it as post-MVP** and do not implement it without an explicit change of scope from the user.
- Do not edit the specifications, this status marker, or the agreed scope without explicit user direction.

## Definition of MVP done

The MVP is **eligible to be marked done only when all AC-01 through AC-10 in the Lean MVP Specification have passed**, with evidence recorded in the project (test output or concise verification notes). Required PACCO-approved checklist/slip references must be obtained and validated for the official pilot; placeholders alone are not sufficient for completion.

**Only the user or an explicitly authorized human project owner may change `MVP_STATUS: NOT_DONE` above to `MVP_STATUS: DONE`.** An implementing agent may report that the criteria appear satisfied and request that status change, but must not mark the MVP done on its own.

## After MVP_STATUS is DONE

The full system specification may be used to **plan and scope subsequent phases**, subject to the user's explicit next instruction. `DONE` does **not** automatically authorize implementation of every full-spec feature. Until a new phase is authorized, avoid extending the product beyond the completed MVP.

## Agent skills

### Issue tracker

Use local Markdown under `.scratch/` to publish or fetch issues and feature specs. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the default triage labels when updating ticket status. See `docs/agents/triage-labels.md`.

### Domain docs

Use the single-context layout when consulting domain terminology and decisions. See `docs/agents/domain.md`.
