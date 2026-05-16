import { useState, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useAuth } from '../../contexts/AuthContext';
import {
  apiGetResumes, apiUploadResume, apiSaveResume,
  apiActivateResume, apiDeleteResume, apiUpdateResumeParsedData, apiParseResumeAI,
} from '../../api';
import { parseResumeFile, validateResumeFile } from '../../utils/pdf-parser';
import { ConfirmModal } from '../ui/confirm-modal';
import type { Resume, WorkHistoryEntry, EducationEntry } from '../../types';

// ─── tiny helpers ─────────────────────────────────────────────────────────────

const emptyWork = (): WorkHistoryEntry => ({ title: '', company: '', period: '' });
const emptyEdu  = (): EducationEntry  => ({ degree: '', institution: '', year: '' });

// ─── component ────────────────────────────────────────────────────────────────

export function ResumeManager() {
  const { accessToken } = useAuth();

  const [resumes,   setResumes]   = useState<Resume[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadingFileName, setUploadingFileName] = useState('');
  const [dragOver,  setDragOver]  = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving,    setSaving]    = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Editable local copies of parsed experience / education for selected resume
  const [localWork,    setLocalWork]    = useState<WorkHistoryEntry[]>([]);
  const [localEdu,     setLocalEdu]     = useState<EducationEntry[]>([]);

  // Which entry is open for editing? (-1 = adding new)
  const [editWorkIdx, setEditWorkIdx] = useState<number | null>(null);
  const [editEduIdx,  setEditEduIdx]  = useState<number | null>(null);
  const [workForm,    setWorkForm]    = useState<WorkHistoryEntry>(emptyWork());
  const [eduForm,     setEduForm]     = useState<EducationEntry>(emptyEdu());

  // ── load ───────────────────────────────────────────────────────────────────
  useEffect(() => { load(); }, []);

  const load = async () => {
    if (!accessToken) return;
    try {
      const data = await apiGetResumes(accessToken);
      setResumes(data);
      const active = data.find(r => r.is_active);
      const first  = active ?? data[0];
      setSelectedId(first?.id ?? null);
    } catch (e: any) { toast.error(e.message); }
    finally { setLoading(false); }
  };

  // Sync local editable state whenever a different resume is selected
  useEffect(() => {
    const r = resumes.find(r => r.id === selectedId);
    setLocalWork((r?.parsed_data?.workHistory        ?? []) as WorkHistoryEntry[]);
    setLocalEdu ((r?.parsed_data?.structuredEducation ?? []) as EducationEntry[]);
    setEditWorkIdx(null);
    setEditEduIdx(null);
  }, [selectedId]);

  // ── upload ────────────────────────────────────────────────────────────────
  const processFile = async (file: File) => {
    const v = validateResumeFile(file);
    if (!v.valid) { toast.error(v.error || 'Invalid file'); return; }

    setUploading(true);
    setUploadingFileName(file.name);
    setUploadProgress(20);

    try {
      setUploadProgress(40);
      const rawText = await parseResumeFile(file);
      setUploadProgress(60);
      const parsed  = await apiParseResumeAI(accessToken!, rawText);
      setUploadProgress(80);
      const { filePath, fileUrl } = await apiUploadResume(accessToken!, file);
      const resume = await apiSaveResume(accessToken!, {
        fileName: file.name, filePath, fileUrl,
        parsedData: {
          skills: parsed.skills,
          yearsOfExperience: parsed.yearsOfExperience,
          rawText: parsed.rawText,
          education: parsed.education,
          workHistory: parsed.workHistory,
          structuredEducation: parsed.structuredEducation,
        },
      });
      setUploadProgress(100);
      setResumes(r => [resume, ...r]);
      setSelectedId(resume.id);
      toast.success(`"${file.name}" uploaded — ${parsed.skills.length} skill${parsed.skills.length !== 1 ? 's' : ''} detected.`);
    } catch (e: any) { toast.error(e.message); }
    finally {
      setTimeout(() => { setUploading(false); setUploadProgress(0); setUploadingFileName(''); }, 600);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (file) processFile(file);
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const file = e.dataTransfer.files?.[0]; if (file) processFile(file);
  };

  // ── activate / delete ──────────────────────────────────────────────────────
  const handleActivate = async (id: string) => {
    if (!accessToken) return;
    try {
      await apiActivateResume(accessToken, id);
      setResumes(rs => rs.map(r => ({ ...r, is_active: r.id === id })));
      setSelectedId(id);
      toast.success('Resume set as active.');
    } catch (e: any) { toast.error(e.message); }
  };

  const handleDelete = async (id: string) => {
    if (!accessToken) return;
    try {
      await apiDeleteResume(accessToken, id);
      const remaining = resumes.filter(r => r.id !== id);
      setResumes(remaining);
      if (selectedId === id) setSelectedId(remaining[0]?.id ?? null);
      toast.success('Resume deleted.');
    } catch (e: any) { toast.error(e.message); }
    finally { setConfirmDeleteId(null); }
  };

  // ── save edits to DB ───────────────────────────────────────────────────────
  const handleSaveEdits = async () => {
    if (!accessToken || !selectedId || !sel) return;
    setSaving(true);
    try {
      const updated = await apiUpdateResumeParsedData(accessToken, selectedId, {
        ...sel.parsed_data,
        workHistory: localWork,
        structuredEducation: localEdu,
      });
      setResumes(rs => rs.map(r => r.id === selectedId ? updated : r));
      toast.success('Changes saved.');
    } catch (e: any) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  // ── work history editing ───────────────────────────────────────────────────
  const openEditWork = (idx: number) => {
    setEditEduIdx(null);
    setEditWorkIdx(idx);
    setWorkForm(idx === -1 ? emptyWork() : { ...localWork[idx] });
  };
  const saveWork = () => {
    if (!workForm.title.trim()) return;
    if (editWorkIdx === -1) {
      setLocalWork(w => [...w, workForm]);
    } else {
      setLocalWork(w => w.map((e, i) => i === editWorkIdx ? workForm : e));
    }
    setEditWorkIdx(null);
  };
  const deleteWork = (idx: number) => {
    setLocalWork(w => w.filter((_, i) => i !== idx));
    if (editWorkIdx === idx) setEditWorkIdx(null);
  };

  // ── education editing ──────────────────────────────────────────────────────
  const openEditEdu = (idx: number) => {
    setEditWorkIdx(null);
    setEditEduIdx(idx);
    setEduForm(idx === -1 ? emptyEdu() : { ...localEdu[idx] });
  };
  const saveEdu = () => {
    if (!eduForm.degree.trim() && !eduForm.institution.trim()) return;
    if (editEduIdx === -1) {
      setLocalEdu(e => [...e, eduForm]);
    } else {
      setLocalEdu(e => e.map((en, i) => i === editEduIdx ? eduForm : en));
    }
    setEditEduIdx(null);
  };
  const deleteEdu = (idx: number) => {
    setLocalEdu(e => e.filter((_, i) => i !== idx));
    if (editEduIdx === idx) setEditEduIdx(null);
  };

  // ── derived ────────────────────────────────────────────────────────────────
  if (loading) return <Skeleton />;

  const sel        = resumes.find(r => r.id === selectedId);
  const skills     = sel?.parsed_data?.skills ?? [];
  const yearsExp   = sel?.parsed_data?.yearsOfExperience ?? 0;
  const parsedName = sel?.parsed_data?.name;
  const parsedEmail= sel?.parsed_data?.email;
  const legacyEdu  = sel?.parsed_data?.education ?? [];

  // Has the user made unsaved changes?
  const origWork = (sel?.parsed_data?.workHistory ?? []) as WorkHistoryEntry[];
  const origEdu  = (sel?.parsed_data?.structuredEducation ?? []) as EducationEntry[];
  const isDirty  = JSON.stringify(localWork) !== JSON.stringify(origWork)
                || JSON.stringify(localEdu)  !== JSON.stringify(origEdu);

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-6 max-w-[1200px] mx-auto">
      <ConfirmModal
        open={confirmDeleteId !== null}
        title="Delete resume?"
        message="This will permanently remove the resume file and cannot be undone."
        confirmLabel="Delete"
        onConfirm={() => confirmDeleteId && handleDelete(confirmDeleteId)}
        onCancel={() => setConfirmDeleteId(null)}
      />

      {/* heading */}
      <div>
        <h1 className="text-3xl font-black text-white tracking-tight">Upload Your Resume</h1>
        <p className="text-text-muted text-sm mt-1 max-w-xl">
          Let our AI parse your resume to automatically build your profile and match you with the perfect role.
        </p>
      </div>

      {/* two-column */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

        {/* ── Left: Upload + Files ── */}
        <div className="lg:col-span-4 flex flex-col gap-5">

          {/* upload box */}
          <div className="bg-surface-card rounded-xl border border-border-dark p-5">
            <h3 className="text-white text-base font-bold mb-4">Add Resume</h3>
            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => !uploading && fileRef.current?.click()}
              className={`relative flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-8 transition-all duration-200 cursor-pointer
                ${dragOver   ? 'border-primary bg-primary/10 scale-[1.01]'
                : uploading  ? 'border-primary/30 bg-primary/5 cursor-not-allowed'
                             : 'border-border-dark hover:border-primary/60 hover:bg-surface-hover/40'}`}
            >
              <div className={`size-12 rounded-full flex items-center justify-center ${dragOver ? 'bg-primary/25' : 'bg-primary/10'} text-primary`}>
                <span className="material-symbols-outlined text-[22px]">
                  {uploading ? 'sync' : dragOver ? 'file_download' : 'cloud_upload'}
                </span>
              </div>
              <div className="text-center">
                <p className="text-white text-sm font-bold">
                  {uploading ? 'Parsing resume…' : dragOver ? 'Drop to upload' : 'Click to upload or drag & drop'}
                </p>
                <p className="text-text-muted text-xs mt-1">PDF, DOCX up to 10MB</p>
              </div>
              {uploading && (
                <div className="flex flex-wrap justify-center gap-3 mt-1">
                  {['Parsing text', 'Extracting skills', 'Detecting experience'].map((s, i) => (
                    <div key={s} className="flex items-center gap-1 text-xs text-text-muted">
                      <div className="size-1.5 rounded-full bg-primary animate-pulse" style={{ animationDelay: `${i * 0.2}s` }} />
                      {s}
                    </div>
                  ))}
                </div>
              )}
              <input ref={fileRef} type="file" accept=".pdf,.doc,.docx" className="hidden" onChange={handleFile} />
            </div>
          </div>

          {/* files list */}
          <div className="bg-surface-card rounded-xl border border-border-dark p-5 flex flex-col gap-3">
            <h3 className="text-white text-base font-bold">Files</h3>

            {/* in-progress row */}
            {uploading && (
              <div className="flex flex-col gap-2 pb-3 border-b border-border-dark">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-text-muted text-[18px]">description</span>
                    <span className="text-white text-sm truncate max-w-[160px]">{uploadingFileName}</span>
                  </div>
                  <span className="text-primary text-xs font-bold">Parsing…</span>
                </div>
                <div className="w-full bg-surface-hover rounded-full h-1.5">
                  <div className="bg-primary h-1.5 rounded-full transition-all duration-500" style={{ width: `${uploadProgress}%` }} />
                </div>
              </div>
            )}

            {resumes.length === 0 && !uploading ? (
              <div className="text-center py-6">
                <span className="material-symbols-outlined text-text-muted text-[32px] block mb-2">description</span>
                <p className="text-sm text-text-muted">No resumes yet. Upload one above.</p>
              </div>
            ) : (
              <div className="flex flex-col divide-y divide-border-dark">
                {resumes.map(r => (
                  <div
                    key={r.id}
                    onClick={() => setSelectedId(r.id)}
                    className={`group flex items-center gap-3 py-3 px-2 -mx-2 cursor-pointer rounded-lg transition-colors
                      ${selectedId === r.id ? 'bg-primary/10' : 'hover:bg-surface-hover/60'}`}
                  >
                    <div className={`size-9 rounded-lg flex items-center justify-center flex-shrink-0
                      ${r.is_active ? 'bg-green-500/15 text-green-400' : 'bg-surface-hover text-text-muted'}`}>
                      <span className="material-symbols-outlined text-[18px]">
                        {r.is_active ? 'check_circle' : 'description'}
                      </span>
                    </div>

                    <div className="flex-1 min-w-0">
                      <span className="text-white text-sm font-medium block truncate max-w-[110px]">{r.file_name}</span>
                      <span className="text-xs">
                        {r.is_active
                          ? <span className="text-green-400 font-semibold">Active</span>
                          : <span className="text-text-muted">{new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>}
                      </span>
                    </div>

                    <div className="flex items-center gap-1 flex-shrink-0">
                      {resumes.length > 1 && !r.is_active && (
                        <button
                          onClick={e => { e.stopPropagation(); handleActivate(r.id); }}
                          title="Set as active"
                          className="flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-md bg-primary/15 text-primary border border-primary/30 hover:bg-primary/25 transition-colors"
                        >
                          <span className="material-symbols-outlined text-[13px]">check_circle</span>
                          Set active
                        </button>
                      )}
                      <button
                        onClick={e => { e.stopPropagation(); setConfirmDeleteId(r.id); }}
                        className="p-1.5 rounded-lg text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors"
                      >
                        <span className="material-symbols-outlined text-[15px]">delete</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Right: Extracted data ── */}
        <div className="lg:col-span-8 flex flex-col gap-5">

          <div className="flex items-center justify-between flex-wrap gap-2">
            <h2 className="text-white text-lg font-bold">Review Extracted Data</h2>
            {sel && (
              <div className="flex gap-2 flex-wrap items-center">
                <span className="px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center gap-1 border border-primary/20">
                  <span className="material-symbols-outlined text-[14px]">auto_awesome</span>
                  AI Parsed
                </span>
                {sel.file_url && (
                  <a href={sel.file_url} target="_blank" rel="noreferrer"
                    className="px-3 py-1 rounded-full bg-surface-hover text-text-muted text-xs font-medium flex items-center gap-1 hover:text-white transition-colors border border-border-dark">
                    <span className="material-symbols-outlined text-[14px]">open_in_new</span>
                    View File
                  </a>
                )}
                {resumes.length > 1 && !sel.is_active && (
                  <button
                    onClick={() => handleActivate(sel.id)}
                    className="px-3 py-1 rounded-full bg-green-500/10 text-green-400 text-xs font-bold flex items-center gap-1 hover:bg-green-500/20 transition-colors border border-green-500/25"
                  >
                    <span className="material-symbols-outlined text-[14px]">check_circle</span>
                    Set active
                  </button>
                )}
                {isDirty && (
                  <button
                    onClick={handleSaveEdits}
                    disabled={saving}
                    className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary-hover transition-colors shadow-glow disabled:opacity-60"
                  >
                    <span className="material-symbols-outlined text-[14px]">{saving ? 'sync' : 'save'}</span>
                    {saving ? 'Saving…' : 'Save Changes'}
                  </button>
                )}
              </div>
            )}
          </div>

          {!sel ? (
            <div className="bg-surface-card rounded-xl border border-border-dark p-16 text-center flex flex-col items-center justify-center">
              <div className="size-16 rounded-2xl bg-surface-hover flex items-center justify-center mx-auto mb-4">
                <span className="material-symbols-outlined text-text-muted text-[28px]">description</span>
              </div>
              <p className="text-white font-semibold mb-1">No resume selected</p>
              <p className="text-text-muted text-sm">Upload a resume to see the extracted data here.</p>
            </div>
          ) : (
            <>
              {/* personal info */}
              {(parsedName || parsedEmail) && (
                <div className="bg-surface-card rounded-xl border border-border-dark p-5">
                  <div className="flex gap-4 items-center">
                    <div className="size-14 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
                      <span className="material-symbols-outlined text-primary text-[26px]">person</span>
                    </div>
                    <div>
                      {parsedName  && <h3 className="text-white text-lg font-bold">{parsedName}</h3>}
                      {parsedEmail && (
                        <div className="flex items-center gap-1 text-text-muted text-sm mt-0.5">
                          <span className="material-symbols-outlined text-[15px]">email</span>
                          {parsedEmail}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* skills */}
              <div className="bg-surface-card rounded-xl border border-border-dark p-5">
                <h4 className="text-white text-sm font-bold mb-4 flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary text-[18px]">psychology</span>
                  Skills
                  <span className="ml-auto text-xs text-text-muted font-normal">{skills.length} detected</span>
                </h4>
                {skills.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {skills.map(s => (
                      <span key={s} className="px-3 py-1.5 rounded-lg bg-surface-hover border border-border-dark text-white text-sm font-medium">{s}</span>
                    ))}
                  </div>
                ) : (
                  <p className="text-text-muted text-sm">No skills detected. Make sure your resume lists your technical skills clearly.</p>
                )}
              </div>

              {/* ── experience ── */}
              <div className="bg-surface-card rounded-xl border border-border-dark p-5">
                <div className="flex items-center gap-2 mb-4">
                  <div className="size-8 rounded-lg bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                    <span className="material-symbols-outlined text-blue-400 text-[18px]">work</span>
                  </div>
                  <div className="flex-1">
                    <h4 className="text-white text-sm font-bold">Work Experience</h4>
                    {yearsExp > 0 && <p className="text-text-muted text-xs">{yearsExp} yr{yearsExp !== 1 ? 's' : ''} total detected</p>}
                  </div>
                  <button
                    onClick={() => openEditWork(-1)}
                    className="flex items-center gap-1 text-xs text-primary hover:text-white px-2.5 py-1.5 rounded-lg hover:bg-primary/15 transition-colors border border-primary/20"
                  >
                    <span className="material-symbols-outlined text-[14px]">add</span>
                    Add Entry
                  </button>
                </div>

                {/* add / edit form */}
                {editWorkIdx !== null && (
                  <div className="mb-4 p-4 rounded-xl bg-surface-hover border border-primary/20 flex flex-col gap-3">
                    <p className="text-xs font-semibold text-primary uppercase tracking-wider">
                      {editWorkIdx === -1 ? '+ New Work Entry' : 'Edit Work Entry'}
                    </p>
                    <input
                      value={workForm.title}
                      onChange={e => setWorkForm(f => ({ ...f, title: e.target.value }))}
                      placeholder="Job Title (e.g. Software Engineer)"
                      className="w-full px-3 py-2 rounded-lg bg-surface-card border border-border-dark text-white text-sm placeholder:text-text-muted focus:outline-none focus:border-primary"
                    />
                    <input
                      value={workForm.company}
                      onChange={e => setWorkForm(f => ({ ...f, company: e.target.value }))}
                      placeholder="Company (e.g. TalentCorp Sdn Bhd)"
                      className="w-full px-3 py-2 rounded-lg bg-surface-card border border-border-dark text-white text-sm placeholder:text-text-muted focus:outline-none focus:border-primary"
                    />
                    <input
                      value={workForm.period}
                      onChange={e => setWorkForm(f => ({ ...f, period: e.target.value }))}
                      placeholder="Period (e.g. Jan 2022 – Present)"
                      className="w-full px-3 py-2 rounded-lg bg-surface-card border border-border-dark text-white text-sm placeholder:text-text-muted focus:outline-none focus:border-primary"
                    />
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => setEditWorkIdx(null)}
                        className="px-3 py-1.5 rounded-lg bg-surface-card border border-border-dark text-text-muted text-xs hover:text-white transition-colors">
                        Cancel
                      </button>
                      <button onClick={saveWork}
                        className="px-4 py-1.5 rounded-lg bg-primary text-white text-xs font-bold hover:bg-primary-hover transition-colors">
                        {editWorkIdx === -1 ? 'Add' : 'Save'}
                      </button>
                    </div>
                  </div>
                )}

                {localWork.length > 0 ? (
                  <div className="flex flex-col gap-3">
                    {localWork.map((wh, i) => (
                      <div key={i} className="group/entry flex items-start gap-3 p-3 rounded-xl bg-bg-dark border border-border-dark hover:border-border-mid transition-colors">
                        <div className={`size-9 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${i === 0 ? 'bg-primary/15 border border-primary/30' : 'bg-surface-hover border border-border-dark'}`}>
                          <span className={`material-symbols-outlined text-[16px] ${i === 0 ? 'text-primary' : 'text-text-muted'}`}>work</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-white font-semibold text-sm leading-snug">{wh.title}</p>
                          {wh.company && <p className="text-primary text-xs font-medium mt-0.5">{wh.company}</p>}
                          {wh.period  && (
                            <p className="text-text-muted text-xs mt-1 flex items-center gap-1">
                              <span className="material-symbols-outlined text-[12px]">calendar_today</span>
                              {wh.period}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover/entry:opacity-100 transition-opacity flex-shrink-0">
                          <button onClick={() => openEditWork(i)}
                            className="p-1.5 rounded-lg text-text-muted hover:text-white hover:bg-surface-hover transition-colors">
                            <span className="material-symbols-outlined text-[14px]">edit</span>
                          </button>
                          <button onClick={() => deleteWork(i)}
                            className="p-1.5 rounded-lg text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors">
                            <span className="material-symbols-outlined text-[14px]">delete</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 border border-dashed border-border-dark rounded-xl">
                    <span className="material-symbols-outlined text-text-muted text-[28px] block mb-2">work_history</span>
                    <p className="text-text-muted text-sm mb-1">
                      {yearsExp > 0
                        ? `${yearsExp} yr${yearsExp !== 1 ? 's' : ''} detected — individual jobs couldn't be parsed`
                        : 'No work experience entries found'}
                    </p>
                    <p className="text-text-muted text-xs mb-3">Add your jobs manually to improve match accuracy</p>
                    <button onClick={() => openEditWork(-1)}
                      className="text-xs text-primary hover:text-white px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/20 transition-colors">
                      Add manually
                    </button>
                  </div>
                )}
              </div>

              {/* ── education ── */}
              <div className="bg-surface-card rounded-xl border border-border-dark p-5">
                <div className="flex items-center gap-2 mb-4">
                  <div className="size-8 rounded-lg bg-green-500/10 flex items-center justify-center flex-shrink-0">
                    <span className="material-symbols-outlined text-green-400 text-[18px]">school</span>
                  </div>
                  <h4 className="text-white text-sm font-bold flex-1">Education</h4>
                  <button
                    onClick={() => openEditEdu(-1)}
                    className="flex items-center gap-1 text-xs text-primary hover:text-white px-2.5 py-1.5 rounded-lg hover:bg-primary/15 transition-colors border border-primary/20"
                  >
                    <span className="material-symbols-outlined text-[14px]">add</span>
                    Add Entry
                  </button>
                </div>

                {/* add / edit form */}
                {editEduIdx !== null && (
                  <div className="mb-4 p-4 rounded-xl bg-surface-hover border border-primary/20 flex flex-col gap-3">
                    <p className="text-xs font-semibold text-primary uppercase tracking-wider">
                      {editEduIdx === -1 ? '+ New Education Entry' : 'Edit Education Entry'}
                    </p>
                    <input
                      value={eduForm.degree}
                      onChange={e => setEduForm(f => ({ ...f, degree: e.target.value }))}
                      placeholder="Degree (e.g. Bachelor of Computer Science)"
                      className="w-full px-3 py-2 rounded-lg bg-surface-card border border-border-dark text-white text-sm placeholder:text-text-muted focus:outline-none focus:border-primary"
                    />
                    <input
                      value={eduForm.institution}
                      onChange={e => setEduForm(f => ({ ...f, institution: e.target.value }))}
                      placeholder="Institution (e.g. Universiti Tun Hussein Onn Malaysia)"
                      className="w-full px-3 py-2 rounded-lg bg-surface-card border border-border-dark text-white text-sm placeholder:text-text-muted focus:outline-none focus:border-primary"
                    />
                    <input
                      value={eduForm.year ?? ''}
                      onChange={e => setEduForm(f => ({ ...f, year: e.target.value }))}
                      placeholder="Year (e.g. 2020 – 2024)"
                      className="w-full px-3 py-2 rounded-lg bg-surface-card border border-border-dark text-white text-sm placeholder:text-text-muted focus:outline-none focus:border-primary"
                    />
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => setEditEduIdx(null)}
                        className="px-3 py-1.5 rounded-lg bg-surface-card border border-border-dark text-text-muted text-xs hover:text-white transition-colors">
                        Cancel
                      </button>
                      <button onClick={saveEdu}
                        className="px-4 py-1.5 rounded-lg bg-primary text-white text-xs font-bold hover:bg-primary-hover transition-colors">
                        {editEduIdx === -1 ? 'Add' : 'Save'}
                      </button>
                    </div>
                  </div>
                )}

                {localEdu.length > 0 ? (
                  <div className="flex flex-col gap-3">
                    {localEdu.map((edu, i) => (
                      <div key={i} className="group/entry flex items-start gap-3 p-3 rounded-xl bg-bg-dark border border-border-dark hover:border-border-mid transition-colors">
                        <div className="size-9 rounded-lg bg-green-500/10 border border-green-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <span className="material-symbols-outlined text-green-400 text-[16px]">account_balance</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          {edu.degree      && <p className="text-white text-sm font-semibold leading-snug">{edu.degree}</p>}
                          {edu.institution && <p className="text-primary text-xs font-medium mt-0.5">{edu.institution}</p>}
                          {edu.year        && (
                            <p className="text-text-muted text-xs mt-1 flex items-center gap-1">
                              <span className="material-symbols-outlined text-[12px]">calendar_today</span>
                              {edu.year}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover/entry:opacity-100 transition-opacity flex-shrink-0">
                          <button onClick={() => openEditEdu(i)}
                            className="p-1.5 rounded-lg text-text-muted hover:text-white hover:bg-surface-hover transition-colors">
                            <span className="material-symbols-outlined text-[14px]">edit</span>
                          </button>
                          <button onClick={() => deleteEdu(i)}
                            className="p-1.5 rounded-lg text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors">
                            <span className="material-symbols-outlined text-[14px]">delete</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : legacyEdu.length > 0 ? (
                  <div className="flex flex-col gap-3">
                    {legacyEdu.map((e, i) => (
                      <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-bg-dark border border-border-dark">
                        <div className="size-9 rounded-lg bg-green-500/10 border border-green-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <span className="material-symbols-outlined text-green-400 text-[16px]">account_balance</span>
                        </div>
                        <p className="text-white text-sm leading-snug pt-1">{e}</p>
                      </div>
                    ))}
                    <p className="text-text-muted text-xs">Click <span className="text-primary font-medium">Add Entry</span> above to add structured entries.</p>
                  </div>
                ) : (
                  <div className="text-center py-8 border border-dashed border-border-dark rounded-xl">
                    <span className="material-symbols-outlined text-text-muted text-[28px] block mb-2">school</span>
                    <p className="text-text-muted text-sm mb-1">No education details found</p>
                    <p className="text-text-muted text-xs mb-3">Add your qualifications manually</p>
                    <button onClick={() => openEditEdu(-1)}
                      className="text-xs text-primary hover:text-white px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/20 transition-colors">
                      Add manually
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── skeleton ──────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="max-w-[1200px] mx-auto flex flex-col gap-6">
      <div className="h-9 bg-surface-card rounded-xl animate-pulse w-64" />
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-4 flex flex-col gap-5">
          <div className="bg-surface-card rounded-xl border border-border-dark p-5 animate-pulse h-52" />
          <div className="bg-surface-card rounded-xl border border-border-dark p-5 animate-pulse h-40" />
        </div>
        <div className="lg:col-span-8 flex flex-col gap-5">
          <div className="h-8 bg-surface-card rounded-xl animate-pulse w-48" />
          <div className="bg-surface-card rounded-xl border border-border-dark p-5 animate-pulse h-24" />
          <div className="bg-surface-card rounded-xl border border-border-dark p-5 animate-pulse h-40" />
          <div className="bg-surface-card rounded-xl border border-border-dark p-5 animate-pulse h-36" />
        </div>
      </div>
    </div>
  );
}
