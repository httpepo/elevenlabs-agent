CREATE TABLE IF NOT EXISTS spiced_qualifications (
  id UUID PRIMARY KEY,
  lead_id UUID NOT NULL,
  execution_id UUID NOT NULL,
  voice_session_id UUID NOT NULL REFERENCES voice_sessions(id),
  external_call_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  situation JSONB NOT NULL,
  pain JSONB NOT NULL,
  impact JSONB NOT NULL,
  critical_event JSONB NOT NULL,
  decision JSONB NOT NULL,
  qualification_status TEXT NOT NULL CHECK (qualification_status IN ('not_assessed', 'potential_fit', 'qualified', 'not_qualified')),
  interest_status TEXT NOT NULL CHECK (interest_status IN ('interested', 'undecided', 'declined')),
  decline_reason TEXT,
  objections JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_spiced_qualifications_lead ON spiced_qualifications (lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_spiced_qualifications_session ON spiced_qualifications (voice_session_id, created_at DESC);

CREATE TABLE IF NOT EXISTS lead_profile_versions (
  id UUID PRIMARY KEY,
  lead_id UUID NOT NULL,
  execution_id UUID NOT NULL,
  voice_session_id UUID NOT NULL REFERENCES voice_sessions(id),
  version INTEGER NOT NULL,
  changes JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (lead_id, version)
);

CREATE INDEX IF NOT EXISTS idx_lead_profile_versions_lead ON lead_profile_versions (lead_id, version DESC);

