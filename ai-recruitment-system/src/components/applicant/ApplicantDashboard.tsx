import { useState, useEffect } from 'react';
import { Sidebar } from '../layout/Sidebar';
import { JobRecommendations } from './JobRecommendations';
import { ApplicationTracking } from './ApplicationTracking';
import { ResumeManager } from './ResumeManager';
import { ProfileManagement } from './ProfileManagement';
import { InterviewPractice } from './InterviewPractice';
import { NotificationDropdown } from '../layout/NotificationDropdown';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { apiGetApplications, apiGetJobs, apiGetResumes, apiScoreJobMatch } from '../../api';
import type { Application, Job, Resume } from '../../types';
import { readScoreCache, writeScoreCache } from '../../utils/score-cache';

type ApplicantTab = 'dashboard' | 'jobs' | 'applications' | 'practice' | 'resumes' | 'profile';

type JobWithScore = Job & { matchScore: number; missingSkills: string[] };

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += limit) {
    const batch = items.slice(i, i + limit);
    results.push(...await Promise.all(batch.map(mapper)));
  }
  return results;
}

function CompanyLogo({ logo, name }: { logo?: string | null; name?: string | null }) {
  const initial = (name?.[0] || 'C').toUpperCase();
  if (logo) {
    return (
      <div className="size-10 rounded-xl bg-white p-1.5 border border-border-dark flex items-center justify-center flex-shrink-0">
        <img src={logo} alt={`${name || 'Company'} logo`} className="w-full h-full object-contain rounded-lg" />
      </div>
    );
  }
  return (
    <div className="size-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-sm font-bold text-violet-300 flex-shrink-0">
      {initial}
    </div>
  );
}

const NAV_ITEMS = [
  { id: 'dashboard',    icon: 'dashboard',       label: 'Dashboard' },
  { id: 'jobs',         icon: 'search',          label: 'Find Jobs' },
  { id: 'applications', icon: 'description',     label: 'My Applications' },
  { id: 'practice',     icon: 'quiz',            label: 'Practice' },
  { id: 'resumes',      icon: 'upload_file',     label: 'Resumes' },
  { id: 'profile',      icon: 'manage_accounts', label: 'Profile' },
];

export function ApplicantDashboard() {
  const [activeTab, setActiveTab] = useState<ApplicantTab>('dashboard');
  const [headerSearch, setHeaderSearch] = useState('');
  const { theme, toggleTheme } = useTheme();

  const handleHeaderSearch = (val: string) => {
    setHeaderSearch(val);
    if (val && activeTab !== 'jobs') setActiveTab('jobs');
  };

  return (
    <div className="flex h-screen bg-bg-dark overflow-hidden">
      <Sidebar activeTab={activeTab} onTabChange={t => { setActiveTab(t as ApplicantTab); setHeaderSearch(''); }}
        navItems={NAV_ITEMS} portalLabel="Job Seeker Portal" />

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="h-16 flex items-center justify-between px-6 border-b border-border-dark bg-surface-dark flex-shrink-0">
          <div className="flex items-center gap-2 text-text-muted text-sm">
            <span>Portal</span>
            <span className="material-symbols-outlined ms-sm">chevron_right</span>
            <span className="text-white font-semibold">{NAV_ITEMS.find(n => n.id === activeTab)?.label}</span>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative hidden sm:block">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted material-symbols-outlined ms-sm">search</span>
              <input
                className="bg-surface-hover border border-border-dark text-white text-sm rounded-xl pl-9 pr-4 py-2 w-52 focus:ring-2 focus:ring-primary/50 focus:border-primary placeholder:text-text-muted focus:outline-none transition-all"
                placeholder="Search jobs…"
                value={headerSearch}
                onChange={e => handleHeaderSearch(e.target.value)}
              />
              {headerSearch && (
                <button onClick={() => setHeaderSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-white">
                  <span className="material-symbols-outlined ms-sm">close</span>
                </button>
              )}
            </div>

            <button onClick={toggleTheme} title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              className="p-2 text-text-muted hover:text-white rounded-xl hover:bg-surface-hover transition-colors">
              <span className="material-symbols-outlined">
                {theme === 'dark' ? 'light_mode' : 'dark_mode'}
              </span>
            </button>

            <NotificationDropdown role="applicant" onNavigate={tab => { setActiveTab(tab as ApplicantTab); setHeaderSearch(''); }} />
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6 lg:p-8 pb-20 md:pb-6">
          {activeTab === 'dashboard'    && <ApplicantOverview onNavigate={setActiveTab} />}
          {activeTab === 'jobs'         && <JobRecommendations externalSearch={headerSearch} />}
          {activeTab === 'applications' && <ApplicationTracking />}
          {activeTab === 'practice'     && <InterviewPractice />}
          {activeTab === 'resumes'      && <ResumeManager />}
          {activeTab === 'profile'      && <ProfileManagement onNavigate={tab => { setActiveTab(tab as ApplicantTab); }} />}
        </main>
      </div>
    </div>
  );
}

// ─── Applicant Overview ───────────────────────────────────────────────────────

function ApplicantOverview({ onNavigate }: { onNavigate: (tab: ApplicantTab) => void }) {
  const { user, accessToken } = useAuth();
  const firstName = user?.name?.split(' ')[0] || 'there';

  const [apps, setApps]       = useState<Application[]>([]);
  const [topJobs, setTopJobs] = useState<JobWithScore[]>([]);
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!accessToken) return;
    Promise.all([
      apiGetApplications(accessToken),
      apiGetJobs(accessToken).catch(() => [] as Job[]),
      apiGetResumes(accessToken).catch(() => [] as Resume[]),
    ]).then(async ([appList, jobList, resumeList]) => {
      setApps(appList);
      setResumes(resumeList);

      const activeResume = resumeList.find(r => r.is_active) ?? resumeList[0] ?? null;
      const appliedIds   = new Set(appList.map(a => a.job_id));

      const scorableJobs = jobList.filter(j => j.status === 'active' && !appliedIds.has(j.id));
      const matched: JobWithScore[] = await mapWithConcurrency(scorableJobs, 4, async j => {
          if (!activeResume?.parsed_data) return { ...j, matchScore: 0, missingSkills: [] };
          const cached = readScoreCache(activeResume, j);
          if (cached) return { ...j, matchScore: cached.match_score, missingSkills: cached.missing_skills };

          try {
            const result = await apiScoreJobMatch(accessToken, {
              jobId: j.id,
              resumeId: activeResume.id,
              jobTitle: j.title || '',
              resumeText: activeResume.parsed_data.rawText || '',
              jobDescription: j.description || '',
              resumeSkills: activeResume.parsed_data.skills || [],
              requiredSkills: j.requirements || [],
              resumeYearsExp: activeResume.parsed_data.yearsOfExperience || 0,
              requiredYearsExp: j.required_years_exp || 0,
            });
            writeScoreCache(activeResume, j, result);
            return { ...j, matchScore: result.match_score, missingSkills: result.missing_skills };
          } catch {
            return { ...j, matchScore: 0, missingSkills: j.requirements || [] };
          }
        });

      const topMatched = matched
        .sort((a, b) => b.matchScore - a.matchScore)
        .slice(0, 2);

      setTopJobs(topMatched);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [accessToken]);

  // ── Derived stats ──
  const sent        = apps.length;
  const underReview = apps.filter(a => a.status === 'under_review').length;
  const shortlisted = apps.filter(a => a.status === 'shortlisted').length;

  const stats = [
    { icon: 'send',          label: 'Applications Sent', value: String(sent),        color: 'text-blue-400',   bg: 'bg-blue-500/10',   badge: sent > 0 ? `+${Math.min(sent, 2)} this week` : null,           badgeColor: 'text-green-400 bg-green-400/10' },
    { icon: 'manage_search', label: 'Under Review',      value: String(underReview), color: 'text-yellow-400', bg: 'bg-yellow-500/10', badge: underReview > 0 ? 'Avg 3 days' : null,                          badgeColor: 'text-text-muted bg-surface-hover' },
    { icon: 'thumb_up',      label: 'Shortlisted',       value: String(shortlisted), color: 'text-green-400',  bg: 'bg-green-500/10',  badge: shortlisted > 0 ? '1 new' : null,                               badgeColor: 'text-text-muted bg-surface-hover' },
    { icon: 'groups',        label: 'Interviews',        value: String(shortlisted), color: 'text-pink-400',   bg: 'bg-pink-500/10',   badge: shortlisted > 0 ? 'Action Needed' : null,                       badgeColor: 'text-pink-400 bg-pink-400/10' },
  ];

  // ── Profile strength ──
  const activeResume   = resumes.find(r => r.is_active) ?? resumes[0];
  const hasResume      = resumes.length > 0;
  const hasSkills      = (activeResume?.parsed_data?.skills?.length ?? 0) > 0;
  const hasExperience  = (activeResume?.parsed_data?.yearsOfExperience ?? 0) > 0;

  const profileItems = [
    { label: 'Account Created',       done: true },
    { label: 'Full Name Set',         done: (user?.name?.trim() || '').length > 0 },
    { label: 'Profile Photo',         done: (user?.avatar_url?.trim() || '').length > 0 },
    { label: 'Phone Number Added',    done: (user?.phone?.trim() || '').length > 0 },
    { label: 'Location Set',          done: (user?.location?.trim() || '').length > 0 },
    { label: 'Headline Added',        done: (user?.headline?.trim() || '').length > 0 },
    { label: 'Bio Written',           done: (user?.bio?.trim() || '').length >= 20 },
    { label: 'Portfolio / LinkedIn',  done: (user?.linkedin?.trim() || '').length > 0 },
    { label: 'Resume Uploaded',       done: hasResume },
    { label: 'Skills Detected',       done: hasSkills },
    { label: 'Experience Listed',     done: hasExperience },
  ];
  const profilePct = Math.round((profileItems.filter(i => i.done).length / profileItems.length) * 100);
  const profileLabel = profilePct >= 90 ? 'Excellent' : profilePct >= 70 ? 'Good' : profilePct >= 50 ? 'Fair' : 'Needs Work';
  const profileLabelColor = profilePct >= 90 ? 'text-green-400' : profilePct >= 70 ? 'text-blue-400' : profilePct >= 50 ? 'text-yellow-400' : 'text-red-400';

  // ── Missing skills aggregated from top job matches ──
  const missingSkillsMap: Record<string, number> = {};
  topJobs.forEach(j => j.missingSkills.forEach(s => { missingSkillsMap[s] = (missingSkillsMap[s] || 0) + 1; }));
  const topMissingSkills = Object.entries(missingSkillsMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([skill, count]) => ({ skill, count }));

  // ── Recent applications (up to 3) ──
  const recentApps = apps.slice(0, 3);

  // ── Upcoming interview: first shortlisted application ──
  const upcomingInterview = apps.find(a => a.status === 'shortlisted');

  const STATUS_STEP: Record<string, { step: number; total: number; label: string; color: string; bar: string }> = {
    applied:      { step: 1, total: 3, label: 'Applied',      color: 'text-blue-400',   bar: 'bg-blue-400' },
    under_review: { step: 2, total: 3, label: 'Under Review', color: 'text-yellow-400', bar: 'bg-yellow-400' },
    shortlisted:  { step: 3, total: 3, label: 'Shortlisted',  color: 'text-green-400',  bar: 'bg-green-400' },
    rejected:     { step: 3, total: 3, label: 'Rejected',     color: 'text-red-400',    bar: 'bg-red-400' },
  };

  return (
    <div className="max-w-7xl mx-auto flex flex-col gap-8">

      {/* ── Welcome ── */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white">Welcome back, {firstName}</h2>
          <p className="text-text-muted mt-1">
            {topJobs.length > 0
              ? `You have ${topJobs.length} new AI-curated job match${topJobs.length !== 1 ? 'es' : ''} today.`
              : 'Here is your job search overview for today.'}
          </p>
        </div>
        <div className="flex gap-3">
          <button onClick={() => onNavigate('resumes')}
            className="flex items-center gap-2 px-4 py-2 bg-surface-card hover:bg-surface-hover border border-border-dark rounded-xl text-sm font-medium text-white transition-colors">
            <span className="material-symbols-outlined ms-sm">upload_file</span>
            Update Resume
          </button>
          <button onClick={() => onNavigate('jobs')}
            className="flex items-center gap-2 bg-primary hover:bg-primary-hover text-white px-4 py-2 rounded-xl text-sm font-bold transition-colors shadow-glow">
            <span className="material-symbols-outlined ms-sm">search</span>
            Browse Jobs
          </button>
        </div>
      </div>

      {/* ── Resume completeness banner ── */}
      {!loading && profilePct < 60 && (
        <div className="flex items-start gap-3 p-4 bg-amber-500/10 border border-amber-500/25 rounded-xl text-sm">
          <span className="material-symbols-outlined text-amber-400 flex-shrink-0 mt-0.5">warning</span>
          <div className="flex-1">
            <p className="text-amber-300 font-semibold">Your profile is only {profilePct}% complete</p>
            <p className="text-amber-400/80 text-xs mt-0.5">A complete profile improves your AI match score and visibility to recruiters.</p>
          </div>
          <button onClick={() => onNavigate('profile')}
            className="flex-shrink-0 px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/30 text-amber-300 text-xs font-semibold rounded-lg transition-colors">
            Complete Now
          </button>
        </div>
      )}

      {/* ── Stats Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(s => (
          <div key={s.label} className="stat-card">
            <div className="flex justify-between items-start mb-4">
              <span className={`material-symbols-outlined ${s.color}`}>{s.icon}</span>
              {s.badge && (
                <span className={`text-xs font-medium px-2 py-1 rounded ${s.badgeColor}`}>{s.badge}</span>
              )}
            </div>
            <p className="text-sm font-medium text-text-muted">{s.label}</p>
            <h3 className="text-2xl font-bold text-white mt-1">{s.value}</h3>
          </div>
        ))}
      </div>

      {/* ── Main 2-col layout ── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

        {/* Left: Top AI Matches + Application Progress */}
        <div className="xl:col-span-2 space-y-6">

          {/* Top AI Matches */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <span className="material-symbols-outlined text-primary ms-sm">auto_awesome</span>
                Top AI Matches
              </h3>
              <button onClick={() => onNavigate('jobs')}
                className="text-sm text-primary hover:underline font-medium">
                View all matches
              </button>
            </div>

            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[0, 1].map(i => (
                  <div key={i} className="bg-surface-card border border-border-dark rounded-xl p-5 animate-pulse">
                    <div className="h-4 bg-surface-hover rounded w-2/3 mb-2" />
                    <div className="h-3 bg-surface-hover rounded w-1/2 mb-4" />
                    <div className="h-8 bg-surface-hover rounded" />
                  </div>
                ))}
              </div>
            ) : topJobs.length === 0 ? (
              <div className="bg-surface-card border border-border-dark rounded-xl p-8 text-center">
                <span className="material-symbols-outlined ms-lg text-text-muted mb-2 block">work_off</span>
                <p className="text-sm font-semibold text-white mb-1">No new matches yet</p>
                <p className="text-xs text-text-muted">Upload a resume and browse active jobs to see AI-curated matches.</p>
                <button onClick={() => onNavigate('jobs')}
                  className="mt-4 text-xs text-primary hover:underline font-medium">
                  Browse all jobs →
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {topJobs.map(job => {
                  const pct = Math.round(job.matchScore * 100);
                  const isTop = pct >= 80;
                  return (
                    <div key={job.id}
                      className="bg-surface-card border border-border-dark rounded-xl p-5 flex flex-col gap-4 hover:border-primary/50 hover:shadow-glow transition-all duration-200">
                      <div className="flex justify-between items-start">
                        <div className="flex items-start gap-3 flex-1 min-w-0 pr-2">
                          <CompanyLogo logo={job.company_logo} name={job.company_name || job.department || job.title} />
                          <div className="min-w-0">
                            <h4 className="font-bold text-white truncate">{job.title}</h4>
                            <p className="text-text-muted text-sm mt-0.5">{job.company_name || job.department}</p>
                          </div>
                        </div>
                        <span className={`flex-shrink-0 text-xs font-bold px-2.5 py-1 rounded-full border ${
                          isTop
                            ? 'bg-primary/15 text-violet-300 border-primary/30'
                            : 'bg-green-500/10 text-green-400 border-green-500/25'
                        }`}>
                          {pct}% Match
                        </span>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <span className="inline-flex items-center gap-1 bg-surface-hover text-text-muted text-xs px-2.5 py-1.5 rounded-md border border-border-dark">
                          <span className="material-symbols-outlined ms-sm">location_on</span>{job.location}
                        </span>
                        {job.salary_range && (
                          <span className="inline-flex items-center gap-1 bg-surface-hover text-text-muted text-xs px-2.5 py-1.5 rounded-md border border-border-dark">
                            <span className="material-symbols-outlined ms-sm">payments</span>{job.salary_range}
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1 bg-surface-hover text-text-muted text-xs px-2.5 py-1.5 rounded-md border border-border-dark">
                          <span className="material-symbols-outlined ms-sm">schedule</span>
                          {job.employment_type.charAt(0).toUpperCase() + job.employment_type.slice(1)}
                        </span>
                      </div>

                      <div className="mt-auto flex gap-3">
                        <button onClick={() => onNavigate('jobs')}
                          className="flex-1 bg-surface-hover hover:bg-surface-card text-white text-sm font-medium py-2.5 rounded-lg transition border border-border-dark">
                          Details
                        </button>
                        <button onClick={() => onNavigate('jobs')}
                          className="flex-1 btn-primary py-2.5">
                          Apply Now
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Application Progress */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-white">Application Progress</h3>
              <button onClick={() => onNavigate('applications')}
                className="text-sm text-primary hover:underline font-medium">
                View all
              </button>
            </div>

            <div className="bg-surface-card border border-border-dark rounded-xl overflow-hidden">
              {recentApps.length === 0 ? (
                <div className="p-8 text-center">
                  <span className="material-symbols-outlined ms-lg text-text-muted mb-2 block">description</span>
                  <p className="text-sm font-semibold text-white mb-1">No applications yet</p>
                  <p className="text-xs text-text-muted">Apply to jobs to track your progress here.</p>
                  <button onClick={() => onNavigate('jobs')}
                    className="mt-4 text-xs text-primary hover:underline font-medium">
                    Find jobs →
                  </button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-surface-hover border-b border-border-dark text-text-muted text-xs uppercase tracking-wider">
                        <th className="px-5 py-3 font-semibold">Role</th>
                        <th className="px-5 py-3 font-semibold">Date Applied</th>
                        <th className="px-5 py-3 font-semibold min-w-[200px]">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-dark">
                      {recentApps.map(app => {
                        const meta = STATUS_STEP[app.status] ?? STATUS_STEP.applied;
                        const barPct = app.status === 'rejected' ? 100 : Math.round((meta.step / meta.total) * 100);
                        const initials = (app.job_title || 'J')[0].toUpperCase();
                        return (
                          <tr key={app.id} className="hover:bg-surface-hover/50 transition-colors">
                            <td className="px-5 py-4">
                              <div className="flex items-center gap-3">
                                <div className="size-8 rounded bg-surface-hover flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                                  {initials}
                                </div>
                                <div>
                                  <p className="text-sm font-medium text-white">{app.job_title || 'Job'}</p>
                                  <p className="text-xs text-text-muted">{Math.round(app.match_score * 100)}% match</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-5 py-4 text-sm text-text-muted whitespace-nowrap">
                              {new Date(app.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </td>
                            <td className="px-5 py-4">
                              <div className="flex flex-col gap-1.5">
                                <div className="flex justify-between text-xs">
                                  <span className={`font-medium ${meta.color}`}>{meta.label}</span>
                                  {app.status !== 'rejected'
                                    ? <span className="text-text-muted">Step {meta.step}/{meta.total}</span>
                                    : <span className="text-text-muted">Closed</span>
                                  }
                                </div>
                                <div className="w-full bg-surface-hover rounded-full h-1.5 overflow-hidden">
                                  <div className={`${meta.bar} h-1.5 rounded-full transition-all`} style={{ width: `${barPct}%` }} />
                                </div>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              {recentApps.length > 0 && (
                <div className="px-5 py-3 border-t border-border-dark flex justify-center">
                  <button onClick={() => onNavigate('applications')}
                    className="text-sm text-text-muted hover:text-white font-medium transition-colors">
                    View All Applications
                  </button>
                </div>
              )}
            </div>
          </section>
        </div>

        {/* Right: Widgets */}
        <div className="flex flex-col gap-5">

          {/* Resume Versions */}
          <div className="bg-surface-card border border-border-dark rounded-xl p-5">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-white">Resume Versions</h3>
              <button onClick={() => onNavigate('resumes')}
                className="text-primary text-xs font-semibold hover:underline">Manage</button>
            </div>

            <div className="flex flex-col gap-2">
              {resumes.length === 0 ? (
                <p className="text-sm text-text-muted text-center py-3">No resumes uploaded yet.</p>
              ) : resumes.slice(0, 3).map(r => (
                <div key={r.id}
                  className="flex items-center gap-3 p-3 rounded-xl bg-bg-dark border border-border-dark hover:border-border-mid transition-colors group cursor-pointer"
                  onClick={() => onNavigate('resumes')}>
                  <div className={`p-2 rounded-lg flex-shrink-0 transition-colors ${r.is_active ? 'bg-primary/10 text-primary' : 'bg-red-500/10 text-red-400'}`}>
                    <span className="material-symbols-outlined text-xl">picture_as_pdf</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium truncate">{r.file_name}</p>
                    <p className="text-text-muted text-xs">
                      {r.is_active ? 'Active · ' : ''}{new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </p>
                  </div>
                  {r.is_active && (
                    <span className="text-xs bg-primary/15 text-violet-300 border border-primary/30 px-2 py-0.5 rounded-full font-medium flex-shrink-0">
                      Active
                    </span>
                  )}
                </div>
              ))}
            </div>

            <button onClick={() => onNavigate('resumes')}
              className="w-full mt-3 border border-dashed border-border-dark text-text-muted py-3 rounded-xl text-sm hover:text-white hover:border-primary/50 hover:bg-primary/5 transition-all flex items-center justify-center gap-2">
              <span className="material-symbols-outlined ms-sm">add</span> Upload New Version
            </button>
          </div>

          {/* Profile Strength */}
          {profilePct < 100 && (
          <div className="bg-surface-card border border-border-dark rounded-xl p-5">
            <h3 className="font-bold text-white mb-1">Profile Strength</h3>
            <p className="text-text-muted text-xs mb-4">Fill out all sections for better job matches.</p>

            <div className="flex items-end gap-2 mb-2">
              <span className="text-3xl font-bold text-white">{profilePct}%</span>
              <span className={`text-sm font-medium mb-1.5 ${profileLabelColor}`}>{profileLabel}</span>
            </div>

            <div className="w-full bg-surface-hover rounded-full h-2 mb-4 overflow-hidden">
              <div
                className={`h-2 rounded-full transition-all duration-500 ${
                  profilePct >= 90 ? 'bg-gradient-to-r from-green-400 to-emerald-400'
                  : profilePct >= 70 ? 'bg-gradient-to-r from-primary to-blue-400'
                  : profilePct >= 50 ? 'bg-gradient-to-r from-yellow-400 to-amber-400'
                  : 'bg-gradient-to-r from-red-500 to-rose-400'
                }`}
                style={{ width: `${profilePct}%` }}
              />
            </div>

            <ul className="space-y-2 mb-4">
              {profileItems.map(item => (
                <li key={item.label} className="flex items-center gap-2 text-xs">
                  <span className={`material-symbols-outlined ms-sm flex-shrink-0 ${item.done ? 'text-green-400' : 'text-text-muted'}`}>
                    {item.done ? 'check_circle' : 'radio_button_unchecked'}
                  </span>
                  <span className={item.done ? 'text-slate-400 line-through' : 'text-white font-medium'}>{item.label}</span>
                </li>
              ))}
            </ul>

            {profilePct < 100 && (
              <button
                onClick={() => onNavigate('profile')}
                className="w-full text-xs text-primary hover:text-white border border-primary/30 hover:bg-primary/10 py-2 rounded-lg transition-colors font-medium"
              >
                Complete your profile →
              </button>
            )}
          </div>
          )}

          {/* Skills Gap Widget */}
          {topMissingSkills.length > 0 && (
            <div className="bg-surface-card border border-border-dark rounded-xl p-5">
              <div className="flex items-center gap-2 mb-1">
                <span className="material-symbols-outlined text-red-400 ms-sm">trending_up</span>
                <h3 className="font-bold text-white">Skills to Acquire</h3>
              </div>
              <p className="text-text-muted text-xs mb-4">Most-requested skills missing from your resume across your top job matches.</p>
              <div className="flex flex-wrap gap-2">
                {topMissingSkills.map(({ skill, count }) => (
                  <span key={skill}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/25">
                    <span className="material-symbols-outlined" style={{ fontSize: 12 }}>close</span>
                    {skill}
                    {count > 1 && <span className="text-red-500/70 ml-0.5">×{count}</span>}
                  </span>
                ))}
              </div>
              <button onClick={() => onNavigate('jobs')}
                className="mt-4 w-full text-xs text-primary hover:text-white border border-primary/30 hover:bg-primary/10 py-2 rounded-lg transition-colors font-medium">
                Browse matching jobs →
              </button>
            </div>
          )}

          {/* Upcoming Interview (shown when user has a shortlisted application) */}
          {upcomingInterview && (
            <div className="bg-surface-card border border-border-dark rounded-xl p-5">
              <h3 className="font-bold text-white mb-4">Upcoming Interview</h3>
              <div className="bg-primary/10 rounded-xl p-4 border border-primary/20">
                <div className="flex items-start justify-between mb-2">
                  <p className="text-white font-semibold text-sm truncate pr-2">
                    {upcomingInterview.job_title || 'Interview'}
                  </p>
                  <span className="text-[10px] uppercase font-bold text-primary tracking-wide flex-shrink-0">
                    Shortlisted
                  </span>
                </div>
                <p className="text-slate-300 text-xs mb-3">
                  AI Match: {Math.round(upcomingInterview.match_score * 100)}%
                </p>
                <div className="flex items-center gap-2 text-text-muted text-xs mb-3">
                  <span className="material-symbols-outlined ms-sm">info</span>
                  Awaiting interview schedule from employer
                </div>
                <button onClick={() => onNavigate('applications')}
                  className="w-full bg-primary hover:bg-primary-hover text-white text-xs font-medium py-2 rounded-lg transition-colors">
                  View Application
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
