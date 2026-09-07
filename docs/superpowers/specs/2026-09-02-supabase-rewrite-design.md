# Remove offline: move Lekhya Web fully to Supabase

**Date:** 2026-09-02
**Status:** Approved — atomic-ops approach revised to client-side best-effort (no RPCs) after deeper review of `stockService.js`
**Scope:** Architectural. Deletes the offline-first data layer (Dexie/IndexedDB + sync engine + PWA + local auth) and rebuilds the app on a typed Supabase (Postgres) backend.

---

## 1. Goal & context

The app was split from an Electron desktop build to a web app. It is still offline-first: **Dexie/IndexedDB is the entire data layer** (9 pages, 43 `useLiveQuery(db…)` read sites, plus `stockService.js`, `subscription.js`, `SetupWizard`, `Login`, `App`), reconciled to Supabase by `src/lib/syncEngine.js`. The Supabase schema today is a generic sync mirror — every table is `(id, company_id, data jsonb, last_modified, device_id, deleted)` with the real record dumped in `data`.

**Target:** Supabase is the single source of truth. No IndexedDB, no sync engine, no PWA/service worker, no local auth fallback. Typed Postgres columns, uuid PKs, RLS per tenant. Multi-table operations run client-side, best-effort with compensating cleanup (no RPCs — see §4). First login = clean slate (existing placeholder rows wiped).

**Decisions locked in brainstorming:**
- Full typed rewrite (not an adapter shim).
- SQL migrations (schema + RLS only) are in scope; applied to project `lekhya-production` (`pfnlpatvjkjykvvswouz`). No stored procedures / RPCs — atomic ops are client-side best-effort (§4).
- Existing Supabase rows (4 parties, 3 invoices, 4 products, 4 variants) are placeholder → deleted. No local-data migration.
- Reactivity via `@tanstack/react-query` + Supabase Realtime invalidation.

---

## 2. Schema & IDs

### 2.1 Typed columns, not jsonb

Drop the `data jsonb` blob on all mirror tables; add real columns so Postgres filters/indexes/sorts (Reports & Invoice History currently pull whole tables and filter in JS).

Tables (all in `public`):

| Table | Notes |
|---|---|
| `companies` | **absorbs settings** — see 2.4 |
| `company_members` | unchanged (`user_id, company_id, role, active`) |
| `parties` | name, gstin, phone, address, email, type (`Customer`/`Vendor`), credit_limit, credit_days, activities jsonb (array of `{text,date}` — genuinely freeform, stays jsonb) |
| `products` | name, hsn, inventory_mode (`packed`/`bulk`), master_stock numeric |
| `product_variants` | product_id fk, pack_size numeric, unit, purchase_price, selling_price, gst_rate, stock_qty numeric, reorder_point, barcode, average_cost |
| `invoices` | invoice_number, type (`Sales`/`Purchase`/`CreditNote`/`DebitNote`), party_id fk, date, due_date, tax_type (`IGST`/`CGST_SGST`), gross_subtotal, item_discount_amt, discount_pct, discount_amt, subtotal, tax_amount, shipping, total, status, payment_status, notes, terms, theme |
| `invoice_items` | invoice_id fk, product_id, variant_id, name, hsn, unit, qty, rate, base_price, gst_rate, item_discount_pct, + snapshot cols (product_name, pack_size, cost_at_sale, purchase_price_snapshot, barcode_snapshot, selling_price) |
| `transactions` | date, party_id fk, invoice_id fk (nullable), type (`Payment In`/`Payment Out`), amount, method, reference, notes, auto_recorded bool |
| `payments` | present in schema, currently unused by the app — **keep table, leave unused** unless a page needs it; do not build new features on it |
| `expenses` | date, category, amount, payment_method, vendor_name, notes |
| `purchases` | product_id, variant_id, vendor_id fk, date, qty, purchase_price, notes |
| `stock_ledger` | **append-only.** variant_id, product_id, type (`opening`/`purchase`/`sale`/`stock-in`/`stock-out`/`credit-note`/`debit-note`), packs, base_qty_delta, balance_qty, reference, note, batch_no, date |
| `batches` | **new.** variant_id, product_id, batch_no, mfg_date, expiry_date, status (`active`/`exhausted`), received_qty, remaining_qty |
| `leads` | **new.** name, source, contact_details, opportunity_value, stage |

Exact column names/types/nullability/defaults are finalized in `001_schema.sql` during implementation by reading each page's record shape. `activities` on parties stays `jsonb` (freeform note log).

### 2.2 IDs

- Every table PK: `id uuid primary key default gen_random_uuid()`.
- All FKs uuid: `party_id`, `invoice_id`, `variant_id`, `product_id`, `vendor_id`.
- **Client generates the uuid on insert** (`crypto.randomUUID()`) so it holds the id before the round-trip — needed to build `invoice_items` before the invoice row exists and for optimistic updates.
- Route params (`/ledger/:partyId`) already carry opaque strings — no change. **Fix:** `Ledger.jsx` currently does `Number(partyId)` and `Payments.jsx`/others do `Number(id)` on ids — every such `Number(...)`/`parseInt` coercion on an id is removed (ids are strings now). This is a search-and-fix pass across all pages.

### 2.3 Tenancy & RLS

- `company_id uuid not null` on every business table (from `company_members` lookup at auth, cached in `localStorage.lekhya_company_id`, same as today).
- RLS policy per table:
  ```sql
  using (company_id in (
    select company_id from company_members
    where user_id = auth.uid() and active
  ))
  ```
  `with check` identical on insert/update. `stock_ledger`: `select` + `insert` only, no `update`/`delete`.
- RLS is the sole guard; `listX` helpers do not add an explicit `.eq('company_id', …)` — see §9.1 (I8).

### 2.4 Settings → `companies` + localStorage

The `settings` key/value table (Dexie) is dropped. Its contents split by nature:

| Old setting | New home |
|---|---|
| `company` (name, gstin, address, phone, email, upi_id, logo, bank_name, bank_account, bank_ifsc) | columns on `companies` |
| `invoicePrefix`, `invoiceSeq` | `invoice_prefix text`, `invoice_seq int` columns on `companies`; incremented by `nextInvoiceNumber()` in `src/api/company.js` (§4.3) |
| `subscription` (trial cache) | `localStorage.lekhya_subscription` (per-browser) |
| `invoiceTheme` | `localStorage.lekhya_theme_invoice` (per-browser UI pref) |

`getSetting`/`setSetting` are deleted. Company reads/writes go through `src/api/company.js`.

---

## 3. Data-access layer + reactivity

### 3.1 `src/api/` modules

One module per entity: `parties.js`, `products.js`, `variants.js`, `invoices.js`, `invoiceItems.js`, `transactions.js`, `expenses.js`, `purchases.js`, `stockLedger.js`, `batches.js`, `leads.js`, `company.js`, plus `_client.js`, `useTable.js`, and `realtime.js`.

Each exports plain async functions:
```js
// src/api/parties.js
import { q, cid, rows, one } from './_client';
export const listParties = ()      => rows(q('parties').select('*').order('name'));
export const getParty     = (id)   => one(q('parties').select('*').eq('id', id).single());
export const createParty  = (data) => one(q('parties').insert({ id: crypto.randomUUID(), company_id: cid(), ...data }).select().single());
export const updateParty  = (id,p) => one(q('parties').update(p).eq('id', id).select().single());
export const deleteParty  = (id)   => q('parties').delete().eq('id', id);
```
`src/api/_client.js`: `q(name)` = `supabase.from(name)`; `cid()` = `localStorage.lekhya_company_id`; `rows`/`one` unwrap `{data,error}` and throw on error.

### 3.2 React Query

Add `@tanstack/react-query`. `QueryClientProvider` wraps the app in `App.jsx`.

- **Read wrapper** (keeps page churn minimal):
  ```js
  // src/api/useTable.js
  export function useTable(key, fn) {
    const { data } = useQuery({ queryKey: [key], queryFn: fn, staleTime: 30_000 });
    return data ?? [];   // mimics the old `useLiveQuery(...) ?? []` contract
  }
  ```
  Pages change `const parties = useLiveQuery(() => db.parties.orderBy('name').toArray())` → `const parties = useTable('parties', listParties)`. Existing `parties || []` / `parties?.length` code keeps working. Pages MUST use the `QK` keys exported from `realtime.js` (e.g. `useTable(QK.invoiceItems, listItemsByInvoice)`) so realtime coverage and query keys can't drift apart.
- **Filtered/derived queries** (Reports date ranges, Ledger by party) become parametrised query fns with keys like `['transactions', partyId]`.
- **Writes:** `useEntity('parties')` hook → `{ rows, create, update, remove }`; each mutation `await`s the api fn then `queryClient.invalidateQueries({ queryKey: ['parties'] })`. Handler bodies stay close to today's shape.
- Explicit `isLoading` spinners added only on Dashboard and Invoice History (elsewhere the empty-array default is fine).

### 3.3 Realtime

```js
// src/api/realtime.js
// TABLES maps pg table name → camelCase app query key. The invalidation key is
// ALWAYS the camelCase app key (variants, invoiceItems, stockLedger, company),
// NOT the pg table name — that's what useTable/useEntity key on.
const TABLES = {
  parties: 'parties', products: 'products', product_variants: 'variants',
  invoices: 'invoices', invoice_items: 'invoiceItems', transactions: 'transactions',
  expenses: 'expenses', purchases: 'purchases', stock_ledger: 'stockLedger',
  batches: 'batches', leads: 'leads', companies: 'company',
};
// canonical query keys — pages MUST key useTable/useEntity on one of these
export const QK = Object.fromEntries(Object.values(TABLES).map(k => [k, k]));

let channel;
export function startRealtime(queryClient) {
  const companyId = localStorage.getItem('lekhya_company_id');
  if (!companyId || channel) return;
  channel = supabase.channel('lekhya');
  for (const [pgTable, key] of Object.entries(TABLES)) {
    channel.on('postgres_changes',
      { event: '*', schema: 'public', table: pgTable, filter: `company_id=eq.${companyId}` },
      () => queryClient.invalidateQueries({ queryKey: [key] }));
  }
  channel.subscribe();
}
export function stopRealtime() { if (channel) { supabase.removeChannel(channel); channel = null; } }
```
Wired in `App.jsx` after auth; torn down on logout. This is the entire replacement for `syncEngine.js` (~30 lines vs 248).

### 3.4 Deleted

`src/lib/syncEngine.js`, `src/db/db.js`, deps `dexie` + `dexie-react-hooks`, and all `cloudId`/`syncStatus`/`deviceId`/`syncQueue`/`_fromSync` machinery.

---

## 4. Atomic operations — client-side, best-effort

**Decision:** no Postgres RPCs. `stockService.js` (`adjustStock`, `packageStock`) is genuinely intricate — packed/bulk/hybrid modes, unit conversion, BULK weighted-average-cost propagation across sibling variants — and re-implementing it in PL/pgSQL is the highest-risk part of the project. Instead the stock logic **stays in JS**, ported from `db.*` to the `src/api/*` layer, and multi-table operations run as **sequential client writes with compensating cleanup**. There is no `003_rpcs.sql`.

### 4.1 `stockService.js` port

`adjustStock({ variantId, productId, packsDelta, type, reference, note, unitCost, batchNo })` and `packageStock(...)` keep their exact signatures and logic. Only the data calls change:
- `db.productVariants.get(id)` → `getVariant(id)` (api)
- `db.products.get(id)` / `.update(id, patch)` → `getProduct` / `updateProduct`
- `db.productVariants.where('productId').equals(pid).toArray()` → `listVariantsByProduct(pid)`
- `db.stockLedger.add(entry)` → `createStockLedgerEntry(entry)`
- `convertUnit` (from `utils/unitConversion`) unchanged.

Callers no longer wrap in `db.transaction('rw', …)` — they just `await` the calls in sequence.

### 4.2 Multi-write operations & compensating cleanup

| Operation | Sequence | On mid-sequence failure |
|---|---|---|
| **Invoice save** (Billing `handleSaveInvoice`, Purchases PO save) | 1. `nextInvoiceNumber()` → 2. `createInvoice(row)` → 3. per line: `adjustStock(...)` → 4. per line (purchase): `createPurchase` / batch upsert; (sale): FEFO `batches` deduction → 5. per payment: `createTransaction(...)` | wrap 2–5 in `try`; on throw, `deleteInvoice(id)` + `deleteInvoiceItems(id)` + best-effort reverse any `adjustStock` already applied (call `adjustStock` with negated `packsDelta`, `type:'void'`), then re-throw. Toast: "Invoice save failed and was rolled back." |
| **Invoice delete** (Billing/Purchases) | reverse each line's stock (`adjustStock` negated, `type:'void'`) → delete linked `transactions` → delete `invoice_items` → delete `invoices` row | failures logged; deletion is idempotent-ish (retry safe) |
| **Record payment** (Payments, Purchases) | `createTransaction(row)` → recompute linked invoice status from `listTransactionsByInvoice(id)` sum vs `total` → `updateInvoice(id, { status, payment_status })` | if status update fails, transaction row still stands; next load recomputes — acceptable |
| **Delete payment** | `deleteTransaction(id)` → recompute + `updateInvoice` | same |
| **Product + opening stock** (Inventory) | `createProduct` → `createVariant` → if opening qty: `adjustStock(type:'opening')` | on `adjustStock` failure, product/variant remain with zero stock — user can retry stock-in. Non-corrupting. |

### 4.3 Invoice number

`nextInvoiceNumber()` in `src/api/company.js`: read `companies.invoice_prefix` + `invoice_seq`, compute `{prefix}-{year}-{seq+1:04}`, `update companies set invoice_seq = invoice_seq + 1 where id = cid`, return the string. A **unique constraint `(company_id, invoice_number)` on `invoices`** (added in `001_schema.sql`) is the backstop: `createInvoice` catches Postgres `23505` and retries `nextInvoiceNumber()` up to 3×.

### 4.4 Accepted limitations (documented)

- Two sessions saving invoices for the same company at the same instant can race on `invoice_seq` → the unique constraint + retry resolves the number collision; worst case one save retries.
- Two sessions editing the same variant's stock concurrently → last-write-wins on `stock_qty` (a lost update). Acceptable for the expected one-active-user-per-company usage; a future `adjust_stock` RPC with row lock is the upgrade path if this bites.
- A crash between sequential writes that also defeats the compensating `catch` (e.g. browser killed) can leave a half-saved invoice. `stock_ledger` is the audit trail to reconcile from.

Single-table CRUD (party, product, variant, expense, lead, draft invoice) is plain client insert/update — nothing special.

---

## 5. Auth & onboarding

### 5.1 `App.jsx` / `AuthGate`

Keep the state machine (`loading → landing → login → setup → reset-password → app`), remove the local-session path.

- Init: `supabase.auth.getSession()` → verify `company_members` row (keep the PGRST116 = removed-account handling) → set `lekhya_company_id`, set user, `startRealtime(queryClient)`.
- **Delete:** `SESSION_KEY`, `SESSION_TTL_MS`, `saveSession`, `loadSession`, the "try local session" branch. `onLogin` loses the `remember` arg (Supabase `persistSession: true` already remembers). `clearSession` → clears `lekhya_company_id` + `lekhya_subscription`.
- `startAutoSync`/`stopAutoSync`/`sync` imports → `startRealtime`/`stopRealtime`.

### 5.2 `Login.jsx`

- **Delete:** offline-fallback branch in `handleLogin`, `_localAuth` brute-force block + `checkLocalLoginLock`/`recordLocalFailure`/`clearLocalLock`, `verifyUser`/`db`/`getSetting` imports.
- **Drop the "Forgot Email / Username" flow** (`forgot-choice` → goes straight to `forgot-password`; delete `forgot-email` screen, `handleLookupEmail`, `lookupResult`, `maskEmail`). It only ever queried local Dexie; a server-side version would let anyone enumerate emails by GSTIN.
- **Keep:** Supabase `signInWithPassword`, membership + company existence checks, `handleForgotPassword` (email reset link), the exported `PasswordReset` screen.

### 5.3 `SetupWizard.jsx`

- **Keep:** `supabase.auth.signUp` → insert `companies` → insert `company_members` (`role: 'owner'`).
- **Delete:** step-5 `createUser()` local user, the offline-fallback `catch` branch, `setSetting('company', …)`, `cloudStatus`-offline UI.
- Company insert writes all profile + bank columns onto `companies` (columns added in `001`).
- Copy: "sync data across Desktop and Android" → "Access your account from any browser."

### 5.4 `db.js` auth helpers removed

`createUser`, `verifyUser`, `isSetupComplete` (already unused), `updateUserPassword`, `resetPasswordByCompanyName`, all PBKDF2 code, the `users` table.

### 5.5 `subscription.js`

`getSetting`/`setSetting` → `localStorage` (`lekhya_subscription`). `ensureTrialStarted` seeds the trial object in localStorage on first `SubscriptionGate` mount. License `activate_license` / `get_license_status` RPC calls unchanged (already server-side truth).

---

## 6. Offline-shell removal

- **PWA:** remove `VitePWA({…})` + import from `vite.config.js`; remove `vite-plugin-pwa` from `package.json`. (Manifest references non-existent `pwa-*.png` — dead config.)
- **One-time cleanup in `main.jsx`** (keep ~2 releases):
  ```js
  try { indexedDB.deleteDatabase('crm-gst-billing-db'); } catch {}
  navigator.serviceWorker?.getRegistrations?.().then(rs => rs.forEach(r => r.unregister())).catch(()=>{});
  caches?.keys?.().then(ks => ks.forEach(k => caches.delete(k))).catch(()=>{});
  ['lekhya_session','bizcrm_session','lekhya_last_sync','lekhya_device_id'].forEach(k => localStorage.removeItem(k));
  ```
- **`App.jsx`:** delete `useOnlineStatus`, the Online/Offline topbar badge, `handleSync`, the sync `<button>`, `RefreshCw` import, the empty sidebar-footer div.
- **Delete** `src/lib/syncEngine.js`.
- **`README.md`:** rewrite to "web app" — tech-stack table (drop Electron/Dexie, add Supabase + react-query), delete Electron/`dist:win`/Google-Drive/DB-schema sections, remove the trailing stray "Bizz-ledger" line.
- **`smoke-test.mjs`:** delete (stale).

### package.json net changes
- Remove: `dexie`, `dexie-react-hooks`, `vite-plugin-pwa`
- Add: `@tanstack/react-query`

---

## 7. Cutover

- Placeholder rows are all in Supabase; `001_schema.sql` starts with `TRUNCATE <all business tables>, companies, company_members, subscriptions RESTART IDENTITY CASCADE;`.
- **Migration order** (via Supabase MCP `apply_migration` on `lekhya-production`): `001_schema` → `002_rls`.
- **User takes a manual dashboard snapshot before `001`** (MCP can't snapshot). Placeholder data, but cheap insurance.
- Client cutover is a hard swap (no feature flag). `main.jsx` cleanup (§6) removes the old IndexedDB + SW + dead localStorage keys on first run of the new build.
- First login after cutover: existing Supabase session → empty app; brand-new → SetupWizard.

---

## 8. Testing

- **`vitest` (new dev dep):** pure logic only — GST CGST/SGST vs IGST split, `amountToWords`, `fmtPDF`, `utils/unitConversion`, `utils/validators`, `subscription.evaluateAccess`/`daysRemaining`, invoice-number formatting. ~6 files, `assert`-based.
- **`stockService` port:** `vitest` tests that exercise `adjustStock`/`packageStock` against a mocked `src/api/*` layer (in-memory fake) — packed stock in/out, bulk masterStock, hybrid sale, BULK WAC sibling propagation, insufficient-stock throw. This is the highest-value test target since the logic moves data backends.
- **Manual verification checklist** (per module): CRUD each entity; sales invoice → stock down + ledger + Reports reflect it; purchase invoice → stock up + batch + purchases row; payment → invoice status recompute; credit note → stock reversed; invoice delete → stock restored; invoice-save failure mid-sequence → invoice rolled back, stock unchanged; two browser tabs → realtime invalidation.
- **Gates:** `npm run build` green every phase; `npm run lint` cleaned to green as files are rewritten (currently 28 errors) then used as a gate.

---

## 9. Risks & open items

| Risk | Mitigation |
|---|---|
| Multi-write ops aren't truly atomic — a crash defeating the compensating `catch` leaves a half-saved invoice | `stock_ledger` audit trail to reconcile; compensating cleanup covers the common (thrown-error) case; documented in §4.4; single-active-user usage keeps races rare |
| Concurrent stock edits → lost update on `stock_qty` | Accepted (§4.4); upgrade path is an `adjust_stock` RPC with row lock |
| `stockService` logic moves from Dexie to `src/api/*` — divergence bugs | Signatures + logic unchanged, only data calls swapped; `vitest` covers packed/bulk/hybrid/WAC paths against a fake api layer |
| id-type coercion (`Number(id)`) scattered across pages | Dedicated search-and-fix pass; grep `Number(.*[Ii]d)` / `parseInt` |
| React Query migration touches all 9 pages — regression surface | Phased: one page per task, build + manual checklist slice each |
| `activities` on parties left as jsonb | Acceptable — freeform note log, never queried |
| Realtime quota / connection limits on Supabase free tier | Single channel, all tables; acceptable for expected scale |
| No CI — gates are manual | Explicit checklist in plan; each phase self-contained |

### 9.1 Post-implementation resolutions (Phase 3)

Two items deferred during the offline-teardown branch were investigated and closed. No Phase 3 migration resulted from either.

**I7 — `companies` / `company_members` RLS scope.**

- Status verified 2026-09-07 via Supabase `list_tables`: `row level security = enabled` on `companies` **and** `company_members` (and on the pre-existing `payments` / `subscriptions` tables). `get_advisors(security)` reports **no** `rls_disabled_in_public` or `rls_enabled_no_policy` finding for any business table or for `companies`.
- The policies rely on a pre-existing `my_company_ids()` `SECURITY DEFINER` helper function that predates migrations `001`–`004`.
- **Resolution:** no Phase 3 migration required — tenant isolation on `companies` is enforced. Follow-up (not blocking): dump the exact `companies` policy predicate from `pg_policies` and document whether it is owner-only or any-active-member; for the current one-owner-per-company product either scoping is acceptable.

**I8 — `listX` helpers omit an explicit `company_id` filter.**

- Confirmed: `listParties` / `listInvoices` / `listProducts` (and the other table `listX` in `src/api/`) issue `select('*')` with no `.eq('company_id', cid())`; row scoping is done entirely by RLS. Spec §2.3 previously said "the client still passes `.eq('company_id', cid)` for query planning".
- **Resolution:** accept as-is. The RLS policy's own `company_id in (select … from company_members where user_id = auth.uid() and active)` already restricts the rows; with one active company per user the extra `.eq` is a redundant planner hint with no security or correctness effect. Adding it to ~11 functions is churn without benefit. §2.3's wording has been updated to reflect that the explicit client filter was dropped as redundant-with-RLS.

**Pre-existing security-advisor items (noted, not acted on).** `get_advisors(security)` also surfaces four pre-existing WARN/INFO items unrelated to this branch: `subscriptions` RLS-enabled-with-no-policy (INFO); three `SECURITY DEFINER` functions callable by the `authenticated` role — `activate_license`, `get_license_status`, `my_company_ids` (the license/membership infra) (WARN); and Auth "leaked password protection disabled", a project-level setting (WARN). All are out of scope for the offline-teardown branch and are recorded here so a later review does not re-litigate them.

**I7 — exact `companies` policy (answer).** The `companies` RLS policy is `owner_access`: `FOR ALL USING (owner_id = auth.uid())` — **owner-only**, not any-active-member. `company_members` has `member_access`: `USING (user_id = auth.uid())`. This is safe today because `SetupWizard` sets `owner_id` and there is no member-invite UI, so every user is the owner of their company. **Prerequisite for any future multi-user feature:** a second `company_members` row would be hard-locked out at login — `Login.jsx`'s company-existence check reads null and signs them out, and `nextInvoiceNumber()` throws `'No company'`. Tightening/kind of policy is a multi-user-feature task, not this branch.

**I9 — 23505 invoice-number retry is only in the Billing caller.** Spec §4.3 specifies the `23505` retry inside `createInvoice`, but it is implemented in `Billing.jsx`'s `handleSaveInvoice` caller instead (correct there). `createInvoice` in `src/api/invoices.js` is bare, so `Purchases.jsx`'s PO save and `Billing.jsx`'s credit/debit-note path have no retry backstop — a concurrent `invoice_seq` collision there fails the save (with a clean compensating rollback, no data corruption). This is spec §4.4's accepted concurrency race with a worse UX, and it cannot occur under the current single-owner-per-company model (see I7). **Follow-up:** move the 3-attempt loop into `createInvoice` and delete it from `Billing.jsx` when multi-user lands.

## 10. Out of scope

- Rewriting the PDF/POS generation (`buildPDF`, `printPOSReceipt`) — unchanged, they take plain objects.
- The theme toggle / minimal restyle (already shipped).
- The invoice Preview & Print modal (already shipped) — its `handleSaveInvoice` is re-pointed at the `src/api/*` layer during the Billing phase.
- Any new features. This is behaviour-preserving except for the removed offline/local-auth capability.
