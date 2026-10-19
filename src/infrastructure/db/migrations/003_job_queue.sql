CREATE TABLE IF NOT EXISTS job_queue (
  id UUID PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('start_research')),
  lead_id UUID NOT NULL,
  research_run_id UUID NOT NULL REFERENCES research_runs(id),
  execution_id UUID NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_until TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_job_queue_claim ON job_queue (status, available_at, locked_until);
