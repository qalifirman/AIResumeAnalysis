import { useState, useEffect, Fragment } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { apiGetApplications } from '../../api';
import type { Application, ApplicationStatus } from '../../types';

const STATUS_STEPS: ApplicationStatus[] = ['applied', 'under_review', 'shortlisted', 'rejected'];
const STATUS_META: Record<ApplicationStatus, { label: string; icon: string; color: string }> = {
  applied:      { label: 'Applied',      icon: 'send',         color: 'text-blue-400' },
  under_review: { label: 'Under review', icon: 'manage_search',color: 'text-yellow-400' },
  shortlisted:  { label: 'Shortlisted',  icon: 'thumb_up',     color: 'text-green-400' },
  rejected:     { label: 'Rejected',     icon: 'cancel',       color: 'text-red-400' },
};

function ProgressBar({ status }: { status: ApplicationStatus }) {
  if (status === 'rejected') {
    return (
      <div className="flex items-center gap-2 mt-3">
        <div className="flex-1 h-1 bg-red-500/30 rounded-full" />
        <span className="text-xs text-red-400">Not moving forward</span>
      </div>
    );
  }
  const idx = STATUS_STEPS.filter(s => s !== 'rejected').indexOf(status);
  const steps = ['applied', 'under_review', 'shortlisted'] as ApplicationStatus[];
  return (
    <div className="flex items-center gap-1 mt-3">
      {steps.map((s, i) => (
        <Fragment key={s}>
          <div className={`size-2 rounded-full flex-shrink-0 ${i <= idx ? 'bg-primary' : 'bg-surface-hover'}`} />
          {i < steps.length - 1 && (
            <div className={`flex-1 h-0.5 ${i < idx ? 'bg-primary' : 'bg-surface-hover'}`} />
          )}
        </Fragment>
      ))}
    </div>
  );
}

export function ApplicationTracking() {
  const { accessToken } = useAuth();
  const [apps, setApps] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<ApplicationStatus | 'all'>('all');
  const [error, setError] = useState('');

  useEffect(() => { load(); }, []);
  const load = async () => {
    if (!accessToken) return;
    try { setApps(await apiGetApplications(accessToken)); }
    catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  const filtered = filter === 'all' ? apps : apps.filter(a => a.status === filter);

  const counts = apps.reduce((acc, a) => ({ ...acc, [a.status]: (acc[a.status] || 0) + 1 }), {} as Record<string, number>);

  if (loading) return (
    <div className="space-y-3">
      {[...Array(3)].map((_, i) => <div key={i} className="card-dark p-5 animate-pulse h-24" />)}
    </div>
  );

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h2 className="page-title">My applications</h2>
        <p className="page-subtitle">{apps.length} total application{apps.length !== 1 ? 's' : ''}</p>
      </div>

      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/25 rounded-xl text-sm text-red-400 mb-4 flex items-center gap-2">
          <span className="material-symbols-outlined ms-sm">error</span>{error}
        </div>
      )}

      {/* Summary tiles */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {(['applied', 'under_review', 'shortlisted', 'rejected'] as ApplicationStatus[]).map(s => {
          const m = STATUS_META[s];
          return (
            <button key={s} onClick={() => setFilter(filter === s ? 'all' : s)}
              className={`card-dark p-4 text-center transition-all hover:bg-surface-hover ${filter === s ? 'border-primary/50' : ''}`}>
              <span className={`material-symbols-outlined ${m.color} block mb-1`} style={{fontSize:'20px'}}>{m.icon}</span>
              <div className="text-xl font-black text-white">{counts[s] || 0}</div>
              <div className="text-xs text-text-muted mt-0.5 leading-tight">{m.label}</div>
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <div className="card-dark p-12 text-center">
          <span className="material-symbols-outlined ms-lg text-text-muted mb-2 block">inbox</span>
          <p className="font-semibold text-white mb-1">No applications yet</p>
          <p className="text-sm text-text-muted">Head to "Find jobs" to start applying.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(app => {
            const m = STATUS_META[app.status];
            const pct = Math.round(app.match_score * 100);
            return (
              <div key={app.id} className="card-dark p-5">
                <div className="flex items-start gap-4">
                  <div className="size-11 rounded-xl bg-surface-hover flex items-center justify-center flex-shrink-0">
                    <span className={`material-symbols-outlined ${m.color}`}>{m.icon}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <h3 className="font-semibold text-white">{app.job_title || 'Position'}</h3>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-xs text-text-muted">{pct}% match</span>
                        <span className={`status-${app.status}`}>{m.label}</span>
                      </div>
                    </div>
                    <p className="text-xs text-text-muted mt-0.5">
                      Applied {new Date(app.created_at).toLocaleDateString()}
                    </p>
                    <ProgressBar status={app.status} />
                    {app.matched_skills?.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {app.matched_skills.slice(0, 4).map(s => (
                          <span key={s} className="px-2 py-0.5 text-xs bg-green-500/10 text-green-400 border border-green-500/20 rounded-md">{s}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
