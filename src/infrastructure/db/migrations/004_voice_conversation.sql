ALTER TABLE tool_executions ALTER COLUMN research_run_id DROP NOT NULL;
ALTER TABLE tool_executions DROP CONSTRAINT IF EXISTS tool_executions_provider_check;
ALTER TABLE tool_executions ADD CONSTRAINT tool_executions_provider_check CHECK (provider IN ('tavily', 'gemini', 'elevenlabs'));

CREATE TABLE IF NOT EXISTS voice_sessions (
  id UUID PRIMARY KEY,
  lead_id UUID NOT NULL,
  execution_id UUID NOT NULL,
  briefing_id UUID NOT NULL REFERENCES briefings(id),
  external_call_id TEXT UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('not_started', 'ready', 'connecting', 'active', 'finalizing', 'completed', 'abandoned', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  connecting_at TIMESTAMPTZ,
  active_at TIMESTAMPTZ,
  finalizing_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  abandoned_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  duration_ms INTEGER,
  failure_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_voice_sessions_lead_execution ON voice_sessions (lead_id, execution_id, created_at DESC);
CREATE TABLE IF NOT EXISTS voice_session_transitions (
  id UUID PRIMARY KEY,
  voice_session_id UUID NOT NULL REFERENCES voice_sessions(id),
  from_status TEXT NOT NULL,
  to_status TEXT NOT NULL,
  reason TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_voice_session_transitions_session ON voice_session_transitions (voice_session_id, occurred_at);

ALTER TABLE tool_executions ADD COLUMN IF NOT EXISTS voice_session_id UUID REFERENCES voice_sessions(id);

CREATE TABLE IF NOT EXISTS conversation_artifacts (
  id UUID PRIMARY KEY,
  voice_session_id UUID NOT NULL REFERENCES voice_sessions(id),
  lead_id UUID NOT NULL,
  execution_id UUID NOT NULL,
  external_call_id TEXT NOT NULL,
  artifact_type TEXT NOT NULL CHECK (artifact_type IN ('transcript', 'summary', 'failure')),
  content TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (voice_session_id, artifact_type, content_hash)
);
CREATE INDEX IF NOT EXISTS idx_conversation_artifacts_session ON conversation_artifacts (voice_session_id, created_at);

CREATE TABLE IF NOT EXISTS webhook_events (
  id UUID PRIMARY KEY,
  external_event_id TEXT NOT NULL UNIQUE,
  external_call_id TEXT,
  event_type TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('received', 'processed', 'ignored', 'failed')),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_reason TEXT,
  received_at TIMESTAMPTZ NOT NULL,
  processed_at TIMESTAMPTZ
);
