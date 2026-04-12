import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { apiGetJobs, apiGetResumes, apiCreateApplication } from '../../api';
import { calculateMatch } from '../../utils/ai/nlp-engine';
import type { Job, Resume } from '../../types';

interface JobMatch extends Job {
  matchScore: number;
  skillMatch: number;
  textSimilarity: number;
  matchedSkills: string[];
  missingSkills: string[];
  explanation: string;
}

function ScoreRing({ pct }: { pct: number }) {
  const r = 18, c = 2 * Math.PI * r;
  const color = pct >= 80 ? '#a78bfa' : pct >= 60 ? '#22c55e' : pct >= 40 ? '#eab308' : '#ef4444';
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" className="flex-shrink-0">
      <circle cx="24" cy="24" r={r} fill="none" stroke="#243647" strokeWidth="4" />
      <circle cx="24" cy="24" r={r} fill="none" stroke={color} strokeWidth="4"
        strokeDasharray={c} strokeDashoffset={c - (pct / 100) * c}
        strokeLinecap="round" transform="rotate(-90 24 24)" />
      <text x="24" y="28" textAnchor="middle" fontSize="11" fontWeight="700" fill="white">{pct}%</text>
    </svg>
  );
}

export function JobRecommendations() {
  const { accessToken } = useAuth();
  const [jobs, setJobs] = useState<JobMatch[]>([]);
  const [activeResume, setActiveResume] = useState<Resume | null>(null);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState<string | null>(null);
  const [applied, setApplied] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<JobMatch | null>(null);
  const [error, setError] = useState('');

  useEffect(() => { load(); }, []);

  const load = async () => {
    if (!accessToken) return;
    try {
      const [jobList, resumeList] = await Promise.all([apiGetJobs(accessToken), apiGetResumes(accessToken)]);
      const resume = resumeList.find(r => r.is_active) || resumeList[0] || null;
      setActiveResume(resume);

      const matched: JobMatch[] = jobList
        .filter(j => j.status === 'active')
        .map(j => {
          if (!resume?.parsed_data) return { ...j, matchScore: 0, skillMatch: 0, textSimilarity: 0, matchedSkills: [], missingSkills: [], explanation: 'Upload a resume to see your match score.' };
          const result = calculateMatch(
            resume.parsed_data.rawText || '',
            j.description || '',
            resume.parsed_data.skills || [],
            j.requirements || [],
            resume.parsed_data.yearsOfExperience || 0,
            j.required_years_exp || 0,
          );
          return { ...j, matchScore: result.matchScore, skillMatch: result.skillMatch,
            textSimilarity: result.textSimilarity, matchedSkills: result.matchedSkills,
            missingSkills: result.missingSkills, explanation: result.explanation };
        })
        .sort((a, b) => b.matchScore - a.matchScore);

      setJobs(matched);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  const handleApply = async (job: JobMatch) => {
    if (!accessToken || !activeResume) return;
    setApplying(job.id); setError('');
    try {
      await apiCreateApplication(accessToken, {
        jobId: job.id,
        resumeUrl: activeResume.file_url,
        yearsOfExperience: activeResume.parsed_data?.yearsOfExperience || 0,
        matchScore: job.matchScore,
        skillMatchScore: job.skillMatch,
        textSimilarity: job.textSimilarity,
        matchedSkills: job.matchedSkills,
        missingSkills: job.missingSkills,
        explanation: job.explanation,
        // Send raw data so server can re-score with real AI service
        resumeText: activeResume.parsed_data?.rawText || '',
        jobDescription: job.description || '',
        resumeSkills: activeResume.parsed_data?.skills || [],
        requiredSkills: job.requirements || [],
        requiredYearsExp: job.required_years_exp || 0,
      });
      setApplied(s => new Set([...s, job.id]));
    } catch (e: any) { setError(e.message); }
    finally { setApplying(null); }
  };

  const filtered = jobs.filter(j =>
    j.title.toLowerCase().includes(search.toLowerCase()) ||
    j.department.toLowerCase().includes(search.toLowerCase()) ||
    j.location.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return <Skeleton />;

  return (
    <div>
      <div className="mb-6">
        <h2 className="page-title">Job recommendations</h2>
        <p className="page-subtitle">
          {activeResume ? `Matched against "${activeResume.file_name}"` : 'Upload a resume to see match scores'}
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/25 rounded-xl text-sm text-red-400 mb-4">
          <span className="material-symbols-outlined ms-sm">error</span><span>{error}</span>
        </div>
      )}

      {!activeResume && (
        <div className="p-4 bg-yellow-500/10 border border-yellow-500/25 rounded-xl text-sm text-yellow-400 mb-6 flex items-center gap-2">
          <span className="material-symbols-outlined ms-sm">warning</span>
          Upload and activate a resume to see AI-powered match scores.
        </div>
      )}

      {/* Search */}
      <div className="relative mb-5">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-text-muted ms-sm">search</span>
        <input className="input-dark pl-10" placeholder="Search by title, department, location…"
          value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div className="flex gap-4">
        {/* Job list */}
        <div className="flex-1 space-y-3 min-w-0">
          {filtered.length === 0 ? (
            <div className="card-dark p-10 text-center">
              <span className="material-symbols-outlined ms-lg text-text-muted mb-2 block">search_off</span>
              <p className="text-sm text-text-muted">No jobs match your search.</p>
            </div>
          ) : filtered.map(job => {
            const pct = Math.round(job.matchScore * 100);
            const isApplied = applied.has(job.id);
            return (
              <div key={job.id}
                className={`card-dark p-5 cursor-pointer hover:bg-surface-hover transition-colors ${selected?.id === job.id ? 'border-primary/50 bg-surface-hover' : ''}`}
                onClick={() => setSelected(job)}>
                <div className="flex items-start gap-4">
                  <ScoreRing pct={pct} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <h3 className="font-semibold text-white">{job.title}</h3>
                      {isApplied && <span className="badge-strong flex-shrink-0">Applied</span>}
                    </div>
                    <div className="flex flex-wrap gap-3 mt-1 text-xs text-text-muted">
                      <span className="flex items-center gap-1">
                        <span className="material-symbols-outlined ms-sm">business</span>{job.department}
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="material-symbols-outlined ms-sm">location_on</span>{job.location}
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="material-symbols-outlined ms-sm">schedule</span>{job.employment_type}
                      </span>
                      {job.salary_range && (
                        <span className="flex items-center gap-1">
                          <span className="material-symbols-outlined ms-sm">payments</span>{job.salary_range}
                        </span>
                      )}
                    </div>
                    {job.matchedSkills.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {job.matchedSkills.slice(0, 4).map(s => (
                          <span key={s} className="px-2 py-0.5 text-xs bg-green-500/10 text-green-400 border border-green-500/20 rounded-md">{s}</span>
                        ))}
                        {job.matchedSkills.length > 4 && (
                          <span className="text-xs text-text-muted">+{job.matchedSkills.length - 4} more</span>
                        )}
                      </div>
                    )}
                  </div>
                  <button
                    disabled={isApplied || applying === job.id || !activeResume}
                    onClick={e => { e.stopPropagation(); handleApply(job); }}
                    className={`flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                      isApplied ? 'bg-green-500/10 text-green-400 border border-green-500/20 cursor-default'
                      : !activeResume ? 'bg-surface-hover text-text-muted border border-border-dark cursor-not-allowed opacity-50'
                      : 'btn-primary'
                    }`}>
                    {applying === job.id
                      ? <span className="material-symbols-outlined animate-spin ms-sm">refresh</span>
                      : isApplied ? 'Applied' : 'Apply'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Detail panel */}
        {selected && (
          <div className="w-80 flex-shrink-0 hidden lg:block">
            <div className="card-dark p-5 sticky top-0 space-y-4">
              <div>
                <h3 className="font-bold text-white mb-0.5">{selected.title}</h3>
                <p className="text-xs text-text-muted">{selected.department} · {selected.location}</p>
              </div>
              {selected.description && (
                <div>
                  <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">Description</h4>
                  <p className="text-xs text-slate-300 leading-relaxed line-clamp-6">{selected.description}</p>
                </div>
              )}
              {selected.explanation && (
                <div className="p-3 bg-primary/5 border border-primary/20 rounded-xl">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-primary mb-1.5">
                    <span className="material-symbols-outlined ms-sm">auto_awesome</span>AI insight
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">{selected.explanation}</p>
                </div>
              )}
              {selected.requirements.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">Required skills</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {selected.requirements.map(s => {
                      const matched = selected.matchedSkills.includes(s);
                      return (
                        <span key={s} className={`px-2 py-0.5 text-xs rounded-md border ${matched ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-surface-hover text-text-muted border-border-dark'}`}>
                          {s}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="space-y-3">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="card-dark p-5 animate-pulse">
          <div className="flex gap-4">
            <div className="size-12 rounded-full bg-surface-hover" />
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-surface-hover rounded w-1/3" />
              <div className="h-3 bg-surface-hover rounded w-1/2" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
