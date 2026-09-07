import { useState, useEffect, createContext, useContext } from 'react';
import { Key, RefreshCw, AlertTriangle, CheckCircle, Clock } from 'lucide-react';
import {
  ensureTrialStarted, evaluateAccess, daysRemaining,
  activateLicense, refreshSubscriptionStatus, PLAN_LABELS, TRIAL_DAYS, GRACE_DAYS,
} from '../lib/subscription';

// ── Context ──────────────────────────────────────────────────────────────────
const SubscriptionCtx = createContext(null);
export function useSubscription() { return useContext(SubscriptionCtx); }

// ── Trial / Grace banner shown inside the running app ─────────────────────────
function SubscriptionBanner({ sub, access, onRefresh }) {
  const days = daysRemaining(sub);
  if (access === 'active') return null;

  const bannerStyle = {
    position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 9999,
    padding: '0.5rem 1.5rem',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem',
    fontSize: '0.8rem', fontWeight: 500,
    background: access === 'grace' ? '#7c3aed' : '#d97706',
    color: '#fff',
  };

  return (
    <div style={bannerStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <Clock size={14} />
        {access === 'trial'
          ? `Free trial — ${days > 0 ? `${days} day${days !== 1 ? 's' : ''} remaining` : 'expires today'}. Activate a license key to continue.`
          : `Grace period — subscription expired. ${Math.max(0, GRACE_DAYS + days)} day${Math.abs(GRACE_DAYS + days) !== 1 ? 's' : ''} left to activate.`
        }
      </div>
      <button onClick={onRefresh} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', padding: '0.25rem 0.75rem', borderRadius: 4, cursor: 'pointer', fontSize: '0.8rem' }}>
        Activate License
      </button>
    </div>
  );
}

// ── Full paywall screen (access === 'expired') ─────────────────────────────────
function SubscriptionExpired({ sub, onActivated }) {
  const [licenseKey, setLicenseKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleActivate = async (e) => {
    e.preventDefault();
    if (!licenseKey.trim()) return;
    setLoading(true);
    setError('');
    const result = await activateLicense(licenseKey);
    setLoading(false);
    if (result.success) {
      onActivated(result.subscription);
    } else {
      setError(result.message);
    }
  };

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '100vh', background: 'var(--bg-color)',
    }}>
      <div style={{
        background: 'var(--surface)', borderRadius: 16, padding: '2.5rem',
        border: '1px solid var(--border)', boxShadow: 'var(--shadow-lg)',
        maxWidth: 460, width: '90%', textAlign: 'center',
      }}>
        <div style={{ width: 56, height: 56, borderRadius: 12, background: 'rgba(239,68,68,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem' }}>
          <AlertTriangle size={28} color="var(--danger)" />
        </div>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.5rem' }}>
          {sub?.status === 'suspended' ? 'License Suspended' : 'Subscription Expired'}
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '1.75rem', lineHeight: 1.6 }}>
          {sub?.status === 'suspended'
            ? 'Your NEXAURA license has been suspended. Please contact support or enter a new license key.'
            : `Your ${PLAN_LABELS[sub?.plan] || 'trial'} has expired. Enter your license key to restore access. Your data is safe.`}
        </p>

        <form onSubmit={handleActivate} style={{ textAlign: 'left' }}>
          <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            License Key
          </label>
          <input
            type="text"
            className="form-input"
            value={licenseKey}
            onChange={e => { setLicenseKey(e.target.value.toUpperCase()); setError(''); }}
            placeholder="LKONE-XXXX-XXXX-XXXX"
            style={{ marginBottom: '0.75rem', fontFamily: 'monospace', letterSpacing: '0.05em' }}
            autoFocus
          />
          {error && (
            <div style={{ color: 'var(--danger)', fontSize: '0.8rem', marginBottom: '0.75rem', padding: '0.5rem 0.75rem', background: 'rgba(239,68,68,0.08)', borderRadius: 6 }}>
              {error}
            </div>
          )}
          <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '0.75rem' }} disabled={loading || !licenseKey.trim()}>
            {loading ? <><RefreshCw size={14} className="spinning" /> Activating…</> : <><Key size={14} /> Activate License</>}
          </button>
        </form>

        <div style={{ marginTop: '1.5rem', paddingTop: '1.25rem', borderTop: '1px solid var(--border)', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          Need a license? Contact <strong>contact@kanaracloudsolutions.dpdns.org</strong><br />
          Your local data is preserved and will be accessible once activated.
        </div>
      </div>
    </div>
  );
}

// ── Activation modal (shown from banner) ──────────────────────────────────────
function ActivationModal({ onClose, onActivated }) {
  const [licenseKey, setLicenseKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(null);

  const handleActivate = async (e) => {
    e.preventDefault();
    if (!licenseKey.trim()) return;
    setLoading(true);
    setError('');
    const result = await activateLicense(licenseKey);
    setLoading(false);
    if (result.success) {
      setSuccess(result.subscription);
      setTimeout(() => { onActivated(result.subscription); onClose(); }, 1500);
    } else {
      setError(result.message);
    }
  };

  const overlay = { position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' };
  const box = { background: 'var(--surface)', borderRadius: 12, padding: '2rem', maxWidth: 420, width: '90%', border: '1px solid var(--border)' };

  return (
    <div style={overlay} onClick={onClose}>
      <div style={box} onClick={e => e.stopPropagation()}>
        <h3 style={{ fontWeight: 700, marginBottom: '0.5rem', fontSize: '1.1rem' }}>Activate License</h3>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '1.25rem' }}>
          Enter your NEXAURA license key to unlock full access.
        </p>
        {success ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'var(--success)', fontWeight: 600 }}>
            <CheckCircle size={20} /> License activated — {PLAN_LABELS[success.plan]} plan
          </div>
        ) : (
          <form onSubmit={handleActivate}>
            <input
              type="text"
              className="form-input"
              value={licenseKey}
              onChange={e => { setLicenseKey(e.target.value.toUpperCase()); setError(''); }}
              placeholder="LKONE-XXXX-XXXX-XXXX"
              style={{ marginBottom: '0.75rem', fontFamily: 'monospace' }}
              autoFocus
            />
            {error && <div style={{ color: 'var(--danger)', fontSize: '0.8rem', marginBottom: '0.75rem' }}>{error}</div>}
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
              <button type="submit" className="btn btn-primary" style={{ flex: 2 }} disabled={loading || !licenseKey.trim()}>
                {loading ? 'Activating…' : <><Key size={14} /> Activate</>}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// ── Gate: wraps the whole app ─────────────────────────────────────────────────
export default function SubscriptionGate({ children }) {
  const [sub, setSub] = useState(null);
  const [access, setAccess] = useState('loading');
  const [showActivation, setShowActivation] = useState(false);

  useEffect(() => {
    const init = async () => {
      let s = await ensureTrialStarted();
      // Try online refresh for active licenses (non-blocking)
      if (s?.licenseKey) {
        try { s = await refreshSubscriptionStatus(); } catch { /* offline ok */ }
      }
      setSub(s);
      setAccess(evaluateAccess(s));
    };
    init();
  }, []);

  const handleActivated = (newSub) => {
    setSub(newSub);
    setAccess(evaluateAccess(newSub));
    setShowActivation(false);
  };

  if (access === 'loading') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Checking license…</span>
      </div>
    );
  }

  if (access === 'expired') {
    return <SubscriptionExpired sub={sub} onActivated={handleActivated} />;
  }

  return (
    <SubscriptionCtx.Provider value={{ sub, access }}>
      {children}
      <SubscriptionBanner sub={sub} access={access} onRefresh={() => setShowActivation(true)} />
      {showActivation && <ActivationModal onClose={() => setShowActivation(false)} onActivated={handleActivated} />}
    </SubscriptionCtx.Provider>
  );
}
