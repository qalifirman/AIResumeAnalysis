import React, { useState, useEffect, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import ReactCrop, { type Crop, centerCrop, makeAspectCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { apiUpdateProfile, apiUploadAvatar, apiGetResumes, apiActivateResume, apiDeleteResume } from '../../api';
import { ConfirmModal } from '../ui/confirm-modal';
import type { Resume } from '../../types';

interface ProfileManagementProps {
  onNavigate?: (tab: string) => void;
}

export function ProfileManagement({ onNavigate }: ProfileManagementProps) {
  const { user, accessToken, refreshProfile, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();

  // Form state
  const [name,     setName]     = useState(user?.name     || '');
  const [phone,    setPhone]    = useState(user?.phone    || '');
  const [location, setLocation] = useState(user?.location || '');
  const [headline, setHeadline] = useState(user?.headline || '');
  const [bio,      setBio]      = useState(user?.bio      || '');
  const [linkedin, setLinkedin] = useState(user?.linkedin || '');

  const [saving,           setSaving]          = useState(false);
  const [avatarUploading,  setAvatarUploading] = useState(false);
  const [avatarPreview,    setAvatarPreview]   = useState<string | null>(user?.avatar_url ?? null);
  const [confirmDeleteId,  setConfirmDeleteId] = useState<string | null>(null);

  // Crop modal state
  const [cropSrc,          setCropSrc]         = useState<string | null>(null);
  const [crop,             setCrop]            = useState<Crop>();
  const [pendingFile,      setPendingFile]      = useState<File | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  // Resume history
  const [resumes,         setResumes]         = useState<Resume[]>([]);
  const [resumesLoading,  setResumesLoading]  = useState(true);

  const avatarInputRef = useRef<HTMLInputElement>(null);

  // Sync form when user loads / refreshes
  useEffect(() => {
    if (user) {
      setName(user.name || '');
      setPhone(user.phone || '');
      setLocation(user.location || '');
      setHeadline(user.headline || '');
      setBio(user.bio || '');
      setLinkedin(user.linkedin || '');
      setAvatarPreview(user.avatar_url ?? null);
    }
  }, [user]);

  useEffect(() => {
    if (!accessToken) return;
    apiGetResumes(accessToken)
      .then(setResumes)
      .catch(() => {})
      .finally(() => setResumesLoading(false));
  }, [accessToken]);

  const handleSave = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!accessToken || !name.trim()) return;
    setSaving(true);
    try {
      const updated = await apiUpdateProfile(accessToken, {
        name: name.trim(), phone, location, headline, bio, linkedin,
      });
      await refreshProfile(updated);
      toast.success('Profile updated successfully.');
    } catch (err: any) {
      toast.error(err.message || 'Failed to update profile.');
    } finally { setSaving(false); }
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !accessToken) return;
    if (!file.type.startsWith('image/')) { toast.error('Please select an image file.'); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error('Image must be under 5 MB.'); return; }
    const url = URL.createObjectURL(file);
    setCropSrc(url);
    setPendingFile(file);
    if (avatarInputRef.current) avatarInputRef.current.value = '';
  };

  const onImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const { width, height } = e.currentTarget;
    const initialCrop = centerCrop(makeAspectCrop({ unit: '%', width: 90 }, 1, width, height), width, height);
    setCrop(initialCrop);
  }, []);

  const handleCropConfirm = async () => {
    if (!imgRef.current || !crop || !pendingFile || !accessToken) return;
    const canvas = document.createElement('canvas');
    const size = 400;
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(
      imgRef.current,
      (crop.x / 100) * imgRef.current.naturalWidth,
      (crop.y / 100) * imgRef.current.naturalHeight,
      (crop.width / 100) * imgRef.current.naturalWidth,
      (crop.height / 100) * imgRef.current.naturalHeight,
      0, 0, size, size,
    );
    canvas.toBlob(async (blob) => {
      if (!blob) return;
      const croppedFile = new File([blob], pendingFile.name, { type: 'image/jpeg' });
      setCropSrc(null); setPendingFile(null);
      setAvatarUploading(true);
      setAvatarPreview(URL.createObjectURL(blob));
      try {
        const { avatar_url } = await apiUploadAvatar(accessToken, croppedFile);
        setAvatarPreview(avatar_url);
        await refreshProfile();
        toast.success('Profile photo updated.');
      } catch (err: any) {
        setAvatarPreview(user?.avatar_url ?? null);
        toast.error(err.message || 'Failed to upload photo.');
      } finally { setAvatarUploading(false); }
    }, 'image/jpeg', 0.92);
  };

  const handleActivate = async (id: string) => {
    if (!accessToken) return;
    await apiActivateResume(accessToken, id);
    setResumes(rs => rs.map(r => ({ ...r, is_active: r.id === id })));
    toast.success('Resume set as active.');
  };

  const handleDeleteResume = async (id: string) => {
    if (!accessToken) return;
    await apiDeleteResume(accessToken, id);
    setResumes(rs => rs.filter(r => r.id !== id));
    toast.success('Resume deleted.');
    setConfirmDeleteId(null);
  };

  const initials  = user?.name?.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase() || '?';
  const isHR      = user?.role === 'hr';
  const memberSince = user?.created_at
    ? new Date(user.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : '—';

  return (
    <form onSubmit={handleSave} className="flex flex-col gap-6 max-w-[860px] mx-auto pb-8">
      <ConfirmModal
        open={confirmDeleteId !== null}
        title="Delete resume?"
        message="This will permanently remove the resume file and cannot be undone."
        confirmLabel="Delete"
        onConfirm={() => confirmDeleteId && handleDeleteResume(confirmDeleteId)}
        onCancel={() => setConfirmDeleteId(null)}
      />

      {/* ── Crop Modal ── */}
      {cropSrc && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface-dark border border-border-dark rounded-2xl p-6 w-full max-w-md shadow-card">
            <h3 className="text-white font-bold text-lg mb-4">Crop Photo</h3>
            <div className="flex justify-center mb-5">
              <ReactCrop crop={crop} onChange={c => setCrop(c)} aspect={1} circularCrop>
                <img ref={imgRef} src={cropSrc} alt="Crop preview" onLoad={onImageLoad}
                  className="max-h-64 rounded-xl object-contain" />
              </ReactCrop>
            </div>
            <div className="flex gap-3">
              <button type="button" onClick={() => { setCropSrc(null); setPendingFile(null); }}
                className="flex-1 h-11 rounded-xl border border-border-dark text-white text-sm font-medium hover:bg-surface-hover transition-colors">
                Cancel
              </button>
              <button type="button" onClick={handleCropConfirm}
                className="flex-1 h-11 rounded-xl bg-primary hover:bg-primary-hover text-white text-sm font-bold transition-colors">
                Apply Crop
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Profile hero card ── */}
      <div className="bg-surface-card rounded-xl border border-border-dark relative overflow-hidden">
        {/* Gradient banner */}
        <div className="absolute top-0 left-0 w-full h-24 bg-gradient-to-r from-primary/25 to-indigo-400/10 opacity-70 pointer-events-none" />

        <div className="relative flex flex-col md:flex-row gap-5 items-start md:items-end p-6 pt-10">
          {/* Avatar */}
          <div className="relative flex-shrink-0">
            {avatarPreview ? (
              <img
                src={avatarPreview}
                alt="Profile"
                className="size-28 rounded-full object-cover border-4 border-surface-card shadow-lg"
              />
            ) : (
              <div className="size-28 rounded-full bg-primary/20 border-4 border-surface-card flex items-center justify-center text-3xl font-black text-primary shadow-lg">
                {initials}
              </div>
            )}
            {/* Upload spinner overlay */}
            {avatarUploading && (
              <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center">
                <span className="material-symbols-outlined text-white text-[28px] animate-spin">refresh</span>
              </div>
            )}
            <button
              type="button"
              onClick={() => avatarInputRef.current?.click()}
              disabled={avatarUploading}
              className="absolute bottom-1 right-1 size-8 rounded-full bg-primary hover:bg-primary-hover flex items-center justify-center text-white shadow-md transition-colors disabled:opacity-60"
              title="Change profile photo"
            >
              <span className="material-symbols-outlined text-[18px]">photo_camera</span>
            </button>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={handleAvatarChange}
            />
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0 pb-1">
            <div className="flex flex-wrap items-center gap-3 mb-1">
              <h1 className="text-white text-2xl font-bold tracking-tight">{user?.name || '—'}</h1>
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold
                ${isHR ? 'bg-violet-500/15 text-violet-300 border border-violet-500/25'
                       : 'bg-blue-500/15 text-blue-300 border border-blue-500/25'}`}>
                {isHR ? 'HR Manager' : 'Applicant'}
              </span>
            </div>
            {headline && <p className="text-text-muted text-sm">{headline}</p>}
            <p className="text-text-muted text-xs mt-1.5 flex items-center gap-1">
              <span className="material-symbols-outlined text-[15px]">calendar_month</span>
              Member since {memberSince}
            </p>
          </div>
        </div>
      </div>

      {/* ── Personal Details ── */}
      <div className="bg-surface-card rounded-xl border border-border-dark overflow-hidden">
        <div className="px-6 py-4 border-b border-border-dark flex justify-between items-center">
          <h2 className="text-white text-base font-bold">Personal Details</h2>
        </div>

        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Full Name */}
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">Full Name</span>
            <div className="relative">
              <span className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                <span className="material-symbols-outlined text-text-muted text-[18px]">person</span>
              </span>
              <input
                type="text" required
                value={name} onChange={e => setName(e.target.value)}
                className="input-dark pl-10 w-full"
                placeholder="Your full name"
              />
            </div>
          </label>

          {/* Email (readonly) */}
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">Email Address</span>
            <div className="relative">
              <span className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                <span className="material-symbols-outlined text-text-muted text-[18px]">mail</span>
              </span>
              <input
                type="email" disabled
                value={user?.email || ''}
                className="input-dark pl-10 w-full opacity-50 cursor-not-allowed"
              />
            </div>
            <p className="text-xs text-text-muted flex items-center gap-1">
              <span className="material-symbols-outlined text-[13px]">info</span>
              Email cannot be changed.
            </p>
          </label>

          {/* Professional Headline */}
          <label className="flex flex-col gap-1.5 md:col-span-2">
            <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">Professional Headline</span>
            <input
              type="text"
              value={headline} onChange={e => setHeadline(e.target.value)}
              className="input-dark w-full"
              placeholder="e.g. Software Engineer specializing in React & Node.js"
            />
          </label>

          {/* Phone */}
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">Phone Number</span>
            <div className="relative">
              <span className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                <span className="material-symbols-outlined text-text-muted text-[18px]">call</span>
              </span>
              <input
                type="tel"
                value={phone} onChange={e => setPhone(e.target.value)}
                className="input-dark pl-10 w-full"
                placeholder="+60 12-345 6789"
              />
            </div>
          </label>

          {/* Location */}
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">Location</span>
            <div className="relative">
              <span className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                <span className="material-symbols-outlined text-text-muted text-[18px]">location_on</span>
              </span>
              <input
                type="text"
                value={location} onChange={e => setLocation(e.target.value)}
                className="input-dark pl-10 w-full"
                placeholder="e.g. Johor Bahru, Malaysia"
              />
            </div>
          </label>

          {/* LinkedIn / Portfolio */}
          <label className="flex flex-col gap-1.5 md:col-span-2">
            <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">Portfolio / LinkedIn</span>
            <div className="relative">
              <span className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                <span className="material-symbols-outlined text-text-muted text-[18px]">link</span>
              </span>
              <input
                type="text"
                value={linkedin} onChange={e => setLinkedin(e.target.value)}
                className="input-dark pl-10 w-full"
                placeholder="https://linkedin.com/in/yourprofile"
              />
            </div>
          </label>

          {/* Bio */}
          <label className="flex flex-col gap-1.5 md:col-span-2">
            <div className="flex justify-between">
              <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">Bio</span>
              <span className="text-xs text-text-muted">{bio.length}/500</span>
            </div>
            <textarea
              rows={4} maxLength={500}
              value={bio} onChange={e => setBio(e.target.value)}
              className="input-dark w-full resize-none"
              placeholder="Tell employers a bit about yourself…"
            />
          </label>
        </div>
      </div>

      {/* ── Resume History ── */}
      <div className="bg-surface-card rounded-xl border border-border-dark overflow-hidden">
        <div className="px-6 py-4 border-b border-border-dark flex justify-between items-center">
          <h2 className="text-white text-base font-bold">Resume History</h2>
          <button type="button" onClick={() => onNavigate?.('resumes')}
            className="text-primary hover:text-white text-sm font-medium flex items-center gap-1 transition-colors">
            <span className="material-symbols-outlined text-[16px]">add</span>
            Upload New
          </button>
        </div>

        {resumesLoading ? (
          <div className="p-6 space-y-3">
            {[...Array(2)].map((_, i) => (
              <div key={i} className="h-16 bg-surface-hover rounded-xl animate-pulse" />
            ))}
          </div>
        ) : resumes.length === 0 ? (
          <div className="p-10 text-center">
            <span className="material-symbols-outlined text-text-muted text-[32px] block mb-2">description</span>
            <p className="text-text-muted text-sm">No resumes uploaded yet.</p>
          </div>
        ) : (
          <div className="flex flex-col divide-y divide-border-dark">
            {resumes.map(r => (
              <div key={r.id} className="flex flex-col sm:flex-row items-start sm:items-center justify-between px-6 py-4 hover:bg-surface-hover/40 transition-colors gap-3">
                <div className="flex items-center gap-4">
                  <div className="size-10 rounded-lg bg-red-500/10 flex items-center justify-center text-red-400 flex-shrink-0">
                    <span className="material-symbols-outlined text-[20px]">description</span>
                  </div>
                  <div>
                    <p className="text-white font-medium text-sm">{r.file_name}</p>
                    <div className="flex items-center gap-2 text-xs text-text-muted mt-0.5">
                      <span>Uploaded {new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                      {(r.parsed_data?.skills?.length || 0) > 0 && (
                        <>
                          <span className="size-1 bg-border-dark rounded-full" />
                          <span>{r.parsed_data.skills.length} skills</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
                  {r.is_active ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-green-500/10 text-green-400 border border-green-500/25">
                      <span className="material-symbols-outlined text-[13px]">check_circle</span>
                      Active
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleActivate(r.id)}
                      className="px-2.5 py-1 rounded-lg text-xs font-medium bg-surface-hover border border-border-dark text-text-muted hover:text-white hover:border-primary/40 transition-colors"
                    >
                      Set Active
                    </button>
                  )}
                  <div className="flex items-center gap-1">
                    {r.file_url && (
                      <a href={r.file_url} target="_blank" rel="noreferrer"
                        className="p-2 text-text-muted hover:text-primary rounded-lg hover:bg-surface-hover transition-colors">
                        <span className="material-symbols-outlined text-[18px]">visibility</span>
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(r.id)}
                      className="p-2 text-text-muted hover:text-red-400 rounded-lg hover:bg-red-500/10 transition-colors"
                    >
                      <span className="material-symbols-outlined text-[18px]">delete</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Appearance ── */}
      <div className="bg-surface-card rounded-xl border border-border-dark overflow-hidden">
        <div className="px-6 py-4 border-b border-border-dark">
          <h2 className="text-white text-base font-bold">Appearance</h2>
        </div>
        <div className="p-6">
          <div className="flex items-center justify-between p-4 bg-surface-hover rounded-xl border border-border-dark">
            <div className="flex items-center gap-3">
              <div className={`size-9 rounded-lg flex items-center justify-center ${theme === 'dark' ? 'bg-primary/15' : 'bg-amber-500/10'}`}>
                <span className={`material-symbols-outlined ms-sm ${theme === 'dark' ? 'text-primary' : 'text-amber-400'}`}>
                  {theme === 'dark' ? 'dark_mode' : 'light_mode'}
                </span>
              </div>
              <div>
                <p className="text-sm font-semibold text-white">{theme === 'dark' ? 'Dark Mode' : 'Light Mode'}</p>
                <p className="text-xs text-text-muted">Toggle between light and dark interface</p>
              </div>
            </div>
            <button
              type="button"
              onClick={toggleTheme}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${theme === 'dark' ? 'bg-primary' : 'bg-border-mid'}`}
            >
              <span className={`inline-block size-4 rounded-full bg-white shadow transition-transform ${theme === 'dark' ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>
        </div>
      </div>

      {/* ── Account Actions ── */}
      <div className="bg-surface-card rounded-xl border border-red-500/15 overflow-hidden">
        <div className="px-6 py-4 border-b border-border-dark">
          <h2 className="text-white text-base font-bold flex items-center gap-2">
            <span className="material-symbols-outlined text-red-400 text-[18px]">warning</span>
            Account Actions
          </h2>
        </div>
        <div className="p-6 flex flex-col sm:flex-row gap-3 items-start">
          <button
            type="button"
            onClick={logout}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border-dark bg-surface-hover text-text-muted hover:text-red-400 hover:border-red-500/40 hover:bg-red-500/10 text-sm font-medium transition-all"
          >
            <span className="material-symbols-outlined ms-sm">logout</span>
            Sign Out
          </button>
          <button
            type="button" disabled
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border-dark bg-surface-hover text-text-muted/40 text-sm font-medium cursor-not-allowed"
            title="Contact support to delete your account"
          >
            <span className="material-symbols-outlined ms-sm">delete_forever</span>
            Delete Account
          </button>
        </div>
        <p className="px-6 pb-5 text-xs text-text-muted">To permanently delete your account, please contact support.</p>
      </div>

      {/* ── Save / Cancel ── */}
      <div className="bg-surface-card rounded-xl border border-border-dark p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <p className="text-sm text-text-muted flex items-center gap-1.5">
          <span className="material-symbols-outlined text-[16px]">info</span>
          Changes are not saved automatically.
        </p>
        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={() => {
              setName(user?.name || '');
              setPhone(user?.phone || '');
              setLocation(user?.location || '');
              setHeadline(user?.headline || '');
              setBio(user?.bio || '');
              setLinkedin(user?.linkedin || '');
            }}
            className="px-5 py-2 rounded-xl border border-border-dark text-text-muted text-sm font-medium hover:text-white hover:bg-surface-hover transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 px-6 py-2 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary-hover transition-colors shadow-glow disabled:opacity-60"
          >
            <span className={`material-symbols-outlined text-[16px] ${saving ? 'animate-spin' : ''}`}>
              {saving ? 'refresh' : 'save'}
            </span>
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>

    </form>
  );
}
