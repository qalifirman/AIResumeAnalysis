import { useState, useEffect } from 'react';
import { Sidebar } from '../layout/Sidebar';
import { JobManagement } from './JobManagement';
import { CandidateReview } from './CandidateReview';
import { Analytics } from './Analytics';
import { ReportGeneration } from './ReportGeneration';
import { NotificationDropdown } from '../layout/NotificationDropdown';
import { CompanyProfile } from './CompanyProfile';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { apiGetApplications, apiGetJobs } from '../../api';
import type { Application, ApplicationStatus } from '../../types';

type HRTab = 'dashboard' | 'jobs' | 'candidates' | 'analytics' | 'reports' | 'profile';

const NAV_ITEMS = [
  { id: 'dashboard', icon: 'dashboard',       label: 'Dashboard' },
  { id: 'jobs',      icon: 'work',            label: 'Job Postings' },
  { id: 'candidates',icon: 'people',          label: 'Candidates' },
  { id: 'analytics', icon: 'bar_chart',       label: 'Analytics' },
  { id: 'reports',   icon: 'description',     label: 'Reports' },
  { id: 'profile',   icon: 'manage_accounts', label: 'Profile' },
];

export function HRDashboard() {
  const [activeTab, setActiveTab] = useState<HRTab>('dashboard');
  const [headerSearch, setHeaderSearch] = useState('');
  const { theme, toggleTheme } = useTheme();

  // When user types in header search, switch to candidates tab
  const handleHeaderSearch = (val: string) => {
    setHeaderSearch(val);
    if (val && activeTab !== 'candidates') setActiveTab('candidates');
  };

  return (
    <div className="flex h-screen bg-bg-dark overflow-hidden">
      <Sidebar activeTab={activeTab} onTabChange={t => { setActiveTab(t as HRTab); setHeaderSearch(''); }}
        navItems={NAV_ITEMS} portalLabel="Manager Portal" />

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar — h-16 matches sidebar brand height */}
        <header className="h-16 flex items-center justify-between px-6 border-b border-border-dark bg-surface-dark flex-shrink-0">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-text-muted text-sm">
            <span>Portal</span>
            <span className="material-symbols-outlined ms-sm">chevron_right</span>
            <span className="text-white font-semibold">{NAV_ITEMS.find(n => n.id === activeTab)?.label}</span>
          </div>

          {/* Right controls */}
          <div className="flex items-center gap-2">
            {/* Search — active only on candidates tab or triggers switch */}
            <div className="relative hidden sm:block">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted material-symbols-outlined ms-sm">search</span>
              <input
                className="bg-surface-hover border border-border-dark text-white text-sm rounded-xl pl-9 pr-4 py-2 w-52 focus:ring-2 focus:ring-primary/50 focus:border-primary placeholder:text-text-muted focus:outline-none transition-all"
                placeholder="Search candidates…"
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

            {/* Theme toggle */}
            <button onClick={toggleTheme} title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              className="p-2 text-text-muted hover:text-white rounded-xl hover:bg-surface-hover transition-colors">
              <span className="material-symbols-outlined">
                {theme === 'dark' ? 'light_mode' : 'dark_mode'}
              </span>
            </button>

            {/* Notifications */}
            <NotificationDropdown role="hr" onNavigate={tab => { setActiveTab(tab as HRTab); setHeaderSearch(''); }} />
          </div>
        </header>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto p-6 lg:p-8 pb-20 md:pb-6">
          {activeTab === 'dashboard'  && <HROverview onNavigate={setActiveTab} />}
          {activeTab === 'jobs'       && <JobManagement />}
          {activeTab === 'candidates' && <CandidateReview externalSearch={headerSearch} />}
          {activeTab === 'analytics'  && <Analytics />}
          {activeTab === 'reports'    && <ReportGeneration />}
          {activeTab === 'profile'    && <CompanyProfile />}
        </main>
      </div>
    </div>
  );
}

// ─── HR Overview dashboard ────────────────────────────────────────────────────

function HROverview({ onNavigate }: { onNavigate: (tab: HRTab) => void }) {
  const { user, accessToken } = useAuth();
  const organizationName = user?.company_name || user?.name || 'there';

  const [apps, setApps] = useState<Application[]>([]);
  const [totalJobs, setTotalJobs] = useState(0);
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    if (!accessToken) return;
    Promise.all([apiGetApplications(accessToken), apiGetJobs(accessToken)])
      .then(([a, j]) => {
        setApps(a.sort((x, y) => y.match_score - x.match_score));
        setTotalJobs(j.filter(jb => jb.status === 'active').length);
      })
      .catch(() => {})
      .finally(() => setLoadingData(false));
  }, [accessToken]);

  const counts = apps.reduce((acc, a) => ({ ...acc, [a.status]: (acc[a.status] || 0) + 1 }), {} as Record<string, number>);
  const avgScore = apps.length ? Math.round(apps.reduce((s, a) => s + a.match_score, 0) / apps.length * 100) : 0;

  function scoreBadge(score: number) {
    const pct = Math.round(score * 100);
    if (pct >= 80) return <span className="badge-top">{pct}%</span>;
    if (pct >= 60) return <span className="badge-strong">{pct}%</span>;
    if (pct >= 40) return <span className="badge-medium">{pct}%</span>;
    return <span className="badge-low">{pct}%</span>;
  }

  function StatusBadge({ s }: { s: ApplicationStatus }) {
    const map: Record<ApplicationStatus, [string, string]> = {
      applied: ['status-applied', 'Applied'],
      under_review: ['status-under_review', 'Under Review'],
      shortlisted: ['status-shortlisted', 'Shortlisted'],
      rejected: ['status-rejected', 'Rejected'],
    };
    const [cls, label] = map[s];
    return <span className={cls}>{label}</span>;
  }

  const stats = [
    { icon: 'group',          label: 'Total Applicants',  value: loadingData ? '—' : String(apps.length),          color: 'text-blue-400',   bg: 'bg-blue-500/10' },
    { icon: 'smart_toy',      label: 'AI Screened',       value: loadingData ? '—' : String(apps.length),          color: 'text-violet-400', bg: 'bg-primary/10' },
    { icon: 'pending_actions',label: 'Pending Review',    value: loadingData ? '—' : String(counts['applied'] || 0),color: 'text-amber-400',  bg: 'bg-amber-500/10' },
    { icon: 'stars',          label: 'Avg. Match Score',  value: loadingData ? '—' : `${avgScore}%`,               color: 'text-emerald-400',bg: 'bg-emerald-500/10' },
  ];

  const quickActions = [
    { icon: 'work',    label: 'Manage Job Postings',  sub: `${totalJobs} active listing${totalJobs !== 1 ? 's' : ''}`, tab: 'jobs' as HRTab,       color: 'text-blue-400',   bg: 'bg-blue-500/10' },
    { icon: 'people',  label: 'Review Candidates',    sub: `${apps.length} total applicant${apps.length !== 1 ? 's' : ''}`, tab: 'candidates' as HRTab, color: 'text-green-400',  bg: 'bg-green-500/10' },
    { icon: 'bar_chart',label: 'View Analytics',      sub: 'Hiring funnel and skill trends',  tab: 'analytics' as HRTab, color: 'text-purple-400', bg: 'bg-purple-500/10' },
  ];

  return (
    <div className="max-w-7xl mx-auto flex flex-col gap-8">
      {/* Heading */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white">Welcome back, {organizationName}</h2>
          <p className="text-text-muted mt-1">Here is your recruitment overview for today.</p>
        </div>
        <button onClick={() => onNavigate('jobs')}
          className="flex items-center justify-center gap-2 bg-primary hover:bg-primary-hover text-white px-4 py-2 rounded-xl text-sm font-bold transition-colors shadow-glow">
          <span className="material-symbols-outlined ms-sm">add</span>
          <span>Post New Job</span>
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(s => (
          <div key={s.label} className="stat-card">
            <div className="flex justify-between items-start mb-4">
              <div className={`p-2 ${s.bg} rounded-lg`}>
                <span className={`material-symbols-outlined ${s.color}`}>{s.icon}</span>
              </div>
            </div>
            <p className="text-sm font-medium text-text-muted">{s.label}</p>
            <h3 className="text-2xl font-bold text-white mt-1">{s.value}</h3>
          </div>
        ))}
      </div>

      {/* Quick actions + AI insights */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-surface-card rounded-xl border border-border-dark p-6">
          <h3 className="text-lg font-bold text-white mb-1">Quick Actions</h3>
          <p className="text-sm text-text-muted mb-5">Where would you like to start?</p>
          <div className="space-y-3">
            {quickActions.map(c => (
              <button key={c.tab} onClick={() => onNavigate(c.tab)}
                className="w-full flex items-center gap-4 p-4 rounded-xl bg-surface-hover/50 hover:bg-surface-hover border border-border-dark hover:border-primary/30 transition-all text-left group">
                <div className={`size-12 rounded-xl ${c.bg} flex items-center justify-center flex-shrink-0`}>
                  <span className={`material-symbols-outlined ms-lg ${c.color}`}>{c.icon}</span>
                </div>
                <div className="flex-1">
                  <div className="font-semibold text-white group-hover:text-primary transition-colors">{c.label}</div>
                  <div className="text-sm text-text-muted mt-0.5">{c.sub}</div>
                </div>
                <span className="material-symbols-outlined text-text-muted group-hover:text-primary ms-sm transition-colors">chevron_right</span>
              </button>
            ))}
          </div>
        </div>

        <div className="bg-surface-card rounded-xl border border-border-dark p-6">
          <div className="flex justify-between items-center mb-5">
            <h3 className="text-lg font-bold text-white">AI Insights</h3>
            <button onClick={() => onNavigate('analytics')} className="text-primary text-xs font-semibold hover:underline">View All</button>
          </div>
          <div className="flex flex-col gap-3">
            {[
              { icon: 'auto_awesome', color: 'text-primary',    bg: 'bg-primary/10',    msg: `${apps.length} applicants matched to active job postings.` },
              { icon: 'warning',      color: 'text-amber-500',  bg: 'bg-amber-500/10',  msg: `${counts['applied'] || 0} candidates awaiting your review.` },
              { icon: 'psychology',   color: 'text-purple-500', bg: 'bg-purple-500/10', msg: 'AI has updated rankings for all active jobs.' },
            ].map((item, i) => (
              <div key={i} className="flex gap-3 items-start p-3 rounded-xl bg-bg-dark/50">
                <div className={`w-8 h-8 rounded-full ${item.bg} flex items-center justify-center shrink-0`}>
                  <span className={`material-symbols-outlined ${item.color} ms-sm`}>{item.icon}</span>
                </div>
                <p className="text-sm text-slate-200 leading-snug">{item.msg}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent candidates table */}
      <div className="bg-surface-card rounded-xl border border-border-dark overflow-hidden">
        <div className="p-5 border-b border-border-dark flex justify-between items-center">
          <div>
            <h3 className="text-lg font-bold text-white">Recent Candidates</h3>
            <p className="text-xs text-text-muted mt-0.5">Top {Math.min(apps.length, 6)} by match score</p>
          </div>
          <button onClick={() => onNavigate('candidates')}
            className="flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary-hover transition-colors">
            View All <span className="material-symbols-outlined ms-sm">arrow_forward</span>
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-hover/50 text-text-muted text-xs uppercase tracking-wider font-semibold">
                <th className="px-5 py-3">Candidate</th>
                <th className="px-5 py-3">Role Applied</th>
                <th className="px-5 py-3">AI Match Score</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-dark text-sm">
              {loadingData ? (
                [...Array(4)].map((_, i) => (
                  <tr key={i}>
                    <td colSpan={5} className="px-5 py-3">
                      <div className="h-6 bg-surface-hover animate-pulse rounded-lg" />
                    </td>
                  </tr>
                ))
              ) : apps.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <span className="material-symbols-outlined ms-lg text-text-muted">group</span>
                      <span className="text-text-muted text-sm">No candidates yet. <button onClick={() => onNavigate('jobs')} className="text-primary hover:underline">Post a job</button> to start receiving applications.</span>
                    </div>
                  </td>
                </tr>
              ) : apps.slice(0, 6).map(app => (
                <tr key={app.id} className="hover:bg-surface-hover/30 transition-colors">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2.5">
                      {app.applicant_avatar_url ? (
                        <img src={app.applicant_avatar_url} alt={app.applicant_name || 'Candidate'}
                          className="size-8 rounded-full object-cover border border-primary/30 flex-shrink-0" />
                      ) : (
                        <div className="size-8 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-xs font-bold text-primary flex-shrink-0">
                          {(app.applicant_name || 'U').split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()}
                        </div>
                      )}
                      <div>
                        <p className="font-medium text-white">{app.applicant_name || 'Unknown'}</p>
                        <p className="text-xs text-text-muted">{app.applicant_email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-text-muted">{app.job_title || '—'}</td>
                  <td className="px-5 py-3">{scoreBadge(app.match_score)}</td>
                  <td className="px-5 py-3"><StatusBadge s={app.status} /></td>
                  <td className="px-5 py-3 text-right">
                    <button onClick={() => onNavigate('candidates')}
                      className="text-xs text-primary hover:underline font-medium">Review</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
