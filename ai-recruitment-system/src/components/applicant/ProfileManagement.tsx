import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { apiUpdateProfile } from '../../api';

export function ProfileManagement() {
  const { user, accessToken, refreshProfile } = useAuth();
  const [name, setName] = useState(user?.name || '');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);

  useEffect(() => { if (user) setName(user.name); }, [user]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessToken || !name.trim()) return;
    setSaving(true); setMessage('');
    try {
      await apiUpdateProfile(accessToken, name.trim());
      await refreshProfile();
      setMessage('Profile updated successfully.'); setIsError(false);
    } catch (e: any) { setMessage(e.message || 'Failed to update profile.'); setIsError(true); }
    finally { setSaving(false); }
  };

  const initials = user?.name?.split(' ').map(n => n[0]).slice(0,2).join('').toUpperCase() || '?';

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h2 className="page-title">Profile settings</h2>
        <p className="page-subtitle">Manage your account information</p>
      </div>

      {/* Avatar card */}
      <div className="card-dark p-6 mb-4 flex items-center gap-5">
        <div className="size-16 rounded-full bg-primary/20 border-2 border-primary/40 flex items-center justify-center text-xl font-black text-primary flex-shrink-0">
          {initials}
        </div>
        <div>
          <p className="font-bold text-white text-lg">{user?.name}</p>
          <p className="text-sm text-text-muted">{user?.email}</p>
          <span className={`mt-1 badge-score inline-flex ${user?.role === 'hr' ? 'badge-top' : 'badge-strong'}`}>
            {user?.role === 'hr' ? 'HR Manager' : 'Job Seeker'}
          </span>
        </div>
      </div>

      {/* Edit form */}
      <div className="card-dark p-6">
        <h3 className="font-semibold text-white mb-5">Edit profile</h3>
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-xs text-text-muted mb-1.5 font-medium">Full name</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-text-muted ms-sm">person</span>
              <input type="text" value={name} onChange={e => setName(e.target.value)}
                className="input-dark pl-10" required />
            </div>
          </div>

          <div>
            <label className="block text-xs text-text-muted mb-1.5 font-medium">Email address</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-text-muted ms-sm">mail</span>
              <input type="email" value={user?.email || ''} disabled
                className="input-dark pl-10 opacity-50 cursor-not-allowed" />
            </div>
            <p className="text-xs text-text-muted mt-1">Email address cannot be changed.</p>
          </div>

          <div>
            <label className="block text-xs text-text-muted mb-1.5 font-medium">Account type</label>
            <div className="flex items-center gap-2 px-4 py-2.5 bg-surface-hover border border-border-dark rounded-xl">
              <span className="material-symbols-outlined ms-sm text-primary">{user?.role === 'hr' ? 'badge' : 'person_search'}</span>
              <span className="text-sm text-white">{user?.role === 'hr' ? 'HR Manager' : 'Job Seeker'}</span>
            </div>
          </div>

          {message && (
            <div className={`flex items-center gap-2 p-3 rounded-xl text-sm border ${
              isError ? 'bg-red-500/10 border-red-500/25 text-red-400' : 'bg-green-500/10 border-green-500/25 text-green-400'
            }`}>
              <span className="material-symbols-outlined ms-sm">{isError ? 'error' : 'check_circle'}</span>
              {message}
            </div>
          )}

          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? <><span className="material-symbols-outlined animate-spin ms-sm">refresh</span>Saving…</> : 'Save changes'}
          </button>
        </form>
      </div>

      {/* AI info card */}
      <div className="card-dark p-6 mt-4 border-primary/20">
        <div className="flex items-center gap-2 mb-3">
          <span className="material-symbols-outlined text-primary ms-sm">auto_awesome</span>
          <h3 className="font-semibold text-white text-sm">How AI matching works</h3>
        </div>
        <p className="text-sm text-text-muted leading-relaxed mb-3">
          ResumeAI uses sentence-transformer embeddings and NLP to analyse your resume and match it against job requirements.
        </p>
        <div className="space-y-2">
          {[
            'Extracts 500+ technical and soft skills from your resume',
            'Computes semantic similarity — understands "React" ≈ "frontend development"',
            'Scores your experience level against each job\'s requirements',
            'Explains exactly why a job is or isn\'t a good fit',
          ].map(t => (
            <div key={t} className="flex items-start gap-2 text-xs text-text-muted">
              <span className="material-symbols-outlined text-green-400 ms-sm mt-0.5 flex-shrink-0">check</span>
              {t}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
