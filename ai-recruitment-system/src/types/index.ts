// ─── Auth ────────────────────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'hr' | 'applicant';
  created_at?: string;
  phone?: string;
  location?: string;
  headline?: string;
  bio?: string;
  linkedin?: string;
  avatar_url?: string;
  company_name?: string | null;
  company_industry?: string | null;
  company_size?: string | null;
  company_website?: string | null;
  company_description?: string | null;
}

// ─── Jobs ─────────────────────────────────────────────────────────────────────

export interface Job {
  id: string;
  hr_id: string;
  title: string;
  description: string;
  requirements: string[];
  salary_range?: string;
  department: string;
  employment_type: 'full-time' | 'part-time' | 'contract' | 'internship';
  required_years_exp: number;
  location: string;
  status: 'active' | 'archived';
  created_at: string;
  company_logo?: string;
  company_name?: string;
  work_mode?: 'remote' | 'hybrid' | 'on-site';
  expires_at?: string | null;
}

export type JobFormData = Omit<Job, 'id' | 'hr_id' | 'created_at' | 'status'>;

// ─── Resumes ──────────────────────────────────────────────────────────────────

export interface WorkHistoryEntry {
  title: string;
  company: string;
  period: string;
}

export interface EducationEntry {
  degree: string;
  institution: string;
  year?: string;
}

export interface ParsedResumeData {
  skills: string[];
  yearsOfExperience: number;
  rawText: string;
  ai_provider?: string;
  is_fallback?: boolean;
  name?: string;
  email?: string;
  education?: string[];           // legacy: plain text lines
  workHistory?: WorkHistoryEntry[];
  structuredEducation?: EducationEntry[];
}

export interface Resume {
  id: string;
  user_id: string;
  file_name: string;
  file_path: string;
  file_url: string;
  parsed_data: ParsedResumeData;
  is_active: boolean;
  created_at: string;
  updated_at?: string;
}

// ─── Applications ─────────────────────────────────────────────────────────────

export type ApplicationStatus = 'applied' | 'under_review' | 'shortlisted' | 'rejected';

export interface Application {
  id: string;
  job_id: string;
  applicant_id: string;
  resume_id?: string | null;
  resume_url?: string;
  status: ApplicationStatus;
  interview_at?: string | null;
  years_of_experience: number;
  match_score: number;
  skill_match_score: number;
  text_similarity: number;
  matched_skills: string[];
  missing_skills: string[];
  explanation: string;
  ai_provider?: string;
  is_fallback?: boolean;
  created_at: string;
  // Joined fields from server
  applicant_name?: string;
  applicant_email?: string;
  job_title?: string;
  // Extended candidate profile (populated for HR view)
  applicant_phone?: string | null;
  applicant_location?: string | null;
  applicant_headline?: string | null;
  applicant_bio?: string | null;
  applicant_linkedin?: string | null;
  applicant_avatar_url?: string | null;
  resume_parsed_data?: ParsedResumeData | null;
  resume_file_name?: string | null;
  private_note?: string;
  private_note_updated_at?: string | null;
  job_company_name?: string | null;
  job_company_logo?: string | null;
}

// ─── Analytics ────────────────────────────────────────────────────────────────

export interface AnalyticsData {
  totalJobs: number;
  totalApplications: number;
  avgMatchScore: number;
  applicationsByStatus: Record<ApplicationStatus, number>;
  applicationsPerJob: Array<{ jobId: string; jobTitle: string; count: number }>;
  topSkills: Array<{ skill: string; count: number }>;
}
