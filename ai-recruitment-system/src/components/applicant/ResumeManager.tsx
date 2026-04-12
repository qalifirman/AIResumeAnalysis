import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { apiGetResumes, apiUploadResume, apiSaveResume, apiActivateResume, apiDeleteResume } from '../../api';
import { parseResumeFile, validateResumeFile } from '../../utils/pdf-parser';
import { parseResume } from '../../utils/ai/nlp-engine';
import type { Resume } from '../../types';

export function ResumeManager() {
  const { accessToken } = useAuth();
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { load(); }, []);

  const load = async () => {
    if (!accessToken) return;
    try { setResumes(await apiGetResumes(accessToken)); }
    catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const v = validateResumeFile(file);
    if (!v.valid) { setError(v.error || 'Invalid file'); return; }

    setError(''); setSuccess(''); setUploading(true);
    try {
      // Parse locally
      const rawText = await parseResumeFile(file);
      const parsed = parseResume(rawText);

      // Upload to storage
      const { filePath, fileUrl } = await apiUploadResume(accessToken!, file);

      // Save record
      const resume = await apiSaveResume(accessToken!, {
        fileName: file.name,
        filePath,
        fileUrl,
        parsedData: {
          skills: parsed.skills,
          yearsOfExperience: parsed.yearsOfExperience,
          rawText: parsed.rawText,
          education: parsed.education,
        },
      });
      setResumes(r => [resume, ...r]);
      setSuccess(`"${file.name}" uploaded successfully! Detected ${parsed.skills.length} skills.`);
    } catch (e: any) { setError(e.message); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ''; }
  };

  const handleActivate = async (id: string) => {
    if (!accessToken) return;
    try {
      await apiActivateResume(accessToken, id);
      setResumes(rs => rs.map(r => ({ ...r, is_active: r.id === id })));
    } catch (e: any) { setError(e.message); }
  };

  const handleDelete = async (id: string) => {
    if (!accessToken || !confirm('Delete this resume?')) return;
    try {
      await apiDeleteResume(accessToken, id);
      setResumes(rs => rs.filter(r => r.id !== id));
    } catch (e: any) { setError(e.message); }
  };

  if (loading) return <Skeleton />;

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h2 className="page-title">Resume manager</h2>
        <p className="page-subtitle">Upload your CV — our AI will extract your skills automatically</p>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/25 rounded-xl text-sm text-red-400 mb-4">
          <span className="material-symbols-outlined ms-sm">error</span>
          <span className="flex-1">{error}</span>
          <button onClick={() => setError('')}><span className="material-symbols-outlined ms-sm">close</span></button>
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 p-3 bg-green-500/10 border border-green-500/25 rounded-xl text-sm text-green-400 mb-4">
          <span className="material-symbols-outlined ms-sm fill">check_circle</span>
          <span>{success}</span>
        </div>
      )}

      {/* Upload area */}
      <div
        onClick={() => fileRef.current?.click()}
        className="card-dark p-8 text-center cursor-pointer hover:bg-surface-hover hover:border-border-mid transition-all border-dashed mb-6 group"
      >
        <div className="size-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-4 group-hover:bg-primary/20 transition-colors">
          {uploading
            ? <span className="material-symbols-outlined ms-lg text-primary animate-spin">refresh</span>
            : <span className="material-symbols-outlined ms-lg text-primary">upload_file</span>}
        </div>
        <h3 className="font-semibold text-white mb-1">
          {uploading ? 'Parsing your resume…' : 'Upload resume'}
        </h3>
        <p className="text-sm text-text-muted mb-4">
          {uploading ? 'Extracting skills and experience…' : 'Drag & drop or click to browse. PDF or DOCX, max 10MB.'}
        </p>
        {!uploading && (
          <span className="btn-primary inline-flex mx-auto pointer-events-none">
            <span className="material-symbols-outlined ms-sm">add</span>
            Choose file
          </span>
        )}
        <input ref={fileRef} type="file" accept=".pdf,.doc,.docx" className="hidden" onChange={handleFile} />
      </div>

      {/* Resume list */}
      {resumes.length === 0 ? (
        <div className="card-dark p-8 text-center">
          <span className="material-symbols-outlined ms-lg text-text-muted mb-2 block">description</span>
          <p className="text-sm text-text-muted">No resumes uploaded yet. Upload one above to get started.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {resumes.map(r => (
            <div key={r.id} className={`card-dark p-5 transition-all ${r.is_active ? 'border-primary/40' : ''}`}>
              <div className="flex items-start gap-4">
                <div className={`size-11 rounded-xl flex items-center justify-center flex-shrink-0 ${r.is_active ? 'bg-primary/20' : 'bg-surface-hover'}`}>
                  <span className={`material-symbols-outlined ${r.is_active ? 'text-primary fill' : 'text-text-muted'}`}>description</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-white text-sm truncate">{r.file_name}</span>
                    {r.is_active && <span className="badge-strong">Active</span>}
                  </div>
                  <p className="text-xs text-text-muted mt-0.5">
                    Uploaded {new Date(r.created_at).toLocaleDateString()}
                    {r.parsed_data?.skills?.length > 0 && ` · ${r.parsed_data.skills.length} skills detected`}
                    {r.parsed_data?.yearsOfExperience > 0 && ` · ${r.parsed_data.yearsOfExperience} yrs exp`}
                  </p>
                  {r.parsed_data?.skills?.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {r.parsed_data.skills.slice(0, 6).map(s => (
                        <span key={s} className="px-2 py-0.5 text-xs bg-surface-hover text-text-muted rounded-md border border-border-dark">{s}</span>
                      ))}
                      {r.parsed_data.skills.length > 6 && (
                        <span className="text-xs text-text-muted">+{r.parsed_data.skills.length - 6}</span>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {!r.is_active && (
                    <button onClick={() => handleActivate(r.id)}
                      className="px-3 py-1.5 text-xs bg-primary/15 border border-primary/30 text-violet-300 rounded-lg hover:bg-primary/25 transition-colors">
                      Set active
                    </button>
                  )}
                  {r.file_url && (
                    <a href={r.file_url} target="_blank" rel="noreferrer"
                      className="p-2 text-text-muted hover:text-white hover:bg-surface-hover rounded-lg transition-colors">
                      <span className="material-symbols-outlined ms-sm">open_in_new</span>
                    </a>
                  )}
                  <button onClick={() => handleDelete(r.id)}
                    className="p-2 text-text-muted hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors">
                    <span className="material-symbols-outlined ms-sm">delete</span>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Skeleton() {
  return (
    <div className="max-w-3xl space-y-3">
      <div className="card-dark p-8 animate-pulse h-40" />
      {[...Array(2)].map((_, i) => <div key={i} className="card-dark p-5 animate-pulse h-20" />)}
    </div>
  );
}
