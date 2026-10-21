-- =============================================================
-- MASP IV Sprint 48 — Evaluation Insights without an API key ("Option C") + studies linked from Google Drive
--
-- The user chose (2026-10-21) to have study summaries written from a Claude Code session under the Team plan
-- instead of a pay-as-you-go ANTHROPIC_API_KEY. Without the key, uploads now wait as 'queued'
-- ("Awaiting summary") rather than failing.
--
-- Studies can also LINK to their file in Google Drive (source_url / drive_file_id) instead of being copied to the
-- `reports` bucket: no Supabase storage used, no 25 MB limit, and Drive's own sharing controls the full report.
-- The 15 reports in Drive folder "END OF PROJECT EVALUATIONS" (1xtexvq-Y4Reg3mS-MjPBGGhfiFLWzDBn) were loaded
-- this way on 2026-10-21: 13 as drafts with summaries, 2 queued (their text could not be extracted).
-- review_note carries points the reviewer must check (conflicting figures, draft reports, partial reads).
-- Applied 2026-10-21 (three steps: sprint48, sprint48b, sprint48c).
-- =============================================================

ALTER TABLE evaluation_reports ADD COLUMN IF NOT EXISTS source_url text;
ALTER TABLE evaluation_reports ADD COLUMN IF NOT EXISTS drive_file_id text;
ALTER TABLE evaluation_reports ADD COLUMN IF NOT EXISTS review_note text;
ALTER TABLE evaluation_reports ADD COLUMN IF NOT EXISTS evaluator text;
ALTER TABLE evaluation_reports ALTER COLUMN file_path DROP NOT NULL;
ALTER TABLE evaluation_reports ALTER COLUMN file_size DROP NOT NULL;

ALTER TABLE evaluation_reports DROP CONSTRAINT IF EXISTS evaluation_reports_file_type_check;
ALTER TABLE evaluation_reports ADD CONSTRAINT evaluation_reports_file_type_check CHECK (file_type IN ('pdf', 'docx', 'gdoc'));

ALTER TABLE evaluation_reports DROP CONSTRAINT IF EXISTS evaluation_reports_status_check;
ALTER TABLE evaluation_reports ADD CONSTRAINT evaluation_reports_status_check
  CHECK (status IN ('uploading', 'queued', 'processing', 'draft', 'failed', 'published', 'rejected'));

ALTER TABLE evaluation_reports ADD CONSTRAINT evaluation_reports_file_source_check
  CHECK (file_path IS NOT NULL OR source_url IS NOT NULL);
ALTER TABLE evaluation_reports ADD CONSTRAINT evaluation_reports_drive_file_id_key UNIQUE (drive_file_id);
