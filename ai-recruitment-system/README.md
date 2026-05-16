# RecruitAI - AI-Powered Recruitment System

Full-stack recruitment platform built with React, TypeScript, Supabase, and Supabase Edge Functions.

The production scoring path is handled by the Edge Function. It uses configured LLM providers first, then records when it falls back to deterministic rule-based scoring. The Python `ai-service/` is kept as an optional experimental semantic matching service, not the active application scoring path.

## Project Structure

```text
src/
  api/                  Frontend API layer
  components/           Auth, HR, applicant, layout, and UI components
  contexts/             Auth and theme context
  types/                Shared TypeScript interfaces
  utils/                PDF parsing, score cache, Supabase config
supabase/
  functions/server/     Hono Edge Function API
  migrations/           PostgreSQL, RLS, and storage schema
ai-service/             Optional Python semantic matching prototype
```

## Environment

Frontend `.env.local`:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_public_key_here
```

Supabase Edge Function secrets:

```env
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_ANON_KEY=your_anon_public_key_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
SITE_URL=https://your-deployed-site.example
CORS_ORIGINS=https://your-deployed-site.example,http://localhost:5173
HR_SIGNUP_INVITE_CODE=choose-a-private-invite-code
GEMINI_API_KEY=optional
GROQ_API_KEY=optional
ANTHROPIC_API_KEY=optional
ENABLE_CLAUDE_FALLBACK=false
RESEND_API_KEY=optional
FROM_EMAIL=noreply@your-domain.example
```

At least one AI provider key is recommended for real AI scoring. If none are configured, the app will use rule-based fallback scoring and mark results as fallback.

## Setup

```bash
npm install
npm run type-check
npm run build
npm run dev
```

Deploy Supabase:

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
supabase functions deploy server
```

## Security Notes

- Resume storage is private. The API returns short-lived signed URLs.
- Application scoring is canonical server-side: the backend fetches the real job and the applicant resume snapshot.
- HR signup requires `HR_SIGNUP_INVITE_CODE`.
- Application status updates are validated server-side.
- HR notes are stored in `candidate_notes` and are not returned to applicants.
- Profile reads are restricted by RLS to self or valid application counterparties.

## How Matching Works

When an applicant applies:

```text
Browser -> POST /applications with jobId and resumeId
Edge Function -> fetches canonical job and resume from Supabase
Edge Function -> scores with Gemini, Groq, or Claude if configured
Edge Function -> falls back to deterministic scoring if providers fail
Edge Function -> stores score, explanation, provider, fallback flag, and resume snapshot
PostgreSQL -> stores application record for HR review
```

The optional Python service in `ai-service/` can still be run for experimentation:

```bash
cd ai-service
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

It is not currently called by the Edge Function.
