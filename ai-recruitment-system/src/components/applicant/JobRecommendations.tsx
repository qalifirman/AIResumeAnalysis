import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { useAuth } from '../../contexts/AuthContext';
import { apiGetJobs, apiGetResumes, apiCreateApplication, apiGetApplications, apiGetSavedJobs, apiSaveJob, apiUnsaveJob, apiGetJobRank, apiScoreJobMatch } from '../../api';
import { ConfirmModal } from '../ui/confirm-modal';
import type { Job, Resume } from '../../types';
import { readScoreCache, scoreProviderLabel, writeScoreCache } from '../../utils/score-cache';
import { JOB_FIELD_OPTIONS } from '../../utils/job-fields';

// ─── Types ────────────────────────────────────────────────────────────────────

interface JobMatch extends Job {
  matchScore: number;
  skillMatch: number;
  textSimilarity: number;
  matchedSkills: string[];
  missingSkills: string[];
  explanation: string;
  aiProvider?: string;
  isFallback?: boolean;
}

interface JobRecommendationsProps {
  externalSearch?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Parse the lower-bound monthly salary (in RM) from a string like "RM 3,000 - RM 5,000" or "3000-5000" */
function parseSalaryMin(salaryRange?: string): number {
  if (!salaryRange) return 0;
  const nums = salaryRange.replace(/,/g, '').match(/\d+(\.\d+)?/g);
  if (!nums) return 0;
  return parseFloat(nums[0]);
}

/** Return Tailwind color tokens based on match percentage — green (high), yellow (mid), red (low) */
function matchColors(pct: number) {
  if (pct >= 70) return { bg: 'bg-green-500/15',  text: 'text-green-400',  border: 'border-green-500/25' };
  if (pct >= 40) return { bg: 'bg-yellow-500/10', text: 'text-yellow-400', border: 'border-yellow-500/25' };
  return            { bg: 'bg-red-500/10',    text: 'text-red-400',    border: 'border-red-500/25' };
}

/** "X days ago" label */
function postedLabel(createdAt: string) {
  const d = Math.floor((Date.now() - new Date(createdAt).getTime()) / 86_400_000);
  if (d === 0) return 'Today';
  if (d === 1) return 'Yesterday';
  return `${d}d ago`;
}

/** "Closes in X days" or "Closed" label */
function closingLabel(expiresAt?: string | null): { text: string; urgent: boolean; closed: boolean } | null {
  if (!expiresAt) return null;
  const daysLeft = Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86_400_000);
  if (daysLeft < 0) return { text: 'Closed', urgent: false, closed: true };
  if (daysLeft === 0) return { text: 'Closes today', urgent: true, closed: false };
  if (daysLeft <= 3) return { text: `Closes in ${daysLeft}d`, urgent: true, closed: false };
  return { text: `Closes in ${daysLeft}d`, urgent: false, closed: false };
}

// ─── CompanyLogo ──────────────────────────────────────────────────────────────

function CompanyLogo({ logo, name, size = 'md' }: { logo?: string; name: string; size?: 'sm' | 'md' | 'lg' }) {
  const sz   = { sm: 'size-10', md: 'size-14', lg: 'size-20' }[size];
  const txt  = { sm: 'text-sm', md: 'text-xl', lg: 'text-3xl' }[size];
  const letter = (name?.[0] ?? '?').toUpperCase();

  if (logo) {
    return (
      <div className={`${sz} rounded-xl bg-white p-1.5 shadow-sm border border-border-dark flex items-center justify-center flex-shrink-0`}>
        <img src={logo} alt={`${name} logo`} className="w-full h-full object-contain rounded-lg" />
      </div>
    );
  }
  return (
    <div className={`${sz} rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0`}>
      <span className={`${txt} font-bold text-violet-300 select-none`}>{letter}</span>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function JobRecommendations({ externalSearch = '' }: JobRecommendationsProps) {
  const { accessToken } = useAuth();

  const [jobs, setJobs]               = useState<JobMatch[]>([]);
  const [activeResume, setResume]     = useState<Resume | null>(null);
  const [loading, setLoading]         = useState(true);
  const [applying, setApplying]       = useState<string | null>(null);
  const [applied, setApplied]         = useState<Set<string>>(new Set());
  const [saved, setSaved]             = useState<Set<string>>(new Set());
  const [internalSearch, setSearch]   = useState('');
  const [deptFilter, setDept]         = useState('all');
  const [typeFilter, setType]         = useState('all');
  const [minSalary, setMinSalary]     = useState(0);        // in RM/month
  const [selected, setSelected]       = useState<JobMatch | null>(null);
  const [detailOpen, setDetailOpen]   = useState(false);
  const [savedOnly, setSavedOnly]     = useState(false);
  const [confirmReapply, setConfirmReapply] = useState<JobMatch | null>(null);
  const [rankInfo, setRankInfo] = useState<Record<string, { rank: number; total: number }>>({});

  // Sync header search
  useEffect(() => { setSearch(externalSearch); }, [externalSearch]);
  // Reset page when filters change
  useEffect(() => { setPage(1); }, [internalSearch, deptFilter, typeFilter, minSalary, savedOnly]);
  useEffect(() => { load(); }, []);

  const load = async () => {
    if (!accessToken) return;
    try {
      const [jobList, resumeList, appList, savedIds] = await Promise.all([
        apiGetJobs(accessToken),
        apiGetResumes(accessToken),
        apiGetApplications(accessToken),
        apiGetSavedJobs(accessToken),
      ]);
      setSaved(new Set(savedIds));
      const resume = resumeList.find(r => r.is_active) ?? resumeList[0] ?? null;
      setResume(resume);
      setApplied(new Set(appList.map(a => a.job_id)));

      const activeJobs = jobList.filter(j => j.status === 'active');
      const matched: JobMatch[] = await Promise.all(activeJobs.map(async j => {
        if (!resume?.parsed_data) {
          return { ...j, matchScore: 0, skillMatch: 0, textSimilarity: 0, matchedSkills: [], missingSkills: [], explanation: 'Upload a resume to see your match score.' };
        }
        const cached = readScoreCache(resume, j);
        if (cached) {
          return { ...j, matchScore: cached.match_score, skillMatch: cached.skill_match_score, textSimilarity: cached.text_similarity, matchedSkills: cached.matched_skills, missingSkills: cached.missing_skills, explanation: cached.explanation, aiProvider: cached.ai_provider, isFallback: cached.is_fallback };
        }
        try {
          const r = await apiScoreJobMatch(accessToken, {
            jobTitle: j.title || '',
            resumeText: resume.parsed_data.rawText || '',
            jobDescription: j.description || '',
            resumeSkills: resume.parsed_data.skills || [],
            requiredSkills: j.requirements || [],
            resumeYearsExp: resume.parsed_data.yearsOfExperience || 0,
            requiredYearsExp: j.required_years_exp || 0,
          });
          writeScoreCache(resume, j, r);
          return { ...j, matchScore: r.match_score, skillMatch: r.skill_match_score, textSimilarity: r.text_similarity, matchedSkills: r.matched_skills, missingSkills: r.missing_skills, explanation: r.explanation, aiProvider: r.ai_provider, isFallback: r.is_fallback };
        } catch {
          return {
            ...j,
            matchScore: 0,
            skillMatch: 0,
            textSimilarity: 0,
            matchedSkills: [],
            missingSkills: j.requirements || [],
            explanation: 'AI scoring is temporarily unavailable, but this job is still open for review.',
            aiProvider: 'unavailable',
            isFallback: true,
          };
        }
      }));

      matched.sort((a, b) => b.matchScore - a.matchScore);

      setJobs(matched);
      const linkedJobId = new URLSearchParams(window.location.search).get('job');
      const linkedJob = linkedJobId ? matched.find(j => j.id === linkedJobId) : null;
      if (linkedJob) {
        setSelected(linkedJob);
        setDetailOpen(true);
      } else if (matched.length > 0) {
        setSelected(matched[0]);
      }
    } catch (e: any) { toast.error(e.message); }
    finally { setLoading(false); }
  };

  const doApply = async (job: JobMatch) => {
    if (!accessToken || !activeResume) return;
    setApplying(job.id);
    try {
      const application = await apiCreateApplication(accessToken, {
        jobId: job.id,
        resumeId: activeResume.id,
        resumeUrl: activeResume.file_url,
        yearsOfExperience: activeResume.parsed_data?.yearsOfExperience || 0,
        matchScore: job.matchScore,
        skillMatchScore: job.skillMatch,
        textSimilarity: job.textSimilarity,
        matchedSkills: job.matchedSkills,
        missingSkills: job.missingSkills,
        explanation: job.explanation,
        jobTitle: job.title || '',
        resumeText: activeResume.parsed_data?.rawText || '',
        jobDescription: job.description || '',
        resumeSkills: activeResume.parsed_data?.skills || [],
        requiredSkills: job.requirements || [],
        requiredYearsExp: job.required_years_exp || 0,
      });
      setApplied(s => new Set([...s, job.id]));
      const pct = Math.round(application.match_score * 100);
      const rankMsg = pct >= 80 ? 'Top applicant' : pct >= 60 ? 'Strong match' : pct >= 40 ? 'Average match' : 'Below average match';
      toast.success(`Applied to "${job.title}" successfully! ${rankMsg} (${pct}% score).`);
      // Fetch rank for this job asynchronously
      apiGetJobRank(accessToken, job.id, application.match_score).then(r => {
        setRankInfo(prev => ({ ...prev, [job.id]: r }));
      }).catch(() => {});
    } catch (e: any) { toast.error(e.message); }
    finally { setApplying(null); }
  };

  const handleApply = (job: JobMatch) => {
    if (!accessToken || !activeResume) return;
    if (closingLabel((job as any).expires_at)?.closed) {
      toast.error('This job has closed.');
      return;
    }
    if (applied.has(job.id)) {
      setConfirmReapply(job);
    } else {
      doApply(job);
    }
  };

  const toggleSave = async (id: string) => {
    if (!accessToken) return;
    const isSaved = saved.has(id);
    setSaved(s => {
      const n = new Set(s);
      isSaved ? n.delete(id) : n.add(id);
      return n;
    });
    try {
      if (isSaved) await apiUnsaveJob(accessToken, id);
      else await apiSaveJob(accessToken, id);
    } catch {
      setSaved(s => {
        const n = new Set(s);
        isSaved ? n.add(id) : n.delete(id);
        return n;
      });
    }
  };

  const openDetail = (job: JobMatch) => { setSelected(job); setDetailOpen(true); };

  // Derived
  const departments  = JOB_FIELD_OPTIONS.map(field => field.value);
  const types        = [...new Set(jobs.map(j => j.employment_type))].sort();
  const search       = internalSearch.toLowerCase();
  const filtered     = jobs.filter(j => {
    if (savedOnly && !saved.has(j.id)) return false;
    if (search && !j.title.toLowerCase().includes(search) && !j.department.toLowerCase().includes(search) && !j.location.toLowerCase().includes(search)) return false;
    if (deptFilter !== 'all' && j.department !== deptFilter) return false;
    if (typeFilter !== 'all' && j.employment_type !== typeFilter) return false;
    if (minSalary > 0 && parseSalaryMin(j.salary_range) < minSalary) return false;
    return true;
  });
  const hasFilters = !!(internalSearch || deptFilter !== 'all' || typeFilter !== 'all' || minSalary > 0);
  const PAGE_SIZE = 10;
  const [page, setPage] = useState(1);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  if (loading) return <Skeleton />;

  const confirmModal = (
    <ConfirmModal
      open={confirmReapply !== null}
      title="Already applied"
      message={`You have already applied for "${confirmReapply?.title}". Apply again with your current resume?`}
      confirmLabel="Apply Again"
      confirmVariant="primary"
      onConfirm={() => { if (confirmReapply) { doApply(confirmReapply); setConfirmReapply(null); } }}
      onCancel={() => setConfirmReapply(null)}
    />
  );

  // ── Detail page ──
  if (detailOpen && selected) {
    return (
      <>
        {confirmModal}
        <JobDetail
          job={selected}
          applying={applying}
          applied={applied}
          saved={saved}
          activeResume={activeResume}
          onBack={() => setDetailOpen(false)}
          onApply={handleApply}
          onToggleSave={toggleSave}
          rankInfo={rankInfo}
        />
      </>
    );
  }

  // ── List page ──
  return (
    <div className="max-w-7xl mx-auto">
      {confirmModal}
      <div className="mb-6">
        <h2 className="page-title">Find Jobs</h2>
        <p className="page-subtitle">
          {activeResume
            ? `AI-matched against "${activeResume.file_name}" · ${filtered.length} result${filtered.length !== 1 ? 's' : ''}`
            : 'Upload a resume to unlock AI match scores'}
        </p>
      </div>

      {!activeResume && (
        <div className="p-4 bg-amber-500/10 border border-amber-500/25 rounded-xl text-sm text-amber-400 mb-6 flex items-center gap-2">
          <span className="material-symbols-outlined ms-sm">warning</span>
          Upload and activate a resume to see AI-powered match scores and apply to jobs.
        </div>
      )}

      <div className="flex gap-5">

        {/* ── Filter sidebar ── */}
        <aside className="hidden lg:flex flex-col gap-4 w-60 flex-shrink-0">
          <div className="bg-surface-card border border-border-dark rounded-xl p-4 space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">Filters</h3>
              {hasFilters && (
                <button onClick={() => { setSearch(''); setDept('all'); setType('all'); setMinSalary(0); }}
                  className="text-xs text-primary hover:underline font-medium">Reset All</button>
              )}
            </div>

            {/* Search */}
            <div>
              <label className="text-xs text-text-muted font-medium uppercase tracking-wider mb-1.5 block">Search</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined ms-sm text-text-muted">search</span>
                <input className="input-dark pl-9 text-sm py-2" placeholder="Title, dept, location…"
                  value={internalSearch} onChange={e => setSearch(e.target.value)} />
              </div>
            </div>

            {/* Field */}
            <div>
              <label className="text-xs text-text-muted font-medium uppercase tracking-wider mb-1.5 block">Field</label>
              <select className="input-dark text-sm py-2" value={deptFilter} onChange={e => setDept(e.target.value)}>
                <option value="all">All fields</option>
                {departments.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>

            {/* Job type */}
            <div>
              <label className="text-xs text-text-muted font-medium uppercase tracking-wider mb-1.5 block">Job Type</label>
              <div className="space-y-1.5">
                {['all', ...types].map(t => (
                  <button key={t} onClick={() => setType(t)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${typeFilter === t ? 'bg-primary/15 text-white border border-primary/30' : 'text-text-muted hover:text-white hover:bg-surface-hover'}`}>
                    {t === 'all' ? 'All Types' : t.charAt(0).toUpperCase() + t.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Salary range — replaces Min Match Score */}
            <div>
              <label className="text-xs text-text-muted font-medium uppercase tracking-wider mb-1.5 flex justify-between">
                <span>Min Salary (monthly)</span>
                <span className="text-white font-semibold">
                  {minSalary > 0 ? `RM ${minSalary.toLocaleString()}` : 'Any'}
                </span>
              </label>
              <input type="range" min={0} max={50000} step={1000} value={minSalary}
                onChange={e => setMinSalary(Number(e.target.value))}
                className="w-full accent-primary cursor-pointer" />
              <div className="flex justify-between text-xs text-text-muted mt-1">
                <span>Any</span><span>RM 50k+</span>
              </div>
            </div>
          </div>
        </aside>

        {/* ── Job list ── */}
        <div className="flex-1 min-w-0">
          {/* Mobile search */}
          <div className="lg:hidden relative mb-4">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined ms-sm text-text-muted">search</span>
            <input className="input-dark pl-9" placeholder="Search jobs…"
              value={internalSearch} onChange={e => setSearch(e.target.value)} />
          </div>

          {/* Saved filter pill */}
          <div className="flex items-center gap-2 mb-4">
            <button
              onClick={() => setSavedOnly(v => !v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                savedOnly
                  ? 'bg-primary/15 border-primary/40 text-white'
                  : 'border-border-dark text-text-muted hover:text-white hover:border-border-mid'
              }`}>
              <span className={`material-symbols-outlined text-[15px]${savedOnly ? ' fill' : ''}`}>bookmark</span>
              Saved{saved.size > 0 && ` (${saved.size})`}
            </button>
            {savedOnly && (
              <span className="text-xs text-text-muted">Showing saved jobs only</span>
            )}
          </div>

          <div className="space-y-3">
            {filtered.length === 0 ? (
              <div className="card-dark p-12 text-center">
                <span className="material-symbols-outlined ms-lg text-text-muted mb-2 block">
                  {savedOnly ? 'bookmark_border' : 'search_off'}
                </span>
                <p className="font-semibold text-white mb-1">
                  {savedOnly ? 'No saved jobs yet' : 'No jobs found'}
                </p>
                <p className="text-sm text-text-muted">
                  {savedOnly ? 'Bookmark jobs using the bookmark icon to save them here.' : 'Try adjusting your filters or search term.'}
                </p>
              </div>
            ) : paginated.map(job => {
              const pct        = Math.round(job.matchScore * 100);
              const isApplied  = applied.has(job.id);
              const isSaved    = saved.has(job.id);
              const col        = matchColors(pct);
              const label      = postedLabel(job.created_at);
              const closing    = closingLabel((job as any).expires_at);
              const rank       = rankInfo[job.id];

              return (
                <div key={job.id}
                  onClick={() => openDetail(job)}
                  className="group relative flex flex-col md:flex-row gap-5 p-5 bg-surface-card border border-border-dark rounded-xl hover:shadow-glow hover:-translate-y-0.5 transition-all duration-200 cursor-pointer">

                  {/* Left: company logo */}
                  <div className="shrink-0 self-start">
                    <CompanyLogo logo={job.company_logo} name={job.company_name || job.department || job.title} size="md" />
                  </div>

                  {/* Center: info */}
                  <div className="flex-1 flex flex-col gap-2.5 min-w-0">
                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="text-base font-bold text-white group-hover:text-primary transition-colors leading-tight truncate uppercase tracking-wide">
                          {job.title}
                        </h3>
                        <p className="text-sm text-text-muted mt-0.5">
                          {job.company_name || job.department}
                        </p>
                        <div className="flex flex-wrap items-center gap-2 mt-1.5">
                          <span className="flex items-center gap-1 text-xs text-text-muted">
                            <span className="material-symbols-outlined ms-sm">location_on</span>{job.location}
                          </span>
                          {job.work_mode && (
                            <span className="flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-md border
                              bg-surface-hover border-border-dark text-text-muted capitalize">
                              <span className="material-symbols-outlined ms-sm">
                                {job.work_mode === 'remote' ? 'public' : job.work_mode === 'hybrid' ? 'share_location' : 'corporate_fare'}
                              </span>
                              {job.work_mode.charAt(0).toUpperCase() + job.work_mode.slice(1).replace('-', '-')}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Match badge — right side */}
                      <div className={`flex flex-col items-end gap-0.5 flex-shrink-0`}>
                        <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border ${col.bg} ${col.border}`}>
                          <span className="material-symbols-outlined text-[18px] text-current" style={{ color: 'inherit' }}>psychology</span>
                          <span className={`text-sm font-bold ${col.text}`}>{pct}% AI Match</span>
                        </div>
                        <span className="text-[10px] text-text-muted px-1">{scoreProviderLabel(job.aiProvider, job.isFallback)}</span>
                      </div>
                    </div>

                    {/* Skills */}
                    {(job.matchedSkills.length > 0 || job.missingSkills.length > 0) && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-xs font-semibold uppercase text-text-muted mr-1">Skills:</span>
                        {job.matchedSkills.slice(0, 4).map(s => (
                          <span key={s} className="px-2.5 py-1 rounded text-xs font-medium bg-primary/10 text-primary border border-primary/20">{s}</span>
                        ))}
                        {job.missingSkills.slice(0, 2).map(s => (
                          <span key={s} className="px-2.5 py-1 rounded text-xs font-medium bg-surface-hover text-text-muted border border-border-dark">{s}</span>
                        ))}
                        {(job.matchedSkills.length + job.missingSkills.length) > 6 && (
                          <span className="text-xs text-text-muted">+{job.matchedSkills.length + job.missingSkills.length - 6} more</span>
                        )}
                      </div>
                    )}

                    {/* Footer meta */}
                    <div className="flex items-center justify-between pt-2.5 border-t border-border-dark/60 mt-auto">
                      <div className="flex items-center flex-wrap gap-3 text-xs text-text-muted">
                        {job.salary_range && (
                          <span className="flex items-center gap-1">
                            <span className="material-symbols-outlined ms-sm">payments</span>{job.salary_range}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <span className="material-symbols-outlined ms-sm">schedule</span>{label}
                        </span>
                        <span className="hidden sm:flex items-center gap-1 capitalize">
                          <span className="material-symbols-outlined ms-sm">work</span>{job.employment_type}
                        </span>
                        {closing && (
                          <span className={`flex items-center gap-1 font-semibold ${closing.closed ? 'text-red-400' : closing.urgent ? 'text-orange-400' : 'text-text-muted'}`}>
                            <span className="material-symbols-outlined ms-sm">{closing.closed ? 'event_busy' : 'event'}</span>
                            {closing.text}
                          </span>
                        )}
                        {rank && isApplied && (
                          <span className="flex items-center gap-1 font-semibold text-primary">
                            <span className="material-symbols-outlined ms-sm">leaderboard</span>
                            #{rank.rank} of {rank.total}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        {/* Copy link */}
                        <button
                          onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(`${window.location.origin}?job=${job.id}`); toast.success('Job link copied!'); }}
                          className="size-8 flex items-center justify-center rounded-lg hover:bg-surface-hover transition-colors text-text-muted hover:text-white"
                          title="Copy job link" aria-label="Copy job link">
                          <span className="material-symbols-outlined text-[20px]">link</span>
                        </button>
                        {/* Bookmark */}
                        <button
                          onClick={e => { e.stopPropagation(); toggleSave(job.id); }}
                          aria-label={isSaved ? 'Remove from saved jobs' : 'Save job'}
                          className={`size-8 flex items-center justify-center rounded-lg hover:bg-surface-hover transition-colors ${isSaved ? 'text-primary' : 'text-text-muted hover:text-primary'}`}>
                          <span className={`material-symbols-outlined text-[20px]${isSaved ? ' fill' : ''}`}>bookmark</span>
                        </button>

                        {isApplied ? (
                          <div className="flex items-center gap-2">
                            <span className="flex items-center gap-1 text-xs font-semibold text-green-400 bg-green-500/10 border border-green-500/25 px-3 py-1.5 rounded-lg">
                              <span className="material-symbols-outlined ms-sm">check</span>Applied
                            </span>
                            {pct >= 80 && (
                              <span className="flex items-center gap-0.5 text-[10px] font-bold text-amber-400 bg-amber-500/15 border border-amber-500/25 px-2 py-1 rounded-full">
                                <span className="material-symbols-outlined" style={{ fontSize: 12 }}>star</span>Top
                              </span>
                            )}
                          </div>
                        ) : (
                          <button
                            onClick={e => { e.stopPropagation(); openDetail(job); }}
                            className="bg-primary hover:bg-primary-hover text-white text-sm font-semibold px-4 py-1.5 rounded-lg transition-colors shadow-glow">
                            View Details
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-6">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                aria-label="Previous page"
                className="size-9 flex items-center justify-center rounded-lg border border-border-dark text-text-muted hover:bg-surface-hover hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                <span className="material-symbols-outlined ms-sm">chevron_left</span>
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                <button key={p} onClick={() => setPage(p)}
                  className={`size-9 flex items-center justify-center rounded-lg text-sm font-bold border transition-colors ${
                    p === page ? 'bg-primary border-primary text-white' : 'border-border-dark text-text-muted hover:bg-surface-hover hover:text-white'
                  }`}>
                  {p}
                </button>
              ))}
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                aria-label="Next page"
                className="size-9 flex items-center justify-center rounded-lg border border-border-dark text-text-muted hover:bg-surface-hover hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                <span className="material-symbols-outlined ms-sm">chevron_right</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Job Detail Page ──────────────────────────────────────────────────────────

interface JobDetailProps {
  job: JobMatch;
  applying: string | null;
  applied: Set<string>;
  saved: Set<string>;
  activeResume: Resume | null;
  onBack: () => void;
  onApply: (job: JobMatch) => void;
  onToggleSave: (id: string) => void;
}

function JobDetail({ job, applying, applied, saved, activeResume, onBack, onApply, onToggleSave, rankInfo }: JobDetailProps & { rankInfo: Record<string, { rank: number; total: number }> }) {
  const { accessToken } = useAuth();
  const pct       = Math.round(job.matchScore * 100);
  const isApplied = applied.has(job.id);
  const isSaved   = saved.has(job.id);
  const col       = matchColors(pct);
  const label     = postedLabel(job.created_at);
  const closing   = closingLabel((job as any).expires_at);
  const isClosed  = !!closing?.closed;
  const rank      = rankInfo[job.id];

  // What-If optimizer state
  const [hypotheticalSkills, setHypotheticalSkills] = useState<string[]>([]);
  const [whatIfScore, setWhatIfScore] = useState<number | null>(null);
  const [whatIfLoading, setWhatIfLoading] = useState(false);
  const [whatIfError, setWhatIfError] = useState('');

  useEffect(() => {
    if (!accessToken || !activeResume?.parsed_data || hypotheticalSkills.length === 0) {
      setWhatIfScore(null);
      setWhatIfError('');
      return;
    }
    setWhatIfLoading(true);
    setWhatIfError('');
    apiScoreJobMatch(accessToken, {
      jobTitle: job.title || '',
      resumeText: `${activeResume.parsed_data.rawText || ''}\n\nHypothetical added skills: ${hypotheticalSkills.join(', ')}`,
      jobDescription: job.description || '',
      resumeSkills: [...new Set([...(activeResume.parsed_data.skills || []), ...hypotheticalSkills])],
      requiredSkills: job.requirements || [],
      resumeYearsExp: activeResume.parsed_data.yearsOfExperience || 0,
      requiredYearsExp: job.required_years_exp || 0,
    }).then(r => setWhatIfScore(Math.round(r.match_score * 100)))
      .catch((e: any) => setWhatIfError(e.message || 'AI what-if scoring failed.'))
      .finally(() => setWhatIfLoading(false));
  }, [accessToken, activeResume?.id, job.id, hypotheticalSkills.join('|')]);

  return (
    <div className="max-w-7xl mx-auto">

      {/* Back */}
      <button onClick={onBack}
        className="flex items-center gap-2 text-text-muted hover:text-white text-sm font-medium mb-6 transition-colors group">
        <span className="material-symbols-outlined ms-sm group-hover:-translate-x-0.5 transition-transform">arrow_back</span>
        Back to Jobs
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

        {/* ── Left column ── */}
        <div className="lg:col-span-8 flex flex-col gap-5">

          {/* Header card */}
          <div className="bg-surface-card border border-border-dark rounded-xl p-6">
            <div className="flex flex-col sm:flex-row gap-5 items-start">
              <CompanyLogo logo={job.company_logo} name={job.company_name || job.department || job.title} size="lg" />
              <div className="flex-1 min-w-0">
                <h1 className="text-2xl sm:text-3xl font-bold tracking-wide text-white leading-tight uppercase">
                  {job.title}
                </h1>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-text-muted mt-2">
                  <span className="font-semibold text-slate-300">{job.company_name || job.department}</span>
                  <span className="size-1 rounded-full bg-border-dark inline-block" />
                  <span className="flex items-center gap-1">
                    <span className="material-symbols-outlined ms-sm">location_on</span>{job.location}
                  </span>
                  <span className="size-1 rounded-full bg-border-dark inline-block" />
                  <span className="capitalize">{job.employment_type}</span>
                  {job.work_mode && (
                    <>
                      <span className="size-1 rounded-full bg-border-dark inline-block" />
                      <span className="flex items-center gap-1 font-medium text-slate-300">
                        <span className="material-symbols-outlined ms-sm">
                          {job.work_mode === 'remote' ? 'public' : job.work_mode === 'hybrid' ? 'share_location' : 'corporate_fare'}
                        </span>
                        {job.work_mode.charAt(0).toUpperCase() + job.work_mode.slice(1)}
                      </span>
                    </>
                  )}
                </div>
              </div>
              {/* Mobile match badge */}
              <div className={`lg:hidden flex items-center gap-1.5 px-3 py-1.5 rounded-full border flex-shrink-0 ${col.bg} ${col.border}`}>
                <span className="material-symbols-outlined text-[16px] text-current">verified</span>
                <span className={`text-sm font-bold ${col.text}`}>{pct}% Match</span>
              </div>
            </div>
          </div>

          {/* Description */}
          {job.description && (
            <div className="bg-surface-card border border-border-dark rounded-xl p-6 md:p-8">
              <h2 className="text-xl font-bold text-white mb-4">Job Description</h2>
              <p className="text-text-muted leading-relaxed whitespace-pre-line text-sm">{job.description}</p>
            </div>
          )}

          {/* Required skills with match status */}
          {job.requirements.length > 0 && (
            <div className="bg-surface-card border border-border-dark rounded-xl p-6 md:p-8">
              <h2 className="text-xl font-bold text-white mb-4">Requirements</h2>
              <div className="flex flex-col gap-3">
                {job.requirements.map(req => {
                  const matched = job.matchedSkills.includes(req);
                  return (
                    <div key={req} className="flex gap-3 items-center">
                      <span className={`material-symbols-outlined text-[20px] flex-shrink-0 ${matched ? 'text-green-400' : 'text-red-400'}`}>
                        {matched ? 'check_circle' : 'cancel'}
                      </span>
                      <span className="text-sm text-slate-300">{req}</span>
                      {matched && <span className="text-xs text-green-400 font-medium">You have this</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Skills match breakdown */}
          {(job.matchedSkills.length > 0 || job.missingSkills.length > 0) && (
            <div className="bg-surface-card border border-border-dark rounded-xl p-6 md:p-8">
              <h2 className="text-xl font-bold text-white mb-4">Skills &amp; Tools</h2>

              {job.matchedSkills.length > 0 && (
                <div className="mb-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-green-400 mb-2">
                    Matched — {job.matchedSkills.length} skill{job.matchedSkills.length !== 1 ? 's' : ''}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {job.matchedSkills.map(s => (
                      <span key={s} className="px-3 py-1.5 rounded-full text-xs font-medium bg-green-500/10 text-green-400 border border-green-500/25">
                        ✓ {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {job.missingSkills.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-red-400 mb-2">
                    Missing — {job.missingSkills.length} skill{job.missingSkills.length !== 1 ? 's' : ''}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {job.missingSkills.map(s => (
                      <span key={s} className="px-3 py-1.5 rounded-full text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/25">
                        ✗ {s}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Right column (sticky action card) ── */}
        <div className="lg:col-span-4">
          <div className="sticky top-6 flex flex-col gap-5">

            {/* Action card */}
            <div className="bg-surface-card border border-border-dark rounded-xl p-6 shadow-soft flex flex-col gap-5">

              {/* AI Compatibility score */}
              <div className="flex items-center justify-between pb-4 border-b border-border-dark">
                <div>
                  <span className="text-sm font-medium text-text-muted">AI Compatibility</span>
                  <p className="text-[10px] text-text-muted mt-0.5">{scoreProviderLabel(job.aiProvider, job.isFallback)}</p>
                </div>
                <div className={`flex items-center gap-1.5 ${col.text}`}>
                  <span className="material-symbols-outlined text-[20px]">stars</span>
                  <span className="text-lg font-black">{pct}% Match</span>
                </div>
              </div>

              {/* Salary */}
              {job.salary_range ? (
                <div>
                  <p className="text-sm text-text-muted mb-1">Salary Range</p>
                  <p className="text-2xl font-black text-white tracking-tight">{job.salary_range}</p>
                  <p className="text-xs text-text-muted">per year</p>
                </div>
              ) : (
                <div>
                  <p className="text-sm text-text-muted mb-1">Salary Range</p>
                  <p className="text-base font-medium text-text-muted italic">Not specified</p>
                </div>
              )}

              {/* CTA buttons */}
              <div className="flex flex-col gap-3">
                <button
                  disabled={applying === job.id || !activeResume || isClosed}
                  onClick={() => onApply(job)}
                  className={`w-full flex items-center justify-center gap-2 rounded-xl h-12 text-base font-bold tracking-wide transition-all duration-200
                    ${applying === job.id
                      ? 'bg-surface-hover text-text-muted cursor-not-allowed'
                      : !activeResume || isClosed
                      ? 'bg-surface-hover text-text-muted cursor-not-allowed opacity-50'
                      : isApplied
                      ? 'bg-green-600 hover:bg-green-700 text-white shadow-md'
                      : 'bg-primary hover:bg-primary-hover text-white shadow-md hover:shadow-glow hover:-translate-y-0.5'}`}>
                  {applying === job.id
                    ? <><span className="material-symbols-outlined animate-spin ms-sm">refresh</span>Applying…</>
                    : isApplied
                    ? <><span className="material-symbols-outlined ms-sm">check</span>Applied — Apply Again?</>
                    : isClosed
                    ? 'Applications closed'
                    : !activeResume
                    ? 'Upload a resume first'
                    : <><span className="material-symbols-outlined ms-sm">send</span>Apply Now</>}
                </button>

                <button
                  onClick={() => onToggleSave(job.id)}
                  className="w-full flex items-center justify-center gap-2 rounded-xl border border-border-dark hover:bg-surface-hover h-12 text-base font-medium text-white transition-colors">
                  <span className={`material-symbols-outlined text-[20px]${isSaved ? ' fill' : ''}`}>bookmark</span>
                  {isSaved ? 'Saved' : 'Save Job'}
                </button>

                <button
                  onClick={() => { navigator.clipboard.writeText(`${window.location.origin}?job=${job.id}`); toast.success('Job link copied to clipboard!'); }}
                  className="w-full flex items-center justify-center gap-2 rounded-xl border border-border-dark hover:bg-surface-hover h-10 text-sm font-medium text-text-muted hover:text-white transition-colors">
                  <span className="material-symbols-outlined text-[18px]">link</span>
                  Copy Job Link
                </button>
              </div>

              {/* Quick stats */}
              <div className="flex flex-col gap-3 pt-2">
                {[
                  { icon: 'schedule',     label: `Posted ${label}` },
                  { icon: 'work',         label: job.employment_type.charAt(0).toUpperCase() + job.employment_type.slice(1) },
                  ...(job.work_mode ? [{ icon: job.work_mode === 'remote' ? 'public' : job.work_mode === 'hybrid' ? 'share_location' : 'corporate_fare', label: job.work_mode.charAt(0).toUpperCase() + job.work_mode.slice(1) }] : []),
                  ...(job.required_years_exp > 0 ? [{ icon: 'work_history', label: `${job.required_years_exp}+ years experience` }] : []),
                  { icon: 'location_on',  label: job.location },
                ].map(({ icon, label: l }) => (
                  <div key={icon} className="flex items-center gap-3 text-sm text-slate-300">
                    <span className="material-symbols-outlined text-text-muted ms-sm">{icon}</span>
                    {l}
                  </div>
                ))}
                {closing && (
                  <div className={`flex items-center gap-3 text-sm font-semibold ${closing.closed ? 'text-red-400' : closing.urgent ? 'text-orange-400' : 'text-slate-300'}`}>
                    <span className="material-symbols-outlined text-current ms-sm">{closing.closed ? 'event_busy' : 'event'}</span>
                    {closing.text}
                  </div>
                )}
                {rank && isApplied && (
                  <div className="flex items-center gap-3 text-sm font-bold text-primary">
                    <span className="material-symbols-outlined text-primary ms-sm">leaderboard</span>
                    You rank #{rank.rank} of {rank.total} applicants
                  </div>
                )}
              </div>
            </div>

            {/* AI Insight widget */}
            {job.explanation && (
              <div className="bg-surface-card border border-primary/20 rounded-xl p-5 relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/8 to-transparent pointer-events-none" />
                <div className="relative">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="material-symbols-outlined text-primary ms-sm">auto_awesome</span>
                    <h3 className="text-sm font-bold text-white">Why you're a match</h3>
                  </div>
                  <p className="text-sm text-text-muted leading-relaxed">{job.explanation}</p>
                  {pct > 0 && (
                    <div className="mt-4 h-1.5 w-full rounded-full bg-surface-hover overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-primary to-blue-400 rounded-full transition-all duration-700"
                        style={{ width: `${pct}%` }} />
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Skills Gap Roadmap */}
            {job.missingSkills.length > 0 && (
              <div className="bg-surface-card border border-border-dark rounded-xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <span className="material-symbols-outlined text-red-400 ms-sm">route</span>
                  <h3 className="text-sm font-bold text-white">Skills Gap Roadmap</h3>
                </div>
                <p className="text-xs text-text-muted mb-3">
                  To reach {Math.min(100, pct + Math.round((job.missingSkills.length / Math.max(job.requirements.length, 1)) * 50))}% match, add these skills:
                </p>
                <div className="flex flex-wrap gap-2">
                  {job.missingSkills.map(s => (
                    <span key={s} className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/25">
                      <span className="material-symbols-outlined" style={{ fontSize: 12 }}>add</span>
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* What-If Resume Optimizer */}
            {job.missingSkills.length > 0 && (
              <div className="bg-surface-card border border-border-dark rounded-xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <span className="material-symbols-outlined text-amber-400 ms-sm">science</span>
                  <h3 className="text-sm font-bold text-white">What-If Optimizer</h3>
                </div>
                <p className="text-xs text-text-muted mb-3">Select skills you plan to add to your resume and see your score change.</p>
                <div className="flex flex-wrap gap-2 mb-4">
                  {job.missingSkills.map(s => {
                    const isAdded = hypotheticalSkills.includes(s);
                    return (
                      <button key={s} onClick={() => setHypotheticalSkills(hs => isAdded ? hs.filter(x => x !== s) : [...hs, s])}
                        className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                          isAdded
                            ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                            : 'bg-surface-hover text-text-muted border-border-dark hover:text-white hover:border-border-mid'
                        }`}>
                        <span className="material-symbols-outlined" style={{ fontSize: 12 }}>{isAdded ? 'check' : 'add'}</span>
                        {s}
                      </button>
                    );
                  })}
                </div>
                <div className="p-3 bg-surface-hover rounded-xl border border-border-dark">
                  <div className="flex items-center justify-between text-sm mb-2">
                    <span className="text-text-muted">Current match</span>
                    <span className="font-bold text-white">{pct}%</span>
                  </div>
                  {hypotheticalSkills.length > 0 && (
                    <div className="flex items-center justify-between text-sm gap-3">
                      <span className="text-amber-400 font-medium">With new skills</span>
                      {whatIfLoading ? (
                        <span className="text-xs text-text-muted">AI scoring...</span>
                      ) : whatIfScore !== null ? (
                        <span className="font-black text-amber-300">{whatIfScore}% <span className="text-xs font-normal text-green-400">(+{whatIfScore - pct}%)</span></span>
                      ) : (
                        <span className="text-xs text-red-400">Unavailable</span>
                      )}
                    </div>
                  )}
                  {whatIfError && <p className="text-xs text-red-400 mt-2">{whatIfError}</p>}
                </div>
                {hypotheticalSkills.length > 0 && (
                  <button onClick={() => setHypotheticalSkills([])}
                    className="mt-2 w-full text-xs text-text-muted hover:text-white text-center transition-colors">
                    Reset
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="max-w-7xl mx-auto space-y-3">
      <div className="h-8 bg-surface-card rounded-xl animate-pulse w-48 mb-2" />
      {[...Array(4)].map((_, i) => (
        <div key={i} className="bg-surface-card border border-border-dark rounded-xl p-5 animate-pulse">
          <div className="flex gap-5">
            <div className="size-14 rounded-xl bg-surface-hover flex-shrink-0" />
            <div className="flex-1 space-y-2.5">
              <div className="h-4 bg-surface-hover rounded w-1/3" />
              <div className="h-3 bg-surface-hover rounded w-1/2" />
              <div className="h-3 bg-surface-hover rounded w-2/3" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
