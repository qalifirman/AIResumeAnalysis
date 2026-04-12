import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { apiGetJobs, apiCreateJob, apiUpdateJob, apiDeleteJob } from '../../api';
import { SKILL_DATABASE } from '../../utils/ai/nlp-engine';
import type { Job, JobFormData } from '../../types';

const EMPTY_FORM: JobFormData = {
  title: '', description: '', requirements: [], salary_range: '',
  department: '', employment_type: 'full-time', required_years_exp: 0, location: '',
};

export function JobManagement() {
  const { accessToken } = useAuth();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Job | null>(null);
  const [form, setForm] = useState<JobFormData>(EMPTY_FORM);
  const [skillInput, setSkillInput] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { load(); }, []);

  const load = async () => {
    if (!accessToken) return;
    try { setJobs(await apiGetJobs(accessToken)); }
    catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  const openCreate = () => { setEditing(null); setForm(EMPTY_FORM); setSkillInput(''); setShowModal(true); };
  const openEdit = (j: Job) => {
    setEditing(j);
    setForm({ title: j.title, description: j.description, requirements: j.requirements,
      salary_range: j.salary_range || '', department: j.department,
      employment_type: j.employment_type, required_years_exp: j.required_years_exp, location: j.location });
    setShowModal(true);
  };

  const handleSkill = (val: string) => {
    setSkillInput(val);
    setSuggestions(val.length > 1
      ? SKILL_DATABASE.filter(s => s.toLowerCase().includes(val.toLowerCase())).slice(0, 8)
      : []);
  };
  const addSkill = (s: string) => {
    if (s && !form.requirements.includes(s)) setForm(f => ({ ...f, requirements: [...f.requirements, s] }));
    setSkillInput(''); setSuggestions([]);
  };
  const removeSkill = (s: string) => setForm(f => ({ ...f, requirements: f.requirements.filter(r => r !== s) }));

  const handleSave = async () => {
    if (!accessToken) return;
    if (!form.title.trim() || !form.department.trim() || !form.location.trim()) {
      setError('Title, department, and location are required.'); return;
    }
    setSaving(true); setError('');
    try {
      if (editing) {
        const updated = await apiUpdateJob(accessToken, editing.id, form);
        setJobs(js => js.map(j => j.id === editing.id ? updated : j));
      } else {
        const created = await apiCreateJob(accessToken, form);
        setJobs(js => [created, ...js]);
      }
      setShowModal(false);
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!accessToken || !confirm('Delete this job posting?')) return;
    try { await apiDeleteJob(accessToken, id); setJobs(js => js.filter(j => j.id !== id)); }
    catch (e: any) { setError(e.message); }
  };

  const activeJobs = jobs.filter(j => j.status === 'active');
  const archivedJobs = jobs.filter(j => j.status === 'archived');

  if (loading) return <LoadingState />;

  return (
    <div>
      {error && <ErrorBanner msg={error} onClose={() => setError('')} />}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="page-title">Job postings</h2>
          <p className="page-subtitle">{activeJobs.length} active · {archivedJobs.length} archived</p>
        </div>
        <button onClick={openCreate} className="btn-primary">
          <span className="material-symbols-outlined ms-sm">add</span>
          New posting
        </button>
      </div>

      {jobs.length === 0 ? (
        <EmptyState icon="work" title="No job postings yet" sub="Create your first job posting to start receiving applications." action={openCreate} actionLabel="Create posting" />
      ) : (
        <div className="space-y-3">
          {jobs.map(job => (
            <div key={job.id} className="card-dark p-5 flex items-start gap-4 hover:bg-surface-hover/50 transition-colors">
              <div className="size-11 rounded-xl bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                <span className="material-symbols-outlined text-blue-400">work</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start gap-3 flex-wrap">
                  <h3 className="font-semibold text-white">{job.title}</h3>
                  <span className={`badge-score text-xs ${job.status === 'active' ? 'badge-strong' : 'bg-slate-500/15 text-slate-400 border border-slate-500/25'}`}>
                    {job.status}
                  </span>
                </div>
                <div className="flex flex-wrap gap-3 mt-1 text-xs text-text-muted">
                  <span className="flex items-center gap-1">
                    <span className="material-symbols-outlined ms-sm">business</span>{job.department}
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="material-symbols-outlined ms-sm">location_on</span>{job.location}
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="material-symbols-outlined ms-sm">schedule</span>{job.employment_type}
                  </span>
                  {job.salary_range && (
                    <span className="flex items-center gap-1">
                      <span className="material-symbols-outlined ms-sm">payments</span>{job.salary_range}
                    </span>
                  )}
                </div>
                {job.requirements.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {job.requirements.slice(0, 5).map(s => (
                      <span key={s} className="px-2 py-0.5 text-xs bg-surface-hover text-text-muted rounded-md border border-border-dark">{s}</span>
                    ))}
                    {job.requirements.length > 5 && (
                      <span className="px-2 py-0.5 text-xs text-text-muted">+{job.requirements.length - 5} more</span>
                    )}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button onClick={() => openEdit(job)} className="p-2 text-text-muted hover:text-white hover:bg-surface-hover rounded-lg transition-colors">
                  <span className="material-symbols-outlined ms-sm">edit</span>
                </button>
                <button onClick={() => handleDelete(job.id)} className="p-2 text-text-muted hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors">
                  <span className="material-symbols-outlined ms-sm">delete</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-surface-dark border border-border-dark rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-border-dark">
              <h3 className="font-semibold text-white text-lg">{editing ? 'Edit job posting' : 'New job posting'}</h3>
              <button onClick={() => setShowModal(false)} className="text-text-muted hover:text-white transition-colors">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="p-6 space-y-4">
              {error && <ErrorBanner msg={error} onClose={() => setError('')} />}
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-xs text-text-muted mb-1.5 font-medium">Job title *</label>
                  <input className="input-dark" placeholder="e.g. Senior Frontend Developer"
                    value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs text-text-muted mb-1.5 font-medium">Department *</label>
                  <input className="input-dark" placeholder="e.g. Engineering"
                    value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs text-text-muted mb-1.5 font-medium">Location *</label>
                  <input className="input-dark" placeholder="e.g. Kuala Lumpur"
                    value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs text-text-muted mb-1.5 font-medium">Employment type</label>
                  <select className="input-dark" value={form.employment_type}
                    onChange={e => setForm(f => ({ ...f, employment_type: e.target.value as any }))}>
                    {['full-time','part-time','contract','internship'].map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-text-muted mb-1.5 font-medium">Years of experience</label>
                  <input type="number" min={0} className="input-dark"
                    value={form.required_years_exp}
                    onChange={e => setForm(f => ({ ...f, required_years_exp: parseInt(e.target.value) || 0 }))} />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs text-text-muted mb-1.5 font-medium">Salary range</label>
                  <input className="input-dark" placeholder="e.g. RM 4,000 – RM 7,000"
                    value={form.salary_range} onChange={e => setForm(f => ({ ...f, salary_range: e.target.value }))} />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs text-text-muted mb-1.5 font-medium">Description</label>
                  <textarea rows={4} className="input-dark resize-none" placeholder="Describe the role and responsibilities…"
                    value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs text-text-muted mb-1.5 font-medium">Required skills</label>
                  <div className="relative">
                    <input className="input-dark" placeholder="Type a skill and press Enter…"
                      value={skillInput} onChange={e => handleSkill(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addSkill(skillInput.trim()); } }} />
                    {suggestions.length > 0 && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-surface-card border border-border-dark rounded-xl overflow-hidden z-10 shadow-card">
                        {suggestions.map(s => (
                          <button key={s} onClick={() => addSkill(s)}
                            className="w-full text-left px-4 py-2.5 text-sm text-white hover:bg-surface-hover transition-colors">
                            {s}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {form.requirements.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {form.requirements.map(s => (
                        <span key={s} className="flex items-center gap-1 px-2.5 py-1 bg-primary/15 border border-primary/30 text-violet-300 text-xs rounded-lg">
                          {s}
                          <button onClick={() => removeSkill(s)} className="hover:text-white ml-0.5">
                            <span className="material-symbols-outlined" style={{fontSize:'12px'}}>close</span>
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 p-6 border-t border-border-dark">
              <button onClick={() => setShowModal(false)} className="btn-secondary">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="btn-primary">
                {saving ? <><span className="material-symbols-outlined animate-spin ms-sm">refresh</span> Saving…</> : editing ? 'Save changes' : 'Create posting'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function LoadingState() {
  return (
    <div className="space-y-3">
      {[...Array(3)].map((_, i) => (
        <div key={i} className="card-dark p-5 animate-pulse">
          <div className="flex gap-4">
            <div className="size-11 rounded-xl bg-surface-hover" />
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-surface-hover rounded w-1/3" />
              <div className="h-3 bg-surface-hover rounded w-1/2" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ icon, title, sub, action, actionLabel }: { icon: string; title: string; sub: string; action?: () => void; actionLabel?: string }) {
  return (
    <div className="card-dark p-12 text-center">
      <div className="size-16 rounded-2xl bg-surface-hover flex items-center justify-center mx-auto mb-4">
        <span className="material-symbols-outlined ms-lg text-text-muted">{icon}</span>
      </div>
      <h3 className="font-semibold text-white mb-1">{title}</h3>
      <p className="text-sm text-text-muted mb-4">{sub}</p>
      {action && <button onClick={action} className="btn-primary mx-auto">{actionLabel}</button>}
    </div>
  );
}

function ErrorBanner({ msg, onClose }: { msg: string; onClose: () => void }) {
  return (
    <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/25 rounded-xl text-sm text-red-400 mb-4">
      <span className="material-symbols-outlined ms-sm flex-shrink-0">error</span>
      <span className="flex-1">{msg}</span>
      <button onClick={onClose} className="hover:text-red-300 flex-shrink-0">
        <span className="material-symbols-outlined ms-sm">close</span>
      </button>
    </div>
  );
}
