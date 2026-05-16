alter table "public"."profiles"
  add column if not exists "company_name"        text,
  add column if not exists "company_industry"    text,
  add column if not exists "company_size"        text,
  add column if not exists "company_website"     text,
  add column if not exists "company_description" text;
