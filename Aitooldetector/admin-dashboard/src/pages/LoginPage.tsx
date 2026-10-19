import { useState, useEffect } from 'react';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import toast from 'react-hot-toast';
import AuthShell from '../components/AuthShell';
import { ShieldCheck, Eye, EyeOff, UserPlus, LogIn, CheckCircle2, User, Mail, Lock } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { api } from '../lib/api';

interface LoginPageProps {
  initialTab?: 'signin' | 'signup';
}

export default function LoginPage({ initialTab = 'signin' }: LoginPageProps) {
  const { login, signup } = useAdminAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [tab, setTab] = useState<'signin' | 'signup'>(() => {
    if (location.pathname === '/register' || location.pathname === '/signup') return 'signup';
    return initialTab;
  });

  useEffect(() => {
    if (location.pathname === '/register' || location.pathname === '/signup') {
      setTab('signup');
    } else if (location.pathname === '/login') {
      setTab('signin');
    }
  }, [location.pathname]);

  // Sign In State
  const [signInEmail, setSignInEmail] = useState('');
  const [signInPassword, setSignInPassword] = useState('');
  const [showSignInPass, setShowSignInPass] = useState(false);
  const [signInLoading, setSignInLoading] = useState(false);

  // Sign Up State
  const [name, setName] = useState('');
  const [signUpEmail, setSignUpEmail] = useState('');
  const [signUpPassword, setSignUpPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showSignUpPass, setShowSignUpPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);
  const [signUpLoading, setSignUpLoading] = useState(false);

  // Success message when redirected to Sign In
  const [justRegisteredMsg, setJustRegisteredMsg] = useState<string | null>(null);

  // With no administrator yet, sign-up creates the first superadmin immediately; otherwise it
  // submits a request that a superadmin must approve.
  const [setupRequired, setSetupRequired] = useState(false);
  useEffect(() => {
    api.get('/auth/admin/setup-status')
      .then(res => setSetupRequired(Boolean(res.data?.setupRequired)))
      .catch(() => setSetupRequired(false));
  }, []);
  const activeTab = tab;

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signInEmail || !signInPassword) {
      toast.error('Please provide both email and password.');
      return;
    }

    setSignInLoading(true);
    try {
      await login(signInEmail, signInPassword);
      toast.success('Welcome back to Admin Console');
      navigate('/dashboard/notifications', { replace: true });
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Authentication failed. Please check your credentials.');
    } finally {
      setSignInLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setJustRegisteredMsg(null);

    if (!name.trim()) {
      toast.error('Please enter your full name.');
      return;
    }
    if (!signUpEmail.trim()) {
      toast.error('Please enter a valid email address.');
      return;
    }
    if (signUpPassword.length < 8) {
      toast.error('Password must be at least 8 characters long.');
      return;
    }
    if (signUpPassword !== confirmPassword) {
      toast.error('Passwords do not match. Please re-enter.');
      return;
    }

    setSignUpLoading(true);
    try {
      const res = await signup(name.trim(), signUpEmail.trim(), signUpPassword);
      toast.success(res.message || 'Admin account created successfully!');
      setSetupRequired(false);

      // Pre-fill email in Sign In form and reset passwords
      setSignInEmail(signUpEmail.trim());
      setSignInPassword('');
      setSignUpPassword('');
      setConfirmPassword('');
      setName('');
      setSignUpEmail('');

      // Show banner and switch tab to Sign In
      setJustRegisteredMsg(
        res.pending
          ? `Request sent for ${signUpEmail.trim()}. You can sign in once a superadmin approves it.`
          : `Account created for ${signUpEmail.trim()}. Please enter your password to sign in.`
      );
      setTab('signin');
      navigate('/login', { replace: true });
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Account creation failed. Please try again.');
    } finally {
      setSignUpLoading(false);
    }
  };

  return (
    <AuthShell
      subtitle="Admin Console"
      heroTitle="Administrator Console"
      heroText="Monitor generative-AI tool usage across student devices during examinations and assessments, review newly detected tools, and manage the student roster."
      points={[
        'Live feed of AI tool activity from desktop app and browser extension',
        'Approve or reject newly discovered AI tools institution-wide',
        'Filterable audit logs with CSV export',
      ]}
    >
        {/* Card Container */}
        <div className="admin-card p-7 shadow-lg border-t-4 border-t-nmims-600">
          {/* Segmented Tab Switcher */}
          {(
          <div className="flex bg-zinc-800/80 p-1 rounded-xl mb-6 border border-white/5">
            <button
              type="button"
              onClick={() => {
                setTab('signin');
                setJustRegisteredMsg(null);
              }}
              className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-semibold rounded-lg transition-all ${
                tab === 'signin'
                  ? 'bg-violet-600 text-paper shadow-md shadow-violet-900/30'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <LogIn size={14} />
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setTab('signup');
                setJustRegisteredMsg(null);
              }}
              className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-semibold rounded-lg transition-all ${
                tab === 'signup'
                  ? 'bg-violet-600 text-paper shadow-md shadow-violet-900/30'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <UserPlus size={14} />
              Sign Up
            </button>
          </div>
          )}

          {/* Registration Success Banner */}
          {justRegisteredMsg && activeTab === 'signin' && (
            <div className="mb-5 p-3.5 bg-emerald-500/10 border border-emerald-500/25 rounded-xl flex items-start gap-2.5 animate-fade-in">
              <CheckCircle2 size={16} className="text-emerald-400 shrink-0 mt-0.5" />
              <div className="text-xs text-emerald-300">
                <p className="font-semibold mb-0.5">Done</p>
                <p className="text-emerald-400/90 leading-relaxed">{justRegisteredMsg}</p>
              </div>
            </div>
          )}

          {/* ── TAB 1: SIGN IN FORM ── */}
          {activeTab === 'signin' && (
            <form onSubmit={handleSignIn} className="space-y-4">
              <div className="flex items-center gap-2 pb-3 border-b border-white/5">
                <ShieldCheck size={14} className="text-violet-400" />
                <span className="text-xs text-zinc-400 font-medium uppercase tracking-wider">
                  Administrator Sign In
                </span>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5 flex items-center gap-1.5">
                  <Mail size={12} className="text-zinc-500" />
                  Email Address
                </label>
                <input
                  id="admin-signin-email"
                  type="email"
                  required
                  className="input-admin"
                  placeholder="you@nmims.edu"
                  value={signInEmail}
                  onChange={e => setSignInEmail(e.target.value)}
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5 flex items-center gap-1.5">
                  <Lock size={12} className="text-zinc-500" />
                  Password
                </label>
                <div className="relative">
                  <input
                    id="admin-signin-password"
                    type={showSignInPass ? 'text' : 'password'}
                    required
                    className="input-admin pr-10"
                    placeholder="••••••••"
                    value={signInPassword}
                    onChange={e => setSignInPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowSignInPass(!showSignInPass)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 p-1"
                    title={showSignInPass ? 'Hide password' : 'Show password'}
                  >
                    {showSignInPass ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>

              <button
                id="admin-signin-submit"
                type="submit"
                disabled={signInLoading}
                className="btn-primary-admin w-full mt-2 flex items-center justify-center gap-2 py-2.5 text-sm"
              >
                {signInLoading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Authenticating...
                  </>
                ) : (
                  <>
                    <LogIn size={15} />
                    Sign In to Admin Console
                  </>
                )}
              </button>

              <div className="pt-2 text-center">
                <p className="text-xs text-zinc-500">
                  {setupRequired ? 'No administrator exists yet.' : 'Need access?'}{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setTab('signup');
                      setJustRegisteredMsg(null);
                    }}
                    className="text-violet-400 hover:text-violet-300 font-medium hover:underline transition-colors"
                  >
                    {setupRequired ? 'Create the first account' : 'Request access'}
                  </button>
                </p>
              </div>
            </form>
          )}

          {/* ── TAB 2: CREATE ACCOUNT FORM ── */}
          {activeTab === 'signup' && (
            <form onSubmit={handleSignUp} className="space-y-4">
              <div className="flex items-center gap-2 pb-3 border-b border-white/5">
                <UserPlus size={14} className="text-violet-400" />
                <span className="text-xs text-zinc-400 font-medium uppercase tracking-wider">
                  {setupRequired ? "Create First Admin Account" : "Request Admin Access"}
                </span>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5 flex items-center gap-1.5">
                  <User size={12} className="text-zinc-500" />
                  Full Name
                </label>
                <input
                  id="admin-signup-name"
                  type="text"
                  required
                  className="input-admin"
                  placeholder="e.g. Dr. Jane Smith"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5 flex items-center gap-1.5">
                  <Mail size={12} className="text-zinc-500" />
                  Official Email Address
                </label>
                <input
                  id="admin-signup-email"
                  type="email"
                  required
                  className="input-admin"
                  placeholder="you@nmims.edu"
                  value={signUpEmail}
                  onChange={e => setSignUpEmail(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5 flex items-center gap-1.5">
                  <Lock size={12} className="text-zinc-500" />
                  Password (min. 8 characters)
                </label>
                <div className="relative">
                  <input
                    id="admin-signup-password"
                    type={showSignUpPass ? 'text' : 'password'}
                    required
                    minLength={8}
                    className="input-admin pr-10"
                    placeholder="••••••••"
                    value={signUpPassword}
                    onChange={e => setSignUpPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowSignUpPass(!showSignUpPass)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 p-1"
                    title={showSignUpPass ? 'Hide password' : 'Show password'}
                  >
                    {showSignUpPass ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5 flex items-center gap-1.5">
                  <Lock size={12} className="text-zinc-500" />
                  Confirm Password
                </label>
                <div className="relative">
                  <input
                    id="admin-signup-confirm-password"
                    type={showConfirmPass ? 'text' : 'password'}
                    required
                    minLength={8}
                    className="input-admin pr-10"
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPass(!showConfirmPass)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 p-1"
                    title={showConfirmPass ? 'Hide password' : 'Show password'}
                  >
                    {showConfirmPass ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>

              <div className="p-3 bg-violet-950/30 border border-violet-500/20 rounded-xl text-[11px] text-zinc-400 leading-relaxed">
                🛡️ New administrator accounts will have administrative access to oversee student monitoring, manage AI tool catalogs, view real-time events, and configure security rules.
              </div>

              <button
                id="admin-signup-submit"
                type="submit"
                disabled={signUpLoading}
                className="btn-primary-admin w-full mt-2 flex items-center justify-center gap-2 py-2.5 text-sm"
              >
                {signUpLoading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <UserPlus size={15} />
                    {setupRequired ? "Create Admin Account" : "Request Access"}
                  </>
                )}
              </button>

              <div className="pt-2 text-center">
                <p className="text-xs text-zinc-500">
                  Already have an administrator account?{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setTab('signin');
                      setJustRegisteredMsg(null);
                    }}
                    className="text-violet-400 hover:text-violet-300 font-medium hover:underline transition-colors"
                  >
                    Sign In
                  </button>
                </p>
              </div>
            </form>
          )}
        </div>
    </AuthShell>
  );
}
