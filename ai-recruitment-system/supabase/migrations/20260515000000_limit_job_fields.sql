alter table "public"."jobs"
  add constraint "jobs_department_field_check"
  check (department in ('Technology', 'Security', 'Medical'))
  not valid;
