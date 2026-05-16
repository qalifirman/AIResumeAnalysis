-- Add expires_at to jobs table for job expiry feature
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

-- Add interview_at to applications table for interview scheduling
ALTER TABLE applications ADD COLUMN IF NOT EXISTS interview_at TIMESTAMPTZ;

-- Create candidate_notes table for private HR notes (not visible to applicants)
CREATE TABLE IF NOT EXISTS candidate_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hr_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  applicant_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(hr_id, application_id)
);

-- RLS: only the HR who created the note can read/write it
ALTER TABLE candidate_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "HR can manage own notes" ON candidate_notes
  FOR ALL USING (hr_id = auth.uid());
