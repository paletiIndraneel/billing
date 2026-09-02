# Supabase Rewrite — Phase 2a: Data-access foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `src/api/*` Supabase data-access layer, react-query wiring, Realtime invalidation, the ported `stockService`, and the Supabase-only auth path — without yet touching the 10 page components, which keep reading Dexie until Phase 2b.

**Architecture:** New `src/api/` directory: `_client.js` (shared supabase query helpers), one module per entity exposing plain async CRUD functions over `supabase.from(...)`, `company.js` (company row + `nextInvoiceNumber`), `useTable.js` / `useEntity.js` (react-query hooks that mimic the old `useLiveQuery(...) ?? []` contract), `realtime.js` (one Supabase channel → `queryClient.invalidateQueries`). `stockService.js` is ported from `db.*` calls to `src/api/*` calls, signatures and logic unchanged. `App.jsx` gets a `QueryClientProvider` and starts Realtime alongside the still-running legacy sync engine. Local-only auth (7-day `lekhya_session`, Dexie `users` fallback) is removed; Supabase auth is the only path. The legacy `syncEngine.js` + Dexie keep running so the unmigrated pages still work — they are deleted in Phase 3.

**Tech Stack:** React 19, @tanstack/react-query 5, @supabase/supabase-js 2, Vite 8, vitest (new), Postgres 17 backend (Phase 1, already live).

**Spec:** `docs/superpowers/specs/2026-09-02-supabase-rewrite-design.md` (§3 Data-access layer + reactivity, §4 client-side atomic ops / stockService port, §5 Auth & onboarding)

## Global Constraints

- Supabase project `lekhya-production` (`pfnlpatvjkjykvvswouz`). Schema is live from Phase 1: 11 typed tables + `companies` settings columns + RLS.
- Table/column names in the DB are **snake_case**; the JS record shapes the pages use are **camelCase**. Every `src/api/*` module maps between them explicitly (a `toRow` / `fromRow` pair or inline `select` aliases). Do not leak snake_case field names into page-facing objects.
- IDs are `uuid` strings. `crypto.randomUUID()` generates them client-side on insert. Never wrap an id in `Number(...)` / `parseInt`.
- `company_id` on every insert = `localStorage.getItem('lekhya_company_id')`. RLS enforces it server-side; the client still sets it.
- `stock_ledger` is insert-only server-side — never `update`/`delete` it from the client.
- `stockService.js` public signatures are frozen: `adjustStock({ variantId, productId, packsDelta, type, reference, note, unitCost, batchNo })` and `packageStock({ productId, packagingItems, reference, note })`. Only the data calls inside change.
- The legacy `src/db/db.js` and `src/lib/syncEngine.js` stay in place and importable throughout Phase 2a. `startAutoSync()` keeps being called. They are removed in Phase 3.
- `@tanstack/react-query` is the only new runtime dependency. `vitest` is the only new dev dependency. No others.
- Do not modify any file under `src/pages/` in this plan except `src/pages/Login.jsx` and `src/pages/SetupWizard.jsx` (auth, §5).
- `npm run build` must pass at the end of every task.

---

### Task 1: Add react-query + `src/api/_client.js`

**Files:**
- Modify: `package.json` (add `@tanstack/react-query` to dependencies)
- Create: `src/api/_client.js`
- Test: `src/api/_client.test.js`

**Interfaces:**
- Produces:
  - `supabase` — re-exported from `../lib/supabase` for convenience.
  - `cid(): string` — current company id from `localStorage.lekhya_company_id`; throws `Error('No company selected')` if absent.
  - `newId(): string` — `crypto.randomUUID()`.
  - `rows(builder): Promise<any[]>` — awaits a supabase query builder, throws on `error`, returns `data ?? []`.
  - `one(builder): Promise<any>` — awaits, throws on `error`, returns `data` (may be `null`).
  - `q(table: string)` — returns `supabase.from(table)`.

- [ ] **Step 1: Install the dependency**

Run: `npm.cmd install @tanstack/react-query`
Expected: `package.json` gains `"@tanstack/react-query": "^5.x"` under `dependencies`; `npm.cmd run build` still succeeds.

- [ ] **Step 2: Write the failing test**

Create `src/api/_client.test.js`:

```js
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cid, newId } from './_client';

afterEach(() => localStorage.clear());

describe('cid', () => {
  it('returns the stored company id', () => {
    localStorage.setItem('lekhya_company_id', 'abc-123');
    expect(cid()).toBe('abc-123');
  });
  it('throws when no company id is stored', () => {
    expect(() => cid()).toThrow('No company selected');
  });
});

describe('newId', () => {
  it('returns a uuid-shaped string', () => {
    expect(newId()).toMatch(/^[0-9a-f-]{36}$/i);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run src/api/_client.test.js`
Expected: FAIL — `_client.js` does not exist yet (and vitest may not be configured — that is Task 9; if vitest is missing entirely, install it now: `npm.cmd install -D vitest` and add `"test": "vitest"` to `package.json` scripts, then re-run).

- [ ] **Step 4: Write `src/api/_client.js`**

```js
import { supabase } from '../lib/supabase';

export { supabase };

export function cid() {
  const id = localStorage.getItem('lekhya_company_id');
  if (!id) throw new Error('No company selected');
  return id;
}

export const newId = () => crypto.randomUUID();

export const q = (table) => supabase.from(table);

export async function rows(builder) {
  const { data, error } = await builder;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function one(builder) {
  const { data, error } = await builder;
  if (error) throw new Error(error.message);
  return data;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/api/_client.test.js`
Expected: PASS (4 assertions).

- [ ] **Step 6: Build**

Run: `npm.cmd run build`
Expected: success.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/api/_client.js src/api/_client.test.js
git commit -m "Add react-query dep + src/api/_client.js query helpers"
```

---

### Task 2: Entity API modules

**Files:**
- Create: `src/api/parties.js`, `src/api/products.js`, `src/api/variants.js`, `src/api/invoices.js`, `src/api/invoiceItems.js`, `src/api/transactions.js`, `src/api/expenses.js`, `src/api/purchases.js`, `src/api/stockLedger.js`, `src/api/batches.js`, `src/api/leads.js`
- Test: `src/api/mapping.test.js`

**Interfaces:**
- Consumes: `cid`, `newId`, `q`, `rows`, `one` from `./_client`.
- Produces, per entity `X` (camelCase plural in function names), the standard set unless noted:
  - `listXs(): Promise<Obj[]>`
  - `getX(id): Promise<Obj|null>`
  - `createX(data): Promise<Obj>` — injects `id: newId()`, `company_id: cid()`
  - `updateX(id, patch): Promise<Obj>`
  - `deleteX(id): Promise<void>`
  - Each `Obj` is camelCase; `id` and (where present) `companyId` included; snake_case never surfaces.
  - Extra query functions listed in the per-entity table below.

- [ ] **Step 1: Write the exemplar — `src/api/parties.js`**

```js
import { cid, newId, q, rows, one } from './_client';

const TABLE = 'parties';

// DB row (snake_case) -> app object (camelCase)
const fromRow = (r) => r && ({
  id: r.id,
  companyId: r.company_id,
  name: r.name,
  gstin: r.gstin,
  phone: r.phone,
  address: r.address,
  email: r.email,
  type: r.type,
  creditLimit: r.credit_limit,
  creditDays: r.credit_days,
  activities: r.activities ?? [],
  createdAt: r.created_at,
});

// app object (camelCase) -> DB columns (snake_case). Only defined keys are sent.
const toRow = (d) => {
  const out = {};
  if ('name' in d) out.name = d.name;
  if ('gstin' in d) out.gstin = d.gstin || null;
  if ('phone' in d) out.phone = d.phone || null;
  if ('address' in d) out.address = d.address || null;
  if ('email' in d) out.email = d.email || null;
  if ('type' in d) out.type = d.type;
  if ('creditLimit' in d) out.credit_limit = d.creditLimit ?? null;
  if ('creditDays' in d) out.credit_days = d.creditDays ?? null;
  if ('activities' in d) out.activities = d.activities ?? [];
  return out;
};

export const listParties = async () =>
  (await rows(q(TABLE).select('*').order('name'))).map(fromRow);

export const getParty = async (id) =>
  fromRow(await one(q(TABLE).select('*').eq('id', id).maybeSingle()));

export const createParty = async (data) =>
  fromRow(await one(
    q(TABLE).insert({ id: newId(), company_id: cid(), ...toRow(data) }).select().single()
  ));

export const updateParty = async (id, patch) =>
  fromRow(await one(q(TABLE).update(toRow(patch)).eq('id', id).select().single()));

export const deleteParty = async (id) => {
  const { error } = await q(TABLE).delete().eq('id', id);
  if (error) throw new Error(error.message);
};
```

- [ ] **Step 2: Write the remaining 10 modules**

Same structure as `parties.js`. `fromRow`/`toRow` cover exactly the columns in `supabase/migrations/001_schema.sql` for that table (snake_case ↔ camelCase, e.g. `gst_rate`↔`gstRate`, `pack_size`↔`packSize`, `master_stock`↔`masterStock`, `invoice_number`↔`invoiceNumber`, `party_id`↔`partyId`, `due_date`↔`dueDate`, `tax_type`↔`taxType`, `payment_status`↔`paymentStatus`, `auto_recorded`↔`autoRecorded`, `base_qty_delta`↔`baseQtyDelta`, `balance_qty`↔`balanceQty`, `batch_no`↔`batchNo`, `expiry_date`↔`expiryDate`, `mfg_date`↔`mfgDate`, `remaining_qty`↔`remainingQty`, `received_qty`↔`receivedQty`, `opportunity_value`↔`opportunityValue`, `contact_details`↔`contactDetails`, `vendor_name`↔`vendorName`, `payment_method`↔`paymentMethod`, `reorder_point`↔`reorderPoint`, `average_cost`↔`averageCost`, `avg_cost_per_base`↔`avgCostPerBase`, `inventory_mode`↔`inventoryMode`, `base_unit`↔`baseUnit`, `cost_at_sale`↔`costAtSale`, `purchase_price_snapshot`↔`purchasePriceSnapshot`, `barcode_snapshot`↔`barcodeSnapshot`, `selling_price`↔`sellingPrice`, `purchase_price`↔`purchasePrice`, `item_discount_pct`↔`itemDiscountPct`, `gross_subtotal`↔`grossSubtotal`, `item_discount_amt`↔`itemDiscountAmt`, `discount_pct`↔`discountPct`, `discount_amt`↔`discountAmt`, `tax_amount`↔`taxAmount`).

Per-entity specifics:

| Module | TABLE | `listX` order | Extra functions |
|---|---|---|---|
| `products.js` | `products` | `.order('name')` | — |
| `variants.js` | `product_variants` | `.order('created_at')` | `listVariantsByProduct(productId)` → `.eq('product_id', productId)` |
| `invoices.js` | `invoices` | `.order('date', { ascending: false })` | `listInvoicesByParty(partyId)` → `.eq('party_id', partyId)` |
| `invoiceItems.js` | `invoice_items` | `.order('id')` | `listItemsByInvoice(invoiceId)` → `.eq('invoice_id', invoiceId)`; `deleteItemsByInvoice(invoiceId)` → `.delete().eq('invoice_id', invoiceId)` |
| `transactions.js` | `transactions` | `.order('date', { ascending: false })` | `listTransactionsByParty(partyId)`; `listTransactionsByInvoice(invoiceId)` |
| `expenses.js` | `expenses` | `.order('date', { ascending: false })` | — |
| `purchases.js` | `purchases` | `.order('date', { ascending: false })` | `listPurchasesByVariant(variantId)` → `.eq('variant_id', variantId)` |
| `stockLedger.js` | `stock_ledger` | `.order('date', { ascending: false })` | `listLedgerByVariant(variantId)`; **no `updateX`/`deleteX`** (append-only) — export only `listStockLedger`, `listLedgerByVariant`, `createStockLedgerEntry` |
| `batches.js` | `batches` | `.order('expiry_date')` | `listBatchesByVariant(variantId)`; `listActiveBatches()` → `.eq('status','active')` |
| `leads.js` | `leads` | `.order('created_at')` | — |

- [ ] **Step 3: Write `src/api/mapping.test.js`**

For 3 representative modules (`variants`, `invoices`, `stockLedger`), assert the `fromRow`/`toRow` round-trip. Export `fromRow`/`toRow` from each module as named exports (`export const fromRow`, `export const toRow`) so they are testable, in addition to the CRUD functions.

```js
import { describe, it, expect } from 'vitest';
import * as variants from './variants';
import * as invoices from './invoices';

describe('variants mapping', () => {
  it('fromRow maps snake_case to camelCase', () => {
    const app = variants.fromRow({
      id: 'v1', company_id: 'c1', product_id: 'p1', pack_size: 12,
      unit: 'KG', purchase_price: 100, selling_price: 150, gst_rate: 18,
      stock_qty: 240, reorder_point: 10, barcode: 'X', average_cost: 100,
      created_at: '2026-01-01',
    });
    expect(app).toMatchObject({
      id: 'v1', productId: 'p1', packSize: 12, gstRate: 18, stockQty: 240,
      sellingPrice: 150, averageCost: 100,
    });
  });
  it('toRow drops undefined keys and maps names', () => {
    expect(variants.toRow({ stockQty: 5, gstRate: 12 }))
      .toEqual({ stock_qty: 5, gst_rate: 12 });
  });
});

describe('invoices mapping', () => {
  it('round-trips core fields', () => {
    const row = { id: 'i1', company_id: 'c1', invoice_number: 'INV-1',
      type: 'Sales', party_id: 'p1', tax_type: 'IGST', total: 500,
      payment_status: 'Pending', date: '2026-01-01', payments: [] };
    const app = invoices.fromRow(row);
    expect(app).toMatchObject({ invoiceNumber: 'INV-1', taxType: 'IGST', partyId: 'p1', paymentStatus: 'Pending' });
  });
});
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/api/mapping.test.js`
Expected: PASS.

- [ ] **Step 5: Build**

Run: `npm.cmd run build`
Expected: success (modules compile; nothing imports them yet).

- [ ] **Step 6: Commit**

```bash
git add src/api/
git commit -m "Add src/api entity modules (parties, products, variants, invoices, ...)"
```

---

### Task 3: `src/api/company.js`

**Files:**
- Create: `src/api/company.js`
- Test: `src/api/company.test.js`

**Interfaces:**
- Consumes: `cid`, `q`, `one`, `rows` from `./_client`.
- Produces:
  - `getCompany(): Promise<Obj>` — the current company row, camelCase (`id, name, gstin, address, phone, email, upiId, logoUrl, bankName, bankAccount, bankIfsc, invoicePrefix, invoiceSeq`).
  - `updateCompany(patch): Promise<Obj>` — updates `companies` where `id = cid()`.
  - `nextInvoiceNumber(): Promise<string>` — reads `invoice_prefix` + `invoice_seq`, computes `${prefix}-${year}-${String(seq+1).padStart(4,'0')}`, then `update companies set invoice_seq = invoice_seq + 1 where id = cid()`, returns the string. Does **not** guarantee uniqueness — callers retry on `23505` (Phase 2b).
  - `formatInvoiceNumber(prefix, year, seq): string` — pure helper, exported for testing.

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect } from 'vitest';
import { formatInvoiceNumber } from './company';

describe('formatInvoiceNumber', () => {
  it('zero-pads the sequence to 4 digits', () => {
    expect(formatInvoiceNumber('INV', 2026, 42)).toBe('INV-2026-0042');
  });
  it('keeps sequences over 9999 intact', () => {
    expect(formatInvoiceNumber('INV', 2026, 12345)).toBe('INV-2026-12345');
  });
  it('uses the given prefix', () => {
    expect(formatInvoiceNumber('BILL', 2025, 1)).toBe('BILL-2025-0001');
  });
});
```

- [ ] **Step 2: Run — verify fail**

Run: `npx vitest run src/api/company.test.js`
Expected: FAIL — module missing.

- [ ] **Step 3: Write `src/api/company.js`**

```js
import { cid, q, one } from './_client';

const fromRow = (r) => r && ({
  id: r.id, name: r.name, gstin: r.gstin, address: r.address,
  phone: r.phone, email: r.email, upiId: r.upi_id, logoUrl: r.logo_url,
  bankName: r.bank_name, bankAccount: r.bank_account, bankIfsc: r.bank_ifsc,
  invoicePrefix: r.invoice_prefix, invoiceSeq: r.invoice_seq,
});

const toRow = (d) => {
  const out = {};
  if ('name' in d) out.name = d.name;
  if ('gstin' in d) out.gstin = d.gstin || null;
  if ('address' in d) out.address = d.address || null;
  if ('phone' in d) out.phone = d.phone || null;
  if ('email' in d) out.email = d.email || null;
  if ('upiId' in d) out.upi_id = d.upiId || null;
  if ('logoUrl' in d) out.logo_url = d.logoUrl || null;
  if ('bankName' in d) out.bank_name = d.bankName || null;
  if ('bankAccount' in d) out.bank_account = d.bankAccount || null;
  if ('bankIfsc' in d) out.bank_ifsc = d.bankIfsc || null;
  if ('invoicePrefix' in d) out.invoice_prefix = d.invoicePrefix || 'INV';
  return out;
};

export function formatInvoiceNumber(prefix, year, seq) {
  return `${prefix}-${year}-${String(seq).padStart(4, '0')}`;
}

export const getCompany = async () =>
  fromRow(await one(q('companies').select('*').eq('id', cid()).single()));

export const updateCompany = async (patch) =>
  fromRow(await one(q('companies').update(toRow(patch)).eq('id', cid()).select().single()));

export async function nextInvoiceNumber() {
  const co = await getCompany();
  const seq = (co.invoiceSeq || 0) + 1;
  const number = formatInvoiceNumber(co.invoicePrefix || 'INV', new Date().getFullYear(), seq);
  const { error } = await q('companies').update({ invoice_seq: seq }).eq('id', cid());
  if (error) throw new Error(error.message);
  return number;
}
```

- [ ] **Step 4: Run — verify pass**

Run: `npx vitest run src/api/company.test.js`
Expected: PASS (3 assertions).

- [ ] **Step 5: Commit**

```bash
git add src/api/company.js src/api/company.test.js
git commit -m "Add src/api/company.js (company row + nextInvoiceNumber)"
```

---

### Task 4: react-query hooks — `useTable`, `useEntity`

**Files:**
- Create: `src/api/useTable.js`
- Create: `src/api/useEntity.js`

**Interfaces:**
- Consumes: `@tanstack/react-query` (`useQuery`, `useQueryClient`).
- Produces:
  - `useTable(key: string | any[], queryFn): any[]` — runs the query; returns `data ?? []`. `key` is used verbatim as the query key (string is wrapped to `[key]`).
  - `useEntity(name: string, api: { list, create, update, remove }): { rows, isLoading, create, update, remove, refetch }` — `rows` from `useTable([name], api.list)`; `create/update/remove` call the api fn then `queryClient.invalidateQueries({ queryKey: [name] })`.

- [ ] **Step 1: Write `src/api/useTable.js`**

```js
import { useQuery } from '@tanstack/react-query';

export function useTable(key, queryFn) {
  const queryKey = Array.isArray(key) ? key : [key];
  const { data } = useQuery({ queryKey, queryFn, staleTime: 30_000 });
  return data ?? [];
}
```

- [ ] **Step 2: Write `src/api/useEntity.js`**

```js
import { useQueryClient } from '@tanstack/react-query';
import { useTable } from './useTable';

export function useEntity(name, api) {
  const qc = useQueryClient();
  const rows = useTable([name], api.list);
  const invalidate = () => qc.invalidateQueries({ queryKey: [name] });
  return {
    rows,
    create: async (data) => { const r = await api.create(data); await invalidate(); return r; },
    update: async (id, patch) => { const r = await api.update(id, patch); await invalidate(); return r; },
    remove: async (id) => { await api.remove(id); await invalidate(); },
    refetch: invalidate,
  };
}
```

- [ ] **Step 3: Build**

Run: `npm.cmd run build`
Expected: success.

- [ ] **Step 4: Commit**

```bash
git add src/api/useTable.js src/api/useEntity.js
git commit -m "Add useTable / useEntity react-query hooks"
```

---

### Task 5: `src/api/realtime.js`

**Files:**
- Create: `src/api/realtime.js`

**Interfaces:**
- Consumes: `supabase` from `./_client`.
- Produces:
  - `startRealtime(queryClient): void` — idempotent; opens one channel subscribed to `postgres_changes` on every tenant table filtered by `company_id`, each event → `queryClient.invalidateQueries({ queryKey: [<table camelCase key>] })`.
  - `stopRealtime(): void` — removes the channel.
- Table→queryKey map: `parties→parties`, `products→products`, `product_variants→variants`, `invoices→invoices`, `invoice_items→invoiceItems`, `transactions→transactions`, `expenses→expenses`, `purchases→purchases`, `stock_ledger→stockLedger`, `batches→batches`, `leads→leads`. Keys **must** match the keys `useTable`/`useEntity` use in the pages (Phase 2b).

- [ ] **Step 1: Write `src/api/realtime.js`**

```js
import { supabase } from './_client';

const TABLES = {
  parties: 'parties', products: 'products', product_variants: 'variants',
  invoices: 'invoices', invoice_items: 'invoiceItems', transactions: 'transactions',
  expenses: 'expenses', purchases: 'purchases', stock_ledger: 'stockLedger',
  batches: 'batches', leads: 'leads',
};

let channel = null;

export function startRealtime(queryClient) {
  const companyId = localStorage.getItem('lekhya_company_id');
  if (!companyId || channel) return;
  channel = supabase.channel('lekhya-rt');
  for (const [pgTable, key] of Object.entries(TABLES)) {
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: pgTable, filter: `company_id=eq.${companyId}` },
      () => queryClient.invalidateQueries({ queryKey: [key] }),
    );
  }
  channel.subscribe();
}

export function stopRealtime() {
  if (channel) { supabase.removeChannel(channel); channel = null; }
}
```

- [ ] **Step 2: Build**

Run: `npm.cmd run build`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add src/api/realtime.js
git commit -m "Add src/api/realtime.js (Supabase Realtime -> query invalidation)"
```

---

### Task 6: Port `stockService.js` to the API layer

**Files:**
- Modify: `src/services/stockService.js`
- Test: `src/services/stockService.test.js`

**Interfaces:**
- Consumes: `src/api/variants.js` (`getVariant`, `updateVariant`, `listVariantsByProduct`), `src/api/products.js` (`getProduct`, `updateProduct`), `src/api/stockLedger.js` (`createStockLedgerEntry`), `src/utils/unitConversion.js` (`convertUnit`, unchanged).
- Produces: `adjustStock` and `packageStock` with **identical signatures and return shapes** to the current Dexie versions; no `db` import; no `db.transaction` requirement.

- [ ] **Step 1: Write the characterization tests (against a fake api layer)**

Create `src/services/stockService.test.js`. Mock the four api modules with an in-memory store so the tests exercise the real branching logic:

```js
import { describe, it, expect, beforeEach, vi } from 'vitest';

const store = { variants: new Map(), products: new Map(), ledger: [] };

vi.mock('../api/variants.js', () => ({
  getVariant: async (id) => store.variants.get(id) ?? null,
  updateVariant: async (id, patch) => { store.variants.set(id, { ...store.variants.get(id), ...patch }); },
  listVariantsByProduct: async (pid) => [...store.variants.values()].filter(v => v.productId === pid),
}));
vi.mock('../api/products.js', () => ({
  getProduct: async (id) => store.products.get(id) ?? null,
  updateProduct: async (id, patch) => { store.products.set(id, { ...store.products.get(id), ...patch }); },
}));
vi.mock('../api/stockLedger.js', () => ({
  createStockLedgerEntry: async (e) => { store.ledger.push(e); },
}));

const { adjustStock } = await import('./stockService.js');

beforeEach(() => {
  store.variants.clear(); store.products.clear(); store.ledger.length = 0;
});

describe('adjustStock — packed mode', () => {
  it('stock-in raises stock_qty and appends a ledger row', async () => {
    store.products.set('p1', { id: 'p1', inventoryMode: 'packed' });
    store.variants.set('v1', { id: 'v1', productId: 'p1', packSize: 1, unit: 'PCS', stockQty: 0, averageCost: 0, purchasePrice: 0 });
    const r = await adjustStock({ variantId: 'v1', productId: 'p1', packsDelta: 10, type: 'purchase', unitCost: 5 });
    expect(store.variants.get('v1').stockQty).toBe(10);
    expect(store.variants.get('v1').averageCost).toBe(5);
    expect(store.ledger).toHaveLength(1);
    expect(r.newBalance).toBe(10);
  });
  it('throws when a deduction would go negative', async () => {
    store.products.set('p1', { id: 'p1', inventoryMode: 'packed' });
    store.variants.set('v1', { id: 'v1', productId: 'p1', packSize: 1, unit: 'PCS', stockQty: 2, averageCost: 5 });
    await expect(adjustStock({ variantId: 'v1', productId: 'p1', packsDelta: -5, type: 'sale' }))
      .rejects.toThrow(/Insufficient stock/);
  });
});

describe('adjustStock — bulk mode', () => {
  it('stock-in raises product master_stock and propagates WAC to sibling variants', async () => {
    store.products.set('p1', { id: 'p1', inventoryMode: 'bulk', masterStock: 0 });
    store.variants.set('v1', { id: 'v1', productId: 'p1', packSize: 1, unit: 'KG', stockQty: 0, averageCost: 0 });
    store.variants.set('v2', { id: 'v2', productId: 'p1', packSize: 2, unit: 'KG', stockQty: 0, averageCost: 0 });
    await adjustStock({ variantId: 'v1', productId: 'p1', packsDelta: 100, type: 'purchase', unitCost: 50 });
    expect(store.products.get('p1').masterStock).toBe(100);
    expect(store.variants.get('v2').averageCost).toBe(100); // costPerBase 50 * packSize 2
  });
});
```

Adjust the mocked variant/product field names to whatever `fromRow` produces (camelCase). Add a `packageStock` test covering the bulk→packed conversion and the insufficient-bulk-stock throw.

- [ ] **Step 2: Run — verify the tests fail against the current Dexie implementation**

Run: `npx vitest run src/services/stockService.test.js`
Expected: FAIL — current `stockService.js` imports `../db/db` and calls `db.productVariants.get(...)`, which the mocks don't intercept.

- [ ] **Step 3: Port `stockService.js`**

Replace the data calls, keep every line of business logic (mode detection, `effectivePackSz`, hybrid-sale branch, WAC math, sibling propagation, the `newBase < 0` throw, the return object):

| Current | Replacement |
|---|---|
| `import { db } from '../db/db';` | `import { getVariant, updateVariant, listVariantsByProduct } from '../api/variants.js';`<br>`import { getProduct, updateProduct } from '../api/products.js';`<br>`import { createStockLedgerEntry } from '../api/stockLedger.js';` |
| `await db.productVariants.get(variantId)` | `await getVariant(variantId)` |
| `await db.products.get(pid)` | `await getProduct(pid)` |
| `await db.productVariants.update(id, patch)` | `await updateVariant(id, patch)` |
| `await db.products.update(pid, patch)` | `await updateProduct(pid, patch)` |
| `await db.productVariants.where('productId').equals(pid).toArray()` | `await listVariantsByProduct(pid)` |
| `await db.stockLedger.add({...})` | `await createStockLedgerEntry({...})` |

The ledger entry object keys stay camelCase (`variantId`, `productId`, `baseQtyDelta`, `balanceQty`, `unitCost`, `batchNo`, `reference`, `note`, `date`) — `stockLedger.js`'s `toRow` maps them. Remove the "Must be called inside a Dexie 'rw' transaction" comments.

- [ ] **Step 4: Run — verify pass**

Run: `npx vitest run src/services/stockService.test.js`
Expected: PASS (all packed/bulk/hybrid/WAC/throw cases).

- [ ] **Step 5: Build**

Run: `npm.cmd run build`
Expected: success. (Callers still wrap these in `db.transaction(...)`; that wrapper is now an inert no-op scope — harmless until Phase 2b removes it.)

- [ ] **Step 6: Commit**

```bash
git add src/services/stockService.js src/services/stockService.test.js
git commit -m "Port stockService to src/api layer; add characterization tests"
```

---

### Task 7: `App.jsx` — QueryClientProvider, Realtime, remove local session

**Files:**
- Modify: `src/App.jsx`

**Interfaces:**
- Consumes: `@tanstack/react-query` (`QueryClient`, `QueryClientProvider`, `useQueryClient`), `src/api/realtime.js` (`startRealtime`, `stopRealtime`).
- Produces: an app shell where every page is under a `QueryClientProvider`; Realtime starts on auth and stops on logout; there is no local (non-Supabase) session path.

- [ ] **Step 1: Wrap the tree in `QueryClientProvider`**

At module scope in `App.jsx`:
```js
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } });
```
In `export default function App()`, wrap the existing `<ToastProvider>…</ToastProvider>` return with `<QueryClientProvider client={queryClient}>…</QueryClientProvider>`.

- [ ] **Step 2: Start/stop Realtime with auth**

In `AuthGate`, add `const qc = useQueryClient();`. Everywhere the code currently calls `startAutoSync()` (Supabase session branch, local session branch, `onLogin` in login screen), add `startRealtime(qc);` immediately after. **Keep** the `startAutoSync()` calls — the legacy sync engine stays until Phase 3. In `onLogout`, add `stopRealtime();` next to `stopAutoSync()`.

- [ ] **Step 3: Remove the local-session path**

Delete: `SESSION_KEY`, `SESSION_TTL_MS`, `saveSession()`, `loadSession()`, and the `// Try local session (offline-only users)` block in `AuthGate`'s `init` (the `const localSession = loadSession(); if (localSession) { … }` stanza). `clearSession()` keeps `localStorage.removeItem('lekhya_company_id')` and adds `localStorage.removeItem('lekhya_subscription')`; drop the `bizcrm_session` line. In the `login` state's `<Login onLogin={(u, remember) => { if (remember) saveSession(u); … }}/>`, change to `onLogin={(u) => { setUser(...); setAuthState('app'); startAutoSync(); startRealtime(qc); }}` — no `remember`, no `saveSession`.

- [ ] **Step 4: Build**

Run: `npm.cmd run build`
Expected: success.

- [ ] **Step 5: Manual smoke**

Run `npm.cmd run dev`, load the app. Expected: existing Supabase session logs straight in; logout returns to landing; no console error from react-query or realtime. (Pages still render off Dexie — unchanged.)

- [ ] **Step 6: Commit**

```bash
git add src/App.jsx
git commit -m "App: QueryClientProvider + Realtime; remove local (non-Supabase) session"
```

---

### Task 8: `Login.jsx` + `SetupWizard.jsx` — Supabase-only auth

**Files:**
- Modify: `src/pages/Login.jsx`
- Modify: `src/pages/SetupWizard.jsx`

**Interfaces:**
- Consumes: `supabase` (already imported in both).
- Produces: login and setup with no Dexie / local-user code paths.

- [ ] **Step 1: `Login.jsx` — strip offline fallback**

- Remove imports `verifyUser`, `getSetting`, `db` from `'../db/db'` (drop the whole import line).
- In `handleLogin`, delete the `// Offline fallback: try local Dexie user` block (the `if (error?.message?.includes('fetch') …) { … verifyUser … }` stanza). After the Supabase-session success path, the fallthrough is just `toast(error?.message || 'Invalid email or password', 'error');`.
- Delete `_localAuth`, `checkLocalLoginLock`, `recordLocalFailure`, `clearLocalLock` (all now unused).
- Delete the "Forgot Email / Username" flow: the `forgot-email` screen JSX, `handleLookupEmail`, `lookupResult` / `setLookupResult` state, `lookupGstin`/`lookupName` state, `maskEmail`. In the `forgot-choice` screen, remove the "Forgot Email / Username" button so it only offers "Forgot Password" (or route `forgot-choice` straight to `setScreen('forgot-password')`).
- Keep: `signInWithPassword`, the `company_members` + `companies` existence checks, `handleForgotPassword`, `PasswordReset`.
- `onLogin` is now called as `onLogin({ id, username, email })` — drop the `remember` second arg at every call site in this file.

- [ ] **Step 2: `SetupWizard.jsx` — drop local user + offline fallback**

- Import line `import { setSetting, createUser } from '../db/db';` → delete entirely.
- In `handleFinish`: delete `await setSetting('company', company);` (step "Save company info locally"); delete step 5 `await createUser(username, account.password, account.email);` and its comment; delete the entire `catch` fallback branch that re-tries `setSetting`/`createUser` in "offline mode" — replace with a plain `catch (err) { setCloudStatus(null); toast('Setup failed: ' + err.message, 'error'); }`.
- The `companies` insert already writes `name, gstin, address, phone, email, owner_id`. Add `bank_name: null` is not needed; bank fields are entered later in Settings (Phase 2b).
- Reword the cloud banner text "Your account will sync data across Desktop and Android using the same email and password." → "Access your account from any browser with this email and password." Keep the `Cloud` icon or swap to `Globe` (either; do not add a new import if avoiding it — reuse `Cloud`).
- Remove the `cloudStatus === 'offline'` warning JSX block (no longer reachable).

- [ ] **Step 3: Build**

Run: `npm.cmd run build`
Expected: success. Grep to confirm no dangling refs: `grep -n "verifyUser\|createUser\|loadSession\|_localAuth\|handleLookupEmail" src/pages/Login.jsx src/pages/SetupWizard.jsx` → no matches.

- [ ] **Step 4: Manual smoke**

`npm.cmd run dev`. Sign out → "Forgot credentials?" shows only Forgot Password. Setup wizard still creates a Supabase account + company (test with a throwaway email) or verify the form renders without error.

- [ ] **Step 5: Commit**

```bash
git add src/pages/Login.jsx src/pages/SetupWizard.jsx
git commit -m "Login/SetupWizard: Supabase-only auth, drop local-user + forgot-email"
```

---

### Task 9: `subscription.js` → localStorage; vitest config

**Files:**
- Modify: `src/lib/subscription.js`
- Modify: `package.json` (scripts, if not already done in Task 1)
- Create: `vitest.config.js` (only if needed — Vite config may already suffice)
- Test: `src/lib/subscription.test.js`

**Interfaces:**
- Consumes: `supabase` (kept, for the license RPCs).
- Produces: `getSubscription` / `ensureTrialStarted` / the `setSetting('subscription', …)` writes now use `localStorage['lekhya_subscription']` (JSON). `evaluateAccess` / `daysRemaining` unchanged. No `db` import.

- [ ] **Step 1: Write tests for the pure logic (lock behaviour first, no infra change)**

```js
import { describe, it, expect } from 'vitest';
import { evaluateAccess, daysRemaining, TRIAL_DAYS, GRACE_DAYS } from './subscription';

const iso = (daysFromNow) => new Date(Date.now() + daysFromNow * 86400000).toISOString();

describe('evaluateAccess', () => {
  it('trial before expiry', () => {
    expect(evaluateAccess({ status: 'trial', expiresAt: iso(5) })).toBe('trial');
  });
  it('active before expiry', () => {
    expect(evaluateAccess({ status: 'active', expiresAt: iso(30) })).toBe('active');
  });
  it('grace within GRACE_DAYS after expiry', () => {
    expect(evaluateAccess({ status: 'active', expiresAt: iso(-3) })).toBe('grace');
  });
  it('expired past the grace window', () => {
    expect(evaluateAccess({ status: 'active', expiresAt: iso(-(GRACE_DAYS + 2)) })).toBe('expired');
  });
  it('suspended is always expired', () => {
    expect(evaluateAccess({ status: 'suspended', expiresAt: iso(10) })).toBe('expired');
  });
  it('null subscription is expired', () => {
    expect(evaluateAccess(null)).toBe('expired');
  });
});

describe('daysRemaining', () => {
  it('positive before expiry', () => {
    expect(daysRemaining({ expiresAt: iso(4.4) })).toBe(5);
  });
});
```

- [ ] **Step 2: Run — should PASS already** (pure functions unchanged)

Run: `npx vitest run src/lib/subscription.test.js`
Expected: PASS. If vitest is not configured, add `"test": "vitest"` to `package.json` scripts and, if the DOM globals are needed, `npm.cmd install -D jsdom` and a `vitest.config.js`:
```js
import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { environment: 'jsdom' } });
```

- [ ] **Step 3: Swap Dexie settings for localStorage**

In `src/lib/subscription.js`:
- Replace `import { db, getSetting, setSetting } from '../db/db';` with nothing (delete). Keep `import { supabase } from './supabase';`.
- Add local helpers:
```js
const KEY = 'lekhya_subscription';
const readSub = () => { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch { return null; } };
const writeSub = (s) => localStorage.setItem(KEY, JSON.stringify(s));
```
- `getSubscription()` → `return readSub();` (drop `async` DB read; keep it `async` for signature stability — `return readSub();`).
- Every `await setSetting('subscription', X)` → `writeSub(X)`.
- No other logic changes.

- [ ] **Step 4: Run tests + build**

Run: `npx vitest run src/lib/subscription.test.js` → PASS.
Run: `npm.cmd run build` → success.
Grep: `grep -n "getSetting\|setSetting\|from '../db/db'" src/lib/subscription.js` → no matches.

- [ ] **Step 5: Commit**

```bash
git add src/lib/subscription.js src/lib/subscription.test.js package.json vitest.config.js
git commit -m "subscription.js: store trial/license cache in localStorage; add tests"
```

---

## Self-Review

**1. Spec coverage (Phase 2a scope):**

| Spec item | Task |
|---|---|
| §3.1 `src/api/` one module per entity, plain async CRUD over supabase | Tasks 2, 3 |
| §3.1 `_client.js` with `q`/`cid`/`rows`/`one` | Task 1 |
| §3.2 add `@tanstack/react-query`; `QueryClientProvider` in App | Tasks 1, 7 |
| §3.2 `useTable` returns `[]`-default array (old contract); `useEntity` mutation+invalidate | Task 4 |
| §3.3 `realtime.js` one channel, all tenant tables → `invalidateQueries` | Task 5; wired in Task 7 |
| §4.1 `stockService.js` ported to `src/api/*`, signatures frozen, no `db` | Task 6 |
| §4.3 `nextInvoiceNumber()` in `src/api/company.js` (read+compute+increment) | Task 3 |
| §5.1 App: remove `SESSION_KEY`/`saveSession`/`loadSession`/local-session branch; keep Supabase session; start Realtime | Task 7 |
| §5.2 Login: drop offline fallback, `_localAuth`, forgot-email flow | Task 8 |
| §5.3 SetupWizard: drop `createUser`, `setSetting('company')`, offline catch; reword copy | Task 8 |
| §5.5 subscription.js → localStorage; license RPCs untouched | Task 9 |
| §8 vitest dev dep; stockService characterization tests; subscription pure-logic tests; invoice-number format test | Tasks 1, 6, 9, 3 |

Deferred to Phase 2b: all 10 page components (`CRM`, `Dashboard`, `Reports`, `Ledger`, `Expenses`, `Payments`, `Inventory`, `Purchases`, `Billing`, `Settings`), including their `useLiveQuery`→`useTable` swaps, write-call swaps, `Number(id)` removal, compensating-cleanup for multi-write ops (§4.2), `getSetting('company')`/`getNextInvoiceNumber` call-site migration.
Deferred to Phase 3: delete `db.js` + `syncEngine.js`, remove `dexie` deps, remove `startAutoSync`, PWA removal, online/offline badge + Sync button removal, `main.jsx` cleanup snippet, README, delete `smoke-test.mjs`, pure-logic vitest for `amountToWords`/`fmtPDF`/`unitConversion`/`validators`.

**2. Placeholder scan:** No TBD/TODO. Task 2 Step 2 uses a mapping table rather than repeating 10 near-identical files verbatim — each module's shape is fully determined by the exemplar + the column list in `001_schema.sql` + the per-entity row; this is DRY, not a placeholder. All test code is concrete. Grep checks are explicit.

**3. Type consistency:**
- `_client.js` exports `cid`, `newId`, `q`, `rows`, `one` (Task 1) — consumed verbatim in Tasks 2, 3.
- `useTable(key, queryFn)` (Task 4) — `key` may be string or array; `realtime.js` (Task 5) and Phase 2b pages must use the **camelCase** keys from the Task 5 table (`variants`, not `product_variants`; `invoiceItems`, `stockLedger`). Stated in both Task 4 and Task 5 interfaces.
- `stockService` (Task 6) imports `getVariant`/`updateVariant`/`listVariantsByProduct` (from `variants.js`), `getProduct`/`updateProduct` (from `products.js`), `createStockLedgerEntry` (from `stockLedger.js`) — all defined in Task 2's interface list. `stockLedger.js` deliberately has no `updateX`/`deleteX` (append-only), noted in Task 2 table and consistent with Global Constraints.
- `nextInvoiceNumber` / `getCompany` / `updateCompany` / `formatInvoiceNumber` (Task 3) — `formatInvoiceNumber` is the pure exported helper the test uses.
- `startRealtime(queryClient)` / `stopRealtime()` (Task 5) — called with `qc` from `useQueryClient()` in Task 7.
- Task 7 keeps `startAutoSync()` (legacy) AND adds `startRealtime(qc)` — consistent with the Global Constraint that `syncEngine.js` survives Phase 2a.
