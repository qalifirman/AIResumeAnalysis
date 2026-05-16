import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { useAuth } from '../../contexts/AuthContext';
import { apiGetJobs, apiGetApplications, apiUpdateApplicationStatus, apiScheduleInterview, apiGenerateInterviewQuestions, apiSaveCandidateNote } from '../../api';
import type { Job, Application, ApplicationStatus } from '../../types';
import { DndContext, DragEndEvent, closestCenter, useDraggable, useDroppable } from '@dnd-kit/core';
import { useSwipeable } from 'react-swipeable';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function initials(name?: string) {
  return (name || 'U').split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
}

function scoreBadge(score: number) {
  const pct = Math.round(score * 100);
  if (pct >= 80) return <span className="badge-top">{pct}%</span>;
  if (pct >= 60) return <span className="badge-strong">{pct}%</span>;
  if (pct >= 40) return <span className="badge-medium">{pct}%</span>;
  return <span className="badge-low">{pct}%</span>;
}

function statusBadge(s: ApplicationStatus) {
  const cls: Record<ApplicationStatus, string> = {
    applied: 'status-applied', under_review: 'status-under_review',
    shortlisted: 'status-shortlisted', rejected: 'status-rejected',
  };
  const labels: Record<ApplicationStatus, string> = {
    applied: 'Applied', under_review: 'Under Review',
    shortlisted: 'Shortlisted', rejected: 'Rejected',
  };
  return <span className={cls[s]}>{labels[s]}</span>;
}

/** Circular SVG ring for the match score */
function ScoreRing({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const r = 40;
  const circ = 2 * Math.PI * r;
  const filled = (pct / 100) * circ;
  const color = pct >= 80 ? '#8b5cf6' : pct >= 60 ? '#22c55e' : pct >= 40 ? '#eab308' : '#ef4444';
  return (
    <div className="relative flex items-center justify-center size-24 flex-shrink-0">
      <svg className="absolute inset-0 -rotate-90" width="96" height="96" viewBox="0 0 96 96">
        <circle cx="48" cy="48" r={r} fill="none" stroke="rgb(var(--color-surface-hover))" strokeWidth="8" />
        <circle cx="48" cy="48" r={r} fill="none" stroke={color} strokeWidth="8"
          strokeLinecap="round" strokeDasharray={`${filled} ${circ}`}
          style={{ transition: 'stroke-dasharray 0.6s ease' }} />
      </svg>
      <div className="flex flex-col items-center">
        <span className="text-xl font-black text-white leading-none">{pct}%</span>
        <span className="text-[10px] text-text-muted mt-0.5">match</span>
      </div>
    </div>
  );
}

function SkillBar({ label, value, icon }: { label: string; value: number; icon: string }) {
  const pct = Math.round((value || 0) * 100);
  const barColor = pct >= 80 ? 'bg-violet-500' : pct >= 60 ? 'bg-green-500' : pct >= 40 ? 'bg-yellow-500' : 'bg-red-500';
  return (
    <div>
      <div className="flex items-center justify-between text-sm mb-1.5">
        <span className="flex items-center gap-1.5 text-text-muted">
          <span className="material-symbols-outlined ms-sm">{icon}</span>{label}
        </span>
        <span className="font-bold text-white">{pct}%</span>
      </div>
      <div className="h-2 bg-surface-hover rounded-full overflow-hidden">
        <div className={`h-full ${barColor} rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ─── Swipeable candidate list row ────────────────────────────────────────────

function SwipeableRow({ onSwipeLeft, onSwipeRight, children }: {
  onSwipeLeft: () => void; onSwipeRight: () => void; children: React.ReactNode;
}) {
  const handlers = useSwipeable({
    onSwipedLeft: () => onSwipeLeft(),
    onSwipedRight: () => onSwipeRight(),
    trackMouse: false,
    delta: 60,
    preventScrollOnSwipe: true,
  });
  return <div {...handlers}>{children}</div>;
}

// ─── Kanban DnD components ────────────────────────────────────────────────────

function KanbanCard({ app, blindMode, idx, isStale, onSelect }: {
  app: Application; blindMode: boolean; idx: number;
  isStale: (a: Application) => boolean; onSelect: (a: Application) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: app.id });
  const style = transform ? { transform: `translate3d(${transform.x}px,${transform.y}px,0)`, zIndex: 50 } : undefined;
  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes}
      className={`bg-surface-card border border-border-dark rounded-xl p-3 cursor-grab active:cursor-grabbing hover:border-primary/50 transition-colors ${isDragging ? 'opacity-50 shadow-glow' : ''}`}
      onClick={() => !isDragging && onSelect(app)}>
      <div className="flex items-center gap-2 mb-2">
        {blindMode ? (
          <div className="size-8 rounded-full bg-surface-hover border border-border-dark flex items-center justify-center text-text-muted flex-shrink-0">
            <span className="material-symbols-outlined text-[16px]">person</span>
          </div>
        ) : app.applicant_avatar_url ? (
          <img src={app.applicant_avatar_url} alt="" className="size-8 rounded-full object-cover flex-shrink-0" />
        ) : (
          <div className="size-8 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-xs font-bold text-primary flex-shrink-0">
            {initials(app.applicant_name)}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white truncate">
            {blindMode ? `Applicant #${idx + 1}` : (app.applicant_name || 'Unknown')}
          </p>
          <p className="text-xs text-text-muted truncate">{app.job_title}</p>
        </div>
      </div>
      <div className="flex items-center justify-between">
        {scoreBadge(app.match_score)}
        {isStale(app) && (
          <span className="flex items-center gap-0.5 text-[10px] font-bold text-orange-400">
            <span className="material-symbols-outlined" style={{ fontSize: 11 }}>warning</span>Stale
          </span>
        )}
        <span className="text-[10px] text-text-muted">
          {new Date(app.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </span>
      </div>
    </div>
  );
}

function KanbanColumn({ col, colApps, blindMode, isStale, onSelect }: {
  col: { status: ApplicationStatus; label: string; color: string; bg: string };
  colApps: Application[]; blindMode: boolean;
  isStale: (a: Application) => boolean; onSelect: (a: Application) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: col.status });
  return (
    <div className="flex flex-col gap-3">
      <div className={`flex items-center justify-between px-3 py-2 rounded-xl border ${col.bg}`}>
        <span className={`text-xs font-bold uppercase tracking-wider ${col.color}`}>{col.label}</span>
        <span className={`text-xs font-bold ${col.color} bg-white/10 px-2 py-0.5 rounded-full`}>{colApps.length}</span>
      </div>
      <div ref={setNodeRef} className={`flex flex-col gap-2 min-h-[100px] rounded-xl transition-colors ${isOver ? 'bg-primary/5 ring-1 ring-primary/30' : ''}`}>
        {colApps.map((app, idx) => (
          <KanbanCard key={app.id} app={app} blindMode={blindMode} idx={idx} isStale={isStale} onSelect={onSelect} />
        ))}
        {colApps.length === 0 && (
          <div className="flex-1 border-2 border-dashed border-border-dark rounded-xl p-4 text-center text-xs text-text-muted">
            Drop here
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface CandidateReviewProps {
  /** Search string forwarded from the header search bar */
  externalSearch?: string;
}

type CandidateSortMode = 'date_match' | 'match' | 'newest';

export function CandidateReview({ externalSearch = '' }: CandidateReviewProps) {
  const { accessToken } = useAuth();
  const [apps, setApps] = useState<Application[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [jobFilter, setJobFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortMode, setSortMode] = useState<CandidateSortMode>('date_match');
  const [internalSearch, setInternalSearch] = useState('');
  const [selected, setSelected] = useState<Application | null>(null);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState('');
  const [blindMode, setBlindMode] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('list');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkUpdating, setBulkUpdating] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [notesSaved, setNotesSaved] = useState<Record<string, string>>({});
  const [interviewDates, setInterviewDates] = useState<Record<string, string>>({});
  const [schedulingInterview, setSchedulingInterview] = useState(false);
  const [savingNote, setSavingNote] = useState(false);

  // Sync external search from header into internal state
  useEffect(() => { setInternalSearch(externalSearch); }, [externalSearch]);

  // Load saved note when selected candidate changes
  useEffect(() => { setNoteText(notesSaved[selected?.id ?? ''] ?? ''); }, [selected?.id]);

  useEffect(() => { load(); }, []);

  const load = async () => {
    if (!accessToken) return;
    try {
      const [j, a] = await Promise.all([apiGetJobs(accessToken), apiGetApplications(accessToken)]);
      setJobs(j);
      setApps(a.sort((x, y) => y.match_score - x.match_score));
      setNotesSaved(Object.fromEntries(a.map(app => [app.id, app.private_note || ''])));
      setInterviewDates(Object.fromEntries(a.filter(app => app.interview_at).map(app => [app.id, app.interview_at as string])));
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  const updateStatus = async (id: string, status: ApplicationStatus) => {
    if (!accessToken) return;
    setUpdating(true);
    try {
      await apiUpdateApplicationStatus(accessToken, id, status);
      setApps(as => as.map(a => a.id === id ? { ...a, status } : a));
      if (selected?.id === id) setSelected(s => s ? { ...s, status } : null);
      toast.success(`Status updated to "${status.replace('_', ' ')}".`);
    } catch (e: any) { toast.error(e.message); }
    finally { setUpdating(false); }
  };

  const handleBulkUpdate = async (status: ApplicationStatus) => {
    if (!accessToken || selectedIds.size === 0) return;
    setBulkUpdating(true);
    try {
      await Promise.all([...selectedIds].map(id => apiUpdateApplicationStatus(accessToken, id, status)));
      setApps(as => as.map(a => selectedIds.has(a.id) ? { ...a, status } : a));
      if (selected && selectedIds.has(selected.id)) setSelected(s => s ? { ...s, status } : null);
      toast.success(`${selectedIds.size} candidate${selectedIds.size !== 1 ? 's' : ''} updated to "${status.replace('_', ' ')}".`);
      setSelectedIds(new Set());
    } catch (e: any) { toast.error(e.message); }
    finally { setBulkUpdating(false); }
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filtered.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filtered.map(a => a.id)));
  };

  const exportCSV = () => {
    const headers = ['Name', 'Email', 'Job Title', 'Status', 'Match Score', 'Years Experience', 'Applied Date'];
    const rows = filtered.map(a => [
      a.applicant_name || '', a.applicant_email || '', a.job_title || '', a.status,
      `${Math.round(a.match_score * 100)}%`, String(a.years_of_experience || 0),
      new Date(a.created_at).toLocaleDateString(),
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'candidates.csv'; a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${filtered.length} candidates to CSV.`);
  };

  const copyEmailTemplate = (template: string) => {
    navigator.clipboard.writeText(template);
    toast.success('Email template copied to clipboard.');
  };

  const isStale = (app: Application) =>
    app.status === 'under_review' &&
    Date.now() - new Date(app.created_at).getTime() > 7 * 24 * 60 * 60 * 1000;

  const scheduleInterview = async (id: string, date: string) => {
    if (!accessToken) return;
    setSchedulingInterview(true);
    try {
      await apiScheduleInterview(accessToken, id, date || null);
      setInterviewDates(d => ({ ...d, [id]: date }));
      setApps(as => as.map(a => a.id === id ? { ...a, interview_at: date || null } : a));
      if (selected?.id === id) setSelected(s => s ? { ...s, interview_at: date || null } : null);
      toast.success(date ? `Interview scheduled for ${new Date(date).toLocaleString()}.` : 'Interview date cleared.');
    } catch (e: any) { toast.error(e.message); }
    finally { setSchedulingInterview(false); }
  };

  const saveNote = async (id: string) => {
    if (!accessToken) return;
    setSavingNote(true);
    try {
      const saved = await apiSaveCandidateNote(accessToken, id, noteText);
      setNotesSaved(n => ({ ...n, [id]: saved.note }));
      setApps(as => as.map(a => a.id === id ? { ...a, private_note: saved.note, private_note_updated_at: saved.updated_at } : a));
      if (selected?.id === id) setSelected(s => s ? { ...s, private_note: saved.note, private_note_updated_at: saved.updated_at } : null);
      toast.success('Note saved.');
    } catch (e: any) { toast.error(e.message); }
    finally { setSavingNote(false); }
  };

  const search = internalSearch.toLowerCase();
  const filtered = apps.filter(a => {
    if (jobFilter !== 'all' && a.job_id !== jobFilter) return false;
    if (statusFilter !== 'all' && a.status !== statusFilter) return false;
    if (search && !(a.applicant_name || '').toLowerCase().includes(search) &&
        !(a.applicant_email || '').toLowerCase().includes(search) &&
        !(a.job_title || '').toLowerCase().includes(search)) return false;
    return true;
  }).sort((a, b) => {
    const dateA = new Date(a.created_at).getTime() || 0;
    const dateB = new Date(b.created_at).getTime() || 0;
    if (sortMode === 'match') return (b.match_score - a.match_score) || (dateB - dateA);
    if (sortMode === 'newest') return (dateB - dateA) || (b.match_score - a.match_score);
    const dayA = new Date(a.created_at).toDateString();
    const dayB = new Date(b.created_at).toDateString();
    if (dayA !== dayB) return dateB - dateA;
    return (b.match_score - a.match_score) || (dateB - dateA);
  });

  if (loading) return <LoadingSkeleton />;

  if (viewMode === 'kanban') {
    const columns: { status: ApplicationStatus; label: string; color: string; bg: string }[] = [
      { status: 'applied',      label: 'Applied',      color: 'text-blue-400',   bg: 'bg-blue-500/10 border-blue-500/25' },
      { status: 'under_review', label: 'Under Review', color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/25' },
      { status: 'shortlisted',  label: 'Shortlisted',  color: 'text-green-400',  bg: 'bg-green-500/10 border-green-500/25' },
      { status: 'rejected',     label: 'Rejected',     color: 'text-red-400',    bg: 'bg-red-500/10 border-red-500/25' },
    ];

    const handleDragEnd = async (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || !accessToken) return;
      const appId = active.id as string;
      const newStatus = over.id as ApplicationStatus;
      const app = apps.find(a => a.id === appId);
      if (!app || app.status === newStatus) return;
      setApps(as => as.map(a => a.id === appId ? { ...a, status: newStatus } : a));
      try {
        await apiUpdateApplicationStatus(accessToken, appId, newStatus);
        toast.success(`Moved to ${newStatus.replace('_', ' ')}`);
      } catch (e: any) {
        setApps(as => as.map(a => a.id === appId ? { ...a, status: app.status } : a));
        toast.error(e.message);
      }
    };

    return (
      <div className="max-w-7xl mx-auto w-full">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="page-title">Pipeline Board</h2>
            <p className="page-subtitle">{apps.length} total candidates · drag cards to change status</p>
          </div>
          <button onClick={() => setViewMode('list')} aria-label="Switch to list view"
            className="flex items-center gap-2 px-4 py-2 bg-surface-card border border-border-dark rounded-xl text-sm text-white hover:bg-surface-hover transition-colors">
            <span className="material-symbols-outlined ms-sm">list</span>List View
          </button>
        </div>
        <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
            {columns.map(col => {
              const colApps = apps.filter(a => a.status === col.status);
              return (
                <KanbanColumn key={col.status} col={col} colApps={colApps} blindMode={blindMode}
                  isStale={isStale} onSelect={app => { setViewMode('list'); setSelected(app); }} />
              );
            })}
          </div>
        </DndContext>
      </div>
    );
  }

  return (
    <div className="flex gap-5 h-[calc(100vh-8rem)] max-w-7xl mx-auto w-full">

      {/* ── Left panel ── */}
      <aside className="w-80 xl:w-96 flex-shrink-0 flex flex-col gap-3 overflow-hidden">
        <div className="flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-lg font-bold text-white">Candidate Ranking</h2>
            <p className="text-xs text-text-muted">{filtered.length} candidate{filtered.length !== 1 ? 's' : ''}</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={exportCSV} title="Export to CSV" aria-label="Export candidates to CSV"
              className="size-8 flex items-center justify-center rounded-lg text-text-muted hover:bg-surface-hover hover:text-white transition-colors">
              <span className="material-symbols-outlined ms-sm">download</span>
            </button>
            <button onClick={() => setViewMode(v => v === 'list' ? 'kanban' : 'list')} title={viewMode === 'list' ? 'Switch to Kanban view' : 'Switch to List view'} aria-label={viewMode === 'list' ? 'Switch to Kanban view' : 'Switch to List view'}
              className={`size-8 flex items-center justify-center rounded-lg transition-colors ${'kanban' === (viewMode as string) ? 'bg-primary/15 text-primary' : 'text-text-muted hover:bg-surface-hover hover:text-white'}`}>
              <span className="material-symbols-outlined ms-sm">{viewMode === 'list' ? 'view_kanban' : 'list'}</span>
            </button>
            <button onClick={() => setBlindMode(v => !v)} title={blindMode ? 'Disable blind mode' : 'Enable blind screening mode'} aria-label={blindMode ? 'Disable blind screening mode' : 'Enable blind screening mode'}
              className={`size-8 flex items-center justify-center rounded-lg transition-colors ${blindMode ? 'bg-primary/15 text-primary' : 'text-text-muted hover:bg-surface-hover hover:text-white'}`}>
              <span className="material-symbols-outlined ms-sm">{blindMode ? 'visibility_off' : 'visibility'}</span>
            </button>
          </div>
        </div>
        {blindMode && (
          <div className="flex items-center gap-2 px-3 py-2 bg-primary/10 border border-primary/25 rounded-lg text-xs text-primary flex-shrink-0">
            <span className="material-symbols-outlined ms-sm">visibility_off</span>
            Blind screening ON — names and photos are hidden
          </div>
        )}

        {error && (
          <div className="p-3 bg-red-500/10 border border-red-500/25 rounded-xl text-xs text-red-400 flex items-center gap-2 flex-shrink-0">
            <span className="material-symbols-outlined ms-sm">error</span>{error}
            <button onClick={() => setError('')} className="ml-auto text-red-400 hover:text-white">
              <span className="material-symbols-outlined ms-sm">close</span>
            </button>
          </div>
        )}

        {/* Local search */}
        <div className="relative flex-shrink-0">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined ms-sm text-text-muted">search</span>
          <input className="input-dark pl-9 text-sm py-2.5" placeholder="Search candidates…"
            value={internalSearch} onChange={e => setInternalSearch(e.target.value)} />
        </div>

        {/* Filters */}
        <div className="flex gap-2 flex-shrink-0">
          <select className="input-dark flex-1 text-xs py-2" value={jobFilter} onChange={e => setJobFilter(e.target.value)}>
            <option value="all">All Jobs</option>
            {jobs.map(j => <option key={j.id} value={j.id}>{j.title}</option>)}
          </select>
          <select className="input-dark flex-1 text-xs py-2" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="all">All Status</option>
            <option value="applied">Applied</option>
            <option value="under_review">Under Review</option>
            <option value="shortlisted">Shortlisted</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>

        <select className="input-dark text-xs py-2 flex-shrink-0" value={sortMode} onChange={e => setSortMode(e.target.value as CandidateSortMode)}>
          <option value="date_match">Sort: Date + AI match</option>
          <option value="match">Sort: AI match only</option>
          <option value="newest">Sort: Newest first</option>
        </select>

        {/* Bulk action bar */}
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-2 p-2 bg-primary/10 border border-primary/25 rounded-lg flex-shrink-0">
            <span className="text-xs text-primary font-semibold flex-1">{selectedIds.size} selected</span>
            <button onClick={() => handleBulkUpdate('under_review')} disabled={bulkUpdating}
              className="text-xs px-2 py-1 rounded-md bg-yellow-500/15 text-yellow-400 hover:bg-yellow-500/25 border border-yellow-500/25 font-medium transition-colors">
              Mark Review
            </button>
            <button onClick={() => handleBulkUpdate('rejected')} disabled={bulkUpdating}
              className="text-xs px-2 py-1 rounded-md bg-red-500/15 text-red-400 hover:bg-red-500/25 border border-red-500/25 font-medium transition-colors">
              Reject All
            </button>
            <button onClick={() => setSelectedIds(new Set())}
              className="text-xs text-text-muted hover:text-white ml-1">Clear</button>
          </div>
        )}

        {/* Select all row */}
        {filtered.length > 0 && (
          <div className="flex items-center gap-2 flex-shrink-0">
            <input type="checkbox" id="select-all"
              checked={selectedIds.size === filtered.length && filtered.length > 0}
              onChange={toggleSelectAll}
              className="w-4 h-4 rounded accent-primary cursor-pointer" />
            <label htmlFor="select-all" className="text-xs text-text-muted cursor-pointer select-none">Select all</label>
          </div>
        )}

        {/* Candidate list */}
        <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-0">
          {filtered.length === 0 ? (
            <div className="card-dark p-8 text-center text-text-muted text-sm">
              <span className="material-symbols-outlined ms-lg block mb-2">person_search</span>
              No candidates match the current filters.
            </div>
          ) : filtered.map((app, idx) => {
            const stale = isStale(app);
            const isChecked = selectedIds.has(app.id);
            return (
              <SwipeableRow key={app.id}
                onSwipeRight={() => updateStatus(app.id, 'shortlisted')}
                onSwipeLeft={() => updateStatus(app.id, 'rejected')}>
              <div className={`relative rounded-xl border transition-all duration-200 group
                ${selected?.id === app.id
                  ? 'bg-primary/10 border-primary/50 shadow-glow'
                  : 'bg-surface-card border-border-dark hover:bg-surface-hover hover:border-border-mid'}`}>
                {selected?.id === app.id && <div className="absolute left-0 top-3 bottom-3 w-0.5 bg-primary rounded-r" />}
                <div className="flex items-center gap-2 p-4">
                  <input type="checkbox" checked={isChecked}
                    onChange={e => { e.stopPropagation(); setSelectedIds(s => { const n = new Set(s); isChecked ? n.delete(app.id) : n.add(app.id); return n; }); }}
                    className="w-4 h-4 rounded accent-primary cursor-pointer flex-shrink-0" />
                  <button className="flex-1 min-w-0 text-left" onClick={() => setSelected(app)}>
                    <div className="flex items-center gap-3">
                      <div className="text-xs font-bold text-text-muted w-5 text-center flex-shrink-0">{idx + 1}</div>
                      {blindMode ? (
                        <div className="size-10 rounded-full bg-surface-hover border border-border-dark flex items-center justify-center text-text-muted flex-shrink-0">
                          <span className="material-symbols-outlined text-[18px]">person</span>
                        </div>
                      ) : app.applicant_avatar_url ? (
                        <img src={app.applicant_avatar_url} alt={app.applicant_name || ''}
                          className={`size-10 rounded-full object-cover flex-shrink-0 border-2 ${selected?.id === app.id ? 'border-primary/50' : 'border-border-dark'}`} />
                      ) : (
                        <div className={`size-10 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0
                          ${selected?.id === app.id ? 'bg-primary/30 border border-primary/50 text-primary' : 'bg-surface-hover border border-border-dark text-text-muted'}`}>
                          {initials(app.applicant_name)}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1 mb-0.5">
                          <span className="font-semibold text-white text-sm truncate group-hover:text-primary transition-colors">
                            {blindMode ? `Applicant #${idx + 1}` : (app.applicant_name || 'Unknown')}
                          </span>
                          {scoreBadge(app.match_score)}
                        </div>
                        <div className="text-xs text-text-muted truncate mb-1.5">{app.job_title || 'Unknown position'}</div>
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5">
                            {statusBadge(app.status)}
                            {stale && (
                              <span className="flex items-center gap-0.5 text-[10px] font-bold text-orange-400 bg-orange-500/15 border border-orange-500/25 px-1.5 py-0.5 rounded-full">
                                <span className="material-symbols-outlined" style={{ fontSize: 11 }}>warning</span>
                                Stale
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] text-text-muted flex items-center gap-1">
                            <span className="material-symbols-outlined text-[13px]">calendar_today</span>
                            {new Date(app.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </span>
                        </div>
                      </div>
                    </div>
                  </button>
                </div>
              </div>
              </SwipeableRow>
            );
          })}
        </div>
      </aside>

      {/* ── Right panel ── */}
      <div className="flex-1 overflow-y-auto min-w-0 pb-20">
        {!selected ? (
          <div className="h-full card-dark flex flex-col items-center justify-center text-center p-10">
            <div className="size-20 rounded-2xl bg-surface-hover flex items-center justify-center mb-4">
              <span className="material-symbols-outlined text-text-muted" style={{ fontSize: '36px' }}>person_search</span>
            </div>
            <h3 className="font-bold text-white text-lg mb-2">Select a Candidate</h3>
            <p className="text-sm text-text-muted max-w-xs">Click any candidate from the list to view their full profile, AI analysis, and skill assessment.</p>
          </div>
        ) : (
          <div className="space-y-5">
            {/* Header card */}
            <div className="bg-surface-card border border-border-dark rounded-xl p-6">
              <div className="flex items-start gap-5">
                {/* Avatar */}
                <div className="flex-shrink-0">
                  {blindMode ? (
                    <div className="size-16 rounded-full bg-surface-hover border-2 border-border-dark flex items-center justify-center text-text-muted">
                      <span className="material-symbols-outlined" style={{ fontSize: 32 }}>person</span>
                    </div>
                  ) : selected.applicant_avatar_url ? (
                    <img
                      src={selected.applicant_avatar_url}
                      alt={selected.applicant_name || 'Candidate'}
                      className="size-16 rounded-full object-cover border-2 border-primary/40"
                    />
                  ) : (
                    <div className="size-16 rounded-full bg-primary/20 border-2 border-primary/40 flex items-center justify-center text-xl font-bold text-primary">
                      {initials(selected.applicant_name)}
                    </div>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <h2 className="text-xl font-bold text-white">
                    {blindMode ? `Applicant #${filtered.indexOf(selected) + 1 || '—'}` : (selected.applicant_name || 'Unknown')}
                  </h2>
                  {!blindMode && selected.applicant_headline && (
                    <p className="text-sm text-primary font-medium mt-0.5">{selected.applicant_headline}</p>
                  )}
                  {!blindMode && <p className="text-sm text-text-muted mt-0.5">{selected.applicant_email}</p>}

                  {/* Contact details */}
                  {!blindMode && (selected.applicant_phone || selected.applicant_location || selected.applicant_linkedin) && (
                    <div className="flex flex-wrap items-center gap-3 mt-2">
                      {selected.applicant_phone && (
                        <span className="text-xs text-text-muted flex items-center gap-1">
                          <span className="material-symbols-outlined ms-sm">call</span>
                          {selected.applicant_phone}
                        </span>
                      )}
                      {selected.applicant_location && (
                        <span className="text-xs text-text-muted flex items-center gap-1">
                          <span className="material-symbols-outlined ms-sm">location_on</span>
                          {selected.applicant_location}
                        </span>
                      )}
                      {selected.applicant_linkedin && (
                        <a href={selected.applicant_linkedin} target="_blank" rel="noreferrer"
                          className="text-xs text-primary hover:text-white flex items-center gap-1 transition-colors">
                          <span className="material-symbols-outlined ms-sm">link</span>
                          Portfolio / LinkedIn
                        </a>
                      )}
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-2 mt-3">
                    {statusBadge(selected.status)}
                    {isStale(selected) && (
                      <span className="flex items-center gap-1 text-xs font-bold text-orange-400 bg-orange-500/15 border border-orange-500/25 px-2 py-0.5 rounded-full">
                        <span className="material-symbols-outlined ms-sm">warning</span>
                        Stale — {Math.floor((Date.now() - new Date(selected.created_at).getTime()) / 86_400_000)}d in review
                      </span>
                    )}
                    <span className="text-xs text-text-muted flex items-center gap-1">
                      <span className="material-symbols-outlined ms-sm">calendar_today</span>
                      Applied {new Date(selected.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                    {selected.years_of_experience > 0 && (
                      <span className="text-xs text-text-muted flex items-center gap-1">
                        <span className="material-symbols-outlined ms-sm">work_history</span>
                        {selected.years_of_experience} yr{selected.years_of_experience !== 1 ? 's' : ''} exp.
                      </span>
                    )}
                    <span className="text-xs text-text-muted flex items-center gap-1">
                      <span className="material-symbols-outlined ms-sm">business_center</span>
                      {selected.job_title || 'Unknown role'}
                    </span>
                  </div>
                </div>
                <ScoreRing score={selected.match_score} />
              </div>

              {/* Bio */}
              {selected.applicant_bio && (
                <div className="mt-4 pt-4 border-t border-border-dark">
                  <p className="text-sm text-slate-300 leading-relaxed">{selected.applicant_bio}</p>
                </div>
              )}
            </div>

            {/* AI Analysis */}
            {selected.explanation && (
              <div className="bg-surface-card border border-primary/30 rounded-xl p-6 relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/6 to-transparent pointer-events-none" />
                <div className="relative">
                <div className="flex items-center justify-between gap-2 mb-4">
                  <div className="flex items-center gap-2">
                    <div className="size-8 rounded-lg bg-primary/15 flex items-center justify-center">
                      <span className="material-symbols-outlined ms-sm text-primary">auto_awesome</span>
                    </div>
                    <h3 className="font-bold text-white">AI Analysis</h3>
                  </div>
                  <span className="flex items-center gap-1 text-[10px] font-bold text-primary bg-primary/10 border border-primary/30 px-2 py-0.5 rounded-full">
                    <span className="material-symbols-outlined" style={{ fontSize: 11 }}>smart_toy</span>
                    LLM-Generated
                  </span>
                </div>
                <p className="text-sm text-slate-200 leading-relaxed mb-4 italic border-l-2 border-primary/50 pl-4">
                  {selected.explanation}
                </p>

                {/* Key Highlights */}
                {((selected.matched_skills?.length ?? 0) + (selected.missing_skills?.length ?? 0)) > 0 && (
                  <div className="bg-surface-hover rounded-xl p-4 border border-border-dark">
                    <h4 className="text-xs font-bold text-text-muted uppercase tracking-wider mb-3">Key Highlights</h4>
                    <ul className="space-y-2.5">
                      {selected.matched_skills?.slice(0, 3).map(skill => (
                        <li key={skill} className="flex items-start gap-2 text-sm">
                          <span className="material-symbols-outlined text-green-400 flex-shrink-0" style={{ fontSize: 18 }}>check</span>
                          <span className="text-text-muted">Matches requirement: <span className="text-white font-medium">{skill}</span></span>
                        </li>
                      ))}
                      {selected.years_of_experience > 0 && (
                        <li className="flex items-start gap-2 text-sm">
                          <span className="material-symbols-outlined text-green-400 flex-shrink-0" style={{ fontSize: 18 }}>check</span>
                          <span className="text-text-muted"><span className="text-white font-medium">{selected.years_of_experience} years</span> of experience on record.</span>
                        </li>
                      )}
                      {selected.missing_skills?.slice(0, 2).map(skill => (
                        <li key={skill} className="flex items-start gap-2 text-sm">
                          <span className="material-symbols-outlined text-red-400 flex-shrink-0" style={{ fontSize: 18 }}>close</span>
                          <span className="text-text-muted">Missing skill: <span className="text-white font-medium">{skill}</span></span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                </div>
              </div>
            )}

            {/* Skill Gap */}
            <div className="bg-surface-card border border-border-dark rounded-xl p-6">
              <div className="flex items-center gap-2 mb-5">
                <div className="size-8 rounded-lg bg-purple-500/10 flex items-center justify-center">
                  <span className="material-symbols-outlined ms-sm text-purple-400">psychology</span>
                </div>
                <h3 className="font-bold text-white">Skill Gap Analysis</h3>
              </div>
              <div className="space-y-4 mb-6">
                <SkillBar label="Skill Match" value={selected.skill_match_score} icon="verified" />
                <SkillBar label="Content Similarity" value={selected.text_similarity} icon="article" />
                <SkillBar label="Overall Match" value={selected.match_score} icon="stars" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-green-400 uppercase tracking-wider mb-2">
                    <span className="material-symbols-outlined ms-sm">check_circle</span>
                    Matched ({(selected.matched_skills || []).length})
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {(selected.matched_skills || []).length === 0
                      ? <span className="text-xs text-text-muted">None detected</span>
                      : (selected.matched_skills || []).map(s => (
                        <span key={s} className="px-2 py-0.5 text-xs bg-green-500/10 text-green-400 border border-green-500/20 rounded-md">{s}</span>
                      ))}
                  </div>
                </div>
                <div>
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-red-400 uppercase tracking-wider mb-2">
                    <span className="material-symbols-outlined ms-sm">cancel</span>
                    Missing ({(selected.missing_skills || []).length})
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {(selected.missing_skills || []).length === 0
                      ? <span className="text-xs text-text-muted">None — great fit!</span>
                      : (selected.missing_skills || []).map(s => (
                        <span key={s} className="px-2 py-0.5 text-xs bg-red-500/10 text-red-400 border border-red-500/20 rounded-md">{s}</span>
                      ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Work Experience */}
            {(selected.resume_parsed_data?.workHistory?.length ?? 0) > 0 && (
              <div className="bg-surface-card border border-border-dark rounded-xl p-6">
                <div className="flex items-center gap-2 mb-4">
                  <div className="size-8 rounded-lg bg-indigo-500/10 flex items-center justify-center">
                    <span className="material-symbols-outlined ms-sm text-indigo-400">work</span>
                  </div>
                  <h3 className="font-bold text-white">Work Experience</h3>
                </div>
                <div className="space-y-4">
                  {selected.resume_parsed_data!.workHistory!.map((w, i) => (
                    <div key={i} className={`flex gap-4 ${i < selected.resume_parsed_data!.workHistory!.length - 1 ? 'pb-4 border-b border-border-dark' : ''}`}>
                      <div className="size-10 rounded-lg bg-indigo-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <span className="material-symbols-outlined text-indigo-400 text-[18px]">business</span>
                      </div>
                      <div>
                        <p className="text-white font-semibold text-sm">{w.title}</p>
                        <p className="text-text-muted text-sm">{w.company}</p>
                        {w.period && <p className="text-xs text-text-muted mt-0.5">{w.period}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Education */}
            {((selected.resume_parsed_data?.structuredEducation?.length ?? 0) > 0 ||
              (selected.resume_parsed_data?.education?.length ?? 0) > 0) && (
              <div className="bg-surface-card border border-border-dark rounded-xl p-6">
                <div className="flex items-center gap-2 mb-4">
                  <div className="size-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                    <span className="material-symbols-outlined ms-sm text-emerald-400">school</span>
                  </div>
                  <h3 className="font-bold text-white">Education</h3>
                </div>
                <div className="space-y-3">
                  {selected.resume_parsed_data?.structuredEducation?.length
                    ? selected.resume_parsed_data.structuredEducation.map((e, i) => (
                      <div key={i} className={`flex gap-4 ${i < (selected.resume_parsed_data?.structuredEducation?.length ?? 0) - 1 ? 'pb-3 border-b border-border-dark' : ''}`}>
                        <div className="size-10 rounded-lg bg-emerald-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <span className="material-symbols-outlined text-emerald-400 text-[18px]">school</span>
                        </div>
                        <div>
                          <p className="text-white font-semibold text-sm">{e.degree}</p>
                          <p className="text-text-muted text-sm">{e.institution}</p>
                          {e.year && <p className="text-xs text-text-muted mt-0.5">{e.year}</p>}
                        </div>
                      </div>
                    ))
                    : selected.resume_parsed_data?.education?.map((line, i) => (
                      <p key={i} className="text-sm text-slate-300">{line}</p>
                    ))
                  }
                </div>
              </div>
            )}

            {/* Resume file */}
            <div className="bg-surface-card border border-border-dark rounded-xl p-6">
              <div className="flex items-center gap-2 mb-4">
                <div className="size-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                  <span className="material-symbols-outlined ms-sm text-blue-400">description</span>
                </div>
                <h3 className="font-bold text-white">Resume File</h3>
              </div>
              {selected.resume_url ? (
                <a href={selected.resume_url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-3 p-4 bg-surface-hover rounded-xl border border-border-dark hover:border-primary/40 transition-colors group">
                  <div className="size-10 rounded-lg bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                    <span className="material-symbols-outlined text-blue-400">picture_as_pdf</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white group-hover:text-primary transition-colors">
                      {selected.resume_file_name || 'View Submitted Resume'}
                    </p>
                    <p className="text-xs text-text-muted">Click to open PDF in a new tab</p>
                  </div>
                  <span className="material-symbols-outlined ms-sm text-text-muted group-hover:text-primary transition-colors">open_in_new</span>
                </a>
              ) : (
                <div className="flex items-center gap-3 p-4 bg-surface-hover/50 rounded-xl border border-dashed border-border-dark">
                  <div className="size-10 rounded-lg bg-surface-hover flex items-center justify-center flex-shrink-0">
                    <span className="material-symbols-outlined text-text-muted">description</span>
                  </div>
                  <p className="text-sm text-text-muted">No resume on file for this candidate.</p>
                </div>
              )}
            </div>

            {/* Private Notes */}
            <div className="bg-surface-card border border-border-dark rounded-xl p-6">
              <div className="flex items-center gap-2 mb-4">
                <div className="size-8 rounded-lg bg-yellow-500/10 flex items-center justify-center">
                  <span className="material-symbols-outlined ms-sm text-yellow-400">sticky_note_2</span>
                </div>
                <h3 className="font-bold text-white">Private Notes</h3>
                <span className="text-xs text-text-muted ml-1">(HR only — not visible to candidate)</span>
              </div>
              <textarea
                value={noteText}
                onChange={e => setNoteText(e.target.value)}
                placeholder="Add private notes about this candidate…"
                rows={3}
                className="w-full bg-surface-hover border border-border-dark rounded-xl px-4 py-3 text-sm text-white placeholder-text-muted focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary resize-none transition-all"
              />
              <div className="flex items-center justify-between mt-3">
                {notesSaved[selected.id] && (
                  <p className="text-xs text-text-muted italic truncate pr-4">Last saved: {notesSaved[selected.id].slice(0, 60)}{notesSaved[selected.id].length > 60 ? '…' : ''}</p>
                )}
                <button
                  disabled={savingNote}
                  onClick={() => saveNote(selected.id)}
                  className="ml-auto flex items-center gap-1.5 px-3 py-1.5 bg-yellow-500/15 hover:bg-yellow-500/25 border border-yellow-500/25 text-yellow-400 text-xs font-semibold rounded-lg transition-colors">
                  <span className="material-symbols-outlined ms-sm">save</span>
                  {savingNote ? 'Saving...' : 'Save Note'}
                </button>
              </div>
            </div>

            {/* AI Interview Question Generator */}
            {((selected.matched_skills?.length ?? 0) + (selected.missing_skills?.length ?? 0)) > 0 && (
              <InterviewQuestions
                matchedSkills={selected.matched_skills || []}
                missingSkills={selected.missing_skills || []}
                jobTitle={selected.job_title || 'the role'}
                yearsExp={selected.years_of_experience || 0}
              />
            )}

            {/* Interview Scheduling */}
            {selected.status === 'shortlisted' && (
              <div className="bg-surface-card border border-border-dark rounded-xl p-6">
                <div className="flex items-center gap-2 mb-4">
                  <div className="size-8 rounded-lg bg-green-500/10 flex items-center justify-center">
                    <span className="material-symbols-outlined ms-sm text-green-400">event</span>
                  </div>
                  <h3 className="font-bold text-white">Schedule Interview</h3>
                </div>
                {interviewDates[selected.id] && (
                  <div className="mb-3 p-3 bg-green-500/10 border border-green-500/25 rounded-xl text-xs text-green-400 flex items-center gap-2">
                    <span className="material-symbols-outlined ms-sm">check_circle</span>
                    Scheduled: {new Date(interviewDates[selected.id]).toLocaleString()}
                  </div>
                )}
                <div className="flex gap-3">
                  <input type="datetime-local"
                    value={interviewDates[selected.id] || ''}
                    onChange={e => setInterviewDates(d => ({ ...d, [selected.id]: e.target.value }))}
                    className="flex-1 bg-surface-hover border border-border-dark rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                  />
                  <button
                    disabled={schedulingInterview || !interviewDates[selected.id]}
                    onClick={() => scheduleInterview(selected.id, interviewDates[selected.id] || '')}
                    className="px-4 py-2.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-colors flex items-center gap-1.5">
                    <span className="material-symbols-outlined ms-sm">save</span>
                    Set
                  </button>
                </div>
              </div>
            )}

            {/* Email Templates */}
            {!blindMode && (
              <div className="bg-surface-card border border-border-dark rounded-xl p-6">
                <div className="flex items-center gap-2 mb-4">
                  <div className="size-8 rounded-lg bg-teal-500/10 flex items-center justify-center">
                    <span className="material-symbols-outlined ms-sm text-teal-400">mail</span>
                  </div>
                  <h3 className="font-bold text-white">Email Templates</h3>
                  <span className="text-xs text-text-muted ml-1">Click to copy</span>
                </div>
                <div className="space-y-2">
                  {[
                    {
                      label: 'Shortlist Invitation',
                      icon: 'stars',
                      color: 'text-primary bg-primary/10 border-primary/25 hover:bg-primary/20',
                      template: `Subject: Exciting Update — ${selected.job_title || 'Position'} at [Company]\n\nDear ${selected.applicant_name || 'Applicant'},\n\nThank you for applying to the ${selected.job_title || 'position'} role at [Company]. After reviewing your application, we are pleased to inform you that you have been shortlisted for the next stage.\n\nWe will be in touch shortly to schedule an interview.\n\nBest regards,\n[HR Team]`,
                    },
                    {
                      label: 'Interview Invite',
                      icon: 'event',
                      color: 'text-green-400 bg-green-500/10 border-green-500/25 hover:bg-green-500/20',
                      template: `Subject: Interview Invitation — ${selected.job_title || 'Position'}\n\nDear ${selected.applicant_name || 'Applicant'},\n\nWe would like to invite you for an interview for the ${selected.job_title || 'position'} role.\n\nProposed time: [DATE AND TIME]\nFormat: [In-person / Video call]\nLocation/Link: [LOCATION OR LINK]\n\nPlease confirm your availability by replying to this email.\n\nBest regards,\n[HR Team]`,
                    },
                    {
                      label: 'Rejection',
                      icon: 'cancel',
                      color: 'text-red-400 bg-red-500/10 border-red-500/25 hover:bg-red-500/20',
                      template: `Subject: Your Application for ${selected.job_title || 'Position'}\n\nDear ${selected.applicant_name || 'Applicant'},\n\nThank you for your interest in the ${selected.job_title || 'position'} role at [Company] and for taking the time to apply.\n\nAfter careful consideration, we have decided to move forward with other candidates whose qualifications more closely match our current needs.\n\nWe wish you the best in your job search and hope you will consider us for future opportunities.\n\nBest regards,\n[HR Team]`,
                    },
                  ].map(t => (
                    <button key={t.label} onClick={() => copyEmailTemplate(t.template)}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-colors ${t.color}`}>
                      <span className="material-symbols-outlined ms-sm flex-shrink-0">{t.icon}</span>
                      <div className="flex-1">
                        <p className="text-sm font-medium">{t.label}</p>
                      </div>
                      <span className="material-symbols-outlined ms-sm text-current opacity-60 flex-shrink-0">content_copy</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Floating action bar ── */}
      {selected && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
          <div className="flex items-center gap-3 bg-surface-dark border border-border-dark rounded-2xl shadow-xl px-4 py-3">
            <span className="text-xs text-text-muted mr-1 hidden sm:block">Update:</span>
            {([
              { status: 'rejected'     as ApplicationStatus, label: 'Reject',      icon: 'cancel',   cls: 'hover:bg-red-500/15 hover:border-red-500/30 hover:text-red-400',     active: 'bg-red-500/20 border-red-500/40 text-red-400' },
              { status: 'under_review' as ApplicationStatus, label: 'Under Review',icon: 'schedule',  cls: 'hover:bg-yellow-500/15 hover:border-yellow-500/30 hover:text-yellow-400', active: 'bg-yellow-500/20 border-yellow-500/40 text-yellow-400' },
              { status: 'shortlisted'  as ApplicationStatus, label: 'Shortlist',   icon: 'stars',    cls: 'hover:bg-primary/20 hover:border-primary/50 hover:text-violet-300', active: 'bg-primary/25 border-primary/50 text-violet-300' },
            ]).map(btn => (
              <button key={btn.status}
                disabled={updating || selected.status === btn.status}
                onClick={() => updateStatus(selected.id, btn.status)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-all disabled:opacity-60
                  ${selected.status === btn.status
                    ? btn.active
                    : `bg-surface-hover border-border-dark text-text-muted ${btn.cls}`}`}>
                <span className="material-symbols-outlined ms-sm">{btn.icon}</span>
                {btn.label}
              </button>
            ))}
            {updating && <div className="size-4 border-2 border-primary border-t-transparent rounded-full animate-spin ml-1" />}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Interview Question Generator ────────────────────────────────────────────

export function generateQuestions(matchedSkills: string[], missingSkills: string[], jobTitle: string, yearsExp: number): string[] {
  if (matchedSkills.length + missingSkills.length + jobTitle.length + yearsExp >= 0) {
    throw new Error('Rule-based interview question generation is disabled. Use apiGenerateInterviewQuestions.');
  }
  const questions: string[] = [];

  // Opener
  questions.push(`Tell me about your experience that makes you a good fit for the ${jobTitle} role.`);

  // Matched skills — deeper probing
  matchedSkills.slice(0, 3).forEach(skill => {
    const templates = [
      `Walk me through a project where you used ${skill} to solve a significant problem.`,
      `How would you rate your proficiency in ${skill}, and what's the most complex thing you've built with it?`,
      `Describe a situation where ${skill} was critical to the success of a deliverable.`,
    ];
    questions.push(templates[Math.floor(Math.random() * templates.length)]);
  });

  // Missing skills — candidate's plan
  missingSkills.slice(0, 2).forEach(skill => {
    questions.push(`${skill} is listed as a requirement. How familiar are you with it, and what's your plan to get up to speed?`);
  });

  // Experience-based
  if (yearsExp > 0) {
    questions.push(`You have ${yearsExp} year${yearsExp !== 1 ? 's' : ''} of experience. What's the most technically challenging project you've worked on in that time?`);
  }

  // General
  questions.push('Describe a time you had to learn something new very quickly under pressure. How did you handle it?');
  questions.push('How do you prioritize tasks when you have multiple deadlines competing for your attention?');

  return questions.slice(0, 8);
}

function InterviewQuestions({ matchedSkills, missingSkills, jobTitle, yearsExp }: {
  matchedSkills: string[]; missingSkills: string[]; jobTitle: string; yearsExp: number;
}) {
  const { accessToken } = useAuth();
  const [open, setOpen] = useState(false);
  const [questions, setQuestions] = useState<string[]>([]);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [questionError, setQuestionError] = useState('');

  useEffect(() => {
    if (!open || !accessToken || questions.length > 0 || loadingQuestions) return;
    setLoadingQuestions(true);
    setQuestionError('');
    apiGenerateInterviewQuestions(accessToken, {
      jobTitle,
      matchedSkills,
      missingSkills,
      yearsExp,
      candidateSummary: `${matchedSkills.length} matched skills and ${missingSkills.length} missing skills.`,
    }).then(setQuestions)
      .catch((e: any) => setQuestionError(e.message || 'Failed to generate AI questions.'))
      .finally(() => setLoadingQuestions(false));
  }, [open, accessToken, jobTitle, yearsExp, matchedSkills.join('|'), missingSkills.join('|')]);

  return (
    <div className="bg-surface-card border border-border-dark rounded-xl p-6">
      <button onClick={() => setOpen(v => !v)} className="w-full flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="size-8 rounded-lg bg-violet-500/10 flex items-center justify-center">
            <span className="material-symbols-outlined ms-sm text-violet-400">quiz</span>
          </div>
          <div className="text-left">
            <h3 className="font-bold text-white">AI Interview Questions</h3>
            <p className="text-xs text-text-muted">{questions.length > 0 ? `${questions.length} AI-generated questions` : 'Generate with configured LLM'}</p>
          </div>
        </div>
        <span className={`material-symbols-outlined text-text-muted transition-transform ${open ? 'rotate-180' : ''}`}>expand_more</span>
      </button>

      {open && (
        <div className="mt-4 space-y-3">
          {loadingQuestions && (
            <div className="p-3 bg-surface-hover rounded-xl border border-border-dark text-sm text-text-muted flex items-center gap-2">
              <span className="material-symbols-outlined animate-spin ms-sm">refresh</span>
              Generating questions with AI...
            </div>
          )}
          {questionError && (
            <div className="p-3 bg-red-500/10 border border-red-500/25 rounded-xl text-sm text-red-400">
              {questionError}
            </div>
          )}
          {questions.map((q, i) => (
            <div key={i} className="flex gap-3 p-3 bg-surface-hover rounded-xl border border-border-dark group">
              <span className="text-xs font-bold text-primary bg-primary/15 size-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">{i + 1}</span>
              <p className="text-sm text-slate-300 flex-1 leading-relaxed">{q}</p>
              <button onClick={() => { navigator.clipboard.writeText(q); toast.success('Question copied!'); }}
                className="opacity-0 group-hover:opacity-100 text-text-muted hover:text-white transition-all flex-shrink-0">
                <span className="material-symbols-outlined ms-sm">content_copy</span>
              </button>
            </div>
          ))}
          <button onClick={() => { navigator.clipboard.writeText(questions.join('\n\n')); toast.success('All questions copied!'); }}
            className="w-full text-xs text-primary hover:text-white border border-primary/30 hover:bg-primary/10 py-2 rounded-lg transition-colors font-medium flex items-center justify-center gap-1.5">
            <span className="material-symbols-outlined ms-sm">content_copy</span>
            Copy All Questions
          </button>
        </div>
      )}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="flex gap-5 h-[calc(100vh-8rem)] max-w-7xl mx-auto w-full">
      <div className="w-80 xl:w-96 space-y-2 flex-shrink-0">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="card-dark p-4 animate-pulse">
            <div className="flex gap-3 items-center">
              <div className="w-5 h-3 bg-surface-hover rounded" />
              <div className="size-10 rounded-full bg-surface-hover flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-3 bg-surface-hover rounded w-3/4" />
                <div className="h-2.5 bg-surface-hover rounded w-1/2" />
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="flex-1 card-dark animate-pulse" />
    </div>
  );
}
