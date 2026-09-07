import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { ArrowRight, ArrowLeft, Check, Cloud } from 'lucide-react';
import logoUrl from '../assets/Nexaura logo.png';
import { useToast } from '../components/Toast';

const STEPS = ['Business Info', 'Admin Account'];

export default function SetupWizard({ onComplete }) {
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  const [company, setCompany] = useState({
    name: '', gstin: '', address: '', phone: '', email: '',
    bankName: '', bankAccount: '', bankIFSC: '',
  });

  const [account, setAccount] = useState({
    username: '', email: '', password: '', confirmPassword: '',
  });

  const [cloudStatus, setCloudStatus] = useState(null); // null | 'connecting' | 'ok' | 'offline'

  const setCompanyField = (f, v) => setCompany(c => ({ ...c, [f]: v }));
  const setAccountField = (f, v) => setAccount(a => ({ ...a, [f]: v }));

  const handleFinish = async (e) => {
    e.preventDefault();
    if (account.password.length < 6) { toast('Password must be at least 6 characters', 'warning'); return; }
    if (account.password !== account.confirmPassword) { toast('Passwords do not match', 'error'); return; }
    if (!account.email) { toast('Email is required for cloud sync across devices', 'warning'); return; }

    setSaving(true);
    setCloudStatus('connecting');
    try {
      // 1. Create Supabase account
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: account.email.trim(),
        password: account.password,
        options: {
          data: { username: account.username.trim() || account.email.split('@')[0] },
        },
      });

      if (signUpError) throw new Error(signUpError.message);

      const supabaseUser = signUpData.user;

      // 2. Create company row in Supabase
      const { data: companyRow, error: companyError } = await supabase
        .from('companies')
        .insert({
          name: company.name,
          gstin: company.gstin || null,
          address: company.address || null,
          phone: company.phone || null,
          email: company.email || null,
          owner_id: supabaseUser.id,
        })
        .select()
        .single();

      if (companyError) throw new Error(companyError.message);

      // 3. Link user to company
      await supabase.from('company_members').insert({
        user_id: supabaseUser.id,
        company_id: companyRow.id,
        role: 'owner',
      });

      // 4. Store company ID locally for sync
      localStorage.setItem('lekhya_company_id', companyRow.id);
      setCloudStatus('ok');

      toast('Setup complete! Signing you in…', 'success');
      onComplete();
    } catch (err) {
      setCloudStatus(null);
      toast('Setup failed: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="auth-screen">
      <div className="auth-card" style={{ maxWidth: 520 }}>
        <div className="auth-logo">
          <img src={logoUrl} alt="NEXAURA" style={{ width: 52, height: 52, margin: '0 auto 0.75rem', display: 'block', objectFit: 'contain' }} />
          <h1 style={{ fontSize: '1.625rem', fontWeight: 700, marginBottom: '0.25rem' }}>Welcome to NEXAURA</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Let's set up your business account</p>
        </div>

        {/* Step indicators */}
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', marginBottom: '2rem' }}>
          {STEPS.map((label, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.8rem', fontWeight: 600, transition: 'all 0.3s',
                background: i < step ? 'var(--success)' : i === step ? 'var(--primary)' : 'var(--border)',
                color: i <= step ? 'white' : 'var(--text-muted)',
              }}>
                {i < step ? <Check size={14} /> : i + 1}
              </div>
              <span style={{ fontSize: '0.8rem', fontWeight: 500, color: i === step ? 'var(--text-main)' : 'var(--text-muted)' }}>
                {label}
              </span>
              {i < STEPS.length - 1 && (
                <div style={{ width: 32, height: 2, background: i < step ? 'var(--success)' : 'var(--border)', borderRadius: 1, marginLeft: '0.25rem' }} />
              )}
            </div>
          ))}
        </div>

        {/* Step 1: Business Info */}
        {step === 0 && (
          <form onSubmit={e => { e.preventDefault(); setStep(1); }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label className="form-label">Business / Company Name *</label>
                <input required type="text" className="form-input" autoFocus
                  value={company.name} onChange={e => setCompanyField('name', e.target.value)}
                  placeholder="e.g. Sharma Enterprises Pvt. Ltd." />
              </div>
              <div className="form-group">
                <label className="form-label">GSTIN</label>
                <input type="text" className="form-input" maxLength={15}
                  value={company.gstin} onChange={e => setCompanyField('gstin', e.target.value.toUpperCase())}
                  placeholder="22AAAAA0000A1Z5" />
              </div>
              <div className="form-group">
                <label className="form-label">Phone</label>
                <input type="tel" className="form-input"
                  value={company.phone} onChange={e => setCompanyField('phone', e.target.value)}
                  placeholder="9999999999" />
              </div>
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label className="form-label">Email</label>
                <input type="email" className="form-input"
                  value={company.email} onChange={e => setCompanyField('email', e.target.value)}
                  placeholder="info@yourcompany.com" />
              </div>
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label className="form-label">Business Address *</label>
                <textarea required className="form-input" rows={3}
                  value={company.address} onChange={e => setCompanyField('address', e.target.value)}
                  placeholder="Street, City, State — PIN Code" />
              </div>
            </div>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1.5rem', fontStyle: 'italic' }}>
              Bank details can be added later in Settings.
            </p>
            <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '0.75rem', fontSize: '0.95rem' }}>
              Next <ArrowRight size={18} />
            </button>
          </form>
        )}

        {/* Step 2: Admin Account */}
        {step === 1 && (
          <form onSubmit={handleFinish}>
            {/* Cloud sync info banner */}
            <div style={{ display: 'flex', gap: '0.625rem', alignItems: 'flex-start', padding: '0.75rem', background: 'rgba(79,70,229,0.06)', border: '1px solid rgba(79,70,229,0.2)', borderRadius: 'var(--radius-sm)', marginBottom: '1.25rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              <Cloud size={16} style={{ color: 'var(--primary)', flexShrink: 0, marginTop: 1 }} />
              <span>Access your account from any browser with this email and password.</span>
            </div>

            <div className="form-group">
              <label className="form-label">Display Name</label>
              <input type="text" className="form-input" autoFocus
                value={account.username} onChange={e => setAccountField('username', e.target.value)}
                placeholder="Admin" />
            </div>
            <div className="form-group">
              <label className="form-label">Email *</label>
              <input required type="email" className="form-input"
                value={account.email} onChange={e => setAccountField('email', e.target.value)}
                placeholder="you@example.com" />
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                Use this email to log in on any device
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Password *</label>
              <input required type="password" className="form-input" minLength={6}
                value={account.password} onChange={e => setAccountField('password', e.target.value)}
                placeholder="At least 6 characters" />
            </div>
            <div className="form-group">
              <label className="form-label">Confirm Password *</label>
              <input required type="password" className="form-input"
                value={account.confirmPassword} onChange={e => setAccountField('confirmPassword', e.target.value)}
                placeholder="Re-enter your password" />
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setStep(0)} style={{ flex: 1, padding: '0.75rem' }}>
                <ArrowLeft size={17} /> Back
              </button>
              <button type="submit" className="btn btn-primary" disabled={saving} style={{ flex: 1, padding: '0.75rem', fontSize: '0.95rem' }}>
                {saving ? (cloudStatus === 'connecting' ? 'Creating account…' : 'Setting up…') : 'Finish Setup'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
