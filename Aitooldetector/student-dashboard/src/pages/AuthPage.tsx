import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';
import { Shield, Eye, EyeOff, Lock } from 'lucide-react';
import AuthShell from '../components/AuthShell';

type Tab = 'signin' | 'signup';

export default function AuthPage() {
  const { login, signup } = useAuth();
  const [tab, setTab] = useState<Tab>('signin');
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);

  // Signin state
  const [signinData, setSigninData] = useState({ sapId: '', password: '' });
  // Signup state
  const [signupData, setSignupData] = useState({
    sapId: '', name: '', branch: '', email: '', password: '', confirmPassword: '',
  });
  const [consentChecked, setConsentChecked] = useState(false);

  const handleSignin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signinData.sapId || !signinData.password) {
      toast.error('Please fill in all fields');
      return;
    }
    setLoading(true);
    try {
      await login(signinData.sapId, signinData.password);
      toast.success('Welcome back!');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Sign-in failed');
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signupData.sapId || !signupData.name || !signupData.branch || !signupData.password) {
      toast.error('Please fill in all required fields');
      return;
    }
    if (signupData.password !== signupData.confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    if (signupData.password.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }
    if (!consentChecked) {
      toast.error('Please acknowledge the monitoring disclosure');
      return;
    }
    setLoading(true);
    try {
      await signup({
        sapId: signupData.sapId,
        name: signupData.name,
        branch: signupData.branch,
        email: signupData.email || undefined,
        password: signupData.password,
      });
      toast.success('Account created successfully! Please sign in with your credentials.');
      const createdSapId = signupData.sapId;
      setSigninData({ sapId: createdSapId, password: '' });
      setSignupData({
        sapId: '', name: '', branch: '', email: '', password: '', confirmPassword: '',
      });
      setConsentChecked(false);
      setTab('signin');
    } catch (err: any) {
      toast.error(err.response?.data?.error || err.response?.data?.errors?.[0]?.msg || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      subtitle="Student Portal"
      heroTitle="Student Portal"
      heroText="Sign in with your SAP ID to set up the monitoring app on your device and see exactly what is recorded about your AI tool usage."
      points={[
        'Only metadata is recorded: tool name, time and duration',
        'Your full personal usage history is visible to you',
        'Never captures prompts, responses, keystrokes or screenshots',
      ]}
    >
        {/* Card */}
        <div className="glass-card p-8 shadow-lg border-t-4 border-t-nmims-600">
          {/* Tabs */}
          <div className="flex gap-1 bg-gray-800 rounded-md p-1 mb-8 border border-gray-700">
            <button
              onClick={() => setTab('signin')}
              className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all duration-200 ${
                tab === 'signin'
                  ? 'bg-brand-600 text-paper shadow-lg shadow-brand-900/40'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => setTab('signup')}
              className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all duration-200 ${
                tab === 'signup'
                  ? 'bg-brand-600 text-paper shadow-lg shadow-brand-900/40'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Sign Up
            </button>
          </div>

          {tab === 'signin' ? (
            <form onSubmit={handleSignin} className="space-y-4">
              <div>
                <label className="label">SAP ID</label>
                <input
                  id="signin-sap-id"
                  type="text"
                  className="input-field"
                  placeholder="e.g. 60004210001"
                  value={signinData.sapId}
                  onChange={e => setSigninData(p => ({ ...p, sapId: e.target.value }))}
                />
              </div>
              <div>
                <label className="label">Password</label>
                <div className="relative">
                  <input
                    id="signin-password"
                    type={showPass ? 'text' : 'password'}
                    className="input-field pr-12"
                    placeholder="Your password"
                    value={signinData.password}
                    onChange={e => setSigninData(p => ({ ...p, password: e.target.value }))}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(!showPass)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                  >
                    {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
              <button
                id="signin-submit"
                type="submit"
                disabled={loading}
                className="btn-primary w-full mt-2"
              >
                {loading ? 'Signing in...' : 'Sign In'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleSignup} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="label">SAP ID</label>
                  <input
                    id="signup-sap-id"
                    type="text"
                    className="input-field"
                    placeholder="e.g. 60004210001"
                    value={signupData.sapId}
                    onChange={e => setSignupData(p => ({ ...p, sapId: e.target.value }))}
                  />
                </div>
                <div className="col-span-2">
                  <label className="label">Full Name</label>
                  <input
                    id="signup-name"
                    type="text"
                    className="input-field"
                    placeholder="Your full name"
                    value={signupData.name}
                    onChange={e => setSignupData(p => ({ ...p, name: e.target.value }))}
                  />
                </div>
                <div className="col-span-2">
                  <label className="label">Branch / Class</label>
                  <input
                    id="signup-branch"
                    type="text"
                    className="input-field"
                    placeholder="e.g. Computer Science, Sem 5"
                    value={signupData.branch}
                    onChange={e => setSignupData(p => ({ ...p, branch: e.target.value }))}
                  />
                </div>
                <div className="col-span-2">
                  <label className="label">Email <span className="text-gray-600">(optional)</span></label>
                  <input
                    id="signup-email"
                    type="email"
                    className="input-field"
                    placeholder="student@institution.edu"
                    value={signupData.email}
                    onChange={e => setSignupData(p => ({ ...p, email: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="label">Password</label>
                  <input
                    id="signup-password"
                    type="password"
                    className="input-field"
                    placeholder="Min. 8 chars"
                    value={signupData.password}
                    onChange={e => setSignupData(p => ({ ...p, password: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="label">Confirm Password</label>
                  <input
                    id="signup-confirm-password"
                    type="password"
                    className="input-field"
                    placeholder="Repeat password"
                    value={signupData.confirmPassword}
                    onChange={e => setSignupData(p => ({ ...p, confirmPassword: e.target.value }))}
                  />
                </div>
              </div>

              {/* Consent disclosure */}
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 mt-2">
                <div className="flex gap-3">
                  <Shield className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs text-amber-300 font-medium mb-1">Monitoring Disclosure</p>
                    <p className="text-xs text-gray-400 leading-relaxed">
                      This system monitors AI tool usage on your institutional device for academic integrity.
                      Only metadata is collected (tool name, time, duration) — never message content,
                      keystrokes, or screenshots. Usage data is visible only to authorized administrators.
                    </p>
                  </div>
                </div>
                <label className="flex items-center gap-2 mt-3 cursor-pointer">
                  <input
                    id="signup-consent"
                    type="checkbox"
                    checked={consentChecked}
                    onChange={e => setConsentChecked(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-600 bg-gray-800 accent-brand-500"
                  />
                  <span className="text-xs text-gray-300">I understand and consent to activity monitoring</span>
                </label>
              </div>

              <button
                id="signup-submit"
                type="submit"
                disabled={loading}
                className="btn-primary w-full"
              >
                {loading ? 'Creating account...' : 'Create Account'}
              </button>
            </form>
          )}

          <div className="mt-6 pt-6 border-t border-white/5 flex items-center gap-2 text-xs text-gray-600">
            <Lock size={12} />
            <span>Secure sign-in · Metadata only · No content capture</span>
          </div>
        </div>
    </AuthShell>
  );
}
