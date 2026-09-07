# Supabase Rewrite — Phase 3: Offline Teardown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delete the now-dead offline layer (Dexie, the sync engine, the PWA/service-worker, the online/offline UI) and the stale docs/copy that described it, leaving a clean Supabase-only web app.

**Architecture:** Phases 1–2 already moved every page, `stockService`, `subscription`, and auth onto `src/api/*` (Supabase + `@tanstack/react-query` + Realtime). Nothing in `src/` imports `src/db/db.js` or `src/lib/syncEngine.js` except `src/App.jsx` (for the manual Sync button and 60-second auto-sync poll, both redundant now that Realtime invalidates queries live). This phase removes those last references, the two files, their npm dependencies, the PWA plugin, and adds a one-time client-side cleanup that purges the legacy IndexedDB / service worker / dead `localStorage` keys from returning users' browsers.

**Tech Stack:** React 19, Vite 8, `@supabase/supabase-js` 2, `@tanstack/react-query` 5, Vitest 4. Removing: `dexie`, `dexie-react-hooks`, `vite-plugin-pwa`.

**Spec:** `docs/superpowers/specs/2026-09-02-supabase-rewrite-design.md` (§5 "Auth & session", §6 "Sync UI removal", §9 "Teardown checklist", and the deferred items I7/I8).

## Global Constraints

- **Package manager:** PowerShell blocks `npm.ps1` — always invoke `npm.cmd` (not `npm`). Git Bash is available for POSIX one-liners.
- **Line endings:** write plain `\n`. Git prints `LF will be replaced by CRLF` warnings on `add` — that is expected, not an error.
- **Branch:** `remove-offline-supabase-rewrite`. Do not merge or push. Commit after every task.
- **No new dependencies.**
- **id coercion rule (still in force):** never wrap a record id / FK in `Number()`, `String()`, `parseInt()`, or `.toString()`. Keep coercions on genuine numeric fields (qty, price, amount, rate, packSize, dates).
- **Baseline to preserve:** `npm.cmd run build` green; `npx vitest run` = 31/31 passing; ESLint no *new* errors (pre-existing count is 24).
- **Do not touch** `src/api/*`, `src/pages/*` (except the one stale-copy edit in Task 5), `supabase/migrations/*`, or the theme toggle. This phase is deletion + docs only.

---

### Task 1: Remove the sync UI and auto-sync poll from `src/App.jsx`

**Files:**
- Modify: `src/App.jsx`

**Interfaces:**
- Consumes: `startRealtime` / `stopRealtime` from `src/api/realtime.js` (already imported and wired — leave every one of those call sites exactly as-is).
- Produces: an `App.jsx` with no import of `./lib/syncEngine`, no `useOnlineStatus`, no online/offline badge, no Sync button. `startRealtime(qc)` / `stopRealtime()` remain the only reactivity mechanism.

Context: Realtime (added in Phase 2a) already calls `queryClient.invalidateQueries` on every `postgres_changes` event, so the 60 s `sync()` poll and the manual button are pure redundancy. The offline badge is meaningless for a Supabase-only app — every read/write already needs the network.

- [ ] **Step 1: Delete the `syncEngine` import**

Remove line: `import { startAutoSync, stopAutoSync, sync } from './lib/syncEngine';`

- [ ] **Step 2: Delete the `useOnlineStatus` hook**

Remove the whole function (currently lines ~35–45):

```js
function useOnlineStatus() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); };
  }, []);
  return online;
}
```

- [ ] **Step 3: Strip the sync state + handler from `AppLayout`**

In `function AppLayout({ user, onLogout })`, delete these three lines:

```js
  const [syncing, setSyncing] = useState(false);
  const online = useOnlineStatus();
  const toast = useToast();
```

and delete the whole `handleSync` function:

```js
  const handleSync = async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      await sync();
      toast('Data synced', 'success');
    } catch {
      toast('Sync failed — check your connection', 'error');
    } finally {
      setSyncing(false);
    }
  };
```

`toast` / `useToast` are used nowhere else in `App.jsx` after this — in the import on line ~6 change `import { ToastProvider, useToast } from './components/Toast';` to `import { ToastProvider } from './components/Toast';`. (`ToastProvider` is still rendered at the bottom of `App()` — keep it.)

- [ ] **Step 4: Remove the online badge and the Sync button from the topbar**

In the `<header className="topbar">` block, delete the entire online-status `<span>` (the one with `title={online ? 'Connected to internet' : ...}`, ~11 lines) **and** the entire Sync `<button>` (the one with `onClick={handleSync}` / `<RefreshCw .../>`, ~9 lines). Keep the theme toggle button (`onClick={toggleTheme}`, `<Sun/>` / `<Moon/>`) and everything after it (avatar, username, sign-out button) untouched.

- [ ] **Step 5: Drop the now-unused `RefreshCw` icon import**

Line ~2: `import { LayoutDashboard, Users, FileText, Package, Settings, LogOut, IndianRupee, Receipt, BarChart2, ShoppingCart, RefreshCw, Sun, Moon } from 'lucide-react';` → remove `RefreshCw,`. (`Sun` and `Moon` stay — the theme toggle uses them.)

- [ ] **Step 6: Remove the three auto-sync call sites**

There are two `startAutoSync();` calls (one in the `init` effect's session branch, one in `<Login onLogin={...}>`) and one `stopAutoSync();` call (in `onLogout`). Delete all three lines. The adjacent `startRealtime(qc);` / `stopRealtime();` lines stay.

- [ ] **Step 7: Build + lint + test**

```
npm.cmd run build
npx eslint src/App.jsx
npx vitest run
```

Expected: build green; ESLint reports no *new* errors for `App.jsx` (there were none before — so zero); 31/31 tests pass. If ESLint flags `useEffect` or `useState` as unused, confirm — they are still used by `AuthGate` / `useTheme`, so they should not be. If genuinely unused after your edits, remove them from the `react` import.

- [ ] **Step 8: Grep gate**

```
grep -n "syncEngine\|useOnlineStatus\|startAutoSync\|stopAutoSync\|handleSync\|online" src/App.jsx
```

Expected: no matches (the word "online" only appeared in the badge).

- [ ] **Step 9: Commit**

```bash
git add src/App.jsx
git commit -m "App: remove offline badge, manual Sync button, and 60s auto-sync poll (Realtime covers reactivity)"
```

---

### Task 2: Delete `src/db/db.js` and `src/lib/syncEngine.js`

**Files:**
- Delete: `src/db/db.js`
- Delete: `src/lib/syncEngine.js`

**Interfaces:**
- Consumes: nothing.
- Produces: no `dexie` import anywhere in `src/`.

- [ ] **Step 1: Confirm nothing imports either file**

```
grep -rn "db/db\|syncEngine\|from 'dexie'\|from \"dexie\"\|useLiveQuery\|dexie-react-hooks" src
```

Expected: matches **only** inside `src/db/db.js` and `src/lib/syncEngine.js` themselves. If any other file matches, STOP — a Phase 2 task was incomplete; report it and do not delete.

- [ ] **Step 2: Delete the files**

```bash
git rm src/db/db.js src/lib/syncEngine.js
```

- [ ] **Step 3: Build + test**

```
npm.cmd run build
npx vitest run
```

Expected: build green (Vite will error loudly on a dangling import if Step 1 missed something); 31/31 pass.

- [ ] **Step 4: Commit**

```bash
git commit -m "Delete Dexie database and sync engine — fully replaced by src/api + Realtime"
```

---

### Task 3: Remove `dexie`, `dexie-react-hooks`, `vite-plugin-pwa`; drop the PWA plugin

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json` (regenerated by npm)
- Modify: `vite.config.js`

**Interfaces:**
- Consumes: nothing.
- Produces: a build with no service worker (`dist/sw.js` no longer generated).

- [ ] **Step 1: Remove the `VitePWA` plugin from `vite.config.js`**

Delete the import line `import { VitePWA } from 'vite-plugin-pwa'` and the entire `VitePWA({ ... })` entry from the `plugins` array. The file should reduce to:

```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: '/',
  plugins: [react()],
})
```

- [ ] **Step 2: Uninstall the three packages**

```
npm.cmd uninstall dexie dexie-react-hooks vite-plugin-pwa
```

This edits `package.json` and `package-lock.json`. Confirm all three are gone from `dependencies` in `package.json`.

- [ ] **Step 3: Build + test**

```
npm.cmd run build
npx vitest run
```

Expected: build green; the build log no longer prints the `PWA v1.3.0 / mode generateSW / dist/sw.js` block; 31/31 pass.

- [ ] **Step 4: Check for orphaned PWA assets**

```
grep -rn "registerSW\|virtual:pwa\|workbox\|serviceWorker" src index.html
```

Expected: no matches in `src/` or `index.html` (the one intentional `serviceWorker` reference is added in Task 4's `main.jsx` cleanup — that task runs after this one, so zero matches here is correct). If `index.html` has a `<link rel="manifest">` or PWA `<meta>` tags left by the plugin, they are harmless but delete them for tidiness and note it in the commit.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json vite.config.js index.html
git commit -m "Remove dexie, dexie-react-hooks, vite-plugin-pwa; drop service worker"
```

---

### Task 4: One-time legacy cleanup in `src/main.jsx`

**Files:**
- Modify: `src/main.jsx`

**Interfaces:**
- Consumes: nothing.
- Produces: on every app load, a best-effort purge of the old IndexedDB, any registered service worker, the Cache Storage it populated, and dead `localStorage` keys. Idempotent — safe to run forever; does nothing on a fresh browser.

Context: returning users have `crm-gst-billing-db` (the Dexie DB name — see the deleted `db.js` line `new Dexie('crm-gst-billing-db')`), a `vite-plugin-pwa` service worker, and stale keys `lekhya_session` / `bizcrm_session` / `lekhya_last_sync` / `lekhya_device_id` in their browser. None of it is read any more, but the service worker in particular will keep serving a stale cached bundle until unregistered.

- [ ] **Step 1: Add the cleanup block**

Insert immediately after the imports in `src/main.jsx`, before the `ReactDOM.createRoot(...)` call:

```js
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
```

`ponytail:` not gated behind a "ran once" flag — `deleteDatabase` / `unregister` / `removeItem` are already cheap and idempotent; a flag would be more code than it saves. Add one only if it ever shows up in a profile.

- [ ] **Step 2: Sanity-check the key list**

```
grep -rn "lekhya_session\|bizcrm_session\|lekhya_last_sync\|lekhya_device_id" src
```

Expected: matches **only** in `src/main.jsx` (the cleanup you just wrote). Anything else means a key is still live — STOP and report. Note: `lekhya_company_id` and `lekhya_subscription` are still in use — they are correctly **not** in the removal list.

- [ ] **Step 3: Build + test**

```
npm.cmd run build
npx vitest run
```

Expected: build green; 31/31 pass.

- [ ] **Step 4: Commit**

```bash
git add src/main.jsx
git commit -m "main: one-time purge of legacy IndexedDB, service worker, and dead localStorage keys"
```

---

### Task 5: Remove stale "offline / backup" copy from `src/pages/Settings.jsx`

**Files:**
- Modify: `src/pages/Settings.jsx`

**Interfaces:** none — this is copy only, no logic change.

Context: Phase 2b Task 8 deleted the JSON backup/restore + Google Drive + danger-zone *code* but left two orphaned prose blocks flagged by the Phase 2b Task 8 review: an "Export Full Backup" instruction paragraph and one or more tiles claiming "Offline First" / "nothing is sent to a server". Both are now false.

- [ ] **Step 1: Find the stale copy**

```
grep -n "Offline First\|Offline-first\|nothing is sent\|never leaves\|Export Full Backup\|full backup\|backup" src/pages/Settings.jsx
```

- [ ] **Step 2: Edit**

For each match: if it is a heading/paragraph/tile that only describes offline storage or a JSON "full backup" that no longer exists, delete that element. If a surrounding "Data" or "Export" card still has a *working* control (the Excel / Tally export buttons kept in Task 8), keep the card and only remove the false sentence. Do not remove any button that still calls a `listX()` / export handler.

- [ ] **Step 3: Build + lint + test**

```
npm.cmd run build
npx eslint src/pages/Settings.jsx
npx vitest run
```

Expected: build green; no new ESLint errors; 31/31 pass.

- [ ] **Step 4: Commit**

```bash
git add src/pages/Settings.jsx
git commit -m "Settings: drop stale offline-first / full-backup copy"
```

---

### Task 6: Rewrite `README.md` for the web app

**Files:**
- Modify: `README.md`

**Interfaces:** none.

Context: the README still opens "Offline-First Desktop ERP … Windows desktop application … built on Electron + React 19 + Vite with Dexie (IndexedDB) for local storage and Supabase for optional cloud sync." Electron was dropped when the app moved to web; Dexie is gone as of this phase.

- [ ] **Step 1: Read the current README**

`cat README.md` — keep the sections that are still accurate (feature list, GST/compliance notes, licence). Only the framing, tech-stack table, and any "install the desktop app" / "data stays on your machine" / "offline" instructions need to change.

- [ ] **Step 2: Rewrite**

- Title/subtitle: a **web** GST billing & business-management app for Indian businesses. No "desktop", no "offline-first".
- Tech-stack table: React 19 + Vite 8 (frontend); Supabase / Postgres 17 (database, auth, realtime — single source of truth); `@tanstack/react-query` 5 (server-state cache); jsPDF + jspdf-autotable (PDF); SheetJS `xlsx` (Excel export); `qrcode`; `lucide-react`; `react-router-dom` 7 (HashRouter). Remove the "Desktop shell / Electron" and "Local database / Dexie" rows.
- Getting started: `npm.cmd install`, `.env` needs `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` (the anon key is public by design), `npm.cmd run dev`, `npm.cmd run build` → static SPA in `dist/` deployable to any static host.
- Data model: business tables live in Supabase with per-tenant RLS keyed on `company_members`; `supabase/migrations/` holds the schema (001 schema, 002 RLS, 003 realtime, 004 columns).
- Delete any "backup your data" / "your data never leaves this device" section.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "README: rewrite for the Supabase web app (was Electron + Dexie offline-first)"
```

---

### Task 7: Delete `smoke-test.mjs`; sweep unused-variable lint errors

**Files:**
- Delete: `smoke-test.mjs`
- Modify: `src/pages/Reports.jsx`, `src/pages/Billing.jsx`, `src/pages/Settings.jsx` (only the specific unused bindings listed below)

**Interfaces:** none — dead-code removal only.

Context: `smoke-test.mjs` (last touched Sep 2, pre-migration) drives the old Dexie/Electron flow and is stale — the summary and Phase 2 notes both mark it for deletion. Separately, the Phase 2b reviews logged a handful of `no-unused-vars` errors that are pure leftovers from the migration.

- [ ] **Step 1: Delete the smoke test**

```
grep -rn "smoke-test" package.json .github 2>/dev/null
```

If `package.json` has a script referencing it, remove that script line too. Then:

```bash
git rm smoke-test.mjs
```

- [ ] **Step 2: Get the current lint baseline**

```
npx eslint src --format compact 2>&1 | grep -c "Error"
```

Note the number (expected ~24).

- [ ] **Step 3: Remove the specific dead bindings**

Only these, each confirmed unused by the Phase 2b reviews — verify each is genuinely unreferenced in its file before deleting (`grep -n "<name>" src/pages/<file>`):

- `src/pages/Reports.jsx`: `YEAR_OPTIONS` (module const, ~line 87), `filterYear` + `setFilterYear` (the `useState` on ~line 108), `itcTaxable` (~line 659). If `filterYear` turns out to be referenced in JSX, leave that pair alone and note it.
- `src/pages/Billing.jsx`: the unused `party` binding flagged at ~line 2424 (`'party' is assigned a value but never used`). Confirm the destructure/assignment is dead, then remove just that binding.
- `src/pages/Settings.jsx`: unused `TRIAL_DAYS` import (flagged pre-existing in Task 8 review) — remove from its import statement if still unreferenced.

Do **not** chase warnings (`react-hooks/exhaustive-deps` on `filterByDate` etc.) — those are pre-existing and out of scope.

- [ ] **Step 4: Build + lint + test**

```
npm.cmd run build
npx eslint src --format compact 2>&1 | grep -c "Error"
npx vitest run
```

Expected: build green; error count **lower** than Step 2's baseline (by ~5); 31/31 pass. It must not go up.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Delete stale smoke-test.mjs; remove migration-leftover unused vars"
```

---

### Task 8: Characterization tests for the pure utils; record the I7 / I8 decisions

**Files:**
- Create: `src/utils/unitConversion.test.js`
- Create: `src/utils/validators.test.js`
- Modify: `docs/superpowers/specs/2026-09-02-supabase-rewrite-design.md`

**Interfaces:**
- Consumes: whatever `src/utils/unitConversion.js` and `src/utils/validators.js` export.
- Produces: two new vitest files; a resolved "Deferred items" section in the spec.

Context: `unitConversion.js` (90 LOC) and `validators.js` (111 LOC) are pure, exported, and used across billing/inventory but have zero tests. They are the cheapest possible coverage win and the right guard for a refactor-heavy branch. (`amountToWords` / `fmtPDF` are *not* in scope — they are file-local un-exported functions duplicated inside `Billing.jsx` and `Purchases.jsx`; extracting them is a separate cleanup, not teardown.)

- [ ] **Step 1: Read both util files**

`cat src/utils/unitConversion.js src/utils/validators.js`. List every exported function and its signature.

- [ ] **Step 2: Write `src/utils/unitConversion.test.js`**

One `describe` per exported function. Cover, for whatever `convertUnit` (or equivalently-named export) actually does: identity conversion (same unit in/out), a scaling pair in both directions (e.g. kg↔g, box↔piece with a pack size), a fractional/rounding case, and an unknown-unit input (assert it throws or returns the documented fallback — match the real behavior, do not assume). Use the real exported names from Step 1.

```js
import { describe, it, expect } from 'vitest';
// import { convertUnit, ... } from './unitConversion';

// describe('convertUnit', () => {
//   it('returns the same value when from === to', () => { ... });
//   it('scales up and down symmetrically', () => { ... });
//   it('handles a fractional pack size', () => { ... });
//   it('rejects / falls back on an unknown unit', () => { ... });
// });
```

- [ ] **Step 3: Write `src/utils/validators.test.js`**

One `describe` per exported validator. For each: one clearly-valid input → passes, one clearly-invalid → fails, and one boundary (empty string, wrong length, wrong checksum digit — whatever that validator guards). GSTIN / PAN / phone / HSN validators each get their own block with a real-format valid sample and a corrupted one.

- [ ] **Step 4: Run the new tests**

```
npx vitest run src/utils/unitConversion.test.js src/utils/validators.test.js
```

Expected: all green. If a test fails because your *assumption* about the util was wrong, fix the test to match the code (this is characterization — the code is the spec). If it fails because the util has a real bug, do **not** fix the util in this phase — mark the test `it.skip` with a `// BUG:` comment and note it in the commit body for the final branch review.

- [ ] **Step 5: Full suite**

```
npx vitest run
```

Expected: 31 + (new count) passing, 0 failing.

- [ ] **Step 6: Resolve I7 / I8 in the spec**

In `docs/superpowers/specs/2026-09-02-supabase-rewrite-design.md`, find the deferred items **I7** (`companies` RLS: owner-only vs. membership-scoped) and **I8** (`listX` helpers omit an explicit `company_id` filter, relying on RLS alone). Investigate and write the resolution inline under each:

- **I8:** check two or three `listX` functions in `src/api/` (e.g. `listParties`, `listInvoices`). They select without `.eq('company_id', cid())`. RLS policy `002_rls.sql` already scopes every business table to `company_id in (select company_id from company_members where user_id = auth.uid() and active)`, so cross-tenant reads are impossible regardless. Decision (unless you find a table with RLS disabled): **accept as-is — RLS is the enforcement boundary; an app-side filter would be redundant defense-in-depth with a maintenance cost.** Record that, and note the one exception if `list_tables` / `get_advisors` shows any business table without RLS enabled.
- **I7:** check `002_rls.sql` for the `companies` table policy and `src/api/company.js` (`getCompany` / `updateCompany`). State whether a non-owner member can currently read/update the company row, whether that is the intended behavior for this single-user-per-company product today, and the one-line migration that would tighten it if not. If it needs tightening and the fix is a one-statement `create policy`, write that SQL into the spec as the recommendation but **do not apply it** — migrations are out of scope for Phase 3; it goes to the final branch review.

Use the Supabase MCP (`list_tables`, `get_advisors` with `type: "security"`) to check RLS status rather than guessing.

- [ ] **Step 7: Commit**

```bash
git add src/utils/unitConversion.test.js src/utils/validators.test.js docs/superpowers/specs/2026-09-02-supabase-rewrite-design.md
git commit -m "Tests for unitConversion + validators; resolve deferred spec items I7/I8"
```

---

## Self-Review

**1. Spec coverage:**

| Spec / summary teardown item | Task |
|---|---|
| Remove manual Sync button + online/offline badge + `startAutoSync` from `App.jsx` (§6) | Task 1 |
| Delete `src/db/db.js` + `src/lib/syncEngine.js` (§9) | Task 2 |
| Remove `dexie` / `dexie-react-hooks` / `vite-plugin-pwa` deps (§9) | Task 3 |
| Remove `VitePWA` from `vite.config.js` (§9) | Task 3 |
| `main.jsx` one-time cleanup: `deleteDatabase('crm-gst-billing-db')`, SW unregister, `caches` clear, dead `localStorage` keys (§9) | Task 4 |
| Settings stale-copy pass ("Export Full Backup", "Offline First" tiles) (Phase 2b Task 8 deferred minor) | Task 5 |
| Rewrite `README.md` (§9) | Task 6 |
| Delete `smoke-test.mjs` (§9) | Task 7 |
| Lint cleanup — migration-leftover unused vars (Phase 2b reviews) | Task 7 |
| Pure-logic vitest for `unitConversion` / `validators` (§9) | Task 8 |
| Decide I7 (`companies` RLS) / I8 (`listX` `company_id` filter) (spec deferred) | Task 8 |
| `amountToWords` / `fmtPDF` tests (§9) | **Explicitly descoped** in Task 8 context — un-exported, duplicated; belongs to a later de-dupe cleanup, not teardown. |
| 7-day local session removal (§5) | Already done in Phase 2a (`SESSION_KEY` / `saveSession` / `loadSession` deleted from `App.jsx`) — nothing left for Phase 3. |

**2. Placeholder scan:** No "TBD" / "handle edge cases" / "similar to Task N". Every code step has literal code. Task 5 and Task 8 Steps 2–3 necessarily describe *which* elements/functions to act on rather than quoting final text, because the exact lines depend on a `grep` the implementer runs first — each gives the precise grep, the decision rule, and the guard ("do not remove a button that still calls a handler" / "match the real behavior, do not assume").

**3. Type consistency:** No new functions or types are introduced across tasks — this phase only deletes code and adds two isolated test files plus prose. The one shared string, the Dexie DB name `crm-gst-billing-db`, is quoted identically in Task 4's snippet and Task 2's grep context, and matches the deleted `db.js:3`. The `localStorage` key list (`lekhya_session`, `bizcrm_session`, `lekhya_last_sync`, `lekhya_device_id`) is identical in Task 4 Step 1 and Step 2, and the "keep" list (`lekhya_company_id`, `lekhya_subscription`) matches `clearSession()` in the current `App.jsx`.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-09-02-supabase-rewrite-phase-3-teardown.md`.
