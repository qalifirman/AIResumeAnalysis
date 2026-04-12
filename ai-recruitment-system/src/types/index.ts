// ─── Auth ────────────────────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'hr' | 'applicant';
  created_at?: string;
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
}

export type JobFormData = Omit<Job, 'id' | 'hr_id' | 'created_at' | 'status'>;

// ─── Resumes ──────────────────────────────────────────────────────────────────

export interface ParsedResumeData {
  skills: string[];
  yearsOfExperience: number;
  rawText: string;
  name?: string;
  email?: string;
  education?: string[];
  workHistory?: string[];
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
}

// ─── Applications ─────────────────────────────────────────────────────────────

export type ApplicationStatus = 'applied' | 'under_review' | 'shortlisted' | 'rejected';

export interface Application {
  id: string;
  job_id: string;
  applicant_id: string;
  resume_url?: string;
  status: ApplicationStatus;
  years_of_experience: number;
  match_score: number;
  skill_match_score: number;
  text_similarity: number;
  matched_skills: string[];
  missing_skills: string[];
  explanation: string;
  created_at: string;
  // Joined fields from server
  applicant_name?: string;
  applicant_email?: string;
  job_title?: string;
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
