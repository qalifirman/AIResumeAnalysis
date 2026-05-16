import { useState, useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import { useAuth } from '../../contexts/AuthContext';
import { apiGetApplications, apiGetJobs } from '../../api';
import { supabaseUrl, publicAnonKey } from '../../utils/supabase/info';
import type { Application, Job } from '../../types';

const supabase = createClient(supabaseUrl, publicAnonKey);

interface Notification {
  id: string;
  icon: string;
  iconColor: string;
  iconBg: string;
  title: string;
  body: string;
  time: string;
  read: boolean;
  navigateTo?: string; // tab id to navigate when clicked
}

interface NotificationDropdownProps {
  role: 'hr' | 'applicant';
  onNavigate?: (tab: string) => void;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs !== 1 ? 's' : ''} ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'Yesterday';
  return `${days} days ago`;
}

function buildApplicantNotifications(apps: Application[]): Notification[] {
  const notes: Notification[] = [];

  const shortlisted = apps.filter(a => a.status === 'shortlisted');
  const underReview = apps.filter(a => a.status === 'under_review');
  const rejected    = apps.filter(a => a.status === 'rejected');
  const applied     = apps.filter(a => a.status === 'applied');

  if (shortlisted.length > 0) {
    const latest = shortlisted.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
    notes.push({
      id: 'shortlisted',
      icon: 'thumb_up',
      iconColor: 'text-green-400',
      iconBg: 'bg-green-500/10',
      title: shortlisted.length === 1
        ? `You were shortlisted for "${latest.job_title || 'a position'}"!`
        : `You have been shortlisted for ${shortlisted.length} positions!`,
      body: 'Congratulations — a recruiter has shortlisted your application. Tap to view details.',
      time: 'Status updated',
      read: false,
      navigateTo: 'applications',
    });
  }

  if (underReview.length > 0) {
    const latest = underReview.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
    notes.push({
      id: 'under_review',
      icon: 'manage_search',
      iconColor: 'text-yellow-400',
      iconBg: 'bg-yellow-500/10',
      title: `${underReview.length} application${underReview.length !== 1 ? 's' : ''} under review`,
      body: `Your application for "${latest.job_title || 'a position'}" is being reviewed by the hiring team.`,
      time: 'Status updated',
      read: false,
      navigateTo: 'applications',
    });
  }

  if (rejected.length > 0) {
    const latest = rejected.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
    notes.push({
      id: 'rejected',
      icon: 'cancel',
      iconColor: 'text-red-400',
      iconBg: 'bg-red-500/10',
      title: `Application update for "${latest.job_title || 'a position'}"`,
      body: 'We regret to inform you that your application was not selected. Keep applying — more opportunities await.',
      time: 'Status updated',
      read: false,
      navigateTo: 'applications',
    });
  }

  if (applied.length > 0) {
    const latest = applied.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
    notes.push({
      id: 'applied',
      icon: 'send',
      iconColor: 'text-blue-400',
      iconBg: 'bg-blue-500/10',
      title: `${applied.length} application${applied.length !== 1 ? 's' : ''} submitted`,
      body: `Your most recent application was for "${latest.job_title || 'a position'}". We'll notify you of any updates.`,
      time: timeAgo(latest.created_at),
      read: false,
      navigateTo: 'applications',
    });
  }

  if (apps.length === 0) {
    notes.push({
      id: 'tip-apply',
      icon: 'tips_and_updates',
      iconColor: 'text-amber-400',
      iconBg: 'bg-amber-500/10',
      title: 'Start your job search',
      body: 'Browse AI-matched jobs and apply to get started. Upload your resume first to unlock match scores.',
      time: 'Now',
      read: false,
      navigateTo: 'jobs',
    });
  }

  return notes;
}

function buildHRNotifications(apps: Application[], jobs: Job[]): Notification[] {
  const notes: Notification[] = [];

  const newApps = apps.filter(a => a.status === 'applied');
  const staleDays3 = apps.filter(a => {
    const days = (Date.now() - new Date(a.created_at).getTime()) / 86400000;
    return days >= 3 && a.status === 'applied';
  });
  const activeJobs = jobs.filter(j => j.status === 'active');

  if (newApps.length > 0) {
    const latest = newApps.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
    notes.push({
      id: 'new-apps',
      icon: 'person_add',
      iconColor: 'text-violet-400',
      iconBg: 'bg-primary/15',
      title: `${newApps.length} new application${newApps.length !== 1 ? 's' : ''} awaiting review`,
      body: `Latest: ${latest.applicant_name || 'An applicant'} applied for "${latest.job_title || 'a position'}".`,
      time: timeAgo(latest.created_at),
      read: false,
      navigateTo: 'candidates',
    });
  }

  if (staleDays3.length > 0) {
    notes.push({
      id: 'stale',
      icon: 'warning',
      iconColor: 'text-amber-400',
      iconBg: 'bg-amber-500/10',
      title: `${staleDays3.length} candidate${staleDays3.length !== 1 ? 's' : ''} waiting over 3 days`,
      body: 'Several candidates have been in "Applied" status for more than 3 days. Consider reviewing them.',
      time: '3+ days',
      read: false,
      navigateTo: 'candidates',
    });
  }

  if (activeJobs.length > 0) {
    const newest = activeJobs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
    notes.push({
      id: 'active-jobs',
      icon: 'check_circle',
      iconColor: 'text-green-400',
      iconBg: 'bg-green-500/10',
      title: `${activeJobs.length} active job posting${activeJobs.length !== 1 ? 's' : ''}`,
      body: `"${newest.title}" is live and accepting applications.`,
      time: timeAgo(newest.created_at),
      read: false,
      navigateTo: 'jobs',
    });
  }

  if (apps.length === 0 && jobs.length === 0) {
    notes.push({
      id: 'tip-post',
      icon: 'tips_and_updates',
      iconColor: 'text-blue-400',
      iconBg: 'bg-blue-500/10',
      title: 'Post your first job',
      body: 'Create a job posting to start receiving AI-scored applications from candidates.',
      time: 'Now',
      read: false,
      navigateTo: 'jobs',
    });
  }

  return notes;
}

export function NotificationDropdown({ role, onNavigate }: NotificationDropdownProps) {
  const { accessToken, user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const ref = useRef<HTMLDivElement>(null);

  // Persist read state per user+role in localStorage
  const storageKey = `notif-read-${role}-${user?.id ?? 'anon'}`;

  const loadReadIds = (): Set<string> => {
    try {
      const raw = localStorage.getItem(storageKey);
      return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
    } catch { return new Set(); }
  };

  const saveReadIds = (ids: Set<string>) => {
    try { localStorage.setItem(storageKey, JSON.stringify([...ids])); } catch {}
  };

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    setLoading(true);

    const load = async () => {
      try {
        let built: Notification[] = [];
        if (role === 'applicant') {
          const apps = await apiGetApplications(accessToken);
          built = buildApplicantNotifications(apps);
        } else {
          const [apps, jobs] = await Promise.all([
            apiGetApplications(accessToken),
            apiGetJobs(accessToken),
          ]);
          built = buildHRNotifications(apps, jobs);
        }

        if (!cancelled) {
          // Restore persisted read state
          const readIds = loadReadIds();
          setNotifications(built.map(n => ({ ...n, read: readIds.has(n.id) })));
        }
      } catch {
        // notifications are non-critical — silently fail
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();

    // Realtime: re-fetch when applications table changes
    const channel = supabase
      .channel(`notif-${role}-${user?.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'applications' }, () => {
        if (!cancelled) load();
      })
      .subscribe();

    return () => { cancelled = true; supabase.removeChannel(channel); };
  }, [accessToken, role]);

  const unreadCount = notifications.filter(n => !n.read).length;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const markAllRead = () => {
    setNotifications(ns => {
      const updated = ns.map(n => ({ ...n, read: true }));
      saveReadIds(new Set(updated.map(n => n.id)));
      return updated;
    });
  };

  const handleClick = (n: Notification) => {
    // Mark as read and persist
    setNotifications(ns => {
      const updated = ns.map(x => x.id === n.id ? { ...x, read: true } : x);
      saveReadIds(new Set(updated.filter(x => x.read).map(x => x.id)));
      return updated;
    });

    // Navigate if a target tab is defined
    if (n.navigateTo && onNavigate) {
      onNavigate(n.navigateTo);
      setOpen(false);
    }
  };

  return (
    <div ref={ref} className="relative">
      {/* Bell button */}
      <button
        onClick={() => setOpen(o => !o)}
        className="relative p-2 text-text-muted hover:text-white rounded-xl hover:bg-surface-hover transition-colors"
        title="Notifications"
      >
        <span className="material-symbols-outlined">notifications</span>
        {!loading && unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 min-w-[16px] h-4 flex items-center justify-center rounded-full bg-red-500 border border-surface-dark text-[9px] font-bold text-white px-0.5">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-surface-dark border border-border-dark rounded-2xl shadow-card z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border-dark">
            <div>
              <h3 className="text-sm font-bold text-white">Notifications</h3>
              {!loading && unreadCount > 0 && (
                <p className="text-xs text-text-muted">{unreadCount} unread</p>
              )}
            </div>
            {!loading && unreadCount > 0 && (
              <button onClick={markAllRead} className="text-xs text-primary hover:underline font-medium">
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-80 overflow-y-auto divide-y divide-border-dark/50">
            {loading ? (
              <div className="px-4 py-6 flex items-center justify-center gap-2 text-text-muted text-xs">
                <span className="material-symbols-outlined animate-spin ms-sm">refresh</span>
                Loading…
              </div>
            ) : notifications.length === 0 ? (
              <div className="px-4 py-6 text-center text-xs text-text-muted">
                No notifications yet
              </div>
            ) : notifications.map(n => (
              <button
                key={n.id}
                onClick={() => handleClick(n)}
                className={`w-full text-left flex gap-3 px-4 py-3 hover:bg-surface-hover transition-colors ${!n.read ? 'bg-primary/5' : ''}`}
              >
                <div className={`size-9 rounded-full ${n.iconBg} flex items-center justify-center flex-shrink-0 mt-0.5`}>
                  <span className={`material-symbols-outlined ms-sm ${n.iconColor}`}>{n.icon}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-1">
                    <p className="text-xs font-semibold text-white leading-tight">{n.title}</p>
                    {!n.read && <span className="size-1.5 rounded-full bg-primary flex-shrink-0 mt-1" />}
                  </div>
                  <p className="text-xs text-text-muted mt-0.5 leading-snug line-clamp-2">{n.body}</p>
                  <div className="flex items-center gap-1 mt-1">
                    <p className="text-[10px] text-text-muted/70">{n.time}</p>
                    {n.navigateTo && onNavigate && (
                      <span className="text-[10px] text-primary/70">· tap to view</span>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* Footer */}
          <div className="px-4 py-2.5 border-t border-border-dark text-center">
            <span className="text-xs text-text-muted">
              {loading ? 'Fetching updates…' : `Based on real activity · ${notifications.length} item${notifications.length !== 1 ? 's' : ''}`}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
