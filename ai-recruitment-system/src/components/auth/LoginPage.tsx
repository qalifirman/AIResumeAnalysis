import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';

export function LoginPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<'hr' | 'applicant'>('applicant');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const { login, signup } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (isLogin) {
        await login(email, password);
      } else {
        if (password !== confirmPassword) { setError('Passwords do not match'); setLoading(false); return; }
        if (password.length < 6) { setError('Password must be at least 6 characters'); setLoading(false); return; }
        if (!name.trim()) { setError('Name is required'); setLoading(false); return; }
        await signup(email, password, name, role);
      }
    } catch (err: any) {
      let msg = err.message || 'An error occurred';
      if (msg.includes('Invalid login credentials')) msg = 'Invalid email or password. Please check your credentials.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen w-full bg-bg-dark">
      {/* Left panel — branding */}
      <div className="hidden lg:flex lg:w-1/2 relative flex-col justify-between p-12 bg-surface-dark overflow-hidden border-r border-border-dark">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-transparent to-blue-900/10 pointer-events-none" />
        {/* Logo */}
        <div className="relative flex items-center gap-3 text-white z-10">
          <div className="size-9 flex items-center justify-center rounded-xl bg-primary/20 border border-primary/30">
            <span className="material-symbols-outlined fill text-primary ms-lg">psychology</span>
          </div>
          <div>
            <h2 className="text-lg font-bold leading-none">Resume<span className="text-primary">AI</span></h2>
            <span className="text-xs text-text-muted">Resume Analysis & Job Matching</span>
          </div>
        </div>

        {/* Hero copy */}
        <div className="relative z-10 max-w-md">
          <h1 className="text-4xl font-black leading-tight tracking-tight mb-4 text-white">
            Hire smarter with <span className="text-gradient">AI-powered</span> resume matching
          </h1>
          <p className="text-base text-text-muted leading-relaxed mb-8">
            Our system reads, scores, and ranks candidates automatically — so you focus on conversations, not spreadsheets.
          </p>

          {/* Stat cards */}
          <div className="grid grid-cols-3 gap-3 mb-8">
            {[['95%', 'Match accuracy'], ['3×', 'Faster screening'], ['500+', 'Skills detected']].map(([val, lbl]) => (
              <div key={lbl} className="bg-surface-card/60 border border-border-dark rounded-xl p-4 text-center backdrop-blur-sm">
                <div className="text-2xl font-black text-white mb-0.5">{val}</div>
                <div className="text-xs text-text-muted">{lbl}</div>
              </div>
            ))}
          </div>

          {/* Testimonial */}
          <div className="bg-surface-card/60 border border-border-dark rounded-xl p-5 backdrop-blur-sm">
            <div className="flex gap-0.5 text-yellow-400 mb-3">
              {[...Array(5)].map((_, i) => (
                <span key={i} className="material-symbols-outlined fill ms-sm" style={{fontSize:'16px'}}>star</span>
              ))}
            </div>
            <p className="text-sm text-slate-300 italic mb-3">"ResumeAI cut our hiring time by 70%. The AI match scores are remarkably accurate."</p>
            <div className="flex items-center gap-2">
              <div className="size-8 rounded-full bg-primary/30 flex items-center justify-center text-xs font-bold text-primary">SJ</div>
              <div>
                <p className="text-sm font-semibold text-white">Sarah Jenkins</p>
                <p className="text-xs text-text-muted">HR Director, TechFlow</p>
              </div>
            </div>
          </div>
        </div>

        <div className="relative z-10 flex gap-4 text-xs text-text-muted">
          <a href="#" className="hover:text-white transition-colors">Privacy Policy</a>
          <a href="#" className="hover:text-white transition-colors">Terms of Service</a>
        </div>
      </div>

      {/* Right panel — form */}
      <div className="w-full lg:w-1/2 flex flex-col items-center justify-center p-6 sm:p-12">
        {/* Mobile logo */}
        <div className="flex lg:hidden items-center gap-2 mb-8 self-start">
          <div className="size-8 flex items-center justify-center rounded-lg bg-primary">
            <span className="material-symbols-outlined fill text-white" style={{fontSize:'18px'}}>psychology</span>
          </div>
          <span className="font-bold text-white">Resume<span className="text-primary">AI</span></span>
        </div>

        <div className="w-full max-w-[440px]">
          <div className="mb-8">
            <h2 className="text-3xl font-bold text-white tracking-tight">
              {isLogin ? 'Welcome back' : 'Create account'}
            </h2>
            <p className="text-text-muted text-sm mt-1">
              {isLogin ? 'Sign in to your account to continue.' : 'Get started with ResumeAI today.'}
            </p>
          </div>

          {/* Role / mode toggle */}
          <div className="w-full p-1 bg-surface-dark rounded-xl border border-border-dark mb-6">
            <div className="relative flex w-full">
              {(['Login', 'Sign Up'] as const).map((label, i) => (
                <label key={label} className="flex-1 cursor-pointer">
                  <input
                    type="radio" name="mode" className="sr-only"
                    checked={isLogin === (i === 0)}
                    onChange={() => { setIsLogin(i === 0); setError(''); }}
                  />
                  <div className={`flex items-center justify-center py-2.5 px-4 rounded-lg text-sm font-medium transition-all ${
                    isLogin === (i === 0)
                      ? 'bg-bg-dark text-white shadow-sm'
                      : 'text-text-muted hover:text-white'
                  }`}>
                    <span className="material-symbols-outlined mr-2 ms-sm">{i === 0 ? 'login' : 'person_add'}</span>
                    {label}
                  </div>
                </label>
              ))}
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <div>
                <label className="block text-sm text-text-muted mb-1.5 font-medium">Full name</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-text-muted ms-sm">person</span>
                  <input type="text" value={name} onChange={e => setName(e.target.value)}
                    className="input-dark pl-10" placeholder="Qalif Irman" required />
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm text-text-muted mb-1.5 font-medium">Email address</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-text-muted ms-sm">mail</span>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                  className="input-dark pl-10" placeholder="you@example.com" required />
              </div>
            </div>

            <div>
              <label className="block text-sm text-text-muted mb-1.5 font-medium">Password</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-text-muted ms-sm">lock</span>
                <input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                  className="input-dark pl-10 pr-11" placeholder="••••••••" required />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-white transition-colors">
                  <span className="material-symbols-outlined ms-sm">{showPassword ? 'visibility_off' : 'visibility'}</span>
                </button>
              </div>
            </div>

            {!isLogin && (
              <>
                <div>
                  <label className="block text-sm text-text-muted mb-1.5 font-medium">Confirm password</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-text-muted ms-sm">lock_reset</span>
                    <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                      className="input-dark pl-10" placeholder="••••••••" required />
                  </div>
                </div>

                <div>
                  <label className="block text-sm text-text-muted mb-2 font-medium">I am a…</label>
                  <div className="grid grid-cols-2 gap-3">
                    {([
                      { val: 'applicant' as const, icon: 'person_search', label: 'Job Seeker', sub: 'Looking for opportunities' },
                      { val: 'hr' as const, icon: 'badge', label: 'HR Manager', sub: 'Hiring for my company' },
                    ]).map(opt => (
                      <button key={opt.val} type="button" onClick={() => setRole(opt.val)}
                        className={`flex items-center gap-3 p-3.5 rounded-xl border transition-all text-left ${
                          role === opt.val
                            ? 'border-primary bg-primary/10 text-white'
                            : 'border-border-dark bg-surface-card text-text-muted hover:border-border-mid hover:text-white'
                        }`}>
                        <span className={`material-symbols-outlined ${role === opt.val ? 'fill text-primary' : ''}`}>{opt.icon}</span>
                        <div>
                          <div className="text-sm font-semibold">{opt.label}</div>
                          <div className="text-xs opacity-70">{opt.sub}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {error && (
              <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/25 rounded-xl">
                <span className="material-symbols-outlined text-red-400 ms-sm mt-0.5">error</span>
                <p className="text-sm text-red-400">{error}</p>
              </div>
            )}

            <button type="submit" disabled={loading} className="btn-primary w-full py-3 mt-2">
              {loading ? (
                <><span className="material-symbols-outlined animate-spin ms-sm">refresh</span> Please wait…</>
              ) : isLogin ? 'Sign in' : 'Create account'}
            </button>
          </form>

          <p className="text-center text-text-muted text-sm mt-6">
            {isLogin ? "Don't have an account? " : 'Already have an account? '}
            <button onClick={() => { setIsLogin(!isLogin); setError(''); }}
              className="text-primary hover:text-primary-hover font-semibold transition-colors">
              {isLogin ? 'Sign up' : 'Sign in'}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
