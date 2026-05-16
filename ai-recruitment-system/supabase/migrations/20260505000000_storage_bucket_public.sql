-- Create private recruitai-resumes bucket. Resume access is served through signed URLs.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'recruitai-resumes',
  'recruitai-resumes',
  false,
  10485760,
  ARRAY[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain'
  ]
)
ON CONFLICT (id) DO UPDATE SET public = false;

-- Authenticated users can upload files into their own folder
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'resume_upload'
  ) THEN
    CREATE POLICY "resume_upload"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (
      bucket_id = 'recruitai-resumes'
      AND auth.uid()::text = (storage.foldername(name))[1]
    );
  END IF;
END $$;

-- Users can read their own files. HR access is brokered through signed URLs from the Edge Function.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'resume_owner_read'
  ) THEN
    CREATE POLICY "resume_owner_read"
    ON storage.objects FOR SELECT TO authenticated
    USING (
      bucket_id = 'recruitai-resumes'
      AND auth.uid()::text = (storage.foldername(name))[1]
    );
  END IF;
END $$;

-- Users can delete their own files
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'resume_delete'
  ) THEN
    CREATE POLICY "resume_delete"
    ON storage.objects FOR DELETE TO authenticated
    USING (
      bucket_id = 'recruitai-resumes'
      AND auth.uid()::text = (storage.foldername(name))[1]
    );
  END IF;
END $$;
