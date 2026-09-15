import { useRef } from 'react';
import { LogIn, Building2 } from 'lucide-react';
import logoUrl from '../assets/Nexaura logo.png';
import ProductCarousel from '../components/landing/ProductCarousel';
import FeatureGrid from '../components/landing/FeatureGrid';

export default function Landing({ onSignIn, onSignUp }) {
  const cardRef = useRef(null);
  const screenRef = useRef(null);

  const handlePointerMove = (e) => {
    const card = cardRef.current;
    if (!card) return;
    const rect = card.getBoundingClientRect();
    card.style.setProperty('--mx', `${((e.clientX - rect.left) / rect.width) * 100}%`);
    card.style.setProperty('--my', `${((e.clientY - rect.top) / rect.height) * 100}%`);
  };

  const handleAuraMove = (e) => {
    const screen = screenRef.current;
    if (!screen) return;
    const rect = screen.getBoundingClientRect();
    screen.style.setProperty('--ax', `${((e.clientX - rect.left) / rect.width) * 100}%`);
    screen.style.setProperty('--ay', `${((e.clientY - rect.top) / rect.height) * 100}%`);
  };

  const handleJumpToAuth = () => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    cardRef.current?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  };

  return (
    <div ref={screenRef} className="auth-screen auth-screen--aurora landing-screen" onMouseMove={handleAuraMove}>
      <div className="auth-stars" aria-hidden="true" />
      <div className="landing-layout">
        <div className="landing-marketing">
          <div className="landing-badge">🇮🇳 Built for Indian Businesses</div>

          <div className="landing-brand">
            <img src={logoUrl} alt="NEXAURA" className="landing-brand-logo" />
            <span>NEXAURA</span>
          </div>
          <p className="landing-tagline">Business, connected.</p>

          <h1 className="landing-headline">
            All-in-One
            <br />
            <span className="landing-headline-accent">Business Management</span>
            <br />
            for Growing Businesses
          </h1>

          <p className="landing-description">
            NEXAURA helps you manage GST billing, invoicing, inventory management, CRM,
            purchases, expenses and business reports — all in one connected platform built
            for Indian businesses.
          </p>

          <button type="button" className="landing-jump-to-auth" onClick={handleJumpToAuth}>
            <LogIn size={17} />
            <span>Sign In / Sign Up</span>
          </button>

          <ProductCarousel />

          <FeatureGrid />
        </div>

        <div
          ref={cardRef}
          className="auth-card auth-card--glass landing-card landing-auth-panel"
          onMouseMove={handlePointerMove}
        >
          <div className="landing-orbit">
            <img src={logoUrl} alt="NEXAURA" />
          </div>

          <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.375rem', textAlign: 'center' }}>
            NEXAURA
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1.25rem', textAlign: 'center' }}>
            Business, connected.
          </p>

          <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.375rem', textAlign: 'center' }}>
            Welcome Back
          </h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '1.75rem', lineHeight: 1.5, textAlign: 'center' }}>
            Sign in to manage your business smarter with NEXAURA.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
            <button
              className="btn btn-primary landing-cta"
              onClick={onSignIn}
              style={{ padding: '0.9rem 1.25rem', fontSize: '0.975rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem' }}
            >
              <LogIn size={19} />
              <span>Sign In</span>
              <span style={{ fontSize: '0.775rem', opacity: 0.75, marginLeft: 'auto' }}>Existing account</span>
            </button>

            <button
              className="btn btn-secondary landing-cta"
              onClick={onSignUp}
              style={{ padding: '0.9rem 1.25rem', fontSize: '0.975rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem' }}
            >
              <Building2 size={19} />
              <span>Sign Up</span>
              <span style={{ fontSize: '0.775rem', opacity: 0.75, marginLeft: 'auto' }}>New organization</span>
            </button>
          </div>

          <p style={{ marginTop: '2rem', fontSize: '0.72rem', color: 'var(--text-muted)', borderTop: '1px solid var(--border)', paddingTop: '1rem', textAlign: 'center' }}>
            By KANARA CLOUD SOLUTIONS Pvt. Ltd. &copy; 2026. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  );
}
