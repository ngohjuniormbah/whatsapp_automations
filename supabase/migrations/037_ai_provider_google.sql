-- ============================================================
-- 037_ai_provider_google
--
-- Add Google (Gemini) as a supported AI provider.
--
-- Both `ai_configs.provider` and `ai_usage_log.provider` were created
-- with an inline CHECK limiting the value to ('openai', 'anthropic').
-- Postgres names an inline column check `<table>_<column>_check`. Drop
-- and recreate each so 'google' is accepted; existing rows are
-- unaffected (their values already satisfy the wider set).
--
-- Idempotent — safe to run multiple times.
-- ============================================================

ALTER TABLE ai_configs DROP CONSTRAINT IF EXISTS ai_configs_provider_check;
ALTER TABLE ai_configs
  ADD CONSTRAINT ai_configs_provider_check
  CHECK (provider IN ('openai', 'anthropic', 'google'));

ALTER TABLE ai_usage_log DROP CONSTRAINT IF EXISTS ai_usage_log_provider_check;
ALTER TABLE ai_usage_log
  ADD CONSTRAINT ai_usage_log_provider_check
  CHECK (provider IN ('openai', 'anthropic', 'google'));
