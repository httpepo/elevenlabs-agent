ALTER TABLE tool_executions DROP CONSTRAINT IF EXISTS tool_executions_status_check;
ALTER TABLE tool_executions ADD CONSTRAINT tool_executions_status_check
  CHECK (status IN ('success', 'failed', 'conflict', 'timeout'));

ALTER TABLE research_runs ADD CONSTRAINT research_runs_lead_execution_fk
  FOREIGN KEY (lead_id, execution_id) REFERENCES leads (id, execution_id);
ALTER TABLE research_runs ADD CONSTRAINT research_runs_identity_unique UNIQUE (id, lead_id, execution_id);

ALTER TABLE leads ADD CONSTRAINT leads_research_run_fk
  FOREIGN KEY (research_run_id, id, execution_id) REFERENCES research_runs (id, lead_id, execution_id);

ALTER TABLE research_sources ADD CONSTRAINT research_sources_execution_fk
  FOREIGN KEY (research_run_id, lead_id, execution_id) REFERENCES research_runs (id, lead_id, execution_id);
ALTER TABLE briefings ADD CONSTRAINT briefings_execution_fk
  FOREIGN KEY (research_run_id, lead_id, execution_id) REFERENCES research_runs (id, lead_id, execution_id);
ALTER TABLE briefings ADD CONSTRAINT briefings_identity_unique UNIQUE (id, lead_id, execution_id);
ALTER TABLE job_queue ADD CONSTRAINT job_queue_execution_fk
  FOREIGN KEY (research_run_id, lead_id, execution_id) REFERENCES research_runs (id, lead_id, execution_id);

ALTER TABLE voice_sessions ADD CONSTRAINT voice_sessions_briefing_execution_fk
  FOREIGN KEY (briefing_id, lead_id, execution_id) REFERENCES briefings (id, lead_id, execution_id);
ALTER TABLE voice_sessions ADD CONSTRAINT voice_sessions_identity_unique UNIQUE (id, lead_id, execution_id);

ALTER TABLE conversation_artifacts ADD CONSTRAINT conversation_artifacts_execution_fk
  FOREIGN KEY (voice_session_id, lead_id, execution_id) REFERENCES voice_sessions (id, lead_id, execution_id);
ALTER TABLE spiced_qualifications ADD CONSTRAINT spiced_qualifications_execution_fk
  FOREIGN KEY (voice_session_id, lead_id, execution_id) REFERENCES voice_sessions (id, lead_id, execution_id);
ALTER TABLE lead_profile_versions ADD CONSTRAINT lead_profile_versions_execution_fk
  FOREIGN KEY (voice_session_id, lead_id, execution_id) REFERENCES voice_sessions (id, lead_id, execution_id);
ALTER TABLE meeting_attempts ADD CONSTRAINT meeting_attempts_lead_execution_fk
  FOREIGN KEY (lead_id, execution_id) REFERENCES leads (id, execution_id);
ALTER TABLE meeting_attempts ADD CONSTRAINT meeting_attempts_voice_execution_fk
  FOREIGN KEY (voice_session_id, lead_id, execution_id) REFERENCES voice_sessions (id, lead_id, execution_id);
ALTER TABLE tool_executions ADD CONSTRAINT tool_executions_lead_execution_fk
  FOREIGN KEY (lead_id, execution_id) REFERENCES leads (id, execution_id);
ALTER TABLE tool_executions ADD CONSTRAINT tool_executions_research_execution_fk
  FOREIGN KEY (research_run_id, lead_id, execution_id) REFERENCES research_runs (id, lead_id, execution_id);
ALTER TABLE tool_executions ADD CONSTRAINT tool_executions_voice_execution_fk
  FOREIGN KEY (voice_session_id, lead_id, execution_id) REFERENCES voice_sessions (id, lead_id, execution_id);

CREATE INDEX IF NOT EXISTS idx_artifacts_lead_execution ON conversation_artifacts (lead_id, execution_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_qualifications_lead_execution ON spiced_qualifications (lead_id, execution_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_profile_versions_lead_execution ON lead_profile_versions (lead_id, execution_id, version DESC);
