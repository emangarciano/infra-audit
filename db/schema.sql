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

CREATE OR REPLACE FUNCTION clean_contractor_name(name text) RETURNS text
    LANGUAGE sql IMMUTABLE STRICT
    RETURN btrim(regexp_replace(name, U&'[\0009-\000D \00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]+', ' ', 'g'));

CREATE OR REPLACE FUNCTION contractor_name_key(name text) RETURNS text
    LANGUAGE sql IMMUTABLE STRICT
    RETURN lower(clean_contractor_name(name) COLLATE pg_catalog."und-x-icu");

CREATE TABLE IF NOT EXISTS contractors (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name text NOT NULL CHECK (name <> '' AND name = clean_contractor_name(name)),
    name_key text GENERATED ALWAYS AS (contractor_name_key(name)) STORED UNIQUE
);

CREATE TABLE IF NOT EXISTS projects (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    title text NOT NULL,
    contract_amount numeric(15, 2),
    contract_date date,
    contract_duration text,
    revision integer NOT NULL DEFAULT 1,
    created_by integer NOT NULL REFERENCES accounts,
    updated_by integer NOT NULL REFERENCES accounts,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

ALTER TABLE projects ADD COLUMN IF NOT EXISTS reference text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS contractor_id integer REFERENCES contractors;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS barangay text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS municipality text;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_attribute
        WHERE attrelid = 'projects'::regclass AND attname = 'contractor' AND NOT attisdropped
    ) THEN
        INSERT INTO contractors (name)
        SELECT DISTINCT ON (contractor_name_key(contractor)) clean_contractor_name(contractor)
        FROM projects
        WHERE clean_contractor_name(contractor) <> ''
        ORDER BY contractor_name_key(contractor), id
        ON CONFLICT (name_key) DO NOTHING;

        UPDATE projects p SET contractor_id = c.id
        FROM contractors c
        WHERE p.contractor_id IS NULL AND c.name_key = contractor_name_key(p.contractor);

        ALTER TABLE projects DROP COLUMN contractor;
    END IF;
END;
$$;

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

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS obligation_request_reference text;

CREATE TABLE IF NOT EXISTS checklist_items (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    transaction_id integer NOT NULL REFERENCES transactions,
    label text NOT NULL,
    state text NOT NULL DEFAULT 'Unchecked' CHECK (state IN ('Unchecked', 'Checked', 'N/A')),
    remarks text,
    custom boolean NOT NULL DEFAULT false
);

ALTER TABLE checklist_items ADD COLUMN IF NOT EXISTS document_fields jsonb NOT NULL DEFAULT '{}';
ALTER TABLE checklist_items ADD COLUMN IF NOT EXISTS compliance_reasons text[] NOT NULL DEFAULT '{}';
ALTER TABLE checklist_items ADD COLUMN IF NOT EXISTS compliance_details text;

CREATE TABLE IF NOT EXISTS audit_events (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    project_id integer NOT NULL REFERENCES projects,
    transaction_id integer REFERENCES transactions,
    kind text NOT NULL,
    actor_id integer REFERENCES accounts,
    actor_name text NOT NULL,
    actual_on date NOT NULL,
    recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    previous_status text,
    new_status text,
    details jsonb NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE audit_events
    ALTER COLUMN actor_id DROP NOT NULL,
    DROP CONSTRAINT IF EXISTS audit_events_actor_check,
    ADD CONSTRAINT audit_events_actor_check CHECK (
        actor_id IS NOT NULL OR (kind = 'checklist' AND actor_name = 'Database migration')
    ),
    DROP CONSTRAINT IF EXISTS audit_events_kind_check,
    ADD CONSTRAINT audit_events_kind_check CHECK (kind IN (
        'project_correction', 'register', 'checklist', 'correct',
        'start', 'suspend', 'resubmit', 'resume', 'certify', 'void'
    ));

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

WITH retired_items AS (
    SELECT i.id, i.transaction_id FROM checklist_items i
    JOIN transactions t ON t.id = i.transaction_id
    WHERE t.type = 'bac' AND NOT i.custom
      AND lower(i.label) = 'other appropriate licenses and permits required by law and stated in the pbd'
), revised_transactions AS (
    UPDATE transactions SET revision = revision + 1
    WHERE id IN (SELECT transaction_id FROM retired_items)
    RETURNING id, project_id
), removed_items AS (
    DELETE FROM checklist_items i USING retired_items r, revised_transactions t
    WHERE i.id = r.id AND t.id = r.transaction_id
    RETURNING t.project_id, i.*
)
INSERT INTO audit_events (project_id, transaction_id, kind, actor_name, actual_on, details)
SELECT project_id, transaction_id, 'checklist', 'Database migration',
       (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date,
       jsonb_build_object('checklist_removals', jsonb_agg(jsonb_build_object(
           'before', to_jsonb(removed_items) - 'project_id' - 'transaction_id', 'after', NULL
       ) ORDER BY id))
FROM removed_items
GROUP BY project_id, transaction_id;
