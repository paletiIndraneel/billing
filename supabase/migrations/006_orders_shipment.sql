-- Sub-project C: Sales & Purchase orders with shared shipment tracking.
begin;

create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  order_type text not null check (order_type = any (array['Sales','Purchase'])),
  order_number text not null,
  party_id uuid references parties(id),
  date timestamptz not null default now(),
  expected_date date,
  status text not null default 'Placed'
    check (status = any (array['Placed','Confirmed','Shipped','Delivered','Cancelled'])),
  carrier text,
  tracking_number text,
  notes text,
  linked_invoice_id uuid references invoices(id),
  created_at timestamptz not null default now()
);

create table if not exists order_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  order_id uuid not null references orders(id) on delete cascade,
  product_id uuid references products(id),
  variant_id uuid references product_variants(id),
  product_name text,
  unit text,
  qty numeric not null default 0,
  rate numeric not null default 0
);

do $$
declare t text;
begin
  foreach t in array array['orders','order_items'] loop
    execute format('alter table %I enable row level security', t);
    execute format($f$
      create policy %1$s_tenant on %1$I
        for all
        using (company_id in (select company_id from company_members where user_id = auth.uid() and active))
        with check (company_id in (select company_id from company_members where user_id = auth.uid() and active))
    $f$, t);
  end loop;
end $$;

alter publication supabase_realtime add table orders, order_items;
alter table orders      replica identity full;
alter table order_items replica identity full;

commit;
