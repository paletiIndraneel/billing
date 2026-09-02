import { useState } from 'react';
import { verifyUser, getSetting, db } from '../db/db';
import { supabase } from '../lib/supabase';
import { LogIn, KeyRound, ArrowLeft, HelpCircle, Mail, Building2, CheckCircle } from 'lucide-react';
import logoUrl from '../assets/logo.png';
import { useToast } from '../components/Toast';

// ── Password Reset screen (shown after user clicks email link) ─────────────────
export function PasswordReset({ onDone }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const toast = useToast();

  const handleReset = async (e) => {
    e.preventDefault();
    if (password !== confirm) { toast('Passwords do not match', 'error'); return; }
    if (password.length < 8) { toast('Password must be at least 8 characters', 'error'); return; }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setDone(true);
      toast('Password updated — please sign in', 'success');
      setTimeout(onDone, 2000);
    } catch (err) {
      toast('Failed to update password: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-screen">
      <div className="auth-card" style={{ maxWidth: 400 }}>
        <div className="auth-logo">
          <div style={{ width: 52, height: 52, borderRadius: 14, backgroundColor: '#7C3AED', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 0.75rem' }}>
            <KeyRound size={26} />
          </div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.25rem' }}>Set New Password</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Choose a strong password for your account</p>
        </div>

        {done ? (
          <div style={{ textAlign: 'center', color: 'var(--success)', fontWeight: 600, padding: '1rem 0' }}>
            <CheckCircle size={36} style={{ display: 'block', margin: '0 auto 0.75rem' }} />
            Password updated — redirecting to sign in…
          </div>
        ) : (
          <form onSubmit={handleReset}>
            <div className="form-group">
              <label className="form-label">New Password *</label>
              <input required type="password" className="form-input" autoFocus minLength={8}
                value={password} onChange={e => setPassword(e.target.value)}
                placeholder="At least 8 characters" />
            </div>
            <div className="form-group">
              <label className="form-label">Confirm New Password *</label>
              <input required type="password" className="form-input" minLength={8}
                value={confirm} onChange={e => setConfirm(e.target.value)}
                placeholder="Repeat your new password" />
            </div>
            <button type="submit" className="btn btn-primary" disabled={loading}
              style={{ width: '100%', padding: '0.75rem', marginTop: '0.5rem' }}>
              {loading ? 'Updating…' : <><KeyRound size={16} /> Update Password</>}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

// Brute-force protection for offline local login.
// Supabase handles rate-limiting on its own for cloud auth.
const _localAuth = { failures: 0, lockedUntil: 0 };

function checkLocalLoginLock() {
  if (Date.now() < _localAuth.lockedUntil) {
    const waitSec = Math.ceil((_localAuth.lockedUntil - Date.now()) / 1000);
    throw new Error(`Too many failed attempts — wait ${waitSec}s before trying again`);
  }
}

function recordLocalFailure() {
  _localAuth.failures++;
  if (_localAuth.failures >= 5) {
    // Exponential backoff: 30s, 60s, 120s … capped at 30 minutes
    const wait = Math.min(30 * Math.pow(2, _localAuth.failures - 5), 1800) * 1000;
    _localAuth.lockedUntil = Date.now() + wait;
  }
}

function clearLocalLock() {
  _localAuth.failures = 0;
  _localAuth.lockedUntil = 0;
}

function maskEmail(email) {
  if (!email || !email.includes('@')) return '(not available)';
  const [u, domain] = email.split('@');
  if (u.length <= 2) return `${u[0]}*@${domain}`;
  return `${u[0]}${'*'.repeat(u.length - 2)}${u[u.length - 1]}@${domain}`;
}

// screen: 'login' | 'forgot-choice' | 'forgot-password' | 'forgot-email'
export default function Login({ onLogin, onBack }) {
  const [screen, setScreen] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);

  // forgot-password state
  const [fpEmail, setFpEmail] = useState('');
  const [fpSent, setFpSent] = useState(false);

  // forgot-email state
  const [lookupGstin, setLookupGstin] = useState('');
  const [lookupName, setLookupName] = useState('');
  const [lookupResult, setLookupResult] = useState(null); // { email, username } | null

  const toast = useToast();

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (!error && data.session) {
        // Verify membership exists (user not removed from org)
        const { data: membership, error: memberError } = await supabase
          .from('company_members')
          .select('company_id')
          .eq('user_id', data.user.id)
          .single();

        if (!membership?.company_id) {
          await supabase.auth.signOut();
          toast(
            memberError?.code === 'PGRST116'
              ? 'Your account has been removed from the organization. Contact your administrator.'
              : 'Unable to verify organization access. Check your connection.',
            'error'
          );
          return;
        }

        // Verify company record still exists
        const { data: company } = await supabase
          .from('companies')
          .select('id')
          .eq('id', membership.company_id)
          .single();

        if (!company) {
          await supabase.auth.signOut();
          toast('Your organization account no longer exists. Contact support.', 'error');
          return;
        }

        localStorage.setItem('lekhya_company_id', membership.company_id);
        const displayName = data.user.user_metadata?.username || email.split('@')[0];
        onLogin({ id: data.user.id, username: displayName, email: data.user.email }, remember);
        return;
      }

      // Offline fallback: try local Dexie user (email prefix as username)
      if (error?.message?.includes('fetch') || error?.message?.includes('network') || error?.message?.includes('Failed')) {
        try {
          checkLocalLoginLock();
        } catch (lockErr) {
          toast(lockErr.message, 'error');
          return;
        }
        const localUsername = email.includes('@') ? email.split('@')[0] : email;
        const user = await verifyUser(localUsername, password);
        if (user) {
          clearLocalLock();
          toast('Signed in offline — sync will resume when connected', 'success');
          onLogin(user, remember);
          return;
        }
        recordLocalFailure();
      }

      toast(error?.message || 'Invalid email or password', 'error');
    } catch (err) {
      toast('Login failed: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const appUrl = import.meta.env.VITE_APP_URL || window.location.origin;
      const { error } = await supabase.auth.resetPasswordForEmail(fpEmail.trim(), {
        redirectTo: appUrl,
      });
      if (error) throw new Error(error.message);
      setFpSent(true);
      toast('Password reset email sent — check your inbox', 'success');
    } catch (err) {
      toast('Reset failed: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleLookupEmail = async (e) => {
    e.preventDefault();
    if (!lookupGstin.trim() && !lookupName.trim()) {
      toast('Enter at least one field to look up your account', 'warning');
      return;
    }
    setLoading(true);
    try {
      const company = await getSetting('company', {});
      const gstinMatch = lookupGstin.trim() &&
        company.gstin?.trim().toLowerCase() === lookupGstin.trim().toLowerCase();
      const nameMatch = lookupName.trim() &&
        company.name?.trim().toLowerCase() === lookupName.trim().toLowerCase();

      if (!gstinMatch && !nameMatch) {
        toast('No matching company found. Check the details and try again.', 'error');
        return;
      }

      // Match found — pull hints
      const users = await db.users.toArray();
      const foundEmail = company.email || users[0]?.email || '';
      const foundUsername = users[0]?.username || '';
      setLookupResult({ email: foundEmail, username: foundUsername });
    } catch (err) {
      toast('Lookup failed: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  // ── Screens ────────────────────────────────────────────────────────────────

  if (screen === 'forgot-choice') {
    return (
      <div className="auth-screen">
        <div className="auth-card" style={{ maxWidth: 400 }}>
          <div className="auth-logo">
            <div style={{
              width: 48, height: 48, borderRadius: 14,
              backgroundColor: '#7C3AED', color: 'white',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 0.75rem',
            }}>
              <HelpCircle size={24} />
            </div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.25rem' }}>Forgot Credentials?</h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>What do you need help with?</p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem', marginTop: '0.5rem' }}>
            <button className="btn btn-primary" onClick={() => setScreen('forgot-password')}
              style={{ padding: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <KeyRound size={18} />
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>Forgot Password</div>
                <div style={{ fontSize: '0.75rem', opacity: 0.8 }}>Reset via your registered email</div>
              </div>
            </button>

            <button className="btn btn-secondary" onClick={() => { setLookupResult(null); setScreen('forgot-email'); }}
              style={{ padding: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <Mail size={18} />
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>Forgot Email / Username</div>
                <div style={{ fontSize: '0.75rem', opacity: 0.8 }}>Look up using GSTIN or company name</div>
              </div>
            </button>
          </div>

          <button type="button" className="btn btn-secondary"
            onClick={() => setScreen('login')}
            style={{ width: '100%', marginTop: '1.25rem', padding: '0.625rem', fontSize: '0.875rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
            <ArrowLeft size={15} /> Back to Sign In
          </button>
        </div>
      </div>
    );
  }

  if (screen === 'forgot-password') {
    return (
      <div className="auth-screen">
        <div className="auth-card" style={{ maxWidth: 420 }}>
          <div className="auth-logo">
            <div style={{
              width: 52, height: 52, borderRadius: 14,
              backgroundColor: '#7C3AED', color: 'white',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 0.75rem',
            }}>
              <KeyRound size={26} />
            </div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.25rem' }}>Reset Password</h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
              {fpSent ? 'Check your email for a reset link' : 'Enter your account email'}
            </p>
          </div>

          {!fpSent ? (
            <form onSubmit={handleForgotPassword}>
              <div className="form-group">
                <label className="form-label">Registered Email *</label>
                <input required type="email" className="form-input" autoFocus
                  value={fpEmail} onChange={e => setFpEmail(e.target.value)}
                  placeholder="you@example.com" />
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button type="button" className="btn btn-secondary"
                  onClick={() => setScreen('forgot-choice')} style={{ flex: 1, padding: '0.75rem' }}>
                  <ArrowLeft size={16} /> Back
                </button>
                <button type="submit" className="btn btn-primary" disabled={loading}
                  style={{ flex: 2, padding: '0.75rem' }}>
                  {loading ? 'Sending…' : 'Send Reset Email'}
                </button>
              </div>
            </form>
          ) : (
            <div style={{ textAlign: 'center' }}>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
                A reset link was sent to <strong>{fpEmail}</strong>. Click it to set a new password, then come back and sign in.
              </p>
              <button className="btn btn-primary" style={{ width: '100%', padding: '0.75rem' }}
                onClick={() => { setScreen('login'); setFpSent(false); }}>
                Back to Sign In
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (screen === 'forgot-email') {
    return (
      <div className="auth-screen">
        <div className="auth-card" style={{ maxWidth: 420 }}>
          <div className="auth-logo">
            <div style={{
              width: 52, height: 52, borderRadius: 14,
              backgroundColor: '#059669', color: 'white',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 0.75rem',
            }}>
              <Building2 size={26} />
            </div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.25rem' }}>Find Your Account</h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
              Enter your company details to look up your login email
            </p>
          </div>

          {!lookupResult ? (
            <form onSubmit={handleLookupEmail}>
              <div className="form-group">
                <label className="form-label">GSTIN</label>
                <input type="text" className="form-input" autoFocus maxLength={15}
                  value={lookupGstin} onChange={e => setLookupGstin(e.target.value.toUpperCase())}
                  placeholder="22AAAAA0000A1Z5" />
              </div>
              <div style={{ textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0.25rem 0 0.75rem' }}>
                — or —
              </div>
              <div className="form-group">
                <label className="form-label">Company / Business Name</label>
                <input type="text" className="form-input"
                  value={lookupName} onChange={e => setLookupName(e.target.value)}
                  placeholder="Sharma Enterprises Pvt. Ltd." />
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button type="button" className="btn btn-secondary"
                  onClick={() => setScreen('forgot-choice')} style={{ flex: 1, padding: '0.75rem' }}>
                  <ArrowLeft size={16} /> Back
                </button>
                <button type="submit" className="btn btn-primary" disabled={loading}
                  style={{ flex: 2, padding: '0.75rem' }}>
                  {loading ? 'Searching…' : 'Look Up Account'}
                </button>
              </div>
            </form>
          ) : (
            <div>
              <div style={{
                padding: '1rem 1.125rem',
                background: 'rgba(5,150,105,0.07)',
                border: '1px solid rgba(5,150,105,0.25)',
                borderRadius: 'var(--radius-sm)',
                marginBottom: '1.25rem',
              }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                  Account found on this device:
                </div>
                {lookupResult.email && (
                  <div style={{ marginBottom: '0.5rem' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Login email: </span>
                    <strong style={{ fontSize: '0.9rem', fontFamily: 'monospace' }}>{maskEmail(lookupResult.email)}</strong>
                  </div>
                )}
                {lookupResult.username && (
                  <div>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Username: </span>
                    <strong style={{ fontSize: '0.9rem' }}>{lookupResult.username}</strong>
                  </div>
                )}
              </div>

              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
                Use that email to sign in. If you don't remember the password, use "Forgot Password" to reset it.
              </p>

              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button className="btn btn-secondary" style={{ flex: 1, padding: '0.75rem' }}
                  onClick={() => { setScreen('forgot-password'); setFpEmail(lookupResult.email || ''); }}>
                  Reset Password
                </button>
                <button className="btn btn-primary" style={{ flex: 1, padding: '0.75rem' }}
                  onClick={() => { setEmail(lookupResult.email || ''); setScreen('login'); }}>
                  Sign In
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Main login screen ──────────────────────────────────────────────────────
  return (
    <div className="auth-screen">
      <div className="auth-card" style={{ maxWidth: 400 }}>
        <div className="auth-logo">
          <img src={logoUrl} alt="Lekhya One" style={{ width: 56, height: 56, margin: '0 auto 1rem', display: 'block', objectFit: 'contain' }} />
          <h1 style={{ fontSize: '1.875rem', fontWeight: 700, marginBottom: '0.25rem' }}>Lekhya One</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Sign in to your account</p>
        </div>

        <form onSubmit={handleLogin}>
          <div className="form-group">
            <label className="form-label">Email</label>
            <input required type="email" className="form-input" autoFocus autoComplete="email"
              value={email} onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com" />
          </div>
          <div className="form-group">
            <label className="form-label">Password</label>
            <input required type="password" className="form-input" autoComplete="current-password"
              value={password} onChange={e => setPassword(e.target.value)}
              placeholder="Enter your password" />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input type="checkbox" id="remember" checked={remember}
                onChange={e => setRemember(e.target.checked)}
                style={{ cursor: 'pointer', width: 16, height: 16, accentColor: 'var(--primary)' }} />
              <label htmlFor="remember" style={{ fontSize: '0.875rem', cursor: 'pointer' }}>
                Keep me signed in
              </label>
            </div>
            <button type="button"
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.8rem', color: 'var(--primary)', padding: 0 }}
              onClick={() => setScreen('forgot-choice')}>
              Forgot credentials?
            </button>
          </div>
          <button type="submit" className="btn btn-primary" disabled={loading}
            style={{ width: '100%', padding: '0.75rem', fontSize: '1rem' }}>
            {loading ? 'Signing in…' : <><LogIn size={18} /> Sign In</>}
          </button>
        </form>

        {onBack && (
          <button type="button" className="btn btn-secondary"
            onClick={onBack}
            style={{ width: '100%', marginTop: '0.75rem', padding: '0.625rem', fontSize: '0.875rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
            <ArrowLeft size={15} /> Back
          </button>
        )}

        <p style={{
          textAlign: 'center', marginTop: '2rem', fontSize: '0.75rem',
          color: 'var(--text-muted)', borderTop: '1px solid var(--border)', paddingTop: '1rem',
        }}>
          Lekhya One · zero
        </p>
      </div>
    </div>
  );
}
