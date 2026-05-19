-- Block duplicate applications and add basic profile field constraints.

WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY job_id, applicant_id
      ORDER BY created_at ASC, id ASC
    ) AS rn
  FROM public.applications
)
DELETE FROM public.applications a
USING ranked r
WHERE a.id = r.id
  AND r.rn > 1;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'applications_job_applicant_unique'
      AND conrelid = 'public.applications'::regclass
  ) THEN
    ALTER TABLE public.applications
      ADD CONSTRAINT applications_job_applicant_unique UNIQUE (job_id, applicant_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profiles_text_lengths_check'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_text_lengths_check CHECK (
        length(name) <= 120
        AND (phone IS NULL OR length(phone) <= 40)
        AND (location IS NULL OR length(location) <= 120)
        AND (headline IS NULL OR length(headline) <= 160)
        AND (bio IS NULL OR length(bio) <= 1200)
        AND (linkedin IS NULL OR length(linkedin) <= 300)
        AND (company_name IS NULL OR length(company_name) <= 120)
        AND (company_industry IS NULL OR length(company_industry) <= 120)
        AND (company_size IS NULL OR length(company_size) <= 60)
        AND (company_website IS NULL OR length(company_website) <= 300)
        AND (company_description IS NULL OR length(company_description) <= 1200)
      ) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profiles_urls_check'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_urls_check CHECK (
        (linkedin IS NULL OR linkedin ~* '^https?://')
        AND (company_website IS NULL OR company_website ~* '^https?://')
      ) NOT VALID;
  END IF;
END $$;
