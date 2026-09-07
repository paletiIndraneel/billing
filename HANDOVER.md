# NEXAURA — Engineering Handover

> Single source of truth for resuming work on this codebase in a fresh session or by another agent.
> Last updated: 2026-09-07. Keep this file current when you finish a chunk of work.

---

## 1. What this is

**NEXAURA** — tagline **"Business, connected."** — a single-page **web** app for Indian small businesses:
GST invoicing, customers/vendors (CRM), inventory with batch/lot tracking, purchase orders,
payments & ledgers, expense tracking, and GST compliance reports (GSTR-1 / GSTR-3B JSON).

It was **originally an offline-first Electron + Dexie/IndexedDB desktop app** and has been
**fully migrated to a Supabase-backed web app** over four planned phases (all complete — see §9).
There is **no Electron, no Dexie, no service worker, no offline mode** any more. Supabase (Postgres)
is the single source of truth.

### Stack

| Layer | Tech |
|---|---|
| UI | React 19, Vite 8, `react-router-dom` 7 (**HashRouter**) |
| Server state | `@tanstack/react-query` v5 |
| Live updates | Supabase Realtime (postgres_changes → react-query cache invalidation) |
| Backend | Supabase — Postgres 17, Auth, Realtime, RLS. Project `lekhya-production` / id `pfnlpatvjkjykvvswouz` |
| PDF | `jspdf` + `jspdf-autotable` |
| Excel export | `xlsx` (SheetJS) |
| Misc | `qrcode` (UPI QR on invoices), `lucide-react` (icons), `date-fns` |
| Tests | Vitest 4 + jsdom |
| Lint | ESLint 10 (flat config, `eslint.config.js`) |

No CI. Gates are manual: `npm.cmd run build`, `npx vitest run`, `npx eslint src`.

---

## 2. Current state (2026-09-07)

- **Branch:** `master` (this is the trunk). HEAD `78f8b16` "Mobile version menu fix".
- **Remote:** `github.com/kiransreeramprathi/NEXAURA-1.0` — `origin/master` is pushed and up to date. `origin/HEAD` still points at the old `origin/remove-offline-supabase-rewrite` branch (stale; the migration was merged into `master` locally then pushed — the old branch can be deleted on GitHub).
- **Working tree:** clean.
- **Gates:** `npm.cmd run build` green · `npx vitest run` → **85/85** across 9 files · `npx eslint src` → **15 errors / 8 warnings** (all pre-existing, see §8.6 — do not let this number grow).
- **Deployment:** a commit `7883cd8 "Trigger production deployment"` exists — a static host (Cloudflare Pages / Vercel / Netlify) is wired to auto-deploy `master`. Confirm which one with the repo owner. See §7 for the config that must exist.

### Local dev environment

- Windows 11. Shell for agents: Git Bash (POSIX) **and** PowerShell.
- **Always use `npm.cmd`, never `npm`** — PowerShell blocks `npm.ps1`.
- Node v24 locally; hosts run Node 20/22 — fine, nothing pins it.
- Line endings: write plain `\n`. `git add` prints `LF will be replaced by CRLF` warnings — **expected, not an error**.
- `.env` is git-ignored. Required keys (all `VITE_`-prefixed, injected at build time):
  ```
  VITE_SUPABASE_URL       = https://pfnlpatvjkjykvvswouz.supabase.co
  VITE_SUPABASE_ANON_KEY  = <anon key — public by design, RLS protects data>
  VITE_APP_URL            = <the deployed origin, e.g. https://nexaura.pages.dev>
  ```
  There is **no `.env.example`** committed — consider adding one.

### Commands

```bash
npm.cmd install
npm.cmd run dev       # vite dev server, http://localhost:5173
npm.cmd run build     # -> dist/  (static SPA, deploy anywhere)
npm.cmd run preview    # serve the build locally
npx vitest run        # full test suite (npm.cmd test also works but watches)
npx eslint src        # lint
```

---

## 3. Architecture

### 3.1 Data-access layer — `src/api/`

Every Postgres table has one module (`parties.js`, `products.js`, `variants.js`, `invoices.js`,
`invoiceItems.js`, `transactions.js`, `expenses.js`, `purchases.js`, `stockLedger.js`,
`batches.js`, `leads.js`) plus `company.js`. Shared plumbing:

- **`_client.js`** — `supabase` re-export; `cid()` = `localStorage.lekhya_company_id` (throws `'No company selected'` if absent); `newId()` = `crypto.randomUUID()`; `q(table)` = `supabase.from(table)`; `rows(builder)` → `data ?? []` (throws on error); `one(builder)` → `data` (throws on error).
- Each entity module exports:
  - `fromRow(r)` — snake_case DB row → camelCase app object.
  - `toRow(d)` — camelCase → snake_case; **only keys present in `d` are sent** (`if ('name' in d)`), empty strings coerced to `null` for nullable columns, `?? 0` for NOT-NULL numerics.
  - `listX()` — `select('*')` + order, mapped through `fromRow`. **No `.eq('company_id', …)`** — RLS does the scoping (see §8.1 / spec I8).
  - `getX(id)` — `.eq('id', id).maybeSingle()`.
  - `createX(data)` — injects `{ id: newId(), company_id: cid(), ...toRow(data) }`, `.select().single()`, returns the persisted row via `fromRow`.
  - `updateX(id, patch)` — `toRow(patch)` merge, returns updated row.
  - `deleteX(id)` — hard delete.
  - Table-specific extras: `listVariantsByProduct`, `listInvoicesByParty`, `listItemsByInvoice`, `listInvoiceItems`, `deleteItemsByInvoice`, `createInvoiceItem`, `listTransactionsByParty/Invoice/Expense`, `getTransaction`, `listPurchasesByVariant`, `listBatchesByVariant`, `listActiveBatches`, `createBatch`, `updateBatch`, `createStockLedgerEntry`, `listStockLedger`, `listLedgerByVariant`.
- **`stockLedger.js` is append-only** — only `listStockLedger`, `listLedgerByVariant`, `createStockLedgerEntry`. No update/delete (RLS on `stock_ledger` is select+insert only).
- **`company.js`** — `getCompany()` / `updateCompany(patch)` (both keyed on `cid()`), `formatInvoiceNumber(prefix, year, seq)`, `nextInvoiceNumber()` (reads `invoice_seq`, formats `PREFIX-YYYY-NNNN`, increments the column), `formatNoteNumber(kind, year, seq)` (`CN-YYYY-NNNN` / `DN-YYYY-NNNN`), `nextNoteNumber(kind)` (increments `credit_note_seq` / `debit_note_seq`). `nextInvoiceNumber` / `nextNoteNumber` throw `'No company'` if `getCompany()` is null.

### 3.2 Reactivity — react-query + Realtime

- **`useTable(key, queryFn, fallback = [])`** (`src/api/useTable.js`) — wraps `useQuery` with `staleTime: 30_000`; returns `data ?? fallback`; **`if (error) throw error`** → caught by the nearest per-route `<ErrorBoundary>`. Pass a string key or an array key (`useTable([QK.parties, partyId], () => getParty(partyId), null)` for single-object reads).
- **`useEntity(name, api)`** (`src/api/useEntity.js`) — returns `{ rows, create, update, remove, invalidate }`; the mutators call the api fn then `invalidateQueries([name])`.
- **`src/api/realtime.js`** — `startRealtime(queryClient)` opens **one** channel `lekhya-rt`, subscribes `postgres_changes` for **11 tables** with `filter: company_id=eq.<cid>`, and on any event calls `queryClient.invalidateQueries({ queryKey: [<camelKey>] })`. `stopRealtime()` tears it down.
  - `TABLES` maps pg-name → camelCase key: `product_variants→variants`, `invoice_items→invoiceItems`, `stock_ledger→stockLedger`, rest identity.
  - **`QK`** = `{ ...Object.fromEntries(Object.values(TABLES).map(k=>[k,k])), company: 'company' }`. **Pages MUST key `useTable`/`useEntity` on a `QK.*` constant** so realtime invalidation lands. `QK.company` has **no** realtime subscription (the `companies` table has no `company_id` column) — `updateCompany` callers invalidate `[QK.company]` manually. `src/api/realtime.test.js` pins the exact key set — do not add/remove keys casually.
- Migration `003_realtime.sql` did `alter publication supabase_realtime add table …` + `replica identity full` on all 12 tables — **without this, realtime delivers nothing** (learned the hard way in Phase 2a).

### 3.3 Auth & session — `src/App.jsx`

- `queryClient` is a **module-level singleton**. `<QueryClientProvider>` is outermost, then `<ToastProvider>`, then `<Router>` (HashRouter), then `<AuthGate>`.
- **`AuthGate`** state machine: `loading → landing → (login | setup | reset-password) → app`.
  - `init` effect: `supabase.auth.getSession()` → if session, re-verify `company_members` row (PGRST116 = account removed → sign out + `clearSession()` + landing) → set `lekhya_company_id` → guard `if (!localStorage.getItem('lekhya_company_id')) → landing` → `setAuthState('app')` + `startRealtime(qc)`.
  - `onLogin` (from `<Login>`): `qc.clear()` → set user → `app` → `startRealtime(qc)`.
  - `onLogout`: `stopRealtime()` → `supabase.auth.signOut()` → `clearSession()` → landing.
  - **`clearSession()`** removes `lekhya_company_id` + `lekhya_subscription` **and calls `queryClient.clear()`** (prevents a second user on a shared machine seeing the previous tenant's cached rows — added in the final review fix wave).
- `<SubscriptionGate>` wraps `<AppLayout>` — enforces trial/licence (see §4).
- **`AppLayout`** — sidebar (`NAV_ITEMS`) + topbar (page title, theme toggle, avatar, sign-out) + `<Routes>` with a per-route `<ErrorBoundary label=…>` around each page.
  - **Mobile nav (added this session):** `navOpen` state; on ≤768px the sidebar is a `position:fixed` slide-in drawer (`.sidebar--open`), toggled by a hamburger button (`.topbar-menu-btn`, CSS-hidden on desktop), closed by tapping a nav item or the `.sidebar-backdrop`. All the responsive CSS lives in `src/index.css` (`.sidebar`, `.sidebar-backdrop`, `.topbar-menu-btn`, `@media (max-width: 768px)`).

### 3.4 Routing

HashRouter — routes are `#/billing`, `#/ledger/:partyId`, etc. **This means any static host works with zero rewrite/redirect config.** Routes: `/` Dashboard, `/crm`, `/billing`, `/payments`, `/expenses`, `/purchases`, `/inventory`, `/reports`, `/settings`, `/ledger/:partyId`.

### 3.5 Local storage keys (all still in use)

| Key | Purpose |
|---|---|
| `lekhya_company_id` | current tenant — read by `cid()`, realtime filter, auth guard |
| `lekhya_subscription` | trial/licence cache (JSON) — `src/lib/subscription.js` |
| `lekhya_theme` | `'light'` / `'dark'` — `src/lib/theme.js`, also read pre-paint in `index.html` |
| `lekhya_theme_invoice` | invoice PDF template pref (`'classic'` default) |
| `lekhya_owner_phone` | Reports → WhatsApp summary recipient |

**Do not rename these** — renaming logs out / de-themes every existing user. The `lekhya_` prefix is legacy branding; leave it.
`src/main.jsx` has a one-time cleanup block that deletes the dead Dexie DB (`crm-gst-billing-db`), unregisters old service workers, clears Cache Storage, and removes dead keys (`lekhya_session`, `bizcrm_session`, `lekhya_last_sync`, `lekhya_device_id`). It is idempotent — leave it in for a few months, then it can go.

---

## 4. Subscription / licensing — `src/lib/subscription.js` + `src/components/SubscriptionGate.jsx`

- Trial = 14 days, seeded in `localStorage.lekhya_subscription` on first `SubscriptionGate` mount (`ensureTrialStarted`).
- `evaluateAccess(sub)` → `'trial' | 'active' | 'grace' | 'expired'` (7-day grace after expiry).
- Licence keys validated **server-side** via Supabase RPCs `activate_license(p_license_key, p_company_id)` / `get_license_status(p_license_key)` — these predate the migration and are untouched.
- `SubscriptionGate` blocks the app UI when access is `expired`; shows the trial banner otherwise.
- The screenshot in the handover request shows "Free trial — 14 days remaining. Activate a license key to continue." — that banner is expected behaviour.

---

## 5. Data model (Supabase)

### Tables (all with `id uuid pk default gen_random_uuid()`, `company_id uuid not null references companies(id) on delete cascade`, RLS enabled)

`parties`, `products`, `product_variants`, `invoices`, `invoice_items`, `transactions`,
`expenses`, `purchases`, `stock_ledger`, `batches`, `leads`.

Plus **`companies`** (absorbs the old `settings` — name, gstin, address, phone, email, `upi_id`,
`logo_url`, `bank_name/account/ifsc`, `invoice_prefix` default `'INV'`, `invoice_seq` int,
`default_terms`, `credit_note_seq`, `debit_note_seq`, `owner_id`), and pre-existing
`company_members` (`user_id`, `company_id`, `role`), `subscriptions`, `payments`.

Key constraints/behaviours:
- `unique (company_id, invoice_number)` on `invoices` — the backstop for the numbering race.
- `transactions.invoice_id` → `invoices(id)` **`on delete set null`** (NOT cascade) — that's why invoice-delete / rollback code must explicitly delete linked transactions.
- `invoice_items.invoice_id` → `on delete cascade`.
- **`invoices` has NO `lineItems` column** — line items always live in `invoice_items` (write via `createInvoiceItem`, read via `listItemsByInvoice(invoiceId)` / `listInvoiceItems()`). Any code reading `inv.lineItems` off a DB invoice row is a bug (this bit Reports.jsx during the migration).
- `parties.activities` is `jsonb` — freeform note log, never queried.

### Migrations — `supabase/migrations/` (all applied to `lekhya-production`)

| File | Contents |
|---|---|
| `001_schema.sql` | `TRUNCATE` the 11 placeholder business tables + companies/company_members/subscriptions; recreate 11 tables typed with uuid PKs + `company_id`; add the `companies` settings columns; `unique (company_id, invoice_number)` |
| `002_rls.sql` | per-tenant RLS on all 11: `company_id in (select company_id from company_members where user_id = auth.uid() and active)`. `stock_ledger` = select + insert only |
| `003_realtime.sql` | `alter publication supabase_realtime add table` + `replica identity full` on all 12 tables (without this realtime is inert) |
| `004_columns.sql` | `transactions.expense_id`, `invoices.ref_invoice_number`, `companies.default_terms` / `credit_note_seq` / `debit_note_seq` (all `add column if not exists`) |

RLS status verified 2026-09-07 via MCP `list_tables` / `get_advisors` — no gaps on business tables.
The `companies` policy is **`owner_access`: `FOR ALL USING (owner_id = auth.uid())`** — **owner-only**
(see §8.2). `company_members`: `member_access` `USING (user_id = auth.uid())`. Policies also use a
pre-existing `my_company_ids()` `SECURITY DEFINER` helper.

### The id-coercion rule (project-wide, still enforced)

**Never** wrap a record `id` or FK in `Number()`, `String()`, `parseInt()`, or `.toString()` —
uuids break. This includes JSX. Keep numeric coercions on genuine numeric fields (qty, price, rate,
`packSize`, `gstRate`, discount, amount, dates). When touching a page, grep the whole file for
`Number(`, `parseInt(`, `.toString()` and check each.

---

## 6. Feature map (pages)

| Route / file | What it does | Notable |
|---|---|---|
| `pages/Dashboard.jsx` | KPI tiles (net sales, purchases, gross profit, receivables/payables), top debtors/creditors, period filter | 5 `useTable` reads |
| `pages/CRM.jsx` | Customers & vendors list/CRUD, lead kanban | `useEntity(QK.parties, …)`; api `deleteParty` imported as `apiDeleteParty` (local handler name clash) |
| `pages/Billing.jsx` | **The big one (~2400 lines).** Create sales/purchase invoices, POS mode, **Preview & Print modal** (preview → Save & Print persists then prints), credit/debit notes, draft invoices, status changes, invoice delete, WhatsApp/PDF reprint | `handleSaveInvoice` = sequential multi-write with `applied[]` compensating rollback + `23505` retry ≤3×. FEFO batch deduction inline. Note numbers via `nextNoteNumber`. **Modals close only on the success path.** |
| `pages/Payments.jsx` | Record/delete payments (Payment In/Out), recompute invoice status client-side from `listTransactionsByInvoice` sum vs total | |
| `pages/Expenses.jsx` | Expense CRUD + optional linked `transaction` (via `transactions.expense_id` / `listTransactionsByExpense`) | `deleteExpense` aliased |
| `pages/Purchases.jsx` | Purchase orders: multi-write PO save with `applied[]` rollback (invoice / stock / txn tracked), batch upsert, receive, status, delete/reverse | line items → `invoice_items`; batch `receivedQty` (dropped write-only `costPerPack`/`purchaseRef`/`purchaseDate`) |
| `pages/Inventory.jsx` | Product + variant CRUD, opening stock, stock-in/out, packaging; consumes `stockService` | 4 old `db.transaction` blocks flattened to sequential awaits; `deleteProduct`/`deleteVariant` aliased |
| `pages/Ledger.jsx` | Per-party account ledger (`/ledger/:partyId`), running balance, PDF | `useTable([QK.parties, partyId], () => getParty(partyId), null)` |
| `pages/Reports.jsx` | Overview, GST report, aging, sales, P&L, daybook, inventory tabs; **GSTR-1 / GSTR-3B JSON export**; WhatsApp business summary | Reads `invoice_items` via `useTable(QK.invoiceItems, listInvoiceItems)`, groups by `invoiceId`, attaches as `lineItems` to invoices in a `useMemo` — **all report math depends on this** |
| `pages/Settings.jsx` | Company profile + bank + invoice prefix/terms via `getCompany`/`updateCompany`; password change via `supabase.auth.updateUser({password})`; Excel / Tally XML / CSV export (all live). **JSON backup/restore + Google Drive were deleted** in the migration | |
| `pages/Landing.jsx` | Sign In / Sign Up choice screen. `<h1>NEXAURA</h1>` + tagline "Business, connected." |
| `pages/Login.jsx` | Email/password sign-in (Supabase Auth only — local fallback removed). Also exports `PasswordReset`. `onBack` → Landing. Forgot-credentials flow | |
| `pages/SetupWizard.jsx` | 2-step sign-up: Business Info → Admin Account. Creates Supabase user + `companies` row (`owner_id`) + `company_members` (role `owner`). **"← Back to sign in" footer link → Landing (added this session).** `onBack` prop from App.jsx | |

### Services / utils

- `services/stockService.js` — `adjustStock({ variantId, productId, packsDelta, type, reference, note, unitCost, batchNo })` and `packageStock({ productId, packagingItems, reference, note })`. Packed / bulk / hybrid stock modes, weighted-average-cost recompute, sibling-variant WAC propagation (`costPerBase * sibPackSz`), `newBase < 0` throws. **Signatures frozen.** Ported from Dexie to `src/api/*` calls only — logic byte-for-byte unchanged. Characterization tests in `stockService.test.js` (7 cases, Map-backed api mocks).
- `utils/unitConversion.js` — `convertUnit(value, from, to)` (mass/volume/count dimensions, throws cross-dimension or unknown-unit), `canConvert`, `UNIT_OPTIONS`. Tested.
- `utils/validators.js` — GSTIN / PAN / phone / IFSC / email / positive-number validators (each returns `{ valid, message }`, empty = valid), `sanitizeNumericInput`, `parseNumericInput`, `isDummyPhone`, `normalizePhone`, `normalizeGSTIN`, `collectErrors`. Tested.
- `lib/theme.js` — `resolveTheme()` / `setTheme(t)` on `localStorage.lekhya_theme` + `document.documentElement.dataset.theme`.

---

## 7. Deployment (free static hosting)

The backend (Supabase) is already hosted free. "Hosting the app" = deploying the static `dist/`.
Because of HashRouter, **no rewrite rules are needed anywhere**.

### Steps (Cloudflare Pages — also works identically on Vercel / Netlify)

1. Push to GitHub (`master` is already up).
2. New Pages project → connect `NEXAURA-1.0`, branch `master`.
3. Build command `npm run build`, output dir `dist`.
4. Env vars in the host dashboard: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_APP_URL`.
   `VITE_APP_URL` chicken-and-egg: deploy once, copy the real URL, set the var, redeploy — or attach a custom domain first.
5. **Supabase dashboard → Authentication → URL Configuration:** set **Site URL** to the deployed origin and add `<origin>/**` to **Redirect URLs**, or password-reset / confirmation emails break.

`commit 7883cd8 "Trigger production deployment"` implies this is already set up — verify which host and that the env vars are present.

---

## 8. Known issues / deferred work

Ordered roughly by importance. None block usage today.

### 8.1 `listX` has no `company_id` filter (spec I8) — ACCEPTED
`listParties` / `listInvoices` / etc. `select('*')` with no `.eq('company_id', cid())`. RLS enforces
tenant isolation regardless; with one company per user the filter is a redundant planner hint.
Decision: leave as-is. Documented in spec §2.3 + §9.1.

### 8.2 `companies` RLS is owner-only (spec I7) — fine today, blocks multi-user
Policy `owner_access` = `owner_id = auth.uid()`. Every user is currently the owner of exactly one
company (no invite UI). **If a multi-user / "invite a teammate" feature is ever built**, a second
`company_members` row would be hard-locked out: `Login.jsx`'s company-existence check returns null
and signs them out, and `nextInvoiceNumber()` throws `'No company'`. Widening the policy to
membership-scoped is part of that future feature, not a standalone fix.

### 8.3 `23505` invoice-number retry only in `Billing.jsx` (spec I9)
The 3-attempt retry on a duplicate `invoice_number` lives in `Billing.jsx handleSaveInvoice`, not in
`createInvoice`. So `Purchases.jsx` PO save and the credit/debit-note path have **no retry backstop** —
a concurrent `invoice_seq` collision there fails the save (clean compensating rollback, no corruption).
Cannot happen under the current single-owner-per-company model. **Follow-up:** move the retry loop
into `createInvoice` (`src/api/invoices.js`) and delete it from `Billing.jsx` when multi-user lands.

### 8.4 Partial rollback of append-only writes (spec §4.4) — ACCEPTED
`Billing.jsx handleSaveInvoice`'s `applied[]` rollback reverses stock, deletes `invoice_items`,
deletes the invoice, and deletes auto-payment transactions — but does **not** reverse `createPurchase`
rows or FEFO `updateBatch` decrements applied earlier in the same call. Narrow failure window;
`stock_ledger` is the reconciliation audit trail. Concurrent stock edits are last-write-wins on
`stock_qty`. Upgrade path: an `adjust_stock` Postgres RPC with a row lock.

### 8.5 Logo / favicon oversized
`src/assets/Nexaura logo.png` is **1254×1254 / 855 KB** and ships **twice** in the build (once as the
in-app `import`, once as `public/favicon.png`) for something rendered at ≤68 px. Replace **both**
files with an optimised ≤512 px PNG (~20–40 KB) — **same filenames, no code change**. No image
tooling (`sharp` etc.) is installed in the dev environment, so this needs doing manually or with a
one-off script.

### 8.6 Lint debt — 15 errors / 8 warnings (do not let it grow)
All pre-existing, none a real bug. Mix of: `react-hooks` v7 newly-flagged patterns
(`set-state-in-effect`, purity/immutability hints), a handful of unused imports/vars in files the
migration didn't need to touch, and unused test-helper imports. `npx eslint src | tail -1` before and
after your change; the error count must not increase.

### 8.7 Cosmetic / minor (safe to ignore or batch-fix)
- `Settings.jsx` Excel-backup builds a `lineItemsCount` column that is always 0 (invoice rows carry no line items).
- `Payments.jsx` catch shows a generic toast, discarding `err.message`.
- Password-change toast uses severity `'warning'` where a brief said `'error'`.
- Inert always-true guards left after the `useTable` `[]`-fallback migration (e.g. `if (allInvoices && allTransactions)` in `Ledger.jsx`).
- `Purchases.jsx` invoice-delete removes only `autoRecorded` transactions; `Billing.jsx` removes all linked — inconsistent (Billing matches spec §4.2).
- `nextInvoiceNumber()` increments before the insert, so a rollback or `23505` retry burns a number → gaps in the GST invoice sequence. Inherent to the design; note for GST-compliance conversations.
- Pre-existing Supabase security-advisor WARN/INFO unrelated to app code: `subscriptions` RLS-enabled-no-policy; 3× `SECURITY DEFINER` fns callable by `authenticated` (`activate_license`, `get_license_status`, `my_company_ids`); Auth "leaked password protection disabled" (a project setting — worth turning on).

### 8.8 Not verified in a real browser
The mobile-nav drawer + favicon + signup back-link (session of 2026-09-07) passed build/lint/tests
and the logic was traced, but were **not** driven through a logged-in mobile browser. Worth a manual
pass on a phone: hamburger opens drawer, nav item / backdrop closes it, tables scroll horizontally,
modals are usable.

---

## 9. History — how we got here

The migration is fully documented under **`docs/superpowers/`**:
- **Spec:** `specs/2026-09-02-supabase-rewrite-design.md` — 10 sections. §2 schema/IDs, §3 data layer + reactivity, §4 client-side best-effort atomicity (deliberately no RPCs), §4.4 accepted limitations, §9 risks, **§9.1 post-implementation resolutions (I7/I8/I9)**.
- **Plans:** `plans/2026-09-02-supabase-rewrite-phase-{1-backend, 2a-foundation, 2b-pages, 3-teardown}.md`.

| Phase | What | Status |
|---|---|---|
| 1 — backend | `001_schema` + `002_rls`, applied to `lekhya-production` | ✅ merged |
| 2a — foundation | `src/api/*` (11 entity modules + `company.js` + `useTable`/`useEntity` + `realtime.js` + `_client.js`), `App.jsx` react-query + Realtime + Supabase-only auth, `subscription.js` off Dexie. Final review caught + fixed a Critical: realtime publication was empty → `003_realtime.sql` | ✅ merged |
| 2b — pages | All 10 pages + `stockService.js` ported off Dexie; `004_columns.sql`. Final review caught + fixed C1 (Reports read `inv.lineItems` off DB rows) + I1 (Billing auto-payment not tracked in rollback) | ✅ merged |
| 3 — teardown | Deleted `src/db/db.js` + `src/lib/syncEngine.js`; removed `dexie`/`dexie-react-hooks`/`vite-plugin-pwa` + the service worker; removed the offline badge + Sync button + auto-sync poll from `App.jsx`; `main.jsx` legacy-cleanup block; Settings stale-copy pass; README rewrite; deleted `smoke-test.mjs`; unit tests for `unitConversion` + `validators`; recorded I7/I8/I9. Final whole-branch review (opus) → fix-then-ship: fixed I1 (`queryClient.clear()` on logout), trimmed dead Google hosts from the CSP, removed an empty `<div>`, uninstalled orphaned `playwright` | ✅ merged to `master` (`db7b38a`), pushed |

The migration branch (`remove-offline-supabase-rewrite`) was fast-forward merged into `master` and
deleted locally. `origin/remove-offline-supabase-rewrite` is stale on GitHub.

### Post-migration commits on `master`
- `06759f9 Rebrand` — "Lekhya One" → **NEXAURA**, tagline **"Business, connected."** across all
  user-facing strings (titles, headings, PDF footers, report metadata, licence copy, README).
  `lekhya_*` localStorage keys, the npm package name `lekhya-web`, and the Supabase project name
  `lekhya-production` were **deliberately left** (functional identifiers, not branding).
- `7883cd8 Trigger production deployment` — empty/deploy-trigger commit.
- `78f8b16 Mobile version menu fix` — the mobile hamburger drawer + responsive `index.css` +
  favicon → NEXAURA logo + "Back to sign in" link on the signup wizard. (This session's work,
  committed by the repo owner.)

---

## 10. Conventions cheat-sheet (read before editing)

- **`npm.cmd`** not `npm`. Git Bash for POSIX one-liners.
- Commit only when asked. `master` is the trunk; the repo owner commits directly to it (recent
  history shows this). Attribution trailer on commits: `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.
- **id-coercion rule** — §5. No `Number()`/`String()`/`parseInt()`/`.toString()` on ids/FKs, JSX included.
- **`QK.*` keys** — every `useTable`/`useEntity` call keys on one; `src/api/realtime.test.js` pins the set.
- **`fromRow`/`toRow`** — every entity module. Snake↔camel. `toRow` sends only present keys.
- **`createX` returns the persisted row** (incl. `id`) — rely on it for immediate follow-up writes.
- **Multi-table writes** = `const applied = []; try { …writes, applied.push([kind, ref])… } catch { for (const [kind, ref] of applied.reverse()) { try { …undo… } catch {} } toast('… rolled back'); return; }`. Stock undo = `adjustStock({ …negated…, type: 'void' })`. Invoice undo = `deleteItemsByInvoice(id)` + `deleteInvoice(id)` (skip the invoice delete when it's a pre-existing draft). Transaction undo = `deleteTransaction(id)`.
- **Modals close ONLY on the success path** — never move `setXModal(null)` outside the `try`.
- **`invoices` has no `lineItems` column** — line items are `invoice_items` rows.
- Errors thrown in a `queryFn` propagate through `useTable` to the route's `<ErrorBoundary>` — that's intentional; don't swallow them.
- Tests: Vitest, `import { describe, it, expect } from 'vitest'`, jsdom env. No new deps for tests.
- CSP is in `index.html` (`connect-src` allows `*.supabase.co`, `wss://*.supabase.co`, `api.whatsapp.com`). If you add an external call, update it.

---

## 11. Suggested next tasks (no particular order)

1. **Manual mobile QA pass** (§8.8) — verify the drawer + responsiveness on a real phone; iterate on `src/index.css` / `AppLayout` if needed.
2. **Optimise the logo/favicon** (§8.5) — drop in a small PNG at the two existing paths.
3. **Add `.env.example`** with the three `VITE_` keys (documented, no secrets).
4. **Confirm the deploy host + env vars** and the Supabase Auth URL config (§7).
5. **Delete the stale `origin/remove-offline-supabase-rewrite`** branch on GitHub; repoint `origin/HEAD` to `master`.
6. **Turn on Supabase Auth "leaked password protection"** (§8.7) — one toggle in the dashboard.
7. Lint debt cleanup pass (§8.6) — safe, incremental, keep the count going down.
8. When/if multi-user is on the roadmap: I7 (widen `companies` RLS) + I9 (move `23505` retry into `createInvoice`) together (§8.2, §8.3).

---

## 12. Fast file map

```
index.html                     CSP, pre-paint theme script, favicon (/favicon.png)
src/main.jsx                    entry + one-time legacy-storage cleanup block
src/App.jsx                     QueryClient, AuthGate state machine, AppLayout (sidebar/topbar/routes), mobile drawer
src/index.css                   ALL layout + responsive CSS (design tokens, .sidebar drawer, @media 768px, modals, tables)
src/lib/
  supabase.js                   createClient (persistSession, localStorage)
  theme.js                      light/dark
  subscription.js               trial/licence (localStorage + RPC)
src/api/
  _client.js                    cid(), newId(), q(), rows(), one()
  realtime.js                   TABLES, QK, startRealtime/stopRealtime
  useTable.js  useEntity.js     react-query wrappers
  company.js                    getCompany/updateCompany, nextInvoiceNumber, nextNoteNumber
  <table>.js  (×11)             fromRow/toRow + listX/getX/createX/updateX/deleteX + extras
  *.test.js                     mapping, realtime key set, useTable, _client, company
src/services/
  stockService.js               adjustStock / packageStock  (+ .test.js characterization)
src/utils/
  unitConversion.js  validators.js   (+ .test.js each)
src/components/
  ErrorBoundary.jsx  Modal.jsx  Toast.jsx  SubscriptionGate.jsx
src/pages/                      Dashboard CRM Billing Payments Expenses Purchases Inventory Ledger Reports Settings Landing Login SetupWizard
supabase/migrations/            001_schema 002_rls 003_realtime 004_columns  (all applied)
docs/superpowers/
  specs/2026-09-02-supabase-rewrite-design.md      the design authority
  plans/2026-09-02-supabase-rewrite-phase-*.md     the 4 execution plans
HANDOVER.md                     this file
```
