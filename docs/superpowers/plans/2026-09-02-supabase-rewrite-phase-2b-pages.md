# Supabase Rewrite — Phase 2b: Page migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate all 10 page components and `stockService.js` off Dexie (`db.*` + `useLiveQuery`) onto the Phase 2a `src/api/*` layer + react-query, so that after this plan **no file under `src/` imports `../db/db` or `dexie-react-hooks`** except `db.js` itself (deleted in Phase 3).

**Architecture:** A `004_columns.sql` delta migration first (adds the handful of columns the page audit found missing). Then one task per page: swap `useLiveQuery(() => db.X…)` → `useTable(QK.x, listX)`, swap `db.X.add/update/delete` → `src/api/*` calls, delete `db.transaction('rw', …)` wrappers, add explicit **compensating cleanup** for the multi-write flows (spec §4.2), and remove every `Number(id)` / `parseInt(id)` coercion (ids are uuid strings now). `stockService.js` is ported mid-plan, immediately before the three pages that consume it. `db.js` and `syncEngine.js` keep running the whole time.

**Tech Stack:** React 19, @tanstack/react-query 5, @supabase/supabase-js 2, vitest, Postgres 17 (Phases 1 + 2a live).

**Spec:** `docs/superpowers/specs/2026-09-02-supabase-rewrite-design.md` (§2.2 IDs, §3 data-access, §4 client-side atomic ops)

## Global Constraints

- **Query keys:** every `useTable` / `useEntity` call keys on a `QK.*` value from `src/api/realtime.js` (`QK.parties`, `QK.products`, `QK.variants`, `QK.invoices`, `QK.invoiceItems`, `QK.transactions`, `QK.expenses`, `QK.purchases`, `QK.stockLedger`, `QK.batches`, `QK.leads`, `QK.company`). Never a raw string. A key not in `QK` means realtime won't invalidate it.
- **IDs are uuid strings.** Delete every `Number(id)`, `parseInt(id)`, `String(id)` used to coerce a record id or foreign key. Comparisons stay `a.id === b.id` (both strings). `/ledger/:partyId` param is already a string.
- **No `db.transaction`.** Multi-table writes become sequential `await`s wrapped in `try/catch` with compensating cleanup per the recipe below. `stock_ledger` is append-only — never update/delete it.
- **`db.js` and `syncEngine.js` stay importable** and `startAutoSync()` keeps running until Phase 3. Do not delete them or remove their calls in this plan.
- Company profile / numbering: read via `src/api/company.js` (`getCompany`, `updateCompany`, `nextInvoiceNumber`). `getSetting('company')` → `getCompany()`. `getSetting('invoiceTheme', 'classic')` → `localStorage.getItem('lekhya_theme_invoice') || 'classic'`. `getSetting('defaultTerms','')` → `getCompany().defaultTerms || ''`.
- `nextInvoiceNumber()` must be guarded: if `getCompany()` returns null, throw `new Error('No company')` (do this in `company.js` as part of Task 9's touch, or Task 12 if not reached sooner).
- **`npm.cmd`** not `npm`. Plain `\n` line endings (CRLF git warning is expected).
- `npm.cmd run build` AND `npx vitest run` must pass at the end of every task.
- Only the file(s) named in each task may change (plus the shared `src/api/*` where a task's Interfaces say so).
- Do not touch `src/App.jsx`, `src/lib/syncEngine.js`, `src/db/db.js`.

## Migration Recipe (referenced by every page task)

**Reads:**
```js
// before
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
const parties = useLiveQuery(() => db.parties.orderBy('name').toArray());
// after
import { useTable } from '../api/useTable';
import { QK } from '../api/realtime';
import { listParties } from '../api/parties';
const parties = useTable(QK.parties, listParties);   // [] while loading, throws to ErrorBoundary on error
```
- `db.X.toArray()` / `.orderBy(f).toArray()` → `listX` (ordering already baked into `listX`; if a page needs a different order, sort in the component).
- `db.X.where('f').equals(v).toArray()` → a filtered `listXByF(v)` from the api module (they exist for the common cases: `listInvoicesByParty`, `listTransactionsByParty`, `listItemsByInvoice`, `listVariantsByProduct`, `listBatchesByVariant`, `listActiveBatches`, `listPurchasesByVariant`, `listTransactionsByInvoice`). For one-off filters, `listX()` then `.filter()` in the component.
- `db.X.get(id)` → `getX(id)` (returns `null` if missing).
- A page that reads a table AND writes it → use `useEntity(QK.x, { list: listX, create: createX, update: updateX, remove: deleteX })` and call `.create/.update/.remove` (they invalidate `[QK.x]` after).

**Single-table writes:** `await db.X.add(obj)` → `await createX(obj)` (returns the row with its new `id`); `await db.X.update(id, patch)` → `await updateX(id, patch)`; `await db.X.delete(id)` → `await deleteX(id)`. After a write not going through `useEntity`, call `queryClient.invalidateQueries({ queryKey: [QK.x] })` (get `queryClient` from `useQueryClient()`).

**Multi-table write with compensating cleanup:**
```js
const created = [];               // track what to undo
try {
  const inv = await createInvoice(invRow);           created.push(['invoice', inv.id]);
  for (const li of items) await createInvoiceItem({ ...li, invoiceId: inv.id });
  for (const li of items) { await adjustStock({ ...li, packsDelta: -li.qty, type: 'sale', reference: inv.invoiceNumber }); created.push(['stock', li]); }
  for (const p of payments) await createTransaction({ ...p, invoiceId: inv.id });
} catch (err) {
  // best-effort rollback, newest first
  for (const [kind, ref] of created.reverse()) {
    try {
      if (kind === 'stock') await adjustStock({ variantId: ref.id, productId: ref.productId, packsDelta: +ref.qty, type: 'void', reference: 'rollback' });
      if (kind === 'invoice') { await deleteItemsByInvoice(ref); await deleteInvoice(ref); }
    } catch { /* swallow — logged below */ }
  }
  toast('Save failed and was rolled back: ' + err.message, 'error');
  throw err;
}
```
Invalidate all affected `QK.*` keys after success.

**Removing `db.transaction`:** delete the `await db.transaction('rw', db.a, db.b, …, async () => { … })` wrapper; keep its body; the body's `db.X` calls become api calls per above; wrap in the try/catch when it's a real multi-write.

---

### Task 1: `004_columns.sql` — schema deltas from the page audit

**Files:**
- Create: `supabase/migrations/004_columns.sql`
- Modify: `supabase/README.md` (order line + Applied list)

**Interfaces:**
- Produces: `transactions.expense_id uuid`, `invoices.ref_invoice_number text`, `companies.default_terms text`, `companies.credit_note_seq int not null default 0`, `companies.debit_note_seq int not null default 0`.

- [ ] **Step 1: Write the migration**

`supabase/migrations/004_columns.sql`:
```sql
-- Phase 2b: columns the page audit found missing from 001_schema.
begin;
alter table transactions add column if not exists expense_id uuid;
alter table invoices     add column if not exists ref_invoice_number text;
alter table companies    add column if not exists default_terms text;
alter table companies    add column if not exists credit_note_seq int not null default 0;
alter table companies    add column if not exists debit_note_seq  int not null default 0;
commit;
```

- [ ] **Step 2: Apply via MCP**

Call `mcp__claude_ai_Supabase__apply_migration` — `project_id` `pfnlpatvjkjykvvswouz`, `name` `004_columns`, `query` = the file contents.

- [ ] **Step 3: Verify**

`mcp__claude_ai_Supabase__execute_sql`:
```sql
select column_name from information_schema.columns
where table_schema='public' and (
  (table_name='transactions' and column_name='expense_id') or
  (table_name='invoices' and column_name='ref_invoice_number') or
  (table_name='companies' and column_name in ('default_terms','credit_note_seq','debit_note_seq')))
order by column_name;
```
Expected 5 rows: `credit_note_seq, debit_note_seq, default_terms, expense_id, ref_invoice_number`.

- [ ] **Step 4: Extend the affected api modules**

- `src/api/transactions.js` — add `expenseId`↔`expense_id` to `fromRow`/`toRow`; add `listTransactionsByExpense(expenseId)` → `.eq('expense_id', expenseId)`.
- `src/api/invoices.js` — add `refInvoiceNumber`↔`ref_invoice_number` to `fromRow`/`toRow`.
- `src/api/company.js` — add `defaultTerms`↔`default_terms`, `creditNoteSeq`↔`credit_note_seq`, `debitNoteSeq`↔`debit_note_seq` to `fromRow`/`toRow`; add `nextNoteNumber(kind)` where `kind` is `'CreditNote'|'DebitNote'`: reads the matching seq col, computes `${kind==='CreditNote'?'CN':'DN'}-${year}-${String(seq+1).padStart(4,'0')}`, increments that column, returns the string. Guard `if (!co) throw new Error('No company')` and add the same guard to `nextInvoiceNumber()`.

- [ ] **Step 5: build + test + commit**

`npm.cmd run build`; `npx vitest run` (extend `mapping.test.js` / `company.test.js` for the new fields — at least assert `nextNoteNumber` formatting via an exported `formatNoteNumber` pure helper). Update `supabase/README.md`. Commit: `git add supabase/ src/api/ && git commit -m "004_columns delta migration + api module field additions"`.

---

### Task 2: Migrate `src/pages/CRM.jsx`

**Files:** Modify `src/pages/CRM.jsx`.

**Interfaces:** Consumes `useEntity`, `QK`, `src/api/parties.js` (`listParties`, `createParty`, `updateParty`, `deleteParty`).

- [ ] **Step 1: Swap reads + writes**

- Remove `import { useLiveQuery } from 'dexie-react-hooks'` and `import { db } from '../db/db'`.
- `const parties = useLiveQuery(() => db.parties.orderBy('name').toArray());` → `const { rows: parties, create, update, remove } = useEntity(QK.parties, { list: listParties, create: createParty, update: updateParty, remove: deleteParty });`
- In `saveParty`: the duplicate-detection `const all = await db.parties.toArray();` → `const all = parties;` (already loaded). `await db.parties.add(data)` → `await create(data)`. `await db.parties.update(id, data)` → `await update(id, data)`.
- In `deleteParty`: `await db.parties.delete(partyModal.data.id)` → `await remove(partyModal.data.id)`.
- No `Number(id)` in this file (verified) — nothing to strip.

- [ ] **Step 2: build + test**

`npm.cmd run build` (pass). `npx vitest run` (pass — no CRM tests, just no regressions).

- [ ] **Step 3: Manual smoke**

`npm.cmd run dev` → Customers & Vendors: list loads from Supabase; add a contact (persists, appears); edit it; delete it; duplicate GSTIN/phone warning still fires.

- [ ] **Step 4: Commit**

`git add src/pages/CRM.jsx && git commit -m "CRM: migrate to src/api parties + useEntity"`

---

### Task 3: Migrate `src/pages/Expenses.jsx`

**Files:** Modify `src/pages/Expenses.jsx`.

**Interfaces:** Consumes `useEntity`/`useTable`, `QK`, `src/api/expenses.js`, `src/api/transactions.js` (`createTransaction`, `updateTransaction`, `deleteTransaction`, `listTransactionsByExpense`).

- [ ] **Step 1: Reads**

`const expenses = useLiveQuery(() => db.expenses.orderBy('date').reverse().toArray());` → `const { rows: expenses, create: createExp, update: updateExp, remove: removeExp } = useEntity(QK.expenses, { list: listExpenses, create: createExpense, update: updateExpense, remove: deleteExpense });` (`listExpenses` already orders `date desc`).

- [ ] **Step 2: `saveExpense` — expense + linked transaction (multi-write)**

```js
const qc = useQueryClient();
// add:
const exp = await createExp({ date: data.date, category: data.category, amount: data.amount, paymentMethod: data.paymentMethod, vendorName: data.vendorName, description: data.description });
await createTransaction({
  date: data.date, partyId: null, expenseId: exp.id, type: 'Expense',
  amount: data.amount, method: data.paymentMethod, reference: null, notes: txnNote, autoRecorded: true,
});
qc.invalidateQueries({ queryKey: [QK.transactions] });
// edit:
const { id, ...rest } = data;
await updateExp(id, { date: rest.date, category: rest.category, amount: rest.amount, paymentMethod: rest.paymentMethod, vendorName: rest.vendorName, description: rest.description });
const linked = (await listTransactionsByExpense(id))[0];
if (linked) { await updateTransaction(linked.id, { date: rest.date, amount: rest.amount, method: rest.paymentMethod, notes: txnNote }); qc.invalidateQueries({ queryKey: [QK.transactions] }); }
```

- [ ] **Step 3: `deleteExpense`**

```js
await removeExp(id);
const linked = (await listTransactionsByExpense(id))[0];
if (linked) { await deleteTransaction(linked.id); qc.invalidateQueries({ queryKey: [QK.transactions] }); }
```

- [ ] **Step 4: build + test + manual smoke** (add expense → appears in list + in Payments/Reports transaction totals; edit; delete removes both rows) **+ commit** `git add src/pages/Expenses.jsx && git commit -m "Expenses: migrate to src/api (expense + linked transaction)"`

---

### Task 4: Migrate `src/pages/Payments.jsx`

**Files:** Modify `src/pages/Payments.jsx`.

**Interfaces:** Consumes `useTable`, `QK`, `src/api/transactions.js` (`listTransactions`, `createTransaction`, `deleteTransaction`, `listTransactionsByInvoice`), `src/api/parties.js` (`listParties`), `src/api/invoices.js` (`listInvoices`, `updateInvoice`).

- [ ] **Step 1: Reads**

- `useLiveQuery(() => db.transactions.reverse().toArray())` → `useTable(QK.transactions, listTransactions)`
- `useLiveQuery(() => db.parties.toArray())` → `useTable(QK.parties, listParties)`
- `useLiveQuery(() => db.invoices.toArray())` → `useTable(QK.invoices, listInvoices)`

- [ ] **Step 2: `savePayment` — no more `db.transaction`, no `Number()`**

- Delete `data.partyId = Number(data.partyId);` and `data.invoiceId = Number(data.invoiceId);` — keep the strings. Keep the `if (!data.invoiceId) delete data.invoiceId;` (empty-string guard) but compare with `if (!data.invoiceId)`.
- Body:
```js
const qc = useQueryClient();
await createTransaction(data);
if (data.invoiceId) {
  const inv = invoices.find(i => i.id === data.invoiceId);
  if (inv) {
    const related = await listTransactionsByInvoice(inv.id);
    const sumPaid = related.reduce((s, t) => s + t.amount, 0); // createTransaction already persisted, so it's included
    const status = sumPaid >= inv.total ? 'Paid' : sumPaid > 0 ? 'Partial' : inv.status;
    if (status !== inv.status) await updateInvoice(inv.id, { status });
  }
}
qc.invalidateQueries({ queryKey: [QK.transactions] });
qc.invalidateQueries({ queryKey: [QK.invoices] });
```
(Note: the old code summed `related + data.amount` because the Dexie add was inside the same txn and `where().equals()` might not see it yet; here `createTransaction` awaited its write, so `listTransactionsByInvoice` includes it — do NOT double-add `data.amount`.)

- [ ] **Step 3: `deletePayment` — same shape**

```js
const txn = await getTransaction(id);            // add getTransaction to transactions.js if missing
await deleteTransaction(id);
if (txn?.invoiceId) {
  const inv = invoices.find(i => i.id === txn.invoiceId);
  if (inv) {
    const related = await listTransactionsByInvoice(inv.id);
    const sumPaid = related.reduce((s, t) => s + t.amount, 0);
    const status = sumPaid >= inv.total ? 'Paid' : sumPaid > 0 ? 'Partial' : 'Pending';
    await updateInvoice(inv.id, { status });
  }
}
qc.invalidateQueries({ queryKey: [QK.transactions] });
qc.invalidateQueries({ queryKey: [QK.invoices] });
```

- [ ] **Step 4: id comparisons** — `String(txn.partyId) === String(filterParty)` → `txn.partyId === filterParty`; `parties?.find(p => p.id === inv.partyId)` stays; `String(inv.partyId)` / `String(inv.id)` in `handleQuickPay` → drop the `String()`.

- [ ] **Step 5: build + test + manual smoke** (record a payment against a pending invoice → invoice flips to Partial/Paid; delete it → flips back) **+ commit** `git add src/pages/Payments.jsx && git commit -m "Payments: migrate to src/api; client-side status recompute"`

---

### Task 5: Migrate `src/pages/Ledger.jsx`

**Files:** Modify `src/pages/Ledger.jsx`.

**Interfaces:** Consumes `useTable`, `QK`, `src/api/parties.js` (`getParty`), `src/api/invoices.js` (`listInvoicesByParty`), `src/api/transactions.js` (`listTransactionsByParty`), `src/api/company.js` (`getCompany`).

- [ ] **Step 1: Reads — drop `Number(partyId)`**

```js
const party = useTable([QK.parties, partyId], () => getParty(partyId), null);   // fallback null (object, not array)
const allInvoices = useTable([QK.invoices, partyId], () => listInvoicesByParty(partyId));
const allTransactions = useTable([QK.transactions, partyId], () => listTransactionsByParty(partyId));
```
`useTable`'s 3rd arg is the non-array fallback (Phase 2a added it). `party` is a single object.
- Every `Number(partyId)` is gone. `inv.id` / `txn.id` used in `` `inv-${inv.id}` `` string keys — fine as strings.

- [ ] **Step 2: `downloadPDF`** — `const company = await getSetting('company', {});` → `const company = await getCompany() ?? {};`.

- [ ] **Step 3: build + test + manual smoke** (open a party ledger from CRM → invoices + payments listed, running balance correct, PDF downloads) **+ commit** `git add src/pages/Ledger.jsx && git commit -m "Ledger: migrate to src/api; drop Number(partyId)"`

---

### Task 6: Migrate `src/pages/Dashboard.jsx`

**Files:** Modify `src/pages/Dashboard.jsx`.

**Interfaces:** Consumes `useTable`, `QK`, `src/api/invoices.js` (`listInvoices`), `src/api/products.js` (`listProducts`), `src/api/variants.js` (`listVariants`), `src/api/parties.js` (`listParties`), `src/api/expenses.js` (`listExpenses`).

- [ ] **Step 1: Reads** — the 5 `useLiveQuery` → 5 `useTable(QK.*, listX)`. `db.invoices.orderBy('id').reverse().toArray()` → `useTable(QK.invoices, listInvoices)` then, if the component relies on newest-first, `[...invoices].sort((a,b)=> (b.date||'').localeCompare(a.date||''))` in a `useMemo` (id is a uuid now, not sortable — sort by `date`).

- [ ] **Step 2: `Number(id)` at lines ~219, ~226** — `Object.entries(map).map(([id, amount]) => ({ partyId: Number(id), amount }))` → `({ partyId: id, amount })`. The `map` keys came from `txn.partyId` (string) so they round-trip as strings; downstream `parties.find(p => p.id === partyId)` then matches.

- [ ] **Step 3: build + test + manual smoke** (dashboard stat cards + charts render with real Supabase data or sensible zeroes on an empty company) **+ commit** `git add src/pages/Dashboard.jsx && git commit -m "Dashboard: migrate to src/api; drop Number(id)"`

---

### Task 7: Migrate `src/pages/Reports.jsx`

**Files:** Modify `src/pages/Reports.jsx`.

**Interfaces:** Consumes `useTable`, `QK`, and `listInvoices`, `listExpenses`, `listParties`, `listTransactions`, `listVariants`, `listProducts`, `listStockLedger`.

- [ ] **Step 1: Reads** — the 8 `useLiveQuery` → 8 `useTable(QK.*, listX)`. `db.stockLedger.toArray()` → `useTable(QK.stockLedger, listStockLedger)`.
- [ ] **Step 2: `Number(id)` at line ~225** — `parties?.find(p => p.id === Number(id))` → `parties?.find(p => p.id === id)`.
- [ ] **Step 3: `getSetting('company', {})` at lines ~526, ~630** → `await getCompany() ?? {}`.
- [ ] **Step 4: The date-range filters** — these already operate on the in-memory arrays (`filterByDate`), no query change needed; leave as-is.
- [ ] **Step 5: build + test + manual smoke** (P&L, GSTR-1/3B JSON export, aging, daybook all render; date range filter works) **+ commit** `git add src/pages/Reports.jsx && git commit -m "Reports: migrate to src/api"`

---

### Task 8: Migrate `src/pages/Settings.jsx`

**Files:** Modify `src/pages/Settings.jsx`.

**Interfaces:** Consumes `src/api/company.js` (`getCompany`, `updateCompany`), `supabase` (for password change).

- [ ] **Step 1: Company profile load/save**

- The load `Promise.all([ getSetting('company', defaultCompany), getSetting('invoiceTheme','classic'), getSetting('invoicePrefix','INV'), getSetting('defaultTerms',''), getSetting('lastBackupDate',null), getSetting('gdriveLastSync',null) ])` → `const co = await getCompany();` then map: company fields from `co`; `invoiceTheme` from `localStorage.getItem('lekhya_theme_invoice') || 'classic'`; `invoicePrefix` from `co.invoicePrefix`; `defaultTerms` from `co.defaultTerms || ''`. Drop `lastBackupDate` / `gdriveLastSync` entirely.
- The save `Promise.all([ setSetting('company', company), setSetting('invoiceTheme', invoiceTheme), setSetting('invoicePrefix', invoicePrefix), setSetting('defaultTerms', defaultTerms) ])` → `await updateCompany({ name, gstin, address, phone, email, upiId, logoUrl, bankName, bankAccount, bankIfsc, invoicePrefix, defaultTerms })` + `localStorage.setItem('lekhya_theme_invoice', invoiceTheme)`.
- `getSetting('company', {})` at line ~407 → `await getCompany() ?? {}`.
- `setSetting('invoiceSeq', 0)` (line ~520, "reset numbering") → `await updateCompany({ invoiceSeq: 0 })` (add `invoiceSeq` to `company.js` `toRow`).

- [ ] **Step 2: Password change → Supabase**

Find `handleChangePassword` (reads `localStorage.getItem('lekhya_session')`, calls `verifyUser` + `updateUserPassword`). Replace the whole handler body with:
```js
if (newPassword.length < 8) { toast('Password must be at least 8 characters', 'error'); return; }
if (newPassword !== confirmPassword) { toast('Passwords do not match', 'error'); return; }
const { error } = await supabase.auth.updateUser({ password: newPassword });
if (error) { toast('Failed: ' + error.message, 'error'); return; }
toast('Password updated', 'success');
```
Drop the current-password field + its verification (Supabase requires an active session, which is the equivalent guard). Remove `verifyUser` / `updateUserPassword` from the `../db/db` import.

- [ ] **Step 3: Delete backup/restore + Google Drive sections**

- Remove the JSON **export** handler and its button, the JSON **import** handler (the `db.X.bulkPut(...)` block, lines ~322–330) and its button/file input, and the entire **Google Drive backup** UI section + its handlers (`gdriveLastSync`, `lastBackupDate`, `handleGDriveSync`, etc.).
- Remove the now-unused `../db/db` import entirely (all of `db`, `getSetting`, `setSetting`, `verifyUser`, `updateUserPassword`).
- If a "Danger zone / clear all data" control exists and used `db.X.clear()`, remove it too (Supabase data is managed server-side; out of scope for a client button).

- [ ] **Step 4: build + test**

`npm.cmd run build`; `grep -nE "from '\.\./db/db'|getSetting|setSetting|verifyUser|bulkPut|gdrive|lastBackupDate" src/pages/Settings.jsx` → no matches.

- [ ] **Step 5: Manual smoke** — Settings loads company from Supabase; edit company name + save → persists (reload shows it); change invoice prefix → next invoice uses it; change password → succeeds, re-login with new password works.

- [ ] **Step 6: Commit** `git add src/pages/Settings.jsx src/api/company.js && git commit -m "Settings: company via src/api, password via Supabase, drop backup/GDrive"`

---

### Task 9: Port `src/services/stockService.js` to the API layer

**Files:** Modify `src/services/stockService.js`. Test: `src/services/stockService.test.js`.

**Interfaces:**
- Consumes: `src/api/variants.js` (`getVariant`, `updateVariant`, `listVariantsByProduct`), `src/api/products.js` (`getProduct`, `updateProduct`), `src/api/stockLedger.js` (`createStockLedgerEntry`), `src/utils/unitConversion.js` (`convertUnit`, unchanged).
- Produces: `adjustStock` / `packageStock` with **identical signatures + return shapes**; no `db` import; callers no longer need a transaction.

- [ ] **Step 1: Characterization tests first (fake api layer)**

Create `src/services/stockService.test.js` — `vi.mock('../api/variants.js' | '../api/products.js' | '../api/stockLedger.js')` backed by an in-memory `Map` store (see spec §8). Cover: packed stock-in raises `stockQty` + appends ledger + recalculates `averageCost` (WAC formula); packed deduction below zero throws `/Insufficient stock/`; bulk stock-in raises `products.masterStock` and propagates `averageCost` to sibling variants by `costPerBase * sibPackSz`; hybrid sale (bulk product with `variant.stockQty > 0`) deducts from `variant.stockQty` not `masterStock`; `packageStock` moves `masterStock` → `variant.stockQty` and throws on insufficient bulk. Use camelCase fields (what `fromRow` produces).

- [ ] **Step 2: Run — fails against current Dexie impl**

`npx vitest run src/services/stockService.test.js` → FAIL (current file imports `../db/db`).

- [ ] **Step 3: Port — swap data calls only**

| Current | Replacement |
|---|---|
| `import { db } from '../db/db';` | `import { getVariant, updateVariant, listVariantsByProduct } from '../api/variants.js';`<br>`import { getProduct, updateProduct } from '../api/products.js';`<br>`import { createStockLedgerEntry } from '../api/stockLedger.js';` |
| `await db.productVariants.get(variantId)` | `await getVariant(variantId)` |
| `await db.products.get(pid)` | `await getProduct(pid)` |
| `await db.productVariants.update(id, patch)` | `await updateVariant(id, patch)` |
| `await db.products.update(pid, patch)` | `await updateProduct(pid, patch)` |
| `await db.productVariants.where('productId').equals(pid).toArray()` | `await listVariantsByProduct(pid)` |
| `await db.stockLedger.add({...})` | `await createStockLedgerEntry({...})` |

Keep every branch of the logic. Delete the "Must be called inside a Dexie 'rw' transaction" comments. Ledger entry keys stay camelCase (`variantId, productId, type, packs, baseQtyDelta, balanceQty, unitCost, batchNo, reference, note, date`).

- [ ] **Step 4: Run — passes.** `npx vitest run src/services/stockService.test.js` → PASS.

- [ ] **Step 5: build**

`npm.cmd run build` → success. Billing/Purchases/Inventory still wrap `adjustStock` in `db.transaction` — **that is now broken** (a supabase `await` inside a Dexie transaction throws `PrematureCommitError`). Tasks 10–12 fix each. Do NOT test invoice-save / stock-in in the running app until its page task lands. Note this in the commit body.

- [ ] **Step 6: Commit** `git add src/services/stockService.js src/services/stockService.test.js && git commit -m "Port stockService to src/api layer (+ characterization tests); callers fixed in Tasks 10-12"`

---

### Task 10: Migrate `src/pages/Inventory.jsx`

**Files:** Modify `src/pages/Inventory.jsx`.

**Interfaces:** Consumes `useTable`/`useEntity`, `QK`, `src/api/products.js`, `src/api/variants.js`, `src/api/parties.js` (`listParties`), `src/api/batches.js` (`listActiveBatches`), `src/api/purchases.js` (`createPurchase`, `listPurchasesByVariant`), `src/api/transactions.js` (`createTransaction`), `src/api/stockLedger.js` (`listLedgerByVariant`), `stockService` (`adjustStock`, `packageStock`).

- [ ] **Step 1: Reads**

- `db.products.toArray()` → `useTable(QK.products, listProducts)`
- `db.productVariants.toArray()` → `useTable(QK.variants, listVariants)`
- `db.parties.where('type').equals('Vendor').toArray()` → `useTable(QK.parties, listParties)` then `.filter(p => p.type === 'Vendor')` in a `useMemo`
- `db.batches.where('status').equals('active').toArray()` → `useTable(QK.batches, listActiveBatches)`
- `purchaseHistory` (line ~287, `useLiveQuery` with a param) → `useTable([QK.purchases, selectedVariantId], () => listPurchasesByVariant(selectedVariantId))` (guarded: return `[]` if no id)
- `ledgerEntries` (line ~295) → `useTable([QK.stockLedger, selectedVariantId], () => listLedgerByVariant(selectedVariantId))`

- [ ] **Step 2: `handleSave` (add/edit product+variant) — drop `db.transaction`**

Sequential, with cleanup:
```js
const qc = useQueryClient();
try {
  let productId = prod?.id ?? null;
  if (prod) {
    if (data.hsn && !prod.hsn) await updateProduct(prod.id, { hsn: data.hsn });
  } else {
    const p = await createProduct({ name: data.productName.trim(), hsn: data.hsn || '', inventoryMode: effectiveMode, masterStock: 0, baseUnit: data.baseUnit?.trim().toUpperCase() || null });
    productId = p.id;
  }
  const v = await createVariant({ productId, packSize: packSizeNum, unit: data.unit, purchasePrice: Number(data.purchasePrice) || 0, sellingPrice, gstRate: Number(data.gstRate), stockQty: 0, reorderPoint: Number(data.reorderPoint) || 10, barcode: data.barcode?.trim() || '' });
  if (initialPacks > 0) await adjustStock({ variantId: v.id, productId, packsDelta: initialPacks, type: 'opening', reference: 'Opening stock', unitCost: Number(data.purchasePrice) || 0 });
} catch (err) { toast('Save failed: ' + err.message, 'error'); }
qc.invalidateQueries({ queryKey: [QK.products] }); qc.invalidateQueries({ queryKey: [QK.variants] }); qc.invalidateQueries({ queryKey: [QK.stockLedger] });
```
Edit branch: `updateVariant(variantId, {...})` + `updateProduct(productId, { name, hsn })`.

- [ ] **Step 3: `deleteVariant`** — `await deleteVariant(variantId); const remaining = (await listVariantsByProduct(productId)).length; if (remaining === 0) await deleteProduct(productId);` + invalidate.

- [ ] **Step 4: `handlePurchase` (manual stock-in)** — drop `db.transaction`; `await createPurchase({ productId, variantId, vendorId: vendorId || null, date: new Date(date).toISOString(), qty: packsNum, purchasePrice: Number(purchasePrice) || 0, notes })` then `await adjustStock({ ... type:'stock-in' ... })` then (if `priceNum > 0`) `await createTransaction({ date: new Date(date).toISOString().slice(0,10), partyId: vendorId || null, type: 'Payment Out', amount: priceNum*packsNum, method: 'Cash', reference: null, notes, autoRecorded: true })`. **Drop both `Number(vendorId)`** (lines 215, 232) — `vendorId || null`. Invalidate `QK.purchases`, `QK.variants`, `QK.products`, `QK.stockLedger`, `QK.transactions`.

- [ ] **Step 5: `handleOut` (manual stock-out)** — drop `db.transaction`; just `await adjustStock({ ... packsDelta: -Number(qty), type: 'stock-out', reference: 'Manual stock-out' })` + invalidate `QK.variants`/`QK.products`/`QK.stockLedger`.

- [ ] **Step 6: `handlePackaging`** — drop `db.transaction`; `await packageStock({ productId: product.id, packagingItems: packItems, note: note || '' })` + invalidate.

- [ ] **Step 7: build + test + manual smoke** (add a product with opening stock → appears with stock + a ledger row; stock-in raises qty; stock-out lowers it; low-stock badge; for a bulk product, packaging moves master→variant) **+ commit** `git add src/pages/Inventory.jsx && git commit -m "Inventory: migrate to src/api + ported stockService"`

---

### Task 11: Migrate `src/pages/Purchases.jsx`

**Files:** Modify `src/pages/Purchases.jsx`.

**Interfaces:** Consumes `useTable`, `QK`, `src/api/*` (`parties`, `products`, `variants`, `invoices`, `invoiceItems`, `transactions`, `batches`, `purchases`), `src/api/company.js` (`getCompany`, `nextInvoiceNumber`), `stockService` (`adjustStock`).

- [ ] **Step 1: Reads** — `vendors` (`parties` filtered `type==='Vendor'`), `products`, `productVariants` → `variants`, `purchaseBills` (`db.invoices` filtered `type==='Purchase'`, line ~144) → `useTable(QK.invoices, listInvoices)` then `.filter(i => i.type === 'Purchase')`.

- [ ] **Step 2: `getSetting('company')`** at lines ~191, ~345, ~450 → `getCompany()`. `getNextInvoiceNumber()` at ~346 → `nextInvoiceNumber()`.

- [ ] **Step 3: New-vendor inline add** (line ~197) — `await db.parties.add({ ...vendorModal, type: 'Vendor', activities: [] })` → `await createParty({ ...vendorModal, type: 'Vendor', activities: [] })` + invalidate `QK.parties`.

- [ ] **Step 4: `handleSubmit` (PO save) — the big multi-write**

Replace the `db.transaction('rw', db.invoices, db.productVariants, db.products, db.stockLedger, db.batches, …)` block. On `type === 'Purchase'`, `save_invoice`-equivalent sequence with cleanup (recipe): `nextInvoiceNumber()` → `createInvoice(record)` (record includes `refInvoiceNumber` only for notes; here plain) → per line `createInvoiceItem({ ...li, invoiceId })` → per line `adjustStock({ variantId, productId, packsDelta: +qty, type: 'purchase', reference: poNumber, unitCost: rate })` → per line batch upsert: if `item.batchNo`, `const existing = (await listBatchesByVariant(variantId)).find(b => b.batchNo === item.batchNo && b.status === 'active')`; `existing ? updateBatch(existing.id, { remainingQty: existing.remainingQty + item.qty }) : createBatch({ variantId, productId, batchNo: item.batchNo, mfgDate: item.mfgDate || null, expiryDate: item.expiryDate || null, status: 'active', receivedQty: item.qty, remainingQty: item.qty })` → `createPurchase({...})` per line → if paid-in-full checkbox, `createTransaction({ type: 'Payment Out', ... })` + `updateInvoice(inv.id, { status: 'Paid' })`. On any throw: reverse each `adjustStock` (`packsDelta: -qty, type: 'void'`), `deleteItemsByInvoice(inv.id)`, `deleteInvoice(inv.id)`, re-throw. Invalidate all touched `QK.*`.

- [ ] **Step 5: `handleRecordPayment` (line ~460) + `handleDeleteBill` / reverse (lines ~490–515)**

- Payment: `createTransaction({ type: 'Payment Out', invoiceId: bill.id, ... })` → recompute status from `listTransactionsByInvoice` → `updateInvoice(bill.id, { status })`. Drop `db.transaction`.
- Delete/reverse: for each line of the bill, `adjustStock({ packsDelta: -qty, type: 'void', reference: bill.invoiceNumber })`; delete linked `transactions` (`listTransactionsByInvoice` → `deleteTransaction` each); `deleteItemsByInvoice(bill.id)`; `deleteInvoice(bill.id)`. Drop `db.transaction`.

- [ ] **Step 6: build + test + manual smoke** (create a purchase bill → stock rises, a batch row appears, a purchases row, invoice in the Purchase list; record a payment → status; delete the bill → stock reverts) **+ commit** `git add src/pages/Purchases.jsx && git commit -m "Purchases: migrate to src/api + compensating cleanup"`

---

### Task 12: Migrate `src/pages/Billing.jsx`

**Files:** Modify `src/pages/Billing.jsx`.

**Interfaces:** Consumes `useTable`, `QK`, all of `src/api/*`, `src/api/company.js` (`getCompany`, `nextInvoiceNumber`, `nextNoteNumber`), `stockService` (`adjustStock`).

- [ ] **Step 1: Reads** (lines ~436–439) — `parties`, `products`, `productVariants`→`variants`, `invoices` (`db.invoices.orderBy('id').reverse()` → `useTable(QK.invoices, listInvoices)`; sort by `date` desc in a `useMemo` for the history tab).

- [ ] **Step 2: `getSetting` / `getNextInvoiceNumber`** — all `getSetting('company', {})` (8 sites) → `await getCompany() ?? {}`. `getSetting('invoiceTheme','classic')` → `localStorage.getItem('lekhya_theme_invoice') || 'classic'`. `getNextInvoiceNumber()` (line ~780) → `nextInvoiceNumber()`. The preview "peek" (lines ~988–991, reads `invoicePrefix`/`invoiceSeq` without incrementing) → `const co = await getCompany(); const peekNumber = formatInvoiceNumber(co.invoicePrefix||'INV', new Date().getFullYear(), (co.invoiceSeq||0)+1);` (import `formatInvoiceNumber` from `company.js`).

- [ ] **Step 3: `handleSaveInvoice` — the primary multi-write**

Replace the `db.transaction('rw', db.invoices, db.productVariants, db.products, db.purchases, db.stockLedger, db.batches, async () => {…})` block + the post-txn `db.transactions.add` loop. Sequence with cleanup (recipe §"Multi-table write"):
1. `const invoiceNumber = draftId ? existing : await nextInvoiceNumber()` (retry ≤3× on a thrown Postgres `23505` — catch, re-call `nextInvoiceNumber`, rebuild the record's `invoiceNumber`).
2. `draftId ? await updateInvoice(draftId, invoiceRecord) : (inv = await createInvoice(invoiceRecord))`.
3. `for (const li of lineItems) await createInvoiceItem({ ...li, invoiceId: inv.id })`.
4. If `isRealSale`: per item `await adjustStock({ variantId, productId, packsDelta: isPurchase ? +qty : -qty, type: isPurchase ? 'purchase' : 'sale', reference: invoiceNumber, unitCost: isPurchase ? rate : null })`; then purchase branch → `createPurchase(...)`; sale branch → FEFO batch deduction: `const active = (await listBatchesByVariant(item.id)).filter(b => b.status==='active' && b.remainingQty>0).sort(byExpiry)`; walk, `updateBatch(b.id, { remainingQty: newRem, status: newRem<=0?'exhausted':'active' })`.
5. Per valid payment `await createTransaction({ ..., invoiceId: inv.id, type: invoiceType==='Sales'?'Payment In':'Payment Out', autoRecorded: true })`.
6. `catch`: reverse each applied `adjustStock` (`type:'void'`), `deleteItemsByInvoice(inv.id)`, `deleteInvoice(inv.id)` (skip delete when `draftId` — it pre-existed), toast + re-throw.
7. Success: `setSavedInvoice({...})`, reset form, invalidate `QK.invoices/invoiceItems/variants/products/purchases/batches/transactions/stockLedger`.

- [ ] **Step 4: `handleSaveDraft`** (lines ~1079–1082) — `db.invoices.update(draftId, draftRecord)` / `db.invoices.add(draftRecord)` → `updateInvoice` / `createInvoice`; also write `lineItems` via `createInvoiceItem` (drafts currently inline `lineItems` on the invoice row — keep that: `invoices.lineItems` is not a column, so drafts store items where? **Decision:** drafts write `invoice_items` rows too, same as finalised — simpler than a jsonb blob. Adjust `handleSaveDraft` to create/replace items: on re-save of a draft, `deleteItemsByInvoice(draftId)` then re-create). Invalidate `QK.invoices`/`QK.invoiceItems`.

- [ ] **Step 5: Credit/Debit notes** (`handleIssueNote`, lines ~1160–1210+) — `db.settings.get(noteSeqKey)` / `db.settings.put` → `await nextNoteNumber(noteType)`. `noteRecord` gains `refInvoiceNumber: inv.invoiceNumber` (now a real column). Replace the `db.transaction` block: `createInvoice(noteRecord)` → `createInvoiceItem` per line → per line `adjustStock({ packsDelta: isCreditNote ? +qty : -qty, type: isCreditNote ? 'credit-note' : 'debit-note', reference: noteNumber })` → cleanup on throw. Invalidate.

- [ ] **Step 6: Invoice status updates + delete** (lines ~1266–1317) — `db.transactions.add` → `createTransaction`; `db.invoices.update(inv.id, { status })` → `updateInvoice`; `db.invoices.delete(inv.id)` → for a real sale, reverse stock first (per line `adjustStock` `type:'void'`), delete linked transactions, `deleteItemsByInvoice(inv.id)`, then `deleteInvoice(inv.id)`. Drop `db.transaction`.

- [ ] **Step 7: Inline new-party add** (line ~2443) — `db.parties.add(data)` → `createParty(data)` + invalidate `QK.parties`.

- [ ] **Step 8: Remove imports** — `useLiveQuery`, `db`, `getSetting`, `getNextInvoiceNumber` from `'../db/db'`. Keep everything else.

- [ ] **Step 9: build + test + manual smoke**

`npm.cmd run build`; `npx vitest run`; `grep -n "db\.\|useLiveQuery\|from '../db/db'\|getSetting\|getNextInvoiceNumber" src/pages/Billing.jsx` → no matches.
Manual: create a sales invoice via **Preview & Print** → Save & Print → invoice persists with the real number, `invoice_items` rows exist, stock dropped, a `stock_ledger` sale row, batch FEFO deduction if batches exist; POS + PDF re-print still work; record a payment → status flips; issue a credit note → stock returns; delete an invoice → stock restored, items + linked txns gone. Two browser tabs: saving in one refreshes the History list in the other (realtime).

- [ ] **Step 10: Commit** `git add src/pages/Billing.jsx && git commit -m "Billing: migrate to src/api + compensating cleanup; note seqs via company"`

---

## Self-Review

**1. Spec coverage (Phase 2b scope):**

| Spec item | Task |
|---|---|
| §2.2 remove every `Number(id)`/`parseInt(id)` coercion | Tasks 4,5,6,7,10 (audit: Ledger×3, Dashboard×2, Inventory×2, Reports×1, Payments `String()`×3) |
| §3.1/§3.2 pages read via `useTable`/`useEntity` on `QK` keys | Tasks 2–8, 10–12 |
| §3.1 filtered queries via `listXByF` helpers | Tasks 3,4,5,10,11,12 |
| §4.1 `stockService` ported to `src/api/*`, signatures frozen | Task 9 |
| §4.2 compensating cleanup for invoice-save, invoice-delete, record/delete payment, product+opening-stock | Tasks 4 (payment), 10 (product+stock), 11 (PO save/reverse), 12 (invoice save/notes/delete) |
| §4.3 `nextInvoiceNumber` + 23505 retry in `createInvoice` caller | Task 12 Step 3; guard added Task 1 Step 4 |
| §2.4 `getSetting('company')`→`getCompany`; `invoiceTheme`→localStorage; `defaultTerms`→`companies` | Tasks 5,7,8,11,12 |
| §8 `stockService` characterization tests (packed/bulk/hybrid/WAC/throw) | Task 9 |
| credit/debit-note sequences off `db.settings` | Task 1 (`nextNoteNumber`), Task 12 Step 5 |
| schema deltas the audit found (`transactions.expense_id`, `invoices.ref_invoice_number`, `companies.default_terms`/`credit_note_seq`/`debit_note_seq`) | Task 1 |
| drop Settings JSON backup/restore + Google Drive (dead in cloud) | Task 8 Step 3 |
| Settings password change → `supabase.auth.updateUser` | Task 8 Step 2 |

Deferred to Phase 3: delete `src/db/db.js` + `src/lib/syncEngine.js`; remove `dexie`/`dexie-react-hooks`/`vite-plugin-pwa` deps; remove `startAutoSync` + the online/offline badge + the manual Sync button from `App.jsx`; PWA removal; `main.jsx` cleanup snippet; README rewrite; delete `smoke-test.mjs`; pure-logic vitest for `amountToWords`/`fmtPDF`/`unitConversion`/`validators`; decide I7 (`companies` RLS) / I8 (`listX` `company_id` filter).

**2. Placeholder scan:** No TBD/TODO. The Migration Recipe carries the shared boilerplate once; each page task gives the file-specific swaps and real code for the non-mechanical parts (compensating cleanup, status recompute, FEFO, stockService port). Line numbers are "~approx" because Billing/Purchases shift as edited — every reference is also pinned by a function name or a code quote.

**3. Type consistency:**
- `QK.*` keys (from Phase 2a `realtime.js`) used everywhere; `QK.variants` (not `product_variants`), `QK.invoiceItems`, `QK.stockLedger`, `QK.company`.
- `useTable(key, fn, fallback?)` — 3-arg form (Phase 2a) used for single-object reads (`Ledger` `party`, fallback `null`).
- `stockService` (Task 9) imports match Task 2's api exports: `getVariant/updateVariant/listVariantsByProduct` (`variants.js`), `getProduct/updateProduct` (`products.js`), `createStockLedgerEntry` (`stockLedger.js`).
- New api additions in Task 1: `transactions.js` gains `listTransactionsByExpense` + `expenseId` mapping + `getTransaction` (Task 4 Step 3 needs it — add to Task 1 Step 4 list); `invoices.js` gains `refInvoiceNumber` mapping + `deleteItemsByInvoice` already exists on `invoiceItems.js` (Phase 2a); `company.js` gains `nextNoteNumber`/`formatNoteNumber`/`defaultTerms`/`creditNoteSeq`/`debitNoteSeq`/`invoiceSeq` mapping + `nextInvoiceNumber` null guard.
- `createX` returns the persisted row incl. `id` — Tasks 10/11/12 rely on `inv.id` / `p.id` / `v.id` immediately after create.
- `adjustStock` / `packageStock` signatures unchanged from the Dexie version — callers in Tasks 10–12 pass the same arg objects, only the enclosing `db.transaction` is removed.

**Correction to Task 4 Step 3 / Task 1 Step 4:** add `getTransaction(id)` to `src/api/transactions.js` in Task 1 Step 4 (standard `getX` shape) — Task 4's `deletePayment` needs it to find the linked invoice.
