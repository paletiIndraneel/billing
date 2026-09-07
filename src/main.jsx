import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

// One-time migration cleanup: this app moved fully to Supabase (Phase 3).
// Purge the legacy offline DB, the old service worker + its caches, and dead keys.
// Idempotent — a no-op once done and on fresh browsers.
try {
  indexedDB.deleteDatabase('crm-gst-billing-db');
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations()
      .then(regs => regs.forEach(r => r.unregister()))
      .catch(() => {});
  }
  if (window.caches) {
    caches.keys().then(keys => keys.forEach(k => caches.delete(k))).catch(() => {});
  }
  ['lekhya_session', 'bizcrm_session', 'lekhya_last_sync', 'lekhya_device_id']
    .forEach(k => localStorage.removeItem(k));
} catch { /* private mode or storage blocked — nothing to clean */ }

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
