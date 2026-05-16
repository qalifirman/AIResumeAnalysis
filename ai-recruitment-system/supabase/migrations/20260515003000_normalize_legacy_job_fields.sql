update "public"."jobs"
set department = case
  when department in ('Technology', 'Security', 'Medical') then department
  when lower(coalesce(title, '') || ' ' || coalesce(department, '') || ' ' || coalesce(description, '')) ~
       '(guard|security|patrol|cctv|access control|visitor|surveillance|mosque|school gate|incident|perimeter)'
    then 'Security'
  when lower(coalesce(title, '') || ' ' || coalesce(department, '') || ' ' || coalesce(description, '')) ~
       '(doctor|nurse|surgeon|medical|patient|clinical|hospital|clinic|triage|surgery|ward|medication)'
    then 'Medical'
  else 'Technology'
end
where department is null
   or department not in ('Technology', 'Security', 'Medical');

alter table "public"."jobs" validate constraint "jobs_department_field_check";
