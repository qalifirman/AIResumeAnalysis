import { serverFunctionUrl } from '../utils/supabase/info';
import type {
  Job, JobFormData, Resume, Application, ApplicationStatus, AnalyticsData, User, ParsedResumeData
} from '../types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function headers(token: string) {
  return { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

const base = serverFunctionUrl;

// ─── Auth ────────────────────────────────────────────────────────────────────

export async function apiUploadAvatar(token: string, file: File): Promise<{ avatar_url: string }> {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(`${base}/user/avatar`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: formData,
  });
  return handle(res);
}

export async function apiRemoveAvatar(token: string): Promise<void> {
  const res = await fetch(`${base}/user/avatar`, {
    method: 'DELETE',
    headers: headers(token),
  });
  await handle(res);
}

export async function apiGetProfile(token: string): Promise<User> {
  const res = await fetch(`${base}/user/profile`, { headers: headers(token) });
  const data = await handle<{ profile: User }>(res);
  return data.profile;
}

export async function apiUpdateProfile(
  token: string,
  fields: {
    name: string;
    phone?: string;
    location?: string;
    headline?: string;
    bio?: string;
    linkedin?: string;
    company_name?: string;
    company_industry?: string;
    company_size?: string;
    company_website?: string;
    company_description?: string;
  }
): Promise<User> {
  const res = await fetch(`${base}/user/profile`, {
    method: 'PUT',
    headers: headers(token),
    body: JSON.stringify(fields),
  });
  const data = await handle<{ profile: User }>(res);
  return data.profile;
}

export async function apiSignup(
  email: string, password: string, name: string, role: 'hr' | 'applicant',
  anonKey: string, inviteCode?: string
): Promise<{ verificationRequired?: boolean }> {
  const res = await fetch(`${base}/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${anonKey}` },
    body: JSON.stringify({ email, password, name, role, inviteCode }),
  });
  return handle(res);
}

// ─── Jobs ─────────────────────────────────────────────────────────────────────

export async function apiGetJobs(token: string): Promise<Job[]> {
  const res = await fetch(`${base}/jobs`, { headers: headers(token) });
  const data = await handle<{ jobs: any[] }>(res);
  return (data.jobs || []).map(j => ({ ...j, requirements: j.requirements || [] }));
}

export async function apiCreateJob(token: string, job: JobFormData): Promise<Job> {
  const res = await fetch(`${base}/jobs`, {
    method: 'POST', headers: headers(token), body: JSON.stringify(job),
  });
  const data = await handle<{ job: Job }>(res);
  return data.job;
}

export async function apiUpdateJob(token: string, id: string, job: Partial<JobFormData>): Promise<Job> {
  const res = await fetch(`${base}/jobs/${id}`, {
    method: 'PUT', headers: headers(token), body: JSON.stringify(job),
  });
  const data = await handle<{ job: Job }>(res);
  return data.job;
}

export async function apiDeleteJob(token: string, id: string): Promise<void> {
  const res = await fetch(`${base}/jobs/${id}`, {
    method: 'DELETE', headers: headers(token),
  });
  await handle(res);
}

// ─── Saved Jobs ───────────────────────────────────────────────────────────────

export async function apiGetSavedJobs(token: string): Promise<string[]> {
  const res = await fetch(`${base}/saved-jobs`, { headers: headers(token) });
  const data = await handle<{ jobIds: string[] }>(res);
  return data.jobIds || [];
}

export async function apiSaveJob(token: string, jobId: string): Promise<void> {
  const res = await fetch(`${base}/saved-jobs`, {
    method: 'POST', headers: headers(token), body: JSON.stringify({ jobId }),
  });
  await handle(res);
}

export async function apiUnsaveJob(token: string, jobId: string): Promise<void> {
  const res = await fetch(`${base}/saved-jobs/${jobId}`, {
    method: 'DELETE', headers: headers(token),
  });
  await handle(res);
}

// ─── Resumes ──────────────────────────────────────────────────────────────────

export async function apiGetResumes(token: string): Promise<Resume[]> {
  const res = await fetch(`${base}/resumes`, { headers: headers(token) });
  const data = await handle<{ resumes: Resume[] }>(res);
  return data.resumes || [];
}

export async function apiUploadResume(token: string, file: File): Promise<{ filePath: string; fileUrl: string }> {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(`${base}/resumes/upload`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: formData,
  });
  return handle(res);
}

export async function apiSaveResume(
  token: string,
  payload: { fileName: string; filePath: string; fileUrl: string; parsedData: object }
): Promise<Resume> {
  const res = await fetch(`${base}/resumes`, {
    method: 'POST', headers: headers(token), body: JSON.stringify(payload),
  });
  const data = await handle<{ resume: Resume }>(res);
  return data.resume;
}

export async function apiParseResumeAI(token: string, rawText: string): Promise<ParsedResumeData> {
  const res = await fetch(`${base}/ai/parse-resume`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify({ rawText }),
  });
  const data = await handle<{ parsed: ParsedResumeData }>(res);
  return data.parsed;
}

export async function apiScoreJobMatch(
  token: string,
  payload: {
    jobId: string;
    resumeId?: string;
    jobTitle: string;
    resumeText: string;
    jobDescription: string;
    resumeSkills: string[];
    requiredSkills: string[];
    resumeYearsExp: number;
    requiredYearsExp: number;
    hypotheticalSkills?: string[];
  }
): Promise<{
  match_score: number;
  skill_match_score: number;
  text_similarity: number;
  experience_score: number;
  matched_skills: string[];
  missing_skills: string[];
  explanation: string;
  ai_provider?: string;
  is_fallback?: boolean;
  field_match?: boolean;
  resume_field?: string;
  job_field?: string;
}> {
  const res = await fetch(`${base}/ai/score-match`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify(payload),
  });
  const data = await handle<{ match: any }>(res);
  return data.match;
}

export async function apiGenerateInterviewQuestions(
  token: string,
  payload: {
    jobTitle: string;
    matchedSkills: string[];
    missingSkills: string[];
    yearsExp: number;
    candidateSummary?: string;
  }
): Promise<string[]> {
  const res = await fetch(`${base}/ai/interview-questions`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify(payload),
  });
  const data = await handle<{ questions: string[] }>(res);
  return data.questions || [];
}

export interface PracticeQuestion {
  focus: string;
  prompt: string;
  options: string[];
  answer: number;
  explanation: string;
}

export interface PracticeQuestionSet {
  field: 'Technology' | 'Security' | 'Medical';
  confidence: number;
  focusSkills: string[];
  questions: PracticeQuestion[];
  resumeFileName?: string;
  ai_provider?: string;
  is_fallback?: boolean;
}

export async function apiGeneratePracticeQuestions(token: string): Promise<PracticeQuestionSet> {
  const res = await fetch(`${base}/ai/practice-questions`, { headers: headers(token) });
  return handle<PracticeQuestionSet>(res);
}

export async function apiUpdateResumeParsedData(
  token: string, id: string, parsedData: object
): Promise<Resume> {
  const res = await fetch(`${base}/resumes/${id}`, {
    method: 'PUT', headers: headers(token), body: JSON.stringify({ parsed_data: parsedData }),
  });
  const data = await handle<{ resume: Resume }>(res);
  return data.resume;
}

export async function apiActivateResume(token: string, id: string): Promise<void> {
  const res = await fetch(`${base}/resumes/${id}/activate`, {
    method: 'PUT', headers: headers(token),
  });
  await handle(res);
}

export async function apiDeleteResume(token: string, id: string): Promise<void> {
  const res = await fetch(`${base}/resumes/${id}`, {
    method: 'DELETE', headers: headers(token),
  });
  await handle(res);
}

// ─── Applications ─────────────────────────────────────────────────────────────

export async function apiGetApplications(token: string, filters: { jobId?: string } = {}): Promise<Application[]> {
  const params = new URLSearchParams();
  if (filters.jobId) params.set('jobId', filters.jobId);
  const qs = params.toString();
  const res = await fetch(`${base}/applications${qs ? `?${qs}` : ''}`, { headers: headers(token) });
  const data = await handle<{ applications: Application[] }>(res);
  return data.applications || [];
}

export async function apiCreateApplication(
  token: string,
  payload: {
    jobId: string; resumeId: string; resumeUrl: string; yearsOfExperience: number;
    matchScore: number; skillMatchScore: number; textSimilarity: number;
    matchedSkills: string[]; missingSkills: string[]; explanation: string;
    // Extra fields for server-side AI re-scoring
    jobTitle?: string; resumeText?: string; jobDescription?: string;
    resumeSkills?: string[]; requiredSkills?: string[]; requiredYearsExp?: number;
  }
): Promise<Application> {
  const res = await fetch(`${base}/applications`, {
    method: 'POST', headers: headers(token), body: JSON.stringify(payload),
  });
  const data = await handle<{ application: Application }>(res);
  return data.application;
}

export async function apiUpdateApplicationStatus(
  token: string, id: string, status: ApplicationStatus
): Promise<void> {
  const res = await fetch(`${base}/applications/${id}`, {
    method: 'PUT', headers: headers(token), body: JSON.stringify({ status }),
  });
  await handle(res);
}

export async function apiScheduleInterview(
  token: string, id: string, interviewAt: string | null
): Promise<void> {
  const res = await fetch(`${base}/applications/${id}`, {
    method: 'PUT', headers: headers(token), body: JSON.stringify({ interview_at: interviewAt }),
  });
  await handle(res);
}

export async function apiSaveCandidateNote(
  token: string, id: string, note: string
): Promise<{ note: string; updated_at: string }> {
  const res = await fetch(`${base}/applications/${id}/note`, {
    method: 'PUT',
    headers: headers(token),
    body: JSON.stringify({ note }),
  });
  const data = await handle<{ note: { note: string; updated_at: string } }>(res);
  return data.note;
}

export async function apiGetJobRank(token: string, jobId: string, matchScore: number): Promise<{ rank: number; total: number }> {
  const res = await fetch(`${base}/jobs/${jobId}/rank?score=${matchScore}`, { headers: headers(token) });
  return handle<{ rank: number; total: number }>(res);
}

export async function apiWithdrawApplication(token: string, id: string): Promise<void> {
  const res = await fetch(`${base}/applications/${id}`, {
    method: 'DELETE', headers: headers(token),
  });
  await handle(res);
}

// ─── Analytics ────────────────────────────────────────────────────────────────

export async function apiGetAnalytics(token: string): Promise<AnalyticsData> {
  const res = await fetch(`${base}/analytics`, { headers: headers(token) });
  return handle<AnalyticsData>(res);
}
