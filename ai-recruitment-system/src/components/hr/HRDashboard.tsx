import { useState } from 'react';
import { Sidebar } from '../layout/Sidebar';
import { JobManagement } from './JobManagement';
import { CandidateReview } from './CandidateReview';
import { Analytics } from './Analytics';

type HRTab = 'dashboard' | 'jobs' | 'candidates' | 'analytics';

const NAV_ITEMS = [
  { id: 'dashboard', icon: 'dashboard', label: 'Dashboard' },
  { id: 'jobs',      icon: 'work',      label: 'Job postings' },
  { id: 'candidates',icon: 'people',    label: 'Candidates' },
  { id: 'analytics', icon: 'bar_chart', label: 'Analytics' },
];

export function HRDashboard() {
  const [activeTab, setActiveTab] = useState<HRTab>('jobs');

  return (
    <div className="flex h-screen bg-bg-dark overflow-hidden">
      <Sidebar activeTab={activeTab} onTabChange={t => setActiveTab(t as HRTab)}
        navItems={NAV_ITEMS} portalLabel="Manager Portal" />

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="h-14 flex items-center justify-between px-6 border-b border-border-dark bg-surface-dark flex-shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-white">
              {NAV_ITEMS.find(n => n.id === activeTab)?.label}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-muted bg-surface-card px-3 py-1.5 rounded-lg border border-border-dark">
              HR Portal
            </span>
          </div>
        </header>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto p-6">
          {activeTab === 'dashboard' && <HROverview onNavigate={setActiveTab} />}
          {activeTab === 'jobs'      && <JobManagement />}
          {activeTab === 'candidates'&& <CandidateReview />}
          {activeTab === 'analytics' && <Analytics />}
        </main>
      </div>
    </div>
  );
}

function HROverview({ onNavigate }: { onNavigate: (tab: HRTab) => void }) {
  const cards = [
    { icon: 'work', label: 'Manage job postings', sub: 'Create, edit, and archive listings', tab: 'jobs' as HRTab, color: 'text-blue-400', bg: 'bg-blue-500/10' },
    { icon: 'people', label: 'Review candidates', sub: 'See AI match scores and ranked applicants', tab: 'candidates' as HRTab, color: 'text-green-400', bg: 'bg-green-500/10' },
    { icon: 'bar_chart', label: 'View analytics', sub: 'Hiring funnel and skill trends', tab: 'analytics' as HRTab, color: 'text-purple-400', bg: 'bg-purple-500/10' },
  ];
  return (
    <div className="max-w-2xl">
      <h2 className="text-2xl font-bold text-white mb-1">Welcome to RecruitAI</h2>
      <p className="text-text-muted mb-8">Where would you like to start?</p>
      <div className="grid gap-4">
        {cards.map(c => (
          <button key={c.tab} onClick={() => onNavigate(c.tab)}
            className="card-dark p-5 flex items-center gap-4 hover:bg-surface-hover transition-colors text-left w-full">
            <div className={`size-12 rounded-xl ${c.bg} flex items-center justify-center flex-shrink-0`}>
              <span className={`material-symbols-outlined ms-lg ${c.color}`}>{c.icon}</span>
            </div>
            <div>
              <div className="font-semibold text-white">{c.label}</div>
              <div className="text-sm text-text-muted mt-0.5">{c.sub}</div>
            </div>
            <span className="material-symbols-outlined text-text-muted ml-auto ms-sm">chevron_right</span>
          </button>
        ))}
      </div>
    </div>
  );
}
