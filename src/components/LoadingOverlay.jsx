import { createContext, useContext, useState, useCallback } from 'react';

const LoadingCtx = createContext(null);

// Global save/update blocker. `withLoading` wraps an async operation so the
// full-screen overlay shows (and blocks interaction) until it settles.
// A counter (not a boolean) so overlapping calls don't hide the overlay early.
export function LoadingProvider({ children }) {
  const [count, setCount] = useState(0);
  const start = useCallback(() => setCount(c => c + 1), []);
  const stop = useCallback(() => setCount(c => Math.max(0, c - 1)), []);
  const withLoading = useCallback(async (fn) => {
    start();
    try { return await fn(); } finally { stop(); }
  }, [start, stop]);

  return (
    <LoadingCtx.Provider value={{ start, stop, withLoading }}>
      {children}
      {count > 0 && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 20000, background: 'rgba(0,0,0,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'wait' }}>
          <div className="spinning" style={{ width: 42, height: 42, border: '4px solid rgba(255,255,255,0.35)', borderTopColor: '#fff', borderRadius: '50%' }} />
        </div>
      )}
    </LoadingCtx.Provider>
  );
}

export function useLoading() {
  const ctx = useContext(LoadingCtx);
  if (!ctx) throw new Error('useLoading must be used within LoadingProvider');
  return ctx;
}
