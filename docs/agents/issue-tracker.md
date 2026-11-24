# Local Markdown issue tracker

Store feature specs and tickets created by the engineering skills under `.scratch/`. Follow `AGENTS.md` for implementation scope and specification precedence.

## Conventions

- Use one directory per feature at `.scratch/<feature-slug>/`.
- Save the feature spec as `spec.md`.
- Save each implementation ticket as `issues/<NN>-<slug>.md`, numbering from `01`.
- Record triage state on a `Status:` line near the top of the ticket. Use the values in `triage-labels.md`.
- Append discussion under `## Comments`.

## Publish or fetch a ticket

To publish, create the appropriate file under the feature directory. To fetch a ticket, read its path or find its number within the feature's `issues/` directory.

## Wayfinding operations

- Save the map as `.scratch/<effort>/map.md` with Notes, Decisions-so-far, and Fog sections.
- Save child tickets as `issues/<NN>-<slug>.md`. Record `Type:` as `research`, `prototype`, `grilling`, or `task`.
- List blockers on a `Blocked by: NN, NN` line. A ticket is unblocked when every listed ticket has `Status: resolved`.
- Pick the lowest-numbered open, unblocked, unclaimed ticket.
- To claim, set `Status: claimed` and save before starting work.
- To resolve, append the answer under `## Answer`, set `Status: resolved`, and add a short summary and ticket link to the map's Decisions-so-far.
