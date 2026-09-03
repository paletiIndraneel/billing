import { LogIn, Building2 } from 'lucide-react';
import logoUrl from '../assets/Nexaura logo.png';

export default function Landing({ onSignIn, onSignUp }) {
  return (
    <div className="auth-screen">
      <div className="auth-card" style={{ maxWidth: 420, textAlign: 'center' }}>
        <img src={logoUrl} alt="Lekhya One" style={{ width: 68, height: 68, margin: '0 auto 1.25rem', display: 'block', objectFit: 'contain' }} />

        <h1 style={{ fontSize: '2rem', fontWeight: 700, marginBottom: '0.375rem' }}>Lekhya One</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '2.75rem' }}>
          GST Billing &amp; Business Management
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
          <button
            className="btn btn-primary"
            onClick={onSignIn}
            style={{ padding: '0.9rem 1.25rem', fontSize: '0.975rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem' }}
          >
            <LogIn size={19} />
            <span>Sign In</span>
            <span style={{ fontSize: '0.775rem', opacity: 0.75, marginLeft: 'auto' }}>Existing account</span>
          </button>

          <button
            className="btn btn-secondary"
            onClick={onSignUp}
            style={{ padding: '0.9rem 1.25rem', fontSize: '0.975rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem' }}
          >
            <Building2 size={19} />
            <span>Sign Up</span>
            <span style={{ fontSize: '0.775rem', opacity: 0.75, marginLeft: 'auto' }}>New organization</span>
          </button>
        </div>

        <p style={{ marginTop: '2.75rem', fontSize: '0.72rem', color: 'var(--text-muted)', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
          By KANARA CLOUD SOLUTIONS Pvt. Ltd. &copy; 2026. All rights reserved.
        </p>
      </div>
    </div>
  );
}
