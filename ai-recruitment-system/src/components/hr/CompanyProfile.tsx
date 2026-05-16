import React, { useEffect, useRef, useState, useCallback } from 'react';
import { toast } from 'sonner';
import ReactCrop, { type Crop, centerCrop, makeAspectCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { apiUpdateProfile, apiUploadAvatar } from '../../api';

const COMPANY_SIZES = ['1-10', '11-50', '51-200', '201-500', '501-1000', '1000+'];

export function CompanyProfile() {
  const { user, accessToken, refreshProfile, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const [companyName, setCompanyName] = useState(user?.company_name || user?.name || '');
  const [industry, setIndustry] = useState(user?.company_industry || '');
  const [companySize, setCompanySize] = useState(user?.company_size || '');
  const [website, setWebsite] = useState(user?.company_website || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [location, setLocation] = useState(user?.location || '');
  const [description, setDescription] = useState(user?.company_description || '');
  const [avatarPreview, setAvatarPreview] = useState<string | null>(user?.avatar_url ?? null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState<Crop>();
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const avatarInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) return;
    setCompanyName(user.company_name || user.name || '');
    setIndustry(user.company_industry || '');
    setCompanySize(user.company_size || '');
    setWebsite(user.company_website || '');
    setPhone(user.phone || '');
    setLocation(user.location || '');
    setDescription(user.company_description || '');
    setAvatarPreview(user.avatar_url ?? null);
  }, [user]);

  const handleSave = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!accessToken || !companyName.trim()) return;
    setSaving(true);
    try {
      const updated = await apiUpdateProfile(accessToken, {
        name: companyName.trim(), phone, location, headline: industry, bio: description,
        linkedin: website, company_name: companyName.trim(), company_industry: industry,
        company_size: companySize, company_website: website, company_description: description,
      });
      await refreshProfile(updated);
      toast.success('Company profile updated.');
    } catch (err: any) {
      toast.error(err.message || 'Failed to update company profile.');
    } finally { setSaving(false); }
  };

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !accessToken) return;
    if (!file.type.startsWith('image/')) { toast.error('Please select an image file.'); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error('Image must be under 5 MB.'); return; }
    setCropSrc(URL.createObjectURL(file));
    setPendingFile(file);
    if (avatarInputRef.current) avatarInputRef.current.value = '';
  };

  const onImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const { width, height } = e.currentTarget;
    setCrop(centerCrop(makeAspectCrop({ unit: '%', width: 90 }, 1, width, height), width, height));
  }, []);

  const handleCropConfirm = async () => {
    if (!imgRef.current || !crop || !pendingFile || !accessToken) return;
    const canvas = document.createElement('canvas');
    const size = 400; canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(imgRef.current,
      (crop.x / 100) * imgRef.current.naturalWidth, (crop.y / 100) * imgRef.current.naturalHeight,
      (crop.width / 100) * imgRef.current.naturalWidth, (crop.height / 100) * imgRef.current.naturalHeight,
      0, 0, size, size);
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
        toast.success('Company logo updated.');
      } catch (err: any) {
        setAvatarPreview(user?.avatar_url ?? null);
        toast.error(err.message || 'Failed to upload logo.');
      } finally { setAvatarUploading(false); }
    }, 'image/jpeg', 0.92);
  };

  const initials = (companyName || user?.name || 'C').split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();

  return (
    <form onSubmit={handleSave} className="flex flex-col gap-6 max-w-[900px] mx-auto pb-8">
      {/* Crop Modal */}
      {cropSrc && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface-dark border border-border-dark rounded-2xl p-6 w-full max-w-md shadow-card">
            <h3 className="text-white font-bold text-lg mb-4">Crop Logo</h3>
            <div className="flex justify-center mb-5">
              <ReactCrop crop={crop} onChange={c => setCrop(c)} aspect={1}>
                <img ref={imgRef} src={cropSrc} alt="Crop preview" onLoad={onImageLoad}
                  className="max-h-64 rounded-xl object-contain" />
              </ReactCrop>
            </div>
            <div className="flex gap-3">
              <button type="button" onClick={() => { setCropSrc(null); setPendingFile(null); }}
                className="flex-1 h-11 rounded-xl border border-border-dark text-white text-sm font-medium hover:bg-surface-hover transition-colors">Cancel</button>
              <button type="button" onClick={handleCropConfirm}
                className="flex-1 h-11 rounded-xl bg-primary hover:bg-primary-hover text-white text-sm font-bold transition-colors">Apply Crop</button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-surface-card rounded-xl border border-border-dark overflow-hidden">
        <div className="p-6 flex flex-col md:flex-row gap-5 items-start md:items-end">
          <div className="relative flex-shrink-0">
            {avatarPreview ? (
              <img src={avatarPreview} alt="Company logo" className="size-24 rounded-xl object-cover border border-border-dark shadow-lg" />
            ) : (
              <div className="size-24 rounded-xl bg-primary/20 border border-primary/30 flex items-center justify-center text-2xl font-black text-primary shadow-lg">
                {initials}
              </div>
            )}
            {avatarUploading && (
              <div className="absolute inset-0 rounded-xl bg-black/50 flex items-center justify-center">
                <span className="material-symbols-outlined text-white text-[28px] animate-spin">refresh</span>
              </div>
            )}
            <button
              type="button"
              onClick={() => avatarInputRef.current?.click()}
              disabled={avatarUploading}
              className="absolute -bottom-2 -right-2 size-8 rounded-lg bg-primary hover:bg-primary-hover flex items-center justify-center text-white shadow-md transition-colors disabled:opacity-60"
              title="Change company logo"
            >
              <span className="material-symbols-outlined text-[18px]">add_a_photo</span>
            </button>
            <input ref={avatarInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={handleLogoChange} />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-3 mb-1">
              <h1 className="text-white text-2xl font-bold tracking-tight">{companyName || 'Company Profile'}</h1>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-violet-500/15 text-violet-300 border border-violet-500/25">
                HR Organization
              </span>
            </div>
            <p className="text-text-muted text-sm">{industry || 'Add your industry and official company details.'}</p>
            <p className="text-text-muted text-xs mt-1.5 flex items-center gap-1">
              <span className="material-symbols-outlined text-[15px]">mail</span>
              Official login email: {user?.email || '-'}
            </p>
          </div>
        </div>
      </div>

      <div className="bg-surface-card rounded-xl border border-border-dark overflow-hidden">
        <div className="px-6 py-4 border-b border-border-dark">
          <h2 className="text-white text-base font-bold">Company Details</h2>
        </div>

        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-5">
          <label className="flex flex-col gap-1.5 md:col-span-2">
            <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">Company / Organization Name *</span>
            <div className="relative">
              <span className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                <span className="material-symbols-outlined text-text-muted text-[18px]">business</span>
              </span>
              <input type="text" required value={companyName} onChange={e => setCompanyName(e.target.value)}
                className="input-dark pl-10 w-full" placeholder="e.g. Acme Technologies Sdn. Bhd." />
            </div>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">Industry</span>
            <input type="text" value={industry} onChange={e => setIndustry(e.target.value)}
              className="input-dark w-full" placeholder="e.g. Information Technology" />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">Company Size</span>
            <select value={companySize} onChange={e => setCompanySize(e.target.value)} className="input-dark w-full">
              <option value="">Select company size</option>
              {COMPANY_SIZES.map(size => <option key={size} value={size}>{size} employees</option>)}
            </select>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">Headquarters / Office Location</span>
            <div className="relative">
              <span className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                <span className="material-symbols-outlined text-text-muted text-[18px]">location_on</span>
              </span>
              <input type="text" value={location} onChange={e => setLocation(e.target.value)}
                className="input-dark pl-10 w-full" placeholder="e.g. Kuala Lumpur, Malaysia" />
            </div>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">Official Phone</span>
            <div className="relative">
              <span className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                <span className="material-symbols-outlined text-text-muted text-[18px]">call</span>
              </span>
              <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                className="input-dark pl-10 w-full" placeholder="+60 3-1234 5678" />
            </div>
          </label>

          <label className="flex flex-col gap-1.5 md:col-span-2">
            <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">Company Website / LinkedIn</span>
            <div className="relative">
              <span className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                <span className="material-symbols-outlined text-text-muted text-[18px]">link</span>
              </span>
              <input type="text" value={website} onChange={e => setWebsite(e.target.value)}
                className="input-dark pl-10 w-full" placeholder="https://company.com" />
            </div>
          </label>

          <label className="flex flex-col gap-1.5 md:col-span-2">
            <div className="flex justify-between">
              <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">Company Overview</span>
              <span className="text-xs text-text-muted">{description.length}/800</span>
            </div>
            <textarea rows={5} maxLength={800} value={description} onChange={e => setDescription(e.target.value)}
              className="input-dark w-full resize-none"
              placeholder="Describe your company, hiring team, culture, and what candidates should know about the organization." />
          </label>
        </div>
      </div>

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
            <button type="button" onClick={toggleTheme}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${theme === 'dark' ? 'bg-primary' : 'bg-border-mid'}`}>
              <span className={`inline-block size-4 rounded-full bg-white shadow transition-transform ${theme === 'dark' ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>
        </div>
      </div>

      <div className="bg-surface-card rounded-xl border border-red-500/15 overflow-hidden">
        <div className="px-6 py-4 border-b border-border-dark">
          <h2 className="text-white text-base font-bold flex items-center gap-2">
            <span className="material-symbols-outlined text-red-400 text-[18px]">warning</span>
            Account Actions
          </h2>
        </div>
        <div className="p-6">
          <button type="button" onClick={logout}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border-dark bg-surface-hover text-text-muted hover:text-red-400 hover:border-red-500/40 hover:bg-red-500/10 text-sm font-medium transition-all">
            <span className="material-symbols-outlined ms-sm">logout</span>
            Sign Out
          </button>
        </div>
      </div>

      <div className="bg-surface-card rounded-xl border border-border-dark p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <p className="text-sm text-text-muted flex items-center gap-1.5">
          <span className="material-symbols-outlined text-[16px]">info</span>
          Company profile updates are shown with your HR account.
        </p>
        <div className="flex items-center gap-3 flex-wrap">
          <button type="button" onClick={() => {
            setCompanyName(user?.company_name || user?.name || '');
            setIndustry(user?.company_industry || '');
            setCompanySize(user?.company_size || '');
            setWebsite(user?.company_website || '');
            setPhone(user?.phone || '');
            setLocation(user?.location || '');
            setDescription(user?.company_description || '');
          }} className="px-5 py-2 rounded-xl border border-border-dark text-text-muted text-sm font-medium hover:text-white hover:bg-surface-hover transition-colors">
            Cancel
          </button>
          <button type="submit" disabled={saving}
            className="flex items-center gap-2 px-6 py-2 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary-hover transition-colors shadow-glow disabled:opacity-60">
            <span className={`material-symbols-outlined text-[16px] ${saving ? 'animate-spin' : ''}`}>
              {saving ? 'refresh' : 'save'}
            </span>
            {saving ? 'Saving...' : 'Save Company Profile'}
          </button>
        </div>
      </div>
    </form>
  );
}
