drop policy if exists "Applicants read active jobs and HR read own jobs" on "public"."jobs";

create policy "Applicants read active jobs and HR read own jobs"
  on "public"."jobs"
  as permissive
  for select
  to public
  using (
    hr_id = auth.uid()
    or (
      status = 'active'
      and exists (
        select 1
        from public.profiles
        where profiles.id = auth.uid()
          and profiles.role = 'applicant'
      )
    )
  );
