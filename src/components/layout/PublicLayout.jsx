import { useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import logoUrl from '../../assets/Nexaura logo.png';
import { NAV_LINKS, COMPANY_NAME, CONTACT_EMAIL } from '../../data/publicPages';

function PublicHeader({ onSignIn, onSignUp }) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="public-header">
      <div className="public-container public-header-inner">
        <Link to="/" className="public-brand" onClick={() => setMenuOpen(false)}>
          <img src={logoUrl} alt="NEXAURA" className="public-brand-logo" />
          <span>NEXAURA</span>
        </Link>

        <button
          type="button"
          className="public-menu-btn"
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? <X size={22} /> : <Menu size={22} />}
        </button>

        <nav className={`public-nav${menuOpen ? ' public-nav--open' : ''}`} aria-label="Primary">
          {NAV_LINKS.map(({ to, label }) => (
            <NavLink key={to} to={to} className={({ isActive }) => `public-nav-link${isActive ? ' active' : ''}`} onClick={() => setMenuOpen(false)}>
              {label}
            </NavLink>
          ))}
          <div className="public-nav-actions">
            <button type="button" className="btn btn-secondary" onClick={onSignIn}>Sign In</button>
            <button type="button" className="btn btn-primary" onClick={onSignUp}>Start Free</button>
          </div>
        </nav>
      </div>
    </header>
  );
}

function PublicFooter() {
  return (
    <footer className="public-footer">
      <div className="public-container public-footer-inner">
        <div className="public-footer-brand">
          <div className="public-brand">
            <img src={logoUrl} alt="NEXAURA" className="public-brand-logo" />
            <span>NEXAURA</span>
          </div>
          <p>Business Simplified</p>
        </div>

        <div className="public-footer-col">
          <h3>Product</h3>
          <Link to="/features/">Features</Link>
          <Link to="/gst-billing/">GST Billing</Link>
          <Link to="/inventory-management/">Inventory</Link>
          <Link to="/crm/">CRM</Link>
          <Link to="/payments/">Payments</Link>
          <Link to="/pricing/">Pricing</Link>
        </div>

        <div className="public-footer-col">
          <h3>Company</h3>
          <Link to="/about/">About</Link>
          <Link to="/contact/">Contact</Link>
        </div>

        <div className="public-footer-col">
          <h3>Resources</h3>
          <Link to="/blog/">Blog</Link>
        </div>
      </div>

      <div className="public-container public-footer-bottom">
        <span>{COMPANY_NAME}</span>
        <span>&copy; 2026 {COMPANY_NAME}. All rights reserved.</span>
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
      </div>
    </footer>
  );
}

export default function PublicLayout({ onSignIn, onSignUp }) {
  return (
    <div className="public-site">
      <PublicHeader onSignIn={onSignIn} onSignUp={onSignUp} />
      <main>
        <Outlet />
      </main>
      <PublicFooter />
    </div>
  );
}
