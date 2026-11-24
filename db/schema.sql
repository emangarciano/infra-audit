CREATE TABLE IF NOT EXISTS accounts (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    username text UNIQUE NOT NULL,
    display_name text NOT NULL,
    pin_verifier text NOT NULL,
    role text NOT NULL CHECK (role IN ('intake', 'auditor', 'supervisor', 'system-admin')),
    active boolean NOT NULL DEFAULT true,
    failed_attempts integer NOT NULL DEFAULT 0,
    locked_until timestamptz
);

CREATE TABLE IF NOT EXISTS sessions (
    token_hash text PRIMARY KEY,
    account_id integer NOT NULL REFERENCES accounts,
    last_seen_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS projects (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    title text NOT NULL,
    contractor text,
    contract_amount numeric(15, 2),
    contract_date date,
    contract_duration text,
    revision integer NOT NULL DEFAULT 1,
    created_by integer NOT NULL REFERENCES accounts,
    updated_by integer NOT NULL REFERENCES accounts,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS transactions (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    project_id integer NOT NULL REFERENCES projects,
    type text NOT NULL CHECK (type IN ('bac', 'advance', 'progress', 'final', 'retention')),
    reference text NOT NULL,
    received_on date NOT NULL,
    assigned_auditor_id integer NOT NULL REFERENCES accounts,
    notes text,
    revision integer NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS checklist_items (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    transaction_id integer NOT NULL REFERENCES transactions,
    label text NOT NULL,
    state text NOT NULL DEFAULT 'Unchecked' CHECK (state IN ('Unchecked', 'Checked', 'N/A')),
    remarks text,
    custom boolean NOT NULL DEFAULT false
);

ALTER TABLE checklist_items ADD COLUMN IF NOT EXISTS document_fields jsonb NOT NULL DEFAULT '{}';

CREATE TABLE IF NOT EXISTS audit_events (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    project_id integer NOT NULL REFERENCES projects,
    transaction_id integer REFERENCES transactions,
    kind text NOT NULL CHECK (kind IN (
        'project_correction', 'register', 'checklist', 'correct',
        'suspend', 'resubmit', 'resume', 'certify', 'void'
    )),
    actor_id integer NOT NULL REFERENCES accounts,
    actor_name text NOT NULL,
    actual_on date NOT NULL,
    recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    previous_status text,
    new_status text,
    details jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS transaction_project ON transactions (project_id);
CREATE INDEX IF NOT EXISTS transaction_assignment ON transactions (assigned_auditor_id);
CREATE INDEX IF NOT EXISTS checklist_transaction ON checklist_items (transaction_id, id);
CREATE INDEX IF NOT EXISTS event_transaction ON audit_events (transaction_id, id);
CREATE INDEX IF NOT EXISTS event_project ON audit_events (project_id, id);
CREATE INDEX IF NOT EXISTS session_account ON sessions (account_id);
CREATE UNIQUE INDEX IF NOT EXISTS transaction_certification ON audit_events (transaction_id)
    WHERE kind = 'certify';

CREATE OR REPLACE FUNCTION prevent_audit_event_changes() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'Audit events are immutable';
END;
$$;

CREATE OR REPLACE TRIGGER immutable_audit_events
    BEFORE UPDATE OR DELETE ON audit_events
    FOR EACH ROW EXECUTE FUNCTION prevent_audit_event_changes();
