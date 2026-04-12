
  create table "public"."applications" (
    "id" uuid not null default gen_random_uuid(),
    "job_id" uuid not null,
    "applicant_id" uuid not null,
    "resume_url" text,
    "status" text default 'applied'::text,
    "years_of_experience" integer default 0,
    "match_score" double precision default 0,
    "skill_match_score" double precision default 0,
    "text_similarity" double precision default 0,
    "matched_skills" jsonb,
    "missing_skills" jsonb,
    "explanation" text,
    "created_at" timestamp with time zone default now()
      );


alter table "public"."applications" enable row level security;


  create table "public"."jobs" (
    "id" uuid not null default gen_random_uuid(),
    "hr_id" uuid not null,
    "title" text not null,
    "description" text,
    "requirements" jsonb,
    "salary_range" text,
    "department" text,
    "employment_type" text,
    "required_years_exp" integer default 0,
    "location" text,
    "status" text default 'active'::text,
    "created_at" timestamp with time zone default now()
      );


alter table "public"."jobs" enable row level security;


  create table "public"."profiles" (
    "id" uuid not null,
    "email" text not null,
    "name" text not null,
    "role" text not null,
    "created_at" timestamp with time zone default now()
      );


alter table "public"."profiles" enable row level security;


  create table "public"."resumes" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid not null,
    "file_name" text,
    "file_path" text,
    "file_url" text,
    "parsed_data" jsonb,
    "is_active" boolean default true,
    "created_at" timestamp with time zone default now()
      );


alter table "public"."resumes" enable row level security;

CREATE UNIQUE INDEX applications_pkey ON public.applications USING btree (id);

CREATE UNIQUE INDEX jobs_pkey ON public.jobs USING btree (id);

CREATE UNIQUE INDEX profiles_pkey ON public.profiles USING btree (id);

CREATE UNIQUE INDEX resumes_pkey ON public.resumes USING btree (id);

alter table "public"."applications" add constraint "applications_pkey" PRIMARY KEY using index "applications_pkey";

alter table "public"."jobs" add constraint "jobs_pkey" PRIMARY KEY using index "jobs_pkey";

alter table "public"."profiles" add constraint "profiles_pkey" PRIMARY KEY using index "profiles_pkey";

alter table "public"."resumes" add constraint "resumes_pkey" PRIMARY KEY using index "resumes_pkey";

alter table "public"."applications" add constraint "applications_applicant_id_fkey" FOREIGN KEY (applicant_id) REFERENCES auth.users(id) not valid;

alter table "public"."applications" validate constraint "applications_applicant_id_fkey";

alter table "public"."applications" add constraint "applications_job_id_fkey" FOREIGN KEY (job_id) REFERENCES public.jobs(id) not valid;

alter table "public"."applications" validate constraint "applications_job_id_fkey";

alter table "public"."jobs" add constraint "jobs_hr_id_fkey" FOREIGN KEY (hr_id) REFERENCES auth.users(id) not valid;

alter table "public"."jobs" validate constraint "jobs_hr_id_fkey";

alter table "public"."profiles" add constraint "profiles_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."profiles" validate constraint "profiles_id_fkey";

alter table "public"."profiles" add constraint "profiles_role_check" CHECK ((role = ANY (ARRAY['hr'::text, 'applicant'::text]))) not valid;

alter table "public"."profiles" validate constraint "profiles_role_check";

alter table "public"."resumes" add constraint "resumes_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) not valid;

alter table "public"."resumes" validate constraint "resumes_user_id_fkey";

grant delete on table "public"."applications" to "anon";

grant insert on table "public"."applications" to "anon";

grant references on table "public"."applications" to "anon";

grant select on table "public"."applications" to "anon";

grant trigger on table "public"."applications" to "anon";

grant truncate on table "public"."applications" to "anon";

grant update on table "public"."applications" to "anon";

grant delete on table "public"."applications" to "authenticated";

grant insert on table "public"."applications" to "authenticated";

grant references on table "public"."applications" to "authenticated";

grant select on table "public"."applications" to "authenticated";

grant trigger on table "public"."applications" to "authenticated";

grant truncate on table "public"."applications" to "authenticated";

grant update on table "public"."applications" to "authenticated";

grant delete on table "public"."applications" to "postgres";

grant insert on table "public"."applications" to "postgres";

grant references on table "public"."applications" to "postgres";

grant select on table "public"."applications" to "postgres";

grant trigger on table "public"."applications" to "postgres";

grant truncate on table "public"."applications" to "postgres";

grant update on table "public"."applications" to "postgres";

grant delete on table "public"."applications" to "service_role";

grant insert on table "public"."applications" to "service_role";

grant references on table "public"."applications" to "service_role";

grant select on table "public"."applications" to "service_role";

grant trigger on table "public"."applications" to "service_role";

grant truncate on table "public"."applications" to "service_role";

grant update on table "public"."applications" to "service_role";

grant delete on table "public"."jobs" to "anon";

grant insert on table "public"."jobs" to "anon";

grant references on table "public"."jobs" to "anon";

grant select on table "public"."jobs" to "anon";

grant trigger on table "public"."jobs" to "anon";

grant truncate on table "public"."jobs" to "anon";

grant update on table "public"."jobs" to "anon";

grant delete on table "public"."jobs" to "authenticated";

grant insert on table "public"."jobs" to "authenticated";

grant references on table "public"."jobs" to "authenticated";

grant select on table "public"."jobs" to "authenticated";

grant trigger on table "public"."jobs" to "authenticated";

grant truncate on table "public"."jobs" to "authenticated";

grant update on table "public"."jobs" to "authenticated";

grant delete on table "public"."jobs" to "postgres";

grant insert on table "public"."jobs" to "postgres";

grant references on table "public"."jobs" to "postgres";

grant select on table "public"."jobs" to "postgres";

grant trigger on table "public"."jobs" to "postgres";

grant truncate on table "public"."jobs" to "postgres";

grant update on table "public"."jobs" to "postgres";

grant delete on table "public"."jobs" to "service_role";

grant insert on table "public"."jobs" to "service_role";

grant references on table "public"."jobs" to "service_role";

grant select on table "public"."jobs" to "service_role";

grant trigger on table "public"."jobs" to "service_role";

grant truncate on table "public"."jobs" to "service_role";

grant update on table "public"."jobs" to "service_role";

grant delete on table "public"."profiles" to "anon";

grant insert on table "public"."profiles" to "anon";

grant references on table "public"."profiles" to "anon";

grant select on table "public"."profiles" to "anon";

grant trigger on table "public"."profiles" to "anon";

grant truncate on table "public"."profiles" to "anon";

grant update on table "public"."profiles" to "anon";

grant delete on table "public"."profiles" to "authenticated";

grant insert on table "public"."profiles" to "authenticated";

grant references on table "public"."profiles" to "authenticated";

grant select on table "public"."profiles" to "authenticated";

grant trigger on table "public"."profiles" to "authenticated";

grant truncate on table "public"."profiles" to "authenticated";

grant update on table "public"."profiles" to "authenticated";

grant delete on table "public"."profiles" to "postgres";

grant insert on table "public"."profiles" to "postgres";

grant references on table "public"."profiles" to "postgres";

grant select on table "public"."profiles" to "postgres";

grant trigger on table "public"."profiles" to "postgres";

grant truncate on table "public"."profiles" to "postgres";

grant update on table "public"."profiles" to "postgres";

grant delete on table "public"."profiles" to "service_role";

grant insert on table "public"."profiles" to "service_role";

grant references on table "public"."profiles" to "service_role";

grant select on table "public"."profiles" to "service_role";

grant trigger on table "public"."profiles" to "service_role";

grant truncate on table "public"."profiles" to "service_role";

grant update on table "public"."profiles" to "service_role";

grant delete on table "public"."resumes" to "anon";

grant insert on table "public"."resumes" to "anon";

grant references on table "public"."resumes" to "anon";

grant select on table "public"."resumes" to "anon";

grant trigger on table "public"."resumes" to "anon";

grant truncate on table "public"."resumes" to "anon";

grant update on table "public"."resumes" to "anon";

grant delete on table "public"."resumes" to "authenticated";

grant insert on table "public"."resumes" to "authenticated";

grant references on table "public"."resumes" to "authenticated";

grant select on table "public"."resumes" to "authenticated";

grant trigger on table "public"."resumes" to "authenticated";

grant truncate on table "public"."resumes" to "authenticated";

grant update on table "public"."resumes" to "authenticated";

grant delete on table "public"."resumes" to "postgres";

grant insert on table "public"."resumes" to "postgres";

grant references on table "public"."resumes" to "postgres";

grant select on table "public"."resumes" to "postgres";

grant trigger on table "public"."resumes" to "postgres";

grant truncate on table "public"."resumes" to "postgres";

grant update on table "public"."resumes" to "postgres";

grant delete on table "public"."resumes" to "service_role";

grant insert on table "public"."resumes" to "service_role";

grant references on table "public"."resumes" to "service_role";

grant select on table "public"."resumes" to "service_role";

grant trigger on table "public"."resumes" to "service_role";

grant truncate on table "public"."resumes" to "service_role";

grant update on table "public"."resumes" to "service_role";


  create policy "Applicants see own apps"
  on "public"."applications"
  as permissive
  for select
  to public
using ((auth.uid() = applicant_id));



  create policy "HR sees apps for their jobs"
  on "public"."applications"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM public.jobs
  WHERE ((jobs.id = applications.job_id) AND (jobs.hr_id = auth.uid())))));



  create policy "Enable insert for HR only"
  on "public"."jobs"
  as permissive
  for insert
  to public
with check ((auth.uid() = hr_id));



  create policy "Enable read access for all users"
  on "public"."jobs"
  as permissive
  for select
  to public
using (true);



  create policy "Enable insert for authenticated users only"
  on "public"."profiles"
  as permissive
  for insert
  to public
with check ((auth.uid() = id));



  create policy "Enable read access for all users"
  on "public"."profiles"
  as permissive
  for select
  to public
using (true);



  create policy "Users can see own resumes"
  on "public"."resumes"
  as permissive
  for select
  to public
using ((auth.uid() = user_id));



  create policy "Users can upload own resumes"
  on "public"."resumes"
  as permissive
  for insert
  to public
with check ((auth.uid() = user_id));



