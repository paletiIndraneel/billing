-- Phase 2a fix: enable Supabase Realtime for the tenant tables.
-- Without this the `supabase_realtime` publication carries no business tables,
-- so postgres_changes subscriptions connect but never deliver events.
-- `replica identity full` is required so row-level filters (company_id=eq.<id>)
-- match on DELETE, where only the OLD row is available.

begin;

alter publication supabase_realtime add table
  parties, products, product_variants, invoices, invoice_items,
  transactions, expenses, purchases, stock_ledger, batches, leads, companies;

alter table parties          replica identity full;
alter table products         replica identity full;
alter table product_variants replica identity full;
alter table invoices         replica identity full;
alter table invoice_items    replica identity full;
alter table transactions     replica identity full;
alter table expenses         replica identity full;
alter table purchases        replica identity full;
alter table stock_ledger     replica identity full;
alter table batches          replica identity full;
alter table leads            replica identity full;
alter table companies        replica identity full;

commit;
