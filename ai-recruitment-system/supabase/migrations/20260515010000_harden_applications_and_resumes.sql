-- Harden applications, resume storage, and profile visibility for deployment.

ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS resume_id UUID REFERENCES public.resumes(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS resume_file_name TEXT,
  ADD COLUMN IF NOT EXISTS resume_file_path TEXT,
  ADD COLUMN IF NOT EXISTS resume_parsed_data JSONB,
  ADD COLUMN IF NOT EXISTS ai_provider TEXT,
  ADD COLUMN IF NOT EXISTS is_fallback BOOLEAN NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'applications_status_check'
      AND conrelid = 'public.applications'::regclass
  ) THEN
    ALTER TABLE public.applications
      ADD CONSTRAINT applications_status_check
      CHECK (status IN ('applied', 'under_review', 'shortlisted', 'rejected'));
  END IF;
END $$;

UPDATE storage.buckets
SET public = false,
    file_size_limit = 10485760,
    allowed_mime_types = ARRAY[
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ]
WHERE id = 'recruitai-resumes';

DROP POLICY IF EXISTS "resume_public_read" ON storage.objects;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'resume_owner_read'
  ) THEN
    CREATE POLICY "resume_owner_read"
    ON storage.objects FOR SELECT TO authenticated
    USING (
      bucket_id = 'recruitai-resumes'
      AND auth.uid()::text = (storage.foldername(name))[1]
    );
  END IF;
END $$;

DROP POLICY IF EXISTS "Enable read access for all users" ON public.profiles;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'profiles'
      AND policyname = 'Profiles are visible to self or application counterparties'
  ) THEN
    CREATE POLICY "Profiles are visible to self or application counterparties"
    ON public.profiles FOR SELECT TO authenticated
    USING (
      id = auth.uid()
      OR EXISTS (
        SELECT 1
        FROM public.applications a
        JOIN public.jobs j ON j.id = a.job_id
        WHERE (
          (a.applicant_id = profiles.id AND j.hr_id = auth.uid())
          OR (j.hr_id = profiles.id AND a.applicant_id = auth.uid())
        )
      )
    );
  END IF;
END $$;
