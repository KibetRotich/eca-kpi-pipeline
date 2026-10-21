-- =============================================================
-- MASP IV Sprint 47 — Evaluation Insights: uploaded study reports + AI summaries
--
-- Staff (signed-in @solidaridadnetwork.org accounts) upload a PDF/DOCX on /evaluation-insights.
-- The file goes to the PRIVATE storage bucket `reports` under evaluations/<id>/<file>; a row here
-- tracks it. The upload triggers /api/evaluations/<id>/process, which summarises the report with the
-- Claude API (lib/summarise-evaluation.ts) and stores the result as a DRAFT. Nothing is public until
-- an admin / M&E officer publishes it (the site itself has no login, so review comes first).
--
-- status: uploading -> processing -> draft | failed -> published | rejected
-- All access goes through the API routes with the service-role key: RLS is on with NO policies,
-- so the anon key can neither read nor write this table or the bucket.
-- =============================================================

CREATE TABLE IF NOT EXISTS evaluation_reports (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title             text NOT NULL CHECK (length(title) BETWEEN 3 AND 300),
  project_id        uuid REFERENCES projects(id) ON DELETE SET NULL,
  programme         text NOT NULL,            -- project name, or "Programme-wide / other"
  country           text NOT NULL,
  period_start      date,
  period_end        date,
  tags              text[] NOT NULL DEFAULT '{}',
  file_path         text NOT NULL,            -- object path inside the `reports` bucket
  file_name         text NOT NULL,
  file_type         text NOT NULL CHECK (file_type IN ('pdf', 'docx')),
  file_size         integer NOT NULL CHECK (file_size > 0),
  uploaded_by       text NOT NULL,            -- uploader's email
  uploaded_at       timestamptz NOT NULL DEFAULT now(),
  status            text NOT NULL DEFAULT 'uploading'
                    CHECK (status IN ('uploading', 'processing', 'draft', 'failed', 'published', 'rejected')),
  summary           jsonb,                    -- see lib/evaluations.ts EvaluationSummary
  model             text,
  error             text,
  processed_at      timestamptz,
  reviewed_by       text,
  reviewed_at       timestamptz,
  published_at      timestamptz,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CHECK (period_start IS NULL OR period_end IS NULL OR period_start <= period_end)
);

CREATE INDEX IF NOT EXISTS evaluation_reports_status_idx ON evaluation_reports (status, published_at DESC);

ALTER TABLE evaluation_reports ENABLE ROW LEVEL SECURITY;   -- no policies: service role only

-- Private bucket for the report files (25 MB cap, PDF / DOCX only)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('reports', 'reports', false, 26214400,
        ARRAY['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
ON CONFLICT (id) DO UPDATE
  SET public = false, file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;
