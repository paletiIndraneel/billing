/**
 * NEXAURA — Subscription Management
 *
 * Plans: trial (14 days) → basic / pro (annual / monthly)
 * Storage: localStorage['lekhya_subscription'] (JSON, local cache) — the trial
 * clock's source of truth is companies.trial_started_at (server-side, set
 * once via the ensure_trial_started RPC so it can't be reset locally).
 * Licenses are validated via Supabase RPC. No grace period — access hard
 * blocks the moment a trial or subscription's expiresAt passes.
 */
import { supabase } from './supabase';

const KEY = 'lekhya_subscription';
const readSub = () => { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch { return null; } };
const writeSub = (s) => localStorage.setItem(KEY, JSON.stringify(s));

export const TRIAL_DAYS = 14;

export const PLAN_LABELS = {
  trial: 'Free Trial',
  basic: 'Basic',
  pro: 'Pro',
};

/** @typedef {{ status: 'trial'|'active'|'expired'|'suspended', plan: string, expiresAt: string, activatedAt: string, licenseKey?: string, companyName?: string }} Subscription */

/** Returns the locally-cached subscription or null if never initialized */
export async function getSubscription() {
  return readSub();
}

/**
 * Ensures a trial has been started for the current company, using the
 * `ensure_trial_started` RPC as the source of truth (it sets — once,
 * idempotently — companies.trial_started_at server-side, so the trial clock
 * can't be reset by clearing localStorage or switching browser/device).
 * Falls back to the local cache (or, as a last resort, a local seed) when
 * offline. Licensed/suspended subscriptions are left untouched.
 */
export async function ensureTrialStarted() {
  const existing = await getSubscription();
  if (existing && existing.status !== 'trial') return existing;

  const companyId = localStorage.getItem('lekhya_company_id');
  if (companyId) {
    try {
      const { data: startedAt, error } = await supabase.rpc('ensure_trial_started', { p_company_id: companyId });
      if (!error && startedAt) {
        const trial = {
          status: 'trial',
          plan: 'trial',
          activatedAt: startedAt,
          expiresAt: new Date(new Date(startedAt).getTime() + TRIAL_DAYS * 86400000).toISOString(),
          licenseKey: null,
        };
        writeSub(trial);
        return trial;
      }
    } catch { /* offline — fall back to cache below */ }
  }

  if (existing) return existing;

  // First-ever load with no network reachable and nothing cached yet.
  const now = new Date();
  const trial = {
    status: 'trial',
    plan: 'trial',
    activatedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + TRIAL_DAYS * 86400000).toISOString(),
    licenseKey: null,
  };
  writeSub(trial);
  return trial;
}

/**
 * Evaluates current subscription access level.
 * Returns: 'active' | 'trial' | 'expired'
 */
export function evaluateAccess(sub) {
  if (!sub) return 'expired';
  const now = Date.now();
  const expiry = new Date(sub.expiresAt).getTime();

  if (sub.status === 'suspended') return 'expired';
  if (now <= expiry) return sub.status === 'trial' ? 'trial' : 'active';
  return 'expired';
}

/** Days remaining until expiry (negative = days past expiry) */
export function daysRemaining(sub) {
  if (!sub) return -999;
  const now = Date.now();
  const expiry = new Date(sub.expiresAt).getTime();
  return Math.ceil((expiry - now) / 86400000);
}

/**
 * Activate a license key.
 * Validates + binds the key to the current company via the `activate_license`
 * RPC (SECURITY DEFINER) — the `subscriptions` table itself has no client-facing
 * SELECT/UPDATE policy, so this is the only path that can read or claim a key.
 * Stores result locally on success.
 */
export async function activateLicense(licenseKey) {
  const key = licenseKey.trim().toUpperCase();
  if (!key) return { success: false, message: 'Enter a valid license key.' };

  const companyId = localStorage.getItem('lekhya_company_id');
  if (!companyId) return { success: false, message: 'No company linked to this account yet.' };

  try {
    const { data, error } = await supabase.rpc('activate_license', {
      p_license_key: key,
      p_company_id: companyId,
    });

    if (error || !data?.success) {
      return { success: false, message: data?.message || error?.message || 'License activation failed.' };
    }

    const sub = {
      status: 'active',
      plan: data.plan || 'basic',
      activatedAt: new Date().toISOString(),
      expiresAt: data.expires_at,
      licenseKey: key,
      companyName: data.company_name || null,
    };
    writeSub(sub);
    return { success: true, subscription: sub };
  } catch {
    // Network failure — can't validate online
    return { success: false, message: 'Unable to reach activation server. Check your internet connection.' };
  }
}

/**
 * Re-check an active license online (called periodically / on app start).
 * Silently updates local cache. Non-fatal on network failure.
 */
export async function refreshSubscriptionStatus() {
  const sub = await getSubscription();
  if (!sub?.licenseKey) return sub;

  try {
    const { data, error } = await supabase.rpc('get_license_status', { p_license_key: sub.licenseKey });

    if (!error && data) {
      const updated = {
        ...sub,
        status: data.status === 'active' ? 'active' : 'suspended',
        expiresAt: data.expires_at,
        plan: data.plan || sub.plan,
      };
      writeSub(updated);
      return updated;
    }
  } catch { /* offline — use cached */ }

  return sub;
}

/** Deactivate (reset to expired) — used by admin or on uninstall */
export async function deactivateSubscription() {
  const sub = await getSubscription();
  const expired = { ...(sub || {}), status: 'suspended', expiresAt: new Date().toISOString() };
  writeSub(expired);
  return expired;
}
