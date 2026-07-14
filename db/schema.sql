CREATE TYPE baseline_source_type AS ENUM (
  'saved_personal_baseline',
  'lunchmoney_derived',
  'canadian_reference',
  'application_fallback'
);

CREATE TABLE import_runs (
  id uuid PRIMARY KEY,
  source text NOT NULL,
  status text NOT NULL,
  data_through date,
  imported_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE financial_baselines (
  id uuid PRIMARY KEY,
  effective_date date NOT NULL,
  data_through date,
  values jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE baseline_fields (
  id uuid PRIMARY KEY,
  baseline_id uuid NOT NULL REFERENCES financial_baselines(id) ON DELETE CASCADE,
  field text NOT NULL,
  numeric_value numeric,
  source_type baseline_source_type NOT NULL,
  source_description text NOT NULL,
  source_effective_date date NOT NULL
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
  output_payload jsonb NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  projection_end_age integer NOT NULL
);
