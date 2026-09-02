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
