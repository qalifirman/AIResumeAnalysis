import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { Toaster, toast } from 'sonner';
import { supabaseUrl, publicAnonKey } from './utils/supabase/info';

// Apply saved theme before first render to avoid flash
const savedTheme = (() => { try { return localStorage.getItem('theme') || 'dark'; } catch { return 'dark'; } })();
document.documentElement.classList.add(savedTheme);
import { LoginPage } from './components/auth/LoginPage';
import { HRDashboard } from './components/hr/HRDashboard';
import { ApplicantDashboard } from './components/applicant/ApplicantDashboard';
import { ErrorBoundary } from './components/ui/error-boundary';

const supabase = createClient(supabaseUrl, publicAnonKey);

function SessionTimeout() {
  const { user, logout } = useAuth();
  const [warnShown, setWarnShown] = useState(false);

  useEffect(() => {
    if (!user) return;
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'TOKEN_REFRESHED') setWarnShown(false);
      if (session?.expires_at) {
        const msLeft = session.expires_at * 1000 - Date.now();
        const warnAt = msLeft - 5 * 60 * 1000;
        if (warnAt > 0 && !warnShown) {
          const timer = setTimeout(() => {
            if (!warnShown) {
              setWarnShown(true);
              toast.warning('Your session expires in 5 minutes. Save your work.', {
                duration: 30000,
                action: { label: 'Logout', onClick: logout },
              });
            }
          }, warnAt);
          return () => clearTimeout(timer);
        }
      }
    });
    return () => subscription.unsubscribe();
  }, [user?.id]);

  return null;
}

function AppContent() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg-dark">
        <div className="flex flex-col items-center gap-4">
          <div className="size-12 rounded-2xl bg-primary/20 border border-primary/30 flex items-center justify-center">
            <span className="material-symbols-outlined fill text-primary animate-pulse ms-lg">psychology</span>
          </div>
          <p className="text-text-muted text-sm">Loading JobMatch AI…</p>
        </div>
      </div>
    );
  }

  if (!user) return <LoginPage />;
  if (user.role === 'hr') return <ErrorBoundary><HRDashboard /></ErrorBoundary>;
  return <ErrorBoundary><ApplicantDashboard /></ErrorBoundary>;
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <SessionTimeout />
        <AppContent />
        <Toaster position="bottom-right" richColors theme="dark" />
      </AuthProvider>
    </ThemeProvider>
  );
}
