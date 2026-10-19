CREATE TABLE IF NOT EXISTS leads (
  id UUID PRIMARY KEY,
  execution_id UUID NOT NULL UNIQUE,
  submission_id UUID NOT NULL UNIQUE,
  mode TEXT NOT NULL CHECK (mode IN ('demo')),
  normalized JSONB NOT NULL CHECK (jsonb_typeof(normalized) = 'object'),
  briefing JSONB NOT NULL,
  spiced JSONB NOT NULL,
  conversation JSONB NOT NULL,
  meeting JSONB NOT NULL,
  research_status TEXT NOT NULL CHECK (research_status IN ('queued', 'running', 'ready', 'partial', 'failed', 'cancelled')),
  research_run_id UUID,
  research_sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL,
  UNIQUE (id, execution_id)
);

CREATE INDEX IF NOT EXISTS idx_leads_created ON leads (created_at DESC, id);

CREATE TABLE IF NOT EXISTS lead_submissions (
  id UUID PRIMARY KEY,
  lead_id UUID NOT NULL,
  execution_id UUID NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE CHECK (length(idempotency_key) BETWEEN 1 AND 200),
  original JSONB NOT NULL CHECK (jsonb_typeof(original) = 'object'),
  normalized JSONB NOT NULL CHECK (jsonb_typeof(normalized) = 'object'),
  received_at TIMESTAMPTZ NOT NULL,
  UNIQUE (lead_id, execution_id, id),
  FOREIGN KEY (lead_id, execution_id) REFERENCES leads (id, execution_id) DEFERRABLE INITIALLY DEFERRED
);

ALTER TABLE leads ADD CONSTRAINT leads_submission_fk
  FOREIGN KEY (id, execution_id, submission_id)
  REFERENCES lead_submissions (lead_id, execution_id, id) DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE IF NOT EXISTS lead_events (
  id UUID PRIMARY KEY,
  lead_id UUID NOT NULL,
  execution_id UUID NOT NULL,
  payload JSONB NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  occurred_at TIMESTAMPTZ NOT NULL,
  FOREIGN KEY (lead_id, execution_id) REFERENCES leads (id, execution_id)
);

CREATE INDEX IF NOT EXISTS idx_lead_events_execution ON lead_events (lead_id, execution_id, occurred_at, id);
