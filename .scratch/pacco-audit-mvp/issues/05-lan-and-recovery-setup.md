# Choose the pilot LAN and recovery setup

Type: grilling
Status: resolved

## Question

What is the simplest office LAN setup that meets the backup and full restore requirements in §4.6 and AC-09?

## Answer

- Run the application and PostgreSQL on one dedicated office LAN host. Use a separate external drive for scheduled backups, or reuse separate office network storage if it is already available.
- Run PostgreSQL-consistent backups at 12:00 and 16:30 Asia/Manila daily and retain them for 30 days. Record successes and failures in one log the designated system administrator can read.
- Rehearse the full restore in an isolated PostgreSQL test instance. Block application writes, take a safety copy of the database to be replaced, and verify restored projects, transactions, slips, and audit history before reopening access.

Capture the two successful scheduled backups and the safety-copy and restore checks for AC-09. The actual resources and administrator are tracked in [Confirm PACCO pilot assignments and cases](07-confirm-pilot-assignments.md).
