import type { Job, Resume } from '../types';

const CACHE_TTL = 24 * 60 * 60 * 1000;

export interface CachedMatchScore {
  match_score: number;
  skill_match_score: number;
  text_similarity: number;
  experience_score?: number;
  matched_skills: string[];
  missing_skills: string[];
  explanation: string;
  ai_provider?: string;
  is_fallback?: boolean;
}

function hashString(value: string): string {
  let hash = 5381;
  for (let i = 0; i < value.length; i++) {
    hash = ((hash << 5) + hash) ^ value.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
}

function cacheKey(resume: Resume, job: Job) {
  const resumeData = resume.parsed_data;
  const fingerprint = [
    resume.id,
    resume.created_at,
    resumeData?.rawText || '',
    (resumeData?.skills || []).join('|'),
    resumeData?.yearsOfExperience || 0,
    job.id,
    job.created_at,
    job.title || '',
    job.description || '',
    (job.requirements || []).join('|'),
    job.required_years_exp || 0,
  ].join('::');

  return `score_v2_${resume.id}_${job.id}_${hashString(fingerprint)}`;
}

export function readScoreCache(resume: Resume, job: Job): CachedMatchScore | null {
  try {
    const key = cacheKey(resume, job);
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL) {
      localStorage.removeItem(key);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

export function writeScoreCache(resume: Resume, job: Job, data: CachedMatchScore) {
  try {
    localStorage.setItem(cacheKey(resume, job), JSON.stringify({ data, ts: Date.now() }));
  } catch {}
}

export function scoreProviderLabel(provider?: string, isFallback?: boolean) {
  if (isFallback || provider === 'rule-based') return 'Fallback estimate';
  if (provider === 'gemini') return 'Scored by Gemini';
  if (provider === 'groq') return 'Scored by Groq';
  if (provider === 'claude') return 'Scored by Claude';
  return 'Scored by LLM';
}
