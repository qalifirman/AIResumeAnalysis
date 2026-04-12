import { useState } from 'react';
import { Sidebar } from '../layout/Sidebar';
import { JobRecommendations } from './JobRecommendations';
import { ApplicationTracking } from './ApplicationTracking';
import { ResumeManager } from './ResumeManager';
import { ProfileManagement } from './ProfileManagement';

type ApplicantTab = 'jobs' | 'applications' | 'resumes' | 'profile';

const NAV_ITEMS = [
  { id: 'jobs',         icon: 'search',      label: 'Find jobs' },
  { id: 'applications', icon: 'description', label: 'My applications' },
  { id: 'resumes',      icon: 'upload_file', label: 'Resumes' },
  { id: 'profile',      icon: 'manage_accounts', label: 'Profile' },
];

export function ApplicantDashboard() {
  const [activeTab, setActiveTab] = useState<ApplicantTab>('resumes');

  return (
    <div className="flex h-screen bg-bg-dark overflow-hidden">
      <Sidebar activeTab={activeTab} onTabChange={t => setActiveTab(t as ApplicantTab)}
        navItems={NAV_ITEMS} portalLabel="Job Seeker Portal" />

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-14 flex items-center justify-between px-6 border-b border-border-dark bg-surface-dark flex-shrink-0">
          <h2 className="text-sm font-semibold text-white">
            {NAV_ITEMS.find(n => n.id === activeTab)?.label}
          </h2>
          <span className="text-xs text-text-muted bg-surface-card px-3 py-1.5 rounded-lg border border-border-dark">
            Applicant Portal
          </span>
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          {activeTab === 'jobs'         && <JobRecommendations />}
          {activeTab === 'applications' && <ApplicationTracking />}
          {activeTab === 'resumes'      && <ResumeManager />}
          {activeTab === 'profile'      && <ProfileManagement />}
        </main>
      </div>
    </div>
  );
}
