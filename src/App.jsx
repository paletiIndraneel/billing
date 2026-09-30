import { useEffect, useState } from 'react';
import { LogOut, FileText, Loader2 } from 'lucide-react';
import EVBilling from './pages/EVBilling';
import { isSupabaseConfigured, supabase } from './lib/supabase';
import { ToastProvider, useToast } from './components/Toast';

function Login({ onLogin }) {
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!email || !password) return toast.error('Enter your email and password.');
    setBusy(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) return toast.error(error.message);
    onLogin(data.user);
  };

  return <div className="auth-screen">
    <form className="auth-card" onSubmit={submit}>
      <div className="brand-mark">T</div>
      <h1>TRIARC GROUP</h1>
      <p className="muted">EV Billing — Admin Login</p>
      <label>Email<input className="form-input" type="email" value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email" /></label>
      <label>Password<input className="form-input" type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password" /></label>
      <button className="btn btn-primary full" disabled={busy}>{busy ? 'Signing in…' : 'Sign In'}</button>
    </form>
  </div>;
}

function BillingApp({ user, onLogout }) {
  return <div className="app-shell">
    <header className="topbar">
      <div className="brand"><span className="brand-mark small">T</span><strong>TRIARC GROUP</strong><span className="muted">EV Billing</span></div>
      <div className="top-actions"><span className="muted">{user?.email}</span><button className="btn btn-secondary" onClick={onLogout}><LogOut size={15}/> Sign out</button></div>
    </header>
    <main className="content-area"><EVBilling /></main>
  </div>;
}

function AuthGate() {
  const toast = useToast();
  const [state, setState] = useState('loading');
  const [user, setUser] = useState(null);

  const verify = async (session) => {
    if (!session?.user) { setUser(null); setState('login'); return; }
    const { data, error } = await supabase.from('admin_users').select('user_id').eq('user_id', session.user.id).eq('active', true).maybeSingle();
    if (error) { toast.error(error.message); await supabase.auth.signOut(); setState('login'); return; }
    if (!data) { await supabase.auth.signOut(); setUser(null); setState('denied'); return; }
    setUser(session.user);
    setState('app');
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => verify(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') { setUser(null); setState('login'); }
      else if (event === 'SIGNED_IN') verify(session);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  if (state === 'loading') return <div className="center"><Loader2 className="spin" size={28}/><span>Loading TRIARC GROUP…</span></div>;
  if (state === 'denied') return <div className="center"><div className="auth-card compact"><div className="brand-mark">T</div><h2>Admin access required</h2><p className="muted">Your account is not authorized to access EV Billing.</p><button className="btn btn-primary" onClick={()=>setState('login')}>Back to Login</button></div></div>;
  if (state === 'login') return <Login onLogin={(user) => verify({ user })} />;
  return <BillingApp user={user} onLogout={async()=>{ await supabase.auth.signOut(); }} />;
}

export default function App() {
  if (!isSupabaseConfigured) return <ToastProvider><div className="center"><div className="auth-card compact"><div className="brand-mark">T</div><h2>TRIARC GROUP</h2><p className="muted">Supabase configuration is missing.</p><p className="muted">Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Vercel, then redeploy.</p></div></div></ToastProvider>;
  return <ToastProvider><AuthGate /></ToastProvider>;
}
