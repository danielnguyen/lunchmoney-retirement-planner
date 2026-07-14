CREATE TYPE baseline_source_type AS ENUM (
  'saved_personal_baseline',
  'lunchmoney_derived',
  'canadian_reference',
  'application_fallback'
);

CREATE TYPE account_type AS ENUM (
  'cash',
  'tfsa',
  'rrsp_rrif',
  'non_registered',
  'real_asset',
  'debt'
);

CREATE TABLE import_runs (
  id uuid PRIMARY KEY,
  source text NOT NULL,
  status text NOT NULL,
  data_through date,
  imported_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE households (
  id uuid PRIMARY KEY,
  label text NOT NULL,
  primary_member_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE household_members (
  id uuid PRIMARY KEY,
  household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  label text NOT NULL,
  current_age numeric NOT NULL,
  retirement_age numeric NOT NULL,
  expense_share numeric NOT NULL,
  assumptions jsonb NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE households
  ADD CONSTRAINT households_primary_member_fk
  FOREIGN KEY (primary_member_id) REFERENCES household_members(id);

CREATE TABLE financial_accounts (
  id uuid PRIMARY KEY,
  household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES household_members(id) ON DELETE CASCADE,
  external_id text,
  account_type account_type NOT NULL,
  label text NOT NULL,
  opening_balance numeric NOT NULL,
  annual_return numeric NOT NULL,
  monthly_contribution numeric NOT NULL DEFAULT 0,
  withdrawal_priority integer NOT NULL,
  allocation jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (household_id, external_id)
);

CREATE TABLE projection_events (
  id uuid PRIMARY KEY,
  household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  owner_id uuid REFERENCES household_members(id) ON DELETE SET NULL,
  target_account_id uuid REFERENCES financial_accounts(id) ON DELETE SET NULL,
  label text NOT NULL,
  calendar_year integer NOT NULL,
  month integer NOT NULL CHECK (month BETWEEN 1 AND 12),
  amount_today numeric NOT NULL,
  direction text NOT NULL CHECK (direction IN ('inflow', 'outflow'))
);

CREATE TABLE financial_baselines (
  id uuid PRIMARY KEY,
  household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  effective_date date NOT NULL,
  data_through date,
  values jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE baseline_fields (
  id uuid PRIMARY KEY,
  baseline_id uuid NOT NULL REFERENCES financial_baselines(id) ON DELETE CASCADE,
  field_path text NOT NULL,
  value jsonb NOT NULL,
  source_type baseline_source_type NOT NULL,
  source_description text NOT NULL,
  source_effective_date date NOT NULL,
  reference_kind text,
  reference_url text
);

CREATE TABLE scenarios (
  id uuid PRIMARY KEY,
  baseline_id uuid NOT NULL REFERENCES financial_baselines(id),
  name text NOT NULL,
  overrides jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE projection_snapshots (
  id uuid PRIMARY KEY,
  scenario_id uuid REFERENCES scenarios(id),
  schema_version text NOT NULL,
  input_payload jsonb NOT NULL,
  source_payload jsonb NOT NULL,
  output_payload jsonb NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  projection_end_age integer NOT NULL
);
