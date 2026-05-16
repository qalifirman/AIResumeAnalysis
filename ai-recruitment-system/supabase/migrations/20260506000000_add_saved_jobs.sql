create table if not exists "public"."saved_jobs" (
  "id"         uuid not null default gen_random_uuid(),
  "user_id"    uuid not null references auth.users(id) on delete cascade,
  "job_id"     uuid not null references public.jobs(id) on delete cascade,
  "created_at" timestamptz not null default now(),
  constraint "saved_jobs_pkey" primary key (id),
  constraint "saved_jobs_user_job_unique" unique (user_id, job_id)
);

alter table "public"."saved_jobs" enable row level security;

create policy "Users can view own saved jobs"
  on "public"."saved_jobs" as permissive for select to public
  using (auth.uid() = user_id);

create policy "Users can save jobs"
  on "public"."saved_jobs" as permissive for insert to public
  with check (auth.uid() = user_id);

create policy "Users can unsave jobs"
  on "public"."saved_jobs" as permissive for delete to public
  using (auth.uid() = user_id);

grant select, insert, delete on "public"."saved_jobs" to anon, authenticated, service_role;
