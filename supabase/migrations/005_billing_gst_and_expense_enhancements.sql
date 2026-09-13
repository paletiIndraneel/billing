-- Sub-project A: customer GST-type override, invoice ship-to + billing period,
--                 selling-price change history.
-- Sub-project B: expense frequency tagging.
begin;

alter table parties add column if not exists gst_type text
  check (gst_type is null or gst_type = any (array['IGST','CGST_SGST']));

alter table invoices add column if not exists ship_to_name text;
alter table invoices add column if not exists ship_to_address text;
alter table invoices add column if not exists ship_to_gstin text;
alter table invoices add column if not exists billing_period_from date;
alter table invoices add column if not exists billing_period_to date;

create table if not exists price_history (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  variant_id uuid not null references product_variants(id),
  old_price numeric,
  new_price numeric not null,
  note text,
  changed_at timestamptz not null default now()
);

alter table price_history enable row level security;
create policy price_history_select on price_history
  for select
  using (company_id in (select company_id from company_members where user_id = auth.uid() and active));
create policy price_history_insert on price_history
  for insert
  with check (company_id in (select company_id from company_members where user_id = auth.uid() and active));

alter publication supabase_realtime add table price_history;
alter table price_history replica identity full;

alter table expenses add column if not exists frequency text not null default 'One-time'
  check (frequency = any (array['Daily','Weekly','Monthly','Quarterly','Yearly','One-time']));

commit;
