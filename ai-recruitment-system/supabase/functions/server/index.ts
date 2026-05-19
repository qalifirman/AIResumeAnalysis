import { Hono } from 'npm:hono';
import { cors } from 'npm:hono/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

const app = new Hono().basePath('/server');
const configuredOrigins = [
  Deno.env.get('SITE_URL'),
  ...(Deno.env.get('CORS_ORIGINS') || '').split(','),
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5174',
].map(origin => origin?.trim()).filter(Boolean) as string[];

app.use('*', cors({
  origin: (origin) => {
    if (!origin) return configuredOrigins[0] || '';
    return configuredOrigins.includes(origin) ? origin : '';
  },
  allowHeaders: ['Authorization', 'Content-Type'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
}));

const supabaseUrl        = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabaseAnonKey    = Deno.env.get('SUPABASE_ANON_KEY')!;
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') || '';
const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY') || '';
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') || '';
const ENABLE_CLAUDE_FALLBACK = Deno.env.get('ENABLE_CLAUDE_FALLBACK') === 'true';
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') || '';
const FROM_EMAIL = Deno.env.get('FROM_EMAIL') || 'noreply@jobmatchai.com';
const HR_SIGNUP_INVITE_CODE = Deno.env.get('HR_SIGNUP_INVITE_CODE') || '';
const MAX_RESUME_BYTES = 10 * 1024 * 1024;

type AIProvider = 'gemini' | 'groq' | 'claude';

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── Email via Resend (plug-and-play: set RESEND_API_KEY in Supabase secrets) ──
async function sendEmail(to: string, subject: string, html: string): Promise<{ ok: boolean; id?: string; error?: string }> {
  if (!RESEND_API_KEY) return { ok: false, error: 'RESEND_API_KEY is not configured.' };
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${RESEND_API_KEY}` },
      body: JSON.stringify({ from: FROM_EMAIL, to, subject, html }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data?.message || data?.error || `Resend HTTP ${res.status}` };
    return { ok: true, id: data?.id };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Email send failed.' };
  }
}

function emailStatusUpdate(candidateName: string, jobTitle: string, status: string): string {
  const safeName = escapeHtml(candidateName);
  const safeJobTitle = escapeHtml(jobTitle);
  const messages: Record<string, string> = {
    under_review: `Your application for <strong>${safeJobTitle}</strong> is now under review. The hiring team is assessing your profile.`,
    shortlisted:  `Congratulations! You have been <strong>shortlisted</strong> for <strong>${safeJobTitle}</strong>. Expect an interview invite soon.`,
    rejected:     `Thank you for applying to <strong>${safeJobTitle}</strong>. After careful consideration, we have decided to proceed with other candidates.`,
  };
  return `
    <div style="font-family:sans-serif;max-width:600px;margin:auto;padding:32px;background:#f9fafb;border-radius:12px">
      <h2 style="color:#1e1e2e;margin-bottom:8px">JobMatch AI — Application Update</h2>
      <p style="color:#555">Dear ${safeName},</p>
      <p style="color:#333">${messages[status] || 'Your application status has been updated.'}</p>
      <p style="color:#888;font-size:12px;margin-top:32px">© JobMatch AI · You received this because you applied for a job.</p>
    </div>`;
}

// Admin client — bypasses RLS for DB/Storage/Admin operations
const supabase = createClient(supabaseUrl, supabaseServiceKey);
const BUCKET        = 'recruitai-resumes';
const AVATAR_BUCKET = 'profile-avatars';
const ALLOWED_JOB_FIELDS = new Set(['Technology', 'Security', 'Medical']);

function isAllowedJobField(value: unknown): value is string {
  return typeof value === 'string' && ALLOWED_JOB_FIELDS.has(value);
}

function inferJobFieldFromText(job: any): 'Technology' | 'Security' | 'Medical' {
  if (isAllowedJobField(job?.department)) return job.department;
  const text = `${job?.title || ''} ${job?.department || ''} ${job?.description || ''} ${(job?.requirements || []).join(' ')}`.toLowerCase();
  if (/\b(guard|security|patrol|cctv|access control|visitor|surveillance|mosque|school gate|incident|perimeter)\b/.test(text)) {
    return 'Security';
  }
  if (/\b(doctor|nurse|surgeon|medical|patient|clinical|hospital|clinic|triage|surgery|ward|medication)\b/.test(text)) {
    return 'Medical';
  }
  return 'Technology';
}

async function ensureBuckets() {
  const { data: buckets } = await supabase.storage.listBuckets();
  const names = buckets?.map((b: any) => b.name) ?? [];
  if (!names.includes(BUCKET)) {
    await supabase.storage.createBucket(BUCKET, { public: false, fileSizeLimit: MAX_RESUME_BYTES });
  } else {
    await supabase.storage.updateBucket(BUCKET, { public: false, fileSizeLimit: MAX_RESUME_BYTES });
  }
  if (!names.includes(AVATAR_BUCKET)) {
    await supabase.storage.createBucket(AVATAR_BUCKET, { public: true });
  }
}
ensureBuckets().catch(console.error);

async function verifyAuth(req: Request) {
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return null;
    const token = authHeader.slice(7).trim();
    if (!token) return null;
    // Use a user-scoped client so the JWT is validated correctly.
    // Calling auth.getUser() on the service-role admin client can silently
    // fail because the service key overrides the Authorization header
    // internally in some supabase-js v2 versions.
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: { user }, error } = await userClient.auth.getUser();
    if (error) { console.error('[verifyAuth] getUser error:', error.message); return null; }
    if (!user)  { console.error('[verifyAuth] getUser returned no user'); return null; }
    return user;
  } catch (e: any) {
    console.error('[verifyAuth] exception:', e?.message ?? e);
    return null;
  }
}

async function verifyRole(userId: string): Promise<'hr' | 'applicant' | null> {
  const { data } = await supabase.from('profiles').select('role').eq('id', userId).single();
  return (data?.role as 'hr' | 'applicant') || null;
}

// ── Rate limiting (in-memory, per user per minute) ────────────────────────────
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
function checkRateLimit(userId: string, action: string, maxPerMinute: number): boolean {
  const key = `${userId}:${action}`;
  const now = Date.now();
  const entry = rateLimitMap.get(key);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (entry.count >= maxPerMinute) return false;
  entry.count++;
  return true;
}

const VALID_APPLICATION_STATUSES = new Set(['applied', 'under_review', 'shortlisted', 'rejected']);
const MAX_TEXT_INPUT = 20_000;

function cleanOptionalText(value: unknown, max = 500): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw new Error('Invalid text field.');
  const trimmed = value.trim();
  if (trimmed.length > max) throw new Error(`Text field must be ${max} characters or less.`);
  return trimmed || null;
}

function cleanRequiredText(value: unknown, field: string, max = 120): string {
  if (typeof value !== 'string') throw new Error(`${field} is required.`);
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${field} is required.`);
  if (trimmed.length > max) throw new Error(`${field} must be ${max} characters or less.`);
  return trimmed;
}

function cleanOptionalUrl(value: unknown, field: string): string | null {
  const text = cleanOptionalText(value, 300);
  if (!text) return null;
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new Error(`${field} must be a valid URL.`);
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error(`${field} must start with http:// or https://.`);
  return url.toString();
}

function isOwnedStoragePath(path: unknown, userId: string): path is string {
  return typeof path === 'string'
    && path.startsWith(`${userId}/`)
    && !path.includes('..')
    && /^[0-9a-f-]{36}\/[^/\\]+$/i.test(path);
}

async function storageObjectExists(path: string): Promise<boolean> {
  const slash = path.lastIndexOf('/');
  const folder = path.slice(0, slash);
  const name = path.slice(slash + 1);
  const { data, error } = await supabase.storage.from(BUCKET).list(folder, { search: name, limit: 1 });
  if (error) {
    console.error('[storage exists] failed:', error.message);
    return false;
  }
  return !!data?.some((item: any) => item.name === name);
}

async function createResumeSignedUrl(path?: string | null): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 60);
  if (error) {
    console.error('[resume signed url] failed:', error.message);
    return null;
  }
  return data?.signedUrl || null;
}

// ── AI scoring helpers ────────────────────────────────────────────────────────

function requireLLM(feature: string) {
  if (!GEMINI_API_KEY && !GROQ_API_KEY && !(ENABLE_CLAUDE_FALLBACK && ANTHROPIC_API_KEY)) {
    throw new Error(`${feature} requires GEMINI_API_KEY, GROQ_API_KEY, or enabled Claude fallback to be configured.`);
  }
}

function extractJsonObject(text: string) {
  const cleaned = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) throw new Error('AI response did not contain JSON.');
  return JSON.parse(cleaned.slice(start, end + 1));
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter(v => typeof v === 'string').map(v => v.trim()).filter(Boolean) : [];
}

const COMMON_SKILLS = [
  'JavaScript', 'TypeScript', 'Python', 'Java', 'C++', 'C#', 'PHP', 'Ruby', 'Go', 'Rust',
  'React', 'Angular', 'Vue', 'Next.js', 'Node.js', 'Express', 'Django', 'Flask', 'Laravel',
  'HTML', 'CSS', 'Tailwind CSS', 'Bootstrap', 'SQL', 'PostgreSQL', 'MySQL', 'MongoDB',
  'Redis', 'Supabase', 'Firebase', 'AWS', 'Azure', 'Google Cloud', 'Docker', 'Kubernetes',
  'Git', 'GitHub', 'CI/CD', 'REST API', 'GraphQL', 'Machine Learning', 'Deep Learning',
  'TensorFlow', 'PyTorch', 'Pandas', 'NumPy', 'Data Analysis', 'Data Science', 'Power BI',
  'Tableau', 'Excel', 'Figma', 'UI/UX', 'Project Management', 'Agile', 'Scrum', 'SEO',
  'Marketing', 'Sales', 'Customer Service', 'Communication', 'Leadership',
  'Security Guard', 'Access Control', 'Patrol', 'Incident Reporting', 'CCTV Monitoring',
  'Visitor Management', 'Crowd Control', 'Emergency Response', 'Loss Prevention',
  'Static Guarding', 'Site Security', 'Fire Safety', 'First Aid', 'Radio Communication',
  'Risk Assessment', 'Security SOP', 'Perimeter Check',
  'Patient Care', 'Triage', 'Clinical Assessment', 'Medication Administration',
  'Wound Care', 'Vital Signs', 'Emergency Medicine', 'Surgery', 'Nursing',
  'Medical Records', 'Infection Control', 'Phlebotomy', 'Patient Safety',
  'Diagnosis', 'Treatment Planning', 'Operating Theatre', 'ICU', 'Ward Management',
];

function tokenizeText(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9+#.\s-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !['the', 'and', 'for', 'with', 'you', 'are', 'this', 'that', 'from'].includes(w));
}

function extractFallbackSkills(text: string): string[] {
  const lower = text.toLowerCase();
  return COMMON_SKILLS.filter(skill => lower.includes(skill.toLowerCase()));
}

function estimateYears(text: string): number {
  const explicit = [...text.matchAll(/(\d+)\+?\s*(?:years?|yrs?)\s*(?:of\s*)?(?:experience|exp)?/gi)]
    .map(m => Number(m[1]))
    .filter(n => Number.isFinite(n));
  if (explicit.length) return Math.max(...explicit);

  const ranges = [...text.matchAll(/(\d{4})\s*[-–—]\s*(\d{4}|present|current)/gi)];
  if (!ranges.length) return 0;
  const currentYear = new Date().getFullYear();
  return ranges.reduce((sum, m) => {
    const start = Number(m[1]);
    const end = /present|current/i.test(m[2]) ? currentYear : Number(m[2]);
    return sum + Math.max(0, end - start);
  }, 0);
}

function fallbackParseResume(rawText: string) {
  const email = rawText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];
  const firstUsefulLine = rawText.split(/\r?\n/).map(l => l.trim()).find(l =>
    l.length >= 2 && l.length <= 80 && !l.includes('@') && !/\d{4}/.test(l)
  );
  const education = rawText.split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => /bachelor|master|phd|doctorate|degree|diploma|university|college/i.test(l))
    .slice(0, 5);

  return {
    name: firstUsefulLine || undefined,
    email: email || undefined,
    skills: extractFallbackSkills(rawText),
    yearsOfExperience: estimateYears(rawText),
    education,
    workHistory: [],
    structuredEducation: education.map(line => ({ degree: line, institution: '', year: '' })),
    ai_provider: 'rule-based',
    is_fallback: true,
    rawText,
  };
}

function fallbackScoreMatch(payload: {
  resumeText: string;
  jobDescription: string;
  resumeSkills: string[];
  requiredSkills: string[];
  resumeYearsExp: number;
  requiredYearsExp: number;
}) {
  const resumeSkills = payload.resumeSkills.length ? payload.resumeSkills : extractFallbackSkills(payload.resumeText);
  const requiredSkills = payload.requiredSkills.length ? payload.requiredSkills : extractFallbackSkills(payload.jobDescription);
  const normalizedResume = resumeSkills.map(s => s.toLowerCase());
  const matched = requiredSkills.filter(s => normalizedResume.includes(s.toLowerCase()));
  const missing = requiredSkills.filter(s => !normalizedResume.includes(s.toLowerCase()));

  const skillScore = requiredSkills.length ? matched.length / requiredSkills.length : 0;
  const resumeWords = new Set(tokenizeText(payload.resumeText));
  const jobWords = new Set(tokenizeText(payload.jobDescription));
  const overlap = [...jobWords].filter(w => resumeWords.has(w)).length;
  const textScore = jobWords.size ? overlap / jobWords.size : 0;
  const resumeYears = payload.resumeYearsExp || estimateYears(payload.resumeText);
  const requiredYears = payload.requiredYearsExp || 0;
  const experienceScore = requiredYears === 0 ? 1 : resumeYears >= requiredYears ? 1 : resumeYears >= requiredYears * 0.5 ? 0.8 : resumeYears > 0 ? 0.5 : 0.2;
  let score = (skillScore * 0.5) + (textScore * 0.3) + (experienceScore * 0.2);
  if (requiredSkills.length && skillScore < 0.2) score = Math.min(score, 0.2);

  return {
    match_score: Math.round(score * 100) / 100,
    skill_match_score: Math.round(skillScore * 100) / 100,
    text_similarity: Math.round(textScore * 100) / 100,
    experience_score: Math.round(experienceScore * 100) / 100,
    matched_skills: matched,
    missing_skills: missing,
    ai_provider: 'rule-based',
    is_fallback: true,
    explanation: `Fallback estimate used because all AI providers were unavailable. Matched ${matched.length} of ${requiredSkills.length} required skills with ${resumeYears} year(s) of detected experience.`,
  };
}

function fallbackInterviewQuestions(input: any): string[] {
  const jobTitle = input.jobTitle || 'this role';
  const matched = asStringArray(input.matchedSkills);
  const missing = asStringArray(input.missingSkills);
  const questions = [
    `Tell me about your background and why you are interested in the ${jobTitle} role.`,
    matched[0] ? `Can you describe a project where you used ${matched[0]} successfully?` : `Which recent project best shows your fit for the ${jobTitle} role?`,
    matched[1] ? `What challenges have you handled while working with ${matched[1]}?` : `How do you usually approach learning a new tool or workflow?`,
    missing[0] ? `This role may require ${missing[0]}. How would you close that gap quickly?` : `What skill are you currently improving and why?`,
    `Describe a difficult technical or workplace problem you solved from start to finish.`,
    `What would you want to achieve in your first 90 days in this position?`,
  ];
  return questions.slice(0, 8);
}

type PracticeField = 'Technology' | 'Security' | 'Medical';

const PRACTICE_KEYWORDS: Record<PracticeField, string[]> = {
  Technology: [
    'java', 'python', 'javascript', 'typescript', 'react', 'node', 'sql', 'database',
    'api', 'software', 'developer', 'programming', 'frontend', 'backend', 'cloud',
    'docker', 'machine learning', 'data', 'cybersecurity',
  ],
  Security: [
    'security guard', 'guard', 'patrol', 'access control', 'cctv', 'visitor',
    'incident', 'site security', 'crowd control', 'fire safety', 'radio',
    'perimeter', 'surveillance', 'loss prevention',
  ],
  Medical: [
    'doctor', 'nurse', 'surgeon', 'medical', 'patient', 'clinical', 'triage',
    'medication', 'hospital', 'clinic', 'surgery', 'ward', 'vital signs',
    'diagnosis', 'treatment', 'wound',
  ],
};

function inferPracticeField(resume: any): { field: PracticeField; confidence: number; focusSkills: string[] } {
  const skills = asStringArray(resume?.skills);
  const rawText = String(resume?.rawText || '');
  const combined = `${skills.join(' ')} ${rawText}`.toLowerCase();
  const scores = Object.entries(PRACTICE_KEYWORDS).map(([field, keywords]) => ({
    field: field as PracticeField,
    score: keywords.reduce((sum, keyword) => sum + (combined.includes(keyword) ? 1 : 0), 0),
  })).sort((a, b) => b.score - a.score);

  const field = scores[0]?.score ? scores[0].field : 'Technology';
  const confidence = scores[0]?.score ? Math.min(0.95, 0.45 + scores[0].score * 0.08) : 0.35;
  const focusSkills = skills.filter(skill =>
    PRACTICE_KEYWORDS[field].some(keyword => skill.toLowerCase().includes(keyword) || keyword.includes(skill.toLowerCase()))
  ).slice(0, 8);

  return {
    field,
    confidence: Math.round(confidence * 100) / 100,
    focusSkills: focusSkills.length ? focusSkills : skills.slice(0, 8),
  };
}

function fallbackPracticeQuestions(field: PracticeField, focusSkills: string[]) {
  const primary = focusSkills[0] || (field === 'Technology' ? 'problem solving' : field === 'Security' ? 'site safety' : 'patient care');
  const secondary = focusSkills[1] || (field === 'Technology' ? 'data handling' : field === 'Security' ? 'incident reporting' : 'clinical judgement');
  const banks: Record<PracticeField, any[]> = {
    Technology: [
      {
        focus: primary,
        prompt: `In a ${primary} task, what should you explain first when solving a coding interview problem?`,
        options: ['The final answer only', 'The problem constraints, approach, and trade-offs', 'Your salary expectation', 'The UI color palette'],
        answer: 1,
        explanation: 'Interviewers look for clear reasoning before code, especially constraints and trade-offs.',
      },
      {
        focus: secondary,
        prompt: `If a query related to ${secondary} is slow in production, what is the best first investigation?`,
        options: ['Delete old source files', 'Check query plan, indexes, and data volume', 'Restart the monitor', 'Change all variable names'],
        answer: 1,
        explanation: 'A query plan and indexes usually reveal whether the database is scanning too much data.',
      },
      {
        focus: 'Debugging',
        prompt: 'A feature works locally but fails after deployment. What is the strongest first check?',
        options: ['Assume the user is wrong', 'Compare environment variables, build logs, and network/API errors', 'Rewrite the whole app', 'Remove authentication'],
        answer: 1,
        explanation: 'Deployment issues often come from configuration, build, or network differences.',
      },
      {
        focus: 'Code Quality',
        prompt: 'What makes a technical answer stronger in an interview?',
        options: ['Mentioning only buzzwords', 'Explaining edge cases and testing strategy', 'Avoiding examples', 'Changing topic quickly'],
        answer: 1,
        explanation: 'Edge cases and tests show that you can reason beyond the happy path.',
      },
    ],
    Security: [
      {
        focus: primary,
        prompt: `While handling ${primary}, what should a guard prioritize?`,
        options: ['Speed only', 'Safety, authorization, and clear reporting', 'Personal opinion', 'Leaving the post unattended'],
        answer: 1,
        explanation: 'Security work depends on safety, SOP compliance, and accurate escalation.',
      },
      {
        focus: secondary,
        prompt: `What makes a ${secondary} report useful?`,
        options: ['Short vague notes', 'Time, location, people involved, observation, and action taken', 'Only emotional language', 'No supervisor update'],
        answer: 1,
        explanation: 'A useful incident report is factual, traceable, and actionable.',
      },
      {
        focus: 'Access Control',
        prompt: 'A contractor arrives without authorization at a school site. What should happen first?',
        options: ['Allow entry because they look professional', 'Verify identity and authorization with the responsible person', 'Ignore the logbook', 'Ask students to decide'],
        answer: 1,
        explanation: 'Identity and authorization must be verified before access is granted.',
      },
      {
        focus: 'Patrol',
        prompt: 'Which patrol observation needs escalation?',
        options: ['A closed gate is locked', 'A damaged fence section near a dark area', 'A clean guard post', 'A completed logbook'],
        answer: 1,
        explanation: 'Damaged perimeter security creates risk and should be reported promptly.',
      },
    ],
    Medical: [
      {
        focus: primary,
        prompt: `In ${primary}, what should come before a routine task?`,
        options: ['Patient safety and correct identification', 'Speed only', 'Skipping documentation', 'Assuming previous notes are always current'],
        answer: 0,
        explanation: 'Patient identity and safety checks reduce clinical risk.',
      },
      {
        focus: secondary,
        prompt: `A scenario tests ${secondary}. What is the best interview answer style?`,
        options: ['Guess quickly', 'State assessment, immediate safety action, escalation, and documentation', 'Avoid mentioning escalation', 'Discuss unrelated experience'],
        answer: 1,
        explanation: 'Clinical interviewers value structured judgement and safe escalation.',
      },
      {
        focus: 'Triage',
        prompt: 'Which patient should be escalated fastest?',
        options: ['Mild itch for one week', 'Chest pain with sweating and shortness of breath', 'Routine prescription refill', 'Stable follow-up request'],
        answer: 1,
        explanation: 'Chest pain with those symptoms can be life-threatening.',
      },
      {
        focus: 'Medication Safety',
        prompt: 'Before medication administration, what is the safest check?',
        options: ['Patient, medication, dose, route, and time', 'Only room number', 'Only medication color', 'No check if the ward is busy'],
        answer: 0,
        explanation: 'The standard medication rights prevent avoidable harm.',
      },
    ],
  };
  return banks[field];
}

function normalizePracticeQuestions(value: any): any[] {
  if (!Array.isArray(value)) return [];
  return value.map((q: any) => ({
    focus: String(q?.focus || 'Interview Practice').slice(0, 80),
    prompt: String(q?.prompt || '').slice(0, 700),
    options: Array.isArray(q?.options) ? q.options.map((o: any) => String(o)).filter(Boolean).slice(0, 4) : [],
    answer: Number.isInteger(q?.answer) ? q.answer : Number(q?.answer) || 0,
    explanation: String(q?.explanation || '').slice(0, 700),
  })).filter((q: any) => q.prompt && q.options.length === 4 && q.answer >= 0 && q.answer <= 3);
}

function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = 12000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
}

async function generateAIResult(prompt: string, maxTokens = 700, temperature = 0.2): Promise<{ text: string; provider: AIProvider }> {
  requireLLM('Real AI generation');
  const errors: string[] = [];

  if (GEMINI_API_KEY) {
    try {
      const res = await fetchWithTimeout(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { maxOutputTokens: maxTokens, temperature },
          }),
        },
      );
      if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`);
      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.map((p: any) => p.text).filter(Boolean).join('').trim();
      if (!text) throw new Error('Gemini returned empty response');
      return { text, provider: 'gemini' };
    } catch (e: any) {
      errors.push(`Gemini: ${e?.message}`);
      console.warn('[AI] Gemini failed, falling back to Groq:', e?.message);
    }
  }

  if (GROQ_API_KEY) {
    try {
      const res = await fetchWithTimeout(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_API_KEY}` },
          body: JSON.stringify({
            messages: [{ role: 'user', content: prompt }],
            model: 'llama-3.1-8b-instant',
            max_tokens: maxTokens,
            temperature,
          }),
        },
      );
      if (!res.ok) throw new Error(`Groq HTTP ${res.status}`);
      const data = await res.json();
      const text = data.choices?.[0]?.message?.content?.trim();
      if (!text) throw new Error('Groq returned empty response');
      return { text, provider: 'groq' };
    } catch (e: any) {
      errors.push(`Groq: ${e?.message}`);
      console.warn(
        ENABLE_CLAUDE_FALLBACK
          ? '[AI] Groq failed, falling back to Claude:'
          : '[AI] Groq failed, Claude fallback disabled:',
        e?.message,
      );
    }
  }

  if (ENABLE_CLAUDE_FALLBACK && ANTHROPIC_API_KEY) {
    try {
      const res = await fetchWithTimeout(
        'https://api.anthropic.com/v1/messages',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: maxTokens,
            temperature,
            messages: [{ role: 'user', content: prompt }],
          }),
        },
      );
      if (!res.ok) throw new Error(`Anthropic HTTP ${res.status}`);
      const data = await res.json();
      const text = data.content?.[0]?.text?.trim();
      if (!text) throw new Error('Anthropic returned empty response');
      return { text, provider: 'claude' };
    } catch (e: any) {
      errors.push(`Anthropic: ${e?.message}`);
      console.warn('[AI] Anthropic failed:', e?.message);
    }
  }

  throw new Error(`All AI providers failed. ${errors.join(' | ')}`);
}

async function generateAIText(prompt: string, maxTokens = 700, temperature = 0.2): Promise<string> {
  return (await generateAIResult(prompt, maxTokens, temperature)).text;
}

async function generateAIExplanation(
  jobTitle: string,
  jobDesc: string,
  matchedSkills: string[],
  missingSkills: string[],
  matchScore: number,
  yearsExp: number,
  requiredYearsExp: number,
): Promise<string | null> {
  const prompt = `You are a recruitment AI assistant. Write a concise 2-sentence candidate evaluation.

Job: ${jobTitle}
Job Description: ${jobDesc}
Overall Match: ${Math.round(matchScore * 100)}%
Matched Skills: ${matchedSkills.join(', ') || 'None'}
Missing Skills: ${missingSkills.join(', ') || 'None'}
Candidate Experience: ${yearsExp} year(s) | Required: ${requiredYearsExp} year(s)

Respond with ONLY the evaluation text. Be specific about key strengths and skill gaps.`;

  // Current provider order is Gemini first, then Groq, then Claude.
  return generateAIText(prompt, 220, 0.4);

}

// ── AI scoring (calls Python service if available, falls back to built-in) ────

async function scoreMatch(payload: {
  jobTitle: string;
  resumeText: string;
  jobDescription: string;
  resumeSkills: string[];
  requiredSkills: string[];
  resumeYearsExp: number;
  requiredYearsExp: number;
}) {
  const prompt = `You are a recruitment matching AI. Analyze the resume against the job and return ONLY valid JSON with this exact shape:
{
  "match_score": number,
  "skill_match_score": number,
  "text_similarity": number,
  "experience_score": number,
  "matched_skills": string[],
  "missing_skills": string[],
  "explanation": string
}

Rules:
- All score fields must be decimals from 0 to 1.
- Use semantic understanding, not exact keyword matching.
- Consider transferable skills and synonyms.
- Penalize unrelated resumes even if they share generic words.
- matched_skills should include skills the candidate clearly has for this job.
- missing_skills should include the most important gaps.
- explanation must be 2 concise sentences.

Job title: ${payload.jobTitle || 'Unknown role'}
Required years: ${payload.requiredYearsExp}
Tagged required skills: ${payload.requiredSkills.join(', ') || 'None'}
Resume detected skills: ${payload.resumeSkills.join(', ') || 'None'}
Candidate years: ${payload.resumeYearsExp}

Job description:
${payload.jobDescription.slice(0, 8000)}

Resume:
${payload.resumeText.slice(0, 12000)}`;

  try {
    const aiResult = await generateAIResult(prompt, 1200);
    const aiScore = extractJsonObject(aiResult.text);
    const matched = asStringArray(aiScore.matched_skills);
    const missing = asStringArray(aiScore.missing_skills);
    const score = Math.max(0, Math.min(1, Number(aiScore.match_score) || 0));

    return {
      match_score: score,
      skill_match_score: Math.max(0, Math.min(1, Number(aiScore.skill_match_score) || 0)),
      text_similarity: Math.max(0, Math.min(1, Number(aiScore.text_similarity) || 0)),
      experience_score: Math.max(0, Math.min(1, Number(aiScore.experience_score) || 0)),
      matched_skills: matched,
      missing_skills: missing,
      ai_provider: aiResult.provider,
      is_fallback: false,
      explanation: typeof aiScore.explanation === 'string' && aiScore.explanation.trim()
        ? aiScore.explanation.trim()
        : await generateAIExplanation(
          payload.jobTitle,
          payload.jobDescription,
          matched,
          missing,
          score,
          payload.resumeYearsExp,
          payload.requiredYearsExp,
        ).catch(() => `AI score generated, but explanation fallback was used. Matched ${matched.length} relevant skill(s).`),
    };
  } catch (e: any) {
    console.warn('[AI] score-match fallback used:', e?.message);
    return fallbackScoreMatch(payload);
  }
}

// ── Auth ──────────────────────────────────────────────────────────────────────

app.post('/signup', async (c) => {
  try {
    const { email, password, name, role, inviteCode } = await c.req.json();
    const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    const cleanInviteCode = typeof inviteCode === 'string' ? inviteCode.trim() : '';
    if (!cleanEmail || !password || !name || !role) return c.json({ error: 'Missing fields' }, 400);
    if (!['hr', 'applicant'].includes(role)) return c.json({ error: 'Invalid role' }, 400);
    if (typeof password !== 'string' || password.length < 8 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) {
      return c.json({ error: 'Password must be at least 8 characters and include uppercase, lowercase, and a number.' }, 400);
    }
    const safeName = cleanRequiredText(name, role === 'hr' ? 'Company name' : 'Name', 120);
    if (!checkRateLimit(cleanEmail, 'signup', 3)) return c.json({ error: 'Too many signup attempts. Please try again later.' }, 429);
    if (role === 'hr' && (!HR_SIGNUP_INVITE_CODE || cleanInviteCode !== HR_SIGNUP_INVITE_CODE)) {
      return c.json({ error: 'HR signup requires an administrator invite code.' }, 403);
    }
    const { data: adminData, error: adminError } = await supabase.auth.admin.createUser({
      email: cleanEmail,
      password,
      email_confirm: true,
      user_metadata: { name: safeName, role },
    });
    if (adminError || !adminData.user?.id) {
      const message = adminError?.message || 'Signup could not create an account.';
      const friendly = /already|duplicate|registered|exists/i.test(message)
        ? 'This email may already be registered. Please sign in, reset your password, or use a different email.'
        : message;
      return c.json({ error: friendly }, /already|duplicate|registered|exists/i.test(message) ? 409 : 400);
    }

    const userId = adminData.user.id;

    const { error: pe } = await supabase.from('profiles').insert({
      id: userId,
      email: cleanEmail,
      name: safeName,
      role,
      company_name: role === 'hr' ? safeName : null,
    });
    if (pe) {
      if ((pe as any).code === '23505') {
        return c.json({ error: 'An account profile already exists for this email. Please sign in instead.' }, 409);
      }
      console.error('[signup] profile creation failed:', pe.message);
      return c.json({ error: 'Profile creation failed. Please contact an administrator.' }, 500);
    }
    return c.json({ user: { id: userId, email: cleanEmail, name: safeName, role }, verificationRequired: false });
  } catch (e: any) {
    return c.json({ error: e?.message || 'Signup failed' }, e?.message ? 400 : 500);
  }
});

app.get('/user/profile', async (c) => {
  const user = await verifyAuth(c.req.raw);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);
  const { data, error } = await supabase.from('profiles').select('*').eq('id', user.id).single();
  if (error || !data) return c.json({ error: 'Profile not found' }, 404);
  // Fall back to user_metadata for fields not yet in profiles table (backwards compat)
  const { data: authUser } = await supabase.auth.admin.getUserById(user.id);
  const meta = authUser?.user?.user_metadata ?? {};
  return c.json({ profile: {
    id:         data.id,
    email:      data.email,
    name:       data.name,
    role:       data.role,
    created_at: data.created_at,
    phone:      data.phone      ?? meta.phone      ?? null,
    location:   data.location   ?? meta.location   ?? null,
    headline:   data.headline   ?? meta.headline   ?? null,
    bio:        data.bio        ?? meta.bio        ?? null,
    linkedin:   data.linkedin   ?? meta.linkedin   ?? null,
    avatar_url: data.avatar_url ?? meta.avatar_url ?? null,
    company_name:        data.company_name        ?? meta.company_name        ?? null,
    company_industry:    data.company_industry    ?? meta.company_industry    ?? null,
    company_size:        data.company_size        ?? meta.company_size        ?? null,
    company_website:     data.company_website     ?? meta.company_website     ?? null,
    company_description: data.company_description ?? meta.company_description ?? null,
  }});
});

app.post('/email/test', async (c) => {
  const user = await verifyAuth(c.req.raw);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);
  const { data: profile } = await supabase.from('profiles').select('email,name').eq('id', user.id).single();
  const to = profile?.email || user.email;
  if (!to) return c.json({ error: 'No email found for this user.' }, 400);

  const result = await sendEmail(
    to,
    'JobMatch AI email test',
    `<div style="font-family:sans-serif;max-width:600px;margin:auto;padding:32px">
      <h2 style="color:#8b5cf6">Email test successful</h2>
      <p>Hi ${escapeHtml(profile?.name || 'there')},</p>
      <p>Your JobMatch AI backend successfully called Resend using the configured sender.</p>
      <p style="color:#666;font-size:12px;margin-top:24px">If you are using onboarding@resend.dev, this only works for the email address on your Resend account.</p>
    </div>`,
  );

  if (!result.ok) return c.json({ error: result.error || 'Email failed.' }, 502);
  return c.json({ success: true, to, id: result.id });
});

app.put('/user/profile', async (c) => {
  const user = await verifyAuth(c.req.raw);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);
  const role = await verifyRole(user.id);
  let safeFields: Record<string, any>;
  try {
    const body = await c.req.json();
    safeFields = {
      name: cleanRequiredText(body.name, 'Name', 120),
      phone: cleanOptionalText(body.phone, 40),
      location: cleanOptionalText(body.location, 120),
      headline: cleanOptionalText(body.headline, 160),
      bio: cleanOptionalText(body.bio, 1200),
      linkedin: cleanOptionalUrl(body.linkedin, 'LinkedIn URL'),
      company_name: role === 'hr' ? cleanOptionalText(body.company_name, 120) : null,
      company_industry: role === 'hr' ? cleanOptionalText(body.company_industry, 120) : null,
      company_size: role === 'hr' ? cleanOptionalText(body.company_size, 60) : null,
      company_website: role === 'hr' ? cleanOptionalUrl(body.company_website, 'Company website') : null,
      company_description: role === 'hr' ? cleanOptionalText(body.company_description, 1200) : null,
    };
  } catch (e: any) {
    return c.json({ error: e?.message || 'Invalid profile fields.' }, 400);
  }
  // Write all fields to profiles table so HR can query them directly
  const { data, error } = await supabase.from('profiles')
    .update(safeFields)
    .eq('id', user.id).select().single();
  if (error) return c.json({ error: 'Update failed' }, 500);
  // Also keep user_metadata in sync (for backwards compat + auth token claims)
  const { data: authUser } = await supabase.auth.admin.getUserById(user.id);
  const existingMeta = authUser?.user?.user_metadata ?? {};
  await supabase.auth.admin.updateUserById(user.id, {
    user_metadata: {
      ...existingMeta,
      ...safeFields,
    },
  });
  return c.json({ profile: {
    id:         data.id,
    email:      data.email,
    name:       data.name,
    role:       data.role,
    created_at: data.created_at,
    phone:      data.phone      ?? null,
    location:   data.location   ?? null,
    headline:   data.headline   ?? null,
    bio:        data.bio        ?? null,
    linkedin:   data.linkedin   ?? null,
    avatar_url: data.avatar_url ?? existingMeta.avatar_url ?? null,
    company_name:        data.company_name        ?? null,
    company_industry:    data.company_industry    ?? null,
    company_size:        data.company_size        ?? null,
    company_website:     data.company_website     ?? null,
    company_description: data.company_description ?? null,
  }});
});

app.post('/user/avatar', async (c) => {
  const user = await verifyAuth(c.req.raw);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);
  const formData = await c.req.formData();
  const file = formData.get('file') as File | null;
  if (!file) return c.json({ error: 'No file provided' }, 400);
  if (!file.type.startsWith('image/')) return c.json({ error: 'File must be an image' }, 400);
  if (file.size > 5 * 1024 * 1024) return c.json({ error: 'Image must be under 5 MB' }, 400);
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const filePath = `${user.id}.${ext}`;
  const { error: uploadErr } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(filePath, file, { upsert: true, contentType: file.type });
  if (uploadErr) return c.json({ error: 'Upload failed' }, 500);
  const { data: { publicUrl } } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(filePath);
  // Write to profiles table so HR queries can read it directly
  await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', user.id);
  // Also keep user_metadata in sync
  const { data: authUser } = await supabase.auth.admin.getUserById(user.id);
  const existingMeta = authUser?.user?.user_metadata ?? {};
  await supabase.auth.admin.updateUserById(user.id, {
    user_metadata: { ...existingMeta, avatar_url: publicUrl },
  });
  return c.json({ avatar_url: publicUrl });
});

app.delete('/user/avatar', async (c) => {
  const user = await verifyAuth(c.req.raw);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const { error: profileErr } = await supabase
    .from('profiles')
    .update({ avatar_url: null })
    .eq('id', user.id);
  if (profileErr) return c.json({ error: 'Failed to remove profile photo' }, 500);

  const { data: authUser } = await supabase.auth.admin.getUserById(user.id);
  const existingMeta = authUser?.user?.user_metadata ?? {};
  await supabase.auth.admin.updateUserById(user.id, {
    user_metadata: { ...existingMeta, avatar_url: null },
  });

  await supabase.storage
    .from(AVATAR_BUCKET)
    .remove(['jpg', 'jpeg', 'png', 'webp', 'gif'].map(ext => `${user.id}.${ext}`));

  return c.json({ success: true });
});

// ── Jobs ──────────────────────────────────────────────────────────────────────

app.get('/jobs', async (c) => {
  const user = await verifyAuth(c.req.raw);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);
  const role = await verifyRole(user.id);
  let query = supabase.from('jobs').select('*').order('created_at', { ascending: false });
  if (role === 'hr') {
    query = query.eq('hr_id', user.id);
  } else {
    query = query.eq('status', 'active');
  }
  const { data, error } = await query;
  if (error) return c.json({ error: 'Fetch failed' }, 500);
  const hrIds = [...new Set((data || []).map((j: any) => j.hr_id).filter(Boolean))];
  const { data: hrProfiles } = hrIds.length
    ? await supabase.from('profiles').select('id,name,company_name,avatar_url').in('id', hrIds)
    : { data: [] };
  const hrProfileMap = Object.fromEntries((hrProfiles || []).map((p: any) => [p.id, p]));
  const jobs = (data || []).map((j: any) => ({
    ...j,
    department: inferJobFieldFromText(j),
    requirements: j.requirements || [],
    employment_type: j.employment_type || 'full-time',
    company_name: j.company_name || hrProfileMap[j.hr_id]?.company_name || hrProfileMap[j.hr_id]?.name || null,
    company_logo: j.company_logo || hrProfileMap[j.hr_id]?.avatar_url || null,
  }));
  return c.json({ jobs });
});

app.post('/jobs', async (c) => {
  const user = await verifyAuth(c.req.raw);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);
  if (await verifyRole(user.id) !== 'hr') return c.json({ error: 'Forbidden — HR only' }, 403);
  const b = await c.req.json();
  if (!isAllowedJobField(b.department)) {
    return c.json({ error: 'Job field must be Technology, Security, or Medical.' }, 400);
  }
  const { data, error } = await supabase.from('jobs').insert({
    hr_id: user.id, title: b.title, description: b.description,
    requirements: b.requirements || [], salary_range: b.salary_range,
    department: b.department, employment_type: b.employment_type || 'full-time',
    required_years_exp: b.required_years_exp || 0, location: b.location, status: 'active',
    company_name: b.company_name || null, work_mode: b.work_mode || null,
    expires_at: b.expires_at || null,
  }).select().single();
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ job: { ...data, requirements: data.requirements || [] } });
});

app.put('/jobs/:id', async (c) => {
  const user = await verifyAuth(c.req.raw);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);
  if (await verifyRole(user.id) !== 'hr') return c.json({ error: 'Forbidden — HR only' }, 403);
  const b = await c.req.json();
  if (b.department !== undefined && !isAllowedJobField(b.department)) {
    return c.json({ error: 'Job field must be Technology, Security, or Medical.' }, 400);
  }
  const { data, error } = await supabase.from('jobs').update({
    title: b.title, description: b.description, requirements: b.requirements || [],
    salary_range: b.salary_range, department: b.department,
    employment_type: b.employment_type, required_years_exp: b.required_years_exp,
    location: b.location, company_name: b.company_name ?? null, work_mode: b.work_mode ?? null,
    expires_at: b.expires_at !== undefined ? (b.expires_at || null) : undefined,
  }).eq('id', c.req.param('id')).eq('hr_id', user.id).select().single();
  if (error) return c.json({ error: 'Update failed' }, 500);
  return c.json({ job: data });
});

// ── Rank endpoint: how many applicants have a higher score for this job ────────
app.get('/jobs/:id/rank', async (c) => {
  const user = await verifyAuth(c.req.raw);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);
  const jobId = c.req.param('id');
  const role = await verifyRole(user.id);
  if (role === 'hr') {
    const { data: ownedJob } = await supabase.from('jobs').select('id').eq('id', jobId).eq('hr_id', user.id).maybeSingle();
    if (!ownedJob) return c.json({ error: 'Forbidden' }, 403);
  } else if (role === 'applicant') {
    const { data: ownApplication } = await supabase.from('applications')
      .select('id')
      .eq('job_id', jobId)
      .eq('applicant_id', user.id)
      .maybeSingle();
    if (!ownApplication) return c.json({ error: 'Rank is available after you apply to this job.' }, 403);
  } else {
    return c.json({ error: 'Forbidden' }, 403);
  }
  const rawScore = parseFloat(c.req.query('score') || '0');
  const score = Number.isFinite(rawScore) ? Math.max(0, Math.min(1, rawScore)) : 0;
  const { count: total } = await supabase.from('applications').select('id', { count: 'exact', head: true }).eq('job_id', jobId);
  const { count: above } = await supabase.from('applications').select('id', { count: 'exact', head: true })
    .eq('job_id', jobId).gt('match_score', score);
  return c.json({ rank: (above || 0) + 1, total: total || 1 });
});

app.delete('/jobs/:id', async (c) => {
  const user = await verifyAuth(c.req.raw);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);
  if (await verifyRole(user.id) !== 'hr') return c.json({ error: 'Forbidden — HR only' }, 403);
  const { data: ownedJob, error: fetchError } = await supabase.from('jobs')
    .select('id')
    .eq('id', c.req.param('id'))
    .eq('hr_id', user.id)
    .maybeSingle();
  if (fetchError || !ownedJob) return c.json({ error: 'Job not found for this HR account' }, 404);
  const { error } = await supabase.from('jobs')
    .update({ status: 'archived' })
    .eq('id', c.req.param('id'))
    .eq('hr_id', user.id);
  if (error) return c.json({ error: 'Archive failed' }, 500);
  return c.json({ success: true, archived: true });
});

// ── Resumes ───────────────────────────────────────────────────────────────────

app.post('/resumes/upload', async (c) => {
  const user = await verifyAuth(c.req.raw);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);
  const form = await c.req.formData();
  const file = form.get('file') as File | null;
  if (!file) return c.json({ error: 'No file provided' }, 400);
  if (file.size > MAX_RESUME_BYTES) return c.json({ error: 'Resume must be under 10 MB.' }, 400);
  const allowedTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
  const allowedExts = ['pdf', 'doc', 'docx'];
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  if (!allowedExts.includes(ext) || (!allowedTypes.includes(file.type) && file.type !== '')) {
    return c.json({ error: 'Only PDF and Word documents are allowed.' }, 400);
  }
  const path = `${user.id}/${Date.now()}.${ext}`;
  const bytes = await file.arrayBuffer();
  const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, {
    contentType: file.type, upsert: false,
  });
  if (error) return c.json({ error: `Upload failed: ${error.message}` }, 500);
  const signedUrl = await createResumeSignedUrl(path);
  return c.json({ filePath: path, fileUrl: signedUrl });
});

app.post('/resumes', async (c) => {
  const user = await verifyAuth(c.req.raw);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);
  const b = await c.req.json();
  if (!isOwnedStoragePath(b.filePath, user.id)) return c.json({ error: 'Invalid resume file path.' }, 400);
  if (!(await storageObjectExists(b.filePath))) return c.json({ error: 'Uploaded resume file was not found.' }, 400);
  let fileName: string;
  try {
    fileName = cleanRequiredText(b.fileName, 'File name', 255);
  } catch (e: any) {
    return c.json({ error: e?.message || 'Invalid file name.' }, 400);
  }
  await supabase.from('resumes').update({ is_active: false }).eq('user_id', user.id);
  const { data, error } = await supabase.from('resumes').insert({
    user_id: user.id, file_name: fileName, file_path: b.filePath,
    file_url: null, parsed_data: b.parsedData, is_active: true,
  }).select().single();
  if (error) return c.json({ error: 'Save failed' }, 500);
  return c.json({ resume: data });
});

app.get('/resumes', async (c) => {
  const user = await verifyAuth(c.req.raw);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);
  const { data, error } = await supabase.from('resumes').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
  if (error) return c.json({ error: 'Fetch failed' }, 500);
  const resumes = await Promise.all((data || []).map(async (resume: any) => ({
    ...resume,
    file_url: await createResumeSignedUrl(resume.file_path),
  })));
  return c.json({ resumes });
});

app.put('/resumes/:id/activate', async (c) => {
  const user = await verifyAuth(c.req.raw);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);
  const { data: target, error: targetError } = await supabase.from('resumes')
    .select('id')
    .eq('id', c.req.param('id'))
    .eq('user_id', user.id)
    .maybeSingle();
  if (targetError || !target) return c.json({ error: 'Resume not found' }, 404);
  const { error: deactivateError } = await supabase.from('resumes').update({ is_active: false }).eq('user_id', user.id);
  if (deactivateError) return c.json({ error: 'Activate failed' }, 500);
  const { error } = await supabase.from('resumes').update({ is_active: true })
    .eq('id', c.req.param('id')).eq('user_id', user.id);
  if (error) return c.json({ error: 'Activate failed' }, 500);
  return c.json({ success: true });
});

app.put('/resumes/:id', async (c: any) => {
  const user = await verifyAuth(c.req.raw);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);
  const { parsed_data } = await c.req.json();
  if (!parsed_data) return c.json({ error: 'Missing parsed_data' }, 400);
  const { data, error } = await supabase.from('resumes')
    .update({ parsed_data })
    .eq('id', c.req.param('id')).eq('user_id', user.id)
    .select().single();
  if (error) return c.json({ error: 'Update failed' }, 500);
  return c.json({ resume: data });
});

app.delete('/resumes/:id', async (c) => {
  const user = await verifyAuth(c.req.raw);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);
  const { data: r } = await supabase.from('resumes').select('file_path')
    .eq('id', c.req.param('id')).eq('user_id', user.id).single();
  const { count: submittedCount } = await supabase.from('applications')
    .select('id', { count: 'exact', head: true })
    .eq('applicant_id', user.id)
    .eq('resume_id', c.req.param('id'));
  const { count: submittedPathCount } = r?.file_path
    ? await supabase.from('applications')
      .select('id', { count: 'exact', head: true })
      .eq('applicant_id', user.id)
      .eq('resume_file_path', r.file_path)
    : { count: 0 };
  if ((submittedCount || 0) > 0 || (submittedPathCount || 0) > 0) {
    return c.json({ error: 'This resume is attached to a submitted application and cannot be deleted.' }, 400);
  }
  if (r?.file_path) await supabase.storage.from(BUCKET).remove([r.file_path]);
  const { error } = await supabase.from('resumes').delete()
    .eq('id', c.req.param('id')).eq('user_id', user.id);
  if (error) return c.json({ error: 'Delete failed' }, 500);
  return c.json({ success: true });
});

// ── Applications ──────────────────────────────────────────────────────────────

// AI endpoints use API providers first, then deterministic fallback for demos.
app.post('/ai/parse-resume', async (c) => {
  const user = await verifyAuth(c.req.raw);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);
  if (!checkRateLimit(user.id, 'ai:parse-resume', 8)) return c.json({ error: 'Too many AI parse requests. Please wait a moment.' }, 429);
  let rawText = '';
  try {
    ({ rawText } = await c.req.json());
    if (!rawText) return c.json({ error: 'rawText is required' }, 400);
    const prompt = `Parse this resume using real language understanding. Return ONLY valid JSON with this exact shape:
{
  "name": string | null,
  "email": string | null,
  "skills": string[],
  "yearsOfExperience": number,
  "education": string[],
  "workHistory": [{"title": string, "company": string, "period": string}],
  "structuredEducation": [{"degree": string, "institution": string, "year": string}]
}

Rules:
- Infer skills from context, not only exact keywords.
- Estimate yearsOfExperience from dates and role history.
- Keep arrays concise and factual.
- Do not invent details not supported by the resume.

Resume:
${rawText.slice(0, 12000)}`;
    const aiResult = await generateAIResult(prompt, 1200);
    const parsed = extractJsonObject(aiResult.text);
    return c.json({
      parsed: {
        name: typeof parsed.name === 'string' ? parsed.name : undefined,
        email: typeof parsed.email === 'string' ? parsed.email : undefined,
        skills: asStringArray(parsed.skills),
        yearsOfExperience: Number(parsed.yearsOfExperience) || 0,
        education: asStringArray(parsed.education),
        ai_provider: aiResult.provider,
        is_fallback: false,
        workHistory: Array.isArray(parsed.workHistory) ? parsed.workHistory.map((w: any) => ({
          title: String(w?.title || ''),
          company: String(w?.company || ''),
          period: String(w?.period || ''),
        })).filter((w: any) => w.title || w.company || w.period).slice(0, 8) : [],
        structuredEducation: Array.isArray(parsed.structuredEducation) ? parsed.structuredEducation.map((e: any) => ({
          degree: String(e?.degree || ''),
          institution: String(e?.institution || ''),
          year: String(e?.year || ''),
        })).filter((e: any) => e.degree || e.institution || e.year).slice(0, 6) : [],
        rawText,
      },
    });
  } catch (e: any) {
    console.warn('[AI] parse-resume fallback used:', e?.message);
    if (!rawText) return c.json({ error: e?.message || 'AI resume parsing failed' }, 503);
    return c.json({ parsed: fallbackParseResume(rawText) });
  }
});

app.post('/ai/score-match', async (c) => {
  const user = await verifyAuth(c.req.raw);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);
  if (await verifyRole(user.id) !== 'applicant') return c.json({ error: 'Forbidden - applicants only' }, 403);
  if (!checkRateLimit(user.id, 'ai:score-match', 20)) return c.json({ error: 'Too many AI scoring requests. Please wait a moment.' }, 429);
  try {
    const b = await c.req.json();
    if (!b.jobId) return c.json({ error: 'jobId is required.' }, 400);
    const [{ data: job, error: jobError }, { data: resume, error: resumeError }] = await Promise.all([
      supabase.from('jobs')
        .select('id,title,description,requirements,required_years_exp,status,expires_at')
        .eq('id', b.jobId)
        .single(),
      b.resumeId
        ? supabase.from('resumes')
          .select('id,parsed_data')
          .eq('id', b.resumeId)
          .eq('user_id', user.id)
          .single()
        : supabase.from('resumes')
          .select('id,parsed_data')
          .eq('user_id', user.id)
          .eq('is_active', true)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
    ]);
    if (jobError || !job) return c.json({ error: 'Job not found.' }, 404);
    if (job.status !== 'active') return c.json({ error: 'This job is not active.' }, 400);
    if (job.expires_at && new Date(job.expires_at).getTime() < Date.now()) return c.json({ error: 'This job has expired.' }, 400);
    if (resumeError || !resume?.parsed_data) return c.json({ error: 'Upload and activate a parsed resume before scoring.' }, 400);
    const parsed = resume.parsed_data || {};
    const hypotheticalSkills = asStringArray(b.hypotheticalSkills).slice(0, 20);
    const resumeText = String(parsed.rawText || '').slice(0, MAX_TEXT_INPUT);
    const jobDescription = String(job.description || '').slice(0, MAX_TEXT_INPUT);
    if (!resumeText.trim() || !jobDescription.trim()) return c.json({ error: 'Resume and job description text are required.' }, 400);
    const match = await scoreMatch({
      jobTitle: job.title || '',
      resumeText: hypotheticalSkills.length
        ? `${resumeText}\n\nHypothetical added skills: ${hypotheticalSkills.join(', ')}`
        : resumeText,
      jobDescription,
      resumeSkills: [...new Set([...asStringArray(parsed.skills), ...hypotheticalSkills])],
      requiredSkills: asStringArray(job.requirements),
      resumeYearsExp: Number(parsed.yearsOfExperience) || estimateYears(resumeText),
      requiredYearsExp: job.required_years_exp || 0,
    });
    return c.json({ match });
  } catch (e: any) {
    return c.json({ error: e?.message || 'AI match scoring failed' }, 503);
  }
});

app.post('/ai/interview-questions', async (c) => {
  const user = await verifyAuth(c.req.raw);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);
  if (!checkRateLimit(user.id, 'ai:interview-questions', 10)) return c.json({ error: 'Too many AI interview requests. Please wait a moment.' }, 429);
  if (await verifyRole(user.id) !== 'hr') return c.json({ error: 'Forbidden - HR only' }, 403);
  let b: any = {};
  try {
    b = await c.req.json();
    const prompt = `Generate 5 to 8 personalized interview questions for this candidate and job. Return ONLY valid JSON:
{ "questions": string[] }

Job title: ${b.jobTitle || 'Unknown role'}
Candidate years of experience: ${Number(b.yearsExp) || 0}
Matched skills: ${(b.matchedSkills || []).join(', ') || 'None listed'}
Missing or weak skills: ${(b.missingSkills || []).join(', ') || 'None listed'}
Candidate summary: ${b.candidateSummary || 'No additional summary'}

Make the questions specific, fair, and useful for an HR screening conversation.`;
    const aiResult = await generateAIResult(prompt, 900, 0.4);
    const parsed = extractJsonObject(aiResult.text);
    const questions = asStringArray(parsed.questions).slice(0, 8);
    if (questions.length === 0) throw new Error('AI returned no interview questions.');
    return c.json({ questions, ai_provider: aiResult.provider, is_fallback: false });
  } catch (e: any) {
    console.warn('[AI] interview-questions fallback used:', e?.message);
    return c.json({ questions: fallbackInterviewQuestions(b), ai_provider: 'rule-based', is_fallback: true });
  }
});

app.get('/ai/practice-questions', async (c) => {
  const user = await verifyAuth(c.req.raw);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);
  if (!checkRateLimit(user.id, 'ai:practice-questions', 10)) return c.json({ error: 'Too many AI practice requests. Please wait a moment.' }, 429);
  if (await verifyRole(user.id) !== 'applicant') return c.json({ error: 'Forbidden - applicants only' }, 403);

  const { data: resume } = await supabase.from('resumes')
    .select('file_name,parsed_data,is_active,created_at')
    .eq('user_id', user.id)
    .order('is_active', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!resume?.parsed_data) {
    return c.json({ error: 'Upload and activate a resume first so practice can be tailored to your field.' }, 400);
  }

  const detected = inferPracticeField(resume.parsed_data);
  try {
    const prompt = `You are an interview practice generator for a recruitment system.
Use the resume evidence to infer the applicant's field and generate tailored multiple-choice practice.

Allowed fields: Technology, Security, Medical.
Detected field: ${detected.field}
Detected confidence: ${detected.confidence}
Detected focus skills: ${detected.focusSkills.join(', ') || 'None'}
Resume skills: ${asStringArray(resume.parsed_data.skills).join(', ') || 'None'}
Resume text:
${String(resume.parsed_data.rawText || '').slice(0, 10000)}

Return ONLY valid JSON with this exact shape:
{
  "field": "Technology" | "Security" | "Medical",
  "confidence": number,
  "focusSkills": string[],
  "questions": [
    {
      "focus": string,
      "prompt": string,
      "options": [string, string, string, string],
      "answer": number,
      "explanation": string
    }
  ]
}

Rules:
- Generate 8 questions.
- answer must be the zero-based index of the correct option.
- If Technology, bias questions toward the applicant's actual stack, for example Java, Python, SQL, database, React, API, or cloud when present.
- If Security, use guard operations scenarios such as access control, patrol, CCTV, visitor handling, incident reporting, school/mosque/site safety, and emergency response.
- If Medical, use role-appropriate clinical safety, triage, patient care, nursing, surgery, medication, infection control, and documentation questions.
- Do not ask the user to choose a field.
- Keep questions practical and interview-style.`;

    const aiResult = await generateAIResult(prompt, 1800, 0.35);
    const parsed = extractJsonObject(aiResult.text);
    const aiField = isAllowedJobField(parsed.field) ? parsed.field as PracticeField : detected.field;
    const questions = normalizePracticeQuestions(parsed.questions).slice(0, 8);
    if (questions.length < 4) throw new Error('AI returned too few valid practice questions.');
    return c.json({
      field: aiField,
      confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || detected.confidence)),
      focusSkills: asStringArray(parsed.focusSkills).slice(0, 8).length
        ? asStringArray(parsed.focusSkills).slice(0, 8)
        : detected.focusSkills,
      questions,
      resumeFileName: resume.file_name,
      ai_provider: aiResult.provider,
      is_fallback: false,
    });
  } catch (e: any) {
    console.warn('[AI] practice-questions fallback used:', e?.message);
    return c.json({
      field: detected.field,
      confidence: detected.confidence,
      focusSkills: detected.focusSkills,
      questions: fallbackPracticeQuestions(detected.field, detected.focusSkills),
      resumeFileName: resume.file_name,
      ai_provider: 'rule-based',
      is_fallback: true,
    });
  }
});

app.post('/applications', async (c) => {
  const user = await verifyAuth(c.req.raw);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);
  if (await verifyRole(user.id) !== 'applicant') return c.json({ error: 'Forbidden - applicants only' }, 403);
  if (!checkRateLimit(user.id, 'apply', 10)) return c.json({ error: 'Too many applications. Please wait a moment before applying again.' }, 429);
  const b = await c.req.json();
  if (!b.jobId) return c.json({ error: 'jobId is required.' }, 400);

  const [{ data: job, error: jobError }, { data: resume, error: resumeError }, { data: existingApplication }] = await Promise.all([
    supabase.from('jobs')
      .select('id,hr_id,title,description,requirements,required_years_exp,status,expires_at')
      .eq('id', b.jobId)
      .single(),
    b.resumeId
      ? supabase.from('resumes')
        .select('id,user_id,file_name,file_path,parsed_data')
        .eq('id', b.resumeId)
        .eq('user_id', user.id)
        .single()
      : supabase.from('resumes')
        .select('id,user_id,file_name,file_path,parsed_data')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    supabase.from('applications')
      .select('id')
      .eq('job_id', b.jobId)
      .eq('applicant_id', user.id)
      .maybeSingle(),
  ]);

  if (jobError || !job) return c.json({ error: 'Job not found.' }, 404);
  if (existingApplication) return c.json({ error: 'You have already applied to this job.' }, 409);
  if (job.status !== 'active') return c.json({ error: 'This job is not accepting applications.' }, 400);
  if (job.expires_at && new Date(job.expires_at).getTime() < Date.now()) {
    return c.json({ error: 'This job has expired and is no longer accepting applications.' }, 400);
  }
  if (resumeError || !resume?.parsed_data) {
    return c.json({ error: 'Upload and activate a parsed resume before applying.' }, 400);
  }

  const parsed = resume.parsed_data || {};
  const resumeText = String(parsed.rawText || '');
  if (!resumeText.trim()) return c.json({ error: 'Your selected resume is missing parsed text.' }, 400);
  const resumeSkills = asStringArray(parsed.skills);
  const requiredSkills = asStringArray(job.requirements);
  const yearsOfExperience = Number(parsed.yearsOfExperience) || estimateYears(resumeText);

  let scores;
  try {
    scores = await scoreMatch({
      jobTitle: job.title || '',
      resumeText,
      jobDescription: job.description || '',
      resumeSkills,
      requiredSkills,
      resumeYearsExp: yearsOfExperience,
      requiredYearsExp: job.required_years_exp || 0,
    });
  } catch (e: any) {
    return c.json({ error: e?.message || 'AI scoring failed' }, 503);
  }
  const resumeUrl = await createResumeSignedUrl(resume.file_path);

  const { data, error } = await supabase.from('applications').insert({
    job_id: job.id,
    applicant_id: user.id,
    resume_id: resume.id,
    resume_url: resumeUrl,
    resume_file_name: resume.file_name,
    resume_file_path: resume.file_path,
    resume_parsed_data: parsed,
    status: 'applied',
    years_of_experience: yearsOfExperience,
    match_score: scores.match_score,
    skill_match_score: scores.skill_match_score,
    text_similarity: scores.text_similarity,
    matched_skills: scores.matched_skills,
    missing_skills: scores.missing_skills,
    explanation: scores.explanation,
    ai_provider: scores.ai_provider,
    is_fallback: scores.is_fallback,
  }).select().single();

  if (error) {
    if ((error as any).code === '23505') return c.json({ error: 'You have already applied to this job.' }, 409);
    return c.json({ error: error.message }, 500);
  }

  // Two-way match alert: notify HR if strong applicant (score >= 0.75)
  if (scores.match_score >= 0.75) {
    try {
      const jobRow = job;
      if (jobRow?.hr_id) {
        const { data: hrProfile } = await supabase.from('profiles').select('email, name').eq('id', jobRow.hr_id).single();
        const { data: applicantProfile } = await supabase.from('profiles').select('name').eq('id', user.id).single();
        if (hrProfile?.email) {
          const pct = Math.round(scores.match_score * 100);
          sendEmail(
            hrProfile.email,
            `Strong applicant for "${jobRow.title}" — ${pct}% match`,
            `<div style="font-family:sans-serif;max-width:600px;margin:auto;padding:32px">
              <h2 style="color:#8b5cf6">High-Match Applicant Alert 🎯</h2>
              <p>Hi ${escapeHtml(hrProfile.name || 'there')},</p>
              <p><strong>${escapeHtml(applicantProfile?.name || 'A new applicant')}</strong> just applied to <strong>${escapeHtml(jobRow.title)}</strong> with a <strong>${pct}% AI match score</strong>.</p>
              <p>Log in to review their profile in the Candidate Pipeline.</p>
              <a href="${Deno.env.get('SITE_URL') || 'https://jobmatchai.com'}" style="background:#8b5cf6;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;margin-top:16px">Review Candidate</a>
            </div>`,
          );
        }
      }
    } catch { /* non-critical */ }
  }

  return c.json({ application: data });
});

app.get('/applications', async (c) => {
  const user = await verifyAuth(c.req.raw);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  const requestedJobId = c.req.query('jobId');

  let query = supabase.from('applications').select('*, jobs(*)');
  if (profile?.role === 'applicant') {
    query = query.eq('applicant_id', user.id);
    if (requestedJobId) query = query.eq('job_id', requestedJobId);
  } else {
    const { data: myJobs } = await supabase.from('jobs').select('id').eq('hr_id', user.id);
    if (!myJobs?.length) return c.json({ applications: [] });
    const myJobIds = myJobs.map((j: any) => j.id);
    if (requestedJobId) {
      if (!myJobIds.includes(requestedJobId)) return c.json({ applications: [] });
      query = query.eq('job_id', requestedJobId);
    } else {
      query = query.in('job_id', myJobIds);
    }
  }

  const { data, error } = await query.order('match_score', { ascending: false });
  if (error) return c.json({ error: 'Fetch failed' }, 500);

  // Fetch full applicant profiles, HR company profiles, and HR-only private notes.
  const applicantIds = [...new Set((data || []).map((a: any) => a.applicant_id))];
  const hrIds = [...new Set((data || []).map((a: any) => a.jobs?.hr_id).filter(Boolean))];
  const applicationIds = (data || []).map((a: any) => a.id);
  const [{ data: profileRows }, { data: hrProfileRows }, { data: noteRows }] = await Promise.all([
    applicantIds.length
      ? supabase.from('profiles').select('id,name,email,phone,location,headline,bio,linkedin,avatar_url').in('id', applicantIds)
      : Promise.resolve({ data: [] }),
    hrIds.length
      ? supabase.from('profiles').select('id,name,company_name,avatar_url').in('id', hrIds)
      : Promise.resolve({ data: [] }),
    profile?.role === 'hr' && applicationIds.length
      ? supabase.from('candidate_notes').select('application_id,note,updated_at').eq('hr_id', user.id).in('application_id', applicationIds)
      : Promise.resolve({ data: [] }),
  ]);
  const profileMap = Object.fromEntries((profileRows || []).map((p: any) => [p.id, p]));
  const hrProfileMap = Object.fromEntries((hrProfileRows || []).map((p: any) => [p.id, p]));
  const noteMap = Object.fromEntries((noteRows || []).map((n: any) => [n.application_id, n]));

  const applications = await Promise.all((data || []).map(async (a: any) => ({
    id: a.id,
    job_id: a.job_id,
    applicant_id: a.applicant_id,
    resume_url: await createResumeSignedUrl(a.resume_file_path),
    resume_id: a.resume_id || null,
    status: a.status,
    interview_at: a.interview_at || null,
    years_of_experience: a.years_of_experience,
    match_score: a.match_score,
    skill_match_score: a.skill_match_score,
    text_similarity: a.text_similarity,
    ai_provider: a.ai_provider || null,
    is_fallback: !!a.is_fallback,
    matched_skills: a.matched_skills || [],
    missing_skills: a.missing_skills || [],
    explanation: a.explanation,
    created_at: a.created_at,
    applicant_name:     profileMap[a.applicant_id]?.name       || 'Unknown',
    applicant_email:    profileMap[a.applicant_id]?.email      || '',
    applicant_phone:    profileMap[a.applicant_id]?.phone      || null,
    applicant_location: profileMap[a.applicant_id]?.location   || null,
    applicant_headline: profileMap[a.applicant_id]?.headline   || null,
    applicant_bio:      profileMap[a.applicant_id]?.bio        || null,
    applicant_linkedin: profileMap[a.applicant_id]?.linkedin   || null,
    applicant_avatar_url: profileMap[a.applicant_id]?.avatar_url || null,
    resume_parsed_data: a.resume_parsed_data || null,
    resume_file_name:   a.resume_file_name   || null,
    private_note: profile?.role === 'hr' ? (noteMap[a.id]?.note || '') : undefined,
    private_note_updated_at: profile?.role === 'hr' ? (noteMap[a.id]?.updated_at || null) : undefined,
    job_title: a.jobs?.title || 'Unknown position',
    job_company_name: a.jobs?.company_name || hrProfileMap[a.jobs?.hr_id]?.company_name || hrProfileMap[a.jobs?.hr_id]?.name || null,
    job_company_logo: a.jobs?.company_logo || hrProfileMap[a.jobs?.hr_id]?.avatar_url || null,
  })));
  return c.json({ applications });
});

app.put('/applications/:id', async (c) => {
  const user = await verifyAuth(c.req.raw);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);
  const role = await verifyRole(user.id);
  if (role !== 'hr') return c.json({ error: 'Forbidden — HR only' }, 403);
  const body = await c.req.json();
  const updates: Record<string, any> = {};
  if (body.status !== undefined) {
    if (!VALID_APPLICATION_STATUSES.has(body.status)) return c.json({ error: 'Invalid application status.' }, 400);
    updates.status = body.status;
  }
  if (body.interview_at !== undefined) {
    if (body.interview_at !== null && Number.isNaN(new Date(body.interview_at).getTime())) {
      return c.json({ error: 'Invalid interview date.' }, 400);
    }
    updates.interview_at = body.interview_at;
  }
  if (Object.keys(updates).length === 0) return c.json({ error: 'Nothing to update' }, 400);
  const { data: appData, error: appFetchError } = await supabase.from('applications')
    .select('applicant_id, job_id, status, jobs!inner(hr_id,title)')
    .eq('id', c.req.param('id'))
    .eq('jobs.hr_id', user.id)
    .single();
  if (appFetchError || !appData) return c.json({ error: 'Application not found for this HR account' }, 404);
  const { error } = await supabase.from('applications').update(updates).eq('id', c.req.param('id'));
  if (error) return c.json({ error: 'Update failed' }, 500);
  // Send email notification on status change (fire-and-forget)
  if (updates.status && appData && ['under_review','shortlisted','rejected'].includes(updates.status)) {
    const [{ data: applicantProfile }, { data: jobRow }] = await Promise.all([
      supabase.from('profiles').select('email,name').eq('id', appData.applicant_id).single(),
      supabase.from('jobs').select('title').eq('id', appData.job_id).single(),
    ]);
    if (applicantProfile?.email) {
      const emailResult = await sendEmail(
        applicantProfile.email,
        `Application Update - ${jobRow?.title || 'Position'}`,
        emailStatusUpdate(applicantProfile.name || 'Applicant', jobRow?.title || 'the position', updates.status),
      );
      if (!emailResult.ok) console.error('[email] status update failed:', emailResult.error);
    }
  }
  return c.json({ success: true });
});

app.put('/applications/:id/note', async (c) => {
  const user = await verifyAuth(c.req.raw);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);
  const role = await verifyRole(user.id);
  if (role !== 'hr') return c.json({ error: 'Forbidden - HR only' }, 403);
  const { note } = await c.req.json();
  if (typeof note !== 'string') return c.json({ error: 'Note must be text.' }, 400);
  if (note.length > 5000) return c.json({ error: 'Note must be 5000 characters or less.' }, 400);

  const { data: appData, error: appFetchError } = await supabase.from('applications')
    .select('id, applicant_id, jobs!inner(hr_id)')
    .eq('id', c.req.param('id'))
    .eq('jobs.hr_id', user.id)
    .single();
  if (appFetchError || !appData) return c.json({ error: 'Application not found for this HR account' }, 404);

  const { data, error } = await supabase.from('candidate_notes').upsert({
    hr_id: user.id,
    applicant_id: appData.applicant_id,
    application_id: appData.id,
    note: note.trim(),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'hr_id,application_id' }).select('note,updated_at').single();

  if (error) return c.json({ error: 'Note save failed' }, 500);
  return c.json({ note: data });
});

app.delete('/applications/:id', async (c) => {
  const user = await verifyAuth(c.req.raw);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);
  // Only allow the applicant who owns the application to withdraw it
  const { data: app, error: fetchError } = await supabase
    .from('applications').select('applicant_id, status').eq('id', c.req.param('id')).single();
  if (fetchError || !app) return c.json({ error: 'Application not found' }, 404);
  if (app.applicant_id !== user.id) return c.json({ error: 'Forbidden' }, 403);
  if (app.status === 'shortlisted') return c.json({ error: 'Cannot withdraw a shortlisted application' }, 400);
  const { error } = await supabase.from('applications').delete().eq('id', c.req.param('id'));
  if (error) return c.json({ error: 'Delete failed' }, 500);
  return c.json({ success: true });
});

// ── Analytics ─────────────────────────────────────────────────────────────────

app.get('/analytics', async (c) => {
  const user = await verifyAuth(c.req.raw);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const { data: jobs } = await supabase.from('jobs').select('*').eq('hr_id', user.id);
  const jobList = jobs || [];

  if (!jobList.length) {
    return c.json({
      totalJobs: 0, totalApplications: 0, avgMatchScore: 0,
      applicationsByStatus: { applied: 0, under_review: 0, shortlisted: 0, rejected: 0 },
      applicationsPerJob: [], topSkills: [],
    });
  }

  const { data: apps } = await supabase.from('applications').select('*')
    .in('job_id', jobList.map((j: any) => j.id));
  const allApps = apps || [];

  const avg = allApps.length
    ? allApps.reduce((s: number, a: any) => s + (Number(a.match_score) || 0), 0) / allApps.length
    : 0;

  const skillCounts: Record<string, number> = {};
  jobList.forEach((j: any) => {
    (j.requirements || []).forEach((s: string) => {
      if (s) skillCounts[s] = (skillCounts[s] || 0) + 1;
    });
  });

  return c.json({
    totalJobs: jobList.length,
    totalApplications: allApps.length,
    avgMatchScore: Math.round(avg * 100) / 100,
    applicationsByStatus: {
      applied:      allApps.filter((a: any) => a.status === 'applied').length,
      under_review: allApps.filter((a: any) => a.status === 'under_review').length,
      shortlisted:  allApps.filter((a: any) => a.status === 'shortlisted').length,
      rejected:     allApps.filter((a: any) => a.status === 'rejected').length,
    },
    applicationsPerJob: jobList
      .map((j: any) => ({ jobId: j.id, jobTitle: j.title, count: allApps.filter((a: any) => a.job_id === j.id).length }))
      .sort((a: any, b: any) => b.count - a.count),
    topSkills: Object.entries(skillCounts)
      .map(([skill, count]) => ({ skill, count }))
      .sort((a: any, b: any) => b.count - a.count)
      .slice(0, 10),
  });
});

// ─── Saved Jobs ───────────────────────────────────────────────────────────────

app.get('/saved-jobs', async (c) => {
  const user = await verifyAuth(c.req.raw);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);
  const { data, error } = await supabase
    .from('saved_jobs')
    .select('job_id')
    .eq('user_id', user.id);
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ jobIds: (data || []).map((r: any) => r.job_id) });
});

app.post('/saved-jobs', async (c) => {
  const user = await verifyAuth(c.req.raw);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);
  const { jobId } = await c.req.json();
  if (!jobId) return c.json({ error: 'jobId required' }, 400);
  const { error } = await supabase
    .from('saved_jobs')
    .upsert({ user_id: user.id, job_id: jobId }, { onConflict: 'user_id,job_id' });
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ ok: true });
});

app.delete('/saved-jobs/:jobId', async (c) => {
  const user = await verifyAuth(c.req.raw);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);
  const jobId = c.req.param('jobId');
  const { error } = await supabase
    .from('saved_jobs')
    .delete()
    .eq('user_id', user.id)
    .eq('job_id', jobId);
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ ok: true });
});

Deno.serve(app.fetch);
