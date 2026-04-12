import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { apiGetJobs, apiGetApplications, apiUpdateApplicationStatus } from '../../api';
import type { Job, Application, ApplicationStatus } from '../../types';

function scoreBadge(score: number) {
  const pct = Math.round(score * 100);
  if (pct >= 80) return <span className="badge-top">{pct}% Top</span>;
  if (pct >= 60) return <span className="badge-strong">{pct}% Strong</span>;
  if (pct >= 40) return <span className="badge-medium">{pct}% Potential</span>;
  return <span className="badge-low">{pct}%</span>;
}

function statusBadge(s: ApplicationStatus) {
  const cls: Record<ApplicationStatus, string> = {
    applied: 'status-applied', under_review: 'status-under_review',
    shortlisted: 'status-shortlisted', rejected: 'status-rejected',
  };
  const labels: Record<ApplicationStatus, string> = {
    applied: 'Applied', under_review: 'Under review',
    shortlisted: 'Shortlisted', rejected: 'Rejected',
  };
  return <span className={cls[s]}>{labels[s]}</span>;
}

export function CandidateReview() {
  const { accessToken } = useAuth();
  const [apps, setApps] = useState<Application[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [jobFilter, setJobFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selected, setSelected] = useState<Application | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => { load(); }, []);

  const load = async () => {
    if (!accessToken) return;
    try {
      const [j, a] = await Promise.all([apiGetJobs(accessToken), apiGetApplications(accessToken)]);
      setJobs(j);
      setApps(a.sort((x, y) => y.match_score - x.match_score));
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  const updateStatus = async (id: string, status: ApplicationStatus) => {
    if (!accessToken) return;
    setUpdating(id);
    try {
      await apiUpdateApplicationStatus(accessToken, id, status);
      setApps(as => as.map(a => a.id === id ? { ...a, status } : a));
      if (selected?.id === id) setSelected(s => s ? { ...s, status } : null);
    } catch (e: any) { setError(e.message); }
    finally { setUpdating(null); }
  };

  const filtered = apps.filter(a => {
    if (jobFilter !== 'all' && a.job_id !== jobFilter) return false;
    if (statusFilter !== 'all' && a.status !== statusFilter) return false;
    return true;
  });

  if (loading) return <LoadingSkeleton />;

  return (
    <div className="flex gap-4 h-[calc(100vh-8rem)]">
      {/* Left: list */}
      <div className="w-full md:w-96 flex flex-col gap-3 overflow-hidden flex-shrink-0">
        {error && (
          <div className="p-3 bg-red-500/10 border border-red-500/25 rounded-xl text-sm text-red-400 flex items-center gap-2">
            <span className="material-symbols-outlined ms-sm">error</span>{error}
          </div>
        )}

        {/* Filters */}
        <div className="flex gap-2">
          <select className="input-dark flex-1 text-xs py-2" value={jobFilter} onChange={e => setJobFilter(e.target.value)}>
            <option value="all">All jobs</option>
            {jobs.map(j => <option key={j.id} value={j.id}>{j.title}</option>)}
          </select>
          <select className="input-dark flex-1 text-xs py-2" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="all">All status</option>
            {['applied','under_review','shortlisted','rejected'].map(s => (
              <option key={s} value={s}>{s.replace('_',' ')}</option>
            ))}
          </select>
        </div>

        <div className="text-xs text-text-muted px-1">{filtered.length} candidate{filtered.length !== 1 ? 's' : ''}</div>

        {/* Cards */}
        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
          {filtered.length === 0 ? (
            <div className="card-dark p-8 text-center text-text-muted text-sm">No candidates match the current filters.</div>
          ) : filtered.map(app => (
            <button key={app.id} onClick={() => setSelected(app)}
              className={`w-full text-left card-dark p-4 hover:bg-surface-hover transition-colors relative ${selected?.id === app.id ? 'border-primary/50 bg-surface-hover' : ''}`}>
              {selected?.id === app.id && <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-primary rounded-l-xl" />}
              <div className="flex items-start gap-3">
                <div className="size-10 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-xs font-bold text-primary flex-shrink-0">
                  {(app.applicant_name || 'U').split(' ').map(n => n[0]).slice(0,2).join('').toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-white text-sm truncate">{app.applicant_name || 'Unknown'}</span>
                    {scoreBadge(app.match_score)}
                  </div>
                  <div className="text-xs text-text-muted mt-0.5 truncate">{app.job_title || 'Unknown position'}</div>
                  <div className="mt-1.5">{statusBadge(app.status)}</div>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Right: detail */}
      <div className="flex-1 overflow-y-auto">
        {!selected ? (
          <div className="card-dark h-full flex flex-col items-center justify-center text-center p-8">
            <div className="size-16 rounded-2xl bg-surface-hover flex items-center justify-center mb-4">
              <span className="material-symbols-outlined ms-lg text-text-muted">person_search</span>
            </div>
            <p className="font-semibold text-white mb-1">Select a candidate</p>
            <p className="text-sm text-text-muted">Click any candidate from the list to view their full profile and AI analysis.</p>
          </div>
        ) : (
          <div className="card-dark p-6 space-y-6">
            {/* Header */}
            <div className="flex items-start gap-4">
              <div className="size-14 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-lg font-bold text-primary flex-shrink-0">
                {(selected.applicant_name || 'U').split(' ').map(n => n[0]).slice(0,2).join('').toUpperCase()}
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-white">{selected.applicant_name}</h3>
                <p className="text-sm text-text-muted">{selected.applicant_email}</p>
                <div className="flex items-center gap-2 mt-2">
                  {statusBadge(selected.status)}
                  <span className="text-xs text-text-muted">Applied {new Date(selected.created_at).toLocaleDateString()}</span>
                </div>
              </div>
              <div className="text-right">
                <div className="text-3xl font-black text-white">{Math.round(selected.match_score * 100)}%</div>
                <div className="text-xs text-text-muted">match score</div>
              </div>
            </div>

            {/* Score breakdown */}
            <div>
              <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">Score breakdown</h4>
              <div className="space-y-3">
                {[
                  { label: 'Skill match', val: selected.skill_match_score, icon: 'psychology' },
                  { label: 'Content similarity', val: selected.text_similarity, icon: 'article' },
                ].map(m => (
                  <div key={m.label}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="flex items-center gap-1.5 text-text-muted">
                        <span className="material-symbols-outlined ms-sm">{m.icon}</span>{m.label}
                      </span>
                      <span className="font-semibold text-white">{Math.round((m.val || 0) * 100)}%</span>
                    </div>
                    <div className="h-1.5 bg-surface-hover rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full transition-all"
                        style={{ width: `${Math.round((m.val || 0) * 100)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* AI explanation */}
            {selected.explanation && (
              <div className="p-4 bg-primary/5 border border-primary/20 rounded-xl">
                <div className="flex items-center gap-2 text-xs font-semibold text-primary mb-2">
                  <span className="material-symbols-outlined ms-sm">auto_awesome</span>AI analysis
                </div>
                <p className="text-sm text-slate-300 leading-relaxed">{selected.explanation}</p>
              </div>
            )}

            {/* Skills */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">Matched skills</h4>
                <div className="flex flex-wrap gap-1.5">
                  {(selected.matched_skills || []).length === 0
                    ? <span className="text-xs text-text-muted">None detected</span>
                    : (selected.matched_skills || []).map(s => (
                      <span key={s} className="px-2 py-0.5 text-xs bg-green-500/10 text-green-400 border border-green-500/20 rounded-md">{s}</span>
                    ))}
                </div>
              </div>
              <div>
                <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">Missing skills</h4>
                <div className="flex flex-wrap gap-1.5">
                  {(selected.missing_skills || []).length === 0
                    ? <span className="text-xs text-text-muted">None</span>
                    : (selected.missing_skills || []).map(s => (
                      <span key={s} className="px-2 py-0.5 text-xs bg-red-500/10 text-red-400 border border-red-500/20 rounded-md">{s}</span>
                    ))}
                </div>
              </div>
            </div>

            {/* Actions */}
            <div>
              <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">Update status</h4>
              <div className="flex flex-wrap gap-2">
                {(['applied','under_review','shortlisted','rejected'] as ApplicationStatus[]).map(s => (
                  <button key={s} disabled={selected.status === s || updating === selected.id}
                    onClick={() => updateStatus(selected.id, s)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all disabled:opacity-50 ${
                      selected.status === s
                        ? 'bg-primary/20 border-primary/40 text-white'
                        : 'bg-surface-hover border-border-dark text-text-muted hover:text-white hover:border-border-mid'
                    }`}>
                    {s.replace('_', ' ')}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="flex gap-4">
      <div className="w-96 space-y-2">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="card-dark p-4 animate-pulse">
            <div className="flex gap-3">
              <div className="size-10 rounded-full bg-surface-hover" />
              <div className="flex-1 space-y-2">
                <div className="h-3 bg-surface-hover rounded w-2/3" />
                <div className="h-3 bg-surface-hover rounded w-1/2" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
