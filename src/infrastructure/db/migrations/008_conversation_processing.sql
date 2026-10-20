CREATE TABLE conversation_processing_jobs (
  voice_session_id UUID PRIMARY KEY REFERENCES voice_sessions(id),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'completed', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  lease_until TIMESTAMPTZ,
  lease_owner TEXT,
  last_error TEXT
);
CREATE INDEX idx_conversation_processing_pending ON conversation_processing_jobs(status, available_at, lease_until);
