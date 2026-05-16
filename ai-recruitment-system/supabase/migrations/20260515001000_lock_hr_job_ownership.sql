drop policy if exists "Enable read access for all users" on "public"."jobs";

create policy "Applicants read active jobs and HR read own jobs"
  on "public"."jobs"
  as permissive
  for select
  to public
  using (
    status = 'active'
    or hr_id = auth.uid()
  );

create policy "HR update own jobs"
  on "public"."jobs"
  as permissive
  for update
  to public
  using (hr_id = auth.uid())
  with check (hr_id = auth.uid());

create policy "HR delete own jobs"
  on "public"."jobs"
  as permissive
  for delete
  to public
  using (hr_id = auth.uid());
