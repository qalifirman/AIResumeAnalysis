alter table "public"."profiles"
  add column if not exists "phone"    text,
  add column if not exists "location" text,
  add column if not exists "headline" text,
  add column if not exists "bio"      text,
  add column if not exists "linkedin" text;
