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
