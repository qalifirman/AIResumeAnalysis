# JobMatch AI - AI-Powered Recruitment System

JobMatch AI is a full-stack recruitment platform that connects applicants and HR teams through resume management, AI-assisted job matching, application tracking, and candidate review tools.

The system has two main user roles:

- **Applicant**: uploads resumes, manages profile details, receives job recommendations, applies for jobs, and tracks application status.
- **HR**: manages company profile, creates job postings, reviews candidates, updates application statuses, views analytics, and generates recruitment reports.

## Live Demo

Production site:

```text
https://ai-recruitment-system-sooty.vercel.app
```

Frontend hosting is handled by Vercel. Backend API logic is handled by Supabase Edge Functions.

## Demo Video Guide

Recommended demo length: **10 minutes**.

Suggested demo flow:

1. Open the live system and introduce the two roles.
2. Log in as an applicant.
3. Show applicant dashboard overview.
4. Show profile management.
5. Upload or select an active resume.
6. Show parsed resume data such as skills, education, and work history.
7. Open job recommendations and explain AI match scores.
8. Open a job detail page and apply for a job.
9. Show application tracking from the applicant side.
10. Log out and log in as HR.
11. Show HR dashboard overview.
12. Show company profile management.
13. Create or edit a job posting.
14. Open candidate review.
15. Review applicant match score, resume details, matched skills, and missing skills.
16. Update application status, such as moving a candidate to under review or shortlisted.
17. Show analytics and report generation.
18. End with a technical summary of the architecture.

## Main Features

### Applicant Features

- Secure login and signup
- Applicant profile management
- Resume upload with PDF and Word document support
- Resume parsing and structured resume data
- Active resume selection
- AI-based job recommendations
- Job search, filtering, and saving
- Job application submission
- Application status tracking
- Interview practice support

### HR Features

- Secure HR login and signup with invite code
- Company profile management
- Job posting creation, editing, duplication, archiving, and deletion
- Candidate review dashboard
- Candidate filtering, searching, sorting, and status updates
- Match score review with skill analysis
- Candidate notes
- Interview scheduling support
- Kanban-style candidate pipeline
- CSV export
- Recruitment analytics
- Report generation

## Tech Stack

```text
Frontend:
  React
  TypeScript
  Vite
  Tailwind CSS

Backend:
  Supabase Edge Functions
  Hono
  Supabase JavaScript Client

Database and Storage:
  Supabase PostgreSQL
  Supabase Auth
  Supabase Storage
  Row-Level Security

Deployment:
  Vercel for frontend
  Supabase for backend functions, database, auth, and storage
```

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

ai-service/
  Optional Python semantic matching prototype
```

## How AI Matching Works

When an applicant applies for a job:

```text
Applicant selects a job and active resume
Browser sends application request to Supabase Edge Function
Backend fetches the real job and resume snapshot from Supabase
Backend calculates the candidate-job match score
Backend stores score, explanation, provider, fallback flag, and resume snapshot
HR reviews the application with match details
Applicant tracks the updated application status
```

The production scoring path is handled by the Supabase Edge Function. It can use configured AI providers first, then falls back to deterministic rule-based scoring if providers are unavailable.

Supported AI provider secrets, in runtime priority order:

- `ANTHROPIC_API_KEY`
- `GEMINI_API_KEY`
- `GROQ_API_KEY`

If no provider key is configured, the app still works using fallback scoring.

## Environment Variables

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
ANTHROPIC_API_KEY=optional
GEMINI_API_KEY=optional
GROQ_API_KEY=optional
RESEND_API_KEY=optional
FROM_EMAIL=noreply@your-domain.example
```

Do not commit real secrets to GitHub. The Supabase anon key can be used by the browser, but service-role keys and AI provider keys must stay private.

## Local Setup

Install dependencies:

```bash
npm install
```

Run type checking:

```bash
npm run type-check
```

Build the production frontend:

```bash
npm run build
```

Start the local development server:

```bash
npm run dev
```

Default local frontend URL:

```text
http://localhost:5173
```

## Supabase Deployment

Log in to Supabase:

```bash
supabase login
```

Link the Supabase project:

```bash
supabase link --project-ref YOUR_PROJECT_REF
```

Push database migrations:

```bash
supabase db push
```

Deploy the backend Edge Function:

```bash
supabase functions deploy server
```

Set function secrets:

```bash
supabase secrets set SITE_URL=https://your-deployed-site.example
supabase secrets set CORS_ORIGINS=https://your-deployed-site.example,http://localhost:5173
```

## Vercel Deployment

The frontend is deployed on Vercel.

Recommended Vercel settings:

```text
Framework Preset: Vite
Build Command: npm run build
Output Directory: dist
Install Command: npm install
```

Required Vercel environment variables:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_public_key_here
```

After GitHub is connected to Vercel, pushing frontend changes to the production branch will trigger a new Vercel deployment automatically. Supabase Edge Function changes still need to be deployed separately unless a CI workflow is configured.

## Security Notes

- Resume files are stored privately in Supabase Storage.
- The backend returns short-lived signed URLs for private resume access.
- Application scoring is performed server-side.
- HR signup requires a private invite code.
- Application status updates are validated by the backend.
- HR notes are not returned to applicant users.
- Row-Level Security protects user profile and application data.
- CORS must include the deployed Vercel domain for browser requests to the Edge Function.

## Optional Python AI Service

The `ai-service/` folder contains an optional Python semantic matching prototype. It is not the active production scoring path.

Run it only for experimentation:

```bash
cd ai-service
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

## Demo Summary

JobMatch AI demonstrates a complete recruitment workflow:

```text
Applicant uploads resume
System parses resume data
Applicant receives job recommendations
Applicant applies for a job
Backend calculates match score
HR reviews candidate
HR updates application status
Applicant tracks progress
```

This system helps applicants discover suitable opportunities and helps HR teams make faster, more structured recruitment decisions.
