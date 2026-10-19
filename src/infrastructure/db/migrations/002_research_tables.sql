CREATE TABLE IF NOT EXISTS research_runs (
  id UUID PRIMARY KEY,
  lead_id UUID NOT NULL,
  execution_id UUID NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'ready', 'partial', 'failed', 'cancelled')),
  query_params JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,
  execution_time_ms INTEGER,
  started_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_research_runs_lead_execution ON research_runs (lead_id, execution_id, created_at DESC);

CREATE TABLE IF NOT EXISTS research_sources (
  id UUID PRIMARY KEY,
  research_run_id UUID NOT NULL REFERENCES research_runs(id),
  lead_id UUID NOT NULL,
  execution_id UUID NOT NULL,
  url TEXT NOT NULL,
  title TEXT NOT NULL,
  excerpt TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('search_result')),
  consulted_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_research_sources_run ON research_sources (research_run_id);

CREATE TABLE IF NOT EXISTS briefings (
  id UUID PRIMARY KEY,
  research_run_id UUID NOT NULL REFERENCES research_runs(id),
  lead_id UUID NOT NULL,
  execution_id UUID NOT NULL,
  version INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ready', 'partial', 'failed')),
  summary TEXT NOT NULL,
  facts JSONB NOT NULL DEFAULT '[]'::jsonb,
  hypotheses JSONB NOT NULL DEFAULT '[]'::jsonb,
  gaps JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (lead_id, version)
);

CREATE INDEX IF NOT EXISTS idx_briefings_lead_execution ON briefings (lead_id, execution_id, version DESC);

CREATE TABLE IF NOT EXISTS tool_executions (
  id UUID PRIMARY KEY,
  lead_id UUID NOT NULL,
  execution_id UUID NOT NULL,
  research_run_id UUID NOT NULL REFERENCES research_runs(id),
  provider TEXT NOT NULL CHECK (provider IN ('tavily', 'gemini')),
  operation TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('success', 'failed', 'timeout')),
  duration_ms INTEGER NOT NULL,
  input_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  output_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tool_executions_research_run ON tool_executions (research_run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_tool_executions_lead_execution ON tool_executions (lead_id, execution_id, created_at);
