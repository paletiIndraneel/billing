import { HashRouter, BrowserRouter, Routes, Route, NavLink, useLocation } from 'react-router-dom';
import { LayoutDashboard, Users, FileText, Package, Settings, LogOut, IndianRupee, Receipt, BarChart2, ShoppingCart, Sun, Moon, Menu, Truck } from 'lucide-react';
import { resolveTheme, setTheme } from './lib/theme';
import logo from './assets/Nexaura logo.png';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ToastProvider } from './components/Toast';
import { LoadingProvider } from './components/LoadingOverlay';
import ErrorBoundary from './components/ErrorBoundary';
import { useEffect, useState } from 'react';
import { supabase } from './lib/supabase';
import { startRealtime, stopRealtime } from './api/realtime';
import SubscriptionGate from './components/SubscriptionGate';
import { PasswordReset } from './pages/Login';
import Dashboard from './pages/Dashboard';
import CRM from './pages/CRM';
import Billing from './pages/Billing';
import Inventory from './pages/Inventory';
import SettingsPage from './pages/Settings';
import SetupWizard from './pages/SetupWizard';
import Login from './pages/Login';
import PublicSite from './pages/public/PublicSite';
import Ledger from './pages/Ledger';
import Payments from './pages/Payments';
import Expenses from './pages/Expenses';
import Reports from './pages/Reports';
import Purchases from './pages/Purchases';
import Orders from './pages/Orders';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } });

function clearSession() {
  localStorage.removeItem('lekhya_company_id');
  queryClient.clear();
}

const NAV_ITEMS = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard', end: true },
  { to: '/crm', icon: Users, label: 'Customers & Vendors' },
  { to: '/billing', icon: FileText, label: 'GST Billing' },
  { to: '/payments', icon: IndianRupee, label: 'Payments' },
  { to: '/expenses', icon: Receipt, label: 'Expenses' },
  { to: '/purchases', icon: ShoppingCart, label: 'Purchases' },
  { to: '/orders', icon: Truck, label: 'Orders & Shipment' },
  { to: '/inventory', icon: Package, label: 'Inventory' },
  { to: '/reports', icon: BarChart2, label: 'Reports' },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

function PageTitle() {
  const { pathname } = useLocation();
  const titles = {
    '/': 'Dashboard', '/crm': 'Customers & Vendors', '/billing': 'GST Billing',
    '/payments': 'Payments & Ledger', '/expenses': 'Expense Tracking',
    '/purchases': 'Purchase Management', '/orders': 'Orders & Shipment', '/inventory': 'Inventory & Stock',
    '/reports': 'GST Reports', '/settings': 'Settings',
  };
  if (pathname.startsWith('/ledger')) return 'Account Ledger';
  return titles[pathname] || 'NEXAURA';
}

function useTheme() {
  const [theme, setThemeState] = useState(resolveTheme);
  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    setThemeState(next);
  };
  return [theme, toggle];
}

function AppLayout({ user, onLogout }) {
  const [theme, toggleTheme] = useTheme();
  const [navOpen, setNavOpen] = useState(false);
  const { pathname } = useLocation();

  return (
    <div className="app-container">
      {navOpen && <div className="sidebar-backdrop" onClick={() => setNavOpen(false)} />}
      <aside className={`sidebar${navOpen ? ' sidebar--open' : ''}`}>
        <div className="sidebar-header">
          <img src={logo} alt="" style={{ width: 32, height: 32, borderRadius: 8, objectFit: 'contain', flexShrink: 0 }} />
          NEXAURA
        </div>
        <nav className="sidebar-nav">
          {NAV_ITEMS.map(({ to, icon: Icon, label, end }) => (
            <NavLink key={to} to={to} end={end}
              onClick={() => setNavOpen(false)}
              className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
              <Icon size={19} />
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
            <button
              className="topbar-menu-btn btn btn-secondary"
              style={{ padding: '0.375rem 0.5rem' }}
              onClick={() => setNavOpen(true)}
              aria-label="Open navigation menu"
            >
              <Menu size={18} />
            </button>
            <div style={{ fontWeight: 600, fontSize: '0.95rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}><PageTitle /></div>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <button
              className="btn btn-secondary"
              style={{ padding: '0.375rem 0.625rem', fontSize: '0.8rem' }}
              onClick={toggleTheme}
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
            </button>
            <div style={{ width: 34, height: 34, borderRadius: '50%', backgroundColor: 'var(--primary)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.875rem', flexShrink: 0 }}>
              {user?.username?.[0]?.toUpperCase() || 'A'}
            </div>
            <span className="topbar-username" style={{ fontWeight: 500, fontSize: '0.875rem' }}>{user?.username || 'Admin'}</span>
            <button className="btn btn-secondary" style={{ padding: '0.375rem 0.625rem', fontSize: '0.8rem' }} onClick={onLogout} title="Sign out">
              <LogOut size={14} />
            </button>
          </div>
        </header>

        <div className="content-area">
          <Routes>
            <Route path="/" element={<ErrorBoundary key={pathname} label="Dashboard"><Dashboard /></ErrorBoundary>} />
            <Route path="/crm" element={<ErrorBoundary key={pathname} label="Customers & Vendors"><CRM /></ErrorBoundary>} />
            <Route path="/billing" element={<ErrorBoundary key={pathname} label="GST Billing"><Billing /></ErrorBoundary>} />
            <Route path="/payments" element={<ErrorBoundary key={pathname} label="Payments"><Payments /></ErrorBoundary>} />
            <Route path="/expenses" element={<ErrorBoundary key={pathname} label="Expenses"><Expenses /></ErrorBoundary>} />
            <Route path="/inventory" element={<ErrorBoundary key={pathname} label="Inventory"><Inventory /></ErrorBoundary>} />
            <Route path="/reports" element={<ErrorBoundary key={pathname} label="Reports"><Reports /></ErrorBoundary>} />
            <Route path="/settings" element={<ErrorBoundary key={pathname} label="Settings"><SettingsPage /></ErrorBoundary>} />
            <Route path="/purchases" element={<ErrorBoundary key={pathname} label="Purchases"><Purchases /></ErrorBoundary>} />
            <Route path="/orders" element={<ErrorBoundary key={pathname} label="Orders & Shipment"><Orders /></ErrorBoundary>} />
            <Route path="/ledger/:partyId" element={<ErrorBoundary key={pathname} label="Ledger"><Ledger /></ErrorBoundary>} />
          </Routes>
        </div>
      </main>
    </div>
  );
}

function AuthGate() {
  const [authState, setAuthState] = useState('loading');
  const [user, setUser] = useState(null);
  const qc = useQueryClient();

  useEffect(() => {
    // Listen for PASSWORD_RECOVERY event fired when user clicks the reset email link
    const { data: { subscription: authListener } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setAuthState('reset-password');
      }
    });
    return () => authListener.unsubscribe();
  }, []);

  useEffect(() => {
    const init = async () => {
      try {
        // Try active Supabase session (cached token works offline)
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          // Always re-verify membership on app start (catches deactivated accounts)
          const { data: membership, error: memberError } = await supabase
            .from('company_members')
            .select('company_id')
            .eq('user_id', session.user.id)
            .single();

          // PGRST116 = no rows = account removed; other errors = network issue (allow offline)
          if (memberError?.code === 'PGRST116') {
            await supabase.auth.signOut().catch(() => {});
            clearSession();
            setAuthState('landing');
            return;
          }

          if (membership?.company_id) {
            localStorage.setItem('lekhya_company_id', membership.company_id);
          }

          // Unresolved company membership → don't mount a broken app shell
          if (!localStorage.getItem('lekhya_company_id')) { setAuthState('landing'); return; }

          setUser({
            id: session.user.id,
            username: session.user.user_metadata?.username || session.user.email.split('@')[0],
            email: session.user.email,
          });
          setAuthState('app');
          startRealtime(qc);
          return;
        }

        // No session — show landing (Sign In / Sign Up choice)
        setAuthState('landing');
      } catch {
        setAuthState('landing');
      }
    };
    init();
  }, []);

  if (authState === 'loading') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', flexDirection: 'column', gap: '1rem', color: 'var(--text-muted)' }}>
        <div style={{ width: 48, height: 48, borderRadius: 12, backgroundColor: 'var(--primary)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <FileText size={24} />
        </div>
        <span>Loading NEXAURA…</span>
      </div>
    );
  }

  if (authState === 'landing') {
    return (
      <BrowserRouter>
        <PublicSite
          onSignIn={() => setAuthState('login')}
          onSignUp={() => setAuthState('setup')}
        />
      </BrowserRouter>
    );
  }

  if (authState === 'setup') return <SetupWizard onComplete={() => setAuthState('login')} onBack={() => setAuthState('landing')} />;

  if (authState === 'reset-password') {
    return <PasswordReset onDone={() => { setUser(null); setAuthState('login'); }} />;
  }

  if (authState === 'login') {
    return (
      <Login
        onLogin={(u) => {
          // Public site may have left a clean-URL path (e.g. /pricing) in the
          // address bar; clear it so the authenticated app's HashRouter starts
          // from a known "/" instead of rendering under a stale pathname.
          window.history.replaceState(null, '', '/');
          qc.clear();
          setUser({ id: u.id, username: u.username, email: u.email || '' });
          setAuthState('app');
          startRealtime(qc);
        }}
        onBack={() => setAuthState('landing')}
      />
    );
  }

  return (
    <HashRouter>
      <SubscriptionGate>
        <AppLayout
          user={user}
          onLogout={async () => {
            window.history.replaceState(null, '', '/');
            stopRealtime();
            await supabase.auth.signOut().catch(() => {});
            clearSession();
            setUser(null);
            setAuthState('landing');
          }}
        />
      </SubscriptionGate>
    </HashRouter>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <LoadingProvider>
          <AuthGate />
        </LoadingProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}
