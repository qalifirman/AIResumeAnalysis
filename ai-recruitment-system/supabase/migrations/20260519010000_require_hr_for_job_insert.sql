-- Require a real HR profile before a user can insert jobs directly through PostgREST.
-- The Edge Function already enforces this; this policy closes the direct anon-key path.

DROP POLICY IF EXISTS "Enable insert for HR only" ON public.jobs;
DROP POLICY IF EXISTS "HR can insert own jobs" ON public.jobs;

CREATE POLICY "HR can insert own jobs"
  ON public.jobs
  AS permissive
  FOR INSERT
  TO authenticated
  WITH CHECK (
    hr_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'hr'
    )
  );
