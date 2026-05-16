import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';

export function LoginPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [isForgot, setIsForgot] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [role, setRole] = useState<'hr' | 'applicant'>('applicant');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [resetSent, setResetSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const { login, signup, resetPassword } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setNotice('');
    setLoading(true);
    try {
      if (isForgot) {
        await resetPassword(email);
        setResetSent(true);
      } else if (isLogin) {
        await login(email, password);
      } else {
        if (password !== confirmPassword) { setError('Passwords do not match'); setLoading(false); return; }
        if (password.length < 6) { setError('Password must be at least 6 characters'); setLoading(false); return; }
        if (!name.trim()) { setError(role === 'hr' ? 'Company name is required' : 'Name is required'); setLoading(false); return; }
        const result = await signup(email, password, name, role, inviteCode);
        if (result.verificationRequired) {
          setNotice('Account created. Please verify your email before signing in.');
          setIsLogin(true);
        }
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
    <div className="flex min-h-screen w-full">
      {/* Left side: Hero */}
      <div className="hidden lg:flex lg:w-1/2 relative flex-col justify-between p-12 bg-surface-dark overflow-hidden">
        {/* Background gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#111921]/80 via-[#111921]/40 to-[#111921]/90 z-10" />
        {/* Background pattern */}
        <div className="absolute inset-0 z-0 opacity-30"
          style={{ backgroundImage: 'radial-gradient(circle at 20% 50%, #2C097F33 0%, transparent 50%), radial-gradient(circle at 80% 20%, #0891B233 0%, transparent 40%)' }} />

        <div className="relative z-20 h-full flex flex-col justify-between">
          {/* Logo */}
          <div className="flex items-center gap-3 text-white">
            <div className="size-9 flex items-center justify-center rounded-xl bg-primary/20 border border-primary/30 backdrop-blur-sm">
              <span className="material-symbols-outlined fill text-primary" style={{ fontSize: '22px' }}>psychology</span>
            </div>
            <h2 className="text-xl font-bold tracking-tight">JobMatch <span className="text-primary">AI</span></h2>
          </div>

          {/* Hero content */}
          <div className="max-w-md">
            <h1 className="text-4xl font-black leading-tight tracking-tight mb-5 text-white drop-shadow-lg">
              Match with your dream job in seconds.
            </h1>
            <p className="text-lg text-gray-300 font-medium leading-relaxed mb-8 drop-shadow-md">
              AI-driven recruiting for the modern workforce. Experience the future of hiring with our intelligent matching algorithms.
            </p>

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-3 mb-8">
              {[['AI', 'Assisted matching'], ['HR', 'Candidate workflow'], ['PDF', 'Resume parsing']].map(([val, lbl]) => (
                <div key={lbl} className="bg-[#1a2632]/60 backdrop-blur-md border border-white/10 rounded-xl p-4 text-center">
                  <div className="text-2xl font-black text-white mb-0.5">{val}</div>
                  <div className="text-xs text-gray-400">{lbl}</div>
                </div>
              ))}
            </div>

            {/* Testimonial */}
            <div className="bg-[#1a2632]/60 backdrop-blur-md border border-white/10 p-6 rounded-xl">
              <div className="flex gap-1 text-yellow-400 mb-3">
                {[...Array(5)].map((_, i) => (
                  <span key={i} className="material-symbols-outlined fill" style={{ fontSize: '18px', fontVariationSettings: "'FILL' 1" }}>star</span>
                ))}
              </div>
              <p className="text-sm text-gray-200 italic mb-4">Built for transparent resume matching, candidate tracking, and HR review workflows.</p>
              <div className="flex items-center gap-3">
                <div className="size-10 rounded-full bg-primary/30 flex items-center justify-center text-sm font-bold text-primary">SJ</div>
                <div>
                  <p className="text-sm font-bold text-white">Final Year Project</p>
                  <p className="text-xs text-gray-400">AI recruitment prototype</p>
                </div>
              </div>
            </div>
          </div>

          <div className="flex gap-4 text-sm text-gray-500 font-medium">
            <span>© 2024 JobMatch AI</span>
            <span>Privacy Policy</span>
            <span>Terms of Service</span>
          </div>
        </div>
      </div>

      {/* Right side: Form */}
      <div className="w-full lg:w-1/2 flex flex-col items-center justify-center p-6 sm:p-12 bg-bg-dark relative">
        {/* Mobile logo */}
        <div className="absolute top-6 left-6 lg:hidden flex items-center gap-3">
          <div className="size-8 flex items-center justify-center rounded-lg bg-primary">
            <span className="material-symbols-outlined fill text-white" style={{ fontSize: '20px' }}>psychology</span>
          </div>
          <h2 className="text-lg font-bold text-white">JobMatch <span className="text-primary">AI</span></h2>
        </div>

        <div className="w-full max-w-[480px] flex flex-col gap-7">
          {/* Header */}
          <div className="mt-12 lg:mt-0">
            <h2 className="text-3xl font-bold text-white tracking-tight">
              {isForgot ? 'Reset Password' : isLogin ? 'Welcome Back' : 'Create Account'}
            </h2>
            <p className="text-text-muted text-base mt-1">
              {isForgot ? 'Enter your email and we\'ll send a reset link.' : isLogin ? 'Please enter your details to sign in.' : 'Get started with JobMatch AI today.'}
            </p>
          </div>

          {/* Forgot password mode — only show email */}
          {isForgot && !resetSent && (
            <form onSubmit={handleSubmit} className="flex flex-col gap-5">
              <div className="flex flex-col gap-2">
                <label className="text-white text-sm font-medium">Email Address</label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-text-muted group-focus-within:text-primary transition-colors">
                    <span className="material-symbols-outlined ms-sm">mail</span>
                  </div>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                    className="w-full h-12 pl-11 pr-4 bg-surface-card border border-border-dark rounded-xl text-white placeholder-text-muted focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all text-sm"
                    placeholder="name@company.com" required autoFocus />
                </div>
              </div>
              {error && (
                <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/25 rounded-xl">
                  <span className="material-symbols-outlined text-red-400 ms-sm mt-0.5">error</span>
                  <p className="text-sm text-red-400">{error}</p>
                </div>
              )}
              <button type="submit" disabled={loading}
                className="w-full h-12 bg-primary hover:bg-primary-hover text-white font-bold rounded-xl shadow-glow transition-all active:scale-[0.98] flex items-center justify-center gap-2">
                {loading ? <><span className="material-symbols-outlined animate-spin ms-sm">refresh</span>Sending…</> : 'Send Reset Link'}
              </button>
              <button type="button" onClick={() => { setIsForgot(false); setError(''); }}
                className="text-sm text-text-muted hover:text-white text-center transition-colors">
                ← Back to sign in
              </button>
            </form>
          )}

          {/* Mode toggle — only show for signup to pick role */}
          {!isLogin && !isForgot && (
            <div className="w-full p-1 bg-surface-card rounded-xl border border-border-dark">
              <div className="relative flex w-full">
                {[
                  { label: 'Sign Up', icon: 'person_add', action: () => {} },
                  { label: 'Log In', icon: 'login', action: () => { setIsLogin(true); setError(''); } },
                ].map((opt, i) => (
                  <label key={i} className="flex-1 cursor-pointer">
                    <input type="radio" name="mode" className="sr-only" readOnly checked={i === 0} onChange={opt.action} />
                    <div
                      onClick={opt.action}
                      className={`flex items-center justify-center py-2.5 px-4 rounded-lg text-sm font-medium transition-all ${
                        i === 0 ? 'bg-bg-dark text-white shadow-sm' : 'text-text-muted hover:text-white cursor-pointer'
                      }`}
                    >
                      <span className="material-symbols-outlined mr-2 ms-sm">{opt.icon}</span>
                      {opt.label}
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Forgot password success state */}
          {isForgot && resetSent && (
            <div className="flex flex-col items-center gap-4 py-6 text-center">
              <div className="size-16 rounded-2xl bg-green-500/15 border border-green-500/30 flex items-center justify-center">
                <span className="material-symbols-outlined text-green-400" style={{ fontSize: 32 }}>mark_email_read</span>
              </div>
              <div>
                <h3 className="text-white font-bold text-lg">Check your inbox</h3>
                <p className="text-text-muted text-sm mt-1">A reset link was sent to <span className="text-white font-medium">{email}</span>. Check spam if you don't see it.</p>
              </div>
              <button type="button" onClick={() => { setIsForgot(false); setResetSent(false); setError(''); }}
                className="text-primary text-sm font-medium hover:underline">
                Back to sign in
              </button>
            </div>
          )}

          {/* Form */}
          {!isForgot && <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            {!isLogin && (
              <div className="flex flex-col gap-2">
                <label className="text-white text-sm font-medium">
                  {role === 'hr' ? 'Company / Organization Name' : 'Full Name'}
                </label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-text-muted group-focus-within:text-primary transition-colors">
                    <span className="material-symbols-outlined ms-sm">{role === 'hr' ? 'business' : 'person'}</span>
                  </div>
                  <input type="text" value={name} onChange={e => setName(e.target.value)}
                    className="w-full h-12 pl-11 pr-4 bg-surface-card border border-border-dark rounded-xl text-white placeholder-text-muted focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all text-sm"
                    placeholder={role === 'hr' ? 'Your company name' : 'Your full name'} required />
                </div>
              </div>
            )}

            <div className="flex flex-col gap-2">
              <label className="text-white text-sm font-medium">Email Address</label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-text-muted group-focus-within:text-primary transition-colors">
                  <span className="material-symbols-outlined ms-sm">mail</span>
                </div>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                  className="w-full h-12 pl-11 pr-4 bg-surface-card border border-border-dark rounded-xl text-white placeholder-text-muted focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all text-sm"
                  placeholder="name@company.com" required />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex justify-between items-center">
                <label className="text-white text-sm font-medium">Password</label>
                {isLogin && (
                  <button type="button" onClick={() => { setIsForgot(true); setError(''); }}
                    className="text-sm text-primary font-medium hover:text-primary-hover transition-colors">
                    Forgot Password?
                  </button>
                )}
              </div>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-text-muted group-focus-within:text-primary transition-colors">
                  <span className="material-symbols-outlined ms-sm">lock</span>
                </div>
                <input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                  className="w-full h-12 pl-11 pr-12 bg-surface-card border border-border-dark rounded-xl text-white placeholder-text-muted focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all text-sm"
                  placeholder="••••••••" required />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-4 flex items-center text-text-muted hover:text-white cursor-pointer transition-colors">
                  <span className="material-symbols-outlined ms-sm">{showPassword ? 'visibility_off' : 'visibility'}</span>
                </button>
              </div>
            </div>

            {!isLogin && (
              <>
                <div className="flex flex-col gap-2">
                  <label className="text-white text-sm font-medium">Confirm Password</label>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-text-muted group-focus-within:text-primary transition-colors">
                      <span className="material-symbols-outlined ms-sm">lock_reset</span>
                    </div>
                    <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                      className="w-full h-12 pl-11 pr-4 bg-surface-card border border-border-dark rounded-xl text-white placeholder-text-muted focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all text-sm"
                      placeholder="••••••••" required />
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-white text-sm font-medium">I am a…</label>
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

                {role === 'hr' && (
                  <div className="flex flex-col gap-2">
                    <label className="text-white text-sm font-medium">HR Invite Code</label>
                    <div className="relative group">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-text-muted group-focus-within:text-primary transition-colors">
                        <span className="material-symbols-outlined ms-sm">vpn_key</span>
                      </div>
                      <input type="password" value={inviteCode} onChange={e => setInviteCode(e.target.value)}
                        className="w-full h-12 pl-11 pr-4 bg-surface-card border border-border-dark rounded-xl text-white placeholder-text-muted focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all text-sm"
                        placeholder="Provided by administrator" required />
                    </div>
                  </div>
                )}
              </>
            )}

            {error && (
              <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/25 rounded-xl">
                <span className="material-symbols-outlined text-red-400 ms-sm mt-0.5">error</span>
                <p className="text-sm text-red-400">{error}</p>
              </div>
            )}

            {notice && (
              <div className="flex items-start gap-2 p-3 bg-green-500/10 border border-green-500/25 rounded-xl">
                <span className="material-symbols-outlined text-green-400 ms-sm mt-0.5">check_circle</span>
                <p className="text-sm text-green-400">{notice}</p>
              </div>
            )}

            <button type="submit" disabled={loading}
              className="w-full h-12 bg-primary hover:bg-primary-hover text-white font-bold rounded-xl shadow-glow transition-all active:scale-[0.98] flex items-center justify-center gap-2 mt-2">
              {loading ? (
                <><span className="material-symbols-outlined animate-spin ms-sm">refresh</span>Please wait…</>
              ) : (
                <><span>{isLogin ? 'Sign In' : 'Create Account'}</span><span className="material-symbols-outlined ms-sm">arrow_forward</span></>
              )}
            </button>
          </form>}

          {!isForgot && <>
            {/* Divider */}
            <div className="relative flex items-center">
              <div className="flex-grow border-t border-border-dark" />
              <span className="flex-shrink-0 mx-4 text-text-muted text-xs font-medium uppercase tracking-wider">OAuth providers</span>
              <div className="flex-grow border-t border-border-dark" />
            </div>

            {/* Social login */}
            <div className="grid grid-cols-2 gap-4">
              <button type="button" disabled title="Google OAuth is not configured"
                className="flex items-center justify-center gap-2 h-12 rounded-xl bg-surface-card border border-border-dark opacity-60 cursor-not-allowed text-white font-medium text-sm">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </svg>
                <span>Google OAuth off</span>
              </button>
              <button type="button" disabled title="LinkedIn OAuth is not configured"
                className="flex items-center justify-center gap-2 h-12 rounded-xl bg-[#0077b5] opacity-60 cursor-not-allowed text-white font-medium text-sm shadow-sm">
                <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                  <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                </svg>
                <span>LinkedIn OAuth off</span>
              </button>
            </div>

            {/* Sign up/in toggle */}
            <div className="flex justify-center gap-1 text-sm text-text-muted">
              <p>{isLogin ? "Don't have an account?" : 'Already have an account?'}</p>
              <button onClick={() => { setIsLogin(!isLogin); setError(''); }}
                className="font-bold text-white hover:text-primary transition-colors">
                {isLogin ? 'Sign up for free' : 'Sign in'}
              </button>
            </div>
          </>}
        </div>
      </div>
    </div>
  );
}
