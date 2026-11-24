# PACCO Lean MVP planning map

Label: wayfinder:map

## Destination

Hand off a build-ready plan for FR-01 through FR-08 and sections 4.5–4.8 of the Lean MVP, with a route to verify AC-01 through AC-10 and prepare the official parallel pilot.

## Notes

- Read the [Lean MVP Specification](../../MVP_SPEC.md) and [repository instructions](../../AGENTS.md) before working a ticket. Use the full specification for background as directed by the repository instructions.
- Consult the [domain docs guide](../../docs/agents/domain.md). Use `grilling` and `domain-modeling` for discussion tickets.
- Choose the simplest recommendation that satisfies the Lean MVP for each decision ticket. Confirm office-specific facts against supplied references or with the responsible PACCO staff.
- Plan for ExpressJS and PostgreSQL on the office LAN, with Excel as the official pilot record. Leave routine implementation choices to the implementing agent as specified in §4.8.
- Development may use clearly labeled fixtures. For the official pilot, validate the approved PACCO checklists and slip specimen against the application. Record evidence for all ten acceptance criteria in the project.

## Decisions so far

- Intake staff see register fields and movement metadata. Audit details stay with audit roles. [Define the administrative summary and movement history](issues/01-administrative-summary-and-history.md)
- Corrections preserve issued evidence. Duplicate voiding removes the record from the active queue and keeps its history available. [Define corrections and duplicate voiding](issues/02-corrections-and-duplicate-voiding.md)
- The queue shows the latest recorded movement's actual date. History retains both times and follows recording order. [Define the dates shown in the queue and history](issues/03-queue-and-history-dates.md)
- Use one office LAN host, separate backup storage, and an isolated restore rehearsal. [Choose the pilot LAN and recovery setup](issues/05-lan-and-recovery-setup.md)
- Use a small two-case parallel pilot and record evidence against all ten acceptance criteria. [Choose the pilot scenarios and acceptance evidence](issues/06-pilot-cases-and-evidence.md)

## Not yet specified

- Check the approved materials for unclear checklist applicability or slip fields that have no clear Lean MVP source. Chart specific questions once the actual materials are available.

## Out of scope

- This charting effort ends at the planning handoff. Implementation, system deployment, and running the pilot are subsequent work.
- Features deferred in Lean MVP §4.1 stay outside this map, including offline/PWA synchronization, financial calculations, contract-change calculations, document uploads, advanced exports, and BAC transmittal generation.
