import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { LogIn, KeyRound, ArrowLeft, HelpCircle, CheckCircle } from 'lucide-react';
import logoUrl from '../assets/Nexaura logo.png';
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

// screen: 'login' | 'forgot-choice' | 'forgot-password'
export default function Login({ onLogin, onBack }) {
  const [screen, setScreen] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  // forgot-password state
  const [fpEmail, setFpEmail] = useState('');
  const [fpSent, setFpSent] = useState(false);

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
        onLogin({ id: data.user.id, username: displayName, email: data.user.email });
        return;
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
          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginBottom: '1.5rem' }}>
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
