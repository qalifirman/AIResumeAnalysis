-- Add application deadline field to jobs
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
