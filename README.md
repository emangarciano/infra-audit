# PACCO Infrastructure Audit

An Express and PostgreSQL register for the [Lean MVP](MVP_SPEC.md). The application runs on the office LAN. Excel remains the official working record during the parallel pilot.

## Run locally

Use Node.js 22 or newer and a dedicated UTF-8 database on an ICU-enabled PostgreSQL server. Set `DATABASE_URL` to the connection string for the database owner.

```sh
npm ci
npm run migrate
npm run accounts -- create intake-a intake "Intake Staff"
npm run accounts -- create auditor-a auditor "Auditor A"
PACCO_DEVELOPMENT_FIXTURES=1 npm start
```

The account command prompts for a four-digit PIN. Account roles are `intake`, `auditor`, `supervisor`, and `system-admin`. Use `npm run accounts -- set-role <username> <role>` to change a role and `npm run accounts -- deactivate <username>` to deactivate an account. These commands end existing sessions for the affected account.

By default the app listens at `http://127.0.0.1:3000`. On the office host, set `PACCO_HOST` to its office LAN address and restrict access to the office network. Set `PORT` to change the port.

If a reverse proxy terminates HTTPS, set `PACCO_ORIGIN` to the browser-facing origin, such as `https://audit.example.org`. The app uses that origin for form submissions and marks session cookies as secure when the origin uses HTTPS.

## Checklists and slips

New BAC documentation transactions start with the 62 requirements in [the supplied CSV](docs/BAC%20Documentation.csv). Each requirement begins as **Not Complied** and can be marked **Complied** or **N/A**. OBR has optional **Reference number** and **Amount (₱)** fields in its **Add details** dialog. Notice of Award, Performance Security, Duly notarized contract, Notice to Proceed, and CARI also have optional document fields. All requirements support optional remarks. Confirm dialog edits with **OK** or **Enter**.

Checklist selections and confirmed details are kept in a browser draft for the signed-in user and transaction. While the checklist is open, the app checks every minute and saves changed items to the shared record. Use **Save** in the transaction action row to save immediately or add a transaction-specific requirement. If the shared record changed while you were editing, load the latest checklist for review, compare it with your draft, and save manually.

When upgrading, stop the running app, run `npm run migrate`, then start the updated app. The migration removes the retired **Other Appropriate Licenses and Permits required by law and stated in the PBD** requirement from existing standard BAC checklists. It records the removal in the transaction’s audit history and preserves previously issued suspension slips.

Development fixtures use visibly labeled sample items for the other transaction types. Auditors can add requirements manually when no checklist is configured. Use the default suspension slip for development before the approved layout is configured.

Set `PACCO_CHECKLIST_FILE` to a local JSON file that maps transaction types to arrays of approved requirement labels. The keys are `bac`, `advance`, `progress`, `final`, and `retention`. A configured `bac` list takes precedence over the supplied CSV. The app excludes the retired BAC requirement from configured lists as well. Validate the checklist against PACCO's approved reference before the official pilot.

Set `PACCO_SLIP_TEMPLATE_FILE` to a local HTML template prepared from the approved specimen. Use `{{requirements}}` for the item list and place `{{project}}`, `{{projectreference}}`, `{{transaction}}`, `{{type}}`, `{{date}}`, `{{issuer}}`, and `{{remarks}}` wherever the form calls for those values. Include print styles in the template so the saved slip retains its layout. Open a slip from audit history and use the browser's Print command.

## Backup and restore

Install PostgreSQL client tools whose major version supports the server. Run the commands as the designated administrator using the app database connection settings.

- Set `PACCO_BACKUP_DIR` to an existing directory on separate external or network storage mounted on the office host. Set `PACCO_BACKUP_LOG` to an administrator-readable local log path. It defaults to `.pacco-backup.log` in the working directory.
- Run `npm run backup` to take a consistent backup. The command writes a custom-format dump and its verification manifest, logs the result, and removes scheduled backups older than 30 days.
- On a systemd host, adapt the user, paths, and environment file in [the backup service](ops/systemd/pacco-backup.service). Install the service and [timer](ops/systemd/pacco-backup.timer) together and enable the timer with `systemctl enable --now pacco-backup.timer`. It runs at noon and 4:30 p.m. Asia/Manila.
- To rehearse a restore, point `DATABASE_URL` at an isolated test instance. Run `npm run restore -- /path/to/backup.dump` with the corresponding `.dump.json` beside the archive. The command gates writes, takes a safety copy, restores the selected archive, verifies the restored records, applies the current schema, and clears restored sessions. The log records the result.
- For a live restore, run the command with the same database and maintenance file settings as the app. The maintenance file defaults to `.pacco-maintenance` in the working directory. Set an absolute `PACCO_MAINTENANCE_FILE` in both environments if their working directories differ. A failed restore leaves maintenance active. Review the log and rerun with a verified backup or safety copy to reopen access.

## Verification

```sh
PACCO_TEST_DATABASE_URL='postgresql://user:password@127.0.0.1/pacco_test' npm test
```

The integration suite creates and removes a uniquely named schema in the test database. See [MVP verification evidence](docs/mvp-verification.md) for the development results and the remaining office pilot evidence.
