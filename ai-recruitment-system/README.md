# RecruitAI — AI-Powered Recruitment System

Full-stack recruitment platform with semantic AI matching.
Built with React + TypeScript + Supabase + Python (sentence-transformers).

---

## Project structure

```
├── src/
│   ├── api/            ← All fetch calls (one layer, never in components)
│   ├── types/          ← Shared TypeScript interfaces
│   ├── components/
│   │   ├── auth/       ← LoginPage
│   │   ├── layout/     ← Sidebar
│   │   ├── hr/         ← HRDashboard, JobManagement, CandidateReview, Analytics
│   │   └── applicant/  ← ApplicantDashboard, JobRecommendations, ResumeManager…
│   ├── contexts/       ← AuthContext (Supabase auth)
│   └── utils/
│       ├── ai/         ← nlp-engine.ts (client-side fallback matching)
│       └── supabase/   ← info.tsx (env vars)
├── supabase/
│   ├── functions/server/   ← Deno edge function (Hono)
│   └── migrations/         ← PostgreSQL schema
└── ai-service/         ← Python FastAPI (sentence-transformers AI scoring)
```

---

## 1. Supabase Cloud Setup

### Create the project
1. Go to **https://supabase.com** → New project
2. Choose region: **Southeast Asia (Singapore)**
3. Save your database password

### Run the database migration
1. Dashboard → **SQL Editor**
2. Paste the contents of `supabase/migrations/20260111052924_init_schema.sql`
3. Click **Run**

### Get your API keys
Dashboard → **Settings → API**
- Copy **Project URL** → `VITE_SUPABASE_URL`
- Copy **anon public key** → `VITE_SUPABASE_ANON_KEY`

### Create `.env.local`
```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_public_key_here
```

### Deploy the edge function
```bash
npm install -g supabase
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase functions deploy server
```

Then in **Dashboard → Edge Functions → server → Secrets**, add:
```
AI_SERVICE_URL = https://your-ai-service.onrender.com   # (after deploying AI service)
```

---

## 2. Run the frontend

```bash
npm install
npm run dev
```

Open http://localhost:3000

---

## 3. AI Service Setup

The Python service uses `sentence-transformers/all-MiniLM-L6-v2` —
a model trained on 1 billion+ sentence pairs that understands semantic
meaning (e.g. "React developer" ≈ "frontend engineer").

### Run locally
```bash
cd ai-service
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Test: http://localhost:8000/health

### Deploy to Render.com (free tier)
1. Push `ai-service/` to a GitHub repo
2. Go to **https://render.com** → New Web Service
3. Connect the repo, set:
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn main:app --host 0.0.0.0 --port 8000`
   - **Instance type**: Free
4. Copy the deployed URL (e.g. `https://recruitai-ai.onrender.com`)
5. Add it as `AI_SERVICE_URL` secret in your Supabase edge function

### Deploy to HuggingFace Spaces (free)
1. Create a new Space at huggingface.co → SDK: **Docker**
2. Upload the contents of `ai-service/`
3. The Space URL becomes your `AI_SERVICE_URL`

---

## 4. How the AI matching works

When an applicant clicks **Apply**:

```
Browser                  Edge Function              AI Service (Python)
  │                            │                           │
  ├─ POST /applications ──────►│                           │
  │  (resume text,             │                           │
  │   job description,         ├─ POST /score ────────────►│
  │   skills, etc.)            │  (resume + job text)      │  sentence-transformer
  │                            │◄─ match_score ────────────┤  cosine similarity
  │                            │   skill_match             │
  │                            │   explanation             │
  │                            │                           │
  │                            ├─ INSERT applications ─────► PostgreSQL
  │◄── { application } ────────┤
```

If the AI service is unavailable, the edge function falls back to
basic keyword overlap scoring automatically.

### Model details (for your FYP presentation)
- **Model**: `sentence-transformers/all-MiniLM-L6-v2`
- **Architecture**: 6-layer MiniLM transformer, 22M parameters
- **Training data**: SNLI, MultiNLI, MS MARCO, Wikipedia QA (1B+ pairs)
- **Output**: 384-dimensional sentence embeddings
- **Scoring**: Cosine similarity between resume and job description embeddings

---

## 5. Useful commands

```bash
# Frontend dev
npm run dev

# Type check
npx tsc --noEmit

# Deploy edge function
npm run deploy-functions

# AI service (local)
cd ai-service && uvicorn main:app --reload
```
