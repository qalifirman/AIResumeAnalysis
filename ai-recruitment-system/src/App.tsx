import React from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { LoginPage } from './components/auth/LoginPage';
import { HRDashboard } from './components/hr/HRDashboard';
import { ApplicantDashboard } from './components/applicant/ApplicantDashboard';

function AppContent() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg-dark">
        <div className="flex flex-col items-center gap-4">
          <div className="size-12 rounded-2xl bg-primary/20 border border-primary/30 flex items-center justify-center">
            <span className="material-symbols-outlined fill text-primary animate-pulse ms-lg">psychology</span>
          </div>
          <p className="text-text-muted text-sm">Loading ResumeAI…</p>
        </div>
      </div>
    );
  }

  if (!user) return <LoginPage />;
  if (user.role === 'hr') return <HRDashboard />;
  return <ApplicantDashboard />;
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
