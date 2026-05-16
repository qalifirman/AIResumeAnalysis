import { useState, useEffect, Fragment } from 'react';
import { toast } from 'sonner';
import { useAuth } from '../../contexts/AuthContext';
import { apiGetApplications, apiWithdrawApplication } from '../../api';
import { ConfirmModal } from '../ui/confirm-modal';
import type { Application, ApplicationStatus } from '../../types';

async function openResumeUrl(url: string, setResumeError: (msg: string) => void) {
  // Open the tab immediately so browsers don't block it as a popup
  const tab = window.open(url, '_blank', 'noopener,noreferrer');

  // In parallel, fetch the URL to detect storage errors and show an inline warning
  try {
    const res = await fetch(url);
    const contentType = res.headers.get('content-type') || '';

    if (!res.ok || contentType.includes('application/json')) {
      const json = await res.json().catch(() => null);
      const isBucketError =
        json?.error === 'Bucket not found' ||
        json?.message?.includes('Bucket not found') ||
        json?.statusCode === '404';

      if (isBucketError) {
        // Close the useless tab and show helpful inline message instead
        tab?.close();
        setResumeError(
          'Resume file is unavailable — the storage bucket is not configured on this server. ' +
          'Please re-upload your resume to generate a new link.'
        );
      }
    }
  } catch {
    // CORS or network error — the tab is already open, nothing more to do
  }
}

const STATUS_META: Record<ApplicationStatus, { label: string; icon: string; color: string; bg: string; border: string }> = {
  applied:      { label: 'Applied',      icon: 'send',          color: 'text-blue-400',   bg: 'bg-blue-500/10',   border: 'border-blue-500/25' },
  under_review: { label: 'Under Review', icon: 'manage_search', color: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/25' },
  shortlisted:  { label: 'Shortlisted',  icon: 'thumb_up',      color: 'text-green-400',  bg: 'bg-green-500/10',  border: 'border-green-500/25' },
  rejected:     { label: 'Rejected',     icon: 'cancel',        color: 'text-red-400',    bg: 'bg-red-500/10',    border: 'border-red-500/25' },
};

const PIPELINE: ApplicationStatus[] = ['applied', 'under_review', 'shortlisted'];

function StatusTimeline({ status }: { status: ApplicationStatus }) {
  if (status === 'rejected') {
    return (
      <div className="flex items-center gap-2 mt-3">
        <div className="flex-1 h-1 bg-red-500/20 rounded-full" />
        <span className="text-xs text-red-400 flex items-center gap-1 flex-shrink-0">
          <span className="material-symbols-outlined ms-sm">cancel</span>Not moving forward
        </span>
        <div className="flex-1 h-1 bg-red-500/20 rounded-full" />
      </div>
    );
  }
  const idx = PIPELINE.indexOf(status);
  return (
    <div className="flex items-center gap-1 mt-3">
      {PIPELINE.map((step, i) => {
        const reached = i <= idx;
        const m = STATUS_META[step];
        return (
          <Fragment key={step}>
            <div className={`size-5 rounded-full flex items-center justify-center flex-shrink-0 border transition-colors ${reached ? `${m.bg} ${m.border} border` : 'bg-surface-hover border border-border-dark'}`}>
              <span className={`material-symbols-outlined ${reached ? m.color : 'text-border-dark'}`} style={{ fontSize: '11px' }}>
                {reached && step !== status ? 'check' : 'circle'}
              </span>
            </div>
            {i < PIPELINE.length - 1 && (
              <div className={`flex-1 h-0.5 transition-colors ${i < idx ? 'bg-primary' : 'bg-surface-hover'}`} />
            )}
          </Fragment>
        );
      })}
    </div>
  );
}

function ScoreBar({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color = pct >= 80 ? 'bg-violet-500' : pct >= 60 ? 'bg-green-500' : pct >= 40 ? 'bg-yellow-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-surface-hover rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-bold text-white flex-shrink-0">{pct}%</span>
    </div>
  );
}

function CompanyLogo({ logo, name }: { logo?: string | null; name?: string | null }) {
  const initial = (name?.[0] || 'C').toUpperCase();
  if (logo) {
    return (
      <div className="size-12 rounded-xl bg-white p-1.5 border border-border-dark flex items-center justify-center flex-shrink-0">
        <img src={logo} alt={`${name || 'Company'} logo`} className="w-full h-full object-contain rounded-lg" />
      </div>
    );
  }
  return (
    <div className="size-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-sm font-bold text-violet-300 flex-shrink-0">
      {initial}
    </div>
  );
}

export function ApplicationTracking() {
  const { accessToken } = useAuth();
  const [apps, setApps] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<ApplicationStatus | 'all'>('all');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [resumeError, setResumeError] = useState('');
  const [withdrawId, setWithdrawId] = useState<string | null>(null);
  const [withdrawing, setWithdrawing] = useState(false);

  useEffect(() => { load(); }, []);

  const load = async () => {
    if (!accessToken) return;
    try { setApps(await apiGetApplications(accessToken)); }
    catch (e: any) { toast.error(e.message); }
    finally { setLoading(false); }
  };

  const handleWithdraw = async () => {
    if (!accessToken || !withdrawId) return;
    setWithdrawing(true);
    try {
      await apiWithdrawApplication(accessToken, withdrawId);
      setApps(prev => prev.filter(a => a.id !== withdrawId));
      toast.success('Application withdrawn.');
    } catch (e: any) {
      toast.error(e.message || 'Failed to withdraw application.');
    } finally {
      setWithdrawing(false);
      setWithdrawId(null);
    }
  };

  const searchLower = search.toLowerCase();
  const filtered = apps.filter(a => {
    if (filter !== 'all' && a.status !== filter) return false;
    if (searchLower && !a.job_title?.toLowerCase().includes(searchLower) && !a.job_company_name?.toLowerCase().includes(searchLower)) return false;
    return true;
  });
  const counts = apps.reduce((acc, a) => ({ ...acc, [a.status]: (acc[a.status] || 0) + 1 }), {} as Record<string, number>);
  const APP_PAGE_SIZE = 8;
  const [appPage, setAppPage] = useState(1);
  useEffect(() => { setAppPage(1); }, [filter, search]);
  const totalAppPages = Math.ceil(filtered.length / APP_PAGE_SIZE);
  const paginatedApps = filtered.slice((appPage - 1) * APP_PAGE_SIZE, appPage * APP_PAGE_SIZE);

  if (loading) return (
    <div className="max-w-4xl mx-auto space-y-3">
      <div className="h-8 bg-surface-card rounded-xl animate-pulse w-48 mb-4" />
      <div className="grid grid-cols-4 gap-3 mb-6">{[...Array(4)].map((_, i) => <div key={i} className="card-dark h-20 animate-pulse" />)}</div>
      {[...Array(3)].map((_, i) => <div key={i} className="card-dark p-5 animate-pulse h-24" />)}
    </div>
  );

  return (
    <div className="max-w-4xl mx-auto">
      <ConfirmModal
        open={withdrawId !== null}
        title="Withdraw application?"
        message="This will permanently remove your application. You can re-apply later if the job is still open."
        confirmLabel={withdrawing ? 'Withdrawing…' : 'Withdraw'}
        onConfirm={handleWithdraw}
        onCancel={() => setWithdrawId(null)}
      />

      <div className="mb-6">
        <h2 className="page-title">My Applications</h2>
        <p className="page-subtitle">{apps.length} total application{apps.length !== 1 ? 's' : ''} tracked</p>
      </div>

      {/* Status tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {(['applied', 'under_review', 'shortlisted', 'rejected'] as ApplicationStatus[]).map(s => {
          const m = STATUS_META[s];
          const count = counts[s] || 0;
          return (
            <button key={s} onClick={() => setFilter(filter === s ? 'all' : s)}
              className={`rounded-xl border p-4 text-center transition-all hover:scale-[1.02] ${filter === s ? `${m.bg} ${m.border}` : 'bg-surface-card border-border-dark hover:bg-surface-hover hover:border-border-mid'}`}>
              <div className={`size-9 rounded-lg ${m.bg} flex items-center justify-center mx-auto mb-2`}>
                <span className={`material-symbols-outlined ms-sm ${m.color}`}>{m.icon}</span>
              </div>
              <div className="text-2xl font-black text-white mb-0.5">{count}</div>
              <div className="text-xs text-text-muted leading-tight">{m.label}</div>
            </button>
          );
        })}
      </div>

      {/* Search + Filter row */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        {/* Company / job search */}
        <div className="relative group flex-1">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-text-muted group-focus-within:text-primary transition-colors ms-sm">search</span>
          <input
            className="w-full h-10 pl-10 pr-4 rounded-xl bg-surface-card border border-border-dark text-white text-sm placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all"
            placeholder="Search by job title or company…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-white transition-colors">
              <span className="material-symbols-outlined ms-sm">close</span>
            </button>
          )}
        </div>

        {/* Status filter pills */}
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => setFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${filter === 'all' ? 'bg-primary/20 border border-primary/40 text-white' : 'text-text-muted hover:text-white'}`}>
            All ({apps.length})
          </button>
          {(['applied', 'under_review', 'shortlisted', 'rejected'] as ApplicationStatus[]).map(s => {
            if (!(counts[s] || 0)) return null;
            return (
              <button key={s} onClick={() => setFilter(filter === s ? 'all' : s)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${filter === s ? 'bg-primary/20 border border-primary/40 text-white' : 'text-text-muted hover:text-white'}`}>
                {STATUS_META[s].label} ({counts[s]})
              </button>
            );
          })}
        </div>
      </div>

      {/* Application cards */}
      {filtered.length === 0 ? (
        <div className="card-dark p-14 text-center">
          <span className="material-symbols-outlined ms-lg text-text-muted mb-3 block">inbox</span>
          <p className="font-semibold text-white mb-1">{filter === 'all' ? 'No applications yet' : `No ${STATUS_META[filter as ApplicationStatus]?.label} applications`}</p>
          <p className="text-sm text-text-muted">{filter === 'all' ? 'Browse jobs and apply to start tracking your applications.' : 'Try selecting a different status filter.'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {paginatedApps.map(app => {
            const m = STATUS_META[app.status];
            const isExpanded = expandedId === app.id;
            return (
              <div key={app.id} className={`rounded-xl border overflow-hidden transition-all duration-200 ${app.status === 'shortlisted' ? 'bg-surface-card border-green-500/30' : app.status === 'rejected' ? 'bg-surface-card border-red-500/20' : 'bg-surface-card border-border-dark'}`}>
                {/* Card header */}
                <div className="flex items-start gap-4 p-5">
                  <CompanyLogo logo={app.job_company_logo} name={app.job_company_name || app.job_title} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 flex-wrap mb-0.5">
                      <h3 className="font-bold text-white">{app.job_title || 'Position'}</h3>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {app.resume_url && (
                          <button
                            onClick={e => { e.stopPropagation(); setResumeError(''); openResumeUrl(app.resume_url!, setResumeError); }}
                            className="flex items-center gap-1 text-[10px] font-semibold text-blue-400 bg-blue-500/10 border border-blue-500/25 px-2 py-0.5 rounded-full hover:bg-blue-500/20 transition-colors"
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: '11px' }}>picture_as_pdf</span>
                            Resume
                          </button>
                        )}
                        <span className={`badge-score ${m.bg} ${m.color} ${m.border} border`}>{m.label}</span>
                      </div>
                    </div>
                    {app.job_company_name && (
                      <p className="text-xs text-slate-300 mb-1">{app.job_company_name}</p>
                    )}
                    <p className="text-xs text-text-muted mb-2.5">
                      Applied {new Date(app.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                    <StatusTimeline status={app.status} />
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {(app.status === 'applied' || app.status === 'under_review') && (
                      <button
                        onClick={e => { e.stopPropagation(); setWithdrawId(app.id); }}
                        title="Withdraw application"
                        className="p-2 text-text-muted hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                      >
                        <span className="material-symbols-outlined ms-sm">delete</span>
                      </button>
                    )}
                    <button onClick={() => setExpandedId(isExpanded ? null : app.id)}
                      className="p-2 text-text-muted hover:text-white hover:bg-surface-hover rounded-lg transition-colors">
                      <span className="material-symbols-outlined ms-sm">{isExpanded ? 'expand_less' : 'expand_more'}</span>
                    </button>
                  </div>
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="border-t border-border-dark p-5 bg-bg-dark/30 space-y-4">

                    {/* ── Resume PDF link ── */}
                    {(app.resume_url || app.resume_file_name) && (
                      <div className="space-y-2">
                        {app.resume_url ? (
                          <button
                            onClick={() => { setResumeError(''); openResumeUrl(app.resume_url!, setResumeError); }}
                            className="w-full flex items-center gap-3 p-3 bg-surface-card rounded-xl border border-border-dark hover:border-primary/40 transition-colors group text-left">
                            <div className="size-9 rounded-lg bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                              <span className="material-symbols-outlined ms-sm text-blue-400">picture_as_pdf</span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-white group-hover:text-primary transition-colors truncate">
                                {app.resume_file_name || 'View Submitted Resume'}
                              </p>
                              <p className="text-xs text-text-muted">Click to open your PDF in a new tab</p>
                            </div>
                            <span className="material-symbols-outlined ms-sm text-text-muted group-hover:text-primary transition-colors">open_in_new</span>
                          </button>
                        ) : (
                          <div className="w-full flex items-center gap-3 p-3 bg-surface-card rounded-xl border border-border-dark">
                            <div className="size-9 rounded-lg bg-surface-hover flex items-center justify-center flex-shrink-0">
                              <span className="material-symbols-outlined ms-sm text-text-muted">picture_as_pdf</span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-white truncate">{app.resume_file_name || 'Resume Submitted'}</p>
                              <p className="text-xs text-text-muted">File preview unavailable — resume was submitted successfully</p>
                            </div>
                          </div>
                        )}
                        {resumeError && (
                          <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/25 rounded-xl text-xs text-red-400">
                            <span className="material-symbols-outlined ms-sm flex-shrink-0 mt-0.5">error</span>
                            <span>{resumeError}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Match score */}
                    <div>
                      <div className="flex items-center justify-between text-xs mb-2">
                        <span className="text-text-muted font-medium uppercase tracking-wider">AI Match Score</span>
                        <span className="font-bold text-white">{Math.round(app.match_score * 100)}%</span>
                      </div>
                      <ScoreBar score={app.match_score} />
                    </div>

                    {/* AI explanation */}
                    {app.explanation && (
                      <div className="p-3 bg-primary/5 border border-primary/20 rounded-xl">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-primary mb-1.5">
                          <span className="material-symbols-outlined ms-sm">auto_awesome</span>AI analysis
                        </div>
                        <p className="text-xs text-slate-300 leading-relaxed">{app.explanation}</p>
                      </div>
                    )}

                    {/* Skills */}
                    {((app.matched_skills?.length || 0) > 0 || (app.missing_skills?.length || 0) > 0) && (
                      <div className="grid grid-cols-2 gap-3">
                        {(app.matched_skills?.length || 0) > 0 && (
                          <div>
                            <p className="text-xs font-semibold text-green-400 uppercase tracking-wider mb-1.5">Matched Skills</p>
                            <div className="flex flex-wrap gap-1.5">
                              {app.matched_skills.slice(0, 6).map(s => <span key={s} className="px-2 py-0.5 text-xs bg-green-500/10 text-green-400 border border-green-500/20 rounded-md">{s}</span>)}
                              {app.matched_skills.length > 6 && <span className="text-xs text-text-muted">+{app.matched_skills.length - 6}</span>}
                            </div>
                          </div>
                        )}
                        {(app.missing_skills?.length || 0) > 0 && (
                          <div>
                            <p className="text-xs font-semibold text-red-400 uppercase tracking-wider mb-1.5">Missing Skills</p>
                            <div className="flex flex-wrap gap-1.5">
                              {app.missing_skills.slice(0, 6).map(s => <span key={s} className="px-2 py-0.5 text-xs bg-red-500/10 text-red-400 border border-red-500/20 rounded-md">{s}</span>)}
                              {app.missing_skills.length > 6 && <span className="text-xs text-text-muted">+{app.missing_skills.length - 6}</span>}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalAppPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-6">
          <button onClick={() => setAppPage(p => Math.max(1, p - 1))} disabled={appPage === 1}
            aria-label="Previous page"
            className="size-9 flex items-center justify-center rounded-lg border border-border-dark text-text-muted hover:bg-surface-hover hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
            <span className="material-symbols-outlined ms-sm">chevron_left</span>
          </button>
          {Array.from({ length: totalAppPages }, (_, i) => i + 1).map(p => (
            <button key={p} onClick={() => setAppPage(p)}
              className={`size-9 flex items-center justify-center rounded-lg text-sm font-bold border transition-colors ${
                p === appPage ? 'bg-primary border-primary text-white' : 'border-border-dark text-text-muted hover:bg-surface-hover hover:text-white'
              }`}>
              {p}
            </button>
          ))}
          <button onClick={() => setAppPage(p => Math.min(totalAppPages, p + 1))} disabled={appPage === totalAppPages}
            aria-label="Next page"
            className="size-9 flex items-center justify-center rounded-lg border border-border-dark text-text-muted hover:bg-surface-hover hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
            <span className="material-symbols-outlined ms-sm">chevron_right</span>
          </button>
        </div>
      )}
    </div>
  );
}
