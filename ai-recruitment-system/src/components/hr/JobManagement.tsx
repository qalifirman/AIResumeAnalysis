import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { useAuth } from '../../contexts/AuthContext';
import { apiGetJobs, apiCreateJob, apiUpdateJob, apiDeleteJob, apiGetApplications } from '../../api';
import { SKILL_DATABASE } from '../../utils/ai/nlp-engine';
import { DEFAULT_JOB_FIELD, JOB_FIELD_OPTIONS, fieldIcon, isJobField } from '../../utils/job-fields';
import { ConfirmModal } from '../ui/confirm-modal';
import type { Job, JobFormData } from '../../types';

const EMPTY_FORM: JobFormData = {
  title: '', description: '', requirements: [], salary_range: '',
  department: DEFAULT_JOB_FIELD, employment_type: 'full-time', required_years_exp: 0, location: '',
  company_name: '', work_mode: 'on-site', expires_at: null,
};

const DESCRIPTION_TEMPLATE = `About the role:

Key responsibilities:
- 

Required qualifications:
- 

Preferred experience:
- 

Working arrangement:
- `;

export function JobManagement({ onReviewCandidates }: { onReviewCandidates?: (jobId: string) => void }) {
  const { accessToken, user } = useAuth();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Job | null>(null);
  const [form, setForm] = useState<JobFormData>(EMPTY_FORM);
  const [skillInput, setSkillInput] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [salaryMin, setSalaryMin] = useState('');
  const [salaryMax, setSalaryMax] = useState('');
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [deptFilter, setDeptFilter] = useState('All Fields');
  const [statusChip, setStatusChip] = useState<'all' | 'active' | 'archived'>('all');
  const [appCounts, setAppCounts] = useState<Record<string, number>>({});

  useEffect(() => { load(); }, [accessToken, user?.id]);

  const load = async () => {
    if (!accessToken) return;
    try {
      const [jobList, appList] = await Promise.all([
        apiGetJobs(accessToken),
        apiGetApplications(accessToken).catch(() => []),
      ]);
      setJobs(user?.id ? jobList.filter(job => job.hr_id === user.id) : []);
      const counts: Record<string, number> = {};
      appList.forEach(a => { counts[a.job_id] = (counts[a.job_id] || 0) + 1; });
      setAppCounts(counts);
    }
    catch (e: any) { toast.error(e.message); }
    finally { setLoading(false); }
  };

  const resetModalExtras = () => {
    setSkillInput(''); setSuggestions([]);
    setSalaryMin(''); setSalaryMax('');
  };

  const openCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM, company_name: user?.company_name || user?.name || '' });
    resetModalExtras();
    setShowModal(true);
  };
  const openEdit = (j: Job) => {
    if (user?.id && j.hr_id !== user.id) {
      toast.error('This posting belongs to another HR account.');
      return;
    }
    setEditing(j);
    setForm({ title: j.title, description: j.description, requirements: j.requirements,
      salary_range: j.salary_range || '', department: isJobField(j.department) ? j.department : DEFAULT_JOB_FIELD,
      employment_type: j.employment_type, required_years_exp: j.required_years_exp, location: j.location,
      company_name: j.company_name || '', work_mode: j.work_mode || 'on-site',
      expires_at: j.expires_at ? j.expires_at.slice(0, 10) : null });
    resetModalExtras();
    if (j.salary_range) {
      const nums = j.salary_range.replace(/[^\d\s\-–]/g, '').split(/[\s\-–]+/).filter(Boolean);
      setSalaryMin(nums[0] || ''); setSalaryMax(nums[1] || '');
    }
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
    if (!form.title.trim() || !form.company_name?.trim() || !isJobField(form.department) || !form.location.trim() || !form.description.trim()) {
      toast.error('Title, company name, field, location, and job description are required.'); return;
    }
    if (editing && user?.id && editing.hr_id !== user.id) {
      toast.error('This posting belongs to another HR account.');
      return;
    }
    setSaving(true);
    const salaryStr = salaryMin && salaryMax
      ? `RM ${Number(salaryMin).toLocaleString()} – RM ${Number(salaryMax).toLocaleString()}`
      : salaryMin ? `From RM ${Number(salaryMin).toLocaleString()}`
      : salaryMax ? `Up to RM ${Number(salaryMax).toLocaleString()}`
      : form.salary_range;
    const formToSave = { ...form, salary_range: salaryStr, expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : null };
    try {
      if (editing) {
        const updated = await apiUpdateJob(accessToken, editing.id, formToSave);
        setJobs(js => js.map(j => j.id === editing.id ? updated : j));
        toast.success('Job posting updated.');
      } else {
        const created = await apiCreateJob(accessToken, formToSave);
        setJobs(js => [created, ...js]);
        toast.success('Job posting published.');
      }
      setShowModal(false);
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!accessToken) return;
    const target = jobs.find(j => j.id === id);
    if (target && user?.id && target.hr_id !== user.id) {
      toast.error('This posting belongs to another HR account.');
      setConfirmDelete(null);
      return;
    }
    try { await apiDeleteJob(accessToken, id); setJobs(js => js.filter(j => j.id !== id)); toast.success('Job posting deleted.'); }
    catch (e: any) { toast.error(e.message); }
    finally { setConfirmDelete(null); }
  };

  const handleDuplicate = async (job: Job) => {
    if (!accessToken) return;
    try {
      const payload: JobFormData = {
        title: `${job.title} (Copy)`,
        description: job.description,
        requirements: job.requirements,
        salary_range: job.salary_range || '',
        department: job.department,
        employment_type: job.employment_type,
        required_years_exp: job.required_years_exp,
        location: job.location,
        company_name: job.company_name || '',
        work_mode: job.work_mode || 'on-site',
      };
      const created = await apiCreateJob(accessToken, payload);
      setJobs(js => [created, ...js]);
      toast.success(`"${job.title}" duplicated.`);
    } catch (e: any) { toast.error(e.message); }
  };

  const departments = ['All Fields', ...JOB_FIELD_OPTIONS.map(field => field.value)];

  const filtered = jobs.filter(j => {
    const matchSearch = !search || j.title.toLowerCase().includes(search.toLowerCase()) ||
      j.department.toLowerCase().includes(search.toLowerCase());
    const matchDept = deptFilter === 'All Fields' || j.department === deptFilter;
    const matchStatus = statusChip === 'all' || j.status === statusChip;
    return matchSearch && matchDept && matchStatus;
  });

  const activeJobs = jobs.filter(j => j.status === 'active');
  const archivedJobs = jobs.filter(j => j.status === 'archived');

  if (loading) return <LoadingState />;

  return (
    <div className="max-w-7xl mx-auto">
      <ConfirmModal
        open={confirmDelete !== null}
        title="Delete job posting?"
        message="This will permanently remove the posting and cannot be undone."
        confirmLabel="Delete"
        onConfirm={() => confirmDelete && handleDelete(confirmDelete)}
        onCancel={() => setConfirmDelete(null)}
      />

      {/* Page heading */}
      <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
        <div>
          <h1 className="page-title">Job Management</h1>
          <p className="page-subtitle">
            {activeJobs.length} active · {archivedJobs.length} archived postings
          </p>
        </div>
        <button onClick={openCreate} className="btn-primary h-11 px-6">
          <span className="material-symbols-outlined ms-sm">add</span>
          <span>Post New Job</span>
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-4 mb-8">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
          <div className="md:col-span-5 relative group">
            <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-text-muted group-focus-within:text-primary transition-colors ms-sm">search</span>
            <input
              className="w-full h-12 pl-11 pr-4 rounded-xl bg-surface-card border border-border-dark text-white placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all"
              placeholder="Search job titles or keywords..."
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="md:col-span-3">
            <select
              className="w-full h-12 px-4 rounded-xl bg-surface-card border border-border-dark text-white focus:outline-none focus:ring-1 focus:ring-primary transition-all cursor-pointer"
              value={deptFilter} onChange={e => setDeptFilter(e.target.value)}>
              {departments.map(d => <option key={d}>{d}</option>)}
            </select>
          </div>
        </div>

        {/* Status filter chips */}
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-text-muted text-sm font-medium">Quick Filters:</span>
          {(['all', 'active', 'archived'] as const).map(chip => (
            <button key={chip} onClick={() => setStatusChip(chip)}
              className={`flex items-center gap-1.5 h-8 px-3 rounded-lg border text-sm font-medium transition-all
                ${statusChip === chip
                  ? 'bg-primary/15 border-primary/30 text-white'
                  : 'bg-surface-card border-border-dark text-text-muted hover:border-primary/30 hover:text-white'}`}>
              {chip === 'all' ? 'All Jobs' : chip.charAt(0).toUpperCase() + chip.slice(1)}
              {statusChip === chip && chip !== 'all' && (
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>close</span>
              )}
            </button>
          ))}
          <span className="ml-auto text-xs text-text-muted">{filtered.length} posting{filtered.length !== 1 ? 's' : ''}</span>
        </div>
      </div>

      {/* Job grid */}
      {filtered.length === 0 ? (
        <EmptyState icon="work" title="No job postings yet" sub="Create your first job posting to start receiving applications." action={openCreate} actionLabel="Create Posting" />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 pb-12">
          {filtered.map(job => (
            <JobCard key={job.id} job={job} appCount={appCounts[job.id] ?? 0} onEdit={openEdit} onDelete={id => setConfirmDelete(id)} onDuplicate={handleDuplicate} onReviewCandidates={onReviewCandidates} />
          ))}
          {/* Add new card */}
          <button onClick={openCreate}
            className="flex flex-col items-center justify-center bg-surface-card/30 rounded-2xl border-2 border-dashed border-border-dark p-5 hover:border-primary hover:bg-primary/5 transition-all duration-300 group min-h-[220px]">
            <div className="size-14 rounded-full bg-surface-hover group-hover:bg-primary group-hover:text-white text-primary flex items-center justify-center mb-4 transition-colors shadow-lg">
              <span className="material-symbols-outlined ms-lg">add</span>
            </div>
            <h3 className="text-white text-base font-bold group-hover:text-primary transition-colors">Create Job Posting</h3>
            <p className="text-text-muted text-sm mt-2 text-center max-w-[180px]">Start a new recruitment campaign with AI matching.</p>
          </button>
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-surface-dark border border-border-dark rounded-2xl w-full max-w-4xl max-h-[92vh] overflow-y-auto shadow-card flex flex-col">

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border-dark flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/15 rounded-lg">
                  <span className="material-symbols-outlined text-primary ms-sm">work</span>
                </div>
                <div>
                  <h3 className="font-bold text-white text-base">{editing ? 'Edit Job Posting' : 'Create New Job Posting'}</h3>
                  <p className="text-text-muted text-xs mt-0.5">{editing ? 'Update the details below' : 'Fill in the details to publish a new role'}</p>
                </div>
              </div>
              <button onClick={() => setShowModal(false)} className="text-text-muted hover:text-white transition-colors p-1.5 rounded-lg hover:bg-surface-hover">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            {/* Body — 2-column grid */}
            <div className="flex-1 overflow-y-auto p-6">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* LEFT — job details + description */}
                <div className="lg:col-span-2 flex flex-col gap-5">

                  {/* Section: Job Details */}
                  <section className="bg-surface-card rounded-xl border border-border-dark p-5">
                    <h4 className="flex items-center gap-2 text-white text-sm font-bold mb-4">
                      <span className="material-symbols-outlined text-primary ms-sm">description</span>
                      Job Details
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="sm:col-span-2">
                        <label className="block text-xs text-text-muted mb-1.5 font-bold uppercase tracking-wider">Job Title *</label>
                        <input className="input-dark" placeholder="e.g. Senior Frontend Developer"
                          value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-xs text-text-muted mb-1.5 font-bold uppercase tracking-wider">Company Name *</label>
                        <div className="relative">
                          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted material-symbols-outlined ms-sm">business</span>
                          <input className="input-dark pl-11" placeholder="e.g. Acme Corp"
                            value={form.company_name || ''} onChange={e => setForm(f => ({ ...f, company_name: e.target.value }))} />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs text-text-muted mb-1.5 font-bold uppercase tracking-wider">Field *</label>
                        <select className="input-dark"
                          value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))}>
                          {JOB_FIELD_OPTIONS.map(option => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-text-muted mb-1.5 font-bold uppercase tracking-wider">Location *</label>
                        <div className="relative">
                          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted material-symbols-outlined ms-sm">location_on</span>
                          <input className="input-dark pl-11" placeholder="City, Country"
                            value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs text-text-muted mb-1.5 font-bold uppercase tracking-wider">Employment Type</label>
                        <select className="input-dark" value={form.employment_type}
                          onChange={e => setForm(f => ({ ...f, employment_type: e.target.value as any }))}>
                          {['full-time', 'part-time', 'contract', 'internship'].map(t => (
                            <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-text-muted mb-1.5 font-bold uppercase tracking-wider">Work Mode</label>
                        <div className="grid grid-cols-3 gap-1 p-1 bg-surface-hover rounded-xl border border-border-dark">
                          {(['remote', 'hybrid', 'on-site'] as const).map(mode => (
                            <button key={mode} type="button"
                              onClick={() => setForm(f => ({ ...f, work_mode: mode }))}
                              className={`py-2 text-xs font-medium rounded-lg transition-all
                                ${(form.work_mode || 'on-site') === mode
                                  ? 'bg-primary text-white shadow-sm'
                                  : 'text-text-muted hover:text-white'}`}>
                              {mode === 'on-site' ? 'On-site' : mode.charAt(0).toUpperCase() + mode.slice(1)}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs text-text-muted mb-1.5 font-bold uppercase tracking-wider">Min. Years of Experience</label>
                        <input type="number" min={0} className="input-dark"
                          value={form.required_years_exp}
                          onChange={e => setForm(f => ({ ...f, required_years_exp: parseInt(e.target.value) || 0 }))} />
                      </div>
                      <div>
                        <label className="block text-xs text-text-muted mb-1.5 font-bold uppercase tracking-wider">Application Deadline</label>
                        <div className="relative">
                          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted material-symbols-outlined ms-sm">event</span>
                          <input type="date" className="input-dark pl-11"
                            min={new Date().toISOString().slice(0, 10)}
                            value={form.expires_at || ''}
                            onChange={e => setForm(f => ({ ...f, expires_at: e.target.value || null }))} />
                        </div>
                        {form.expires_at && (
                          <button type="button" onClick={() => setForm(f => ({ ...f, expires_at: null }))}
                            className="text-xs text-text-muted hover:text-white mt-1 transition-colors">
                            Clear deadline
                          </button>
                        )}
                      </div>
                    </div>
                  </section>

                  {/* Section: Description */}
                  <section className="bg-surface-card rounded-xl border border-border-dark overflow-hidden">
                    <div className="flex items-center justify-between px-5 py-3 border-b border-border-dark">
                      <h4 className="flex items-center gap-2 text-white text-sm font-bold">
                        <span className="material-symbols-outlined text-primary ms-sm">subject</span>
                        Description &amp; Responsibilities
                      </h4>
                      <button type="button"
                        onClick={() => setForm(f => ({ ...f, description: f.description.trim() ? f.description : DESCRIPTION_TEMPLATE }))}
                        className="text-xs text-primary hover:text-white font-semibold transition-colors">
                        Insert guide
                      </button>
                    </div>
                    {/* Toolbar */}
                    <div className="flex items-center gap-1 px-4 py-2 bg-surface-hover border-b border-border-dark">
                      {[
                        { icon: 'format_bold',      title: 'Bold' },
                        { icon: 'format_italic',    title: 'Italic' },
                        { icon: 'format_underlined',title: 'Underline' },
                      ].map(btn => (
                        <button key={btn.icon} type="button" title={btn.title}
                          className="p-1.5 text-text-muted hover:text-white hover:bg-surface-card rounded transition-colors">
                          <span className="material-symbols-outlined ms-sm">{btn.icon}</span>
                        </button>
                      ))}
                      <div className="w-px h-4 bg-border-dark mx-1" />
                      {[
                        { icon: 'format_list_bulleted', title: 'Bullet list' },
                        { icon: 'format_list_numbered', title: 'Numbered list' },
                      ].map(btn => (
                        <button key={btn.icon} type="button" title={btn.title}
                          className="p-1.5 text-text-muted hover:text-white hover:bg-surface-card rounded transition-colors">
                          <span className="material-symbols-outlined ms-sm">{btn.icon}</span>
                        </button>
                      ))}
                    </div>
                    <textarea rows={8} className="w-full bg-transparent px-5 py-4 text-sm text-white placeholder:text-text-muted focus:outline-none resize-none"
                      placeholder="Describe the role, team, key responsibilities, required qualifications, and working arrangement..."
                      value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
                    <div className="px-5 pb-4 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-text-muted">
                      {['Role purpose', 'Responsibilities', 'Required qualifications', 'Working arrangement'].map(item => (
                        <span key={item} className="flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-primary text-[14px]">check_circle</span>
                          {item}
                        </span>
                      ))}
                    </div>
                  </section>
                </div>

                {/* RIGHT — requirements + compensation */}
                <div className="flex flex-col gap-5">

                  {/* Section: Required Skills */}
                  <section className="bg-surface-card rounded-xl border border-border-dark p-5">
                    <h4 className="flex items-center gap-2 text-white text-sm font-bold mb-4">
                      <span className="material-symbols-outlined text-primary ms-sm">school</span>
                      Required Skills
                    </h4>
                    <div className="relative">
                      <input className="input-dark" placeholder="Type a skill and press Enter…"
                        value={skillInput} onChange={e => handleSkill(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addSkill(skillInput.trim()); } }} />
                      {suggestions.length > 0 && (
                        <div className="absolute top-full left-0 right-0 mt-1 bg-surface-hover border border-border-dark rounded-xl overflow-hidden z-10 shadow-card">
                          {suggestions.map(s => (
                            <button key={s} onClick={() => addSkill(s)}
                              className="w-full text-left px-4 py-2.5 text-sm text-white hover:bg-surface-card transition-colors">
                              {s}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    {form.requirements.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-3">
                        {form.requirements.map(s => (
                          <span key={s} className="flex items-center gap-1 px-2.5 py-1 bg-primary/15 border border-primary/30 text-violet-300 text-xs rounded-lg">
                            {s}
                            <button onClick={() => removeSkill(s)} className="hover:text-white ml-0.5">
                              <span className="material-symbols-outlined" style={{ fontSize: '12px' }}>close</span>
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                    <p className="text-xs text-text-muted mt-2">Type and press Enter to add skills</p>
                  </section>

                  {/* Section: Compensation */}
                  <section className="bg-surface-card rounded-xl border border-border-dark p-5">
                    <h4 className="flex items-center gap-2 text-white text-sm font-bold mb-4">
                      <span className="material-symbols-outlined text-primary ms-sm">payments</span>
                      Compensation
                    </h4>
                    <div className="flex flex-col gap-5">
                      <div>
                        <label className="block text-xs text-text-muted mb-1.5 font-bold uppercase tracking-wider">Salary Range (Annual)</label>
                        <div className="flex items-center gap-2">
                          <div className="relative flex-1">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted text-xs font-medium">RM</span>
                            <input type="number" min={0} className="input-dark pl-10 pr-2" placeholder="Min"
                              value={salaryMin} onChange={e => setSalaryMin(e.target.value)} />
                          </div>
                          <span className="text-text-muted text-sm flex-shrink-0">–</span>
                          <div className="relative flex-1">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted text-xs font-medium">RM</span>
                            <input type="number" min={0} className="input-dark pl-10 pr-2" placeholder="Max"
                              value={salaryMax} onChange={e => setSalaryMax(e.target.value)} />
                          </div>
                        </div>
                      </div>

                      <div className="border-t border-border-dark pt-4">
                        <div className="flex items-start gap-3 rounded-xl bg-primary/10 border border-primary/20 p-3">
                          <span className="material-symbols-outlined text-primary ms-sm mt-0.5">auto_awesome</span>
                          <div>
                            <p className="text-xs font-bold text-white uppercase tracking-wider">AI matching uses saved fields</p>
                            <p className="text-xs text-text-muted mt-1 leading-relaxed">
                              Candidate fit is calculated from required skills, job description, and years of experience after applicants submit a resume.
                            </p>
                          </div>
                        </div>
                      </div>

                    </div>
                  </section>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-6 py-4 border-t border-border-dark flex-shrink-0">
              <button onClick={() => setShowModal(false)} className="text-red-400 hover:text-red-300 text-sm font-medium transition-colors">
                {editing ? 'Discard Changes' : 'Discard Draft'}
              </button>
              <div className="flex items-center gap-3">
                <button onClick={() => setShowModal(false)} className="btn-secondary">Cancel</button>
                <button onClick={handleSave} disabled={saving} className="btn-primary">
                  {saving
                    ? <><span className="material-symbols-outlined animate-spin ms-sm">refresh</span>Saving…</>
                    : <><span className="material-symbols-outlined ms-sm">{editing ? 'save' : 'publish'}</span>{editing ? 'Save Changes' : 'Publish Job'}</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function JobCard({ job, appCount, onEdit, onDelete, onDuplicate, onReviewCandidates }: {
  job: Job;
  appCount: number;
  onEdit: (j: Job) => void;
  onDelete: (id: string) => void;
  onDuplicate: (j: Job) => void;
  onReviewCandidates?: (jobId: string) => void;
}) {
  const statusColor = job.status === 'active'
    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
    : 'bg-gray-700/50 text-gray-400 border border-gray-600/30';

  return (
    <article className="job-card">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-white text-base font-bold group-hover:text-primary transition-colors">{job.title}</h3>
          <p className="text-text-muted text-sm mt-1 flex items-center gap-2">
            <span className="flex items-center gap-1.5">
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{fieldIcon(job.department)}</span>
              {job.department}
            </span>
            <span className="size-1 rounded-full bg-text-muted" />
            <span>{job.location}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wide ${statusColor}`}>
            {job.status}
          </span>
          <div className="flex gap-1">
            <button onClick={() => onDuplicate(job)} title="Duplicate posting" aria-label="Duplicate posting"
              className="size-8 flex items-center justify-center rounded-lg text-text-muted hover:bg-surface-hover hover:text-white transition-colors">
              <span className="material-symbols-outlined ms-sm">content_copy</span>
            </button>
            <button onClick={() => onEdit(job)} title="Edit posting" aria-label="Edit posting"
              className="size-8 flex items-center justify-center rounded-lg text-text-muted hover:bg-surface-hover hover:text-white transition-colors">
              <span className="material-symbols-outlined ms-sm">edit</span>
            </button>
            <button onClick={() => onDelete(job.id)} title="Delete posting" aria-label="Delete posting"
              className="size-8 flex items-center justify-center rounded-lg text-text-muted hover:bg-red-500/10 hover:text-red-400 transition-colors">
              <span className="material-symbols-outlined ms-sm">delete</span>
            </button>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 mb-5">
        <div className="bg-surface-hover rounded-xl p-3 relative overflow-hidden">
          {appCount >= 5 && (
            <span className="absolute top-2 right-2 flex items-center gap-0.5 text-[10px] font-bold text-orange-400 bg-orange-500/15 border border-orange-500/25 px-1.5 py-0.5 rounded-full">
              <span className="material-symbols-outlined" style={{ fontSize: 12 }}>trending_up</span>
              HOT
            </span>
          )}
          <div className="flex items-center gap-2 mb-1">
            <span className="material-symbols-outlined text-text-muted ms-sm">group</span>
            <span className="text-text-muted text-xs font-medium uppercase tracking-wider">Applicants</span>
          </div>
          <span className={`text-2xl font-bold ${appCount >= 5 ? 'text-orange-400' : 'text-white'}`}>{appCount}</span>
        </div>
        <div className="bg-primary/5 rounded-xl p-3 border border-primary/20 relative overflow-hidden">
          <div className="absolute -right-4 -top-4 size-16 bg-primary/20 blur-2xl rounded-full" />
          <div className="flex items-center gap-1.5 mb-1 relative z-10">
            <span className="material-symbols-outlined text-primary ms-sm">auto_awesome</span>
            <span className="text-primary text-xs font-bold uppercase tracking-wider">AI Ready</span>
          </div>
          <span className="text-white text-2xl font-bold relative z-10">{job.requirements.length}</span>
          <span className="text-primary/80 text-xs font-medium ml-1 relative z-10">skills</span>
        </div>
      </div>

      {/* Skills preview */}
      {job.requirements.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {job.requirements.slice(0, 3).map(s => (
            <span key={s} className="px-2 py-0.5 text-xs bg-surface-hover text-text-muted rounded-md border border-border-dark">{s}</span>
          ))}
          {job.requirements.length > 3 && (
            <span className="px-2 py-0.5 text-xs text-text-muted">+{job.requirements.length - 3} more</span>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="mt-auto pt-4 border-t border-border-dark flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1.5 text-text-muted text-xs">
            <span className="material-symbols-outlined ms-sm">calendar_today</span>
            <span>Posted {new Date(job.created_at).toLocaleDateString()}</span>
          </div>
          {job.expires_at && (() => {
            const daysLeft = Math.ceil((new Date(job.expires_at).getTime() - Date.now()) / 86_400_000);
            if (daysLeft < 0) return <span className="flex items-center gap-1 text-xs font-semibold text-red-400"><span className="material-symbols-outlined" style={{fontSize:12}}>event_busy</span>Expired</span>;
            if (daysLeft <= 3) return <span className="flex items-center gap-1 text-xs font-semibold text-orange-400"><span className="material-symbols-outlined" style={{fontSize:12}}>warning</span>Closes in {daysLeft}d</span>;
            return <span className="flex items-center gap-1 text-xs text-text-muted"><span className="material-symbols-outlined" style={{fontSize:12}}>event</span>Closes in {daysLeft}d</span>;
          })()}
        </div>
        <button onClick={() => onReviewCandidates?.(job.id)}
          className="text-white text-sm font-semibold hover:text-primary transition-colors flex items-center gap-1 group/btn">
          View Applicants
          <span className="material-symbols-outlined ms-sm group-hover/btn:translate-x-1 transition-transform">arrow_forward</span>
        </button>
      </div>
    </article>
  );
}

function LoadingState() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
      {[...Array(3)].map((_, i) => (
        <div key={i} className="bg-surface-card rounded-2xl border border-border-dark p-5 animate-pulse h-64" />
      ))}
    </div>
  );
}

function EmptyState({ icon, title, sub, action, actionLabel }: { icon: string; title: string; sub: string; action?: () => void; actionLabel?: string }) {
  return (
    <div className="bg-surface-card/30 rounded-2xl border-2 border-dashed border-border-dark p-16 text-center">
      <div className="size-16 rounded-2xl bg-surface-hover flex items-center justify-center mx-auto mb-4">
        <span className="material-symbols-outlined ms-lg text-text-muted">{icon}</span>
      </div>
      <h3 className="font-semibold text-white mb-1">{title}</h3>
      <p className="text-sm text-text-muted mb-4">{sub}</p>
      {action && <button onClick={action} className="btn-primary mx-auto">{actionLabel}</button>}
    </div>
  );
}
