-- Add company_name and work_mode columns to the jobs table
alter table "public"."jobs"
  add column if not exists "company_name" text,
  add column if not exists "work_mode"    text check (work_mode in ('remote', 'hybrid', 'on-site'));
