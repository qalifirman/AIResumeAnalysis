import { serverFunctionUrl } from '../utils/supabase/info';
import type {
  Job, JobFormData, Resume, Application, ApplicationStatus, AnalyticsData, User
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

export async function apiGetProfile(token: string): Promise<User> {
  const res = await fetch(`${base}/user/profile`, { headers: headers(token) });
  const data = await handle<{ profile: User }>(res);
  return data.profile;
}

export async function apiUpdateProfile(token: string, name: string): Promise<User> {
  const res = await fetch(`${base}/user/profile`, {
    method: 'PUT',
    headers: headers(token),
    body: JSON.stringify({ name }),
  });
  const data = await handle<{ profile: User }>(res);
  return data.profile;
}

export async function apiSignup(
  email: string, password: string, name: string, role: 'hr' | 'applicant',
  anonKey: string
): Promise<void> {
  const res = await fetch(`${base}/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${anonKey}` },
    body: JSON.stringify({ email, password, name, role }),
  });
  await handle(res);
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

export async function apiGetApplications(token: string): Promise<Application[]> {
  const res = await fetch(`${base}/applications`, { headers: headers(token) });
  const data = await handle<{ applications: Application[] }>(res);
  return data.applications || [];
}

export async function apiCreateApplication(
  token: string,
  payload: {
    jobId: string; resumeUrl: string; yearsOfExperience: number;
    matchScore: number; skillMatchScore: number; textSimilarity: number;
    matchedSkills: string[]; missingSkills: string[]; explanation: string;
    // Extra fields for server-side AI re-scoring
    resumeText?: string; jobDescription?: string;
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

// ─── Analytics ────────────────────────────────────────────────────────────────

export async function apiGetAnalytics(token: string): Promise<AnalyticsData> {
  const res = await fetch(`${base}/analytics`, { headers: headers(token) });
  return handle<AnalyticsData>(res);
}
