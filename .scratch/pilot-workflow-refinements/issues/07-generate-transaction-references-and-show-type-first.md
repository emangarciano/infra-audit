# 07: Generate transaction references and show Type first in the queue

**What to build:** Generate the transaction reference when a user registers a new transaction. Put **Type** in the first column of the transaction queue and keep **Reference** visible in a later column.

**Blocked by:** None (can start immediately).

**Status:** resolved

- [x] Administrative staff, auditors, and supervisors can register a transaction without entering a **Reference or title**. The server generates and saves a distinct transaction reference at registration, including for concurrent submissions. The optional obligation request reference remains a separate field.
- [x] Both generated and existing references appear in transaction details and remain searchable in the queue. Existing records retain their saved references.
- [x] **Type** is the first column header, and each row starts with the transaction type. The queue still shows the reference and provides a link to open each transaction. This also applies when opening the queue from a project.
- [x] Likely duplicates still trigger a warning and can be registered after explicit confirmation. The warning uses information available before the transaction reference is generated.

## Answer

The server generates a TX-prefixed UUID when registration succeeds. The queue shows Type first and links to each transaction from its Reference column. Likely duplicates are identified by project, type, received date, and optional obligation request reference.

All 16 PostgreSQL-backed tests passed, including concurrent registration, duplicate confirmation, and reference search. Chromium verified registration from a project, Type as the first column in the project-filtered queue, and navigation via the reference link.
