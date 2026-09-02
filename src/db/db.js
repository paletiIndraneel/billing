import Dexie from 'dexie';

export const db = new Dexie('crm-gst-billing-db');

db.version(1).stores({
  parties: '++id, name, gstin, phone, address, type',
  products: '++id, name, hsn, basePrice, gstRate, currentStock, unit',
  invoices: '++id, partyId, date, subtotal, taxAmount, total, status',
  leads: '++id, name, source, contactDetails, opportunityValue, stage',
  syncQueue: '++id, action, entity, payload, createdAt, status'
});

db.version(2).stores({
  parties: '++id, name, gstin, phone, address, type',
  products: '++id, name, hsn, basePrice, gstRate, currentStock, unit',
  invoices: '++id, invoiceNumber, partyId, date, subtotal, taxAmount, total, status',
  leads: '++id, name, source, contactDetails, opportunityValue, stage',
  settings: 'key',
  syncQueue: '++id, action, entity, payload, createdAt, status'
});

db.version(3).stores({
  parties: '++id, name, gstin, phone, address, type',
  products: '++id, name, hsn, basePrice, gstRate, currentStock, unit',
  invoices: '++id, invoiceNumber, partyId, date, subtotal, taxAmount, total, status',
  leads: '++id, name, source, contactDetails, opportunityValue, stage',
  settings: 'key',
  users: '++id, username',
  syncQueue: '++id, action, entity, payload, createdAt, status'
});

db.version(4).stores({
  parties: '++id, name, gstin, phone, address, type',
  products: '++id, name, hsn, basePrice, gstRate, currentStock, unit, reorderPoint',
  invoices: '++id, type, invoiceNumber, partyId, date, subtotal, taxAmount, total, status',
  leads: '++id, name, source, contactDetails, opportunityValue, stage',
  settings: 'key',
  users: '++id, username',
  syncQueue: '++id, action, entity, payload, createdAt, status',
  transactions: '++id, date, partyId, invoiceId, type, amount, method'
});

db.version(5).stores({
  parties: '++id, name, gstin, phone, address, type',
  products: '++id, name, hsn, basePrice, gstRate, currentStock, unit, reorderPoint',
  invoices: '++id, type, invoiceNumber, partyId, date, dueDate, subtotal, taxAmount, total, status',
  leads: '++id, name, source, contactDetails, opportunityValue, stage',
  settings: 'key',
  users: '++id, username',
  transactions: '++id, date, partyId, invoiceId, type, amount, method',
  expenses: '++id, date, category, amount, paymentMethod',
  purchases: '++id, productId, vendorId, date'
});

db.version(6).stores({
  parties: '++id, name, gstin, phone, address, type',
  products: '++id, name, hsn, basePrice, gstRate, currentStock, unit, reorderPoint',
  invoices: '++id, type, invoiceNumber, partyId, date, dueDate, subtotal, taxAmount, total, status, paymentStatus',
  invoiceItems: '++id, invoiceId, productId',
  leads: '++id, name, source, contactDetails, opportunityValue, stage',
  settings: 'key',
  users: '++id, username',
  transactions: '++id, date, partyId, invoiceId, type, amount, method',
  expenses: '++id, date, category, amount, paymentMethod',
  purchases: '++id, productId, vendorId, date',
  syncQueue: '++id, action, entity, entityId, createdAt, status',
});

// v7: add cloudId + sync fields to all data tables for Supabase sync
db.version(7).stores({
  parties:      '++id, cloudId, name, gstin, phone, address, type, syncStatus, lastModified',
  products:     '++id, cloudId, name, hsn, basePrice, gstRate, currentStock, unit, reorderPoint, syncStatus, lastModified',
  invoices:     '++id, cloudId, type, invoiceNumber, partyId, date, dueDate, subtotal, taxAmount, total, status, paymentStatus, syncStatus, lastModified',
  invoiceItems: '++id, cloudId, invoiceId, productId, syncStatus, lastModified',
  transactions: '++id, cloudId, date, partyId, invoiceId, type, amount, method, syncStatus, lastModified',
  expenses:     '++id, cloudId, date, category, amount, paymentMethod, syncStatus, lastModified',
  purchases:    '++id, cloudId, productId, vendorId, date, syncStatus, lastModified',
  leads:        '++id, name, source, contactDetails, opportunityValue, stage',
  settings:     'key',
  users:        '++id, username',
  syncQueue:    '++id, action, entity, entityId, createdAt, status',
}).upgrade(tx => {
  const tables = ['parties', 'products', 'invoices', 'invoiceItems', 'transactions', 'expenses', 'purchases'];
  const deviceId = getDeviceId();
  const now = new Date().toISOString();
  return Promise.all(tables.map(name =>
    tx.table(name).toCollection().modify(record => {
      if (!record.cloudId) record.cloudId = crypto.randomUUID();
      if (!record.syncStatus) record.syncStatus = 'pending';
      if (!record.lastModified) record.lastModified = now;
      if (!record.deviceId) record.deviceId = deviceId;
    })
  ));
});

// v8: compound indexes for common query patterns (party+status, type+status, etc.)
db.version(8).stores({
  parties:      '++id, cloudId, name, gstin, phone, address, type, syncStatus, lastModified',
  products:     '++id, cloudId, name, hsn, basePrice, gstRate, currentStock, unit, reorderPoint, syncStatus, lastModified',
  invoices:     '++id, cloudId, type, invoiceNumber, partyId, date, dueDate, subtotal, taxAmount, total, status, paymentStatus, syncStatus, lastModified, [partyId+status], [type+status]',
  invoiceItems: '++id, cloudId, invoiceId, productId, syncStatus, lastModified',
  transactions: '++id, cloudId, date, partyId, invoiceId, type, amount, method, syncStatus, lastModified, [partyId+type]',
  expenses:     '++id, cloudId, date, category, amount, paymentMethod, syncStatus, lastModified',
  purchases:    '++id, cloudId, productId, vendorId, date, syncStatus, lastModified',
  leads:        '++id, name, source, contactDetails, opportunityValue, stage',
  settings:     'key',
  users:        '++id, username',
  syncQueue:    '++id, action, entity, entityId, createdAt, status',
});

// v9: no schema change — subscription data stored as settings key 'subscription'
db.version(9).stores({
  parties:      '++id, cloudId, name, gstin, phone, address, type, syncStatus, lastModified',
  products:     '++id, cloudId, name, hsn, basePrice, gstRate, currentStock, unit, reorderPoint, syncStatus, lastModified',
  invoices:     '++id, cloudId, type, invoiceNumber, partyId, date, dueDate, subtotal, taxAmount, total, status, paymentStatus, syncStatus, lastModified, [partyId+status], [type+status]',
  invoiceItems: '++id, cloudId, invoiceId, productId, syncStatus, lastModified',
  transactions: '++id, cloudId, date, partyId, invoiceId, type, amount, method, syncStatus, lastModified, [partyId+type]',
  expenses:     '++id, cloudId, date, category, amount, paymentMethod, syncStatus, lastModified',
  purchases:    '++id, cloudId, productId, vendorId, date, syncStatus, lastModified',
  leads:        '++id, name, source, contactDetails, opportunityValue, stage',
  settings:     'key',
  users:        '++id, username',
  syncQueue:    '++id, action, entity, entityId, createdAt, status',
});

// v10: Product → Variant/SKU model
// products table simplified (name+hsn only); productVariants holds pack size, pricing, stock.
// Existing flat products are migrated: each old product row → one product + one variant.
db.version(10).stores({
  parties:         '++id, cloudId, name, gstin, phone, address, type, syncStatus, lastModified',
  products:        '++id, cloudId, name, hsn, syncStatus, lastModified',
  productVariants: '++id, cloudId, productId, syncStatus, lastModified',
  invoices:        '++id, cloudId, type, invoiceNumber, partyId, date, dueDate, subtotal, taxAmount, total, status, paymentStatus, syncStatus, lastModified, [partyId+status], [type+status]',
  invoiceItems:    '++id, cloudId, invoiceId, productId, syncStatus, lastModified',
  transactions:    '++id, cloudId, date, partyId, invoiceId, type, amount, method, syncStatus, lastModified, [partyId+type]',
  expenses:        '++id, cloudId, date, category, amount, paymentMethod, syncStatus, lastModified',
  purchases:       '++id, cloudId, productId, variantId, vendorId, date, syncStatus, lastModified',
  leads:           '++id, name, source, contactDetails, opportunityValue, stage',
  settings:        'key',
  users:           '++id, username',
  syncQueue:       '++id, action, entity, entityId, createdAt, status',
}).upgrade(async tx => {
  const now = new Date().toISOString();
  const deviceId = getDeviceId();
  const oldProducts = await tx.table('products').toArray();
  for (const p of oldProducts) {
    const sellingPrice = (p.basePrice || 0) * (1 + (p.margin || 0) / 100);
    await tx.table('productVariants').add({
      productId: p.id,
      packSize: p.variantLabel || '',
      unit: p.unit || 'PCS',
      purchasePrice: p.basePrice || 0,
      sellingPrice: sellingPrice || p.basePrice || 0,
      gstRate: p.gstRate || 0,
      stockQty: p.currentStock || 0,
      reorderPoint: p.reorderPoint || 10,
      cloudId: crypto.randomUUID(),
      syncStatus: 'pending',
      lastModified: now,
      deviceId,
    });
  }
});

// v11: stockQty reinterpreted as base-unit quantity (not packs).
//   packSize is now a positive number (quantity of base units per pack).
//   stockLedger records every stock movement.
//   barcode field added to productVariants index.
//   Migration: packSize string → float; stockQty packs → base units (stockQty * packSize).
db.version(11).stores({
  parties:         '++id, cloudId, name, gstin, phone, address, type, syncStatus, lastModified',
  products:        '++id, cloudId, name, hsn, syncStatus, lastModified',
  productVariants: '++id, cloudId, productId, barcode, syncStatus, lastModified',
  invoices:        '++id, cloudId, type, invoiceNumber, partyId, date, dueDate, subtotal, taxAmount, total, status, paymentStatus, syncStatus, lastModified, [partyId+status], [type+status]',
  invoiceItems:    '++id, cloudId, invoiceId, productId, syncStatus, lastModified',
  transactions:    '++id, cloudId, date, partyId, invoiceId, type, amount, method, syncStatus, lastModified, [partyId+type]',
  expenses:        '++id, cloudId, date, category, amount, paymentMethod, syncStatus, lastModified',
  purchases:       '++id, cloudId, productId, variantId, vendorId, date, syncStatus, lastModified',
  stockLedger:     '++id, variantId, type, date',
  leads:           '++id, name, source, contactDetails, opportunityValue, stage',
  settings:        'key',
  users:           '++id, username',
  syncQueue:       '++id, action, entity, entityId, createdAt, status',
}).upgrade(async tx => {
  const variants = await tx.table('productVariants').toArray();
  for (const v of variants) {
    const ps = parseFloat(v.packSize) || 1;
    await tx.table('productVariants').update(v.id, {
      packSize: ps,
      stockQty: (v.stockQty || 0) * ps,
    });
  }
});

// v12: inventoryMode ('packed'|'bulk') and masterStock added to products.
//   PACKED (default): each variant maintains its own stockQty.
//   BULK: product maintains a single masterStock pool; variants define pack configurations only.
//   Billing/Purchases deduct/add from masterStock for BULK products.
db.version(12).stores({
  parties:         '++id, cloudId, name, gstin, phone, address, type, syncStatus, lastModified',
  products:        '++id, cloudId, name, hsn, syncStatus, lastModified',
  productVariants: '++id, cloudId, productId, barcode, syncStatus, lastModified',
  invoices:        '++id, cloudId, type, invoiceNumber, partyId, date, dueDate, subtotal, taxAmount, total, status, paymentStatus, syncStatus, lastModified, [partyId+status], [type+status]',
  invoiceItems:    '++id, cloudId, invoiceId, productId, syncStatus, lastModified',
  transactions:    '++id, cloudId, date, partyId, invoiceId, type, amount, method, syncStatus, lastModified, [partyId+type]',
  expenses:        '++id, cloudId, date, category, amount, paymentMethod, syncStatus, lastModified',
  purchases:       '++id, cloudId, productId, variantId, vendorId, date, syncStatus, lastModified',
  stockLedger:     '++id, variantId, type, date',
  leads:           '++id, name, source, contactDetails, opportunityValue, stage',
  settings:        'key',
  users:           '++id, username',
  syncQueue:       '++id, action, entity, entityId, createdAt, status',
}).upgrade(async tx => {
  await tx.table('products').toCollection().modify(p => {
    if (p.inventoryMode === undefined) p.inventoryMode = 'packed';
    if (p.masterStock === undefined) p.masterStock = 0;
  });
});

// v13: averageCost added to productVariants for weighted average inventory costing.
//   Initialized from purchasePrice so existing variants have a sensible starting cost.
//   averageCost is updated on every stock-in via adjustStock(); never uses sellingPrice.
db.version(13).stores({
  parties:         '++id, cloudId, name, gstin, phone, address, type, syncStatus, lastModified',
  products:        '++id, cloudId, name, hsn, syncStatus, lastModified',
  productVariants: '++id, cloudId, productId, barcode, syncStatus, lastModified',
  invoices:        '++id, cloudId, type, invoiceNumber, partyId, date, dueDate, subtotal, taxAmount, total, status, paymentStatus, syncStatus, lastModified, [partyId+status], [type+status]',
  invoiceItems:    '++id, cloudId, invoiceId, productId, syncStatus, lastModified',
  transactions:    '++id, cloudId, date, partyId, invoiceId, type, amount, method, syncStatus, lastModified, [partyId+type]',
  expenses:        '++id, cloudId, date, category, amount, paymentMethod, syncStatus, lastModified',
  purchases:       '++id, cloudId, productId, variantId, vendorId, date, syncStatus, lastModified',
  stockLedger:     '++id, variantId, type, date',
  leads:           '++id, name, source, contactDetails, opportunityValue, stage',
  settings:        'key',
  users:           '++id, username',
  syncQueue:       '++id, action, entity, entityId, createdAt, status',
}).upgrade(async tx => {
  await tx.table('productVariants').toCollection().modify(v => {
    if (v.averageCost === undefined) v.averageCost = v.purchasePrice || 0;
  });
});

// v14: stockLedger gains sync fields (cloudId, syncStatus, lastModified, deviceId) so
//   inventory events can be merged across devices.  Ledger entries are immutable once written —
//   the sync engine adds missing entries but never overwrites existing ones.
//   devices table added for device registry (deviceId, name, lastSeen).
db.version(14).stores({
  parties:         '++id, cloudId, name, gstin, phone, address, type, syncStatus, lastModified',
  products:        '++id, cloudId, name, hsn, syncStatus, lastModified',
  productVariants: '++id, cloudId, productId, barcode, syncStatus, lastModified',
  invoices:        '++id, cloudId, type, invoiceNumber, partyId, date, dueDate, subtotal, taxAmount, total, status, paymentStatus, syncStatus, lastModified, [partyId+status], [type+status]',
  invoiceItems:    '++id, cloudId, invoiceId, productId, syncStatus, lastModified',
  transactions:    '++id, cloudId, date, partyId, invoiceId, type, amount, method, syncStatus, lastModified, [partyId+type]',
  expenses:        '++id, cloudId, date, category, amount, paymentMethod, syncStatus, lastModified',
  purchases:       '++id, cloudId, productId, variantId, vendorId, date, syncStatus, lastModified',
  stockLedger:     '++id, cloudId, variantId, productId, type, date, syncStatus, lastModified',
  devices:         'cloudId, companyId, lastSeen',
  leads:           '++id, name, source, contactDetails, opportunityValue, stage',
  settings:        'key',
  users:           '++id, username',
  syncQueue:       '++id, action, entity, entityId, createdAt, status',
}).upgrade(async tx => {
  const now = new Date().toISOString();
  const deviceId = getDeviceId();
  await tx.table('stockLedger').toCollection().modify(entry => {
    if (!entry.cloudId)     entry.cloudId     = crypto.randomUUID();
    if (!entry.syncStatus)  entry.syncStatus  = 'pending';
    if (!entry.lastModified) entry.lastModified = now;
    if (!entry.deviceId)    entry.deviceId    = deviceId;
  });
});

// v15: Batch/lot tracking.
//   batches table stores one record per received batch (created at purchase time).
//   stockLedger gains batchNo index so ledger can be filtered by batch.
//   parties gains creditLimit + creditDays for B2B credit management.
db.version(15).stores({
  parties:         '++id, cloudId, name, gstin, phone, address, type, syncStatus, lastModified',
  products:        '++id, cloudId, name, hsn, syncStatus, lastModified',
  productVariants: '++id, cloudId, productId, barcode, syncStatus, lastModified',
  invoices:        '++id, cloudId, type, invoiceNumber, partyId, date, dueDate, subtotal, taxAmount, total, status, paymentStatus, syncStatus, lastModified, [partyId+status], [type+status]',
  invoiceItems:    '++id, cloudId, invoiceId, productId, syncStatus, lastModified',
  transactions:    '++id, cloudId, date, partyId, invoiceId, type, amount, method, syncStatus, lastModified, [partyId+type]',
  expenses:        '++id, cloudId, date, category, amount, paymentMethod, syncStatus, lastModified',
  purchases:       '++id, cloudId, productId, variantId, vendorId, date, syncStatus, lastModified',
  stockLedger:     '++id, cloudId, variantId, productId, type, date, batchNo, syncStatus, lastModified',
  batches:         '++id, variantId, productId, batchNo, expiryDate, status',
  devices:         'cloudId, companyId, lastSeen',
  leads:           '++id, name, source, contactDetails, opportunityValue, stage',
  settings:        'key',
  users:           '++id, username',
  syncQueue:       '++id, action, entity, entityId, createdAt, status',
});

// v16: compound [syncStatus+lastModified] index on all sync tables.
//   pushPending() queries where('syncStatus').equals('pending') on every sync cycle.
//   Without this index that is a full-table scan; the compound index lets Dexie
//   jump directly to pending records — critical once tables grow to 10k+ rows.
db.version(16).stores({
  parties:         '++id, cloudId, name, gstin, phone, address, type, syncStatus, lastModified, [syncStatus+lastModified]',
  products:        '++id, cloudId, name, hsn, syncStatus, lastModified, [syncStatus+lastModified]',
  productVariants: '++id, cloudId, productId, barcode, syncStatus, lastModified, [syncStatus+lastModified]',
  invoices:        '++id, cloudId, type, invoiceNumber, partyId, date, dueDate, subtotal, taxAmount, total, status, paymentStatus, syncStatus, lastModified, [partyId+status], [type+status], [syncStatus+lastModified]',
  invoiceItems:    '++id, cloudId, invoiceId, productId, syncStatus, lastModified, [syncStatus+lastModified]',
  transactions:    '++id, cloudId, date, partyId, invoiceId, type, amount, method, syncStatus, lastModified, [partyId+type], [syncStatus+lastModified]',
  expenses:        '++id, cloudId, date, category, amount, paymentMethod, syncStatus, lastModified, [syncStatus+lastModified]',
  purchases:       '++id, cloudId, productId, variantId, vendorId, date, syncStatus, lastModified, [syncStatus+lastModified]',
  stockLedger:     '++id, cloudId, variantId, productId, type, date, batchNo, syncStatus, lastModified, [syncStatus+lastModified]',
  batches:         '++id, variantId, productId, batchNo, expiryDate, status',
  devices:         'cloudId, companyId, lastSeen',
  leads:           '++id, name, source, contactDetails, opportunityValue, stage',
  settings:        'key',
  users:           '++id, username',
  syncQueue:       '++id, action, entity, entityId, createdAt, status',
});

// ── Device ID ────────────────────────────────────────────────────────────────
export function getDeviceId() {
  let id = localStorage.getItem('lekhya_device_id');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('lekhya_device_id', id);
  }
  return id;
}

// ── Sync callback registry (avoids circular import with syncEngine) ──────────
const SYNC_TABLES = new Set(['parties', 'products', 'productVariants', 'invoices', 'invoiceItems', 'transactions', 'expenses', 'purchases', 'stockLedger']);
const _sync = { onWrite: null, onDelete: null };

export function setSyncCallbacks(onWrite, onDelete) {
  _sync.onWrite = onWrite;
  _sync.onDelete = onDelete;
}

// ── Dexie middleware: auto-inject sync fields + trigger immediate cloud push ─
db.use({
  stack: 'dbcore',
  name: 'sync-fields',
  create(downlevel) {
    return {
      ...downlevel,
      table(tableName) {
        const table = downlevel.table(tableName);
        if (!SYNC_TABLES.has(tableName)) return table;
        return {
          ...table,
          mutate(req) {
            // Intercept deletes: read cloudIds first, then notify cloud after delete
            if (req.type === 'delete' && req.keys?.length) {
              return table.getMany({ keys: req.keys, trans: req.trans })
                .then(records => {
                  const cloudIds = records.filter(r => r?.cloudId).map(r => r.cloudId);
                  return table.mutate(req).then(result => {
                    if (cloudIds.length) _sync.onDelete?.(tableName, cloudIds);
                    return result;
                  });
                })
                .catch(() => table.mutate(req));
            }

            // Inject sync fields on add/put, then trigger push
            if ((req.type === 'add' || req.type === 'put') && req.values) {
              const now = new Date().toISOString();
              const deviceId = getDeviceId();
              let hasUserWrite = false;
              req = {
                ...req,
                values: req.values.map(val => {
                  // _fromSync: true is set by pullChanges() to prevent re-queuing cloud writes
                  const fromSync = val._fromSync === true;
                  if (!fromSync) hasUserWrite = true;
                  const { _fromSync: _, ...cleanVal } = val;
                  return {
                    ...cleanVal,
                    cloudId: cleanVal.cloudId || crypto.randomUUID(),
                    syncStatus: fromSync ? 'synced' : 'pending',
                    lastModified: fromSync ? (cleanVal.lastModified || now) : now,
                    deviceId: fromSync ? (cleanVal.deviceId || deviceId) : deviceId,
                  };
                }),
              };
              const result = table.mutate(req);
              if (hasUserWrite) result.then(() => _sync.onWrite?.()).catch(() => {});
              return result;
            }

            return table.mutate(req);
          },
        };
      },
    };
  },
});

// ── Stock ledger helper ───────────────────────────────────────────────────────
// Records a stock movement in the audit ledger (local-only, not synced to cloud).
// type: 'opening' | 'purchase' | 'sale' | 'stock-in' | 'stock-out' | 'credit-note' | 'debit-note'
// packs: number of packs (positive = in, negative = out)
// baseQtyDelta: change in base units (positive = in, negative = out)
// balanceQty: stockQty after the transaction
export async function addStockLedgerEntry(tx, { variantId, productId, type, packs, baseQtyDelta, balanceQty, reference = '', note = '' }) {
  const table = tx ? tx.table('stockLedger') : db.stockLedger;
  await table.add({
    variantId,
    productId: productId || null,
    type,
    packs,
    baseQtyDelta,
    balanceQty,
    reference,
    note,
    date: new Date().toISOString(),
  });
}

// ── Settings helpers ─────────────────────────────────────────────────────────
export const getNextInvoiceNumber = async () => {
  const year = new Date().getFullYear();
  const prefix = await getSetting('invoicePrefix', 'INV');
  let seq = ((await db.settings.get('invoiceSeq'))?.value || 0) + 1;
  let candidate = `${prefix}-${year}-${String(seq).padStart(4, '0')}`;
  // Skip ahead if this number already exists (guards against manual seq resets or prefix changes)
  while (await db.invoices.where('invoiceNumber').equals(candidate).first()) {
    seq++;
    candidate = `${prefix}-${year}-${String(seq).padStart(4, '0')}`;
  }
  await db.settings.put({ key: 'invoiceSeq', value: seq });
  return candidate;
};

export const getSetting = async (key, defaultValue = null) => {
  const record = await db.settings.get(key);
  return record ? record.value : defaultValue;
};

export const setSetting = async (key, value) => {
  await db.settings.put({ key, value });
};

// ── Password hashing ─────────────────────────────────────────────────────────
const PBKDF2_ITERATIONS = 200_000;

function hexToBytes(hex) {
  const arr = new Uint8Array(hex.length / 2);
  for (let i = 0; i < arr.length; i++) arr[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return arr;
}

function bytesToHex(buf) {
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function pbkdf2Hash(password, saltHex) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: hexToBytes(saltHex), iterations: PBKDF2_ITERATIONS },
    key, 256
  );
  return bytesToHex(bits);
}

async function hashPassword(password) {
  const saltBytes = crypto.getRandomValues(new Uint8Array(16));
  const saltHex = bytesToHex(saltBytes);
  const hashHex = await pbkdf2Hash(password, saltHex);
  return `pbkdf2:${PBKDF2_ITERATIONS}:${saltHex}:${hashHex}`;
}

async function verifyPassword(password, stored) {
  if (!stored.startsWith('pbkdf2:')) {
    const enc = new TextEncoder();
    const buf = await crypto.subtle.digest('SHA-256', enc.encode(password));
    return bytesToHex(buf) === stored ? 'legacy' : false;
  }
  const [, , saltHex, expectedHash] = stored.split(':');
  const actualHash = await pbkdf2Hash(password, saltHex);
  return actualHash === expectedHash ? 'ok' : false;
}

export const createUser = async (username, password, email = '') => {
  const passwordHash = await hashPassword(password);
  return db.users.add({
    username: username.trim().toLowerCase(),
    passwordHash,
    email,
    createdAt: new Date().toISOString()
  });
};

export const verifyUser = async (username, password) => {
  const user = await db.users.where('username').equals(username.trim().toLowerCase()).first();
  if (!user) return null;
  const result = await verifyPassword(password, user.passwordHash);
  if (!result) return null;
  if (result === 'legacy') {
    const upgraded = await hashPassword(password);
    await db.users.update(user.id, { passwordHash: upgraded });
  }
  return user;
};

export const isSetupComplete = async () => {
  // Cloud setup: company linked
  if (localStorage.getItem('lekhya_company_id')) return true;
  // Local fallback: user exists in Dexie
  const count = await db.users.count();
  return count > 0;
};

export const updateUserPassword = async (userId, newPassword) => {
  const passwordHash = await hashPassword(newPassword);
  return db.users.update(userId, { passwordHash });
};

export const resetPasswordByCompanyName = async (username, companyName, newPassword) => {
  const user = await db.users.where('username').equals(username.trim().toLowerCase()).first();
  if (!user) return { success: false, message: 'Username not found' };
  const company = await getSetting('company', {});
  if (!company.name || company.name.trim().toLowerCase() !== companyName.trim().toLowerCase()) {
    return { success: false, message: 'Company name does not match our records' };
  }
  const passwordHash = await hashPassword(newPassword);
  await db.users.update(user.id, { passwordHash });
  return { success: true };
};

