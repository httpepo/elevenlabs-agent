CREATE TABLE IF NOT EXISTS meeting_attempts (
  id UUID PRIMARY KEY,
  lead_id UUID NOT NULL,
  execution_id UUID NOT NULL,
  voice_session_id UUID REFERENCES voice_sessions(id),
  booking_intent_id UUID,
  slot_offer_token_hash TEXT,
  start_at TIMESTAMPTZ,
  end_at TIMESTAMPTZ,
  availability_from TEXT,
  availability_until TEXT,
  previous_status TEXT CHECK (previous_status IN ('not_requested', 'offered', 'pending', 'confirmed', 'conflict', 'uncertain', 'failed', 'cancelled')),
  status TEXT NOT NULL CHECK (status IN ('not_requested', 'offered', 'pending', 'confirmed', 'conflict', 'uncertain', 'failed', 'cancelled')),
  reason TEXT NOT NULL,
  http_status INTEGER,
  booking_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  transport_diagnostic TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_meeting_attempts_lead_execution ON meeting_attempts (lead_id, execution_id, created_at);
CREATE INDEX IF NOT EXISTS idx_meeting_attempts_booking_intent ON meeting_attempts (booking_intent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_meeting_attempts_offer_token ON meeting_attempts (slot_offer_token_hash, created_at DESC);
