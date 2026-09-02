import { supabase } from './supabase';
import { db, setSyncCallbacks } from '../db/db';

const SYNC_TABLES = ['parties', 'products', 'productVariants', 'invoices', 'transactions', 'expenses', 'purchases', 'stockLedger'];
const LAST_SYNC_KEY = 'lekhya_last_sync';

// Dexie uses camelCase; Supabase tables use snake_case
const TABLE_NAME_MAP = {
  productVariants: 'product_variants',
  stockLedger:     'stock_ledger',
};

// Tables that use additive-only merge — entries are immutable once written.
// pullChanges will ADD missing entries but never overwrite existing ones.
const APPEND_ONLY_TABLES = new Set(['stockLedger']);
const supabaseTable = name => TABLE_NAME_MAP[name] || name;

export function getCompanyId() {
  return localStorage.getItem('lekhya_company_id');
}

function getLastSyncTime() {
  return localStorage.getItem(LAST_SYNC_KEY) || '1970-01-01T00:00:00.000Z';
}

function setLastSyncTime(time) {
  localStorage.setItem(LAST_SYNC_KEY, time);
}

// Ensure we have a valid Supabase session — refresh if expired
async function getValidSession() {
  let { data: { session } } = await supabase.auth.getSession();
  if (session) return session;
  // Attempt silent token refresh (works when refresh_token is still valid)
  try {
    const { data: refreshed, error } = await supabase.auth.refreshSession();
    if (!error && refreshed?.session) return refreshed.session;
  } catch { /* network unavailable — stay offline */ }
  return null;
}

// Push all locally pending records to Supabase
async function pushPending() {
  const companyId = getCompanyId();
  if (!companyId) return;

  const session = await getValidSession();
  if (!session) return;

  for (const tableName of SYNC_TABLES) {
    const pending = await db[tableName].where('syncStatus').equals('pending').toArray();
    if (pending.length === 0) continue;

    const rows = pending.map(record => {
      const { id, cloudId, syncStatus, lastModified, deviceId, deleted, ...rest } = record;
      return {
        id: cloudId,
        company_id: companyId,
        data: { ...rest, localId: id },
        last_modified: lastModified,
        device_id: deviceId,
        deleted: deleted || false,
      };
    });

    const { error } = await supabase
      .from(supabaseTable(tableName))
      .upsert(rows, { onConflict: 'id,company_id' });

    if (error) {
      console.error(`[Sync] Push error on ${tableName}:`, error.message);
      continue;
    }

    const localIds = pending.map(r => r.id);
    await db[tableName].where('id').anyOf(localIds).modify({ syncStatus: 'synced' });
  }
}

// Pull records changed on other devices since last sync
async function pullChanges() {
  const companyId = getCompanyId();
  if (!companyId) return;

  const session = await getValidSession();
  if (!session) return;

  const lastSync = getLastSyncTime();
  const newSyncTime = new Date().toISOString();

  for (const tableName of SYNC_TABLES) {
    const { data, error } = await supabase
      .from(supabaseTable(tableName))
      .select('*')
      .eq('company_id', companyId)
      .gt('last_modified', lastSync);

    if (error) {
      console.error(`[Sync] Pull error on ${tableName}:`, error.message);
      continue;
    }

    const isAppendOnly = APPEND_ONLY_TABLES.has(tableName);

    for (const row of data || []) {
      const { localId, ...restData } = row.data || {};

      if (row.deleted) {
        // Append-only tables (stockLedger) are never deleted — tombstones are ignored.
        if (!isAppendOnly && localId) {
          await db[tableName].delete(localId)
            .catch(err => console.warn(`[Sync] ${tableName} local delete failed:`, err?.message));
        }
        continue;
      }

      const existing = localId
        ? await db[tableName].get(localId)
        : await db[tableName].where('cloudId').equals(row.id).first();

      if (!existing) {
        await db[tableName].add({
          _fromSync: true,
          ...restData,
          cloudId: row.id,
          syncStatus: 'synced',
          lastModified: row.last_modified,
          deviceId: row.device_id,
        }).catch(err => console.warn(`[Sync] ${tableName} local add failed:`, err?.message));
      } else if (!isAppendOnly && row.last_modified > existing.lastModified) {
        // Standard tables: last-write-wins on cloud-newer records.
        // Append-only tables (stockLedger): existing entries are immutable — skip.
        await db[tableName].update(existing.id, {
          _fromSync: true,
          ...restData,
          cloudId: row.id,
          syncStatus: 'synced',
          lastModified: row.last_modified,
          deviceId: row.device_id,
        }).catch(err => console.warn(`[Sync] ${tableName} local update failed:`, err?.message));
      }
    }
  }

  setLastSyncTime(newSyncTime);
}

// Soft-delete records in Supabase (sets deleted=true + bumps last_modified)
// so other devices can pull the tombstone and remove the record locally.
async function pushCloudDeletes(tableName, cloudIds) {
  const companyId = getCompanyId();
  if (!companyId || !cloudIds?.length) return;

  const session = await getValidSession();
  if (!session) return;

  const now = new Date().toISOString();
  const rows = cloudIds.map(id => ({
    id,
    company_id: companyId,
    deleted: true,
    last_modified: now,
    data: {},
    device_id: localStorage.getItem('lekhya_device_id') || 'unknown',
  }));

  const { error } = await supabase
    .from(supabaseTable(tableName))
    .upsert(rows, { onConflict: 'id,company_id' });

  if (error) console.error(`[Sync] Cloud delete error on ${tableName}:`, error.message);
}

// Debounced push — coalesces rapid writes into one Supabase round-trip
let _pushTimer = null;
function debouncedPush() {
  if (_pushTimer) clearTimeout(_pushTimer);
  _pushTimer = setTimeout(() => {
    _pushTimer = null;
    pushPending().catch(err => console.error('[Sync] Push error:', err));
  }, 500);
}

// Debounced pull — coalesces realtime events that arrive in burst (e.g. multi-row upsert)
let _pullTimer = null;
function debouncedPull() {
  if (_pullTimer) clearTimeout(_pullTimer);
  _pullTimer = setTimeout(() => {
    _pullTimer = null;
    pullChanges().catch(err => console.error('[Sync] Realtime pull error:', err));
  }, 300);
}

export async function sync() {
  try {
    await pushPending();
    await pullChanges();
  } catch (err) {
    console.error('[Sync] Sync error:', err);
  }
}

let _syncTimer = null;
let _realtimeChannel = null;

export function startAutoSync(intervalMs = 60_000) {
  // Wire up immediate push on every DML operation
  setSyncCallbacks(debouncedPush, pushCloudDeletes);

  if (_syncTimer) clearInterval(_syncTimer);
  sync(); // immediate first run
  _syncTimer = setInterval(sync, intervalMs);

  // ── Supabase Realtime: pull immediately when another device writes ──────────
  if (_realtimeChannel) {
    supabase.removeChannel(_realtimeChannel);
    _realtimeChannel = null;
  }

  const companyId = getCompanyId();
  if (companyId) {
    _realtimeChannel = supabase.channel('lekhya-realtime');

    for (const tableName of SYNC_TABLES) {
      const pgTable = supabaseTable(tableName);
      _realtimeChannel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: pgTable, filter: `company_id=eq.${companyId}` },
        () => debouncedPull()
      );
    }

    _realtimeChannel.subscribe(status => {
      if (status === 'SUBSCRIBED') {
        console.log('[Sync] Realtime channel active — pulling on remote changes');
      }
    });
  }
}

export function stopAutoSync() {
  setSyncCallbacks(null, null);
  if (_syncTimer) { clearInterval(_syncTimer); _syncTimer = null; }
  if (_realtimeChannel) {
    supabase.removeChannel(_realtimeChannel);
    _realtimeChannel = null;
  }
}
