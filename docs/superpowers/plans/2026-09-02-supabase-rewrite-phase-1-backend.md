# Supabase Rewrite — Phase 1: Backend (schema + RLS) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Supabase `data jsonb` sync-mirror schema with typed, uuid-keyed, RLS-protected tables that the rewritten app will read and write directly.

**Architecture:** Two SQL migration files applied to the `lekhya-production` Supabase project via the Supabase MCP `apply_migration` tool. `001_schema.sql` drops the 13 placeholder business tables and recreates them with real columns + FKs + indexes, and adds settings columns to `companies`. `002_rls.sql` enables row-level security with a per-tenant policy on every table. No stored procedures — atomic operations are handled client-side in later phases (see spec §4). Migration files are also committed under `supabase/migrations/` for version history even though they are applied through MCP, not the Supabase CLI.

**Tech Stack:** PostgreSQL 17 (Supabase), Supabase MCP tools (`apply_migration`, `execute_sql`, `list_tables`).

**Spec:** `docs/superpowers/specs/2026-09-02-supabase-rewrite-design.md` (§2 Schema & IDs, §2.3 Tenancy & RLS, §2.4 settings→companies, §7 Cutover)

## Global Constraints

- Supabase project: `lekhya-production`, project_id `pfnlpatvjkjykvvswouz`, Postgres 17.
- Every business table has `id uuid primary key default gen_random_uuid()` and `company_id uuid not null references companies(id) on delete cascade`.
- All inter-record references are `uuid` (`party_id`, `invoice_id`, `variant_id`, `product_id`, `vendor_id`).
- RLS policy expression (verbatim), used on every business table:
  `company_id in (select company_id from company_members where user_id = auth.uid() and active)`
- `stock_ledger` is append-only: `select` + `insert` policies only, no `update`/`delete` policy.
- Do **not** touch the existing `subscriptions` table or its (absent) client policies — license RPCs are `SECURITY DEFINER` and rely on it staying locked.
- Do **not** touch the existing `payments` table — it is unused by the app; leave it exactly as-is.
- The user takes a manual Supabase dashboard snapshot **before** Task 3 runs. All current rows are placeholder (4 parties, 3 invoices, 4 products, 4 variants).
- Timestamps: `timestamptz default now()` for created/modified; `date` for pure calendar dates (`due_date`, expense `date`, transaction `date`).

---

### Task 1: Write `001_schema.sql`

**Files:**
- Create: `supabase/migrations/001_schema.sql`
- Create: `supabase/README.md`

**Interfaces:**
- Produces: the table set the API layer (Phase 2) codes against. Column names are snake_case; the API modules map to/from the JS camelCase record shapes. Key tables and their columns are listed in Step 1 below — Phase 2 tasks reference this file for the authoritative schema.

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/001_schema.sql` with exactly this content:

```sql
-- Phase 1: typed schema replacing the data-jsonb sync mirror.
-- All current rows are placeholder; tables are dropped and recreated.

begin;

-- 1. Drop placeholder business tables (companies / company_members / subscriptions / payments kept)
drop table if exists stock_ledger cascade;
drop table if exists invoice_items cascade;
drop table if exists invoices cascade;
drop table if exists transactions cascade;
drop table if exists purchases cascade;
drop table if exists product_variants cascade;
drop table if exists products cascade;
drop table if exists parties cascade;
drop table if exists expenses cascade;
drop table if exists batches cascade;
drop table if exists leads cascade;

-- 2. Settings columns on companies (spec §2.4)
alter table companies add column if not exists upi_id text;
alter table companies add column if not exists logo_url text;
alter table companies add column if not exists bank_name text;
alter table companies add column if not exists bank_account text;
alter table companies add column if not exists bank_ifsc text;
alter table companies add column if not exists invoice_prefix text not null default 'INV';
alter table companies add column if not exists invoice_seq int not null default 0;

-- 3. Recreate business tables, typed + uuid keys

create table parties (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  name text not null,
  gstin text,
  phone text,
  address text,
  email text,
  type text not null default 'Customer' check (type in ('Customer','Vendor')),
  credit_limit numeric,
  credit_days int,
  activities jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index parties_company_name_idx on parties (company_id, name);

create table products (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  name text not null,
  hsn text,
  inventory_mode text not null default 'packed' check (inventory_mode in ('packed','bulk')),
  master_stock numeric not null default 0,
  base_unit text,
  avg_cost_per_base numeric,
  created_at timestamptz not null default now()
);
create index products_company_idx on products (company_id);

create table product_variants (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  pack_size numeric not null default 1,
  unit text not null default 'PCS',
  purchase_price numeric not null default 0,
  selling_price numeric not null default 0,
  gst_rate numeric not null default 0,
  stock_qty numeric not null default 0,
  reorder_point numeric default 10,
  barcode text,
  average_cost numeric default 0,
  created_at timestamptz not null default now()
);
create index pv_company_product_idx on product_variants (company_id, product_id);
create index pv_company_barcode_idx on product_variants (company_id, barcode);

create table invoices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  invoice_number text not null,
  type text not null default 'Sales' check (type in ('Sales','Purchase','CreditNote','DebitNote')),
  party_id uuid references parties(id),
  date timestamptz not null default now(),
  due_date date,
  tax_type text default 'CGST_SGST' check (tax_type in ('IGST','CGST_SGST')),
  gross_subtotal numeric,
  item_discount_amt numeric,
  discount_pct numeric,
  discount_amt numeric,
  subtotal numeric not null default 0,
  tax_amount numeric not null default 0,
  shipping numeric default 0,
  total numeric not null default 0,
  status text default 'Pending',
  payment_status text,
  notes text,
  terms text,
  theme text default 'classic',
  payments jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique (company_id, invoice_number)
);
create index invoices_company_date_idx on invoices (company_id, date desc);
create index invoices_company_party_status_idx on invoices (company_id, party_id, status);
create index invoices_company_type_status_idx on invoices (company_id, type, status);

create table invoice_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  invoice_id uuid not null references invoices(id) on delete cascade,
  product_id uuid,
  variant_id uuid,
  name text,
  hsn text,
  unit text,
  qty numeric not null default 0,
  rate numeric,
  base_price numeric,
  gst_rate numeric,
  item_discount_pct numeric default 0,
  product_name text,
  pack_size numeric,
  cost_at_sale numeric,
  purchase_price_snapshot numeric,
  selling_price numeric,
  barcode_snapshot text
);
create index ii_company_invoice_idx on invoice_items (company_id, invoice_id);

create table transactions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  date date not null default current_date,
  party_id uuid references parties(id),
  invoice_id uuid references invoices(id) on delete set null,
  type text not null,
  amount numeric not null default 0,
  method text,
  reference text,
  notes text,
  auto_recorded boolean default false,
  created_at timestamptz not null default now()
);
create index txn_company_party_idx on transactions (company_id, party_id);
create index txn_company_invoice_idx on transactions (company_id, invoice_id);
create index txn_company_date_idx on transactions (company_id, date);

create table expenses (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  date date not null default current_date,
  category text not null default 'Other',
  amount numeric not null default 0,
  payment_method text,
  vendor_name text,
  description text,
  created_at timestamptz not null default now()
);
create index expenses_company_date_idx on expenses (company_id, date);

create table purchases (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  product_id uuid,
  variant_id uuid,
  vendor_id uuid references parties(id),
  date timestamptz not null default now(),
  qty numeric not null default 0,
  purchase_price numeric default 0,
  notes text,
  created_at timestamptz not null default now()
);
create index purchases_company_vendor_idx on purchases (company_id, vendor_id);
create index purchases_company_date_idx on purchases (company_id, date);

create table stock_ledger (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  variant_id uuid not null,
  product_id uuid,
  type text not null,
  packs numeric,
  base_qty_delta numeric,
  balance_qty numeric,
  unit_cost numeric,
  batch_no text,
  reference text,
  note text,
  date timestamptz not null default now()
);
create index sl_company_variant_date_idx on stock_ledger (company_id, variant_id, date);

create table batches (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  variant_id uuid not null,
  product_id uuid,
  batch_no text,
  mfg_date date,
  expiry_date date,
  status text not null default 'active' check (status in ('active','exhausted')),
  received_qty numeric default 0,
  remaining_qty numeric default 0,
  created_at timestamptz not null default now()
);
create index batches_company_variant_status_idx on batches (company_id, variant_id, status);

create table leads (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  name text not null,
  source text,
  contact_details text,
  opportunity_value numeric,
  stage text,
  created_at timestamptz not null default now()
);
create index leads_company_stage_idx on leads (company_id, stage);

commit;
```

- [ ] **Step 2: Write `supabase/README.md`**

```markdown
# Supabase

Schema for the Lekhya web app. Single project: `lekhya-production`
(`pfnlpatvjkjykvvswouz`), Postgres 17.

## Migrations

`migrations/NNN_name.sql` — applied via the Supabase MCP `apply_migration`
tool (migration name = the file's basename without extension), **not** the
Supabase CLI. Files are kept here for version history and review.

Order: `001_schema` → `002_rls`.

There are no stored procedures / RPCs. Multi-table operations (invoice save,
stock adjustment) run client-side with compensating cleanup — see
`docs/superpowers/specs/2026-09-02-supabase-rewrite-design.md` §4.
```

- [ ] **Step 3: Commit the files (not yet applied)**

```bash
git add supabase/migrations/001_schema.sql supabase/README.md
git commit -m "Add 001_schema.sql: typed Supabase schema (not yet applied)"
```

---

### Task 2: Write `002_rls.sql`

**Files:**
- Create: `supabase/migrations/002_rls.sql`

**Interfaces:**
- Consumes: the tables created by `001_schema.sql`.
- Produces: RLS such that an authenticated client can only read/write rows whose `company_id` is one of its `company_members` rows; `stock_ledger` rows cannot be updated or deleted by clients.

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/002_rls.sql` with exactly this content:

```sql
-- Phase 1: row-level security. Per-tenant on every business table.

begin;

-- Helper predicate is inlined per policy (no SQL function, to keep it visible).

-- parties / products / product_variants / invoices / invoice_items /
-- transactions / expenses / purchases / batches / leads : full CRUD scoped to tenant
do $$
declare t text;
begin
  foreach t in array array[
    'parties','products','product_variants','invoices','invoice_items',
    'transactions','expenses','purchases','batches','leads'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format($f$
      create policy %1$s_tenant on %1$I
        for all
        using (company_id in (select company_id from company_members where user_id = auth.uid() and active))
        with check (company_id in (select company_id from company_members where user_id = auth.uid() and active))
    $f$, t);
  end loop;
end $$;

-- stock_ledger : select + insert only (append-only ledger)
alter table stock_ledger enable row level security;
create policy stock_ledger_select on stock_ledger
  for select
  using (company_id in (select company_id from company_members where user_id = auth.uid() and active));
create policy stock_ledger_insert on stock_ledger
  for insert
  with check (company_id in (select company_id from company_members where user_id = auth.uid() and active));

commit;
```

- [ ] **Step 2: Commit the file (not yet applied)**

```bash
git add supabase/migrations/002_rls.sql
git commit -m "Add 002_rls.sql: per-tenant row-level security (not yet applied)"
```

---

### Task 3: Apply both migrations to `lekhya-production` and verify

**Files:** none (uses Supabase MCP tools).

**Interfaces:**
- Consumes: `001_schema.sql`, `002_rls.sql`.
- Produces: the live schema Phase 2 connects to.

- [ ] **Step 1: Confirm the pre-migration snapshot**

Ask the user to confirm they have taken a manual snapshot / backup of the
`lekhya-production` database from the Supabase dashboard. **Do not proceed
until they confirm.**

- [ ] **Step 2: Apply `001_schema`**

Call `mcp__claude_ai_Supabase__apply_migration` with:
- `project_id`: `pfnlpatvjkjykvvswouz`
- `name`: `001_schema`
- `query`: the full contents of `supabase/migrations/001_schema.sql`

Expected: success, no error.

- [ ] **Step 3: Verify schema — columns exist, `data` column is gone**

Call `mcp__claude_ai_Supabase__execute_sql` with `project_id` `pfnlpatvjkjykvvswouz` and:

```sql
select table_name, count(*) filter (where column_name = 'data') as data_cols,
       count(*) as total_cols
from information_schema.columns
where table_schema = 'public'
  and table_name in ('parties','products','product_variants','invoices',
    'invoice_items','transactions','expenses','purchases','stock_ledger',
    'batches','leads')
group by table_name
order by table_name;
```

Expected: 11 rows, every `data_cols` = 0, every `total_cols` > 5. FAIL if any
`data_cols` > 0 or a table is missing.

- [ ] **Step 4: Verify `companies` settings columns**

```sql
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'companies'
  and column_name in ('upi_id','logo_url','bank_name','bank_account',
    'bank_ifsc','invoice_prefix','invoice_seq')
order by column_name;
```

Expected: 7 rows. FAIL if fewer.

- [ ] **Step 5: Verify the unique constraint on invoices**

```sql
select conname from pg_constraint
where conrelid = 'public.invoices'::regclass and contype = 'u';
```

Expected: one row (the `(company_id, invoice_number)` unique). FAIL if none.

- [ ] **Step 6: Apply `002_rls`**

Call `apply_migration` with `name`: `002_rls`, `query`: full contents of
`supabase/migrations/002_rls.sql`. Expected: success.

- [ ] **Step 7: Verify RLS is enabled and policies exist**

```sql
select c.relname,
       c.relrowsecurity as rls_on,
       count(p.polname) as policies
from pg_class c
left join pg_policy p on p.polrelid = c.oid
where c.relnamespace = 'public'::regnamespace
  and c.relname in ('parties','products','product_variants','invoices',
    'invoice_items','transactions','expenses','purchases','stock_ledger',
    'batches','leads')
group by c.relname, c.relrowsecurity
order by c.relname;
```

Expected: 11 rows; every `rls_on` = true; `policies` = 1 for all except
`stock_ledger` which is 2. FAIL otherwise.

- [ ] **Step 8: Verify tenant isolation with an anonymous query**

```sql
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select count(*) as visible_parties from parties;
reset role;
```

Expected: `visible_parties` = 0 (RLS blocks anon; there is also no data).
FAIL if it errors for a reason other than permission, or returns > 0.

- [ ] **Step 9: Smoke-check every table is queryable and empty**

```sql
select 'parties' t, count(*) n from parties
union all select 'products', count(*) from products
union all select 'product_variants', count(*) from product_variants
union all select 'invoices', count(*) from invoices
union all select 'invoice_items', count(*) from invoice_items
union all select 'transactions', count(*) from transactions
union all select 'expenses', count(*) from expenses
union all select 'purchases', count(*) from purchases
union all select 'stock_ledger', count(*) from stock_ledger
union all select 'batches', count(*) from batches
union all select 'leads', count(*) from leads;
```

Expected: 11 rows, every `n` = 0, no error.

- [ ] **Step 10: Record the applied state and commit**

Append to `supabase/README.md` under a new `## Applied` heading:

```markdown
## Applied

- `001_schema` — applied to lekhya-production on 2026-09-02
- `002_rls` — applied to lekhya-production on 2026-09-02
```

```bash
git add supabase/README.md
git commit -m "Apply 001_schema + 002_rls to lekhya-production"
```

---

## Self-Review

**1. Spec coverage (Phase 1 scope only):**

| Spec item | Task |
|---|---|
| §2.1 typed columns, drop `data jsonb`, 13 tables incl. new `batches`/`leads` | Task 1 |
| §2.2 uuid PKs + uuid FKs everywhere | Task 1 (Global Constraints) |
| §2.2 unique `(company_id, invoice_number)` backstop for §4.3 | Task 1 invoices DDL; Task 3 Step 5 |
| §2.3 RLS per-tenant policy on every table; `stock_ledger` insert+select only | Task 2; Task 3 Steps 7–8 |
| §2.4 settings → `companies` columns (`invoice_prefix`, `invoice_seq`, bank/upi/logo) | Task 1 |
| §7 wipe placeholder rows | Task 1 (drop+recreate); Task 3 Step 9 |
| §7 migration order `001 → 002` via MCP; user snapshot first | Task 3 Steps 1–2, 6 |
| §2.1 leave `payments` + `subscriptions` untouched | Global Constraints; Task 1 drops neither |

Out of Phase 1 scope (later plans): `src/api/*`, react-query, realtime, page rewrites, Dexie/PWA/local-auth teardown, `vitest`, README/app changes.

**2. Placeholder scan:** No TBD/TODO. All SQL is literal and complete. Verification queries are concrete with explicit pass/fail conditions.

**3. Type consistency:** `company_id uuid` and `id uuid` uniform across all `create table`. FK targets (`companies(id)`, `products(id)`, `parties(id)`, `invoices(id)`) all exist before they are referenced (parties and products created before invoices/variants/purchases). `stock_ledger.variant_id` / `batches.variant_id` are deliberately **not** FK-constrained (ledger is append-only and must survive variant deletion) — consistent with the append-only intent in Global Constraints. Policy names `<table>_tenant` (and `stock_ledger_select`/`stock_ledger_insert`) are unique. Verification queries in Task 3 reference only tables/columns defined in Tasks 1–2.
